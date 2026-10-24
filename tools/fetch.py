# test the worker's new endpoints: /summarize, /translate, /vision/ask
import json, urllib.request, base64, os, time
os.makedirs('out/vis', exist_ok=True)
def post(path, body):
    t = time.time()
    try: r = urllib.request.urlopen(urllib.request.Request('https://studio.c-p.workers.dev' + path, data=json.dumps(body).encode(), method='POST', headers={'content-type': 'application/json', 'User-Agent': 'MadarTest'}), timeout=120).read().decode()
    except Exception as e: r = 'ERR ' + str(e)
    return f'{path} {time.time()-t:.1f}s {r[:900]}'
img = base64.b64encode(open('out/vis/synthetic.jpg', 'rb').read()).decode()
out = [post('/summarize', {'url': 'https://ar.wikipedia.org/wiki/%D8%B5%D9%84%D8%A7%D9%84%D8%A9'}),
       post('/translate', {'text': 'Welcome to the evening news. Our top story tonight is the weather.'}),
       post('/vision/ask', {'image': 'data:image/jpeg;base64,' + img, 'q': 'ما هذا؟'})]
open('out/vis/smart.txt', 'w').write('\n\n'.join(out))
