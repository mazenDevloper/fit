# Two more libraries for Madar, built on GitHub's machines and published next to the 360° videos (release media-360):
#   fx-*    «فيديو شفاف»: green / blue-screen clips from Wikimedia Commons, keyed out here (ffmpeg) and saved as
#           "stacked alpha" MP4 (the picture on the left half, its transparency mask on the right) - plays on every
#           device (iPhone included) and Madar draws it with a real transparent background
#   wide-*  «عريض جداً»: the front 180° of each 360° video as a 32:9 cinema strip (2560×720)
import json, os, re, subprocess, urllib.request, urllib.parse
from PIL import Image

UA = {'User-Agent': 'MadarMedia/1.0 (https://mazendevloper.github.io/fit/; github.com/mazenDevloper/fit)'}
API = 'https://commons.wikimedia.org/w/api.php?format=json&'
def get(url, timeout=120): return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()
def api(q): return json.loads(get(API + q))
strip = lambda s: re.sub('<[^>]+>', '', s or '').strip()
os.makedirs('out', exist_ok=True); os.makedirs('src', exist_ok=True)
def run(args): subprocess.run(args, check=True)
def probe(f):
    p = json.loads(subprocess.run(['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', f], capture_output=True, text=True).stdout)
    v = next(s for s in p['streams'] if s['codec_type'] == 'video')
    return int(v['width']), int(v['height']), float(p['format'].get('duration', 0) or 0), any(s['codec_type'] == 'audio' for s in p['streams'])

# ------------------------------------------------------------------ 1) transparent clips
AR = [('dog', 'كلب'), ('cat', 'قطة'), ('horse', 'حصان'), ('bird', 'طائر'), ('butterfly', 'فراشة'), ('fish', 'سمكة'), ('dance', 'رقص'), ('walk', 'مشي'),
      ('run', 'جري'), ('man', 'رجل'), ('woman', 'امرأة'), ('girl', 'فتاة'), ('boy', 'فتى'), ('child', 'طفل'), ('people', 'أشخاص'), ('person', 'شخص'),
      ('fire', 'نار'), ('smoke', 'دخان'), ('rain', 'مطر'), ('snow', 'ثلج'), ('water', 'ماء'), ('explosion', 'انفجار'), ('car', 'سيارة'), ('ball', 'كرة'),
      ('football', 'كرة قدم'), ('soccer', 'كرة قدم'), ('robot', 'روبوت'), ('plane', 'طائرة'), ('flag', 'علم'), ('tree', 'شجرة'), ('flower', 'زهرة'), ('juggl', 'خفة يد')]
def ar_title(t):
    t0 = re.sub(r'\.(webm|ogv|mp4|ogg)$', '', t.replace('File:', ''), flags=re.I)
    t0 = re.sub(r'(green|blue)[ _-]?screen|chroma[ _-]?key|greenscreen|[_-]+', ' ', t0, flags=re.I).strip()
    words = [a for e, a in AR if e in t0.lower()]
    return (' · '.join(dict.fromkeys(words)) if words else t0[:40] or 'مقطع شفاف')
CAT = {'كلب': 'حيوانات', 'قطة': 'حيوانات', 'حصان': 'حيوانات', 'طائر': 'حيوانات', 'فراشة': 'حيوانات', 'سمكة': 'حيوانات', 'نار': 'مؤثرات', 'دخان': 'مؤثرات',
       'مطر': 'طبيعة', 'ثلج': 'طبيعة', 'ماء': 'طبيعة', 'انفجار': 'مؤثرات', 'شجرة': 'طبيعة', 'زهرة': 'طبيعة', 'كرة': 'رياضة', 'كرة قدم': 'رياضة', 'جري': 'رياضة', 'رقص': 'أشخاص'}
def cat_of(title): return next((c for w, c in CAT.items() if w in title), 'أشخاص' if any(w in title for w in ['رجل', 'امرأة', 'فتاة', 'فتى', 'طفل', 'أشخاص', 'شخص', 'مشي']) else 'منوعات')

