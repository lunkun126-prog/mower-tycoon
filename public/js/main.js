// 割草大亨 v3 主逻辑：开车割草装车 → 出售/打捆 → 下水玩 → 农场大门下车变人 → 扛草喂鸡牛 → 收蛋奶上架 → 顾客来买；升级/星星关卡/商店/存档/粒子/音效
import * as THREE from 'three';
import { CROPS, UPGRADES, SHOP, FARM, GOODS, STARS, LEVEL_COUNT, UNLOCK, BOOST_MS, FIELD_Y, RAMP, ISLAND, FARM_Z, GATE, SLIP, SEA_R, WATER_Y, UNITS_PER_CELL, FIELD_BONUS, SANDBOX, TRUNK, ENERGY, FISH_INDEX, levelDef, stats, cutPower, carColor, STATION, CHARACTERS, trainStats } from './config.js';
import { World } from './world.js';
import { Field } from './grass.js';
import { Mower } from './models.js';
import { Farm } from './farm.js';
import { Train } from './train.js';
import { textPlane, GLB } from './assets.js';
import * as UI from './ui.js';

const SAVE_KEY = SANDBOX ? 'mower_tycoon_v3_sandbox' : 'mower_tycoon_v3';
const $ = (id) => document.getElementById(id);

// ---------------- 存档 ----------------
function defaultSave() {
  return {
    v: 3, coins: 0, gems: 0, level: 1, maxLevel: 1, stars: {},
    up: { blades: 0, teeth: 0, spin: 0, width: 0, cap: 0, wheels: 0, turn: 0, magnet: 0, trailer: 0, carry: 0, baler: 0, animals: 0, shelf: 0, guests: 0, tcap: 0, tspeed: 0, tbonus: 0 },
    shop: {}, boostUntil: 0,
    farm: { coop: { built: false, feed: 0, goods: 0, t: 0 }, barn: { built: false, feed: 0, goods: 0, t: 0 }, bales: 0, balerBuf: 0, shelf: { egg: 0, milk: 0, fish: 0 }, carry: { bales: 0, egg: 0, milk: 0, fish: 0, rawFish: 0 }, energy: ENERGY.max },
    trunk: { fish: [], junk: 0 },
    runs: [], fieldCut: null, hintDone: false, sound: true, mode: 'drive', party: ['driver'],
  };
}
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
function loadSave() {
  const d = defaultSave();
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!s || s.v !== 3) return d;
    const o = { ...d, ...s };
    o.coins = Math.max(0, num(s.coins)); o.gems = Math.max(0, num(s.gems));
    o.maxLevel = Math.min(LEVEL_COUNT, Math.max(1, num(s.maxLevel, 1) | 0)); o.level = Math.min(SANDBOX ? LEVEL_COUNT : o.maxLevel, Math.max(1, num(s.level, 1) | 0));
    const maxUp = {}; for (const g of Object.values(UPGRADES)) for (const it of g.items) maxUp[it.id] = it.max;
    o.up = { ...d.up }; for (const k in d.up) o.up[k] = Math.min(maxUp[k] || 99, Math.max(0, num((s.up || {})[k]) | 0));
    o.sound = s.sound !== false; o.hintDone = !!s.hintDone;
    o.shop = typeof s.shop === 'object' && s.shop ? { ...s.shop } : {};
    o.stars = typeof s.stars === 'object' && s.stars ? { ...s.stars } : {};
    const f = s.farm || {};
    o.farm = { ...d.farm, ...f, coop: { ...d.farm.coop, ...(f.coop || {}) }, barn: { ...d.farm.barn, ...(f.barn || {}) }, shelf: { ...d.farm.shelf, ...(f.shelf || {}) }, carry: { ...d.farm.carry, ...(f.carry || {}) } };
    for (const k of ['bales', 'balerBuf']) o.farm[k] = Math.max(0, num(o.farm[k]));
    for (const p of ['coop', 'barn']) { o.farm[p].feed = Math.max(0, num(o.farm[p].feed)); o.farm[p].goods = Math.max(0, num(o.farm[p].goods) | 0); o.farm[p].t = Math.max(0, num(o.farm[p].t)); o.farm[p].built = !!o.farm[p].built; }
    for (const k of ['egg', 'milk', 'fish']) { o.farm.shelf[k] = Math.max(0, num(o.farm.shelf[k]) | 0); o.farm.carry[k] = Math.max(0, num(o.farm.carry[k]) | 0); }
    o.farm.carry.bales = Math.max(0, num(o.farm.carry.bales) | 0); o.farm.carry.rawFish = Math.max(0, num(o.farm.carry.rawFish) | 0);
    o.farm.energy = Math.min(ENERGY.max, Math.max(0, num(o.farm.energy, ENERGY.max)));
    const rawFishT = (s.trunk || {}).fish;   // v3.1 存档是条数，按最便宜的鲫鱼折算
    const fishArr = Array.isArray(rawFishT) ? rawFishT.filter((k) => Object.hasOwn(FISH_INDEX, k)) : Array.from({ length: Math.max(0, num(rawFishT) | 0) }, () => 'carp');
    o.trunk = { fish: fishArr.slice(0, TRUNK.max), junk: Math.min(TRUNK.max, Math.max(0, num((s.trunk || {}).junk) | 0)) };
    o.runs = Array.isArray(s.runs) ? s.runs.filter((r) => r && Number.isInteger(r.t) && r.t >= 0 && r.t < CROPS.length && num(r.u) > 0).map((r) => ({ t: r.t, u: r.u })) : [];
    o.fieldCut = s.fieldCut && typeof s.fieldCut.data === 'string' && Number.isInteger(s.fieldCut.level) ? s.fieldCut : null;
    o.mode = s.mode === 'walk' ? 'walk' : 'drive';
    o.party = Array.isArray(s.party) ? s.party.filter((k) => k in CHARACTERS) : ['driver']; if (!o.party.length) o.party = ['driver'];
    o.boostUntil = num(s.boostUntil);
    return o;
  } catch { return d; }
}
const save = loadSave();
let saveDirty = true, resetting = false;
function persist() {
  if (!field || resetting) return;
  cargoSum = save.runs.reduce((a, r) => a + r.u, 0);
  save.fieldCut = { level: save.level, data: field.serialize() };
  save.mode = mode;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* 隐私模式写不进就算了 */ }
  saveDirty = false;
}
const afford = (coins = 0, gems = 0) => SANDBOX || (save.coins >= coins && save.gems >= gems);
const spend = (coins = 0, gems = 0) => { if (!SANDBOX) { save.coins -= coins; save.gems -= gems; } };
const lvlUnlocked = (n) => SANDBOX || n <= save.maxLevel;
const featureLevel = () => SANDBOX ? 99 : save.maxLevel;

