// 割草大亨（本地复刻版）主逻辑：操控、割草装车、出售、升级、星星关卡、商店、农场、存档
import * as THREE from 'three';
import { GRASS, UPGRADES, SHOP, FARM, GOODS, STARS, LEVEL_COUNT, UNLOCK, BOOST_MS, FIELD_Y, RAMP, ISLAND, UNITS_PER_CELL, levelDef, stats } from './config.js';
import { World, Field, Mower, textPlane } from './world.js';
import * as UI from './ui.js';

const SAVE_KEY = 'mower_tycoon_v1';
const $ = (id) => document.getElementById(id);

// ---------------- 存档 ----------------
function defaultSave() {
  return {
    v: 1, coins: 0, gems: 0, level: 1, maxLevel: 1, stars: {},
    up: { blades: 0, teeth: 0, spin: 0, cap: 0, wheels: 0, trailer: 0 },
    shop: {}, boostUntil: 0,
    farm: { coop: { built: false, hay: 0, goods: 0, t: 0 }, barn: { built: false, hay: 0, goods: 0, t: 0 } },
    goods: { egg: 0, milk: 0 },
    runs: [], fieldCut: null, hintDone: false, sound: true,
  };
}
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!s || s.v !== 1) return defaultSave();
    const d = defaultSave();
    return { ...d, ...s, up: { ...d.up, ...s.up }, farm: { coop: { ...d.farm.coop, ...(s.farm || {}).coop }, barn: { ...d.farm.barn, ...(s.farm || {}).barn } }, goods: { ...d.goods, ...s.goods }, shop: { ...s.shop } };
  } catch { return defaultSave(); }
}
const save = loadSave();
let saveDirty = true;
function persist() {
  save.fieldCut = { level: save.level, data: field.serialize() };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* 隐私模式等写不进就算了 */ }
  saveDirty = false;
}

// ---------------- 渲染 ----------------
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2aa7ef);
const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 300);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8fb0c8, 1.25));
const sun = new THREE.DirectionalLight(0xffffff, 1.9);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 80 });
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  camera.fov = w / h < 1 ? 58 : 42; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

const uniforms = { uTime: { value: 0 } };
const world = new World(scene);
let field = null;
const mower = new Mower(scene);

