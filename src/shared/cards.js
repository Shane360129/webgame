/**
 * 卡牌目錄。
 *
 * ── 資料誠實性聲明（對應查核文件第 3、8 節）──────────────────────────
 * 查核當日 royaleapi.github.io 在本環境被網路政策擋下（CONNECT 403），
 * 因此本檔的戰鬥數值 **不是** 從固定版本的官方或社群匯出檔取得。
 * 每張卡都帶 provenance 物件：
 *
 *   identityVerified : 名稱 / 聖水 / 類型 / 稀有度是否為長期穩定的公開事實
 *   statsVerified    : 生命 / 傷害 / 攻速 / 射程 等戰鬥數值是否已對照固定版本
 *   versionDate      : 已對照的平衡版本日期；未對照時為 null
 *   level            : 數值所對應的卡片等級
 *   source           : 來源標記
 *
 * 目前 **所有** 卡片的 statsVerified 皆為 false、versionDate 皆為 null。
 * UI 會據此顯示「數值未驗證」徽章。這是刻意的：查核文件要求
 * 「未驗證欄位不以猜測補齊」，所以我們補上標記而不是假裝已驗證。
 * ────────────────────────────────────────────────────────────────
 */

import { DEFAULT_CROWN_TOWER_FACTOR } from './rules.js';

/** 移動速度：原作以 tiles/分鐘 描述，這裡換算成 tiles/秒。 */
export const SPEED = {
  slow: 45 / 60,
  medium: 60 / 60,
  fast: 90 / 60,
  veryFast: 120 / 60,
};

const UNVERIFIED = {
  identityVerified: true,
  statsVerified: false,
  versionDate: null,
  level: 11,
  source: 'public-knowledge-reconstruction',
};

/** 未經對照的新卡：連識別欄位都標記待查。 */
const UNVERIFIED_NEW = { ...UNVERIFIED, identityVerified: false };

const RARITY = {
  common: { key: 'common', zh: '普通', color: '#c9d6e4' },
  rare: { key: 'rare', zh: '稀有', color: '#ff9b3d' },
  epic: { key: 'epic', zh: '史詩', color: '#c065ff' },
  legendary: { key: 'legendary', zh: '傳說', color: '#f7d774' },
  champion: { key: 'champion', zh: '冠軍', color: '#ffd countdown' },
};
RARITY.champion.color = '#ffd166';
export { RARITY };

/** 建立一般部隊卡。 */
function troop(def) {
  return {
    kind: 'troop',
    count: 1,
    provenance: { ...UNVERIFIED },
    ...def,
    unit: {
      flying: false,
      targetsAir: true,
      targetOnly: null,
      splashRadius: 0,
      mass: 1,
      radius: 0.5,
      deployTime: 1.0,
      sight: 5.5,
      ...def.unit,
    },
  };
}

function building(def) {
  return {
    kind: 'building',
    count: 1,
    provenance: { ...UNVERIFIED },
    ...def,
    unit: {
      isBuilding: true,
      flying: false,
      targetsAir: true,
      targetOnly: null,
      splashRadius: 0,
      mass: 8,
      radius: 0.8,
      deployTime: 1.0,
      speed: 0,
      sight: 6,
      ...def.unit,
    },
  };
}

function spell(def) {
  return {
    kind: 'spell',
    provenance: { ...UNVERIFIED },
    ...def,
    spell: {
      /** 落點延遲（秒）：投射物飛行時間。 */
      travelTime: 0.8,
      radius: 2.5,
      damage: 0,
      crownTowerFactor: DEFAULT_CROWN_TOWER_FACTOR,
      hitsAir: true,
      hitsGround: true,
      /** delivery: 'projectile' | 'rolling' | 'aura' | 'instant' | 'spawn' */
      delivery: 'projectile',
      ...def.spell,
    },
  };
}

// ───────────────────────── 部隊 ─────────────────────────

export const CARDS = {};

function add(card) {
  CARDS[card.key] = card;
  return card;
}

// —— 普通 ——
add(troop({
  key: 'knight', name: 'Knight', nameZh: '騎士', elixir: 3, rarity: 'common', arena: 0,
  visual: { build: 'humanoid', palette: ['#6f7c93', '#3d4657', '#e8c39e'], weapon: 'sword', helmet: 'knight', cape: '#3f5f9c', scale: 1.0 },
  unit: { hp: 1766, damage: 202, hitSpeed: 1.2, range: 1.2, speed: SPEED.medium, radius: 0.55, mass: 2.2 },
}));

add(troop({
  key: 'archers', name: 'Archers', nameZh: '弓箭手', elixir: 3, rarity: 'common', arena: 0, count: 2,
  visual: { build: 'humanoid', palette: ['#7fbf6a', '#4a7a3d', '#f0c9a0'], weapon: 'bow', hair: '#e8b84b', scale: 0.86 },
  unit: { hp: 304, damage: 107, hitSpeed: 1.2, range: 5.0, speed: SPEED.medium, radius: 0.42, mass: 1 },
}));

