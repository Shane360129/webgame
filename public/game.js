'use strict';

/* =========================================================================
   雲端疊大樓 — front-end (canvas game + leaderboard + WS)
   ========================================================================= */

// ---------- DOM ----------
const canvas      = document.getElementById('game');
const ctx         = canvas.getContext('2d');
const hud         = document.getElementById('hud');
const hudScore    = document.getElementById('hudScore');
const hudCombo    = document.getElementById('hudCombo');
const startScreen = document.getElementById('startScreen');
const overScreen  = document.getElementById('overScreen');
const startBtn    = document.getElementById('startBtn');
const againBtn    = document.getElementById('againBtn');
const nameInput   = document.getElementById('nameInput');
const finalScore  = document.getElementById('finalScore');
const rankLine    = document.getElementById('rankLine');
const muteBtn     = document.getElementById('muteBtn');
const leaderboardEl = document.getElementById('leaderboard');
const activityEl  = document.getElementById('activity');
const onlineCountEl = document.getElementById('onlineCount');
const onlineBox   = document.getElementById('onlineBox');
const connStatus  = document.getElementById('connStatus');

// ---------- World state ----------
const state = {
  mode: 'menu',           // 'menu' | 'playing' | 'falling' | 'over'
  blocks: [],             // placed blocks: { x, width, color, level }
  active: null,           // moving block: { x, width, color, level, dir, speed }
  falling: [],            // overhang debris animated
  effects: [],            // perfect flashes
  score: 0,
  combo: 0,
  bestCombo: 0,
  cameraOffset: 0,
  baseHue: 200,
  pendingOverTimer: 0,    // delay before showing game-over panel
};

// ---------- Canvas sizing ----------
let W = 0, H = 0, dpr = 1;

