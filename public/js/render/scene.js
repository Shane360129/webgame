/**
 * 3D 場景：競技場、鏡頭模式、實體管理與特效。
 *
 * 鏡頭與規則刻意解耦（查核文件第 7 節第 5 點）：
 * 同一份對戰資料可以用三種鏡頭觀看，規則完全不變。
 */
import * as THREE from '../../vendor/three.module.js';
import { box, sphere, cyl, cone, torus, mat, part, group, shade } from './kit.js';
import { buildCardModel, buildCrownTower } from './models.js';
import { initAnimState, animateModel, triggerAttack, triggerHurt, prepareMaterials, initColorHelpers } from './animate.js';

initColorHelpers(THREE);

export const CAMERA_MODES = {
  classic: {
    key: 'classic', nameZh: '原作式固定視角',
    desc: '固定俯角、不可旋轉，與手機原作最接近的取景。',
  },
  orbit: {
    key: 'orbit', nameZh: '可旋轉視角',
    desc: '可拖曳環繞與縮放，用來檢視模型與走位。',
  },
  spectator: {
    key: 'spectator', nameZh: '近距離觀戰',
    desc: '貼近地面追焦戰鬥重心，用來檢查動作與碰撞。',
  },
};

const ARENA_W = 18;
const ARENA_L = 32;
const RIVER = [15.4, 16.6];
const BRIDGES = [3.5, 14.5];

export class ArenaScene {
  constructor(canvas, { quality = 'high' } = {}) {
    this.canvas = canvas;
    this.quality = quality;
    this.viewSide = 0;
    this.mode = 'classic';
    this.orbit = { yaw: 0, pitch: 0.95, dist: 46 };
    this.units = new Map();
    this.towers = new Map();
    this.effects = [];
    this.projectiles = new Map();
    this.auras = new Map();
    this.catalogue = null;
    this.clock = new THREE.Clock();
    this.frameTimes = [];
    this.fps = 0;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor('#0d1220');
    this.renderer.shadowMap.enabled = quality === 'high';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#0d1220', 34, 62);

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.5, 160);
    this.world = new THREE.Group();
    this.scene.add(this.world);

