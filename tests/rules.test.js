/**
 * 規則檢核案例。
 *
 * 查核文件第 8 節要求「卡牌輪替、時間、聖水、索敵、傷害、控制、
 * 摧塔與勝負有獨立檢核案例」。每個 test 對應其中一項。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { Battle, makeRng } from '../src/shared/sim.js';
import { TIMING, ELIXIR, ARENA, DECK, elixirPerSecond, phaseAt } from '../src/shared/rules.js';
import { checkDeploy, deployBoundsFor } from '../src/shared/deploy.js';
import { ALL_CARDS } from '../src/shared/catalogue.js';

const DECK8 = ['knight', 'archers', 'goblins', 'musketeer', 'cannon', 'fireball', 'zap', 'giant'];

function battle(opts = {}) {
  return new Battle({
    seed: 42,
    players: [
      { name: 'A', deck: DECK8, ...opts.a },
      { name: 'B', deck: DECK8, ...opts.b },
    ],
  });
}

/** 讓某張卡一定在手牌 index 0。 */
function forceHand(b, side, order) {
  b.players[side].queue = order.slice();
}

function run(b, seconds) {
  const n = Math.round(seconds * 20);
  for (let i = 0; i < n && !b.finished; i += 1) b.step();
}

// ───────── 時間與聖水 ─────────

test('聖水速率：單倍每 2.8 秒 1 點，二倍與三倍為其倍數', () => {
  assert.equal(ELIXIR.secondsPerElixirSingle, 2.8);
  assert.ok(Math.abs(elixirPerSecond('single') - 1 / 2.8) < 1e-9);
  assert.ok(Math.abs(elixirPerSecond('double') - 2 / 2.8) < 1e-9);
  assert.ok(Math.abs(elixirPerSecond('triple') - 3 / 2.8) < 1e-9);
});

test('階段切換：前 2:00 單倍，之後二倍，延長賽三倍', () => {
  assert.equal(phaseAt(0, false), 'single');
  assert.equal(phaseAt(119.9, false), 'single');
  assert.equal(phaseAt(120, false), 'double');
  assert.equal(phaseAt(10, true), 'triple');
});

test('聖水上限為 10 且開場為 5', () => {
  const b = battle();
  assert.equal(b.players[0].elixir, ELIXIR.startingElixir);
  run(b, 60);
  assert.ok(b.players[0].elixir <= ELIXIR.max + 1e-9);
});

test('正規賽 3:00 結束且皇冠相同時進入延長賽', () => {
  const b = battle();
  run(b, TIMING.regulationSeconds + 0.2);
  assert.equal(b.overtime, true);
  assert.equal(b.finished, false);
});

test('延長賽結束以最低塔血量百分比判定，相同則平手', () => {
  const b = battle();
  b.overtime = true;
  b.overtimeTime = TIMING.overtimeSeconds;
  b.step();
  assert.equal(b.finished, true);
  assert.equal(b.result.reason, 'draw');
  assert.equal(b.result.winner, null);

  const c = battle();
  c.overtime = true;
  c.overtimeTime = TIMING.overtimeSeconds;
  const t = c.towers.find((x) => x.side === 0 && x.kind === 'princess');
  t.hp = 10;
  c.step();
  assert.equal(c.result.reason, 'tiebreaker');
  assert.equal(c.result.winner, 1);
});

// ───────── 卡牌輪替 ─────────

test('出牌後該卡回到隊列尾端（固定循環，不是重抽）', () => {
  const b = battle();
  forceHand(b, 0, DECK8);
  const before = b.players[0].queue.slice();
  b.players[0].elixir = 10;
  const played = before[0];
  const r = b.playCard(0, 0, 5, 8);
  assert.equal(r.ok, true);
  const after = b.players[0].queue;
  assert.equal(after[after.length - 1], played);
  assert.equal(after.length, DECK.slots);
  assert.deepEqual(new Set(after), new Set(before));
});

