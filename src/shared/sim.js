/**
 * 對戰模擬器（伺服器與瀏覽器共用）。
 *
 * 設計原則
 * ─────────────────────────────────────────────────────────
 * 1. 純函式式狀態機：固定 20 Hz tick，同 seed 同輸入 → 同結果。
 *    因此伺服器可作為權威端，客戶端也能用同一份程式跑 AI 練習。
 * 2. 沒有任何 DOM / Node 相依，可直接被兩邊 import。
 * 3. 針對查核文件第 5 節列出的每一項缺陷，都有對應實作：
 *      王塔啟動條件、法術投放型態、碰撞推擠、換目標、建築吸引、
 *      空地差異、過河與跳河、延長賽與 Tiebreaker。
 */

import {
  TICK_SECONDS, TIMING, ELIXIR, ARENA, TOWER_LAYOUT, TOWER_STATS,
  KING_ACTIVATION, DECK, DEPLOY, VICTORY, phaseAt, elixirPerSecond,
} from './rules.js';
import { ALL_CARDS, TOWER_TROOPS } from './catalogue.js';
import { checkDeploy, deployBoundsFor, laneOfTower } from './deploy.js';

// ───────────────────────── 工具 ─────────────────────────

/** xorshift32：跨平台一致的可重現亂數。 */
export function makeRng(seed = 1) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
}

const dist2 = (ax, az, bx, bz) => (ax - bx) ** 2 + (az - bz) ** 2;
const dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** side 0 往 +z 前進，side 1 往 -z。 */
const forward = (side) => (side === 0 ? 1 : -1);

