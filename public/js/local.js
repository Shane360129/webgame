/**
 * AI 練習模式：在瀏覽器裡跑**同一份**模擬器。
 *
 * 這不是另一套簡化規則 —— /shared/sim.js 與伺服器 import 的是同一個檔案，
 * 所以練習與線上的規則、數值、勝負判定完全一致；差別只在對手是 AI，
 * 而且 UI 會明確標示，不會計入獎盃或排行榜。
 */
import { Battle } from '/shared/sim.js';
import { BotController } from '/shared/ai.js';
import { TICK_SECONDS } from '/shared/rules.js';

export class LocalBattle extends EventTarget {
  constructor({ profile, difficulty = 'normal', botDeck }) {
    super();
    this.difficulty = difficulty;
    this.battle = new Battle({
      seed: (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0,
      mode: 'practice',
      players: [
        {
          name: profile.name,
          deck: profile.deck,
          evos: profile.evos,
          champion: profile.champion,
          towerTroop: profile.towerTroop,
        },
        { name: '電腦對手（AI）', isBot: true, deck: botDeck, towerTroop: 'tower_princess' },
      ],
    });
    this.bot = new BotController(this.battle, 1, { difficulty });
    this.acc = 0;
    this.running = true;
    this.you = 0;
    this.snapshotAcc = 0;
  }

  /** 由畫面迴圈驅動，維持 20 Hz 的固定步長。 */
  advance(dt) {
    if (!this.running) return;
    this.acc += Math.min(dt, 0.25);
    let steps = 0;
    while (this.acc >= TICK_SECONDS && steps < 8) {
      this.acc -= TICK_SECONDS;
      steps += 1;
      this.bot.update(TICK_SECONDS);
      this.battle.step();
    }
    if (!steps) return;

    const events = this.battle.drainEvents();
    if (events.length) this.emit('events', { events });

    this.snapshotAcc += steps * TICK_SECONDS;
    if (this.snapshotAcc >= 0.05) {
      this.snapshotAcc = 0;
      this.emit('snapshot', { s: this.battle.snapshot() });
    }
    if (this.battle.finished && this.running) {
      this.running = false;
      this.emit('matchEnd', { result: this.battle.result });
    }
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  on(type, fn) { this.addEventListener(type, (e) => fn(e.detail)); return this; }

  play(index, x, z) { return this.battle.playCard(0, index, x, z); }
  champion(x, z) { return this.battle.playChampion(0, x, z); }
  ability() { return this.battle.useAbility(0); }
  resign() { this.battle.forfeit(0, 'resign'); }
  canDeployAt(cardKey, x, z) { return this.battle.canDeployAt(0, cardKey, x, z); }
  deployBounds() { return this.battle.deployBounds(0); }
}
