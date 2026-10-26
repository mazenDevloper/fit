// Offline cache: network-first for the app shell (so updates arrive), cache-first for heavy libraries and assets.
const VERSION = 'madar-v112';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'apple-touch-icon.png',
  'js/app.js', 'js/config.js', 'js/db.js', 'js/orient.js', 'js/render.js', 'js/hands.js', 'js/ui.js', 'js/windows.js', 'js/models.js', 'js/panels.js', 'js/interaction.js', 'js/controls.js', 'js/slam.js', 'js/gaze.js', 'js/envs.js', 'js/rooms.js', 'js/mirror.js', 'js/lens.js', 'js/devices.js', 'tv.html', 'emu.html', 'js/sports.js', 'js/games.js', 'js/room.js', 'js/matchart.js', 'js/native.js', 'js/control.js', 'js/gallery.js', 'js/iphone.js', 'js/quran.js', 'js/reader.js', 'js/books.js', 'js/shelf.js', 'js/ambient.js', 'js/rooms2.js', 'js/manuscript.js', 'js/musclemap.js', 'js/coach.js', 'js/train.js', 'js/posecam.js', 'js/furniture.js', 'js/anatomy.js', 'flat.html', 'js/flat.js', 'js/fitapp.js', 'js/extras.js', 'js/depth.js', 'js/hub.js', 'share.html', 'js/share.js',
  'lib/three/three.module.js', 'assets/sample.mp4'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k.startsWith('madar-v')).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request;
  // «زر المشاركة» (installed app on Android): what another app shares arrives as a POST - keep it, then show share.html
  if (req.method === 'POST' && new URL(req.url).pathname.endsWith('/share.html')) {
    e.respondWith((async () => {
      const f = await req.formData(), files = f.getAll('files').filter(x => x && x.size);
      const c = await caches.open('madar-share');
      await Promise.all((await c.keys()).map(k => c.delete(k)));
      for (let i = 0; i < files.length; i++) await c.put('/share-inbox/' + i, new Response(files[i], { headers: { 'content-type': files[i].type || 'application/octet-stream', 'x-name': encodeURIComponent(files[i].name || 'file') } }));
      const q = new URLSearchParams({ title: f.get('title') || '', text: f.get('text') || '', url: f.get('url') || '', inbox: String(files.length) });
      return Response.redirect('share.html?' + q, 303);
    })());
    return;
  }
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;            // iframes, YouTube, model download handled elsewhere
  if (req.headers.has('range')) return;                  // let Safari stream video ranges natively
  const heavy = url.pathname.includes('/lib/') || url.pathname.includes('/assets/');
  if (heavy) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok && res.status === 200) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; })));
  } else {
    // Always ask the server whether the page or code changed (cheap check), so updates show right away.
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => { if (res.ok && res.status === 200) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; }).catch(() => caches.match(req).then(h => h || caches.match('index.html'))));
  }
});
