const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'sessions.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/sessions', (req, res) => {
  try {
    res.json(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
  } catch {
    res.json([]);
  }
});

app.post('/api/sessions', (req, res) => {
  try {
    const sessions = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const session = {
      id: Date.now(),
      date,
      completedAt: now.toISOString(),
      duration: req.body.duration || 0
    };
    sessions.push(session);
    fs.writeFileSync(DATA_FILE, JSON.stringify(sessions, null, 2));
    res.json(session);
  } catch (e) {
    res.status(500).json({ error: 'Failed to save session' });
  }
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

app.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('\n🧘  Stretching App is running!\n');
  console.log(`   Local:   http://localhost:${PORT}`);
  if (ip) console.log(`   Network: http://${ip}:${PORT}  ← open this on your phone`);
  console.log('\nPress Ctrl+C to stop.\n');
});
