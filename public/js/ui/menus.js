/** 首頁、卡組、寶箱、資料查核四個選單頁。 */
import {
  state, savePrefs, setName, saveDeck, openChest, chooseChestGroup,
  loadLeaderboard, loadAudit, saveChestSlots, ownedCount,
} from '../state.js';
import { cardEl, openCardSheet, rarityLabel, kindLabel } from './cards.js';

const $ = (id) => document.getElementById(id);

const RARITY_COLORS = {
  common: '#c9d6e4', rare: '#ff9b3d', epic: '#c065ff',
  legendary: '#f7d774', champion: '#ffd166',
  evolution_shard: '#7de3ff', evolution: '#7de3ff',
  silver: '#c9d6e4', golden: '#f0c05a', giant: '#8fd06a', magical: '#c065ff',
};

// ───────────── 首頁 ─────────────

export function renderHome() {
  const p = state.profile;
  $('player-name').value = state.name;
  $('home-trophies').textContent = p.trophies;
  $('home-gold').textContent = p.gold;
  $('home-arena').textContent = `競技場 ${p.arena} · ${p.wins}勝 ${p.losses}敗 ${p.draws}和`;
  $('ai-difficulty').value = state.prefs.difficulty;
  $('camera-mode').value = state.prefs.camera;
  $('quality').value = state.prefs.quality;
  renderChestSlots();
  refreshLeaderboard();
}

export async function refreshLeaderboard() {
  try {
    const lb = await loadLeaderboard();
    $('leaderboard').innerHTML = lb.entries.length
      ? lb.entries.map((e) => `<li><span class="rk">${e.rank}</span>
          <span class="nm">${escapeHtml(e.name)}</span>
          <span class="tr">🏆 ${e.trophies}</span></li>`).join('')
      : '<li style="color:var(--dim)">尚無紀錄</li>';
    $('recent-matches').innerHTML = lb.recent.length
      ? lb.recent.map((m) => {
        const w = m.winner === 0 ? m.a_name : m.winner === 1 ? m.b_name : null;
        const tag = m.mode === 'ladder_bot' ? '（含 AI 對手）' : '';
        return `<li>${escapeHtml(m.a_name)} ${m.crowns_a}–${m.crowns_b} ${escapeHtml(m.b_name)}
          · ${w ? `${escapeHtml(w)} 勝` : '平手'} ${tag}</li>`;
      }).join('')
      : '<li>尚無對戰紀錄</li>';
    $('online-meta').textContent = `線上 ${lb.online} 人 · 排隊 ${lb.queued ?? 0}`;
  } catch { /* 離線時保留舊資料 */ }
}

function renderChestSlots() {
  const wrap = $('chest-slots');
  const slots = state.chestSlots;
  wrap.innerHTML = '';
  for (let i = 0; i < 4; i += 1) {
    const c = slots[i];
    const el = document.createElement('button');
    el.className = `chest-slot${c ? '' : ' empty'}`;
    const def = c ? state.chests.chests[c] : null;
    el.innerHTML = c
      ? `<span class="big">🎁</span>${def?.nameZh || c}<br><small style="color:var(--dim)">點擊開啟</small>`
      : '<span class="big">▫️</span>空格';
    if (c) el.addEventListener('click', () => doOpenChest(c, i));
    wrap.appendChild(el);
  }
}

/** 對戰結束後給一個寶箱（依競技場可得的箱種）。 */
export function awardChest() {
  const arena = state.profile.arena;
  const pool = Object.values(state.chests.chests)
    .filter((c) => arena >= c.arena_range[0] && arena <= c.arena_range[1])
    .map((c) => c.chest_id);
  if (!pool.length) return;
  const slots = state.chestSlots.slice(0, 4);
  if (slots.filter(Boolean).length >= 4) return;
  const idx = slots.findIndex((s) => !s);
  slots[idx < 0 ? slots.length : idx] = pool[Math.floor(Math.random() * pool.length)];
  saveChestSlots(slots);
  renderChestSlots();
}

async function doOpenChest(chestId, slotIndex) {
  try {
    const r = await openChest(chestId);
    const slots = state.chestSlots.slice();
    slots[slotIndex] = null;
    saveChestSlots(slots);
    state.profile = r.profile;
    renderChestSlots();
    renderHome();
    showRewards(r.rewards);
  } catch (e) {
    alert(`開箱失敗：${e.message}`);
  }
}

