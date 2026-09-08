/**
 * 開箱器：依 chest_id、競技場、已解鎖卡池、保底計數與版本限定條件產生獎勵。
 *
 * 這裡刻意**不使用**單一均勻亂數代表所有卡包（查核文件第 5、6 節的要求），
 * 而是：
 *   1. 先以 probability_table 抽稀有度分支
 *   2. 保底計數器可覆寫分支結果
 *   3. 再從「該稀有度 ∩ 競技場已解鎖 ∩ 非新卡排除期」的卡池抽卡
 *   4. 數量單位分開結算（卡片張數 / 金幣 / 碎片）
 */

import { CHESTS, ELIGIBLE_RULES, NEW_RELEASE_EXCLUSION_DAYS } from './chests.js';
import { ALL_CARDS, CHAMPION_KEYS, EVOLUTION_KEYS } from './catalogue.js';

/** 可重現的亂數（同 seed 同結果），方便測試機率分布。 */
export function makeRng(seed = 1) {
  let s = seed >>> 0 || 1;
  return function rng() {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0xffffffff;
  };
}

function pickBranch(table, r) {
  let acc = 0;
  for (const [k, p] of Object.entries(table)) {
    acc += p;
    if (r < acc) return k;
  }
  return Object.keys(table)[Object.keys(table).length - 1];
}

/**
 * 依 eligible_card_rule 建立卡池。
 * @param {string} rule
 * @param {number} arena 玩家目前競技場
 * @param {number} nowMs
 */
export function eligibleCards(rule, arena, nowMs = Date.now()) {
  const all = Object.values(ALL_CARDS).filter((c) => !c.spawnOnly);

  if (rule === ELIGIBLE_RULES.CHAMPION_ONLY) {
    return CHAMPION_KEYS.slice();
  }
  if (rule === ELIGIBLE_RULES.EVOLUTION_ONLY) {
    return EVOLUTION_KEYS.slice();
  }

  const excludeNew = rule === ELIGIBLE_RULES.UNLOCKED_AND_NOT_NEW;
  return all
    .filter((c) => !c.isChampion)
    .filter((c) => (c.arena ?? 0) <= arena)
    .filter((c) => {
      if (!excludeNew) return true;
      const rel = c.releasedAt ? Date.parse(c.releasedAt) : null;
      if (!rel) return true;
      return nowMs - rel > NEW_RELEASE_EXCLUSION_DAYS * 86400_000;
    })
    .map((c) => c.key);
}

/**
 * 開一個箱。
 * @param {object} opts
 * @param {string} opts.chestId
 * @param {number} opts.arena
 * @param {object} opts.counters 持久化的保底計數器 { [chestId]: {chests, cardsSinceRare, ...} }
 * @param {function} opts.rng
 */