def candidates():
    seen, out = set(), []
    def add(t):
        if t not in seen and re.search(r'\.(webm|ogv|mp4)$', t, re.I): seen.add(t); out.append(t)
    def walk(cat, depth):
        try: d = api('action=query&list=categorymembers&cmlimit=200&cmtitle=' + urllib.parse.quote(cat))
        except Exception as e: print('cat err', cat, e); return
        for m in d['query']['categorymembers']:
            if m['ns'] == 6: add(m['title'])
            elif m['ns'] == 14 and depth > 0: walk(m['title'], depth - 1)
    for c in ['Category:Chroma key', 'Category:Green screen', 'Category:Videos with chroma key', 'Category:Green screen videos']: walk(c, 2)
    for q in ['green screen', 'greenscreen', 'chroma key', 'blue screen']:
        try:
            d = api('action=query&list=search&srnamespace=6&srlimit=60&srsearch=' + urllib.parse.quote(q + ' filetype:video'))
            for m in d['query']['search']: add(m['title'])
        except Exception as e: print('search err', q, e)
    print('candidates', len(out))
    return out

def info(title):
    p = list(api('action=query&prop=videoinfo&viprop=url|size|mediatype|extmetadata&titles=' + urllib.parse.quote(title))['query']['pages'].values())[0]
    v = p['videoinfo'][0]; m = v.get('extmetadata', {})
    return v['url'], v.get('size', 0), strip(m.get('LicenseShortName', {}).get('value')), strip(m.get('Artist', {}).get('value'))[:120]