// ---------------- 渲染 ----------------
const canvas = $('gl');
const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || innerWidth < 700;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xbfe3ff, 60, 200);
const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 400);
let camFree = null;   // 调试/截图用：{p,t} 锁定机位
scene.add(new THREE.HemisphereLight(0xdff3ff, 0x6b8f5a, 0.9));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
sun.castShadow = true; sun.shadow.mapSize.set(isMobile ? 2048 : 4096, isMobile ? 2048 : 4096);
Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 110 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0xbcd8ff, 0.35); fill.position.set(-20, 10, -10); scene.add(fill);
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  camera.fov = w / h < 1 ? 60 : 42; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

const uniforms = { uTime: { value: 0 }, uMower: { value: new THREE.Vector3(0, 0, 0) } };
let world = null, field = null, mower = null, farm = null, train = null;
let mode = 'drive';   // drive | walk

// ---------------- 小工具 ----------------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const inRect = (r, x, z, m = 0) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
const inField = (x, z, m = 0) => z < RAMP.z0 + 0.01 && x > field.x0 - m && x < -field.x0 + m && z > field.z0 - m;
const inSlip = (x, z) => x < SLIP.x1 + 0.01 && x > SLIP.x0 - 1.6 && z > SLIP.z0 + 0.4 && z < SLIP.z1 - 0.4;
function groundY(x, z) {
  if (z < RAMP.z0) return inField(x, z, field.margin) ? FIELD_Y : WATER_Y - 0.15;
  if (z <= RAMP.z1 && x > RAMP.x0 - 0.5 && x < RAMP.x1 + 0.5) return FIELD_Y * (RAMP.z1 - z) / (RAMP.z1 - RAMP.z0);
  if (inRect(ISLAND, x, z)) { if (inSlip(x, z)) return -0.75 * clamp((SLIP.x1 - x) / 3.6, 0, 1); return 0; }
  if (inSlip(x, z)) return -0.75 * clamp((SLIP.x1 - x) / 3.6, 0, 1);
  return WATER_Y - 0.15;
}
const inWater = (x, z) => groundY(x, z) < WATER_Y + 0.02;
function walkable(x, z) {
  const m = 0.9;
  if (z < RAMP.z0 - 0.2) {
    if (inField(x, z, -m)) return !(z > RAMP.z0 - m && !(x > RAMP.x0 + 0.7 && x < RAMP.x1 - 0.7));
    return waterOk(x, z);
  }
  if (z <= RAMP.z1 + m && x > RAMP.x0 - 0.5 && x < RAMP.x1 + 0.5) return x > RAMP.x0 + 0.7 && x < RAMP.x1 - 0.7 || (z > RAMP.z1 + 0.6);
  if (inRect(ISLAND, x, z, 0.2)) {
    if (inSlip(x, z)) return true;
    if (!(x > ISLAND.x0 + m && x < ISLAND.x1 - m && z > 0.6)) return false;
    if (z > FARM_Z - 0.8) return false;                     // 石墙：车不进农场（大门格会让你下车）
    for (const b of world.blockers) if (inRect(b, x, z, 0.7)) return false;
    return true;
  }
  return waterOk(x, z);
}
function waterOk(x, z) {
  if (inSlip(x, z)) return true;
  if (inRect(ISLAND, x, z, 0.8)) return false;
  if (inField(x, z, field.margin + 0.8)) return false;
  if (z > RAMP.z0 - 0.8 && z < RAMP.z1 + 0.8 && x > RAMP.x0 - 1 && x < RAMP.x1 + 1) return false;
  if (Math.abs(x) < 2.2 && z > ISLAND.z1 - 1 && z < ISLAND.z1 + 9.5) return false;   // 码头
  return Math.hypot(x, z - 15) < SEA_R;
}

// ---------------- 货物 ----------------
let S = stats(save);
let cargoSum = save.runs.reduce((a, r) => a + r.u, 0);
const cargoTotal = () => cargoSum;
let cargoDirty = true, lastBlockKey = '';
function addCargo(t, u) {
  const last = save.runs[save.runs.length - 1];
  if (last && last.t === t) last.u += u; else save.runs.push({ t, u });
  cargoSum += u; cargoDirty = true;
}
function takeTop(u) {
  const out = [];
  while (u > 1e-6 && save.runs.length) {
    const r = save.runs[save.runs.length - 1], k = Math.min(u, r.u);
    r.u -= k; u -= k; cargoSum -= k; out.push({ t: r.t, u: k });
    if (r.u <= 1e-6) save.runs.pop();
  }
  if (!save.runs.length) cargoSum = 0;
  cargoDirty = true;
  return out;
}
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
  mower.setStack(types, Math.round(S.truckCap / upb), (t) => CROPS[t].block);
}

// ---------------- 场地 ----------------
const run = { stars: [false, false, false], full100: false };
function loadLevel(n, restore) {
  if (field) field.dispose();
  save.level = n;
  field = new Field(scene, levelDef(n), uniforms);
  world.decorateField(field, n >= STATION.fromLevel);   // 有小火车的关：草场边上的树让给铁轨
  if (restore && save.fieldCut && save.fieldCut.level === n) field.load(save.fieldCut.data);
  run.stars = STARS.map((s) => field.progress >= s.at);
  run.full100 = field.progress >= 0.999;
  pickups.length = 0; pickDirty = true;
  UI.setLevel(n, field.def.tiers.map((t) => CROPS[t].name).join(' · '));
  mower.setColor(carColor(n));   // 每关换一种车色
  train && train.setField(field, n >= STATION.fromLevel);
  if (!restore && n > 10) UI.toast('这一关的草又硬又密：锯子要多磨几下，开慢点，来回多割几遍');
  saveDirty = true;
}

