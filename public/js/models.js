// 模型：割草机（拖拉机 glTF 车身 + 锯片臂 + 草斗 + 司机）、树、灌木、草垛、稻草人、鱼、船、鸭子、睡莲、顾客
import * as THREE from 'three';
import { rng, lam, box, cyl, sphere, TEX, canvasTex, GLB, nameplate } from './assets.js?v=1007';
import { CHARACTERS } from './config.js?v=1007';

// ---- 骨骼摆姿势：把骨头转到「指向某方向」，不依赖各模型骨骼的本地轴向（以前按本地轴硬掰，左右腿方向相反 → 翘二郎腿、手背到后面）
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
function boneMap(wrap) { const m = {}; wrap.traverse((o) => { if (o.name && !m[o.name]) m[o.name] = o; }); return m; }   // 含 *_end 末端节点（它们不是 Bone）
function aim(bone, child, dir) {
  if (!bone || !child) return;
  bone.updateWorldMatrix(true, true);
  bone.getWorldPosition(_a); child.getWorldPosition(_b);
  _q1.setFromUnitVectors(_b.sub(_a).normalize(), dir.clone().normalize());
  bone.getWorldQuaternion(_q2); _q1.multiply(_q2);
  bone.parent.getWorldQuaternion(_q2); bone.quaternion.copy(_q2.invert().multiply(_q1));
  bone.updateWorldMatrix(false, true);
}
function pin(bone, to) {   // 把独立的脚骨（IK 骨架）挪到小腿末端，脚跟着腿走
  if (!bone || !to) return;
  to.updateWorldMatrix(true, false); to.getWorldPosition(_a);
  bone.parent.updateWorldMatrix(true, false); bone.position.copy(bone.parent.worldToLocal(_a)); bone.updateWorldMatrix(false, true);
}
// 坐姿（Quaternius 骨架：农夫、奶奶）。three.js 加载时会去掉骨骼名里的点：UpperLeg.L → UpperLegL
// drive=true：两手向前握方向盘（司机）；false：两手放在腿上（乘客）。两腿都是大腿平伸向前、小腿垂下、两脚并排
function seatPose(wrap, drive) {
  const B = boneMap(wrap), V = (x, y, z) => new THREE.Vector3(x, y, z);
  wrap.updateMatrixWorld(true);
  for (const s of ['L', 'R']) {
    const up = B['UpperLeg' + s]; if (!up) { console.warn('seatPose: 没找到腿骨', Object.keys(B)); return; }
    const sx = Math.sign(up.getWorldPosition(_a).x) || (s === 'L' ? 1 : -1);   // 这一侧在 +x 还是 -x
    aim(up, B['LowerLeg' + s], V(sx * 0.12, -0.12, -1));
    aim(B['LowerLeg' + s], B['LowerLeg' + s + '_end'], V(sx * 0.04, -1, -0.22));
    pin(B['Foot' + s], B['LowerLeg' + s + '_end']);
    const hand = B['Wrist' + s] || B['Palm' + s];
    if (drive) { aim(B['UpperArm' + s], B['LowerArm' + s], V(sx * 0.3, -0.6, -0.75)); aim(B['LowerArm' + s], hand, V(-sx * 0.4, 0.08, -1)); }
    else { aim(B['UpperArm' + s], B['LowerArm' + s], V(sx * 0.18, -1, -0.12)); aim(B['LowerArm' + s], hand, V(-sx * 0.2, -0.3, -1)); }
  }
}
// 让人物的胯部坐在 seatY 高度（座面）上
function seat(wrap, seatY, hip = 'Hips') {
  const B = boneMap(wrap);
  const h = B[hip] || B['UpperLegL'] || B['LeftUpLeg']; if (!h) return;
  const wp = wrap.position.clone(); wrap.position.set(0, 0, 0); wrap.updateMatrixWorld(true);
  const y = h.getWorldPosition(_a).y; wrap.position.set(wp.x, seatY + 0.1 - y, wp.z);
}

