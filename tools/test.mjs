import fs from 'fs';
const out = [];
const S = 'https://studio.c-p.workers.dev';
for (const p of ['/', '/push/key']) { try { const r = await fetch(S + p); out.push(p + ' ' + r.status + ' ' + (await r.text()).slice(0, 200)); } catch (e) { out.push(p + ' ERR ' + e.message); } }
try { const r = await fetch(S + '/ask', { method: 'POST', body: JSON.stringify({ q: 'متى المباراة القادمة لفريقي؟' }) }); out.push('/ask ' + r.status + ' ' + (await r.text()).slice(0, 400)); } catch (e) { out.push('/ask ERR ' + e.message); }
try { const r = await fetch(S + '/ask', { method: 'POST', body: JSON.stringify({ q: 'افتح يوتيوب' }) }); out.push('/ask2 ' + r.status + ' ' + (await r.text()).slice(0, 300)); } catch (e) { out.push('/ask2 ERR ' + e.message); }
await new Promise(res => {
  const ws = new WebSocket(S.replace('https', 'wss') + '/live?lang=27'); const t0 = Date.now();
  ws.onopen = () => out.push('ws open ' + (Date.now() - t0) + 'ms');
  ws.onmessage = e => { out.push('ws msg ' + (Date.now() - t0) + 'ms ' + String(e.data).slice(0, 160)); };
  ws.onerror = e => out.push('ws err ' + (e.message || ''));
  setTimeout(() => { ws.close(); res(); }, 25000);
});
fs.writeFileSync('out/server.txt', out.join('\n'));
