// 场景搭建：海、小岛基地、农场、高台草场（可割的草）、建筑、地面格子、割草机模型
import * as THREE from 'three';
import { CELL, FIELD_Y, RAMP, ISLAND, FARM_Z, GRASS, UNITS_PER_CELL } from './config.js';

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
export const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
export function box(w, h, d, c, x, y, z, parent, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'number' ? lam(c) : c);
  m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
function cyl(rt, rb, h, c, x, y, z, parent, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof c === 'number' ? lam(c) : c);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

// ---------- 画布贴图 ----------
function waterTexture() {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), img = g.createImageData(S, S), r = rng(7);
  const pts = []; for (let k = 0; k < 26; k++) pts.push([r() * S, r() * S]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let d1 = 1e9, d2 = 1e9;
    for (const [px, py] of pts) {
      let dx = Math.abs(x - px); dx = Math.min(dx, S - dx);
      let dy = Math.abs(y - py); dy = Math.min(dy, S - dy);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    const e = d2 - d1, line = e < 2.2 ? 1 - e / 2.2 : 0, p = (y * S + x) * 4;
    const shade = 1 - Math.min(d1 / 60, 1) * 0.07;
    img.data[p] = (41 + line * 150) * shade; img.data[p + 1] = (170 + line * 70) * shade; img.data[p + 2] = (240 + line * 15); img.data[p + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function padTexture(w, h, fill) {
  const k = 64, cv = document.createElement('canvas'); cv.width = w * k; cv.height = h * k;
  const g = cv.getContext('2d');
  const r = 0.55 * k, m = 0.18 * k;
  const rr = (x, y, W, H) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + W, y, x + W, y + H, r); g.arcTo(x + W, y + H, x, y + H, r); g.arcTo(x, y + H, x, y, r); g.arcTo(x, y, x + W, y, r); g.closePath(); };
  g.fillStyle = fill; rr(m, m, cv.width - 2 * m, cv.height - 2 * m); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 0.2 * k; g.setLineDash([0.55 * k, 0.32 * k]); rr(m, m, cv.width - 2 * m, cv.height - 2 * m); g.stroke();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function textPlane(text, size = 1, opts = {}) {
  const px = 96, cv = document.createElement('canvas'), g = cv.getContext('2d');
  const font = `900 ${px}px "PingFang SC","Microsoft YaHei","Heiti SC",sans-serif`;
  g.font = font;
  const lines = String(text).split('\n');
  const w = Math.max(...lines.map((l) => g.measureText(l).width)) + px * 0.6;
  cv.width = Math.ceil(w); cv.height = Math.ceil(px * 1.25 * lines.length + px * 0.3);
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = px * 0.16; g.strokeStyle = opts.stroke || '#1b1b1b'; g.fillStyle = opts.color || '#fff';
  lines.forEach((l, i) => { const y = px * 0.75 + i * px * 1.25; g.strokeText(l, cv.width / 2, y); g.fillText(l, cv.width / 2, y); });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const H = size * lines.length * 1.1, W = H * cv.width / cv.height;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.userData.canvas = cv;
  return m;
}

// ---------- 静态世界 ----------
export class World {
  constructor(scene) {
    this.scene = scene;
    this.pads = {};          // name -> {x0,x1,z0,z1, mesh}
    this.blockers = [];      // 不可通行的矩形
    this.anim = [];          // 每帧调用的小动画
    this.buildWater();
    this.buildIsland();
    this.buildBuildings();
  }

  buildWater() {
    this.waterTex = waterTexture(); this.waterTex.repeat.set(26, 26);
    const w = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ map: this.waterTex }));
    w.rotation.x = -Math.PI / 2; w.position.y = -1.2; w.position.z = -20;
    this.scene.add(w);
    this.anim.push((t) => { this.waterTex.offset.set(Math.sin(t * 0.13) * 0.02, t * 0.004); });
  }

  buildIsland() {
    const s = this.scene, I = ISLAND;
    // 基地（水泥）+ 农场（草坪）
    box(I.x1 - I.x0, 1.2, FARM_Z - I.z0, lam(0x8e99a2), 0, -0.6, (I.z0 + FARM_Z) / 2, s, false);
    box(I.x1 - I.x0, 1.2, I.z1 - FARM_Z, lam(0xbfe07a), 0, -0.6, (FARM_Z + I.z1) / 2, s, false);
    box(I.x1 - I.x0 + 0.4, 0.9, I.z1 - I.z0 + 0.4, lam(0x7a3f1c), 0, -0.85, (I.z0 + I.z1) / 2, s, false);
    // 农场边沿的石砖
    const stoneG = new THREE.BoxGeometry(0.55, 0.12, 0.42), stoneM = lam(0x9fb0b8);
    const stones = new THREE.InstancedMesh(stoneG, stoneM, 60); let k = 0; const mm = new THREE.Matrix4();
    for (let x = I.x0 + 0.5; x < I.x1 - 0.2 && k < 60; x += 0.62) { mm.makeTranslation(x, 0.06, FARM_Z); stones.setMatrixAt(k++, mm); }
    stones.count = k; stones.receiveShadow = true; s.add(stones);
    // 栅栏
    const posts = [];
    const fence = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2.4));
      for (let i = 0; i <= n; i++) posts.push([x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n]);
      const rail = box(len, 0.12, 0.12, 0xb86b2c, (x0 + x1) / 2, 0.75, (z0 + z1) / 2, s);
      rail.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    };
    fence(I.x0, 0.1, RAMP.x0 - 0.6, 0.1); fence(RAMP.x1 + 0.6, 0.1, I.x1, 0.1);
    fence(I.x0, 0.1, I.x0, I.z1); fence(I.x1, 0.1, I.x1, I.z1); fence(I.x0, I.z1, I.x1, I.z1);
    const pg = new THREE.BoxGeometry(0.28, 1.1, 0.28), pm = lam(0xa45d24);
    const pim = new THREE.InstancedMesh(pg, pm, posts.length);
    posts.forEach(([x, z], i) => { mm.makeTranslation(x, 0.55, z); pim.setMatrixAt(i, mm); });
    pim.castShadow = true; s.add(pim);
    // 坡道（木板）
    const ramp = new THREE.Group();
    const len = Math.hypot(RAMP.z1 - RAMP.z0, FIELD_Y), ang = Math.atan2(FIELD_Y, RAMP.z1 - RAMP.z0);
    const planks = 6;
    for (let i = 0; i < planks; i++) {
      const p = box(RAMP.x1 - RAMP.x0, 0.14, len / planks - 0.05, i % 2 ? 0xd98c4c : 0xe39a5a, 0, 0, -len / 2 + (i + 0.5) * len / planks, ramp);
      for (const sx of [-1, 1]) box(0.1, 0.02, 0.1, 0x3b2615, sx * (RAMP.x1 - 0.4), 0.08, p.position.z, ramp, false);
    }
    ramp.rotation.x = ang; ramp.position.set(0, FIELD_Y / 2, (RAMP.z0 + RAMP.z1) / 2);
    s.add(ramp);
    // 坡道上的绿色上箭头（新手引导）
    this.rampArrows = [];
    for (let i = 0; i < 3; i++) {
      const a = textPlane('︿', 0.9, { color: '#3cc23c', stroke: '#1d5e1d' });
      a.rotation.x = -Math.PI / 2 + ang; a.position.set(0, 0.15 + (i + 0.5) / 3 * FIELD_Y, RAMP.z1 - (i + 0.5) / 3 * (RAMP.z1 - RAMP.z0));
      s.add(a); this.rampArrows.push(a);
    }
  }

  pad(name, x, z, w, d, fill, label, labelSize = 0.8) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map: padTexture(w, d, fill), transparent: true }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02, z); m.receiveShadow = true;
    this.scene.add(m);
    let lab = null;
    if (label) { lab = textPlane(label, labelSize); lab.rotation.x = -Math.PI / 2; lab.position.set(x, 0.04, z); this.scene.add(lab); }
    this.pads[name] = { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, mesh: m, label: lab };
    return this.pads[name];
  }

  buildBuildings() {
    const s = this.scene;
    const blue = 0x5f98ae, blueD = 0x437a90, win = 0xdbeef5;
    // ---- 出售：料斗 + 筒仓 ----
    const sell = new THREE.Group(); sell.position.set(-11.6, 0, 5);
    box(3.2, 3.2, 4.2, blue, 0, 1.6, 0, sell);
    box(3.4, 0.3, 4.4, blueD, 0, 3.3, 0, sell);
    for (const z of [-1.2, 0, 1.2]) box(0.1, 0.7, 0.8, win, 1.62, 1.4, z, sell);
    box(0.1, 1.4, 1.1, 0xeef6f8, 1.62, 0.7, 0.9, sell);
    const hop = new THREE.Group(); hop.position.set(0.3, 3.5, -0.2); sell.add(hop);
    const Y = 0xf2c230;
    box(2.4, 0.25, 2.4, Y, 0, 0, 0, hop); box(2.4, 0.9, 0.25, Y, 0, 0.45, -1.1, hop); box(2.4, 0.9, 0.25, Y, 0, 0.45, 1.1, hop);
    box(0.25, 0.9, 2.4, Y, -1.1, 0.45, 0, hop); box(0.25, 0.9, 2.4, Y, 1.1, 0.45, 0, hop);
    this.hopper = new THREE.Vector3(-11.3, 4.2, 4.8);
    for (const [x, z] of [[-1.8, -2.6], [-1.8, -0.6]]) {
      cyl(1.0, 1.0, 5.2, 0x7dbad0, x, 2.6, z, sell, 14);
      cyl(0.4, 1.0, 0.8, 0x8ccbe0, x, 5.6, z, sell, 14);
    }
    s.add(sell);
    this.blockers.push({ x0: -14, x1: -9.9, z0: 1.6, z1: 7.4 });
    this.pad('sell', -7.2, 5, 4.6, 5, '#9a6773', '出售');

    // ---- 升级：房子 + 吊车 ----
    const up = new THREE.Group(); up.position.set(11.8, 0, 5);
    box(3, 4, 3.6, blue, 0, 2, 0, up); box(3.2, 0.3, 3.8, blueD, 0, 4.1, 0, up);
    for (const z of [-0.8, 0.8]) box(0.1, 0.9, 0.9, 0xcf8a4a, -1.52, 2.6, z, up);
    box(0.1, 1.5, 1.1, 0xb86b2c, -1.52, 0.75, 0, up);
    const cab = box(1.4, 1.1, 1.4, 0x3f5f70, 0, 4.9, 0, up); cab.rotation.y = 0.6;
    box(0.9, 0.5, 0.05, 0x9cd6ef, -0.5, 5.0, -0.6, up);
    const arm = box(3.6, 0.22, 0.22, 0x24323d, -1.7, 5.5, 0.8, up); arm.rotation.z = 0.35;
    const hook = box(0.08, 1.4, 0.08, 0x111111, -3.2, 4.3, 0.8, up);
    const hk = box(0.35, 0.25, 0.35, 0x222222, -3.2, 3.55, 0.8, up);
    this.anim.push((t) => { hook.rotation.z = Math.sin(t * 1.2) * 0.08; hk.position.x = -3.2 + Math.sin(t * 1.2) * 0.06; });
    s.add(up);
    this.blockers.push({ x0: 10.1, x1: 14, z0: 3, z1: 7 });
    this.pad('upgrade', 7.2, 5, 4.8, 5, '#7a5fc4', '升级');
    // 升级垫上的十字标
    const cross = textPlane('⊕', 1.6, { color: '#2e2a2a', stroke: '#e8a15a' });
    cross.rotation.x = -Math.PI / 2; cross.position.set(8.6, 0.05, 5); s.add(cross);

    // ---- 商店（5 级前是绿色全息投影）----
    const shop = new THREE.Group(); shop.position.set(12, 0, 11.4);
    this.shopSolid = []; this.shopMats = [];
    const sm = (c) => { const m = lam(c, { transparent: true, opacity: 0.45, emissive: 0x2bff4a, emissiveIntensity: 0.6 }); this.shopMats.push({ m, c }); return m; };
    this.shopSolid.push(box(3, 2.6, 3.8, sm(0xe07b39), 0, 1.3, 0, shop));
    this.shopSolid.push(box(3.4, 0.35, 4.2, sm(0xc0392b), 0, 2.8, 0, shop));
    this.shopSolid.push(box(0.1, 1.2, 1.6, sm(0x9cd6ef), -1.52, 1.4, 0, shop));
    this.shopSolid.push(box(0.8, 0.8, 0.1, sm(0xf2c230), -1.2, 3.3, 0, shop));
    s.add(shop);
    this.blockers.push({ x0: 10.4, x1: 14, z0: 9.4, z1: 13.4 });
    this.pad('shop', 7.2, 11.4, 4.8, 4.2, 'rgba(40,160,80,0.35)', '商店');

    // ---- 关卡 ----
    this.pad('level', 8.5, 15.4, 4.6, 3.6, '#a97c5b', '关卡', 0.9);
    // 码头小屋（装饰）
    const dock = new THREE.Group(); dock.position.set(15.6, 0, 16);
    box(3, 0.3, 3, 0x9a6a3a, 0, 0.0, 0, dock); box(2.2, 1.6, 2.2, 0x5f98ae, 0, 0.95, 0, dock);
    const roof = box(2.8, 0.3, 2.8, 0x333a40, 0, 1.9, 0, dock); roof.rotation.z = 0.12;
    s.add(dock);

    // ---- 农场：鸡舍 / 牛舍 / 市场 ----
    this.farm = {};
    this.farm.coop = this.buildPen(-8.2, 24.5, 0xf4efe6, 'coop');
    this.farm.barn = this.buildPen(8.2, 24.5, 0x5b3a1e, 'barn');
    const stall = new THREE.Group(); stall.position.set(0, 0, 29.6);
    box(4.2, 0.9, 1.4, 0x9a5a2a, 0, 0.45, 0, stall);
    for (const x of [-1.9, 1.9]) box(0.15, 2.4, 0.15, 0x6b3c1c, x, 1.2, -0.6, stall);
    const awn = box(4.6, 0.12, 1.8, 0xe8534a, 0, 2.45, -0.2, stall); awn.rotation.x = -0.25;
    box(0.8, 0.5, 0.6, 0xc58b4a, -1.2, 1.15, 0, stall); box(0.8, 0.5, 0.6, 0x4a90d9, 1.2, 1.15, 0, stall);
    s.add(stall);
    this.blockers.push({ x0: -2.4, x1: 2.4, z0: 28.8, z1: 32 });
    this.pad('market', 0, 26.4, 4.4, 3.2, '#c98e4c', '市场');

    // 装饰：木桶、木板堆、石头、小花
    const deco = new THREE.Group();
    cyl(0.6, 0.55, 1.0, 0xb8753a, -10.5, 0.5, 20.2, deco, 12);
    for (let i = 0; i < 3; i++) box(3, 0.18, 0.7, 0xc98b4c, -10, 0.1 + i * 0.19, 29.5 + i * 0.05, deco);
    const r = rng(33);
    for (let i = 0; i < 14; i++) {
      const x = -13 + r() * 26, z = FARM_Z + 1 + r() * 12;
      if (Math.abs(x) < 3 && z > 25) continue;
      const f = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 + r() * 0.2), lam(0xd6d0c0)); f.position.set(x, 0.1, z); deco.add(f);
    }
    s.add(deco);
  }

  buildPen(x, z, houseColor, kind) {
    const s = this.scene, g = new THREE.Group(); g.position.set(x, 0, z);
    // 栅栏围栏（白）
    const W = 7, D = 5.6, rail = 0xf0f0ea;
    box(W, 0.1, 0.1, rail, 0, 0.55, -D / 2, g); box(W, 0.1, 0.1, rail, 0, 0.55, D / 2, g);
    box(0.1, 0.1, D, rail, -W / 2, 0.55, 0, g); box(0.1, 0.1, D, rail, W / 2, 0.55, 0, g);
    for (let i = 0; i <= 6; i++) { box(0.14, 0.8, 0.14, rail, -W / 2 + i * W / 6, 0.4, -D / 2, g); box(0.14, 0.8, 0.14, rail, -W / 2 + i * W / 6, 0.4, D / 2, g); }
    // 未建：地上画个动物剪影；建成：房子 + 动物
    const sil = textPlane(kind === 'coop' ? '🐔' : '🐄', 2.2, { color: '#8a7b5a', stroke: '#8a7b5a' });
    sil.rotation.x = -Math.PI / 2; sil.position.set(0, 0.03, 0.4); sil.material.opacity = 0.55; g.add(sil);
    const house = new THREE.Group(); house.visible = false; g.add(house);
    const hx = kind === 'coop' ? -2 : 2;
    box(2.4, 1.6, 2, houseColor, hx, 0.8, -1.4, house);
    const rf = box(2.8, 0.25, 2.4, 0xc0392b, hx, 1.75, -1.4, house); rf.rotation.z = 0.12;
    const animals = [];
    for (let i = 0; i < (kind === 'coop' ? 4 : 2); i++) {
      const a = new THREE.Group();
      if (kind === 'coop') {
        box(0.45, 0.4, 0.6, 0xffffff, 0, 0.35, 0, a); box(0.3, 0.3, 0.3, 0xffffff, 0, 0.62, -0.3, a);
        box(0.08, 0.14, 0.18, 0xe53935, 0, 0.84, -0.3, a); box(0.1, 0.06, 0.12, 0xffa000, 0, 0.6, -0.5, a);
      } else {
        box(0.8, 0.7, 1.5, 0xffffff, 0, 0.8, 0, a); box(0.5, 0.5, 0.6, 0xffffff, 0, 1.1, -0.95, a);
        box(0.35, 0.36, 0.5, 0x222222, 0.23, 0.95, 0.2, a); box(0.3, 0.3, 0.42, 0x222222, -0.26, 0.9, -0.35, a);
        box(0.45, 0.2, 0.2, 0xf4b6c2, 0, 0.95, -1.28, a);
        for (const [lx, lz] of [[-0.3, -0.55], [0.3, -0.55], [-0.3, 0.55], [0.3, 0.55]]) box(0.16, 0.5, 0.16, 0xffffff, lx, 0.25, lz, a);
      }
      a.position.set(-1 + i * 1.1, 0, 1 + (i % 2) * 0.6);
      house.add(a); animals.push({ g: a, phase: i * 1.7, home: a.position.clone() });
    }
    this.anim.push((t) => {
      if (!house.visible) return;
      for (const an of animals) {
        const u = t * 0.4 + an.phase;
        an.g.position.x = an.home.x + Math.sin(u) * 1.1; an.g.position.z = an.home.z + Math.sin(u * 0.7) * 0.5;
        an.g.rotation.y = Math.atan2(-Math.cos(u) * 1.1, -Math.cos(u * 0.7) * 0.35 + 0.001);
      }
    });
    const label = textPlane(kind === 'coop' ? '鸡舍' : '牛舍', 0.7);
    label.rotation.x = -Math.PI / 2; label.position.set(0, 0.05, -D / 2 - 0.6); g.add(label);
    // 头顶信息牌
    const info = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
    info.position.set(0, 3.2, 0); info.scale.set(4, 1, 1); info.visible = false; g.add(info);
    s.add(g);
    this.pad(kind, x, z + 0.4, 3.2, 2.6, 'rgba(255,255,255,0.22)', null);
    this.blockers.push({ x0: x + hx - 1.4, x1: x + hx + 1.4, z0: z - 2.6, z1: z - 0.2 });
    return { g, house, sil, info, infoKey: '' };
  }

  setFarmInfo(kind, text) {
    const f = this.farm[kind];
    if (f.infoKey === text) return;
    f.infoKey = text;
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
    const g = cv.getContext('2d');
    g.fillStyle = 'rgba(20,40,55,0.78)'; g.beginPath(); g.roundRect(4, 14, 504, 100, 50); g.fill();
    g.font = '900 56px "PingFang SC","Microsoft YaHei",sans-serif'; g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 256, 66);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    if (f.info.material.map) f.info.material.map.dispose();
    f.info.material.map = t; f.info.material.needsUpdate = true; f.info.visible = true;
  }

  setShopUnlocked(on) {
    for (const { m, c } of this.shopMats) {
      m.transparent = !on; m.opacity = on ? 1 : 0.45; m.emissive.setHex(on ? 0x000000 : 0x2bff4a); m.color.setHex(on ? c : 0x7dff8a); m.needsUpdate = true;
    }
  }

  update(t) { for (const f of this.anim) f(t); }
}