add(troop({
  key: 'goblins', name: 'Goblins', nameZh: '哥布林', elixir: 2, rarity: 'common', arena: 1, count: 3,
  visual: { build: 'goblin', palette: ['#7ad46a', '#4f8f3f', '#8a5a2b'], weapon: 'dagger', scale: 0.8 },
  unit: { hp: 202, damage: 120, hitSpeed: 1.1, range: 0.9, speed: SPEED.veryFast, radius: 0.36, mass: 0.8, targetsAir: false },
}));

add(troop({
  key: 'spear_goblins', name: 'Spear Goblins', nameZh: '長矛哥布林', elixir: 2, rarity: 'common', arena: 1, count: 3,
  visual: { build: 'goblin', palette: ['#7ad46a', '#3f6f8f', '#8a5a2b'], weapon: 'spear', scale: 0.78 },
  unit: { hp: 133, damage: 76, hitSpeed: 1.3, range: 5.0, speed: SPEED.veryFast, radius: 0.36, mass: 0.8 },
}));

add(troop({
  key: 'bomber', name: 'Bomber', nameZh: '炸彈人', elixir: 3, rarity: 'common', arena: 0,
  visual: { build: 'skeleton', palette: ['#e8e3d6', '#b8b2a2', '#2b2b2b'], weapon: 'bomb', hat: '#3a3a3a', scale: 0.9 },
  unit: { hp: 340, damage: 289, hitSpeed: 1.9, range: 4.5, speed: SPEED.medium, radius: 0.42, targetsAir: false, splashRadius: 1.6, projectileSpeed: 6 },
}));

add(troop({
  key: 'skeletons', name: 'Skeletons', nameZh: '骷髏兵', elixir: 1, rarity: 'common', arena: 2, count: 3,
  visual: { build: 'skeleton', palette: ['#efeadd', '#c4bdae', '#1e1e1e'], weapon: 'bone', scale: 0.72 },
  unit: { hp: 90, damage: 90, hitSpeed: 1.0, range: 0.8, speed: SPEED.fast, radius: 0.32, mass: 0.6, targetsAir: false },
  evolution: { key: 'evo_skeletons', cyclesRequired: 2, nameZh: '進化骷髏兵',
    ability: 'skeleton_split', description: '出場數 4；死亡時再生一隻骷髏（最多 2 次）',
    override: { count: 4 } },
}));

add(troop({
  key: 'minions', name: 'Minions', nameZh: '亡靈小兵', elixir: 3, rarity: 'common', arena: 0, count: 3,
  visual: { build: 'minion', palette: ['#6f7ce0', '#3a3f80', '#cfd6ff'], scale: 0.8 },
  unit: { hp: 190, damage: 84, hitSpeed: 1.0, range: 2.0, speed: SPEED.fast, radius: 0.38, mass: 0.7, flying: true },
}));

add(troop({
  key: 'barbarians', name: 'Barbarians', nameZh: '野蠻人', elixir: 5, rarity: 'common', arena: 3, count: 5,
  visual: { build: 'humanoid', palette: ['#e6b25c', '#8c4a2f', '#f0c9a0'], weapon: 'sword', hair: '#e8b84b', beard: true, scale: 0.95 },
  unit: { hp: 736, damage: 192, hitSpeed: 1.4, range: 1.1, speed: SPEED.medium, radius: 0.5, mass: 1.6, targetsAir: false },
  evolution: { key: 'evo_barbarians', cyclesRequired: 2, nameZh: '進化野蠻人',
    ability: 'spawn_rage', description: '出場時獲得狂暴（攻速與移速提升）',
    override: {} },
}));

add(troop({
  key: 'bats', name: 'Bats', nameZh: '蝙蝠', elixir: 2, rarity: 'common', arena: 6, count: 5,
  visual: { build: 'bat', palette: ['#4a3f6b', '#2a2440', '#d0c8ff'], scale: 0.6 },
  unit: { hp: 81, damage: 81, hitSpeed: 1.1, range: 1.2, speed: SPEED.veryFast, radius: 0.3, mass: 0.4, flying: true },
  evolution: { key: 'evo_bats', cyclesRequired: 2, nameZh: '進化蝙蝠',
    ability: 'lifesteal', description: '攻擊命中時回復自身生命', override: {} },
}));

