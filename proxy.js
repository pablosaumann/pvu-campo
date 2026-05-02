const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
app.use(cors({
  origin: '*',
  allowedHeaders: ['Authorization', 'Content-Type'],
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Estado completadas ────────────────────────────────────────────────────────
const COMPLETED_FILE = path.join(__dirname, 'completed.json');
let completedIds = new Set();
try {
  const data = JSON.parse(fs.readFileSync(COMPLETED_FILE, 'utf8'));
  completedIds = new Set(data);
} catch {}

function saveCompleted() {
  try { fs.writeFileSync(COMPLETED_FILE, JSON.stringify([...completedIds])); } catch {}
}

// ── Helper: llamada HTTPS ─────────────────────────────────────────────────────
function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers,
    };
    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log(`Kobo response status: ${res.statusCode}`);
        if (res.statusCode !== 200) {
          return reject(new Error(`Kobo respondió ${res.statusCode}: ${body.slice(0, 300)}`));
        }
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error('JSON inválido: ' + body.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ── API: Test ─────────────────────────────────────────────────────────────────
app.get('/api/ping', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ── API: Estado completadas ───────────────────────────────────────────────────
app.get('/api/completadas', (req, res) => {
  res.json([...completedIds]);
});

app.post('/api/tareas/:id/completar', (req, res) => {
  completedIds.add(req.params.id);
  saveCompleted();
  res.json({ ok: true });
});

app.delete('/api/tareas/:id/completar', (req, res) => {
  completedIds.delete(req.params.id);
  saveCompleted();
  res.json({ ok: true });
});

// ── Proxy a Kobo ─────────────────────────────────────────────────────────────
app.use('/kobo', createProxyMiddleware({
  target: 'https://kc.kobotoolbox.org',
  changeOrigin: true,
  pathRewrite: { '^/kobo': '' },
}));

app.listen(3001, () => console.log('Proxy corriendo en puerto 3001'));