// ---------------- 粒子 ----------------
const blockGeo = new THREE.BoxGeometry(0.3, 0.24, 0.3);
const flyMesh = new THREE.InstancedMesh(blockGeo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), 160);
flyMesh.frustumCulled = false; scene.add(flyMesh);
const flies = [];
function fly(from, to, t, dur = 0.45, arc = 1.4) {
  if (flies.length >= 160) return;
  flies.push({ a: from.clone(), b: to, t: 0, dur, arc, type: t, spin: Math.random() * 6 });
}
const pickMesh = new THREE.InstancedMesh(blockGeo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), 900);
pickMesh.castShadow = true; pickMesh.frustumCulled = false; scene.add(pickMesh);
const pickups = []; let pickDirty = true;
const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), col4 = new THREE.Color(), p4 = new THREE.Vector3(), s4 = new THREE.Vector3(), one4 = new THREE.Vector3(1, 1, 1);
function syncPickups() {
  pickups.forEach((p, i) => {
    e4.set(0, p.yaw, 0); q4.setFromEuler(e4); p4.set(p.x, groundY(p.x, p.z) + 0.13, p.z);
    m4.compose(p4, q4, one4); pickMesh.setMatrixAt(i, m4); pickMesh.setColorAt(i, col4.setHex(CROPS[p.t].block));
  });
  pickMesh.count = pickups.length;
  pickMesh.instanceMatrix.needsUpdate = true; if (pickMesh.instanceColor) pickMesh.instanceColor.needsUpdate = true;
  pickDirty = false;
}
const chipMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.03, 0.14), new THREE.MeshStandardMaterial({ roughness: 1 }), 400);
chipMesh.frustumCulled = false; scene.add(chipMesh);
const chips = [];
const smokeMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 6, 5), new THREE.MeshStandardMaterial({ color: 0xcfd6dc, transparent: true, opacity: 0.35, roughness: 1 }), 60);
smokeMesh.frustumCulled = false; scene.add(smokeMesh);
const smokes = [];
// 水花
const splashMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 6, 5), new THREE.MeshStandardMaterial({ color: 0xeaf8ff, transparent: true, opacity: 0.85, roughness: 0.3 }), 500);
splashMesh.frustumCulled = false; scene.add(splashMesh);
const splashes = [];
function splash(x, z, n, power) {
  for (let i = 0; i < n && splashes.length < 500; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 0.9;
    splashes.push({ p: new THREE.Vector3(x + Math.cos(a) * r, WATER_Y + 0.05, z + Math.sin(a) * r), v: new THREE.Vector3((Math.random() - 0.5) * 3 * power, (2 + Math.random() * 3.5) * power, (Math.random() - 0.5) * 3 * power), t: 0, life: 0.5 + Math.random() * 0.5, s: 0.5 + Math.random() * 0.9 });
  }
}
// 草捆飞行（草料机 → 草棚）
const baleFly = [];
const baleFlyMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.45, 0.5), new THREE.MeshStandardMaterial({ color: 0xcfe08a, roughness: 0.95 }), 12);
baleFlyMesh.frustumCulled = false; baleFlyMesh.castShadow = true; scene.add(baleFlyMesh);

// ---------------- 引导箭头 ----------------
const arrows = new THREE.Group(); scene.add(arrows);
for (let i = 0; i < 3; i++) {
  const a = textPlane('︿', 1.3, { color: '#ffffff', stroke: 'rgba(0,0,0,0.25)' });
  a.rotation.x = -Math.PI / 2; a.position.z = -(2.6 + i * 1.7); arrows.add(a);
}
arrows.visible = false;

// ---------------- 输入 ----------------
const input = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0, keys: new Set() };
canvas.addEventListener('pointerdown', (e) => {
  Sfx.unlock();
  if (UI.modalOpen() || input.active) return;
  input.active = true; input.id = e.pointerId; input.ox = e.clientX; input.oy = e.clientY; input.dx = input.dy = 0;
  canvas.setPointerCapture(e.pointerId);
  UI.joy(true, e.clientX, e.clientY, 0, 0);
});
canvas.addEventListener('pointermove', (e) => {
  if (!input.active || e.pointerId !== input.id) return;
  input.dx = e.clientX - input.ox; input.dy = e.clientY - input.oy;
  UI.joy(true, input.ox, input.oy, input.dx, input.dy);
});
const endPointer = (e) => { if (e && input.id !== null && e.pointerId !== input.id) return; input.active = false; input.id = null; input.dx = input.dy = 0; UI.joy(false); };
canvas.addEventListener('pointerup', (e) => { Sfx.unlock(); endPointer(e); }); canvas.addEventListener('pointercancel', endPointer);
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

// ---------------- 音效 ----------------
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
      const n2 = C.createBufferSource(); n2.buffer = buf; n2.loop = true;
      const lp2 = C.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 900;
      this.water = C.createGain(); this.water.gain.value = 0; n2.connect(lp2).connect(this.water).connect(this.master); n2.start();
    } catch { this.ctx = null; }
  },
  frame(speed01, cutting, water, walking = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, on = save.sound ? 1 : 0;
    this.eng.gain.setTargetAtTime(walking ? 0 : (0.05 + speed01 * 0.1) * on, t, 0.08);
    this.engOsc.frequency.setTargetAtTime(48 + speed01 * 30, t, 0.1);
    this.cut.gain.setTargetAtTime(cutting * 0.09 * on, t, 0.05);
    this.water.gain.setTargetAtTime(water * 0.12 * on, t, 0.1);
  },
  blip(f = 880, d = 0.07, type = 'square', v = 0.12) {
    if (!this.ctx || !save.sound) return;
    const C = this.ctx, o = C.createOscillator(), g = C.createGain();
    o.type = type; o.frequency.value = f; g.gain.setValueAtTime(v, C.currentTime); g.gain.exponentialRampToValueAtTime(0.001, C.currentTime + d);
    o.connect(g).connect(this.master); o.start(); o.stop(C.currentTime + d + 0.02);
  },
  fanfare() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.18, 'triangle', 0.18), i * 110)); },
  suspend(on) { if (!this.ctx) return; if (on) this.ctx.suspend(); else if (save.sound) this.ctx.resume(); },
};