// ---------------- 小工具 ----------------
const fmt = (n) => { n = Math.floor(n); return n < 10000 ? String(n) : n < 1e6 ? (n / 1000).toFixed(1) + 'K' : (n / 1e6).toFixed(2) + 'M'; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const inRect = (r, x, z, m = 0) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
function groundY(x, z) {
  if (z < RAMP.z0) return FIELD_Y;
  if (z <= RAMP.z1 && x > RAMP.x0 - 0.5 && x < RAMP.x1 + 0.5) return FIELD_Y * (RAMP.z1 - z) / (RAMP.z1 - RAMP.z0);
  return 0;
}
function walkable(x, z) {
  const m = 0.9;
  if (z < RAMP.z0 - 0.2) {
    if (!(x > field.x0 + m && x < -field.x0 - m && z > field.z0 + m)) return false;
    if (z > RAMP.z0 - m && !(x > RAMP.x0 + 0.7 && x < RAMP.x1 - 0.7)) return false;
    for (const r of field.rocks) if ((x - r.x) ** 2 + (z - r.z) ** 2 < (r.r + 0.8) ** 2) return false;
    return true;
  }
  if (z <= RAMP.z1 + m) return x > RAMP.x0 + 0.7 && x < RAMP.x1 - 0.7 || (z > RAMP.z1 + 0.6 && x > ISLAND.x0 + m && x < ISLAND.x1 - m);
  if (!(x > ISLAND.x0 + m && x < ISLAND.x1 - m && z < ISLAND.z1 - m)) return false;
  for (const b of world.blockers) if (inRect(b, x, z, 0.7)) return false;
  return true;
}

// ---------------- 货物（按收割顺序记，出售从顶上卖） ----------------
let S = stats(save);
const cargoTotal = () => save.runs.reduce((a, r) => a + r.u, 0);
function addCargo(t, u) {
  const last = save.runs[save.runs.length - 1];
  if (last && last.t === t) last.u += u; else save.runs.push({ t, u });
  cargoDirty = true;
}
function takeTop(u) { // 从顶上取走 u 单位，返回 [{t,u}]
  const out = [];
  while (u > 1e-6 && save.runs.length) {
    const r = save.runs[save.runs.length - 1], k = Math.min(u, r.u);
    r.u -= k; u -= k; out.push({ t: r.t, u: k });
    if (r.u <= 1e-6) save.runs.pop();
  }
  cargoDirty = true;
  return out;
}
function takeType(t, u) {
  let got = 0;
  for (let i = save.runs.length - 1; i >= 0 && got < u; i--) {
    const r = save.runs[i]; if (r.t !== t) continue;
    const k = Math.min(u - got, r.u); r.u -= k; got += k;
    if (r.u <= 1e-6) save.runs.splice(i, 1);
  }
  // 合并相邻同类
  for (let i = save.runs.length - 1; i > 0; i--) if (save.runs[i].t === save.runs[i - 1].t) { save.runs[i - 1].u += save.runs[i].u; save.runs.splice(i, 1); }
  cargoDirty = true;
  return got;
}
let cargoDirty = true, lastBlockKey = '';
function refreshStack() {
  const upb = Math.max(2, S.truckCap / 180);
  const total = cargoTotal(), n = Math.floor(total / upb + 1e-6);
  const key = n + '|' + save.runs.length + '|' + upb;
  if (key === lastBlockKey) return;
  lastBlockKey = key;
  const types = []; let ri = 0, acc = 0;
  for (let i = 0; i < n; i++) {
    const at = (i + 0.5) * upb;
    while (ri < save.runs.length - 1 && acc + save.runs[ri].u < at) { acc += save.runs[ri].u; ri++; }
    types.push(save.runs[ri] ? save.runs[ri].t : 0);
  }
  mower.setStack(types, Math.round(S.truckCap / upb), (t) => GRASS[t].block);
}

// ---------------- 场地 ----------------
const run = { stars: [false, false, false], full100: false };
function loadLevel(n, restore) {
  if (field) field.dispose();
  save.level = n;
  field = new Field(scene, levelDef(n), uniforms);
  if (restore && save.fieldCut && save.fieldCut.level === n) field.load(save.fieldCut.data);
  run.stars = STARS.map((s) => field.progress >= s.at);
  run.full100 = field.progress >= 0.999;
  pickups.length = 0; syncPickups();
  UI.setLevel(n);
  saveDirty = true;
}

// ---------------- 粒子：飞行草块 + 地上掉落 ----------------
const blockGeo = new THREE.BoxGeometry(0.3, 0.24, 0.3);
const flyMesh = new THREE.InstancedMesh(blockGeo, new THREE.MeshLambertMaterial(), 160);
flyMesh.frustumCulled = false; scene.add(flyMesh);
const flies = [];
function fly(from, to, t, dur = 0.45, arc = 1.4) {
  if (flies.length >= 160) return;
  flies.push({ a: from.clone(), b: to, t: 0, dur, arc, type: t, spin: Math.random() * 6 });
}
const pickMesh = new THREE.InstancedMesh(blockGeo, new THREE.MeshLambertMaterial(), 900);
pickMesh.castShadow = true; pickMesh.frustumCulled = false; scene.add(pickMesh);
const pickups = [];
function syncPickups() {
  const m = new THREE.Matrix4(), c = new THREE.Color(), q = new THREE.Quaternion(), e = new THREE.Euler();
  pickups.forEach((p, i) => {
    e.set(0, p.yaw, 0); q.setFromEuler(e);
    m.compose(new THREE.Vector3(p.x, groundY(p.x, p.z) + 0.13, p.z), q, new THREE.Vector3(1, 1, 1));
    pickMesh.setMatrixAt(i, m); pickMesh.setColorAt(i, c.setHex(GRASS[p.t].block));
  });
  pickMesh.count = pickups.length;
  pickMesh.instanceMatrix.needsUpdate = true; if (pickMesh.instanceColor) pickMesh.instanceColor.needsUpdate = true;
}

// ---------------- 引导箭头 ----------------
const arrows = new THREE.Group(); scene.add(arrows);
for (let i = 0; i < 3; i++) {
  const a = textPlane('︿', 1.3, { color: '#ffffff', stroke: 'rgba(0,0,0,0.25)' });
  a.rotation.x = -Math.PI / 2; a.position.z = -(2.6 + i * 1.7); arrows.add(a);
}
arrows.visible = false;

// ---------------- 输入 ----------------
const input = { active: false, ox: 0, oy: 0, dx: 0, dy: 0, keys: new Set() };
canvas.addEventListener('pointerdown', (e) => {
  Sfx.unlock();
  if (UI.modalOpen()) return;
  input.active = true; input.ox = e.clientX; input.oy = e.clientY; input.dx = input.dy = 0;
  canvas.setPointerCapture(e.pointerId);
  UI.joy(true, e.clientX, e.clientY, 0, 0);
});
canvas.addEventListener('pointermove', (e) => {
  if (!input.active) return;
  input.dx = e.clientX - input.ox; input.dy = e.clientY - input.oy;
  UI.joy(true, input.ox, input.oy, input.dx, input.dy);
});
const endPointer = () => { input.active = false; input.dx = input.dy = 0; UI.joy(false); };
canvas.addEventListener('pointerup', endPointer); canvas.addEventListener('pointercancel', endPointer);
addEventListener('keydown', (e) => { input.keys.add(e.code); Sfx.unlock(); });
addEventListener('keyup', (e) => input.keys.delete(e.code));
addEventListener('blur', () => { input.keys.clear(); endPointer(); });
function readInput() {
  let x = 0, z = 0;
  const k = input.keys;
  if (k.has('ArrowLeft') || k.has('KeyA')) x -= 1; if (k.has('ArrowRight') || k.has('KeyD')) x += 1;
  if (k.has('ArrowUp') || k.has('KeyW')) z -= 1; if (k.has('ArrowDown') || k.has('KeyS')) z += 1;
  if (x || z) return { x, z, mag: 1 };
  if (input.active) {
    const len = Math.hypot(input.dx, input.dy);
    if (len > 10) return { x: input.dx / len, z: input.dy / len, mag: clamp((len - 10) / 30, 0.35, 1) };
  }
  return null;
}

// ---------------- 音效（WebAudio 合成，无外部文件） ----------------
const Sfx = {
  ctx: null,
  unlock() {
    if (this.ctx || !save.sound) { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const C = new (window.AudioContext || window.webkitAudioContext)(); this.ctx = C;
      this.master = C.createGain(); this.master.gain.value = 0.5; this.master.connect(C.destination);
      const o = C.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 52;
      const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
      this.eng = C.createGain(); this.eng.gain.value = 0; o.connect(lp).connect(this.eng).connect(this.master); o.start(); this.engOsc = o;
      const buf = C.createBuffer(1, C.sampleRate, C.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const n = C.createBufferSource(); n.buffer = buf; n.loop = true;
      const bp = C.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.8;
      this.cut = C.createGain(); this.cut.gain.value = 0; n.connect(bp).connect(this.cut).connect(this.master); n.start();
    } catch { this.ctx = null; }
  },
  frame(speed01, cutting) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, on = save.sound ? 1 : 0;
    this.eng.gain.setTargetAtTime((0.05 + speed01 * 0.1) * on, t, 0.08);
    this.engOsc.frequency.setTargetAtTime(48 + speed01 * 30, t, 0.1);
    this.cut.gain.setTargetAtTime(cutting * 0.09 * on, t, 0.05);
  },
  blip(f = 880, d = 0.07, type = 'square', v = 0.12) {
    if (!this.ctx || !save.sound) return;
    const C = this.ctx, o = C.createOscillator(), g = C.createGain();
    o.type = type; o.frequency.value = f; g.gain.setValueAtTime(v, C.currentTime); g.gain.exponentialRampToValueAtTime(0.001, C.currentTime + d);
    o.connect(g).connect(this.master); o.start(); o.stop(C.currentTime + d + 0.02);
  },
  fanfare() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.18, 'triangle', 0.18), i * 110)); },
};