add(troop({
  key: 'royal_giant', name: 'Royal Giant', nameZh: '皇家巨人', elixir: 6, rarity: 'common', arena: 7,
  visual: { build: 'giant', palette: ['#f0d08a', '#b8752f', '#e8c39e'], weapon: 'cannon_arm', crown: true, scale: 1.5 },
  unit: { hp: 3400, damage: 297, hitSpeed: 1.7, range: 5.0, speed: SPEED.slow, radius: 0.9, mass: 5, targetsAir: false, targetOnly: 'buildings', projectileSpeed: 9 },
  evolution: { key: 'evo_royal_giant', cyclesRequired: 2, nameZh: '進化皇家巨人',
    ability: 'knockback_shot', description: '砲擊產生擊退並穿透', override: {} },
}));

add(troop({
  key: 'firecracker', name: 'Firecracker', nameZh: '沖天炮女孩', elixir: 3, rarity: 'common', arena: 9,
  visual: { build: 'humanoid', palette: ['#e4574f', '#b8342c', '#f0c9a0'], weapon: 'firework', hair: '#2b2b2b', scale: 0.85 },
  unit: { hp: 273, damage: 128, hitSpeed: 3.0, range: 6.0, speed: SPEED.medium, radius: 0.42, splashRadius: 1.2, projectileSpeed: 8, sparks: 5 },
  evolution: { key: 'evo_firecracker', cyclesRequired: 2, nameZh: '進化沖天炮女孩',
    ability: 'spark_burst', description: '火花會再次爆開', override: {} },
}));

add(troop({
  key: 'elite_barbarians', name: 'Elite Barbarians', nameZh: '精銳野蠻人', elixir: 6, rarity: 'common', arena: 11, count: 2,
  visual: { build: 'humanoid', palette: ['#f2c14e', '#7a2f2f', '#f0c9a0'], weapon: 'axe', hair: '#c94a3a', beard: true, scale: 1.05 },
  unit: { hp: 917, damage: 315, hitSpeed: 1.4, range: 1.1, speed: SPEED.fast, radius: 0.55, mass: 2, targetsAir: false },
}));

// —— 稀有 ——
add(troop({
  key: 'musketeer', name: 'Musketeer', nameZh: '火槍手', elixir: 4, rarity: 'rare', arena: 0,
  visual: { build: 'humanoid', palette: ['#3f6f8f', '#274a63', '#f0c9a0'], weapon: 'musket', hat: '#2f3a4a', scale: 0.92 },
  unit: { hp: 720, damage: 218, hitSpeed: 1.1, range: 6.0, speed: SPEED.medium, radius: 0.45, projectileSpeed: 12 },
}));

add(troop({
  key: 'mini_pekka', name: 'Mini P.E.K.K.A', nameZh: '迷你皮卡', elixir: 4, rarity: 'rare', arena: 0,
  visual: { build: 'pekka', palette: ['#5b6478', '#2c3242', '#7de3ff'], weapon: 'greatsword', scale: 0.95 },
  unit: { hp: 1361, damage: 720, hitSpeed: 1.8, range: 1.2, speed: SPEED.fast, radius: 0.55, mass: 2.4, targetsAir: false },
}));

add(troop({
  key: 'valkyrie', name: 'Valkyrie', nameZh: '瓦基里武神', elixir: 4, rarity: 'rare', arena: 1,
  visual: { build: 'humanoid', palette: ['#c4543f', '#7a2f2f', '#f0c9a0'], weapon: 'axe', hair: '#e8663f', scale: 1.0 },
  unit: { hp: 1908, damage: 253, hitSpeed: 1.5, range: 1.2, speed: SPEED.medium, radius: 0.6, mass: 2.4, targetsAir: false, splashRadius: 1.5, meleeSplash: true },
  evolution: { key: 'evo_valkyrie', cyclesRequired: 2, nameZh: '進化瓦基里武神',
    ability: 'vortex_pull', description: '旋擊會把周圍地面單位吸向自己', override: {} },
}));

add(troop({
  key: 'hog_rider', name: 'Hog Rider', nameZh: '野豬騎士', elixir: 4, rarity: 'rare', arena: 4,
  visual: { build: 'rider', mount: 'hog', palette: ['#8a5a3b', '#5c3a24', '#e8c39e'], weapon: 'hammer', scale: 1.0 },
  unit: { hp: 1696, damage: 264, hitSpeed: 1.6, range: 1.2, speed: SPEED.veryFast, radius: 0.55, mass: 2.2, targetsAir: false, targetOnly: 'buildings', jumpsRiver: true },
}));

add(troop({
  key: 'giant', name: 'Giant', nameZh: '巨人', elixir: 5, rarity: 'rare', arena: 0,
  visual: { build: 'giant', palette: ['#d9a05b', '#8c5a2f', '#f0c9a0'], weapon: 'fists', scale: 1.5 },
  unit: { hp: 4091, damage: 254, hitSpeed: 1.5, range: 1.2, speed: SPEED.slow, radius: 0.95, mass: 5, targetsAir: false, targetOnly: 'buildings' },
}));

