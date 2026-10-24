// «زر المشاركة»: whatever another app shares (a YouTube link from WhatsApp, a page from the browser, a PDF, photos,
// a video, a place on the map, a text) → choose what to do with it and where: Madar (the living room), the car,
// the TV, this phone, or later. Files go to the server once (R2); the devices only receive a link (through «المركز»).
const W8 = 'https://studio.c-p.workers.dev', HUB = W8 + '/hub';
const $ = s => document.querySelector(s);
const q = new URLSearchParams(location.search);
const ytId = u => { try { const x = new URL(u); if (/youtu\.be$/.test(x.hostname)) return x.pathname.slice(1, 12); if (/youtube\.com$/.test(x.hostname.replace(/^(www|m|music)\./, ''))) return x.searchParams.get('v') || (x.pathname.match(/\/(shorts|live|embed)\/([\w-]{11})/) || [])[2] || null; } catch {} return null; };
const firstUrl = s => (String(s || '').match(/https?:\/\/[^\s<>"']+/) || [])[0] || '';
const geoOf = s => {
  s = String(s || '');
  let m = s.match(/geo:(-?\d+\.\d+),(-?\d+\.\d+)/) || s.match(/[?&](?:q|ll|daddr|destination|query)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/) || s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || s.match(/^\s*(-?\d{1,2}\.\d{3,}),\s*(-?\d{1,3}\.\d{3,})\s*$/);
  return m ? [+m[1], +m[2]] : null;
};
const isMap = u => /(maps\.google\.|google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.apple\.com|waze\.com|^geo:)/i.test(u);
const KIND_AR = { car: 'السيارة', tv: 'التلفاز', phone: 'الهاتف', tablet: 'التابلت', madar: 'مدار', computer: 'الكمبيوتر' };

const share = { title: q.get('title') || '', text: q.get('text') || '', url: q.get('url') || '', files: [] };
let item = null, action = null, devices = [], busy = false;

// ---- what arrived
async function collect() {
  const n = +q.get('inbox') || 0;   // files from the installed app's share sheet (kept by the service worker)
  if (n) { const c = await caches.open('madar-share'); for (let i = 0; i < n; i++) { const r = await c.match('/share-inbox/' + i); if (r) share.files.push(new File([await r.blob()], decodeURIComponent(r.headers.get('x-name') || 'file'), { type: r.headers.get('content-type') || '' })); } }
  // from the phone apps: the file is already on the server
  if (q.get('file')) share.remote = { url: q.get('file'), name: q.get('name') || '', type: q.get('type') || '' };
}
function classify() {
  const url = share.url || firstUrl(share.text) || (share.remote ? '' : '');
  const f = share.files[0], type = f?.type || share.remote?.type || '';
  if (f || share.remote) {
    const name = f?.name || share.remote.name || 'ملف';
    const kind = /^image\//.test(type) ? 'image' : /pdf/.test(type) || /\.pdf$/i.test(name) ? 'pdf' : /^video\//.test(type) ? 'video' : /epub/.test(type) ? 'pdf' : 'file';
    return { kind, title: name, type, count: share.files.length || 1 };
  }
  const geo = geoOf(url) || geoOf(share.text);
  if (geo || isMap(url)) return { kind: 'map', title: share.title || cleanText(share.text) || 'موقع', url, lat: geo?.[0], lon: geo?.[1] };
  const yt = ytId(url);
  if (yt) return { kind: 'yt', id: yt, title: share.title || cleanText(share.text) || '', url, thumb: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`, short: /\/shorts\//.test(url) };
  if (/\.(mp4|m3u8|mov|webm)(\?|$)/i.test(url)) return { kind: 'video', url, title: share.title || url.split('/').pop() };
  if (/\.pdf(\?|$)/i.test(url)) return { kind: 'pdf', url, title: share.title || decodeURIComponent(url.split('/').pop()) };
  if (/\.(jpe?g|png|webp|gif|heic)(\?|$)/i.test(url)) return { kind: 'image', url, title: share.title || '' };
  if (url) return { kind: 'web', url, title: share.title || cleanText(share.text) || hostOf(url) };
  if (share.text.trim()) return { kind: 'text', text: share.text.trim(), title: share.text.trim().slice(0, 80) };
  return null;
}
const cleanText = t => String(t || '').replace(/https?:\/\/\S+/g, '').trim().slice(0, 120);
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

// ---- what you can do with it (the first one is chosen)
const ACTIONS = {
  yt: [['open', '▶', 'شغّله', 'من البداية'], ['later', '🕒', 'شاهد لاحقاً', 'في «تابع المشاهدة»']],
  web: [['open', '🌐', 'افتح الصفحة', 'نافذة في مدار'], ['read', '📖', 'وضع القراءة', 'كتاب على الرف'], ['summary', '📝', 'لخّصها', 'بالذكاء الاصطناعي'], ['listen', '🎧', 'اقرأها لي', 'بصوت (للسيارة)']],
  pdf: [['open', '📖', 'افتحه ككتاب', 'على رف الكتب'], ['save', '💾', 'احفظه', 'في المكتبة']],
  image: [['open', '🖼', 'اعرضها', 'نافذة'], ['spatial', '🧊', 'اجعلها مجسّمة', 'مشهد مكاني'], ['env', '🌍', 'بيئة حولي', 'إذا كانت 360° أو بانوراما'], ['frame', '🖼', 'إلى إطار الصور', 'وتُحفظ في المكتبة']],
  video: [['open', '🎞', 'شغّله', 'نافذة فيديو'], ['save', '💾', 'احفظه', 'في المكتبة']],
  map: [['nav', '🧭', 'ابدأ الملاحة', 'في السيارة'], ['open', '🗺', 'اعرض الخريطة', 'في مدار'], ['save', '📍', 'احفظ المكان', 'في «أماكني»']],
  text: [['note', '🗒', 'ملاحظة', 'لاصقة في مدار'], ['speak', '🔊', 'اقرأه بصوت', ''], ['remind', '⏰', 'تذكير', 'في DriveCast']],
  file: [['save', '💾', 'احفظه', '']],
};
// which devices make sense first for each action
const PREFER = { nav: ['car', 'phone'], listen: ['car'], spatial: ['madar'], env: ['madar'], frame: ['madar'], read: ['madar'], note: ['madar'], remind: ['car', 'phone'] };

function render() {
  const pv = $('#pv'), it = item;
  if (!it) { pv.innerHTML = '<div class="ic">📋</div><div class="meta"><b>لم يصل شيء</b><span style="direction:rtl;text-align:center">الصق رابطاً أو نصاً هنا</span></div>'; $('#manualBox').hidden = false; $('#acts').innerHTML = ''; renderDevs(); return; }
  $('#manualBox').hidden = true;
  let top = '';
  if (it.kind === 'yt') top = `<img src="${it.thumb}" alt="">`;
  else if (it.kind === 'image' && share.files.length) top = share.files.length > 1 ? `<div class="thumbs">${share.files.slice(0, 8).map(f => `<img src="${URL.createObjectURL(f)}">`).join('')}</div>` : `<img src="${URL.createObjectURL(share.files[0])}">`;
  else if (it.kind === 'image' && (it.url || share.remote)) top = `<img src="${it.url || share.remote.url}">`;
  else if (it.kind === 'video' && share.files.length) top = `<video src="${URL.createObjectURL(share.files[0])}" muted playsinline></video>`;
  else if (it.kind === 'map' && it.lat != null) top = `<iframe src="https://www.google.com/maps?q=${it.lat},${it.lon}&z=14&output=embed" style="width:100%;height:200px;border:0;display:block" loading="lazy"></iframe>`;
  else top = `<div class="ic">${{ pdf: '📕', web: '🌐', text: '🗒', map: '📍', video: '🎞', file: '📄' }[it.kind] || '📄'}</div>`;
  const sub = it.kind === 'yt' ? 'YouTube' + (it.short ? ' · Shorts' : '') : it.url ? it.url : it.count > 1 ? it.count + ' ملفات' : it.type || '';
  pv.innerHTML = top + `<div class="meta"><b></b><span></span></div>`;
  pv.querySelector('b').textContent = it.title || (it.kind === 'yt' ? 'فيديو يوتيوب' : '');
  pv.querySelector('span').textContent = sub;
  const acts = ACTIONS[it.kind] || ACTIONS.file; action = action && acts.some(a => a[0] === action) ? action : acts[0][0];
  $('#acts').innerHTML = '';
  for (const [k, ic, l, s] of acts) {
    const b = document.createElement('button'); b.className = k === action ? 'on' : '';
    b.innerHTML = `<i>${ic}</i><div><span>${l}</span><small>${s}</small></div>`;
    b.onclick = () => { action = k; render(); }; $('#acts').appendChild(b);
  }
  $('#actT').hidden = acts.length < 2; $('#acts').hidden = acts.length < 2;
  renderDevs();
}
function renderDevs() {
  const box = $('#devs'); box.innerHTML = '';
  const pref = PREFER[action] || [];
  const list = [...devices].sort((a, b) => (pref.indexOf(b.kind) >= 0 || pref.indexOf(b.app) >= 0) - (pref.indexOf(a.kind) >= 0 || pref.indexOf(a.app) >= 0));
  for (const d of list) {
    const b = document.createElement('button'); b.className = 'go';
    b.innerHTML = `<i>${d.app === 'madar' ? '🥽' : d.kind === 'car' ? '🚗' : d.kind === 'tv' ? '📺' : d.kind === 'computer' ? '💻' : '📱'}</i><div><span></span><small></small></div>`;
    b.querySelector('span').textContent = d.app === 'madar' ? 'مدار' : KIND_AR[d.kind] || d.kind;
    b.querySelector('small').textContent = d.name;
    b.onclick = () => send(d); box.appendChild(b);
  }
  const here = document.createElement('button'); here.innerHTML = '<i>📱</i><div><span>هذا الجهاز</span><small>افتحه هنا</small></div>'; here.onclick = () => openHere(); box.appendChild(here);
  const later = document.createElement('button'); later.innerHTML = '<i>🕒</i><div><span>لاحقاً</span><small>يظهر في مدار و DriveCast</small></div>'; later.onclick = () => send(null); box.appendChild(later);
  if (!devices.length) { const n = document.createElement('div'); n.style.cssText = 'grid-column:1/-1;color:var(--dim);font-size:12px;text-align:center;padding:4px'; n.textContent = 'لا أجهزة متصلة الآن — افتح مدار أو DriveCast على الجهاز الآخر، أو اختر «لاحقاً»'; box.prepend(n); }
}
function status(t, cls = '') { const s = $('#status'); s.textContent = t; s.className = cls; }
function progress(p) { const b = $('#bar'); b.style.display = p == null ? 'none' : 'block'; b.firstChild.style.width = Math.round((p || 0) * 100) + '%'; }

// files go to the server once; everything else is just a link
function upload(file) {
  return new Promise((ok, bad) => {
    const x = new XMLHttpRequest();
    x.open('POST', W8 + '/upload?name=' + encodeURIComponent(file.name || 'file'));
    x.setRequestHeader('content-type', file.type || 'application/octet-stream');
    x.upload.onprogress = e => e.lengthComputable && progress(e.loaded / e.total);
    x.onload = () => { try { const r = JSON.parse(x.responseText); r.url ? ok(r) : bad(new Error(r.error || 'upload')); } catch (e) { bad(e); } };
    x.onerror = () => bad(new Error('الشبكة')); x.send(file);
  });
}
async function buildItems() {
  const it = item, base = { kind: it.kind, title: it.title, mode: action };
  if (share.files.length) {
    const out = [];
    for (let i = 0; i < share.files.length; i++) { status(`⬆️ رفع ${i + 1} من ${share.files.length}…`); const r = await upload(share.files[i]); out.push({ ...base, id: r.url, url: r.url, title: share.files[i].name, type: share.files[i].type }); }
    progress(null); return out;
  }
  if (share.remote) return [{ ...base, id: share.remote.url, url: share.remote.url, type: share.remote.type }];
  if (it.kind === 'yt') return [{ ...base, id: it.id, thumb: it.thumb, t: 0 }];
  if (it.kind === 'map') return [{ ...base, id: 'map:' + (it.lat ?? it.url), url: it.url, lat: it.lat, lon: it.lon }];
  if (it.kind === 'text') return [{ ...base, id: 'text:' + Date.now(), text: it.text }];
  return [{ ...base, id: it.url, url: it.url }];
}
async function send(dev) {
  if (busy || !item) return; busy = true;
  try {
    const items = await buildItems();
    for (const x of items) {
      const op = dev ? { op: 'send', to: dev.id, msg: { type: 'open', item: x, now: true } } : { op: 'push', key: 'inbox', item: x, max: 60 };
      const r = await (await fetch(HUB + '/op', { method: 'POST', body: JSON.stringify(op) })).json();
      if (dev && !r.delivered) { await fetch(HUB + '/op', { method: 'POST', body: JSON.stringify({ op: 'push', key: 'inbox', item: x, max: 60 }) }); status('الجهاز لم يستلم — حُفظ في «لاحقاً»', 'err'); busy = false; return; }
    }
    status(dev ? '✓ أُرسل إلى ' + (dev.app === 'madar' ? 'مدار' : KIND_AR[dev.kind] || dev.name) : '✓ حُفظ لوقت لاحق', 'ok');
    try { (await caches.open('madar-share')).keys().then(k => k.forEach(x => caches.open('madar-share').then(c => c.delete(x)))); } catch {}
    setTimeout(() => { if (history.length > 1) history.back(); else window.close(); }, 1400);
  } catch (e) { status('تعذّر: ' + (e.message || e), 'err'); progress(null); }
  busy = false;
}
function openHere() {
  const it = item; if (!it) return;
  if (it.kind === 'map' && it.lat != null) location.href = action === 'nav' ? `https://www.google.com/maps/dir/?api=1&destination=${it.lat},${it.lon}` : `https://www.google.com/maps?q=${it.lat},${it.lon}`;
  else if (it.url) location.href = it.url;
  else if (share.files[0]) location.href = URL.createObjectURL(share.files[0]);
  else if (it.kind === 'text') { try { const u = new SpeechSynthesisUtterance(it.text); u.lang = 'ar-SA'; speechSynthesis.speak(u); } catch {} }
}
async function loadDevices() {
  try { const d = await (await fetch(HUB + '/state')).json(); devices = (d.devices || []).filter(x => x.id && !x.id.startsWith('test-')); $('#conn').textContent = devices.length ? '● ' + devices.length + ' متصل' : '○ لا أجهزة متصلة'; }
  catch { $('#conn').textContent = '○ غير متصل'; }
  renderDevs();
}

$('#manualGo').onclick = () => { const v = $('#manual').value.trim(); if (!v) return; if (/^https?:/.test(v)) share.url = v; else share.text = v; item = classify(); render(); };
await collect();
item = classify();
render();
loadDevices(); setInterval(loadDevices, 8000);
