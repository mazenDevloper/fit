import json, os, subprocess, sys, urllib.request
def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'madar-fetch'})).read()
os.makedirs('out/rooms', exist_ok=True); os.chdir('out/rooms')
log = []
for h in ['fireplace', 'lythwood_lounge']:
    try:
        d = json.loads(get('https://api.polyhaven.com/files/' + h))
        u = d['tonemapped']['url'] if 'tonemapped' in d else None
        log.append(h + ' keys ' + ','.join(d.keys()) + ' url ' + str(u))
        open(h + '.src.jpg', 'wb').write(get(u))
        subprocess.run(['convert', h + '.src.jpg', '-resize', '4096x2048!', '-quality', '84', h + '.jpg'], check=True); os.remove(h + '.src.jpg')
    except Exception as e: log.append('ERR ' + h + ' ' + repr(e))
for m in ['modern_coffee_table_01', 'tea_set_01', 'potted_plant_02', 'mid_century_lounge_chair', 'WoodenTable_02', 'desk_lamp_arm_01', 'classic_laptop', 'potted_plant_01', 'modern_arm_chair_01', 'book_encyclopedia_set_01']:
    try:
        d = json.loads(get('https://api.polyhaven.com/files/' + m)); g = d['gltf']['1k']['gltf']
        base = 'src/' + m + '/'; os.makedirs(base, exist_ok=True)
        open(base + m + '.gltf', 'wb').write(get(g['url']))
        for path, v in g.get('include', {}).items():
            os.makedirs(os.path.dirname(base + path) or base, exist_ok=True); open(base + path, 'wb').write(get(v['url']))
            if path.endswith(('.jpg', '.png')): subprocess.run(['mogrify', '-resize', '512x512>', base + path])
        subprocess.run(['npx', '-y', 'gltf-pipeline@4.1.0', '-i', base + m + '.gltf', '-o', m + '.glb'], check=True, capture_output=True)
        log.append(m + ' ok ' + str(os.path.getsize(m + '.glb')))
    except Exception as e: log.append('ERR ' + m + ' ' + repr(e)[:300])
subprocess.run(['rm', '-rf', 'src'])
open('log.txt', 'w').write('\n'.join(log))
