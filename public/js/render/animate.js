/**
 * 動作系統。
 *
 * 查核門檻要求「出生、待機、移動、攻擊、受擊、死亡與特殊技能有定義與驗證」。
 * 這裡對每個 gait 定義各自的擺動方式，並在 model.state 記錄相位，
 * 讓同一張卡的多個實體不會同步得像複製人。
 */

const TAU = Math.PI * 2;

export function initAnimState(model, seedPhase = Math.random() * TAU) {
  model.state = {
    phase: seedPhase,
    attack: 0,
    hurt: 0,
    death: 0,
    spawn: 1,
    hoverPhase: seedPhase,
    lastAnim: 'spawn',
  };
  model.root.scale.multiplyScalar(0.01);
  return model.state;
}

export function triggerAttack(model) {
  if (model.state) model.state.attack = 1;
}
export function triggerHurt(model) {
  if (model.state) model.state.hurt = 1;
}

/**
 * @param {object} model buildCardModel 的回傳
 * @param {object} u 快照中的單位
 * @param {number} dt 秒
 */
export function animateModel(model, u, dt) {
  const s = model.state;
  if (!s) return;
  const p = model.parts;
  const moving = u.an === 'walk';
  const speedish = moving ? 1 : 0;

  // 出生：縮放彈入
  if (s.spawn > 0) {
    s.spawn = Math.max(0, s.spawn - dt * 3.2);
    const k = 1 - s.spawn;
    const overshoot = 1 + Math.sin(k * Math.PI) * 0.18;
    model.root.scale.setScalar(model.baseScale * k * overshoot);
  }

  // 死亡：倒下 + 沉入地面
  if (u.al === 0) {
    s.death = Math.min(1, s.death + dt * 2.4);
    model.root.rotation.x = -s.death * 1.3;
    model.root.position.y = -s.death * 0.5;
    setOpacity(model, 1 - s.death);
    return;
  }

  if (s.attack > 0) s.attack = Math.max(0, s.attack - dt * 3.6);
  if (s.hurt > 0) s.hurt = Math.max(0, s.hurt - dt * 5);

  s.phase += dt * (moving ? gaitSpeed(model.gait) : 1.4);
  s.hoverPhase += dt * 2.2;

  const sw = Math.sin(s.phase);
  const cw = Math.cos(s.phase);
  const atk = easeOutBack(1 - s.attack);

  switch (model.gait) {
    case 'walk':
      swingLegs(p, sw * 0.7 * speedish);
      swingArms(p, -sw * 0.5 * speedish, s.attack);
      bob(model, p, Math.abs(sw) * 0.045 * speedish);
      break;
    case 'scurry':
      swingLegs(p, sw * 0.95 * speedish);
      swingArms(p, -sw * 0.75 * speedish, s.attack);
      bob(model, p, Math.abs(sw) * 0.07 * speedish);
      if (p.head) p.head.rotation.z = sw * 0.1 * speedish;
      break;
    case 'rattle':
      swingLegs(p, sw * 0.8 * speedish);
      swingArms(p, -sw * 0.6 * speedish, s.attack);
      if (p.head) {
        p.head.rotation.z = sw * 0.16 * speedish;
        p.head.position.y = Math.abs(sw) * 0.02 * speedish;
      }
      break;
    case 'lumber':
      swingLegs(p, sw * 0.42 * speedish);
      swingArms(p, -sw * 0.3 * speedish, s.attack);
      bob(model, p, Math.abs(sw) * 0.07 * speedish);
      if (p.torso) p.torso.rotation.z = sw * 0.06 * speedish;
      break;
    case 'stomp':
      swingLegs(p, sw * 0.5 * speedish);
      swingArms(p, -sw * 0.34 * speedish, s.attack);
      bob(model, p, Math.max(0, sw) * 0.1 * speedish);
      break;
    case 'glide':
      if (p.robe) p.robe.rotation.z = sw * 0.05 * speedish;
      bob(model, p, Math.sin(s.hoverPhase) * 0.03);
      swingArms(p, -sw * 0.2 * speedish, s.attack);
      break;
    case 'gallop': {
      const legs = p.mountLegs || [];
      legs.forEach((leg, i) => {
        const off = i < 2 ? 0 : Math.PI;
        leg.rotation.x = Math.sin(s.phase * 1.6 + off) * 0.9 * speedish;
      });
      bob(model, p, Math.abs(Math.sin(s.phase * 1.6)) * 0.09 * speedish);
      if (p.torso) p.torso.rotation.x = Math.sin(s.phase * 1.6) * 0.08 * speedish;
      swingArms(p, 0, s.attack);
      break;
    }
    case 'roll':
      if (p.wheelL) p.wheelL.rotation.x -= dt * 6 * speedish;
      if (p.wheelR) p.wheelR.rotation.x -= dt * 6 * speedish;
      if (p.torso && model.card === 'battle_ram') p.torso.rotation.z = Math.sin(s.phase * 2) * 0.05 * speedish;
      if (p.legL) p.legL.position.y = Math.abs(Math.sin(s.phase * 2)) * 0.05 * speedish;
      if (p.legR) p.legR.position.y = Math.abs(Math.cos(s.phase * 2)) * 0.05 * speedish;
      if (p.orb) p.orb.scale.setScalar(1 + Math.sin(s.hoverPhase * 3) * 0.08);
      break;
    case 'fly': {
      const flap = Math.sin(s.hoverPhase * 3.4);
      if (p.wingL) p.wingL.rotation.z = 0.35 + flap * 0.75;
      if (p.wingR) p.wingR.rotation.z = -0.35 - flap * 0.75;
      if (p.tail) p.tail.rotation.z = flap * 0.16;
      model.root.position.y = model.hoverBase + Math.sin(s.hoverPhase * 1.7) * 0.09;
      swingArms(p, flap * 0.15, s.attack);
      break;
    }
    case 'float':
      model.root.position.y = model.hoverBase + Math.sin(s.hoverPhase * 1.1) * 0.13;
      if (p.balloon) p.balloon.rotation.z = Math.sin(s.hoverPhase * 0.8) * 0.06;
      break;
    case 'bounce': {
      const b = Math.abs(Math.sin(s.phase * 1.6));
      model.root.position.y = b * 0.22 * (speedish ? 1 : 0.4);
      if (p.halo) p.halo.rotation.z += dt * 2.4;
      break;
    }
    case 'static':
      if (p.turret) p.turret.rotation.y = model.turretYaw || 0;
      if (p.rotor) p.rotor.rotation.y += dt * 18;
      if (p.flame) p.flame.scale.setScalar(1 + Math.sin(s.hoverPhase * 4) * 0.18);
      if (p.core) p.core.scale.setScalar(1 + Math.sin(s.hoverPhase * 6) * 0.22);
      if (p.wheel) p.wheel.rotation.z += dt * 1.2;
      if (p.flag) p.flag.rotation.y = Math.sin(s.hoverPhase) * 0.4;
      if (p.orb) p.orb.scale.setScalar(1 + Math.sin(s.hoverPhase * 5) * 0.12);
      break;
    default:
      break;
  }

  if (p.rotor) p.rotor.rotation.y += dt * 20;

  // 攻擊：右手前揮 / 砲塔後座
  if (s.attack > 0) {
    const punch = Math.sin((1 - s.attack) * Math.PI);
    if (p.armR) p.armR.rotation.x = -punch * 1.5;
    if (p.torso && p.torso.rotation) p.torso.rotation.y = punch * 0.22;
    if (p.turret) p.turret.position.z = -punch * 0.12;
    if (p.head && model.gait !== 'gallop') p.head.rotation.x = punch * 0.15;
  } else if (p.turret) {
    p.turret.position.z = 0;
  }

  // 受擊閃爍
  if (s.hurt > 0) {
    const f = s.hurt;
    setEmissive(model, f * 0.55);
  } else {
    setEmissive(model, 0);
  }

  // 狀態
  if (u.fz) tint(model, '#8fd0e8', 0.45);
  else if (u.st) tint(model, '#f0e07a', 0.35);
  else if (u.rg) tint(model, '#c060d0', 0.3);
  else tint(model, null, 0);

  if (u.ck) setOpacity(model, 0.35);
  else if (model.gait !== 'glide' || model.card !== 'royal_ghost') setOpacity(model, 1);

  if (model.evoAura) model.evoAura.rotation.z += dt * 1.6;
  if (model.ring) model.ring.rotation.z += dt * 0.4;
}