// ---------------- 状态 ----------------
const car = { x: 0, z: 8, yaw: 0, speed: 0, pad: null, fullWarned: false };
let tPrev = performance.now(), elapsed = 0, sellAcc = 0, sellShow = 0, sellTimer = 0, flyAcc = 0, dropAcc = 0;
const tmpV = new THREE.Vector3();

function starCheck() {
  const p = field.progress, n = save.level;
  STARS.forEach((st, k) => {
    if (run.stars[k] || p < st.at) return;
    run.stars[k] = true;
    const best = save.stars[n] || 0;
    if (best > k) return;
    save.stars[n] = k + 1;
    const rw = st.reward(n), mult = save.shop.double ? 2 : 1;
    if (rw.coins) save.coins += rw.coins * mult;
    if (rw.gems) save.gems += rw.gems * mult;
    const reward = rw.coins ? `金币 +${rw.coins * mult}` : `钻石 +${rw.gems * mult}`;
    if (k === 0 && n < LEVEL_COUNT) {
      save.maxLevel = Math.max(save.maxLevel, n + 1);
      UI.popup('胜利！', `下一关已解锁<br>${reward}`, 3);
    } else UI.popup(`${'★'.repeat(k + 1)}`, reward, k + 1);
    Sfx.fanfare(); saveDirty = true;
  });
  if (!run.full100 && p >= 0.999) {
    run.full100 = true; const g = save.shop.double ? 6 : 3; save.gems += g;
    UI.toast(`整片草场割完了！钻石 +${g}，去「关卡」挑战下一关`); saveDirty = true;
  }
}

