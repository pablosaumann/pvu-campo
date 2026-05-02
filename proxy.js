const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
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
let completedIds = new Set();
try {
  const data = JSON.parse(fs.readFileSync(COMPLETED_FILE, 'utf8'));
  completedIds = new Set(data);
} catch(e) {}

function saveCompleted() {
  try { fs.writeFileSync(COMPLETED_FILE, JSON.stringify([...completedIds])); } catch(e) {}
}

// ── Helper HTTPS ──────────────────────────────────────────────────────────────
function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: headers,
    };
    const req = https.request(options, function(res) {
      let body = '';
      res.on('data', function(chunk) { body += chunk; });
      res.on('end', function() {
        console.log(parsedUrl.hostname + ' -> ' + res.statusCode);
        if (res.statusCode !== 200) {
          return reject(new Error('HTTP ' + res.statusCode + ': ' + body.slice(0, 200)));
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
var koboFormId = null;

function getKoboFormId() {
  if (koboFormId) return Promise.resolve(koboFormId);
  return httpsGet('https://kc.kobotoolbox.org/api/v1/data/?format=json', {
    Authorization: 'Token ' + KOBO_TOKEN,
  }).then(function(data) {
    var forms = Array.isArray(data) ? data : (data.results || []);
    console.log('Formularios: ' + forms.map(function(f) { return f.id + ':' + f.id_string; }).join(', '));
    var form = forms.find(function(f) { return f.id_string === 'parque_valle_ulmos'; });
    if (!form) form = forms.find(function(f) { return (f.title || '').toLowerCase().indexOf('ulmos') >= 0; });
    if (!form) throw new Error('No encontrado. Disponibles: ' + forms.map(function(f) { return f.id_string; }).join(', '));
    koboFormId = form.id;
    console.log('Form ID: ' + koboFormId);
    return koboFormId;
  });
}

// ── Endpoints ─────────────────────────────────────────────────────────────────
app.get('/api/ping', function(req, res) {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/api/debug', function(req, res) {
  var urls = [
    'https://kc.kobotoolbox.org/api/v1/data/?format=json',
    'https://kf.kobotoolbox.org/api/v2/assets/?format=json&limit=5',
    'https://kf.kobotoolbox.org/api/v2/assets/aXVyjPZ9YmmzGHaK6uHMdb/?format=json',
  ];
  var results = {};
  var promises = urls.map(function(url) {
    return httpsGet(url, { Authorization: 'Token ' + KOBO_TOKEN })
      .then(function(data) { results[url] = { ok: true, snippet: JSON.stringify(data).slice(0, 400) }; })
      .catch(function(e) { results[url] = { ok: false, error: e.message }; });
  });
  Promise.all(promises).then(function() { res.json(results); });
});

app.get('/api/tareas', function(req, res) {
  getKoboFormId().then(function(formId) {
    return httpsGet(
      'https://kc.kobotoolbox.org/api/v1/data/' + formId + '?format=json&limit=500',
      { Authorization: 'Token ' + KOBO_TOKEN }
    );
  }).then(function(data) {
    var submissions = Array.isArray(data) ? data : (data.results || []);
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
