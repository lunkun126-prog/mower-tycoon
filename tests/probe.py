"""探针：进某关后看帧率/报错/小火车状态：py -3.11 tests/probe.py [关卡]"""
import os, sys, time
from playwright.sync_api import sync_playwright
URL = os.environ.get('MOWER_URL', 'http://127.0.0.1:8322/index.html')
lvl = int(sys.argv[1]) if len(sys.argv) > 1 else 11
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = b.new_page(viewport={'width': 960, 'height': 540})
    errs = []; page.on('pageerror', lambda e: errs.append(str(e))); page.on('console', lambda m: m.type in ('error', 'warning') and errs.append(m.text))
    page.goto(URL); page.evaluate('() => localStorage.clear()'); page.reload()
    page.wait_for_function('() => window.__mower && window.__mower.field', timeout=60000)
    def fps(tag):
        t0 = page.evaluate('() => window.__mower.time'); w0 = time.time(); page.wait_for_timeout(4000)
        t1 = page.evaluate('() => window.__mower.time'); print(tag, 'game-sec per wall-sec =', round((t1 - t0) / (time.time() - w0), 3))
    fps('level1')
    w = time.time(); page.evaluate(f'() => window.__mower.ctx.goLevel({lvl})'); print('goLevel took', round(time.time() - w, 1), 's')
    fps(f'level{lvl}')
    print(page.evaluate('() => { const t = window.__mower.train; return { active: t.active, pad: !!window.__mower.world.pads.train, hard: window.__mower.field.def.hard, drag: window.__mower.field.def.drag }; }'))
    print('errors:', errs[:10])
    b.close()
