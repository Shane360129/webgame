/** 卡片元素與卡片詳情面板。 */
import { cardPortrait, referenceSheet } from '../render/portraits.js';
import { state, ownedCount } from '../state.js';

export function cardEl(card, opts = {}) {
  const el = document.createElement('div');
  el.className = `card rarity-${card.rarity}`;
  el.dataset.card = card.key;
  if (opts.locked) el.classList.add('locked');

  const img = document.createElement('img');
  img.alt = card.nameZh || card.name;
  img.loading = 'lazy';
  const url = cardPortrait(card, { evolved: !!opts.evolved });
  if (url) img.src = url;
  el.appendChild(img);

  const cost = document.createElement('div');
  cost.className = 'cost';
  cost.textContent = card.elixir;
  el.appendChild(cost);

  if (opts.evolved || (card.evolution && opts.showEvoMark)) {
    const ev = document.createElement('div');
    ev.className = 'evo-mark';
    ev.textContent = '進';
    el.appendChild(ev);
  }
  if (card.provenance && card.provenance.statsVerified === false && opts.showProvenance !== false) {
    const un = document.createElement('div');
    un.className = 'unverified';
    un.textContent = '未驗';
    un.title = '戰鬥數值未對照固定版本';
    el.appendChild(un);
  }
  if (opts.showOwned) {
    const o = document.createElement('div');
    o.className = 'owned';
    o.textContent = `×${ownedCount(card.key)}`;
    el.appendChild(o);
  }

  const name = document.createElement('div');
  name.className = 'cname';
  name.textContent = card.nameZh || card.name;
  el.appendChild(name);

  if (opts.onClick) el.addEventListener('click', () => opts.onClick(card, el));
  return el;
}

const sheet = () => document.getElementById('card-sheet');

export function openCardSheet(card) {
  const inner = document.getElementById('card-sheet-inner');
  const views = referenceSheet(card);
  const u = card.unit || {};
  const s = card.spell || {};
  const p = card.provenance || {};

  const stat = (label, value) => (value === undefined || value === null || value === '' ? ''
    : `<div><span>${label}</span>${value}</div>`);

  const speedName = (v) => (v >= 2 ? '極快' : v >= 1.5 ? '快' : v >= 1 ? '中' : v > 0 ? '慢' : '—');

  inner.innerHTML = `
    <h2>${card.nameZh || card.name} <small style="font-size:12px;color:var(--dim)">${card.name}</small></h2>
    <div class="sub">${kindLabel(card.kind)} · ${rarityLabel(card.rarity)} · 聖水 ${card.elixir}${card.count > 1 ? ` · ${card.count} 隻` : ''}</div>
    <div class="views">
      <figure><img src="${views.front}" alt="正面"><figcaption>正面</figcaption></figure>
      <figure><img src="${views.side}" alt="側面"><figcaption>側面</figcaption></figure>
      <figure><img src="${views.back}" alt="背面"><figcaption>背面</figcaption></figure>
    </div>
    <div class="statgrid">
      ${stat('生命', u.hp)}
      ${stat('傷害', u.damage)}
      ${stat('攻速', u.hitSpeed ? `${u.hitSpeed}s` : null)}
      ${stat('射程', u.range)}
      ${stat('移動', u.speed ? speedName(u.speed) : (card.kind === 'building' ? '固定' : null))}
      ${stat('目標', u.targetOnly === 'buildings' ? '僅建築' : u.targetsAir === false ? '僅地面' : (card.kind === 'spell' ? null : '地面與空中'))}
      ${stat('屬性', u.flying ? '空中單位' : (card.kind === 'troop' ? '地面單位' : null))}
      ${stat('存在時間', u.lifetime ? `${u.lifetime}s` : null)}
      ${stat('範圍傷害', u.splashRadius || null)}
      ${stat('投放方式', card.kind === 'spell' ? deliveryLabel(s.delivery) : null)}
      ${stat('法術傷害', s.damage || null)}
      ${stat('每秒傷害', s.damagePerSecond || null)}
      ${stat('半徑', card.kind === 'spell' ? s.radius : null)}
      ${stat('對塔倍率', card.kind === 'spell' ? `${Math.round((s.crownTowerFactor ?? 1) * 100)}%` : null)}
      ${stat('持續', s.durationSeconds ? `${s.durationSeconds}s` : null)}
    </div>
    ${card.evolution ? `<div class="prov" style="border-color:#2f6f8f">
      <b style="color:#7de3ff">進化：${card.evolution.nameZh}</b><br>
      需循環 ${card.evolution.cyclesRequired} 次。${card.evolution.description}
    </div>` : ''}
    ${card.ability ? `<div class="prov" style="border-color:#8f7f2f">
      <b>技能：${card.ability.nameZh}（${card.ability.elixir} 聖水，冷卻 ${card.ability.cooldownSeconds}s）</b><br>
      ${card.ability.description}
    </div>` : ''}
    ${card.note ? `<div class="prov"><b>備註</b><br>${card.note}</div>` : ''}
    <div class="prov">
      <b>資料來源與驗證狀態</b><br>
      識別欄位（名稱／聖水／類型）：${p.identityVerified ? '公開穩定事實' : '<b>待查</b>'}<br>
      戰鬥數值：${p.statsVerified ? '已對照' : '<b>未對照固定版本，屬待查</b>'}<br>
      對應版本日期：${p.versionDate || '<b>null（未鎖定版本）</b>'}<br>
      數值等級：${p.level ?? '—'}<br>
      來源標記：<code>${p.source || '—'}</code><br>
      3D 模型：本專案程式化原創建模，非官方素材。
    </div>
  `;
  sheet().hidden = false;
}

export function closeCardSheet() { sheet().hidden = true; }

export function initCardSheet() {
  sheet().addEventListener('click', (e) => {
    if (e.target === sheet()) closeCardSheet();
  });
}

export function kindLabel(k) {
  return { troop: '部隊', building: '建築', spell: '法術' }[k] || k;
}
export function rarityLabel(r) {
  return { common: '普通', rare: '稀有', epic: '史詩', legendary: '傳說', champion: '冠軍' }[r] || r;
}
export function deliveryLabel(d) {
  return {
    projectile: '投射物（有飛行時間）',
    rolling: '滾動（沿路判定＋推擠）',
    aura: '持續光環',
    instant: '立即',
    spawn: '投放後生成單位',
    waves: '分波',
    targeted: '鎖定高血量目標',
  }[d] || d;
}