def key_color(f, t):
    # the background colour: the median of the frame's border, if it is clearly green or blue
    run(['ffmpeg', '-y', '-v', 'error', '-ss', str(t), '-i', f, '-frames:v', '1', '-vf', 'scale=160:-2', 'k.png'])
    im = Image.open('k.png').convert('RGB'); W, H = im.size
    px = [im.getpixel((x, y)) for x in range(W) for y in (2, H - 3)] + [im.getpixel((x, y)) for y in range(H) for x in (2, W - 3)]
    px.sort(key=lambda c: c[1] - max(c[0], c[2]))
    r, g, b = px[len(px) // 2]
    if g > r + 35 and g > b + 25: return '0x%02x%02x%02x' % (r, g, b), 'green'
    if b > r + 35 and b > g + 15: return '0x%02x%02x%02x' % (r, g, b), 'blue'
    return None, None

TITLES = {'explosion-green-screen-no-copyright': ('انفجار', 'مؤثرات'), 'chicken-fillet-roll': ('خبز باغيت يدور', 'منوعات'),
          'court-scale': ('ميزان العدالة', 'رموز'), 'scales-symbol-of-law': ('ميزان · رسم متحرك', 'رموز')}
PIX = os.environ.get('PIXABAY_KEY', '').strip()
PIX_Q = [('green screen dog', 'حيوانات', 'كلب'), ('green screen cat', 'حيوانات', 'قطة'), ('green screen bird', 'حيوانات', 'طائر'), ('green screen butterfly', 'حيوانات', 'فراشة'),
         ('green screen horse', 'حيوانات', 'حصان'), ('green screen fish', 'حيوانات', 'سمكة'), ('green screen fire', 'مؤثرات', 'نار'), ('green screen smoke', 'مؤثرات', 'دخان'),
         ('green screen explosion', 'مؤثرات', 'انفجار'), ('green screen rain', 'طبيعة', 'مطر'), ('green screen snow', 'طبيعة', 'ثلج'), ('green screen man walking', 'أشخاص', 'رجل يمشي'),
         ('green screen woman', 'أشخاص', 'امرأة'), ('green screen dance', 'أشخاص', 'رقص'), ('green screen football', 'رياضة', 'كرة قدم'), ('green screen soccer ball', 'رياضة', 'كرة'),
         ('green screen plane', 'مركبات', 'طائرة'), ('green screen car', 'مركبات', 'سيارة'), ('green screen fireworks', 'مؤثرات', 'ألعاب نارية'), ('green screen confetti', 'مؤثرات', 'قصاصات احتفال'),
         ('green screen planet', 'الفضاء', 'كوكب'), ('green screen astronaut', 'الفضاء', 'رائد فضاء'), ('green screen robot', 'منوعات', 'روبوت'), ('green screen flag', 'منوعات', 'علم')]
def pix_candidates():
    out = []
    if not PIX: print('no PIXABAY_KEY: Commons only'); return out
    for q, cat, ar in PIX_Q:
        try:
            d = json.loads(get('https://pixabay.com/api/videos/?per_page=6&safesearch=true&key=' + PIX + '&q=' + urllib.parse.quote(q)))
            for h in d.get('hits', [])[:3]:
                v = h['videos'].get('medium') or h['videos'].get('small')
                if v and v.get('url'): out.append({'url': v['url'], 'title': ar, 'cat': cat, 'lic': 'Pixabay Content License', 'artist': h.get('user', ''), 'page': h.get('pageURL', ''), 'slug': 'fx-px-' + str(h['id'])})
        except Exception as e: print('pixabay err', q, e)
    print('pixabay candidates', len(out)); return out
def commons_candidates():
    out = []
    for title in candidates():
        try:
            url, size, lic, artist = info(title)
            if size > 250e6 or size < 300e3: continue
            slug = 'fx-' + re.sub(r'[^a-z0-9]+', '-', title.lower().replace('file:', ''))[:40].strip('-')
            t = next((v for k, v in TITLES.items() if k in slug), None)
            if not t: continue   # only clips checked by eye (Commons has few good ones)
            out.append({'url': url, 'title': t[0], 'cat': t[1], 'lic': lic, 'artist': artist, 'page': 'https://commons.wikimedia.org/wiki/' + urllib.parse.quote(title.replace(' ', '_')), 'slug': slug})
        except Exception as e: print('info err', title, e)
    seen, uniq = set(), []
    for c in out:
        if c['title'] not in seen: seen.add(c['title']); uniq.append(c)
    return uniq

def coverage(mp4, t):
    # how much of the frame is kept (a cut-out that is empty or the whole frame is not a cut-out)
    run(['ffmpeg', '-y', '-v', 'error', '-ss', str(t), '-i', mp4, '-frames:v', '1', '-vf', 'crop=iw/2:ih:iw/2:0,scale=96:-2', 'm.png'])
    im = Image.open('m.png').convert('L'); px = list(im.getdata())
    return sum(1 for p in px if p > 128) / len(px)

fx = []
for c in commons_candidates() + pix_candidates():
    if len(fx) >= 60: break
    try:
        url, slug = c['url'], c['slug']
        raw = 'src/' + slug + (os.path.splitext(urllib.parse.urlparse(url).path)[1] or '.mp4')
        run(['curl', '-sL', '-A', UA['User-Agent'], '--retry', '3', '-o', raw, url])
        w, h, dur, _ = probe(raw)
        if dur < 2 or dur > 240: os.remove(raw); continue
        col, kind = key_color(raw, min(1.0, dur / 3))
        if not col: print('skip (no green/blue background)', slug); os.remove(raw); continue
        sim = '0.16' if kind == 'green' else '0.14'
        H = 720 if h >= 720 else (h // 2) * 2
        vf = (f"fps=30,scale=-2:{H}:flags=lanczos,format=rgba,chromakey={col}:{sim}:0.08"
              + (",despill=type=green" if kind == 'green' else ",despill=type=blue")
              + ",split[c][m];[m]alphaextract,format=rgb24[a];[c]format=rgb24[cc];[cc][a]hstack,format=yuv420p")
        out = 'out/' + slug + '.mp4'
        run(['ffmpeg', '-y', '-v', 'error', '-i', raw, '-t', '45', '-filter_complex', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
             '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', out])
        ow, oh, odur, _ = probe(out)
        cv = coverage(out, min(1.0, odur / 3))
        if cv < 0.02 or cv > 0.9: print('skip (cut-out coverage %.2f)' % cv, slug); os.remove(out); os.remove(raw); continue
        # poster: the cut-out over a dark background
        run(['ffmpeg', '-y', '-v', 'error', '-ss', str(min(1.0, odur / 3)), '-i', out, '-frames:v', '1', '-filter_complex',
             '[0]crop=iw/2:ih:0:0[c];[0]crop=iw/2:ih:iw/2:0,format=gray[a];[c][a]alphamerge[ca];color=c=0x1b2033:s=640x360[bg];[ca]scale=640:360:force_original_aspect_ratio=decrease[s];[bg][s]overlay=(W-w)/2:(H-h)/2',
             '-q:v', '4', 'out/' + slug + '.jpg'])
        fx.append({'id': slug, 'title': c['title'], 'cat': c['cat'], 'file': slug + '.mp4', 'poster': slug + '.jpg', 'w': ow // 2, 'h': oh, 'dur': round(odur),
                   'alpha': 'stacked', 'key': kind, 'size': os.path.getsize(out), 'license': c['lic'], 'author': c['artist'], 'source': c['page']})
        os.remove(raw); print('fx ok', slug, kind, ow, oh, round(odur))
    except Exception as e: print('fx ERR', c.get('slug'), repr(e)[:200])
json.dump(fx, open('out/fx.json', 'w'), ensure_ascii=False, indent=1)
print('fx total', len(fx))

# ------------------------------------------------------------------ 2) ultra-wide strips from the 360° videos
wide = []
if os.path.exists('wide.json'): print('wide already built'); json.dump(json.load(open('wide.json')), open('out/wide.json', 'w'), ensure_ascii=False, indent=1); raise SystemExit(0)
for v in json.load(open('manifest.json')):
    try:
        src = 'src/' + v['file']
        run(['gh', 'release', 'download', 'media-360', '-p', v['file'], '-D', 'src', '--clobber'])
        w, h, dur, audio = probe(src)
        slug = 'wide-' + v['id']; out = 'out/' + slug + '.mp4'
        # the front half (180°) of the panorama, a 50° band around the horizon → 32:9
        vf = 'crop=iw/2:ih*0.28:iw/4:ih*0.36,scale=2560:720:flags=lanczos,setsar=1,fps=30'
        args = ['ffmpeg', '-y', '-v', 'error', '-i', src, '-t', '150', '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-maxrate', '10M', '-bufsize', '20M',
                '-pix_fmt', 'yuv420p', '-movflags', '+faststart'] + (['-c:a', 'aac', '-b:a', '128k', '-ac', '2'] if audio else ['-an']) + [out]
        run(args)
        _, _, odur, _ = probe(out)
        run(['ffmpeg', '-y', '-v', 'error', '-ss', str(min(4, odur / 3)), '-i', out, '-frames:v', '1', '-vf', 'scale=640:180', '-q:v', '4', 'out/' + slug + '.jpg'])
        wide.append({**{k: v[k] for k in ('title', 'cat', 'license', 'author', 'source', 'loop')}, 'id': slug, 'file': slug + '.mp4', 'poster': slug + '.jpg',
                     'w': 2560, 'h': 720, 'dur': round(odur), 'audio': audio, 'size': os.path.getsize(out)})
        os.remove(src); print('wide ok', slug, round(odur))
    except Exception as e: print('wide ERR', v.get('id'), repr(e)[:200])
json.dump(wide, open('out/wide.json', 'w'), ensure_ascii=False, indent=1)
print('wide total', len(wide))
