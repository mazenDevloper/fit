import fs from 'fs';
const out = [];
const j = async u => (await fetch(u)).json();
const ind = await j('https://api.polyhaven.com/assets?t=hdris&c=indoor');
out.push('INDOOR ' + Object.entries(ind).map(([k, v]) => k + '[' + (v.tags || []).slice(0, 5).join(',') + ']').join(' ; '));
const all = await j('https://api.polyhaven.com/assets?t=hdris');
const want = /city|skyline|rooftop|sea|beach|harbo|mountain|balcony|lake|desert|snow|night|sunset|park|garden|cliff|coast|bridge|tower/;
out.push('VIEWS ' + Object.entries(all).filter(([k, v]) => (v.tags || []).some(t => want.test(t))).sort((a, b) => (b[1].download_count || 0) - (a[1].download_count || 0)).slice(0, 90).map(([k, v]) => k + '[' + (v.tags || []).slice(0, 4).join(',') + ']').join(' ; '));
const cat = await j('https://commons.wikimedia.org/w/api.php?action=query&generator=categorymembers&gcmtitle=Category:360-degree_videos&gcmtype=file&gcmlimit=200&prop=videoinfo&viprop=url|size|mime|derivatives&format=json&origin=*');
for (const p of Object.values(cat.query?.pages || {})) {
  const v = (p.videoinfo || [])[0] || {};
  const mp4 = (v.derivatives || []).filter(d => /mp4|quicktime/.test(d.type)).map(d => d.height).join('/');
  out.push('C360 ' + p.title + ' | ' + v.width + 'x' + v.height + ' | ' + v.mime + ' | dur ' + Math.round(v.duration || 0) + ' | mp4:' + mp4 + ' | size ' + Math.round((v.size || 0) / 1e6) + 'MB');
}
const sub = await j('https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:360-degree_videos&cmtype=subcat&cmlimit=100&format=json&origin=*');
out.push('SUBCATS ' + (sub.query?.categorymembers || []).map(c => c.title).join(' ; '));
const head = async u => { try { const r = await fetch(u, { method: 'HEAD' }); return r.status + ' acao=' + r.headers.get('access-control-allow-origin') + ' len=' + r.headers.get('content-length'); } catch (e) { return 'ERR ' + e.message; } };
const nasa = await j('https://images-api.nasa.gov/asset/JPL-20240329-MSLf-0001-Curiosity_Reaches_Gediz_Vallis_Channel_360_8k');
const items = (nasa.collection?.items || []).map(i => i.href);
out.push('NASA assets ' + items.join(' ; '));
for (const u of items.filter(x => /\.mp4$/i.test(x)).slice(0, 3)) out.push('NASA HEAD ' + u + ' -> ' + await head(u));
fs.writeFileSync('out/server.txt', out.join('\n'));