const Y = 0xf2c230, YD = 0xd39d12, DARK = 0x1e1e1e;

function wheelGeo(R, w) { const g = new THREE.CylinderGeometry(R, R, w, 18); g.rotateZ(Math.PI / 2); return g; }
function makeWheel(R, w, parent, x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  const tire = new THREE.Mesh(wheelGeo(R, w), lam(DARK, { roughness: 0.95 })); tire.castShadow = true; g.add(tire);
  for (let i = 0; i < 10; i++) { const t = box(w + 0.02, 0.09, 0.14, 0x111111, 0, 0, 0, g, false); t.rotation.x = i / 10 * Math.PI * 2; t.translateY(R - 0.02); }
  const hub = new THREE.Mesh(wheelGeo(R * 0.45, w + 0.03), lam(0xd6d6d6, { roughness: 0.4, metalness: 0.5 })); g.add(hub);
  return g;
}
// 锯片：尖锐的钩形锯齿（一边陡、一边斜，齿尖往外顶），比以前的方齿锋利
function gearGeometry(R, teeth) {
  const sh = new THREE.Shape(), step = Math.PI * 2 / teeth;
  for (let k = 0; k < teeth; k++) {
    const a = k * step, pts = [[a, R * 0.72], [a + step * 0.12, R * 0.74], [a + step * 0.86, R * 1.06], [a + step * 0.9, R * 0.95], [a + step, R * 0.72]];
    for (let i = 0; i < pts.length - 1; i++) { const [b, rr] = pts[i]; (k === 0 && i === 0) ? sh.moveTo(Math.cos(b) * rr, Math.sin(b) * rr) : sh.lineTo(Math.cos(b) * rr, Math.sin(b) * rr); }
  }
  sh.closePath();
  const hole = new THREE.Path(); hole.absarc(0, 0, R * 0.2, 0, Math.PI * 2, true); sh.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 1 });
  g.rotateX(-Math.PI / 2);
  return g;
}

