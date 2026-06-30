const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const db = require('./db');
const { checkUrl, checkAllUrls } = require('./monitor');

const app = express();
const PORT = process.env.PORT || 4000;
const CHECK_INTERVAL_CRON = process.env.CHECK_INTERVAL_CRON || '*/30 * * * * *'; // every 30s by default

app.use(cors());
app.use(express.json());

// Friendly root route (the API has no UI of its own — see /frontend for that)
app.get('/', (req, res) => {
  res.json({
    message: 'Uptime Monitor API is running.',
    endpoints: ['/health', '/api/urls', '/api/urls/:id/checks', '/api/check-now'],
  });
});

// Health check for the API itself
app.get('/health', (req, res) => res.json({ ok: true }));

// GET all URLs with their latest check result
app.get('/api/urls', (req, res) => {
  const urls = db.prepare('SELECT * FROM urls ORDER BY created_at DESC').all();

  const latestCheckStmt = db.prepare(`
    SELECT * FROM checks WHERE url_id = ? ORDER BY checked_at DESC LIMIT 1
  `);

  const result = urls.map((u) => {
    const latest = latestCheckStmt.get(u.id);
    return {
      id: u.id,
      name: u.name,
      url: u.url,
      created_at: u.created_at,
      latest_check: latest || null,
    };
  });

  res.json(result);
});

// GET check history for one URL
app.get('/api/urls/:id/checks', (req, res) => {
  const checks = db
    .prepare('SELECT * FROM checks WHERE url_id = ? ORDER BY checked_at DESC LIMIT 50')
    .all(req.params.id);
  res.json(checks);
});

// POST register a new URL
app.post('/api/urls', async (req, res) => {
  const { url, name } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'A valid "url" string is required.' });
  }

  let normalizedUrl = url.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = 'https://' + normalizedUrl;
  }

  try {
    const stmt = db.prepare('INSERT INTO urls (name, url) VALUES (?, ?)');
    const info = stmt.run(name || normalizedUrl, normalizedUrl);
    const newUrl = db.prepare('SELECT * FROM urls WHERE id = ?').get(info.lastInsertRowid);

    // Fire an immediate check so the UI doesn't have to wait for the next cron tick
    checkUrl(newUrl).catch(() => {});

    res.status(201).json(newUrl);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'This URL is already being monitored.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to register URL.' });
  }
});

// DELETE a monitored URL
app.delete('/api/urls/:id', (req, res) => {
  db.prepare('DELETE FROM urls WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

// POST trigger an immediate check of everything (handy for demos/tests)
app.post('/api/check-now', async (req, res) => {
  const results = await checkAllUrls();
  res.json(results);
});

app.listen(PORT, () => {
  console.log(`Uptime monitor API listening on port ${PORT}`);

  // Schedule recurring checks
  cron.schedule(CHECK_INTERVAL_CRON, () => {
    checkAllUrls().catch((err) => console.error('Scheduled check failed:', err));
  });
  console.log(`Scheduled checks running on cron: ${CHECK_INTERVAL_CRON}`);
});
