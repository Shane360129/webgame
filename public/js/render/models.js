/**
 * 角色與建築的程式化 3D 模型。
 *
 * 每個 build 類型都有自己的體型比例、裝備與配色，
 * 目的是讓每張卡在戰場上的**輪廓**就能分辨，
 * 而不是共用一個人形再換顏色（查核文件第 5 節「角色」項）。
 *
 * 本檔全部是原創幾何。專案不含、也不散布任何官方模型或貼圖。
 */
import { THREE, box, sphere, cyl, cone, capsule, torus, mat, part, group, pivot, shade } from './kit.js';
import { makeWeapon, makeShield } from './weapons.js';

/** 角色相對於格子的全域放大係數（只影響視覺，不影響碰撞與規則）。 */
export const MODEL_SCALE = 1.5;

// ───────────────────── 共用零件 ─────────────────────

function limbPivot(mesh, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  mesh.position.y -= y;
  g.add(mesh);
  return g;
}

function eyes(color = '#1a1a1a', y = 1.0, z = 0.15, spread = 0.07, r = 0.028) {
  const m = mat(color, { emissive: color === '#1a1a1a' ? 0 : color, emissiveIntensity: 2 });
  return group(part(sphere(r, 6), m, -spread, y, z), part(sphere(r, 6), m, spread, y, z));
}

function crownMesh(color = '#f0d08a', y = 1.15) {
  const band = part(cyl(0.14, 0.15, 0.07, 8), mat(color, { metal: 0.75, rough: 0.25 }), 0, y, 0);
  const spikes = group();
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    const s = part(cone(0.035, 0.1, 5), mat(color, { metal: 0.75, rough: 0.25 }), Math.cos(a) * 0.12, y + 0.08, Math.sin(a) * 0.12);
    spikes.add(s);
  }
  return group(band, spikes);
}

// ───────────────────── 人形 ─────────────────────

function buildHumanoid(v) {
  const [c1, c2, skin] = v.palette;
  const parts = {};
  const root = new THREE.Group();

  const legMat = mat(c2);
  const legL = part(capsule(0.085, 0.2, 6), legMat, -0.11, 0.22, 0);
  const legR = part(capsule(0.085, 0.2, 6), legMat, 0.11, 0.22, 0);
  parts.legL = limbPivot(legL, -0.11, 0.44, 0);
  parts.legR = limbPivot(legR, 0.11, 0.44, 0);

  const bootL = part(box(0.14, 0.09, 0.2), mat(shade(c2, -0.12)), -0.11, 0.05, 0.03);
  const bootR = part(box(0.14, 0.09, 0.2), mat(shade(c2, -0.12)), 0.11, 0.05, 0.03);

  const torso = part(box(0.36, 0.4, 0.24), mat(c1), 0, 0.64, 0);
  const belt = part(box(0.38, 0.07, 0.26), mat(shade(c2, -0.15)), 0, 0.46, 0);
  const chest = part(box(0.3, 0.14, 0.26), mat(shade(c1, 0.1)), 0, 0.76, 0.01);
  parts.torso = group(torso, belt, chest);

  const head = part(sphere(0.16, 12), mat(skin), 0, 1.0, 0);
  const headGroup = group(head, eyes('#20242c', 1.02, 0.14));
  if (v.beard) headGroup.add(part(box(0.2, 0.12, 0.08), mat(v.hair || '#e8b84b'), 0, 0.9, 0.11));
  if (v.hair) {
    headGroup.add(part(sphere(0.17, 10), mat(v.hair), 0, 1.05, -0.02));
    const pony = part(capsule(0.05, 0.2, 6), mat(v.hair), 0, 0.95, -0.18);
    pony.rotation.x = 0.5;
    headGroup.add(pony);
  }
  if (v.helmet === 'knight') {
    headGroup.add(part(sphere(0.185, 12, { }), mat('#b8c0cc', { metal: 0.8, rough: 0.3 }), 0, 1.04, -0.01));
    headGroup.add(part(box(0.24, 0.06, 0.06), mat('#2b2f38'), 0, 1.0, 0.16));
    const plume = part(cone(0.05, 0.22, 6), mat(v.cape || '#c4423a'), 0, 1.26, -0.02);
    headGroup.add(plume);
  }
  if (v.helmet === 'miner') {
    headGroup.add(part(cyl(0.17, 0.19, 0.12, 10), mat('#e8b83a', { metal: 0.4 }), 0, 1.1, 0));
    headGroup.add(part(cyl(0.05, 0.05, 0.05, 8), mat('#fff8d0', { emissive: '#ffe89a', emissiveIntensity: 2.4 }), 0, 1.1, 0.16));
  }
  if (v.hat) headGroup.add(part(cone(0.22, 0.2, 10), mat(v.hat), 0, 1.2, 0));
  if (v.crown) headGroup.add(crownMesh('#f0d08a', 1.14));
  parts.head = headGroup;

  const armMat = mat(skin);
  const armL = part(capsule(0.06, 0.18, 6), armMat, -0.24, 0.62, 0);
  const armR = part(capsule(0.06, 0.18, 6), armMat, 0.24, 0.62, 0);
  parts.armL = limbPivot(armL, -0.22, 0.8, 0);
  parts.armR = limbPivot(armR, 0.22, 0.8, 0);

  const weapon = makeWeapon(v.weapon, v.palette);
  weapon.position.set(0.24, 0.52, 0.06);
  parts.weapon = weapon;
  parts.armR.add(weapon);

  if (v.shield) {
    const sh = makeShield(c1);
    sh.position.set(-0.26, 0.4, 0.12);
    sh.rotation.y = -0.25;
    parts.armL.add(sh);
  }
  if (v.cape) {
    const cape = part(box(0.34, 0.5, 0.04), mat(v.cape), 0, 0.66, -0.15);
    parts.cape = cape;
    root.add(cape);
  }

  root.add(parts.legL, parts.legR, bootL, bootR, parts.torso, parts.head, parts.armL, parts.armR);
  return { root, parts, gait: 'walk', height: 1.2 };
}

// ───────────────────── 哥布林 ─────────────────────

function buildGoblin(v) {
  const [skin, cloth, pouch] = v.palette;
  const parts = {};
  const root = new THREE.Group();

  const legL = part(capsule(0.06, 0.13, 5), mat(shade(skin, -0.15)), -0.09, 0.16, 0);
  const legR = part(capsule(0.06, 0.13, 5), mat(shade(skin, -0.15)), 0.09, 0.16, 0);
  parts.legL = limbPivot(legL, -0.09, 0.32, 0);
  parts.legR = limbPivot(legR, 0.09, 0.32, 0);

  const torso = part(capsule(0.15, 0.16, 7), mat(skin), 0, 0.52, 0);
  torso.rotation.x = 0.18;
  const vest = part(box(0.28, 0.2, 0.22), mat(cloth), 0, 0.5, -0.02);
  parts.torso = group(torso, vest);

  const head = part(sphere(0.16, 10), mat(skin), 0, 0.78, 0.04);
  const earL = part(cone(0.06, 0.24, 5), mat(skin), -0.17, 0.84, 0.0);
  earL.rotation.set(0, 0, 1.15);
  const earR = part(cone(0.06, 0.24, 5), mat(skin), 0.17, 0.84, 0.0);
  earR.rotation.set(0, 0, -1.15);
  const nose = part(cone(0.045, 0.11, 5), mat(shade(skin, -0.08)), 0, 0.76, 0.17);
  nose.rotation.x = Math.PI / 2;
  const brow = part(box(0.2, 0.05, 0.06), mat(pouch), 0, 0.86, 0.12);
  parts.head = group(head, earL, earR, nose, brow, eyes('#f0e07a', 0.8, 0.14, 0.06, 0.026));

  const armL = part(capsule(0.045, 0.14, 5), mat(skin), -0.19, 0.5, 0);
  const armR = part(capsule(0.045, 0.14, 5), mat(skin), 0.19, 0.5, 0);
  parts.armL = limbPivot(armL, -0.17, 0.62, 0);
  parts.armR = limbPivot(armR, 0.17, 0.62, 0);

  const weapon = makeWeapon(v.weapon, v.palette);
  weapon.scale.setScalar(0.8);
  weapon.position.set(0.18, 0.36, 0.05);
  parts.weapon = weapon;
  parts.armR.add(weapon);

  root.add(parts.legL, parts.legR, parts.torso, parts.head, parts.armL, parts.armR);
  return { root, parts, gait: 'scurry', height: 0.95 };
}

// ───────────────────── 骷髏 ─────────────────────

function buildSkeleton(v) {
  const [bone, boneDark, accent] = v.palette;
  const parts = {};
  const root = new THREE.Group();
  const bm = mat(bone, { rough: 0.85 });

  const legL = part(cyl(0.035, 0.03, 0.3, 6), bm, -0.08, 0.2, 0);
  const legR = part(cyl(0.035, 0.03, 0.3, 6), bm, 0.08, 0.2, 0);
  parts.legL = limbPivot(legL, -0.08, 0.36, 0);
  parts.legR = limbPivot(legR, 0.08, 0.36, 0);

  const spine = part(cyl(0.04, 0.05, 0.28, 6), bm, 0, 0.52, 0);
  const ribs = group();
  for (let i = 0; i < 3; i += 1) {
    const r = part(torus(0.11 - i * 0.012, 0.018, 6), mat(boneDark), 0, 0.44 + i * 0.09, 0);
    r.rotation.x = Math.PI / 2;
    ribs.add(r);
  }
  const pelvis = part(box(0.18, 0.08, 0.12), bm, 0, 0.36, 0);
  parts.torso = group(spine, ribs, pelvis);

  const skull = part(sphere(0.14, 10), bm, 0, 0.78, 0);
  const jaw = part(box(0.16, 0.06, 0.13), mat(boneDark), 0, 0.68, 0.03);
  const socketL = part(sphere(0.045, 6), mat(accent, { emissive: accent === '#1e1e1e' ? '#ff6a3a' : accent, emissiveIntensity: 1.8 }), -0.06, 0.8, 0.11);
  const socketR = part(sphere(0.045, 6), mat(accent, { emissive: accent === '#1e1e1e' ? '#ff6a3a' : accent, emissiveIntensity: 1.8 }), 0.06, 0.8, 0.11);
  parts.head = group(skull, jaw, socketL, socketR);
  if (v.crown) parts.head.add(crownMesh('#f0d08a', 0.92));
  if (v.hat) parts.head.add(part(cyl(0.17, 0.17, 0.1, 10), mat(v.hat), 0, 0.9, 0));

  const armL = part(cyl(0.026, 0.024, 0.26, 5), bm, -0.16, 0.5, 0);
  const armR = part(cyl(0.026, 0.024, 0.26, 5), bm, 0.16, 0.5, 0);
  parts.armL = limbPivot(armL, -0.14, 0.64, 0);
  parts.armR = limbPivot(armR, 0.14, 0.64, 0);

  const weapon = makeWeapon(v.weapon, v.palette);
  weapon.scale.setScalar(0.85);
  weapon.position.set(0.14, 0.36, 0.04);
  parts.weapon = weapon;
  parts.armR.add(weapon);

  root.add(parts.legL, parts.legR, parts.torso, parts.head, parts.armL, parts.armR);
  return { root, parts, gait: 'rattle', height: 0.95 };
}

