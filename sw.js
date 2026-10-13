// Offline cache: network-first for the app shell (so updates arrive), cache-first for heavy libraries and assets.
const VERSION = 'madar-v4';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'apple-touch-icon.png',
  'js/app.js', 'js/config.js', 'js/db.js', 'js/orient.js', 'js/render.js', 'js/hands.js', 'js/ui.js', 'js/windows.js', 'js/models.js', 'js/panels.js', 'js/interaction.js',
  'lib/three/three.module.js', 'assets/sample.mp4'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k.startsWith('madar-v')).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;            // iframes, YouTube, model download handled elsewhere
  if (req.headers.has('range')) return;                  // let Safari stream video ranges natively
  const heavy = url.pathname.includes('/lib/') || url.pathname.includes('/assets/');
  if (heavy) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok && res.status === 200) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; })));
  } else {
    e.respondWith(fetch(req).then(res => { if (res.ok && res.status === 200) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; }).catch(() => caches.match(req).then(h => h || caches.match('index.html'))));
  }
});
