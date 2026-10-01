// 界面：HUD、升级/关卡/商店/农场/设置面板、提示
import * as THREE from 'three';
import { UPGRADES, SHOP, FARM, GOODS, STARS, LEVEL_COUNT, SANDBOX, CHARACTERS } from './config.js';

const $ = (id) => document.getElementById(id);
const ICON = {
  blades: '<svg viewBox="0 0 48 48"><g fill="#fff"><circle cx="18" cy="26" r="13"/><circle cx="31" cy="19" r="11" opacity=".75"/></g><circle cx="18" cy="26" r="4" fill="#27516b"/><circle cx="31" cy="19" r="3.4" fill="#27516b"/></svg>',
  teeth: '<svg viewBox="0 0 48 48"><path fill="#fff" d="M8 40 L8 22 Q10 10 22 8 L20 16 L28 11 L27 19 L35 16 L33 24 L41 23 L37 30 L42 34 L40 40 Z"/></svg>',
  spin: '<svg viewBox="0 0 48 48"><circle cx="21" cy="27" r="13" fill="#fff"/><circle cx="21" cy="27" r="4.5" fill="#27516b"/><path d="M33 6 l8 6 -8 6 M27 6 l8 6 -8 6" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round"/></svg>',
  width: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="16" fill="none" stroke="#fff" stroke-width="4"/><path d="M8 24h32M12 18l-4 6 4 6M36 18l4 6-4 6" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round"/></svg>',
  cap: '<svg viewBox="0 0 48 48"><path fill="#fff" d="M7 16 h34 l-4 24 H11 Z"/><rect x="5" y="11" width="38" height="6" rx="2" fill="#fff"/></svg>',
  wheel: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="17" fill="none" stroke="#fff" stroke-width="5"/><circle cx="24" cy="24" r="5" fill="#fff"/><path d="M24 7v34M7 24h34M12 12l24 24M36 12L12 36" stroke="#fff" stroke-width="2.5"/></svg>',
  turn: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="16" fill="none" stroke="#fff" stroke-width="5"/><circle cx="24" cy="24" r="5" fill="#fff"/><path d="M24 24L10 16M24 24l14-8M24 24v16" stroke="#fff" stroke-width="3.5"/></svg>',
  magnet: '<svg viewBox="0 0 48 48"><path d="M12 8v18a12 12 0 0 0 24 0V8" fill="none" stroke="#fff" stroke-width="8"/><path d="M8 8h9v8H8zM31 8h9v8h-9z" fill="#e53935"/></svg>',
  trailer: '<svg viewBox="0 0 48 48"><path fill="#fff" d="M6 14 h36 l-3 18 H9 Z"/><path d="M12 14 l4-7 4 6 4-8 4 8 4-6 4 7" fill="#8fe35a"/><circle cx="15" cy="37" r="5" fill="#fff"/><circle cx="33" cy="37" r="5" fill="#fff"/></svg>',
  carry: '<svg viewBox="0 0 48 48"><rect x="10" y="6" width="28" height="14" rx="2" fill="#cfe08a"/><rect x="10" y="22" width="28" height="14" rx="2" fill="#cfe08a"/><circle cx="24" cy="41" r="4" fill="#fff"/></svg>',
  baler: '<svg viewBox="0 0 48 48"><rect x="6" y="14" width="36" height="20" rx="3" fill="#fff"/><circle cx="14" cy="38" r="5" fill="#333"/><circle cx="34" cy="38" r="5" fill="#333"/><rect x="14" y="8" width="20" height="6" fill="#f2c230"/></svg>',
  animals: '<svg viewBox="0 0 48 48"><circle cx="24" cy="22" r="12" fill="#fff"/><circle cx="18" cy="20" r="2" fill="#333"/><circle cx="30" cy="20" r="2" fill="#333"/><rect x="18" y="26" width="12" height="7" rx="3" fill="#f3a3b5"/><path d="M10 12l6 4M38 12l-6 4" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>',
  shelf: '<svg viewBox="0 0 48 48"><path d="M8 14h32M8 26h32M8 38h32" stroke="#fff" stroke-width="4"/><rect x="6" y="6" width="4" height="36" fill="#fff"/><rect x="38" y="6" width="4" height="36" fill="#fff"/><circle cx="16" cy="10" r="3" fill="#ffe9b0"/><rect x="26" y="18" width="5" height="8" fill="#f8f8f8"/></svg>',
  guests: '<svg viewBox="0 0 48 48"><circle cx="16" cy="14" r="6" fill="#fff"/><circle cx="32" cy="14" r="6" fill="#fff"/><path d="M6 40v-8a10 10 0 0 1 20 0v8zM22 40v-8a10 10 0 0 1 20 0v8z" fill="#fff"/></svg>',
  cart: '<svg viewBox="0 0 48 48"><path d="M5 9h7l6 22h19l5-15H15" fill="none" stroke="#fff" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="20" cy="39" r="3.8" fill="#fff"/><circle cx="35" cy="39" r="3.8" fill="#fff"/></svg>',
  lock: '<svg viewBox="0 0 48 48"><rect x="10" y="21" width="28" height="21" rx="4" fill="#fff"/><path d="M16 21v-6a8 8 0 0 1 16 0v6" stroke="#fff" stroke-width="5" fill="none"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 2l3 6.6 7 .8-5.2 4.9 1.4 7.1L12 18l-6.2 3.4 1.4-7.1L2 9.4l7-.8z"/></svg>',
  coop: '🐔', barn: '🐄',
  wide: '🪚', sell: '💰', truck: '🚚', double: '🎁', boost: '⚡',
};
const TAB_NAME = { saw: '锯片', truck: '卡车', trailer: '拖车', farm: '农场' };

