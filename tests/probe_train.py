"""小火车探针：装满后每隔几秒打印火车位置/状态"""
import os
from playwright.sync_api import sync_playwright
URL = os.environ.get('MOWER_URL', 'http://127.0.0.1:8322/index.html')
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = b.new_page(viewport={'width': 640, 'height': 360}); ev = page.evaluate
    page.goto(URL); ev('() => localStorage.clear()'); page.reload()
    page.wait_for_function('() => window.__mower && window.__mower.field', timeout=90000)
    ev('() => window.__mower.ctx.goLevel(11)'); page.wait_for_timeout(1000)
    ev('() => { const M = window.__mower, c = M.car; c.x = M.field.x0 + 4; c.z = M.field.z0 + 20; c.speed = 0; }')
    ev('() => window.__mower.setRuns([{ t: 0, u: 2000 }])')
    for i in range(30):
        page.wait_for_timeout(3000)
        print(ev('() => { const M = window.__mower, t = M.train; return [M.time.toFixed(1), t.state, t.s.toFixed(1), t.P.toFixed(1), t.speed.toFixed(2), Math.round(t.units), M.save.coins]; }'), flush=True)
    b.close()
