/**
 * AI 對手。
 *
 * 重要：這是**練習用電腦對手**，不是線上玩家。
 * 伺服器與 UI 都必須把它標示為 AI（查核文件第 5 節：
 * 「AI 對戰不能標示為線上玩家」）。
 */

import { ALL_CARDS } from './catalogue.js';
import { ARENA } from './rules.js';

export const DIFFICULTY = {
  easy: { reactionSeconds: 2.6, elixirFloor: 6, mistakeChance: 0.35, defendRadius: 6 },
  normal: { reactionSeconds: 1.5, elixirFloor: 5, mistakeChance: 0.15, defendRadius: 8 },
  hard: { reactionSeconds: 0.8, elixirFloor: 4, mistakeChance: 0.04, defendRadius: 11 },
};

export class BotController {
  constructor(battle, side, { difficulty = 'normal', rng = Math.random } = {}) {
    this.battle = battle;
    this.side = side;
    this.cfg = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    this.difficulty = difficulty;
    this.rng = rng;
    this.timer = this.cfg.reactionSeconds;
    this.preferredLane = rng() < 0.5 ? 'left' : 'right';
  }

  get isBot() { return true; }

  update(dt) {
    const b = this.battle;
    if (b.finished) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.cfg.reactionSeconds * (0.7 + this.rng() * 0.6);

    const me = b.players[this.side];
    const enemySide = 1 - this.side;
    const hand = b.hand(this.side);
    const half = ARENA.length / 2;

    // 找出我方半場的威脅
    const threats = b.units.filter((u) => u.alive && u.side === enemySide
      && (this.side === 0 ? u.z < half + 2 : u.z > half - 2));

    // 冠軍技能：有敵人在附近就用
    if (me.championOnField) {
      const champ = b.units.find((u) => u.id === me.championOnField);
      if (champ && champ.ability && champ.ability.cd <= 0 && me.elixir >= (champ.ability.elixir || 0)) {
        const near = b.units.some((u) => u.alive && u.side === enemySide
          && Math.hypot(u.x - champ.x, u.z - champ.z) < 6);
        if (near) b.useAbility(this.side);
      }
    }

    if (threats.length) {
      const play = this.pickDefence(hand, threats);
      if (play) return this.commit(play);
    }

    if (me.elixir < this.cfg.elixirFloor) return;
    const push = this.pickPush(hand);
    if (push) this.commit(push);
  }

  commit({ index, x, z }) {
    if (this.rng() < this.cfg.mistakeChance) {
      x += (this.rng() - 0.5) * 3;
      z += (this.rng() - 0.5) * 3;
    }
    const r = this.battle.playCard(this.side, index, clampX(x), clampZ(z));
    if (!r.ok) this.timer = 0.4;
  }

  /** 防守：對空／範圍／坦克分別挑卡，落點在威脅與我方塔之間。 */
  pickDefence(hand, threats) {
    const b = this.battle;
    const me = b.players[this.side];
    const biggest = threats.reduce((a, c) => (c.maxHp > a.maxHp ? c : a), threats[0]);
    const anyAir = threats.some((t) => t.flying);
    const swarm = threats.length >= 4;

    const scored = [];
    hand.forEach((key, index) => {
      const card = ALL_CARDS[key];
      if (!card || me.elixir < card.elixir) return;
      let score = 0;

      if (card.kind === 'spell') {
        const s = card.spell;
        if (swarm && s.radius >= 2.4 && s.damage >= 200) score += 6;
        if (threats.length >= 3 && s.damage >= 150) score += 3;
        if (anyAir && s.hitsAir === false) score -= 5;
        if (s.damage < 120 && !swarm) score -= 3;
        score -= card.elixir * 0.4;
      } else if (card.kind === 'building') {
        if (biggest.targetOnly === 'buildings') score += 7;
        if (card.unit.targetsAir === false && anyAir) score -= 4;
        score += 2;
      } else {
        if (anyAir && card.unit.targetsAir === false) score -= 6;
        if (card.unit.hp > 1400) score += 3;
        if (card.count >= 3 && biggest.splashRadius === 0) score += 3;
        if (card.unit.splashRadius > 0 && swarm) score += 4;
        score += Math.min(3, card.unit.damage / 200);
      }
      score += this.rng();
      scored.push({ index, key, card, score });
    });

    scored.sort((a, b2) => b2.score - a.score);
    const best = scored[0];
    if (!best || best.score <= 0) return null;

    const t = biggest;
    if (best.card.kind === 'spell') {
      // 對著威脅群的重心投放
      const cx = threats.reduce((a, c) => a + c.x, 0) / threats.length;
      const cz = threats.reduce((a, c) => a + c.z, 0) / threats.length;
      return { index: best.index, x: cx, z: cz };
    }
    const towardOwn = this.side === 0 ? -1.6 : 1.6;
    return { index: best.index, x: t.x + (this.rng() - 0.5), z: t.z + towardOwn };
  }

  /** 進攻：坦克在前、輸出在後，落在自家橋前。 */
  pickPush(hand) {
    const b = this.battle;
    const me = b.players[this.side];
    const half = ARENA.length / 2;
    const laneX = this.preferredLane === 'left' ? 3.5 : 14.5;
    const backZ = this.side === 0 ? half - 4.5 : half + 4.5;

    const affordable = hand
      .map((key, index) => ({ key, index, card: ALL_CARDS[key] }))
      .filter((c) => c.card && me.elixir >= c.card.elixir && c.card.kind !== 'spell');
    if (!affordable.length) return null;

    // 有坦克先出坦克
    const tank = affordable.find((c) => c.card.unit?.targetOnly === 'buildings' && c.card.unit.hp > 1500);
    const pick = tank || affordable.reduce((a, c) => (c.card.elixir > a.card.elixir ? c : a), affordable[0]);

    if (this.rng() < 0.25) this.preferredLane = this.preferredLane === 'left' ? 'right' : 'left';
    return { index: pick.index, x: laneX + (this.rng() - 0.5) * 1.2, z: backZ };
  }
}

const clampX = (x) => Math.max(0.6, Math.min(ARENA.width - 0.6, x));
const clampZ = (z) => Math.max(0.6, Math.min(ARENA.length - 0.6, z));

export default BotController;
