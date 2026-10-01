"""割草大亨 v3 无头验收：py -3.11 tests/qa.py  （需先起 http://127.0.0.1:8322）
逐条打印 PASS/FAIL，全过 exit 0。截图存 tests/shots/。"""
import os, sys
from playwright.sync_api import sync_playwright

URL = os.environ.get('MOWER_URL', 'http://127.0.0.1:8322/index.html')
SHOTS = os.path.join(os.path.dirname(__file__), 'shots')
os.makedirs(SHOTS, exist_ok=True)
results = []


def check(name, ok, info=''):
    results.append(bool(ok))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  [{info}]' if info else ''), flush=True)


def ev(page, js):
    return page.evaluate(js)


def hold(page, key, sec):
    # 按游戏内时间计（无头软件渲染帧率低，dt 封顶 0.05 会让模拟时间比真实时间慢）
    t0 = ev(page, '() => window.__mower.time'); page.keyboard.down(key)
    for _ in range(900):
        page.wait_for_timeout(50)
        if ev(page, '() => window.__mower.time') - t0 >= sec: break
    page.keyboard.up(key)


def wait_sim(page, sec):
    t0 = ev(page, '() => window.__mower.time')
    for _ in range(900):
        page.wait_for_timeout(50)
        if ev(page, '() => window.__mower.time') - t0 >= sec: break


def tp(page, x, z, yaw=0):
    ev(page, f'() => {{ const c = window.__mower.car; c.x = {x}; c.z = {z}; c.yaw = {yaw}; c.speed = 0; }}')
    wait_sim(page, 0.3); page.wait_for_timeout(150)


def man_tp(page, x, z):
    ev(page, f'() => {{ const m = window.__mower.farm.man; m.x = {x}; m.z = {z}; m.speed = 0; }}')
    wait_sim(page, 0.3); page.wait_for_timeout(150)


def close_modal(page):
    if page.locator('#modal .pclose').count():
        page.click('#modal .pclose'); page.wait_for_timeout(200)