function onEnterPad(name) {
  const lv = save.maxLevel;
  if (name === 'upgrade') UI.openUpgrade(ctx, 'saw');
  else if (name === 'level') UI.openLevels(ctx);
  else if (name === 'shop') lv >= UNLOCK.shop ? UI.openShop(ctx) : UI.openLocked('商店', `${UNLOCK.shop}级后解锁`);
  else if (name === 'market') lv >= UNLOCK.farm ? sellGoods() : UI.openLocked('市场', `${UNLOCK.farm}级后解锁`);
  else if (name === 'coop' || name === 'barn') {
    if (lv < UNLOCK.farm) UI.openLocked(FARM[name].name, `${UNLOCK.farm}级后解锁`);
    else if (!save.farm[name].built) UI.openBuild(ctx, name);
    else feedFarm(name);
  } else if (name === 'sell' && cargoTotal() < 0.5) UI.toast('车上没有草，先去草场割草');
}

function feedFarm(name) {
  const F = FARM[name], st = save.farm[name];
  const room = F.store - st.hay, got = room > 0 ? takeType(F.feed, room) : 0;
  st.hay += got;
  const goods = st.goods; save.goods[F.good] += goods; st.goods = 0;
  const parts = [];
  if (got >= 1) parts.push(`喂了 ${Math.floor(got)} ${F.feedName}`);
  if (goods) parts.push(`收了 ${goods} 个${GOODS[F.good].name}`);
  if (!parts.length) parts.push(st.hay < F.per ? `车上没有${F.feedName}，带${F.feedName}来喂` : `${F.name}正在生产…`);
  UI.toast(parts.join('，')); if (got || goods) Sfx.blip(660, 0.12, 'triangle');
  saveDirty = true;
}

function sellGoods() {
  let sum = 0;
  for (const [k, g] of Object.entries(GOODS)) { sum += save.goods[k] * g.price; save.goods[k] = 0; }
  sum = Math.floor(sum * S.sellMult);
  if (!sum) { UI.toast('没有农产品可卖：去鸡舍/牛舍收鸡蛋和牛奶'); return; }
  save.coins += sum; UI.floatText(`+${sum}`, world.pads.market, camera); Sfx.fanfare(); saveDirty = true;
}