/** 河道判定 */
function inRiver(z) {
  return z > ARENA.riverZ[0] && z < ARENA.riverZ[1];
}
function onBridge(x) {
  return ARENA.bridges.some((b) => Math.abs(x - b.x) <= b.halfWidth);
}
function nearestBridge(x) {
  let best = ARENA.bridges[0];
  let bd = Infinity;
  for (const b of ARENA.bridges) {
    const d = Math.abs(x - b.x);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

// ───────────────────────── 實體 ─────────────────────────

/**
 * 實體 id 由每場對戰各自配發（不是全域計數器），
 * 這樣同 seed 的兩場模擬會產生逐欄位相同的快照，
 * 伺服器與客戶端才能真正對得起來。
 */
let ENTITY_SEQ = 0;
const fallbackId = () => ++ENTITY_SEQ;

function makeTower({ side, kind, lane, x, z, towerTroopKey, nextId = fallbackId }) {
  const base = kind === 'king' ? TOWER_STATS.king : TOWER_STATS.princess;
  const troop = kind === 'princess' ? (TOWER_TROOPS[towerTroopKey] || TOWER_TROOPS.tower_princess) : null;
  const st = troop ? { ...base, ...troop.stats } : base;

  return {
    id: nextId(),
    entity: 'tower',
    kind,
    lane: lane || null,
    side,
    x, z,
    hp: st.hp,
    maxHp: st.hp,
    radius: kind === 'king' ? TOWER_LAYOUT.radius.king : TOWER_LAYOUT.radius.princess,
    damage: st.damage,
    hitSpeed: st.hitSpeed,
    range: st.range,
    targetsAir: st.targetsAir !== false,
    projectileSpeed: st.projectileSpeed || 12,
    splashRadius: st.splashRadius || 0,
    /** 王塔啟動條件：見 rules.KING_ACTIVATION */
    active: kind !== 'king',
    cooldown: 0,
    targetId: null,
    towerTroopKey: troop ? troop.key : null,
    ammo: st.ammo ? { left: st.ammo.capacity, capacity: st.ammo.capacity, reload: 0, reloadSeconds: st.ammo.reloadSeconds } : null,
    buffFriendly: st.buffFriendly || null,
    buffTimer: st.buffFriendly ? st.buffFriendly.intervalSeconds : 0,
    alive: true,
  };
}

/**
 * 由卡片建立單位。
 * @param {object} card 目錄項目
 * @param {object} opts
 */
export function makeUnit(card, { side, x, z, evolved = false, championSlot = false, rng, nextId = fallbackId }) {
  const u = card.unit || {};
  const evo = evolved ? card.evolution : null;
  const ov = evo?.override || {};

  const unit = {
    id: nextId(),
    entity: 'unit',
    card: card.key,
    side,
    x, z,
    evolved,
    isChampion: !!card.isChampion,
    championSlot,
    isBuilding: !!u.isBuilding,

    hp: ov.hp ?? u.hp,
    maxHp: ov.hp ?? u.hp,
    shieldHp: u.shield?.hp || 0,

    damage: ov.damage ?? u.damage ?? 0,
    hitSpeed: ov.hitSpeed ?? u.hitSpeed ?? 1,
    range: ov.range ?? u.range ?? 1,
    sight: u.sight ?? 5.5,
    baseSpeed: ov.speed ?? u.speed ?? 0,
    radius: u.radius ?? 0.5,
    mass: u.mass ?? 1,

    flying: !!u.flying,
    targetsAir: u.targetsAir !== false,
    targetOnly: u.targetOnly || null,
    splashRadius: u.splashRadius || 0,
    meleeSplash: !!u.meleeSplash,
    projectileSpeed: u.projectileSpeed || 0,
    arcing: !!u.arcing,
    minRange: u.minRange || 0,
    noAttack: !!u.noAttack,
    noCollision: !!u.noCollision,
    jumpsRiver: !!u.jumpsRiver,
    multiShot: u.multiShot || 1,

    deployTimer: u.deployTime ?? DEPLOY.defaultDeploySeconds,
    lifetime: u.lifetime ?? null,

    cooldown: 0,
    targetId: null,
    /** 攻擊蓄力（電磁炮）／傷害爬升（地獄塔、地獄飛龍） */
    chargeUpSeconds: u.chargeUpSeconds || 0,
    chargeUp: u.chargeUpSeconds || 0,
    rampUp: u.rampUp ? { ...u.rampUp, elapsed: 0 } : null,
    rampUpDamage: u.rampUpDamage ? { ...u.rampUpDamage, stacks: 0 } : null,

    /** 衝鋒（王子、戰車槌、雪橇騎士） */
    charge: u.charge ? { ...u.charge, travelled: 0, ready: false } : null,

    spawner: u.spawner ? { ...u.spawner, timer: u.spawner.initialDelay ?? u.spawner.intervalSeconds } : null,
    elixirPump: u.elixirPump ? { ...u.elixirPump, timer: u.elixirPump.intervalSeconds } : null,

    onDeathDamage: u.onDeathDamage || null,
    onDeathSpawn: u.onDeathSpawn || null,
    onDeathSpell: u.onDeathSpell || null,
    onDeathElixir: u.onDeathElixir || 0,
    onHitEffect: u.onHitEffect || null,
    kamikaze: u.kamikaze || null,
    jumpAttack: u.jumpAttack ? { ...u.jumpAttack, cd: 0 } : null,
    sideAttack: u.sideAttack ? { ...u.sideAttack, cd: 0 } : null,
    soulHarvest: u.soulHarvest ? { ...u.soulHarvest, souls: 0 } : null,
    sparks: u.sparks || 0,
    hidesWhenIdle: !!u.hidesWhenIdle,
    invisibleWhenIdle: !!u.invisibleWhenIdle,
    stunnable: !!u.stunnable,
    deployAnywhere: !!u.deployAnywhere,

    /** 狀態效果計時（秒） */
    fx: { stun: 0, freeze: 0, slow: 0, slowFactor: 1, rage: 0, snare: 0, cloak: 0, cloakHitSpeed: 1 },

    /** 進化能力 */
    evoAbility: evo?.ability || null,
    evoParams: evo?.params || null,
    evoState: {},

    /** 冠軍技能 */
    ability: card.ability ? { ...card.ability, cd: 0, active: 0, used: 0 } : null,

    facing: forward(side) > 0 ? 0 : Math.PI,
    animation: 'spawn',
    alive: true,
    lastHitBy: null,
    hitFlash: 0,
  };

  if (evo && evo.ability === 'spawn_rage') {
    unit.fx.rage = 8;
  }
  if (rng) {
    unit.x += (rng() - 0.5) * 0.001;
  }
  return unit;
}

// ───────────────────────── 玩家 ─────────────────────────

function makePlayer(cfg, side, rng) {
  const deck = cfg.deck.slice(0, DECK.slots);
  const queue = deck.slice();
  // 開場洗牌，之後為固定循環（非重抽）。
  for (let i = queue.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }

  const evos = (cfg.evos || []).filter((k) => deck.includes(k) && ALL_CARDS[k]?.evolution).slice(0, DECK.evoSlots);
  const evoCharge = {};
  for (const k of evos) evoCharge[k] = 0;

  return {
    side,
    name: cfg.name || (side === 0 ? '玩家' : '對手'),
    isBot: !!cfg.isBot,
    deck,
    queue,
    evos,
    evoCharge,
    champion: cfg.champion && ALL_CARDS[cfg.champion]?.isChampion ? cfg.champion : null,
    championOnField: null,
    championCooldown: 0,
    towerTroop: cfg.towerTroop && TOWER_TROOPS[cfg.towerTroop] ? cfg.towerTroop : 'tower_princess',
    elixir: ELIXIR.startingElixir,
    elixirSpent: 0,
    crowns: 0,
    connected: true,
  };
}

// ───────────────────────── Battle ─────────────────────────

export class Battle {
  /**
   * @param {object} opts
   * @param {number} opts.seed
   * @param {[object, object]} opts.players 兩位玩家設定
   * @param {string} opts.mode 'ladder' | 'friendly' | 'practice'
   */
  constructor({ seed = 1, players, mode = 'ladder' }) {
    this.seed = seed;
    this.rng = makeRng(seed);
    this.seq = 0;
    this.nextId = () => (this.seq += 1);
    this.mode = mode;
    this.tick = 0;
    this.time = 0;
    this.overtime = false;
    this.overtimeTime = 0;
    this.finished = false;
    this.result = null;
    this.events = [];

    this.players = [makePlayer(players[0], 0, this.rng), makePlayer(players[1], 1, this.rng)];

    this.towers = [];
    for (const side of [0, 1]) {
      const tt = this.players[side].towerTroop;
      for (const p of TOWER_LAYOUT.princess) {
        const z = side === 0 ? p.z : ARENA.length - p.z;
        const x = side === 0 ? p.x : ARENA.width - p.x;
        this.towers.push(makeTower({ side, kind: 'princess', lane: p.lane, x, z, towerTroopKey: tt, nextId: this.nextId }));
      }
      const kz = side === 0 ? TOWER_LAYOUT.king.z : ARENA.length - TOWER_LAYOUT.king.z;
      this.towers.push(makeTower({ side, kind: 'king', x: TOWER_LAYOUT.king.x, z: kz, nextId: this.nextId }));
    }

    this.units = [];
    this.projectiles = [];
    this.areas = [];
    this.pending = [];   // 尚在飛行的法術
    this.nextEventId = 1;
  }

  // ── 查詢 ──

  get phase() {
    return phaseAt(this.time, this.overtime);
  }

  get remainingSeconds() {
    if (this.overtime) return Math.max(0, TIMING.overtimeSeconds - this.overtimeTime);
    return Math.max(0, TIMING.regulationSeconds - this.time);
  }

  towersOf(side) { return this.towers.filter((t) => t.side === side && t.alive); }
  kingOf(side) { return this.towers.find((t) => t.side === side && t.kind === 'king'); }

  hand(side) {
    const p = this.players[side];
    return p.queue.slice(0, DECK.handSize);
  }
  nextCard(side) {
    return this.players[side].queue[DECK.handSize] ?? null;
  }
  isEvolvedNext(side, cardKey) {
    const p = this.players[side];
    if (!p.evos.includes(cardKey)) return false;
    const req = ALL_CARDS[cardKey].evolution.cyclesRequired ?? 2;
    return (p.evoCharge[cardKey] || 0) >= req;
  }

  emit(type, data) {
    this.events.push({ id: this.nextEventId++, type, t: this.time, ...data });
  }

  // ── 部署合法性 ──

  /**
   * 檢查部署位置是否合法。
   * 回傳 { ok, reason }
   */
  canDeployAt(side, cardKey, x, z) {
    const card = ALL_CARDS[cardKey];
    return checkDeploy({ towers: this.towers, side, card, x, z });
  }

  laneOfTower(t) {
    return laneOfTower(t);
  }

  /** 目前可部署區域（給 UI 畫遮罩用）。 */
  deployBounds(side) {
    return deployBoundsFor({ towers: this.towers, side });
  }
}

// ───────────────────── 出牌 ─────────────────────

/**
 * 嘗試出牌。回傳 { ok, reason }。
 * 伺服器與客戶端走同一條路徑，因此客戶端預測與伺服器判定一致。
 */
Battle.prototype.playCard = function playCard(side, handIndex, x, z) {
  if (this.finished) return { ok: false, reason: 'finished' };
  const p = this.players[side];
  const cardKey = p.queue[handIndex];
  if (handIndex < 0 || handIndex >= DECK.handSize || !cardKey) {
    return { ok: false, reason: 'bad_index' };
  }
  const card = ALL_CARDS[cardKey];
  if (p.elixir < card.elixir) return { ok: false, reason: 'not_enough_elixir' };

  const legal = this.canDeployAt(side, cardKey, x, z);
  if (!legal.ok) return legal;

  p.elixir -= card.elixir;
  p.elixirSpent += card.elixir;

  const evolved = this.isEvolvedNext(side, cardKey);
  if (p.evos.includes(cardKey)) {
    p.evoCharge[cardKey] = evolved ? 0 : (p.evoCharge[cardKey] || 0) + 1;
  }

  // 循環：打出的卡回到隊列尾端（固定循環，不是重抽）。
  p.queue.splice(handIndex, 1);
  p.queue.push(cardKey);

  this.spawnCard(cardKey, side, x, z, { evolved });
  this.emit('play', { side, card: cardKey, x, z, evolved, elixir: p.elixir });
  return { ok: true, evolved };
};

/** 冠軍（Hero 槽）單獨部署，不佔手牌。 */
Battle.prototype.playChampion = function playChampion(side, x, z) {
  if (this.finished) return { ok: false, reason: 'finished' };
  const p = this.players[side];
  if (!p.champion) return { ok: false, reason: 'no_champion' };
  if (p.championOnField) return { ok: false, reason: 'already_on_field' };
  if (p.championCooldown > 0) return { ok: false, reason: 'cooldown' };
  const card = ALL_CARDS[p.champion];
  if (p.elixir < card.elixir) return { ok: false, reason: 'not_enough_elixir' };
  const legal = this.canDeployAt(side, p.champion, x, z);
  if (!legal.ok) return legal;

  p.elixir -= card.elixir;
  p.elixirSpent += card.elixir;
  const u = this.spawnCard(p.champion, side, x, z, { championSlot: true })[0];
  p.championOnField = u ? u.id : null;
  this.emit('play', { side, card: p.champion, x, z, champion: true, elixir: p.elixir });
  return { ok: true };
};

/** 發動冠軍技能。 */
Battle.prototype.useAbility = function useAbility(side) {
  const p = this.players[side];
  if (!p.championOnField) return { ok: false, reason: 'no_champion_on_field' };
  const u = this.units.find((e) => e.id === p.championOnField && e.alive);
  if (!u || !u.ability) return { ok: false, reason: 'no_ability' };
  if (u.ability.cd > 0) return { ok: false, reason: 'cooldown' };
  if (u.ability.oneShot && u.ability.used) return { ok: false, reason: 'used' };
  if (p.elixir < (u.ability.elixir || 0)) return { ok: false, reason: 'not_enough_elixir' };

  p.elixir -= u.ability.elixir || 0;
  u.ability.cd = u.ability.cooldownSeconds || 10;
  u.ability.used += 1;
  this.applyAbility(u);
  this.emit('ability', { side, card: u.card, key: u.ability.key, x: u.x, z: u.z });
  return { ok: true };
};

Battle.prototype.applyAbility = function applyAbility(u) {
  const e = u.ability.effect || {};
  switch (e.type) {
    case 'cloak':
      u.fx.cloak = u.ability.durationSeconds || 3;
      u.fx.cloakHitSpeed = e.hitSpeedFactor || 1;
      break;
    case 'dashChain':
      u.dash = { hops: e.hops, left: e.hops, range: e.hopRange, damage: e.hopDamage, interval: e.hopIntervalSeconds, timer: 0 };
      break;
    case 'summonSouls': {
      const n = Math.max(1, u.soulHarvest?.souls || 0);
      for (let i = 0; i < n; i += 1) {
        const a = (i / n) * Math.PI * 2;
        this.spawnCard(e.card, u.side, u.x + Math.cos(a) * 1.6, u.z + Math.sin(a) * 1.6, { count: 1, instant: true });
      }
      if (u.soulHarvest) u.soulHarvest.souls = 0;
      break;
    }
    case 'burrow':
      this.areas.push({
        id: this.nextId(), kind: 'bomb', side: u.side, x: u.x, z: u.z,
        radius: e.bombRadius, damage: e.bombDamage, delay: e.bombDelaySeconds,
        duration: e.bombDelaySeconds, elapsed: 0, crownTowerFactor: 1,
      });
      u.burrowing = 1.0;
      break;
    case 'summon':
      this.spawnCard(e.card, u.side, u.x + 1.2, u.z, { count: e.count, instant: true });
      break;
    default: break;
  }
};

/**
 * 依卡片生成單位／法術。
 * 回傳建立出來的單位陣列（法術回傳空陣列）。
 */
Battle.prototype.spawnCard = function spawnCard(cardKey, side, x, z, opts = {}) {
  const card = ALL_CARDS[cardKey];
  if (!card) return [];

  if (card.kind === 'spell') {
    this.castSpell(card, side, x, z);
    return [];
  }

  // 組合卡（哥布林幫）
  if (card.composite) {
    const out = [];
    let idx = 0;
    const total = card.composite.reduce((a, c) => a + c.count, 0);
    for (const part of card.composite) {
      for (let i = 0; i < part.count; i += 1) {
        const [ox, oz] = ringOffset(idx++, total, 0.55);
        out.push(...this.spawnCard(part.card, side, x + ox, z + oz, { count: 1, instant: opts.instant }));
      }
    }
    return out;
  }

  const evolved = !!opts.evolved && !!card.evolution;
  const evoCount = evolved ? card.evolution.override?.count : undefined;
  const count = opts.count ?? evoCount ?? card.count ?? 1;
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const [ox, oz] = count > 1 ? ringOffset(i, count, card.unit?.isBuilding ? 0 : 0.55) : [0, 0];
    const u = makeUnit(card, {
      side,
      x: clamp(x + ox, 0.3, ARENA.width - 0.3),
      z: clamp(z + oz, 0.3, ARENA.length - 0.3),
      evolved,
      championSlot: !!opts.championSlot,
      rng: this.rng,
      nextId: this.nextId,
    });
    if (opts.instant) u.deployTimer = 0;
    if (u.onHitEffectFromSpawn) u.fx.rage = 6;
    this.units.push(u);
    out.push(u);

    if (card.unit?.onSpawnEffect) {
      const eff = card.unit.onSpawnEffect;
      this.areas.push({
        id: this.nextId(), kind: 'burst', side, x: u.x, z: u.z,
        radius: eff.radius || 2.5, damage: eff.damage || 0,
        effects: eff.type && eff.type !== 'damage' ? [{ type: eff.type, seconds: eff.seconds }] : [],
        delay: u.deployTimer, duration: 0.1, elapsed: 0,
        crownTowerFactor: 1,
        extraShock: evolved && card.evolution?.ability === 'shockwave',
      });
    }
  }
  return out;
};

function ringOffset(i, n, r) {
  if (n <= 1) return [0, 0];
  if (n <= 4) {
    const a = (i / n) * Math.PI * 2 + Math.PI / 4;
    return [Math.cos(a) * r, Math.sin(a) * r];
  }
  const ring = i < 5 ? 0 : 1;
  const inRing = ring === 0 ? 5 : n - 5;
  const idx = ring === 0 ? i : i - 5;
  const rr = r * (ring === 0 ? 1 : 1.9);
  const a = (idx / Math.max(1, inRing)) * Math.PI * 2 + ring * 0.4;
  return [Math.cos(a) * rr, Math.sin(a) * rr];
}

// ───────────────────── 法術 ─────────────────────
//
// 查核文件第 5 節：「多數法術立即造成單次範圍效果」是前一版的缺陷。
// 下面依 delivery 分開處理：投射物、滾動、光環、分波、指定目標、生成。

Battle.prototype.castSpell = function castSpell(card, side, x, z) {
  const s = card.spell;
  const base = {
    id: this.nextId(), card: card.key, side, x, z,
    delivery: s.delivery, radius: s.radius,
    crownTowerFactor: s.crownTowerFactor,
    hitsAir: s.hitsAir, hitsGround: s.hitsGround,
  };

  switch (s.delivery) {
    case 'instant':
      this.resolveSpellHit(card, side, x, z, s.damage, s.effects || []);
      this.emit('spell', { ...base, phase: 'impact' });
      break;

    case 'projectile':
      this.pending.push({ ...base, kind: 'projectile', timer: s.travelTime, spell: s, card });
      this.emit('spell', { ...base, phase: 'cast', travelTime: s.travelTime });
      break;

    case 'targeted': {
      // 閃電：鎖定範圍內生命最高的 N 個目標，逐一結算。
      this.pending.push({ ...base, kind: 'targeted', timer: s.travelTime, spell: s, card });
      this.emit('spell', { ...base, phase: 'cast', travelTime: s.travelTime });
      break;
    }

    case 'rolling': {
      // 從施放點往前滾，沿路持續判定並推擠。
      const dir = forward(side);
      this.projectiles.push({
        id: this.nextId(), kind: 'rolling', card: card.key, side,
        x, z, dirX: 0, dirZ: dir,
        speed: s.rollSpeed, travelled: 0, maxDistance: s.rollDistance,
        radius: s.radius, damage: s.damage, crownTowerFactor: s.crownTowerFactor,
        hitsAir: s.hitsAir, hitsGround: s.hitsGround,
        effects: s.effects || [], hitIds: new Set(),
        spawnAtEnd: s.spawnAtEnd || null,
      });
      this.emit('spell', { ...base, phase: 'roll' });
      break;
    }

    case 'aura':
      this.pending.push({ ...base, kind: 'aura', timer: s.travelTime, spell: s, card });
      this.emit('spell', { ...base, phase: 'cast', travelTime: s.travelTime });
      break;

    case 'spawn':
      this.pending.push({ ...base, kind: 'spawn', timer: s.travelTime, spell: s, card });
      this.emit('spell', { ...base, phase: 'cast', travelTime: s.travelTime });
      break;

    case 'waves':
      this.pending.push({ ...base, kind: 'waves', timer: s.travelTime, spell: s, card });
      this.emit('spell', { ...base, phase: 'cast', travelTime: s.travelTime });
      break;

    default:
      this.resolveSpellHit(card, side, x, z, s.damage, s.effects || []);
      break;
  }
};

/** 單次範圍結算（含對塔傷害折減）。 */
Battle.prototype.resolveSpellHit = function resolveSpellHit(card, side, x, z, damage, effects, opts = {}) {
  const s = card.spell || {};
  const r = opts.radius ?? s.radius ?? 2.5;
  const ctf = opts.crownTowerFactor ?? s.crownTowerFactor ?? 1;
  const hitsAir = s.hitsAir !== false;
  const hitsGround = s.hitsGround !== false;

  for (const u of this.units) {
    if (!u.alive || u.side === side) continue;
    if (u.flying && !hitsAir) continue;
    if (!u.flying && !hitsGround) continue;
    if (dist(x, z, u.x, u.z) > r + u.radius) continue;
    if (damage) this.damageUnit(u, damage, { source: card.key, side });
    this.applyEffects(u, effects);
  }
  if (s.friendlyOnly || opts.friendlyOnly) {
    for (const u of this.units) {
      if (!u.alive || u.side !== side) continue;
      if (dist(x, z, u.x, u.z) > r + u.radius) continue;
      this.applyEffects(u, effects);
      if (s.cloneFriendly) this.cloneUnit(u, s.cloneFriendly);
    }
  }
  for (const t of this.towers) {
    if (!t.alive || t.side === side) continue;
    if (dist(x, z, t.x, t.z) > r + t.radius) continue;
    const dmg = Math.round((damage || 0) * ctf);
    if (dmg > 0) this.damageTower(t, dmg, { source: card.key, side });
  }
  this.emit('impact', { card: card.key, x, z, radius: r, side });
};

Battle.prototype.cloneUnit = function cloneUnit(u, cfg) {
  if (u.isBuilding || u.isChampion) return;
  const card = ALL_CARDS[u.card];
  const c = makeUnit(card, { side: u.side, x: u.x + 0.4, z: u.z + 0.4, evolved: u.evolved, rng: this.rng, nextId: this.nextId });
  c.hp = cfg.hpOverride ?? 1;
  c.maxHp = c.hp;
  c.shieldHp = 0;
  c.deployTimer = 0;
  c.isClone = true;
  this.units.push(c);
};

Battle.prototype.applyEffects = function applyEffects(u, effects) {
  if (!effects) return;
  for (const e of effects) {
    switch (e.type) {
      case 'stun':
        if (u.isBuilding && u.noAttack) break;
        u.fx.stun = Math.max(u.fx.stun, e.seconds ?? 0.5);
        u.cooldown = Math.max(u.cooldown, e.seconds ?? 0.5);
        if (u.chargeUpSeconds) u.chargeUp = u.chargeUpSeconds;
        break;
      case 'freeze':
        u.fx.freeze = Math.max(u.fx.freeze, e.seconds ?? 1);
        break;
      case 'slow':
        u.fx.slow = e.refresh ? Math.max(u.fx.slow, e.seconds ?? 2) : Math.max(u.fx.slow, e.seconds ?? 2);
        u.fx.slowFactor = e.factor ?? 0.65;
        break;
      case 'snare':
        u.fx.snare = Math.max(u.fx.snare, e.seconds ?? 2);
        break;
      case 'rage':
        u.fx.rage = Math.max(u.fx.rage, e.seconds ?? 6);
        break;
      case 'resetTarget':
        u.targetId = null;
        if (u.rampUp) u.rampUp.elapsed = 0;
        break;
      case 'knockback': {
        const d = e.distance ?? 1;
        const dir = u.knockDir || { x: 0, z: 0 };
        u.x = clamp(u.x + dir.x * d, 0.3, ARENA.width - 0.3);
        u.z = clamp(u.z + dir.z * d, 0.3, ARENA.length - 0.3);
        break;
      }
      case 'pull':
        u.pullTo = { x: e.x, z: e.z, strength: e.strength ?? 3 };
        break;
      default: break;
    }
  }
};

// ───────────────────── 索敵 ─────────────────────

Battle.prototype.isTargetable = function isTargetable(attacker, e) {
  if (!e.alive) return false;
  if (e.flying && !attacker.targetsAir) return false;
  if (e.fx?.cloak > 0) return false;                    // 弓箭女皇隱身
  if (e.invisibleWhenIdle && !e.targetId && e.moving) return false; // 皇家幽靈移動時隱形
  return true;
};

/** 沒有可攻擊單位時的預設目標：本路公主塔，塔倒則轉王塔。 */
Battle.prototype.defaultTarget = function defaultTarget(u) {
  const enemySide = 1 - u.side;
  const lane = u.x < ARENA.width / 2 ? 'left' : 'right';
  const towers = this.towers.filter((t) => t.side === enemySide && t.alive);
  const same = towers.find((t) => t.kind === 'princess' && this.laneOfTower(t) === lane);
  if (same) return same;
  const other = towers.find((t) => t.kind === 'princess');
  if (other) return other;
  return towers.find((t) => t.kind === 'king') || null;
};

Battle.prototype.entityById = function entityById(id) {
  if (id == null) return null;
  const u = this.units.find((e) => e.id === id);
  if (u) return u;
  return this.towers.find((t) => t.id === id) || null;
};

Battle.prototype.findTarget = function findTarget(u) {
  const enemySide = 1 - u.side;
  let best = null;
  let bd = Infinity;

  const consider = (e, isTower) => {
    const d = dist(u.x, u.z, e.x, e.z) - (e.radius || 0);
    if (d < bd) { bd = d; best = e; }
    return isTower;
  };

  if (u.targetOnly === 'buildings') {
    // 建築吸引：只看敵方建築與塔，取最近。
    for (const e of this.units) {
      if (!e.alive || e.side !== enemySide || !e.isBuilding) continue;
      if (!this.isTargetable(u, e)) continue;
      consider(e, false);
    }
    for (const t of this.towers) {
      if (!t.alive || t.side !== enemySide) continue;
      if (t.kind === 'king' && this.towers.some((x) => x.side === enemySide && x.kind === 'princess' && x.alive)) {
        // 公主塔還在時，王塔不是主要吸引目標。
        continue;
      }
      consider(t, true);
    }
    return best || this.defaultTarget(u);
  }

  for (const e of this.units) {
    if (!e.alive || e.side !== enemySide) continue;
    if (!this.isTargetable(u, e)) continue;
    const d = dist(u.x, u.z, e.x, e.z) - e.radius - u.radius;
    if (d > u.sight) continue;
    if (d < bd) { bd = d; best = e; }
  }
  for (const t of this.towers) {
    if (!t.alive || t.side !== enemySide) continue;
    const d = dist(u.x, u.z, t.x, t.z) - t.radius - u.radius;
    if (d > u.sight) continue;
    if (d < bd) { bd = d; best = t; }
  }
  return best || this.defaultTarget(u);
};

// ───────────────────── 傷害 ─────────────────────

Battle.prototype.damageUnit = function damageUnit(u, amount, meta = {}) {
  if (!u.alive || amount <= 0) return;
  let dmg = amount;
  if (u.evoAbility === 'damage_reduction_aura' && u.evoParams?.damageReduction) {
    dmg *= 1 - u.evoParams.damageReduction;
  }
  dmg = Math.round(dmg);
  if (u.shieldHp > 0) {
    const absorbed = Math.min(u.shieldHp, dmg);
    u.shieldHp -= absorbed;
    dmg -= absorbed;
    if (u.shieldHp <= 0) this.emit('shieldBreak', { id: u.id, x: u.x, z: u.z });
  }
  if (dmg <= 0) return;
  u.hp -= dmg;
  u.hitFlash = 0.15;
  u.lastHitBy = meta.source || null;
  this.emit('hit', { id: u.id, x: u.x, z: u.z, amount: dmg, side: u.side });
  if (u.hp <= 0) this.killUnit(u, meta);
};

Battle.prototype.damageTower = function damageTower(t, amount, meta = {}) {
  if (!t.alive || amount <= 0) return;
  t.hp -= amount;
  t.hitFlash = 0.15;
  this.emit('towerHit', { id: t.id, side: t.side, amount, hp: Math.max(0, t.hp) });

  // 王塔啟動條件之一：王塔本身受到任何傷害。
  if (t.kind === 'king' && KING_ACTIVATION.onKingTowerDamaged && !t.active) {
    t.active = true;
    this.emit('kingActivated', { side: t.side, reason: 'damaged' });
  }

  if (t.hp <= 0) {
    t.hp = 0;
    t.alive = false;
    const scorer = 1 - t.side;
    this.players[scorer].crowns += 1;
    this.emit('towerDown', { id: t.id, side: t.side, kind: t.kind, by: scorer });

    if (t.kind === 'princess' && KING_ACTIVATION.onPrincessTowerDestroyed) {
      const king = this.kingOf(t.side);
      if (king && king.alive && !king.active) {
        king.active = true;
        this.emit('kingActivated', { side: t.side, reason: 'princess_destroyed' });
      }
    }
    if (t.kind === 'king') {
      this.players[scorer].crowns = VICTORY.crownsForInstantWin;
      this.finish(scorer, 'king_tower');
    } else if (this.overtime && VICTORY.overtimeSuddenDeath) {
      this.finish(scorer, 'sudden_death');
    }
  }
};

Battle.prototype.killUnit = function killUnit(u, meta = {}) {
  if (!u.alive) return;
  u.alive = false;
  u.animation = 'death';
  this.emit('death', { id: u.id, card: u.card, side: u.side, x: u.x, z: u.z });

  // 骷髏王：附近單位死亡累積亡魂。
  for (const k of this.units) {
    if (!k.alive || !k.soulHarvest) continue;
    if (dist(k.x, k.z, u.x, u.z) <= k.soulHarvest.perDeathRadius) {
      k.soulHarvest.souls = Math.min(k.soulHarvest.maxSouls, k.soulHarvest.souls + 1);
    }
  }

  if (u.championSlot) {
    const p = this.players[u.side];
    if (p.championOnField === u.id) {
      p.championOnField = null;
      p.championCooldown = 8;
    }
  }

  if (u.onDeathDamage) {
    this.areas.push({
      id: this.nextId(), kind: 'burst', side: u.side, x: u.x, z: u.z,
      radius: u.onDeathDamage.radius, damage: u.onDeathDamage.damage,
      delay: 0, duration: 0.1, elapsed: 0, crownTowerFactor: 1,
    });
  }
  if (u.onDeathSpawn) {
    this.spawnCard(u.onDeathSpawn.card, u.side, u.x, u.z, { count: u.onDeathSpawn.count, instant: false });
  }
  if (u.onDeathSpell) {
    const spellCard = ALL_CARDS[u.onDeathSpell];
    if (spellCard) this.castSpell(spellCard, u.side, u.x, u.z);
  }
  if (u.onDeathElixir) {
    this.players[u.side].elixir = clamp(this.players[u.side].elixir + u.onDeathElixir, 0, ELIXIR.max);
  }
  // 進化骷髏兵：死亡再生（最多兩次）。
  if (u.evoAbility === 'skeleton_split' && (u.evoState.splits || 0) < 2) {
    const child = this.spawnCard(u.card, u.side, u.x, u.z, { count: 1, instant: true })[0];
    if (child) {
      child.evoAbility = 'skeleton_split';
      child.evoState = { splits: (u.evoState.splits || 0) + 1 };
      child.evolved = true;
    }
  }
};

// ───────────────────── 主迴圈 ─────────────────────

Battle.prototype.step = function step(dt = TICK_SECONDS) {
  if (this.finished) return;
  this.tick += 1;
  this.time += dt;
  if (this.overtime) this.overtimeTime += dt;

  this.stepElixir(dt);
  this.stepPending(dt);
  this.stepAreas(dt);
  this.stepProjectiles(dt);
  this.stepUnits(dt);
  this.stepTowers(dt);
  this.reap();
  this.stepClock();
};

Battle.prototype.stepElixir = function stepElixir(dt) {
  const rate = elixirPerSecond(this.phase);
  for (const p of this.players) {
    p.elixir = clamp(p.elixir + rate * dt, 0, ELIXIR.max);
    if (p.championCooldown > 0) p.championCooldown = Math.max(0, p.championCooldown - dt);
  }
};

/** 飛行中的法術：時間到才在落點結算。 */
Battle.prototype.stepPending = function stepPending(dt) {
  for (let i = this.pending.length - 1; i >= 0; i -= 1) {
    const p = this.pending[i];
    p.timer -= dt;
    if (p.timer > 0) continue;
    this.pending.splice(i, 1);
    const s = p.spell;

    if (p.kind === 'projectile') {
      this.resolveSpellHit(p.card, p.side, p.x, p.z, s.damage, s.effects || []);
    } else if (p.kind === 'targeted') {
      this.resolveLightning(p);
    } else if (p.kind === 'aura') {
      this.areas.push({
        id: this.nextId(), kind: 'aura', card: p.card.key, side: p.side,
        x: p.x, z: p.z, radius: s.radius,
        dps: s.damagePerSecond || 0,
        crownTowerFactor: s.crownTowerFactor,
        buildingDamageMultiplier: s.buildingDamageMultiplier || 1,
        effects: s.effects || [],
        friendlyOnly: !!s.friendlyOnly,
        cloneFriendly: s.cloneFriendly || null,
        hitsAir: s.hitsAir, hitsGround: s.hitsGround,
        duration: s.durationSeconds || 1, elapsed: 0, accum: 0,
      });
      this.emit('spell', { card: p.card.key, side: p.side, x: p.x, z: p.z, phase: 'aura', radius: s.radius, duration: s.durationSeconds });
    } else if (p.kind === 'spawn') {
      if (s.damage) this.resolveSpellHit(p.card, p.side, p.x, p.z, s.damage, s.effects || []);
      const sp = s.spawn;
      if (sp) {
        for (let k = 0; k < sp.count; k += 1) {
          const [ox, oz] = ringOffset(k, sp.count, sp.spread || 0.8);
          this.spawnCard(sp.card, p.side, p.x + ox, p.z + oz, { count: 1, instant: false });
        }
      }
    } else if (p.kind === 'waves') {
      if (s.waves) {
        // 箭雨：分波落下。
        for (let w = 0; w < s.waves; w += 1) {
          this.pending.push({
            ...p, kind: 'projectile', timer: w * (s.waveIntervalSeconds || 0.1),
            spell: { ...s, damage: Math.round(s.damage / s.waves), delivery: 'projectile' },
            card: { ...p.card, spell: { ...s, damage: Math.round(s.damage / s.waves) } },
          });
        }
      }
      if (s.spawnWaves) {
        this.areas.push({
          id: this.nextId(), kind: 'spawner', card: p.card.key, side: p.side,
          x: p.x, z: p.z, radius: s.radius,
          spawnCard: s.spawnWaves.card, interval: s.spawnWaves.intervalSeconds,
          spread: s.spawnWaves.spread, remaining: s.spawnWaves.total,
          duration: s.spawnWaves.durationSeconds, elapsed: 0, accum: 0,
        });
        this.emit('spell', { card: p.card.key, side: p.side, x: p.x, z: p.z, phase: 'graveyard', radius: s.radius, duration: s.spawnWaves.durationSeconds });
      }
    }
  }
};

/** 閃電：鎖定範圍內生命值最高的 N 個目標。 */
Battle.prototype.resolveLightning = function resolveLightning(p) {
  const s = p.spell;
  const enemySide = 1 - p.side;
  const pool = [];
  for (const u of this.units) {
    if (!u.alive || u.side !== enemySide) continue;
    if (u.flying && !s.hitsAir) continue;
    if (dist(p.x, p.z, u.x, u.z) > s.radius + u.radius) continue;
    pool.push({ e: u, hp: u.hp, tower: false });
  }
  for (const t of this.towers) {
    if (!t.alive || t.side !== enemySide) continue;
    if (dist(p.x, p.z, t.x, t.z) > s.radius + t.radius) continue;
    pool.push({ e: t, hp: t.hp, tower: true });
  }
  pool.sort((a, b) => b.hp - a.hp);
  const picks = pool.slice(0, s.targetCount || 3);
  for (const pick of picks) {
    if (pick.tower) {
      this.damageTower(pick.e, Math.round(s.damage * s.crownTowerFactor), { source: p.card.key, side: p.side });
    } else {
      this.damageUnit(pick.e, s.damage, { source: p.card.key, side: p.side });
      this.applyEffects(pick.e, s.effects || []);
    }
    this.emit('bolt', { x: pick.e.x, z: pick.e.z, side: p.side });
  }
};

/** 光環／延遲爆炸／分波生成。 */
Battle.prototype.stepAreas = function stepAreas(dt) {
  for (let i = this.areas.length - 1; i >= 0; i -= 1) {
    const a = this.areas[i];
    if (a.delay > 0) { a.delay -= dt; continue; }
    a.elapsed += dt;

    if (a.kind === 'burst') {
      for (const u of this.units) {
        if (!u.alive || u.side === a.side) continue;
        if (dist(a.x, a.z, u.x, u.z) > a.radius + u.radius) continue;
        u.knockDir = normalize(u.x - a.x, u.z - a.z);
        this.damageUnit(u, a.damage, { source: 'burst', side: a.side });
        if (a.effects?.length) this.applyEffects(u, a.effects);
        if (a.extraShock) this.applyEffects(u, [{ type: 'knockback', distance: 1.2 }]);
      }
      for (const t of this.towers) {
        if (!t.alive || t.side === a.side) continue;
        if (dist(a.x, a.z, t.x, t.z) > a.radius + t.radius) continue;
        this.damageTower(t, Math.round(a.damage * (a.crownTowerFactor ?? 1)), { source: 'burst', side: a.side });
      }
      this.emit('impact', { card: 'burst', x: a.x, z: a.z, radius: a.radius, side: a.side });
      this.areas.splice(i, 1);
      continue;
    }

    if (a.kind === 'bomb') {
      if (a.elapsed >= a.duration) {
        for (const u of this.units) {
          if (!u.alive || u.side === a.side) continue;
          if (dist(a.x, a.z, u.x, u.z) > a.radius + u.radius) continue;
          this.damageUnit(u, a.damage, { source: 'bomb', side: a.side });
        }
        for (const t of this.towers) {
          if (!t.alive || t.side === a.side) continue;
          if (dist(a.x, a.z, t.x, t.z) > a.radius + t.radius) continue;
          this.damageTower(t, Math.round(a.damage * 0.35), { source: 'bomb', side: a.side });
        }
        this.emit('impact', { card: 'bomb', x: a.x, z: a.z, radius: a.radius, side: a.side });
        this.areas.splice(i, 1);
      }
      continue;
    }

    if (a.kind === 'spawner') {
      a.accum += dt;
      while (a.accum >= a.interval && a.remaining > 0 && a.elapsed <= a.duration) {
        a.accum -= a.interval;
        a.remaining -= 1;
        const ang = this.rng() * Math.PI * 2;
        const rad = Math.sqrt(this.rng()) * a.spread;
        this.spawnCard(a.spawnCard, a.side, a.x + Math.cos(ang) * rad, a.z + Math.sin(ang) * rad, { count: 1, instant: false });
      }
      if (a.elapsed >= a.duration || a.remaining <= 0) this.areas.splice(i, 1);
      continue;
    }

    // aura（毒、地震、狂暴、龍捲風）
    a.accum += dt;
    const tickInterval = 0.25;
    while (a.accum >= tickInterval) {
      a.accum -= tickInterval;
      const frac = tickInterval;
      for (const u of this.units) {
        if (!u.alive) continue;
        const friendly = u.side === a.side;
        if (a.friendlyOnly !== friendly) continue;
        if (u.flying && a.hitsAir === false) continue;
        if (!u.flying && a.hitsGround === false) continue;
        if (dist(a.x, a.z, u.x, u.z) > a.radius + u.radius) continue;

        if (a.dps && !friendly) {
          const mult = u.isBuilding ? (a.buildingDamageMultiplier || 1) : 1;
          this.damageUnit(u, a.dps * frac * mult, { source: a.card, side: a.side });
        }
        for (const e of a.effects || []) {
          if (e.type === 'pull') {
            u.pullTo = { x: a.x, z: a.z, strength: e.strength };
          } else {
            this.applyEffects(u, [e]);
          }
        }
        if (a.cloneFriendly && friendly && !u.isClone && !u.clonedOnce) {
          u.clonedOnce = true;
          this.cloneUnit(u, a.cloneFriendly);
        }
      }
      if (a.dps && !a.friendlyOnly) {
        for (const t of this.towers) {
          if (!t.alive || t.side === a.side) continue;
          if (dist(a.x, a.z, t.x, t.z) > a.radius + t.radius) continue;
          const mult = a.buildingDamageMultiplier || 1;
          this.damageTower(t, a.dps * frac * mult * (a.crownTowerFactor ?? 1), { source: a.card, side: a.side });
        }
      }
    }
    if (a.elapsed >= a.duration) this.areas.splice(i, 1);
  }
};

function normalize(x, z) {
  const l = Math.hypot(x, z) || 1;
  return { x: x / l, z: z / l };
}

// ───────────────────── 投射物 ─────────────────────

Battle.prototype.stepProjectiles = function stepProjectiles(dt) {
  for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
    const p = this.projectiles[i];

    if (p.kind === 'rolling') {
      // 滾木／野蠻人木桶：沿路持續判定，每個目標只吃一次。
      const stepDist = p.speed * dt;
      p.x += p.dirX * stepDist;
      p.z += p.dirZ * stepDist;
      p.travelled += stepDist;

      for (const u of this.units) {
        if (!u.alive || u.side === p.side || p.hitIds.has(u.id)) continue;
        if (u.flying && !p.hitsAir) continue;
        if (!u.flying && !p.hitsGround) continue;
        if (Math.abs(u.z - p.z) > p.radius + u.radius) continue;
        p.hitIds.add(u.id);
        u.knockDir = { x: 0, z: p.dirZ };
        this.damageUnit(u, p.damage, { source: p.card, side: p.side });
        this.applyEffects(u, p.effects);
      }
      for (const t of this.towers) {
        if (!t.alive || t.side === p.side || p.hitIds.has(t.id)) continue;
        if (dist(p.x, p.z, t.x, t.z) > p.radius + t.radius) continue;
        p.hitIds.add(t.id);
        this.damageTower(t, Math.round(p.damage * p.crownTowerFactor), { source: p.card, side: p.side });
      }

      if (p.travelled >= p.maxDistance || p.z < 0 || p.z > ARENA.length) {
        if (p.spawnAtEnd) {
          this.spawnCard(p.spawnAtEnd.card, p.side, p.x, clamp(p.z, 0.5, ARENA.length - 0.5), { count: p.spawnAtEnd.count });
        }
        this.projectiles.splice(i, 1);
      }
      continue;
    }

    // 一般彈道
    const tgt = this.entityById(p.targetId);
    if (tgt && tgt.alive) { p.tx = tgt.x; p.tz = tgt.z; }
    const dx = p.tx - p.x;
    const dz = p.tz - p.z;
    const d = Math.hypot(dx, dz);
    const stepDist = p.speed * dt;

    if (d <= stepDist || d < 0.05) {
      this.projectileImpact(p);
      this.projectiles.splice(i, 1);
      continue;
    }
    p.x += (dx / d) * stepDist;
    p.z += (dz / d) * stepDist;
    p.life = (p.life || 0) + dt;
    if (p.life > 6) this.projectiles.splice(i, 1);
  }
};