function resize() {
  const rect = canvas.getBoundingClientRect();
  dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.max(1, Math.round(rect.width  * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  W = rect.width;
  H = rect.height;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(canvas);
resize();

// ---------- Tunables ----------
const BLOCK_H = 32;
const PERFECT_TOL = 4;
const REGROW = 6;
const FLOOR_INSET = 50;
const ACTIVE_TARGET_FRAC = 0.30;
const MIN_WIDTH = 6;

function baseWidth() { return Math.min(W * 0.62, 300); }
function floorY()    { return H - FLOOR_INSET; }
function targetActiveY() { return H * ACTIVE_TARGET_FRAC; }
function periodFor(level) {
  // Smooth pendulum: one full swing (left → right → left) in this many seconds.
  // Starts gentle, gets quicker per level; clamped so it stays playable.
  return Math.max(0.85, 3.0 - level * 0.045);
}
function colorFor(level) {
  const hue = (state.baseHue + level * 9) % 360;
  return `hsl(${hue}, 68%, 58%)`;
}
function darken(hslLike, dl = -18) {
  // hsl(h, s%, l%) -> shift lightness
  const m = hslLike.match(/hsl\(([-\d.]+),\s*([-\d.]+)%,\s*([-\d.]+)%\)/);
  if (!m) return hslLike;
  const l = Math.max(0, Math.min(100, parseFloat(m[3]) + dl));
  return `hsl(${m[1]}, ${m[2]}%, ${l}%)`;
}

// ---------- Audio (lightweight WebAudio blips) ----------
const audio = {
  ctx: null,
  muted: false,
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  },
  blip({ freq = 440, dur = 0.08, type = 'sine', gain = 0.12, slide = 0 }) {
    if (this.muted) return;
    this.ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  },
  place(perfect, combo) {
    if (perfect) {
      const base = 540 + Math.min(combo, 8) * 60;
      this.blip({ freq: base, dur: 0.09, type: 'triangle', gain: 0.14 });
      setTimeout(() => this.blip({ freq: base * 1.5, dur: 0.07, type: 'triangle', gain: 0.10 }), 50);
    } else {
      this.blip({ freq: 280, dur: 0.07, type: 'square', gain: 0.10, slide: -60 });
    }
  },
  gameOver() {
    this.blip({ freq: 220, dur: 0.18, type: 'sawtooth', gain: 0.13, slide: -160 });
  },
};

muteBtn.addEventListener('click', () => {
  audio.muted = !audio.muted;
  muteBtn.textContent = audio.muted ? '🔇' : '🔊';
  try { localStorage.setItem('twr.muted', audio.muted ? '1' : '0'); } catch {}
});
try { if (localStorage.getItem('twr.muted') === '1') { audio.muted = true; muteBtn.textContent = '🔇'; } } catch {}

// ---------- Game lifecycle ----------
function startGame() {
  state.mode = 'playing';
  state.blocks = [];
  state.falling = [];
  state.effects = [];
  state.score = 0;
  state.combo = 0;
  state.bestCombo = 0;
  state.cameraOffset = 0;
  state.baseHue = Math.random() * 360;
  state.pendingOverTimer = 0;

  const w = baseWidth();
  state.blocks.push({
    x: (W - w) / 2,
    width: w,
    color: colorFor(0),
    level: 0,
  });
  spawnActive(w);

  hud.hidden = false;
  startScreen.hidden = true;
  overScreen.hidden = true;
  updateHud();
}

function spawnActive(width) {
  const level = state.blocks.length;
  const fromLeft = level % 2 === 1;
  const period = periodFor(level);
  const span = Math.max(0, (W - width) / 2);
  // Pendulum: x(t) = span * (1 + side * cos(omega * t))
  //   side = -1 → starts at left edge (cos(0)=1 → x=0), swings right
  //   side = +1 → starts at right edge → swings left
  state.active = {
    width,
    color: colorFor(level),
    level,
    omega: (Math.PI * 2) / period,
    side: fromLeft ? -1 : 1,
    t0: performance.now(),
    x: fromLeft ? 0 : Math.max(0, W - width),
  };
}

function activeXAt(a, nowMs) {
  const t = (nowMs - a.t0) / 1000;
  const span = Math.max(0, (W - a.width) / 2);
  let x = span * (1 + a.side * Math.cos(a.omega * t));
  if (x < 0) x = 0;
  const maxX = Math.max(0, W - a.width);
  if (x > maxX) x = maxX;
  return x;
}

function drop() {
  if (state.mode !== 'playing' || !state.active) return;
  const cur = state.active;
  // Snap to the precise position at THIS instant so the drop matches what the
  // player saw at the moment of input — no perceived lag from frame timing.
  cur.x = activeXAt(cur, performance.now());

  const prev = state.blocks[state.blocks.length - 1];
  const left  = Math.max(cur.x, prev.x);
  const right = Math.min(cur.x + cur.width, prev.x + prev.width);
  const overlap = right - left;

  if (overlap <= 0) {
    // Total miss → block falls off, game over.
    spawnFalling(cur.x, cur.width, cur.color, cur.level);
    state.active = null;
    audio.gameOver();
    state.mode = 'falling';
    state.pendingOverTimer = 0.7;
    return;
  }

  const delta = cur.x - prev.x;
  const perfect = Math.abs(delta) <= PERFECT_TOL;
  let placedX, placedWidth;

  if (perfect) {
    state.combo += 1;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    placedWidth = Math.min(baseWidth(), prev.width + REGROW);
    placedX = prev.x - (placedWidth - prev.width) / 2;
    placedX = Math.max(0, Math.min(W - placedWidth, placedX));
    pushEffect(placedX, placedWidth, cur.level);
  } else {
    state.combo = 0;
    placedX = left;
    placedWidth = overlap;
    if (cur.x < prev.x) {
      spawnFalling(cur.x, prev.x - cur.x, cur.color, cur.level);
    } else {
      spawnFalling(prev.x + prev.width, (cur.x + cur.width) - (prev.x + prev.width), cur.color, cur.level);
    }
  }

  state.blocks.push({ x: placedX, width: placedWidth, color: cur.color, level: cur.level });
  state.score += 1 + (perfect ? Math.min(state.combo, 8) : 0);

  audio.place(perfect, state.combo);
  updateHud();

  if (placedWidth < MIN_WIDTH) {
    // Block became a sliver — let player keep going but reset to min display.
  }
  spawnActive(placedWidth);
}

function spawnFalling(x, width, color, level) {
  if (width <= 0) return;
  state.falling.push({
    x,
    y: screenYForLevel(level),
    width,
    height: BLOCK_H,
    vy: -40,
    vx: (x < W / 2 ? -1 : 1) * (30 + Math.random() * 40),
    rot: 0,
    vr: (Math.random() - 0.5) * 4,
    color,
    alpha: 1,
  });
}

function pushEffect(x, width, level) {
  state.effects.push({
    x, width, level,
    ttl: 0.55,
    age: 0,
  });
}

function screenYForLevel(level) {
  return floorY() - level * BLOCK_H + state.cameraOffset;
}

// ---------- Update loop ----------
let lastT = performance.now();

function tick(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  update(dt);
  draw();

  requestAnimationFrame(tick);
}

function update(dt) {
  // camera: keep active level near targetActiveY when tower grows
  const activeLevel = state.active ? state.active.level : state.blocks.length;
  const desired = Math.max(0, targetActiveY() - (floorY() - activeLevel * BLOCK_H));
  state.cameraOffset += (desired - state.cameraOffset) * Math.min(1, dt * 8);

  // moving active block — sinusoidal pendulum, position is a pure function of time
  if (state.mode === 'playing' && state.active) {
    state.active.x = activeXAt(state.active, performance.now());
  }

  // falling debris
  for (const f of state.falling) {
    f.vy += 1400 * dt;
    f.y  += f.vy * dt;
    f.x  += f.vx * dt;
    f.rot += f.vr * dt;
    if (f.y > H + 200) f.alpha = 0;
  }
  state.falling = state.falling.filter(f => f.alpha > 0);

  // effects
  for (const e of state.effects) e.age += dt;
  state.effects = state.effects.filter(e => e.age < e.ttl);

  // game over transition (after the missed piece has fallen)
  if (state.mode === 'falling') {
    state.pendingOverTimer -= dt;
    if (state.pendingOverTimer <= 0) {
      state.mode = 'over';
      showGameOver();
    }
  }
}

// ---------- Render ----------
function draw() {
  // background
  const g = ctx.createLinearGradient(0, 0, 0, H);
  const hueShift = (state.baseHue + state.blocks.length * 4) % 360;
  g.addColorStop(0, `hsl(${(hueShift + 220) % 360}, 35%, 11%)`);
  g.addColorStop(1, `hsl(${(hueShift + 280) % 360}, 45%, 7%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  drawStars(hueShift);
  drawFloorLine();

  // placed blocks (skip ones off-screen for perf)
  for (const b of state.blocks) {
    const y = screenYForLevel(b.level);
    if (y < -BLOCK_H || y > H + BLOCK_H) continue;
    drawBlock(b.x, y, b.width, b.color);
  }

  // active block
  if (state.active) {
    const a = state.active;
    const y = screenYForLevel(a.level);
    drawBlock(a.x, y, a.width, a.color, true);
  }

  // perfect-placement flashes
  for (const e of state.effects) {
    const k = e.age / e.ttl;
    const r = 1 + k * 0.6;
    const alpha = (1 - k) * 0.85;
    const y = screenYForLevel(e.level);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    const w = e.width * r;
    const h = BLOCK_H * r;
    ctx.strokeRect(e.x + e.width / 2 - w / 2, y + BLOCK_H / 2 - h / 2, w, h);
    ctx.restore();
  }

  // falling debris
  for (const f of state.falling) {
    ctx.save();
    ctx.globalAlpha = f.alpha;
    ctx.translate(f.x + f.width / 2, f.y + f.height / 2);
    ctx.rotate(f.rot);
    drawBlock(-f.width / 2, -f.height / 2, f.width, f.color, false, true);
    ctx.restore();
  }
}

function drawBlock(x, y, w, color, isActive = false, raw = false) {
  // main face
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, BLOCK_H);

  // top highlight
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.fillRect(x, y, w, 3);

  // bottom "thickness" lip for fake depth
  ctx.fillStyle = darken(color, -20);
  ctx.fillRect(x, y + BLOCK_H - 5, w, 5);

  // subtle right side shade
  ctx.fillStyle = darken(color, -12);
  ctx.fillRect(x + w - 3, y, 3, BLOCK_H);

  if (isActive && !raw) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y + BLOCK_H, w, 6);
    ctx.restore();
  }
}

function drawFloorLine() {
  const fy = floorY() + state.cameraOffset;
  if (fy < -10 || fy > H + 20) return;
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = 'rgba(148, 163, 217, 0.35)';
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.moveTo(0, fy + BLOCK_H);
  ctx.lineTo(W, fy + BLOCK_H);
  ctx.stroke();
  ctx.restore();
}

// Cached starfield (regenerated on resize via the seed lookup)
let stars = null;
let starsKey = '';
function drawStars(hueShift) {
  const key = `${Math.round(W)}x${Math.round(H)}`;
  if (starsKey !== key) {
    starsKey = key;
    stars = [];
    const n = Math.round((W * H) / 14000);
    for (let i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.2 + 0.2,
        a: Math.random() * 0.6 + 0.2,
      });
    }
  }
  ctx.save();
  for (const s of stars) {
    ctx.globalAlpha = s.a;
    ctx.fillStyle = `hsl(${(hueShift + 200) % 360}, 30%, 92%)`;
    ctx.fillRect(s.x, s.y, s.r, s.r);
  }
  ctx.restore();
}

// ---------- HUD ----------
function updateHud() {
  hudScore.textContent = String(state.score);
  if (state.combo >= 2) {
    hudCombo.textContent = `🔥 連擊 x${state.combo}`;
    hudCombo.classList.add('show');
  } else {
    hudCombo.classList.remove('show');
  }
}

// ---------- Game over flow ----------
function showGameOver() {
  hud.hidden = true;
  finalScore.textContent = state.score;
  rankLine.textContent = '上傳分數中…';
  overScreen.hidden = false;

  const name = currentName();
  if (state.score > 0) {
    submitScore(name, state.score)
      .then(({ rank, entries }) => {
        const isTop10 = rank <= 10;
        let html = '';
        if (isTop10) {
          html = `<span class="rank-new">🎉 新進榜</span> 你的名次 <span class="rank-badge">#${rank}</span>`;
        } else {
          html = `你的名次 <span class="rank-badge">#${rank}</span>`;
        }
        if (state.bestCombo >= 3) html += ` · 最佳連擊 x${state.bestCombo}`;
        rankLine.innerHTML = html;
        renderLeaderboard(entries, name);
      })
      .catch(() => {
        rankLine.textContent = '分數上傳失敗，請檢查網路連線。';
      });
  } else {
    rankLine.textContent = '0 分不會上傳排行榜，再來一場吧！';
  }
}

