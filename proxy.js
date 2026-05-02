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

// Preflight explícito para todos los endpoints
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

// ── API: Tareas desde Kobo ────────────────────────────────────────────────────
let koboFormId = null; // caché del ID numérico

async function getKoboFormId(token) {
  if (koboFormId) return koboFormId;
  const data = await httpsGet('https://kc.kobotoolbox.org/api/v1/data/?format=json', { Authorization: token });
  const forms = Array.isArray(data) ? data : (data.results || []);
  console.log('Formularios disponibles:', forms.map(f => `${f.id}:${f.id_string}`).join(', '));
  const form = forms.find(f => f.id_string === 'parque_valle_ulmos') || forms.find(f => (f.title||'').includes('Ulmos'));
  if (!form) throw new Error(`Formulario no encontrado. Disponibles: ${forms.map(f=>f.id_string).join(', ')}`);
  koboFormId = form.id;
  console.log('Form ID encontrado:', koboFormId);
  return koboFormId;
}

app.get('/api/tareas', async (req, res) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try {
    const formId = await getKoboFormId(token);
    const data = await httpsGet(`https://kc.kobotoolbox.org/api/v1/data/${formId}?format=json&limit=500`, { Authorization: token });
    const submissions = Array.isArray(data) ? data : (data.results || []);
    console.log(`Submissions: ${submissions.length}`);
    const tareas = submissions
      .filter(s => s.tipo_registro === 'tarea')
      .map(s => ({
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
      }));
    res.json(tareas);
  } catch (err) {
    console.error('Error /api/tareas:', err.message);
    res.status(500).json({ error: err.message });
  }
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