test('手牌 4 張，第 5 張為「下一張」', () => {
  const b = battle();
  assert.equal(b.hand(0).length, 4);
  assert.equal(typeof b.nextCard(0), 'string');
  assert.ok(!b.hand(0).includes(b.nextCard(0)));
});

test('進化需要先循環指定次數', () => {
  const b = battle({ a: { evos: ['knight'] } });
  forceHand(b, 0, ['knight', 'archers', 'goblins', 'musketeer', 'cannon', 'fireball', 'zap', 'giant']);
  b.players[0].elixir = 10;
  assert.equal(b.isEvolvedNext(0, 'knight'), false);
  b.playCard(0, 0, 5, 8);            // 第 1 次循環
  b.players[0].queue = ['knight', 'archers', 'goblins', 'musketeer', 'cannon', 'fireball', 'zap', 'giant'];
  b.players[0].elixir = 10;
  b.playCard(0, 0, 5, 8);            // 第 2 次循環
  b.players[0].queue = ['knight', 'archers', 'goblins', 'musketeer', 'cannon', 'fireball', 'zap', 'giant'];
  assert.equal(b.isEvolvedNext(0, 'knight'), true);
  b.players[0].elixir = 10;
  const r = b.playCard(0, 0, 5, 8);
  assert.equal(r.evolved, true);
  assert.equal(b.isEvolvedNext(0, 'knight'), false, '打出後進化充能歸零');
});

// ───────── 部署 ─────────

test('部署：不能放在河道、不能放敵方半場、法術不受限', () => {
  const b = battle();
  const towers = b.towers;
  assert.equal(checkDeploy({ towers, side: 0, card: ALL_CARDS.knight, x: 9, z: 16 }).reason, 'river');
  assert.equal(checkDeploy({ towers, side: 0, card: ALL_CARDS.knight, x: 9, z: 24 }).reason, 'enemy_half');
  assert.equal(checkDeploy({ towers, side: 0, card: ALL_CARDS.fireball, x: 9, z: 28 }).ok, true);
  assert.equal(checkDeploy({ towers, side: 0, card: ALL_CARDS.knight, x: 3.5, z: 15.5 }).ok, true, '自己這半的橋上可部署');
  assert.equal(checkDeploy({ towers, side: 0, card: ALL_CARDS.knight, x: 3.5, z: 16.4 }).reason, 'enemy_half',
    '橋的另一半仍屬敵方半場');
  assert.equal(checkDeploy({ towers, side: 0, card: ALL_CARDS.miner, x: 9, z: 28 }).ok, true, '礦工可任意部署');
});

test('摧毀敵方公主塔後該路可推進部署', () => {
  const b = battle();
  const before = deployBoundsFor({ towers: b.towers, side: 0 });
  assert.ok(before.right[1] < ARENA.length / 2);
  const rightTower = b.towers.find((t) => t.side === 1 && t.kind === 'princess' && b.laneOfTower(t) === 'right');
  rightTower.alive = false;
  const after = deployBoundsFor({ towers: b.towers, side: 0 });
  assert.ok(after.right[1] > ARENA.length / 2);
  assert.ok(after.left[1] < ARENA.length / 2, '另一路不受影響');
});

test('聖水不足時無法出牌，且不會扣除聖水', () => {
  const b = battle();
  forceHand(b, 0, ['giant', 'archers', 'goblins', 'musketeer', 'cannon', 'fireball', 'zap', 'knight']);
  b.players[0].elixir = 1;
  const r = b.playCard(0, 0, 5, 8);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not_enough_elixir');
  assert.equal(b.players[0].elixir, 1);
});

// ───────── 王塔啟動 ─────────

test('王塔開場未啟動，公主塔被摧毀後啟動', () => {
  const b = battle();
  const king = b.kingOf(0);
  assert.equal(king.active, false);
  const princess = b.towers.find((t) => t.side === 0 && t.kind === 'princess');
  b.damageTower(princess, princess.hp, { side: 1 });
  assert.equal(king.active, true);
});

