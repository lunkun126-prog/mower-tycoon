// 割草大亨 v3 —— 全部数值集中在这里
// 实测自 233 原版：开局容量 360、360 块青草卖 99 金币、锯片 350→875、旋转速度 435→780、锯齿 870、容量/车轮 400、40 关每关 3 星。其余自拟。

// 沙盒：金币/钻石无限、40 关全开、商店/农场/拖车一开始就解锁（2026-09-30 用户要求）
export const SANDBOX = true;

export const CELL = 0.5;            // 草格边长（米）
export const UNITS_PER_CELL = 0.4;  // 每格产出量
export const BLADES_PER_CELL = 9;   // 每格叶片数
export const FIELD_MARGIN = 3.0;    // 草场四周风景带（米）
export const FIELD_Y = 1.6;         // 草场高台高度
export const WATER_Y = -0.55;       // 水面
export const RAMP = { x0: -2.8, x1: 2.8, z0: -3, z1: 0 };      // 坡道
export const ISLAND = { x0: -16, x1: 16, z0: 0, z1: 40 };     // 基地 + 农场
export const FARM_Z = 19;                                     // z 大于这个算农场（人下车步行）
export const GATE = { x0: -2.6, x1: 2.6 };                    // 农场大门（石墙缺口）
export const SLIP = { x0: -16, x1: -13, z0: 9.5, z1: 14 };    // 滑水道：从基地左边开进水里（x 越小越深）
export const SEA_R = 70;                                      // 水里能开多远
// 小火车（第 11 关起出现）：铁轨铺在草场边上（左边→上边→右边一圈 U 形），火车跟着割草机走，草直接飞进车厢；
// 装满了自己开到右下角的「市场」卖掉再开回来，不用开回基地。gz0/gz1 是基地右边栏杆分段用的（旧站台已拆）
export const STATION = { gz0: 1.2, gz1: 9.2, fromLevel: 11 };
export const TRAIN = { cap: 900, speed: 10, follow: 7, bonus: 1.25, leaveAfter: 3, wagons: 3, maxWagons: 7, off: 1.5 };   // 车厢总容量、跑车速度、跟车速度、卖价加成、车离开草场几秒后发车、车厢节数、铁轨离草边多远

// 作物：model = 'blade'（叶片）| 'bush'（花生丛）| 'sunflower' | glb 键；hp 硬度；value 每单位售价；block 车斗方块色
export const CROPS = [
  { key: 'grass',     name: '青草',   model: 'blade', hp: 1,   value: 0.275, h: 0.95, tip: 0x8fe35a, base: 0x2e7a1c, cutA: 0x86e052, cutB: 0x5bb52c, under: 0x2c7d18, block: 0x3fae2a },
  { key: 'wheat',     name: '麦子',   model: 'wheat1', hp: 1,  value: 0.6,   h: 1.25, cutA: 0xf7e09a, cutB: 0xdfb955, under: 0xa9780b, block: 0xe8b21e },
  { key: 'corn',      name: '玉米',   model: 'corn1',  hp: 1.5, value: 1.0,  h: 1.9,  cutA: 0xc9e08a, cutB: 0xa8c66a, under: 0x6b7a3a, block: 0xf2c94c },
  { key: 'peanut',    name: '花生',   model: 'bush',   hp: 1,   value: 0.9,  h: 0.55, tip: 0x63b83a, base: 0x2f7a1c, cutA: 0xd9c27a, cutB: 0xc4ac62, under: 0x8a6a3a, block: 0xd9a066 },
  { key: 'carrot',    name: '胡萝卜', model: 'carrot1', hp: 1,  value: 0.8,  h: 0.75, yOffset: -0.4, cutA: 0xd2b27a, cutB: 0xbf9c62, under: 0x7a5a3a, block: 0xff7a1a },
  { key: 'pumpkin',   name: '南瓜',   model: 'pumpkin1', hp: 2, value: 1.5, h: 0.6,  cutA: 0xcfe08a, cutB: 0xb2c66a, under: 0x6b7a3a, block: 0xff8c1a },
  { key: 'sunflower', name: '向日葵', model: 'sunflower', hp: 1.5, value: 1.2, h: 1.7, cutA: 0xd7e28a, cutB: 0xbccb6a, under: 0x6f7a3a, block: 0xffc21a },
  { key: 'lavender',  name: '薰衣草', model: 'blade', hp: 1.2, value: 2.2,   h: 1.0,  tip: 0xc9a3ff, base: 0x4a8a3a, cutA: 0xc9b3ea, cutB: 0x9f82cc, under: 0x4d2c86, block: 0x8e5fe0 },
  { key: 'reed',      name: '芦苇',   model: 'blade', hp: 2,   value: 1.6,   h: 1.5,  tip: 0xe9d9a0, base: 0x2f8f6a, cutA: 0xa3dcbb, cutB: 0x74b98f, under: 0x236b4f, block: 0x3fa47c },
  { key: 'frost',     name: '霜草',   model: 'blade', hp: 2.5, value: 4.0,   h: 1.05, tip: 0xf2fbff, base: 0x4f8fb0, cutA: 0xe8f5ff, cutB: 0xc2dbef, under: 0x5f8fb0, block: 0xbfe6ff },
];
export const GRASS = CROPS;   // 兼容旧名
export const CROP_INDEX = Object.fromEntries(CROPS.map((c, i) => [c.key, i]));