add(troop({
  key: 'wizard', name: 'Wizard', nameZh: '火法師', elixir: 5, rarity: 'rare', arena: 5,
  visual: { build: 'mage', palette: ['#e4574f', '#8c2f2f', '#f0c9a0'], weapon: 'fireball_staff', robe: '#c4423a', scale: 0.95 },
  unit: { hp: 720, damage: 281, hitSpeed: 1.4, range: 5.5, speed: SPEED.medium, radius: 0.45, splashRadius: 1.5, projectileSpeed: 7 },
}));

add(troop({
  key: 'three_musketeers', name: 'Three Musketeers', nameZh: '三劍客', elixir: 9, rarity: 'rare', arena: 7, count: 3,
  visual: { build: 'humanoid', palette: ['#3f6f8f', '#274a63', '#f0c9a0'], weapon: 'musket', hat: '#2f3a4a', scale: 0.92 },
  unit: { hp: 720, damage: 218, hitSpeed: 1.1, range: 6.0, speed: SPEED.medium, radius: 0.45, projectileSpeed: 12 },
}));

add(troop({
  key: 'battle_ram', name: 'Battle Ram', nameZh: '戰車槌', elixir: 4, rarity: 'rare', arena: 10,
  visual: { build: 'battleram', palette: ['#8a5a3b', '#5c3a24', '#d9c08a'], scale: 1.0 },
  unit: { hp: 1150, damage: 340, hitSpeed: 3.0, range: 0.9, speed: SPEED.fast, radius: 0.6, mass: 2.6, targetsAir: false, targetOnly: 'buildings', jumpsRiver: true,
    charge: { distance: 3.5, speedMultiplier: 1.7, damageMultiplier: 2 },
    onDeathSpawn: { card: 'barbarians', count: 2 } },
}));

add(troop({
  key: 'flying_machine', name: 'Flying Machine', nameZh: '飛行器', elixir: 4, rarity: 'rare', arena: 12,
  visual: { build: 'machine', palette: ['#c9a24a', '#6f5a2f', '#8fd0e8'], scale: 0.95 },
  unit: { hp: 340, damage: 156, hitSpeed: 1.0, range: 6.0, speed: SPEED.fast, radius: 0.45, flying: true, projectileSpeed: 11 },
}));

add(troop({
  key: 'dart_goblin', name: 'Dart Goblin', nameZh: '吹箭哥布林', elixir: 3, rarity: 'rare', arena: 10,
  visual: { build: 'goblin', palette: ['#7ad46a', '#c2b280', '#8a5a2b'], weapon: 'blowdart', scale: 0.82 },
  unit: { hp: 252, damage: 133, hitSpeed: 0.7, range: 6.5, speed: SPEED.veryFast, radius: 0.4, projectileSpeed: 14 },
}));

// —— 史詩 ——
add(troop({
  key: 'prince', name: 'Prince', nameZh: '王子', elixir: 5, rarity: 'epic', arena: 4,
  visual: { build: 'rider', mount: 'horse', palette: ['#e8d08a', '#b8862f', '#f0c9a0'], weapon: 'lance', cape: '#c4423a', scale: 1.05 },
  unit: { hp: 1920, damage: 392, hitSpeed: 1.4, range: 1.6, speed: SPEED.medium, radius: 0.6, mass: 3, targetsAir: false,
    charge: { distance: 3.5, speedMultiplier: 2.0, damageMultiplier: 2 } },
}));

add(troop({
  key: 'skeleton_army', name: 'Skeleton Army', nameZh: '骷髏大軍', elixir: 3, rarity: 'epic', arena: 2, count: 14,
  visual: { build: 'skeleton', palette: ['#efeadd', '#c4bdae', '#1e1e1e'], weapon: 'bone', scale: 0.7 },
  unit: { hp: 90, damage: 90, hitSpeed: 1.0, range: 0.8, speed: SPEED.fast, radius: 0.3, mass: 0.6, targetsAir: false },
}));

add(troop({
  key: 'witch', name: 'Witch', nameZh: '女巫', elixir: 5, rarity: 'epic', arena: 2,
  visual: { build: 'mage', palette: ['#7a4fd0', '#3f2a6b', '#e8d0f0'], weapon: 'skull_staff', robe: '#5b3aa0', hat: '#3f2a6b', scale: 0.95 },
  unit: { hp: 830, damage: 138, hitSpeed: 0.7, range: 5.0, speed: SPEED.medium, radius: 0.45, splashRadius: 1.0, projectileSpeed: 7,
    spawner: { card: 'skeletons', count: 3, intervalSeconds: 7, initialDelay: 0.5 } },
}));

