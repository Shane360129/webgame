/** 客戶端狀態：玩家檔案、目錄、卡組編輯。 */

const KEY_ID = 'royale3d.playerId';
const KEY_NAME = 'royale3d.playerName';
const KEY_PREFS = 'royale3d.prefs';

function makeId() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(36)).join('').slice(0, 24).replace(/[^a-z0-9]/g, 'x');
}

export const state = {
  id: localStorage.getItem(KEY_ID) || (() => { const v = makeId(); localStorage.setItem(KEY_ID, v); return v; })(),
  name: localStorage.getItem(KEY_NAME) || `玩家${Math.floor(Math.random() * 9000 + 1000)}`,
  profile: null,
  catalogue: null,
  chests: null,
  audit: null,
  prefs: JSON.parse(localStorage.getItem(KEY_PREFS) || '{"camera":"classic","quality":"medium","difficulty":"normal"}'),
  chestSlots: JSON.parse(localStorage.getItem('royale3d.chestSlots') || '[]'),
};

export function savePrefs(patch) {
  Object.assign(state.prefs, patch);
  localStorage.setItem(KEY_PREFS, JSON.stringify(state.prefs));
}

export function setName(n) {
  state.name = n;
  localStorage.setItem(KEY_NAME, n);
}

export function saveChestSlots(slots) {
  state.chestSlots = slots;
  localStorage.setItem('royale3d.chestSlots', JSON.stringify(slots));
}

async function json(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

export async function loadAll() {
  const [cat, prof, chests] = await Promise.all([
    json('/api/catalogue'),
    json('/api/profile', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: state.id, name: state.name }),
    }),
    json('/api/chests'),
  ]);
  state.catalogue = cat;
  state.profile = prof.profile;
  state.chests = chests;
  return state;
}

export async function refreshProfile() {
  const r = await json('/api/profile', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: state.id, name: state.name }),
  });
  state.profile = r.profile;
  return state.profile;
}

export async function saveDeck({ deck, evos, champion, towerTroop }) {
  const r = await json('/api/deck', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: state.id, deck, evos, champion, towerTroop }),
  });
  state.profile = r.profile;
  return r;
}

export async function openChest(chestId) {
  return json('/api/chest/open', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: state.id, chestId }),
  });
}

export async function chooseChestGroup(group, gold) {
  return json('/api/chest/choose', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: state.id, group, gold }),
  });
}

export async function loadLeaderboard() {
  return json('/api/leaderboard?limit=20');
}

export async function loadAudit() {
  state.audit = await json('/api/audit');
  return state.audit;
}

export function card(key) {
  return state.catalogue?.cards?.[key] || null;
}

export function ownedCount(key) {
  return state.profile?.cards?.[key]?.count ?? 0;
}
