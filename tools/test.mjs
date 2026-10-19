import { chromium } from 'playwright';
import fs from 'fs';
const bridge = fs.readFileSync('tools/bridge.js', 'utf8').replace("var MADAR = 'https://mazendevloper.github.io';", "var MADAR = 'http://localhost:8000';");
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1000, height: 700 } });
await ctx.addInitScript(bridge);
const p = await ctx.newPage();
const out = [];
const shot = async n => { await p.screenshot({ path: 'out/' + n + '.png' }); out.push('shot ' + n); };
await p.goto('http://localhost:8000/tools/harness.html'); await p.waitForTimeout(9000);
const fr = p.frames().find(f => f.url().includes('dramalive'));
out.push('frame ' + (fr && fr.url()));
await shot('1-start');
const html = await fr.evaluate(() => document.body.innerText.slice(0, 600) + '\n---\n' + [...document.querySelectorAll('button,a,input,[role=button],flt-glass-pane,flutter-view')].slice(0,40).map(e => e.tagName + ' ' + (e.innerText || e.placeholder || e.type || '').slice(0, 40)).join('\n'));
out.push(html);
// center of an element inside the frame, in frame coordinates
const center = async sel => { const h = await fr.$(sel); if (!h) return null; const r = await h.evaluate(e => { const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }); return r; };
const tapText = async re => { const pt = await fr.evaluate(src => { const rx = new RegExp(src, 'i'); const els = [...document.querySelectorAll('button,a,[role=button],input[type=submit],label,div,span')].filter(e => rx.test(e.innerText || e.value || '') && e.offsetParent); const e = els.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length)[0]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, t: (e.innerText || '').slice(0, 30) }; }, re.source); out.push('tapText ' + re + ' -> ' + JSON.stringify(pt)); if (pt) await p.evaluate(pt => send({ type: 'tap', x: pt.x, y: pt.y }), pt); await p.waitForTimeout(3000); };
await tapText(/agree|accept|موافق|continue|ok\b/);
await shot('2-after-agree');
await tapText(/next|التالي|continue/);
await shot('3-after-next');
const inp = await fr.evaluate(() => { const i = [...document.querySelectorAll('input')].find(e => e.offsetParent && /code/i.test(e.placeholder + e.name + e.id + (e.labels?.[0]?.innerText || ''))) || [...document.querySelectorAll('input')].find(e => e.offsetParent); if (!i) return null; const r = i.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, ph: i.placeholder }; });
out.push('input ' + JSON.stringify(inp));
if (inp) { await p.evaluate(pt => send({ type: 'tap', x: pt.x, y: pt.y }), inp); await p.waitForTimeout(800);
  await p.evaluate(() => send({ type: 'text', value: '232425' })); await p.waitForTimeout(800);
  out.push('value ' + await fr.evaluate(() => [...document.querySelectorAll('input')].map(i => i.value).join('|'))); }
await shot('4-typed');
// the go / send arrow: the button right after the field
const go = await fr.evaluate(() => { const i = [...document.querySelectorAll('input')].find(e => e.value === '232425'); if (!i) return null; const all = [...document.querySelectorAll('button,[role=button],svg,img,a')].filter(e => e.offsetParent || e.tagName==='svg'); const ir = i.getBoundingClientRect(); const c = all.map(e => ({ e, r: e.getBoundingClientRect() })).filter(o => o.r.top >= ir.bottom - 2 && o.r.top < ir.bottom + 120 && o.r.width > 10).sort((a, b) => a.r.top - b.r.top)[0]; if (!c) return null; return { x: c.r.left + c.r.width / 2, y: c.r.top + c.r.height / 2, tag: c.e.tagName }; });
out.push('go ' + JSON.stringify(go));
if (go) { await p.evaluate(pt => send({ type: 'tap', x: pt.x, y: pt.y }), go); await p.waitForTimeout(8000); }
await shot('5-after-go');
out.push('messages:\n' + (await p.evaluate(() => log.join('\n'))));
fs.writeFileSync('out/log.txt', out.join('\n'));
await b.close();
