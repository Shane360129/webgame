/**
 * 對戰畫面：HUD、手牌拖曳部署、鏡頭操作、事件特效。
 *
 * 部署流程刻意做成可取消（拖回手牌區放開就取消），
 * 並在拖曳過程即時用**與伺服器相同的判定函式**顯示可否落地。
 */
import { ArenaScene, CAMERA_MODES } from '../render/scene.js';
import { cardPortrait } from '../render/portraits.js';
import { checkDeploy, deployBoundsFor, DEPLOY_REASONS } from '/shared/deploy.js';
import { state } from '../state.js';

const $ = (id) => document.getElementById(id);
const fmtTime = (s) => {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

export class BattleUI {
  constructor({ onLeave }) {
    this.scene = new ArenaScene($('arena'), { quality: state.prefs.quality });
    this.onLeave = onLeave;
    this.driver = null;
    this.snapshot = null;
    this.you = 0;
    this.handEls = [];
    this.selected = null;
    this.drag = null;
    this.lastFrame = performance.now();
    this.eventCursor = 0;
    this.running = false;

    this.bindControls();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  setCatalogue(cat) { this.scene.setCatalogue(cat); }
  setMode(mode) { this.scene.setMode(mode); }
  setQuality(q) { this.scene.setQuality(q); }

  // ── 啟動 / 結束 ──

  start(driver, { you = 0, opponent, isBot, mode }) {
    this.driver = driver;
    this.you = you;
    this.mode = mode;
    this.scene.clearEntities();
    this.scene.setViewSide(you);
    this.snapshot = null;
    this.running = true;
    this.eventCursor = 0;
    this.result = null;

    $('enemy-name').textContent = opponent?.name || '對手';
    $('enemy-ai').hidden = !isBot;
    $('enemy-disconnected').hidden = true;
    $('result-overlay').hidden = true;
    $('queue-overlay').hidden = true;
    $('battle-banner').hidden = true;

    driver.on('snapshot', ({ s }) => this.applySnapshot(s));
    driver.on('events', ({ events }) => this.applyEvents(events));
    driver.on('matchEnd', ({ result }) => this.showResult(result));
    driver.on('matchReward', (msg) => this.showResult(msg.result, msg));
    driver.on('opponentConnection', (msg) => {
      if (msg.side !== this.you) $('enemy-disconnected').hidden = msg.connected;
    });
    driver.on('inputRejected', (msg) => {
      this.flashBanner(DEPLOY_REASONS[msg.reason] || `無法出牌：${msg.reason}`, 900);
    });
  }

  stop() {
    this.running = false;
    this.driver = null;
    this.scene.clearEntities();
  }

  // ── 快照 ──

  applySnapshot(s) {
    this.snapshot = s;
    const me = s.players[this.you];
    const foe = s.players[1 - this.you];

    $('crown-me').textContent = me.crowns;
    $('crown-you').textContent = foe.crowns;
    $('battle-time').textContent = (s.overtime ? '延長 ' : '') + fmtTime(s.remaining);
    $('battle-phase').textContent = `聖水 x${{ single: 1, double: 2, triple: 3 }[s.phase]}`;
    $('enemy-disconnected').hidden = foe.connected !== false;

    const el = me.elixir;
    $('elixir-fill').style.width = `${(el / 10) * 100}%`;
    $('elixir-count').textContent = Math.floor(el);

    this.renderTowerBars(s);
    this.renderHand(s, me);
    this.renderChampion(s, me);
  }

  renderTowerBars(s) {
    const wrap = $('tower-bars');
    if (!wrap.dataset.built) {
      wrap.innerHTML = '<div class="tbar-row you"></div><div class="tbar-row me"></div>';
      wrap.dataset.built = '1';
    }
    const order = ['left', 'king', 'right'];
    for (const who of ['you', 'me']) {
      const side = who === 'me' ? this.you : 1 - this.you;
      const row = wrap.querySelector(`.tbar-row.${who}`);
      const towers = s.towers.filter((t) => t.s === side);
      const sorted = order.map((k) => (k === 'king'
        ? towers.find((t) => t.k === 'king')
        : towers.find((t) => t.k === 'princess' && t.l === k)));
      row.innerHTML = sorted.map((t) => {
        if (!t) return '<div class="tbar"></div>';
        const pct = t.mx ? Math.max(0, (t.hp / t.mx) * 100) : 0;
        const dead = t.al === 0;
        const label = t.k === 'king' ? '王塔' : (t.l === 'left' ? '左塔' : '右塔');
        const off = t.k === 'king' && t.a === 0 && !dead ? '<div class="kingoff">未啟動</div>' : '';
        return `<div class="tbar ${who} ${dead ? 'dead' : ''}">
          <div class="lab">${label} ${dead ? '已摧毀' : t.hp}</div>
          <div class="track"><div class="fill" style="width:${pct}%"></div></div>${off}
        </div>`;
      }).join('');
    }
  }

  renderHand(s, me) {
    const hand = s.hands?.[this.you];
    if (!hand) return;
    const wrap = $('hand');
    const sig = hand.hand.map((h) => `${h.card}${h.evolved ? 'E' : ''}`).join(',');
    if (wrap.dataset.sig !== sig) {
      wrap.dataset.sig = sig;
      wrap.innerHTML = '';
      this.handEls = hand.hand.map((h, i) => {
        const card = state.catalogue.cards[h.card];
        const el = document.createElement('div');
        el.className = `card rarity-${card.rarity}`;
        el.dataset.index = i;
        el.innerHTML = `
          <img src="${cardPortrait(card, { evolved: h.evolved })}" alt="">
          <div class="cost">${card.elixir}</div>
          ${h.evolved ? '<div class="evo-mark">進</div>' : ''}
          <div class="cname">${card.nameZh || card.name}</div>`;
        this.attachDrag(el, i, card, h.evolved);
        wrap.appendChild(el);
        return el;
      });
    }
    hand.hand.forEach((h, i) => {
      const card = state.catalogue.cards[h.card];
      const el = this.handEls[i];
      if (!el) return;
      el.classList.toggle('unaffordable', me.elixir < card.elixir);
      el.classList.toggle('selected', this.selected?.index === i);
    });

    const next = hand.next ? state.catalogue.cards[hand.next] : null;
    const nc = $('next-card');
    if (next && nc.dataset.card !== next.key) {
      nc.dataset.card = next.key;
      nc.innerHTML = `<span class="label">下一張</span>
        <div class="card rarity-${next.rarity}">
          <img src="${cardPortrait(next)}" alt=""><div class="cost">${next.elixir}</div>
          <div class="cname">${next.nameZh || next.name}</div>
        </div>`;
    }
  }

  renderChampion(s, me) {
    const btn = $('btn-champion');
    const ab = $('btn-ability');
    if (!me.champion) { btn.hidden = true; ab.hidden = true; return; }
    const card = state.catalogue.cards[me.champion];
    if (!me.championOnField) {
      btn.hidden = false;
      ab.hidden = true;
      if (btn.dataset.card !== card.key) {
        btn.dataset.card = card.key;
        btn.innerHTML = `<img src="${cardPortrait(card)}" alt="">${card.nameZh}<br>${card.elixir} 聖水`;
        this.attachDrag(btn, -1, card, false);
      }
      btn.disabled = me.elixir < card.elixir || me.championCooldown > 0;
      btn.classList.toggle('ready', !btn.disabled);
    } else {
      btn.hidden = true;
      ab.hidden = false;
      const a = card.ability;
      ab.textContent = `${a.nameZh}\n${a.elixir} 聖水`;
      ab.disabled = me.elixir < a.elixir;
      ab.classList.toggle('ready', !ab.disabled);
    }
  }

  // ── 事件 ──

  applyEvents(events) {
    for (const ev of events) {
      this.scene.spawnEffect(ev);
      if (ev.type === 'overtime') this.flashBanner('延長賽開始 · 先摧毀一座塔者獲勝', 2200);
      if (ev.type === 'towerDown') {
        const mine = ev.side === this.you;
        this.flashBanner(mine ? '我方塔被摧毀' : '摧毀對方塔！', 1500);
      }
      if (ev.type === 'kingActivated') {
        const mine = ev.side === this.you;
        this.flashBanner(mine ? '我方王塔已啟動' : '對方王塔已啟動', 1300);
      }
    }
  }

  flashBanner(text, ms = 1500) {
    const b = $('battle-banner');
    b.textContent = text;
    b.hidden = false;
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => { b.hidden = true; }, ms);
  }

  showResult(result, reward) {
    if (!result || this.result) return;
    this.result = result;
    const won = result.winner === this.you;
    const drew = result.winner == null;
    $('result-title').textContent = drew ? '平手' : won ? '勝利' : '落敗';
    $('result-title').style.color = drew ? '#f0c05a' : won ? '#4fd08a' : '#ff5a4a';
    $('result-reason').textContent = reasonText(result.reason);
    const stats = [
      `皇冠　${result.crowns[this.you]} － ${result.crowns[1 - this.you]}`,
      `時間　${fmtTime(result.time)}${result.overtime ? '（含延長賽）' : ''}`,
    ];
    if (reward) {
      stats.push(`獎盃　${reward.delta >= 0 ? '+' : ''}${reward.delta} → ${reward.trophies}`);
      stats.push(`金幣　+${reward.gold}`);
    } else {
      stats.push('練習模式：不計獎盃');
    }
    $('result-stats').innerHTML = stats.map((s) => `<div>${s}</div>`).join('');
    $('result-overlay').hidden = false;
  }

  // ── 拖曳部署 ──

  attachDrag(el, index, card, evolved) {
    el.addEventListener('pointerdown', (e) => {
      if (el.disabled) return;
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      this.selected = { index, card, evolved, el };
      this.drag = { pointerId: e.pointerId, moved: false, fromCard: true };
      this.makeGhost(card, evolved, e.clientX, e.clientY);
      this.updateDragTarget(e.clientX, e.clientY);
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.drag || this.drag.pointerId !== e.pointerId) return;
      this.drag.moved = true;
      this.moveGhost(e.clientX, e.clientY);
      this.updateDragTarget(e.clientX, e.clientY);
    });
    el.addEventListener('pointerup', (e) => {
      if (!this.drag || this.drag.pointerId !== e.pointerId) return;
      this.finishDrag(e.clientX, e.clientY);
    });
    el.addEventListener('pointercancel', () => this.cancelDrag());
  }

  makeGhost(card, evolved, x, y) {
    this.removeGhost();
    const g = document.createElement('img');
    g.className = 'drag-ghost';
    g.src = cardPortrait(card, { evolved });
    document.body.appendChild(g);
    this.ghost = g;
    this.moveGhost(x, y);
  }
  moveGhost(x, y) {
    if (this.ghost) { this.ghost.style.left = `${x}px`; this.ghost.style.top = `${y - 54}px`; }
  }
  removeGhost() {
    if (this.ghost) { this.ghost.remove(); this.ghost = null; }
  }

  /** 手牌區上方為「取消區」：放開就取消，不消耗聖水。 */
  isCancelZone(y) {
    const rect = $('hud-bottom-probe')?.getBoundingClientRect()
      || document.querySelector('.hud-bottom').getBoundingClientRect();
    return y > rect.top;
  }

  updateDragTarget(cx, cy) {
    if (!this.selected || !this.snapshot) return;
    const pt = this.scene.pickGround(cx, cy);
    const bounds = this.currentBounds();
    if (!pt || this.isCancelZone(cy)) {
      this.scene.showDeployHint(bounds, 0, null, null, false);
      this.pendingPoint = null;
      return;
    }
    const card = this.selected.card;
    const legal = checkDeploy({
      towers: this.snapshotTowers(), side: this.you, card, x: pt.x, z: pt.z,
    });
    const me = this.snapshot.players[this.you];
    const affordable = me.elixir >= card.elixir;
    const ok = legal.ok && affordable;
    this.scene.showDeployHint(bounds, card.kind === 'spell' ? (card.spell.radius || 2.5) : 0, pt.x, pt.z, ok);
    this.pendingPoint = ok ? pt : null;
    this.pendingReason = !affordable ? 'not_enough_elixir' : legal.reason;
  }

  currentBounds() {
    if (!this.snapshot) return null;
    const lanes = deployBoundsFor({ towers: this.snapshotTowers(), side: this.you });
    const lo = Math.min(lanes.left[0], lanes.right[0]);
    const hi = Math.max(lanes.left[1], lanes.right[1]);
    return [lo, hi];
  }

  snapshotTowers() {
    return (this.snapshot?.towers || []).map((t) => ({
      side: t.s, kind: t.k, lane: t.l, x: t.x, z: t.z,
      radius: t.k === 'king' ? 2.0 : 1.5, alive: t.al === 1,
    }));
  }

  finishDrag(cx, cy) {
    const sel = this.selected;
    this.removeGhost();
    this.drag = null;
    this.scene.showDeployHint(null);

    if (!sel) return;
    if (this.isCancelZone(cy)) { this.selected = null; return; }
    const pt = this.pendingPoint;
    if (!pt) {
      if (this.pendingReason) this.flashBanner(DEPLOY_REASONS[this.pendingReason] || '無法放置', 900);
      this.selected = null;
      return;
    }
    if (sel.index === -1) this.driver.champion(pt.x, pt.z);
    else this.driver.play(sel.index, pt.x, pt.z);
    this.selected = null;
    this.pendingPoint = null;
  }

  cancelDrag() {
    this.removeGhost();
    this.drag = null;
    this.selected = null;
    this.scene.showDeployHint(null);
  }

  // ── 控制 ──

  bindControls() {
    const canvas = $('arena');

    // 旋轉／縮放（僅在可旋轉視角）
    let orbitDrag = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (this.selected) return;
      if (this.scene.mode !== 'orbit') return;
      orbitDrag = { x: e.clientX, y: e.clientY, id: e.pointerId };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.drag) { this.moveGhost(e.clientX, e.clientY); this.updateDragTarget(e.clientX, e.clientY); return; }
      if (!orbitDrag || orbitDrag.id !== e.pointerId) return;
      const dx = e.clientX - orbitDrag.x;
      const dy = e.clientY - orbitDrag.y;
      orbitDrag.x = e.clientX; orbitDrag.y = e.clientY;
      this.scene.orbit.yaw -= dx * 0.006;
      this.scene.orbit.pitch = Math.max(0.18, Math.min(1.45, this.scene.orbit.pitch + dy * 0.005));
    });
    canvas.addEventListener('pointerup', (e) => {
      if (this.drag) { this.finishDrag(e.clientX, e.clientY); return; }
      orbitDrag = null;
    });
    canvas.addEventListener('wheel', (e) => {
      if (this.scene.mode !== 'orbit') return;
      e.preventDefault();
      this.scene.orbit.dist = Math.max(12, Math.min(80, this.scene.orbit.dist + e.deltaY * 0.05));
    }, { passive: false });

    // 手牌選取後點場地也能放（手機單手操作）
    canvas.addEventListener('click', (e) => {
      if (!this.selected || this.drag) return;
      this.updateDragTarget(e.clientX, e.clientY);
      this.finishDrag(e.clientX, e.clientY);
    });

    $('btn-ability').addEventListener('click', () => this.driver?.ability());
    $('btn-leave').addEventListener('click', () => {
      if (this.result || confirm('離開會直接判負，確定嗎？')) {
        this.driver?.resign();
        this.stop();
        this.onLeave();
      }
    });
    $('result-close').addEventListener('click', () => { this.stop(); this.onLeave(); });
  }

  // ── 迴圈 ──

  loop() {
    requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (!this.running) return;

    if (this.driver?.advance) this.driver.advance(dt);

    if (this.snapshot) {
      this.scene.syncTowers(this.snapshot.towers);
      this.scene.syncUnits(this.snapshot.units, dt);
      this.scene.syncProjectiles(this.snapshot.projectiles);
      this.scene.syncAreas(this.snapshot.areas);
    }
    this.scene.render(dt, this.focusPoint());

    const perf = $('perf');
    const lat = this.driver?.latency != null ? ` · ${this.driver.latency}ms` : '';
    perf.textContent = `${this.scene.fps} FPS · ${CAMERA_MODES[this.scene.mode].nameZh}${lat}`;
  }

  /** 觀戰鏡頭的追焦點：場上單位的重心，偏向戰鬥密集處。 */
  focusPoint() {
    if (this.scene.mode !== 'spectator' || !this.snapshot) return null;
    const us = this.snapshot.units.filter((u) => u.al === 1);
    if (!us.length) return { x: 0, z: this.you === 0 ? -4 : 4 };
    let sx = 0; let sz = 0;
    for (const u of us) { sx += u.x; sz += u.z; }
    const [wx, wz] = this.scene.toWorld(sx / us.length, sz / us.length);
    const flip = this.you === 1 ? -1 : 1;
    return { x: wx * flip, z: wz * flip };
  }
}

function reasonText(r) {
  return {
    king_tower: '王塔被摧毀',
    sudden_death: '延長賽中先摧毀一座塔',
    regulation_crowns: '正規賽結束時皇冠數較多',
    tiebreaker: '延長賽結束 · 依最低塔血量百分比判定',
    draw: '雙方最低塔血量百分比相同',
    resign: '玩家投降',
    disconnect: '玩家斷線逾時',
  }[r] || r || '';
}