// ---------- 草场（每关重建） ----------
function tuftGeometry(r) {
  const pos = [], col = [];
  const blades = 7;
  for (let b = 0; b < blades; b++) {
    const a = r() * Math.PI * 2, rad = r() * 0.24;
    const cx = Math.cos(a) * rad, cz = Math.sin(a) * rad;
    const yaw = r() * Math.PI, w = 0.07 + r() * 0.05, h = 0.75 + r() * 0.25;
    const lx = Math.cos(yaw) * w, lz = Math.sin(yaw) * w;
    const lean = (r() - 0.5) * 0.35, lean2 = (r() - 0.5) * 0.35;
    pos.push(cx - lx, 0, cz - lz, cx + lx, 0, cz + lz, cx + lean, h, cz + lean2);
    col.push(0.42, 0.42, 0.42, 0.5, 0.5, 0.5, 1, 1, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // 让法线朝上，光照更均匀（卡通草）
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

export class Field {
  constructor(scene, def, uniforms) {
    this.scene = scene; this.def = def;
    this.group = new THREE.Group(); scene.add(this.group);
    const W = def.w, D = def.d;
    this.cols = Math.round(W / CELL); this.rows = Math.round(D / CELL);
    this.x0 = -W / 2; this.z0 = RAMP.z0 - D; this.z1 = RAMP.z0;
    const N = this.cols * this.rows;
    this.type = new Uint8Array(N); this.hp = new Float32Array(N); this.cut = new Uint8Array(N); this.valid = new Uint8Array(N).fill(1);
    this.rocks = []; this.cutCount = 0;
    const r = rng(def.seed);
    // 草的分布：越远越硬，叠一层低频噪声做成一片一片
    const ph = [r() * 6, r() * 6, r() * 6, r() * 6];
    for (let j = 0; j < this.rows; j++) for (let i = 0; i < this.cols; i++) {
      const idx = j * this.cols + i, x = this.x0 + (i + 0.5) * CELL, z = this.z0 + (j + 0.5) * CELL;
      const f = Math.pow(1 - j / this.rows, 1.6);
      const nz = Math.sin(x * 0.23 + ph[0]) * Math.cos(z * 0.19 + ph[1]) * 0.5 + Math.sin(x * 0.07 + z * 0.09 + ph[2]) * 0.5;
      const k = Math.max(0, Math.min(def.tiers.length - 1, Math.floor(f * def.tiers.length + nz * 0.35)));
      this.type[idx] = def.tiers[k]; this.hp[idx] = GRASS[def.tiers[k]].hp;
    }
    // 石头（障碍，下面不长草）
    for (let k = 0; k < def.rocks; k++) {
      const x = this.x0 + 2 + r() * (W - 4), z = this.z0 + 2 + r() * (D - 7), rad = 0.7 + r() * 0.7;
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(rad, 0), lam(0x9aa3a8, { flatShading: true }));
      m.position.set(x, FIELD_Y + rad * 0.45, z); m.rotation.set(r() * 3, r() * 3, r() * 3); m.castShadow = true; m.receiveShadow = true;
      this.group.add(m); this.rocks.push({ x, z, r: rad * 0.95 });
      this.forCells(x, z, rad * 0.9, (idx) => { this.valid[idx] = 0; });
    }
    this.validCount = 0; for (let i = 0; i < N; i++) this.validCount += this.valid[i];

    // 高台：泥土四壁 + 顶面贴图
    box(W, FIELD_Y + 1.2, D, lam(0x7a3f1c), 0, (FIELD_Y - 1.2) / 2, this.z0 + D / 2, this.group, false);
    this.texData = new Uint8Array(N * 4);
    this.tex = new THREE.DataTexture(this.texData, this.cols, this.rows, THREE.RGBAFormat);
    this.tex.magFilter = THREE.NearestFilter; this.tex.colorSpace = THREE.SRGBColorSpace;
    const top = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: this.tex }));
    top.rotation.x = -Math.PI / 2; top.position.set(0, FIELD_Y + 0.005, this.z0 + D / 2); top.receiveShadow = true;
    this.group.add(top);

    // 草：每格一簇（实例化）
    const geo = tuftGeometry(rng(5));
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uniforms.uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 ipos = instanceMatrix[3];
        float sw = sin(uTime * 1.8 + ipos.x * 0.55 + ipos.z * 0.35) * 0.09 * position.y;
        transformed.x += sw; transformed.z += sw * 0.5;`);
    };
    this.grass = new THREE.InstancedMesh(geo, mat, N);
    this.grass.frustumCulled = false; this.grass.receiveShadow = true;
    this.heights = new Float32Array(N); this.yaws = new Float32Array(N); this.jit = new Float32Array(N * 2);
    const c = new THREE.Color();
    for (let idx = 0; idx < N; idx++) {
      this.heights[idx] = GRASS[this.type[idx]].h * (0.82 + r() * 0.36);
      this.yaws[idx] = r() * Math.PI * 2; this.jit[idx * 2] = (r() - 0.5) * 0.18; this.jit[idx * 2 + 1] = (r() - 0.5) * 0.18;
      c.setHex(GRASS[this.type[idx]].top); c.offsetHSL(0, 0, (r() - 0.5) * 0.06);
      this.grass.setColorAt(idx, c);
      this.writeMatrix(idx);
      this.paint(idx);
    }
    this.group.add(this.grass);

    // 向日葵 / 玉米苗（装饰，不挡路）
    const nf = Math.round(W * D / 45);
    for (let k = 0; k < nf; k++) this.group.add(this.flower(this.x0 + 1 + r() * (W - 2), this.z0 + 1 + r() * (D - 2), r));
  }

  flower(x, z, r) {
    const g = new THREE.Group(); g.position.set(x, FIELD_Y, z);
    const h = 1.3 + r() * 0.7;
    cyl(0.04, 0.05, h, 0x4f9a2a, 0, h / 2, 0, g, 6);
    for (const s of [1, -1]) { const l = box(0.45, 0.03, 0.2, 0x5fb335, s * 0.22, h * 0.45, 0, g, false); l.rotation.z = s * 0.4; }
    if (r() < 0.7) {
      const head = new THREE.Group(); head.position.y = h; head.rotation.x = -0.9; g.add(head);
      cyl(0.32, 0.32, 0.06, 0xffc21a, 0, 0, 0, head, 10); cyl(0.17, 0.17, 0.08, 0x5a3413, 0, 0.02, 0, head, 10);
    } else {
      for (let i = 0; i < 2; i++) { const c = cyl(0.07, 0.07, 0.35, 0xe0a030, 0.1 * (i ? 1 : -1), h * (0.55 + i * 0.2), 0, g, 6); c.rotation.z = 0.5 * (i ? 1 : -1); }
    }
    g.rotation.y = r() * 6;
    return g;
  }

  writeMatrix(idx) {
    const m = Field._m || (Field._m = new THREE.Matrix4()), q = Field._q || (Field._q = new THREE.Quaternion());
    const i = idx % this.cols, j = (idx / this.cols) | 0;
    const x = this.x0 + (i + 0.5) * CELL + this.jit[idx * 2], z = this.z0 + (j + 0.5) * CELL + this.jit[idx * 2 + 1];
    const hide = this.cut[idx] || !this.valid[idx];
    q.setFromAxisAngle(Field._up || (Field._up = new THREE.Vector3(0, 1, 0)), this.yaws[idx]);
    m.compose(new THREE.Vector3(x, FIELD_Y, z), q, hide ? new THREE.Vector3(0.0001, 0.0001, 0.0001) : new THREE.Vector3(1.05, this.heights[idx], 1.05));
    this.grass.setMatrixAt(idx, m);
  }

  paint(idx) {
    const i = idx % this.cols, j = (idx / this.cols) | 0, g = GRASS[this.type[idx]];
    let hex;
    if (!this.valid[idx]) hex = 0x8a6a45;
    else if (this.cut[idx]) hex = ((j >> 2) & 1) ? g.cutA : g.cutB;
    else hex = g.under;
    const p = ((this.rows - 1 - j) * this.cols + i) * 4;
    this.texData[p] = (hex >> 16) & 255; this.texData[p + 1] = (hex >> 8) & 255; this.texData[p + 2] = hex & 255; this.texData[p + 3] = 255;
  }

  forCells(x, z, rad, fn) {
    const i0 = Math.max(0, Math.floor((x - rad - this.x0) / CELL)), i1 = Math.min(this.cols - 1, Math.floor((x + rad - this.x0) / CELL));
    const j0 = Math.max(0, Math.floor((z - rad - this.z0) / CELL)), j1 = Math.min(this.rows - 1, Math.floor((z + rad - this.z0) / CELL));
    const r2 = rad * rad;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cx = this.x0 + (i + 0.5) * CELL - x, cz = this.z0 + (j + 0.5) * CELL - z;
      if (cx * cx + cz * cz <= r2) fn(j * this.cols + i);
    }
  }

  // 锯片切割：返回割断的草 {type}[] 和是否"割不动"
  cutAt(x, z, rad, strength, dt, out) {
    let tough = 0;
    this.forCells(x, z, rad, (idx) => {
      if (this.cut[idx] || !this.valid[idx]) return;
      const hp = GRASS[this.type[idx]].hp;
      if (strength >= hp) this.hp[idx] = 0;
      else { this.hp[idx] -= strength * 2.6 * dt; tough = Math.max(tough, hp / strength); }
      if (this.hp[idx] <= 0) this.markCut(idx, out);
    });
    return tough;
  }

  markCut(idx, out) {
    this.cut[idx] = 1; this.cutCount++;
    this.writeMatrix(idx); this.paint(idx);
    this.dirty = true;
    if (out) out.push(this.type[idx]);
  }

  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    this.grass.instanceMatrix.needsUpdate = true; this.tex.needsUpdate = true;
  }

  get progress() { return this.validCount ? this.cutCount / this.validCount : 1; }

  contains(x, z, m = 0) { return x > this.x0 + m && x < -this.x0 - m && z > this.z0 + m && z < this.z1 + 0.5; }

  serialize() {
    const bytes = new Uint8Array(Math.ceil(this.cut.length / 8));
    for (let i = 0; i < this.cut.length; i++) if (this.cut[i]) bytes[i >> 3] |= 1 << (i & 7);
    let s = ''; for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  }
  load(str) {
    try {
      const s = atob(str);
      for (let i = 0; i < this.cut.length; i++) {
        if ((s.charCodeAt(i >> 3) >> (i & 7)) & 1 && !this.cut[i] && this.valid[i]) this.markCut(i, null);
      }
      this.flush();
    } catch { /* 存档损坏就当新场地 */ }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
  }
}

// ---------- 割草机 ----------
function gearGeometry(R, teeth) {
  const sh = new THREE.Shape(), n = teeth * 2;
  for (let k = 0; k <= n * 2; k++) {
    const a = k / (n * 2) * Math.PI * 2, tooth = k % 4 === 0 || k % 4 === 1;
    const rr = tooth ? R : R * 0.8;
    k === 0 ? sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr) : sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
}

export class Mower {
  constructor(scene) {
    this.g = new THREE.Group(); scene.add(this.g);
    const Y = 0xf2c230, YD = 0xc99a12;
    const body = new THREE.Group(); this.g.add(body); this.body = body;
    box(1.5, 0.35, 2.6, YD, 0, 0.55, 0.1, body);
    // 车斗（后）
    box(1.6, 0.12, 1.5, Y, 0, 0.82, 0.75, body);
    box(1.6, 0.55, 0.12, Y, 0, 1.08, 1.45, body); box(0.12, 0.55, 1.5, Y, -0.74, 1.08, 0.75, body); box(0.12, 0.55, 1.5, Y, 0.74, 1.08, 0.75, body);
    box(1.6, 0.4, 0.12, Y, 0, 1.0, 0.02, body);
    // 车头（白）+ 灯
    box(1.2, 0.5, 0.9, 0xf4f4f4, 0, 0.95, -0.8, body);
    box(1.1, 0.12, 0.5, 0xdcdcdc, 0, 1.25, -0.75, body);
    for (const x of [-0.42, 0.42]) box(0.22, 0.14, 0.06, 0xffe066, x, 0.98, -1.26, body);
    // 座椅 + 司机（白色小人）
    box(0.6, 0.12, 0.5, 0x333333, 0, 1.0, -0.25, body); box(0.6, 0.6, 0.12, 0x333333, 0, 1.3, -0.02, body);
    const white = lam(0xffffff);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.35, 4, 8), white); torso.position.set(0, 1.45, -0.3); torso.castShadow = true; body.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), white); head.position.set(0, 1.95, -0.32); head.castShadow = true; body.add(head);
    for (const s of [-1, 1]) { const arm = box(0.1, 0.1, 0.5, 0xffffff, s * 0.24, 1.45, -0.55, body); arm.rotation.x = 0.3; }
    // 防滚架
    box(0.08, 0.7, 0.08, 0xdddddd, -0.55, 1.4, 0.05, body); box(0.08, 0.7, 0.08, 0xdddddd, 0.55, 1.4, 0.05, body); box(1.18, 0.08, 0.08, 0xdddddd, 0, 1.75, 0.05, body);
    // 轮子
    this.wheels = [];
    const wg = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 14); wg.rotateZ(Math.PI / 2);
    for (const [x, z] of [[-0.82, -0.75], [0.82, -0.75], [-0.82, 0.85], [0.82, 0.85]]) {
      const w = new THREE.Mesh(wg, lam(0x1e1e1e)); w.position.set(x, 0.36, z); w.castShadow = true; body.add(w); this.wheels.push(w);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.32, 8).rotateZ(Math.PI / 2), lam(0xbfbfbf)); hub.position.copy(w.position); body.add(hub);
    }
    // 锯片横梁 + 锯片
    this.bladeArm = box(1.2, 0.12, 0.12, 0xcfa21a, 0, 0.55, -1.6, body);
    this.bladeMat = lam(0xc8d0d6, { emissive: 0x000000 });
    this.blades = [];
    // 车斗里的草块
    this.blockGeo = new THREE.BoxGeometry(0.34, 0.26, 0.34);
    this.stack = new THREE.InstancedMesh(this.blockGeo, lam(0xffffff), 400); this.stack.count = 0; this.stack.castShadow = true;
    body.add(this.stack);
    // 拖车
    this.trailer = new THREE.Group(); this.trailer.visible = false; scene.add(this.trailer);
    box(1.5, 0.12, 1.6, Y, 0, 0.55, 0, this.trailer);
    box(1.5, 0.45, 0.1, Y, 0, 0.8, 0.78, this.trailer); box(1.5, 0.45, 0.1, Y, 0, 0.8, -0.78, this.trailer);
    box(0.1, 0.45, 1.6, Y, -0.72, 0.8, 0, this.trailer); box(0.1, 0.45, 1.6, Y, 0.72, 0.8, 0, this.trailer);
    box(0.1, 0.1, 1.0, 0x555555, 0, 0.45, -1.2, this.trailer);
    for (const x of [-0.8, 0.8]) { const w = new THREE.Mesh(wg, lam(0x1e1e1e)); w.position.set(x, 0.32, 0.1); w.scale.setScalar(0.85); this.trailer.add(w); this.wheels.push(w); }
    this.tStack = new THREE.InstancedMesh(this.blockGeo, lam(0xffffff), 300); this.tStack.count = 0; this.tStack.castShadow = true;
    this.trailer.add(this.tStack);
    this.trailerPos = new THREE.Vector3(); this.trailerYaw = 0;
  }

  setBlades(n, R, gap) {
    const key = n + ':' + R + ':' + gap;
    if (key === this.bladeKey) return;
    this.bladeKey = key;
    for (const b of this.blades) this.body.remove(b.g);
    this.blades = [];
    const geo = gearGeometry(R, 7);
    for (let k = 0; k < n; k++) {
      const g = new THREE.Group();
      const x = (k - (n - 1) / 2) * gap;
      g.position.set(x, 0.42, -1.75 - (k % 2) * 0.25);
      const disc = new THREE.Mesh(geo, this.bladeMat); disc.castShadow = true; g.add(disc);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.14, 6), lam(0xe53935)); hub.position.y = 0.1; g.add(hub);
      this.body.add(g); this.blades.push({ g, local: g.position.clone() });
    }
    this.bladeArm.scale.x = Math.max(1, (n - 1) * gap + 0.4) / 1.2;
  }

  // 本地坐标 → 世界坐标（锯片中心）
  bladeWorld(k, out) { return this.blades[k].g.getWorldPosition(out); }

  setStack(blockTypes, perBed, colorOf) {
    const c = new THREE.Color(), m = new THREE.Matrix4();
    const put = (mesh, list, bx, bz, baseY) => {
      for (let i = 0; i < list.length; i++) {
        const layer = Math.floor(i / 16), s = i % 16, gx = s % 4, gz = (s / 4) | 0;
        m.makeTranslation(bx + (gx - 1.5) * 0.35, baseY + layer * 0.27, bz + (gz - 1.5) * 0.35);
        mesh.setMatrixAt(i, m); mesh.setColorAt(i, c.setHex(colorOf(list[i])));
      }
      mesh.count = list.length;
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    const a = blockTypes.slice(0, Math.min(perBed, 400)), b = blockTypes.slice(perBed, perBed + 300);
    put(this.stack, a, 0, 0.75, 1.0);
    put(this.tStack, b, 0, 0, 0.72);
    this.stackTop = 1.0 + Math.ceil(a.length / 16) * 0.27;
  }
}