function showRewards(rewards) {
  const inner = $('card-sheet-inner');
  const chest = state.chests.chests[rewards.chest_id];
  const stackHtml = (stacks) => `<div class="reward-list">${stacks.map((s) => {
    const c = state.catalogue.cards[s.card];
    return `<div style="text-align:center">
      <div style="font-size:11px;color:${RARITY_COLORS[s.rarity] || '#fff'}">${c ? (c.nameZh || c.name) : s.card}</div>
      <b>×${s.count}</b></div>`;
  }).join('')}</div>`;

  if (rewards.choices) {
    inner.innerHTML = `<h2>${chest.nameZh}</h2>
      <div class="sub">抉擇寶箱：從 ${rewards.choices.length} 組候選挑一組。</div>
      ${rewards.choices.map((g, i) => `<div class="card-panel">
        <h2>選項 ${i + 1}</h2>${stackHtml(g)}
        <button class="primary" data-choice="${i}" style="margin-top:8px;width:100%">選這組</button>
      </div>`).join('')}`;
    inner.querySelectorAll('[data-choice]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const g = rewards.choices[Number(btn.dataset.choice)];
        const r = await chooseChestGroup(g, rewards.gold);
        state.profile = r.profile;
        renderHome();
        renderDeck();
        $('card-sheet').hidden = true;
      });
    });
  } else {
    inner.innerHTML = `<h2>${chest.nameZh}</h2>
      <div class="sub">金幣 +${rewards.gold}${rewards.via ? ` · 由${state.chests.chests[rewards.via].nameZh}開出${state.chests.chests[rewards.rolledChest].nameZh}` : ''}</div>
      ${stackHtml(rewards.cards)}
      <p class="hint">掉落依 <code>probability_table</code> 分支 + 保底計數器產生，機率版本標記為未驗證。</p>`;
    renderDeck();
  }
  $('card-sheet').hidden = false;
}

// ───────────── 卡組 ─────────────

let deckDraft = null;
let collectionFilter = 'all';

export function renderDeck() {
  const p = state.profile;
  deckDraft = deckDraft || {
    deck: p.deck.slice(), evos: p.evos.slice(),
    champion: p.champion, towerTroop: p.towerTroop,
  };

  $('deck-grid').innerHTML = '';
  deckDraft.deck.forEach((key, i) => {
    const c = state.catalogue.cards[key];
    const el = cardEl(c, {
      showEvoMark: deckDraft.evos.includes(key),
      onClick: () => openCardSheet(c),
    });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); });
    $('deck-grid').appendChild(el);
  });

  // 進化槽
  const evoWrap = $('evo-row');
  evoWrap.innerHTML = '';
  for (let i = 0; i < 2; i += 1) {
    const key = deckDraft.evos[i];
    if (key) {
      const c = state.catalogue.cards[key];
      const el = cardEl(c, { evolved: true, onClick: () => { deckDraft.evos.splice(i, 1); renderDeck(); } });
      evoWrap.appendChild(el);
    } else {
      const el = document.createElement('div');
      el.className = 'slot-empty';
      el.style.width = '70px';
      el.textContent = '點下方可進化卡加入';
      evoWrap.appendChild(el);
    }
  }

  // 冠軍槽
  const champWrap = $('champ-row');
  champWrap.innerHTML = '';
  const champs = state.catalogue.champions.map((k) => state.catalogue.cards[k]);
  for (const c of champs) {
    const el = cardEl(c, {
      onClick: () => { deckDraft.champion = deckDraft.champion === c.key ? null : c.key; renderDeck(); },
    });
    if (deckDraft.champion === c.key) el.style.outline = '2px solid #ffd166';
    champWrap.appendChild(el);
  }

  // 塔兵
  const tWrap = $('tower-row');
  tWrap.innerHTML = '';
  for (const t of Object.values(state.catalogue.towerTroops)) {
    const b = document.createElement('button');
    b.className = `tower-opt${deckDraft.towerTroop === t.key ? ' active' : ''}`;
    b.innerHTML = `<b>${t.nameZh}</b><small>生命 ${t.stats.hp} · 傷害 ${t.stats.damage} · 攻速 ${t.stats.hitSpeed}s
      ${t.stats.targetsAir === false ? ' · 不可對空' : ''}</small>
      ${t.note ? `<small>${t.note}</small>` : ''}
      <small style="color:#f0c05a">數值未驗證</small>`;
    b.addEventListener('click', () => { deckDraft.towerTroop = t.key; renderDeck(); });
    tWrap.appendChild(b);
  }

  renderCollection();
}

function renderCollection() {
  const wrap = $('collection');
  wrap.innerHTML = '';
  const all = state.catalogue.deckEligible
    .map((k) => state.catalogue.cards[k])
    .filter((c) => {
      if (collectionFilter === 'all') return true;
      if (collectionFilter === 'evolution') return !!c.evolution;
      return c.kind === collectionFilter;
    })
    .sort((a, b) => a.elixir - b.elixir || a.key.localeCompare(b.key));

  $('collection-count').textContent = all.length;
  for (const c of all) {
    const owned = ownedCount(c.key) > 0;
    const el = cardEl(c, {
      showOwned: true, showEvoMark: !!c.evolution, locked: !owned,
      onClick: () => onCollectionClick(c),
    });
    if (deckDraft.deck.includes(c.key)) el.style.outline = '2px solid #4a86e8';
    wrap.appendChild(el);
  }
}

