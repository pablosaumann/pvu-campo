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
        resolve({ status: res.statusCode, body: body.slice(0, 300) });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

var KOBO_TOKEN = '629fb612ea05e21dd1d02d6cab992a5058293922';
var KOBO_UID = 'aXVyjPZ9YmmzGHaK6uHMdb';
var H = { Authorization: 'Token ' + KOBO_TOKEN, Accept: 'application/json' };

app.get('/api/ping', function(req, res) { res.json({ ok: true }); });

app.get('/api/debug', function(req, res) {
  var tests = [
    'https://kf.kobotoolbox.org/api/v2/assets/' + KOBO_UID + '/submissions',
    'https://kc.kobotoolbox.org/api/v1/forms/',
    'https://kc.kobotoolbox.org/api/v1/forms/?id_string=parque_valle_ulmos',
    'https://kc.kobotoolbox.org/pablosaumann/forms/parque_valle_ulmos.json',
    'https://kc.kobotoolbox.org/pablosaumann/reports/' + KOBO_UID + '/export.csv',
  ];
  var results = {};
  var promises = tests.map(function(url) {
    return httpsRaw(url, H)
      .then(function(r) { results[url] = { status: r.status, body: r.body }; })
      .catch(function(e) { results[url] = { error: e.message }; });
  });
  Promise.all(promises).then(function() { res.json(results); });
});

app.get('/api/tareas', function(req, res) {
  res.status(503).json({ error: 'En debug' });
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
