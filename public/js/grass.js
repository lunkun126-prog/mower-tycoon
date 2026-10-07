// 草场：每种作物一个 InstancedMesh（叶片/花生丛/向日葵为程序几何，玉米麦子南瓜胡萝卜为 glTF 烘焙），
// 顶点着色器做风 + 被割草机压倒；割完格子彻底清空 + 地面亮条纹；花随格子一起割；宝石与金草；装饰草坪
import * as THREE from 'three';
import { CELL, FIELD_Y, RAMP, CROPS, BLADES_PER_CELL, FIELD_MARGIN, FIELD_BONUS } from './config.js?v=1007';
import { rng, lam, TEX, GLB } from './assets.js?v=1007';

// ---------- 程序几何：都带 position/normal/color/bend ----------
class GeoBuilder {
  constructor() { this.pos = []; this.col = []; this.bend = []; this.idx = []; }
  vert(x, y, z, c, b) { this.pos.push(x, y, z); this.col.push(c.r, c.g, c.b); this.bend.push(b); return this.pos.length / 3 - 1; }
  quad(a, b, c, d) { this.idx.push(a, b, c, b, d, c); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('bend', new THREE.Float32BufferAttribute(this.bend, 1));
    g.setIndex(this.idx);
    const n = new Float32Array(this.pos.length); for (let i = 1; i < n.length; i += 3) n[i] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    return g;
  }
}
const C = (h) => new THREE.Color(h);
// 叶片簇：n 片，4 段，底宽顶尖，底色→尖色
export function bladeGeometry(seed, n, baseHex, tipHex, hMul = 1) {
  const r = rng(seed), gb = new GeoBuilder(), base = C(baseHex), tip = C(tipHex), c = new THREE.Color();
  for (let b = 0; b < n; b++) {
    const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * 0.3;
    const cx = Math.cos(a) * rad, cz = Math.sin(a) * rad;
    const yaw = r() * Math.PI, w = 0.045 + r() * 0.03, h = (0.8 + r() * 0.35) * hMul;
    const lx = Math.cos(yaw) * w, lz = Math.sin(yaw) * w;
    const leanX = (r() - 0.5) * 0.5, leanZ = (r() - 0.5) * 0.5, curl = 0.3 + r() * 0.5;
    const ids = [];
    for (let s = 0; s <= 4; s++) {
      const t = s / 4, ww = (1 - t * t) * (s === 4 ? 0 : 1), bend = t * t * curl;
      const px = cx + leanX * bend, pz = cz + leanZ * bend, py = h * t * (1 - 0.12 * bend);
      c.copy(base).lerp(tip, t).multiplyScalar(0.55 + 0.45 * t);
      ids.push(gb.vert(px - lx * ww, py, pz - lz * ww, c, t), gb.vert(px + lx * ww, py, pz + lz * ww, c, t));
    }
    for (let s = 0; s < 4; s++) gb.quad(ids[s * 2], ids[s * 2 + 1], ids[s * 2 + 2], ids[s * 2 + 3]);
  }
  return gb.build();
}
// 花生丛：矮圆叶片莲座 + 黄色小花
function bushGeometry(seed, baseHex, tipHex) {
  const r = rng(seed), gb = new GeoBuilder(), base = C(baseHex), tip = C(tipHex), c = new THREE.Color(), yel = C(0xffd23a);
  for (let b = 0; b < 14; b++) {
    const a = r() * Math.PI * 2, len = 0.28 + r() * 0.16, w = 0.08, h = 0.25 + r() * 0.2;
    const dx = Math.cos(a), dz = Math.sin(a), px = -dz * w, pz = dx * w;
    const ids = [];
    for (let s = 0; s <= 3; s++) { const t = s / 3, ww = s === 3 ? 0 : 1 - t * 0.5; c.copy(base).lerp(tip, t).multiplyScalar(0.6 + 0.4 * t); const x = dx * len * t, z = dz * len * t, y = h * Math.sin(t * Math.PI * 0.9) + 0.02; ids.push(gb.vert(x - px * ww, y, z - pz * ww, c, t * 0.5), gb.vert(x + px * ww, y, z + pz * ww, c, t * 0.5)); }
    for (let s = 0; s < 3; s++) gb.quad(ids[s * 2], ids[s * 2 + 1], ids[s * 2 + 2], ids[s * 2 + 3]);
  }
  for (let k = 0; k < 4; k++) { const a = r() * 6.3, x = Math.cos(a) * 0.15, z = Math.sin(a) * 0.15, y = 0.2 + r() * 0.15; const i0 = gb.vert(x - 0.04, y, z, yel, 0.4), i1 = gb.vert(x + 0.04, y, z, yel, 0.4), i2 = gb.vert(x, y + 0.06, z - 0.04, yel, 0.45), i3 = gb.vert(x, y + 0.06, z + 0.04, yel, 0.45); gb.quad(i0, i1, i2, i3); }
  return gb.build();
}
// 向日葵：茎 + 两片叶 + 花盘（花瓣圈）
function sunflowerGeometry(seed) {
  const r = rng(seed), gb = new GeoBuilder(), green = C(0x4f9a2a), leaf = C(0x5fb335), pet = C(0xffc21a), core = C(0x5a3413);
  const h = 1.0, w = 0.035;
  const ids = [];
  for (let s = 0; s <= 3; s++) { const t = s / 3; ids.push(gb.vert(-w, h * t, 0, green, t), gb.vert(w, h * t, 0, green, t), gb.vert(0, h * t, -w, green, t), gb.vert(0, h * t, w, green, t)); }
  for (let s = 0; s < 3; s++) { gb.quad(ids[s * 4], ids[s * 4 + 1], ids[s * 4 + 4], ids[s * 4 + 5]); gb.quad(ids[s * 4 + 2], ids[s * 4 + 3], ids[s * 4 + 6], ids[s * 4 + 7]); }
  for (const sx of [-1, 1]) { const y = 0.4 + r() * 0.15, b = y / h; const a = gb.vert(0, y, 0, leaf, b), bb = gb.vert(sx * 0.3, y + 0.12, 0.1, leaf, b + 0.05), cc = gb.vert(sx * 0.3, y + 0.12, -0.1, leaf, b + 0.05), d = gb.vert(sx * 0.12, y + 0.02, 0, leaf, b); gb.quad(a, bb, cc, d); }
  // 花盘朝 +z 微低头
  const cy = h, R = 0.26, tilt = 0.35, cz = 0.05;
  const cen = gb.vert(0, cy, cz, core, 1);
  const ring = [], ring2 = [];
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ring.push(gb.vert(Math.cos(a) * R * 0.45, cy + Math.sin(a) * R * 0.45 * Math.cos(tilt), cz + Math.sin(a) * R * 0.45 * Math.sin(tilt), core, 1)); ring2.push(gb.vert(Math.cos(a) * R, cy + Math.sin(a) * R * Math.cos(tilt), cz + Math.sin(a) * R * Math.sin(tilt) + 0.02, pet, 1)); }
  for (let i = 0; i < 12; i++) { const j = (i + 1) % 12; gb.idx.push(cen, ring[i], ring[j]); gb.idx.push(cen, ring[j], ring[i]); gb.quad(ring[i], ring[j], ring2[i], ring2[j]); gb.quad(ring[j], ring[i], ring2[j], ring2[i]); }
  return gb.build();
}
// 雏菊（随格子割掉的小花）
function daisyGeometry(seed) {
  const r = rng(seed), gb = new GeoBuilder(), green = C(0x4f9a2a), white = C(0xffffff), yel = C(0xffd400);
  for (let f = 0; f < 3; f++) {
    const ox = (r() - 0.5) * 0.3, oz = (r() - 0.5) * 0.3, h = 0.35 + r() * 0.2, w = 0.02;
    const a = gb.vert(ox - w, 0, oz, green, 0), b = gb.vert(ox + w, 0, oz, green, 0), c = gb.vert(ox - w, h, oz, green, 1), d = gb.vert(ox + w, h, oz, green, 1); gb.quad(a, b, c, d); gb.quad(b, a, d, c);
    const cen = gb.vert(ox, h + 0.01, oz, yel, 1), ring = [];
    for (let i = 0; i < 8; i++) { const aa = i / 8 * 6.283; ring.push(gb.vert(ox + Math.cos(aa) * 0.09, h, oz + Math.sin(aa) * 0.09, white, 1)); }
    for (let i = 0; i < 8; i++) { const j = (i + 1) % 8; gb.idx.push(cen, ring[i], ring[j], cen, ring[j], ring[i]); }
  }
  return gb.build();
}