// ───────────────────── 法師（長袍） ─────────────────────

function buildMage(v) {
  const [c1, c2, glow] = v.palette;
  const parts = {};
  const root = new THREE.Group();

  const robe = part(cone(0.28, 0.72, 12), mat(v.robe || c2), 0, 0.36, 0);
  const hem = part(cyl(0.28, 0.3, 0.08, 12), mat(shade(v.robe || c2, -0.12)), 0, 0.06, 0);
  parts.torso = group(robe, hem);
  parts.robe = robe;

  const shoulders = part(box(0.34, 0.14, 0.22), mat(c1), 0, 0.72, 0);
  const head = part(sphere(0.15, 12), mat(v.palette[2] || '#f0c9a0'), 0, 0.92, 0);
  const hood = part(cone(0.19, 0.3, 10), mat(v.hat || c1), 0, 1.0, -0.02);
  const face = part(sphere(0.13, 10), mat('#2a2233'), 0, 0.92, 0.04);
  parts.head = group(head, face, hood, eyes(glow, 0.93, 0.12, 0.055, 0.03));
  if (v.beard) parts.head.add(part(cone(0.11, 0.24, 8), mat('#eef4ff'), 0, 0.82, 0.08));
  parts.head.add(shoulders);

  const armL = part(capsule(0.05, 0.16, 6), mat(c1), -0.22, 0.6, 0);
  const armR = part(capsule(0.05, 0.16, 6), mat(c1), 0.22, 0.6, 0);
  parts.armL = limbPivot(armL, -0.2, 0.74, 0);
  parts.armR = limbPivot(armR, 0.2, 0.74, 0);

  const weapon = makeWeapon(v.weapon, v.palette);
  weapon.position.set(0.2, 0.4, 0.05);
  parts.weapon = weapon;
  parts.armR.add(weapon);

  root.add(parts.torso, parts.head, parts.armL, parts.armR);
  return { root, parts, gait: 'glide', height: 1.25 };
}

// ───────────────────── 巨人 ─────────────────────

function buildGiant(v) {
  const [c1, c2, skin] = v.palette;
  const parts = {};
  const root = new THREE.Group();

  const legL = part(capsule(0.16, 0.24, 8), mat(c2), -0.19, 0.34, 0);
  const legR = part(capsule(0.16, 0.24, 8), mat(c2), 0.19, 0.34, 0);
  parts.legL = limbPivot(legL, -0.19, 0.66, 0);
  parts.legR = limbPivot(legR, 0.19, 0.66, 0);

  const belly = part(sphere(0.42, 14), mat(skin), 0, 0.92, 0.02);
  belly.scale.set(1, 0.92, 0.86);
  const chest = part(box(0.6, 0.3, 0.36), mat(c1), 0, 1.16, 0);
  const belt = part(box(0.7, 0.12, 0.44), mat(shade(c2, -0.2)), 0, 0.7, 0);
  const buckle = part(box(0.16, 0.16, 0.06), mat('#c9a24a', { metal: 0.7 }), 0, 0.7, 0.22);
  parts.torso = group(belly, chest, belt, buckle);

  const head = part(sphere(0.24, 12), mat(skin), 0, 1.46, 0);
  const jaw = part(box(0.3, 0.14, 0.22), mat(shade(skin, -0.06)), 0, 1.36, 0.08);
  parts.head = group(head, jaw, eyes('#20242c', 1.5, 0.2, 0.09, 0.035));
  if (v.crown) parts.head.add(crownMesh('#f0d08a', 1.66));

  const armL = part(capsule(0.12, 0.28, 7), mat(skin), -0.45, 1.0, 0);
  const armR = part(capsule(0.12, 0.28, 7), mat(skin), 0.45, 1.0, 0);
  parts.armL = limbPivot(armL, -0.4, 1.24, 0);
  parts.armR = limbPivot(armR, 0.4, 1.24, 0);

  const weapon = makeWeapon(v.weapon, v.palette);
  weapon.scale.setScalar(1.3);
  weapon.position.set(0.4, 0.7, 0.06);
  parts.weapon = weapon;
  parts.armR.add(weapon);

  root.add(parts.legL, parts.legR, parts.torso, parts.head, parts.armL, parts.armR);
  return { root, parts, gait: 'lumber', height: 1.8 };
}

// ───────────────────── 皮卡（重甲） ─────────────────────

function buildPekka(v) {
  const [c1, c2, glow] = v.palette;
  const parts = {};
  const root = new THREE.Group();
  const armour = mat(c1, { metal: 0.85, rough: 0.28 });
  const dark = mat(c2, { metal: 0.8, rough: 0.35 });

  const legL = part(box(0.19, 0.42, 0.22), dark, -0.16, 0.24, 0);
  const legR = part(box(0.19, 0.42, 0.22), dark, 0.16, 0.24, 0);
  parts.legL = limbPivot(legL, -0.16, 0.46, 0);
  parts.legR = limbPivot(legR, 0.16, 0.46, 0);

  const torso = part(box(0.46, 0.44, 0.32), armour, 0, 0.7, 0);
  const core = part(sphere(0.08, 8), mat(glow, { emissive: glow, emissiveIntensity: 2.6 }), 0, 0.72, 0.17);
  const pauldronL = part(sphere(0.17, 10), armour, -0.3, 0.88, 0);
  const pauldronR = part(sphere(0.17, 10), armour, 0.3, 0.88, 0);
  parts.torso = group(torso, core, pauldronL, pauldronR);

  const helm = part(box(0.3, 0.26, 0.3), armour, 0, 1.08, 0);
  const visor = part(box(0.26, 0.06, 0.05), mat(glow, { emissive: glow, emissiveIntensity: 3 }), 0, 1.08, 0.16);
  const hornL = part(cone(0.05, 0.3, 6), dark, -0.15, 1.3, -0.02);
  hornL.rotation.z = 0.45;
  const hornR = part(cone(0.05, 0.3, 6), dark, 0.15, 1.3, -0.02);
  hornR.rotation.z = -0.45;
  parts.head = group(helm, visor, hornL, hornR);

  const armL = part(box(0.14, 0.36, 0.18), dark, -0.34, 0.66, 0);
  const armR = part(box(0.14, 0.36, 0.18), dark, 0.34, 0.66, 0);
  parts.armL = limbPivot(armL, -0.32, 0.86, 0);
  parts.armR = limbPivot(armR, 0.32, 0.86, 0);

  const weapon = makeWeapon(v.weapon, v.palette);
  weapon.position.set(0.32, 0.46, 0.08);
  parts.weapon = weapon;
  parts.armR.add(weapon);

  root.add(parts.legL, parts.legR, parts.torso, parts.head, parts.armL, parts.armR);
  return { root, parts, gait: 'stomp', height: 1.45 };
}

// ───────────────────── 石頭人 ─────────────────────

function buildGolem(v) {
  const [rock, dark, glow] = v.palette;
  const parts = {};
  const root = new THREE.Group();
  const rm = mat(rock, { rough: 0.95, flat: true });
  const dm = mat(dark, { rough: 0.95, flat: true });

  const legL = part(box(0.24, 0.34, 0.26), dm, -0.2, 0.2, 0);
  const legR = part(box(0.24, 0.34, 0.26), dm, 0.2, 0.2, 0);
  parts.legL = limbPivot(legL, -0.2, 0.38, 0);
  parts.legR = limbPivot(legR, 0.2, 0.38, 0);

  const core = part(sphere(0.44, 8), rm, 0, 0.82, 0);
  core.scale.set(1.05, 0.95, 0.9);
  const chunkA = part(box(0.3, 0.24, 0.24), rm, -0.3, 0.98, 0.12);
  chunkA.rotation.set(0.3, 0.4, 0.2);
  const chunkB = part(box(0.26, 0.22, 0.22), rm, 0.32, 0.72, -0.1);
  chunkB.rotation.set(-0.2, 0.3, 0.5);
  const seam = part(sphere(0.07, 6), mat(glow, { emissive: glow, emissiveIntensity: 1.6 }), 0, 0.9, 0.4);
  parts.torso = group(core, chunkA, chunkB, seam);

  const head = part(box(0.32, 0.26, 0.3), rm, 0, 1.22, 0);
  parts.head = group(head, eyes(glow, 1.24, 0.16, 0.09, 0.04));

  const armL = part(box(0.2, 0.4, 0.22), dm, -0.48, 0.82, 0);
  const armR = part(box(0.2, 0.4, 0.22), dm, 0.48, 0.82, 0);
  parts.armL = limbPivot(armL, -0.46, 1.02, 0);
  parts.armR = limbPivot(armR, 0.46, 1.02, 0);
  parts.armL.add(part(sphere(0.19, 8), rm, -0.46 - -0.46, 0.82 - 1.02, 0));
  parts.armR.add(part(sphere(0.19, 8), rm, 0, -0.2, 0));

  root.add(parts.legL, parts.legR, parts.torso, parts.head, parts.armL, parts.armR);
  return { root, parts, gait: 'lumber', height: 1.6 };
}