    this.buildLights();
    this.buildArena();

    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.tmpVec = new THREE.Vector3();

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setQuality(q) {
    this.quality = q;
    this.renderer.shadowMap.enabled = q === 'high';
    this.renderer.setPixelRatio(q === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : 1.5));
    if (this.dirLight) this.dirLight.castShadow = q === 'high';
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || this.canvas.parentElement?.clientWidth || 360;
    const h = this.canvas.clientHeight || this.canvas.parentElement?.clientHeight || 640;
    this.renderer.setPixelRatio(this.quality === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 2 : 1.5));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._fitKey = null;
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight('#bfd8ff', '#2a2f3f', 1.05));
    const dir = new THREE.DirectionalLight('#fff4e0', 1.5);
    dir.position.set(-12, 26, -8);
    dir.castShadow = this.quality === 'high';
    dir.shadow.mapSize.set(1024, 1024);
    const d = 22;
    dir.shadow.camera.left = -d; dir.shadow.camera.right = d;
    dir.shadow.camera.top = d; dir.shadow.camera.bottom = -d;
    dir.shadow.camera.far = 70;
    dir.shadow.bias = -0.0012;
    this.scene.add(dir);
    this.dirLight = dir;
    const rim = new THREE.DirectionalLight('#7db8ff', 0.5);
    rim.position.set(10, 8, 18);
    this.scene.add(rim);
  }

  /** 場地：兩側草地、河道、兩座橋、外圍看台。 */
  buildArena() {
    const g = new THREE.Group();
    const toWorld = (x, z) => [x - ARENA_W / 2, z - ARENA_L / 2];

    const grassA = new THREE.Mesh(
      new THREE.BoxGeometry(ARENA_W, 0.4, RIVER[0]),
      mat('#4f9d4a', { rough: 0.95 }),
    );
    grassA.position.set(0, -0.2, RIVER[0] / 2 - ARENA_L / 2);
    grassA.receiveShadow = true;

    const grassB = new THREE.Mesh(
      new THREE.BoxGeometry(ARENA_W, 0.4, ARENA_L - RIVER[1]),
      mat('#57a751', { rough: 0.95 }),
    );
    grassB.position.set(0, -0.2, (ARENA_L + RIVER[1]) / 2 - ARENA_L / 2);
    grassB.receiveShadow = true;

    const water = new THREE.Mesh(
      new THREE.BoxGeometry(ARENA_W, 0.3, RIVER[1] - RIVER[0]),
      mat('#2f7fbf', { rough: 0.15, metal: 0.25, opacity: 0.92 }),
    );
    water.position.set(0, -0.26, 0);
    this.water = water;

    const bank = new THREE.Mesh(
      new THREE.BoxGeometry(ARENA_W, 0.16, RIVER[1] - RIVER[0] + 0.5),
      mat('#c9b48a', { rough: 0.95 }),
    );
    bank.position.set(0, -0.3, 0);

    g.add(grassA, grassB, bank, water);

    // 格線（讓部署格看得出來）
    const grid = new THREE.LineSegments(
      gridGeometry(ARENA_W, ARENA_L),
      new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.055 }),
    );
    grid.position.y = 0.012;
    g.add(grid);

    // 橋
    for (const bx of BRIDGES) {
      const [wx] = toWorld(bx, 0);
      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(2.7, 0.22, RIVER[1] - RIVER[0] + 1.4),
        mat('#a8763f', { rough: 0.85 }),
      );
      deck.position.set(wx, 0.05, 0);
      deck.receiveShadow = true;
      g.add(deck);
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 0.34, RIVER[1] - RIVER[0] + 1.4),
          mat('#8a5f33', { rough: 0.85 }),
        );
        rail.position.set(wx + side * 1.28, 0.26, 0);
        g.add(rail);
        for (const pz of [-1.0, 0, 1.0]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 0.22), mat('#6f4a28'));
          post.position.set(wx + side * 1.28, 0.3, pz);
          g.add(post);
        }
      }
    }

    // 外圍看台與圍牆
    const wallMat = mat('#3a4a63', { rough: 0.9 });
    for (const [sx, sz, w, d] of [
      [0, -ARENA_L / 2 - 1.2, ARENA_W + 4, 2],
      [0, ARENA_L / 2 + 1.2, ARENA_W + 4, 2],
      [-ARENA_W / 2 - 1.2, 0, 2, ARENA_L + 4],
      [ARENA_W / 2 + 1.2, 0, 2, ARENA_L + 4],
    ]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, d), wallMat);
      m.position.set(sx, 0.15, sz);
      m.receiveShadow = true;
      g.add(m);
    }
    for (let i = 0; i < 26; i += 1) {
      const t = i / 26;
      const crowdL = new THREE.Mesh(sphere(0.3, 6), mat(i % 2 ? '#e8c39e' : '#c98a6a'));
      crowdL.position.set(-ARENA_W / 2 - 1.2, 0.95, -ARENA_L / 2 + t * ARENA_L);
      const crowdR = crowdL.clone();
      crowdR.position.x = ARENA_W / 2 + 1.2;
      g.add(crowdL, crowdR);
    }

    // 部署區指示（動態顯示）
    const zoneMat = new THREE.MeshBasicMaterial({ color: '#5ad0ff', transparent: true, opacity: 0.0, depthWrite: false });
    const zone = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_W, 1), zoneMat);
    zone.rotation.x = -Math.PI / 2;
    zone.position.y = 0.02;
    this.deployZone = zone;
    g.add(zone);

    // 部署預覽環
    const ph = new THREE.Mesh(torus(0.9, 0.08, 16), new THREE.MeshBasicMaterial({ color: '#7de3ff', transparent: true, opacity: 0 }));
    ph.rotation.x = -Math.PI / 2;
    ph.position.y = 0.05;
    this.placeholder = ph;
    g.add(ph);

    const spellRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 40), new THREE.MeshBasicMaterial({ color: '#ffb03a', transparent: true, opacity: 0, side: THREE.DoubleSide }));
    spellRing.rotation.x = -Math.PI / 2;
    spellRing.position.y = 0.04;
    this.spellRing = spellRing;
    g.add(spellRing);

    this.world.add(g);
    this.arenaGroup = g;
  }

  toWorld(x, z) { return [x - ARENA_W / 2, z - ARENA_L / 2]; }

  setViewSide(side) {
    this.viewSide = side;
    this.world.rotation.y = side === 1 ? Math.PI : 0;
  }

  setMode(mode) {
    if (CAMERA_MODES[mode]) this.mode = mode;
  }

  // ── 實體同步 ──

  setCatalogue(cat) { this.catalogue = cat; }

  syncTowers(list) {
    for (const t of list) {
      let m = this.towers.get(t.i);
      if (!m) {
        m = buildCrownTower({ kind: t.k, side: t.s, towerTroop: t.tt, viewSide: this.viewSide });
        const [wx, wz] = this.toWorld(t.x, t.z);
        m.root.position.set(wx, 0, wz);
        m.root.rotation.y = t.s === 0 ? 0 : Math.PI;
        m.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        prepareMaterials(m);
        m.baseScale = 1;
        initAnimState(m, Math.random() * 6);
        m.state.spawn = 0;
        m.root.scale.setScalar(1);
        this.world.add(m.root);
        this.towers.set(t.i, m);
      }
      m.snapshot = t;
      m.root.visible = t.al === 1;
      if (t.al === 0 && !m.rubble) {
        m.rubble = true;
        m.root.visible = true;
        m.root.scale.y = 0.35;
        m.root.position.y = -0.25;
        if (m.parts.figure) m.parts.figure.visible = false;
        if (m.parts.occupant) m.parts.occupant.visible = false;
      }
      if (m.parts.turret && t.al === 1) {
        const active = t.k !== 'king' || t.a === 1;
        m.parts.turret.visible = true;
        if (m.parts.figure) m.parts.figure.visible = true;
        m.dim = !active;
      }
    }
  }

  syncUnits(list, dt) {
    const seen = new Set();
    for (const u of list) {
      seen.add(u.i);
      let m = this.units.get(u.i);
      if (!m) {
        const card = this.catalogue?.cards?.[u.c];
        if (!card) continue;
        m = buildCardModel(card, u.s, u.e === 1, this.viewSide);
        // baseScale 必須是「建模後的實際縮放」，否則出生動畫播完會把單位縮小。
        m.baseScale = m.root.scale.x;
        m.hoverBase = m.flying ? (m.hover || 1.1) * m.baseScale : 0;
        m.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
        prepareMaterials(m);
        initAnimState(m);
        const [wx, wz] = this.toWorld(u.x, u.z);
        m.root.position.set(wx, m.hoverBase, wz);
        m.target = new THREE.Vector3(wx, m.hoverBase, wz);
        this.world.add(m.root);
        this.units.set(u.i, m);
      }
      const [wx, wz] = this.toWorld(u.x, u.z);
      m.target.set(wx, m.hoverBase, wz);
      m.snapshot = u;

      // 位置內插（快照 10 Hz，畫面 60 Hz）
      const k = Math.min(1, dt * 14);
      m.root.position.x += (m.target.x - m.root.position.x) * k;
      m.root.position.z += (m.target.z - m.root.position.z) * k;
      // 朝向用場地座標即可：整個 world 群組在 viewSide === 1 時已經轉了 180 度。
      m.root.rotation.y = lerpAngle(m.root.rotation.y, u.f, Math.min(1, dt * 10));

      if (u.hp < (m.lastHp ?? u.hp)) triggerHurt(m);
      m.lastHp = u.hp;
      if (u.an === 'attack' && m.lastAnim !== 'attack') triggerAttack(m);
      m.lastAnim = u.an;

      animateModel(m, u, dt);
      if (u.d === 1) m.root.visible = true;
    }

    for (const [id, m] of this.units) {
      if (seen.has(id)) continue;
      m.gone = (m.gone || 0) + dt;
      if (m.snapshot) animateModel(m, { ...m.snapshot, al: 0 }, dt);
      if (m.gone > 1.1) {
        this.world.remove(m.root);
        disposeModel(m);
        this.units.delete(id);
      }
    }
  }

  syncProjectiles(list) {
    const seen = new Set();
    for (const p of list) {
      seen.add(p.i);
      let m = this.projectiles.get(p.i);
      if (!m) {
        m = makeProjectileMesh(p);
        this.world.add(m);
        this.projectiles.set(p.i, m);
      }
      const [wx, wz] = this.toWorld(p.x, p.z);
      const arc = p.k === 'rolling' ? 0.32 : 0.85;
      m.position.set(wx, arc, wz);
      if (p.k === 'rolling') m.rotation.x -= 0.35;
    }
    for (const [id, m] of this.projectiles) {
      if (seen.has(id)) continue;
      this.world.remove(m);
      this.projectiles.delete(id);
    }
  }

  syncAreas(list) {
    const seen = new Set();
    for (const a of list) {
      seen.add(a.i);
      let m = this.auras.get(a.i);
      if (!m) {
        m = makeAuraMesh(a);
        this.world.add(m);
        this.auras.set(a.i, m);
      }
      const [wx, wz] = this.toWorld(a.x, a.z);
      m.position.set(wx, 0.06, wz);
      m.userData.progress = a.p;
    }
    for (const [id, m] of this.auras) {
      if (seen.has(id)) continue;
      this.world.remove(m);
      this.auras.delete(id);
    }
  }

  // ── 特效 ──

  spawnEffect(ev) {
    switch (ev.type) {
      case 'impact': {
        const [wx, wz] = this.toWorld(ev.x, ev.z);
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.1, ev.radius || 1.5, 28),
          new THREE.MeshBasicMaterial({ color: colorForCard(ev.card), transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(wx, 0.08, wz);
        this.world.add(ring);
        this.effects.push({ obj: ring, life: 0, max: 0.5, kind: 'ring', radius: ev.radius || 1.5 });
        const flash = new THREE.PointLight(colorForCard(ev.card), 6, 8);
        flash.position.set(wx, 1, wz);
        this.world.add(flash);
        this.effects.push({ obj: flash, life: 0, max: 0.3, kind: 'light' });
        break;
      }
      case 'bolt': {
        const [wx, wz] = this.toWorld(ev.x, ev.z);
        const bolt = new THREE.Mesh(cyl(0.06, 0.02, 8, 5), new THREE.MeshBasicMaterial({ color: '#eaf6ff', transparent: true, opacity: 0.95 }));
        bolt.position.set(wx, 4, wz);
        this.world.add(bolt);
        this.effects.push({ obj: bolt, life: 0, max: 0.28, kind: 'fade' });
        break;
      }
      case 'towerDown': {
        const t = this.towers.get(ev.id);
        if (t) {
          const p = t.root.position;
          for (let i = 0; i < 12; i += 1) {
            const chunk = new THREE.Mesh(box(0.4, 0.4, 0.4), mat('#d8d2c4'));
            chunk.position.set(p.x + (Math.random() - 0.5) * 2, 1 + Math.random() * 2, p.z + (Math.random() - 0.5) * 2);
            this.world.add(chunk);
            this.effects.push({
              obj: chunk, life: 0, max: 1.4, kind: 'debris',
              vel: new THREE.Vector3((Math.random() - 0.5) * 4, 3 + Math.random() * 3, (Math.random() - 0.5) * 4),
            });
          }
        }
        break;
      }
      case 'riverJump':
      case 'jump':
      case 'dash': {
        const [wx, wz] = this.toWorld(ev.x, ev.z);
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.2, 0.8, 20),
          new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(wx, 0.1, wz);
        this.world.add(ring);
        this.effects.push({ obj: ring, life: 0, max: 0.4, kind: 'ring', radius: 1.6 });
        break;
      }
      default: break;
    }
  }

  updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i -= 1) {
      const e = this.effects[i];
      e.life += dt;
      const t = e.life / e.max;
      if (t >= 1) {
        this.world.remove(e.obj);
        if (e.obj.geometry) e.obj.geometry.dispose?.();
        this.effects.splice(i, 1);
        continue;
      }
      if (e.kind === 'ring') {
        e.obj.scale.setScalar(0.3 + t * 1.4);
        e.obj.material.opacity = 0.85 * (1 - t);
      } else if (e.kind === 'light') {
        e.obj.intensity = 6 * (1 - t);
      } else if (e.kind === 'fade') {
        e.obj.material.opacity = 0.95 * (1 - t);
      } else if (e.kind === 'debris') {
        e.vel.y -= 14 * dt;
        e.obj.position.addScaledVector(e.vel, dt);
        e.obj.rotation.x += dt * 4;
        e.obj.rotation.z += dt * 3;
      }
    }
    for (const [, m] of this.auras) {
      m.rotation.y += dt * (m.userData.spin || 1.2);
      if (m.material) m.material.opacity = 0.28 + Math.sin(performance.now() / 300) * 0.06;
    }
    if (this.water) this.water.position.y = -0.26 + Math.sin(performance.now() / 700) * 0.02;
  }

  // ── 部署輔助 ──

  showDeployHint(bounds, spellRadius, x, z, valid) {
    if (!bounds) {
      this.placeholder.material.opacity = 0;
      this.spellRing.material.opacity = 0;
      this.deployZone.material.opacity = 0;
      return;
    }
    const [lo, hi] = bounds;
    const depth = hi - lo;
    this.deployZone.scale.set(1, depth, 1);
    this.deployZone.position.z = (lo + hi) / 2 - ARENA_L / 2;
    this.deployZone.material.opacity = 0.1;

    if (x == null) return;
    const [wx, wz] = this.toWorld(x, z);
    if (spellRadius) {
      this.spellRing.position.set(wx, 0.04, wz);
      this.spellRing.scale.setScalar(spellRadius);
      this.spellRing.material.opacity = 0.85;
      this.spellRing.material.color.set(valid ? '#ffb03a' : '#ff4a4a');
      this.placeholder.material.opacity = 0;
    } else {
      this.placeholder.position.set(wx, 0.05, wz);
      this.placeholder.material.opacity = 0.9;
      this.placeholder.material.color.set(valid ? '#7de3ff' : '#ff4a4a');
      this.spellRing.material.opacity = 0;
    }
  }

  /** 螢幕座標 → 場地 tile 座標。 */
  pickGround(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return null;
    this.world.worldToLocal(hit);
    return { x: hit.x + ARENA_W / 2, z: hit.z + ARENA_L / 2 };
  }

  // ── 鏡頭 ──

  /**
   * 固定視角的取景：把場地四個角投影到畫面上，
   * 反覆調整距離與注視點，直到整個場地落在
   * 「上方 HUD 與下方手牌之間」的可用帶狀區域內。
   *
   * 這樣直向 / 橫向、不同機型都能看到完整場地，
   * 不必為每個比例硬寫數字。
   */
  classicFit() {
    const key = `${this.camera.aspect.toFixed(3)}|${this.camera.fov}`;
    if (this._fitKey === key && this._fit) return this._fit;

    const pitch = 1.02;                       // 約 58 度俯角
    const pad = 1.15;                         // 外圍看台（允許近端稍微出血）
    const halfW = ARENA_W / 2 + pad;
    const halfL = ARENA_L / 2 + pad;
    const corners = [
      new THREE.Vector3(-halfW, 0, -halfL), new THREE.Vector3(halfW, 0, -halfL),
      new THREE.Vector3(-halfW, 0, halfL), new THREE.Vector3(halfW, 0, halfL),
    ];

    // 可用帶（NDC）：留給上方計時列與下方聖水 / 手牌。
    const BAND = { x0: -1.06, x1: 1.06, y0: -0.62, y1: 0.68 };

    const probe = new THREE.PerspectiveCamera(this.camera.fov, this.camera.aspect, 0.5, 400);
    let d = 40;
    let targetZ = 0;

    for (let i = 0; i < 14; i += 1) {
      probe.position.set(0, Math.sin(pitch) * d, -Math.cos(pitch) * d + targetZ);
      probe.lookAt(0, 0, targetZ);
      probe.updateMatrixWorld(true);
      probe.updateProjectionMatrix();

      let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
      for (const c of corners) {
        const v = c.clone().project(probe);
        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
      }
      const needX = (maxX - minX) / (BAND.x1 - BAND.x0);
      const needY = (maxY - minY) / (BAND.y1 - BAND.y0);
      const need = Math.max(needX, needY);

      // 距離依超出比例調整；注視點沿 z 移動，把投影推到帶狀區中央。
      d *= 1 + (need - 1) * 0.8;
      const centreY = (minY + maxY) / 2;
      const wantY = (BAND.y0 + BAND.y1) / 2;
      targetZ += (centreY - wantY) * d * 0.22;
      targetZ = Math.max(-6, Math.min(6, targetZ));
      if (Math.abs(need - 1) < 0.004 && Math.abs(centreY - wantY) < 0.004) break;
    }

    this._fitKey = key;
    this._fit = {
      distance: d,
      position: new THREE.Vector3(0, Math.sin(pitch) * d, -Math.cos(pitch) * d + targetZ),
      lookAt: new THREE.Vector3(0, 0, targetZ),
    };
    return this._fit;
  }


  updateCamera(dt, focus) {
    const cam = this.camera;
    if (this.mode === 'classic') {
      const fit = this.classicFit();
      cam.position.lerp(fit.position, Math.min(1, dt * 4));
      this.classicLook = this.classicLook || fit.lookAt.clone();
      this.classicLook.lerp(fit.lookAt, Math.min(1, dt * 4));
      cam.lookAt(this.classicLook);
      this.scene.fog.near = fit.distance * 0.8;
      this.scene.fog.far = fit.distance * 2.6;
    } else if (this.mode === 'orbit') {
      const { yaw, pitch, dist } = this.orbit;
      this.scene.fog.near = dist * 0.8;
      this.scene.fog.far = dist * 3.0;
      const y = Math.sin(pitch) * dist;
      const r = Math.cos(pitch) * dist;
      cam.position.set(Math.sin(yaw) * r, y, -Math.cos(yaw) * r);
      cam.lookAt(0, 0, 0);
    } else {
      this.scene.fog.near = 22;
      this.scene.fog.far = 70;
      // 近距離觀戰：貼近但不要鑽進模型裡。
      const f = focus || { x: 0, z: -4 };
      const target = new THREE.Vector3(f.x, 1.6, f.z);
      const desired = new THREE.Vector3(f.x * 0.55, 7.2, f.z - 13.5);
      cam.position.lerp(desired, Math.min(1, dt * 2.2));
      this.spectatorLook = this.spectatorLook || target.clone();
      this.spectatorLook.lerp(target, Math.min(1, dt * 3));
      cam.lookAt(this.spectatorLook);
    }
  }

  render(dt, focus) {
    this.updateCamera(dt, focus);
    this.updateEffects(dt);
    this.renderer.render(this.scene, this.camera);

    this.frameTimes.push(dt);
    if (this.frameTimes.length > 60) this.frameTimes.shift();
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.fps = avg > 0 ? Math.round(1 / avg) : 0;
  }

  clearEntities() {
    for (const [, m] of this.units) { this.world.remove(m.root); disposeModel(m); }
    this.units.clear();
    for (const [, m] of this.towers) { this.world.remove(m.root); disposeModel(m); }
    this.towers.clear();
    for (const [, m] of this.projectiles) this.world.remove(m);
    this.projectiles.clear();
    for (const [, m] of this.auras) this.world.remove(m);
    this.auras.clear();
    for (const e of this.effects) this.world.remove(e.obj);
    this.effects = [];
  }
}