// ---------------- 状态 ----------------
const car = { x: 0, z: 8, yaw: 0, speed: 0, pad: null, fullWarned: false, wet: false };
let trunkDirty = true, lastFullToast = -9;
const trunkTotal = () => save.trunk.fish.length + save.trunk.junk;
let trainFly = 0;
let tPrev = performance.now(), elapsed = 0, sellAcc = 0, sellShow = 0, sellTimer = 0, flyAcc = 0, dropAcc = 0, smokeAcc = 0, splashAcc = 0, baleAcc = 0, baleShow = 0;
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
const stackTopWorld = () => mower.body.localToWorld(tmpV2.set(0, mower.stackTop || 1.2, mower.bed.position.z)).clone();

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
    if (k === 0 && n < LEVEL_COUNT) { save.maxLevel = Math.max(save.maxLevel, n + 1); mower.setColor(carColor(n + 1)); UI.popup('胜利！', `下一关已解锁<br>车换新颜色啦！<br>${reward}`, 3); }   // 过一关当场换车色
    else UI.popup(`${'★'.repeat(k + 1)}`, reward, k + 1);
    Sfx.fanfare(); saveDirty = true;
  });
  if (!run.full100 && p >= 0.999) {
    run.full100 = true; const g = save.shop.double ? 6 : 3; save.gems += g;
    UI.toast(`整片草场割完了！钻石 +${g}，去「关卡」挑战下一关`); saveDirty = true;
  }
}

function onEnterPad(name) {
  const lv = featureLevel();
  if (name === 'upgrade') UI.openUpgrade(ctx, 'saw');
  else if (name === 'level') UI.openLevels(ctx);
  else if (name === 'shop') lv >= UNLOCK.shop ? UI.openShop(ctx) : UI.openLocked('商店', `${UNLOCK.shop}级后解锁`);
  else if (name === 'sell' && cargoTotal() < 0.5) UI.toast('车上没有草，先去草场割草');
  else if (name === 'baler') { if (lv < UNLOCK.farm) UI.openLocked('草料机', `${UNLOCK.farm}级后解锁`); else if (cargoTotal() < 0.5) UI.toast('车上没有草：割草回来再打捆'); else if (farm.balerFull()) UI.toast('草棚堆满了，先去喂鸡喂牛'); }
  else if (name === 'gate') { if (lv < UNLOCK.farm) UI.openLocked('农场', `${UNLOCK.farm}级后解锁`); else UI.openWhoDown(ctx); }
  else if (name === 'trash') {
    if (save.trunk.junk > 0) { const n = save.trunk.junk, pay = n * TRUNK.junkRecycle; save.trunk.junk = 0; save.coins += pay; trunkDirty = true; saveDirty = true; UI.toast(`扔了 ${n} 件垃圾${pay ? `，回收 +${pay} 金币` : ''}`); Sfx.blip(300, 0.15, 'square', 0.1); }
    else UI.toast('后备箱里没有垃圾');
  }
}
// keys：谁下车（第一个是你操控的人，其余跟在后面）
function dismount(keys = ['driver']) {
  mode = 'walk'; car.speed = 0; car.x = world.pads.gate.cx; car.z = world.pads.gate.cz; car.yaw = Math.PI;
  mower.g.position.set(car.x, 0, car.z); mower.g.rotation.set(0, car.yaw, 0); mower.setWater(false); arrows.visible = false;
  for (const k of keys) mower.setSeated(k, false);
  const rawFish = save.trunk.fish.length; save.trunk.fish = []; trunkDirty = true;
  save.party = keys.slice();
  farm.dismount(keys, 0, FARM_Z + 1.6, rawFish); saveDirty = true;
}
function mount() {
  mode = 'drive'; farm.hide();
  car.x = world.pads.gate.cx; car.z = world.pads.gate.cz; car.yaw = 0; car.speed = 0; car.pad = 'gate';
  for (const k in CHARACTERS) mower.setSeated(k, true);
  UI.toast('都上车了'); saveDirty = true;
}

const ctx = {
  save, get stats() { return S; },
  buyUpgrade(tab, item) {
    const L = save.up[item.id];
    if (L >= item.max) return false;
    const p = item.price(L);
    if (!afford(p)) { UI.toast('金币不够'); return false; }
    spend(p); save.up[item.id]++; S = stats(save); lastBlockKey = ''; saveDirty = true; Sfx.blip(1046, 0.12, 'triangle');
    return true;
  },
  buyShop(it) {
    if (it.consumable) {
      if (!afford(it.coins)) { UI.toast('金币不够'); return false; }
      spend(it.coins); save.boostUntil = Math.max(Date.now(), save.boostUntil) + BOOST_MS;
    } else {
      if (save.shop[it.id]) return false;
      if (!afford(0, it.gems)) { UI.toast('钻石不够：每关拿到第 3 颗星会给钻石'); return false; }
      spend(0, it.gems); save.shop[it.id] = true;
    }
    S = stats(save); lastBlockKey = ''; saveDirty = true; Sfx.fanfare(); return true;
  },
  build(name) {
    const F = FARM[name];
    if (!afford(F.build)) { UI.toast('金币不够'); return false; }
    spend(F.build); save.farm[name].built = true; saveDirty = true; Sfx.fanfare();
    UI.toast(`${F.name}建好了！扛草捆来喂，就会产出${GOODS[F.good].name}`); return true;
  },
  goLevel(n) { if (!lvlUnlocked(n)) return; persist(); loadLevel(n, false); if (mode === 'walk') mount(); car.x = 0; car.z = 8; car.yaw = 0; car.pad = null; persist(); },
  resetSave() { resetting = true; localStorage.removeItem(SAVE_KEY); location.reload(); },
  toggleSound() { save.sound = !save.sound; saveDirty = true; if (save.sound) Sfx.unlock(); else Sfx.suspend(true); return save.sound; },
  eat(kind) { return farm.eat(kind); },
  getOff(keys) { if (mode === 'drive' && car.pad === 'gate') dismount(keys); },
};