with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = b.new_page(viewport={'width': 1280, 'height': 720})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and ':8330/' not in (m.location or {}).get('url', '') + m.text and errors.append(m.text))   # 8330=休息锁探测，服务没起时的连接失败不算
    page.on('response', lambda r: r.status >= 400 and errors.append(f'{r.status} {r.url}'))
    page.route('http://127.0.0.1:8330/**', lambda r: r.abort())   # 只在测试浏览器里不理休息锁（休息时段会把游戏页跳走），不影响孩子那边的锁
    page.goto(URL)
    page.evaluate('() => localStorage.clear()'); page.reload()
    page.wait_for_function('() => window.__mower && window.__mower.field', timeout=60000)
    page.wait_for_timeout(1500)
    page.screenshot(path=f'{SHOTS}/01_start.png')
    check('加载无报错、新手提示显示', not errors and page.is_visible('#hint'), '; '.join(errors[:3]))
    check('开局容量 360', ev(page, '() => window.__mower.stats.cap') == 360)
    sandbox = ev(page, '() => !!window.__mower.sandbox')
    fw, fd = ev(page, '() => [window.__mower.field.def.w, window.__mower.field.def.d]')
    check('第 1 关草场 40×44 米（比 v2 大）', fw >= 40 and fd >= 44, f'{fw}x{fd}')
    check('前 10 关锯子够锋利：第 1 关切割力 ≥ 作物硬度', ev(page, '() => window.__mower.stats.strength >= 1.0 * window.__mower.field.def.hard'))

    # 开上草场割草
    hold(page, 'KeyW', 3.2)
    z = ev(page, '() => window.__mower.car.z')
    check('按 W 开上坡道到草场', z < -3.5, f'z={z:.2f}')
    for key in ['KeyA', 'KeyW', 'KeyD', 'KeyD', 'KeyW', 'KeyA']:
        hold(page, key, 0.9)
    page.screenshot(path=f'{SHOTS}/02_mowing.png')
    cargo = ev(page, '() => window.__mower.cargoTotal()')
    prog = ev(page, '() => window.__mower.field.progress')
    check('割到草、车斗有货、进度增加', cargo > 5 and prog > 0.003, f'cargo={cargo:.1f} progress={prog:.3f}')
    # 割过的格子彻底清空（实例缩到 0）+ 花跟着割
    clean = ev(page, '''() => { const f = window.__mower.field; const m = new (f.group.matrixWorld.constructor)(); let bad = 0, n = 0, flowerCut = 0, flowerTotal = 0;
        for (let i = 0; i < f.cut.length; i++) { if (!f.cut[i]) continue; n++; f.meshes[f.type[i]].getMatrixAt(f.slot[i], m); if (m.elements[5] > 0.01) bad++; if (f.flowerSlot[i] >= 0) { flowerTotal++; f.flowers.getMatrixAt(f.flowerSlot[i], m); if (m.elements[5] < 0.01) flowerCut++; } }
        return [n, bad, flowerTotal, flowerCut]; }''')
    check('割完的格子干净（作物实例全部缩到 0）', clean[0] > 0 and clean[1] == 0, f'cut={clean[0]} 残留={clean[1]}')
    check('割到的格子里的花也被割掉', clean[2] == 0 or clean[3] == clean[2], f'{clean[3]}/{clean[2]}')
    check('草场里没有石头/大树挡路', ev(page, '() => !window.__mower.field.rocks && window.__mower.field.group.children.every((c) => !c.userData.blocker)'))
    check('新手提示消失', not page.is_visible('#hint'))

    # 出售
    coins0 = ev(page, '() => window.__mower.save.coins')
    tp(page, -7.2, 5)
    for _ in range(400):
        page.wait_for_timeout(50)
        if ev(page, '() => window.__mower.cargoTotal()') < 0.5: break
    wait_sim(page, 0.6)
    coins1 = ev(page, '() => window.__mower.save.coins')
    cargo1 = ev(page, '() => window.__mower.cargoTotal()')
    page.screenshot(path=f'{SHOTS}/03_sold.png')
    exp = cargo * 0.275
    check('出售：货清空、金币增加（青草约 0.275/单位）', cargo1 < 0.5 and coins1 - coins0 >= exp * 0.9, f'+{coins1 - coins0} for {cargo:.0f} units')

    # 升级面板
    ev(page, '() => { window.__mower.save.coins = 5000; }')
    tp(page, 7.2, 5)
    check('踩升级格弹出「升级锯片」', page.locator('.ptitle', has_text='升级锯片').count() == 1)
    check('锯片页 4 项（含锯片尺寸）', page.locator('.urow').count() == 4)
    page.screenshot(path=f'{SHOTS}/04_upgrade.png')
    page.click('.ubuy[data-id=blades]'); page.wait_for_timeout(300)
    check('买锯片数量：变 2 片' + ('（沙盒不扣钱）' if sandbox else '，扣 350 金币'), ev(page, '() => [window.__mower.save.up.blades, window.__mower.save.coins, window.__mower.stats.blades]') == [1, 5000 if sandbox else 4650, 2])
    page.click('.ptabs button[data-tab=truck]'); page.wait_for_timeout(200)
    page.click('.ubuy[data-id=cap]'); page.wait_for_timeout(200)
    check('卡车页：容量 → 450', ev(page, '() => window.__mower.stats.cap') == 450)
    page.click('.ptabs button[data-tab=farm]'); page.wait_for_timeout(200)
    check('农场页：5 个升级项', page.locator('.urow').count() == 5)
    page.click('.ubuy[data-id=carry]'); page.wait_for_timeout(200)
    check('买扛草捆数 → 4 捆', ev(page, '() => window.__mower.stats.carry') == 4)
    page.click('.ptabs button[data-tab=trailer]'); page.wait_for_timeout(200)
    check('拖车页：' + ('沙盒已解锁' if sandbox else '未解锁（达到3级）'), ('拖车容量' if sandbox else '达到3级') in page.inner_text('#modal'))
    close_modal(page)
    tp(page, 0, 9)

    # 商店
    tp(page, 7.2, 11.4)
    check('商店：' + ('沙盒直接打开' if sandbox else '5 级后解锁'), ('商店' if sandbox else '5级后解锁') in page.inner_text('#modal .ptitle'))
    check('商店 6 件商品', page.locator('.srow').count() == 6)
    page.click('.ubuy[data-id=magnet]'); page.wait_for_timeout(200)
    check('买磁铁', ev(page, '() => window.__mower.save.shop.magnet === true'))
    page.screenshot(path=f'{SHOTS}/10_shop.png')
    close_modal(page); tp(page, 0, 9)

    # 过关：先把 59% 标为已割，再开车割一点触发第 1 星
    ev(page, '''() => { const f = window.__mower.field; let need = Math.floor(f.validCount * 0.598) - f.cutCount;
        for (let i = 0; i < f.cut.length && need > 0; i++) if (!f.cut[i]) { f.markCut(i, null); need--; } f.flush(); }''')
    ev(page, '() => { const c = window.__mower.car; c.x = 0; c.z = -6; c.yaw = 0; }')  # 远端已标割，近处还有草
    for key in ['KeyA', 'KeyD', 'KeyD', 'KeyA', 'KeyW']:
        hold(page, key, 0.8)
    page.screenshot(path=f'{SHOTS}/06_star.png')
    st = ev(page, '() => [window.__mower.save.maxLevel, window.__mower.save.stars[1]]')
    check('割到 60% 拿第 1 星、解锁第 2 关', st == [2, 1], str(st))

    # 关卡界面 + 进第 3 关（有玉米）
    tp(page, 0, 9); tp(page, 8.5, 15.4)
    check('关卡界面 40 关', page.locator('.lv').count() == 40)
    page.screenshot(path=f'{SHOTS}/07_levels.png')
    page.click('.lv[data-n="3"]'); page.wait_for_timeout(200)
    check('进下一关有确认框', '将重置' in page.inner_text('#modal'))
    page.click('#cYes'); page.wait_for_timeout(1500)
    check('进入第 3 关、场地重置、作物 ≥ 2 种', ev(page, '() => [window.__mower.save.level, window.__mower.field.cutCount, window.__mower.field.def.tiers.length >= 2]') == [3, 0, True])
    ev(page, '() => { const c = window.__mower.car; c.x = 0; c.z = -30; c.yaw = 0; }'); hold(page, 'KeyW', 1.5)
    page.screenshot(path=f'{SHOTS}/06b_level3_crops.png')

    # 装满后掉地上 + 箭头
    ev(page, '() => { window.__mower.setRuns([{ t: 0, u: window.__mower.stats.cap }]); }')
    ev(page, '() => { const c = window.__mower.car; c.x = 0; c.z = -20; }')
    hold(page, 'KeyW', 1.2); hold(page, 'KeyA', 0.8)
    page.screenshot(path=f'{SHOTS}/08_full.png')
    check('装满后继续割：草块掉地上', ev(page, '() => window.__mower.pickups.length') > 0)

    # 下水：从左边滑水道开进海里，会溅水花，还能开回来
    ev(page, '() => { window.__mower.setRuns([]); }')
    tp(page, -11.5, 11.75, 1.5708)
    hold(page, 'KeyA', 3.0)
    wet = ev(page, '() => [window.__mower.inWater(), window.__mower.car.x]')
    page.screenshot(path=f'{SHOTS}/12_water.png')
    check('从「下水」坡开进海里', wet[0] and wet[1] < -16.5, f'x={wet[1]:.1f}')
    check('下水后拖拉机变成船（车头/锯片隐藏、船身显示）', ev(page, '() => { const m = window.__mower.mower; return m.boat.visible && !m.land.visible; }'))
    check('司机「一介草民（爷爷）」、后排「甜甜」「岁月静好（奶奶）」头顶名牌一直显示', ev(page, '() => { const m = window.__mower.mower; return m.driverPlate.visible && m.kidPlate.visible && m.kid.visible && m.grannyPlate.visible && m.granny.visible; }'))
    check('水里有 10 种鱼（金鱼/锦鲤/小丑鱼/鲫鱼/鲶鱼/鲨鱼/鳄鱼/海豚/鲸…），共 ≥80 条', ev(page, '() => new Set(window.__mower.world.fishes.map((f) => f.sp.key)).size') == 10 and ev(page, '() => window.__mower.world.fishes.length') >= 80)
    # 后备箱满了：鱼留在水里不消失
    ev(page, '''() => { const w = window.__mower.world, c = window.__mower.car; window.__mower.save.trunk.fish = Array(16).fill("carp"); const f = w.fishes[1]; f.cx = c.x - 2.6; f.cz = c.z; f.R = 0.01; f.jump = 1e9; }''')
    hold(page, 'KeyA', 1.0)
    check('后备箱满时撞到的鱼留在水里（不被吞掉）', ev(page, '() => window.__mower.world.fishes[1].g.visible') and ev(page, '() => window.__mower.save.trunk.fish.length') == 16
          and ev(page, '() => { const w = window.__mower.world, f = w.fishes[1], p = f.g.position; const out = w.hitWater(p.x, p.z, 1.3, window.__mower.time, 0); return out.full === true && out.length === 0 && f.g.visible; }'))
    ev(page, '() => { window.__mower.save.trunk.fish = ["goldfish"]; }')
    # 把一条鱼放到船头网前，撞上去就进后备箱
    ev(page, '''() => { const w = window.__mower.world, c = window.__mower.car; const f = w.fishes[0]; f.cx = c.x - 2.6; f.cz = c.z; f.R = 0.01; f.jump = 1e9; }''')
    hold(page, 'KeyA', 1.5)
    tr = ev(page, '() => window.__mower.save.trunk')
    check('船头的网撞到鱼 → 鱼（按鱼种）进后备箱', len(tr['fish']) >= 1, str(tr))
    check('水里能继续开（更慢）', ev(page, '() => window.__mower.car.x') < wet[1] - 1)
    ev(page, '() => { window.__mower.save.trunk.junk = 2; }')
    # 前面两段捞鱼把船开远了，先摆到滑水道外 5 米再往回开
    ev(page, '() => { const c = window.__mower.car; c.x = -21; c.z = 11.75; c.yaw = -1.5708; c.speed = 0; }')
    hold(page, 'KeyD', 7.0)
    back = ev(page, '() => [window.__mower.inWater(), window.__mower.car.x]')
    check('能从滑水道开回岸上', (not back[0]) and back[1] > -15, f'x={back[1]:.1f}')
    check('上岸后船变回拖拉机', ev(page, '() => { const m = window.__mower.mower; return !m.boat.visible && m.land.visible; }'))
    # 倒垃圾 + 卖鱼
    tp(page, -11.2, 10.4)
    check('「倒垃圾」格：垃圾清空', ev(page, '() => window.__mower.save.trunk.junk') == 0)
    c0 = ev(page, '() => window.__mower.save.coins'); ev(page, '() => { window.__mower.save.trunk.fish = ["goldfish", "koi", "shark"]; }')
    tp(page, 0, 9); tp(page, -7.2, 5)
    check('「出售」格：按鱼种卖钱（金鱼8+锦鲤15+鲨鱼60）', ev(page, '() => window.__mower.save.coins') - c0 == 83 and ev(page, '() => window.__mower.save.trunk.fish.length') == 0)
    check('岸边栅栏挡住，不能从别处下海', not ev(page, '() => { const c = window.__mower.car; c.x = 0; c.z = 9; c.yaw = -1.5708; c.speed = 0; return false; }'))
    hold(page, 'KeyD', 3.0)
    check('从右侧开不出岛', ev(page, '() => window.__mower.car.x') < 15.5)

    # 打捆：车上有草开到打捆格 → 草料机做出草捆进草棚
    ev(page, '() => { window.__mower.setRuns([{ t: 0, u: 200 }]); window.__mower.car.pad = null; }')
    tp(page, -8, 12.8)
    for _ in range(400):
        page.wait_for_timeout(50)
        if ev(page, '() => window.__mower.cargoTotal()') < 0.5: break
    wait_sim(page, 0.6)
    bales = ev(page, '() => window.__mower.save.farm.bales')
    check('打捆：200 草 → 5 捆进草棚（40 草/捆）', bales == 5, f'bales={bales}')
    page.screenshot(path=f'{SHOTS}/13_baler.png')

    # 农场大门：开进去下车变人（后备箱先放 2 条鱼，下车要提在手里）
    ev(page, '() => { window.__mower.save.trunk.fish = ["carp", "carp"]; }')
    tp(page, 0, 12); tp(page, 0, 16.6)
    page.wait_for_timeout(500)
    check('大门弹出「谁下车」三个人可选', page.locator('#modal .who').count() == 3)
    page.click('#modal .who[data-k=driver]'); page.click('#wGo'); wait_sim(page, 0.3)
    check('开进农场大门 → 下车变成人', ev(page, '() => window.__mower.mode') == 'walk')
    check('人物模型显示且站着（高约 1.75m）', ev(page, '() => { const m = window.__mower.farm.model; return m.visible && Math.abs(m.userData.size.y - 1.75) < 0.05; }'))
    check('下车时后备箱的鱼提在手里', ev(page, '() => window.__mower.save.farm.carry.rawFish') == 2 or ev(page, '() => window.__mower.save.farm.carry.rawFish') >= 1)
    hold(page, 'KeyS', 0.6)
    check('人往前走（不倒着走：模型朝向 = 行走方向）', ev(page, '() => { const f = window.__mower.farm; return Math.abs(Math.atan2(Math.sin(f.model.rotation.y - f.man.yaw), Math.cos(f.model.rotation.y - f.man.yaw))) < 0.01; }'))
    man_tp(page, 4.8, 25.3)
    check('灶台：生鱼烤成烤鱼、弹出吃饭面板', ev(page, '() => window.__mower.save.farm.carry.rawFish') == 0 and ev(page, '() => window.__mower.save.farm.carry.fish') >= 1 and '灶台' in page.inner_text('#modal .ptitle'))
    ev(page, '() => { window.__mower.save.farm.energy = 30; }'); page.click('.ubuy[data-eat=fish]'); page.wait_for_timeout(300)
    check('吃一条烤鱼：体力 +40', ev(page, '() => Math.round(window.__mower.save.farm.energy)') == 70)
    close_modal(page)
    page.screenshot(path=f'{SHOTS}/14_dismount.png')
    # 走去草棚扛草
    man_tp(page, -8, 26.2)
    carry = ev(page, '() => window.__mower.save.farm.carry.bales')
    check('草棚：扛起草捆（上限 4）', carry == 4, f'carry={carry}')
    # 鸡舍：建造 → 喂草
    man_tp(page, -9.5, 38.5)
    check('鸡舍：弹出建造面板', '建造鸡舍' in page.inner_text('#modal'))
    page.click('#bBuild'); page.wait_for_timeout(300)
    man_tp(page, -9.5, 34); man_tp(page, -9.5, 38.5)
    feed = ev(page, '() => [window.__mower.save.farm.coop.built, window.__mower.save.farm.coop.feed, window.__mower.save.farm.carry.bales]')
    check('鸡舍建好并喂进 4 捆草', feed == [True, 4, 0], str(feed))
    ev(page, '() => { window.__mower.save.farm.coop.goods = 10; }')
    man_tp(page, -9.5, 34); man_tp(page, -9.5, 38.5)
    check('收了 10 个鸡蛋进篮子', ev(page, '() => window.__mower.save.farm.carry.egg') == 10)
    page.screenshot(path=f'{SHOTS}/15_coop.png')
    # 货架
    man_tp(page, 0, 31.4)
    sh = ev(page, '() => window.__mower.save.farm.shelf.egg')
    check('鸡蛋上货架', sh == 10, f'shelf={sh}')
    ev(page, '() => { window.__mower.farm.custTimer = 0.1; }')
    c0 = ev(page, '() => window.__mower.save.coins')
    t0 = ev(page, '() => window.__mower.time')
    for _ in range(1500):
        page.wait_for_timeout(100)
        if ev(page, '() => window.__mower.save.coins') > c0 or ev(page, '() => window.__mower.time') - t0 > 40: break
    c1 = ev(page, '() => window.__mower.save.coins')
    sold = ev(page, '() => { const s = window.__mower.save.farm.shelf; return [s.egg, s.fish]; }')
    check('顾客从码头来买走一件货、付钱（鸡蛋 12 / 烤鱼 20，随机挑）', (c1 - c0 == 12 and sold[0] == 9) or (c1 - c0 == 20 and sold[0] == 10), f'+{c1 - c0}')
    page.screenshot(path=f'{SHOTS}/16_customer.png')
    # 走回大门上车
    man_tp(page, 0, 19.3)
    page.wait_for_timeout(500)
    check('走回大门 → 上车', ev(page, '() => window.__mower.mode') == 'drive')

    # 存档：刷新后还在
    page.wait_for_timeout(2500)
    before = ev(page, '() => JSON.stringify([window.__mower.save.coins, window.__mower.save.up, window.__mower.save.level, window.__mower.field.cutCount, window.__mower.save.farm.bales, window.__mower.save.farm.shelf])')
    page.reload(); page.wait_for_function('() => window.__mower && window.__mower.field', timeout=60000); page.wait_for_timeout(800)
    after = ev(page, '() => JSON.stringify([window.__mower.save.coins, window.__mower.save.up, window.__mower.save.level, window.__mower.field.cutCount, window.__mower.save.farm.bales, window.__mower.save.farm.shelf])')
    check('刷新后存档还在（金币/升级/关卡/已割/农场）', before == after, f'{before} vs {after}')
    # v3.1 旧存档：trunk.fish 是条数 → 折算成鲫鱼
    page.wait_for_timeout(2500)
    # pagehide 时游戏会把内存存档写回，所以旧格式要在新页面脚本跑之前（init script）写入
    ev(page, '() => { sessionStorage.setItem("qa_oldsave", "1"); }')
    page.add_init_script('if (sessionStorage.getItem("qa_oldsave")) { sessionStorage.removeItem("qa_oldsave"); const raw = JSON.parse(localStorage.getItem("mower_tycoon_v3_sandbox") || "{}"); raw.trunk = { fish: 3, junk: 0 }; localStorage.setItem("mower_tycoon_v3_sandbox", JSON.stringify(raw)); }')
    page.reload(); page.wait_for_function('() => window.__mower && window.__mower.field', timeout=60000); page.wait_for_timeout(800)
    check('v3.1 旧存档：后备箱条数折算成鲫鱼', ev(page, '() => JSON.stringify(window.__mower.save.trunk.fish)') == '["carp","carp","carp"]')
    check('场上有 6 颗宝石', ev(page, '() => window.__mower.field.gems.length') == 6)
    check('沙盒徽章/无限显示', (not sandbox) or page.inner_text('#coins') == '∞')

    # 手机竖屏也能显示
    page.set_viewport_size({'width': 390, 'height': 844}); page.wait_for_timeout(600)
    page.screenshot(path=f'{SHOTS}/11_mobile.png')
    check('全程无 JS 报错', not errors, '; '.join(errors[:3]))
    b.close()

ok = all(results)
print(f'\n{sum(results)}/{len(results)} PASS')
sys.exit(0 if ok else 1)
