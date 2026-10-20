import fs from 'fs';
const out = [], S = 'https://studio.c-p.workers.dev', BIN = '69c782cbb7ec241ddcb0b99a';
for (let i = 0; i < 2; i++) { const t = Date.now(); const r = await fetch(S + '/bin/' + BIN); const b = await r.text(); out.push('bin ' + r.status + ' ' + r.headers.get('x-from') + ' ' + b.length + 'B ' + (Date.now() - t) + 'ms'); }
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const up = await (await fetch(S + '/upload', { method: 'POST', headers: { 'content-type': 'image/png' }, body: png })).json(); out.push('upload ' + JSON.stringify(up));
if (up.url) { const r = await fetch(up.url); out.push('get upload ' + r.status + ' ' + r.headers.get('content-type')); }
const ws = new WebSocket('wss://studio.c-p.workers.dev/live?lang=1'); await new Promise(r => { ws.onmessage = e => { out.push('ws ' + String(e.data).slice(0, 80)); r(); }; setTimeout(r, 15000); }); ws.close();
const site = await fetch('https://drivecast.c-p.workers.dev/settings'); out.push('site ' + site.status);
fs.writeFileSync('out/server.txt', out.join('\n'));
