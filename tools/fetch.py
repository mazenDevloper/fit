# Depth Anything V2 small (Apache-2.0) as ONNX, for Madar's 2D → spatial photos (on-device depth)
import json, urllib.request, os, time
os.makedirs('out/depth', exist_ok=True)
log = []
def get(u, p=None):
    t = time.time(); d = urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'MadarBot/1.0'}), timeout=600).read()
    log.append(f'{u} {len(d)} {time.time()-t:.0f}s')
    if p: open(p, 'wb').write(d)
    return d
for repo in ['onnx-community/depth-anything-v2-small', 'onnx-community/DepthPro-ONNX']:
    try:
        info = json.loads(get(f'https://huggingface.co/api/models/{repo}'))
        log.append(repo + ': ' + ', '.join(f"{s['rfilename']}" for s in info.get('siblings', [])))
    except Exception as e: log.append(repo + ' ERR ' + str(e))
R = 'https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/'
for f in ['onnx/model_quantized.onnx', 'onnx/model_q4f16.onnx', 'preprocessor_config.json', 'config.json']:
    try: get(R + f, 'out/depth/' + f.split('/')[-1])
    except Exception as e: log.append(f + ' ERR ' + str(e))
open('out/depth/log.txt', 'w').write('\n'.join(log))