test('王塔受到傷害也會啟動', () => {
  const b = battle();
  const king = b.kingOf(1);
  assert.equal(king.active, false);
  b.damageTower(king, 1, { side: 0 });
  assert.equal(king.active, true);
});

test('未啟動的王塔不會攻擊，即使敵方單位就在射程內', () => {
  const b = battle();
  const king = b.kingOf(1);
  // 放一個不會動也不會攻擊的假想目標在王塔射程內，
  // 這樣唯一的變數就是「王塔要不要開火」。
  const dummy = b.spawnCard('knight', 0, 9, 23.8, { instant: true })[0];
  dummy.baseSpeed = 0;
  dummy.noAttack = true;
  const d = Math.hypot(dummy.x - king.x, dummy.z - king.z);
  assert.ok(d < king.range, `距離 ${d.toFixed(2)} 應在王塔射程內`);

  const shots = [];
  for (let i = 0; i < 40; i += 1) {
    b.step();
    for (const ev of b.drainEvents()) if (ev.type === 'towerShoot' && ev.id === king.id) shots.push(ev);
  }
  assert.equal(king.active, false, '王塔仍未啟動');
  assert.equal(shots.length, 0, '未啟動的王塔不應開火');

  // 啟動後就會開火。
  b.damageTower(king, 1, { side: 0 });
  assert.equal(king.active, true);
  const after = [];
  for (let i = 0; i < 40; i += 1) {
    b.step();
    for (const ev of b.drainEvents()) if (ev.type === 'towerShoot' && ev.id === king.id) after.push(ev);
  }
  assert.ok(after.length > 0, '啟動後應開火');
});

// ───────── 索敵與移動 ─────────

test('僅建築目標的單位會忽略部隊直奔建築', () => {
  const b = battle();
  const giant = b.spawnCard('giant', 0, 3.5, 12, { instant: true })[0];
  b.spawnCard('archers', 1, 3.5, 13.5, { instant: true });
  b.step();
  const target = b.entityById(giant.targetId);
  assert.ok(target, '應有目標');
  assert.notEqual(target.card, 'archers');
  assert.ok(target.entity === 'tower' || target.isBuilding);
});

test('建築吸引：地獄塔會把巨人從塔上拉走', () => {
  const b = battle();
  const giant = b.spawnCard('giant', 0, 3.5, 12, { instant: true })[0];
  b.step();
  const first = b.entityById(giant.targetId);
  assert.equal(first.entity, 'tower');
  const tower = b.spawnCard('inferno_tower', 1, 3.5, 17, { instant: true })[0];
  giant.targetId = null;
  b.step();
  assert.equal(b.entityById(giant.targetId).id, tower.id);
});

test('不可對空的單位不會鎖定飛行單位', () => {
  const b = battle();
  const knight = b.spawnCard('knight', 0, 9, 10, { instant: true })[0];
  const minion = b.spawnCard('minions', 1, 9, 11, { instant: true })[0];
  b.step();
  const t = b.entityById(knight.targetId);
  assert.notEqual(t?.id, minion.id);
});

test('地面單位過河必須走橋', () => {
  const b = battle();
  const knight = b.spawnCard('knight', 0, 9, 14, { instant: true })[0];
  let crossedOffBridge = false;
  for (let i = 0; i < 20 * 40 && knight.alive; i += 1) {
    b.step();
    if (knight.z > 15.4 && knight.z < 16.6) {
      const onBridge = ARENA.bridges.some((br) => Math.abs(knight.x - br.x) <= br.halfWidth + 0.3);
      if (!onBridge) crossedOffBridge = true;
    }
    if (knight.z > 17) break;
  }
  assert.equal(crossedOffBridge, false, '不應直接涉水');
});

