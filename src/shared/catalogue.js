/**
 * 單一卡牌目錄入口：合併部隊／建築／法術／冠軍／塔兵，
 * 並提供分類計數，讓查核文件第 8 節「名單完整」門檻可以被程式檢查。
 *
 * 重要：這裡的計數是「本重製專案實作的內容」，
 * 不是原作當期完整名單。兩者刻意分開，避免用實作數量冒充官方總數。
 */

import { CARDS as TROOP_AND_BUILDING } from './cards.js';
import { SPELL_CARDS, CHAMPION_CARDS, TOWER_TROOPS, SPAWN_ONLY } from './cards-spells.js';

/** 補上留在 cards.js 之外的進化定義（騎士與弓箭手）。 */
const EXTRA_EVOLUTIONS = {
  knight: {
    key: 'evo_knight', cyclesRequired: 2, nameZh: '進化騎士',
    ability: 'damage_reduction_aura',
    description: '受到的傷害降低，並在周身產生傷害光環',
    params: { damageReduction: 0.4, auraRadius: 2.2, auraDps: 90 },
    override: {},
  },
  archers: {
    key: 'evo_archers', cyclesRequired: 2, nameZh: '進化弓箭手',
    ability: 'charged_first_shot',
    description: '換目標後的第一發為三連射並附帶擊退',
    params: { volley: 3, knockback: 0.6 },
    override: {},
  },
};

for (const [key, evo] of Object.entries(EXTRA_EVOLUTIONS)) {
  if (TROOP_AND_BUILDING[key]) TROOP_AND_BUILDING[key].evolution = evo;
}

/** 所有可被模擬器生成的卡（含僅供召喚的單位）。 */
export const ALL_CARDS = {
  ...TROOP_AND_BUILDING,
  ...SPELL_CARDS,
  ...CHAMPION_CARDS,
  ...SPAWN_ONLY,
};

export { TOWER_TROOPS };

/** 可放入卡組的一般 8 格卡（排除冠軍、塔兵、召喚專用）。 */
export const DECK_ELIGIBLE = Object.values(ALL_CARDS)
  .filter((c) => !c.spawnOnly && !c.isChampion)
  .map((c) => c.key)
  .sort();

export const CHAMPION_KEYS = Object.keys(CHAMPION_CARDS).sort();
export const TOWER_TROOP_KEYS = Object.keys(TOWER_TROOPS).sort();

/** 有進化型態的卡。 */
export const EVOLUTION_KEYS = Object.values(ALL_CARDS)
  .filter((c) => c.evolution)
  .map((c) => c.key)
  .sort();

export function getCard(key) {
  const c = ALL_CARDS[key];
  if (!c) throw new Error(`unknown card: ${key}`);
  return c;
}

/**
 * 涵蓋狀態報表。
 * 查核文件要求「基礎卡、進化、Hero、Champion、塔兵、活動變體分開計數」，
 * 所以這裡分開回報，並明確標示 officialTotalKnown = false。
 */
export function coverageReport() {
  const byKind = { troop: 0, building: 0, spell: 0 };
  const byRarity = {};
  let statsVerified = 0;
  let identityVerified = 0;
  const deckable = [];

  for (const card of Object.values(ALL_CARDS)) {
    if (card.spawnOnly) continue;
    if (card.isChampion) continue;
    byKind[card.kind] = (byKind[card.kind] || 0) + 1;
    byRarity[card.rarity] = (byRarity[card.rarity] || 0) + 1;
    if (card.provenance?.statsVerified) statsVerified += 1;
    if (card.provenance?.identityVerified) identityVerified += 1;
    deckable.push(card.key);
  }

  return {
    implemented: {
      deckEligible: deckable.length,
      byKind,
      byRarity,
      evolutions: EVOLUTION_KEYS.length,
      champions: CHAMPION_KEYS.length,
      towerTroops: TOWER_TROOP_KEYS.length,
      spawnOnly: Object.values(ALL_CARDS).filter((c) => c.spawnOnly).length,
    },
    provenance: {
      identityVerified,
      statsVerified,
      statsUnverified: deckable.length - statsVerified,
      pinnedBalanceVersion: null,
    },
    officialTotalKnown: false,
    note: '本表是「本專案已實作」的計數。查核當日無法在此環境取得固定版本的官方完整名單，'
      + '因此無法宣稱與原作當期內容逐項對齊；差額未知，不以實作數量代表官方總數。',
  };
}

export default ALL_CARDS;