let ctx = null, onClose = null;
export function modalOpen() { return !$('modal').hidden; }
function openModal(html, cls = '', close) {
  const m = $('modal');
  m.innerHTML = `<div class="panel ${cls}">${html}<button class="pclose" aria-label="关闭">✕</button></div>`;
  m.hidden = false; onClose = close || null;
  m.querySelector('.pclose').onclick = closeModal;
  return m.querySelector('.panel');
}
export function closeModal() { const m = $('modal'); m.hidden = true; m.innerHTML = ''; if (onClose) { const f = onClose; onClose = null; f(); } }

export function init(c) {
  ctx = c;
  $('btnSet').onclick = openSettings;
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && modalOpen()) closeModal(); });
  const bar = $('progBar');
  STARS.forEach((s, k) => {
    const st = document.createElement('em'); st.className = 'pstar'; st.id = 'star' + k; st.style.left = s.at * 100 + '%'; st.innerHTML = ICON.star; bar.appendChild(st);
    const ic = document.createElement('i'); ic.className = 'preward r-' + s.icon; ic.style.left = s.at * 100 + '%'; $('progRewards').appendChild(ic);
  });
}

export function setLevel(n, crops = '') { $('lvlName').textContent = `第 ${n} 关`; const c = $('lvlCrops'); if (c) c.textContent = crops; }
export function hint(on) { $('hint').hidden = !on; }

const last = {};
const fmt = (n) => { n = Math.floor(n); return n < 10000 ? String(n) : n < 1e6 ? (n / 1000).toFixed(1) + 'K' : (n / 1e6).toFixed(2) + 'M'; };
function set(id, v) { if (last[id] !== v) { last[id] = v; $(id).textContent = v; } }
export function hud(h) {
  if (SANDBOX) { set('coins', '∞'); set('gems', '∞'); $('coins').classList.add('inf'); $('gems').classList.add('inf'); } else { set('coins', fmt(h.coins)); set('gems', fmt(h.gems)); }
  set('capText', `${Math.floor(h.cap > 0 ? Math.min(h.cargo + 1e-6, h.cap) : 0)} / ${h.cap}`);
  const f = h.cap ? Math.min(1, h.cargo / h.cap) : 0;
  const cf = $('capFill'); cf.style.height = f * 100 + '%';
  cf.className = f >= 0.98 ? 'red' : f > 0.8 ? 'yellow' : '';
  $('progFill').style.width = Math.min(100, h.progress * 100) + '%';
  h.stars.forEach((on, k) => $('star' + k).classList.toggle('on', on));
  const b = $('boost');
  if (h.boostLeft > 0) { b.hidden = false; const s = Math.ceil(h.boostLeft / 1000); set('boostT', `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`); } else b.hidden = true;
  const t = $('task'); if (t) { const txt = h.task || ''; if (last.task !== txt) { last.task = txt; t.textContent = txt; t.hidden = !txt; } t.classList.toggle('walk', h.mode === 'walk'); }
  const en = $('energy'); if (en) { en.hidden = h.mode !== 'walk'; const pct = Math.round((h.energy || 0) * 100); if (last.energy !== pct) { last.energy = pct; en.firstElementChild.style.width = pct + '%'; en.lastElementChild.textContent = `体力 ${pct}`; en.classList.toggle('low', pct <= 15); } }
}