// 给 UI 用的上下文
const ctx = {
  save, get stats() { return S; },
  buyUpgrade(tab, item) {
    const L = save.up[item.id];
    if (L >= item.max) return;
    const p = item.price(L);
    if (save.coins < p) { UI.toast('金币不够'); return false; }
    save.coins -= p; save.up[item.id]++; S = stats(save); lastBlockKey = ''; saveDirty = true; Sfx.blip(1046, 0.12, 'triangle');
    return true;
  },
  buyShop(it) {
    if (it.consumable) {
      if (save.coins < it.coins) { UI.toast('金币不够'); return false; }
      save.coins -= it.coins; save.boostUntil = Math.max(Date.now(), save.boostUntil) + BOOST_MS;
    } else {
      if (save.shop[it.id]) return false;
      if (save.gems < it.gems) { UI.toast('钻石不够：每关拿到第 3 颗星会给钻石'); return false; }
      save.gems -= it.gems; save.shop[it.id] = true;
    }
    S = stats(save); lastBlockKey = ''; saveDirty = true; Sfx.fanfare(); return true;
  },
  build(name) {
    const F = FARM[name];
    if (save.coins < F.build) { UI.toast('金币不够'); return false; }
    save.coins -= F.build; save.farm[name].built = true; saveDirty = true; Sfx.fanfare();
    UI.toast(`${F.name}建好了！带${F.feedName}来喂，就会产出${GOODS[F.good].name}`); return true;
  },
  goLevel(n) { persist(); loadLevel(n, false); car.x = 0; car.z = 8; car.yaw = 0; persist(); },
  resetSave() { localStorage.removeItem(SAVE_KEY); location.reload(); },
  toggleSound() { save.sound = !save.sound; saveDirty = true; if (save.sound) Sfx.unlock(); return save.sound; },
};

