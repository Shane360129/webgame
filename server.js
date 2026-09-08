/**
 * 皇室對戰式 3D 重製原型 — 伺服器。
 *
 * 非官方粉絲專案。不含也不散布任何 Supercell 素材。
 * 詳見 docs/licensing-and-assets.md 與 docs/clash-royale-3d-audit.md。
 */

import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';

import { openDb, Store, trophyDelta, arenaForTrophies, STARTER_DECK } from './src/server/db.js';
import { Match, Matchmaker, RECONNECT_GRACE_MS } from './src/server/match.js';
import { ALL_CARDS, TOWER_TROOPS, DECK_ELIGIBLE, CHAMPION_KEYS, EVOLUTION_KEYS, coverageReport } from './src/shared/catalogue.js';
import { CHESTS, validateChestTables, chestsForArena } from './src/shared/chests.js';
import { openChest, makeRng } from './src/shared/chest-open.js';
import * as RULES from './src/shared/rules.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'royale.db');

const db = openDb(DB_PATH);
const store = new Store(db);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
// 共用模擬器：伺服器與瀏覽器 import 的是同一份檔案，
// 所以 AI 練習模式跑的規則與線上對戰完全一致。
app.use('/shared', express.static(path.join(__dirname, 'src', 'shared'), {
  maxAge: '1h',
  setHeaders: (res) => res.setHeader('Content-Type', 'text/javascript; charset=utf-8'),
}));

// ───────────────── REST ─────────────────

app.get('/healthz', (req, res) => {
  res.json({ ok: true, online: onlineCount(), queued: matchmaker.size(), matches: matches.size, players: store.totalPlayers() });
});

/** 卡牌目錄（含 provenance）。客戶端據此顯示「數值未驗證」徽章。 */
app.get('/api/catalogue', (req, res) => {
  res.json({
    cards: ALL_CARDS,
    towerTroops: TOWER_TROOPS,
    deckEligible: DECK_ELIGIBLE,
    champions: CHAMPION_KEYS,
    evolutions: EVOLUTION_KEYS,
    coverage: coverageReport(),
    rules: {
      timing: RULES.TIMING,
      elixir: RULES.ELIXIR,
      arena: RULES.ARENA,
      towerLayout: RULES.TOWER_LAYOUT,
      towerStats: RULES.TOWER_STATS,
      kingActivation: RULES.KING_ACTIVATION,
      deck: RULES.DECK,
      evolution: RULES.EVOLUTION,
      deploy: RULES.DEPLOY,
      victory: RULES.VICTORY,
      sources: RULES.SOURCES,
    },
  });
});

/** 寶箱定義與機率表自檢結果。 */
app.get('/api/chests', (req, res) => {
  res.json({ chests: CHESTS, validation: validateChestTables() });
});

app.get('/api/leaderboard', (req, res) => {
  const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 20));
  res.json({
    entries: store.leaderboard(limit),
    online: onlineCount(),
    recent: store.recentMatches(12),
  });
});

app.post('/api/profile', (req, res) => {
  const id = safeId(req.body?.id);
  const name = safeName(req.body?.name);
  if (!id) return res.status(400).json({ ok: false, error: 'bad id' });
  const profile = store.ensurePlayer(id, name);
  return res.json({ ok: true, profile });
});

app.post('/api/deck', (req, res) => {
  const id = safeId(req.body?.id);
  if (!id) return res.status(400).json({ ok: false, error: 'bad id' });
  const profile = store.ensurePlayer(id, null);
  if (!profile) return res.status(404).json({ ok: false, error: 'no profile' });
  const r = store.saveDeck(id, {
    deck: Array.isArray(req.body?.deck) ? req.body.deck : [],
    evos: Array.isArray(req.body?.evos) ? req.body.evos : [],
    champion: req.body?.champion || null,
    towerTroop: req.body?.towerTroop || 'tower_princess',
  });
  if (!r.ok) return res.status(400).json({ ok: false, error: r.reason });
  return res.json({ ok: true, profile: store.ensurePlayer(id, null) });
});

/** 開箱：伺服器端執行，保底計數持久化。 */
app.post('/api/chest/open', (req, res) => {
  const id = safeId(req.body?.id);
  const chestId = String(req.body?.chestId || '');
  if (!id || !CHESTS[chestId]) return res.status(400).json({ ok: false, error: 'bad request' });
  const profile = store.ensurePlayer(id, null);
  const arena = arenaForTrophies(profile.trophies);
  const available = chestsForArena(arena).map((c) => c.chest_id);
  if (!available.includes(chestId)) {
    return res.status(403).json({ ok: false, error: 'chest_not_available_in_arena', arena });
  }
  const counters = profile.counters || {};
  const rewards = openChest({ chestId, arena, counters, rng: makeRng(Date.now() ^ (Math.random() * 1e9)) });
  store.saveCounters(id, counters);
  if (!rewards.choices) {
    store.grant(id, { gold: rewards.gold, cards: rewards.cards });
  }
  return res.json({ ok: true, rewards, profile: store.ensurePlayer(id, null) });
});