function onCollectionClick(c) {
  const inDeck = deckDraft.deck.includes(c.key);
  if (!inDeck) {
    // 找一個要被換掉的位置：最後點過的槽，或最後一格。
    const slot = deckDraft.replaceSlot ?? 7;
    const removed = deckDraft.deck[slot];
    deckDraft.deck[slot] = c.key;
    deckDraft.evos = deckDraft.evos.filter((k) => k !== removed && deckDraft.deck.includes(k));
    deckDraft.replaceSlot = (slot + 1) % 8;
    renderDeck();
    return;
  }
  if (c.evolution) {
    if (deckDraft.evos.includes(c.key)) deckDraft.evos = deckDraft.evos.filter((k) => k !== c.key);
    else if (deckDraft.evos.length < 2) deckDraft.evos.push(c.key);
    renderDeck();
    return;
  }
  openCardSheet(c);
}

export function initDeckScreen() {
  $('collection-filters').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    collectionFilter = b.dataset.filter;
    [...$('collection-filters').children].forEach((c) => c.classList.toggle('active', c === b));
    renderCollection();
  });
  $('deck-save').addEventListener('click', async () => {
    try {
      await saveDeck(deckDraft);
      deckDraft = null;
      renderDeck();
      $('deck-save').textContent = '已儲存';
      setTimeout(() => { $('deck-save').textContent = '儲存'; }, 1200);
    } catch (e) {
      alert(`卡組儲存失敗：${e.message}`);
    }
  });
}

// ───────────── 寶箱頁 ─────────────

export function renderChests() {
  const list = $('chest-list');
  list.innerHTML = '';
  const arena = state.profile.arena;
  for (const c of Object.values(state.chests.chests)) {
    const available = arena >= c.arena_range[0] && arena <= c.arena_range[1];
    const el = document.createElement('div');
    el.className = 'chest-entry';
    const bars = Object.entries(c.probability_table)
      .map(([k, v]) => `<i style="width:${(v * 100).toFixed(2)}%;background:${RARITY_COLORS[k] || '#888'}"
        title="${k} ${(v * 100).toFixed(2)}%"></i>`).join('');
    el.innerHTML = `
      <h3>${c.nameZh} <span class="tag">${c.chest_id}</span></h3>
      <div class="meta">競技場 ${c.arena_range[0]}–${c.arena_range[1]} · 解鎖 ${c.unlock_hours}h
        ${available ? '' : ' · <span style="color:#ff9b8a">目前競技場不可得</span>'}</div>
      <div class="prob-bars">${bars}</div>
      <div class="kv">
        <span>eligible_card_rule</span><b><code>${c.eligible_card_rule}</code></b>
        <span>reward_pool</span><b>${JSON.stringify(c.reward_pool)}</b>
        <span>guarantees</span><b>${c.guarantees.length ? c.guarantees.map((g) => `${g.rarity}: ${g.everyNCards ? `每 ${g.everyNCards} 張` : `每 ${g.everyNChests} 箱`}`).join('、') : '無'}</b>
        <span>choice_count</span><b>${c.choice_count}</b>
        <span>version_date</span><b style="color:#f0c05a">${c.version_date ?? 'null（待查）'}</b>
        <span>source_url</span><b><a href="${c.source_url}" target="_blank" rel="noreferrer">官方寶箱資訊頁</a></b>
      </div>`;
    list.appendChild(el);
  }

  const rows = state.chests.validation;
  $('chest-validation').innerHTML = `
    <tr><th>chest_id</th><th>分支數</th><th>加總</th><th>偏差</th><th>狀態</th><th>version_date</th></tr>
    ${rows.map((r) => `<tr>
      <td>${r.chest_id}</td><td>${r.branches}</td><td>${r.sum}</td>
      <td>${r.delta.toExponential(2)}</td>
      <td class="${r.ok ? 'ok' : 'bad'}">${r.ok ? '通過' : '待查'}</td>
      <td style="color:#f0c05a">${r.version_date ?? 'null'}</td>
    </tr>`).join('')}`;
}

// ───────────── 資料查核頁 ─────────────

