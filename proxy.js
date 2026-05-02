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
var tasks = {};
const COMPLETED_FILE = path.join(__dirname, 'completed.json');
const TASKS_FILE = path.join(__dirname, 'tasks.json');
try { completedIds = new Set(JSON.parse(fs.readFileSync(COMPLETED_FILE, 'utf8'))); } catch(e) {}
try { JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8')).forEach(function(t) { tasks[t.id] = t; }); } catch(e) {}
function saveCompleted() { try { fs.writeFileSync(COMPLETED_FILE, JSON.stringify([...completedIds])); } catch(e) {} }
function saveTasks() { try { fs.writeFileSync(TASKS_FILE, JSON.stringify(Object.values(tasks))); } catch(e) {} }

// ── XML parser ────────────────────────────────────────────────────────────────
function parseXML(xml) {
  var obj = {};
  var matches = xml.match(/<([^\/>\s]+)>([^<]*)<\/\1>/g) || [];
  matches.forEach(function(m) {
    var tag = m.match(/<([^\/>\s]+)>/)[1];
    obj[tag] = m.replace(/<[^>]+>/g, '').trim();
  });
  return obj;
}

// ── HTTPS helpers ─────────────────────────────────────────────────────────────
var KOBO_TOKEN = '629fb612ea05e21dd1d02d6cab992a5058293922';
var KOBO_UID   = 'aXVyjPZ9YmmzGHaK6uHMdb';
var KF = 'kf.kobotoolbox.org';
var H = { Authorization: 'Token ' + KOBO_TOKEN, Accept: 'application/json', 'Content-Type': 'application/json' };

function httpsReq(method, hostname, urlPath, headers, body, redirects) {
  redirects = redirects || 0;
  if (redirects > 5) return Promise.reject(new Error('Demasiados redirects'));
  return new Promise(function(resolve, reject) {
    var bodyStr = body ? JSON.stringify(body) : '';
    var hdrs = Object.assign({}, headers);
    if (bodyStr) hdrs['Content-Length'] = Buffer.byteLength(bodyStr);
    var req = https.request({ hostname: hostname, path: urlPath, method: method, headers: hdrs }, function(res) {
      var data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
          var loc = res.headers['location'];
          var parsed = new URL(loc.startsWith('http') ? loc : 'https://' + hostname + loc);
          return resolve(httpsReq('GET', parsed.hostname, parsed.pathname + parsed.search, headers, null, redirects + 1));
        }
        resolve({ status: res.statusCode, body: data });
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function koboGet(urlPath) {
  return httpsReq('GET', KF, urlPath, H).then(function(r) {
    if (r.status !== 200) throw new Error('HTTP ' + r.status + ': ' + r.body.slice(0, 200));
    return JSON.parse(r.body);
  });
}
function koboPost(urlPath, body) {
  return httpsReq('POST', KF, urlPath, H, body).then(function(r) {
    if (r.status !== 200 && r.status !== 201) throw new Error('HTTP ' + r.status + ': ' + r.body.slice(0, 200));
    return JSON.parse(r.body);
  });
}

// ── Crear y esperar export JSON ───────────────────────────────────────────────
function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

function createExportAndFetch() {
  var exportPath = '/api/v2/assets/' + KOBO_UID + '/exports/';
  return koboPost(exportPath, {
    source: 'https://' + KF + '/api/v2/assets/' + KOBO_UID + '/',
    type: 'csv',
    lang: 'xml',
    hierarchy_in_labels: false,
    group_sep: '/',
    flatten: true,
  }).then(function(export_obj) {
    console.log('Export creado:', export_obj.uid, 'status:', export_obj.status);
    var exportUid = export_obj.uid;
    // Polling hasta que esté listo
    var poll = function(attempts) {
      if (attempts > 20) throw new Error('Export timeout');
      return koboGet(exportPath + exportUid + '/').then(function(e) {
        console.log('Export status:', e.status, 'attempt:', attempts);
        if (e.status === 'complete' && e.result) return e.result;
        if (e.status === 'error') throw new Error('Export error: ' + JSON.stringify(e.messages));
        return sleep(3000).then(function() { return poll(attempts + 1); });
      });
    };
    return poll(1);
  }).then(function(resultUrl) {
    console.log('Descargando export desde:', resultUrl);
    var parsed = new URL(resultUrl);
    return httpsReq('GET', parsed.hostname, parsed.pathname + parsed.search, { Authorization: 'Token ' + KOBO_TOKEN }, null);
  }).then(function(r) {
    if (r.status !== 200) throw new Error('Download HTTP ' + r.status);
    return r.body;
  });
}

function parseCSVtoTasks(csv) {
  var lines = csv.split('\n').filter(function(l) { return l.trim(); });
  if (lines.length < 2) return;
  var headers = lines[0].split(',').map(function(h) { return h.replace(/^"|"$/g, '').trim(); });
  var imported = 0;
  lines.slice(1).forEach(function(line) {
    var vals = [];
    var cur = ''; var inQ = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
      else { cur += c; }
    }
    vals.push(cur.trim());
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = (vals[i] || '').replace(/^"|"$/g, ''); });
    if (obj.tipo_registro === 'tarea') {
      var id = obj._id || obj._uuid || ('import-' + imported);
      if (!tasks[id]) {
        tasks[id] = {
          id: id,
          tipo: obj.g1_tipo || '',
          descripcion: obj.g2_descripcion || '',
          dirigido: obj.g5_dirigido || '',
          urgencia: obj.g4_urgencia || '',
          recursos: obj.g6_recursos || '',
          registrador: obj.registrador || '',
          fecha: obj.a2_fecha || (obj._submission_time || '').slice(0, 10),
          fecha_compromiso: obj.g1b_compromiso_fecha || '',
        };
        imported++;
      }
    }
  });
  console.log('Importadas ' + imported + ' tareas desde Kobo');
  saveTasks();
}

// Cargar datos existentes al arrancar
createExportAndFetch().then(function(csv) {
  parseCSVtoTasks(csv);
}).catch(function(e) {
  console.error('Error importando datos existentes:', e.message);
});

// ── Endpoints ─────────────────────────────────────────────────────────────────
app.get('/api/ping', function(req, res) {
  res.json({ ok: true, tasks: Object.keys(tasks).length });
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

// Recargar desde Kobo manualmente
app.post('/api/sync', function(req, res) {
  createExportAndFetch().then(function(csv) {
    parseCSVtoTasks(csv);
    res.json({ ok: true, tasks: Object.keys(tasks).length });
  }).catch(function(e) {
    res.status(500).json({ error: e.message });
  });
});

// ── Interceptar envíos a Kobo ─────────────────────────────────────────────────
app.use('/kobo', function(req, res, next) {
  if (req.method !== 'POST') return next();
  var chunks = [];
  req.on('data', function(c) { chunks.push(c); });
  req.on('end', function() {
    var body = Buffer.concat(chunks).toString();
    var xmlMatch = body.match(/<\?xml[\s\S]*/);
    if (xmlMatch) {
      var fields = parseXML(xmlMatch[0]);
      if (fields.tipo_registro === 'tarea') {
        var id = 'local-' + Date.now();
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
        console.log('Nueva tarea capturada');
      }
    }
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