// ---------------- 主循环 ----------------
function stepDrive(dt, inp) {
  let tough = 0, target = 0;
  const wet = inWater(car.x, car.z);
  if (inp) {
    if (!save.hintDone) { save.hintDone = true; UI.hint(false); saveDirty = true; }
    const want = Math.atan2(-inp.x, -inp.z);
    let d = want - car.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    car.yaw += clamp(d, -S.turn * dt, S.turn * dt);
    target = S.speed * inp.mag * (Math.abs(d) > 1.6 ? 0.35 : 1) * (wet ? 0.55 : 1);
    if (mower.steer) mower.steer.rotation.z = clamp(d, -1, 1) * 0.8;
  }
  // 割草：前 10 关稍硬，11 关起草又硬又密——锯子要磨几下才断、车在草里开不快（但一定割得动）
  const cutList = [];
  if (car.z < RAMP.z0 + 0.5 && !wet) {
    const power = cutPower(S.strength);
    for (let k = 0; k < mower.blades.length; k++) {
      mower.bladeWorld(k, tmpV);
      tough = Math.max(tough, field.cutAt(tmpV.x, tmpV.z, S.bladeR, power, dt, cutList));
    }
  }
  if (cutList.length || tough > 0) target *= field.def.drag;
  if (tough > 1) target *= clamp(1 / tough, field.def.n > 10 ? 0.2 : 0.3, 1);
  mower.body.rotation.z = tough > 1 ? (Math.random() - 0.5) * 0.04 * Math.min(tough, 3) : 0;   // 硬草顶得车一颤一颤
  car.speed += (target - car.speed) * Math.min(1, dt * (wet ? 3 : 8));
  const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw);
  const nx = car.x + fx * car.speed * dt, nz = car.z + fz * car.speed * dt;
  if (walkable(nx, nz)) { car.x = nx; car.z = nz; }
  else if (walkable(nx, car.z)) car.x = nx;
  else if (walkable(car.x, nz)) car.z = nz;
  else car.speed *= 0.5;

  // 收进车斗 / 装满掉地上 / 金草 / 宝石
  if (cutList.length || cutList.gems) {
    const bladePos = mower.bladeWorld(0, tmpV).clone();
    let goldCoins = 0;
    for (const c of cutList) {
      if (c.gold) goldCoins += FIELD_BONUS.goldCoinPerCell;
      if (cargoTotal() + UNITS_PER_CELL <= S.cap + 1e-6) {
        addCargo(c.t, UNITS_PER_CELL);
        flyAcc += UNITS_PER_CELL;
        if (flyAcc >= 1.2) { flyAcc = 0; fly(bladePos, stackTopWorld, c.t, 0.35, 1.2); }
      } else {
        dropAcc += UNITS_PER_CELL;
        if (dropAcc >= 2 && pickups.length < 900) {
          dropAcc -= 2;
          for (let tries = 0; tries < 4; tries++) {
            const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 2.2, px = bladePos.x + Math.cos(a) * r, pz = bladePos.z + Math.sin(a) * r + 1.5;
            if (inField(px, pz, -0.5)) { pickups.push({ x: px, z: pz, t: c.t, u: 2, yaw: Math.random() * 3 }); pickDirty = true; break; }
          }
        }
      }
      if (chips.length < 400 && Math.random() < 0.6) chips.push({ p: bladePos.clone().add(tmpV.set((Math.random() - 0.5) * 0.8, 0.3, (Math.random() - 0.5) * 0.8)), v: new THREE.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3 + 1.5), t: 0, life: 0.6 + Math.random() * 0.4, c: CROPS[c.t].block, spin: Math.random() * 6 });
    }
    if (goldCoins) { save.coins += goldCoins; UI.toast(`金草！金币 +${goldCoins}`); }
    if (cutList.gems) { save.gems += cutList.gems; UI.popup('💎', `钻石 +${cutList.gems}`, 0); Sfx.fanfare(); }
    field.flush();
    starCheck();
    saveDirty = true;
  }
  // 捡地上的草块
  if (pickups.length) {
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i], dx = car.x - p.x, dz = car.z - p.z, dd = Math.hypot(dx, dz);
      if (dd < S.pickR && cargoTotal() + p.u <= S.cap + 1e-6) {
        if (save.shop.magnet && dd > 1.2) { p.x += dx / dd * 12 * dt; p.z += dz / dd * 12 * dt; pickDirty = true; continue; }
        addCargo(p.t, p.u); pickups.splice(i, 1); pickDirty = true;
        fly(tmpV.set(p.x, groundY(p.x, p.z) + 0.2, p.z), stackTopWorld, p.t, 0.3, 1);
      }
    }
  }
  if (pickDirty) syncPickups();

  // 地面格子
  let pad = null;
  for (const name in world.pads) if (inRect(world.pads[name], car.x, car.z)) { pad = name; break; }
  if (pad !== car.pad) { car.pad = pad; if (pad) onEnterPad(pad); }
  if (mode !== 'drive') return;   // 刚下车
  const total = cargoTotal();
  if (pad === 'sell' && save.trunk.fish.length > 0) {
    const n = save.trunk.fish.length, pay = Math.floor(save.trunk.fish.reduce((a, k) => a + FISH_INDEX[k].price, 0) * S.sellMult); save.trunk.fish = []; save.coins += pay; trunkDirty = true; saveDirty = true;
    UI.floatText(`+${pay}`, world.pads.sell, camera); UI.toast(`卖了 ${n} 条鱼 +${pay} 金币（烤熟上架能卖更贵）`); Sfx.fanfare();
  }
  if (pad === 'sell' && total > 0) {
    const sold = takeTop(Math.min(Math.max(total / 1.0, 90) * dt, total));
    for (const s of sold) sellAcc += s.u * CROPS[s.t].value * S.sellMult;
    const whole = Math.floor(sellAcc); if (whole > 0) { save.coins += whole; sellShow += whole; sellAcc -= whole; }
    sellTimer += dt;
    if (sellTimer > 0.06) { sellTimer = 0; fly(stackTopWorld(), world.hopper, sold[0] ? sold[0].t : 0, 0.4, 1.6); Sfx.blip(700 + Math.random() * 300, 0.04); }
    saveDirty = true;
  } else if (sellShow > 0) {
    if (sellAcc >= 0.5) { save.coins += 1; sellShow += 1; } sellAcc = 0;
    UI.floatText(`+${sellShow}`, world.pads.sell, camera); Sfx.fanfare(); sellShow = 0; car.fullWarned = false;
  }
  // 小火车（第 11 关起）：在草场里割草时，车斗里的草自动飞进旁边跟着走的小火车（比「出售」多卖 25%），不用开回基地
  if (train.room > 0 && total > 0 && inField(car.x, car.z)) {
    const taken = takeTop(Math.min(Math.max(total, 60) * 2 * dt, total, train.room));
    let u = 0, v = 0; for (const s of taken) { u += s.u; v += s.u * CROPS[s.t].value * S.sellMult; }
    train.load(u, v, taken[0] ? taken[0].t : 0);
    trainFly += dt;
    if (trainFly > 0.08) {
      trainFly = 0; const from = stackTopWorld(), to = train.slotWorld(new THREE.Vector3()), dist = from.distanceTo(to);
      fly(from, to, taken[0] ? taken[0].t : 0, 0.4 + dist / 30, 1.5 + dist * 0.12); Sfx.blip(500 + Math.random() * 200, 0.03);
    }
    if (train.room <= 0) UI.toast('小火车装满了，开去市场卖草！');
    saveDirty = true;
  }
  // 打捆格：卸草进草料机
  if (pad === 'baler' && total > 0 && featureLevel() >= UNLOCK.farm && !farm.balerFull()) {
    const taken = takeTop(Math.min(Math.max(total / 1.0, 90) * dt, total));
    let u = 0; for (const s of taken) u += s.u;
    baleAcc += u; baleShow += farm.feedBaler(u);
    sellTimer += dt;
    if (sellTimer > 0.06) { sellTimer = 0; fly(stackTopWorld(), world.balerHopper, taken[0] ? taken[0].t : 0, 0.4, 1.6); Sfx.blip(300 + Math.random() * 100, 0.05, 'sawtooth', 0.06); }
    saveDirty = true;
  } else if (baleAcc > 0) {
    UI.toast(baleShow > 0 ? `打了 ${baleShow} 捆草，送进草棚了${farm.balerFull() ? '（草棚满了）' : ''}` : `草不够打一捆（还差 ${Math.ceil(S.baleUnits - save.farm.balerBuf)}），下次接着凑`);
    baleAcc = 0; baleShow = 0; car.fullWarned = false;
  }

  // 满载提示 + 箭头
  const full = cargoTotal() >= S.cap - UNITS_PER_CELL * 0.5;
  if (full && !car.fullWarned) { car.fullWarned = true; UI.toast(train.active && train.state !== 'wait' ? '装满了！小火车卖草去了，马上开回来接着装' : '装满了！回基地「出售」换钱，或「打捆」喂动物'); Sfx.blip(330, 0.25, 'triangle'); }
  if (!full) car.fullWarned = false;
  arrows.visible = full && pad !== 'sell' && pad !== 'baler' && !(train.active && inField(car.x, car.z));
  if (arrows.visible) {
    let tx, tz;
    if (car.z < RAMP.z0 + 0.3) { tx = 0; tz = RAMP.z1 + 1.5; } else { tx = world.pads.sell.cx; tz = world.pads.sell.cz; }
    arrows.rotation.y = Math.atan2(-(tx - car.x), -(tz - car.z));
    arrows.position.set(car.x, groundY(car.x, car.z) + 0.06, car.z);
    arrows.children.forEach((a, i) => { a.material.opacity = 0.35 + 0.65 * ((Math.sin(elapsed * 6 - i * 1.2) + 1) / 2); });
  }

  // 模型姿态（水里浮起来晃）
  const y = groundY(car.x, car.z);
  const yf = groundY(car.x + fx * 1.2, car.z + fz * 1.2), yb = groundY(car.x - fx * 1.2, car.z - fz * 1.2);
  mower.g.position.set(car.x, y + (wet ? Math.sin(elapsed * 2.2) * 0.06 : 0), car.z);
  mower.g.rotation.set(0, car.yaw, 0, 'YXZ');
  mower.g.rotation.x = wet ? Math.sin(elapsed * 1.7) * 0.03 - car.speed * 0.02 : Math.atan2(yf - yb, 2.4);
  mower.g.rotation.z = wet ? Math.sin(elapsed * 1.3) * 0.04 : 0;
  mower.setWater(wet);
  const spin = 14 * (S.strength / 2) * (1 + car.speed * 0.1);
  for (const b of mower.blades) b.g.rotation.y += spin * dt;
  for (const w of mower.wheels) w.rotation.x -= car.speed * dt / 0.36;
  for (const w of mower.landWheels) w.rotation.x -= car.speed * dt / 0.36;
  if (wet) {
    mower.propeller.rotation.z += (2 + car.speed * 4) * dt;
    if (car.speed > 0.5) {
      mower.netWorld(tmpV);
      const hits = world.hitWater(tmpV.x, tmpV.z, 1.3, elapsed, TRUNK.max - trunkTotal());
      if (hits.full && elapsed - lastFullToast > 2.5) { lastFullToast = elapsed; UI.toast('后备箱满了：回岸「出售」卖鱼、「倒垃圾」清空'); }
      for (const hit of hits) {
        splash(tmpV.x, tmpV.z, 30, 1.2);
        if (hit.kind === 'fish') { save.trunk.fish.push(hit.species); const sp = FISH_INDEX[hit.species]; UI.toast(`捞到${sp.name}！（值 ${sp.price} 金币）后备箱 ${save.trunk.fish.length} 条`); Sfx.blip(880, 0.1, 'triangle'); }
        else { save.trunk.junk++; UI.toast('撞坏了！碎片掉进后备箱，回去扔垃圾桶'); Sfx.blip(160, 0.3, 'sawtooth', 0.12); }
        trunkDirty = true; saveDirty = true;
      }
    }
  }
  if (trunkDirty) { trunkDirty = false; mower.setTrunk(save.trunk.fish.length, save.trunk.junk); }
  mower.bladeMat.emissive.setRGB(tough > 1 ? 0.9 : 0, tough > 1 ? 0.12 : 0, 0);
  mower.body.position.y = car.speed > 0.3 && !wet ? Math.sin(elapsed * 30) * 0.015 : 0;
  uniforms.uMower.value.set(car.x + fx * 0.3, clamp(car.speed / 3, 0.35, 1), car.z + fz * 0.3);
  if (mower.trailer.visible) {
    const hx = car.x - fx * mower.hitchZ, hz = car.z - fz * mower.hitchZ, tp = mower.trailerPos;
    if (!mower.trailerInit) { tp.set(hx - fx * 1.5, 0, hz - fz * 1.5); mower.trailerInit = true; }
    let dx = tp.x - hx, dz = tp.z - hz, dl = Math.hypot(dx, dz) || 1;
    // 车被传送（换关/上车）就把拖车摆回正后方；急转弯最多折 75°，拖车永远在后备箱后面，不会折到前面压在后备箱上
    if (dl > 3.5) { dx = -fx; dz = -fz; dl = 1; }
    for (let k = 0; k < 8 && (dx * -fx + dz * -fz) / dl < 0.26; k++) { dx = dx / dl - fx; dz = dz / dl - fz; dl = Math.hypot(dx, dz); if (dl < 1e-3) { dx = -fx; dz = -fz; dl = 1; } }
    tp.x = hx + dx / dl * 1.9; tp.z = hz + dz / dl * 1.9;
    mower.trailer.position.set(tp.x, groundY(tp.x, tp.z), tp.z);
    mower.trailer.rotation.set(0, Math.atan2(dx, dz), 0);
  }
  if (cargoDirty) { cargoDirty = false; refreshStack(); }
  if (mower.kidMix) mower.kidMix.update(dt);
  if (mower.grannyMix) mower.grannyMix.update(dt);

  // 水花：下水那一下大溅，开着走持续溅
  if (wet && !car.wet) { splash(car.x + fx * 1.2, car.z + fz * 1.2, 90, 1.6); Sfx.blip(180, 0.4, 'sawtooth', 0.15); UI.toast('拖拉机变成船啦！船头的网撞到鱼就捞进后备箱，从「下水」坡再开上来'); }
  if (!wet && car.wet) UI.toast('上岸了，船变回拖拉机');
  car.wet = wet;
  if (wet && car.speed > 0.8) {
    splashAcc += dt * car.speed * 7;
    while (splashAcc > 1) { splashAcc -= 1; for (const sx of [-1.05, 1.05]) splash(car.x + fx * 1.4 + (-fz) * sx, car.z + fz * 1.4 + fx * sx, 2, 0.6 + car.speed * 0.12); }
  }
  // 尾气
  smokeAcc += dt * (2 + car.speed * 2);
  if (smokeAcc > 1 && smokes.length < 60) { smokeAcc = 0; smokes.push({ p: mower.body.localToWorld(mower.exhaust.clone()), t: 0, life: 1.4 }); }
  Sfx.frame(clamp(car.speed / 6, 0, 1), cutList.length ? 1 : tough > 1 ? 0.6 : 0, wet ? clamp(car.speed / 4, 0.15, 1) : 0);
}