export function openChest({ chestId, arena = 0, counters = {}, rng = makeRng(Date.now()), nowMs = Date.now(), depth = 0 }) {
  const chest = CHESTS[chestId];
  if (!chest) throw new Error(`unknown chest: ${chestId}`);

  // Lucky Chest：先抽出實際箱種，再遞迴開箱。
  if (chest.branch_kind === 'chest') {
    if (depth > 3) throw new Error('lucky chest recursion too deep');
    const inner = pickBranch(chest.probability_table, rng());
    const result = openChest({ chestId: inner, arena, counters, rng, nowMs, depth: depth + 1 });
    return { ...result, via: chest.chest_id, rolledChest: inner };
  }

  const state = counters[chestId] || (counters[chestId] = { chests: 0, cardsSinceRare: 0, cardsSinceEpic: 0 });
  state.chests += 1;

  const pool = eligibleCards(chest.eligible_card_rule, arena, nowMs);
  const byRarity = {};
  for (const key of pool) {
    const r = ALL_CARDS[key].rarity;
    (byRarity[r] ||= []).push(key);
  }

  const rewards = { chest_id: chestId, gold: 0, cards: [], evolutionShards: 0, championCards: 0, choices: null };

  if (chest.reward_pool.gold) {
    const [lo, hi] = chest.reward_pool.gold;
    rewards.gold = Math.floor(lo + rng() * (hi - lo + 1));
  }
  if (chest.reward_pool.evolutionShards) {
    const [lo, hi] = chest.reward_pool.evolutionShards;
    rewards.evolutionShards = Math.floor(lo + rng() * (hi - lo + 1));
    rewards.cards = pickN(byRarity, chest, pool, rewards.evolutionShards, state, rng, 'evolution_shard');
    return rewards;
  }
  if (chest.reward_pool.championCards) {
    const [lo, hi] = chest.reward_pool.championCards;
    rewards.championCards = Math.floor(lo + rng() * (hi - lo + 1));
    const list = pool.length ? pool : CHAMPION_KEYS;
    rewards.cards = [{ card: list[Math.floor(rng() * list.length)], count: rewards.championCards, rarity: 'champion' }];
    return rewards;
  }

  const totalCards = chest.reward_pool.cards || 0;
  const stacks = distributeCards(chest, byRarity, totalCards, state, rng);

  if (chest.choice_count > 0) {
    // 抉擇寶箱：產生 choice_count 組候選，玩家挑一組。
    const groups = [];
    for (let i = 0; i < chest.choice_count; i += 1) {
      groups.push(distributeCards(chest, byRarity, totalCards, { ...state }, rng));
    }
    rewards.choices = groups;
    rewards.cards = [];
  } else {
    rewards.cards = stacks;
  }
  return rewards;
}

function pickN(byRarity, chest, pool, n, state, rng, rarityLabel) {
  if (!pool.length) return [];
  const key = pool[Math.floor(rng() * pool.length)];
  return [{ card: key, count: n, rarity: rarityLabel }];
}

function distributeCards(chest, byRarity, totalCards, state, rng) {
  const stacks = new Map();
  let remaining = totalCards;
  let guard = 0;

  while (remaining > 0 && guard++ < 500) {
    let rarity = pickBranch(chest.probability_table, rng());

    // 保底：everyNCards 以「已發出的卡片張數」計。
    for (const g of chest.guarantees) {
      if (!g.everyNCards) continue;
      const counterKey = `cardsSince_${g.rarity}`;
      state[counterKey] = state[counterKey] || 0;
      if (state[counterKey] >= g.everyNCards) rarity = g.rarity;
    }
    if (!byRarity[rarity] || !byRarity[rarity].length) rarity = 'common';
    if (!byRarity[rarity] || !byRarity[rarity].length) break;

    const list = byRarity[rarity];
    const card = list[Math.floor(rng() * list.length)];

    // 一疊的張數依稀有度不同（單位是「張」，與金幣分開結算）。
    const stackSize = rarity === 'common' ? Math.min(remaining, 4 + Math.floor(rng() * 8))
      : rarity === 'rare' ? Math.min(remaining, 2 + Math.floor(rng() * 4))
        : 1;

    stacks.set(card, (stacks.get(card) || 0) + stackSize);
    remaining -= stackSize;

    for (const g of chest.guarantees) {
      if (!g.everyNCards) continue;
      const counterKey = `cardsSince_${g.rarity}`;
      state[counterKey] = rarity === g.rarity ? 0 : (state[counterKey] || 0) + stackSize;
    }
  }

  // everyNChests 保底：整箱結算時強制塞入一張。
  for (const g of chest.guarantees) {
    if (!g.everyNChests) continue;
    if (state.chests % g.everyNChests !== 0) continue;
    const list = byRarity[g.rarity];
    if (!list || !list.length) continue;
    const card = list[Math.floor(rng() * list.length)];
    stacks.set(card, (stacks.get(card) || 0) + 1);
  }

  return [...stacks].map(([card, count]) => ({
    card, count, rarity: ALL_CARDS[card]?.rarity ?? 'common',
  }));
}
