const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(__dirname, 'data');
const DATA_FILE = path.resolve(DATA_DIR, 'sessions.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', { mode: 0o600 });

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'");
  next();
});

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    if (/\.(html|js|css)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// Serialise writes to prevent race-condition data loss on concurrent requests
let writeQueue = Promise.resolve();

function pad(n) { return String(n).padStart(2, '0'); }

function readSessions() {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  if (!Array.isArray(data)) return [];
  return data.filter(s =>
    typeof s.id === 'string' &&
    typeof s.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.date) &&
    typeof s.completedAt === 'string' &&
    typeof s.duration === 'number' && s.duration >= 0
  );
}

app.get('/api/sessions', (req, res) => {
  try {
    res.json(readSessions());
  } catch (e) {
    console.error('[ERROR] GET /api/sessions:', e.message);
    res.status(500).json({ error: 'Failed to read sessions' });
  }
});

app.post('/api/sessions', (req, res) => {
  const duration = Number(req.body?.duration);
  if (!Number.isFinite(duration) || duration < 0 || duration > 7200) {
    return res.status(400).json({ error: 'Invalid duration' });
  }

  const prev = writeQueue;
  writeQueue = new Promise(resolve => {
    prev.then(() => {
      try {
        const sessions = readSessions();
        const now = new Date();
        const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        const session = {
          id: crypto.randomBytes(16).toString('hex'),
          date,
          completedAt: now.toISOString(),
          duration: Math.round(duration)
        };
        sessions.push(session);
        fs.writeFileSync(DATA_FILE, JSON.stringify(sessions, null, 2), { mode: 0o600 });
        res.json(session);
      } catch (e) {
        console.error('[ERROR] POST /api/sessions:', e.message);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to save session' });
      }
      resolve();
    });
  });
});

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const iface of Object.values(nets)) {
    for (const alias of iface) {
      if (alias.family === 'IPv4' && !alias.internal) return alias.address;
    }
  }
  return null;
}

app.listen(PORT, HOST, () => {
  const ip = getLocalIP();
  console.log('\n🧘  Stretching App is running!\n');
  console.log(`   Local:   http://localhost:${PORT}`);
  if (ip) console.log(`   Network: http://${ip}:${PORT}  ← open this on your phone`);
  console.log('\nPress Ctrl+C to stop.\n');
});
