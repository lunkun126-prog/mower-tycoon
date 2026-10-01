"""查某点附近有哪些网格：py -3.11 tests/whatis.py 关卡 x y z [半径]"""
import os, sys, json
from playwright.sync_api import sync_playwright
URL = os.environ.get('MOWER_URL', 'http://127.0.0.1:8322/index.html')
lvl, x, y, z = int(sys.argv[1]), float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
r = float(sys.argv[5]) if len(sys.argv) > 5 else 0.6
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = b.new_page(viewport={'width': 400, 'height': 300})
    page.goto(URL); page.evaluate('() => localStorage.clear()'); page.reload()
    page.wait_for_function('() => window.__mower && window.__mower.field', timeout=90000)
    if lvl != 1: page.evaluate(f'() => window.__mower.ctx.goLevel({lvl})')
    page.wait_for_timeout(1500)
    out = page.evaluate(f'''() => {{
      const M = window.__mower, V = M.THREE_V, p = new V({x}, {y}, {z}), res = [];
      M.world.scene.traverse((o) => {{
        if (!o.isMesh || o.isInstancedMesh || !o.visible) return;
        o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
        if (bb.distanceToPoint(p) < {r}) {{ const s = bb.getSize(new V()); let path = []; let q = o; while (q && path.length < 5) {{ path.push(q.name || q.type); q = q.parent; }}
          res.push({{ path: path.join('<'), geo: o.geometry.type, color: o.material.color && o.material.color.getHexString(), map: !!o.material.map, size: [s.x, s.y, s.z].map((v) => +v.toFixed(2)), c: bb.getCenter(new V()).toArray().map((v) => +v.toFixed(2)) }}); }}
      }});
      return res;
    }}''')
    for o in out: print(json.dumps(o, ensure_ascii=False))
    b.close()