// ───────────────────── 飛行單位 ─────────────────────

function buildMinion(v) {
  const [skin, dark, glow] = v.palette;
  const parts = {};
  const root = new THREE.Group();
  const s = v.giant ? 1.0 : 1.0;

  const body = part(capsule(0.17, 0.16, 8), mat(skin), 0, 0.72, 0);
  const belly = part(sphere(0.15, 8), mat(shade(skin, 0.12)), 0, 0.66, 0.08);
  parts.torso = group(body, belly);

  const head = part(sphere(0.17, 10), mat(skin), 0, 1.0, 0.02);
  const horn = part(cone(0.05, 0.22, 6), mat(dark), 0, 1.18, -0.02);
  const beak = part(cone(0.07, 0.18, 6), mat(glow), 0, 0.96, 0.18);
  beak.rotation.x = Math.PI / 2;
  parts.head = group(head, horn, beak, eyes('#ffffff', 1.02, 0.14, 0.07, 0.035));
  if (v.giant) parts.head.add(crownMesh(dark, 1.2));

  const wingGeo = box(0.05, 0.34, 0.5);
  const wl = part(wingGeo, mat(dark, { opacity: 0.95 }), -0.02, 0, -0.12);
  const wr = part(wingGeo, mat(dark, { opacity: 0.95 }), 0.02, 0, -0.12);
  parts.wingL = limbPivot(wl, -0.16, 0.82, -0.06);
  parts.wingR = limbPivot(wr, 0.16, 0.82, -0.06);
  parts.wingL.rotation.z = 0.4;
  parts.wingR.rotation.z = -0.4;

  const armL = part(capsule(0.04, 0.1, 5), mat(skin), -0.18, 0.66, 0.04);
  const armR = part(capsule(0.04, 0.1, 5), mat(skin), 0.18, 0.66, 0.04);
  parts.armL = limbPivot(armL, -0.16, 0.76, 0.04);
  parts.armR = limbPivot(armR, 0.16, 0.76, 0.04);

  const tail = part(cone(0.05, 0.3, 6), mat(dark), 0, 0.6, -0.2);
  tail.rotation.x = -1.0;
  parts.tail = tail;

  root.add(parts.torso, parts.head, parts.wingL, parts.wingR, parts.armL, parts.armR, tail);
  root.scale.setScalar(s);
  return { root, parts, gait: 'fly', flying: true, hover: 1.1, height: 1.2 };
}

function buildBat(v) {
  const [skin, dark, glow] = v.palette;
  const parts = {};
  const root = new THREE.Group();
  const body = part(sphere(0.14, 8), mat(skin), 0, 0.6, 0);
  body.scale.set(1, 0.9, 1.2);
  const earL = part(cone(0.05, 0.15, 5), mat(dark), -0.08, 0.75, -0.02);
  const earR = part(cone(0.05, 0.15, 5), mat(dark), 0.08, 0.75, -0.02);
  const fang = part(cone(0.03, 0.07, 4), mat('#ffffff'), 0, 0.55, 0.12);
  fang.rotation.x = Math.PI;
  parts.torso = group(body, earL, earR, fang, eyes(glow, 0.62, 0.11, 0.055, 0.03));
  parts.head = parts.torso;

  const wl = part(box(0.03, 0.22, 0.36), mat(dark, { opacity: 0.92 }), 0, 0, -0.06);
  const wr = part(box(0.03, 0.22, 0.36), mat(dark, { opacity: 0.92 }), 0, 0, -0.06);
  parts.wingL = limbPivot(wl, -0.14, 0.62, 0);
  parts.wingR = limbPivot(wr, 0.14, 0.62, 0);

  root.add(parts.torso, parts.wingL, parts.wingR);
  return { root, parts, gait: 'fly', flying: true, hover: 1.3, height: 0.7 };
}

function buildDragon(v) {
  const [skin, dark, belly] = v.palette;
  const parts = {};
  const root = new THREE.Group();
  const sm = mat(skin);

  const body = part(capsule(0.26, 0.3, 10), sm, 0, 0.78, 0);
  body.rotation.x = Math.PI / 2.2;
  const bellyM = part(sphere(0.22, 10), mat(belly), 0, 0.72, 0.12);
  bellyM.scale.set(1, 0.8, 0.9);
  parts.torso = group(body, bellyM);

  const head = part(sphere(0.22, 10), sm, 0, 1.06, 0.24);
  const snout = part(box(0.18, 0.14, 0.26), sm, 0, 1.0, 0.42);
  const jaw = part(box(0.16, 0.06, 0.22), mat(belly), 0, 0.94, 0.44);
  const hornL = part(cone(0.05, 0.2, 5), mat(dark), -0.11, 1.24, 0.18);
  hornL.rotation.set(-0.4, 0, 0.3);
  const hornR = part(cone(0.05, 0.2, 5), mat(dark), 0.11, 1.24, 0.18);
  hornR.rotation.set(-0.4, 0, -0.3);
  parts.head = group(head, snout, jaw, hornL, hornR, eyes('#ffe07a', 1.1, 0.36, 0.09, 0.035));
  if (v.armored) {
    parts.head.add(part(box(0.28, 0.1, 0.24), mat('#8f98a8', { metal: 0.8 }), 0, 1.16, 0.28));
    parts.torso.add(part(box(0.4, 0.24, 0.3), mat('#8f98a8', { metal: 0.75 }), 0, 0.8, 0.02));
  }

  const wingShape = box(0.04, 0.44, 0.62);
  const wl = part(wingShape, mat(dark, { opacity: 0.94 }), 0, 0.12, -0.1);
  const wr = part(wingShape, mat(dark, { opacity: 0.94 }), 0, 0.12, -0.1);
  parts.wingL = limbPivot(wl, -0.24, 0.9, -0.06);
  parts.wingR = limbPivot(wr, 0.24, 0.9, -0.06);
  parts.wingL.rotation.z = 0.5;
  parts.wingR.rotation.z = -0.5;

  const tail = part(cone(0.12, 0.6, 8), sm, 0, 0.72, -0.4);
  tail.rotation.x = -1.35;
  parts.tail = tail;

  const legL = part(capsule(0.07, 0.1, 6), sm, -0.14, 0.5, 0.06);
  const legR = part(capsule(0.07, 0.1, 6), sm, 0.14, 0.5, 0.06);
  parts.legL = limbPivot(legL, -0.14, 0.62, 0.06);
  parts.legR = limbPivot(legR, 0.14, 0.62, 0.06);

  root.add(parts.torso, parts.head, parts.wingL, parts.wingR, tail, parts.legL, parts.legR);
  return { root, parts, gait: 'fly', flying: true, hover: 1.15, height: 1.3 };
}

function buildBalloon(v) {
  const [cloth, dark, basket] = v.palette;
  const parts = {};
  const root = new THREE.Group();

  const env = part(sphere(0.44, 14), mat(cloth), 0, 1.32, 0);
  env.scale.set(1, 1.18, 1);
  const stripe = part(torus(0.44, 0.05, 10), mat(dark), 0, 1.32, 0);
  stripe.rotation.x = Math.PI / 2;
  const skullPatch = part(sphere(0.13, 10), mat('#efeadd'), 0, 1.36, 0.42);
  parts.balloon = group(env, stripe, skullPatch);

  const ropes = group();
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + 0.7;
    const r = part(cyl(0.012, 0.012, 0.4, 4), mat('#c9b48a'), Math.cos(a) * 0.24, 0.72, Math.sin(a) * 0.24);
    ropes.add(r);
  }
  const bask = part(cyl(0.26, 0.22, 0.3, 10), mat(basket), 0, 0.4, 0);
  const rim = part(torus(0.26, 0.03, 8), mat(shade(basket, -0.15)), 0, 0.55, 0);
  rim.rotation.x = Math.PI / 2;
  const bombPile = part(sphere(0.12, 8), mat('#2b2b2b'), 0, 0.5, 0.06);

  const pilot = part(sphere(0.13, 8), mat('#efeadd'), 0, 0.66, -0.02);
  const jaw = part(box(0.14, 0.05, 0.1), mat('#dcd6c8'), 0, 0.58, 0.02);
  parts.head = group(pilot, jaw);
  parts.torso = group(bask, rim, bombPile, ropes);

  root.add(parts.balloon, parts.torso, parts.head);
  return { root, parts, gait: 'float', flying: true, hover: 0.9, height: 1.9 };
}

function buildMachine(v) {
  const [hull, frame, glass] = v.palette;
  const parts = {};
  const root = new THREE.Group();

  const body = part(capsule(0.22, 0.34, 8), mat(hull, { metal: 0.5, rough: 0.45 }), 0, 0.76, 0);
  body.rotation.x = Math.PI / 2;
  const cockpit = part(sphere(0.17, 10), mat(glass, { opacity: 0.75, metal: 0.2, rough: 0.1 }), 0, 0.88, 0.16);
  const fin = part(box(0.04, 0.26, 0.2), mat(frame), 0, 0.92, -0.34);
  parts.torso = group(body, cockpit, fin);

  const mast = part(cyl(0.03, 0.03, 0.3, 6), mat(frame), 0, 1.05, 0);
  const blade1 = part(box(0.9, 0.02, 0.09), mat('#d0d8e0', { opacity: 0.8 }), 0, 1.2, 0);
  const blade2 = part(box(0.09, 0.02, 0.9), mat('#d0d8e0', { opacity: 0.8 }), 0, 1.2, 0);
  parts.rotor = group(blade1, blade2);
  const gun = part(cyl(0.05, 0.06, 0.36, 8), mat('#3a3f48', { metal: 0.8 }), 0, 0.68, 0.32);
  gun.rotation.x = Math.PI / 2;

  const pilot = part(sphere(0.11, 8), mat('#f0c9a0'), 0, 0.9, 0.12);
  parts.head = group(pilot);

  root.add(parts.torso, mast, parts.rotor, gun, parts.head);
  return { root, parts, gait: 'fly', flying: true, hover: 1.0, height: 1.3 };
}

