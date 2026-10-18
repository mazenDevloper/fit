import json, os, subprocess, sys, urllib.request
def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'madar-fetch'})).read()
import struct, mimetypes
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
os.makedirs('out/rooms', exist_ok=True); os.chdir('out/rooms')
log = []
for h in []:
    try:
        d = json.loads(get('https://api.polyhaven.com/files/' + h))
        u = d['tonemapped']['url'] if 'tonemapped' in d else None
        log.append(h + ' keys ' + ','.join(d.keys()) + ' url ' + str(u))
        open(h + '.src.jpg', 'wb').write(get(u))
        subprocess.run(['convert', h + '.src.jpg', '-resize', '4096x2048!', '-quality', '84', h + '.jpg'], check=True); os.remove(h + '.src.jpg')
    except Exception as e: log.append('ERR ' + h + ' ' + repr(e))
for m in []:
    try:
        d = json.loads(get('https://api.polyhaven.com/files/' + m)); g = d['gltf']['1k']['gltf']
        base = 'src/' + m + '/'; os.makedirs(base, exist_ok=True)
        open(base + m + '.gltf', 'wb').write(get(g['url']))
        for path, v in g.get('include', {}).items():
            os.makedirs(os.path.dirname(base + path) or base, exist_ok=True); open(base + path, 'wb').write(get(v['url']))
            if path.endswith(('.jpg', '.png')): subprocess.run(['mogrify', '-resize', '512x512>', base + path])
        pack(base, m + '.gltf', m + '.glb')
        log.append(m + ' ok ' + str(os.path.getsize(m + '.glb')))
    except Exception as e: log.append('ERR ' + m + ' ' + repr(e)[:300])
subprocess.run(['rm', '-rf', 'src'])
for t in ['white_plaster_02', 'fabric_pattern_05', 'concrete_floor_01', 'white_oak_veneer']:
    try:
        d = json.loads(get('https://api.polyhaven.com/files/' + t))
        for key, suf in [('Diffuse', 'diff'), ('nor_gl', 'nor'), ('Rough', 'rough')]:
            if key in d:
                open(t + '_' + suf + '.jpg', 'wb').write(get(d[key]['1k']['jpg']['url']))
                subprocess.run(['mogrify', '-resize', '512x512', '-quality', '85', t + '_' + suf + '.jpg'])
        log.append(t + ' ok ' + ','.join(d.keys()))
    except Exception as e: log.append('ERR ' + t + ' ' + repr(e)[:200])
tx = json.loads(get('https://api.polyhaven.com/assets?t=textures'))
open('textures.txt','w').write('\n'.join(sorted(k+' | '+','.join(v.get('categories',[])) for k,v in tx.items())))
open('log.txt', 'w').write('\n'.join(log))
