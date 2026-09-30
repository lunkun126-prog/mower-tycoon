// 农场玩法：下车变人、草料机打捆、草棚拿草捆、喂鸡喂牛、收蛋收奶、上货架、顾客从码头来买
import * as THREE from 'three';
import { FARM, GOODS, BALE, CUSTOMER, FARM_Z, GATE, ISLAND, CHARACTERS, ENERGY } from './config.js';
import { person, squareBale } from './models.js';
import { box, sphere, cyl, lam, nameplate } from './assets.js';

const inRect = (r, x, z, m = 0) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TINTS = [0xffffff, 0xffd9b0, 0xb0d8ff, 0xffb0c8, 0xc8ffb0];

export class Farm {
  constructor({ scene, world, save, stats, ui, sfx, fly }) {
    this.scene = scene; this.world = world; this.save = save; this.stats = stats; this.ui = ui; this.sfx = sfx; this.fly = fly;
    this.man = { x: 0, z: 20.5, yaw: Math.PI, speed: 0, pad: null };
    this.model = person() || Object.assign(new THREE.Group(), { userData: { mix: { play() {}, update() {} }, size: new THREE.Vector3(0.6, 1.75, 0.6) } });
    this.model.visible = false; scene.add(this.model);
    this.mix = this.model.userData.mix; this.mix.play('Idle');
    this.plate = nameplate(CHARACTERS.driver.name, CHARACTERS.driver.avatar, 3.8); this.plate.position.set(0, 2.45, 0); this.model.add(this.plate);
    // 头顶草捆 / 手里篮子
    this.carryG = new THREE.Group(); this.model.add(this.carryG);
    this.baleMeshes = [];
    for (let i = 0; i < 14; i++) { const b = squareBale(); b.scale.setScalar(0.62); b.position.set(0, 1.85 + i * 0.29, 0); b.visible = false; this.carryG.add(b); this.baleMeshes.push(b); }
    this.basket = new THREE.Group(); this.basket.position.set(0.42, 0.75, 0.15); this.basket.visible = false; this.model.add(this.basket);
    cyl(0.22, 0.16, 0.22, lam(0xc58b4a), 0, 0, 0, this.basket, 10);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 6, 14, Math.PI), lam(0x8a5a2a)); handle.position.y = 0.1; this.basket.add(handle);
    this.basketEggs = []; this.basketMilk = [];
    for (let i = 0; i < 6; i++) { const e = sphere(0.06, lam(0xfff4d6), Math.cos(i) * 0.1, 0.1, Math.sin(i) * 0.1, this.basket, 6); e.visible = false; this.basketEggs.push(e); }
    for (let i = 0; i < 4; i++) { const m = cyl(0.04, 0.045, 0.2, lam(0xf8f8f8), -0.08 + (i % 2) * 0.16, 0.18, -0.06 + Math.floor(i / 2) * 0.12, this.basket, 6); m.visible = false; this.basketMilk.push(m); }
    this.customers = []; this.custTimer = 4; this.balerBusy = 0;
    this.sync();
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
  dismount(x, z, rawFish = 0) {
    this.man.x = x; this.man.z = z; this.man.yaw = 0; this.man.speed = 0; this.man.pad = 'gate';
    this.model.visible = true; this.model.position.set(x, 0, z); this.model.rotation.y = 0; this.mix.play('Idle');
    if (rawFish > 0) { this.f.carry.rawFish += rawFish; this.dirty = true; }
    this.ui.toast(rawFish > 0 ? `下车了！提着 ${rawFish} 条鱼，去「灶台」烤了吃或上架卖` : this.f.bales > 0 ? '下车了！去「草棚」扛草捆，喂鸡喂牛' : '下车了！先去「打捆」格把车上的草打成草捆');
  }
  hide() { this.model.visible = false; }

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
    this.model.position.set(man.x, 0, man.z); this.model.rotation.y = man.yaw;
    this.mix.play(man.speed > 2.6 ? 'Run' : man.speed > 0.3 ? 'Walk' : 'Idle', 0.2, man.speed > 2.6 ? 1.1 : 1);
    this.mix.update(dt);
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
