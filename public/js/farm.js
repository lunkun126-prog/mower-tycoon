// 农场玩法：下车变人、草料机打捆、草棚拿草捆、喂鸡喂牛、收蛋收奶、上货架、顾客从码头来买
import * as THREE from 'three';
import { FARM, GOODS, BALE, CUSTOMER, FARM_Z, GATE, ISLAND, CHARACTERS, ENERGY } from './config.js';
import { person, squareBale } from './models.js';
import { box, sphere, cyl, lam, nameplate, GLB } from './assets.js';

const inRect = (r, x, z, m = 0) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TINTS = [0xffffff, 0xffd9b0, 0xb0d8ff, 0xffb0c8, 0xc8ffb0];

export class Farm {
  constructor({ scene, world, save, stats, ui, sfx, fly }) {
    this.scene = scene; this.world = world; this.save = save; this.stats = stats; this.ui = ui; this.sfx = sfx; this.fly = fly;
    this.man = { x: 0, z: 20.5, yaw: Math.PI, speed: 0, pad: null };
    // 一家三口都能下车：每人一个走路模型（一介草民=男农夫，甜甜=小女孩，岁月静好=奶奶），想让谁下就谁下
    this.walkers = {};
    for (const key of Object.keys(CHARACTERS)) {
      const C = CHARACTERS[key];
      const m = GLB.make(C.model, { height: C.h, rotY: Math.PI }) || Object.assign(new THREE.Group(), { userData: { size: new THREE.Vector3(0.6, C.h, 0.6) } });
      const mix = m.userData.anims ? GLB.mixer(m) : { play() {}, update() {} };
      m.visible = false; scene.add(m); mix.play(C.anim.idle);
      const plate = nameplate(C.name, C.avatar, 3.8 * Math.max(0.75, C.h / 1.75)); plate.position.set(0, C.h + 0.7, 0); m.add(plate);
      this.walkers[key] = { key, C, model: m, mix, x: 0, z: 20.5, yaw: 0 };
    }
    this.party = ['driver']; this.trail = [];
    // 头顶草捆 / 手里篮子（挂在领头的人身上）
    this.carryG = new THREE.Group();
    this.baleMeshes = [];
    for (let i = 0; i < 14; i++) { const b = squareBale(); b.scale.setScalar(0.62); b.position.set(0, i * 0.29, 0); b.visible = false; this.carryG.add(b); this.baleMeshes.push(b); }
    this.basket = new THREE.Group(); this.basket.visible = false;
    cyl(0.22, 0.16, 0.22, lam(0xc58b4a), 0, 0, 0, this.basket, 10);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 6, 14, Math.PI), lam(0x8a5a2a)); handle.position.y = 0.1; this.basket.add(handle);
    this.basketEggs = []; this.basketMilk = [];
    for (let i = 0; i < 6; i++) { const e = sphere(0.06, lam(0xfff4d6), Math.cos(i) * 0.1, 0.1, Math.sin(i) * 0.1, this.basket, 6); e.visible = false; this.basketEggs.push(e); }
    for (let i = 0; i < 4; i++) { const m = cyl(0.04, 0.045, 0.2, lam(0xf8f8f8), -0.08 + (i % 2) * 0.16, 0.18, -0.06 + Math.floor(i / 2) * 0.12, this.basket, 6); m.visible = false; this.basketMilk.push(m); }
    this.customers = []; this.custTimer = 4; this.balerBusy = 0;
    this.attachCarry('driver');
    this.sync();
  }
  get lead() { return this.walkers[this.party[0]]; }
  get model() { return this.lead.model; }
  get mix() { return this.lead.mix; }
  attachCarry(key) {
    const w = this.walkers[key], h = w.C.h;
    w.model.add(this.carryG); this.carryG.position.set(0, h + 0.1, 0);
    w.model.add(this.basket); this.basket.position.set(0.24 * h, 0.43 * h, 0.08 * h);
  }

  get f() { return this.save.farm; }

  // ---- 草料机（拖拉机在打捆格上卸草时调用）----
  feedBaler(units) {
    const S = this.stats();
    this.f.balerBuf += units; this.balerBusy = 1.5;
    let made = 0;
    while (this.f.balerBuf >= S.baleUnits - 1e-6 && this.f.bales < BALE.max) { this.f.balerBuf = Math.max(0, this.f.balerBuf - S.baleUnits); this.f.bales++; made++; }
    if (made) { this.world.setBales(this.f.bales); this.fly && this.fly(this.world.balerHopper, this.world.baleOut, 'bale'); }
    return made;
  }
  balerFull() { return this.f.bales >= BALE.max; }

  // ---- 动物生产（每帧）----
  tick(dt) {
    this.balerBusy = Math.max(0, this.balerBusy - dt); this.world.balerBusy = this.balerBusy > 0;
    const S = this.stats();
    for (const name of ['coop', 'barn']) {
      const F = FARM[name], st = this.f[name], pen = this.world.farm[name];
      pen.house.visible = st.built; pen.sil.visible = !st.built; pen.fed = st.feed > 0;
      if (!st.built) continue;
      if (st.feed > 0 && st.goods < F.maxGoods) {
        st.t += dt * S.animalMult;
        if (st.t >= F.every) { st.t = 0; st.feed = st.feed - 0.2 < 1e-6 ? 0 : st.feed - 0.2; st.goods++; this.dirty = true; }
      }
    }
    // 顾客
    if (this.f.shelf.egg + this.f.shelf.milk + this.f.shelf.fish > 0) {
      this.custTimer -= dt * S.guestMult;
      if (this.custTimer <= 0 && this.customers.length < CUSTOMER.max) { this.custTimer = CUSTOMER.every * (0.7 + Math.random() * 0.6); this.spawnCustomer(); }
    }
    for (let i = this.customers.length - 1; i >= 0; i--) {
      const c = this.customers[i];
      if (c.state === 'come' || c.state === 'go') {
        const tgt = c.path[c.pi];
        const dx = tgt.x - c.x, dz = tgt.z - c.z, d = Math.hypot(dx, dz);
        if (d < 0.15) { c.pi++; if (c.pi >= c.path.length) { if (c.state === 'come') { c.state = 'buy'; c.wait = 1.1; } else { this.scene.remove(c.g); c.g.traverse((m) => { if (m.isMesh && m.material.userData.tinted) m.material.dispose(); }); this.customers.splice(i, 1); continue; } } }
        else { c.x += dx / d * CUSTOMER.walk * dt; c.z += dz / d * CUSTOMER.walk * dt; c.yaw = Math.atan2(-dx, -dz); }
        c.mix.play('Walk');
      } else if (c.state === 'buy') {
        c.mix.play('Idle'); c.yaw = 0; c.wait -= dt;
        if (c.wait <= 0) {
          const sh = this.f.shelf, avail = ['egg', 'milk', 'fish'].filter((k) => sh[k] > 0), pick = avail.length ? avail[Math.floor(Math.random() * avail.length)] : null;
          if (pick) {
            sh[pick]--; const pay = Math.floor(GOODS[pick].price * S.sellMult);
            this.save.coins += pay; this.ui.floatAt(`+${pay}`, c.x, 2.2, c.z); this.sfx.blip(900, 0.08, 'triangle');
            this.world.setShelf(sh.egg, sh.milk, sh.fish); this.dirty = true;
          }
          c.state = 'go'; c.path = [this.world.roadStart, this.world.pierEnd]; c.pi = 0;
        }
      }
      c.g.position.set(c.x, 0, c.z); c.g.rotation.y = c.yaw; c.mix.update(dt);
    }
  }
  spawnCustomer() {
    const g = person(TINTS[Math.floor(Math.random() * TINTS.length)]); if (!g) return;
    const pe = this.world.pierEnd, sf = this.world.shelfFront;
    const c = { g, mix: g.userData.mix, x: pe.x + (Math.random() - 0.5) * 1.2, z: pe.z, yaw: 0, state: 'come', pi: 0, path: [this.world.roadStart, { x: sf.x + (Math.random() - 0.5) * 1.6, z: sf.z }] };
    this.scene.add(g); this.customers.push(c);
  }

  // ---- 人物模式 ----
  // keys：下车的人（第一个是你操控的，其余跟在后面走）
  dismount(keys, x, z, rawFish = 0) {
    this.hide();
    this.party = keys.filter((k) => this.walkers[k]); if (!this.party.length) this.party = ['driver'];
    this.man.x = x; this.man.z = z; this.man.yaw = 0; this.man.speed = 0; this.man.pad = 'gate';
    this.trail = [];
    this.party.forEach((k, i) => { const w = this.walkers[k]; w.x = x + (i % 2 ? 0.9 : -0.9) * Math.ceil(i / 2); w.z = z - 0.4 * i; w.yaw = 0; w.model.visible = true; w.model.position.set(w.x, 0, w.z); w.model.rotation.y = 0; w.mix.play(w.C.anim.idle); });
    this.attachCarry(this.party[0]);
    if (rawFish > 0) { this.f.carry.rawFish += rawFish; this.dirty = true; }
    this.ui.toast(rawFish > 0 ? `下车了！提着 ${rawFish} 条鱼，去「灶台」烤了吃或上架卖` : this.f.bales > 0 ? '下车了！去「草棚」扛草捆，喂鸡喂牛' : '下车了！先去「打捆」格把车上的草打成草捆');
  }
  hide() { for (const k in this.walkers) this.walkers[k].model.visible = false; }

  walkable(x, z) {
    const m = 0.6;
    if (!(x > ISLAND.x0 + m && x < ISLAND.x1 - m && z < ISLAND.z1 - m)) {
      // 码头小路允许走到桥头
      if (!(Math.abs(x) < 1.1 && z >= ISLAND.z1 - m && z < ISLAND.z1 + 7.5)) return false;
    }
    if (z < FARM_Z + 0.35 && !(x > GATE.x0 + 0.3 && x < GATE.x1 - 0.3)) return false;
    if (z < FARM_Z - 0.6) return false;
    for (const b of this.world.farmBlockers) if (inRect(b, x, z, 0.35)) return false;
    return true;
  }

  // 返回 'mount' 表示走回大门要上车
  update(dt, inp) {
    const S = this.stats(), man = this.man;
    let target = 0;
    if (inp) {
      const want = Math.atan2(-inp.x, -inp.z);
      let d = want - man.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      man.yaw += clamp(d, -12 * dt, 12 * dt);
      target = S.walk * inp.mag * (this.f.carry.bales > 0 ? 0.85 : 1) * (this.f.energy <= 0 ? ENERGY.lowSpeed : 1);
    }
    if (man.speed > 0.3) { this.f.energy = Math.max(0, this.f.energy - dt * (this.f.carry.bales > 0 ? ENERGY.drainCarry : ENERGY.drainWalk)); if (Math.floor(this.f.energy) !== this._lastE) { this._lastE = Math.floor(this.f.energy); this.dirty = true; } }
    man.speed += (target - man.speed) * Math.min(1, dt * 10);
    const fx = -Math.sin(man.yaw), fz = -Math.cos(man.yaw);
    const nx = man.x + fx * man.speed * dt, nz = man.z + fz * man.speed * dt;
    if (this.walkable(nx, nz)) { man.x = nx; man.z = nz; }
    else if (this.walkable(nx, man.z)) man.x = nx;
    else if (this.walkable(man.x, nz)) man.z = nz;
    else man.speed = 0;
    const A = this.lead.C.anim;
    this.model.position.set(man.x, 0, man.z); this.model.rotation.y = man.yaw;
    this.mix.play(man.speed > 2.6 ? A.run : man.speed > 0.3 ? A.walk : A.idle, 0.2, man.speed > 2.6 ? 1.1 : 1);
    this.mix.update(dt);
    // 其他下车的人沿着你走过的路跟在后面
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(man.x - last.x, man.z - last.z) > 0.2) { this.trail.push({ x: man.x, z: man.z }); if (this.trail.length > 40) this.trail.shift(); }
    for (let i = 1; i < this.party.length; i++) {
      const w = this.walkers[this.party[i]], t = this.trail[Math.max(0, this.trail.length - 1 - i * 6)];
      let mv = 0;
      if (t) { const dx = t.x - w.x, dz = t.z - w.z, d = Math.hypot(dx, dz); if (d > 0.05) { const st = Math.min(d, (S.walk * 1.15) * dt); w.x += dx / d * st; w.z += dz / d * st; w.yaw = Math.atan2(-dx, -dz); mv = st / dt; } }
      w.model.position.set(w.x, 0, w.z); w.model.rotation.y = w.yaw;
      w.mix.play(mv > 2.6 ? w.C.anim.run : mv > 0.3 ? w.C.anim.walk : w.C.anim.idle, 0.2); w.mix.update(dt);
    }
    // 格子
    let pad = null;
    for (const name of ['shed', 'coop', 'barn', 'shelf', 'cook', 'gate']) if (inRect(this.world.pads[name], man.x, man.z)) { pad = name; break; }
    if (pad !== man.pad) { man.pad = pad; if (pad) this.onPad(pad); }
    if (man.z < FARM_Z + 0.5 && man.x > GATE.x0 && man.x < GATE.x1) return 'mount';
    return null;
  }

  onPad(name) {
    const S = this.stats(), c = this.f.carry;
    if (name === 'shed') {
      const room = S.carry - c.bales, take = Math.min(room, this.f.bales);
      if (take > 0) { c.bales += take; this.f.bales -= take; this.world.setBales(this.f.bales); this.sfx.blip(520, 0.1, 'triangle'); this.ui.toast(`扛了 ${take} 捆草（最多 ${S.carry} 捆）`); }
      else if (this.f.bales === 0) this.ui.toast('草棚空了：开车到「打捆」格把草打成草捆');
      else this.ui.toast('扛不动了，先去喂鸡喂牛');
    } else if (name === 'coop' || name === 'barn') {
      const F = FARM[name], st = this.f[name];
      if (!st.built) { this.ui.openBuild(name); return; }
      const parts = [];
      const room = Math.floor(F.maxFeed - st.feed), give = Math.min(room, c.bales);
      if (give > 0) { c.bales -= give; st.feed += give; parts.push(`喂了 ${give} 捆草`); }
      if (st.goods > 0) { c[F.good] += st.goods; parts.push(`收了 ${st.goods} ${GOODS[F.good].name}`); st.goods = 0; }
      if (!parts.length) parts.push(c.bales === 0 && st.feed <= 0 ? '没草了：去草棚扛草捆来喂' : st.feed > 0 ? `${F.name}正在生产…（草 ${st.feed.toFixed(1)} 捆）` : '槽满了');
      this.ui.toast(parts.join('，')); if (give || parts.length) this.sfx.blip(660, 0.12, 'triangle');
    } else if (name === 'shelf') {
      const sh = this.f.shelf; let put = 0;
      for (const k of ['egg', 'milk', 'fish']) { const room = S.shelfCap - sh.egg - sh.milk - sh.fish, n = Math.min(room, c[k]); if (n > 0) { sh[k] += n; c[k] -= n; put += n; } }
      this.world.setShelf(sh.egg, sh.milk, sh.fish);
      if (put) { this.ui.toast(`上架 ${put} 件，顾客会从码头过来买`); this.sfx.fanfare(); if (this.customers.length === 0) this.custTimer = Math.min(this.custTimer, 1.5); }
      else this.ui.toast(c.egg + c.milk + c.fish === 0 ? '篮子是空的：去鸡舍牛舍收鸡蛋牛奶，或灶台烤鱼' : '货架满了，等顾客买走');
    } else if (name === 'cook') {
      if (c.rawFish > 0) { const n = c.rawFish; c.fish += n; c.rawFish = 0; this.ui.toast(`烤了 ${n} 条鱼！可以吃，也可以上架卖`); this.sfx.blip(440, 0.2, 'triangle'); }
      this.ui.openEat();
    }
    this.dirty = true;
  }

  eat(kind) {
    const c = this.f.carry, g = GOODS[kind];
    if (!g || c[kind] <= 0) return false;
    c[kind]--; this.f.energy = Math.min(ENERGY.max, this.f.energy + g.energy); this.dirty = true; this.sfx.blip(520, 0.15, 'triangle');
    this.ui.toast(`${kind === 'milk' ? '喝' : '吃'}了 1 个${g.name}，体力 +${g.energy}`);
    return true;
  }
  // 同步展示（扛的草捆、篮子、货架、草棚、信息牌）
  sync() {
    const c = this.f.carry, S = this.stats();
    this.baleMeshes.forEach((m, i) => m.visible = i < c.bales);
    const hasGoods = c.egg + c.milk + c.fish + c.rawFish > 0; this.basket.visible = hasGoods;
    this.basketEggs.forEach((m, i) => m.visible = i < c.egg); this.basketMilk.forEach((m, i) => m.visible = i < c.milk);
    this.world.setShelf(this.f.shelf.egg, this.f.shelf.milk, this.f.shelf.fish); this.world.setBales(this.f.bales);
    this.world.shelfInfo.userData.set(`货架 ${this.f.shelf.egg + this.f.shelf.milk + this.f.shelf.fish}/${S.shelfCap}`);
    for (const name of ['coop', 'barn']) {
      const F = FARM[name], st = this.f[name], pen = this.world.farm[name];
      pen.info.userData.set(!st.built ? '走过来建造' : `草 ${st.feed.toFixed(1)}捆  ${GOODS[F.good].name} ${st.goods}`);
    }
  }
  taskText(mode, trunk) {
    const c = this.f.carry, sh = this.f.shelf, shelfN = sh.egg + sh.milk + sh.fish;
    if (mode !== 'walk') { const parts = []; if (trunk.fish || trunk.junk) parts.push(`后备箱 鱼${trunk.fish} 垃圾${trunk.junk}`); if (this.f.bales) parts.push(`草棚 ${this.f.bales} 捆`); if (shelfN) parts.push(`货架 ${shelfN} 件`); return parts.join(' · '); }
    return `扛草 ${c.bales} 捆 · 篮子 蛋${c.egg} 奶${c.milk} 鱼${c.rawFish + c.fish} · 草棚 ${this.f.bales} 捆 · 货架 ${shelfN} 件`;
  }
}