// ---------------- 主循环 ----------------
function step(dt) {
  elapsed += dt; uniforms.uTime.value = elapsed;
  S = stats(save);   // 便宜，每帧重算（助推器到期自动失效）
  mower.setBlades(S.blades, S.bladeR, S.bladeGap);
  mower.trailer.visible = save.up.trailer > 0;

  // --- 操控 ---
  const inp = UI.modalOpen() ? null : readInput();
  let tough = 0, target = 0;
  if (inp) {
    if (!save.hintDone) { save.hintDone = true; UI.hint(false); saveDirty = true; }
    const want = Math.atan2(-inp.x, -inp.z);
    let d = want - car.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    car.yaw += clamp(d, -7 * dt, 7 * dt);
    target = S.speed * inp.mag * (Math.abs(d) > 1.6 ? 0.35 : 1);
  }
  // --- 割草（在草场高台上才割） ---
  const cutList = [];
  if (car.z < RAMP.z0 + 0.5) {
    for (let k = 0; k < mower.blades.length; k++) {
      mower.bladeWorld(k, tmpV);
      tough = Math.max(tough, field.cutAt(tmpV.x, tmpV.z, S.bladeR, S.strength, dt, cutList));
    }
  }
  if (tough > 1) target *= clamp(1 / tough, 0.25, 1);  // 草太硬：车变慢、锯片发红
  car.speed += (target - car.speed) * Math.min(1, dt * 8);
  const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw);
  const nx = car.x + fx * car.speed * dt, nz = car.z + fz * car.speed * dt;
  if (walkable(nx, nz)) { car.x = nx; car.z = nz; }
  else if (walkable(nx, car.z)) car.x = nx;
  else if (walkable(car.x, nz)) car.z = nz;
  else car.speed *= 0.5;

  // --- 收进车斗 / 装满掉地上 ---
  if (cutList.length) {
    const bladePos = mower.bladeWorld(0, new THREE.Vector3());
    for (const t of cutList) {
      if (cargoTotal() + UNITS_PER_CELL <= S.cap + 1e-6) {
        addCargo(t, UNITS_PER_CELL);
        flyAcc += UNITS_PER_CELL;
        if (flyAcc >= 1.2) { flyAcc = 0; fly(bladePos, () => mower.body.localToWorld(new THREE.Vector3(0, mower.stackTop || 1.2, 0.75)), t, 0.35, 1.2); }
      } else {
        dropAcc += UNITS_PER_CELL;
        if (dropAcc >= 2 && pickups.length < 900) {
          dropAcc -= 2;
          const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 2.2;
          pickups.push({ x: bladePos.x + Math.cos(a) * r, z: bladePos.z + Math.sin(a) * r + 1.5, t, u: 2, yaw: Math.random() * 3 });
          syncPickups();
        }
      }
    }
    field.flush();
    starCheck();
    saveDirty = true;
  }
  // --- 捡地上的草块（有磁铁范围更大） ---
  if (pickups.length) {
    let changed = false;
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i], dx = car.x - p.x, dz = car.z - p.z, dd = Math.hypot(dx, dz);
      if (dd < S.pickR && cargoTotal() + p.u <= S.cap + 1e-6) {
        if (save.shop.magnet && dd > 1.2) { p.x += dx / dd * 12 * dt; p.z += dz / dd * 12 * dt; changed = true; continue; }
        addCargo(p.t, p.u); pickups.splice(i, 1); changed = true;
        fly(new THREE.Vector3(p.x, groundY(p.x, p.z) + 0.2, p.z), () => mower.body.localToWorld(new THREE.Vector3(0, mower.stackTop || 1.2, 0.75)), p.t, 0.3, 1);
      }
    }
    if (changed) syncPickups();
  }

  // --- 地面格子 ---
  let pad = null;
  for (const [name, r] of Object.entries(world.pads)) if (inRect(r, car.x, car.z)) { pad = name; break; }
  if (pad !== car.pad) { car.pad = pad; if (pad) onEnterPad(pad); }
  // 出售：站在出售格上持续卖
  const total = cargoTotal();
  if (pad === 'sell' && total > 0) {
    const rate = Math.max(total / 1.0, 90) * dt;
    const sold = takeTop(Math.min(rate, total));
    for (const s of sold) { sellAcc += s.u * GRASS[s.t].value * S.sellMult; }
    const whole = Math.floor(sellAcc); if (whole > 0) { save.coins += whole; sellShow += whole; sellAcc -= whole; }
    sellTimer += dt;
    if (sellTimer > 0.06) {
      sellTimer = 0;
      fly(mower.body.localToWorld(new THREE.Vector3(0, mower.stackTop || 1.2, 0.75)), world.hopper, sold[0] ? sold[0].t : 0, 0.4, 1.6);
      Sfx.blip(700 + Math.random() * 300, 0.04);
    }
    saveDirty = true;
  } else if (sellShow > 0) {
    if (sellAcc >= 0.5) { save.coins += 1; sellShow += 1; } sellAcc = 0;
    UI.floatText(`+${sellShow}`, world.pads.sell, camera); Sfx.fanfare(); sellShow = 0; car.fullWarned = false;
  }

  // --- 满载提示 + 箭头 ---
  const full = cargoTotal() >= S.cap - UNITS_PER_CELL * 0.5;
  if (full && !car.fullWarned) { car.fullWarned = true; UI.toast('装满了！回基地「出售」'); Sfx.blip(330, 0.25, 'triangle'); }
  if (!full) car.fullWarned = false;
  arrows.visible = full && pad !== 'sell';
  if (arrows.visible) {
    let tx, tz;
    if (car.z < RAMP.z0 + 0.3) { tx = 0; tz = RAMP.z1 + 1.5; } else { tx = (world.pads.sell.x0 + world.pads.sell.x1) / 2; tz = (world.pads.sell.z0 + world.pads.sell.z1) / 2; }
    arrows.rotation.y = Math.atan2(-(tx - car.x), -(tz - car.z));
    arrows.position.set(car.x, groundY(car.x, car.z) + 0.06, car.z);
    arrows.children.forEach((a, i) => { a.material.opacity = 0.35 + 0.65 * ((Math.sin(elapsed * 6 - i * 1.2) + 1) / 2); });
  }

  // --- 农场生产 ---
  for (const name of ['coop', 'barn']) {
    const F = FARM[name], st = save.farm[name];
    if (!st.built) continue;
    if (st.hay >= F.per && st.goods < F.maxGoods) {
      st.t += dt;
      if (st.t >= F.every) { st.t = 0; st.hay -= F.per; st.goods++; saveDirty = true; }
    }
  }

  // --- 模型姿态 ---
  const y = groundY(car.x, car.z);
  const yf = groundY(car.x + fx * 1.2, car.z + fz * 1.2), yb = groundY(car.x - fx * 1.2, car.z - fz * 1.2);
  mower.g.position.set(car.x, y, car.z);
  mower.g.rotation.set(0, car.yaw, 0, 'YXZ');
  mower.g.rotation.x = Math.atan2(yf - yb, 2.4);
  const spin = 14 * (S.strength / 2) * (1 + car.speed * 0.1);
  for (const b of mower.blades) b.g.rotation.y += spin * dt;
  for (const w of mower.wheels) w.rotation.x -= car.speed * dt / 0.36;
  mower.bladeMat.emissive.setRGB(tough > 1 ? 0.9 : 0, tough > 1 ? 0.12 : 0, 0);
  mower.body.position.y = car.speed > 0.3 ? Math.sin(elapsed * 30) * 0.015 : 0;
  // 拖车跟随
  if (mower.trailer.visible) {
    const hx = car.x - fx * 1.7, hz = car.z - fz * 1.7, tp = mower.trailerPos;
    if (!mower.trailerInit) { tp.set(hx - fx * 1.5, 0, hz - fz * 1.5); mower.trailerInit = true; }
    const dx = tp.x - hx, dz = tp.z - hz, dl = Math.hypot(dx, dz) || 1;
    tp.x = hx + dx / dl * 1.3; tp.z = hz + dz / dl * 1.3;
    mower.trailer.position.set(tp.x, groundY(tp.x, tp.z), tp.z);
    mower.trailer.rotation.set(0, Math.atan2(dx, dz), 0);
  }
  if (cargoDirty) { cargoDirty = false; refreshStack(); }

  // --- 飞行草块 ---
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  for (let i = flies.length - 1; i >= 0; i--) { const f = flies[i]; f.t += dt; if (f.t >= f.dur) flies.splice(i, 1); }
  flies.forEach((f, i) => {
    const k = f.t / f.dur, b = typeof f.b === 'function' ? f.b() : f.b;
    p.lerpVectors(f.a, b, k); p.y += Math.sin(k * Math.PI) * f.arc;
    e.set(f.spin * k, f.spin * k * 1.3, 0); q.setFromEuler(e);
    m4.compose(p, q, one); flyMesh.setMatrixAt(i, m4); flyMesh.setColorAt(i, col.setHex(GRASS[f.type].block));
  });
  flyMesh.count = flies.length; flyMesh.instanceMatrix.needsUpdate = true; if (flyMesh.instanceColor) flyMesh.instanceColor.needsUpdate = true;

  // --- 镜头 + 光 ---
  const zoom = UI.modalOpen() && (car.pad === 'upgrade' || car.pad === 'shop') ? 0.62 : 1;
  const camT = new THREE.Vector3(car.x, y + 15.5 * zoom, car.z + 12.5 * zoom);
  camera.position.lerp(camT, Math.min(1, dt * 4));
  const look = new THREE.Vector3(car.x, y, car.z - 1.5);
  camera.lookAt(look);
  sun.position.set(car.x + 9, y + 22, car.z + 7); sun.target.position.set(car.x, y, car.z);
  world.update(elapsed);

  Sfx.frame(clamp(car.speed / 6, 0, 1), cutList.length ? 1 : tough > 1 ? 0.6 : 0);
}