/** 抉擇寶箱：玩家選定一組後才發放。 */
app.post('/api/chest/choose', (req, res) => {
  const id = safeId(req.body?.id);
  const group = req.body?.group;
  if (!id || !Array.isArray(group)) return res.status(400).json({ ok: false, error: 'bad request' });
  const clean = group
    .filter((s) => s && ALL_CARDS[s.card] && Number.isInteger(s.count) && s.count > 0 && s.count <= 200)
    .slice(0, 24);
  store.grant(id, { gold: Math.max(0, Math.min(2000, parseInt(req.body?.gold, 10) || 0)), cards: clean });
  return res.json({ ok: true, profile: store.ensurePlayer(id, null) });
});

/** 資料查核報表（給 UI 的「資料查核」頁使用）。 */
app.get('/api/audit', (req, res) => {
  res.json({
    generatedAt: new Date().toISOString(),
    coverage: coverageReport(),
    chestValidation: validateChestTables(),
    unverifiedStats: Object.values(ALL_CARDS)
      .filter((c) => !c.spawnOnly && !c.provenance?.statsVerified)
      .map((c) => ({ key: c.key, name: c.name, nameZh: c.nameZh, source: c.provenance?.source, versionDate: c.provenance?.versionDate })),
    unverifiedIdentity: Object.values(ALL_CARDS)
      .filter((c) => c.provenance && c.provenance.identityVerified === false)
      .map((c) => ({ key: c.key, name: c.name, note: c.note || null })),
    dataFetch: {
      attemptedHost: 'royaleapi.github.io',
      status: 'blocked_by_network_policy',
      httpStatus: 403,
      note: '本次建置環境的網路政策阻擋該來源，因此未取得固定版本的完整卡牌匯出檔。',
    },
    sources: RULES.SOURCES,
  });
});

// ───────────────── WebSocket ─────────────────

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

/** socket -> { id, profile, matchId, side } */
const sessions = new Map();
/** matchId -> Match */
const matches = new Map();
/** playerId -> { matchId, side } 供重連查詢 */
const activeByPlayer = new Map();

function onlineCount() {
  let n = 0;
  for (const c of wss.clients) if (c.readyState === 1) n += 1;
  return n;
}

function broadcastLobby() {
  const msg = JSON.stringify({ type: 'lobby', online: onlineCount(), queued: matchmaker.size(), matches: matches.size });
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
}

const matchmaker = new Matchmaker({
  botAfterMs: Number(process.env.BOT_AFTER_MS || 12_000),
  onMatch: (entries, kind) => {
    const [a, b] = entries;
    const seats = [
      { profile: a.profile, socket: a.socket, isBot: false },
      b
        ? { profile: b.profile, socket: b.socket, isBot: false }
        : { profile: botProfile(a.profile), socket: null, isBot: true },
    ];
    startMatch(seats, kind === 'pvp' ? 'ladder' : 'ladder_bot', a.difficulty || 'normal');
  },
});

function botProfile(vs) {
  return {
    id: `bot:${Math.random().toString(36).slice(2, 8)}`,
    name: '電腦對手（AI）',
    trophies: vs.trophies,
    deck: pickBotDeck(),
    evos: [],
    champion: null,
    towerTroop: 'tower_princess',
    isBot: true,
  };
}

function pickBotDeck() {
  const pool = ['knight', 'archers', 'goblins', 'musketeer', 'cannon', 'fireball', 'zap', 'giant',
    'valkyrie', 'baby_dragon', 'hog_rider', 'minions', 'skeletons', 'arrows', 'tesla', 'wizard',
    'mini_pekka', 'spear_goblins', 'bomber', 'the_log', 'inferno_tower', 'musketeer'];
  const deck = [];
  const seen = new Set();
  while (deck.length < 8) {
    const c = pool[Math.floor(Math.random() * pool.length)];
    if (seen.has(c)) continue;
    seen.add(c);
    deck.push(c);
  }
  return deck;
}

function startMatch(seats, mode, difficulty) {
  const match = new Match({
    seats,
    mode,
    difficulty,
    onEnd: (m, result) => finishMatch(m, result),
  });
  matches.set(match.id, match);
  for (const [side, seat] of seats.entries()) {
    if (!seat.socket) continue;
    const s = sessions.get(seat.socket);
    if (s) { s.matchId = match.id; s.side = side; }
    activeByPlayer.set(seat.profile.id, { matchId: match.id, side });
  }
  broadcastLobby();
  return match;
}

