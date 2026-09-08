/**
 * 法術、冠軍（Champion）與塔兵。
 *
 * 查核文件第 5 節指出前一版「多數法術只是立即造成單次範圍效果」。
 * 這裡把投放方式拆成互不相同的 delivery 類型，由模擬器分別處理：
 *
 *   projectile — 有飛行時間，落點才結算
 *   rolling    — 從落點往前滾動，沿路持續判定並推擠
 *   aura       — 在範圍內持續作用（毒、狂暴、地震）
 *   instant    — 立即結算（僅少數）
 *   spawn      — 投放後生成單位（哥布林飛桶、墓園）
 *   waves      — 分波生成／分次傷害
 */

import { DEFAULT_CROWN_TOWER_FACTOR } from './rules.js';

const UNVERIFIED = {
  identityVerified: true,
  statsVerified: false,
  versionDate: null,
  level: 11,
  source: 'public-knowledge-reconstruction',
};

function spell(def) {
  return {
    kind: 'spell',
    provenance: { ...UNVERIFIED },
    ...def,
    spell: {
      travelTime: 0.8,
      radius: 2.5,
      damage: 0,
      crownTowerFactor: DEFAULT_CROWN_TOWER_FACTOR,
      hitsAir: true,
      hitsGround: true,
      delivery: 'projectile',
      ...def.spell,
    },
  };
}

export const SPELL_CARDS = {};
const add = (c) => { SPELL_CARDS[c.key] = c; return c; };

add(spell({
  key: 'zap', name: 'Zap', nameZh: '閃電法術', elixir: 2, rarity: 'common', arena: 5,
  visual: { build: 'spell_zap', palette: ['#7de3ff', '#2f5a8f'] },
  spell: { delivery: 'instant', travelTime: 0.1, radius: 2.5, damage: 192, crownTowerFactor: 0.35,
    effects: [{ type: 'stun', seconds: 0.5 }, { type: 'resetTarget' }] },
}));

add(spell({
  key: 'giant_snowball', name: 'Giant Snowball', nameZh: '巨型雪球', elixir: 2, rarity: 'common', arena: 8,
  visual: { build: 'spell_snowball', palette: ['#e8f4ff', '#8fd0e8'] },
  spell: { delivery: 'projectile', travelTime: 0.6, radius: 2.5, damage: 159, crownTowerFactor: 0.35,
    effects: [{ type: 'slow', factor: 0.65, seconds: 2.5 }, { type: 'knockback', distance: 1.2 }] },
}));

add(spell({
  key: 'arrows', name: 'Arrows', nameZh: '箭雨', elixir: 3, rarity: 'common', arena: 0,
  visual: { build: 'spell_arrows', palette: ['#c9a24a', '#6f5a2f'] },
  spell: { delivery: 'waves', travelTime: 1.1, radius: 4.0, damage: 309, crownTowerFactor: 0.35,
    waves: 3, waveIntervalSeconds: 0.12 },
}));

add(spell({
  key: 'the_log', name: 'The Log', nameZh: '滾木', elixir: 2, rarity: 'legendary', arena: 6,
  visual: { build: 'spell_log', palette: ['#8a6a3b', '#4f3a20'] },
  spell: { delivery: 'rolling', travelTime: 0, radius: 1.9, damage: 240, crownTowerFactor: 0.35,
    hitsAir: false, rollDistance: 10.4, rollSpeed: 5.6,
    effects: [{ type: 'knockback', distance: 2.4 }] },
}));

add(spell({
  key: 'barbarian_barrel', name: 'Barbarian Barrel', nameZh: '野蠻人木桶', elixir: 2, rarity: 'epic', arena: 3,
  visual: { build: 'spell_barrel', palette: ['#8a6a3b', '#4f3a20'] },
  spell: { delivery: 'rolling', travelTime: 0, radius: 1.6, damage: 240, crownTowerFactor: 0.35,
    hitsAir: false, rollDistance: 4.5, rollSpeed: 4.5,
    effects: [{ type: 'knockback', distance: 1.5 }],
    spawnAtEnd: { card: 'barbarians', count: 1 } },
}));

add(spell({
  key: 'fireball', name: 'Fireball', nameZh: '火球', elixir: 4, rarity: 'rare', arena: 0,
  visual: { build: 'spell_fireball', palette: ['#ff8a3a', '#c4423a'] },
  spell: { delivery: 'projectile', travelTime: 1.0, radius: 2.5, damage: 689, crownTowerFactor: 0.35,
    effects: [{ type: 'knockback', distance: 1.4 }] },
}));

