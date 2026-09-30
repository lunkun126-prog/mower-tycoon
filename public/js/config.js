// 割草大亨 —— 全部数值集中在这里，调手感只改这个文件
// 实测自 233 原版的点：开局容量 360、360 块青草卖 99 金币、锯片 350→875、旋转速度 435→780（160→183）、
// 锯齿 870、容量/车轮 400、拖车 3 级解锁、商店/市场 5 级解锁、40 关每关 3 星。其余为自拟。

export const CELL = 0.5;            // 草格边长（米）
export const UNITS_PER_CELL = 0.4;  // 每格产出的草量
export const FIELD_Y = 1.6;         // 草场高台高度
export const RAMP = { x0: -2.6, x1: 2.6, z0: -3, z1: 0 };   // 坡道
export const ISLAND = { x0: -14, x1: 14, z0: 0, z1: 32 };  // 基地 + 农场
export const FARM_Z = 18;           // z 大于这个算农场

// 草的种类：hp=硬度，value=每单位售价
export const GRASS = [
  { key: 'green',    name: '青草',   hp: 1,   value: 0.275, h: 0.95, top: 0x8fe35a, bot: 0x2e9a1c, cutA: 0x86e052, cutB: 0x5bb52c, under: 0x2c7d18, block: 0x3fae2a },
  { key: 'wheat',    name: '麦子',   hp: 2.2, value: 0.6,   h: 1.15, top: 0xffd64a, bot: 0xd99a0e, cutA: 0xf7e09a, cutB: 0xdfb955, under: 0xa9780b, block: 0xe8b21e },
  { key: 'reed',     name: '芦苇',   hp: 4.5, value: 1.2,   h: 1.45, top: 0x9fe0c0, bot: 0x2f8f6a, cutA: 0xa3dcbb, cutB: 0x74b98f, under: 0x236b4f, block: 0x3fa47c },
  { key: 'lavender', name: '薰衣草', hp: 8,   value: 2.2,   h: 1.0,  top: 0xc9a3ff, bot: 0x6a3fb8, cutA: 0xc9b3ea, cutB: 0x9f82cc, under: 0x4d2c86, block: 0x8e5fe0 },
  { key: 'frost',    name: '霜草',   hp: 13,  value: 4.0,   h: 1.05, top: 0xf2fbff, bot: 0x7fb6d6, cutA: 0xe8f5ff, cutB: 0xc2dbef, under: 0x5f8fb0, block: 0xbfe6ff },
];

// 关卡：1..40。草场随关变大，草的种类越往后越硬
export const LEVEL_COUNT = 40;
export function levelDef(n) {
  const w = Math.min(24 + Math.floor((n - 1) * 0.8) * 2, 48);
  const d = Math.min(28 + Math.floor((n - 1) * 0.8) * 2, 56);
  let tiers;
  if (n <= 3) tiers = [0, 1];
  else if (n <= 7) tiers = [0, 1, 2];
  else if (n <= 14) tiers = [1, 2, 3];
  else if (n <= 24) tiers = [2, 3, 4];
  else tiers = [3, 4];
  const rocks = n >= 6 ? Math.min(3 + Math.floor(n / 4), 14) : 0;
  return { n, w, d, tiers, rocks, seed: 1000 + n * 7919 };
}

// 三颗星：割到的比例、奖励
export const STARS = [
  { at: 0.60, icon: 'flag', reward: (n) => ({ coins: 60 * n }) },   // 第 1 星 = 过关，解锁下一关
  { at: 0.80, icon: 'coin', reward: (n) => ({ coins: 150 * n }) },
  { at: 0.95, icon: 'gem',  reward: (n) => ({ gems: 5 + Math.floor(n / 2) }) },
];

// 升级项
function cost(base, g, L) { return Math.round(base * Math.pow(g, Math.min(L, 3)) * Math.pow(1.4, Math.max(0, L - 3)) / 5) * 5; }
export const UPGRADES = {
  saw: {
    title: '升级锯片',
    items: [
      { id: 'blades', name: '锯片数量', icon: 'blades', max: 4, price: (L) => cost(350, 2.5, L), show: (L) => 1 + L },
      { id: 'teeth',  name: '锯齿数量', icon: 'teeth',  max: 20, price: (L) => cost(870, 1.55, L), show: (L) => 150 + 30 * L },
      { id: 'spin',   name: '旋转速度', icon: 'spin',   max: 20, price: (L) => cost(435, 1.79, L), show: (L) => 160 + 23 * L },
    ],
  },
  truck: {
    title: '升级卡车',
    items: [
      { id: 'cap',    name: '车辆容量', icon: 'cap',    max: 20, price: (L) => cost(400, 1.6, L), show: (L) => 360 + 90 * L },
      { id: 'wheels', name: '加装车轮', icon: 'wheel',  max: 20, price: (L) => cost(400, 1.6, L), show: (L) => 850 + 60 * L },
    ],
  },
  trailer: {
    title: '升级拖车', needLevel: 3,
    items: [
      { id: 'trailer', name: '拖车容量', icon: 'trailer', max: 15, price: (L) => cost(1500, 1.6, L), show: (L) => (L ? 200 + 80 * (L - 1) : 0) },
    ],
  },
};

// 商店（5 级解锁），全部用游戏里挣的钻石/金币买，无广告
export const SHOP = [
  { id: 'magnet', name: '磁铁',       desc: '掉在地上的草块自动吸过来', gems: 15 },
  { id: 'wide',   name: '加宽割草机', desc: '锯片更大、割得更宽',       gems: 25 },
  { id: 'sell',   name: '售价 +20%',  desc: '所有草和农产品卖价 +20%', gems: 30 },
  { id: 'truck',  name: '新卡车',     desc: '卡车容量 ×1.5',           gems: 40 },
  { id: 'double', name: '奖励翻倍',   desc: '星星奖励翻倍',             gems: 20 },
  { id: 'boost',  name: '助推器',     desc: '5 分钟内车速和切割 ×1.5（可重复买）', coins: 800, consumable: true },
];
export const BOOST_MS = 5 * 60 * 1000;
export const UNLOCK = { trailer: 3, shop: 5, farm: 5 };

// 农场（5 级解锁）
export const FARM = {
  coop: { name: '鸡舍', build: 1500, feed: 0, feedName: '青草', per: 8, every: 5, store: 400, maxGoods: 40, good: 'egg' },
  barn: { name: '牛舍', build: 5000, feed: 1, feedName: '麦子', per: 12, every: 8, store: 400, maxGoods: 30, good: 'milk' },
};
export const GOODS = { egg: { name: '鸡蛋', price: 12 }, milk: { name: '牛奶', price: 35 } };

// 车辆
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
    strength: 2 * power * spin * boost,             // ≥ 草的 hp 时一碰就断
    speed: 5.2 * (1 + 0.045 * u.wheels) * boost,    // 米/秒
    bladeR: s.wide ? 0.98 : 0.75,
    bladeGap: s.wide ? 1.35 : 1.05,
    truckCap, trailerCap, cap: truckCap + trailerCap,
    pickR: s.magnet ? 4.5 : 1.3,
    sellMult: s.sell ? 1.2 : 1,
  };
}
