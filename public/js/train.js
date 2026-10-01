// 小火车（第 11 关起出现）：基地右边的站台上一圈环形小铁轨。
// 开车停到「装火车」格，草一块块飞进车厢；车开走（或装满）后小火车鸣笛出发，绕一圈穿过「市场」把草卖掉、给钱，再开回站台等下一车。
import * as THREE from 'three';
import { STATION, TRAIN, CROPS } from './config.js';
import { box, cyl, lam, TEX, textPlane } from './assets.js';

const CX = 24.4, CZ = 4.9, LH = 3.6, R = 3.0;               // 跑道形铁轨：中心、直道半长、弯道半径
const P = 4 * LH + 2 * Math.PI * R;                          // 一圈长度
const STOP = 4 * LH + Math.PI * R - 0.4;                     // 车头停靠位置（北边直道西头，靠镜头这边，装车看得清）
const MARKET = LH;                                           // 市场（南边直道正中，远处）
const TO_MARKET = ((MARKET - STOP) % P + P) % P;             // 从停靠点开到市场的距离
const GAP = 2.35;                                            // 车厢间距
const SLOTS = 16;                                            // 每节车厢显示几块草

function pathAt(s, out) {
  s = ((s % P) + P) % P;
  if (s < 2 * LH) return out.set(CX - LH + s, 0, CZ - R);
  s -= 2 * LH;
  if (s < Math.PI * R) { const a = s / R; return out.set(CX + LH + R * Math.sin(a), 0, CZ - R * Math.cos(a)); }
  s -= Math.PI * R;
  if (s < 2 * LH) return out.set(CX + LH - s, 0, CZ + R);
  s -= 2 * LH; const a = s / R;
  return out.set(CX - LH - R * Math.sin(a), 0, CZ + R * Math.cos(a));
}
const _p = new THREE.Vector3(), _q = new THREE.Vector3();
function place(obj, s) {
  pathAt(s, _p); pathAt(s + 0.05, _q);
  obj.position.set(_p.x, 0.12, _p.z);
  obj.rotation.y = Math.atan2(-(_q.z - _p.z), _q.x - _p.x);   // 模型朝 +x
}

function locomotive(color) {
  const g = new THREE.Group(), paint = lam(color, { roughness: 0.45, metalness: 0.2 }), black = lam(0x22262a, { roughness: 0.6 }), gold = lam(0xf2c230, { metalness: 0.5, roughness: 0.35 });
  box(2.3, 0.22, 1.05, black, 0, 0.42, 0, g);
  const boiler = cyl(0.42, 0.42, 1.5, paint, 0.35, 0.95, 0, g, 16); boiler.rotation.z = Math.PI / 2;
  for (const x of [-0.1, 0.55]) { const band = cyl(0.44, 0.44, 0.06, gold, x, 0.95, 0, g, 16); band.rotation.z = Math.PI / 2; }
  const nose = cyl(0.3, 0.3, 0.1, black, 1.12, 0.95, 0, g, 16); nose.rotation.z = Math.PI / 2;
  cyl(0.1, 0.1, 0.06, lam(0xfff3b0, { emissive: 0xffe680, emissiveIntensity: 0.8 }), 1.18, 1.2, 0, g, 10).rotation.z = Math.PI / 2;
  cyl(0.16, 0.1, 0.55, black, 0.85, 1.55, 0, g, 10);                       // 烟囱
  cyl(0.2, 0.2, 0.08, black, 0.85, 1.84, 0, g, 10);
  cyl(0.14, 0.14, 0.2, gold, 0.25, 1.45, 0, g, 10);                        // 汽包
  box(0.85, 1.0, 1.05, paint, -0.7, 1.05, 0, g);                           // 司机室
  box(1.05, 0.08, 1.25, black, -0.7, 1.6, 0, g);
  for (const z of [-0.53, 0.53]) box(0.4, 0.35, 0.02, lam(0xcfe8f5, { roughness: 0.2 }), -0.65, 1.2, z, g, false);
  const cow = box(0.25, 0.25, 0.9, black, 1.25, 0.38, 0, g); cow.rotation.z = 0.5; // 排障器
  const wheels = [];
  for (const x of [-0.75, 0, 0.7]) for (const z of [-0.5, 0.5]) { const w = cyl(0.26, 0.26, 0.1, lam(0xb03030), x, 0.3, z, g, 14); w.rotation.x = Math.PI / 2; wheels.push(w); }
  g.userData.wheels = wheels;
  return g;
}
function wagon(color) {
  const g = new THREE.Group(), wood = TEX.mat('planks', { repeat: 0.6, color }), black = lam(0x22262a, { roughness: 0.6 });
  box(2.0, 0.16, 1.05, black, 0, 0.38, 0, g);
  box(1.9, 0.1, 1.0, wood, 0, 0.5, 0, g);
  for (const z of [-0.48, 0.48]) box(1.9, 0.45, 0.06, wood, 0, 0.75, z, g);
  for (const x of [-0.93, 0.93]) box(0.06, 0.45, 1.0, wood, x, 0.75, 0, g);
  box(0.3, 0.06, 0.08, black, 1.12, 0.4, 0, g); box(0.3, 0.06, 0.08, black, -1.12, 0.4, 0, g);   // 车钩
  const wheels = [];
  for (const x of [-0.6, 0.6]) for (const z of [-0.5, 0.5]) { const w = cyl(0.2, 0.2, 0.08, black, x, 0.26, z, g, 12); w.rotation.x = Math.PI / 2; wheels.push(w); }
  const fill = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.3, 0.42), lam(0xffffff, { roughness: 0.9 }), SLOTS);
  fill.count = 0; fill.castShadow = true; fill.setColorAt(0, new THREE.Color(1, 1, 1)); g.add(fill);
  g.userData = { wheels, fill };
  return g;
}

