/**
 * 權威對戰房間與配對。
 *
 * 對應查核文件第 5 節「多人」要求：
 *   - 真人模式跑在伺服器上，兩個客戶端只送輸入、收快照
 *   - 有配對佇列
 *   - 有斷線寬限與重連
 *   - 逾時未回來則判負，並在 UI 明確顯示原因
 */

import { Battle } from '../shared/sim.js';
import { BotController } from '../shared/ai.js';
import { TICK_RATE, TICK_SECONDS } from '../shared/rules.js';
import { STARTER_DECK } from './db.js';

const SNAPSHOT_EVERY_TICKS = 2;          // 20 Hz 模擬 → 10 Hz 快照
export const RECONNECT_GRACE_MS = 30_000;

let MATCH_SEQ = 0;

export class Match {
  /**
   * @param {object} opts
   * @param {[object,object]} opts.seats 每個座位 { profile, socket|null, isBot }
   */
  constructor({ seats, mode = 'ladder', onEnd, difficulty = 'normal' }) {
    this.id = `m${++MATCH_SEQ}_${Date.now().toString(36)}`;
    this.mode = mode;
    this.seats = seats;
    this.onEnd = onEnd;
    this.startedAt = Date.now();
    this.ended = false;

    const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    this.battle = new Battle({
      seed,
      mode,
      players: seats.map((s) => ({
        name: s.profile.name,
        isBot: !!s.isBot,
        deck: s.profile.deck?.length === 8 ? s.profile.deck : STARTER_DECK,
        evos: s.profile.evos || [],
        champion: s.profile.champion || null,
        towerTroop: s.profile.towerTroop || 'tower_princess',
      })),
    });

    this.bots = seats
      .map((s, side) => (s.isBot ? new BotController(this.battle, side, { difficulty }) : null));

    this.disconnectTimers = [null, null];
    this.timer = setInterval(() => this.tick(), 1000 / TICK_RATE);
    this.sendToAll({ type: 'matchStart', matchId: this.id, mode, you: null });
    for (const [side, seat] of seats.entries()) {
      this.send(side, {
        type: 'matchStart',
        matchId: this.id,
        mode,
        you: side,
        opponent: { name: seats[1 - side].profile.name, isBot: !!seats[1 - side].isBot, trophies: seats[1 - side].profile.trophies },
        snapshot: this.battle.snapshot(),
      });
    }
  }

  seatOf(socket) {
    return this.seats.findIndex((s) => s.socket === socket);
  }

  send(side, msg) {
    const s = this.seats[side];
    if (!s || !s.socket || s.socket.readyState !== 1) return;
    try { s.socket.send(JSON.stringify(msg)); } catch { /* ignore */ }
  }

  sendToAll(msg) {
    for (let i = 0; i < this.seats.length; i += 1) this.send(i, msg);
  }

  tick() {
    if (this.ended) return;
    for (const bot of this.bots) if (bot) bot.update(TICK_SECONDS);
    this.battle.step();

    const events = this.battle.drainEvents();
    if (events.length) this.sendToAll({ type: 'events', events });

    if (this.battle.tick % SNAPSHOT_EVERY_TICKS === 0) {
      const snap = this.battle.snapshot();
      // 手牌只送給本人，避免對手看到底牌。
      for (let side = 0; side < 2; side += 1) {
        this.send(side, {
          type: 'snapshot',
          s: { ...snap, hands: [side === 0 ? snap.hands[0] : null, side === 1 ? snap.hands[1] : null] },
        });
      }
    }

    if (this.battle.finished) this.end();
  }

  handleInput(socket, msg) {
    const side = this.seatOf(socket);
    if (side < 0) return { ok: false, reason: 'not_in_match' };
    switch (msg.type) {
      case 'play':
        return this.battle.playCard(side, msg.index | 0, Number(msg.x), Number(msg.z));
      case 'champion':
        return this.battle.playChampion(side, Number(msg.x), Number(msg.z));
      case 'ability':
        return this.battle.useAbility(side);
      case 'emote':
        this.send(1 - side, { type: 'emote', side, emote: String(msg.emote || '').slice(0, 24) });
        return { ok: true };
      case 'resign':
        this.battle.forfeit(side, 'resign');
        return { ok: true };
      default:
        return { ok: false, reason: 'unknown_input' };
    }
  }

  markDisconnected(socket) {
    const side = this.seatOf(socket);
    if (side < 0 || this.ended) return;
    this.seats[side].socket = null;
    this.battle.players[side].connected = false;
    this.sendToAll({ type: 'opponentConnection', side, connected: false, graceMs: RECONNECT_GRACE_MS });
    this.disconnectTimers[side] = setTimeout(() => {
      if (this.ended) return;
      this.battle.forfeit(side, 'disconnect');
    }, RECONNECT_GRACE_MS);
  }

  reconnect(side, socket) {
    if (this.ended) return false;
    if (this.disconnectTimers[side]) {
      clearTimeout(this.disconnectTimers[side]);
      this.disconnectTimers[side] = null;
    }
    this.seats[side].socket = socket;
    this.battle.players[side].connected = true;
    this.sendToAll({ type: 'opponentConnection', side, connected: true });
    this.send(side, {
      type: 'matchResume',
      matchId: this.id,
      you: side,
      mode: this.mode,
      opponent: { name: this.seats[1 - side].profile.name, isBot: !!this.seats[1 - side].isBot },
      snapshot: this.battle.snapshot(),
    });
    return true;
  }

  end() {
    if (this.ended) return;
    this.ended = true;
    clearInterval(this.timer);
    for (const t of this.disconnectTimers) if (t) clearTimeout(t);
    const result = this.battle.result;
    this.sendToAll({ type: 'matchEnd', matchId: this.id, result });
    if (this.onEnd) this.onEnd(this, result);
  }
}

/** 依獎盃接近程度配對，等待越久容忍度越大。 */
export class Matchmaker {
  constructor({ onMatch, botAfterMs = 12_000, difficulty = 'normal' }) {
    this.queue = [];
    this.onMatch = onMatch;
    this.botAfterMs = botAfterMs;
    this.difficulty = difficulty;
    this.timer = setInterval(() => this.pump(), 500);
    this.timer.unref?.();
  }

  enqueue(entry) {
    this.remove(entry.socket);
    entry.since = Date.now();
    this.queue.push(entry);
    this.pump();
  }

  remove(socket) {
    const i = this.queue.findIndex((e) => e.socket === socket);
    if (i >= 0) this.queue.splice(i, 1);
  }

  size() { return this.queue.length; }

  pump() {
    // 先嘗試真人對真人
    for (let i = 0; i < this.queue.length; i += 1) {
      for (let j = i + 1; j < this.queue.length; j += 1) {
        const a = this.queue[i];
        const b = this.queue[j];
        const waited = Math.max(Date.now() - a.since, Date.now() - b.since);
        const tolerance = 150 + waited / 20;
        if (Math.abs(a.profile.trophies - b.profile.trophies) <= tolerance) {
          this.queue.splice(j, 1);
          this.queue.splice(i, 1);
          this.onMatch([a, b], 'pvp');
          return this.pump();
        }
      }
    }
    // 等太久 → 提供 AI 對手，並明確標示
    const now = Date.now();
    for (let i = this.queue.length - 1; i >= 0; i -= 1) {
      const e = this.queue[i];
      if (now - e.since >= this.botAfterMs && e.allowBot !== false) {
        this.queue.splice(i, 1);
        this.onMatch([e, null], 'bot');
      }
    }
    return undefined;
  }
}