Battle.prototype.projectileImpact = function projectileImpact(p) {
  const tgt = this.entityById(p.targetId);
  if (p.splashRadius > 0) {
    for (const u of this.units) {
      if (!u.alive || u.side === p.side) continue;
      if (u.flying && !p.hitsAir) continue;
      if (dist(p.tx, p.tz, u.x, u.z) > p.splashRadius + u.radius) continue;
      u.knockDir = normalize(u.x - p.tx, u.z - p.tz);
      this.damageUnit(u, p.damage, { source: p.card, side: p.side });
      if (p.effects) this.applyEffects(u, p.effects);
    }
    for (const t of this.towers) {
      if (!t.alive || t.side === p.side) continue;
      if (dist(p.tx, p.tz, t.x, t.z) > p.splashRadius + t.radius) continue;
      this.damageTower(t, p.damage, { source: p.card, side: p.side });
    }
    this.emit('impact', { card: p.card, x: p.tx, z: p.tz, radius: p.splashRadius, side: p.side });
    return;
  }

  if (!tgt || !tgt.alive) return;
  if (tgt.entity === 'tower') {
    this.damageTower(tgt, p.damage, { source: p.card, side: p.side });
  } else {
    tgt.knockDir = normalize(tgt.x - p.x, tgt.z - p.z);
    this.damageUnit(tgt, p.damage, { source: p.card, side: p.side });
    if (p.effects) this.applyEffects(tgt, p.effects);
  }
  // 電靈：連鎖。
  if (p.chain) {
    let hops = p.chain;
    let from = tgt;
    const hit = new Set([tgt.id]);
    while (hops-- > 0) {
      let best = null; let bd = 4.0;
      for (const u of this.units) {
        if (!u.alive || u.side === p.side || hit.has(u.id)) continue;
        const d = dist(from.x, from.z, u.x, u.z);
        if (d < bd) { bd = d; best = u; }
      }
      if (!best) break;
      hit.add(best.id);
      this.damageUnit(best, p.damage, { source: p.card, side: p.side });
      if (p.effects) this.applyEffects(best, p.effects);
      this.emit('bolt', { x: best.x, z: best.z, side: p.side });
      from = best;
    }
  }
};

