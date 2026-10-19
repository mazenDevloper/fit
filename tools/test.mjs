import { chromium } from 'playwright';
import fs from 'fs';
const bridge = fs.readFileSync('tools/bridge.js', 'utf8').replace("var MADAR = 'https://mazendevloper.github.io';", "var MADAR = 'http://localhost:8000';");
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1000, height: 700 } });
await ctx.addInitScript(bridge);
const p = await ctx.newPage();
const out = [];
const shot = async n => { await p.screenshot({ path: 'out/' + n + '.png' }); };
const tap = async (x, y, wait = 2500) => { await p.evaluate(pt => send({ type: 'tap', x: pt[0], y: pt[1] }), [x, y]); await p.waitForTimeout(wait); };
await p.goto('http://localhost:8000/tools/harness.html'); await p.waitForTimeout(9000);
const fr = p.frames().find(f => f.url().includes('dramalive'));
await shot('1-start');
await tap(245, 607); await shot('2-checked');
await tap(742, 607, 6000); await shot('3-page2');
const steps = JSON.parse(fs.readFileSync('tools/steps.json', 'utf8'));
let i = 4;
for (const s of steps) {
  if (s.tap) await tap(s.tap[0], s.tap[1], s.wait || 2500);
  if (s.text) { await p.evaluate(v => send({ type: 'text', value: v }), s.text); await p.waitForTimeout(1500); }
  out.push(i + ' ' + JSON.stringify(s) + ' active=' + await fr.evaluate(() => { const a = document.activeElement; return a ? a.tagName + ':' + (a.value ?? '') : '-'; }));
  await shot(i++ + '-step');
}
out.push('messages:\n' + (await p.evaluate(() => log.join('\n'))));
fs.writeFileSync('out/log.txt', out.join('\n'));
await b.close();