// 关卡：1..40，草场随关变大
export const LEVEL_COUNT = 40;
export function levelDef(n) {
  const w = Math.min(40 + Math.floor((n - 1) * 1.2) * 2, 72);
  const d = Math.min(44 + Math.floor((n - 1) * 1.2) * 2, 80);
  const I = CROP_INDEX, pool =
    n <= 2 ? [I.grass, I.wheat] :
    n <= 5 ? [I.grass, I.wheat, I.corn] :
    n <= 8 ? [I.wheat, I.corn, I.peanut, I.carrot] :
    n <= 12 ? [I.corn, I.peanut, I.carrot, I.pumpkin, I.sunflower] :
    n <= 20 ? [I.carrot, I.pumpkin, I.sunflower, I.lavender, I.reed] :
    [I.pumpkin, I.sunflower, I.lavender, I.reed, I.frost];
  // 每关从池里取 2~3 种，顺序跟关号走
  const k = Math.min(pool.length, 2 + (n % 2)), tiers = [];
  for (let i = 0; i < k; i++) tiers.push(pool[(n + i) % pool.length]);
  return { n, w, d, tiers, seed: 1000 + n * 7919, hard: hardness(n), drag: dragOf(n) };
}
// 难度：作物硬度倍数。1~10 关稍微硬一点；11 关起非常硬（锯子要磨好几下才断，但一定割得动）
export function hardness(n) { return n <= 10 ? 1.8 + 0.15 * (n - 1) : 6 + 0.3 * (n - 11); }
// 草里开车的阻力（速度乘数）：11 关起草又密又硬，开不快
export function dragOf(n) { return n <= 10 ? 0.97 - 0.025 * n : Math.max(0.35, 0.48 - 0.005 * (n - 11)); }
// 升级锯片对硬草的效果递减（否则沙盒里一升满级又变成一碰就断）
export const cutPower = (strength) => 3 * Math.sqrt(strength / 3);

export const STARS = [
  { at: 0.60, icon: 'flag', reward: (n) => ({ coins: 60 * n }) },
  { at: 0.80, icon: 'coin', reward: (n) => ({ coins: 150 * n }) },
  { at: 0.95, icon: 'gem',  reward: (n) => ({ gems: 5 + Math.floor(n / 2) }) },
];
export const FIELD_BONUS = { gems: 6, goldPatches: 3, goldRadius: 1.8, goldCoinPerCell: 3 };

