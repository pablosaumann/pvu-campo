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

var completedIds = new Set();
const COMPLETED_FILE = path.join(__dirname, 'completed.json');
try { completedIds = new Set(JSON.parse(fs.readFileSync(COMPLETED_FILE, 'utf8'))); } catch(e) {}
function saveCompleted() {
  try { fs.writeFileSync(COMPLETED_FILE, JSON.stringify([...completedIds])); } catch(e) {}
}

function httpsGet(url, headers, redirects) {
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
        console.log(parsedUrl.pathname + ' -> ' + res.statusCode);
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
          var loc = res.headers['location'];
          if (!loc.startsWith('http')) loc = parsedUrl.origin + loc;
          return resolve(httpsGet(loc, headers, redirects + 1));
        }
        if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
        resolve({ statusCode: res.statusCode, body: body, contentType: res.headers['content-type'] || '' });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function httpsGetJSON(url, headers) {
  return httpsGet(url, headers).then(function(r) {
    try { return JSON.parse(r.body); }
    catch(e) { throw new Error('No es JSON: ' + r.body.slice(0, 200)); }
  });
}

var KOBO_TOKEN = '629fb612ea05e21dd1d02d6cab992a5058293922';
var KOBO_UID   = 'aXVyjPZ9YmmzGHaK6uHMdb';
var H = { Authorization: 'Token ' + KOBO_TOKEN, Accept: 'application/json' };

// Parsear CSV simple
function parseCSV(text) {
  var lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  var headers = lines[0].split(',').map(function(h) { return h.replace(/^"|"$/g, '').trim(); });
  return lines.slice(1).map(function(line) {
    var obj = {};
    var vals = line.split(',');
    headers.forEach(function(h, i) {
      obj[h] = (vals[i] || '').replace(/^"|"$/g, '').trim();
    });
    return obj;
  });
}

app.get('/api/ping', function(req, res) { res.json({ ok: true }); });

app.get('/api/debug', function(req, res) {
  var urls = [
    'https://kf.kobotoolbox.org/api/v2/assets/' + KOBO_UID + '/submissions/?format=json&limit=1',
    'https://kc.kobotoolbox.org/pablosaumann/exports/' + KOBO_UID + '/csv/',
    'https://kc.kobotoolbox.org/api/v1/data/parque_valle_ulmos?format=json&limit=1',
    'https://kc.kobotoolbox.org/api/v1/data/' + KOBO_UID + '?format=json&limit=1',
  ];
  var results = {};
  var promises = urls.map(function(url) {
    return httpsGet(url, H)
      .then(function(r) { results[url] = { ok: true, status: r.statusCode, type: r.contentType, snippet: r.body.slice(0, 300) }; })
      .catch(function(e) { results[url] = { ok: false, error: e.message }; });
  });
  Promise.all(promises).then(function() { res.json(results); });
});

app.get('/api/tareas', function(req, res) {
  // Intentar kf submissions primero, luego CSV legacy como fallback
  var kfUrl = 'https://kf.kobotoolbox.org/api/v2/assets/' + KOBO_UID + '/submissions/?format=json&limit=500';
  httpsGetJSON(kfUrl, H).then(function(data) {
    return data.results || [];
  }).catch(function() {
    // Fallback: CSV legacy
    console.log('Intentando CSV legacy...');
    return httpsGet('https://kc.kobotoolbox.org/pablosaumann/exports/' + KOBO_UID + '/csv/', H)
      .then(function(r) { return parseCSV(r.body); });
  }).then(function(submissions) {
    console.log('Submissions: ' + submissions.length);
    var tareas = submissions
      .filter(function(s) { return s.tipo_registro === 'tarea'; })
      .map(function(s) {
        return {
          id: String(s._id || s._uuid || Math.random()),
          tipo: s.g1_tipo || '',
          descripcion: s.g2_descripcion || '',
          dirigido: s.g5_dirigido || '',
          urgencia: s.g4_urgencia || '',
          recursos: s.g6_recursos || '',
          registrador: s.registrador || '',
          fecha: s.a2_fecha || (s._submission_time || '').slice(0, 10),
          fecha_compromiso: s.g1b_compromiso_fecha || '',
          completada: completedIds.has(String(s._id || s._uuid)),
        };
      });
    res.json(tareas);
  }).catch(function(err) {
    console.error('Error: ' + err.message);
    res.status(500).json({ error: err.message });
  });
});

app.post('/api/tareas/:id/completar', function(req, res) {
  completedIds.add(req.params.id); saveCompleted(); res.json({ ok: true });
});
app.delete('/api/tareas/:id/completar', function(req, res) {
  completedIds.delete(req.params.id); saveCompleted(); res.json({ ok: true });
});

app.use('/kobo', createProxyMiddleware({
  target: 'https://kc.kobotoolbox.org', changeOrigin: true,
  pathRewrite: { '^/kobo': '' },
}));

app.listen(3001, function() { console.log('Proxy en puerto 3001'); });