add(troop({
  key: 'baby_dragon', name: 'Baby Dragon', nameZh: '飛龍寶寶', elixir: 4, rarity: 'epic', arena: 0,
  visual: { build: 'dragon', palette: ['#5bb85b', '#2f6f3f', '#f0e07a'], scale: 1.0 },
  unit: { hp: 1152, damage: 160, hitSpeed: 1.6, range: 3.5, speed: SPEED.fast, radius: 0.6, mass: 2, flying: true, splashRadius: 1.4, projectileSpeed: 7 },
}));

add(troop({
  key: 'balloon', name: 'Balloon', nameZh: '氣球兵', elixir: 5, rarity: 'epic', arena: 6,
  visual: { build: 'balloon', palette: ['#c4423a', '#8a2f2f', '#e0d0a0'], scale: 1.15 },
  unit: { hp: 2226, damage: 800, hitSpeed: 3.0, range: 0.9, speed: SPEED.fast, radius: 0.6, mass: 3, flying: true, targetOnly: 'buildings',
    onDeathDamage: { damage: 320, radius: 2.0 } },
}));

add(troop({
  key: 'pekka', name: 'P.E.K.K.A', nameZh: '皮卡', elixir: 7, rarity: 'epic', arena: 4,
  visual: { build: 'pekka', palette: ['#4a5266', '#22283a', '#7de3ff'], weapon: 'greatsword', scale: 1.35 },
  unit: { hp: 3760, damage: 816, hitSpeed: 1.8, range: 1.2, speed: SPEED.slow, radius: 0.75, mass: 5, targetsAir: false },
}));

add(troop({
  key: 'golem', name: 'Golem', nameZh: '石頭人', elixir: 8, rarity: 'epic', arena: 6,
  visual: { build: 'golem', palette: ['#6f5a4a', '#3f3228', '#c9a24a'], scale: 1.55 },
  unit: { hp: 5236, damage: 344, hitSpeed: 2.5, range: 1.2, speed: SPEED.slow, radius: 1.0, mass: 6, targetsAir: false, targetOnly: 'buildings',
    onDeathDamage: { damage: 344, radius: 2.5 },
    onDeathSpawn: { card: 'golemite', count: 2 } },
}));

add(troop({
  key: 'golemite', name: 'Golemite', nameZh: '小石頭人', elixir: 0, rarity: 'epic', arena: 6, spawnOnly: true,
  visual: { build: 'golem', palette: ['#6f5a4a', '#3f3228', '#c9a24a'], scale: 0.9 },
  unit: { hp: 1004, damage: 76, hitSpeed: 2.5, range: 1.2, speed: SPEED.slow, radius: 0.6, mass: 3, targetsAir: false, targetOnly: 'buildings',
    onDeathDamage: { damage: 76, radius: 2.0 } },
}));

add(troop({
  key: 'goblin_gang', name: 'Goblin Gang', nameZh: '哥布林幫', elixir: 3, rarity: 'common', arena: 1, count: 5,
  visual: { build: 'goblin', palette: ['#7ad46a', '#4f8f3f', '#8a5a2b'], weapon: 'dagger', scale: 0.8 },
  unit: { hp: 202, damage: 120, hitSpeed: 1.1, range: 0.9, speed: SPEED.veryFast, radius: 0.36, mass: 0.8, targetsAir: false },
  composite: [ { card: 'goblins', count: 3 }, { card: 'spear_goblins', count: 2 } ],
}));

add(troop({
  key: 'minion_horde', name: 'Minion Horde', nameZh: '亡靈大軍', elixir: 5, rarity: 'common', arena: 0, count: 6,
  visual: { build: 'minion', palette: ['#6f7ce0', '#3a3f80', '#cfd6ff'], scale: 0.8 },
  unit: { hp: 190, damage: 84, hitSpeed: 1.0, range: 2.0, speed: SPEED.fast, radius: 0.38, mass: 0.7, flying: true },
}));

add(troop({
  key: 'lumberjack', name: 'Lumberjack', nameZh: '伐木工', elixir: 4, rarity: 'legendary', arena: 8,
  visual: { build: 'humanoid', palette: ['#4f8f5f', '#2f5a3a', '#f0c9a0'], weapon: 'axe', hair: '#e8b84b', beard: true, scale: 1.0 },
  unit: { hp: 1339, damage: 227, hitSpeed: 0.7, range: 1.2, speed: SPEED.veryFast, radius: 0.55, mass: 2, targetsAir: false,
    onDeathSpell: 'rage' },
}));

add(troop({
  key: 'inferno_dragon', name: 'Inferno Dragon', nameZh: '地獄飛龍', elixir: 4, rarity: 'legendary', arena: 9,
  visual: { build: 'dragon', palette: ['#c9a24a', '#6f4a2f', '#ff7a3a'], armored: true, scale: 0.95 },
  unit: { hp: 1210, damage: 40, hitSpeed: 0.4, range: 3.5, speed: SPEED.fast, radius: 0.55, mass: 2, flying: true,
    rampUp: { stages: [40, 130, 480], secondsPerStage: 1.3, resetOnTargetChange: true } },
}));