test('會跳河的單位可以不走橋', () => {
  const b = battle();
  const hog = b.spawnCard('hog_rider', 0, 9, 14, { instant: true })[0];
  for (let i = 0; i < 20 * 15 && hog.alive && hog.z < 18; i += 1) b.step();
  assert.ok(hog.z > 16.6, '野豬騎士應已過河');
  assert.ok(Math.abs(hog.x - 9) < 2.5, '應直線過河而不是繞到橋上');
});

// ───────── 碰撞 ─────────

test('同陣營地面單位會互相推開，不會重疊', () => {
  const b = battle();
  const a = b.spawnCard('knight', 0, 9, 10, { instant: true })[0];
  const c = b.spawnCard('knight', 0, 9.01, 10, { instant: true })[0];
  for (let i = 0; i < 10; i += 1) b.step();
  const d = Math.hypot(a.x - c.x, a.z - c.z);
  assert.ok(d >= (a.radius + c.radius) * 0.9, `距離 ${d} 應接近半徑和`);
});

test('空中與地面單位不互相碰撞', () => {
  const b = battle();
  const ground = b.spawnCard('knight', 0, 9, 10, { instant: true })[0];
  const air = b.spawnCard('minions', 0, 9, 10, { instant: true })[0];
  for (let i = 0; i < 6; i += 1) b.step();
  assert.ok(Math.hypot(ground.x - air.x, ground.z - air.z) < 1.0);
});

// ───────── 法術 ─────────

test('法術對塔傷害有折減係數', () => {
  const b = battle();
  const tower = b.towers.find((t) => t.side === 1 && t.kind === 'princess');
  const before = tower.hp;
  const fb = ALL_CARDS.fireball;
  b.castSpell(fb, 0, tower.x, tower.z);
  run(b, 2);
  const dealt = before - tower.hp;
  const expected = Math.round(fb.spell.damage * fb.spell.crownTowerFactor);
  assert.equal(dealt, expected);
  assert.ok(dealt < fb.spell.damage, '對塔傷害應低於對單位傷害');
});

test('投射型法術有飛行時間，不是立即結算', () => {
  const b = battle();
  const target = b.spawnCard('archers', 1, 9, 12, { instant: true })[0];
  const hp = target.hp;
  b.castSpell(ALL_CARDS.fireball, 0, 9, 12);
  b.step();
  assert.equal(target.hp, hp, '施放當下不應造成傷害');
  run(b, 1.2);
  assert.ok(target.hp < hp, '飛行時間過後才結算');
});

test('滾木沿路推進並擊退，且打不到空中單位', () => {
  const b = battle();
  const ground = b.spawnCard('goblins', 1, 9, 12, { instant: true })[0];
  const air = b.spawnCard('minions', 1, 9, 12.6, { instant: true })[0];
  const gz = ground.z;
  const airHp = air.hp;
  b.castSpell(ALL_CARDS.the_log, 0, 9, 10);
  run(b, 1.5);
  assert.ok(!ground.alive || ground.z > gz, '地面單位應被擊退或死亡');
  assert.equal(air.hp, airHp, '空中單位不應受滾木傷害');
});

test('毒藥是持續光環，會隨時間累積傷害', () => {
  const b = battle();
  const t = b.spawnCard('knight', 1, 9, 12, { instant: true })[0];
  b.castSpell(ALL_CARDS.poison, 0, 9, 12);
  run(b, 1.2);
  const afterOne = t.hp;
  assert.ok(afterOne < t.maxHp);
  run(b, 2);
  assert.ok(t.hp < afterOne, '傷害應持續累積');
});

test('冰凍會停止單位行動', () => {
  const b = battle();
  const t = b.spawnCard('knight', 1, 9, 12, { instant: true })[0];
  run(b, 1);
  const z0 = t.z;
  b.castSpell(ALL_CARDS.freeze, 0, t.x, t.z);
  run(b, 1.4);
  const zFrozen = t.z;
  run(b, 1.5);
  assert.ok(Math.abs(t.z - zFrozen) < 0.25, '凍結期間不應移動');
  assert.notEqual(z0, undefined);
});

