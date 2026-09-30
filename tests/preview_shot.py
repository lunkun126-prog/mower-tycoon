import os, sys
from playwright.sync_api import sync_playwright
files = sys.argv[1].split(',')
out = sys.argv[2]
url = 'http://127.0.0.1:8322/preview.html?cols=6&f=' + ','.join('models/' + f + '.glb' for f in files)
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = b.new_page(viewport={'width': 1600, 'height': 1000})
    errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto(url); page.wait_for_function(f'() => window.__ready >= {len(files)}', timeout=60000); page.wait_for_timeout(800)
    page.screenshot(path=out)
    import json; items = page.evaluate('() => window.__items'); json.dump(items, open(out + '.json', 'w'), indent=1)
    for it in items: print(it['f'].split('/')[-1], it['size'], len(it['anims']), 'anims')
    print('errors', errs)
    b.close()
