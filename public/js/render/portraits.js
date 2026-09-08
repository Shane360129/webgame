/**
 * 卡圖產生器。
 *
 * 卡面不用 Emoji、也不用外部圖檔，而是**直接把該卡的 3D 模型渲染成縮圖**。
 * 這樣「卡圖與模型一致」是結構上保證的，不是靠人工對齊
 * （查核文件第 8 節「視覺可信」門檻）。
 */
import * as THREE from '../../vendor/three.module.js';
import { buildCardModel } from './models.js';

const cache = new Map();
let renderer = null;
let scene = null;
let camera = null;

function ensure() {
  if (renderer) return;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 320;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(256, 320, false);
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#dceaff', '#3a3a4a', 1.5));
  const key = new THREE.DirectionalLight('#fff4e0', 2.0);
  key.position.set(-3, 6, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#8fc0ff', 1.0);
  rim.position.set(4, 3, -4);
  scene.add(rim);

  camera = new THREE.PerspectiveCamera(30, 256 / 320, 0.1, 60);
}

/**
 * 產生一張卡的縮圖 dataURL。
 * @param {object} card 目錄項目
 * @param {object} opts { side, evolved, angle }
 */
export function cardPortrait(card, opts = {}) {
  const key = `${card.key}|${opts.evolved ? 1 : 0}|${opts.angle ?? 'f'}`;
  if (cache.has(key)) return cache.get(key);
  ensure();

  const holder = new THREE.Group();
  let model;
  try {
    model = buildCardModel(card, 0, !!opts.evolved);
  } catch {
    return null;
  }
  if (model.ring) model.ring.visible = false;
  holder.add(model.root);
  scene.add(holder);

  // 依模型高度自動取景
  const bbox = new THREE.Box3().setFromObject(model.root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  bbox.getSize(size);
  bbox.getCenter(center);
  const maxDim = Math.max(size.x, size.y * 0.78, size.z);
  const dist = maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360)) * 2.35;

  // 正面帶一點四分之三角度比較好看；側面與背面則是正的 90 度 / 180 度，
  // 這樣三視圖之間的差異一眼可辨（查核文件第 7 節第 2 點的參考板）。
  const angles = { f: 0.42, s: Math.PI / 2, b: Math.PI };
  holder.rotation.y = angles[opts.angle] ?? 0.42;

  camera.position.set(0, center.y + maxDim * 0.28, dist);
  camera.lookAt(0, center.y, 0);

  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');

  scene.remove(holder);
  cache.set(key, url);
  return url;
}

/** 三視角參考板：正面／側面／背面，對應查核文件第 7 節第 2 點。 */
export function referenceSheet(card) {
  return {
    front: cardPortrait(card, { angle: 'f' }),
    side: cardPortrait(card, { angle: 's' }),
    back: cardPortrait(card, { angle: 'b' }),
  };
}

export function clearPortraitCache() { cache.clear(); }
