"""割草大亨 无头验收：py -3.11 tests/qa.py  （需先起 http://127.0.0.1:8322）
逐条打印 PASS/FAIL，全过 exit 0。截图存 tests/shots/。"""
import os, sys, time
from playwright.sync_api import sync_playwright

URL = os.environ.get('MOWER_URL', 'http://127.0.0.1:8322/index.html')
SHOTS = os.path.join(os.path.dirname(__file__), 'shots')
os.makedirs(SHOTS, exist_ok=True)
results = []


def check(name, ok, info=''):
    results.append(ok)
    print(('PASS ' if ok else 'FAIL ') + name + (f'  [{info}]' if info else ''), flush=True)


def ev(page, js):
    return page.evaluate(js)


def hold(page, key, sec):
    page.keyboard.down(key); page.wait_for_timeout(int(sec * 1000)); page.keyboard.up(key)


def tp(page, x, z):
    ev(page, f'() => {{ const c = window.__mower.car; c.x = {x}; c.z = {z}; c.speed = 0; }}')
    page.wait_for_timeout(400)


def close_modal(page):
    if page.locator('#modal .pclose').count():
        page.click('#modal .pclose'); page.wait_for_timeout(200)


with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = b.new_page(viewport={'width': 1280, 'height': 720})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    page.goto(URL)
    page.evaluate('() => localStorage.clear()'); page.reload()
    page.wait_for_function('() => window.__mower && window.__mower.field', timeout=30000)
    page.wait_for_timeout(1500)
    page.screenshot(path=f'{SHOTS}/01_start.png')
    check('加载无报错、新手提示显示', not errors and page.is_visible('#hint'), '; '.join(errors[:3]))
    check('开局容量 360', ev(page, '() => window.__mower.stats.cap') == 360)

    # 开上草场割草
    hold(page, 'KeyW', 3.2)
    z = ev(page, '() => window.__mower.car.z')
    check('按 W 开上坡道到草场', z < -3.5, f'z={z:.2f}')
    for key in ['KeyA', 'KeyW', 'KeyD', 'KeyD', 'KeyW', 'KeyA']:
        hold(page, key, 0.9)
    page.screenshot(path=f'{SHOTS}/02_mowing.png')
    cargo = ev(page, '() => window.__mower.cargoTotal()')
    prog = ev(page, '() => window.__mower.field.progress')
    check('割到草、车斗有货、进度增加', cargo > 5 and prog > 0.005, f'cargo={cargo:.1f} progress={prog:.3f}')
    check('新手提示消失', not page.is_visible('#hint'))

    # 出售
    coins0 = ev(page, '() => window.__mower.save.coins')
    tp(page, -7.2, 5); page.wait_for_timeout(2000)
    coins1 = ev(page, '() => window.__mower.save.coins')
    cargo1 = ev(page, '() => window.__mower.cargoTotal()')
    page.screenshot(path=f'{SHOTS}/03_sold.png')
    exp = cargo * 0.275
    check('出售：货清空、金币增加（青草约 0.275/单位）', cargo1 < 0.5 and coins1 - coins0 >= exp * 0.9, f'+{coins1 - coins0} for {cargo:.0f} units')

    # 升级面板
    ev(page, '() => { window.__mower.save.coins = 5000; }')
    tp(page, 7.2, 5)
    check('踩升级格弹出「升级锯片」', page.locator('.ptitle', has_text='升级锯片').count() == 1)
    page.screenshot(path=f'{SHOTS}/04_upgrade.png')
    page.click('.ubuy[data-id=blades]'); page.wait_for_timeout(300)
    check('买锯片数量：350 金币，变 2 片', ev(page, '() => [window.__mower.save.up.blades, window.__mower.save.coins, window.__mower.stats.blades]') == [1, 4650, 2])
    check('锯片数量下一级 875', '875' in page.inner_text('.ubuy[data-id=blades]'))
    page.click('.ptabs button[data-tab=truck]'); page.wait_for_timeout(200)
    page.click('.ubuy[data-id=cap]'); page.wait_for_timeout(200)
    check('卡车页：容量 400 金币 → 450', ev(page, '() => window.__mower.stats.cap') == 450)
    page.click('.ptabs button[data-tab=trailer]'); page.wait_for_timeout(200)
    check('拖车页：未解锁（达到3级）', '达到3级' in page.inner_text('#modal'))
    page.screenshot(path=f'{SHOTS}/05_trailer_locked.png')
    close_modal(page)
    tp(page, 0, 9)

    # 商店未解锁
    tp(page, 7.2, 11.4)
    check('商店 5 级后解锁', '5级后解锁' in page.inner_text('#modal'))
    close_modal(page); tp(page, 0, 9)

    # 过关：先把 59% 标为已割，再开车割一点触发第 1 星
    ev(page, '''() => { const f = window.__mower.field; let need = Math.floor(f.validCount * 0.598) - f.cutCount;
        for (let i = 0; i < f.cut.length && need > 0; i++) if (!f.cut[i] && f.valid[i]) { f.markCut(i, null); need--; } f.flush(); }''')
    ev(page, '() => { const c = window.__mower.car; c.x = 0; c.z = -6; }')  # 远端已标割，近处还有草
    for key in ['KeyA', 'KeyD', 'KeyD', 'KeyA', 'KeyW']:
        hold(page, key, 0.8)
    page.screenshot(path=f'{SHOTS}/06_star.png')
    st = ev(page, '() => [window.__mower.save.maxLevel, window.__mower.save.stars[1]]')
    check('割到 60% 拿第 1 星、解锁第 2 关', st == [2, 1], str(st))

    # 关卡界面 + 进第 2 关
    tp(page, 0, 9); tp(page, 8.5, 15.4)
    check('关卡界面 40 关', page.locator('.lv').count() == 40)
    page.screenshot(path=f'{SHOTS}/07_levels.png')
    page.click('.lv[data-n="2"]'); page.wait_for_timeout(200)
    check('进下一关有确认框', '将重置' in page.inner_text('#modal'))
    page.click('#cYes'); page.wait_for_timeout(800)
    check('进入第 2 关、场地重置', ev(page, '() => [window.__mower.save.level, window.__mower.field.cutCount]') == [2, 0])

    # 装满后掉地上 + 箭头
    ev(page, '() => { const s = window.__mower.save; s.runs = [{ t: 0, u: window.__mower.stats.cap }]; }')
    ev(page, '() => { const c = window.__mower.car; c.x = 0; c.z = -20; }')
    hold(page, 'KeyW', 1.2); hold(page, 'KeyA', 0.8)
    page.screenshot(path=f'{SHOTS}/08_full.png')
    check('装满后继续割：草块掉地上', ev(page, '() => window.__mower.pickups.length') > 0)

    # 存档：刷新后还在
    page.wait_for_timeout(2500)
    before = ev(page, '() => JSON.stringify([window.__mower.save.coins, window.__mower.save.up, window.__mower.save.level, window.__mower.field.cutCount])')
    page.reload(); page.wait_for_function('() => window.__mower && window.__mower.field', timeout=30000); page.wait_for_timeout(800)
    after = ev(page, '() => JSON.stringify([window.__mower.save.coins, window.__mower.save.up, window.__mower.save.level, window.__mower.field.cutCount])')
    check('刷新后存档还在（金币/升级/关卡/已割）', before == after, f'{before} vs {after}')

    # 农场：5 级解锁 → 建鸡舍 → 喂青草 → 产蛋 → 市场卖
    ev(page, '() => { const s = window.__mower.save; s.maxLevel = 5; s.coins = 20000; s.runs = [{ t: 0, u: 200 }]; }')
    tp(page, -8.2, 24.9)
    check('鸡舍：弹出建造面板', '建造鸡舍' in page.inner_text('#modal'))
    page.click('#bBuild'); page.wait_for_timeout(300)
    tp(page, -8.2, 20.5); tp(page, -8.2, 24.9)
    hay = ev(page, '() => window.__mower.save.farm.coop.hay')
    check('鸡舍建好并喂进青草', ev(page, '() => window.__mower.save.farm.coop.built') and hay > 100, f'hay={hay}')
    ev(page, '() => { window.__mower.save.farm.coop.goods = 10; }')
    tp(page, -8.2, 20.5); tp(page, -8.2, 24.9); tp(page, 0, 22)
    c0 = ev(page, '() => window.__mower.save.coins')
    tp(page, 0, 26.4)
    c1 = ev(page, '() => window.__mower.save.coins')
    check('市场卖鸡蛋 12 金币/个', c1 - c0 == 120, f'+{c1 - c0}')
    page.screenshot(path=f'{SHOTS}/09_farm.png')

    # 商店（5 级已解锁）
    tp(page, 0, 9); tp(page, 7.2, 11.4)
    check('商店打开，列出 6 件商品', page.locator('.srow').count() == 6)
    ev(page, '() => { window.__mower.save.gems = 100; }')
    page.click('.ubuy[data-id=magnet]'); page.wait_for_timeout(200)
    check('用钻石买磁铁', ev(page, '() => window.__mower.save.shop.magnet === true && window.__mower.save.gems === 85'))
    page.screenshot(path=f'{SHOTS}/10_shop.png')
    close_modal(page)

    # 手机竖屏也能显示
    page.set_viewport_size({'width': 390, 'height': 844}); page.wait_for_timeout(600)
    page.screenshot(path=f'{SHOTS}/11_mobile.png')
    check('全程无 JS 报错', not errors, '; '.join(errors[:3]))
    b.close()

ok = all(results)
print(f'\n{sum(results)}/{len(results)} PASS')
sys.exit(0 if ok else 1)
