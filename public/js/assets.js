// 公共小工具：随机数、材质、贴图（ambientCG CC0）、glTF 模型（poly.pizza CC0/CC-BY，见 CREDITS.md）、文字面片
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
export const lam = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0, ...o });
export function box(w, h, d, c, x, y, z, parent, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'number' ? lam(c) : c);
  m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
export function cyl(rt, rb, h, c, x, y, z, parent, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof c === 'number' ? lam(c) : c);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
export function sphere(r, c, x, y, z, parent, seg = 12) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 4)), typeof c === 'number' ? lam(c) : c);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

// ---------- 贴图 ----------
const loader = new THREE.TextureLoader();
export const TEX = {
  cache: {}, mats: {},
  load(name, kind, srgb) {
    const key = name + kind;
    if (this.cache[key]) return this.cache[key];
    const t = loader.load(`textures/${name}_${kind}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    this.cache[key] = t;
    return t;
  },
  // 同参数的材质复用（避免每关克隆贴图泄漏）；repeat 单位：每米重复次数
  mat(name, { repeat = 1, color = 0xffffff, roughness = 1, normalScale = 1, ...rest } = {}) {
    const key = JSON.stringify([name, repeat, color, roughness, normalScale, rest]);
    if (this.mats[key]) return this.mats[key];
    const mk = (kind, srgb) => { const t = this.load(name, kind, srgb).clone(); t.repeat.set(repeat, repeat); t.needsUpdate = true; return t; };
    const m = new THREE.MeshStandardMaterial({
      map: mk('color', true), normalMap: mk('normal', false), roughnessMap: mk('rough', false),
      color, roughness, metalness: 0, normalScale: new THREE.Vector2(normalScale, normalScale), ...rest,
    });
    m.userData.shared = true;
    this.mats[key] = m;
    return m;
  },
};

// ---------- glTF 模型 ----------
const _box = new THREE.Box3(), _v = new THREE.Vector3();
// 蒙皮模型的包围盒：先把骨骼矩阵算出来，再按顶点精确算（否则拿到的是 bind 空间的错误尺寸）
function bounds(obj) {
  obj.updateMatrixWorld(true);
  let skinned = false;
  obj.traverse((m) => { if (m.isSkinnedMesh) { skinned = true; m.skeleton.update(); } });
  return _box.setFromObject(obj, skinned);
}
export const GLB = {
  raw: {},
  async preload(map, onProgress) {
    const gl = new GLTFLoader(); const keys = Object.keys(map); let done = 0;
    await Promise.all(keys.map((k) => new Promise((res) => {
      gl.load(map[k], (g) => { this.raw[k] = g; done++; onProgress && onProgress(done / keys.length, k); res(); },
        undefined, (e) => { console.warn('模型加载失败', k, e); done++; onProgress && onProgress(done / keys.length, k); res(); });
    })));
  },
  has(k) { return !!this.raw[k]; },
  // 造一个实例：按 height（米）或 scale 缩放；rotY 转朝向；脚踩地、水平居中；返回 Group（userData.anims/size）
  make(k, { height, scale, rotY = 0, shadow = true, y = 0 } = {}) {
    const g = this.raw[k]; if (!g) return null;
    const inner = skeletonClone(g.scene);
    bounds(inner); const size = _box.getSize(new THREE.Vector3());
    const s = height ? height / (size.y || 1) : (scale || 1);
    inner.scale.setScalar(s); inner.rotation.y = rotY;
    const wrap = new THREE.Group(); wrap.add(inner);
    bounds(wrap); const c = _box.getCenter(_v);
    inner.position.set(-c.x, -_box.min.y + y, -c.z);
    inner.traverse((m) => { if (m.isMesh) { m.castShadow = shadow; m.receiveShadow = true; if (m.isSkinnedMesh) m.frustumCulled = false; } });
    wrap.userData.anims = g.animations; wrap.userData.size = size.multiplyScalar(s); wrap.userData.key = k;
    return wrap;
  },
  // 动画控制：clips 按名字（去掉 "Armature|" 前缀）
  mixer(wrap) {
    const mx = new THREE.AnimationMixer(wrap), clips = {};
    for (const a of wrap.userData.anims || []) { const n = a.name.split('|').pop(); if (!clips[n]) clips[n] = mx.clipAction(a); }
    let cur = null;
    return {
      mx, clips,
      play(n, fade = 0.25, speed = 1) {
        const a = clips[n]; if (!a || a === cur) return;
        a.reset().setEffectiveTimeScale(speed).setEffectiveWeight(1).fadeIn(fade).play();
        if (cur) cur.fadeOut(fade);
        cur = a;
      },
      update(dt) { mx.update(dt); },
    };
  },
  // 烘焙成单个几何体供 InstancedMesh：position/normal/color（材质色 × 调色板贴图采样 × 顶点色）/bend（高度 0..1）
  bake(k, { height = 1, yOffset = 0 } = {}) {
    const g = this.raw[k]; if (!g) return null;
    const src = g.scene; src.updateMatrixWorld(true);
    const pos = [], nrm = [], col = [];
    const n3 = new THREE.Matrix3(), p = new THREE.Vector3(), nn = new THREE.Vector3(), c = new THREE.Color();
    src.traverse((m) => {
      if (!m.isMesh) return;
      const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
      const pa = geo.attributes.position, na = geo.attributes.normal, ca = geo.attributes.color, ua = geo.attributes.uv;
      const mat = Array.isArray(m.material) ? m.material[0] : m.material;
      const base = new THREE.Color(mat.color || 0xffffff);
      const img = mat.map ? texSampler(mat.map) : null;
      n3.getNormalMatrix(m.matrixWorld);
      for (let i = 0; i < pa.count; i++) {
        p.fromBufferAttribute(pa, i).applyMatrix4(m.matrixWorld); pos.push(p.x, p.y, p.z);
        if (na) nn.fromBufferAttribute(na, i).applyMatrix3(n3).normalize(); else nn.set(0, 1, 0);
        nrm.push(nn.x, nn.y, nn.z);
        c.copy(base);
        if (ca) c.multiply(new THREE.Color(ca.getX(i), ca.getY(i), ca.getZ(i)));
        if (img && ua) { const t = img(ua.getX(i), ua.getY(i)); c.r *= t[0]; c.g *= t[1]; c.b *= t[2]; }
        col.push(c.r, c.g, c.b);
      }
    });
    let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < pos.length; i += 3) { minY = Math.min(minY, pos[i + 1]); maxY = Math.max(maxY, pos[i + 1]); minX = Math.min(minX, pos[i]); maxX = Math.max(maxX, pos[i]); minZ = Math.min(minZ, pos[i + 2]); maxZ = Math.max(maxZ, pos[i + 2]); }
    const s = height / ((maxY - minY) || 1), cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const bend = new Float32Array(pos.length / 3);
    for (let i = 0; i < pos.length; i += 3) {
      pos[i] = (pos[i] - cx) * s; pos[i + 2] = (pos[i + 2] - cz) * s;
      bend[i / 3] = (pos[i + 1] - minY) / ((maxY - minY) || 1);
      pos[i + 1] = (pos[i + 1] - minY) * s + yOffset;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('bend', new THREE.BufferAttribute(bend, 1));
    return geo;
  },
};
// 调色板贴图 CPU 采样（glTF 的 flipY=false：v 从图片顶部算）
const samplers = new Map();
function texSampler(tex) {
  if (samplers.has(tex.uuid)) return samplers.get(tex.uuid);
  let fn = null;
  try {
    const im = tex.image, w = im.width, h = im.height;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, w, h).data;
    const srgb = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    fn = (u, v) => {
      u = u - Math.floor(u); v = v - Math.floor(v);
      const x = Math.min(w - 1, Math.floor(u * w)), y = Math.min(h - 1, Math.floor((tex.flipY ? 1 - v : v) * h));
      const i = (y * w + x) * 4; return [srgb(d[i]), srgb(d[i + 1]), srgb(d[i + 2])];
    };
  } catch (e) { console.warn('贴图采样失败', e); }
  samplers.set(tex.uuid, fn);
  return fn;
}

export function textPlane(text, size = 1, opts = {}) {
  const px = 96, cv = document.createElement('canvas'), g = cv.getContext('2d');
  const font = `900 ${px}px "ZCOOL KuaiLe","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif`;
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
  return m;
}
export function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// 网游式头顶名牌：圆形头像 + 名字，一直显示
const avatarCache = {};
export function nameplate(name, avatarUrl, scale = 3.4) {
  const cv = document.createElement('canvas'); cv.width = 768; cv.height = 160;
  const g = cv.getContext('2d');
  const draw = (img) => {
    g.clearRect(0, 0, 768, 160);
    g.font = '900 54px "ZCOOL KuaiLe","PingFang SC","Microsoft YaHei",sans-serif';
    const tw = g.measureText(name).width, boxW = tw + 40 + 120, x0 = (768 - boxW) / 2;
    g.fillStyle = 'rgba(20,40,55,0.72)'; g.beginPath(); g.roundRect(x0, 20, boxW, 120, 60); g.fill();
    g.save(); g.beginPath(); g.arc(x0 + 68, 80, 52, 0, Math.PI * 2); g.closePath(); g.clip();
    if (img) g.drawImage(img, x0 + 16, 28, 104, 104); else { g.fillStyle = '#e8a15a'; g.fillRect(x0 + 16, 28, 104, 104); }
    g.restore();
    g.lineWidth = 6; g.strokeStyle = '#ffd23a'; g.beginPath(); g.arc(x0 + 68, 80, 52, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineWidth = 8; g.strokeStyle = '#1b1b1b'; g.lineJoin = 'round';
    g.strokeText(name, x0 + 136, 82); g.fillText(name, x0 + 136, 82);
    tex.needsUpdate = true;
  };
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(scale, scale * 160 / 768, 1); sp.renderOrder = 10;
  draw(null);
  const cached = avatarCache[avatarUrl];
  if (cached) draw(cached);
  else { const img = new Image(); img.onload = () => { avatarCache[avatarUrl] = img; draw(img); }; img.src = avatarUrl; }
  return sp;
}
// 头顶信息牌（Sprite）
export function infoSprite(scaleX = 4) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
  sp.scale.set(scaleX, scaleX / 4, 1); sp.visible = false; sp.userData.key = '';
  sp.userData.set = (text) => {
    if (sp.userData.key === text) return; sp.userData.key = text;
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
    const g = cv.getContext('2d');
    g.fillStyle = 'rgba(20,40,55,0.78)'; g.beginPath(); g.roundRect(4, 14, 504, 100, 50); g.fill();
    g.font = '900 52px "ZCOOL KuaiLe","PingFang SC","Microsoft YaHei",sans-serif'; g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 256, 66);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    if (sp.material.map) sp.material.map.dispose();
    sp.material.map = t; sp.material.needsUpdate = true; sp.visible = !!text;
  };
  return sp;
}