// ───────────────────── 單位更新 ─────────────────────

function effectiveSpeed(u) {
  if (u.fx.freeze > 0 || u.fx.stun > 0 || u.fx.snare > 0) return 0;
  let s = u.baseSpeed;
  if (u.fx.slow > 0) s *= u.fx.slowFactor;
  if (u.fx.rage > 0) s *= 1.35;
  if (u.charge?.ready) s *= u.charge.speedMultiplier;
  return s;
}

function effectiveHitSpeed(u) {
  let h = u.hitSpeed;
  if (u.fx.rage > 0) h /= 1.35;
  if (u.fx.slow > 0) h /= u.fx.slowFactor;
  if (u.fx.cloak > 0) h /= (u.fx.cloakHitSpeed || 1);
  return h;
}

Battle.prototype.stepUnits = function stepUnits(dt) {
  // 1) 計時器與狀態
  for (const u of this.units) {
    if (!u.alive) continue;
    for (const k of ['stun', 'freeze', 'slow', 'rage', 'snare', 'cloak']) {
      if (u.fx[k] > 0) u.fx[k] = Math.max(0, u.fx[k] - dt);
    }
    if (u.hitFlash > 0) u.hitFlash = Math.max(0, u.hitFlash - dt);
    if (u.ability && u.ability.cd > 0) u.ability.cd = Math.max(0, u.ability.cd - dt);
    if (u.burrowing > 0) u.burrowing = Math.max(0, u.burrowing - dt);

    if (u.deployTimer > 0) {
      u.deployTimer -= dt;
      u.animation = 'spawn';
      continue;
    }
    if (u.lifetime != null) {
      u.lifetime -= dt;
      if (u.lifetime <= 0) { this.killUnit(u, { source: 'lifetime' }); continue; }
    }

    // 聖水收集器
    if (u.elixirPump) {
      u.elixirPump.timer -= dt;
      if (u.elixirPump.timer <= 0) {
        u.elixirPump.timer += u.elixirPump.intervalSeconds;
        const p = this.players[u.side];
        p.elixir = clamp(p.elixir + u.elixirPump.amount, 0, ELIXIR.max);
        this.emit('pump', { side: u.side, x: u.x, z: u.z });
      }
    }
    // 產兵建築／女巫
    if (u.spawner && u.fx.freeze <= 0 && u.fx.stun <= 0) {
      u.spawner.timer -= dt;
      if (u.spawner.timer <= 0) {
        u.spawner.timer += u.spawner.intervalSeconds;
        const front = forward(u.side) * (u.isBuilding ? 1.1 : 0.9);
        this.spawnCard(u.spawner.card, u.side, u.x, clamp(u.z + front, 0.5, ARENA.length - 0.5), { count: u.spawner.count });
      }
    }
    // 進化騎士傷害光環
    if (u.evoAbility === 'damage_reduction_aura' && u.evoParams) {
      u.evoState.acc = (u.evoState.acc || 0) + dt;
      if (u.evoState.acc >= 0.5) {
        const tickDmg = u.evoParams.auraDps * u.evoState.acc;
        u.evoState.acc = 0;
        for (const e of this.units) {
          if (!e.alive || e.side === u.side) continue;
          if (dist(u.x, u.z, e.x, e.z) > u.evoParams.auraRadius + e.radius) continue;
          this.damageUnit(e, tickDmg, { source: 'evo_knight_aura', side: u.side });
        }
      }
    }
    // 黃金騎士衝刺
    if (u.dash) {
      u.dash.timer -= dt;
      if (u.dash.timer <= 0) {
        u.dash.timer = u.dash.interval;
        let best = null; let bd = u.dash.range;
        for (const e of this.units) {
          if (!e.alive || e.side === u.side || e.flying) continue;
          const d = dist(u.x, u.z, e.x, e.z);
          if (d < bd) { bd = d; best = e; }
        }
        if (best && u.dash.left > 0) {
          u.dash.left -= 1;
          u.x = best.x - Math.sign(best.x - u.x) * 0.6;
          u.z = best.z - Math.sign(best.z - u.z) * 0.6;
          this.damageUnit(best, u.dash.damage, { source: u.card, side: u.side });
          this.emit('dash', { x: u.x, z: u.z, side: u.side });
        } else {
          u.dash = null;
        }
      }
    }
    // 雪橇騎士側擊：束縛最近的地面敵人
    if (u.sideAttack) {
      u.sideAttack.cd = Math.max(0, u.sideAttack.cd - dt);
      if (u.sideAttack.cd === 0) {
        let best = null; let bd = u.sideAttack.range;
        for (const e of this.units) {
          if (!e.alive || e.side === u.side || e.flying) continue;
          const d = dist(u.x, u.z, e.x, e.z);
          if (d < bd) { bd = d; best = e; }
        }
        if (best) {
          u.sideAttack.cd = u.sideAttack.cooldown;
          this.applyEffects(best, [u.sideAttack.effect]);
          this.emit('bola', { x: best.x, z: best.z, side: u.side });
        }
      }
    }
  }

  // 2) 索敵 + 移動
  for (const u of this.units) {
    if (!u.alive || u.deployTimer > 0) continue;
    if (u.noAttack && u.isBuilding) { u.animation = 'idle'; continue; }

    let target = this.entityById(u.targetId);
    const leash = u.sight + 2.5;
    const invalid = !target || !target.alive
      || (target.entity === 'unit' && !this.isTargetable(u, target))
      || (target.entity === 'unit' && dist(u.x, u.z, target.x, target.z) > leash);
    if (invalid) {
      const next = this.findTarget(u);
      if (next && (!target || next.id !== target.id)) {
        if (u.rampUp?.resetOnTargetChange) u.rampUp.elapsed = 0;
        if (u.rampUpDamage) u.rampUpDamage.stacks = 0;
        u.evoState.firstShot = true;
      }
      target = next;
      u.targetId = target ? target.id : null;
    }
    if (!target) { u.animation = 'idle'; continue; }

    const reach = u.range + (target.radius || 0) + u.radius * 0.5;
    const dToTarget = dist(u.x, u.z, target.x, target.z);
    const inRange = dToTarget <= reach && (!u.minRange || dToTarget >= u.minRange);

    if (u.isBuilding || u.baseSpeed === 0) {
      u.moving = false;
      u.animation = inRange ? 'attack' : 'idle';
      if (inRange) this.tryAttack(u, target, dt);
      else u.cooldown = Math.max(0, u.cooldown - dt);
      continue;
    }

    // 龍捲風吸引
    if (u.pullTo) {
      const dir = normalize(u.pullTo.x - u.x, u.pullTo.z - u.z);
      const pd = dist(u.x, u.z, u.pullTo.x, u.pullTo.z);
      const move = Math.min(pd, u.pullTo.strength * dt);
      u.x += dir.x * move;
      u.z += dir.z * move;
      u.pullTo = null;
    }

    if (inRange) {
      u.moving = false;
      u.animation = 'attack';
      // 衝鋒在接觸後重置
      if (u.charge) { u.charge.travelled = 0; u.charge.ready = false; }
      this.tryAttack(u, target, dt);
      continue;
    }

    // 飛天狂鐵跳擊
    if (u.jumpAttack) {
      u.jumpAttack.cd = Math.max(0, u.jumpAttack.cd - dt);
      if (u.jumpAttack.cd === 0 && dToTarget >= u.jumpAttack.minRange && dToTarget <= u.jumpAttack.maxRange
        && target.entity === 'unit' && !target.flying) {
        u.jumpAttack.cd = u.jumpAttack.cooldown + 1.2;
        u.x = target.x; u.z = target.z;
        this.areas.push({
          id: this.nextId(), kind: 'burst', side: u.side, x: u.x, z: u.z,
          radius: u.jumpAttack.radius, damage: u.jumpAttack.damage,
          delay: 0, duration: 0.1, elapsed: 0, crownTowerFactor: 1,
          extraShock: u.evoAbility === 'shockwave',
        });
        this.emit('jump', { id: u.id, x: u.x, z: u.z, side: u.side });
        continue;
      }
    }

    const speed = effectiveSpeed(u);
    u.moving = speed > 0;
    u.animation = speed > 0 ? 'walk' : 'idle';
    if (speed <= 0) { u.cooldown = Math.max(0, u.cooldown - dt); continue; }

    const wp = this.waypointFor(u, target);
    const dir = normalize(wp.x - u.x, wp.z - u.z);
    const move = speed * dt;
    u.x += dir.x * move;
    u.z += dir.z * move;
    u.facing = Math.atan2(dir.x, dir.z);

    if (u.charge) {
      u.charge.travelled += move;
      if (u.charge.travelled >= u.charge.distance) u.charge.ready = true;
    }
    if (u.rampUp) u.rampUp.elapsed = 0;
    u.cooldown = Math.max(0, u.cooldown - dt);
  }

  // 3) 碰撞推擠
  this.resolveCollisions();

  // 4) 邊界
  for (const u of this.units) {
    if (!u.alive) continue;
    u.x = clamp(u.x, 0.3, ARENA.width - 0.3);
    u.z = clamp(u.z, 0.3, ARENA.length - 0.3);
  }
};

