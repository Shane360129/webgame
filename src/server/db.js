/**
 * 玩家檔案、卡片收藏、寶箱格與獎盃榜的持久化。
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { ALL_CARDS, DECK_ELIGIBLE } from '../shared/catalogue.js';

export function openDb(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      trophies    INTEGER NOT NULL DEFAULT 0,
      best        INTEGER NOT NULL DEFAULT 0,
      gold        INTEGER NOT NULL DEFAULT 500,
      wins        INTEGER NOT NULL DEFAULT 0,
      losses      INTEGER NOT NULL DEFAULT 0,
      draws       INTEGER NOT NULL DEFAULT 0,
      deck        TEXT NOT NULL,
      evos        TEXT NOT NULL DEFAULT '[]',
      champion    TEXT,
      tower_troop TEXT NOT NULL DEFAULT 'tower_princess',
      counters    TEXT NOT NULL DEFAULT '{}',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_players_trophies ON players (trophies DESC, updated_at ASC);

    CREATE TABLE IF NOT EXISTS player_cards (
      player_id TEXT NOT NULL,
      card      TEXT NOT NULL,
      count     INTEGER NOT NULL DEFAULT 0,
      level     INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (player_id, card)
    );

    CREATE TABLE IF NOT EXISTS chest_slots (
      player_id TEXT NOT NULL,
      idx       INTEGER NOT NULL,
      chest_id  TEXT,
      opened    INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (player_id, idx)
    );

    CREATE TABLE IF NOT EXISTS matches (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      a_id       TEXT NOT NULL,
      b_id       TEXT NOT NULL,
      a_name     TEXT NOT NULL,
      b_name     TEXT NOT NULL,
      winner     INTEGER,
      reason     TEXT,
      crowns_a   INTEGER NOT NULL,
      crowns_b   INTEGER NOT NULL,
      mode       TEXT NOT NULL,
      duration   REAL NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_matches_time ON matches (created_at DESC);
  `);
  return db;
}

export const STARTER_DECK = [
  'knight', 'archers', 'goblins', 'musketeer',
  'cannon', 'fireball', 'zap', 'giant',
];

export class Store {
  constructor(db) {
    this.db = db;
    this.q = {
      get: db.prepare('SELECT * FROM players WHERE id = ?'),
      insert: db.prepare(`INSERT INTO players (id,name,trophies,best,gold,deck,evos,champion,tower_troop,counters,created_at,updated_at)
                          VALUES (@id,@name,0,0,500,@deck,'[]',NULL,'tower_princess','{}',@now,@now)`),
      rename: db.prepare('UPDATE players SET name=?, updated_at=? WHERE id=?'),
      saveDeck: db.prepare('UPDATE players SET deck=?, evos=?, champion=?, tower_troop=?, updated_at=? WHERE id=?'),
      saveCounters: db.prepare('UPDATE players SET counters=?, updated_at=? WHERE id=?'),
      addGold: db.prepare('UPDATE players SET gold = gold + ?, updated_at=? WHERE id=?'),
      result: db.prepare(`UPDATE players SET trophies=?, best=?, wins=wins+?, losses=losses+?, draws=draws+?, updated_at=? WHERE id=?`),
      top: db.prepare('SELECT id,name,trophies,best,wins,losses FROM players ORDER BY trophies DESC, updated_at ASC LIMIT ?'),
      rank: db.prepare('SELECT COUNT(*) n FROM players WHERE trophies > ?'),
      cards: db.prepare('SELECT card,count,level FROM player_cards WHERE player_id = ?'),
      upsertCard: db.prepare(`INSERT INTO player_cards (player_id,card,count,level) VALUES (?,?,?,1)
                              ON CONFLICT(player_id,card) DO UPDATE SET count = count + excluded.count`),
      setCardLevel: db.prepare('UPDATE player_cards SET level=?, count=? WHERE player_id=? AND card=?'),
      logMatch: db.prepare(`INSERT INTO matches (a_id,b_id,a_name,b_name,winner,reason,crowns_a,crowns_b,mode,duration,created_at)
                            VALUES (@a_id,@b_id,@a_name,@b_name,@winner,@reason,@crowns_a,@crowns_b,@mode,@duration,@created_at)`),
      recentMatches: db.prepare('SELECT a_name,b_name,winner,reason,crowns_a,crowns_b,mode,created_at FROM matches ORDER BY created_at DESC LIMIT ?'),
      totalPlayers: db.prepare('SELECT COUNT(*) n FROM players'),
    };
  }

  ensurePlayer(id, name) {
    let row = this.q.get.get(id);
    if (!row) {
      const now = Date.now();
      this.q.insert.run({ id, name, deck: JSON.stringify(STARTER_DECK), now });
      // 起始收藏：起手卡組各 1 張。
      for (const c of STARTER_DECK) this.q.upsertCard.run(id, c, 1);
      row = this.q.get.get(id);
    } else if (name && name !== row.name) {
      this.q.rename.run(name, Date.now(), id);
      row = this.q.get.get(id);
    }
    return this.hydrate(row);
  }

  hydrate(row) {
    if (!row) return null;
    const cards = {};
    for (const c of this.q.cards.all(row.id)) cards[c.card] = { count: c.count, level: c.level };
    return {
      id: row.id,
      name: row.name,
      trophies: row.trophies,
      best: row.best,
      gold: row.gold,
      wins: row.wins,
      losses: row.losses,
      draws: row.draws,
      deck: JSON.parse(row.deck),
      evos: JSON.parse(row.evos || '[]'),
      champion: row.champion,
      towerTroop: row.tower_troop,
      counters: JSON.parse(row.counters || '{}'),
      cards,
      arena: arenaForTrophies(row.trophies),
    };
  }

  saveDeck(id, { deck, evos, champion, towerTroop }) {
    const clean = deck.filter((k) => DECK_ELIGIBLE.includes(k)).slice(0, 8);
    if (clean.length !== 8 || new Set(clean).size !== 8) {
      return { ok: false, reason: 'deck_must_be_8_unique_cards' };
    }
    const cleanEvos = (evos || []).filter((k) => clean.includes(k) && ALL_CARDS[k]?.evolution).slice(0, 2);
    this.q.saveDeck.run(
      JSON.stringify(clean), JSON.stringify(cleanEvos),
      champion && ALL_CARDS[champion]?.isChampion ? champion : null,
      towerTroop || 'tower_princess', Date.now(), id,
    );
    return { ok: true };
  }

  saveCounters(id, counters) {
    this.q.saveCounters.run(JSON.stringify(counters), Date.now(), id);
  }

  grant(id, { gold = 0, cards = [] }) {
    const now = Date.now();
    if (gold) this.q.addGold.run(gold, now, id);
    for (const stack of cards) {
      if (!ALL_CARDS[stack.card]) continue;
      this.q.upsertCard.run(id, stack.card, stack.count);
    }
  }

  applyResult(profile, { won, lost, drew, delta }) {
    const trophies = Math.max(0, profile.trophies + delta);
    const best = Math.max(profile.best, trophies);
    this.q.result.run(trophies, best, won ? 1 : 0, lost ? 1 : 0, drew ? 1 : 0, Date.now(), profile.id);
    return { trophies, best, delta };
  }

  leaderboard(limit = 20) {
    return this.q.top.all(limit).map((r, i) => ({ rank: i + 1, ...r }));
  }

  logMatch(rec) { this.q.logMatch.run(rec); }
  recentMatches(n = 15) { return this.q.recentMatches.all(n); }
  totalPlayers() { return this.q.totalPlayers.get().n; }
}

/** 獎盃 → 競技場（本專案自訂級距，非官方數值，僅用來控制卡池解鎖）。 */
export function arenaForTrophies(t) {
  const steps = [0, 300, 600, 1000, 1300, 1600, 2000, 2300, 2600, 3000, 3400, 3800, 4200, 4600, 5000];
  let a = 0;
  for (let i = 0; i < steps.length; i += 1) if (t >= steps[i]) a = i;
  return a;
}

export function trophyDelta({ won, drew, trophies, opponentTrophies }) {
  if (drew) return 0;
  const diff = (opponentTrophies - trophies) / 100;
  const base = 30;
  const adj = Math.round(base + diff * 4);
  const gain = Math.max(12, Math.min(48, adj));
  return won ? gain : -Math.max(8, Math.min(40, Math.round(base - diff * 4)));
}