// ---------- Input ----------
function onPrimary() {
  if (state.mode === 'menu') return;
  if (state.mode === 'playing') drop();
}

canvas.addEventListener('pointerdown', (e) => {
  // Fire the drop FIRST (synchronous) so input → action has no overhead;
  // audio unlock runs right after — it doesn't block the game logic.
  e.preventDefault();
  onPrimary();
  audio.ensure();
}, { passive: false });

window.addEventListener('keydown', (e) => {
  const isEnter = e.code === 'Enter';
  const isSpace = e.code === 'Space';
  if (!isEnter && !isSpace) return;

  const onInput = document.activeElement === nameInput;
  // Allow space to be typed into the name field; Enter from the input starts the game.
  if (onInput && isSpace) return;

  e.preventDefault();
  audio.ensure();
  if (state.mode === 'menu') {
    saveName(nameInput.value);
    startGame();
  } else if (state.mode === 'over') {
    startGame();
  } else {
    onPrimary();
  }
});

startBtn.addEventListener('click', () => {
  audio.ensure();
  saveName(nameInput.value);
  startGame();
});

againBtn.addEventListener('click', () => {
  audio.ensure();
  startGame();
});

// ---------- Name persistence ----------
function currentName() {
  let n = (nameInput.value || '').trim();
  if (!n) n = '玩家' + Math.floor(1000 + Math.random() * 9000);
  return n.slice(0, 16);
}

