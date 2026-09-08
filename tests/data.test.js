/**
 * 資料完整性與寶箱模型的檢核。
 *
 * 重點不是「數字對不對」（那需要固定版本的官方匯出檔），
 * 而是「資料結構是否誠實可稽核」：
 * 每張卡都必須帶 provenance，未驗證就必須標記為未驗證。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ALL_CARDS, TOWER_TROOPS, DECK_ELIGIBLE, CHAMPION_KEYS, EVOLUTION_KEYS, coverageReport } from '../src/shared/catalogue.js';
import { CHESTS, validateChestTables, chestsForArena } from '../src/shared/chests.js';
import { openChest, makeRng, eligibleCards } from '../src/shared/chest-open.js';
import { ELIGIBLE_RULES } from '../src/shared/chests.js';

test('每張卡都有 provenance，且戰鬥數值目前一律標記未驗證', () => {
  for (const card of Object.values(ALL_CARDS)) {
    assert.ok(card.provenance, `${card.key} 缺少 provenance`);
    assert.equal(typeof card.provenance.statsVerified, 'boolean', `${card.key}`);
    assert.equal(card.provenance.statsVerified, false,
      `${card.key} 標記為已驗證，但本專案沒有固定版本的匯出檔可以佐證`);
    assert.equal(card.provenance.versionDate, null, `${card.key} 不應宣稱對應到某個版本`);
    assert.ok(card.provenance.source, `${card.key} 缺少來源標記`);
  }
});

test('涵蓋報表不宣稱知道官方總數', () => {
  const c = coverageReport();
  assert.equal(c.officialTotalKnown, false);
  assert.equal(c.provenance.pinnedBalanceVersion, null);
  assert.equal(c.provenance.statsVerified, 0);
  assert.ok(c.note.length > 20);
});

test('分類計數彼此獨立，不把實作數量當官方總數', () => {
  const c = coverageReport();
  const sum = c.implemented.byKind.troop + c.implemented.byKind.building + c.implemented.byKind.spell;
  assert.equal(sum, c.implemented.deckEligible);
  assert.equal(c.implemented.champions, CHAMPION_KEYS.length);
  assert.equal(c.implemented.towerTroops, Object.keys(TOWER_TROOPS).length);
  assert.equal(c.implemented.evolutions, EVOLUTION_KEYS.length);
});

test('2026 賽季公告卡的識別欄位標記為待查', () => {
  const mg = ALL_CARDS.minion_giant;
  assert.ok(mg, 'Minion Giant 應存在（官方公告已確認）');
  assert.equal(mg.provenance.identityVerified, false);
  assert.ok(mg.note && mg.note.includes('待查'));
});

test('可入卡組清單排除冠軍與召喚專用單位', () => {
  for (const key of DECK_ELIGIBLE) {
    assert.equal(ALL_CARDS[key].isChampion, undefined, `${key} 不應出現在一般卡槽`);
    assert.notEqual(ALL_CARDS[key].spawnOnly, true, `${key} 是召喚專用`);
  }
  assert.ok(CHAMPION_KEYS.every((k) => !DECK_ELIGIBLE.includes(k)));
});

test('每張部隊 / 建築卡都有必要的戰鬥欄位', () => {
  for (const key of DECK_ELIGIBLE) {
    const c = ALL_CARDS[key];
    if (c.kind === 'spell') continue;
    const u = c.unit;
    assert.ok(u, `${key} 缺少 unit`);
    assert.equal(typeof u.hp, 'number', `${key}.hp`);
    assert.ok(u.hp > 0, `${key}.hp`);
    assert.equal(typeof u.damage, 'number', `${key}.damage`);
    if (!u.noAttack) assert.ok(u.hitSpeed > 0, `${key}.hitSpeed`);
    assert.ok(typeof u.range === 'number', `${key}.range`);
  }
});

test('每張法術都有明確的投放型態，不是全部立即結算', () => {
  const deliveries = new Set();
  for (const key of DECK_ELIGIBLE) {
    const c = ALL_CARDS[key];
    if (c.kind !== 'spell') continue;
    assert.ok(c.spell.delivery, `${key} 缺少 delivery`);
    deliveries.add(c.spell.delivery);
  }
  assert.ok(deliveries.size >= 5, `投放型態只有 ${[...deliveries].join(',')}`);
  assert.ok(deliveries.has('rolling'));
  assert.ok(deliveries.has('aura'));
  assert.ok(deliveries.has('spawn'));
  assert.ok(deliveries.has('waves'));
  assert.equal(deliveries.has('instant'), true);
  const instantCount = DECK_ELIGIBLE
    .map((k) => ALL_CARDS[k])
    .filter((c) => c.kind === 'spell' && c.spell.delivery === 'instant').length;
  assert.ok(instantCount <= 2, `立即結算的法術過多（${instantCount}）`);
});

test('法術對塔傷害都有折減係數', () => {
  for (const key of DECK_ELIGIBLE) {
    const c = ALL_CARDS[key];
    if (c.kind !== 'spell' || !c.spell.damage) continue;
    assert.ok(c.spell.crownTowerFactor < 1, `${key} 未設定對塔折減`);
  }
});

test('進化卡都有循環次數與能力描述', () => {
  for (const key of EVOLUTION_KEYS) {
    const evo = ALL_CARDS[key].evolution;
    assert.ok(evo.cyclesRequired >= 1, `${key} 循環次數`);
    assert.ok(evo.ability, `${key} 缺少能力代號`);
    assert.ok(evo.description, `${key} 缺少描述`);
  }
});

test('冠軍都有技能、聖水成本與冷卻', () => {
  for (const key of CHAMPION_KEYS) {
    const c = ALL_CARDS[key];
    assert.ok(c.ability, `${key} 缺少技能`);
    assert.ok(c.ability.elixir >= 0);
    assert.ok(c.ability.cooldownSeconds > 0);
  }
});

test('塔兵資料獨立於一般部署卡', () => {
  for (const t of Object.values(TOWER_TROOPS)) {
    assert.ok(t.stats.hp > 0);
    assert.equal(t.provenance.statsVerified, false);
    assert.equal(DECK_ELIGIBLE.includes(t.key), false, `${t.key} 不應可放入卡組`);
  }
});

// ───────── 寶箱 ─────────

test('每個寶箱都帶查核文件要求的欄位', () => {
  const required = ['chest_id', 'version_date', 'arena_range', 'eligible_card_rule',
    'reward_pool', 'guarantees', 'probability_table', 'choice_count', 'source_url'];
  for (const c of Object.values(CHESTS)) {
    for (const f of required) {
      assert.ok(f in c, `${c.chest_id} 缺少欄位 ${f}`);
    }
    assert.equal(c.version_date, null, `${c.chest_id} 不應宣稱對應版本`);
    assert.equal(c.verified, false);
    assert.ok(c.source_url.startsWith('https://'));
  }
});

test('機率表加總被檢查，且驗證器不自動正規化', () => {
  const rows = validateChestTables();
  assert.equal(rows.length, Object.keys(CHESTS).length);
  for (const r of rows) {
    assert.equal(r.ok, true, `${r.chest_id} 加總 ${r.sum}`);
    assert.equal(r.needsReview, false);
  }
  // 故意做出一個加總不為 1 的表，確認會被標記而不是被改掉。
  const original = CHESTS.silver.probability_table;
  CHESTS.silver.probability_table = { common: 0.5, rare: 0.2 };
  const bad = validateChestTables().find((r) => r.chest_id === 'silver');
  assert.equal(bad.ok, false);
  assert.equal(bad.needsReview, true);
  assert.equal(CHESTS.silver.probability_table.common, 0.5, '原始值必須保留，不得被改寫');
  CHESTS.silver.probability_table = original;
});

test('卡池會依競技場與規則過濾', () => {
  const low = eligibleCards(ELIGIBLE_RULES.UNLOCKED_AND_NOT_NEW, 0);
  const high = eligibleCards(ELIGIBLE_RULES.UNLOCKED_AND_NOT_NEW, 20);
  assert.ok(high.length > low.length, '競技場越高卡池越大');
  for (const k of low) assert.ok((ALL_CARDS[k].arena ?? 0) <= 0, `${k} 不應在競技場 0 解鎖`);

  const champs = eligibleCards(ELIGIBLE_RULES.CHAMPION_ONLY, 20);
  assert.deepEqual(champs.sort(), CHAMPION_KEYS.slice().sort());

  const evos = eligibleCards(ELIGIBLE_RULES.EVOLUTION_ONLY, 20);
  assert.deepEqual(evos.sort(), EVOLUTION_KEYS.slice().sort());
});

test('開箱不是單一均勻亂數：稀有度分布貼近機率表', () => {
  const counters = {};
  const rng = makeRng(20260907);
  const tally = { common: 0, rare: 0, epic: 0, legendary: 0 };
  for (let i = 0; i < 400; i += 1) {
    const r = openChest({ chestId: 'silver', arena: 20, counters, rng });
    for (const s of r.cards) tally[s.rarity] = (tally[s.rarity] || 0) + 1;
  }
  const total = Object.values(tally).reduce((a, b) => a + b, 0);
  assert.ok(total > 0);
  const commonShare = tally.common / total;
  assert.ok(commonShare > 0.4, `普通卡佔比 ${commonShare.toFixed(2)} 太低`);
  assert.ok(tally.legendary < tally.rare, '傳說應比稀有少');
  assert.ok(tally.epic < tally.rare, '史詩應比稀有少');
});

test('魔法寶箱的史詩比例明顯高於銀寶箱', () => {
  const share = (chestId) => {
    const counters = {};
    const rng = makeRng(7);
    let epic = 0; let total = 0;
    for (let i = 0; i < 200; i += 1) {
      for (const s of openChest({ chestId, arena: 20, counters, rng }).cards) {
        total += 1;
        if (s.rarity === 'epic') epic += 1;
      }
    }
    return epic / total;
  };
  assert.ok(share('magical') > share('silver'), '不同箱種必須有不同分布');
});

test('抉擇寶箱回傳多組候選，且未選前不發放', () => {
  const r = openChest({ chestId: 'choice', arena: 20, counters: {}, rng: makeRng(3) });
  assert.ok(Array.isArray(r.choices));
  assert.equal(r.choices.length, CHESTS.choice.choice_count);
  assert.equal(r.cards.length, 0, '未選擇前不應直接發卡');
});

test('幸運寶箱會先抽出實際箱種', () => {
  const r = openChest({ chestId: 'lucky', arena: 20, counters: {}, rng: makeRng(11) });
  assert.equal(r.via, 'lucky');
  assert.ok(Object.keys(CHESTS).includes(r.rolledChest));
});

test('英雄寶箱只給冠軍卡，進化寶箱只給可進化的卡', () => {
  const hero = openChest({ chestId: 'hero', arena: 20, counters: {}, rng: makeRng(5) });
  for (const s of hero.cards) assert.ok(CHAMPION_KEYS.includes(s.card), `${s.card} 不是冠軍`);

  const evo = openChest({ chestId: 'evolution', arena: 20, counters: {}, rng: makeRng(5) });
  for (const s of evo.cards) assert.ok(EVOLUTION_KEYS.includes(s.card), `${s.card} 沒有進化型態`);
});

test('競技場過濾會擋掉高階寶箱', () => {
  const low = chestsForArena(0).map((c) => c.chest_id);
  assert.ok(!low.includes('hero'));
  assert.ok(!low.includes('evolution'));
  assert.ok(low.includes('silver'));
  const high = chestsForArena(20).map((c) => c.chest_id);
  assert.ok(high.includes('hero'));
});

test('保底：銀寶箱每 6 箱至少給一張史詩', () => {
  const counters = {};
  const rng = makeRng(99);
  let epicSeen = 0;
  for (let i = 0; i < 6; i += 1) {
    const r = openChest({ chestId: 'silver', arena: 20, counters, rng });
    epicSeen += r.cards.filter((s) => s.rarity === 'epic').reduce((a, s) => a + s.count, 0);
  }
  assert.ok(epicSeen >= 1, '六箱之內應至少出現一張史詩');
});
