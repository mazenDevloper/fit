# probe: is UVCAndroid on Maven Central, and what is its API (sources jar)
import urllib.request, zipfile, io, os, re
os.makedirs('out/uvc', exist_ok=True)
log = []
def get(u):
    try: return urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'}), timeout=60).read()
    except Exception as e: log.append('ERR ' + u + ' ' + str(e)); return None
meta = get('https://repo1.maven.org/maven2/com/herohan/UVCAndroid/maven-metadata.xml')
log.append('meta: ' + (meta.decode()[:600] if meta else 'none'))
vers = re.findall(r'<version>([^<]+)</version>', meta.decode()) if meta else []
v = vers[-1] if vers else '1.0.7'
src = get(f'https://repo1.maven.org/maven2/com/herohan/UVCAndroid/{v}/UVCAndroid-{v}-sources.jar')
if src:
    z = zipfile.ZipFile(io.BytesIO(src))
    for n in z.namelist():
        if n.endswith('.java') and re.search(r'CameraHelper|ICameraHelper|IFrameCallback|Size\.java|UVCCamera\.java|UVCParam', n):
            open('out/uvc/' + n.replace('/', '_'), 'wb').write(z.read(n))
    log.append('files: ' + ' '.join(z.namelist()[:300]))
pom = get(f'https://repo1.maven.org/maven2/com/herohan/UVCAndroid/{v}/UVCAndroid-{v}.pom')
if pom: open('out/uvc/pom.xml', 'wb').write(pom)
open('out/uvc/log.txt', 'w').write('\n'.join(log))
