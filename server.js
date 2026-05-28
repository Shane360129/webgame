'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'leaderboard.db');
const MAX_SCORE = 1_000_000;
const NAME_MAX = 16;

// --- Database -------------------------------------------------------------
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS scores (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    score      INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_scores_score ON scores (score DESC, created_at ASC);
`);

const insertScore = db.prepare('INSERT INTO scores (name, score, created_at) VALUES (?, ?, ?)');
const selectTop = db.prepare('SELECT name, score, created_at FROM scores ORDER BY score DESC, created_at ASC LIMIT ?');
const countBetter = db.prepare('SELECT COUNT(*) AS n FROM scores WHERE score > ?');
const countTotal = db.prepare('SELECT COUNT(*) AS n FROM scores');

function getTop(limit = 10) {
  return selectTop.all(limit).map((row, i) => ({
    rank: i + 1,
    name: row.name,
    score: row.score,
    createdAt: row.created_at,
  }));
}

function rankForScore(score) {
  return countBetter.get(score).n + 1;
}

// --- Helpers --------------------------------------------------------------
// Strip control characters (0x00-0x1F, 0x7F) and angle brackets; collapse
// whitespace; clamp length. Digits, letters and CJK are preserved.
const BAD_CHARS = /[\x00-\x1F\x7F<>]/g;
const WS_RUN = /\s+/g;

function sanitizeName(raw) {
  if (typeof raw !== 'string') return '匿名玩家';
  const cleaned = raw
    .replace(BAD_CHARS, '')
    .replace(WS_RUN, ' ')
    .trim()
    .slice(0, NAME_MAX);
  return cleaned.length > 0 ? cleaned : '匿名玩家';
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// --- HTTP app -------------------------------------------------------------
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '8kb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

app.get('/healthz', (req, res) => {
  res.json({ ok: true, online: onlineCount(), total: countTotal.get().n });
});

app.get('/api/leaderboard', (req, res) => {
  const limit = clamp(parseInt(req.query.limit, 10) || 10, 1, 50);
  res.json({ entries: getTop(limit), online: onlineCount() });
});

app.post('/api/score', (req, res) => {
  const body = req.body || {};
  const name = sanitizeName(body.name);
  const score = Math.floor(Number(body.score));

  if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) {
    return res.status(400).json({ ok: false, error: 'invalid score' });
  }

  insertScore.run(name, score, Date.now());
  const rank = rankForScore(score);
  const entries = getTop(10);

  broadcast({ type: 'leaderboard', entries });
  broadcast({ type: 'activity', name, score, rank });

  res.json({ ok: true, rank, score, name, entries });
});

// --- WebSocket ------------------------------------------------------------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function onlineCount() {
  let n = 0;
  for (const client of wss.clients) {
    if (client.readyState === 1) n += 1;
  }
  return n;
}

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

function broadcastOnline() {
  broadcast({ type: 'online', online: onlineCount() });
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.send(JSON.stringify({ type: 'init', online: onlineCount(), entries: getTop(10) }));
  broadcastOnline();

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (msg && msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
  });

  ws.on('close', () => broadcastOnline());
  ws.on('error', () => {});
});

// Drop dead connections so the online count stays accurate.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
  broadcastOnline();
}, 30_000);
heartbeat.unref();

server.listen(PORT, () => {
  console.log(`雲端疊大樓 running on http://localhost:${PORT}`);
  console.log(`Leaderboard DB: ${DB_PATH}`);
});

function shutdown() {
  clearInterval(heartbeat);
  server.close(() => {
    try { db.close(); } catch { /* ignore */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5_000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