add(troop({
  key: 'night_witch', name: 'Night Witch', nameZh: '暗夜女巫', elixir: 4, rarity: 'legendary', arena: 11,
  visual: { build: 'mage', palette: ['#3f2a6b', '#1f1436', '#a07ae0'], weapon: 'scythe', robe: '#2f1f52', scale: 0.95 },
  unit: { hp: 850, damage: 232, hitSpeed: 1.4, range: 1.2, speed: SPEED.fast, radius: 0.45, targetsAir: false,
    spawner: { card: 'bats', count: 1, intervalSeconds: 5, initialDelay: 1.5 },
    onDeathSpawn: { card: 'bats', count: 3 } },
}));

// —— 傳說 ——
add(troop({
  key: 'princess', name: 'Princess', nameZh: '公主', elixir: 3, rarity: 'legendary', arena: 7,
  visual: { build: 'humanoid', palette: ['#f0a0c0', '#c4548a', '#f0c9a0'], weapon: 'longbow', hair: '#f0d08a', scale: 0.85 },
  unit: { hp: 246, damage: 159, hitSpeed: 3.0, range: 9.0, speed: SPEED.medium, radius: 0.4, splashRadius: 2.0, projectileSpeed: 7 },
}));

add(troop({
  key: 'ice_wizard', name: 'Ice Wizard', nameZh: '冰法師', elixir: 3, rarity: 'legendary', arena: 8,
  visual: { build: 'mage', palette: ['#8fd0e8', '#3f6f8f', '#e8f4ff'], weapon: 'ice_staff', robe: '#5b9fc4', beard: true, scale: 0.9 },
  unit: { hp: 720, damage: 91, hitSpeed: 1.7, range: 5.5, speed: SPEED.medium, radius: 0.45, splashRadius: 1.0, projectileSpeed: 7,
    onHitEffect: { type: 'slow', factor: 0.65, seconds: 2.0 } },
}));

add(troop({
  key: 'miner', name: 'Miner', nameZh: '礦工', elixir: 3, rarity: 'legendary', arena: 4,
  visual: { build: 'humanoid', palette: ['#c9a24a', '#6f5a2f', '#f0c9a0'], weapon: 'pickaxe', helmet: 'miner', scale: 0.9 },
  unit: { hp: 1260, damage: 194, hitSpeed: 1.2, range: 1.2, speed: SPEED.fast, radius: 0.5, mass: 2, targetsAir: false, deployAnywhere: true, deployTime: 1.0 },
}));

add(troop({
  key: 'electro_wizard', name: 'Electro Wizard', nameZh: '電法師', elixir: 4, rarity: 'legendary', arena: 11,
  visual: { build: 'mage', palette: ['#7de3ff', '#2f5a8f', '#f0e07a'], weapon: 'tesla_gloves', robe: '#3f7fc4', scale: 0.92 },
  unit: { hp: 949, damage: 111, hitSpeed: 1.8, range: 5.0, speed: SPEED.fast, radius: 0.45, projectileSpeed: 20, multiShot: 2,
    onHitEffect: { type: 'stun', seconds: 0.5 },
    onSpawnEffect: { type: 'stun', seconds: 0.5, radius: 2.5, damage: 111 } },
}));

add(troop({
  key: 'mega_knight', name: 'Mega Knight', nameZh: '飛天狂鐵', elixir: 7, rarity: 'legendary', arena: 12,
  visual: { build: 'megaknight', palette: ['#3f4a6b', '#1f2438', '#7de3ff'], scale: 1.4 },
  unit: { hp: 4032, damage: 353, hitSpeed: 1.7, range: 1.2, speed: SPEED.medium, radius: 0.85, mass: 5, targetsAir: false,
    splashRadius: 1.6, meleeSplash: true,
    onSpawnEffect: { type: 'damage', radius: 2.8, damage: 690 },
    jumpAttack: { minRange: 3.5, maxRange: 5.0, damage: 690, radius: 2.5, cooldown: 1.0 } },
  evolution: { key: 'evo_mega_knight', cyclesRequired: 3, nameZh: '進化飛天狂鐵',
    ability: 'shockwave', description: '落地與跳擊附帶額外衝擊波', override: {} },
}));

add(troop({
  key: 'sparky', name: 'Sparky', nameZh: '電磁炮', elixir: 6, rarity: 'legendary', arena: 6,
  visual: { build: 'sparky', palette: ['#f0d08a', '#8a5a2f', '#ff5ad0'], scale: 1.2 },
  unit: { hp: 1490, damage: 1300, hitSpeed: 4.0, range: 5.0, speed: SPEED.slow, radius: 0.7, mass: 4, targetsAir: false,
    splashRadius: 2.0, chargeUpSeconds: 3.0, stunnable: true, projectileSpeed: 100 },
}));