function cost(base, g, L) { return Math.round(base * Math.pow(g, Math.min(L, 3)) * Math.pow(1.4, Math.max(0, L - 3)) / 5) * 5; }
export const UPGRADES = {
  saw: {
    title: '升级锯片',
    items: [
      { id: 'blades', name: '锯片数量', icon: 'blades', max: 4,  price: (L) => cost(350, 2.5, L),  show: (L) => 1 + L },
      { id: 'teeth',  name: '锯齿数量', icon: 'teeth',  max: 20, price: (L) => cost(870, 1.55, L), show: (L) => 150 + 30 * L },
      { id: 'spin',   name: '旋转速度', icon: 'spin',   max: 20, price: (L) => cost(435, 1.79, L), show: (L) => 160 + 23 * L },
      { id: 'width',  name: '锯片尺寸', icon: 'width',  max: 6,  price: (L) => cost(600, 1.8, L),  show: (L) => `${(0.75 + 0.06 * L).toFixed(2)}m` },
    ],
  },
  truck: {
    title: '升级卡车',
    items: [
      { id: 'cap',    name: '车辆容量', icon: 'cap',    max: 20, price: (L) => cost(400, 1.6, L), show: (L) => 360 + 90 * L },
      { id: 'wheels', name: '加装车轮', icon: 'wheel',  max: 20, price: (L) => cost(400, 1.6, L), show: (L) => 850 + 60 * L },
      { id: 'turn',   name: '转向灵敏', icon: 'turn',   max: 10, price: (L) => cost(300, 1.5, L), show: (L) => 100 + 12 * L },
      { id: 'magnet', name: '吸草范围', icon: 'magnet', max: 8,  price: (L) => cost(500, 1.6, L), show: (L) => `${(1.3 + 0.5 * L).toFixed(1)}m` },
    ],
  },
  trailer: {
    title: '升级拖车', needLevel: 3,
    items: [
      { id: 'trailer', name: '拖车容量', icon: 'trailer', max: 15, price: (L) => cost(1500, 1.6, L), show: (L) => (L ? 200 + 80 * (L - 1) : 0) },
    ],
  },
  train: {
    title: '升级小火车', needLevel: 11,
    items: [
      { id: 'tcap',   name: '车厢容量', icon: 'tcap',   max: 20, price: (L) => cost(1200, 1.6, L), show: (L) => trainStats({ tcap: L }).cap },
      { id: 'tspeed', name: '火车速度', icon: 'tspeed', max: 10, price: (L) => cost(900, 1.6, L),  show: (L) => `${trainStats({ tspeed: L }).speed.toFixed(0)}m/s` },
      { id: 'tbonus', name: '卖价加成', icon: 'tbonus', max: 10, price: (L) => cost(1500, 1.6, L), show: (L) => `+${Math.round((trainStats({ tbonus: L }).bonus - 1) * 100)}%` },
    ],
  },
  farm: {
    title: '升级农场', needLevel: 5,
    items: [
      { id: 'carry',   name: '扛草捆数', icon: 'carry',   max: 10, price: (L) => cost(500, 1.6, L),  show: (L) => 3 + L },
      { id: 'baler',   name: '草料机效率', icon: 'baler', max: 10, price: (L) => cost(800, 1.6, L),  show: (L) => `${40 - 3 * L}草/捆` },
      { id: 'animals', name: '动物产量', icon: 'animals', max: 10, price: (L) => cost(1000, 1.6, L), show: (L) => `${100 + 15 * L}%` },
      { id: 'shelf',   name: '货架容量', icon: 'shelf',   max: 8,  price: (L) => cost(700, 1.6, L),  show: (L) => 12 + 6 * L },
      { id: 'guests',  name: '顾客人流', icon: 'guests',  max: 8,  price: (L) => cost(900, 1.6, L),  show: (L) => `${100 + 20 * L}%` },
    ],
  },
};