function saveName(n) {
  try { localStorage.setItem('twr.name', (n || '').trim().slice(0, 16)); } catch {}
}

(function loadName() {
  try {
    const n = localStorage.getItem('twr.name');
    if (n) nameInput.value = n;
  } catch {}
})();

// ---------- Leaderboard / WebSocket ----------
let ws = null;
let wsBackoff = 1000;
let pollTimer = null;

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${proto}://${location.host}/ws`;
  try {
    ws = new WebSocket(url);
  } catch {
    scheduleReconnect();
    return;
  }

  ws.addEventListener('open', () => {
    wsBackoff = 1000;
    setConn(true);
    stopPolling();
  });

  ws.addEventListener('message', (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    handleWS(msg);
  });

  ws.addEventListener('close', () => {
    setConn(false);
    scheduleReconnect();
    startPolling();
  });

  ws.addEventListener('error', () => {
    try { ws.close(); } catch {}
  });
}

function scheduleReconnect() {
  setTimeout(connectWS, wsBackoff);
  wsBackoff = Math.min(wsBackoff * 2, 15000);
}

function handleWS(msg) {
  if (msg.type === 'init') {
    setOnline(msg.online);
    renderLeaderboard(msg.entries, currentName());
  } else if (msg.type === 'online') {
    setOnline(msg.online);
  } else if (msg.type === 'leaderboard') {
    renderLeaderboard(msg.entries, currentName());
  } else if (msg.type === 'activity') {
    addActivity(msg);
  }
}

