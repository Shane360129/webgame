/**
 * 對戰規則常數。
 *
 * 每個常數都標註 provenance：
 *   verified: true  = 有公開官方說明頁或更新公告可對照的規則性敘述
 *   verified: false = 依公開常識實作，尚未對照指定版本重播，屬待查
 *
 * 註：本檔只描述「規則」（時間、聖水速率、勝負判定），
 *     不宣稱數值與任何特定平衡版本逐項一致。
 */

export const SOURCES = {
  elixir: 'https://support.supercell.com/clash-royale/en/articles/elixir.html',
  timing: 'https://supercell.com/en/games/clashroyale/blog/release-notes/november-update/',
  evolution: 'https://support.clashroyale.com/hc/en-us/articles/49484923993883-Card-Evolution',
  towerTroops: 'https://supercell.com/en/games/clashroyale/blog/release-notes/game-update-december-13',
  deckSlots: 'https://supercell.com/en/games/clashroyale/blog/release-notes/march-update-2026/',
  season: 'https://supercell.com/en/games/clashroyale/blog/release-notes/new-season-minion-academy/',
  chests: 'https://supercell.com/en/games/clashroyale/blog/news/clash-royale-chest-info-2/',
};

/** 模擬頻率：所有時間常數都以秒表示，由 TICK_RATE 換算成 tick。 */
export const TICK_RATE = 20;
export const TICK_SECONDS = 1 / TICK_RATE;

export const TIMING = {
  /** 正規賽 3:00。 */
  regulationSeconds: 180,
  /** 單倍聖水期間（前 2:00）。 */
  singleElixirSeconds: 120,
  /** 延長賽 2:00。 */
  overtimeSeconds: 120,
  /** 塔全毀立即結束；否則正規賽結束平手才進延長賽。 */
  source: SOURCES.timing,
  verified: true,
};

export const ELIXIR = {
  max: 10,
  /** 單倍：每 2.8 秒 1 點。二倍 / 三倍為其倍率。 */
  secondsPerElixirSingle: 2.8,
  multipliers: { single: 1, double: 2, triple: 3 },
  /** 開場聖水。 */
  startingElixir: 5,
  source: SOURCES.elixir,
  verified: true,
};

/**
 * 場地座標系（單位：tile）。
 * x 往右、z 從我方底線（0）往敵方底線（32）。
 * 這是重製用的工作座標，不宣稱與原作內部座標一致。
 */
export const ARENA = {
  width: 18,
  length: 32,
  riverZ: [15.4, 16.6],
  bridges: [
    { x: 3.5, halfWidth: 1.35 },
    { x: 14.5, halfWidth: 1.35 },
  ],
  verified: false,
  note: '場地比例依公開對戰畫面重建，未對照官方尺規。',
};

/** 本方（side 0）在 z 小的一側；敵方（side 1）鏡射。 */
export const TOWER_LAYOUT = {
  princess: [
    { lane: 'left', x: 3.5, z: 6.5 },
    { lane: 'right', x: 14.5, z: 6.5 },
  ],
  king: { x: 9, z: 3.2 },
  radius: { princess: 1.5, king: 2.0 },
};

export const TOWER_STATS = {
  /** 等級 11 的公開常見值；未經指定版本驗證。 */
  princess: {
    hp: 2534,
    damage: 109,
    hitSpeed: 0.8,
    range: 7.5,
    sightRange: 7.5,
    targetsAir: true,
    verified: false,
  },
  king: {
    hp: 4008,
    damage: 109,
    hitSpeed: 1.0,
    range: 7.0,
    sightRange: 7.0,
    targetsAir: true,
    verified: false,
  },
};

/**
 * 王塔啟動條件（前一版的缺陷之一：一開場就會攻擊）。
 * 只要下列任一成立，王塔才開始索敵：
 *   1. 我方任一公主塔被摧毀
 *   2. 王塔本身受到任何傷害（含法術）
 * 這是規則性條件，可由公開說明與對戰行為對照。
 */
export const KING_ACTIVATION = {
  onPrincessTowerDestroyed: true,
  onKingTowerDamaged: true,
  /** 啟動後的短暫上線延遲。 */
  activationDelaySeconds: 0,
  verified: true,
};

export const DECK = {
  /** 一般卡槽。 */
  slots: 8,
  /** 手牌 4 張 + 下一張，抽牌為固定循環而非重抽。 */
  handSize: 4,
  /**
   * 2026 三月更新之後卡組不再只是 8 個普通卡槽，
   * 另有 Evo / Hero / Wild 類卡槽配置。
   * 這裡實作 Evo 與 Champion（Hero）槽，Wild 槽標記為未實作。
   */
  evoSlots: 2,
  championSlots: 1,
  towerTroopSlots: 1,
  wildSlotsImplemented: false,
  source: SOURCES.deckSlots,
  verified: false,
  note: '卡槽配置依三月更新公告實作 Evo/Champion/塔兵；Wild 槽尚未對照最新公告，標記待查。',
};

/** 進化：需先循環指定次數才會以進化型態出牌。 */
export const EVOLUTION = {
  defaultCyclesRequired: 2,
  source: SOURCES.evolution,
  verified: true,
  note: '循環次數依卡片個別設定；進化後能力為個別實作，不是單純加血。',
};

/** 部署規則。 */
export const DEPLOY = {
  /** 一般部署延遲（單位落地到可行動）。 */
  defaultDeploySeconds: 1.0,
  /** 不可部署在河道上（法術與部分卡例外）。 */
  blockRiver: true,
  /** 距離敵方存活建築的最小部署距離。 */
  minDistanceToEnemyBuilding: 2.4,
  /**
   * 摧毀敵方公主塔後，該路可推進部署到敵方半場。
   * 邊界為被摧毀塔所在半邊 + 中線往前若干 tile。
   */
  advanceOnTowerDestroyed: true,
  advanceDepth: 10.5,
  verified: false,
};

/**
 * 勝負判定。
 * regulation -> overtime(sudden death) -> tiebreaker(最低塔血量百分比)
 */
export const VICTORY = {
  crownsForInstantWin: 3,
  overtimeSuddenDeath: true,
  tiebreakerByLowestTowerPercent: true,
  source: SOURCES.timing,
  verified: true,
  note: '同時摧塔、等血量與特殊事件的細部處理仍需對照指定版本重播。',
};

/** 法術對王塔／公主塔的傷害折減係數（各卡個別覆寫）。 */
export const DEFAULT_CROWN_TOWER_FACTOR = 0.35;

export function elixirPerSecond(phase) {
  const mult = ELIXIR.multipliers[phase] ?? 1;
  return mult / ELIXIR.secondsPerElixirSingle;
}

/**
 * 依比賽經過秒數回傳目前階段。
 * @param {number} t 自開場起的秒數
 * @param {boolean} overtime 是否已進入延長賽
 */
export function phaseAt(t, overtime) {
  if (overtime) return 'triple';
  return t < TIMING.singleElixirSeconds ? 'single' : 'double';
}

/** 鏡射座標：把 side 0 的座標換算到 side 1。 */
export function mirrorZ(z) {
  return ARENA.length - z;
}
export function mirrorX(x) {
  return ARENA.width - x;
}