export const SHOP = [
  { id: 'magnet', name: '磁铁',       desc: '掉在地上的草块自动吸过来', gems: 15 },
  { id: 'wide',   name: '加宽割草机', desc: '锯片更大、割得更宽',       gems: 25 },
  { id: 'sell',   name: '售价 +20%',  desc: '所有草和农产品卖价 +20%', gems: 30 },
  { id: 'truck',  name: '新卡车',     desc: '卡车容量 ×1.5',           gems: 40 },
  { id: 'double', name: '奖励翻倍',   desc: '星星奖励翻倍',             gems: 20 },
  { id: 'boost',  name: '助推器',     desc: '5 分钟内车速和切割 ×1.5（可重复买）', coins: 800, consumable: true },
];
export const BOOST_MS = 5 * 60 * 1000;
export const UNLOCK = SANDBOX ? { trailer: 1, shop: 1, farm: 1 } : { trailer: 3, shop: 5, farm: 5 };

// 农场
export const FARM = {
  coop: { name: '鸡舍', build: 1500, good: 'egg',  every: 6, maxFeed: 12, maxGoods: 30, animals: 4 },
  barn: { name: '牛舍', build: 5000, good: 'milk', every: 9, maxFeed: 12, maxGoods: 20, animals: 2 },
};
export const GOODS = { egg: { name: '鸡蛋', price: 12, color: 0xfff4d6, energy: 15 }, milk: { name: '牛奶', price: 35, color: 0xf8f8f8, energy: 25 }, fish: { name: '烤鱼', price: 20, color: 0xd9a066, energy: 40 } };
// 一家三口：一介草民是男的，甜甜（小女孩）和岁月静好（奶奶）是女的。model/anim = 下车走路用的模型与动画名
export const CHARACTERS = {
  driver:    { name: '一介草民（爷爷）', short: '一介草民', avatar: 'avatars/caomin.png', model: 'farmer1', h: 1.75, anim: { idle: 'Idle', walk: 'Walk', run: 'Run' } },
  passenger: { name: '甜甜', short: '甜甜', avatar: 'avatars/tiantian.png', model: 'girl1', h: 1.2, anim: { idle: 'Idle', walk: 'Walking', run: 'Running' } },
  granny:    { name: '岁月静好（奶奶）', short: '岁月静好', avatar: 'avatars/nainai.png', model: 'woman1', h: 1.65, anim: { idle: 'Female_Idle', walk: 'Female_Walk', run: 'Female_Run' } },
};
// 每过一关换一种好看的车色（车身原本的红色部分换成这个颜色）
export const CAR_COLORS = [0xe53935, 0x2e9e4f, 0x1e88e5, 0xff8f00, 0x8e44ad, 0x00a6a6, 0xf4c20d, 0xe8559a, 0x3949ab, 0x7cb342, 0x29b6f6, 0x455a64];
export const carColor = (n) => CAR_COLORS[(n - 1) % CAR_COLORS.length];
export const TRUNK = { max: 16, junkRecycle: 1 };   // 后备箱最多装几样（鱼+垃圾）；垃圾扔桶里回收给几个金币
// 水里的鱼（glTF）：price 0 的只看不捞（海豚/鲸）；rotY 把模型转成朝 -z；zone near=岛两侧、far=外海；depth=水面下多深
export const FISH = [
  { key: 'goldfish', name: '金鱼',   model: 'goldfish', price: 8,  len: 0.9,  rotY: 0,       n: 16, zone: 'near', speed: 0.35, depth: 0.12, glow: 0xff6a20 },
  { key: 'koi',      name: '锦鲤',   model: 'koi',      price: 15, len: 1.3,  rotY: Math.PI, n: 12, zone: 'near', speed: 0.3,  depth: 0.15, anim: 'Swimming_Normal', glow: 0xff7a3d },
  { key: 'clown',    name: '小丑鱼', model: 'clown',    price: 10, len: 0.8,  rotY: Math.PI, n: 14, zone: 'near', speed: 0.4,  depth: 0.12, anim: 'Swimming_Normal', glow: 0xff9a2e },
  { key: 'carp',     name: '鲫鱼',   model: 'carp',     price: 6,  len: 1.0,  rotY: 0,       n: 16, zone: 'near', speed: 0.3,  depth: 0.2 },
  { key: 'bluefish', name: '蓝金鱼', model: 'bluefish', price: 12, len: 0.9,  rotY: Math.PI, n: 10, zone: 'near', speed: 0.35, depth: 0.15, anim: 'Swimming_Normal', glow: 0x4db8ff },
  { key: 'catfish',  name: '鲶鱼',   model: 'catfish',  price: 9,  len: 1.5,  rotY: Math.PI, n: 6,  zone: 'mid',  speed: 0.25, depth: 0.5, anim: 'Swim.001' },
  { key: 'shark',    name: '鲨鱼',   model: 'shark',    price: 60, len: 2.8,  rotY: Math.PI, n: 5,  zone: 'far',  speed: 0.2,  depth: 0.9, anim: 'Swim' },
  { key: 'croc',     name: '鳄鱼',   model: 'croc',     price: 80, len: 3.6,  rotY: 0,       n: 3,  zone: 'far',  speed: 0.15, depth: 0.15 },
  { key: 'dolphin',  name: '海豚',   model: 'dolphin',  price: 0,  len: 2.4,  rotY: 0,       n: 4,  zone: 'far',  speed: 0.3,  depth: 0.8, anim: 'Swim', jump: true },
  { key: 'whale',    name: '鲸鱼',   model: 'whale',    price: 0,  len: 6.5,  rotY: Math.PI, n: 1, zone: 'far',  speed: 0.1,  depth: 2.2, anim: 'Swim' },
];
export const FISH_INDEX = Object.fromEntries(FISH.map((f) => [f.key, f]));
export const ENERGY = { max: 100, drainWalk: 0.5, drainCarry: 0.7, lowSpeed: 0.55 };   // 体力：走路/扛东西每秒消耗；耗尽走路变慢
export const BALE = { max: 60 };                          // 草料机旁最多堆多少捆
export const CUSTOMER = { every: 9, walk: 2.2, max: 4 };  // 顾客每隔几秒来一个、步速、同时几个