/**
 * 過河：地面單位必須走橋，除非會跳河（野豬騎士、戰車槌）。
 */
Battle.prototype.waypointFor = function waypointFor(u, target) {
  if (u.flying || u.jumpsRiver) {
    if (u.jumpsRiver && !u.flying) {
      const crossing = (u.z - 16) * (target.z - 16) < 0;
      if (crossing && !u.jumped) {
        u.jumped = true;
        this.emit('riverJump', { id: u.id, x: u.x, z: u.z, side: u.side });
      }
    }
    return { x: target.x, z: target.z };
  }

  const half = ARENA.length / 2;
  const sameSide = (u.z - half) * (target.z - half) > 0;
  if (sameSide || inRiver(u.z)) return { x: target.x, z: target.z };

  // 需要過河：先走到最近的橋頭，過橋後再直奔目標。
  const bridge = nearestBridge(u.x);
  const towardTarget = Math.sign(target.z - u.z);
  const bridgeEntry = half - towardTarget * 1.3;
  if (Math.abs(u.x - bridge.x) > 0.35) {
    return { x: bridge.x, z: bridgeEntry };
  }
  return { x: bridge.x, z: half + towardTarget * 1.3 };
};

Battle.prototype.resolveCollisions = function resolveCollisions() {
  const list = this.units.filter((u) => u.alive && u.deployTimer <= 0 && !u.noCollision);
  for (let i = 0; i < list.length; i += 1) {
    const a = list[i];
    for (let j = i + 1; j < list.length; j += 1) {
      const b = list[j];
      if (a.flying !== b.flying) continue;          // 空中與地面互不碰撞
      const minD = a.radius + b.radius;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= minD * minD || d2 === 0) continue;
      const d = Math.sqrt(d2) || 0.0001;
      const overlap = (minD - d) * 0.5;
      const nx = dx / d;
      const nz = dz / d;
      const ma = a.isBuilding ? 1e6 : a.mass;
      const mb = b.isBuilding ? 1e6 : b.mass;
      const total = ma + mb;
      a.x -= nx * overlap * (mb / total) * 2;
      a.z -= nz * overlap * (mb / total) * 2;
      b.x += nx * overlap * (ma / total) * 2;
      b.z += nz * overlap * (ma / total) * 2;
    }
    // 與塔的碰撞
    for (const t of this.towers) {
      if (!t.alive || a.flying) continue;
      const minD = a.radius + t.radius;
      const dx = a.x - t.x;
      const dz = a.z - t.z;
      const d = Math.hypot(dx, dz);
      if (d >= minD || d === 0) continue;
      a.x = t.x + (dx / d) * minD;
      a.z = t.z + (dz / d) * minD;
    }
  }
};