add(spell({
  key: 'poison', name: 'Poison', nameZh: '毒藥', elixir: 4, rarity: 'epic', arena: 8,
  visual: { build: 'spell_poison', palette: ['#8fd06a', '#3f6f2f'] },
  spell: { delivery: 'aura', travelTime: 1.0, radius: 3.5, damage: 0, crownTowerFactor: 0.35,
    durationSeconds: 8, damagePerSecond: 111,
    effects: [{ type: 'slow', factor: 0.85, seconds: 0.5, refresh: true }] },
}));

add(spell({
  key: 'earthquake', name: 'Earthquake', nameZh: '地震術', elixir: 3, rarity: 'rare', arena: 12,
  visual: { build: 'spell_quake', palette: ['#a08050', '#5a4020'] },
  spell: { delivery: 'aura', travelTime: 0.8, radius: 3.5, damage: 0, crownTowerFactor: 0.35,
    hitsAir: false, durationSeconds: 3, damagePerSecond: 84,
    buildingDamageMultiplier: 3.5,
    effects: [{ type: 'slow', factor: 0.65, seconds: 0.5, refresh: true }] },
}));

add(spell({
  key: 'rocket', name: 'Rocket', nameZh: '火箭', elixir: 6, rarity: 'rare', arena: 5,
  visual: { build: 'spell_rocket', palette: ['#e05a3a', '#8a2f2f'] },
  spell: { delivery: 'projectile', travelTime: 1.3, radius: 2.0, damage: 1585, crownTowerFactor: 0.35,
    effects: [{ type: 'knockback', distance: 1.6 }] },
}));

add(spell({
  key: 'lightning', name: 'Lightning', nameZh: '閃電', elixir: 6, rarity: 'epic', arena: 6,
  visual: { build: 'spell_lightning', palette: ['#f0e07a', '#7de3ff'] },
  spell: { delivery: 'targeted', travelTime: 1.0, radius: 3.5, damage: 1056, crownTowerFactor: 0.35,
    targetCount: 3, targetHighestHp: true,
    effects: [{ type: 'stun', seconds: 0.5 }] },
}));

add(spell({
  key: 'freeze', name: 'Freeze', nameZh: '冰凍法術', elixir: 4, rarity: 'epic', arena: 8,
  visual: { build: 'spell_freeze', palette: ['#8fd0e8', '#3f6f8f'] },
  spell: { delivery: 'projectile', travelTime: 1.0, radius: 3.0, damage: 96, crownTowerFactor: 0.35,
    effects: [{ type: 'freeze', seconds: 4.0 }] },
}));

add(spell({
  key: 'rage', name: 'Rage', nameZh: '狂暴', elixir: 2, rarity: 'epic', arena: 1,
  visual: { build: 'spell_rage', palette: ['#c060d0', '#6f2f8f'] },
  spell: { delivery: 'aura', travelTime: 0.5, radius: 5.0, damage: 0, durationSeconds: 6,
    friendlyOnly: true,
    effects: [{ type: 'rage', speedFactor: 1.35, hitSpeedFactor: 1.35, seconds: 6, refresh: true }] },
}));

add(spell({
  key: 'tornado', name: 'Tornado', nameZh: '龍捲風', elixir: 3, rarity: 'epic', arena: 9,
  visual: { build: 'spell_tornado', palette: ['#9fb8d0', '#4a5a7a'] },
  spell: { delivery: 'aura', travelTime: 0.5, radius: 5.5, damage: 0, durationSeconds: 2.5,
    damagePerSecond: 46, crownTowerFactor: 0.35,
    effects: [{ type: 'pull', strength: 3.2, refresh: true }] },
}));

add(spell({
  key: 'goblin_barrel', name: 'Goblin Barrel', nameZh: '哥布林飛桶', elixir: 3, rarity: 'epic', arena: 3,
  visual: { build: 'spell_gobbarrel', palette: ['#8a6a3b', '#7ad46a'] },
  spell: { delivery: 'spawn', travelTime: 1.1, radius: 1.5, damage: 0,
    spawn: { card: 'goblins', count: 3, spread: 0.9 } },
}));

add(spell({
  key: 'graveyard', name: 'Graveyard', nameZh: '墓園', elixir: 5, rarity: 'legendary', arena: 12,
  visual: { build: 'spell_graveyard', palette: ['#6f6f8a', '#2f2f4a'] },
  spell: { delivery: 'waves', travelTime: 1.0, radius: 4.0, damage: 0,
    spawnWaves: { card: 'skeletons', total: 16, intervalSeconds: 0.5, durationSeconds: 10, spread: 4.0 } },
}));

add(spell({
  key: 'royal_delivery', name: 'Royal Delivery', nameZh: '皇家空投', elixir: 3, rarity: 'common', arena: 10,
  visual: { build: 'spell_delivery', palette: ['#3f5f9c', '#c9a24a'] },
  spell: { delivery: 'spawn', travelTime: 2.6, radius: 3.0, damage: 296, crownTowerFactor: 0.35,
    effects: [{ type: 'knockback', distance: 1.2 }],
    spawn: { card: 'royal_recruit', count: 1, spread: 0 } },
}));

