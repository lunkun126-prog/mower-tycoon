"""看坐姿（隐藏拖拉机车身）：py -3.11 tests/pose.py [前缀] → tests/shots/<前缀>_pose_*.png"""
import os, sys
from playwright.sync_api import sync_playwright
URL = os.environ.get('MOWER_URL', 'http://127.0.0.1:8322/index.html')
SHOTS = os.path.join(os.path.dirname(__file__), 'shots'); os.makedirs(SHOTS, exist_ok=True)
pre = sys.argv[1] if len(sys.argv) > 1 else 'p'
hide = (sys.argv[2] if len(sys.argv) > 2 else '1') == '1'
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = b.new_page(viewport={'width': 1280, 'height': 720})
    errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto(URL); page.evaluate('() => localStorage.clear()'); page.reload()
    page.wait_for_function('() => window.__mower && window.__mower.field', timeout=60000); page.wait_for_timeout(1200)
    page.evaluate('() => { window.__mower.save.hintDone = true; document.getElementById("hint").hidden = true; const c = window.__mower.car; c.x = 0; c.z = 8; c.yaw = 0; c.speed = 0; }')
    if hide: page.evaluate('() => { const m = window.__mower.mower; if (m.tractor) m.tractor.visible = false; for (const k in m.plates) m.plates[k].visible = false; }')
    page.wait_for_timeout(600)
    for k, (cp, ct) in {'side': ([3.2, 1.7, 8.6], [0, 1.4, 8.6]), 'front': ([0.4, 1.9, 5.6], [0, 1.4, 8.4]), 'q': ([2.4, 2.4, 6.4], [0, 1.3, 8.5])}.items():
        page.evaluate(f'() => window.__mower.setCam({cp}, {ct})'); page.wait_for_timeout(600)
        page.screenshot(path=f'{SHOTS}/{pre}_pose_{k}.png')
    print('errors:', errs)
    b.close()