function gaitSpeed(gait) {
  switch (gait) {
    case 'scurry': return 11;
    case 'rattle': return 9;
    case 'lumber': return 4.2;
    case 'stomp': return 4.8;
    case 'gallop': return 7;
    case 'bounce': return 9;
    case 'roll': return 6;
    default: return 7;
  }
}

function swingLegs(p, a) {
  if (p.legL) p.legL.rotation.x = a;
  if (p.legR) p.legR.rotation.x = -a;
}
function swingArms(p, a, attacking) {
  if (attacking > 0) return;
  if (p.armL) p.armL.rotation.x = a;
  if (p.armR) p.armR.rotation.x = -a;
}
function bob(model, p, amount) {
  model.root.position.y = (model.hoverBase || 0) + amount;
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

// ── 材質狀態：以 clone 過的材質做個體化著色 ──

export function prepareMaterials(model) {
  model.materials = [];
  model.root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.userData.baseColor = o.material.color.clone();
    o.material.userData.baseEmissive = o.material.emissive.clone();
    o.material.userData.baseOpacity = o.material.opacity;
    o.material.userData.baseTransparent = o.material.transparent;
    model.materials.push(o.material);
  });
}

function setEmissive(model, k) {
  if (!model.materials || model.lastEmissive === k) return;
  model.lastEmissive = k;
  for (const m of model.materials) {
    m.emissive.copy(m.userData.baseEmissive).lerp(WHITE, k);
  }
}

function tint(model, hex, k) {
  if (!model.materials) return;
  const sig = `${hex}|${k}`;
  if (model.lastTint === sig) return;
  model.lastTint = sig;
  for (const m of model.materials) {
    m.color.copy(m.userData.baseColor);
    if (hex && k > 0) m.color.lerp(colorOf(hex), k);
  }
}

function setOpacity(model, o) {
  if (!model.materials || model.lastOpacity === o) return;
  model.lastOpacity = o;
  for (const m of model.materials) {
    const base = m.userData.baseOpacity;
    m.opacity = base * o;
    m.transparent = m.userData.baseTransparent || o < 0.999;
  }
}

let WHITE = null;
const colorCache = new Map();
export function initColorHelpers(THREE) {
  WHITE = new THREE.Color('#ffffff');
  colorHelperTHREE = THREE;
}
let colorHelperTHREE = null;
function colorOf(hex) {
  if (!colorCache.has(hex)) colorCache.set(hex, new colorHelperTHREE.Color(hex));
  return colorCache.get(hex);
}