export async function renderAudit() {
  const body = $('audit-body');
  body.innerHTML = '<div class="card-panel">讀取中…</div>';
  let a;
  try { a = await loadAudit(); } catch (e) {
    body.innerHTML = `<div class="card-panel">讀取失敗：${e.message}</div>`;
    return;
  }
  const c = a.coverage;
  body.innerHTML = `
    <div class="notice unofficial">
      <b>結論：資料未齊，本專案不宣稱是完整復刻。</b><br>
      建置環境的網路政策阻擋了 <code>${a.dataFetch.attemptedHost}</code>（HTTP ${a.dataFetch.httpStatus}），
      因此沒有取得固定版本的官方完整卡牌匯出檔。所有戰鬥數值都標記為未驗證，
      不以猜測值冒充原作。
    </div>

    <div class="card-panel">
      <h2>本專案已實作的內容（不是官方總數）</h2>
      <div class="kv">
        <span>可入卡組</span><b>${c.implemented.deckEligible}</b>
        <span>部隊 / 建築 / 法術</span><b>${c.implemented.byKind.troop} / ${c.implemented.byKind.building} / ${c.implemented.byKind.spell}</b>
        <span>進化</span><b>${c.implemented.evolutions}</b>
        <span>冠軍</span><b>${c.implemented.champions}</b>
        <span>塔兵</span><b>${c.implemented.towerTroops}</b>
        <span>召喚專用單位</span><b>${c.implemented.spawnOnly}</b>
        <span>官方當期總數是否已知</span><b style="color:#ff9b8a">否</b>
      </div>
      <p class="hint">${c.note}</p>
    </div>

    <div class="card-panel">
      <h2>數值驗證狀態</h2>
      <div class="kv">
        <span>識別欄位已驗證</span><b>${c.provenance.identityVerified} / ${c.implemented.deckEligible}</b>
        <span>戰鬥數值已驗證</span><b style="color:#ff9b8a">${c.provenance.statsVerified} / ${c.implemented.deckEligible}</b>
        <span>鎖定的平衡版本</span><b style="color:#ff9b8a">${c.provenance.pinnedBalanceVersion ?? 'null'}</b>
      </div>
      <p class="hint">要通過「數值可信」門檻，需要一份固定版本、逐卡可核對的完整匯出檔。
        本次取得的歷史快照與公開常識都不符合這個門檻。</p>
    </div>

    <div class="card-panel">
      <h2>識別欄位仍待查的卡（${a.unverifiedIdentity.length}）</h2>
      ${a.unverifiedIdentity.length ? `<ul class="recent">${a.unverifiedIdentity.map((x) => `<li><b>${x.name}</b>${x.note ? ` — ${x.note}` : ''}</li>`).join('')}</ul>` : '<p class="hint">無</p>'}
    </div>

    <div class="card-panel">
      <h2>已在遊戲中實作並可獨立檢核的規則</h2>
      <ul class="recent">
        <li>正規賽 3:00、聖水 x1 → x2、延長賽 2:00 x3、先摧塔即勝</li>
        <li>延長賽結束後以最低塔血量百分比判定，相同則平手</li>
        <li>王塔啟動條件：我方公主塔被摧毀，或王塔本身受到傷害</li>
        <li>手牌 4 張 + 下一張的固定循環（打出的卡回到隊列尾端）</li>
        <li>法術投放分為投射物／滾動／光環／分波／鎖定／生成六類</li>
        <li>法術對塔傷害折減、地震對建築加成</li>
        <li>地面單位須走橋，野豬騎士與戰車槌可跳河</li>
        <li>碰撞推擠依質量、空中與地面互不碰撞、建築吸引僅建築目標</li>
        <li>摧毀敵方公主塔後該路可推進部署</li>
        <li>進化需循環次數；塔兵替換公主塔；冠軍有獨立技能與冷卻</li>
      </ul>
    </div>

    <div class="card-panel">
      <h2>戰鬥數值未驗證的卡（${a.unverifiedStats.length}）</h2>
      <p class="hint">全部標記為 <code>statsVerified: false</code>、<code>versionDate: null</code>。
        遊戲內卡片會顯示「未驗」徽章。</p>
      <div class="table-wrap"><table>
        <tr><th>卡</th><th>來源標記</th><th>版本日期</th></tr>
        ${a.unverifiedStats.slice(0, 200).map((x) => `<tr><td>${x.nameZh || x.name}</td>
          <td><code>${x.source}</code></td><td style="color:#f0c05a">${x.versionDate ?? 'null'}</td></tr>`).join('')}
      </table></div>
    </div>

    <div class="card-panel">
      <h2>素材與授權</h2>
      <p class="hint">
        官方 Fan Content Policy 把素材使用限定在允許的粉絲內容用途，並排除用相關素材製作新遊戲（含免費遊戲）。
        因此本專案<b>不含也不散布任何官方模型、貼圖、動畫、音效或介面素材</b>；
        場上所有角色與建築都是以 three.js 幾何在程式中重新建模。
        標示「非官方」並不會擴大授權範圍，本頁也不是針對特定司法管轄區的法律結論。
      </p>
      <p class="hint">來源連結：${Object.entries(a.sources).map(([k, v]) => `<a href="${v}" target="_blank" rel="noreferrer">${k}</a>`).join(' · ')}</p>
    </div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export { deckDraft };
