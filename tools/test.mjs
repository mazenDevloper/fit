// v88 live check: the published site with the real APIs (quran.com, tafsir, recitations, Poly Haven, the worker)
import { chromium } from 'playwright';
import fs from 'fs';
const SITE = 'https://mazendevloper.github.io/fit/';
const W8 = 'https://studio.c-p.workers.dev';
const log = [];
const L = (...a) => { const s = a.join(' '); log.push(s); console.log(s); };
const save = () => fs.writeFileSync('out/live88.txt', log.join('\n'));
fs.mkdirSync('out', { recursive: true });

// 1) the worker's new routes
const probe = async (k, u, h = {}) => {
  try {
    const r = await fetch(u, { headers: { Origin: 'https://mazendevloper.github.io', 'User-Agent': 'Mozilla/5.0', ...h }, signal: AbortSignal.timeout(30000) });
    const t = h.Range ? '' : (await r.text()).slice(0, 600);
    if (h.Range) try { r.body?.cancel(); } catch {}
    L(k, r.status, 'acao=' + r.headers.get('access-control-allow-origin'), 'ct=' + r.headers.get('content-type'), 'cr=' + r.headers.get('content-range'), 'len=' + r.headers.get('content-length'), t.replace(/\s+/g, ' '));
  } catch (e) { L(k, 'ERR', e.message); }
};
save();

// 2) wait for v88 to be published
for (let i = 0; i < 40; i++) {
  try { const t = await (await fetch(SITE + 'js/app.js?x=' + Date.now())).text(); if (t.includes("APP_VERSION = '90'")) { L('live v90 after', i * 15, 's'); break; } } catch {}
  await new Promise(r => setTimeout(r, 15000));
}

const b = await chromium.launch({ channel: 'chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const ctx = await b.newContext({ viewport: { width: 1400, height: 800 }, locale: 'ar', serviceWorkers: 'block', permissions: ['camera', 'microphone'] });
const p = await ctx.newPage();
p.on('pageerror', e => L('PE', e.message));
p.on('console', m => { if (m.type() === 'error' && !/peerjs|ERR_|404|favicon/.test(m.text())) L('CE', m.text().slice(0, 200)); if (/TEST/.test(m.text())) L(m.text().slice(0, 400)); });
const shot = async n => { await p.screenshot({ path: 'out/' + n + '.png' }); L('shot', n); save(); };
const wait = ms => p.waitForTimeout(ms);
// open the app in an environment (fresh settings each time)
async function scene(env, extra = {}) {
  await p.goto(SITE + '?v=' + Date.now(), { waitUntil: 'load', timeout: 90000 }); await wait(1500);
  await p.evaluate(([env, extra]) => { localStorage.setItem('madar.settings.v1', JSON.stringify({ v: 7, viewMode: 'desktop', environment: env, clock: false, prayerBar: false, island: false, sounds: false, dwell: false, ambient: 'off', ...extra })); localStorage.setItem('madar.firstRun.v1', '1'); localStorage.setItem('madar.firstRun', '1'); localStorage.removeItem('madar.windows.v1'); }, [env, extra]);
  await p.goto(SITE + '?v=' + Date.now(), { waitUntil: 'load', timeout: 90000 });
  await wait(3000);
  await p.evaluate(() => window.madar.enter()); await wait(5000);
  L('in-mr', env, await p.evaluate(() => document.body.classList.contains('in-mr')));
  await p.evaluate(() => { const a = window.madar; for (const w of [...a.windows.windows]) a.windows.close(w); });
  await wait(800);
}
const run = async (name, f) => { try { await f(); } catch (e) { L('FAIL', name, e.message.split('\n')[0]); save(); } };
const ev = (code, arg) => p.evaluate(new Function('arg', 'return (async () => {' + code + '})()'), arg);

await run('shelf', async () => {
  await scene('reading');
  await ev(`await window.madar.readWeb('https://ar.wikipedia.org/wiki/%D8%A7%D9%84%D9%82%D9%85%D8%B1'); await new Promise(r => setTimeout(r, 6000)); const a = window.madar; for (const w of [...a.windows.windows]) a.windows.close(w); a.openShelf(); await new Promise(r => setTimeout(r, 5000));`);
  await shot('b2-shelf');
});
await run('gallery', async () => {
  await scene('nightOffice');
  await ev(`window.madar.gallery.open('rooms');`); await wait(5000); await shot('g1-rooms');
});
// --- the coach: muscles, band, push-up, boxing, eyes, treadmill
const coach = async (env, mode, code, name, pitch = 0.3) => {
  await scene(env, { hasBand: true, coachVoice: false });
  await ev(`const a = window.madar; a.openCoach(arg); await new Promise(r => setTimeout(r, 12000)); window.madar.debugPitch = ${pitch};`, mode);
  await ev(code); await wait(4000); await shot(name);
};
const pose = (ex, ph, yaw) => `const w = window.madar.windows.windows.find(x => x.kind === 'coach'); w.choose('${ex}'); ${yaw != null ? `w.figure.yaw.rotation.y = ${yaw};` : ''} w.state = 'run'; const u = w.update; w.update = function (dt, now) { this.phase = ${ph}; u.call(this, dt, now); this.phase = ${ph}; }; console.log('TEST coach', w.loaded);`;
await run('coach', async () => {
  await coach('viewOffice', 'train', pose('squat', 0.45, -1.1), 'c1-squat');
  await coach('viewOffice', 'train', pose('curl', 0.45, -0.4), 'c2-band-curl');
  await coach('library', 'train', pose('pushup', 0.45), 'c3-pushup');
  await coach('viewOffice', 'train', pose('lunge', 0.27, -1.2), 'c4-lunge');
  await coach('viewOffice', 'train', pose('press', 0.45, 0.3), 'c4b-press');
  await coach('viewOffice', 'train', `const w = window.madar.windows.windows.find(x => x.kind === 'coach'); w.openMenu();`, 'c5-menu');
  await coach('gaming', 'box', `const w = window.madar.windows.windows.find(x => x.kind === 'coach'); w.train.start(); for (let i = 0; i < 3; i++) w.train.spawn(); w.train.pads.forEach(p => p.mesh.scale.setScalar(1)); w.train.state = 'ready'; w.train.score = 230; w.train.combo = 6;`, 'c6-boxing', 0.1);
  await coach('gym', 'train', `window.madar.debugYaw = 0.32; window.madar.debugPitch = 0.12; const a = window.madar; a.windows.close(a.windows.windows.find(x => x.kind === 'coach'));`, 'e-gym', 0.12);
});
await b.close();
save();
