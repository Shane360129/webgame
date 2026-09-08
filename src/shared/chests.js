/**
 * 寶箱資料模型。
 *
 * 查核文件第 6 節明確要求欄位：
 *   chest_id, version_date, arena_range, eligible_card_rule,
 *   reward_pool, guarantees, probability_table, choice_count, source_url
 * 並要求「分支機率加總、保底條件、數量單位、已解鎖卡池與新卡排除期」可被檢核，
 * 且「官方頁面若有表格口徑不明或總數不一致，保留原始值並標記待查，
 * 不自行修正成看似合理的數字」。
 *
 * 因此：
 *   1. 下列機率表是本專案自訂的**可運作模型**，version_date 為 null，
 *      每筆都帶 verified: false。這不是官方掉落率。
 *   2. validateChestTables() 會回報加總偏差，但**不會**自動正規化。
 *      偏差超過容許值時標記為 needsReview，交由人工對照官方頁面。
 */

import { SOURCES } from './rules.js';

const SRC = SOURCES.chests;

/** eligible_card_rule 的可用規則，由開箱器解讀。 */
export const ELIGIBLE_RULES = {
  UNLOCKED_BY_ARENA: 'unlocked_by_arena',
  UNLOCKED_AND_NOT_NEW: 'unlocked_by_arena_excluding_new_release_window',
  EVOLUTION_ONLY: 'evolution_shards_only',
  CHAMPION_ONLY: 'champion_only',
};

/** 新卡排除期（天）：新發布卡在此期間不進一般寶箱池。 */
export const NEW_RELEASE_EXCLUSION_DAYS = 14;

function chest(def) {
  return {
    version_date: null,
    choice_count: 0,
    source_url: SRC,
    verified: false,
    ...def,
  };
}

/**
 * probability_table：稀有度分支。value 為該分支被抽中的機率。
 * guarantees：保底，counter 表示每 N 次必出一次。
 */
export const CHESTS = {
  silver: chest({
    chest_id: 'silver',
    nameZh: '銀寶箱',
    arena_range: [0, 23],
    eligible_card_rule: ELIGIBLE_RULES.UNLOCKED_AND_NOT_NEW,
    unlock_hours: 3,
    reward_pool: { gold: [40, 90], cards: 12 },
    probability_table: { common: 0.8, rare: 0.17, epic: 0.025, legendary: 0.005 },
    guarantees: [
      { rarity: 'rare', everyNCards: 10 },
      { rarity: 'epic', everyNChests: 6 },
    ],
  }),

  golden: chest({
    chest_id: 'golden',
    nameZh: '金寶箱',
    arena_range: [0, 23],
    eligible_card_rule: ELIGIBLE_RULES.UNLOCKED_AND_NOT_NEW,
    unlock_hours: 8,
    reward_pool: { gold: [110, 240], cards: 28 },
    probability_table: { common: 0.77, rare: 0.19, epic: 0.032, legendary: 0.008 },
    guarantees: [
      { rarity: 'rare', everyNCards: 8 },
      { rarity: 'epic', everyNChests: 4 },
    ],
  }),

  giant: chest({
    chest_id: 'giant',
    nameZh: '巨型寶箱',
    arena_range: [0, 23],
    eligible_card_rule: ELIGIBLE_RULES.UNLOCKED_AND_NOT_NEW,
    unlock_hours: 12,
    reward_pool: { gold: [260, 520], cards: 110 },
    probability_table: { common: 0.85, rare: 0.13, epic: 0.017, legendary: 0.003 },
    guarantees: [{ rarity: 'epic', everyNChests: 2 }],
  }),

  magical: chest({
    chest_id: 'magical',
    nameZh: '魔法寶箱',
    arena_range: [0, 23],
    eligible_card_rule: ELIGIBLE_RULES.UNLOCKED_AND_NOT_NEW,
    unlock_hours: 12,
    reward_pool: { gold: [520, 900], cards: 66 },
    probability_table: { common: 0.6, rare: 0.28, epic: 0.1, legendary: 0.02 },
    guarantees: [
      { rarity: 'epic', everyNChests: 1 },
      { rarity: 'legendary', everyNChests: 6 },
    ],
  }),

  /** Choice Chest：官方資訊頁列有此類別，開箱時需玩家選擇。 */
  choice: chest({
    chest_id: 'choice',
    nameZh: '抉擇寶箱',
    arena_range: [3, 23],
    eligible_card_rule: ELIGIBLE_RULES.UNLOCKED_AND_NOT_NEW,
    unlock_hours: 8,
    reward_pool: { gold: [200, 400], cards: 40 },
    probability_table: { common: 0.62, rare: 0.28, epic: 0.09, legendary: 0.01 },
    guarantees: [{ rarity: 'epic', everyNChests: 2 }],
    /** 玩家從 3 組候選中挑 1 組。 */
    choice_count: 3,
    choice_group_size: 3,
  }),

  /** Lucky Chest：內容物本身是隨機的箱種。 */
  lucky: chest({
    chest_id: 'lucky',
    nameZh: '幸運寶箱',
    arena_range: [3, 23],
    eligible_card_rule: ELIGIBLE_RULES.UNLOCKED_AND_NOT_NEW,
    unlock_hours: 6,
    reward_pool: { rollsChest: true },
    /** 這裡的分支是「開出哪一種箱」，不是稀有度。 */
    probability_table: { silver: 0.45, golden: 0.35, giant: 0.12, magical: 0.08 },
    branch_kind: 'chest',
    guarantees: [],
  }),

  /** Evolution Box：只給進化碎片。 */
  evolution: chest({
    chest_id: 'evolution',
    nameZh: '進化寶箱',
    arena_range: [10, 23],
    eligible_card_rule: ELIGIBLE_RULES.EVOLUTION_ONLY,
    unlock_hours: 12,
    reward_pool: { evolutionShards: [1, 6] },
    probability_table: { evolution_shard: 1.0 },
    branch_kind: 'evolution',
    guarantees: [{ rarity: 'evolution_shard', everyNChests: 1 }],
  }),

  /** Hero / Champion Box。 */
  hero: chest({
    chest_id: 'hero',
    nameZh: '英雄寶箱',
    arena_range: [13, 23],
    eligible_card_rule: ELIGIBLE_RULES.CHAMPION_ONLY,
    unlock_hours: 12,
    reward_pool: { championCards: [1, 12] },
    probability_table: { champion: 1.0 },
    branch_kind: 'champion',
    guarantees: [{ rarity: 'champion', everyNChests: 1 }],
  }),
};

/**
 * 驗證所有機率表加總。
 * 不做自動正規化 —— 偏差保留原值並標記 needsReview。
 */
export function validateChestTables(tolerance = 1e-9) {
  const results = [];
  for (const c of Object.values(CHESTS)) {
    const entries = Object.entries(c.probability_table);
    const sum = entries.reduce((a, [, v]) => a + v, 0);
    const delta = sum - 1;
    results.push({
      chest_id: c.chest_id,
      branches: entries.length,
      sum,
      delta,
      ok: Math.abs(delta) <= tolerance,
      needsReview: Math.abs(delta) > tolerance,
      version_date: c.version_date,
      verified: c.verified,
      source_url: c.source_url,
    });
  }
  return results;
}

/** 依競技場過濾可開出的箱種。 */
export function chestsForArena(arena) {
  return Object.values(CHESTS).filter(
    (c) => arena >= c.arena_range[0] && arena <= c.arena_range[1],
  );
}

export default CHESTS;
