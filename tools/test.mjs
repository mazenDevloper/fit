import fs from 'fs';
const out = [];
const j = async u => { const r = await fetch(u); out.push(u + ' ' + r.status + ' acao=' + r.headers.get('access-control-allow-origin')); return r.json(); };
const h = await j('https://api.polyhaven.com/assets?t=hdris');
const ids = Object.keys(h); out.push('hdris ' + ids.length + ' ' + JSON.stringify(h[ids[0]]).slice(0, 400));
const f = await j('https://api.polyhaven.com/files/' + ids[0]); out.push(JSON.stringify(f).slice(0, 1500));
const m = await j('https://api.polyhaven.com/assets?t=models'); const mid = Object.keys(m)[0]; out.push('models ' + Object.keys(m).length);
const mf = await j('https://api.polyhaven.com/files/' + mid); out.push(JSON.stringify(mf.gltf?.['1k']).slice(0, 800));
for (const u of [f.tonemapped?.url, f.hdri?.['2k']?.hdr?.url, 'https://cdn.polyhaven.com/asset_img/thumbs/' + ids[0] + '.png?width=256']) { if (!u) continue; const r = await fetch(u, { method: 'HEAD' }); out.push('HEAD ' + u + ' ' + r.status + ' ' + r.headers.get('content-length') + ' acao=' + r.headers.get('access-control-allow-origin')); }
out.push(JSON.stringify(await (await fetch('https://api.polyhaven.com/categories/hdris')).json()));
fs.writeFileSync('out/server.txt', out.join('\n'));