let toastTimer = 0;
export function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
export function popup(title, html, stars = 0) {
  const p = document.createElement('div'); p.className = 'popup';
  p.innerHTML = `<div class="pop-stars">${[0, 1, 2].map((k) => `<b class="${k < stars ? 'on' : ''}">${ICON.star}</b>`).join('')}</div><h2>${title}</h2><p>${html}</p>`;
  document.body.appendChild(p); setTimeout(() => p.classList.add('out'), 2200); setTimeout(() => p.remove(), 2700);
}
const _v = new THREE.Vector3();
function floatDom(text, v) {
  const d = document.createElement('div'); d.className = 'floater'; d.innerHTML = `<i class="coin-ico">$</i>${text}`;
  d.style.left = (v.x * 0.5 + 0.5) * innerWidth + 'px'; d.style.top = (-v.y * 0.5 + 0.5) * innerHeight + 'px';
  document.body.appendChild(d); setTimeout(() => d.remove(), 1400);
}
export function floatText(text, rect, camera) { floatDom(text, _v.set((rect.x0 + rect.x1) / 2, 2.5, (rect.z0 + rect.z1) / 2).project(camera)); }
export function floatAt(text, x, y, z, camera) { floatDom(text, _v.set(x, y, z).project(camera)); }
export function joy(on, x, y, dx = 0, dy = 0) {
  const j = $('joy');
  if (!on) { j.hidden = true; return; }
  j.hidden = false; j.style.left = x + 'px'; j.style.top = y + 'px';
  const l = Math.hypot(dx, dy), k = l > 46 ? 46 / l : 1;
  j.firstElementChild.style.transform = `translate(${dx * k}px,${dy * k}px)`;
}

// ---------- 升级面板 ----------
export function openUpgrade(c, tab) {
  const tabs = Object.keys(UPGRADES);
  const T = UPGRADES[tab], s = c.save;
  let body;
  if (T.needLevel && !SANDBOX && s.maxLevel < T.needLevel) {
    body = `<div class="locked">${tile(ICON.lock, 'big')}<b>未解锁</b><span>达到${T.needLevel}级</span></div>`;
  } else {
    body = T.items.map((it) => {
      const L = s.up[it.id] || 0, max = L >= it.max, price = max ? 0 : it.price(L), ok = SANDBOX || s.coins >= price;
      const label = it.id === 'trailer' && L === 0 ? '购买' : '金币';
      const btn = max ? `<button class="ubuy max" data-id="${it.id}" disabled>满级</button>`
        : SANDBOX ? `<button class="ubuy free" data-id="${it.id}">${it.id === 'trailer' && L === 0 ? '解锁' : '升级'} ▲</button>`
        : `<button class="ubuy ${ok ? 'ok' : ''}" data-id="${it.id}">${label} ${fmt(price)}</button>`;
      return `<div class="urow">${tile(ICON[it.icon])}<div class="uinfo"><div class="uname"><b>${it.name}</b><em>${it.show(L)}</em></div>
        <div class="ubar"><i style="width:${L / it.max * 100}%"></i></div></div>${btn}</div>`;
    }).join('');
  }
  const html = `<div class="ptitle">${T.title}</div><div class="pbody">${body}</div>
    <div class="ptabs">${tabs.map((k) => `<button data-tab="${k}" class="${k === tab ? 'cur' : ''}">${TAB_NAME[k]}</button>`).join('')}</div>`;
  const p = openModal(html, 'up');
  p.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => openUpgrade(c, b.dataset.tab));
  p.querySelectorAll('.ubuy').forEach((b) => b.onclick = () => {
    const it = T.items.find((x) => x.id === b.dataset.id);
    if (c.buyUpgrade(tab, it)) openUpgrade(c, tab); else b.classList.add('shake'), setTimeout(() => b.classList.remove('shake'), 400);
  });
}
const tile = (svg, cls = '') => `<div class="tile ${cls}">${svg}</div>`;

