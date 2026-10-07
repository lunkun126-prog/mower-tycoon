"""车色探针：各关截一张车 → tests/shots/color_L*.png"""
import os
from playwright.sync_api import sync_playwright
URL = os.environ.get('MOWER_URL', 'http://127.0.0.1:8322/index.html')
SHOTS = os.path.join(os.path.dirname(__file__), 'shots')
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = b.new_page(viewport={'width': 960, 'height': 540})
    errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto(URL); page.evaluate('() => localStorage.clear()'); page.reload()
    page.wait_for_function('() => window.__mower && window.__mower.field', timeout=60000); page.wait_for_timeout(1500)
    page.evaluate('() => { window.__mower.save.hintDone = true; document.getElementById("hint").hidden = true; }')
    for n in [1, 2, 3, 5, 12]:
        page.evaluate(f'() => window.__mower.ctx.goLevel({n})'); page.wait_for_timeout(1500)
        print(n, page.evaluate('() => window.__mower.mower.carColor.value.getHexString()'))
        page.screenshot(path=f'{SHOTS}/color_L{n}.png')
    print('errors:', errs); b.close()
