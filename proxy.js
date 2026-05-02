const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
app.use(function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Stores ────────────────────────────────────────────────────────────────────
var completedIds = new Set();
var tasks = {}; // id → task object

const COMPLETED_FILE = path.join(__dirname, 'completed.json');
const TASKS_FILE = path.join(__dirname, 'tasks.json');

try { completedIds = new Set(JSON.parse(fs.readFileSync(COMPLETED_FILE, 'utf8'))); } catch(e) {}
try {
  var savedTasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
  savedTasks.forEach(function(t) { tasks[t.id] = t; });
} catch(e) {}

function saveCompleted() {
  try { fs.writeFileSync(COMPLETED_FILE, JSON.stringify([...completedIds])); } catch(e) {}
}
function saveTasks() {
  try { fs.writeFileSync(TASKS_FILE, JSON.stringify(Object.values(tasks))); } catch(e) {}
}

// ── XML parser (simple regex para estructura plana) ───────────────────────────
function parseXML(xml) {
  var obj = {};
  var matches = xml.match(/<([^\/>\s]+)>([^<]*)<\/\1>/g) || [];
  matches.forEach(function(m) {
    var tag = m.match(/<([^\/>\s]+)>/)[1];
    var val = m.replace(/<[^>]+>/g, '').trim();
    obj[tag] = val;
  });
  return obj;
}

// ── Helper HTTPS ──────────────────────────────────────────────────────────────
function httpsRaw(url, headers, redirects) {
  redirects = redirects || 0;
  if (redirects > 5) return Promise.reject(new Error('Demasiados redirects'));
  return new Promise(function(resolve, reject) {
    var parsedUrl = new URL(url);
    var req = https.request({
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: headers,
    }, function(res) {
      var body = '';
      res.on('data', function(c) { body += c; });
      res.on('end', function() {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
          var loc = res.headers['location'];
          if (!loc.startsWith('http')) loc = parsedUrl.origin + loc;
          return resolve(httpsRaw(loc, headers, redirects + 1));
        }
        resolve({ status: res.statusCode, body: body });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

var KOBO_TOKEN = '629fb612ea05e21dd1d02d6cab992a5058293922';
var KOBO_UID = 'aXVyjPZ9YmmzGHaK6uHMdb';

// ── Endpoints ─────────────────────────────────────────────────────────────────
app.get('/api/ping', function(req, res) { res.json({ ok: true, tasks: Object.keys(tasks).length }); });

app.get('/api/debug', function(req, res) {
  var urls = [
    'https://kc.kobotoolbox.org/pablosaumann/reports/' + KOBO_UID + '/export.csv?api_token=' + KOBO_TOKEN,
    'https://kc.kobotoolbox.org/pablosaumann/exports/' + KOBO_UID + '/csv/?api_token=' + KOBO_TOKEN,
    'https://kf.kobotoolbox.org/api/v2/assets/' + KOBO_UID + '/exports/',
  ];
  var H = { Authorization: 'Token ' + KOBO_TOKEN, Accept: 'application/json' };
  var results = {};
  var promises = urls.map(function(url) {
    return httpsRaw(url, H)
      .then(function(r) { results[url] = { status: r.status, body: r.body.slice(0, 400) }; })
      .catch(function(e) { results[url] = { error: e.message }; });
  });
  Promise.all(promises).then(function() { res.json(results); });
});

app.get('/api/tareas', function(req, res) {
  var list = Object.values(tasks).map(function(t) {
    return Object.assign({}, t, { completada: completedIds.has(t.id) });
  });
  list.sort(function(a, b) {
    if (a.completada !== b.completada) return a.completada ? 1 : -1;
    return (b.fecha || '').localeCompare(a.fecha || '');
  });
  res.json(list);
});

app.post('/api/tareas/:id/completar', function(req, res) {
  completedIds.add(req.params.id); saveCompleted(); res.json({ ok: true });
});
app.delete('/api/tareas/:id/completar', function(req, res) {
  completedIds.delete(req.params.id); saveCompleted(); res.json({ ok: true });
});

// ── Interceptar envíos a Kobo y capturar tareas ───────────────────────────────
var rawBody = '';
app.use('/kobo', function(req, res, next) {
  if (req.method !== 'POST') return next();
  var chunks = [];
  req.on('data', function(c) { chunks.push(c); });
  req.on('end', function() {
    var body = Buffer.concat(chunks).toString();
    // Buscar XML en el body multipart
    var xmlMatch = body.match(/<\?xml[^>]*\?>([\s\S]*)/);
    if (xmlMatch) {
      var fields = parseXML(xmlMatch[0]);
      if (fields.tipo_registro === 'tarea') {
        var id = fields._id || ('local-' + Date.now());
        tasks[id] = {
          id: id,
          tipo: fields.g1_tipo || '',
          descripcion: fields.g2_descripcion || '',
          dirigido: fields.g5_dirigido || '',
          urgencia: fields.g4_urgencia || '',
          recursos: fields.g6_recursos || '',
          registrador: fields.registrador || '',
          fecha: fields.a2_fecha || new Date().toLocaleDateString('es-CL'),
          fecha_compromiso: fields.g1b_compromiso_fecha || '',
        };
        saveTasks();
        console.log('Tarea capturada: ' + id);
      }
    }
    // Reconstruir request para el proxy
    req.rawBody = Buffer.concat(chunks);
    next();
  });
});

app.use('/kobo', createProxyMiddleware({
  target: 'https://kc.kobotoolbox.org', changeOrigin: true,
  pathRewrite: { '^/kobo': '' },
  on: {
    proxyReq: function(proxyReq, req) {
      if (req.rawBody) {
        proxyReq.setHeader('Content-Length', req.rawBody.length);
        proxyReq.write(req.rawBody);
        proxyReq.end();
      }
    }
  }
}));

app.listen(3001, function() { console.log('Proxy en puerto 3001'); });
