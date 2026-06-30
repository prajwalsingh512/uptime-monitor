const axios = require('axios');
const db = require('./db');

const insertCheck = db.prepare(`
  INSERT INTO checks (url_id, status_code, response_time_ms, is_up)
  VALUES (?, ?, ?, ?)
`);

const CHECK_TIMEOUT_MS = 8000;

async function checkUrl(urlRow) {
  const start = Date.now();
  try {
    const res = await axios.get(urlRow.url, {
      timeout: CHECK_TIMEOUT_MS,
      validateStatus: () => true, // we want to record whatever status comes back
    });
    const elapsed = Date.now() - start;
    const isUp = res.status >= 200 && res.status < 400 ? 1 : 0;
    insertCheck.run(urlRow.id, res.status, elapsed, isUp);
    return { id: urlRow.id, status_code: res.status, response_time_ms: elapsed, is_up: isUp };
  } catch (err) {
    const elapsed = Date.now() - start;
    // DNS failure, connection refused, timeout, invalid URL, etc.
    insertCheck.run(urlRow.id, null, elapsed, 0);
    return { id: urlRow.id, status_code: null, response_time_ms: elapsed, is_up: 0, error: err.code || err.message };
  }
}

async function checkAllUrls() {
  const urls = db.prepare('SELECT * FROM urls').all();
  if (urls.length === 0) return [];
  const results = await Promise.all(urls.map(checkUrl));
  return results;
}

module.exports = { checkUrl, checkAllUrls };
