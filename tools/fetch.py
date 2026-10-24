# clean the test entries from «المركز»
import json, urllib.request, os
os.makedirs('out/hub', exist_ok=True)
def op(o): return urllib.request.urlopen(urllib.request.Request('https://studio.c-p.workers.dev/hub/op', data=json.dumps(o).encode(), method='POST', headers={'User-Agent': 'MadarTest'}), timeout=60).read().decode()
out = [op({'op': 'resume', 'item': {'id': 'dQw4w9WgXcQ', 'kind': 'yt', 't': 211, 'dur': 212}}), op({'op': 'set', 'key': 'history', 'value': []})]
st = urllib.request.urlopen(urllib.request.Request('https://studio.c-p.workers.dev/hub/state', headers={'User-Agent': 'MadarTest'}), timeout=60).read().decode()
open('out/hub/clean.txt', 'w').write('\n'.join(out) + '\n' + st[:600])
