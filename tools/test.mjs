import { chromium } from 'playwright';
import fs from 'fs';
const log = [];
const b = await chromium.launch({ channel: 'chrome', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
// a fake «iPhone»: a moving test picture, H.264 with WebCodecs, the same frames the iPhone extension sends
const snd = await (await b.newContext()).newPage(); snd.on('console', m => log.push('SND ' + m.text()));
await snd.goto('https://studio.c-p.workers.dev/');
await snd.evaluate(async () => {
  const c = new OffscreenCanvas(590, 1280), x = c.getContext('2d');
  const ws = new WebSocket('wss://studio.c-p.workers.dev/screen/send?room=testphone1&name=' + encodeURIComponent('آيفون تجريبي') + '&pin=123456');
  ws.binaryType = 'arraybuffer'; await new Promise(r => ws.onopen = r);
  let force = true; ws.onmessage = e => { if (e.data === 'key') force = true; };
  const pack = (k, t, d) => { const b = new Uint8Array(9 + d.byteLength); b[0] = k; new DataView(b.buffer).setBigUint64(1, BigInt(t)); b.set(new Uint8Array(d), 9); ws.send(b); };
  let sentCfg = false;
  const enc = new VideoEncoder({ output: (ch, meta) => { if (meta?.decoderConfig?.description && !sentCfg) { pack(0, 0, meta.decoderConfig.description); sentCfg = true; } const d = new ArrayBuffer(ch.byteLength); ch.copyTo(d); pack(ch.type === 'key' ? 1 : 2, ch.timestamp, d); }, error: e => console.log('enc ' + e.message) });
  enc.configure({ codec: 'avc1.4d0028', width: 590, height: 1280, bitrate: 2e6, framerate: 30, avc: { format: 'avc' } });
  let i = 0;
  setInterval(() => {
    x.fillStyle = `hsl(${i * 3 % 360},60%,35%)`; x.fillRect(0, 0, 590, 1280);
    x.fillStyle = '#fff'; x.font = 'bold 70px sans-serif'; x.fillText('iPhone ' + i, 60, 300); x.fillText(new Date().toLocaleTimeString(), 60, 420);
    x.fillStyle = '#34d399'; x.beginPath(); x.arc(295, 800 + Math.sin(i / 8) * 200, 80, 0, 7); x.fill();
    const f = new VideoFrame(c, { timestamp: i * 33333 }); enc.encode(f, { keyFrame: force || i % 90 === 0 }); force = false; f.close(); i++;
  }, 33);
  window.__ok = 1;
});
await snd.waitForTimeout(2000);
const ctx = await b.newContext({ viewport: { width: 1400, height: 800 }, permissions: ['camera', 'microphone'] });
const p = await ctx.newPage(); p.on('pageerror', e => log.push('PE ' + e.message));
await p.addInitScript(() => { try { if (!sessionStorage.getItem('i')) { sessionStorage.setItem('i', '1'); localStorage.setItem('madar.settings.v1', JSON.stringify({ v: 7, viewMode: 'desktop', environment: 'night', island: false, sounds: false, dwell: false })); localStorage.setItem('madar.firstRun', '1'); } } catch (e) {} });
await p.goto('https://mazendevloper.github.io/fit/?v=' + Date.now(), { waitUntil: 'load', timeout: 60000 }); await p.waitForTimeout(3000);
log.push('has iphone ' + await p.evaluate(() => !!window.madar.iphone));
await p.evaluate(() => window.madar.enter()); await p.waitForTimeout(9000);
await p.screenshot({ path: 'out/ip1-notify.png' });
log.push('list ' + await p.evaluate(async () => JSON.stringify(await window.madar.iphone.list())));
await p.evaluate(() => window.madar.iphone.pick()); await p.waitForTimeout(7000);
await p.screenshot({ path: 'out/ip2-window.png' });
log.push('logs ' + await p.evaluate(() => JSON.parse(localStorage.getItem('madar.log') || '[]').slice(-6).join(' | ')));
await b.close();
fs.writeFileSync('out/server.txt', log.join('\n'));
