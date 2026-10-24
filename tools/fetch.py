# test «المركز» (/hub): state, two sockets (Madar + DriveCast), resume, send, islands, library, suggest
import json, urllib.request, os, time, subprocess, sys, site, importlib, asyncio
os.makedirs('out/hub', exist_ok=True)
subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', '--break-system-packages', 'websockets'], capture_output=True)
site.addsitedir(site.getusersitepackages()); importlib.invalidate_caches()
import websockets
B = 'https://studio.c-p.workers.dev/hub'
log = []
def get(p):
    try: return urllib.request.urlopen(urllib.request.Request(B + p, headers={'User-Agent': 'MadarTest'}), timeout=60).read().decode()[:1500]
    except Exception as e: return 'ERR ' + str(e)
async def main():
    async with websockets.connect('wss://studio.c-p.workers.dev/hub/ws?id=test-madar&name=TestMadar&kind=madar&app=madar', user_agent_header='MadarTest') as a:
        log.append('A hello: ' + (await a.recv())[:300])
        async with websockets.connect('wss://studio.c-p.workers.dev/hub/ws?id=test-car&name=TestCar&kind=car&app=drivecast', user_agent_header='MadarTest') as b:
            log.append('B hello: ' + (await b.recv())[:200])
            log.append('A got: ' + (await asyncio.wait_for(a.recv(), 5))[:200])
            await b.send(json.dumps({'op': 'resume', 'item': {'id': 'dQw4w9WgXcQ', 'kind': 'yt', 't': 125, 'dur': 212}}))
            log.append('A got resume: ' + (await asyncio.wait_for(a.recv(), 10))[:400])
            await a.send(json.dumps({'op': 'send', 'to': 'kind:car', 'msg': {'type': 'toast', 'text': 'مرحبا من مدار'}}))
            log.append('B got msg: ' + (await asyncio.wait_for(b.recv(), 5))[:300])
asyncio.run(main())
log.append('islands: ' + get('/islands?device=x'))
log.append('library: ' + get('/library')[:600])
log.append('suggest: ' + get('/suggest?place=car'))
open('out/hub/test.txt', 'w').write('\n\n'.join(log))