function stepWalk(dt, inp) {
  const r = farm.update(dt, inp);
  if (r === 'mount') mount();
  if (cargoDirty) { cargoDirty = false; refreshStack(); }
  uniforms.uMower.value.set(farm.man.x, clamp(farm.man.speed / 3, 0.2, 0.6), farm.man.z);
  Sfx.frame(0, 0, 0, true);
}

function step(dt) {
  elapsed += dt; uniforms.uTime.value = elapsed;
  S = stats(save);
  mower.setBlades(S.blades, S.bladeR, S.bladeGap);
  mower.trailer.visible = save.up.trailer > 0 && mode === 'drive';
  const inp = UI.modalOpen() ? null : readInput();
  if (mode === 'drive') stepDrive(dt, inp); else stepWalk(dt, inp);
  train.setStats(trainStats(save.up));
  train.update(dt, { x: car.x, z: car.z, inField: mode === 'drive' && inField(car.x, car.z) });
  farm.tick(dt);
  if (farm.dirty) { farm.dirty = false; farm.sync(); saveDirty = true; }

  // 粒子
  for (let i = smokes.length - 1; i >= 0; i--) { const s = smokes[i]; s.t += dt; s.p.y += dt * 1.2; s.p.x += dt * 0.3; if (s.t > s.life) smokes.splice(i, 1); }
  smokes.forEach((s, i) => { const k = s.t / s.life; s4.setScalar(0.6 + k * 2.2); m4.compose(s.p, q4.identity(), s4); smokeMesh.setMatrixAt(i, m4); });
  smokeMesh.count = smokes.length; smokeMesh.instanceMatrix.needsUpdate = true;
  for (let i = chips.length - 1; i >= 0; i--) { const c = chips[i]; c.t += dt; c.v.y -= 12 * dt; c.p.addScaledVector(c.v, dt); if (c.t > c.life || c.p.y < groundY(c.p.x, c.p.z)) chips.splice(i, 1); }
  chips.forEach((c, i) => { e4.set(c.spin + c.t * 8, c.spin * 2, c.t * 5); q4.setFromEuler(e4); m4.compose(c.p, q4, one4); chipMesh.setMatrixAt(i, m4); chipMesh.setColorAt(i, col4.setHex(c.c)); });
  chipMesh.count = chips.length; chipMesh.instanceMatrix.needsUpdate = true; if (chipMesh.instanceColor) chipMesh.instanceColor.needsUpdate = true;
  for (let i = splashes.length - 1; i >= 0; i--) { const s = splashes[i]; s.t += dt; s.v.y -= 9 * dt; s.p.addScaledVector(s.v, dt); if (s.t > s.life || s.p.y < WATER_Y - 0.1) splashes.splice(i, 1); }
  splashes.forEach((s, i) => { s4.setScalar(s.s * (1 - s.t / s.life * 0.5)); m4.compose(s.p, q4.identity(), s4); splashMesh.setMatrixAt(i, m4); });
  splashMesh.count = splashes.length; splashMesh.instanceMatrix.needsUpdate = true;
  for (let i = flies.length - 1; i >= 0; i--) { const f = flies[i]; f.t += dt; if (f.t >= f.dur) flies.splice(i, 1); }
  flies.forEach((f, i) => {
    const k = f.t / f.dur, b = typeof f.b === 'function' ? f.b() : f.b;
    p4.lerpVectors(f.a, b, k); p4.y += Math.sin(k * Math.PI) * f.arc;
    e4.set(f.spin * k, f.spin * k * 1.3, 0); q4.setFromEuler(e4);
    m4.compose(p4, q4, one4); flyMesh.setMatrixAt(i, m4); flyMesh.setColorAt(i, col4.setHex(CROPS[f.type].block));
  });
  flyMesh.count = flies.length; flyMesh.instanceMatrix.needsUpdate = true; if (flyMesh.instanceColor) flyMesh.instanceColor.needsUpdate = true;
  for (let i = baleFly.length - 1; i >= 0; i--) { const f = baleFly[i]; f.t += dt; if (f.t >= 1) baleFly.splice(i, 1); }
  baleFly.forEach((f, i) => { const k = f.t; p4.lerpVectors(f.a, f.b, k); p4.y += Math.sin(k * Math.PI) * 2.2; e4.set(0, k * 3, k * 2); q4.setFromEuler(e4); m4.compose(p4, q4, one4); baleFlyMesh.setMatrixAt(i, m4); });
  baleFlyMesh.count = baleFly.length; baleFlyMesh.instanceMatrix.needsUpdate = true;

  // 镜头 + 光
  const fx = mode === 'drive' ? car.x : farm.man.x, fz = mode === 'drive' ? car.z : farm.man.z;
  const y = mode === 'drive' ? groundY(car.x, car.z) : 0;
  const zoom = UI.modalOpen() && (car.pad === 'upgrade' || car.pad === 'shop') ? 0.62 : mode === 'walk' ? 0.7 : 1;
  const port = camera.aspect < 1 ? 1.25 : 1;
  tmpV.set(fx, y + 15.5 * zoom * port, fz + 12.5 * zoom * port);
  if (camFree) { camera.position.copy(camFree.p); camera.lookAt(camFree.t); } else { camera.position.lerp(tmpV, Math.min(1, dt * 4)); camera.lookAt(fx, y, fz - 1.5); }
  sun.position.set(fx + 12, y + 26, fz + 9); sun.target.position.set(fx, y, fz);
  world.sky.position.copy(camera.position);
  world.update(elapsed, dt); field.update(elapsed);
}

