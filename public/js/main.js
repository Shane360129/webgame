/** 應用進入點：載入資料、畫面路由、連線與對戰啟動。 */
import { state, loadAll, savePrefs, setName, refreshProfile } from './state.js';
import { Net } from './net.js';
import { LocalBattle } from './local.js';
import { BattleUI } from './ui/battle.js';
import { initCardSheet } from './ui/cards.js';
import {
  renderHome, renderDeck, renderChests, renderAudit,
  initDeckScreen, refreshLeaderboard, awardChest,
} from './ui/menus.js';

const $ = (id) => document.getElementById(id);
let battleUI = null;
let net = null;
let current = 'home';

function show(screen) {
  current = screen;
  for (const el of document.querySelectorAll('.screen')) {
    el.hidden = el.dataset.screen !== screen;
  }
  document.getElementById('bottom-nav').hidden = screen === 'battle';
  for (const b of document.querySelectorAll('.bottom-nav button')) {
    b.classList.toggle('active', b.dataset.goto === screen);
  }
  if (screen === 'home') { renderHome(); refreshLeaderboard(); }
  if (screen === 'deck') renderDeck();
  if (screen === 'chests') renderChests();
  if (screen === 'audit') renderAudit();
  if (screen === 'battle') battleUI.scene.resize();
}

async function boot() {
  try {
    await loadAll();
  } catch (e) {
    document.body.innerHTML = `<div style="padding:24px;font:14px system-ui;color:#e8eefc">
      無法載入資料：${e.message}<br><br>請確認伺服器已啟動（npm start）。</div>`;
    return;
  }

  initCardSheet();
  initDeckScreen();

  battleUI = new BattleUI({ onLeave: () => { show('home'); refreshProfile().then(renderHome); } });
  battleUI.setCatalogue(state.catalogue);
  battleUI.setMode(state.prefs.camera);
  battleUI.setQuality(state.prefs.quality);

  net = new Net({ id: state.id, name: state.name });
  net.on('profile', ({ profile }) => { state.profile = profile; if (current === 'home') renderHome(); });
  net.on('lobby', (m) => { $('online-meta').textContent = `線上 ${m.online} 人 · 排隊 ${m.queued}`; });
  net.on('queued', () => { $('queue-title').textContent = '配對中…'; });
  net.on('matchStart', (m) => {
    if (m.you == null) return;
    $('queue-overlay').hidden = true;
    show('battle');
    battleUI.start(makeNetDriver(net), {
      you: m.you, opponent: m.opponent, isBot: !!m.opponent?.isBot, mode: m.mode,
    });
    if (m.snapshot) battleUI.applySnapshot(m.snapshot);
  });
  net.on('matchResume', (m) => {
    show('battle');
    battleUI.start(makeNetDriver(net), {
      you: m.you, opponent: m.opponent, isBot: !!m.opponent?.isBot, mode: m.mode,
    });
    if (m.snapshot) battleUI.applySnapshot(m.snapshot);
    battleUI.flashBanner('已重新連線', 1400);
  });
  net.on('matchReward', () => { awardChest(); refreshProfile().then(() => { if (current === 'home') renderHome(); }); });
  net.on('close', () => { $('online-meta').textContent = '連線中斷，重新連線中…'; });

  // 名稱
  $('player-name').addEventListener('change', (e) => {
    const v = e.target.value.trim().slice(0, 16) || `玩家${Math.floor(Math.random() * 9000 + 1000)}`;
    setName(v);
    e.target.value = v;
    net.send({ type: 'hello', id: state.id, name: v });
  });

  // 設定
  $('camera-mode').addEventListener('change', (e) => {
    savePrefs({ camera: e.target.value });
    battleUI.setMode(e.target.value);
  });
  $('quality').addEventListener('change', (e) => {
    savePrefs({ quality: e.target.value });
    battleUI.setQuality(e.target.value);
  });
  $('ai-difficulty').addEventListener('change', (e) => savePrefs({ difficulty: e.target.value }));

  // 模式
  $('btn-online').addEventListener('click', () => {
    $('queue-overlay').hidden = false;
    $('queue-title').textContent = '配對中…';
    show('battle');
    net.queue({ allowBot: true, difficulty: state.prefs.difficulty });
  });
  $('queue-cancel').addEventListener('click', () => {
    net.cancelQueue();
    $('queue-overlay').hidden = true;
    show('home');
  });
  $('btn-practice').addEventListener('click', () => startPractice());

  // 導覽
  document.getElementById('bottom-nav').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-goto]');
    if (b) show(b.dataset.goto);
  });
  document.body.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-goto]');
    if (a) { e.preventDefault(); show(a.dataset.goto); }
  });

  show('home');
}

function makeNetDriver(n) {
  return {
    on: (t, fn) => n.on(t, fn),
    play: (i, x, z) => n.play(i, x, z),
    champion: (x, z) => n.champion(x, z),
    ability: () => n.ability(),
    resign: () => n.resign(),
    get latency() { return n.latency; },
  };
}

const PRACTICE_DECKS = [
  ['giant', 'musketeer', 'valkyrie', 'baby_dragon', 'zap', 'arrows', 'cannon', 'skeletons'],
  ['hog_rider', 'ice_spirit', 'skeletons', 'musketeer', 'cannon', 'fireball', 'the_log', 'valkyrie'],
  ['golem', 'night_witch', 'baby_dragon', 'mega_knight', 'zap', 'tornado', 'lumberjack', 'barbarians'],
  ['x_bow', 'tesla', 'archers', 'knight', 'skeletons', 'the_log', 'fireball', 'ice_spirit'],
];

function startPractice() {
  const botDeck = PRACTICE_DECKS[Math.floor(Math.random() * PRACTICE_DECKS.length)];
  const local = new LocalBattle({
    profile: state.profile,
    difficulty: state.prefs.difficulty,
    botDeck,
  });
  show('battle');
  battleUI.start(local, {
    you: 0,
    opponent: { name: '電腦對手（AI）', isBot: true },
    isBot: true,
    mode: 'practice',
  });
}

boot();