function buildGhost(v) {
  const [c1, c2, glow] = v.palette;
  const parts = {};
  const root = new THREE.Group();
  const gm = mat(c1, { opacity: 0.62, emissive: glow, emissiveIntensity: 0.35 });

  const tailCone = part(cone(0.26, 0.6, 10), gm, 0, 0.3, 0);
  tailCone.rotation.x = Math.PI;
  const torso = part(capsule(0.2, 0.22, 8), gm, 0, 0.74, 0);
  const cloak = part(cone(0.3, 0.44, 10), mat(c2, { opacity: 0.6 }), 0, 0.7, -0.03);
  parts.torso = group(tailCone, torso, cloak);

  const hood = part(sphere(0.18, 10), mat(c2, { opacity: 0.72 }), 0, 1.0, 0);
  const face = part(sphere(0.13, 8), mat('#101426', { opacity: 0.9 }), 0, 0.99, 0.06);
  parts.head = group(hood, face, eyes(glow, 1.0, 0.14, 0.06, 0.032));

  const armR = part(capsule(0.05, 0.16, 6), gm, 0.22, 0.68, 0);
  parts.armR = limbPivot(armR, 0.2, 0.82, 0);
  const armL = part(capsule(0.05, 0.16, 6), gm, -0.22, 0.68, 0);
  parts.armL = limbPivot(armL, -0.2, 0.82, 0);
  const weapon = makeWeapon(v.weapon, v.palette);
  weapon.position.set(0.2, 0.44, 0.05);
  parts.weapon = weapon;
  parts.armR.add(weapon);

  root.add(parts.torso, parts.head, parts.armL, parts.armR);
  return { root, parts, gait: 'glide', height: 1.25 };
}

// ───────────────────── 坐騎 ─────────────────────

function buildRider(v) {
  const [c1, c2, skin] = v.palette;
  const parts = {};
  const root = new THREE.Group();
  const mountKind = v.mount || 'horse';

  const bodyColor = mountKind === 'hog' ? '#8a6a5a' : mountKind === 'ram' ? '#e8eef4' : '#c9a878';
  const bm = mat(bodyColor);
  const body = part(capsule(0.26, 0.44, 9), bm, 0, 0.62, 0);
  body.rotation.x = Math.PI / 2;
  const rump = part(sphere(0.28, 10), bm, 0, 0.62, -0.26);
  const neck = part(cyl(0.14, 0.18, 0.3, 8), bm, 0, 0.74, 0.3);
  neck.rotation.x = mountKind === 'hog' ? 1.2 : 0.7;
  const mHead = part(box(0.24, 0.22, 0.34), bm, 0, mountKind === 'hog' ? 0.72 : 0.88, 0.5);

  const mountExtras = group();
  if (mountKind === 'hog') {
    const tuskL = part(cone(0.035, 0.14, 5), mat('#efeadd'), -0.09, 0.7, 0.66);
    tuskL.rotation.x = -0.6;
    const tuskR = part(cone(0.035, 0.14, 5), mat('#efeadd'), 0.09, 0.7, 0.66);
    tuskR.rotation.x = -0.6;
    const snout = part(cyl(0.09, 0.09, 0.06, 8), mat('#d09a92'), 0, 0.7, 0.68);
    snout.rotation.x = Math.PI / 2;
    mountExtras.add(tuskL, tuskR, snout);
  } else if (mountKind === 'ram') {
    const hornL = part(torus(0.11, 0.035, 7, 8), mat('#c9a24a'), -0.15, 0.92, 0.42);
    hornL.rotation.set(0, 0.4, 0);
    const hornR = part(torus(0.11, 0.035, 7, 8), mat('#c9a24a'), 0.15, 0.92, 0.42);
    hornR.rotation.set(0, -0.4, 0);
    mountExtras.add(hornL, hornR);
  } else {
    const mane = part(box(0.08, 0.26, 0.34), mat('#4a3a2a'), 0, 0.96, 0.28);
    mountExtras.add(mane);
    const tail = part(cone(0.08, 0.36, 6), mat('#4a3a2a'), 0, 0.7, -0.5);
    tail.rotation.x = -1.9;
    mountExtras.add(tail);
  }

  const legs = [];
  const legPos = [[-0.16, 0.28], [0.16, 0.28], [-0.16, -0.26], [0.16, -0.26]];
  legPos.forEach(([lx, lz], i) => {
    const l = part(capsule(0.06, 0.16, 6), mat(shade(bodyColor, -0.15)), lx, 0.22, lz);
    const pv = limbPivot(l, lx, 0.44, lz);
    legs.push(pv);
    root.add(pv);
  });
  parts.mountLegs = legs;
  parts.legL = legs[0];
  parts.legR = legs[1];
  parts.mount = group(body, rump, neck, mHead, mountExtras);

  // 騎士
  const rider = new THREE.Group();
  rider.position.y = 0.78;
  const rTorso = part(box(0.3, 0.32, 0.2), mat(c1), 0, 0.18, -0.02);
  const rHead = part(sphere(0.14, 10), mat(skin), 0, 0.44, -0.02);
  const rHelm = v.weapon === 'lance'
    ? part(cyl(0.15, 0.16, 0.14, 10), mat('#c9a24a', { metal: 0.7 }), 0, 0.48, -0.02)
    : part(box(0.26, 0.1, 0.24), mat(c2), 0, 0.5, -0.02);
  const rArmR = part(capsule(0.05, 0.14, 6), mat(skin), 0.19, 0.16, 0);
  parts.armR = limbPivot(rArmR, 0.17, 0.3, 0);
  const rArmL = part(capsule(0.05, 0.14, 6), mat(skin), -0.19, 0.16, 0);
  parts.armL = limbPivot(rArmL, -0.17, 0.3, 0);
  const weapon = makeWeapon(v.weapon, v.palette);
  weapon.position.set(0.16, 0.0, 0.06);
  if (v.weapon === 'lance') weapon.rotation.x = 1.35;
  parts.weapon = weapon;
  parts.armR.add(weapon);
  rider.add(rTorso, rHead, rHelm, parts.armR, parts.armL);
  if (v.cape) {
    const cape = part(box(0.3, 0.4, 0.04), mat(v.cape), 0, 0.16, -0.16);
    rider.add(cape);
    parts.cape = cape;
  }
  parts.torso = rider;
  parts.head = rider;

  root.add(parts.mount, rider);
  return { root, parts, gait: 'gallop', height: 1.5 };
}

function buildBattleRam(v) {
  const [wood, dark, rope] = v.palette;
  const parts = {};
  const root = new THREE.Group();

  const log = part(cyl(0.19, 0.19, 1.0, 10), mat(wood), 0, 0.5, 0.1);
  log.rotation.x = Math.PI / 2;
  const band1 = part(torus(0.2, 0.035, 8), mat('#5a5a62', { metal: 0.6 }), 0, 0.5, 0.34);
  const band2 = part(torus(0.2, 0.035, 8), mat('#5a5a62', { metal: 0.6 }), 0, 0.5, -0.1);
  const ramHead = part(cone(0.22, 0.3, 8), mat('#8f98a8', { metal: 0.7 }), 0, 0.5, 0.72);
  ramHead.rotation.x = Math.PI / 2;
  const hornL = part(torus(0.09, 0.03, 6, 8), mat('#c9a24a'), -0.18, 0.56, 0.62);
  const hornR = part(torus(0.09, 0.03, 6, 8), mat('#c9a24a'), 0.18, 0.56, 0.62);
  parts.torso = group(log, band1, band2, ramHead, hornL, hornR);

  const barbs = group();
  [-0.34, 0.34].forEach((bx, i) => {
    const b = new THREE.Group();
    b.position.set(bx, 0, -0.3);
    const t = part(box(0.24, 0.3, 0.16), mat('#e6b25c'), 0, 0.56, 0);
    const h = part(sphere(0.13, 8), mat('#f0c9a0'), 0, 0.8, 0);
    const hair = part(sphere(0.14, 8), mat('#e8b84b'), 0, 0.84, -0.03);
    const legA = part(capsule(0.055, 0.13, 5), mat(dark), -0.07, 0.2, 0);
    const legB = part(capsule(0.055, 0.13, 5), mat(dark), 0.07, 0.2, 0);
    b.add(t, h, hair, legA, legB);
    barbs.add(b);
    parts[`barb${i}`] = b;
  });
  parts.legL = barbs.children[0];
  parts.legR = barbs.children[1];

  root.add(parts.torso, barbs);
  return { root, parts, gait: 'roll', height: 1.0 };
}

function buildSparky(v) {
  const [frame, dark, spark] = v.palette;
  const parts = {};
  const root = new THREE.Group();

  const wheelL = part(cyl(0.3, 0.3, 0.12, 14), mat('#4a3a2a'), -0.34, 0.3, 0);
  wheelL.rotation.z = Math.PI / 2;
  const wheelR = part(cyl(0.3, 0.3, 0.12, 14), mat('#4a3a2a'), 0.34, 0.3, 0);
  wheelR.rotation.z = Math.PI / 2;
  parts.wheelL = wheelL;
  parts.wheelR = wheelR;

  const chassis = part(box(0.5, 0.26, 0.7), mat(frame, { metal: 0.5 }), 0, 0.38, 0);
  const coilBase = part(cyl(0.16, 0.2, 0.3, 10), mat(dark, { metal: 0.7 }), 0, 0.66, -0.06);
  const coilA = part(torus(0.19, 0.04, 8), mat('#c98a3a', { metal: 0.8 }), 0, 0.78, -0.06);
  coilA.rotation.x = Math.PI / 2;
  const coilB = part(torus(0.16, 0.04, 8), mat('#c98a3a', { metal: 0.8 }), 0, 0.9, -0.06);
  coilB.rotation.x = Math.PI / 2;
  const orb = part(sphere(0.17, 12), mat(spark, { emissive: spark, emissiveIntensity: 2.4 }), 0, 1.08, -0.06);
  parts.orb = orb;
  const prongL = part(cyl(0.03, 0.03, 0.5, 6), mat('#8f98a8', { metal: 0.8 }), -0.14, 0.9, 0.3);
  prongL.rotation.x = 1.2;
  const prongR = part(cyl(0.03, 0.03, 0.5, 6), mat('#8f98a8', { metal: 0.8 }), 0.14, 0.9, 0.3);
  prongR.rotation.x = 1.2;
  parts.torso = group(chassis, coilBase, coilA, coilB, prongL, prongR);
  parts.head = orb;

  root.add(wheelL, wheelR, parts.torso, orb);
  return { root, parts, gait: 'roll', height: 1.3 };
}

