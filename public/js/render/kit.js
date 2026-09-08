/**
 * 幾何／材質工具箱。
 *
 * 所有角色都是程式化建模（原創幾何），不使用任何官方素材檔。
 * 每個模型都有一致的本地座標：原點在腳底，+Z 為面朝方向。
 */
import * as THREE from '../../vendor/three.module.js';

const geoCache = new Map();
const matCache = new Map();

function key(...a) { return a.join('|'); }

export function box(w, h, d) {
  const k = key('box', w, h, d);
  if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(k);
}
export function sphere(r, s = 12) {
  const k = key('sph', r, s);
  if (!geoCache.has(k)) geoCache.set(k, new THREE.SphereGeometry(r, s, Math.max(6, s / 2)));
  return geoCache.get(k);
}
export function cyl(rt, rb, h, s = 12) {
  const k = key('cyl', rt, rb, h, s);
  if (!geoCache.has(k)) geoCache.set(k, new THREE.CylinderGeometry(rt, rb, h, s));
  return geoCache.get(k);
}
export function cone(r, h, s = 12) {
  const k = key('con', r, h, s);
  if (!geoCache.has(k)) geoCache.set(k, new THREE.ConeGeometry(r, h, s));
  return geoCache.get(k);
}
export function capsule(r, h, s = 8) {
  const k = key('cap', r, h, s);
  if (!geoCache.has(k)) geoCache.set(k, new THREE.CapsuleGeometry(r, h, s, s * 2));
  return geoCache.get(k);
}
export function torus(r, t, s = 10) {
  const k = key('tor', r, t, s);
  if (!geoCache.has(k)) geoCache.set(k, new THREE.TorusGeometry(r, t, s, s * 2));
  return geoCache.get(k);
}

export function mat(color, opts = {}) {
  const k = key('m', color, opts.metal || 0, opts.rough ?? 0.72, opts.emissive || 0, opts.opacity ?? 1, opts.flat ? 1 : 0);
  if (!matCache.has(k)) {
    matCache.set(k, new THREE.MeshStandardMaterial({
      color,
      metalness: opts.metal ?? 0.05,
      roughness: opts.rough ?? 0.72,
      emissive: opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color(0x000000),
      emissiveIntensity: opts.emissiveIntensity ?? 0.9,
      transparent: (opts.opacity ?? 1) < 1,
      opacity: opts.opacity ?? 1,
      flatShading: !!opts.flat,
    }));
  }
  return matCache.get(k);
}

/** 建立一個網格並定位。 */
export function part(geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = false;
  return m;
}

export function group(...children) {
  const g = new THREE.Group();
  for (const c of children) if (c) g.add(c);
  return g;
}

/** 讓一個群組繞著某個樞紐旋轉：回傳外層樞紐群組。 */
export function pivot(child, px, py, pz) {
  const g = new THREE.Group();
  g.position.set(px, py, pz);
  child.position.sub(new THREE.Vector3(px, py, pz));
  g.add(child);
  return g;
}

export const shade = (hex, f) => {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, f);
  return `#${c.getHexString()}`;
};

export { THREE };