// ── 輔助 ──

function gridGeometry(w, l) {
  const pts = [];
  for (let x = 0; x <= w; x += 1) pts.push(x - w / 2, 0, -l / 2, x - w / 2, 0, l / 2);
  for (let z = 0; z <= l; z += 1) pts.push(-w / 2, 0, z - l / 2, w / 2, 0, z - l / 2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return geo;
}

const PROJ_COLORS = {
  the_log: '#8a6a3b', barbarian_barrel: '#8a6a3b',
  fireball: '#ff8a3a', rocket: '#e05a3a', arrows: '#c9a24a',
  zap: '#7de3ff', lightning: '#f0e07a', giant_snowball: '#e8f4ff',
  freeze: '#8fd0e8', poison: '#8fd06a', earthquake: '#a08050',
  goblin_barrel: '#8a6a3b', graveyard: '#6f6f8a', royal_delivery: '#3f5f9c',
};

function colorForCard(card) {
  return PROJ_COLORS[card] || '#ffd07a';
}

function makeProjectileMesh(p) {
  if (p.k === 'rolling') {
    const m = new THREE.Mesh(cyl(0.42, 0.42, 2.4, 12), mat('#7a5a3a', { rough: 0.9 }));
    m.rotation.z = Math.PI / 2;
    m.castShadow = true;
    return m;
  }
  const color = colorForCard(p.c);
  const m = new THREE.Mesh(sphere(0.16, 8), new THREE.MeshBasicMaterial({ color }));
  return m;
}

const AURA_COLORS = { poison: '#8fd06a', rage: '#c060d0', tornado: '#9fb8d0', earthquake: '#a08050', graveyard: '#6f6f8a', clone: '#7de3ff' };

function makeAuraMesh(a) {
  const color = AURA_COLORS[a.c] || '#9fb8d0';
  const geo = new THREE.CylinderGeometry(a.r, a.r, 0.08, 32, 1, true);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false,
  }));
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(a.r, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, depthWrite: false }),
  );
  disc.rotation.x = -Math.PI / 2;
  m.add(disc);
  m.userData.spin = a.c === 'tornado' ? 6 : 1.2;
  return m;
}

function disposeModel(m) {
  m.root.traverse((o) => {
    if (o.isMesh) {
      if (o.material?.dispose && o.material.userData?.baseColor) o.material.dispose();
    }
  });
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export { ARENA_W, ARENA_L, RIVER, BRIDGES };