function buildMegaKnight(v) {
  const [c1, c2, glow] = v.palette;
  const parts = {};
  const root = new THREE.Group();
  const armour = mat(c1, { metal: 0.8, rough: 0.32 });
  const dark = mat(c2, { metal: 0.75, rough: 0.4 });

  const legL = part(box(0.24, 0.4, 0.28), dark, -0.22, 0.22, 0);
  const legR = part(box(0.24, 0.4, 0.28), dark, 0.22, 0.22, 0);
  parts.legL = limbPivot(legL, -0.22, 0.42, 0);
  parts.legR = limbPivot(legR, 0.22, 0.42, 0);

  const torso = part(box(0.62, 0.5, 0.4), armour, 0, 0.72, 0);
  const plate = part(box(0.5, 0.2, 0.06), mat('#c9a24a', { metal: 0.8 }), 0, 0.8, 0.22);
  const pauldronL = part(sphere(0.24, 10), armour, -0.42, 0.94, 0);
  const pauldronR = part(sphere(0.24, 10), armour, 0.42, 0.94, 0);
  const spikeL = part(cone(0.07, 0.24, 6), dark, -0.5, 1.12, 0);
  const spikeR = part(cone(0.07, 0.24, 6), dark, 0.5, 1.12, 0);
  parts.torso = group(torso, plate, pauldronL, pauldronR, spikeL, spikeR);

  const helm = part(box(0.34, 0.3, 0.34), armour, 0, 1.16, 0);
  const visor = part(box(0.3, 0.07, 0.06), mat(glow, { emissive: glow, emissiveIntensity: 3 }), 0, 1.16, 0.18);
  const crest = part(box(0.06, 0.24, 0.3), mat('#c9a24a', { metal: 0.8 }), 0, 1.4, -0.02);
  parts.head = group(helm, visor, crest);

  const armL = part(box(0.2, 0.4, 0.22), dark, -0.46, 0.66, 0);
  const armR = part(box(0.2, 0.4, 0.22), dark, 0.46, 0.66, 0);
  parts.armL = limbPivot(armL, -0.44, 0.88, 0);
  parts.armR = limbPivot(armR, 0.44, 0.88, 0);
  parts.armL.add(part(box(0.28, 0.24, 0.3), armour, 0, -0.28, 0.04));
  parts.armR.add(part(box(0.28, 0.24, 0.3), armour, 0, -0.28, 0.04));

  const cape = part(box(0.56, 0.6, 0.05), mat('#7a2f4f'), 0, 0.74, -0.24);
  parts.cape = cape;

  root.add(parts.legL, parts.legR, parts.torso, parts.head, parts.armL, parts.armR, cape);
  return { root, parts, gait: 'stomp', height: 1.55 };
}

function buildSpirit(v) {
  const [c1, c2, glow] = v.palette;
  const parts = {};
  const root = new THREE.Group();
  const core = part(sphere(0.25, 12), mat(c1, { emissive: glow, emissiveIntensity: 1.8, opacity: 0.92 }), 0, 0.42, 0);
  const halo = part(torus(0.3, 0.045, 8), mat(glow, { emissive: glow, emissiveIntensity: 2 }), 0, 0.42, 0);
  halo.rotation.x = Math.PI / 2.4;
  const tail = part(cone(0.2, 0.4, 8), mat(c2, { opacity: 0.6, emissive: c2, emissiveIntensity: 1 }), 0, 0.16, 0);
  tail.rotation.x = Math.PI;
  parts.torso = group(core, halo, tail);
  parts.head = group(eyes('#ffffff', 0.46, 0.2, 0.08, 0.04));
  parts.halo = halo;
  root.add(parts.torso, parts.head);
  return { root, parts, gait: 'bounce', height: 0.75 };
}

// ───────────────────── 建築 ─────────────────────

function buildingBase(color, w = 0.9, h = 0.16) {
  return part(box(w, h, w), mat(shade(color, -0.22), { rough: 0.9 }), 0, h / 2, 0);
}

function buildCannon(v) {
  const [wood, dark, metal] = v.palette;
  const parts = {};
  const root = new THREE.Group();
  const base = buildingBase(wood, 1.0);
  const wheelL = part(cyl(0.24, 0.24, 0.1, 12), mat(dark), -0.36, 0.28, 0);
  wheelL.rotation.z = Math.PI / 2;
  const wheelR = part(cyl(0.24, 0.24, 0.1, 12), mat(dark), 0.36, 0.28, 0);
  wheelR.rotation.z = Math.PI / 2;
  const carriage = part(box(0.5, 0.2, 0.6), mat(wood), 0, 0.34, -0.04);
  const turret = new THREE.Group();
  turret.position.set(0, 0.5, 0);
  const barrel = part(cyl(0.14, 0.17, 0.72, 12), mat(metal, { metal: 0.7, rough: 0.4 }), 0, 0, 0.24);
  barrel.rotation.x = Math.PI / 2;
  const mouth = part(torus(0.16, 0.035, 8), mat('#4a4a52', { metal: 0.8 }), 0, 0, 0.6);
  turret.add(barrel, mouth);
  parts.turret = turret;
  root.add(base, wheelL, wheelR, carriage, turret);
  return { root, parts, gait: 'static', building: true, height: 0.9 };
}

function buildTesla(v) {
  const [frame, dark, glow] = v.palette;
  const parts = {};
  const root = new THREE.Group();
  const base = buildingBase(frame, 1.0);
  const pillar = part(cyl(0.2, 0.26, 0.5, 10), mat(frame, { metal: 0.6 }), 0, 0.4, 0);
  const riser = new THREE.Group();
  riser.position.y = 0.6;
  const coil = part(cyl(0.14, 0.16, 0.3, 10), mat(dark, { metal: 0.7 }), 0, 0.15, 0);
  const rings = group();
  for (let i = 0; i < 3; i += 1) {
    const r = part(torus(0.18 - i * 0.03, 0.03, 8), mat('#c98a3a', { metal: 0.8 }), 0, 0.1 + i * 0.12, 0);
    r.rotation.x = Math.PI / 2;
    rings.add(r);
  }
  const orb = part(sphere(0.15, 12), mat(glow, { emissive: glow, emissiveIntensity: 2.4 }), 0, 0.48, 0);
  riser.add(coil, rings, orb);
  parts.riser = riser;
  parts.orb = orb;
  root.add(base, pillar, riser);
  return { root, parts, gait: 'static', building: true, hides: true, height: 1.2 };
}

function buildInferno(v) {
  const [stone, dark, fire] = v.palette;
  const parts = {};
  const root = new THREE.Group();
  const base = buildingBase(stone, 1.1);
  const body = part(cyl(0.3, 0.4, 0.86, 10), mat(stone, { rough: 0.85 }), 0, 0.56, 0);
  const bands = group();
  for (let i = 0; i < 2; i += 1) {
    const b = part(torus(0.34 - i * 0.04, 0.035, 10), mat(dark, { metal: 0.5 }), 0, 0.4 + i * 0.32, 0);
    b.rotation.x = Math.PI / 2;
    bands.add(b);
  }
  const turret = new THREE.Group();
  turret.position.y = 1.02;
  const nozzle = part(cone(0.2, 0.34, 10), mat(dark, { metal: 0.6 }), 0, 0.08, 0.1);
  nozzle.rotation.x = 1.1;
  const core = part(sphere(0.13, 10), mat(fire, { emissive: fire, emissiveIntensity: 3 }), 0, 0.1, 0.22);
  turret.add(nozzle, core);
  parts.turret = turret;
  parts.core = core;
  root.add(base, body, bands, turret);
  return { root, parts, gait: 'static', building: true, height: 1.4 };
}

function buildBombTower(v) {
  const [stone, dark, bombCol] = v.palette;
  const parts = {};
  const root = new THREE.Group();
  const base = buildingBase(stone, 1.05);
  const body = part(cyl(0.3, 0.4, 0.7, 8), mat(stone, { rough: 0.9, flat: true }), 0, 0.48, 0);
  const rim = part(cyl(0.42, 0.38, 0.12, 8), mat(dark), 0, 0.86, 0);
  const turret = new THREE.Group();
  turret.position.y = 0.98;
  const bombGuy = part(sphere(0.22, 10), mat(bombCol), 0, 0.1, 0);
  const fuse = part(cyl(0.02, 0.02, 0.14, 5), mat('#8a6a3b'), 0, 0.28, 0);
  const spark = part(sphere(0.05, 6), mat('#ffd07a', { emissive: '#ff8a1a', emissiveIntensity: 3 }), 0, 0.36, 0);
  turret.add(bombGuy, fuse, spark);
  parts.turret = turret;
  root.add(base, body, rim, turret);
  return { root, parts, gait: 'static', building: true, height: 1.3 };
}

function buildTombstone(v) {
  const [stone, dark, cross] = v.palette;
  const parts = {};
  const root = new THREE.Group();
  const mound = part(sphere(0.5, 10), mat('#4a4030', { rough: 0.95 }), 0, 0.06, 0);
  mound.scale.set(1, 0.35, 1);
  const slab = part(box(0.52, 0.62, 0.14), mat(stone, { rough: 0.9, flat: true }), 0, 0.42, -0.05);
  const top = part(cyl(0.26, 0.26, 0.14, 10, 1), mat(stone, { rough: 0.9 }), 0, 0.72, -0.05);
  top.rotation.x = Math.PI / 2;
  const crossV = part(box(0.07, 0.3, 0.03), mat(dark), 0, 0.5, 0.04);
  const crossH = part(box(0.22, 0.07, 0.03), mat(dark), 0, 0.56, 0.04);
  const skull = part(sphere(0.1, 8), mat('#efeadd'), 0.24, 0.14, 0.16);
  root.add(mound, slab, top, crossV, crossH, skull);
  parts.torso = slab;
  return { root, parts, gait: 'static', building: true, height: 0.9 };
}