let hudTimer = 0, saveTimer = 0, errCount = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (errCount >= 5) return;
  const dt = Math.min(0.05, (now - tPrev) / 1000); tPrev = now;
  try {
    step(dt);
    renderer.render(scene, camera);
    errCount = 0;
  } catch (e) { errCount++; console.error(e); if (errCount >= 5) UI.toast('出错了：' + e.message); return; }
  hudTimer += dt; saveTimer += dt;
  if (hudTimer > 0.1) {
    hudTimer = 0;
    UI.hud({ coins: save.coins, gems: save.gems, cargo: cargoTotal(), cap: S.cap, progress: field.progress, stars: run.stars, boostLeft: save.boostUntil - Date.now(), task: farm.taskText(mode, { fish: save.trunk.fish.length, junk: save.trunk.junk }), mode, energy: save.farm.energy / ENERGY.max });
    world.setShopUnlocked(featureLevel() >= UNLOCK.shop);
  }
  if (saveTimer > 2 && saveDirty) { saveTimer = 0; persist(); }
}

// ---------------- 启动 ----------------
async function boot() {
  const msg = $('loadMsg'), bar = $('loadBar');
  const models = { gm4: 'models/gm4.glb', farmer1: 'models/farmer1.glb', girl1: 'models/girl1.glb', woman1: 'models/woman1.glb', boat1: 'models/boat1.glb', chicken1: 'models/chicken1.glb', cow1: 'models/cow1.glb', barn4: 'models/barn4.glb', barn5: 'models/barn5.glb', farmer3: 'models/farmer3.glb', windmill1: 'models/windmill1.glb', corn1: 'models/corn1.glb', wheat1: 'models/wheat1.glb', pumpkin1: 'models/pumpkin1.glb', carrot1: 'models/carrot1.glb',
    goldfish: 'models/goldfish.glb', koi: 'models/koi.glb', clown: 'models/clown.glb', carp: 'models/carp.glb', bluefish: 'models/bluefish.glb', catfish: 'models/catfish.glb', shark: 'models/shark.glb', croc: 'models/croc.glb', dolphin: 'models/dolphin.glb', whale: 'models/whale.glb' };
  await GLB.preload(models, (p, k) => { if (msg) msg.textContent = `正在加载模型 ${Math.round(p * 100)}%`; if (bar) bar.style.width = p * 100 + '%'; });
  if (msg) msg.textContent = '正在种草…';
  await new Promise((r) => setTimeout(r, 30));
  world = new World(scene, uniforms);
  mower = new Mower(scene);
  farm = new Farm({
    scene, world, save, stats: () => S,
    ui: { toast: UI.toast, openBuild: (n) => UI.openBuild(ctx, n), openEat: () => UI.openEat(ctx), floatAt: (t, x, y, z) => UI.floatAt(t, x, y, z, camera) },
    sfx: Sfx,
    fly: (a, b) => { if (baleFly.length < 12) baleFly.push({ a: a.clone(), b: b.clone(), t: 0 }); },
  });
  train = new Train(scene, world, {
    sfx: Sfx,
    onSold: (pay, units, at) => { save.coins += pay; saveDirty = true; UI.floatAt(`+${pay}`, at.x, at.y, at.z, camera); UI.toast(`小火车在市场卖了 ${Math.round(units)} 份草，+${pay} 金币`); Sfx.fanfare(); },
  });
  UI.init(ctx);
  loadLevel(clamp(save.level, 1, LEVEL_COUNT), true);
  S = stats(save);
  if (save.mode === 'walk' && featureLevel() >= UNLOCK.farm) { mode = 'walk'; car.x = world.pads.gate.cx; car.z = world.pads.gate.cz; car.yaw = Math.PI; car.pad = 'gate'; for (const k of save.party) mower.setSeated(k, false); farm.dismount(save.party, 0, FARM_Z + 1.6); }
  mower.g.position.set(car.x, 0, car.z);
  UI.hint(!save.hintDone);
  if (SANDBOX) { const b = document.createElement('div'); b.className = 'badge-sandbox'; b.textContent = '沙盒 · 全解锁'; document.querySelector('.bottom-stack').appendChild(b); }
  addEventListener('visibilitychange', () => { if (document.hidden) { persist(); Sfx.suspend(true); } else Sfx.suspend(false); });
  addEventListener('pagehide', persist);
  $('loading').remove();
  requestAnimationFrame((t) => { tPrev = t; frame(t); });
  window.__mower = { save, car, get field() { return field; }, get stats() { return S; }, get time() { return elapsed; }, get mode() { return mode; }, get farm() { return farm; }, get world() { return world; }, get mower() { return mower; }, get train() { return train; }, THREE_V: THREE.Vector3, CROPS, cargoTotal, setRuns: (r) => { save.runs = r; cargoSum = r.reduce((a, x) => a + x.u, 0); cargoDirty = true; }, ctx, pickups, sandbox: SANDBOX, renderer, groundY, inWater: () => inWater(car.x, car.z), setCam: (p, t) => { camFree = p ? { p: new THREE.Vector3(...p), t: new THREE.Vector3(...t) } : null; } };
}
boot().catch((e) => { console.error(e); const m = $('loadMsg'); if (m) m.textContent = '加载失败：' + e.message; });