function finishMatch(match, result) {
  matches.delete(match.id);
  const [sa, sb] = match.seats;
  const now = Date.now();

  store.logMatch({
    a_id: sa.profile.id, b_id: sb.profile.id,
    a_name: sa.profile.name, b_name: sb.profile.name,
    winner: result?.winner ?? null, reason: result?.reason || 'unknown',
    crowns_a: result?.crowns?.[0] ?? 0, crowns_b: result?.crowns?.[1] ?? 0,
    mode: match.mode, duration: result?.time ?? 0, created_at: now,
  });

  for (let side = 0; side < 2; side += 1) {
    const seat = match.seats[side];
    if (seat.isBot) continue;
    activeByPlayer.delete(seat.profile.id);
    const fresh = store.ensurePlayer(seat.profile.id, null);
    const opponent = match.seats[1 - side].profile;
    const drew = result?.winner == null;
    const won = result?.winner === side;
    const delta = trophyDelta({ won, drew, trophies: fresh.trophies, opponentTrophies: opponent.trophies });
    const applied = store.applyResult(fresh, { won, lost: !won && !drew, drew, delta });
    const gold = won ? 40 + (result?.crowns?.[side] || 0) * 15 : drew ? 15 : 8;
    store.grant(seat.profile.id, { gold });
    match.send(side, {
      type: 'matchReward',
      result,
      trophies: applied.trophies,
      delta: applied.delta,
      gold,
      profile: store.ensurePlayer(seat.profile.id, null),
    });
    const s = seat.socket ? sessions.get(seat.socket) : null;
    if (s) { s.matchId = null; s.side = null; }
  }
  broadcastLobby();
}

wss.on('connection', (socket) => {
  const session = { id: null, profile: null, matchId: null, side: null, alive: true };
  sessions.set(socket, session);
  socket.isAlive = true;
  socket.on('pong', () => { socket.isAlive = true; });

  send(socket, { type: 'welcome', online: onlineCount(), reconnectGraceMs: RECONNECT_GRACE_MS });

  socket.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg.type !== 'string') return;
    handle(socket, session, msg);
  });

  socket.on('close', () => {
    matchmaker.remove(socket);
    const s = sessions.get(socket);
    if (s?.matchId) {
      const m = matches.get(s.matchId);
      if (m) m.markDisconnected(socket);
    }
    sessions.delete(socket);
    broadcastLobby();
  });

  socket.on('error', () => {});
  broadcastLobby();
});

function send(socket, obj) {
  if (socket.readyState !== 1) return;
  try { socket.send(JSON.stringify(obj)); } catch { /* ignore */ }
}

function handle(socket, session, msg) {
  switch (msg.type) {
    case 'hello': {
      const id = safeId(msg.id);
      if (!id) return send(socket, { type: 'error', reason: 'bad_id' });
      session.id = id;
      session.profile = store.ensurePlayer(id, safeName(msg.name));
      send(socket, { type: 'profile', profile: session.profile });

      // 重連：如果這名玩家還在對戰中，直接接回去。
      const active = activeByPlayer.get(id);
      if (active) {
        const m = matches.get(active.matchId);
        if (m && m.reconnect(active.side, socket)) {
          session.matchId = m.id;
          session.side = active.side;
        } else {
          activeByPlayer.delete(id);
        }
      }
      return undefined;
    }

    case 'queue': {
      if (!session.profile) return send(socket, { type: 'error', reason: 'no_profile' });
      if (session.matchId) return send(socket, { type: 'error', reason: 'already_in_match' });
      session.profile = store.ensurePlayer(session.id, null);
      matchmaker.enqueue({
        socket,
        profile: session.profile,
        allowBot: msg.allowBot !== false,
        difficulty: ['easy', 'normal', 'hard'].includes(msg.difficulty) ? msg.difficulty : 'normal',
      });
      send(socket, { type: 'queued', position: matchmaker.size() });
      return broadcastLobby();
    }

    case 'cancelQueue':
      matchmaker.remove(socket);
      send(socket, { type: 'queueCancelled' });
      return broadcastLobby();

    case 'play':
    case 'champion':
    case 'ability':
    case 'emote':
    case 'resign': {
      if (!session.matchId) return send(socket, { type: 'error', reason: 'not_in_match' });
      const m = matches.get(session.matchId);
      if (!m) return send(socket, { type: 'error', reason: 'match_gone' });
      const r = m.handleInput(socket, msg);
      if (!r?.ok) send(socket, { type: 'inputRejected', input: msg.type, reason: r?.reason, seq: msg.seq });
      return undefined;
    }

    case 'ping':
      return send(socket, { type: 'pong', t: msg.t });

    default:
      return send(socket, { type: 'error', reason: 'unknown_message' });
  }
}

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000);
heartbeat.unref();

// ───────────────── 輸入清理 ─────────────────

function safeId(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  return /^[A-Za-z0-9_-]{6,48}$/.test(s) ? s : null;
}

function safeName(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[\x00-\x1F\x7F<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return cleaned.length ? cleaned : null;
}

server.listen(PORT, () => {
  console.log(`皇室對戰式 3D 重製原型 — http://localhost:${PORT}`);
  console.log(`資料庫：${DB_PATH}`);
  console.log('非官方粉絲專案；不含任何 Supercell 素材。');
});

function shutdown() {
  clearInterval(heartbeat);
  for (const m of matches.values()) m.end();
  server.close(() => { try { db.close(); } catch { /* ignore */ } process.exit(0); });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { app, server, store };
