# test: is the studio worker's /vision/body deployed, and does it read a (synthetic, made-up) scale screenshot?
import json, io, base64, urllib.request, os, subprocess, sys, site, importlib, time
os.makedirs('out/vis', exist_ok=True)
subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', '--break-system-packages', 'pillow'], capture_output=True)
site.addsitedir(site.getusersitepackages()); importlib.invalidate_caches()
from PIL import Image, ImageDraw, ImageFont
F = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
big, small = ImageFont.truetype(F, 54), ImageFont.truetype(F, 26)
cards = [('Muscle Mass', '48.30', 'kg'), ('Weight', '72.40', 'kg'), ('Subcutaneous Fat', '14.2', '%'), ('BMI', '23.9', ''), ('Body Water', '57.3', '%'), ('Body Fat', '18.6', '%'), ('BMR', '1612', 'kcal'), ('Fat Mass', '13.47', 'kg'), ('Lean Body Mass', '58.93', 'kg'), ('Bone Mass', '3.10', 'kg'), ('Visceral Fat', '7', ''), ('Protein', '17.2', '%'), ('Skeletal Muscle', '30.40', 'kg'), ('Body Age', '35', '')]
W, ch = 693, 230; im = Image.new('RGB', (W, 30 + ch * 7), '#f2f3f4'); d = ImageDraw.Draw(im)
for i, (l, v, u) in enumerate(cards):
    x = 360 if i % 2 == 0 else 30; y = 15 + (i // 2) * ch
    d.rounded_rectangle([x, y, x + 300, y + ch - 25], 24, fill='white'); d.text((x + 20, y + 25), l, font=small, fill='#222')
    d.line([x + 170, y + 95, x + 280, y + 95], fill='#3c3', width=4); d.text((x + 90, y + 115), v, font=big, fill='#222'); d.text((x + 30, y + 140), u, font=small, fill='#222')
im.save('out/vis/synthetic.jpg', quality=88)
def post(img):
    b = io.BytesIO(); img.save(b, 'JPEG', quality=88)
    body = json.dumps({'image': 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()}).encode()
    t = time.time()
    try: r = urllib.request.urlopen(urllib.request.Request('https://studio.c-p.workers.dev/vision/body', data=body, method='POST', headers={'content-type': 'application/json', 'User-Agent': 'MadarTest'}), timeout=120).read().decode()
    except Exception as e: r = 'ERR ' + str(e) + ' ' + (e.read().decode()[:300] if hasattr(e, 'read') else '')
    return f'{time.time()-t:.1f}s ' + r
out = ['whole: ' + post(im)]
h = im.height; ph = int(W * 1.25); n = 5
for i in range(n):
    y = int(i * (h - ph) / (n - 1)); out.append(f'slice {i}: ' + post(im.crop((0, y, W, y + ph))))
open('out/vis/result.txt', 'w').write('\n\n'.join(out))
