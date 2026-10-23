import urllib.request, json, os, ssl, time
os.makedirs('out/anat', exist_ok=True)
UA = {'User-Agent': 'MadarBot/1.0 (https://github.com/mazenDevloper/fit; anatomy assets)'}
log = []
def get(url, dest=None, maxb=None):
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120)
        data = r.read() if not maxb else r.read(maxb)
        if dest: open(dest, 'wb').write(data)
        log.append(f'{url} {r.status} {len(data)} {r.headers.get("content-type")}')
        return data
    except Exception as e:
        log.append(f'{url} ERR {e}'); return None
# Wikimedia: the original detailed muscular system drawings (LadyofHats, public domain)
for t in ['Muscular_system.svg', 'Muscular_system-back.svg', 'Muscles_anterior_labeled.png', 'Muscles_posterior_labeled.png', 'Muscle_front_and_back.svg']:
    d = get('https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|size|extmetadata&titles=File:' + t)
    if d:
        try:
            pages = json.loads(d)['query']['pages']
            for p in pages.values():
                ii = p.get('imageinfo', [{}])[0]
                lic = ii.get('extmetadata', {}).get('LicenseShortName', {}).get('value')
                log.append(f'  {t}: {ii.get("url")} {ii.get("size")} {lic}')
                if ii.get('url'): get(ii['url'], 'out/anat/' + t)
        except Exception as e: log.append('  parse ' + str(e))
# BodyParts3D (CC BY-SA 2.1 JP): the parts list and the archive sizes
for u in ['https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/', 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html']:
    d = get(u)
    if d: open('out/anat/' + u.strip('/').split('/')[-1] + '.html', 'wb').write(d)
open('out/anat/log.txt', 'w').write('\n'.join(log))