// ---------- 关卡 ----------
export function openLevels(c) {
  const s = c.save;
  let grid = '';
  for (let n = 1; n <= LEVEL_COUNT; n++) {
    const st = s.stars[n] || 0, lock = !SANDBOX && n > s.maxLevel;
    grid += `<button class="lv ${n === s.level ? 'cur' : ''} ${lock ? 'lock' : ''}" data-n="${n}"><b>${lock ? '🔒' : n}</b><span>${[0, 1, 2].map((k) => `<i class="${k < st ? 'on' : ''}">${ICON.star}</i>`).join('')}</span></button>`;
  }
  const p = openModal(`<div class="ftitle">关卡</div><div class="lvgrid">${grid}</div>`, 'full');
  p.querySelectorAll('.lv').forEach((b) => b.onclick = () => {
    const n = +b.dataset.n;
    if (!SANDBOX && n > s.maxLevel) { toast('先在当前关拿到第 1 颗星（割到 60%）才能解锁下一关'); return; }
    if (n === s.level) { closeModal(); return; }
    confirmBox(`进入第 ${n} 关？`, '当前场地将重置，但会有新的作物和更大的场地。继续吗？', () => { c.goLevel(n); });
  });
}

function confirmBox(title, text, yes) {
  const p = openModal(`<div class="ptitle">${title}</div><div class="pbody"><p class="ctext">${text}</p>
    <div class="cbtns"><button class="btn gold" id="cYes">确定</button><button class="btn grey" id="cNo">取消</button></div></div>`, 'small');
  p.querySelector('#cYes').onclick = () => { closeModal(); yes(); };
  p.querySelector('#cNo').onclick = closeModal;
}

// ---------- 未解锁 ----------
export function openLocked(name, need) {
  openModal(`<div class="ptitle">未解锁</div><div class="pbody"><div class="locked">${tile(name.includes('商店') || name.includes('市场') ? ICON.cart : ICON.lock, 'big')}<b>${name}</b><span>${need}</span></div></div>`, 'small');
}

// ---------- 商店 ----------
export function openShop(c) {
  const s = c.save;
  const rows = SHOP.map((it) => {
    const own = !it.consumable && s.shop[it.id];
    const price = it.gems ? `<i class="gem-ico"></i>${it.gems}` : `<i class="coin-ico">$</i>${it.coins}`;
    const ok = SANDBOX || (it.gems ? s.gems >= it.gems : s.coins >= it.coins);
    return `<div class="srow">${tile(it.id === 'magnet' ? ICON.magnet : `<span class="emo">${ICON[it.id]}</span>`)}<div class="uinfo"><b>${it.name}</b><small>${it.desc}</small></div>
      <button class="ubuy ${own ? 'max' : SANDBOX ? 'free' : ok ? 'ok' : ''}" data-id="${it.id}" ${own ? 'disabled' : ''}>${own ? '已购买' : SANDBOX ? '购买' : price}</button></div>`;
  }).join('');
  const p = openModal(`<div class="ptitle">商店</div><div class="pbody shop">${rows}</div>`, 'up');
  p.querySelectorAll('.ubuy').forEach((b) => b.onclick = () => { const it = SHOP.find((x) => x.id === b.dataset.id); if (c.buyShop(it)) openShop(c); });
}

// ---------- 农场建造 ----------
export function openBuild(c, name) {
  const F = FARM[name];
  const p = openModal(`<div class="ptitle">建造${F.name}</div><div class="pbody"><div class="locked">${tile(`<span class="emo">${ICON[name]}</span>`, 'big')}
    <span>吃草捆，每 ${F.every} 秒产 1 个${GOODS[F.good].name}（1 捆草够产 5 个）<br>${GOODS[F.good].name}放到「货架」上，顾客会从码头来买（${GOODS[F.good].price} 金币/个）</span>
    <button class="ubuy ${SANDBOX ? 'free' : c.save.coins >= F.build ? 'ok' : ''}" id="bBuild">${SANDBOX ? '建造' : `金币 ${fmt(F.build)}`}</button></div></div>`, 'small');
  p.querySelector('#bBuild').onclick = () => { if (c.build(name)) closeModal(); };
}

