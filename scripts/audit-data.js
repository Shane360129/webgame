#!/usr/bin/env node
/**
 * 資料查核 CLI：把實作涵蓋狀況與未驗證清單印在終端機，
 * 方便在 CI 或交付前確認「沒有把有缺口的資料包裝成完整復刻」。
 *
 *   npm run audit:data
 */
import { ALL_CARDS, TOWER_TROOPS, DECK_ELIGIBLE, CHAMPION_KEYS, EVOLUTION_KEYS, coverageReport } from '../src/shared/catalogue.js';
import { validateChestTables } from '../src/shared/chests.js';
import { SOURCES } from '../src/shared/rules.js';

const c = coverageReport();
const line = (s = '') => console.log(s);

line('═'.repeat(64));
line(' 皇室對戰式 3D 重製原型 — 資料查核報表');
line(` 產生時間：${new Date().toISOString()}`);
line('═'.repeat(64));
line();
line('【本專案已實作的內容】（不是官方當期總數）');
line(`  可入卡組            ${c.implemented.deckEligible}`);
line(`    部隊              ${c.implemented.byKind.troop}`);
line(`    建築              ${c.implemented.byKind.building}`);
line(`    法術              ${c.implemented.byKind.spell}`);
line(`  進化型態            ${c.implemented.evolutions}`);
line(`  冠軍                ${c.implemented.champions}`);
line(`  塔兵                ${c.implemented.towerTroops}`);
line(`  召喚專用單位        ${c.implemented.spawnOnly}`);
line();
line('【驗證狀態】');
line(`  識別欄位已驗證      ${c.provenance.identityVerified} / ${c.implemented.deckEligible}`);
line(`  戰鬥數值已驗證      ${c.provenance.statsVerified} / ${c.implemented.deckEligible}`);
line(`  鎖定的平衡版本      ${c.provenance.pinnedBalanceVersion ?? 'null（未鎖定）'}`);
line(`  官方總數是否已知    ${c.officialTotalKnown ? '是' : '否'}`);
line();

const unverifiedIdentity = Object.values(ALL_CARDS).filter((x) => x.provenance?.identityVerified === false);
if (unverifiedIdentity.length) {
  line('【識別欄位仍待查】');
  for (const x of unverifiedIdentity) line(`  · ${x.name}（${x.nameZh}）${x.note ? ` — ${x.note}` : ''}`);
  line();
}

line('【寶箱機率表自檢】');
for (const r of validateChestTables()) {
  const flag = r.ok ? 'OK  ' : '待查';
  line(`  ${flag} ${r.chest_id.padEnd(10)} 分支 ${String(r.branches).padStart(2)}  加總 ${r.sum}  version_date ${r.version_date ?? 'null'}`);
}
line();
line('【來源】');
for (const [k, v] of Object.entries(SOURCES)) line(`  ${k.padEnd(12)} ${v}`);
line();
line('【結論】');
line('  查核當日的建置環境無法取得固定版本的官方完整卡牌匯出檔');
line('  （royaleapi.github.io 被網路政策擋下，HTTP 403），');
line('  因此所有戰鬥數值都標記為未驗證，本專案不宣稱是完整復刻。');
line('  素材方面：不含也不散布任何官方模型、貼圖、動畫或音效；');
line('  場上所有角色與建築都是程式化原創建模。');
line('═'.repeat(64));

const exitBad = validateChestTables().some((r) => !r.ok);
process.exit(exitBad ? 1 : 0);
