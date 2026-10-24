# writes app.json + package.json for one app (madar | drivecast) and its 256 px icon
import json, sys, urllib.request, io
from PIL import Image
which = sys.argv[1]
A = {
  'madar': dict(name='مدار', product='Madar', id='io.github.mazendevloper.madar', url='https://mazendevloper.github.io/fit/', icon='https://raw.githubusercontent.com/mazenDevloper/fit/gh-pages/icon-512.png',
                trusted=['https://mazendevloper.github.io', 'https://studio.c-p.workers.dev', 'https://drivecast.c-p.workers.dev'], fullscreen=False),
  'drivecast': dict(name='DriveCast', product='DriveCast', id='com.drivecast.sovereign.desktop', url='https://drivecast.c-p.workers.dev/', icon='https://raw.githubusercontent.com/mazenDevloper/studio/main/android-app/icon/preview.png',
                trusted=['https://drivecast.c-p.workers.dev', 'https://studio.c-p.workers.dev', 'https://mazendevloper.github.io'], fullscreen=False),
}[which]
json.dump({k: A[k] for k in ['name', 'url', 'trusted', 'fullscreen']}, open('app.json', 'w'), ensure_ascii=False)
img = Image.open(io.BytesIO(urllib.request.urlopen(A['icon']).read())).convert('RGBA')
s = max(img.size); sq = Image.new('RGBA', (s, s), (0, 0, 0, 0)); sq.paste(img, ((s - img.width) // 2, (s - img.height) // 2))
sq.resize((256, 256), Image.LANCZOS).save('icon.png'); sq.save('icon.ico', sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
pkg = {'name': which, 'productName': A['product'], 'version': '1.0.0', 'description': A['name'], 'author': 'Mazn', 'main': 'main.js',
       'build': {'appId': A['id'], 'productName': A['product'], 'files': ['main.js', 'app.json', 'icon.png'], 'icon': 'icon.ico',
                 'win': {'target': ['nsis', 'portable'], 'icon': 'icon.ico'},
                 'nsis': {'oneClick': False, 'allowToChangeInstallationDirectory': True, 'createDesktopShortcut': True, 'shortcutName': A['name'], 'artifactName': A['product'] + '-Setup.${ext}'},
                 'portable': {'artifactName': A['product'] + '-Portable.${ext}'}}}
json.dump(pkg, open('package.json', 'w'), ensure_ascii=False, indent=1)
