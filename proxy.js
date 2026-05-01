const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Estado completadas (persiste en archivo entre reinicios) ─────────────────
const COMPLETED_FILE = path.join(__dirname, 'completed.json');
let completedIds = new Set();
try {
  const data = JSON.parse(fs.readFileSync(COMPLETED_FILE, 'utf8'));
  completedIds = new Set(data);
} catch {}

function saveCompleted() {
  try { fs.writeFileSync(COMPLETED_FILE, JSON.stringify([...completedIds])); } catch {}
}

// ── API: Tareas desde Kobo ───────────────────────────────────────────────────
const KOBO_UID = 'aXVyjPZ9YmmzGHaK6uHMdb';
const KOBO_API = `https://kf.kobotoolbox.org/api/v2/assets/${KOBO_UID}/submissions/`;

app.get('/api/tareas', async (req, res) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try {
    const response = await fetch(`${KOBO_API}?format=json&limit=500`, {
      headers: { Authorization: token }
    });
    const data = await response.json();
    const submissions = data.results || [];
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
