/**
 * 部署合法性的純函式版本。
 *
 * 抽出來的原因：客戶端要在拖曳時即時顯示「這裡能不能放」，
 * 而且判斷必須和伺服器權威判定**用同一份程式**，
 * 否則會出現看起來合法、送出後被拒的落差。
 */
import { ARENA, DEPLOY } from './rules.js';

const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const inRiver = (z) => z > ARENA.riverZ[0] && z < ARENA.riverZ[1];
const onBridge = (x) => ARENA.bridges.some((b) => Math.abs(x - b.x) <= b.halfWidth);

export function laneOfTower(t) {
  return t.lane || (t.x < ARENA.width / 2 ? 'left' : 'right');
}

/**
 * @param {object} args
 * @param {Array} args.towers [{side,kind,lane,x,z,radius,alive}]
 * @param {number} args.side
 * @param {object} args.card 目錄項目
 * @param {number} args.x
 * @param {number} args.z
 */
export function checkDeploy({ towers, side, card, x, z }) {
  if (!card) return { ok: false, reason: 'unknown_card' };
  if (x < 0.4 || x > ARENA.width - 0.4 || z < 0.4 || z > ARENA.length - 0.4) {
    return { ok: false, reason: 'out_of_bounds' };
  }
  if (card.kind === 'spell') return { ok: true };
  if (card.unit?.deployAnywhere) return { ok: true };

  if (DEPLOY.blockRiver && inRiver(z) && !onBridge(x)) {
    return { ok: false, reason: 'river' };
  }

  const half = ARENA.length / 2;
  const ownSide = side === 0 ? z < half : z > half;
  if (!ownSide) {
    if (!DEPLOY.advanceOnTowerDestroyed) return { ok: false, reason: 'enemy_half' };
    const lane = x < ARENA.width / 2 ? 'left' : 'right';
    const enemyTower = towers.find(
      (t) => t.side === 1 - side && t.kind === 'princess' && laneOfTower(t) === lane,
    );
    if (enemyTower && enemyTower.alive) return { ok: false, reason: 'enemy_half' };
    const limit = side === 0 ? half + DEPLOY.advanceDepth : half - DEPLOY.advanceDepth;
    const withinAdvance = side === 0 ? z <= limit : z >= limit;
    if (!withinAdvance) return { ok: false, reason: 'too_deep' };
  }

  for (const t of towers) {
    if (t.side === side || !t.alive) continue;
    if (dist(x, z, t.x, t.z) < (t.radius || 1.5) + DEPLOY.minDistanceToEnemyBuilding) {
      return { ok: false, reason: 'too_close_to_enemy_building' };
    }
  }
  return { ok: true };
}

/** 目前可部署的 z 範圍（左右路各一），給 UI 畫遮罩。 */
export function deployBoundsFor({ towers, side }) {
  const half = ARENA.length / 2;
  const lanes = {};
  for (const lane of ['left', 'right']) {
    const enemy = towers.find((t) => t.side === 1 - side && t.kind === 'princess' && laneOfTower(t) === lane);
    const destroyed = !enemy || !enemy.alive;
    if (destroyed) {
      lanes[lane] = side === 0
        ? [0.4, half + DEPLOY.advanceDepth]
        : [half - DEPLOY.advanceDepth, ARENA.length - 0.4];
    } else {
      lanes[lane] = side === 0 ? [0.4, half - 0.1] : [half + 0.1, ARENA.length - 0.4];
    }
  }
  return lanes;
}

export const DEPLOY_REASONS = {
  out_of_bounds: '超出場地',
  river: '不能放在河道',
  enemy_half: '敵方半場（需先摧毀該路公主塔）',
  too_deep: '推進距離超出限制',
  too_close_to_enemy_building: '離敵方建築太近',
  not_enough_elixir: '聖水不足',
  unknown_card: '未知卡片',
  bad_index: '手牌索引錯誤',
  finished: '對戰已結束',
};
