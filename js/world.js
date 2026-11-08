// 场景：天空、海（锦鲤、船、鸭子、睡莲）、小岛基地、建筑、地面格子、滑水道、农场（石墙大门/草料机/草棚/鸡舍/牛舍/货架/小路码头）、草场四周风景
import * as THREE from 'three';
import { FIELD_Y, RAMP, ISLAND, FARM_Z, GATE, SLIP, WATER_Y, FISH, STATION, TRAIN } from './config.js?v=1007';
import { rng, lam, box, cyl, sphere, TEX, textPlane, canvasTex, GLB, infoSprite } from './assets.js?v=1007';
import { tree, bush, hayBale, squareBale, scarecrow, animal, duck, fish, rowboat, hayBarge, sailboat, lilyPad } from './models.js?v=1007';
import { makeLawn } from './grass.js?v=1007';

function padTexture(w, h, fill) {
  return canvasTex(w * 64, h * 64, (g, W, H) => {
    const k = 64, r = 0.55 * k, m = 0.18 * k;
    const rr = (x, y, ww, hh) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + ww, y, x + ww, y + hh, r); g.arcTo(x + ww, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + ww, y, r); g.closePath(); };
    g.fillStyle = fill; rr(m, m, W - 2 * m, H - 2 * m); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 0.2 * k; g.setLineDash([0.55 * k, 0.32 * k]); rr(m, m, W - 2 * m, H - 2 * m); g.stroke();
  });
}
function paverTexture() {
  return canvasTex(512, 512, (g, W, H) => {
    g.fillStyle = '#6f7a83'; g.fillRect(0, 0, W, H); const r = rng(11);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const sh = 118 + r() * 22; g.fillStyle = `rgb(${sh},${sh + 6},${sh + 12})`; g.fillRect(x * 64 + 3 + (y % 2) * 32, y * 64 + 3, 58, 58); }
  });
}
function waterNormal() {
  const S = 256, r = rng(21), hgt = new Float32Array(S * S);
  for (let o = 1; o <= 3; o++) { const f = 3 * o, a = 1 / o; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) hgt[y * S + x] += Math.sin(x / S * Math.PI * 2 * f + o) * Math.cos(y / S * Math.PI * 2 * f * 0.7 + o * 2) * a + (r() - 0.5) * 0.12 * a; }
  return canvasTex(S, S, (g) => {
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = hgt[y * S + (x + 1) % S] - hgt[y * S + (x + S - 1) % S], dy = hgt[((y + 1) % S) * S + x] - hgt[((y + S - 1) % S) * S + x];
      const p = (y * S + x) * 4; img.data[p] = 128 + dx * 60; img.data[p + 1] = 128 + dy * 60; img.data[p + 2] = 255; img.data[p + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
}
const stripesTex = () => canvasTex(128, 32, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#e8534a' : '#fff6e6'; g.fillRect(i * 16, 0, 16, h); } });

export class World {
  constructor(scene, uniforms) {
    this.scene = scene; this.uniforms = uniforms;
    this.pads = {}; this.blockers = []; this.farmBlockers = []; this.anim = [];
    this.buildSky();
    this.buildWater();
    this.buildIsland();
    this.buildBuildings();
    this.buildFarm();
    this.buildSeaLife();
  }

  // ---------- 天空 ----------
  buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x2f7fd6) }, mid: { value: new THREE.Color(0x7cc4f5) }, bot: { value: new THREE.Color(0xdff1ff) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top, mid, bot; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.6)) : mix(mid, bot, -h * 3.0); gl_FragColor = vec4(c, 1.0); }',
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(240, 24, 12), mat); this.scene.add(this.sky);
    const r = rng(9), clouds = new THREE.Group(); this.scene.add(clouds); this.clouds = [];
    const cm = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 1, flatShading: true });
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Group();
      for (let k = 0; k < 5; k++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(2 + r() * 2.5, 1), cm); s.position.set((k - 2) * 2.6 + (r() - 0.5), r() * 1.2, (r() - 0.5) * 2); s.scale.y = 0.55; c.add(s); }
      c.position.set((r() - 0.5) * 220, 32 + r() * 14, -60 + (r() - 0.5) * 200); c.scale.setScalar(0.8 + r() * 1.2);
      clouds.add(c); this.clouds.push({ g: c, v: 0.6 + r() * 0.6 });
    }
    this.anim.push((t, dt) => { for (const c of this.clouds) { c.g.position.x += c.v * dt; if (c.g.position.x > 130) c.g.position.x = -130; } });
  }

  // ---------- 海 ----------
  buildWater() {
    const s = this.scene;
    const seabed = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), TEX.mat('dirt', { repeat: 40, color: 0xc9b98a }));
    seabed.rotation.x = -Math.PI / 2; seabed.position.set(0, -4.2, -20); seabed.receiveShadow = true; s.add(seabed);
    this.waterN = waterNormal(); this.waterN.repeat.set(60, 60);
    const wm = new THREE.MeshStandardMaterial({ color: 0x1f8fd9, transparent: true, opacity: 0.72, roughness: 0.18, metalness: 0.05, normalMap: this.waterN, normalScale: new THREE.Vector2(0.6, 0.6) });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), wm);
    water.rotation.x = -Math.PI / 2; water.position.set(0, WATER_Y, -20); s.add(water); this.water = water;
    const foam = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
    this.foams = [];
    const ring = (x, z, w, d) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), foam); m.rotation.x = -Math.PI / 2; m.position.set(x, WATER_Y + 0.02, z); s.add(m); this.foams.push(m); };
    const I = ISLAND;
    ring(0, I.z0 - 0.5, I.x1 - I.x0 + 2, 1.2); ring(0, I.z1 + 0.5, I.x1 - I.x0 + 2, 1.2); ring(I.x0 - 0.5, (I.z0 + I.z1) / 2, 1.2, I.z1 - I.z0 + 2); ring(I.x1 + 0.5, (I.z0 + I.z1) / 2, 1.2, I.z1 - I.z0 + 2);
    this.anim.push((t) => { this.waterN.offset.set(t * 0.012, t * 0.008); for (const f of this.foams) f.material.opacity = 0.22 + 0.18 * Math.sin(t * 1.3); });
  }

  // ---------- 小岛：基地石板 + 农场草地 + 岩壁 + 栅栏 + 坡道 + 滑水道 ----------
  buildIsland() {
    const s = this.scene, I = ISLAND;
    const pav = paverTexture(); pav.repeat.set(3.5, 2.3); this.makePaver = paverTexture;
    const base = new THREE.Mesh(new THREE.BoxGeometry(I.x1 - I.x0, 1.2, FARM_Z - I.z0), new THREE.MeshStandardMaterial({ map: pav, roughness: 0.9 }));
    base.position.set(0, -0.6, (I.z0 + FARM_Z) / 2); base.receiveShadow = true; s.add(base);
    const farm = new THREE.Mesh(new THREE.BoxGeometry(I.x1 - I.x0, 1.2, I.z1 - FARM_Z), TEX.mat('grass2', { repeat: 1.1, color: 0xc4e08a }));
    farm.position.set(0, -0.6, (FARM_Z + I.z1) / 2); farm.receiveShadow = true; s.add(farm);
    const cliff = new THREE.Mesh(new THREE.BoxGeometry(I.x1 - I.x0 + 0.5, 4.2, I.z1 - I.z0 + 0.5), TEX.mat('rock', { repeat: 0.3, color: 0x8f8070 }));
    cliff.position.set(0, -2.15, (I.z0 + I.z1) / 2); cliff.receiveShadow = true; s.add(cliff);
    // 农场石墙（z=FARM_Z），中间留大门
    const stoneG = new THREE.BoxGeometry(0.62, 0.3, 0.5), stoneM = TEX.mat('rock', { repeat: 2, color: 0xb9b0a0 });
    const stones = new THREE.InstancedMesh(stoneG, stoneM, 260); let k = 0; const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3(1, 1, 1);
    const r0 = rng(5);
    for (let row = 0; row < 3; row++) for (let x = I.x0 + 0.35 + (row % 2) * 0.32; x < I.x1 - 0.2 && k < 260; x += 0.66) {
      if (x > GATE.x0 - 0.3 && x < GATE.x1 + 0.3) continue;
      e.set(0, (r0() - 0.5) * 0.15, 0); q.setFromEuler(e); pv.set(x, 0.15 + row * 0.3, FARM_Z); mm.compose(pv, q, sv); stones.setMatrixAt(k++, mm);
    }
    stones.count = k; stones.castShadow = true; stones.receiveShadow = true; s.add(stones);
    for (const x of [GATE.x0 - 0.4, GATE.x1 + 0.4]) { cyl(0.32, 0.36, 1.6, TEX.mat('rock', { repeat: 2, color: 0xa9a090 }), x, 0.8, FARM_Z, s, 8); sphere(0.3, lam(0xd9c48a), x, 1.75, FARM_Z, s, 8); }
    const gateSign = textPlane('农场', 0.6, { color: '#fff', stroke: '#5a3a1c' }); gateSign.position.set(0, 2.3, FARM_Z); s.add(gateSign);
    box(GATE.x1 - GATE.x0 + 1.4, 0.16, 0.16, 0x6b4a2b, 0, 2.7, FARM_Z, s); for (const x of [GATE.x0 - 0.4, GATE.x1 + 0.4]) cyl(0.07, 0.07, 1.0, 0x6b4a2b, x, 2.2, FARM_Z, s, 6);
    // 栅栏（左边滑水道处留口）
    const posts = [], wood = TEX.mat('planks', { repeat: 0.6, color: 0xb8753a });
    const fence = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2.4));
      for (let i = 0; i <= n; i++) posts.push([x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n]);
      for (const y of [0.5, 0.85]) { const rail = box(len, 0.1, 0.1, wood, (x0 + x1) / 2, y, (z0 + z1) / 2, s); rail.rotation.y = -Math.atan2(z1 - z0, x1 - x0); }
    };
    fence(I.x0, 0.1, RAMP.x0 - 0.6, 0.1); fence(RAMP.x1 + 0.6, 0.1, I.x1, 0.1);
    fence(I.x0, 0.1, I.x0, SLIP.z0 - 0.4); fence(I.x0, SLIP.z1 + 0.4, I.x0, I.z1); fence(I.x1, 0.1, I.x1, STATION.gz0); fence(I.x1, STATION.gz1, I.x1, I.z1); fence(I.x0, I.z1, I.x1, I.z1);
    // 右边栏杆中间这一段：第 11 关起拆掉，变成去小火车站的进站口
    this.eastGap = new THREE.Group(); s.add(this.eastGap);
    for (const y of [0.5, 0.85]) box(0.1, 0.1, STATION.gz1 - STATION.gz0, wood, I.x1, y, (STATION.gz0 + STATION.gz1) / 2, this.eastGap);
    for (let z = STATION.gz0 + 2; z < STATION.gz1 - 0.5; z += 2) box(0.26, 1.15, 0.26, 0x8a5a2a, I.x1, 0.55, z, this.eastGap);
    const pim = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, 1.15, 0.26), lam(0x8a5a2a), posts.length);
    posts.forEach(([x, z], i) => { mm.makeTranslation(x, 0.55, z); pim.setMatrixAt(i, mm); });
    pim.castShadow = true; s.add(pim);
    // 坡道
    const ramp = new THREE.Group();
    const len = Math.hypot(RAMP.z1 - RAMP.z0, FIELD_Y), ang = Math.atan2(FIELD_Y, RAMP.z1 - RAMP.z0);
    const plankMat = TEX.mat('planks', { repeat: 0.5, color: 0xd9945a });
    for (let i = 0; i < 6; i++) {
      const p = box(RAMP.x1 - RAMP.x0, 0.14, len / 6 - 0.05, plankMat, 0, 0, -len / 2 + (i + 0.5) * len / 6, ramp);
      for (const sx of [-1, 1]) cyl(0.03, 0.03, 0.03, 0x3b2615, sx * (RAMP.x1 - 0.4), 0.08, p.position.z, ramp, 6);
    }
    for (const sx of [-1, 1]) box(0.12, 0.1, len, 0x8a5a2a, sx * (RAMP.x1 - 0.06), 0.12, 0, ramp);
    ramp.rotation.x = ang; ramp.position.set(0, FIELD_Y / 2, (RAMP.z0 + RAMP.z1) / 2);
    s.add(ramp);
    for (let i = 0; i < 3; i++) {
      const a = textPlane('︿', 0.9, { color: '#3cc23c', stroke: '#1d5e1d' });
      a.rotation.x = -Math.PI / 2 + ang; a.position.set(0, 0.16 + (i + 0.5) / 3 * FIELD_Y, RAMP.z1 - (i + 0.5) / 3 * (RAMP.z1 - RAMP.z0));
      s.add(a);
    }
    // 滑水道：从基地左沿斜下水
    const slip = new THREE.Group();
    const sw = SLIP.z1 - SLIP.z0, sl = 5.2, sang = Math.atan2(0.85, 4.6);
    const slipMat = TEX.mat('rock', { repeat: 1, color: 0x9aa4a8, roughness: 0.6 });
    box(sl, 0.25, sw, slipMat, 0, 0, 0, slip);
    for (let i = 0; i < 8; i++) box(0.08, 0.06, sw, 0x5f6a70, -sl / 2 + 0.4 + i * 0.6, 0.15, 0, slip, false);
    for (const sz of [-1, 1]) box(sl, 0.35, 0.16, 0x6a7075, 0, 0.2, sz * (sw / 2 - 0.08), slip);
    slip.rotation.z = -sang; slip.position.set(SLIP.x0 - 1.1, -0.3, (SLIP.z0 + SLIP.z1) / 2);
    s.add(slip);
    const ss = textPlane('下水', 0.7, { color: '#8fe0ff', stroke: '#124a66' }); ss.rotation.x = -Math.PI / 2; ss.rotation.z = Math.PI / 2; ss.position.set(SLIP.x0 + 1.4, 0.04, (SLIP.z0 + SLIP.z1) / 2); s.add(ss);
    for (let i = 0; i < 2; i++) { const a = textPlane('︿', 0.8, { color: '#8fe0ff', stroke: '#124a66' }); a.rotation.x = -Math.PI / 2; a.rotation.z = Math.PI / 2; a.position.set(SLIP.x0 - 0.2 - i * 1.4, 0.04 - i * 0.28, (SLIP.z0 + SLIP.z1) / 2); s.add(a); }
    // 基地角落绿化
    const r = rng(41), deco = new THREE.Group(); s.add(deco);
    for (const [x, z] of [[-14, 1.2], [14.5, 17.5]]) { const t = tree(r, r() < 0.5 ? 0 : 1); t.position.set(x, 0, z); deco.add(t); }
    for (const [x, z] of [[-14.5, 17.2], [13.5, 9]]) { const b = bush(r); b.position.set(x, 0, z); deco.add(b); }
    this.blockers.push({ x0: -15.5, x1: -13, z0: 16, z1: 18.6 }, { x0: 13, x1: 16, z0: 16, z1: 18.8 });
  }

  pad(name, x, z, w, d, fill, label, labelSize = 0.8, y = 0.02) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: padTexture(w, d, fill), transparent: true, roughness: 1 }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true;
    this.scene.add(m);
    let lab = null;
    if (label) { lab = textPlane(label, labelSize); lab.rotation.x = -Math.PI / 2; lab.position.set(x, y + 0.02, z); this.scene.add(lab); }
    this.pads[name] = { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, cx: x, cz: z, mesh: m, label: lab };
    return this.pads[name];
  }

  buildBuildings() {
    const s = this.scene;
    const wall = lam(0x6aa2b8, { roughness: 0.8 }), wallD = lam(0x4a7f94), win = lam(0xdbeef5, { emissive: 0xfff2c0, emissiveIntensity: 0.25, roughness: 0.2 });
    const metal = lam(0x9aa5ad, { metalness: 0.6, roughness: 0.35 });
    // ---- 出售：厂房 + 料斗 + 筒仓 ----
    const sell = new THREE.Group(); sell.position.set(-11.6, 0, 5);
    box(3.2, 3.2, 4.2, wall, 0, 1.6, 0, sell); box(3.5, 0.3, 4.5, wallD, 0, 3.3, 0, sell);
    for (const z of [-1.2, 0, 1.2]) { box(0.1, 0.7, 0.8, win, 1.62, 1.6, z, sell); box(0.12, 0.8, 0.9, 0x2f5d70, 1.6, 1.6, z, sell, false); }
    box(0.1, 1.4, 1.1, lam(0xeef6f8), 1.62, 0.7, 0.9, sell); box(0.12, 1.5, 1.2, 0x2f5d70, 1.6, 0.7, 0.9, sell, false);
    const hop = new THREE.Group(); hop.position.set(0.3, 3.5, -0.2); sell.add(hop);
    const Yp = lam(0xf2c230, { roughness: 0.5 });
    box(2.4, 0.25, 2.4, Yp, 0, 0, 0, hop); box(2.4, 0.9, 0.25, Yp, 0, 0.45, -1.1, hop); box(2.4, 0.9, 0.25, Yp, 0, 0.45, 1.1, hop);
    box(0.25, 0.9, 2.4, Yp, -1.1, 0.45, 0, hop); box(0.25, 0.9, 2.4, Yp, 1.1, 0.45, 0, hop);
    this.hopper = new THREE.Vector3(-11.3, 4.2, 4.8);
    const belt = box(3.4, 0.16, 0.8, lam(0x333333), -1.4, 3.0, -1.8, sell); belt.rotation.z = 0.5;
    for (const [x, z] of [[-2.0, -2.6], [-2.0, -0.6]]) {
      cyl(1.0, 1.0, 5.2, lam(0x8fc6dc, { metalness: 0.3, roughness: 0.4 }), x, 2.6, z, sell, 18);
      cyl(0.4, 1.02, 0.8, lam(0xa6d8ea, { metalness: 0.3, roughness: 0.4 }), x, 5.6, z, sell, 18);
      for (let i = 0; i < 3; i++) { const band = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.03, 6, 24), metal); band.rotation.x = Math.PI / 2; band.position.set(x, 1 + i * 1.6, z); sell.add(band); }
    }
    s.add(sell);
    this.blockers.push({ x0: -14, x1: -9.9, z0: 1.6, z1: 7.4 });
    this.pad('sell', -7.2, 5, 4.6, 5, '#9a6773', '出售');

    // ---- 升级：车库 + 吊车 ----
    const up = new THREE.Group(); up.position.set(11.8, 0, 5);
    box(3, 4, 3.6, wall, 0, 2, 0, up); box(3.3, 0.3, 3.9, wallD, 0, 4.1, 0, up);
    for (const z of [-0.8, 0.8]) { box(0.1, 0.9, 0.9, win, -1.52, 2.7, z, up); box(0.12, 1.0, 1.0, 0x2f5d70, -1.5, 2.7, z, up, false); }
    box(0.1, 1.7, 1.6, lam(0xc0c6cc, { metalness: 0.4, roughness: 0.5 }), -1.52, 0.85, 0, up);
    for (let i = 0; i < 6; i++) box(0.12, 0.04, 1.6, 0x8a9096, -1.53, 0.2 + i * 0.28, 0, up, false);
    const cab = box(1.4, 1.1, 1.4, lam(0x3f5f70, { roughness: 0.5 }), 0, 4.9, 0, up); cab.rotation.y = 0.6;
    box(0.9, 0.5, 0.05, win, -0.5, 5.0, -0.6, up);
    const arm = new THREE.Group(); arm.position.set(-0.2, 5.45, 0.6); up.add(arm);
    for (const dy of [0.1, -0.1]) { const b = box(3.8, 0.06, 0.06, 0x24323d, -1.6, dy, 0, arm); b.rotation.z = 0.35; }
    const hook = box(0.05, 1.4, 0.05, 0x111111, -3.2, 4.3, 0.6, up);
    const hk = box(0.35, 0.25, 0.35, 0x222222, -3.2, 3.55, 0.6, up);
    this.anim.push((t) => { hook.rotation.z = Math.sin(t * 1.2) * 0.08; hk.position.x = -3.2 + Math.sin(t * 1.2) * 0.06; });
    s.add(up);
    this.blockers.push({ x0: 10.1, x1: 14, z0: 3, z1: 7 });
    this.pad('upgrade', 7.2, 5, 4.8, 5, '#7a5fc4', '升级');
    const cross = textPlane('⊕', 1.6, { color: '#2e2a2a', stroke: '#e8a15a' });
    cross.rotation.x = -Math.PI / 2; cross.position.set(8.6, 0.05, 5); s.add(cross);

    // ---- 商店 ----
    const shop = new THREE.Group(); shop.position.set(12, 0, 11.4);
    this.shopMats = [];
    const sm = (m) => { this.shopMats.push({ m, c: m.color.getHex(), e: m.emissive ? m.emissive.getHex() : 0 }); return m; };
    box(3, 2.6, 3.8, sm(lam(0xe07b39, { roughness: 0.7 })), 0, 1.3, 0, shop);
    box(3.4, 0.35, 4.2, sm(lam(0xc0392b)), 0, 2.8, 0, shop);
    box(0.1, 1.2, 1.6, sm(win.clone()), -1.52, 1.4, 0, shop);
    const awn = box(2.0, 0.06, 1.2, sm(new THREE.MeshStandardMaterial({ map: stripesTex(), roughness: 0.8 })), -2.0, 2.2, 0, shop); awn.rotation.z = -0.35;
    box(1.4, 0.7, 0.08, sm(lam(0xf2c230)), -1.1, 3.3, 0, shop);
    s.add(shop);
    this.blockers.push({ x0: 10.4, x1: 14, z0: 9.4, z1: 13.4 });
    this.pad('shop', 7.2, 11.4, 4.8, 4.2, 'rgba(40,160,80,0.35)', '商店');

    // ---- 关卡 ----
    this.pad('level', 8.5, 15.4, 4.6, 3.6, '#a97c5b', '关卡', 0.9);

    // ---- 草料机（基地侧喂草，草捆从墙上传送到农场里的草棚） ----
    const baler = new THREE.Group(); baler.position.set(-8, 0, 16.6); this.balerG = baler;
    const red = lam(0xd23b2a, { roughness: 0.5, metalness: 0.1 }), dark = lam(0x2b2f33, { roughness: 0.6 });
    box(3.2, 1.6, 2.2, red, 0, 0.9, 0, baler); box(3.4, 0.2, 2.4, dark, 0, 1.8, 0, baler);
    const hopB = new THREE.Group(); hopB.position.set(0, 1.9, 0.2); baler.add(hopB);
    box(2.6, 0.25, 1.8, lam(0xf2c230), 0, 0, 0, hopB); box(2.6, 0.8, 0.2, lam(0xf2c230), 0, 0.4, -0.8, hopB); box(2.6, 0.8, 0.2, lam(0xf2c230), 0, 0.4, 0.8, hopB); box(0.2, 0.8, 1.8, lam(0xf2c230), -1.2, 0.4, 0, hopB); box(0.2, 0.8, 1.8, lam(0xf2c230), 1.2, 0.4, 0, hopB);
    this.balerHopper = new THREE.Vector3(-8, 3.0, 16.8);
    const drum = cyl(0.55, 0.55, 3.0, lam(0xb0b6bb, { metalness: 0.5, roughness: 0.4 }), 0, 0.9, 1.25, baler, 14); drum.rotation.z = Math.PI / 2; this.balerDrum = drum;
    for (let i = 0; i < 6; i++) { const f = box(3.0, 0.06, 0.18, 0x6a7075, 0, 0.9, 1.25, baler, false); f.rotation.x = i / 6 * Math.PI; f.userData.spin = true; drum.add(f); f.position.set(0, 0, 0); f.rotation.set(0, 0, Math.PI / 2); f.rotateX(i / 6 * Math.PI); f.translateY(0.55); }
    for (const x of [-1.2, 1.2]) { const w = cyl(0.42, 0.42, 0.3, dark, x, 0.42, -0.6, baler, 14); w.rotation.z = Math.PI / 2; }
    cyl(0.12, 0.12, 1.2, dark, 1.2, 2.6, -0.6, baler, 8);
    const belt2 = box(0.9, 0.12, 4.6, lam(0x444a50), 0, 1.5, 3.0, baler); belt2.rotation.x = 0.28;
    for (let i = 0; i < 7; i++) { const b = box(0.9, 0.04, 0.05, 0x8a9096, 0, 1.57, 1.0 + i * 0.62, baler, false); b.rotation.x = 0.28; b.userData.belt = i; }
    const sign = textPlane('草料机', 0.55, { color: '#fff', stroke: '#7a1c10' }); sign.position.set(0, 2.9, -1.15); baler.add(sign);
    s.add(baler);
    this.blockers.push({ x0: -10, x1: -6, z0: 15.2, z1: 18.6 });
    this.pad('baler', -8, 12.8, 4.4, 3.4, '#b9592e', '打捆');
    this.anim.push((t) => { drum.rotation.x = t * (this.balerBusy ? 6 : 0.6); });

    // ---- 垃圾桶：水里撞坏的船/鸭子/杂物扔这里 ----
    const bin = new THREE.Group(); bin.position.set(-12.3, 0, 8.6);
    cyl(0.45, 0.4, 1.0, lam(0x3a8f3a, { roughness: 0.6 }), 0, 0.5, 0, bin, 12); cyl(0.5, 0.5, 0.12, lam(0x2f6f2f), 0, 1.06, 0, bin, 12);
    for (let i = 0; i < 3; i++) { const band = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.02, 6, 20), lam(0x2f6f2f)); band.rotation.x = Math.PI / 2; band.position.y = 0.25 + i * 0.3; bin.add(band); }
    const bsign = textPlane('垃圾桶', 0.45, { color: '#fff', stroke: '#1d4a1d' }); bsign.position.set(0, 1.5, 0.3); bin.add(bsign);
    s.add(bin);
    this.blockers.push({ x0: -13, x1: -11.6, z0: 7.9, z1: 9.3 });
    this.pad('trash', -11.2, 10.4, 2.6, 2.2, 'rgba(60,160,60,0.4)', '倒垃圾', 0.5);

    // ---- 农场大门停车格：开进去就下车变成人 ----
    this.pad('gate', 0, 16.6, 5.2, 3.2, 'rgba(255,255,255,0.25)', '下车', 0.75);

    // ---- 码头小屋 ----
    const dock = new THREE.Group(); dock.position.set(15.6, 0, 13);
    box(3, 0.3, 3, TEX.mat('planks', { repeat: 0.8, color: 0x9a6a3a }), 0, 0.0, 0, dock); box(2.2, 1.6, 2.2, wall, 0, 0.95, 0, dock);
    const roof = box(2.8, 0.3, 2.8, lam(0x333a40), 0, 1.9, 0, dock); roof.rotation.z = 0.12;
    s.add(dock);
    this.blockers.push({ x0: 14, x1: 16, z0: 11.5, z1: 14.5 });
  }

  // ---------- 农场：草棚 / 鸡舍 / 牛舍 / 货架 / 小路码头 / 风车筒仓 ----------
  buildFarm() {
    const s = this.scene, r = rng(63);
    this.farm = {};
    // 草棚（小棚子）：4 根柱 + 斜顶，草捆堆在下面
    const shed = new THREE.Group(); shed.position.set(-8, 0, 22.6);
    const wood = TEX.mat('planks', { repeat: 1, color: 0xb07a4a });
    for (const [x, z] of [[-2, -1.6], [2, -1.6], [-2, 1.6], [2, 1.6]]) cyl(0.12, 0.14, 2.6 + (z < 0 ? 0.5 : 0), 0x6b4a2b, x, 1.3 + (z < 0 ? 0.25 : 0), z, shed, 8);
    const roof = box(4.8, 0.14, 4.0, wood, 0, 2.85, 0, shed); roof.rotation.x = 0.16;
    for (let i = 0; i < 5; i++) { const b = box(4.9, 0.05, 0.08, 0x7a5230, 0, 2.93 - (i - 2) * 0.13, (i - 2) * 0.8, shed, false); b.rotation.x = 0.16; }
    box(4.4, 0.12, 3.6, TEX.mat('planks', { repeat: 1.2, color: 0x9a6a3a }), 0, 0.06, 0, shed);
    this.baleMeshes = [];
    for (let i = 0; i < 24; i++) { const b = squareBale(); const col = i % 4, row = Math.floor(i / 4) % 3, lay = Math.floor(i / 12); b.position.set(-1.35 + col * 0.9, 0.12 + lay * 0.47, -1.1 + row * 0.85 + (lay ? 0.2 : 0)); b.rotation.y = (r() - 0.5) * 0.2; b.visible = false; shed.add(b); this.baleMeshes.push(b); }
    const sSign = textPlane('草棚', 0.55, { color: '#fff', stroke: '#5a3a1c' }); sSign.position.set(0, 2.2, 2.05); shed.add(sSign);
    s.add(shed);
    this.farmBlockers.push({ x0: -10.4, x1: -5.6, z0: 20.6, z1: 24.4 });
    this.pad('shed', -8, 26.2, 3.6, 2.4, 'rgba(255,255,255,0.22)', '拿草捆', 0.6);
    this.baleOut = new THREE.Vector3(-8, 1.6, 21.5);

    this.farm.coop = this.buildPen(-9.5, 32.5, 'coop');
    this.farm.barn = this.buildPen(9.5, 27.5, 'barn');

    // 货架：木架三层，蛋和奶瓶按数量显示
    const shelf = new THREE.Group(); shelf.position.set(0, 0, 33.5);
    box(3.6, 0.1, 1.1, wood, 0, 0.5, 0, shelf); box(3.6, 0.1, 1.1, wood, 0, 1.15, 0, shelf); box(3.6, 0.1, 1.1, wood, 0, 1.8, 0, shelf);
    for (const x of [-1.7, 1.7]) for (const z of [-0.45, 0.45]) box(0.1, 2.2, 0.1, 0x6b3c1c, x, 1.1, z, shelf, false);
    const awn = box(4.2, 0.08, 1.9, new THREE.MeshStandardMaterial({ map: stripesTex(), roughness: 0.8 }), 0, 2.45, 0.25, shelf); awn.rotation.x = -0.2;
    box(3.7, 0.5, 0.06, lam(0xf2c230), 0, 0.2, -0.55, shelf, false);
    this.eggMeshes = []; this.milkMeshes = []; this.fishMeshes = [];
    for (let i = 0; i < 10; i++) { const f = fish(i + 5); f.scale.setScalar(0.5); f.position.set(-1.5 + i * 0.33, 1.98, 0); f.rotation.y = Math.PI / 2; f.rotation.z = 0.3; f.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.color.setHex(0xc98a4a); } }); f.visible = false; shelf.add(f); this.fishMeshes.push(f); }
    for (let i = 0; i < 30; i++) { const e = sphere(0.09, lam(0xfff4d6), -1.5 + (i % 10) * 0.33, 0.62 + Math.floor(i / 10) * 0.65, -0.2 + ((i % 10) % 2) * 0.35, shelf, 8); e.scale.y = 1.25; e.visible = false; this.eggMeshes.push(e); }
    for (let i = 0; i < 20; i++) { const m = cyl(0.08, 0.09, 0.32, lam(0xf8f8f8), -1.5 + (i % 10) * 0.33, 0.72 + Math.floor(i / 10) * 0.65, 0.15 - ((i % 10) % 2) * 0.35, shelf, 8); box(0.1, 0.06, 0.1, 0x4a90d9, m.position.x, m.position.y + 0.19, m.position.z, shelf, false).visible = false; m.visible = false; this.milkMeshes.push(m); }
    const sign = textPlane('农产品', 0.55, { color: '#fff', stroke: '#7a3b1c' }); sign.position.set(0, 2.15, 1.05); shelf.add(sign);
    this.shelfInfo = infoSprite(4.2); this.shelfInfo.position.set(0, 3.3, 0); shelf.add(this.shelfInfo);
    s.add(shelf);
    this.farmBlockers.push({ x0: -2, x1: 2, z0: 32.8, z1: 34.2 });
    this.pad('shelf', 0, 31.4, 3.6, 2.4, 'rgba(255,255,255,0.22)', '上架', 0.6);
    this.shelfFront = { x: 0, z: 35.4 };

    // 灶台：烤鱼、吃东西
    const cook = new THREE.Group(); cook.position.set(4.8, 0, 22.6);
    for (let i = 0; i < 8; i++) { const st = sphere(0.22, lam(0x777777, { flatShading: true }), Math.cos(i / 8 * 6.28) * 0.75, 0.12, Math.sin(i / 8 * 6.28) * 0.75, cook, 6); st.scale.y = 0.6; }
    for (let i = 0; i < 3; i++) { const lg = cyl(0.07, 0.08, 0.9, 0x5a3a20, 0, 0.12, 0, cook, 6); lg.rotation.z = Math.PI / 2; lg.rotation.y = i * 1.05; }
    this.flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 7), new THREE.MeshStandardMaterial({ color: 0xff8a1c, emissive: 0xff5a00, emissiveIntensity: 1.2, transparent: true, opacity: 0.9 })); this.flame.position.y = 0.4; cook.add(this.flame);
    for (const x of [-0.5, 0.5]) cyl(0.04, 0.04, 1.3, 0x333333, x, 0.65, 0, cook, 6); cyl(0.03, 0.03, 1.2, 0x333333, 0, 1.3, 0, cook, 6).rotation.z = Math.PI / 2;
    const pot = cyl(0.36, 0.28, 0.4, lam(0x2b2f33, { metalness: 0.5, roughness: 0.4 }), 0, 1.0, 0, cook, 12); this.pot = pot;
    const csign = textPlane('灶台', 0.5, { color: '#fff', stroke: '#7a1c10' }); csign.position.set(0, 1.9, 0.6); cook.add(csign);
    const fireLight = new THREE.PointLight(0xff9a3c, 1.5, 5); fireLight.position.set(0, 0.8, 0); cook.add(fireLight);
    s.add(cook);
    this.farmBlockers.push({ x0: 3.7, x1: 5.9, z0: 21.5, z1: 23.7 });
    this.pad('cook', 4.8, 25.3, 3.2, 2.4, 'rgba(255,150,60,0.32)', '烤鱼·吃饭', 0.55);
    this.anim.push((t) => { this.flame.scale.set(1 + Math.sin(t * 9) * 0.15, 1 + Math.sin(t * 13) * 0.25, 1); this.flame.rotation.y = t * 3; fireLight.intensity = 1.3 + Math.sin(t * 11) * 0.4; });

    // 小路 + 码头：顾客从码头上来买东西
    const road = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 6.5), TEX.mat('dirt', { repeat: 1.2, color: 0xd6c39a }));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0.015, 36.8); road.receiveShadow = true; s.add(road);
    const pier = new THREE.Group(); pier.position.set(0, 0, 40);
    const pw = TEX.mat('planks', { repeat: 0.9, color: 0xa8784a });
    for (let i = 0; i < 12; i++) box(2.6, 0.12, 0.62, pw, 0, 0.0, i * 0.7 + 0.3, pier);
    for (let i = 0; i < 4; i++) for (const x of [-1.2, 1.2]) cyl(0.11, 0.13, 2.0, 0x5a3a20, x, -0.7, i * 2.4 + 0.6, pier, 8);
    for (const x of [-1.25, 1.25]) box(0.08, 0.7, 8.3, 0x8a5a2a, x, 0.5, 4.2, pier);
    cyl(0.16, 0.16, 1.0, 0x7a5230, 1.0, 0.5, 8.2, pier, 8);
    s.add(pier);
    this.pierEnd = { x: 0, z: 47.5 }; this.roadStart = { x: 0, z: 40.5 };
    const boat = rowboat(); boat.position.set(2.8, WATER_Y - 0.25, 46.5); boat.rotation.y = 1.4; s.add(boat);
    this.anim.push((t) => { boat.position.y = WATER_Y - 0.25 + Math.sin(t * 1.1) * 0.08; });

    // 风车、筒仓、草垛、稻草人、树
    const wm = GLB.make('windmill1', { height: 7.5 }); if (wm) { wm.position.set(-13.2, 0, 37.2); s.add(wm); this.farmBlockers.push({ x0: -15.2, x1: -11.2, z0: 35.2, z1: 39.2 }); }
    const silo = GLB.make('farmer3', { height: 5.5 }); if (silo) { silo.position.set(13.2, 0, 37); s.add(silo); this.farmBlockers.push({ x0: 11.5, x1: 15, z0: 35.3, z1: 38.7 }); }
    for (let i = 0; i < 4; i++) { const hb = hayBale(r); hb.position.set(4.5 + (i % 2) * 1.3, 0, 36.5 + Math.floor(i / 2) * 1.3); s.add(hb); }
    this.farmBlockers.push({ x0: 3.6, x1: 6.7, z0: 35.6, z1: 38.6 });
    const sc = scarecrow(); sc.position.set(-4.5, 0, 37.5); s.add(sc); this.farmBlockers.push({ x0: -5, x1: -4, z0: 37, z1: 38 });
    for (const [x, z] of [[-14.5, 22], [14.5, 21.5], [-14.8, 30], [14.8, 33]]) { const t = tree(r, r() < 0.5 ? 0 : 1); t.position.set(x, 0, z); s.add(t); }
    this.farmBlockers.push({ x0: -15.5, x1: -13.5, z0: 21, z1: 23 }, { x0: 13.5, x1: 15.5, z0: 20.5, z1: 22.5 }, { x0: -15.8, x1: -13.8, z0: 29, z1: 31 }, { x0: 13.8, x1: 15.8, z0: 32, z1: 34 });
    // 农场草坪（房子下面不长）
    const padRects = ['shed', 'coop', 'barn', 'shelf', 'cook'].map((k) => this.pads[k]);
    const avoid = [...this.farmBlockers, ...padRects, { x0: -1.5, x1: 1.5, z0: 33, z1: 40.5 }, { x0: -13.3, x1: -5.7, z0: 28.5, z1: 36.5 }, { x0: 5.7, x1: 13.3, z0: 23.5, z1: 31.5 }];
    makeLawn(s, ISLAND.x0 + 0.6, FARM_Z + 0.7, ISLAND.x1 - ISLAND.x0 - 1.2, ISLAND.z1 - FARM_Z - 1.2, 0, 2.2, this.uniforms, 8, avoid);
  }

  buildPen(x, z, kind) {
    const s = this.scene, g = new THREE.Group(); g.position.set(x, 0, z);
    const W = 7.6, D = 7.6, rail = lam(0xf0f0ea);
    const gap = [-1.1, 1.1];   // 前栏留口（z = +D/2）
    for (const y of [0.35, 0.65]) {
      box(W, 0.08, 0.08, rail, 0, y, -D / 2, g); box(0.08, 0.08, D, rail, -W / 2, y, 0, g); box(0.08, 0.08, D, rail, W / 2, y, 0, g);
      box(W / 2 + gap[0] - 0.0, 0.08, 0.08, rail, (-W / 2 + gap[0]) / 2, y, D / 2, g); box(W / 2 - gap[1], 0.08, 0.08, rail, (W / 2 + gap[1]) / 2, y, D / 2, g);
    }
    for (let i = 0; i <= 6; i++) { box(0.14, 0.85, 0.14, rail, -W / 2 + i * W / 6, 0.42, -D / 2, g); const px = -W / 2 + i * W / 6; if (px < gap[0] || px > gap[1]) box(0.14, 0.85, 0.14, rail, px, 0.42, D / 2, g); }
    for (const px of gap) box(0.14, 0.85, 0.14, rail, px, 0.42, D / 2, g);
    for (let i = 1; i < 6; i++) { box(0.14, 0.85, 0.14, rail, -W / 2, 0.42, -D / 2 + i * D / 6, g); box(0.14, 0.85, 0.14, rail, W / 2, 0.42, -D / 2 + i * D / 6, g); }
    const dirt = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.3, D - 0.3), TEX.mat('dirt', { repeat: 1.5, color: 0xd9c8a0 })); dirt.rotation.x = -Math.PI / 2; dirt.position.y = 0.012; dirt.receiveShadow = true; g.add(dirt);
    const sil = textPlane(kind === 'coop' ? '🐔' : '🐄', 2.2, { color: '#8a7b5a', stroke: '#8a7b5a' });
    sil.rotation.x = -Math.PI / 2; sil.position.set(0, 0.03, 0.4); sil.material.opacity = 0.55; g.add(sil);
    const house = new THREE.Group(); house.visible = false; g.add(house);
    const hz = -D / 2 + 1.6;
    const bld = GLB.make(kind === 'coop' ? 'barn5' : 'barn4', { height: kind === 'coop' ? 2.6 : 4.2 });
    if (bld) { bld.position.set(0, 0, hz); house.add(bld); }
    const trough = box(1.6, 0.35, 0.5, TEX.mat('planks', { repeat: 2, color: 0x8a5a2a }), 2.2, 0.18, 1.6, house);
    const hay = box(1.4, 0.12, 0.34, lam(0xd9c25a), 2.2, 0.36, 1.6, house); hay.visible = false;
    const animals = [];
    for (let i = 0; i < (kind === 'coop' ? 4 : 2); i++) {
      const a = animal(kind); if (!a) continue;
      a.position.set(-2 + i * 1.3, 0, 0.6 + (i % 2) * 1.2);
      house.add(a); animals.push({ g: a, phase: i * 1.7, home: a.position.clone(), tx: 0, tz: 0, wait: i, speed: kind === 'coop' ? 1.1 : 0.7 });
    }
    const info = infoSprite(3.6); info.position.set(0, 3.6, hz); g.add(info);
    const label = textPlane(kind === 'coop' ? '鸡舍' : '牛舍', 0.7);
    label.rotation.x = -Math.PI / 2; label.position.set(0, 0.05, D / 2 + 0.55); g.add(label);
    s.add(g);
    this.pad(kind, x, z + D / 2 + 2.2, 3.4, 2.4, 'rgba(255,255,255,0.22)', kind === 'coop' ? '喂鸡·收蛋' : '喂牛·挤奶', 0.55);
    this.farmBlockers.push({ x0: x - W / 2, x1: x + W / 2, z0: z - D / 2, z1: z + D / 2 });
    const pen = { g, house, sil, info, animals, hay, kind, W, D, hz, fed: false };
    this.anim.push((t, dt) => {
      if (!house.visible) return;
      hay.visible = pen.fed;
      for (const an of pen.animals) {
        const mix = an.g.userData.mix;
        if (an.wait > 0) { an.wait -= dt; mix.play('Idle'); }
        else {
          if (!an.moving) { an.tx = (Math.random() - 0.5) * (W - 2.4); an.tz = -0.6 + Math.random() * (D / 2 + 0.2); an.moving = true; }
          const dx = an.tx - an.g.position.x, dz = an.tz - an.g.position.z, d = Math.hypot(dx, dz);
          if (d < 0.15) { an.moving = false; an.wait = 1 + Math.random() * 3; }
          else { an.g.position.x += dx / d * an.speed * dt; an.g.position.z += dz / d * an.speed * dt; an.g.rotation.y = Math.atan2(-dx, -dz); mix.play('Walk'); }
        }
        mix.update(dt);
      }
    });
    return pen;
  }

  // ---------- 海里 ----------
  buildSeaLife() {
    const s = this.scene, r = rng(77);
    // 各种鱼（glTF 真模型 + 游动动画）：金鱼/锦鲤/小丑鱼/鲫鱼/蓝金鱼/鲶鱼在岛两侧，鲨鱼/鳄鱼/海豚/鲸在外海
    this.fishes = [];
    for (const sp of FISH) {
      for (let i = 0; i < sp.n; i++) {
        let g = GLB.make(sp.model, { rotY: sp.rotY, shadow: false });
        if (g) { const L = Math.max(g.userData.size.x, g.userData.size.z) || 1; g.scale.setScalar(sp.len / L); g.position.y = 0; }
        else g = fish(i);
        s.add(g);
        const side = r() < 0.5 ? -1 : 1;
        // 近海鱼：一半在下水滑道外（x -17~-30，z 4~24）成群，一半散在岛两侧
        const nearSlip = sp.zone === 'near' && i % 2 === 0;
        const cx = nearSlip ? -17 - r() * 13 : sp.zone === 'near' ? side * (20 + r() * 9) : sp.zone === 'mid' ? side * (27 + r() * 10) : side * (36 + r() * 22);
        const cz = nearSlip ? 4 + r() * 20 : sp.zone === 'far' ? -25 + r() * 80 : -8 + r() * 50;
        if (sp.glow) g.traverse((m) => { if (m.isMesh && m.material && m.material.emissive) { m.material = m.material.clone(); m.material.emissive.set(sp.glow); m.material.emissiveIntensity = 0.35; } });
        const mix = g.userData.anims && g.userData.anims.length ? GLB.mixer(g) : null;
        if (mix) mix.play(sp.anim && mix.clips[sp.anim] ? sp.anim : Object.keys(mix.clips)[0], 0, 0.8 + r() * 0.5);
        this.fishes.push({ g, sp, mix, cx, cz, R: sp.len * 2 + 2 + r() * 4, w: (sp.speed + r() * 0.15) * (r() < 0.5 ? 1 : -1), ph: r() * 6, y: WATER_Y - sp.depth - r() * 0.1, jump: sp.jump ? 10 + r() * 20 : 1e9, tick: i & 1 });
      }
    }
    this.ducks = [];
    for (let i = 0; i < 4; i++) { const d = duck(); s.add(d); this.ducks.push({ g: d, cx: 19 + r() * 4, cz: 26 + r() * 6, R: 1.5 + r(), w: 0.3, ph: r() * 6 }); }
    for (let i = 0; i < 16; i++) { const p = lilyPad(r); p.position.set(-18.5 - r() * 5, WATER_Y + 0.03, 22 + r() * 12); s.add(p); }
    this.barge = hayBarge(); this.barge.position.set(-24, WATER_Y - 0.3, 3.5); s.add(this.barge);
    this.rowboat = rowboat(); this.rowboat.position.set(21.5, WATER_Y - 0.25, 7); this.rowboat.rotation.y = 0.6; s.add(this.rowboat);
    this.sail = sailboat(); s.add(this.sail);
    this.hittables = [];
    for (const f of this.fishes) if (f.sp.price > 0) this.hittables.push({ g: f.g, r: Math.max(0.5, f.sp.len * 0.45), kind: 'fish', species: f.sp.key, dead: 0 });
    for (const d of this.ducks) this.hittables.push({ g: d.g, r: 0.4, kind: 'junk', dead: 0 });
    this.hittables.push({ g: this.rowboat, r: 1.8, kind: 'junk', dead: 0 }, { g: this.barge, r: 3.2, kind: 'junk', dead: 0 });
    this.anim.push((t, dt) => {
      const bob = (g, base, amp = 0.08, sp = 1) => { g.position.y = base + Math.sin(t * sp + g.position.x) * amp; g.rotation.z = Math.sin(t * 0.8 * sp) * 0.02; };
      bob(this.barge, WATER_Y - 0.3, 0.06, 0.8); bob(this.rowboat, WATER_Y - 0.25, 0.1, 1.2);
      const sa = t * 0.06; this.sail.position.set(Math.cos(sa) * 92, WATER_Y - 0.2 + Math.sin(t) * 0.06, 15 + Math.sin(sa) * 84); this.sail.rotation.y = -sa + Math.PI / 2; this.sail.rotation.z = Math.sin(t * 0.9) * 0.04;
      for (const f of this.fishes) {
        if (!f.g.visible) continue;
        const a = t * f.w + f.ph;
        const jumping = f.jump < 1e8 && ((t + f.ph) % f.jump) < 1.2;
        const jt = jumping ? ((t + f.ph) % f.jump) / 1.2 : 0;
        f.g.position.set(f.cx + Math.cos(a) * f.R, jumping ? WATER_Y + Math.sin(jt * Math.PI) * 1.4 : f.y + Math.sin(t * 0.7 + f.ph) * 0.1, f.cz + Math.sin(a) * f.R);
        // 圆周运动的切线方向：w>0 逆时针，模型朝 -z
        f.g.rotation.y = -a + (f.w > 0 ? Math.PI : 0); f.g.rotation.x = jumping ? (0.5 - jt) * 1.6 : 0;
        if (f.mix) { if (f.sp.zone !== 'far' || (f.tick ^= 1)) f.mix.update(f.sp.zone === 'far' ? dt * 2 : dt); }   // 远区大鱼各自隔帧更新 else if (f.g.userData.tail) f.g.userData.tail.rotation.y = Math.sin(t * 9 + f.ph) * 0.45;
      }
      for (const d of this.ducks) { const a = t * d.w + d.ph; d.g.position.set(d.cx + Math.cos(a) * d.R, WATER_Y + 0.02 + Math.sin(t * 2 + d.ph) * 0.03, d.cz + Math.sin(a) * d.R); d.g.rotation.y = -a; }
    });
  }

  // 草场四周风景（每关重建）：只在风景带里，草区内不放任何东西
  // rail：这一关有小火车，草场边上（左、上、右）铺铁轨，那一圈的树、草堆、稻草人和长草都让开
  decorateField(field, rail = false) {
    const g = new THREE.Group(), r = rng(field.def.seed + 5), m = field.margin;
    const xL = field.x0 - m * 0.55, xR = -field.x0 + m * 0.55, zTop = field.z0 - m * 0.55;
    if (!rail) {
    for (let x = xL + 1; x < xR; x += 3.2 + r() * 2) { const t = tree(r, r() < 0.6 ? 0 : 1); t.position.set(x + (r() - 0.5), FIELD_Y, zTop + (r() - 0.5) * 0.8); g.add(t); }
    for (let z = field.z0 + 1; z < field.z1 - 2; z += 3 + r() * 2.5) {
      for (const x of [xL, xR]) { const t = r() < 0.7 ? tree(r, r() < 0.5 ? 0 : 1) : bush(r); t.position.set(x + (r() - 0.5) * 0.6, FIELD_Y, z); g.add(t); }
    }
    for (let i = 0; i < 4; i++) { const hb = hayBale(r); hb.position.set(xL + 0.2, FIELD_Y, field.z1 - 1.5 - i * 1.3); hb.scale.setScalar(0.8); g.add(hb); }
    const sc = scarecrow(); sc.position.set(xR - 0.2, FIELD_Y, field.z1 - 2); g.add(sc);
    }
    // 风景带草坪
    const W = field.def.w, D = field.def.d;
    const holes = [{ x0: field.x0, x1: -field.x0, z0: field.z0, z1: field.z1 }];
    if (rail) { const o = TRAIN.off, h = 1.0; holes.push({ x0: field.x0 - o - h, x1: field.x0 - o + h, z0: field.z0 - m, z1: field.z1 }, { x0: -field.x0 + o - h, x1: -field.x0 + o + h, z0: field.z0 - m, z1: field.z1 }, { x0: field.x0 - m, x1: -field.x0 + m, z0: field.z0 - o - h, z1: field.z0 - o + h }); }
    makeLawn(g, field.x0 - m, field.z0 - m, W + 2 * m, D + m, FIELD_Y, 2.0, this.uniforms, field.def.seed, holes);
    field.group.add(g);
  }

  // 货架/草棚展示
  setShelf(egg, milk, fishN = 0) { this.eggMeshes.forEach((m, i) => m.visible = i < egg); this.milkMeshes.forEach((m, i) => m.visible = i < milk); this.fishMeshes.forEach((m, i) => m.visible = i < fishN); }
  // 船撞到水里的东西：鱼进后备箱当鱼，鸭子/船撞坏当垃圾；30 秒后原地复活
  hitWater(x, z, r, t, room = Infinity) {
    const out = [];
    for (const h of this.hittables) {
      if (h.dead) { if (t > h.dead) { h.dead = 0; h.g.visible = true; } continue; }
      const p = h.g.position; if ((p.x - x) ** 2 + (p.z - z) ** 2 > (r + h.r) ** 2) continue;
      if (out.length >= room) { out.full = true; continue; }   // 后备箱没地方：东西留在水里
      h.dead = t + 30; h.g.visible = false; out.push({ kind: h.kind, species: h.species });
    }
    return out;
  }
  setBales(n) { this.baleMeshes.forEach((m, i) => m.visible = i < n); }
  setShopUnlocked(on) {
    if (this._shopOn === on) return; this._shopOn = on;
    for (const { m, c, e } of this.shopMats) {
      m.transparent = !on; m.opacity = on ? 1 : 0.45; m.emissive.setHex(on ? e : 0x2bff4a); m.emissiveIntensity = on ? (e ? 0.25 : 0) : 0.6; m.color.setHex(on ? c : 0x7dff8a); m.needsUpdate = true;
    }
  }
  update(t, dt) { for (const f of this.anim) f(t, dt); }
}