add(spell({
  key: 'clone', name: 'Clone', nameZh: '複製法術', elixir: 3, rarity: 'epic', arena: 11,
  visual: { build: 'spell_clone', palette: ['#7de3ff', '#c060d0'] },
  spell: { delivery: 'aura', travelTime: 0.8, radius: 3.5, damage: 0, durationSeconds: 0.1,
    friendlyOnly: true, cloneFriendly: { hpOverride: 1 } },
}));

// ─────────────────── 冠軍（Champion）───────────────────
// 冠軍有主動技能，需額外聖水，且場上同時只能有一個。

const UNVERIFIED_CHAMP = { ...UNVERIFIED };

function champion(def) {
  return {
    kind: 'troop',
    isChampion: true,
    count: 1,
    rarity: 'champion',
    provenance: { ...UNVERIFIED_CHAMP },
    ...def,
    unit: {
      flying: false, targetsAir: true, targetOnly: null, splashRadius: 0,
      mass: 3, radius: 0.6, deployTime: 1.0, sight: 6, ...def.unit,
    },
  };
}

export const CHAMPION_CARDS = {};
const addC = (c) => { CHAMPION_CARDS[c.key] = c; return c; };

addC(champion({
  key: 'archer_queen', name: 'Archer Queen', nameZh: '弓箭女皇', elixir: 5, arena: 13,
  visual: { build: 'humanoid', palette: ['#f0d08a', '#7a2f6b', '#f0c9a0'], weapon: 'longbow', hair: '#f0e07a', crown: true, scale: 1.0 },
  unit: { hp: 1200, damage: 128, hitSpeed: 1.2, range: 5.0, speed: 1.0, radius: 0.5,
    projectileSpeed: 12, multiShot: 1 },
  ability: { key: 'cloak', nameZh: '隱身', elixir: 1, cooldownSeconds: 15, durationSeconds: 3.5,
    description: '隱身並提高攻速，期間不會被索敵',
    effect: { type: 'cloak', hitSpeedFactor: 2.0 } },
}));

addC(champion({
  key: 'golden_knight', name: 'Golden Knight', nameZh: '黃金騎士', elixir: 4, arena: 13,
  visual: { build: 'humanoid', palette: ['#f0d08a', '#b8862f', '#f0c9a0'], weapon: 'sword', helmet: 'knight', cape: '#c9a24a', scale: 1.05 },
  unit: { hp: 2000, damage: 200, hitSpeed: 1.1, range: 1.2, speed: 1.5, radius: 0.55, targetsAir: false },
  ability: { key: 'dash', nameZh: '衝刺', elixir: 1, cooldownSeconds: 12, durationSeconds: 4,
    description: '連續衝刺攻擊鏈上的地面單位，每段命中造成傷害',
    effect: { type: 'dashChain', hops: 12, hopRange: 4.0, hopDamage: 200, hopIntervalSeconds: 0.28 } },
}));

addC(champion({
  key: 'skeleton_king', name: 'Skeleton King', nameZh: '骷髏王', elixir: 4, arena: 13,
  visual: { build: 'skeleton', palette: ['#efeadd', '#c4bdae', '#f0d08a'], weapon: 'club', crown: true, scale: 1.35 },
  unit: { hp: 2400, damage: 220, hitSpeed: 1.6, range: 1.4, speed: 1.0, radius: 0.65, targetsAir: false,
    splashRadius: 1.3, meleeSplash: true,
    soulHarvest: { perDeathRadius: 6.5, maxSouls: 20 } },
  ability: { key: 'soul_summon', nameZh: '亡魂召喚', elixir: 2, cooldownSeconds: 16,
    description: '消耗累積的亡魂，一次召喚等量骷髏兵',
    effect: { type: 'summonSouls', card: 'skeletons' } },
}));

addC(champion({
  key: 'mighty_miner', name: 'Mighty Miner', nameZh: '大力礦工', elixir: 4, arena: 13,
  visual: { build: 'humanoid', palette: ['#c9a24a', '#4a3a2a', '#f0c9a0'], weapon: 'drill', helmet: 'miner', scale: 1.1 },
  unit: { hp: 2600, damage: 60, hitSpeed: 0.4, range: 1.2, speed: 1.0, radius: 0.6, targetsAir: false,
    deployAnywhere: true,
    rampUp: { stages: [60, 120, 240], secondsPerStage: 1.6, resetOnTargetChange: true } },
  ability: { key: 'burrow', nameZh: '鑽地', elixir: 1, cooldownSeconds: 10,
    description: '就地埋設炸彈後鑽入地下移動到新位置',
    effect: { type: 'burrow', bombDamage: 400, bombRadius: 2.5, bombDelaySeconds: 1.5 } },
}));