// ───────────────────── 攻擊 ─────────────────────

Battle.prototype.tryAttack = function tryAttack(u, target, dt) {
  if (u.noAttack) return;
  if (u.fx.freeze > 0 || u.fx.stun > 0) { u.cooldown = Math.max(u.cooldown, 0); return; }

  // 電磁炮：需蓄力。
  if (u.chargeUpSeconds) {
    u.chargeUp -= dt;
    if (u.chargeUp > 0) { u.animation = 'charge'; return; }
    u.chargeUp = u.chargeUpSeconds;
  } else {
    u.cooldown -= dt;
    if (u.cooldown > 0) return;
    u.cooldown = effectiveHitSpeed(u);
  }

  let dmg = u.damage;

  // 傷害爬升（地獄塔 / 地獄飛龍 / 大力礦工）
  if (u.rampUp) {
    u.rampUp.elapsed += effectiveHitSpeed(u);
    const idx = Math.min(u.rampUp.stages.length - 1, Math.floor(u.rampUp.elapsed / u.rampUp.secondsPerStage));
    dmg = u.rampUp.stages[idx];
  }
  // 疊加傷害（小王子）
  if (u.rampUpDamage) {
    dmg += u.rampUpDamage.perHit * u.rampUpDamage.stacks;
    u.rampUpDamage.stacks = Math.min(u.rampUpDamage.maxStacks, u.rampUpDamage.stacks + 1);
  }
  // 衝鋒加成
  if (u.charge?.ready) {
    dmg *= u.charge.damageMultiplier;
    u.charge.ready = false;
    u.charge.travelled = 0;
    this.emit('chargeHit', { id: u.id, x: u.x, z: u.z, side: u.side });
  }
  dmg = Math.round(dmg);

  const effects = [];
  if (u.onHitEffect) effects.push(u.onHitEffect);
  if (u.evoAbility === 'knockback_shot') effects.push({ type: 'knockback', distance: 0.9 });

  // 進化弓箭手：換目標後第一發三連射 + 擊退
  let volley = u.multiShot || 1;
  if (u.evoAbility === 'charged_first_shot' && u.evoState.firstShot) {
    volley = u.evoParams?.volley || 3;
    u.evoState.firstShot = false;
    effects.push({ type: 'knockback', distance: u.evoParams?.knockback ?? 0.6 });
  }

  u.animation = 'attack';
  u.facing = Math.atan2(target.x - u.x, target.z - u.z);

  // 自爆單位（火靈、冰靈、電靈）
  if (u.kamikaze) {
    const k = u.kamikaze;
    for (const e of this.units) {
      if (!e.alive || e.side === u.side) continue;
      if (dist(u.x, u.z, e.x, e.z) > k.radius + e.radius) continue;
      if (k.damage) this.damageUnit(e, k.damage, { source: u.card, side: u.side });
      if (k.effect) this.applyEffects(e, [k.effect]);
    }
    for (const t of this.towers) {
      if (!t.alive || t.side === u.side) continue;
      if (dist(u.x, u.z, t.x, t.z) > k.radius + t.radius) continue;
      if (k.damage) this.damageTower(t, Math.round(k.damage * 0.35), { source: u.card, side: u.side });
    }
    this.emit('impact', { card: u.card, x: u.x, z: u.z, radius: k.radius, side: u.side });
    this.killUnit(u, { source: 'kamikaze' });
    return;
  }

  // 近戰範圍傷害（瓦基里、飛天狂鐵、皇家幽靈）
  if (u.meleeSplash && u.splashRadius > 0) {
    for (const e of this.units) {
      if (!e.alive || e.side === u.side) continue;
      if (e.flying && !u.targetsAir) continue;
      if (dist(u.x, u.z, e.x, e.z) > u.splashRadius + e.radius + u.radius) continue;
      e.knockDir = normalize(e.x - u.x, e.z - u.z);
      this.damageUnit(e, dmg, { source: u.card, side: u.side });
      if (u.evoAbility === 'vortex_pull' && !e.flying) {
        e.pullTo = { x: u.x, z: u.z, strength: 2.6 };
      }
    }
    if (target.entity === 'tower') this.damageTower(target, dmg, { source: u.card, side: u.side });
    this.emit('swing', { id: u.id, x: u.x, z: u.z, side: u.side, radius: u.splashRadius });
    return;
  }

  const isRanged = u.projectileSpeed > 0;
  for (let v = 0; v < volley; v += 1) {
    if (isRanged) {
      this.projectiles.push({
        id: this.nextId(), kind: 'shot', card: u.card, side: u.side,
        x: u.x, z: u.z, tx: target.x, tz: target.z, targetId: target.id,
        speed: u.projectileSpeed, damage: dmg,
        splashRadius: u.splashRadius, hitsAir: u.targetsAir,
        effects: effects.slice(), arcing: u.arcing,
        chain: u.kamikazeChain || null,
        life: 0,
      });
    } else if (target.entity === 'tower') {
      this.damageTower(target, dmg, { source: u.card, side: u.side });
    } else {
      target.knockDir = normalize(target.x - u.x, target.z - u.z);
      this.damageUnit(target, dmg, { source: u.card, side: u.side });
      if (effects.length) this.applyEffects(target, effects);
    }
  }

  // 進化蝙蝠：吸血
  if (u.evoAbility === 'lifesteal') {
    u.hp = Math.min(u.maxHp, u.hp + Math.round(dmg * 0.5));
  }
  // 沖天炮：火花散射
  if (u.sparks) {
    const n = u.evoAbility === 'spark_burst' ? u.sparks + 3 : u.sparks;
    for (let s = 0; s < n; s += 1) {
      const spread = (s / Math.max(1, n - 1) - 0.5) * 1.8;
      this.projectiles.push({
        id: this.nextId(), kind: 'shot', card: u.card, side: u.side,
        x: u.x, z: u.z,
        tx: target.x + spread, tz: target.z + spread * 0.4, targetId: null,
        speed: u.projectileSpeed * 0.8, damage: Math.round(dmg * 0.5),
        splashRadius: u.evoAbility === 'spark_burst' ? 0.9 : 0.5,
        hitsAir: false, effects: [], life: 0,
      });
    }
  }
  this.emit('shoot', { id: u.id, x: u.x, z: u.z, side: u.side, ranged: isRanged });
};

