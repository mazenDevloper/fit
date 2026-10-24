import urllib.request, os
os.makedirs('out/hub', exist_ok=True)
out = []
for u in ['https://drivecast.c-p.workers.dev/hub', 'https://mazendevloper.github.io/fit/js/hub.js']:
    try: r = urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'}), timeout=60); b = r.read().decode('utf-8', 'replace'); out.append(f'{u} {r.status} {len(b)} hub-page={"المركز" in b or "hub" in b} {b[:200]!r}')
    except Exception as e: out.append(f'{u} ERR {e}')
open('out/hub/site.txt', 'w').write('\n'.join(out))