function buildHut(v) {
  const [wall, dark, roof] = v.palette;
  const parts = {};
  const root = new THREE.Group();
  const base = buildingBase(wall, 1.05);
  const body = part(cyl(0.36, 0.42, 0.56, 8), mat(wall, { rough: 0.9, flat: true }), 0, 0.42, 0);
  const roofM = part(cone(0.56, 0.5, 8), mat(roof, { rough: 0.85, flat: true }), 0, 0.94, 0);
  const door = part(box(0.24, 0.3, 0.06), mat('#3a2a1a'), 0, 0.28, 0.4);
  const flag = part(box(0.16, 0.1, 0.02), mat('#c4423a'), 0.1, 1.22, 0);
  const pole = part(cyl(0.015, 0.015, 0.24, 4), mat('#5a4a3a'), 0, 1.2, 0);
  root.add(base, body, roofM, door, pole, flag);
  parts.torso = body;
  parts.flag = flag;
  return { root, parts, gait: 'static', building: true, height: 1.3 };
}

function buildFurnace(v) {
  const [stone, dark, fire] = v.palette;
  const parts = {};
  const root = new THREE.Group();
  const base = buildingBase(stone, 1.0);
  const body = part(box(0.62, 0.6, 0.62), mat(stone, { rough: 0.92, flat: true }), 0, 0.44, 0);
  const chimney = part(cyl(0.14, 0.16, 0.4, 8), mat(dark), 0.16, 0.92, -0.14);
  const mouth = part(box(0.3, 0.24, 0.08), mat('#2a1a12'), 0, 0.36, 0.32);
  const flame = part(cone(0.13, 0.28, 8), mat(fire, { emissive: fire, emissiveIntensity: 2.6 }), 0, 0.36, 0.34);
  parts.flame = flame;
  root.add(base, body, chimney, mouth, flame);
  return { root, parts, gait: 'static', building: true, height: 1.2 };
}

function buildXbow(v) {
  const [wood, dark, metal] = v.palette;
  const parts = {};
  const root = new THREE.Group();
  const base = buildingBase(wood, 1.1);
  const legs = group();
  for (const [lx, lz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
    legs.add(part(cyl(0.05, 0.06, 0.36, 6), mat(wood), lx, 0.24, lz));
  }
  const table = part(box(0.8, 0.1, 0.8), mat(wood), 0, 0.46, 0);
  const turret = new THREE.Group();
  turret.position.y = 0.58;
  const arms = part(box(1.15, 0.06, 0.08), mat(dark), 0, 0.06, 0.1);
  const rail = part(box(0.12, 0.08, 0.8), mat(metal, { metal: 0.6 }), 0, 0.1, 0.1);
  const drum = part(cyl(0.16, 0.16, 0.2, 10), mat(metal, { metal: 0.5 }), 0, 0.16, -0.2);
  drum.rotation.z = Math.PI / 2;
  const bolt = part(cone(0.05, 0.3, 6), mat('#e0e6ee', { metal: 0.7 }), 0, 0.16, 0.4);
  bolt.rotation.x = Math.PI / 2;
  turret.add(arms, rail, drum, bolt);
  parts.turret = turret;
  root.add(base, legs, table, turret);
  return { root, parts, gait: 'static', building: true, height: 1.0 };
}

function buildMortar(v) {
  const [wood, dark, metal] = v.palette;
  const parts = {};
  const root = new THREE.Group();
  const base = buildingBase(wood, 1.05);
  const platform = part(cyl(0.42, 0.46, 0.18, 10), mat(wood), 0, 0.24, 0);
  const turret = new THREE.Group();
  turret.position.y = 0.34;
  const tube = part(cyl(0.2, 0.24, 0.68, 10), mat(metal, { metal: 0.6, rough: 0.45 }), 0, 0.3, -0.02);
  tube.rotation.x = -0.42;
  const brace = part(box(0.44, 0.1, 0.3), mat(dark), 0, 0.12, 0.14);
  turret.add(tube, brace);
  parts.turret = turret;
  root.add(base, platform, turret);
  return { root, parts, gait: 'static', building: true, height: 1.0 };
}

function buildCollector(v) {
  const [tank, dark, liquid] = v.palette;
  const parts = {};
  const root = new THREE.Group();
  const base = buildingBase(dark, 1.05);
  const barrel = part(cyl(0.34, 0.36, 0.66, 12), mat(tank, { metal: 0.35, rough: 0.4, opacity: 0.85 }), 0, 0.48, 0);
  const fluid = part(cyl(0.3, 0.3, 0.4, 12), mat(liquid, { emissive: liquid, emissiveIntensity: 1.2, opacity: 0.9 }), 0, 0.38, 0);
  parts.fluid = fluid;
  const ringTop = part(torus(0.35, 0.045, 10), mat('#c9a24a', { metal: 0.7 }), 0, 0.8, 0);
  ringTop.rotation.x = Math.PI / 2;
  const pipe = part(cyl(0.07, 0.07, 0.4, 8), mat(dark, { metal: 0.6 }), 0.34, 0.6, 0.2);
  pipe.rotation.z = 0.6;
  const wheel = part(torus(0.14, 0.035, 8), mat('#c9a24a', { metal: 0.7 }), 0, 0.92, 0);
  wheel.rotation.x = Math.PI / 2;
  parts.wheel = wheel;
  root.add(base, barrel, fluid, ringTop, pipe, wheel);
  return { root, parts, gait: 'static', building: true, height: 1.1 };
}

// ───────────────────── 王塔與公主塔 ─────────────────────

/**
 * @param {object} o
 * @param {number} o.side     這座塔實際屬於哪一方
 * @param {number} o.viewSide 觀看者是哪一方
 * 顏色是**相對於觀看者**的：自己永遠藍、對手永遠紅，
 * 兩個客戶端看同一場對戰時才不會其中一邊把自己看成紅色。
 */
export function buildCrownTower({ kind, side, towerTroop, viewSide = 0 }) {
  const teamColor = side === viewSide ? '#3f6fd8' : '#d8443f';
  const stone = '#d8d2c4';
  const stoneDark = '#a89f8e';
  const root = new THREE.Group();
  const parts = {};

  const big = kind === 'king';
  // 塔的視覺尺寸對齊模擬器的碰撞半徑：公主塔 1.5、王塔 2.0。
  const w = big ? 3.6 : 2.8;
  const h = big ? 1.9 : 1.4;

  const plinth = part(box(w + 0.35, 0.3, w + 0.35), mat(stoneDark, { rough: 0.9 }), 0, 0.15, 0);
  const body = part(box(w, h, w), mat(stone, { rough: 0.85 }), 0, 0.3 + h / 2, 0);
  const trim = part(box(w + 0.16, 0.18, w + 0.16), mat(teamColor, { rough: 0.6 }), 0, 0.3 + h, 0);

  const merlons = group();
  const n = big ? 5 : 4;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (i > 0 && i < n - 1 && j > 0 && j < n - 1) continue;
      const mx = -w / 2 + (w / (n - 1)) * i;
      const mz = -w / 2 + (w / (n - 1)) * j;
      merlons.add(part(box(w / (n * 1.6), 0.28, w / (n * 1.6)), mat(stone, { rough: 0.85 }), mx, 0.3 + h + 0.22, mz));
    }
  }

  const platformY = 0.3 + h + 0.1;
  const occupant = new THREE.Group();
  occupant.position.y = platformY;
  parts.occupant = occupant;

  if (big) {
    const keep = part(box(1.1, 0.9, 1.1), mat(stone, { rough: 0.85 }), 0, platformY + 0.45, 0);
    const roof = part(cone(0.95, 0.8, 4), mat(teamColor), 0, platformY + 1.3, 0);
    roof.rotation.y = Math.PI / 4;
    const banner = part(box(0.5, 0.6, 0.04), mat(teamColor), 0, platformY + 0.5, 0.58);
    const crown = crownMesh('#f0d08a', platformY + 1.8);
    const ballista = new THREE.Group();
    ballista.position.set(0, platformY + 0.95, 0.3);
    const bolt = part(cyl(0.05, 0.05, 0.7, 6), mat('#6f5a3a'), 0, 0, 0.2);
    bolt.rotation.x = Math.PI / 2;
    const bow = part(box(0.9, 0.06, 0.06), mat('#4a3a2a'), 0, 0, 0.32);
    ballista.add(bolt, bow);
    parts.turret = ballista;
    occupant.add(keep, roof, banner, crown, ballista);
    occupant.position.y = 0;
  } else {
    const tt = towerTroop || 'tower_princess';
    const figure = buildTowerTroopFigure(tt, teamColor);
    figure.scale.setScalar(0.95);
    figure.position.y = platformY;
    parts.turret = figure;
    parts.figure = figure;
    root.add(figure);
  }

  root.add(plinth, body, trim, merlons, occupant);
  parts.body = body;
  return { root, parts, height: platformY + (big ? 2.0 : 1.2) };
}