// ───────────────────── 塔 ─────────────────────

Battle.prototype.stepTowers = function stepTowers(dt) {
  for (const t of this.towers) {
    if (!t.alive) continue;
    if (t.hitFlash > 0) t.hitFlash = Math.max(0, t.hitFlash - dt);

    // 皇家主廚：定期給我方單位加成
    if (t.buffFriendly) {
      t.buffTimer -= dt;
      if (t.buffTimer <= 0) {
        t.buffTimer = t.buffFriendly.intervalSeconds;
        for (const u of this.units) {
          if (!u.alive || u.side !== t.side) continue;
          if (dist(t.x, t.z, u.x, u.z) > 8) continue;
          u.fx.rage = Math.max(u.fx.rage, t.buffFriendly.durationSeconds);
        }
        this.emit('chefBuff', { side: t.side, x: t.x, z: t.z });
      }
    }

    if (!t.active) continue;

    // 飛刀公爵夫人：彈藥與裝填
    if (t.ammo) {
      if (t.ammo.left <= 0) {
        t.ammo.reload += dt;
        if (t.ammo.reload >= t.ammo.reloadSeconds) {
          t.ammo.reload = 0;
          t.ammo.left = t.ammo.capacity;
        }
        continue;
      }
    }

    let target = this.entityById(t.targetId);
    const valid = target && target.alive && target.side !== t.side
      && dist(t.x, t.z, target.x, target.z) - (target.radius || 0) <= t.range
      && !(target.flying && !t.targetsAir)
      && !(target.fx?.cloak > 0);
    if (!valid) {
      let best = null; let bd = t.range;
      for (const u of this.units) {
        if (!u.alive || u.side === t.side || u.deployTimer > 0) continue;
        if (u.flying && !t.targetsAir) continue;
        if (u.fx.cloak > 0) continue;
        const d = dist(t.x, t.z, u.x, u.z) - u.radius;
        if (d < bd) { bd = d; best = u; }
      }
      target = best;
      t.targetId = best ? best.id : null;
    }
    if (!target) { t.cooldown = Math.max(0, t.cooldown - dt); continue; }

    t.cooldown -= dt;
    if (t.cooldown > 0) continue;
    t.cooldown = t.hitSpeed;
    if (t.ammo) t.ammo.left -= 1;

    this.projectiles.push({
      id: this.nextId(), kind: 'shot', card: `tower_${t.kind}`, side: t.side,
      x: t.x, z: t.z, tx: target.x, tz: target.z, targetId: target.id,
      speed: t.projectileSpeed, damage: t.damage,
      splashRadius: t.splashRadius || 0, hitsAir: t.targetsAir,
      effects: [], life: 0,
    });
    this.emit('towerShoot', { id: t.id, side: t.side, x: t.x, z: t.z });
  }
};

