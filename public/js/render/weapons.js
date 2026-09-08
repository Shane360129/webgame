/**
 * 武器與手持物件。每張卡的辨識度大半來自這裡，
 * 所以每種武器都是獨立幾何，不共用同一把「泛用棍子」。
 */
import { THREE, box, cyl, cone, sphere, torus, capsule, mat, part, group } from './kit.js';

const STEEL = '#cfd6e0';
const DARKSTEEL = '#8f98a8';
const WOOD = '#7a5a3a';

/**
 * 待機時的持械角度。近戰武器如果完全垂直會看起來像旗杆，
 * 所以給一個往前的傾角，攻擊動作再從這個角度揮出去。
 */
const REST_TILT = {
  sword: -0.55, greatsword: -0.4, axe: -0.5, hammer: -0.5, club: -0.5,
  bone: -0.6, dagger: -0.7, spear: -0.35, lance: -0.25, pickaxe: -0.5,
  scythe: -0.3, fireball_staff: -0.12, ice_staff: -0.12, skull_staff: -0.12,
};

export function makeWeapon(kind, palette = []) {
  const g = buildWeapon(kind, palette);
  if (REST_TILT[kind]) g.rotation.x = REST_TILT[kind];
  return g;
}

function buildWeapon(kind, palette = []) {
  const accent = palette[2] || '#f0c9a0';
  const main = palette[0] || '#8f98a8';

  switch (kind) {
    case 'sword': {
      const blade = part(box(0.07, 0.62, 0.02), mat(STEEL, { metal: 0.75, rough: 0.3 }), 0, 0.4, 0);
      const guard = part(box(0.24, 0.05, 0.06), mat('#c9a24a', { metal: 0.6 }), 0, 0.08, 0);
      const grip = part(cyl(0.03, 0.03, 0.18, 6), mat('#4a3a2a'), 0, -0.03, 0);
      return group(blade, guard, grip);
    }
    case 'greatsword': {
      const blade = part(box(0.13, 1.05, 0.04), mat('#b8c4d4', { metal: 0.85, rough: 0.22 }), 0, 0.66, 0);
      const edge = part(box(0.15, 0.16, 0.05), mat('#7de3ff', { emissive: '#7de3ff', emissiveIntensity: 1.6 }), 0, 1.12, 0);
      const guard = part(box(0.4, 0.07, 0.09), mat('#2c3242', { metal: 0.7 }), 0, 0.12, 0);
      const grip = part(cyl(0.045, 0.045, 0.24, 6), mat('#1f2430'), 0, -0.03, 0);
      return group(blade, edge, guard, grip);
    }
    case 'axe': {
      const shaft = part(cyl(0.035, 0.035, 0.72, 6), mat(WOOD), 0, 0.3, 0);
      const head = part(box(0.06, 0.3, 0.26), mat(DARKSTEEL, { metal: 0.8, rough: 0.3 }), 0.0, 0.58, 0.14);
      const bevel = part(cone(0.16, 0.26, 3), mat(STEEL, { metal: 0.8 }), 0, 0.58, 0.28);
      bevel.rotation.x = Math.PI / 2;
      return group(shaft, head, bevel);
    }
    case 'hammer': {
      const shaft = part(cyl(0.04, 0.04, 0.7, 6), mat(WOOD), 0, 0.3, 0);
      const head = part(box(0.24, 0.22, 0.34), mat('#6f6f78', { metal: 0.7, rough: 0.4 }), 0, 0.62, 0);
      const band = part(box(0.26, 0.06, 0.36), mat('#c9a24a', { metal: 0.6 }), 0, 0.62, 0);
      return group(shaft, head, band);
    }
    case 'club': {
      const shaft = part(cyl(0.05, 0.06, 0.8, 6), mat('#e8e0cc'), 0, 0.34, 0);
      const knob = part(sphere(0.17, 10), mat('#efeadd'), 0, 0.76, 0);
      const spike1 = part(cone(0.05, 0.16, 5), mat('#c9a24a'), 0.14, 0.8, 0);
      spike1.rotation.z = -Math.PI / 3;
      return group(shaft, knob, spike1);
    }
    case 'bone': {
      const shaft = part(cyl(0.03, 0.03, 0.42, 5), mat('#efeadd'), 0, 0.2, 0);
      const a = part(sphere(0.055, 7), mat('#efeadd'), 0, 0.42, 0);
      const b = part(sphere(0.055, 7), mat('#efeadd'), 0, -0.01, 0);
      return group(shaft, a, b);
    }
    case 'dagger': {
      const blade = part(box(0.05, 0.3, 0.02), mat('#d4dae4', { metal: 0.8 }), 0, 0.22, 0);
      const grip = part(cyl(0.028, 0.028, 0.12, 6), mat('#3a2a1a'), 0, 0.03, 0);
      return group(blade, grip);
    }
    case 'spear': {
      const shaft = part(cyl(0.028, 0.028, 1.15, 6), mat(WOOD), 0, 0.42, 0);
      const tip = part(cone(0.06, 0.24, 6), mat(STEEL, { metal: 0.8 }), 0, 1.07, 0);
      return group(shaft, tip);
    }
    case 'lance': {
      const shaft = part(cyl(0.045, 0.06, 1.5, 8), mat('#e8d8b8'), 0, 0.5, 0);
      const stripe = part(cyl(0.062, 0.062, 0.18, 8), mat('#c4423a'), 0, 0.9, 0);
      const tip = part(cone(0.08, 0.3, 8), mat('#c9a24a', { metal: 0.7 }), 0, 1.38, 0);
      return group(shaft, stripe, tip);
    }
    case 'bow': {
      const g = group();
      const arc = part(torus(0.28, 0.022, 8), mat(WOOD), 0, 0.3, 0);
      arc.rotation.y = Math.PI / 2;
      const string = part(cyl(0.006, 0.006, 0.55, 4), mat('#e8e0cc'), 0, 0.3, -0.05);
      g.add(arc, string);
      return g;
    }
    case 'longbow': {
      const g = group();
      const arc = part(torus(0.4, 0.022, 10), mat('#c9a24a', { metal: 0.4 }), 0, 0.38, 0);
      arc.rotation.y = Math.PI / 2;
      const string = part(cyl(0.006, 0.006, 0.78, 4), mat('#f0f0e0'), 0, 0.38, -0.06);
      g.add(arc, string);
      return g;
    }
    case 'musket': {
      const barrel = part(cyl(0.028, 0.032, 0.95, 8), mat('#3a3f48', { metal: 0.8, rough: 0.35 }), 0, 0.42, 0);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.32, 0.34);
      const stock = part(box(0.07, 0.13, 0.34), mat('#6f4a2f'), 0, 0.28, -0.05);
      const trigger = part(box(0.03, 0.07, 0.04), mat('#2a2a2a'), 0, 0.23, 0.08);
      return group(barrel, stock, trigger);
    }
    case 'blowdart': {
      const tube = part(cyl(0.026, 0.03, 0.8, 7), mat('#8a6a3b'), 0, 0.3, 0.3);
      tube.rotation.x = Math.PI / 2;
      return group(tube);
    }
    case 'pickaxe': {
      const shaft = part(cyl(0.032, 0.032, 0.68, 6), mat(WOOD), 0, 0.28, 0);
      const head = part(box(0.05, 0.06, 0.5), mat('#8f98a8', { metal: 0.7 }), 0, 0.58, 0);
      const tip = part(cone(0.055, 0.16, 5), mat(STEEL, { metal: 0.8 }), 0, 0.58, 0.3);
      tip.rotation.x = Math.PI / 2;
      return group(shaft, head, tip);
    }
    case 'drill': {
      const body = part(cyl(0.1, 0.14, 0.42, 10), mat('#c9a24a', { metal: 0.6 }), 0, 0.34, 0.22);
      body.rotation.x = Math.PI / 2;
      const bit = part(cone(0.13, 0.42, 10), mat('#8f98a8', { metal: 0.85, rough: 0.25 }), 0, 0.34, 0.6);
      bit.rotation.x = Math.PI / 2;
      return group(body, bit);
    }
    case 'scythe': {
      const shaft = part(cyl(0.03, 0.03, 1.0, 6), mat('#3a2a3a'), 0, 0.36, 0);
      const bladeArc = part(torus(0.3, 0.028, 8, 8), mat('#a07ae0', { emissive: '#6f4ac0', emissiveIntensity: 0.5 }), 0.18, 0.84, 0);
      bladeArc.rotation.set(Math.PI / 2, 0, 0.6);
      return group(shaft, bladeArc);
    }
    case 'fireball_staff': {
      const shaft = part(cyl(0.03, 0.035, 1.0, 6), mat('#6f4a2f'), 0, 0.36, 0);
      const orb = part(sphere(0.12, 12), mat('#ff8a3a', { emissive: '#ff5a1a', emissiveIntensity: 2.2 }), 0, 0.94, 0);
      return group(shaft, orb);
    }
    case 'ice_staff': {
      const shaft = part(cyl(0.028, 0.034, 1.0, 6), mat('#5b7f9f'), 0, 0.36, 0);
      const shard = part(cone(0.1, 0.32, 6), mat('#bfe8ff', { emissive: '#7de3ff', emissiveIntensity: 1.6, opacity: 0.9 }), 0, 1.0, 0);
      return group(shaft, shard);
    }
    case 'skull_staff': {
      const shaft = part(cyl(0.03, 0.035, 1.0, 6), mat('#4a3a5a'), 0, 0.36, 0);
      const skull = part(sphere(0.11, 10), mat('#efeadd'), 0, 0.94, 0);
      const jaw = part(box(0.13, 0.05, 0.1), mat('#dcd6c8'), 0, 0.86, 0.03);
      const glow = part(sphere(0.05, 8), mat('#a07ae0', { emissive: '#a07ae0', emissiveIntensity: 2 }), 0, 0.96, 0.09);
      return group(shaft, skull, jaw, glow);
    }
    case 'tesla_gloves': {
      const g = group();
      const coil = part(torus(0.09, 0.025, 8), mat('#7de3ff', { emissive: '#7de3ff', emissiveIntensity: 2 }), 0, 0.26, 0.1);
      coil.rotation.x = Math.PI / 2;
      const core = part(sphere(0.06, 8), mat('#f0f8ff', { emissive: '#bfefff', emissiveIntensity: 2.5 }), 0, 0.26, 0.1);
      g.add(coil, core);
      return g;
    }
    case 'firework': {
      const tube = part(cyl(0.06, 0.07, 0.6, 8), mat('#c4423a'), 0, 0.34, 0.16);
      tube.rotation.x = -Math.PI / 3.2;
      const fuse = part(sphere(0.045, 6), mat('#ffe07a', { emissive: '#ffb03a', emissiveIntensity: 2 }), 0, 0.58, 0.34);
      return group(tube, fuse);
    }
    case 'bomb': {
      const b = part(sphere(0.17, 12), mat('#2b2b2b', { rough: 0.5 }), 0, 0.2, 0.1);
      const fuse = part(cyl(0.015, 0.015, 0.12, 5), mat('#8a6a3b'), 0, 0.36, 0.1);
      const spark = part(sphere(0.04, 6), mat('#ffd07a', { emissive: '#ff8a1a', emissiveIntensity: 3 }), 0, 0.43, 0.1);
      return group(b, fuse, spark);
    }
    case 'bola': {
      const rope = part(cyl(0.012, 0.012, 0.5, 4), mat('#8a6a3b'), 0, 0.3, 0);
      const w1 = part(sphere(0.07, 8), mat('#5a4a3a'), 0, 0.06, 0);
      const w2 = part(sphere(0.07, 8), mat('#5a4a3a'), 0.1, 0.54, 0);
      return group(rope, w1, w2);
    }
    case 'cannon_arm': {
      const barrel = part(cyl(0.11, 0.13, 0.72, 10), mat('#5a5a62', { metal: 0.8, rough: 0.35 }), 0, 0.3, 0.34);
      barrel.rotation.x = Math.PI / 2;
      const ring = part(torus(0.13, 0.03, 8), mat('#c9a24a', { metal: 0.7 }), 0, 0.3, 0.62);
      return group(barrel, ring);
    }
    case 'fists': {
      const l = part(sphere(0.17, 10), mat(accent), 0, 0.1, 0.06);
      return group(l);
    }
    default:
      return group();
  }
}

export function makeShield(color = '#3f5f9c') {
  const body = part(box(0.36, 0.46, 0.06), mat(color, { metal: 0.3 }), 0, 0.28, 0);
  const boss = part(sphere(0.08, 8), mat('#c9a24a', { metal: 0.7 }), 0, 0.28, 0.05);
  const rim = part(box(0.4, 0.5, 0.03), mat('#c9a24a', { metal: 0.6 }), 0, 0.28, -0.02);
  return group(rim, body, boss);
}
