# 360° videos for Madar: originals from Wikimedia Commons / NASA → H.264 MP4 2:1 (plays everywhere, iPhone included)
import json, os, subprocess, urllib.request, urllib.parse
UA = {'User-Agent': 'MadarMedia/1.0 (https://mazendevloper.github.io/fit/; github.com/mazenDevloper/fit)'}
def get(url, timeout=120): return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()
def commons(title):
    q = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=videoinfo&viprop=url|size|extmetadata&titles=' + urllib.parse.quote(title)
    p = list(json.loads(get(q))['query']['pages'].values())[0]; v = p['videoinfo'][0]; m = v.get('extmetadata', {})
    strip = lambda s: __import__('re').sub('<[^>]+>', '', s or '').strip()
    return v['url'], strip(m.get('LicenseShortName', {}).get('value')), strip(m.get('Artist', {}).get('value'))[:120], 'https://commons.wikimedia.org/wiki/' + urllib.parse.quote(title.replace(' ', '_'))
VIDEOS = [
  # slug, source, Arabic title, category, max seconds, loop
  ('bled', 'File:Video 360°. Timelapse. Bled Lake in Slovenia..webm', 'بحيرة بليد · سلوفينيا', 'طبيعة', 0, True),
  ('waterfall', 'File:20180407 132600 Ess-Na-Crub Waterfall.webm', 'شلال في المرتفعات الاسكتلندية', 'طبيعة', 0, True),
  ('cabo-girao', 'File:Não veja este video 360 se tiver vertigens! Madeira - Cabo Girão.webm', 'منحدر كابو جيراو · ماديرا', 'إطلالات', 0, True),
  ('alaska', 'File:Fly Above Alaskan Glaciers in 360 Y2eysSmn9VU.webm', 'تحليق فوق أنهار ألاسكا الجليدية', 'رحلات', 150, False),
  ('ghost-road', 'File:3-mins-in-360 on The Old Ghost Road.webm', 'درب أولد غوست · نيوزيلندا', 'رحلات', 150, False),
  ('tolmin', 'File:2021 06 12 PARA 360 Tolmin SokoleONE 2 - UP Kangri.webm', 'طيران شراعي فوق جبال تولمين', 'رحلات', 0, False),
  ('ny-ferry', 'File:See Why New York’s Ferries Are So Popular (360 degrees).webm', 'عبّارة في نيويورك', 'مدن', 0, False),
  ('spacewalk', 'File:NASA VR-360 Astronaut Training- Space Walk.webm', 'تدريب السير في الفضاء · ناسا', 'الفضاء', 150, False),
  ('eclipse', 'File:360 Video of the total eclipse Aug 21 2017 at Mud lake Idaho.webm', 'الكسوف الكلي للشمس 2017', 'الفضاء', 150, False),
  ('mars', 'nasa:https://images-assets.nasa.gov/video/JPL-20240329-MSLf-0001-Curiosity_Reaches_Gediz_Vallis_Channel_360_8k/JPL-20240329-MSLf-0001-Curiosity_Reaches_Gediz_Vallis_Channel_360_8k~orig.mp4', 'كيوريوسيتي على سطح المريخ · ناسا', 'الفضاء', 150, False),
]
os.makedirs('out', exist_ok=True); os.makedirs('src', exist_ok=True)
manifest = []
for slug, src, title, cat, maxs, loop in VIDEOS:
    try:
        if src.startswith('nasa:'): url, lic, artist, page = src[5:], 'Public domain (NASA/JPL)', 'NASA/JPL-Caltech', 'https://images.nasa.gov/details/JPL-20240329-MSLf-0001-Curiosity_Reaches_Gediz_Vallis_Channel_360_8k'
        else: url, lic, artist, page = commons(src)
        raw = 'src/' + slug + os.path.splitext(urllib.parse.urlparse(url).path)[1]
        subprocess.run(['curl', '-sL', '-A', UA['User-Agent'], '--retry', '3', '-o', raw, url], check=True)
        probe = json.loads(subprocess.run(['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', raw], capture_output=True, text=True).stdout)
        vs = next(s for s in probe['streams'] if s['codec_type'] == 'video'); has_audio = any(s['codec_type'] == 'audio' for s in probe['streams'])
        w = 2880 if int(vs['width']) >= 2880 else (int(vs['width']) // 2) * 2
        h = w // 2
        dur = float(probe['format'].get('duration', 0) or 0)
        args = ['ffmpeg', '-y', '-v', 'error', '-i', raw]
        if maxs and dur > maxs: args += ['-t', str(maxs)]
        args += ['-vf', f'scale={w}:{h}:flags=lanczos,fps=30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-maxrate', '9M', '-bufsize', '18M', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '5.1', '-movflags', '+faststart']
        args += (['-c:a', 'aac', '-b:a', '128k', '-ac', '2'] if has_audio else ['-an'])
        args += ['out/' + slug + '.mp4']
        subprocess.run(args, check=True)
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', str(min(3, dur / 3)), '-i', 'out/' + slug + '.mp4', '-frames:v', '1', '-vf', 'scale=640:320', '-q:v', '4', 'out/' + slug + '.jpg'], check=True)
        out_dur = min(dur, maxs) if maxs else dur
        manifest.append({'id': slug, 'title': title, 'cat': cat, 'file': slug + '.mp4', 'poster': slug + '.jpg', 'w': w, 'h': h, 'dur': round(out_dur), 'audio': has_audio, 'loop': loop,
                         'size': os.path.getsize('out/' + slug + '.mp4'), 'license': lic, 'author': artist, 'source': page})
        os.remove(raw)
        print('ok', slug, w, h, round(out_dur), os.path.getsize('out/' + slug + '.mp4'))
    except Exception as e: print('ERR', slug, repr(e)[:300])
json.dump(manifest, open('out/manifest.json', 'w'), ensure_ascii=False, indent=1)