test('閃電鎖定範圍內生命值最高的目標', () => {
  const b = battle();
  const tank = b.spawnCard('knight', 1, 9, 12, { instant: true })[0];
  const weak = b.spawnCard('skeletons', 1, 9.6, 12, { instant: true })[0];
  b.castSpell(ALL_CARDS.lightning, 0, 9, 12);
  run(b, 1.4);
  assert.ok(tank.hp < tank.maxHp, '高血量目標應被擊中');
  assert.equal(weak.alive, false, '範圍內第二、三目標也會被擊中');
});

test('哥布林飛桶落地後才生成單位', () => {
  const b = battle();
  const before = b.units.length;
  b.castSpell(ALL_CARDS.goblin_barrel, 0, 9, 24);
  b.step();
  assert.equal(b.units.length, before, '施放當下不生成');
  run(b, 1.4);
  assert.ok(b.units.length >= before + 3, '落地後生成 3 隻哥布林');
});

test('墓園分波生成骷髏，而不是一次全出', () => {
  const b = battle();
  b.castSpell(ALL_CARDS.graveyard, 0, 9, 24);
  run(b, 1.5);
  const early = b.units.filter((u) => u.card === 'skeletons').length;
  run(b, 4);
  const later = b.units.filter((u) => u.card === 'skeletons').length;
  assert.ok(early >= 1 && early < 16, `第一波應少量，實得 ${early}`);
  assert.ok(later > early, '之後應持續增加');
});

// ───────── 傷害與勝負 ─────────

test('護盾會先吸收傷害', () => {
  const b = battle();
  const r = b.spawnCard('royal_recruit', 0, 9, 10, { instant: true })[0];
  assert.ok(r.shieldHp > 0);
  const hp = r.hp;
  b.damageUnit(r, 100, { side: 1 });
  assert.equal(r.hp, hp, '護盾未破前本體不掉血');
  b.damageUnit(r, 1000, { side: 1 });
  assert.ok(r.hp < hp);
});

test('摧毀王塔立即結束並判 3 皇冠', () => {
  const b = battle();
  const king = b.kingOf(1);
  b.damageTower(king, king.hp, { side: 0 });
  assert.equal(b.finished, true);
  assert.equal(b.result.winner, 0);
  assert.equal(b.result.reason, 'king_tower');
  assert.equal(b.players[0].crowns, 3);
});

test('延長賽中先摧毀一座塔即獲勝', () => {
  const b = battle();
  b.overtime = true;
  const t = b.towers.find((x) => x.side === 1 && x.kind === 'princess');
  b.damageTower(t, t.hp, { side: 0 });
  assert.equal(b.finished, true);
  assert.equal(b.result.reason, 'sudden_death');
  assert.equal(b.result.winner, 0);
});

test('斷線逾時判負', () => {
  const b = battle();
  b.forfeit(0, 'disconnect');
  assert.equal(b.result.winner, 1);
  assert.equal(b.result.reason, 'disconnect');
});

// ───────── 決定性 ─────────

test('相同 seed 與相同輸入會得到相同結果（伺服器與客戶端一致）', () => {
  const play = (b) => {
    for (let i = 0; i < 20 * 90; i += 1) {
      if (i % 120 === 0) { b.players[0].elixir = 10; b.playCard(0, i % 4, 4 + (i % 5), 10); }
      if (i % 150 === 0) { b.players[1].elixir = 10; b.playCard(1, i % 4, 4 + (i % 5), 22); }
      b.step();
    }
    return JSON.stringify(b.snapshot());
  };
  assert.equal(play(battle()), play(battle()));
});

test('可重現亂數：同 seed 同序列', () => {
  const a = makeRng(1234);
  const c = makeRng(1234);
  const A = [a(), a(), a()];
  const C = [c(), c(), c()];
  assert.deepEqual(A, C);
});
