"""在 poly.pizza 搜模型并列出 标题/作者/许可/直链，只挑 CC0 或 CC-BY。
用法：py -3.11 scripts/polypizza_find.py "lawn mower" tractor corn ...
输出 tmp/poly_candidates.json"""
import sys, re, json, os, urllib.request, urllib.parse, html

OUT = os.path.join(os.path.dirname(__file__), '..', 'tmp', 'poly_candidates.json')


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf8', 'ignore')


def model_info(mid):
    h = get(f'https://poly.pizza/m/{mid}')
    glb = re.search(r'https://static\.poly\.pizza/([0-9a-f-]{36})\.glb', h)
    title = re.search(r'<title>([^<]*)</title>', h)
    lic = 'CC0' if re.search(r'CC0|Public Domain', h) else ('CC-BY' if 'CC-BY' in h or 'Attribution' in h else '?')
    author = re.search(r'/u/([^"/]+)', h)
    tris = re.search(r'([\d,]+)\s*(?:triangles|tris|Triangles)', h)
    return {'id': mid, 'title': html.unescape(title.group(1)) if title else '', 'author': author.group(1) if author else '',
            'license': lic, 'glb': f'https://static.poly.pizza/{glb.group(1)}.glb' if glb else '', 'tris': tris.group(1) if tris else ''}


res = {}
for q in sys.argv[1:]:
    try:
        h = get('https://poly.pizza/search/' + urllib.parse.quote(q))
    except Exception as e:
        print('search fail', q, e); continue
    ids = list(dict.fromkeys(re.findall(r'/m/([A-Za-z0-9]{8,12})', h)))[:12]
    res[q] = []
    for mid in ids:
        try:
            info = model_info(mid)
        except Exception as e:
            continue
        if info['glb'] and info['license'] in ('CC0', 'CC-BY'):
            res[q].append(info)
            print(f"[{q}] {info['license']:5} {info['tris']:>7} {info['title'][:40]:40} by {info['author'][:16]:16} {info['id']}")
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(res, open(OUT, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
