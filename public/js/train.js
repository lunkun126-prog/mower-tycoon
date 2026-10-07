// 小火车（第 11 关起出现）：铁轨铺在草场边上（左边 → 上边 → 右边，U 形），右下角铁轨尽头是「市场」。
// 火车平时沿铁轨跟着割草机走，车斗里的草自动一块块飞进车厢，不用开回基地；
// 装满了（或者车开出草场一会儿）就鸣笛开到市场卖掉、给钱，再开回割草机旁边接着装。
import * as THREE from 'three';
import { TRAIN, CROPS, FIELD_Y } from './config.js';
import { box, cyl, lam, TEX, textPlane } from './assets.js';

const GAP = 2.35;                                            // 车厢间距
const SLOTS = 16;                                            // 每节车厢显示几块草
const RC = 2.2;                                              // 拐角半径
const _p = new THREE.Vector3(), _q = new THREE.Vector3();

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
    this.g = new THREE.Group(); this.g.position.y = FIELD_Y; this.g.visible = false; scene.add(this.g);
    this.active = false; this.state = 'wait'; this.returning = false; this.s = 0; this.away = 0; this.full = 0; this.speed = 0;
    this.units = 0; this.value = 0; this.blocks = [];   // blocks：每块草的作物类型（显示用）
    this.ts = { cap: TRAIN.cap, wagons: TRAIN.wagons, speed: TRAIN.speed, bonus: TRAIN.bonus };
    this.X = [0, 1]; this.Z = [0, 0]; this.S = [0, 1]; this.P = 1;
    this.build();
  }

  // ---- 铁轨路径：采样点 + 累计长度 ----
  makePath(field) {
    const off = TRAIN.off, xl = field.x0 - off, xr = -field.x0 + off, zt = field.z0 - off, zb = field.z1 - 0.9;
    const X = [], Z = [];
    const line = (x0, z0, x1, z1) => { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.25)); for (let i = 0; i < n; i++) { X.push(x0 + (x1 - x0) * i / n); Z.push(z0 + (z1 - z0) * i / n); } };
    const arc = (cx, cz, a0, a1) => { const n = 12; for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * i / n; X.push(cx + RC * Math.cos(a)); Z.push(cz + RC * Math.sin(a)); } };
    line(xl, zb, xl, zt + RC); arc(xl + RC, zt + RC, Math.PI, 1.5 * Math.PI);
    line(xl + RC, zt, xr - RC, zt); arc(xr - RC, zt + RC, 1.5 * Math.PI, 2 * Math.PI);
    line(xr, zt + RC, xr, zb); X.push(xr); Z.push(zb);
    const S = [0]; for (let i = 1; i < X.length; i++) S.push(S[i - 1] + Math.hypot(X[i] - X[i - 1], Z[i] - Z[i - 1]));
    this.X = X; this.Z = Z; this.S = S; this.P = S[S.length - 1]; this.end = { x: xr, z: zb };
  }
  pathAt(s, out) {
    const S = this.S; s = Math.max(0, Math.min(this.P, s));
    let lo = 0, hi = S.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
    const k = S[hi] > S[lo] ? (s - S[lo]) / (S[hi] - S[lo]) : 0;
    return out.set(this.X[lo] + (this.X[hi] - this.X[lo]) * k, 0, this.Z[lo] + (this.Z[hi] - this.Z[lo]) * k);
  }
  nearestS(x, z) {
    let best = 1e18, bi = 0; for (let i = 0; i < this.X.length; i++) { const d = (this.X[i] - x) ** 2 + (this.Z[i] - z) ** 2; if (d < best) { best = d; bi = i; } }
    return this.S[bi];
  }
  place(obj, s) {
    this.pathAt(s - 0.15, _p); this.pathAt(s + 0.15, _q);
    obj.position.set((_p.x + _q.x) / 2, 0.12, (_p.z + _q.z) / 2);
    obj.rotation.y = Math.atan2(-(_q.z - _p.z), _q.x - _p.x);   // 模型朝 +x
  }

  build() {
    const g = this.g;
    this.track = new THREE.Group(); g.add(this.track);
    // 市场棚子（铁轨尽头，右下角）：火车开进来，草就卖掉了
    const shed = new THREE.Group(); g.add(shed); this.shed = shed;
    const wood = TEX.mat('planks', { repeat: 0.6, color: 0xb8753a });
    for (const x of [-1.15, 1.15]) for (const z of [-1.3, 1.3]) cyl(0.11, 0.11, 2.7, wood, x, 1.35, z, shed, 8);
    const roof1 = box(1.5, 0.1, 3.0, lam(0xe8534a), -0.62, 2.95, 0, shed); roof1.rotation.z = 0.42;   // 人字顶
    const roof2 = box(1.5, 0.1, 3.0, lam(0xfff6e6), 0.62, 2.95, 0, shed); roof2.rotation.z = -0.42;
    const sign = textPlane('市场 · 卖草', 0.5, { color: '#fff', stroke: '#7a1c10' }); sign.position.set(0, 2.45, 1.4); shed.add(sign);
    this.stop = new THREE.Group(); g.add(this.stop);                         // 两头的车挡
    box(1.3, 0.5, 0.25, lam(0xd32f2f), 0, 0.4, 0, this.stop);
    this.stop2 = this.stop.clone(); g.add(this.stop2);
    this.marketPos = new THREE.Vector3();
    // 火车：车头 + 车厢（最多 TRAIN.maxWagons 节，按升级显示几节）
    this.loco = locomotive(0x2e7d32); g.add(this.loco);
    this.allWagons = [];
    const wc = [0xc0392b, 0x2c6fa8, 0xd39d12, 0x7a4fb0];
    for (let i = 0; i < TRAIN.maxWagons; i++) { const w = wagon(wc[i % wc.length]); w.visible = i < TRAIN.wagons; g.add(w); this.allWagons.push(w); }
    this.wagons = this.allWagons.slice(0, TRAIN.wagons);
    this.smoke = [];
    const sg = new THREE.SphereGeometry(0.22, 8, 6);
    for (let i = 0; i < 10; i++) { const p = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 1, transparent: true, opacity: 0.8, depthWrite: false })); p.visible = false; g.add(p); this.smoke.push({ m: p, t: 1 }); }
  }

  // 换关时重铺铁轨（草场大小每关不同）；第 11 关起才有
  setField(field, on) {
    this.active = on; this.g.visible = on;
    for (const c of [...this.track.children]) { this.track.remove(c); c.geometry && c.geometry.dispose(); }
    if (!on) return;
    this.makePath(field);
    const P = this.P;
    const pts = (off) => { const a = []; for (let s = 0; s <= P + 1e-6; s += 0.5) { this.pathAt(s - 0.05, _p); this.pathAt(s + 0.05, _q); const dx = _q.x - _p.x, dz = _q.z - _p.z, l = Math.hypot(dx, dz) || 1; this.pathAt(s, _p); a.push(new THREE.Vector3(_p.x - dz / l * off, 0.2, _p.z + dx / l * off)); } return a; };
    const steel = lam(0xb8c0c6, { metalness: 0.8, roughness: 0.3 });
    for (const off of [-0.42, 0.42]) { const p = pts(off), rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p, false), p.length * 2, 0.05, 6, false), steel); rail.castShadow = true; this.track.add(rail); }
    const n = Math.round(P / 0.55), sl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.24, 0.09, 1.25), lam(0x6b4a2b, { roughness: 0.95 }), n);
    const ballast = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.06, 1.6), lam(0x8d8a84, { roughness: 1 }), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < n; i++) { const s = (i + 0.5) / n * P; this.pathAt(s - 0.05, _p); this.pathAt(s + 0.05, _q); q.setFromAxisAngle(up, Math.atan2(-(_q.z - _p.z), _q.x - _p.x)); this.pathAt(s, _p); m.compose(_p.setY(0.12), q, one); sl.setMatrixAt(i, m); m.compose(_p.setY(0.04), q, one); ballast.setMatrixAt(i, m); }
    sl.receiveShadow = true; ballast.receiveShadow = true; this.track.add(ballast); this.track.add(sl);
    this.shed.position.set(this.end.x, 0, this.end.z - 1.1);
    this.marketPos.set(this.end.x, FIELD_Y + 3, this.end.z - 1.1);
    this.pathAt(0, _p); this.stop.position.set(_p.x, 0, _p.z + 0.2);
    this.stop2.position.set(this.end.x, 0, this.end.z + 0.2);
    this.state = 'wait'; this.returning = false; this.away = 0; this.full = 0; this.speed = 0;
    this.s = this.clampS(this.P * 0.5); this.pose();
  }
  setStats(ts) {
    this.ts = ts;
    if (this.wagons.length !== ts.wagons) {
      this.wagons = this.allWagons.slice(0, ts.wagons);
      this.allWagons.forEach((w, i) => { w.visible = i < ts.wagons; });
      this.paintBlocks(); this.s = this.clampS(this.s); this.active && this.pose();
    }
  }
  get len() { return 1.4 + GAP * this.wagons.length; }
  clampS(s) { return Math.max(this.len, Math.min(this.P - 1.2, s)); }

  get cap() { return this.ts.cap; }
  get room() { return this.active && this.state === 'wait' ? Math.max(0, this.ts.cap - this.units) : 0; }
  // 装车：units 份草（价值 value），t 是作物类型
  load(units, value, t) {
    this.units += units; this.value += value;
    const want = Math.min(SLOTS * this.wagons.length, Math.round(this.units / this.ts.cap * SLOTS * this.wagons.length));
    while (this.blocks.length < want) this.blocks.push(t);
    this.paintBlocks();
  }
  paintBlocks() {
    const m = new THREE.Matrix4(), c = new THREE.Color();
    this.allWagons.forEach((w, wi) => {
      const f = w.userData.fill, list = this.blocks.slice(wi * SLOTS, (wi + 1) * SLOTS);
      list.forEach((t, i) => { const layer = Math.floor(i / 8), k = i % 8; m.makeTranslation(-0.66 + (k % 4) * 0.44, 0.7 + layer * 0.31, k < 4 ? -0.22 : 0.22); f.setMatrixAt(i, m); f.setColorAt(i, c.setHex(CROPS[t].block)); });
      f.count = list.length; f.instanceMatrix.needsUpdate = true; if (f.instanceColor) f.instanceColor.needsUpdate = true;
    });
  }
  // 下一块草该飞进哪节车厢（世界坐标）
  slotWorld(out) { const i = Math.min(this.wagons.length - 1, Math.floor(this.blocks.length / SLOTS)); return this.wagons[i].localToWorld(out.set(0, 1.1, 0)); }

  pose() {
    this.place(this.loco, this.s);
    this.wagons.forEach((w, i) => this.place(w, this.s - 1.25 - GAP * (i + 0.5)));
  }

  // car：{ x, z, inField } 割草机在哪、在不在草场里
  update(dt, car) {
    if (!this.active) return;
    const spin = (d) => { this.loco.userData.wheels.forEach((w) => { w.rotation.y -= d / 0.26; }); this.wagons.forEach((wg) => wg.userData.wheels.forEach((w) => { w.rotation.y -= d / 0.2; })); };
    const move = (target, vmax) => {
      const diff = target - this.s; if (Math.abs(diff) < 1e-3) { this.speed = 0; return 0; }
      this.speed = Math.min(vmax, this.speed + dt * 10); if (Math.abs(diff) < 3) this.speed = Math.min(this.speed, Math.max(0.6, Math.abs(diff) * 1.5));
      const d = Math.sign(diff) * Math.min(Math.abs(diff), this.speed * dt);
      this.s += d; spin(d); this.pose(); return Math.abs(d);
    };
    let moved = 0;
    if (this.state === 'wait') {
      // 跟着割草机走：车厢中间对着割草机
      if (car.inField || this.returning) {
        const target = this.clampS(this.nearestS(car.x, car.z) + this.len / 2);
        moved = move(target, this.returning || Math.abs(target - this.s) > 8 ? this.ts.speed * 1.5 : TRAIN.follow);   // 离得远就快点赶过来
        if (this.returning && Math.abs(target - this.s) < 0.5) this.returning = false;
      }
      this.full = this.units >= this.ts.cap - 1e-6 ? this.full + dt : 0;
      this.away = this.units > 0 && !car.inField ? this.away + dt : 0;
      if (this.full > 0.6 || this.away > TRAIN.leaveAfter) {
        this.state = 'go'; this.speed = 0;
        this.sfx && this.sfx.blip(660, 0.35, 'square', 0.08); setTimeout(() => this.sfx && this.sfx.blip(880, 0.45, 'square', 0.08), 380);
      }
    } else {
      moved = move(this.P - 1.2, this.ts.speed);
      // 车头开进市场：卖草、给钱，然后开回割草机旁边
      if (this.s >= this.P - 1.3) {
        const pay = Math.round(this.value * this.ts.bonus);
        this.onSold && this.onSold(pay, this.units, this.marketPos);
        this.units = 0; this.value = 0; this.blocks = []; this.paintBlocks();
        this.state = 'wait'; this.returning = true; this.full = 0; this.away = 0; this.speed = 0;
      }
    }
    // 烟囱冒烟（开得越快冒得越多）
    if (moved > 0) {
      this.puff = (this.puff || 0) + dt * (2 + this.speed);
      if (this.puff > 1) { this.puff = 0; const p = this.smoke.find((x) => x.t >= 1); if (p) { p.t = 0; this.g.worldToLocal(this.loco.localToWorld(p.m.position.set(0.85, 1.95, 0))); p.m.visible = true; } }
    }
    for (const p of this.smoke) if (p.t < 1) { p.t += dt * 0.7; p.m.position.y += dt * 1.4; p.m.scale.setScalar(1 + p.t * 2.5); p.m.material.opacity = 0.8 * (1 - p.t); if (p.t >= 1) p.m.visible = false; }
  }
}