function buildTowerTroopFigure(kind, teamColor) {
  const g = new THREE.Group();
  if (kind === 'tower_cannoneer') {
    const barrel = part(cyl(0.14, 0.17, 0.62, 10), mat('#5a5a62', { metal: 0.7 }), 0, 0.34, 0.24);
    barrel.rotation.x = Math.PI / 2;
    const carriage = part(box(0.44, 0.24, 0.42), mat('#7a5a3a'), 0, 0.2, 0);
    const gunner = part(sphere(0.14, 8), mat('#f0c9a0'), -0.26, 0.44, -0.16);
    const hat = part(cone(0.18, 0.16, 8), mat(teamColor), -0.26, 0.58, -0.16);
    g.add(carriage, barrel, gunner, hat);
  } else if (kind === 'tower_duchess') {
    const robe = part(cone(0.24, 0.6, 10), mat('#7a3f9f'), 0, 0.3, 0);
    const head = part(sphere(0.14, 10), mat('#f0c9a0'), 0, 0.72, 0);
    const hair = part(sphere(0.16, 10), mat('#3a2a3a'), 0, 0.76, -0.03);
    const daggerA = part(box(0.04, 0.22, 0.02), mat('#d4dae4', { metal: 0.8 }), 0.2, 0.5, 0.12);
    daggerA.rotation.z = -0.5;
    const daggerB = part(box(0.04, 0.22, 0.02), mat('#d4dae4', { metal: 0.8 }), -0.2, 0.5, 0.12);
    daggerB.rotation.z = 0.5;
    g.add(robe, head, hair, daggerA, daggerB);
  } else if (kind === 'tower_chef') {
    const body = part(capsule(0.2, 0.3, 8), mat('#f0efe8'), 0, 0.42, 0);
    const head = part(sphere(0.15, 10), mat('#f0c9a0'), 0, 0.78, 0);
    const toque = part(cyl(0.16, 0.14, 0.3, 10), mat('#ffffff'), 0, 1.0, 0);
    const scarf = part(torus(0.16, 0.04, 8), mat('#c4423a'), 0, 0.66, 0);
    scarf.rotation.x = Math.PI / 2;
    const pan = part(cyl(0.16, 0.16, 0.05, 10), mat('#3a3a3a', { metal: 0.6 }), 0.28, 0.52, 0.12);
    g.add(body, head, toque, scarf, pan);
  } else {
    const robe = part(cone(0.24, 0.62, 10), mat('#f0a0c0'), 0, 0.31, 0);
    const sash = part(torus(0.2, 0.04, 8), mat(teamColor), 0, 0.5, 0);
    sash.rotation.x = Math.PI / 2;
    const head = part(sphere(0.14, 10), mat('#f0c9a0'), 0, 0.74, 0);
    const hair = part(sphere(0.16, 10), mat('#f0d08a'), 0, 0.78, -0.03);
    const bow = makeWeapon('longbow', ['#c9a24a']);
    bow.scale.setScalar(0.7);
    bow.position.set(0.2, 0.34, 0.1);
    bow.rotation.z = -0.3;
    g.add(robe, sash, head, hair, bow, crownMesh('#f0d08a', 0.92));
  }
  return g;
}

// ───────────────────── 建造分派 ─────────────────────

const BUILDERS = {
  humanoid: buildHumanoid,
  goblin: buildGoblin,
  skeleton: buildSkeleton,
  mage: buildMage,
  giant: buildGiant,
  pekka: buildPekka,
  golem: buildGolem,
  minion: buildMinion,
  bat: buildBat,
  dragon: buildDragon,
  balloon: buildBalloon,
  machine: buildMachine,
  ghost: buildGhost,
  rider: buildRider,
  battleram: buildBattleRam,
  sparky: buildSparky,
  megaknight: buildMegaKnight,
  spirit: buildSpirit,
  cannon: buildCannon,
  tesla: buildTesla,
  inferno: buildInferno,
  bombtower: buildBombTower,
  tombstone: buildTombstone,
  hut: buildHut,
  furnace: buildFurnace,
  xbow: buildXbow,
  mortar: buildMortar,
  collector: buildCollector,
};

export function listBuilders() { return Object.keys(BUILDERS); }

/**
 * 建立一張卡的模型。
 * @param {object} card 目錄項目
 * @param {number} side 0 我方 / 1 對方
 * @param {boolean} evolved
 */
export function buildCardModel(card, side, evolved = false, viewSide = 0) {
  const v = card.visual || { build: 'humanoid', palette: ['#888', '#555', '#f0c9a0'] };
  const builder = BUILDERS[v.build] || buildHumanoid;
  const model = builder(v);

  // 原作的角色相對於格子是偏大的（辨識度優先），
  // 這裡用一個全域係數放大，而不是逐卡調數字。
  const scale = (v.scale ?? 1) * MODEL_SCALE;
  model.root.scale.setScalar(scale);
  model.height = (model.height || 1.2) * scale;

  // 隊伍色環：相對於觀看者 —— 自己藍、對手紅。
  const ringColor = side === viewSide ? '#4a9bff' : '#ff5a4a';
  const ring = part(torus(0.42, 0.05, 10), mat(ringColor, { emissive: ringColor, emissiveIntensity: 0.9 }), 0, 0.03, 0);
  ring.rotation.x = Math.PI / 2;
  ring.scale.setScalar((card.unit?.radius || 0.5) / 0.42 * 1.25 / scale);
  model.root.add(ring);
  model.ring = ring;

  if (evolved) {
    const aura = part(torus(0.5, 0.035, 12), mat('#9fe8ff', { emissive: '#7de3ff', emissiveIntensity: 2.4 }), 0, 0.1, 0);
    aura.rotation.x = Math.PI / 2;
    aura.scale.setScalar(1 / scale);
    model.root.add(aura);
    model.evoAura = aura;
  }

  model.card = card.key;
  model.side = side;
  return model;
}

export { BUILDERS };

// ───────────────────── 法術展示模型 ─────────────────────
// 法術不會在場上生成單位，這些模型用於卡面與詳情頁的三視圖，
// 讓法術卡也有可辨識的立體外觀，而不是套用人形。

function spellBase(color) {
  const disc = part(cyl(0.5, 0.55, 0.1, 16), mat(color, { emissive: color, emissiveIntensity: 0.5, opacity: 0.6 }), 0, 0.05, 0);
  return disc;
}

function buildSpellZap(v) {
  const [c1, c2] = v.palette;
  const root = new THREE.Group();
  const bolt = group();
  let y = 0.2;
  let x = 0;
  for (let i = 0; i < 4; i += 1) {
    const seg = part(box(0.16, 0.34, 0.08), mat(c1, { emissive: c1, emissiveIntensity: 2.6 }), x, y, 0);
    seg.rotation.z = i % 2 ? 0.5 : -0.5;
    bolt.add(seg);
    x += i % 2 ? 0.16 : -0.16;
    y += 0.26;
  }
  root.add(spellBase(c2), bolt);
  return { root, parts: { torso: bolt }, gait: 'static', height: 1.3 };
}

function buildSpellSnowball(v) {
  const [c1, c2] = v.palette;
  const root = new THREE.Group();
  const ball = part(sphere(0.42, 14), mat(c1, { rough: 0.6 }), 0, 0.5, 0);
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    root.add(part(sphere(0.13, 8), mat(c2), Math.cos(a) * 0.36, 0.5 + Math.sin(a) * 0.3, 0.2));
  }
  root.add(spellBase(c2), ball);
  return { root, parts: { torso: ball }, gait: 'static', height: 1.1 };
}

function buildSpellArrows(v) {
  const [c1, c2] = v.palette;
  const root = new THREE.Group();
  const g = group();
  for (let i = 0; i < 5; i += 1) {
    const a = new THREE.Group();
    a.position.set((i - 2) * 0.2, 0.55 + Math.abs(i - 2) * 0.1, (i % 2) * 0.1);
    a.rotation.x = -0.9;
    a.add(part(cyl(0.02, 0.02, 0.72, 5), mat(c2), 0, 0, 0));
    a.add(part(cone(0.06, 0.16, 5), mat('#cfd6e0', { metal: 0.7 }), 0, 0.42, 0));
    a.add(part(box(0.02, 0.14, 0.12), mat(c1), 0, -0.32, 0));
    g.add(a);
  }
  root.add(spellBase(c1), g);
  return { root, parts: { torso: g }, gait: 'static', height: 1.3 };
}

function buildSpellLog(v) {
  const [c1, c2] = v.palette;
  const root = new THREE.Group();
  const log = part(cyl(0.34, 0.34, 1.5, 14), mat(c1, { rough: 0.9 }), 0, 0.4, 0);
  log.rotation.z = Math.PI / 2;
  const rings = group();
  for (const off of [-0.5, 0, 0.5]) {
    const r = part(torus(0.35, 0.04, 8), mat(c2), off, 0.4, 0);
    r.rotation.y = Math.PI / 2;
    rings.add(r);
  }
  const spikes = group();
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    spikes.add(part(cone(0.06, 0.16, 5), mat('#5a4030'), 0, 0.4 + Math.sin(a) * 0.36, Math.cos(a) * 0.36));
  }
  root.add(spellBase(c2), log, rings, spikes);
  return { root, parts: { torso: log }, gait: 'static', height: 1.0 };
}

function buildSpellBarrel(v) {
  const [c1, c2] = v.palette;
  const root = new THREE.Group();
  const barrel = part(cyl(0.34, 0.3, 0.72, 12), mat(c1, { rough: 0.85 }), 0, 0.42, 0);
  const b1 = part(torus(0.35, 0.04, 10), mat('#5a5a62', { metal: 0.6 }), 0, 0.6, 0);
  b1.rotation.x = Math.PI / 2;
  const b2 = part(torus(0.31, 0.04, 10), mat('#5a5a62', { metal: 0.6 }), 0, 0.24, 0);
  b2.rotation.x = Math.PI / 2;
  const hand = part(sphere(0.12, 8), mat('#f0c9a0'), 0.3, 0.7, 0.1);
  root.add(spellBase(c2), barrel, b1, b2, hand);
  return { root, parts: { torso: barrel }, gait: 'static', height: 1.0 };
}

function buildSpellFireball(v) {
  const [c1, c2] = v.palette;
  const root = new THREE.Group();
  const core = part(sphere(0.4, 14), mat('#ffd07a', { emissive: '#ff8a1a', emissiveIntensity: 2.6 }), 0, 0.62, 0);
  const shell = part(sphere(0.5, 14), mat(c1, { emissive: c1, emissiveIntensity: 1.4, opacity: 0.55 }), 0, 0.62, 0);
  const tail = group();
  for (let i = 0; i < 5; i += 1) {
    const t = part(cone(0.16 - i * 0.02, 0.4, 7), mat(c2, { emissive: c2, emissiveIntensity: 1.6, opacity: 0.7 - i * 0.1 }), 0, 0.62, -0.4 - i * 0.22);
    t.rotation.x = -Math.PI / 2;
    tail.add(t);
  }
  root.add(spellBase(c1), core, shell, tail);
  return { root, parts: { torso: shell }, gait: 'static', height: 1.2 };
}