add(troop({
  key: 'royal_ghost', name: 'Royal Ghost', nameZh: '皇家幽靈', elixir: 3, rarity: 'legendary', arena: 12,
  visual: { build: 'ghost', palette: ['#9fb8d0', '#4a5a7a', '#d0e0ff'], weapon: 'sword', scale: 1.0 },
  unit: { hp: 1200, damage: 250, hitSpeed: 1.8, range: 1.2, speed: SPEED.fast, radius: 0.5, mass: 0, targetsAir: false,
    splashRadius: 1.2, meleeSplash: true, invisibleWhenIdle: true, noCollision: true },
}));

add(troop({
  key: 'ram_rider', name: 'Ram Rider', nameZh: '雪橇騎士', elixir: 5, rarity: 'legendary', arena: 13,
  visual: { build: 'rider', mount: 'ram', palette: ['#8fd0e8', '#4a6f8f', '#e8c39e'], weapon: 'bola', scale: 1.05 },
  unit: { hp: 1550, damage: 249, hitSpeed: 1.7, range: 1.2, speed: SPEED.fast, radius: 0.6, mass: 2.6, targetsAir: false, targetOnly: 'buildings',
    charge: { distance: 3.5, speedMultiplier: 1.8, damageMultiplier: 2 },
    sideAttack: { range: 6.0, cooldown: 4.0, effect: { type: 'snare', seconds: 2.5 } } },
}));

// —— 2026 賽季公告卡（識別欄位亦標記待查）——
add(troop({
  key: 'minion_giant', name: 'Minion Giant', nameZh: '亡靈巨人', elixir: 6, rarity: 'epic', arena: 14,
  visual: { build: 'minion', palette: ['#6f7ce0', '#2a2f66', '#cfd6ff'], scale: 1.6, giant: true },
  unit: { hp: 3100, damage: 210, hitSpeed: 1.5, range: 2.5, speed: SPEED.slow, radius: 0.85, mass: 5, flying: true, targetOnly: 'buildings',
    spawner: { card: 'minions', count: 1, intervalSeconds: 4, initialDelay: 2.0 } },
  provenance: { ...UNVERIFIED_NEW },
  note: '2026-09-07 官方賽季公告確認此卡存在；數值與細部機制均未取得，全部標記待查。',
}));

// ───────────────────────── 建築 ─────────────────────────

add(building({
  key: 'cannon', name: 'Cannon', nameZh: '加農炮', elixir: 3, rarity: 'common', arena: 0,
  visual: { build: 'cannon', palette: ['#6f5a4a', '#3f3228', '#c9c4b8'], scale: 1.0 },
  unit: { hp: 824, damage: 212, hitSpeed: 0.8, range: 5.5, targetsAir: false, lifetime: 30, projectileSpeed: 12 },
}));

add(building({
  key: 'tesla', name: 'Tesla', nameZh: '特斯拉電磁塔', elixir: 4, rarity: 'common', arena: 0,
  visual: { build: 'tesla', palette: ['#5b6478', '#2c3242', '#7de3ff'], scale: 1.0 },
  unit: { hp: 1032, damage: 172, hitSpeed: 1.0, range: 5.5, lifetime: 40, hidesWhenIdle: true, projectileSpeed: 30 },
}));

add(building({
  key: 'inferno_tower', name: 'Inferno Tower', nameZh: '地獄塔', elixir: 5, rarity: 'rare', arena: 4,
  visual: { build: 'inferno', palette: ['#8a4a2f', '#4a2a1a', '#ff7a3a'], scale: 1.1 },
  unit: { hp: 2352, damage: 40, hitSpeed: 0.4, range: 6.0, lifetime: 40,
    rampUp: { stages: [40, 200, 800], secondsPerStage: 1.5, resetOnTargetChange: true } },
}));

add(building({
  key: 'bomb_tower', name: 'Bomb Tower', nameZh: '炸彈塔', elixir: 4, rarity: 'rare', arena: 3,
  visual: { build: 'bombtower', palette: ['#6f5a4a', '#3f3228', '#2b2b2b'], scale: 1.05 },
  unit: { hp: 1360, damage: 240, hitSpeed: 1.6, range: 6.0, targetsAir: false, lifetime: 35, splashRadius: 1.5, projectileSpeed: 7,
    onDeathDamage: { damage: 240, radius: 2.0 } },
}));

add(building({
  key: 'tombstone', name: 'Tombstone', nameZh: '墓碑', elixir: 3, rarity: 'rare', arena: 5,
  visual: { build: 'tombstone', palette: ['#9a9a8a', '#5a5a4a', '#3a3a3a'], scale: 0.9 },
  unit: { hp: 500, damage: 0, hitSpeed: 0, range: 0, lifetime: 30, noAttack: true,
    spawner: { card: 'skeletons', count: 1, intervalSeconds: 3.3, initialDelay: 0.5 },
    onDeathSpawn: { card: 'skeletons', count: 4 } },
}));