// 小火车属性（容量每升 1 级 +300，每 5 级多挂一节车厢）
export function trainStats(u) {
  const c = u.tcap || 0;
  return { cap: TRAIN.cap + 300 * c, wagons: Math.min(TRAIN.maxWagons, TRAIN.wagons + Math.floor(c / 5)), speed: TRAIN.speed * (1 + 0.12 * (u.tspeed || 0)), bonus: TRAIN.bonus + 0.05 * (u.tbonus || 0) };
}
// 车辆/人物属性
export function stats(save) {
  const u = save.up, s = save.shop;
  const boost = save.boostUntil > Date.now() ? 1.5 : 1;
  const blades = 1 + u.blades;
  const power = (150 + 30 * u.teeth) / 150;
  const spin = (160 + 23 * u.spin) / 160;
  const truckCap = Math.round((360 + 90 * u.cap) * (s.truck ? 1.5 : 1));
  const trailerCap = u.trailer ? 200 + 80 * (u.trailer - 1) : 0;
  return {
    blades,
    strength: 3 * power * spin * boost,                 // 开局就 ≥ 所有作物硬度：一碰就断（锯子锋利）
    speed: 5.6 * (1 + 0.045 * u.wheels) * boost,
    turn: 7 * (1 + 0.12 * (u.turn || 0)),
    bladeR: (0.75 + 0.06 * (u.width || 0)) * (s.wide ? 1.3 : 1),
    bladeGap: 1.05 + 0.08 * (u.width || 0) + (s.wide ? 0.3 : 0),
    truckCap, trailerCap, cap: truckCap + trailerCap,
    pickR: (1.3 + 0.5 * (u.magnet || 0)) * (s.magnet ? 2.5 : 1),
    sellMult: s.sell ? 1.2 : 1,
    carry: 3 + (u.carry || 0),
    baleUnits: 40 - 3 * (u.baler || 0),
    animalMult: 1 + 0.15 * (u.animals || 0),
    shelfCap: 12 + 6 * (u.shelf || 0),
    guestMult: 1 + 0.2 * (u.guests || 0),
    walk: 4.2 * boost,
  };
}