export class Mower {
  constructor(scene) {
    this.g = new THREE.Group(); scene.add(this.g);
    const body = new THREE.Group(); this.g.add(body); this.body = body;
    this.carColor = { value: new THREE.Color(0xe53935) };
    const paint = lam(Y, { roughness: 0.45, metalness: 0.15 }); this.paint = paint;   // 底盘/后备箱/拖车也跟着每关的车色换
    // ---- 陆地形态：拖拉机 glTF 车头 ----
    this.land = new THREE.Group(); body.add(this.land);
    const tractor = GLB.make('gm4', { height: 1.9, rotY: Math.PI });
    if (tractor) {
      const L = tractor.userData.size.z || 3.4; const s = 3.4 / L; tractor.scale.setScalar(s);
      tractor.position.set(0, 0, -0.35); this.land.add(tractor); this.tractor = tractor;
      // 车身换色：贴图里红色的部分换成 uCar（每关一种颜色），黄轮毂、黑轮胎、灰铁件不动
      tractor.traverse((m) => {
        if (!m.isMesh) return;
        m.material = m.material.clone();
        m.material.onBeforeCompile = (sh) => {
          sh.uniforms.uCar = this.carColor;
          sh.fragmentShader = 'uniform vec3 uCar;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
            { vec3 c = diffuseColor.rgb; float w = smoothstep(0.06, 0.16, c.r) * (1.0 - smoothstep(0.25, 0.45, max(c.g, c.b) / max(c.r, 1e-4)));
              diffuseColor.rgb = mix(c, uCar * clamp(c.r / 0.75, 0.0, 1.35), w); }`);
        };
      });
    } else {
      box(1.5, 0.35, 2.7, paint, 0, 0.55, 0.1, this.land);
      box(1.2, 0.5, 1.0, lam(0xf6f6f6), 0, 0.95, -0.85, this.land);
      for (const [x, z, R] of [[-0.86, -0.78, 0.33], [0.86, -0.78, 0.33], [-0.86, 0.82, 0.4], [0.86, 0.82, 0.4]]) makeWheel(R, 0.3, this.land, x, R + 0.02, z);
    }
    // 两排座：司机坐车头驾驶位，第二排（最后一排）双人长凳架在加长底盘上
    box(1.7, 0.2, 2.4, paint, 0, 0.62, 2.1, this.land);
    this.landWheels = [];
    for (const x of [-0.95, 0.95]) this.landWheels.push(makeWheel(0.36, 0.28, this.land, x, 0.38, 2.6));
    const seatMat = lam(0xcfae7a, { roughness: 0.75 });   // 米色皮座，和深色衣服分得开
    this.bench = new THREE.Group(); this.bench.position.set(0, 0, 1.75); body.add(this.bench);
    box(1.6, 0.12, 0.6, seatMat, 0, 0.98, 0, this.bench); box(1.6, 0.55, 0.1, seatMat, 0, 1.3, 0.32, this.bench);
    for (const x of [-0.7, 0.7]) box(0.08, 0.36, 0.55, 0x8a9096, x, 0.8, 0, this.bench, false);
    box(0.06, 0.1, 0.6, 0x8a9096, 0, 1.0, 0, this.bench, false);
    // 后备箱（草斗/鱼/垃圾）
    const bed = new THREE.Group(); bed.position.set(0, 0.85, 3.2); body.add(bed);
    box(1.6, 0.1, 1.5, paint, 0, 0, 0, bed);
    box(1.6, 0.6, 0.1, paint, 0, 0.3, 0.7, bed); box(0.1, 0.6, 1.5, paint, -0.75, 0.3, 0, bed); box(0.1, 0.6, 1.5, paint, 0.75, 0.3, 0, bed); box(1.6, 0.45, 0.1, paint, 0, 0.22, -0.7, bed);
    for (const z of [-0.45, 0, 0.45]) { box(0.06, 0.62, 0.06, YD, -0.79, 0.3, z, bed, false); box(0.06, 0.62, 0.06, YD, 0.79, 0.3, z, bed, false); }
    // 后备箱后面的拖钩：拖车挂在这里，前后排开（以前挂点在后备箱里面，拖车和后备箱叠在一起）
    box(0.16, 0.1, 0.5, 0x333a40, 0, -0.25, 0.95, bed, false); cyl(0.08, 0.08, 0.12, 0x222222, 0, -0.2, 1.18, bed, 8);
    this.hitchZ = 3.2 + 1.2;
    // 司机「一介草民（爷爷）」坐驾驶位（农夫模型没有坐姿动画，掰骨头坐下）
    const drv = GLB.make('farmer1', { height: 1.6, rotY: Math.PI });
    if (drv) { seatPose(drv, true); drv.position.set(0, 0, 0.12); seat(drv, 1.42, 'UpperLegL'); body.add(drv); this.driver = drv; }
    // 第二排：「甜甜」（小女孩，SitIdle 坐姿动画）+「岁月静好（奶奶）」（女性模型没有合适的坐姿动画，掰骨头坐下）
    // 两人在同一条长凳上并排坐：甜甜在左、奶奶在右，屁股都坐在座面上（以前奶奶比甜甜矮了一截，像一上一下）
    const kid = GLB.make('girl1', { height: 1.2, rotY: Math.PI });
    if (kid) { this.kidMix = GLB.mixer(kid); this.kidMix.play('SitIdle', 0); this.kidMix.update(0); kid.position.set(-0.4, 0, 1.68); seat(kid, 1.04); body.add(kid); this.kid = kid; }
    const granny = GLB.make('woman1', { height: 1.65, rotY: Math.PI });
    if (granny) { seatPose(granny, false); granny.position.set(0.4, 0, 1.68); seat(granny, 1.04, 'UpperLegL'); body.add(granny); this.granny = granny; }
    this.seated = { driver: drv, passenger: kid, granny };
    // 名牌各跟各的头，高度和左右错开，避免三块牌叠在一起
    this.driverPlate = nameplate(CHARACTERS.driver.name, CHARACTERS.driver.avatar, 3.2); this.driverPlate.position.set(0, 3.1, 0.05); body.add(this.driverPlate);
    this.kidPlate = nameplate(CHARACTERS.passenger.name, CHARACTERS.passenger.avatar, 2.4); this.kidPlate.position.set(-1.0, 2.3, 1.72); body.add(this.kidPlate);
    this.grannyPlate = nameplate(CHARACTERS.granny.name, CHARACTERS.granny.avatar, 3.0); this.grannyPlate.position.set(1.1, 2.6, 1.72); body.add(this.grannyPlate);
    this.plates = { driver: this.driverPlate, passenger: this.kidPlate, granny: this.grannyPlate };
    this.exhaust = new THREE.Vector3(0.45, 2.0, -0.9);
    // 锯片横梁 + 锯片（只在陆地）
    this.bladeArm = box(1.2, 0.1, 0.12, lam(0xcfa21a, { metalness: 0.3, roughness: 0.5 }), 0, 0.5, -2.05, this.land);
    this.bladeMat = lam(0xe4eaee, { emissive: 0x111418, metalness: 0.9, roughness: 0.18 });
    this.hubMat = lam(0xe53935, { roughness: 0.4 });
    this.blades = [];
    // 车斗草块
    this.blockGeo = new THREE.BoxGeometry(0.34, 0.26, 0.34);
    this.stack = new THREE.InstancedMesh(this.blockGeo, lam(0xffffff, { roughness: 0.9 }), 400); this.stack.count = 0; this.stack.castShadow = true;
    this.stack.setColorAt(0, new THREE.Color(1, 1, 1));
    bed.add(this.stack); this.bed = bed;
    // 后备箱里的鱼与垃圾
    this.trunkFish = []; this.trunkJunk = [];
    for (let i = 0; i < 16; i++) {
      const f = fish(i); f.scale.setScalar(0.6); f.position.set(-0.5 + (i % 4) * 0.33, 0.2 + Math.floor(i / 8) * 0.22, -0.45 + (Math.floor(i / 4) % 2) * 0.5); f.rotation.y = Math.PI / 2 + (i % 2) * 0.3; f.rotation.z = (i % 3) * 0.4; f.visible = false; bed.add(f); this.trunkFish.push(f);
      const j = box(0.3 + (i % 3) * 0.08, 0.2, 0.25, lam(i % 2 ? 0x6b4a2b : 0x8a9096, { roughness: 0.9 }), -0.5 + (i % 4) * 0.33, 0.2 + Math.floor(i / 8) * 0.22, -0.45 + (Math.floor(i / 4) % 2) * 0.5, bed); j.rotation.y = i; j.visible = false; this.trunkJunk.push(j);
    }
    // 拖车
    this.trailer = new THREE.Group(); this.trailer.visible = false; scene.add(this.trailer);
    box(1.5, 0.1, 1.7, paint, 0, 0.55, 0, this.trailer);
    box(1.5, 0.5, 0.1, paint, 0, 0.82, 0.83, this.trailer); box(1.5, 0.5, 0.1, paint, 0, 0.82, -0.83, this.trailer);
    box(0.1, 0.5, 1.7, paint, -0.72, 0.82, 0, this.trailer); box(0.1, 0.5, 1.7, paint, 0.72, 0.82, 0, this.trailer);
    cyl(0.04, 0.04, 1.1, 0x555555, 0, 0.45, -1.3, this.trailer, 6).rotation.x = Math.PI / 2;
    this.wheels = [];
    for (const x of [-0.82, 0.82]) this.wheels.push(makeWheel(0.3, 0.24, this.trailer, x, 0.3, 0.1));
    this.tStack = new THREE.InstancedMesh(this.blockGeo, lam(0xffffff, { roughness: 0.9 }), 300); this.tStack.count = 0; this.tStack.castShadow = true;
    this.tStack.setColorAt(0, new THREE.Color(1, 1, 1));
    this.trailer.add(this.tStack);
    this.trailerPos = new THREE.Vector3();
    // ---- 水上形态：船（拖拉机一下水就变船，上岸变回拖拉机）----
    this.boat = new THREE.Group(); this.boat.visible = false; body.add(this.boat);
    const hullMat = lam(0x2c6fa8, { roughness: 0.45 });
    const ship = GLB.make('boat1', { scale: 8.2 / 929, rotY: Math.PI / 2, y: -0.55 });
    if (ship) { ship.position.set(0, 0, 1.0); this.boat.add(ship); this.ship = ship; }
    else {
      const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 6.2, 14), hullMat);
      hull.rotation.x = Math.PI / 2; hull.scale.set(1, 1, 0.38); hull.position.set(0, 0.3, 1.2); hull.castShadow = true; this.boat.add(hull);
      box(2.2, 0.12, 6.0, TEX.mat('planks', { repeat: 1.2, color: 0xd9b47a }), 0, 0.62, 1.2, this.boat);
    }
    this.propeller = cyl(0.22, 0.22, 0.04, lam(0xb0b6bb, { metalness: 0.6 }), 0, 0.2, 5.1, this.boat, 6); this.propeller.rotation.x = Math.PI / 2;
    // 船头捞鱼网：撞到鱼就进后备箱
    const net = new THREE.Group(); net.position.set(0, 0.05, -3.4); this.boat.add(net);
    for (const x of [-0.9, 0.9]) { const arm = cyl(0.05, 0.05, 1.6, 0x6b4426, x, 0.35, 0.7, net, 6); arm.rotation.x = Math.PI / 2 - 0.35; }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.05, 6, 20), lam(0x6b4426)); ring.rotation.x = Math.PI / 2; net.add(ring);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd9c9a3, wireframe: true, transparent: true, opacity: 0.9 })); net.add(mesh);
    this.netPoint = new THREE.Vector3(0, 0, -3.5);
    this.setWater(false);
  }
  setColor(hex) { this.carColor.value.setHex(hex); this.paint.color.setHex(hex); }
  // 谁坐在车上：下车的人从座位上消失，上车再出现
  setSeated(key, on) { const m = this.seated[key]; if (m) m.visible = on; const p = this.plates[key]; if (p) p.visible = on; }
  setWater(wet) {
    if (this._wet === wet) return; this._wet = wet;
    this.land.visible = !wet; this.boat.visible = wet;
    for (const b of this.blades) b.g.visible = !wet;
  }
  setTrunk(fish, junk) { this.trunkFish.forEach((m, i) => m.visible = i < fish); this.trunkJunk.forEach((m, i) => m.visible = i >= fish && i < fish + junk); }
  setBlades(n, R, gap) {
    const key = n + ':' + R.toFixed(3) + ':' + gap.toFixed(3);
    if (key === this.bladeKey) return;
    this.bladeKey = key;
    for (const b of this.blades) { this.land.remove(b.g); b.geo.dispose(); }
    this.blades = [];
    const geo = gearGeometry(R, 18);
    for (let k = 0; k < n; k++) {
      const g = new THREE.Group();
      g.position.set((k - (n - 1) / 2) * gap, 0.38, -2.2 - (k % 2) * 0.22);
      const disc = new THREE.Mesh(geo, this.bladeMat); disc.castShadow = true; g.add(disc);
      cyl(0.14, 0.14, 0.14, this.hubMat, 0, 0.1, 0, g, 8);
      this.land.add(g); this.blades.push({ g, geo });
    }
    this.bladeArm.scale.x = Math.max(1, (n - 1) * gap + 0.4) / 1.2;
  }
  bladeWorld(k, out) { return this.blades[k].g.getWorldPosition(out); }
  netWorld(out) { return this.body.localToWorld(out.copy(this.netPoint)); }
  setStack(blockTypes, perBed, colorOf) {
    const c = new THREE.Color(), m = new THREE.Matrix4();
    const put = (mesh, list, baseY) => {
      for (let i = 0; i < list.length; i++) {
        const layer = Math.floor(i / 16), s = i % 16, gx = s % 4, gz = (s / 4) | 0;
        m.makeTranslation((gx - 1.5) * 0.35, baseY + layer * 0.27, (gz - 1.5) * 0.35);
        mesh.setMatrixAt(i, m); mesh.setColorAt(i, c.setHex(colorOf(list[i])));
      }
      mesh.count = list.length; mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    };
    const a = blockTypes.slice(0, Math.min(perBed, 400)), b = blockTypes.slice(perBed, perBed + 300);
    put(this.stack, a, 0.18); put(this.tStack, b, 0.72);
    this.stackTop = 0.85 + 0.18 + Math.ceil(a.length / 16) * 0.27;
  }
}

// ---------- 植物 ----------
export function tree(r, kind = 0) {
  const g = new THREE.Group();
  const h = 2.2 + r() * 1.4;
  cyl(0.12, 0.2, h, lam(0x6b4a2b, { roughness: 0.95 }), 0, h / 2, 0, g, 8);
  if (kind === 0) {
    const cols = [0x3f9a3a, 0x4fb046, 0x5cc24f];
    for (let i = 0; i < 3; i++) {
      const R = 1.0 + r() * 0.6, geo = new THREE.IcosahedronGeometry(R, 1), pa = geo.attributes.position;
      for (let k = 0; k < pa.count; k++) { const s = 0.85 + r() * 0.3; pa.setXYZ(k, pa.getX(k) * s, pa.getY(k) * s, pa.getZ(k) * s); }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, lam(cols[i], { flatShading: true, roughness: 0.9 })); m.position.set((r() - 0.5) * 0.9, h + i * 0.45 - 0.3, (r() - 0.5) * 0.9); m.castShadow = true; g.add(m);
    }
  } else {
    for (let i = 0; i < 3; i++) { const R = 1.3 - i * 0.32; cyl(0.02, R, 1.3, lam(i % 2 ? 0x2f7d3a : 0x3a9648, { flatShading: true }), 0, h * 0.55 + i * 0.85, 0, g, 8); }
  }
  g.rotation.y = r() * 6; g.scale.setScalar(0.85 + r() * 0.4);
  return g;
}
export function bush(r) {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) sphere(0.35 + r() * 0.3, lam(0x4aa843, { flatShading: true }), (r() - 0.5) * 0.9, 0.3 + r() * 0.2, (r() - 0.5) * 0.9, g, 7);
  if (r() < 0.5) for (let i = 0; i < 5; i++) sphere(0.06, lam(0xe53935), (r() - 0.5) * 1.1, 0.5 + r() * 0.3, (r() - 0.5) * 1.1, g, 5);
  return g;
}
export function hayBale(r) {
  const g = new THREE.Group();
  const m = cyl(0.55, 0.55, 0.9, TEX.mat('dirt', { repeat: 2, color: 0xf2d27a, roughness: 0.9 }), 0, 0.55, 0, g, 16); m.rotation.z = Math.PI / 2;
  for (const x of [-0.25, 0.25]) { const s = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.02, 6, 20), lam(0x8a5a2a)); s.rotation.y = Math.PI / 2; s.position.set(x, 0.55, 0); g.add(s); }
  g.rotation.y = r() * 6;
  return g;
}
// 方草捆（草料机产出、人扛的）
export function squareBale() {
  const g = new THREE.Group();
  box(0.7, 0.45, 0.5, TEX.mat('dirt', { repeat: 2, color: 0xe8e08a, roughness: 0.9 }), 0, 0.225, 0, g);
  for (const x of [-0.2, 0.2]) box(0.04, 0.47, 0.52, 0x8a5a2a, x, 0.225, 0, g, false);
  return g;
}
export function scarecrow() {
  const g = new THREE.Group();
  cyl(0.05, 0.06, 2.0, 0x7a5230, 0, 1.0, 0, g, 6); box(1.4, 0.08, 0.08, 0x7a5230, 0, 1.5, 0, g);
  box(0.5, 0.7, 0.3, lam(0x3b5aa6), 0, 1.35, 0, g); for (const s of [-1, 1]) box(0.5, 0.16, 0.16, lam(0xb03030), s * 0.5, 1.5, 0, g);
  sphere(0.2, lam(0xf1c27d), 0, 1.95, 0, g, 10); cyl(0.32, 0.32, 0.05, 0xd9b45c, 0, 2.12, 0, g, 12); cyl(0.16, 0.16, 0.18, 0xd9b45c, 0, 2.22, 0, g, 12);
  return g;
}

// ---------- 动物：glTF 带动画 ----------
export function animal(kind) {
  const key = kind === 'coop' ? 'chicken1' : 'cow1';
  const a = GLB.make(key, { height: kind === 'coop' ? 0.6 : 1.5, rotY: Math.PI });
  if (!a) return null;
  a.userData.mix = GLB.mixer(a);
  a.userData.mix.play('Idle');
  return a;
}
export function duck() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), lam(0xfff1a8)); body.scale.set(1, 0.7, 1.4); body.position.y = 0.12; g.add(body);
  sphere(0.13, lam(0xfff1a8), 0, 0.36, -0.22, g, 10); box(0.12, 0.05, 0.14, lam(0xff8f00), 0, 0.33, -0.38, g, false);
  for (const s of [-1, 1]) box(0.03, 0.03, 0.03, 0x222222, s * 0.07, 0.4, -0.3, g, false);
  return g;
}

// ---------- 鱼与船 ----------
export function fish(kind) {
  const g = new THREE.Group();
  const pal = [[0xffffff, 0xff6a1a], [0xff8c1a, 0xffffff], [0xf2f2f2, 0x222222]][kind % 3];
  const tex = canvasTex(128, 64, (c, w, h) => {
    c.fillStyle = '#' + pal[0].toString(16).padStart(6, '0'); c.fillRect(0, 0, w, h);
    c.fillStyle = '#' + pal[1].toString(16).padStart(6, '0'); const r = rng(kind * 31 + 7);
    for (let i = 0; i < 5; i++) { c.beginPath(); c.ellipse(r() * w, r() * h, 12 + r() * 18, 8 + r() * 10, r() * 3, 0, 7); c.fill(); }
  });
  const skin = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.15 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), skin); body.scale.set(0.9, 0.7, 2.2); g.add(body);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 3), skin); tail.scale.set(1, 1, 0.35); tail.rotation.x = -Math.PI / 2; tail.position.z = 0.62; g.add(tail); g.userData.tail = tail;
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 3), skin); fin.scale.set(0.3, 1, 1); fin.position.set(0, 0.2, -0.05); fin.rotation.x = 0.5; g.add(fin);
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 3), skin); p.scale.set(0.3, 1, 1); p.position.set(s * 0.2, -0.05, -0.15); p.rotation.z = s * 1.3; g.add(p); box(0.04, 0.04, 0.03, 0x111111, s * 0.13, 0.05, -0.4, g, false); }
  return g;
}
export function rowboat() {
  const g = new THREE.Group();
  const wood = TEX.mat('planks', { repeat: 1.2, color: 0xc8956a });
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.55, 3.2, 10, 1, false, 0, Math.PI), wood);
  hull.rotation.z = Math.PI / 2; hull.rotation.y = Math.PI / 2; hull.position.y = 0.55; hull.castShadow = true; g.add(hull);
  box(3.3, 0.08, 1.9, wood, 0, 0.6, 0, g);
  for (const z of [-0.8, 0.2, 1.0]) box(0.12, 0.35, 1.7, 0x8a5a2a, z, 0.78, 0, g);
  for (const s of [-1, 1]) { const oar = cyl(0.03, 0.03, 2.4, 0x8a5a2a, 0.2, 0.9, s * 0.9, g, 6); oar.rotation.x = s * 0.9; oar.rotation.z = 0.3; }
  return g;
}
export function hayBarge() {
  const g = new THREE.Group();
  const wood = TEX.mat('planks', { repeat: 1, color: 0x9c6f45 });
  box(6, 0.9, 2.6, wood, 0, 0.45, 0, g); box(6.3, 0.15, 2.9, 0x5a3a20, 0, 0.95, 0, g);
  const bow = box(1.2, 0.9, 2.2, wood, 3.3, 0.45, 0, g); bow.rotation.y = 0.4;
  box(1.4, 1.2, 1.6, lam(0x4f7a8a), -2.2, 1.6, 0, g); box(1.6, 0.1, 1.8, 0x333a40, -2.2, 2.25, 0, g); cyl(0.08, 0.08, 0.7, 0x333333, -2.5, 2.6, 0.4, g, 8);
  const r = rng(3);
  for (let i = 0; i < 12; i++) { const b = box(0.6, 0.5, 0.6, lam(0x8fe35a), -1.2 + (i % 4) * 0.75, 1.25 + Math.floor(i / 4) * 0.52, (i % 2 ? 0.45 : -0.45), g); b.rotation.y = (r() - 0.5) * 0.3; }
  return g;
}
export function sailboat() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.35, 3.4, 10, 1, false, 0, Math.PI), lam(0x2c5f8a, { roughness: 0.5 }));
  hull.rotation.z = Math.PI / 2; hull.rotation.y = Math.PI / 2; hull.position.y = 0.5; hull.castShadow = true; g.add(hull);
  box(3.4, 0.08, 1.4, lam(0xd9b47a), 0, 0.55, 0, g);
  cyl(0.05, 0.06, 3.6, 0x8a5a2a, 0.3, 2.3, 0, g, 8);
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 3.0), lam(0xfaf6ea, { side: THREE.DoubleSide })); sail.geometry.translate(-1, 0, 0); sail.position.set(0.35, 2.4, 0); sail.rotation.y = -0.3; g.add(sail);
  const jib = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.4), lam(0xe8534a, { side: THREE.DoubleSide })); jib.position.set(1.4, 2.0, 0); jib.rotation.y = 0.5; g.add(jib);
  return g;
}
export function lilyPad(r) {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.CircleGeometry(0.35 + r() * 0.2, 14, 0.3, Math.PI * 1.85), lam(0x3f9a4a, { side: THREE.DoubleSide })); pad.rotation.x = -Math.PI / 2; g.add(pad);
  if (r() < 0.5) { for (let i = 0; i < 6; i++) { const p = box(0.16, 0.02, 0.06, lam(0xffb3c7), 0, 0.08, 0, g, false); p.rotation.y = i; p.rotation.z = 0.5; p.translateX(0.08); } sphere(0.05, lam(0xffd400), 0, 0.12, 0, g, 6); }
  return g;
}
// 行人/顾客：农夫模型换个颜色调（材质克隆后调色）
export function person(tintHex = 0xffffff) {
  const p = GLB.make('farmer1', { height: 1.75, rotY: Math.PI });
  if (!p) return null;
  if (tintHex !== 0xffffff) p.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.userData.tinted = true; m.material.color.multiply(new THREE.Color(tintHex)); } });
  p.userData.mix = GLB.mixer(p);
  return p;
}