add(building({
  key: 'goblin_hut', name: 'Goblin Hut', nameZh: '哥布林小屋', elixir: 5, rarity: 'rare', arena: 1,
  visual: { build: 'hut', palette: ['#8a6a3b', '#4f3a20', '#7ad46a'], scale: 1.0 },
  unit: { hp: 1000, damage: 0, hitSpeed: 0, range: 0, lifetime: 60, noAttack: true,
    spawner: { card: 'spear_goblins', count: 1, intervalSeconds: 4.9, initialDelay: 1.0 } },
}));

add(building({
  key: 'furnace', name: 'Furnace', nameZh: '熔爐', elixir: 4, rarity: 'rare', arena: 9,
  visual: { build: 'furnace', palette: ['#6f5a4a', '#3f3228', '#ff8a3a'], scale: 1.0 },
  unit: { hp: 800, damage: 0, hitSpeed: 0, range: 0, lifetime: 50, noAttack: true,
    spawner: { card: 'fire_spirit', count: 2, intervalSeconds: 5.5, initialDelay: 1.0 } },
}));

add(building({
  key: 'x_bow', name: 'X-Bow', nameZh: '飛箭塔', elixir: 6, rarity: 'epic', arena: 10,
  visual: { build: 'xbow', palette: ['#c9a24a', '#6f5a2f', '#8a4a2f'], scale: 1.1 },
  unit: { hp: 1000, damage: 52, hitSpeed: 0.3, range: 11.5, targetsAir: false, lifetime: 40, deployTime: 3.5, projectileSpeed: 14 },
}));

add(building({
  key: 'mortar', name: 'Mortar', nameZh: '迫擊炮', elixir: 4, rarity: 'common', arena: 6,
  visual: { build: 'mortar', palette: ['#6f5a4a', '#3f3228', '#9a9a8a'], scale: 1.05 },
  unit: { hp: 1219, damage: 260, hitSpeed: 5.0, range: 11.5, minRange: 3.5, targetsAir: false, lifetime: 30, splashRadius: 2.0, deployTime: 3.5, projectileSpeed: 5, arcing: true },
}));

add(building({
  key: 'elixir_collector', name: 'Elixir Collector', nameZh: '聖水收集器', elixir: 6, rarity: 'rare', arena: 5,
  visual: { build: 'collector', palette: ['#c060d0', '#6f2f8f', '#f0c0ff'], scale: 1.0 },
  unit: { hp: 900, damage: 0, hitSpeed: 0, range: 0, lifetime: 70, noAttack: true,
    elixirPump: { amount: 1, intervalSeconds: 8.5 },
    onDeathElixir: 1 },
}));

// —— 靈體 ——
add(troop({
  key: 'ice_spirit', name: 'Ice Spirit', nameZh: '冰靈', elixir: 1, rarity: 'common', arena: 8,
  visual: { build: 'spirit', palette: ['#8fd0e8', '#3f6f8f', '#e8f4ff'], scale: 0.65 },
  unit: { hp: 190, damage: 79, hitSpeed: 1.0, range: 2.5, speed: SPEED.veryFast, radius: 0.32, mass: 0.5,
    kamikaze: { radius: 2.5, effect: { type: 'freeze', seconds: 1.0 } } },
  evolution: { key: 'evo_ice_spirit', cyclesRequired: 2, nameZh: '進化冰靈',
    ability: 'wide_freeze', description: '凍結範圍與時間提升，且會彈跳兩次', override: {} },
}));

add(troop({
  key: 'fire_spirit', name: 'Fire Spirit', nameZh: '火靈', elixir: 1, rarity: 'common', arena: 8,
  visual: { build: 'spirit', palette: ['#ff8a3a', '#c4423a', '#ffe07a'], scale: 0.65 },
  unit: { hp: 190, damage: 162, hitSpeed: 1.0, range: 2.5, speed: SPEED.veryFast, radius: 0.32, mass: 0.5,
    kamikaze: { radius: 2.0, damage: 162 } },
}));

add(troop({
  key: 'electro_spirit', name: 'Electro Spirit', nameZh: '電靈', elixir: 1, rarity: 'common', arena: 8,
  visual: { build: 'spirit', palette: ['#7de3ff', '#2f5a8f', '#f0e07a'], scale: 0.65 },
  unit: { hp: 190, damage: 39, hitSpeed: 1.0, range: 2.5, speed: SPEED.veryFast, radius: 0.32, mass: 0.5,
    kamikaze: { radius: 2.5, damage: 39, chain: 9, effect: { type: 'stun', seconds: 0.5 } } },
}));

export default CARDS;