export class Train {
  constructor(scene, world, { onSold, sfx } = {}) {
    this.scene = scene; this.world = world; this.onSold = onSold; this.sfx = sfx;
    this.g = new THREE.Group(); this.g.visible = false; scene.add(this.g);
    this.active = false; this.state = 'wait'; this.s = STOP; this.idle = 0; this.sold = false;
    this.units = 0; this.value = 0; this.blocks = [];   // blocks：每块草的作物类型（显示用）
    this.blockers = [{ x0: CX - 2.3, x1: CX + 2.3, z0: CZ - R - 1.4, z1: CZ - R + 1.0 }];   // 市场棚子
    this.build();
  }

  build() {
    const g = this.g, S = STATION;
    // 站台地面（和基地一样的铺砖）+ 下面的石崖
    const pav = this.world.makePaver ? this.world.makePaver() : null; if (pav) pav.repeat.set(1.6, 1.3);
    const ground = new THREE.Mesh(new THREE.BoxGeometry(S.x1 - S.x0, 1.2, S.z1 - S.z0), pav ? new THREE.MeshStandardMaterial({ map: pav, roughness: 0.9 }) : lam(0x8a949c));
    ground.position.set((S.x0 + S.x1) / 2, -0.6, (S.z0 + S.z1) / 2); ground.receiveShadow = true; g.add(ground);
    const cliff = new THREE.Mesh(new THREE.BoxGeometry(S.x1 - S.x0 + 0.5, 4.2, S.z1 - S.z0 + 0.5), TEX.mat('rock', { repeat: 0.3, color: 0x8f8070 }));
    cliff.position.set((S.x0 + S.x1) / 2 + 0.25, -2.15, (S.z0 + S.z1) / 2); g.add(cliff);
    // 草坪圈（铁轨中间、装车格外圈）
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(2 * LH + 2 * R - 0.6, 2 * R - 0.6), TEX.mat('grass2', { repeat: 1.2, color: 0xa9d46a }));
    lawn.rotation.x = -Math.PI / 2; lawn.position.set(CX, 0.01, CZ); g.add(lawn);
    // 铁轨：两条钢轨 + 枕木 + 道砟
    const pts = (off) => { const a = []; for (let i = 0; i < 180; i++) { const s = i / 180 * P; pathAt(s, _p); pathAt(s + 0.05, _q); const dx = _q.x - _p.x, dz = _q.z - _p.z, l = Math.hypot(dx, dz); a.push(new THREE.Vector3(_p.x - dz / l * off, 0.2, _p.z + dx / l * off)); } return a; };
    const steel = lam(0xb8c0c6, { metalness: 0.8, roughness: 0.3 });
    for (const off of [-0.42, 0.42]) { const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts(off), true), 240, 0.05, 6, true), steel); rail.castShadow = true; g.add(rail); }
    const n = Math.round(P / 0.55), sl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.24, 0.09, 1.25), lam(0x6b4a2b, { roughness: 0.95 }), n);
    const ballast = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.06, 1.6), lam(0x8d8a84, { roughness: 1 }), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < n; i++) { const s = i / n * P; pathAt(s, _p); pathAt(s + 0.05, _q); q.setFromAxisAngle(up, Math.atan2(-(_q.z - _p.z), _q.x - _p.x)); m.compose(_p.setY(0.12), q, one); sl.setMatrixAt(i, m); m.compose(_p.setY(0.04), q, one); ballast.setMatrixAt(i, m); }
    sl.receiveShadow = true; ballast.receiveShadow = true; g.add(ballast); g.add(sl);
    // 市场棚子：火车从下面穿过去，草就卖掉了
    const shed = new THREE.Group(); shed.position.set(CX, 0, CZ - R); g.add(shed);
    const wood = TEX.mat('planks', { repeat: 0.6, color: 0xb8753a });
    for (const x of [-2, 2]) for (const z of [-0.95, 0.95]) cyl(0.12, 0.12, 2.9, wood, x, 1.45, z, shed, 8);
    const roof1 = box(4.6, 0.12, 1.4, lam(0xe8534a), 0, 3.15, -0.6, shed); roof1.rotation.x = -0.4;   // 人字顶：两边往外低
    const roof2 = box(4.6, 0.12, 1.4, lam(0xfff6e6), 0, 3.15, 0.6, shed); roof2.rotation.x = 0.4;
    const sign = textPlane('市场 · 卖草', 0.55, { color: '#fff', stroke: '#7a1c10' }); sign.position.set(0, 2.5, 1.0); shed.add(sign);
    for (const x of [-1.5, 1.5]) { box(0.9, 0.6, 0.45, lam(0x8a5a2a), x, 0.3, -1.25, shed); box(0.9, 0.18, 0.45, lam(0xffc21a), x, 0.69, -1.25, shed); }   // 收草的小摊
    this.marketPos = new THREE.Vector3(CX, 3.2, CZ - R);
    // 站牌
    const post = cyl(0.08, 0.08, 2.4, 0x444a50, S.x0 + 1.4, 1.2, S.gz0 - 0.4, g, 8);
    const board = textPlane('小火车站', 0.6, { color: '#fff', stroke: '#1d4a66' }); board.position.set(S.x0 + 1.4, 2.6, S.gz0 - 0.4); g.add(board); post.castShadow = true;
    // 站台外圈栏杆（入口那边不拦）
    const rail = TEX.mat('planks', { repeat: 0.6, color: 0xb8753a });
    const fence = (x0, z0, x1, z1) => { const len = Math.hypot(x1 - x0, z1 - z0), k = Math.max(1, Math.round(len / 2.4)); for (const y of [0.5, 0.85]) { const b = box(len, 0.1, 0.1, rail, (x0 + x1) / 2, y, (z0 + z1) / 2, g); b.rotation.y = -Math.atan2(z1 - z0, x1 - x0); } for (let i = 0; i <= k; i++) box(0.26, 1.15, 0.26, 0x8a5a2a, x0 + (x1 - x0) * i / k, 0.55, z0 + (z1 - z0) * i / k, g); };
    fence(S.x0, S.z0 + 0.1, S.x1 - 0.1, S.z0 + 0.1); fence(S.x1 - 0.1, S.z0 + 0.1, S.x1 - 0.1, S.z1 - 0.1); fence(S.x0, S.z1 - 0.1, S.x1 - 0.1, S.z1 - 0.1);
    // 火车：车头 + 车厢
    this.loco = locomotive(0x2e7d32); g.add(this.loco);
    this.wagons = [];
    const wc = [0xc0392b, 0x2c6fa8, 0xd39d12, 0x7a4fb0];
    for (let i = 0; i < TRAIN.wagons; i++) { const w = wagon(wc[i % wc.length]); g.add(w); this.wagons.push(w); }
    this.smoke = [];
    const sg = new THREE.SphereGeometry(0.22, 8, 6);
    for (let i = 0; i < 10; i++) { const p = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 1, transparent: true, opacity: 0.8, depthWrite: false })); p.visible = false; g.add(p); this.smoke.push({ m: p, t: 1 }); }
    this.pose();
  }

  // 第 11 关起才有：站台、铁轨、火车、装车格一起出现；栏杆缺口打开
  setActive(on) {
    if (this.active === on && this.pad) return;
    this.active = on; this.g.visible = on;
    if (this.world.eastGap) this.world.eastGap.visible = !on;
    const rb = this.world.rowboat; if (rb) { rb.userData.home = rb.userData.home || rb.position.clone(); rb.position.x = on ? 35.5 : rb.userData.home.x; rb.position.z = on ? 2.5 : rb.userData.home.z; }   // 海上那条小木船原来就漂在站台这个位置
    if (!this.pad) this.pad = this.world.pad('train', CX, CZ + 0.25, 2 * LH - 0.6, 2 * R - 1.9, 'rgba(46,125,50,0.45)', '装火车', 0.8, 0.03);
    this.pad.mesh.visible = on; if (this.pad.label) this.pad.label.visible = on;
    if (on) this.world.pads.train = this.pad; else delete this.world.pads.train;
  }
  inArea(x, z, m = 0) { const S = STATION; return this.active && x > S.x0 - m && x < S.x1 + m && z > S.z0 - m && z < S.z1 + m; }
  // 车能不能开到这里（站台里，避开市场棚子；进站口是基地右边栏杆的缺口）
  walkable(x, z) {
    const S = STATION, m = 0.9;
    if (!(x > S.x0 - 1 && x < S.x1 - m && z > S.z0 + m && z < S.z1 - m)) return false;
    if (x < S.x0 + 0.2 && !(z > S.gz0 + 0.6 && z < S.gz1 - 0.6)) return false;
    for (const b of this.blockers) if (x > b.x0 - 0.7 && x < b.x1 + 0.7 && z > b.z0 - 0.7 && z < b.z1 + 0.7) return false;
    return true;
  }

  get cap() { return TRAIN.cap; }
  get room() { return this.state === 'wait' ? Math.max(0, TRAIN.cap - this.units) : 0; }
  // 装车：units 份草（价值 value），t 是作物类型
  load(units, value, t) {
    this.units += units; this.value += value; this.idle = 0;
    const want = Math.min(SLOTS * this.wagons.length, Math.round(this.units / TRAIN.cap * SLOTS * this.wagons.length));
    while (this.blocks.length < want) this.blocks.push(t);
    this.paintBlocks();
  }
  paintBlocks() {
    const m = new THREE.Matrix4(), c = new THREE.Color();
    this.wagons.forEach((w, wi) => {
      const f = w.userData.fill, list = this.blocks.slice(wi * SLOTS, (wi + 1) * SLOTS);
      list.forEach((t, i) => { const layer = Math.floor(i / 8), k = i % 8; m.makeTranslation(-0.66 + (k % 4) * 0.44, 0.7 + layer * 0.31, k < 4 ? -0.22 : 0.22); f.setMatrixAt(i, m); f.setColorAt(i, c.setHex(CROPS[t].block)); });
      f.count = list.length; f.instanceMatrix.needsUpdate = true; if (f.instanceColor) f.instanceColor.needsUpdate = true;
    });
  }
  // 下一块草该飞进哪节车厢（世界坐标）
  slotWorld(out) { const i = Math.min(this.wagons.length - 1, Math.floor(this.blocks.length / SLOTS)); return this.wagons[i].localToWorld(out.set(0, 1.1, 0)); }

  pose() {
    place(this.loco, this.s);
    this.wagons.forEach((w, i) => place(w, this.s - 1.2 - GAP * (i + 0.5) - 0.05 * i));
  }

  // carOnPad：拖拉机是不是停在装车格上
  update(dt, carOnPad) {
    if (!this.active) return;
    const spin = (ws, d) => ws.forEach((w) => { w.rotation.y -= d; });
    if (this.state === 'wait') {
      if (this.units > 0 && (!carOnPad || this.units >= TRAIN.cap - 1e-6)) this.idle += dt;
      if (this.units > 0 && this.idle >= (this.units >= TRAIN.cap - 1e-6 ? 0.8 : TRAIN.leaveAfter)) {
        this.state = 'run'; this.dist = 0; this.sold = false; this.speed = 0;
        this.sfx && this.sfx.blip(660, 0.35, 'square', 0.08); setTimeout(() => this.sfx && this.sfx.blip(880, 0.45, 'square', 0.08), 380);
      }
    } else {
      this.speed = Math.min(TRAIN.speed, this.speed + dt * 2.2);
      const left = P - this.dist; if (left < 3) this.speed = Math.max(0.8, Math.min(this.speed, left * 1.3));
      const d = Math.min(left, this.speed * dt);
      this.dist += d; this.s = STOP + this.dist;
      spin(this.loco.userData.wheels, d / 0.26); this.wagons.forEach((w) => spin(w.userData.wheels, d / 0.2));
      // 车头穿过市场：卖草、给钱
      if (!this.sold && this.dist >= TO_MARKET + GAP * 1.5) {
        this.sold = true;
        const pay = Math.round(this.value * TRAIN.bonus);
        this.onSold && this.onSold(pay, this.units, this.marketPos);
        this.units = 0; this.value = 0; this.blocks = []; this.paintBlocks();
      }
      // 烟囱冒烟
      this.puff = (this.puff || 0) + dt * (2 + this.speed);
      if (this.puff > 1) { this.puff = 0; const p = this.smoke.find((x) => x.t >= 1); if (p) { p.t = 0; this.loco.localToWorld(p.m.position.set(0.85, 1.95, 0)); p.m.visible = true; } }
      if (this.dist >= P - 1e-3) { this.state = 'wait'; this.s = STOP; this.idle = 0; this.speed = 0; }
      this.pose();
    }
    for (const p of this.smoke) if (p.t < 1) { p.t += dt * 0.7; p.m.position.y += dt * 1.4; p.m.scale.setScalar(1 + p.t * 2.5); p.m.material.opacity = 0.8 * (1 - p.t); if (p.t >= 1) p.m.visible = false; }
  }
}