// ---------- 农场大门：谁下车 ----------
// 点头像选人（可以选好几个），第一个点的是你操控的人，其余的跟在后面走
export function openWhoDown(c) {
  const keys = Object.keys(CHARACTERS), pick = [];
  const cards = keys.map((k) => `<button class="who" data-k="${k}"><img src="${CHARACTERS[k].avatar}" alt=""><b>${CHARACTERS[k].short}</b><i></i></button>`).join('');
  const p = openModal(`<div class="ptitle">谁下车？</div><div class="pbody"><p class="ctext">点头像选人，可以选好几个；第一个点的人由你操控，其他人跟在后面走。</p>
    <div class="whos">${cards}</div><div class="cbtns"><button class="btn gold" id="wGo" disabled>下车</button><button class="btn green" id="wAll">全家都下</button></div></div>`, 'small');
  const go = p.querySelector('#wGo');
  const paint = () => { p.querySelectorAll('.who').forEach((b) => { const i = pick.indexOf(b.dataset.k); b.classList.toggle('on', i >= 0); b.querySelector('i').textContent = i === 0 ? '我来走' : i > 0 ? '跟着' : ''; }); go.disabled = !pick.length; };
  p.querySelectorAll('.who').forEach((b) => b.onclick = () => { const i = pick.indexOf(b.dataset.k); if (i >= 0) pick.splice(i, 1); else pick.push(b.dataset.k); paint(); });
  go.onclick = () => { if (!pick.length) return; const k = pick.slice(); closeModal(); c.getOff(k); };
  p.querySelector('#wAll').onclick = () => { closeModal(); c.getOff(pick.length ? [...pick, ...keys.filter((k) => !pick.includes(k))] : keys); };
}

// ---------- 灶台：吃东西 ----------
export function openEat(c) {
  const carry = c.save.farm.carry, en = Math.round(c.save.farm.energy);
  const rows = ['fish', 'egg', 'milk'].map((k) => { const g = GOODS[k], n = carry[k] || 0; return `<div class="srow">${tile(`<span class="emo">${{ fish: '🐟', egg: '🥚', milk: '🥛' }[k]}</span>`)}<div class="uinfo"><b>${g.name} × ${n}</b><small>${k === 'milk' ? '喝' : '吃'}一个体力 +${g.energy}；上架卖 ${g.price} 金币/个</small></div>
    <button class="ubuy ${n > 0 ? 'ok' : ''}" data-eat="${k}" ${n > 0 ? '' : 'disabled'}>${k === 'milk' ? '喝' : '吃'}一个</button></div>`; }).join('');
  const p = openModal(`<div class="ptitle">灶台</div><div class="pbody shop"><p class="ctext">体力 ${en} / 100 —— 走路、扛草会消耗体力，耗尽就走不快了。自己吃，或拿去「上架」卖给顾客。</p>${rows}</div>`, 'up');
  p.querySelectorAll('[data-eat]').forEach((b) => b.onclick = () => { if (c.eat(b.dataset.eat)) openEat(c); });
}

// ---------- 设置 ----------
function openSettings() {
  const s = ctx.save;
  const p = openModal(`<div class="ptitle">设置</div><div class="pbody">
    <div class="setrow"><b>音效</b><button class="btn ${s.sound ? 'gold' : 'grey'}" id="sSound">${s.sound ? '开' : '关'}</button></div>
    <div class="setrow"><b>操作</b><span>按住屏幕拖动 / 方向键 / WASD</span></div>
    <div class="setrow"><b>玩法</b><span>割草装车 → 「出售」换金币 或 「打捆」做草捆 → 开进农场大门下车 → 扛草喂鸡牛 → 收蛋奶「上架」→ 顾客来买；左边「下水」坡开进海里拖拉机变船，船头网捞鱼、撞到的东西进后备箱（垃圾扔「倒垃圾」）；鱼在农场「灶台」烤了吃或上架卖</span></div>
    <div class="setrow"><b>模式</b><span>${SANDBOX ? '沙盒：金币钻石无限，全部关卡与设施已解锁' : '正常'}</span></div>
    <div class="setrow"><b>存档</b><button class="btn red" id="sReset">重置存档</button></div></div>`, 'small');
  p.querySelector('#sSound').onclick = () => { ctx.toggleSound(); openSettings(); };
  p.querySelector('#sReset').onclick = () => confirmBox('重置存档？', '金币、升级、关卡进度全部清零，不能恢复。', () => ctx.resetSave());
}