function buildSpellRocket(v) {
  const [c1, c2] = v.palette;
  const root = new THREE.Group();
  const body = part(cyl(0.2, 0.24, 0.9, 12), mat(c1, { metal: 0.4 }), 0, 0.62, 0);
  const nose = part(cone(0.22, 0.36, 12), mat('#e8e0d0'), 0, 1.22, 0);
  const fins = group();
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    const f = part(box(0.06, 0.3, 0.26), mat(c2), Math.cos(a) * 0.22, 0.3, Math.sin(a) * 0.22);
    f.rotation.y = -a;
    fins.add(f);
  }
  const flame = part(cone(0.18, 0.4, 10), mat('#ffb03a', { emissive: '#ff6a1a', emissiveIntensity: 2.6 }), 0, 0.0, 0);
  flame.rotation.x = Math.PI;
  root.add(spellBase(c2), body, nose, fins, flame);
  return { root, parts: { torso: body, flame }, gait: 'static', height: 1.5 };
}

function buildSpellLightning(v) {
  const [c1, c2] = v.palette;
  const root = new THREE.Group();
  const cloud = part(sphere(0.4, 10), mat('#4a5a7a'), 0, 1.25, 0);
  cloud.scale.set(1.4, 0.65, 1);
  const cloud2 = part(sphere(0.3, 10), mat('#5a6a8a'), -0.35, 1.32, 0);
  const bolts = group();
  for (const bx of [-0.3, 0, 0.3]) {
    let y = 1.0;
    for (let i = 0; i < 3; i += 1) {
      const seg = part(box(0.1, 0.3, 0.06), mat(c1, { emissive: c1, emissiveIntensity: 3 }), bx + (i % 2 ? 0.08 : -0.08), y, 0);
      seg.rotation.z = i % 2 ? 0.4 : -0.4;
      bolts.add(seg);
      y -= 0.28;
    }
  }
  root.add(spellBase(c2), cloud, cloud2, bolts);
  return { root, parts: { torso: bolts }, gait: 'static', height: 1.6 };
}

function buildSpellCloud(v, cfg) {
  const [c1, c2] = v.palette;
  const root = new THREE.Group();
  const cloud = group();
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2;
    const r = 0.34;
    cloud.add(part(sphere(0.24 + (i % 3) * 0.05, 9),
      mat(c1, { emissive: c1, emissiveIntensity: cfg.glow ?? 0.8, opacity: cfg.opacity ?? 0.75 }),
      Math.cos(a) * r, 0.55 + (i % 2) * 0.2, Math.sin(a) * r));
  }
  cloud.add(part(sphere(0.34, 12), mat(c2, { emissive: c2, emissiveIntensity: cfg.glow ?? 0.8, opacity: 0.6 }), 0, 0.65, 0));
  if (cfg.skull) {
    cloud.add(part(sphere(0.18, 10), mat('#efeadd'), 0, 0.72, 0.3));
    cloud.add(part(box(0.2, 0.07, 0.14), mat('#dcd6c8'), 0, 0.62, 0.32));
  }
  root.add(spellBase(c2), cloud);
  return { root, parts: { torso: cloud }, gait: 'static', height: 1.2 };
}

function buildSpellFreeze(v) {
  const [c1, c2] = v.palette;
  const root = new THREE.Group();
  const shards = group();
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    const s = part(cone(0.12, 0.6 + (i % 2) * 0.3, 6),
      mat(c1, { emissive: c1, emissiveIntensity: 1.4, opacity: 0.8, rough: 0.15, metal: 0.2 }),
      Math.cos(a) * 0.3, 0.4 + (i % 2) * 0.15, Math.sin(a) * 0.3);
    s.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
    shards.add(s);
  }
  shards.add(part(cone(0.18, 1.0, 7), mat('#e8f8ff', { emissive: c1, emissiveIntensity: 1.6, opacity: 0.85 }), 0, 0.6, 0));
  root.add(spellBase(c2), shards);
  return { root, parts: { torso: shards }, gait: 'static', height: 1.3 };
}

function buildSpellTornado(v) {
  const [c1, c2] = v.palette;
  const root = new THREE.Group();
  const funnel = group();
  for (let i = 0; i < 6; i += 1) {
    const r = 0.12 + i * 0.09;
    const ring = part(torus(r, 0.05, 10), mat(i % 2 ? c1 : c2, { opacity: 0.72, emissive: c1, emissiveIntensity: 0.4 }), 0, 0.15 + i * 0.2, 0);
    ring.rotation.x = Math.PI / 2;
    ring.rotation.z = i * 0.4;
    funnel.add(ring);
  }
  root.add(spellBase(c2), funnel);
  return { root, parts: { torso: funnel }, gait: 'static', height: 1.5 };
}

function buildSpellGobBarrel(v) {
  const [c1, c2] = v.palette;
  const root = new THREE.Group();
  const barrel = part(cyl(0.32, 0.28, 0.66, 12), mat(c1, { rough: 0.85 }), 0, 0.4, 0);
  barrel.rotation.z = 0.4;
  const hoop = part(torus(0.33, 0.04, 10), mat('#5a5a62', { metal: 0.6 }), 0.1, 0.55, 0);
  hoop.rotation.set(Math.PI / 2, 0, 0.4);
  const head = part(sphere(0.17, 10), mat(c2), -0.12, 0.78, 0.05);
  const earL = part(cone(0.06, 0.2, 5), mat(c2), -0.3, 0.84, 0);
  earL.rotation.z = 1.2;
  root.add(spellBase(c2), barrel, hoop, head, earL);
  return { root, parts: { torso: barrel }, gait: 'static', height: 1.1 };
}

function buildSpellGraveyard(v) {
  const [c1, c2] = v.palette;
  const root = new THREE.Group();
  const mound = part(sphere(0.6, 10), mat('#3a3428', { rough: 0.95 }), 0, 0.05, 0);
  mound.scale.set(1, 0.3, 1);
  const stones = group();
  for (const [sx, sz, h] of [[-0.35, 0.1, 0.5], [0.3, -0.2, 0.4], [0.05, 0.35, 0.34]]) {
    stones.add(part(box(0.22, h, 0.08), mat('#9a9a8a', { rough: 0.9 }), sx, h / 2 + 0.06, sz));
  }
  const hand = part(sphere(0.12, 8), mat('#efeadd'), 0, 0.3, -0.05);
  const arm = part(cyl(0.05, 0.05, 0.34, 6), mat('#efeadd'), 0, 0.16, -0.05);
  const wisp = part(sphere(0.24, 10), mat(c1, { emissive: '#a07ae0', emissiveIntensity: 1.6, opacity: 0.5 }), 0, 0.72, 0);
  root.add(spellBase(c2), mound, stones, arm, hand, wisp);
  return { root, parts: { torso: stones }, gait: 'static', height: 1.2 };
}

function buildSpellDelivery(v) {
  const [c1, c2] = v.palette;
  const root = new THREE.Group();
  const crate = part(box(0.62, 0.5, 0.62), mat(c1, { rough: 0.7 }), 0, 0.35, 0);
  const strapA = part(box(0.66, 0.08, 0.1), mat(c2, { metal: 0.6 }), 0, 0.45, 0);
  const strapB = part(box(0.1, 0.08, 0.66), mat(c2, { metal: 0.6 }), 0, 0.45, 0);
  const chute = part(sphere(0.55, 14, { }), mat('#e8eef8', { opacity: 0.85 }), 0, 1.2, 0);
  chute.scale.set(1, 0.55, 1);
  const cords = group();
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + 0.7;
    cords.add(part(cyl(0.012, 0.012, 0.5, 4), mat('#cfd6e0'), Math.cos(a) * 0.34, 0.86, Math.sin(a) * 0.34));
  }
  root.add(spellBase(c2), crate, strapA, strapB, cords, chute);
  return { root, parts: { torso: crate }, gait: 'static', height: 1.6 };
}

function buildSpellClone(v) {
  const [c1, c2] = v.palette;
  const root = new THREE.Group();
  const a = part(capsule(0.2, 0.42, 8), mat(c1, { emissive: c1, emissiveIntensity: 1.2, opacity: 0.7 }), -0.22, 0.55, 0);
  const b = part(capsule(0.2, 0.42, 8), mat(c2, { emissive: c2, emissiveIntensity: 1.2, opacity: 0.5 }), 0.22, 0.55, 0.12);
  const spark = part(torus(0.44, 0.04, 12), mat('#e8f8ff', { emissive: '#7de3ff', emissiveIntensity: 2 }), 0, 0.55, 0);
  spark.rotation.x = 1.2;
  root.add(spellBase(c1), a, b, spark);
  return { root, parts: { torso: a }, gait: 'static', height: 1.2 };
}

Object.assign(BUILDERS, {
  spell_zap: buildSpellZap,
  spell_snowball: buildSpellSnowball,
  spell_arrows: buildSpellArrows,
  spell_log: buildSpellLog,
  spell_barrel: buildSpellBarrel,
  spell_fireball: buildSpellFireball,
  spell_rocket: buildSpellRocket,
  spell_lightning: buildSpellLightning,
  spell_freeze: buildSpellFreeze,
  spell_tornado: buildSpellTornado,
  spell_gobbarrel: buildSpellGobBarrel,
  spell_graveyard: buildSpellGraveyard,
  spell_delivery: buildSpellDelivery,
  spell_clone: buildSpellClone,
  spell_poison: (v) => buildSpellCloud(v, { glow: 1.1, opacity: 0.7, skull: true }),
  spell_quake: (v) => buildSpellCloud(v, { glow: 0.4, opacity: 0.85 }),
  spell_rage: (v) => buildSpellCloud(v, { glow: 1.6, opacity: 0.7 }),
});
