"""近景截图（看人物坐姿/车）：py -3.11 tests/closeup.py [前缀] [关卡]  → tests/shots/<前缀>_*.png"""
import os, sys
from playwright.sync_api import sync_playwright
URL = os.environ.get('MOWER_URL', 'http://127.0.0.1:8322/index.html')
SHOTS = os.path.join(os.path.dirname(__file__), 'shots'); os.makedirs(SHOTS, exist_ok=True)
pre = sys.argv[1] if len(sys.argv) > 1 else 'c'
lvl = int(sys.argv[2]) if len(sys.argv) > 2 else 1
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = b.new_page(viewport={'width': 1280, 'height': 720}); page.set_default_timeout(240000)
    errs = []; page.on('pageerror', lambda e: errs.append(str(e))); page.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    page.goto(URL); page.evaluate('() => localStorage.clear()'); page.reload()
    page.wait_for_function('() => window.__mower && window.__mower.field', timeout=60000); page.wait_for_timeout(1500)
    page.evaluate('() => { window.__mower.save.hintDone = true; document.getElementById("hint").hidden = true; }')
    if os.environ.get('TRAILER'): page.evaluate('() => { window.__mower.save.up.trailer = 1; }')
    if lvl != 1: page.evaluate(f'() => window.__mower.ctx.goLevel({lvl})'); page.wait_for_timeout(1500)
    page.evaluate('() => { const c = window.__mower.car; c.x = 0; c.z = 8; c.yaw = 0; c.speed = 0; }'); page.wait_for_timeout(800)
    views = {
        'station': ([14.0, 14.0, 16.5], [24.0, 0.0, 4.5]),
        'loco': ([19.0, 3.0, 11.5], [21.0, 0.6, 7.9]),
        'side':  ([5.5, 2.4, 9.0], [0, 1.2, 8.6]),
        'front': ([1.5, 2.6, 3.2], [0, 1.2, 8.0]),
        'back':  ([-2.5, 3.2, 14.5], [0, 1.2, 9.5]),
        'top':   ([0.1, 9.5, 9.6], [0, 0.8, 9.5]),
        'drv':   ([2.6, 2.4, 7.2], [0, 1.6, 8.0]),
        'drvf':  ([0.6, 2.3, 5.4], [0, 1.6, 8.0]),
        'rear':  ([1.2, 2.2, 12.2], [0, 1.4, 9.6]),
    }
    for k, (cp, ct) in views.items():
        page.evaluate(f'() => window.__mower.setCam({cp}, {ct})'); page.wait_for_timeout(700)
        page.screenshot(path=f'{SHOTS}/{pre}_{k}.png', timeout=180000)
    page.evaluate('() => window.__mower.setCam(null)')
    print('errors:', errs)
    b.close()