let hudTimer = 0, saveTimer = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - tPrev) / 1000); tPrev = now;
  step(dt);
  renderer.render(scene, camera);
  hudTimer += dt; saveTimer += dt;
  if (hudTimer > 0.1) {
    hudTimer = 0;
    UI.hud({ coins: save.coins, gems: save.gems, cargo: cargoTotal(), cap: S.cap, progress: field.progress, stars: run.stars, boostLeft: save.boostUntil - Date.now() });
    for (const name of ['coop', 'barn']) {
      const F = FARM[name], st = save.farm[name], f = world.farm[name];
      f.house.visible = st.built; f.sil.visible = !st.built;
      world.setFarmInfo(name, save.maxLevel < UNLOCK.farm ? `${UNLOCK.farm}级后解锁` : !st.built ? `建造：金币 ${F.build}` : `${F.feedName} ${Math.floor(st.hay)}   ${GOODS[F.good].name} ${st.goods}`);
    }
    world.setShopUnlocked(save.maxLevel >= UNLOCK.shop);
  }
  if (saveTimer > 2 && saveDirty) { saveTimer = 0; persist(); }
  requestAnimationFrame(frame);
}

// ---------------- 启动 ----------------
UI.init(ctx);
loadLevel(clamp(save.level, 1, LEVEL_COUNT), true);
S = stats(save);
UI.hint(!save.hintDone);
addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
addEventListener('pagehide', persist);
$('loading').remove();
requestAnimationFrame((t) => { tPrev = t; frame(t); });
// 给自动化验收用的只读窗口
window.__mower = { save, car, get field() { return field; }, get stats() { return S; }, cargoTotal, ctx, pickups };
