import fs from 'fs';
const out = [], S = 'https://studio.c-p.workers.dev';
for (const p of ['/turn', '/f/assets/helmet.glb', '/ipa/madar']) { try { const t = Date.now(); const r = await fetch(S + p); const b = await r.arrayBuffer(); out.push(p + ' ' + r.status + ' ' + b.byteLength + 'B ' + (Date.now() - t) + 'ms ' + (p === '/turn' ? new TextDecoder().decode(b).slice(0, 200) : '')); } catch (e) { out.push(p + ' ERR ' + e.message); } }
{ const t = Date.now(); const r = await fetch(S + '/ipa/madar'); const b = await r.arrayBuffer(); out.push('again /ipa/madar ' + r.status + ' ' + b.byteLength + 'B ' + (Date.now() - t) + 'ms'); }
fs.writeFileSync('out/server.txt', out.join('\n'));