function setOnline(n) {
  onlineCountEl.textContent = String(n);
  onlineBox.classList.remove('off');
}

function setConn(ok) {
  if (ok) {
    connStatus.textContent = '已連線 ✓';
    connStatus.classList.remove('bad');
  } else {
    connStatus.textContent = '連線中斷，重新連接中…';
    connStatus.classList.add('bad');
    onlineBox.classList.add('off');
  }
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(refreshLeaderboard, 12000);
  refreshLeaderboard();
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

async function refreshLeaderboard() {
  try {
    const r = await fetch('/api/leaderboard?limit=10');
    const j = await r.json();
    if (j && j.entries) renderLeaderboard(j.entries, currentName());
    if (typeof j.online === 'number') setOnline(j.online);
  } catch {}
}

async function submitScore(name, score) {
  const r = await fetch('/api/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, score }),
  });
  if (!r.ok) throw new Error('upload failed');
  return r.json();
}

let lastFreshRank = -1;
function renderLeaderboard(entries, myName) {
  leaderboardEl.innerHTML = '';
  if (!entries || entries.length === 0) {
    const li = document.createElement('li');
    li.className = 'lb-empty';
    li.textContent = '還沒有人上榜，當第一個吧！';
    leaderboardEl.appendChild(li);
    return;
  }
  for (const e of entries) {
    const li = document.createElement('li');
    li.className = 'lb-row';
    li.dataset.rank = e.rank;
    if (myName && e.name === myName) li.classList.add('you');

    const r = document.createElement('span'); r.className = 'lb-rank'; r.textContent = e.rank;
    const n = document.createElement('span'); n.className = 'lb-name'; n.textContent = e.name;
    const s = document.createElement('span'); s.className = 'lb-score'; s.textContent = e.score;

    if (e.rank === lastFreshRank) li.classList.add('fresh');
    li.appendChild(r); li.appendChild(n); li.appendChild(s);
    leaderboardEl.appendChild(li);
  }
  lastFreshRank = -1;
}

function addActivity(msg) {
  // remove placeholder
  const empty = activityEl.querySelector('.act-empty');
  if (empty) empty.remove();

  const li = document.createElement('li');
  li.className = 'act-row';
  const icon = msg.rank <= 3 ? '🏆' : (msg.rank <= 10 ? '🎉' : '🏗️');
  const ic = document.createElement('span'); ic.textContent = icon;
  const nm = document.createElement('span'); nm.className = 'act-name'; nm.textContent = msg.name;
  const tx = document.createElement('span'); tx.textContent = `疊到`;
  const sc = document.createElement('span'); sc.className = 'act-score'; sc.textContent = `${msg.score} 層`;

  li.appendChild(ic); li.appendChild(nm); li.appendChild(tx); li.appendChild(sc);
  activityEl.prepend(li);

  // mark this rank for next leaderboard render to flash
  if (msg.rank <= 10) lastFreshRank = msg.rank;

  while (activityEl.children.length > 8) activityEl.lastChild.remove();
}

// ---------- Bootstrap ----------
connectWS();
refreshLeaderboard();           // initial load even before WS connects
requestAnimationFrame((t) => { lastT = t; tick(t); });
nameInput.addEventListener('input', () => saveName(nameInput.value));
nameInput.focus();
