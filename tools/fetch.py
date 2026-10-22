import json, os, subprocess, sys, urllib.request, struct
def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'madar-fetch'}), timeout=120).read()
def pack(base, name, out):
    # glTF + .bin + images -> one .glb (buffers and images moved into the binary chunk)
    j = json.load(open(base + name)); blob = bytearray()
    def add(data):
        while len(blob) % 4: blob.append(0)
        off = len(blob); blob.extend(data); return off
    views = j.get('bufferViews', []); bufs = j.get('buffers', [])
    starts = [add(open(base + b['uri'], 'rb').read()) for b in bufs]
    for v in views: v['byteOffset'] = v.get('byteOffset', 0) + starts[v.get('buffer', 0)]; v['buffer'] = 0
    for im in j.get('images', []):
        if 'uri' in im:
            data = open(base + im['uri'], 'rb').read(); mt = 'image/png' if im['uri'].endswith('png') else 'image/jpeg'
            off = add(data); views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}); im['bufferView'] = len(views) - 1; im['mimeType'] = mt; del im['uri']
    while len(blob) % 4: blob.append(0)
    j['bufferViews'] = views; j['buffers'] = [{'byteLength': len(blob)}]
    js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(blob)
    with open(out, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total)); f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js); f.write(struct.pack('<II', len(blob), 0x004E4942)); f.write(blob)
os.makedirs('out/rooms2', exist_ok=True); os.chdir('out/rooms2')
log = []
# 360° views behind the windows (tonemapped JPG, 4096x2048)
for h in ['shanghai_bund', 'sunset_jhbcentral', 'alps_field', 'reading_room']:
    try:
        d = json.loads(get('https://api.polyhaven.com/files/' + h))
        u = d['tonemapped']['url'] if 'tonemapped' in d else None
        open(h + '.src.jpg', 'wb').write(get(u))
        subprocess.run(['convert', h + '.src.jpg', '-resize', '4096x2048!', '-quality', '84', h + '.jpg'], check=True); os.remove(h + '.src.jpg')
        log.append(h + ' ok ' + str(os.path.getsize(h + '.jpg')))
    except Exception as e: log.append('ERR ' + h + ' ' + repr(e)[:200])
# furniture and props (GLB, textures <= 512 px; 1024 for the hero pieces)
hero = {'ArmChair_01', 'round_wooden_table_01', 'sofa_03'}
for m in ['gamepad', 'gaming_console', 'dartboard', 'rubber_duck_toy', 'ArmChair_01', 'Rockingchair_01', 'round_wooden_table_01', 'vintage_oil_lamp', 'Chandelier_03',
          'decorative_book_set_01', 'chess_set', 'mantel_clock_01', 'wall_clock', 'hanging_picture_frame_03', 'sofa_03', 'coffee_table_round_01', 'side_table_tall_01',
          'modern_ceiling_lamp_01', 'ceramic_vase_04', 'brass_candleholders', 'Lantern_01', 'standing_picture_frame_02', 'brass_vase_01', 'industrial_wall_lamp']:
    try:
        d = json.loads(get('https://api.polyhaven.com/files/' + m)); g = d['gltf']['1k']['gltf']
        base = 'src/' + m + '/'; os.makedirs(base, exist_ok=True)
        open(base + m + '.gltf', 'wb').write(get(g['url']))
        for path, v in g.get('include', {}).items():
            os.makedirs(os.path.dirname(base + path) or base, exist_ok=True); open(base + path, 'wb').write(get(v['url']))
            if path.endswith(('.jpg', '.png')): subprocess.run(['mogrify', '-resize', ('1024x1024>' if m in hero else '512x512>'), base + path])
        pack(base, m + '.gltf', m + '.glb')
        log.append(m + ' ok ' + str(os.path.getsize(m + '.glb')))
    except Exception as e: log.append('ERR ' + m + ' ' + repr(e)[:300])
# floor / wall materials (1k jpg: diffuse, normal, roughness)
for t in ['wood_floor', 'dark_wood', 'laminate_floor_02', 'marble_01', 'grey_plaster', 'large_floor_tiles_02', 'fabric_pattern_07', 'leather_red_02', 'red_brick_03']:
    try:
        d = json.loads(get('https://api.polyhaven.com/files/' + t))
        for key, suf in [('Diffuse', 'diff'), ('nor_gl', 'nor'), ('Rough', 'rough')]:
            k = key if key in d else next((x for x in d if x.lower().startswith(key.lower()[:4])), None)
            if not k: log.append('no ' + key + ' for ' + t + ' keys ' + ','.join(d.keys())); continue
            u = d[k]['1k']['jpg']['url']
            open(t + '_' + suf + '.jpg', 'wb').write(get(u))
        log.append(t + ' ok')
    except Exception as e: log.append('ERR ' + t + ' ' + repr(e)[:300])
subprocess.run(['rm', '-rf', 'src'])
# three.js example textures for the space environment (MIT / NASA)
for f in ['earth_atmos_2048.jpg', 'earth_normal_2048.jpg', 'earth_specular_2048.jpg', 'earth_clouds_1024.png', 'earth_lights_2048.png', 'moon_1024.jpg']:
    try: open('space_' + f, 'wb').write(get('https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/textures/planets/' + f)); log.append(f + ' ok')
    except Exception as e: log.append('ERR ' + f + ' ' + repr(e)[:200])
open('log.txt', 'w').write('\n'.join(log))