// 作物几何缓存
const geoCache = {};
function cropGeometry(c) {
  if (geoCache[c.key]) return geoCache[c.key];
  let g;
  if (c.model === 'blade') g = bladeGeometry(5 + c.key.length, BLADES_PER_CELL, c.base, c.tip, 1);
  else if (c.model === 'bush') g = bushGeometry(9, c.base, c.tip);
  else if (c.model === 'sunflower') g = sunflowerGeometry(3);
  else { g = GLB.bake(c.model, { height: 1, yOffset: c.yOffset || 0 }); if (!g || !g.attributes.position.count) g = bladeGeometry(7, BLADES_PER_CELL, 0x2e7a1c, 0x8fe35a, 1); }
  g.userData.shared = true;
  geoCache[c.key] = g;
  return g;
}

// 风 + 压倒 材质
export function cropMaterial(uniforms, extra = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85, metalness: 0, ...extra });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime; sh.uniforms.uMower = uniforms.uMower;
    sh.vertexShader = 'uniform float uTime; uniform vec3 uMower; attribute float bend;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float t = bend;
      vec4 ip = instanceMatrix[3];
      float g1 = sin(uTime * 1.4 + ip.x * 0.35 + ip.z * 0.2);
      float g2 = sin(uTime * 3.1 + ip.x * 1.3 - ip.z * 0.9);
      float wind = (g1 * 0.12 + g2 * 0.04) * t * t;
      transformed.x += wind; transformed.z += wind * 0.6; transformed.y -= abs(wind) * 0.4;
      vec2 d = ip.xz - uMower.xz; float dist = length(d);
      float push = smoothstep(2.2, 0.4, dist) * uMower.y;
      vec2 dir = dist > 0.001 ? d / dist : vec2(1.0, 0.0);
      transformed.xz += dir * push * t * 0.9;
      transformed.y *= 1.0 - push * 0.75 * t;`);
  };
  return mat;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _c = new THREE.Color();

export class Field {
  constructor(scene, def, uniforms) {
    this.scene = scene; this.def = def; this.uniforms = uniforms;
    this.group = new THREE.Group(); scene.add(this.group);
    const W = def.w, D = def.d;
    this.cols = Math.round(W / CELL); this.rows = Math.round(D / CELL);
    this.x0 = -W / 2; this.z0 = RAMP.z0 - D; this.z1 = RAMP.z0;
    this.margin = FIELD_MARGIN;
    this.hard = def.hard || 1;   // 作物硬度倍数（关卡越高越硬）
    const N = this.cols * this.rows;
    this.type = new Uint8Array(N); this.hp = new Float32Array(N); this.cut = new Uint8Array(N);
    this.gold = new Uint8Array(N); this.slot = new Int32Array(N); this.flowerSlot = new Int32Array(N).fill(-1);
    this.cutCount = 0; this.validCount = N; this.gems = [];
    this.lo = new Int32Array(CROPS.length).fill(0x7fffffff); this.hi = new Int32Array(CROPS.length).fill(-1); this.flo = 0x7fffffff; this.fhi = -1;
    const r = rng(def.seed);
    const ph = [r() * 6, r() * 6, r() * 6];
    const counts = new Array(CROPS.length).fill(0);
    for (let j = 0; j < this.rows; j++) for (let i = 0; i < this.cols; i++) {
      const idx = j * this.cols + i, x = this.x0 + (i + 0.5) * CELL, z = this.z0 + (j + 0.5) * CELL;
      const f = Math.pow(1 - j / this.rows, 1.4);
      const nz = Math.sin(x * 0.19 + ph[0]) * Math.cos(z * 0.16 + ph[1]) * 0.5 + Math.sin(x * 0.06 + z * 0.08 + ph[2]) * 0.5;
      const k = Math.max(0, Math.min(def.tiers.length - 1, Math.floor(f * def.tiers.length + nz * 0.4)));
      const t = def.tiers[k];
      this.type[idx] = t; this.hp[idx] = CROPS[t].hp * this.hard; this.slot[idx] = counts[t]++;
    }
    for (let k = 0; k < FIELD_BONUS.goldPatches; k++) {
      const x = this.x0 + 3 + r() * (W - 6), z = this.z0 + 3 + r() * (D - 8);
      this.forCells(x, z, FIELD_BONUS.goldRadius, (idx) => { this.gold[idx] = 1; });
    }

    // 高台：岩壁 + 风景带草坪 + 可割区地面（真实草地贴图 × 条纹层）
    const PW = W + this.margin * 2, PD = D + this.margin;
    const cliff = new THREE.Mesh(new THREE.BoxGeometry(PW, FIELD_Y + 3.5, PD), TEX.mat('rock', { repeat: 0.35, color: 0x9a8a78 }));
    cliff.position.set(0, (FIELD_Y - 3.5) / 2 - 0.02, this.z0 - this.margin + PD / 2); cliff.receiveShadow = true; cliff.castShadow = true;
    this.group.add(cliff);
    const rim = new THREE.Mesh(new THREE.PlaneGeometry(PW, PD), TEX.mat('grass2', { repeat: 0.9, color: 0xb9d98a }));
    rim.rotation.x = -Math.PI / 2; rim.position.set(0, FIELD_Y + 0.002, this.z0 - this.margin + PD / 2); rim.receiveShadow = true;
    this.group.add(rim);
    this.texData = new Uint8Array(N * 4);
    this.tex = new THREE.DataTexture(this.texData, this.cols, this.rows, THREE.RGBAFormat);
    this.tex.magFilter = THREE.LinearFilter; this.tex.minFilter = THREE.LinearFilter; this.tex.colorSpace = THREE.SRGBColorSpace;
    const topMat = TEX.mat('grass', { repeat: 1.2 }).clone(); topMat.userData.shared = false;
    for (const k of ['map', 'normalMap', 'roughnessMap']) { topMat[k] = topMat[k].clone(); topMat[k].repeat.set(W * 0.55, D * 0.55); topMat[k].needsUpdate = true; }
    topMat.onBeforeCompile = (sh) => {
      sh.uniforms.uStripe = { value: this.tex };
      sh.vertexShader = 'varying vec2 vSuv;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvSuv = uv;');
      sh.fragmentShader = 'uniform sampler2D uStripe;\nvarying vec2 vSuv;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= texture2D(uStripe, vSuv).rgb * 1.9;');
    };
    this.topMat = topMat;
    const top = new THREE.Mesh(new THREE.PlaneGeometry(W, D), topMat);
    top.rotation.x = -Math.PI / 2; top.position.set(0, FIELD_Y + 0.012, this.z0 + D / 2); top.receiveShadow = true;
    this.group.add(top);

    // 每种作物一个实例网格
    this.meshes = [];
    const mat = cropMaterial(uniforms); this.mat = mat;
    for (let t = 0; t < CROPS.length; t++) {
      if (!counts[t]) { this.meshes.push(null); continue; }
      const im = new THREE.InstancedMesh(cropGeometry(CROPS[t]), mat, counts[t]);
      im.frustumCulled = false; im.receiveShadow = true; im.castShadow = CROPS[t].model !== 'blade';
      this.group.add(im); this.meshes.push(im);
    }
    // 花：随机 2.5% 的格子，跟格子一起割掉
    const nf = Math.floor(N * 0.025);
    this.flowers = new THREE.InstancedMesh(daisyGeometry(11), mat, Math.max(1, nf)); this.flowers.frustumCulled = false; this.flowers.count = nf;
    this.flowerCells = [];
    for (let k = 0; k < nf; k++) { const idx = Math.floor(r() * N); this.flowerSlot[idx] = k; this.flowerCells.push(idx); }
    this.group.add(this.flowers);

    this.heights = new Float32Array(N); this.yaws = new Float32Array(N); this.jit = new Float32Array(N * 2);
    for (let idx = 0; idx < N; idx++) {
      const c = CROPS[this.type[idx]];
      this.heights[idx] = c.h * (0.85 + r() * 0.3);
      this.yaws[idx] = r() * Math.PI * 2; this.jit[idx * 2] = (r() - 0.5) * 0.2; this.jit[idx * 2 + 1] = (r() - 0.5) * 0.2;
      this.writeMatrix(idx); this.paint(idx);
      _c.setHex(this.gold[idx] ? 0xffe17a : 0xffffff).multiplyScalar(0.85 + r() * 0.3);
      this.meshes[this.type[idx]].setColorAt(this.slot[idx], _c);
      if (this.flowerSlot[idx] >= 0) { _c.setHex(0xffffff); this.flowers.setColorAt(this.flowerSlot[idx], _c); }
    }
    for (const m of this.meshes) if (m) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    this.flowers.instanceMatrix.needsUpdate = true; if (this.flowers.instanceColor) this.flowers.instanceColor.needsUpdate = true;
    this.tex.needsUpdate = true;

    // 宝石
    const gemGeo = new THREE.OctahedronGeometry(0.28, 0);
    this.gemMat = new THREE.MeshStandardMaterial({ color: 0x5fd4ff, emissive: 0x1f7fbf, emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.3 });
    for (let k = 0; k < FIELD_BONUS.gems; k++) {
      const x = this.x0 + 2 + r() * (W - 4), z = this.z0 + 2 + r() * (D - 6);
      const m = new THREE.Mesh(gemGeo, this.gemMat);
      m.position.set(x, FIELD_Y + 0.55, z); m.castShadow = true; this.group.add(m);
      this.gems.push({ x, z, m, taken: false });
    }
    this._lo = Infinity; this._hi = -Infinity; this.dirtySet = new Set();
  }

  cellPos(idx, out) {
    const i = idx % this.cols, j = (idx / this.cols) | 0;
    return out.set(this.x0 + (i + 0.5) * CELL + this.jit[idx * 2], FIELD_Y, this.z0 + (j + 0.5) * CELL + this.jit[idx * 2 + 1]);
  }
  writeMatrix(idx) {
    this.cellPos(idx, _p);
    _q.setFromAxisAngle(_up, this.yaws[idx]);
    const c = CROPS[this.type[idx]];
    if (this.cut[idx]) _s.set(0.0001, 0.0001, 0.0001);
    else { const sxz = c.model === 'blade' ? 1.1 : c.model === 'bush' ? 1.15 : 0.55 + 0.3 * (c.h / 1.9), k = 0.35 + 0.65 * Math.min(1, this.hp[idx] / (c.hp * this.hard)); _s.set(sxz, this.heights[idx] * k, sxz); }
    _m.compose(_p, _q, _s);
    this.meshes[this.type[idx]].setMatrixAt(this.slot[idx], _m);
    const fs = this.flowerSlot[idx];
    if (fs >= 0) { _s.set(this.cut[idx] ? 0.0001 : 1, this.cut[idx] ? 0.0001 : 1, this.cut[idx] ? 0.0001 : 1); _m.compose(_p, _q, _s); this.flowers.setMatrixAt(fs, _m); }
  }
  paint(idx) {
    const i = idx % this.cols, j = (idx / this.cols) | 0, g = CROPS[this.type[idx]];
    const hex = this.cut[idx] ? (((j >> 2) & 1) ? g.cutA : g.cutB) : g.under;
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
  // 切割：out 收 {t, gold}；返回"割不动"的程度（锯子锋利时恒 0）
  cutAt(x, z, rad, strength, dt, out) {
    let tough = 0;
    this.forCells(x, z, rad, (idx) => {
      if (this.cut[idx]) return;
      const hp = this.hp[idx];
      if (strength >= hp) this.hp[idx] = 0;
      else {
        // 硬草：锯子磨一会儿才断；草被一点点锯矮，看得出在割
        this.hp[idx] -= strength * 2.6 * dt; tough = Math.max(tough, hp / strength);
        if (this.hp[idx] > 0) { this.writeMatrix(idx); const t = this.type[idx], sl = this.slot[idx]; this.lo[t] = Math.min(this.lo[t], sl); this.hi[t] = Math.max(this.hi[t], sl); this.dirtySet.add(t); this.dirty = true; }
      }
      if (this.hp[idx] <= 0) this.markCut(idx, out);
    });
    for (const g of this.gems) {
      if (!g.taken && (g.x - x) ** 2 + (g.z - z) ** 2 < (rad + 0.3) ** 2) { g.taken = true; g.m.visible = false; if (out) out.gems = (out.gems || 0) + 1; }
    }
    return tough;
  }
  markCut(idx, out) {
    this.cut[idx] = 1; this.cutCount++;
    this.writeMatrix(idx); this.paint(idx);
    const t = this.type[idx], sl = this.slot[idx];
    this.lo[t] = Math.min(this.lo[t], sl); this.hi[t] = Math.max(this.hi[t], sl);
    const fs = this.flowerSlot[idx]; if (fs >= 0) { this.flo = Math.min(this.flo, fs); this.fhi = Math.max(this.fhi, fs); }
    this.dirtySet.add(t); this.dirty = true;
    if (out) out.push({ t: this.type[idx], gold: this.gold[idx] });
  }
  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    // 只上传本次改动到的实例区间（大关卡单类型矩阵有 1.5MB，整块传会掉帧）
    for (const t of this.dirtySet) {
      const m = this.meshes[t]; if (!m) continue;
      m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(this.lo[t] * 16, (this.hi[t] - this.lo[t] + 1) * 16); m.instanceMatrix.needsUpdate = true;
      this.lo[t] = 0x7fffffff; this.hi[t] = -1;
    }
    this.dirtySet.clear();
    if (this.fhi >= 0) { this.flowers.instanceMatrix.clearUpdateRanges(); this.flowers.instanceMatrix.addUpdateRange(this.flo * 16, (this.fhi - this.flo + 1) * 16); this.flowers.instanceMatrix.needsUpdate = true; this.flo = 0x7fffffff; this.fhi = -1; }
    this.tex.needsUpdate = true;
  }
  update(t) { for (const g of this.gems) if (!g.taken) { g.m.rotation.y = t * 1.5; g.m.position.y = FIELD_Y + 0.55 + Math.sin(t * 2 + g.x) * 0.08; } }
  get progress() { return this.validCount ? this.cutCount / this.validCount : 1; }

  serialize() {
    const bytes = new Uint8Array(Math.ceil(this.cut.length / 8));
    for (let i = 0; i < this.cut.length; i++) if (this.cut[i]) bytes[i >> 3] |= 1 << (i & 7);
    let s = ''; for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s) + '|' + this.gems.map((g) => g.taken ? 1 : 0).join('');
  }
  load(str) {
    try {
      const [bits, gems] = String(str).split('|');
      const s = atob(bits);
      for (let i = 0; i < this.cut.length; i++) if ((s.charCodeAt(i >> 3) >> (i & 7)) & 1 && !this.cut[i]) this.markCut(i, null);
      if (gems) this.gems.forEach((g, k) => { if (gems[k] === '1') { g.taken = true; g.m.visible = false; } });
      this.flush();
    } catch { /* 存档坏了就当新场地 */ }
  }
  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      if (o.material && o.material !== this.mat && o.material !== this.gemMat && !o.material.userData.shared) o.material.dispose();
    });
    this.mat.dispose();
    for (const k of ['map', 'normalMap', 'roughnessMap']) this.topMat[k].dispose();
    this.topMat.dispose(); this.gemMat.dispose(); this.tex.dispose();
  }
}

// 装饰草坪（农场、风景带）：只长不割，跟着风和车压
export function makeLawn(parent, x0, z0, w, d, y, density, uniforms, seed = 3, avoid = []) {
  const r = rng(seed), n = Math.floor(w * d * density);
  const im = new THREE.InstancedMesh(bladeGeometry(21, 7, 0x2e7a1c, 0x8fe35a, 0.7), cropMaterial(uniforms), n);
  im.frustumCulled = false; im.receiveShadow = true;
  let k = 0;
  for (let i = 0; i < n * 3 && k < n; i++) {
    const x = x0 + r() * w, z = z0 + r() * d;
    if (avoid.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1)) continue;
    _p.set(x, y, z); _q.setFromAxisAngle(_up, r() * 6.3); _s.set(1, 0.6 + r() * 0.5, 1);
    _m.compose(_p, _q, _s); im.setMatrixAt(k, _m); im.setColorAt(k, _c.setHex(0xffffff).multiplyScalar(0.85 + r() * 0.3)); k++;
  }
  im.count = k;
  parent.add(im);
  return im;
}