addC(champion({
  key: 'little_prince', name: 'Little Prince', nameZh: '小王子', elixir: 3, arena: 13,
  visual: { build: 'humanoid', palette: ['#e8d08a', '#6f4a8f', '#f0c9a0'], weapon: 'longbow', crown: true, scale: 0.85 },
  unit: { hp: 800, damage: 120, hitSpeed: 1.1, range: 6.0, speed: 1.0, radius: 0.45, projectileSpeed: 12,
    rampUpDamage: { perHit: 12, maxStacks: 10 } },
  ability: { key: 'call_guardienne', nameZh: '召喚守護者', elixir: 3, cooldownSeconds: 30, oneShot: true,
    description: '召喚 Guardienne 助戰',
    effect: { type: 'summon', card: 'guardienne', count: 1 } },
}));

// ─────────────────── 塔兵（Tower Troop）───────────────────
// 依 2024-12-13 更新，公主塔可替換為不同塔兵。
// 塔兵獨立於一般部署卡，不佔卡組 8 格。

export const TOWER_TROOPS = {
  tower_princess: {
    key: 'tower_princess', name: 'Tower Princess', nameZh: '公主塔兵', default: true,
    visual: { build: 'tower_princess', palette: ['#f0a0c0', '#c4548a'] },
    stats: { hp: 2534, damage: 109, hitSpeed: 0.8, range: 7.5, targetsAir: true, projectileSpeed: 12 },
    provenance: { ...UNVERIFIED },
  },
  dagger_duchess: {
    key: 'dagger_duchess', name: 'Dagger Duchess', nameZh: '飛刀公爵夫人',
    visual: { build: 'tower_duchess', palette: ['#c060d0', '#4f2a6b'] },
    stats: { hp: 2400, damage: 55, hitSpeed: 0.4, range: 6.5, targetsAir: true, projectileSpeed: 14,
      ammo: { capacity: 12, reloadSeconds: 8, openingVolley: true } },
    note: '開場彈藥打完後需重新裝填；射程略短。',
    provenance: { ...UNVERIFIED },
  },
  cannoneer: {
    key: 'cannoneer', name: 'Cannoneer', nameZh: '砲手',
    visual: { build: 'tower_cannoneer', palette: ['#8a5a3b', '#4a2f1f'] },
    stats: { hp: 2700, damage: 260, hitSpeed: 1.6, range: 7.0, targetsAir: false, projectileSpeed: 10, splashRadius: 0 },
    note: '對空無效，換取單發高傷。',
    provenance: { ...UNVERIFIED },
  },
  royal_chef: {
    key: 'royal_chef', name: 'Royal Chef', nameZh: '皇家主廚',
    visual: { build: 'tower_chef', palette: ['#f0efe8', '#c4423a'] },
    stats: { hp: 2534, damage: 100, hitSpeed: 0.9, range: 7.0, targetsAir: true, projectileSpeed: 12,
      buffFriendly: { intervalSeconds: 5, hitSpeedFactor: 1.35, durationSeconds: 4 } },
    note: '定期給我方單位加成。',
    provenance: { ...UNVERIFIED },
  },
};

// 由其他卡召喚、不可直接放入卡組的單位。
export const SPAWN_ONLY = {
  royal_recruit: {
    key: 'royal_recruit', name: 'Royal Recruit', nameZh: '皇家新兵', kind: 'troop', elixir: 0, rarity: 'common', spawnOnly: true,
    visual: { build: 'humanoid', palette: ['#3f5f9c', '#27406b', '#e8c39e'], weapon: 'spear', shield: true, helmet: 'knight', scale: 0.9 },
    unit: { hp: 260, damage: 79, hitSpeed: 1.3, range: 1.0, speed: 1.0, radius: 0.45, mass: 1.6,
      targetsAir: false, shield: { hp: 250 }, deployTime: 1.0, sight: 5.5, flying: false, targetOnly: null, splashRadius: 0 },
    provenance: { ...UNVERIFIED },
  },
  guardienne: {
    key: 'guardienne', name: 'Guardienne', nameZh: '守護者', kind: 'troop', elixir: 0, rarity: 'champion', spawnOnly: true,
    visual: { build: 'humanoid', palette: ['#8fd0e8', '#3f5f9c', '#f0c9a0'], weapon: 'lance', shield: true, scale: 1.05 },
    unit: { hp: 1800, damage: 180, hitSpeed: 1.3, range: 1.6, speed: 1.0, radius: 0.55, mass: 2.5,
      targetsAir: false, deployTime: 1.0, sight: 5.5, flying: false, targetOnly: null, splashRadius: 0 },
    provenance: { ...UNVERIFIED },
  },
};

export default SPELL_CARDS;
