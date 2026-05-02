const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Estado completadas ────────────────────────────────────────────────────────
const COMPLETED_FILE = path.join(__dirname, 'completed.json');
var completedIds = new Set();
try {
  var saved = JSON.parse(fs.readFileSync(COMPLETED_FILE, 'utf8'));
  completedIds = new Set(saved);
} catch(e) {}

function saveCompleted() {
  try { fs.writeFileSync(COMPLETED_FILE, JSON.stringify([...completedIds])); } catch(e) {}
}

// ── Helper HTTPS ──────────────────────────────────────────────────────────────
function httpsGet(url, headers) {
  return new Promise(function(resolve, reject) {
    var parsedUrl = new URL(url);
    var options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: headers,
    };
    var req = https.request(options, function(res) {
      var body = '';
      res.on('data', function(chunk) { body += chunk; });
      res.on('end', function() {
        console.log(parsedUrl.hostname + parsedUrl.pathname + ' -> ' + res.statusCode);
        if (res.statusCode !== 200) {
          return reject(new Error('HTTP ' + res.statusCode + ': ' + body.slice(0, 300)));
        }
        try { resolve(JSON.parse(body)); }
        catch(e) { reject(new Error('JSON invalido: ' + body.slice(0, 100))); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ── Kobo config ───────────────────────────────────────────────────────────────
var KOBO_TOKEN = '629fb612ea05e21dd1d02d6cab992a5058293922';
var KOBO_UID   = 'aXVyjPZ9YmmzGHaK6uHMdb';
var KOBO_HEADERS = {
  Authorization: 'Token ' + KOBO_TOKEN,
  Accept: 'application/json',
};

// ── Endpoints ─────────────────────────────────────────────────────────────────
app.get('/api/ping', function(req, res) {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/api/tareas', function(req, res) {
  var url = 'https://kf.kobotoolbox.org/api/v2/assets/' + KOBO_UID + '/submissions/?format=json&limit=500';
  httpsGet(url, KOBO_HEADERS).then(function(data) {
    var submissions = data.results || [];
    console.log('Submissions: ' + submissions.length);
    var tareas = submissions
      .filter(function(s) { return s.tipo_registro === 'tarea'; })
      .map(function(s) {
        return {
          id: String(s._id),
          tipo: s.g1_tipo || '',
          descripcion: s.g2_descripcion || '',
          dirigido: s.g5_dirigido || '',
          urgencia: s.g4_urgencia || '',
          recursos: s.g6_recursos || '',
          registrador: s.registrador || '',
          fecha: s.a2_fecha || (s._submission_time || '').slice(0, 10),
          fecha_compromiso: s.g1b_compromiso_fecha || '',
          completada: completedIds.has(String(s._id)),
        };
      });
    res.json(tareas);
  }).catch(function(err) {
    console.error('Error /api/tareas: ' + err.message);
    res.status(500).json({ error: err.message });
  });
});

app.post('/api/tareas/:id/completar', function(req, res) {
  completedIds.add(req.params.id);
  saveCompleted();
  res.json({ ok: true });
});

app.delete('/api/tareas/:id/completar', function(req, res) {
  completedIds.delete(req.params.id);
  saveCompleted();
  res.json({ ok: true });
});

// ── Proxy envío a Kobo ────────────────────────────────────────────────────────
app.use('/kobo', createProxyMiddleware({
  target: 'https://kc.kobotoolbox.org',
  changeOrigin: true,
  pathRewrite: { '^/kobo': '' },
}));

app.listen(3001, function() { console.log('Proxy corriendo en puerto 3001'); });
