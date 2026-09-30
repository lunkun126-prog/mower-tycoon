"""按 id 下载 poly.pizza 模型到 tmp/models/<key>.glb，并记录标题/作者/许可到 tmp/models/manifest.json
用法：py -3.11 scripts/polypizza_fetch.py key=id key=id ..."""
import sys, re, json, os, html, urllib.request

ROOT = os.path.join(os.path.dirname(__file__), '..', 'tmp', 'models'); os.makedirs(ROOT, exist_ok=True)
MAN = os.path.join(ROOT, 'manifest.json')
man = json.load(open(MAN, encoding='utf8')) if os.path.exists(MAN) else {}


def get(url, binary=False):
    import time
    for i in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=60) as r:
                d = r.read()
                return d if binary else d.decode('utf8', 'ignore')
        except Exception as e:
            print('  retry', i, url[-40:], e); time.sleep(2)
    raise RuntimeError('download failed ' + url)


for arg in sys.argv[1:]:
    key, mid = arg.split('=')
    if key in man and os.path.exists(os.path.join(ROOT, key + '.glb')):
        print(f"{key:12} skip (have)"); continue
    h = get(f'https://poly.pizza/m/{mid}')
    glb = re.search(r'https://static\.poly\.pizza/([0-9a-f-]{36})\.glb', h)
    title = re.search(r'property="og:title" content="([^"]*)"', h) or re.search(r'<title>([^<]*)</title>', h, re.S)
    author = re.search(r'/u/([^"/]+)', h)
    lic = 'CC0' if re.search(r'CC0|Public Domain', h) else ('CC-BY' if 'CC-BY' in h or 'Attribution' in h else '?')
    if not glb:
        print('no glb', key, mid); continue
    data = get(f'https://static.poly.pizza/{glb.group(1)}.glb', binary=True)
    open(os.path.join(ROOT, key + '.glb'), 'wb').write(data)
    man[key] = {'id': mid, 'url': f'https://poly.pizza/m/{mid}', 'title': html.unescape(title.group(1)).strip()[:80] if title else '', 'author': author.group(1) if author else '', 'license': lic, 'bytes': len(data)}
    print(f"{key:12} {lic:5} {len(data)/1024:7.0f}KB  {man[key]['title'][:40]:40} by {man[key]['author']}")
json.dump(man, open(MAN, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