Battle.prototype.reap = function reap() {
  for (let i = this.units.length - 1; i >= 0; i -= 1) {
    const u = this.units[i];
    if (!u.alive) {
      u.corpse = (u.corpse || 0) + TICK_SECONDS;
      if (u.corpse > 0.9) this.units.splice(i, 1);
    }
  }
};

// ───────────────────── 時間與勝負 ─────────────────────

Battle.prototype.stepClock = function stepClock() {
  if (this.finished) return;
  if (!this.overtime) {
    if (this.time >= TIMING.regulationSeconds) {
      const [a, b] = [this.players[0].crowns, this.players[1].crowns];
      if (a > b) this.finish(0, 'regulation_crowns');
      else if (b > a) this.finish(1, 'regulation_crowns');
      else {
        this.overtime = true;
        this.overtimeTime = 0;
        this.emit('overtime', {});
      }
    }
    return;
  }
  if (this.overtimeTime >= TIMING.overtimeSeconds) {
    this.resolveTiebreaker();
  }
};

/**
 * Tiebreaker：延長賽結束時仍未分出勝負，
 * 比較雙方「血量百分比最低的存活塔」，較低者判負。
 */
Battle.prototype.resolveTiebreaker = function resolveTiebreaker() {
  const lowest = (side) => {
    const alive = this.towers.filter((t) => t.side === side && t.alive);
    if (!alive.length) return -1;
    return Math.min(...alive.map((t) => t.hp / t.maxHp));
  };
  const a = lowest(0);
  const b = lowest(1);
  if (a === b) this.finish(null, 'draw');
  else this.finish(a < b ? 1 : 0, 'tiebreaker');
};

Battle.prototype.finish = function finish(winner, reason) {
  if (this.finished) return;
  this.finished = true;
  this.result = {
    winner,
    reason,
    crowns: [this.players[0].crowns, this.players[1].crowns],
    time: this.time,
    overtime: this.overtime,
    towers: this.towers.map((t) => ({ id: t.id, side: t.side, kind: t.kind, hp: Math.max(0, Math.round(t.hp)), maxHp: t.maxHp })),
  };
  this.emit('finish', this.result);
};

/** 玩家斷線超時判負。 */
Battle.prototype.forfeit = function forfeit(side, reason = 'disconnect') {
  this.finish(1 - side, reason);
};

// ───────────────────── 快照 ─────────────────────

/** 傳給客戶端渲染的精簡狀態。 */
Battle.prototype.snapshot = function snapshot() {
  return {
    tick: this.tick,
    time: +this.time.toFixed(2),
    phase: this.phase,
    overtime: this.overtime,
    remaining: +this.remainingSeconds.toFixed(2),
    finished: this.finished,
    result: this.result,
    players: this.players.map((p) => ({
      name: p.name, isBot: p.isBot, crowns: p.crowns,
      elixir: +p.elixir.toFixed(2),
      champion: p.champion, championOnField: p.championOnField,
      championCooldown: +p.championCooldown.toFixed(1),
      towerTroop: p.towerTroop, connected: p.connected,
    })),
    towers: this.towers.map((t) => ({
      i: t.id, s: t.side, k: t.kind, l: t.lane, x: +t.x.toFixed(2), z: +t.z.toFixed(2),
      hp: Math.max(0, Math.round(t.hp)), mx: t.maxHp, a: t.active ? 1 : 0,
      al: t.alive ? 1 : 0, tt: t.towerTroopKey,
      am: t.ammo ? t.ammo.left : null,
    })),
    units: this.units.map((u) => ({
      i: u.id, c: u.card, s: u.side,
      x: +u.x.toFixed(2), z: +u.z.toFixed(2),
      hp: Math.max(0, Math.round(u.hp)), mx: u.maxHp,
      sh: u.shieldHp > 0 ? u.shieldHp : 0,
      f: +u.facing.toFixed(2), an: u.animation,
      d: u.deployTimer > 0 ? 1 : 0, e: u.evolved ? 1 : 0,
      fl: u.flying ? 1 : 0, al: u.alive ? 1 : 0,
      fz: u.fx.freeze > 0 ? 1 : 0, st: u.fx.stun > 0 ? 1 : 0,
      rg: u.fx.rage > 0 ? 1 : 0, sl: u.fx.slow > 0 ? 1 : 0,
      ck: u.fx.cloak > 0 ? 1 : 0,
      lt: u.lifetime != null ? +u.lifetime.toFixed(1) : null,
    })),
    projectiles: this.projectiles.map((p) => ({
      i: p.id, c: p.card, s: p.side, k: p.kind,
      x: +p.x.toFixed(2), z: +p.z.toFixed(2),
    })),
    areas: this.areas.filter((a) => a.delay <= 0).map((a) => ({
      i: a.id, k: a.kind, c: a.card, s: a.side,
      x: +a.x.toFixed(2), z: +a.z.toFixed(2), r: a.radius,
      p: a.duration ? +(a.elapsed / a.duration).toFixed(2) : 0,
    })),
    hands: this.players.map((p, side) => ({
      hand: this.hand(side).map((k) => ({ card: k, evolved: this.isEvolvedNext(side, k) })),
      next: this.nextCard(side),
      evoCharge: { ...p.evoCharge },
    })),
  };
};

/** 取出並清空事件佇列（給網路層／特效層）。 */
Battle.prototype.drainEvents = function drainEvents() {
  const e = this.events;
  this.events = [];
  return e;
};

export default Battle;
