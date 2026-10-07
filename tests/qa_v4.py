"""割草大亨 v4 新功能验收：py -3.11 -X utf8 tests/qa_v4.py （需先起 8322）
小火车、11 关起变难、选人下车、每关换车色、坐姿、拖车前后排开、锯片锯齿。全过 exit 0。"""
import os, sys
from playwright.sync_api import sync_playwright

URL = os.environ.get('MOWER_URL', 'http://127.0.0.1:8322/index.html')
SHOTS = os.path.join(os.path.dirname(__file__), 'shots'); os.makedirs(SHOTS, exist_ok=True)
results = []


def check(name, ok, info=''):
    results.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name + (f'  [{info}]' if info else ''), flush=True)


with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = b.new_page(viewport={'width': 800, 'height': 450}); page.set_default_timeout(240000)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'ERR_CONNECTION_REFUSED' not in m.text and errors.append(m.text))
    ev = page.evaluate

    def wait_sim(sec, cond=None):
        t0 = ev('() => window.__mower.time')
        for _ in range(4000):
            page.wait_for_timeout(50)
            if cond and ev(cond): return True
            if ev('() => window.__mower.time') - t0 >= sec: return bool(cond and ev(cond))
        return False

    def tp(x, z, yaw=0):
        ev(f'() => {{ const c = window.__mower.car; c.x = {x}; c.z = {z}; c.yaw = {yaw}; c.speed = 0; }}'); wait_sim(0.3)

    def hold(key, sec):
        t0 = ev('() => window.__mower.time'); page.keyboard.down(key)
        for _ in range(4000):
            page.wait_for_timeout(50)
            if ev('() => window.__mower.time') - t0 >= sec: break
        page.keyboard.up(key)

    def close_modal():
        if page.locator('#modal .pclose').count(): page.click('#modal .pclose'); page.wait_for_timeout(200)

    page.goto(URL); ev('() => localStorage.clear()'); page.reload()
    page.wait_for_function('() => window.__mower && window.__mower.field', timeout=90000)
    ev('() => { window.__mower.save.hintDone = true; document.getElementById("hint").hidden = true; }')

    # ---- 坐姿：后排两人同一高度左右并排；司机两手在胸前（不是背在后面）；两腿并排（没有二郎腿）
    pose = ev('''() => {
      const m = window.__mower.mower, v = new window.__mower.THREE_V(), get = (o, n) => { let r = null; o.traverse((x) => { if (!r && x.name === n) r = x; }); return r; };
      const loc = (o) => m.body.worldToLocal(o.getWorldPosition(new window.__mower.THREE_V()));
      const kh = loc(get(m.kid, 'Hips')), gh = loc(get(m.granny, 'Hips'));
      const d = m.driver, sh = loc(get(d, 'ShoulderL')), wl = loc(get(d, 'WristL')), wr = loc(get(d, 'WristR'));
      const kl = loc(get(d, 'LowerLegL')), kr = loc(get(d, 'LowerLegR')), fl = loc(get(d, 'FootL')), fr = loc(get(d, 'FootR'));
      return { kidY: kh.y, granY: gh.y, kidX: kh.x, granX: gh.x, kidZ: kh.z, granZ: gh.z, shZ: sh.z, wlZ: wl.z, wrZ: wr.z, kneeGap: Math.abs(kl.x - kr.x), footGap: Math.abs(fl.x - fr.x), kneeDy: Math.abs(kl.y - kr.y) };
    }''')
    check('后排甜甜、奶奶坐同一高度（不再一上一下）', abs(pose['kidY'] - pose['granY']) < 0.2, f"甜甜 {pose['kidY']:.2f} 奶奶 {pose['granY']:.2f}")
    check('后排两人一左一右', pose['kidX'] < -0.15 and pose['granX'] > 0.15 and abs(pose['kidZ'] - pose['granZ']) < 0.25, f"x {pose['kidX']:.2f}/{pose['granX']:.2f}")
    check('司机两手在肩膀前面握方向盘（不是背着手）', pose['wlZ'] < pose['shZ'] - 0.25 and pose['wrZ'] < pose['shZ'] - 0.25, f"肩 z {pose['shZ']:.2f} 手 z {pose['wlZ']:.2f}/{pose['wrZ']:.2f}")
    check('司机两腿并排、两膝同高（没有翘二郎腿）', pose['kneeGap'] < 0.5 and pose['footGap'] < 0.6 and pose['kneeDy'] < 0.1, f"膝距 {pose['kneeGap']:.2f} 脚距 {pose['footGap']:.2f} 膝高差 {pose['kneeDy']:.2f}")
    teeth = ev('() => { const g = window.__mower.mower.blades[0].geo; g.computeBoundingBox(); return g.attributes.position.count; }')
    check('锯片换成尖锯齿（顶点比旧方齿多）', teeth > 400, f'{teeth} 顶点')

    # ---- 每关换车色
    c1 = ev('() => window.__mower.mower.carColor.value.getHexString()')
    ev('() => window.__mower.ctx.goLevel(2)'); wait_sim(0.2)
    c2 = ev('() => window.__mower.mower.carColor.value.getHexString()')
    ev('() => window.__mower.ctx.goLevel(3)'); wait_sim(0.2)
    c3 = ev('() => window.__mower.mower.carColor.value.getHexString()')
    check('每过一关车换一种颜色（不只有红车）', len({c1, c2, c3}) == 3, f'{c1} / {c2} / {c3}')
    pc = ev('() => window.__mower.mower.paint.color.getHexString()')
    check('后备箱/拖车/底盘也跟着换色', pc == c3, f'车头 {c3} 车斗 {pc}')
    # 在第 3 关割到「胜利」（60%）：不用去选关，车当场换成下一关的颜色
    ev('() => { const f = window.__mower.field; f.cutCount = Math.floor(f.validCount * 0.6) - 1; }')
    tp(0, -8); hold('KeyW', 1.5)
    c4 = ev('() => window.__mower.mower.carColor.value.getHexString()')
    check('过关当场换新车色（不用重新选关）', c4 != c3 and c4 not in (c1, c2), f'{c3} → {c4}')
    close_modal()

    # ---- 拖车挂在后备箱后面，前后排开不重叠
    ev('() => { window.__mower.save.up.trailer = 1; }'); tp(0, 12, 0); hold('KeyW', 1.0)
    ev('() => { const c = window.__mower.car; c.x = 0; c.z = 12; c.yaw = 3.1416; }'); wait_sim(0.3)   # 传送 + 掉头：拖车不能折到前面
    gap = ev('''() => { const m = window.__mower.mower, c = window.__mower.car; const t = m.trailer.position; return Math.hypot(t.x - c.x, t.z - c.z); }''')
    check('拖车在后备箱后面（车中心到拖车 ≥ 5.4m，后备箱尾 3.95m）', gap >= 5.4, f'{gap:.2f}m')
    ev('() => { window.__mower.save.up.trailer = 0; }')

    # ---- 难度：第 1 关一碰就断；11 关起硬草要多磨、开不快，但割得动
    def mow_test(level):
        ev(f'() => window.__mower.ctx.goLevel({level})'); wait_sim(0.3)
        ev('() => { window.__mower.save.up.blades = 0; window.__mower.save.up.wheels = 0; window.__mower.save.up.teeth = 0; window.__mower.save.up.spin = 0; }')
        tp(0, -6, 0)
        p0 = ev('() => window.__mower.field.cutCount')
        speeds = []
        t0 = ev('() => window.__mower.time'); page.keyboard.down('KeyW')
        while ev('() => window.__mower.time') - t0 < 3:
            page.wait_for_timeout(120); speeds.append(ev('() => window.__mower.car.speed'))
        page.keyboard.up('KeyW')
        return ev('() => window.__mower.field.cutCount') - p0, max(speeds), ev('() => window.__mower.field.def.hard')
    cut1, sp1, h1 = mow_test(1)
    page.screenshot(path=f'{SHOTS}/v4_mow_l1.png')
    cut11, sp11, h11 = mow_test(12)
    page.screenshot(path=f'{SHOTS}/v4_mow_l12.png')
    partial = ev('''() => { const f = window.__mower.field; let n = 0; for (let i = 0; i < f.hp.length; i++) if (!f.cut[i] && f.hp[i] < window.__mower.CROPS[f.type[i]].hp * f.hard - 1e-3) n++; return n; }''')
    check('第 1 关正常割（稍硬但顺）', cut1 > 60 and h1 < 2, f'割 {cut1} 格 硬度×{h1:.2f} 最高车速 {sp1:.1f}')
    check('11 关后草硬：同样 3 秒割得少很多、车速慢', cut11 < cut1 * 0.6 and sp11 < sp1 * 0.75, f'割 {cut11} 格 硬度×{h11:.2f} 最高车速 {sp11:.1f}')
    check('11 关后还是割得动（不是一点都割不下）', cut11 > 5, f'{cut11} 格')
    check('硬草被锯了一半会变矮（看得出在割）', partial > 0, f'{partial} 格割了一半')

    # ---- 小火车：10 关没有，11 关起有；铁轨在草场边上，跟着割草机走，草自动飞进车厢
    ev('() => window.__mower.ctx.goLevel(10)'); wait_sim(0.2)
    check('第 10 关还没有小火车', not ev('() => window.__mower.train.active'))
    ev('() => window.__mower.ctx.goLevel(11)'); wait_sim(0.3)
    geo = ev('() => { const M = window.__mower, t = M.train, f = M.field; return { on: t.active && t.g.visible, xl: Math.min(...t.X), xr: Math.max(...t.X), zt: Math.min(...t.Z), fx0: f.x0, fz0: f.z0, base: !!M.world.pads.train }; }')
    check('第 11 关草场边上铺了铁轨、有小火车（基地后面不再有火车站）', geo['on'] and not geo['base'] and geo['xl'] < geo['fx0'] and geo['xr'] > -geo['fx0'] and geo['zt'] < geo['fz0'], str(geo))
    ev('() => { const f = window.__mower.field; window.__fx = f.x0; window.__fz = f.z0; }')
    fx0, fz0 = ev('() => window.__fx'), ev('() => window.__fz')
    tp(fx0 + 4, fz0 + 20, 0); wait_sim(8)
    near = ev('() => { const M = window.__mower, c = M.car; return Math.min(...M.train.wagons.map((w) => { const p = w.getWorldPosition(new M.THREE_V()); return Math.hypot(p.x - c.x, p.z - c.z); })); }')
    check('小火车沿铁轨开到割草机旁边', near < 8, f'最近车厢 {near:.1f} m')
    ev('() => window.__mower.setRuns([{ t: 0, u: 200 }])'); wait_sim(2)
    loaded, left = ev('() => window.__mower.train.units'), ev('() => window.__mower.cargoTotal()')
    check('在草场里割草，车斗里的草自己飞进小火车（不用开回基地）', loaded > 150 and left < 20, f'火车 {loaded:.0f} 车斗剩 {left:.0f}')
    page.screenshot(path=f'{SHOTS}/v4_train_load.png')
    coins0 = ev('() => window.__mower.save.coins')
    cap = ev('() => window.__mower.train.cap')
    ev(f'() => window.__mower.setRuns([{{ t: 0, u: {cap} }}])')
    ok = wait_sim(6, "() => window.__mower.train.state === 'go'")
    check('小火车装满了自己鸣笛出发去市场', ok)
    wait_sim(1.5); page.screenshot(path=f'{SHOTS}/v4_train_run.png')
    # 软件渲染太慢（模拟时间约真实的 1/30），跑全程要十几分钟：把车头挪到离市场 12 米处，割草机停到右边市场附近
    ev('() => { const M = window.__mower, t = M.train; t.s = t.P - 12; t.pose(); }')
    tp(-fx0 - 4, fz0 + 55, 0)
    sold = wait_sim(15, f'() => window.__mower.save.coins > {coins0}')   # 卖完回来马上又会装车斗剩下的草，所以看金币涨没涨
    coins1 = ev('() => window.__mower.save.coins')
    check('小火车开到草场角上的市场把草卖掉、给钱（比出售多 25%）', sold and coins1 - coins0 >= cap * 0.275 * 1.2, f'+{coins1 - coins0} 金币')
    back = wait_sim(20, "() => window.__mower.train.state === 'wait' && !window.__mower.train.returning")
    near = ev('() => { const M = window.__mower, c = M.car; return Math.min(...M.train.wagons.map((w) => { const p = w.getWorldPosition(new M.THREE_V()); return Math.hypot(p.x - c.x, p.z - c.z); })); }')
    check('卖完自己开回割草机旁边接着装', back and near < 8, f'最近车厢 {near:.1f} m')
    # 升级小火车（沙盒金币无限）
    ev("() => { const M = window.__mower, it = (id) => M.ctx.buyUpgrade('train', { id, max: 20, price: () => 0 }); for (let i = 0; i < 5; i++) it('tcap'); it('tspeed'); it('tbonus'); }"); wait_sim(0.2)
    up = ev('() => { const t = window.__mower.train; return { cap: t.cap, wagons: t.wagons.length, speed: t.ts.speed, bonus: t.ts.bonus }; }')
    check('升级小火车：容量变大、多挂一节车厢、更快、卖得更贵', up['cap'] == 2400 and up['wagons'] == 4 and up['speed'] > 10 and up['bonus'] > 1.25, str(up))
    pu = ev('() => window.__mower.world.pads.upgrade'); tp(pu['cx'], pu['cz']); page.wait_for_timeout(600)
    page.click('#modal [data-tab=train]'); page.wait_for_timeout(300)
    check('升级页有「火车」一栏，沙盒里直接点升级', page.locator('#modal .urow').count() == 3 and page.locator('#modal .ubuy.free').count() >= 1)
    page.screenshot(path=f'{SHOTS}/v4_train_upgrade.png'); close_modal(); tp(0, 8)

    # ---- 选人下车
    ev('() => window.__mower.ctx.goLevel(1)'); wait_sim(0.3)
    tp(0, 12); tp(0, 16.6); page.wait_for_timeout(400)
    check('到农场大门弹出「谁下车」', page.locator('#modal .who').count() == 3)
    page.click('#modal .who[data-k=passenger]'); page.click('#wGo'); wait_sim(0.4)
    st = ev('''() => { const M = window.__mower, w = M.farm.walkers; return { mode: M.mode, girl: w.passenger.model.visible, girlH: w.passenger.model.userData.size.y, drvWalk: w.driver.model.visible, drvSeat: M.mower.seated.driver.visible, kidSeat: M.mower.seated.passenger.visible }; }''')
    check('只让甜甜下车：甜甜走路、爷爷奶奶留在车上', st['mode'] == 'walk' and st['girl'] and not st['drvWalk'] and st['drvSeat'] and not st['kidSeat'], str(st))
    page.screenshot(path=f'{SHOTS}/v4_girl_walk.png')
    ev('() => { const m = window.__mower.farm.man; m.x = 0; m.z = 18.9; }'); wait_sim(0.5)
    check('走回大门全都上车', ev('() => window.__mower.mode') == 'drive' and ev('() => Object.values(window.__mower.mower.seated).every((m) => m.visible)'))
    tp(0, 12); tp(0, 16.6); page.wait_for_timeout(400)
    page.click('#wAll'); wait_sim(0.4)
    ev('() => { window.__mower.farm.man.x = 0; window.__mower.farm.man.z = 20.5; }')
    page.keyboard.down('KeyS'); wait_sim(1.5); page.keyboard.up('KeyS')
    fam = ev('''() => { const M = window.__mower, w = M.farm.walkers, l = M.farm.man; return { all: Object.values(w).every((x) => x.model.visible), lead: M.farm.party[0], d: Math.hypot(w.granny.x - l.x, w.granny.z - l.z) }; }''')
    check('全家都下：三个人都下车，后两人跟着走', fam['all'] and fam['lead'] == 'driver' and fam['d'] < 4.5, str(fam))
    page.screenshot(path=f'{SHOTS}/v4_family_walk.png')
    check('一介草民是男模型、甜甜和奶奶是女模型', ev("() => { const w = window.__mower.farm.walkers; return w.driver.model.userData.key === 'farmer1' && w.passenger.model.userData.key === 'girl1' && w.granny.model.userData.key === 'woman1'; }"))

    check('全程无报错', not errors, '; '.join(errors[:3]))
    b.close()

n = len(results); ok = sum(results)
print(f'\n{ok}/{n} 通过')
sys.exit(0 if ok == n else 1)
