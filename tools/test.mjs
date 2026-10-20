import { chromium } from 'playwright';
import fs from 'fs';
const log = [];
const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const shot = async (p, n) => { await p.screenshot({ path: 'out/' + n + '.png' }); log.push('shot ' + n); };
// ---------- DriveCast ----------
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 }, locale: 'ar' });
  const p = await ctx.newPage(); p.on('pageerror', e => log.push('DC PE ' + e.message));
  await p.goto('https://drivecast.c-p.workers.dev/matches', { waitUntil: 'domcontentloaded', timeout: 60000 }); await p.waitForTimeout(12000);
  await shot(p, 'dc1-matches');
  await p.evaluate(() => window.dispatchEvent(new CustomEvent('native-voice', { detail: 'متى مباراة فريقي القادمة؟' })));
  await p.waitForTimeout(9000); await shot(p, 'dc2-assistant');
  await p.evaluate(() => window.dispatchEvent(new CustomEvent('goal-celebration-test'))); await p.waitForTimeout(1800); await shot(p, 'dc3-goal');
  await p.goto('https://drivecast.c-p.workers.dev/settings', { waitUntil: 'domcontentloaded', timeout: 60000 }); await p.waitForTimeout(8000);
  const tab = p.getByText('كرة القدم', { exact: false }).first(); if (await tab.count()) { await tab.click().catch(() => {}); await p.waitForTimeout(2500); }
  const card = p.getByText('تنبيهات المباريات').first(); if (await card.count()) await card.scrollIntoViewIfNeeded().catch(() => {});
  await p.waitForTimeout(1000); await shot(p, 'dc4-settings-alerts');
  log.push('dc ws: ' + await p.evaluate(() => performance.getEntriesByType('resource').some(r => r.name.includes('studio.c-p.workers.dev'))));
  await ctx.close();
} catch (e) { log.push('DC ERR ' + e.message); }
// ---------- Madar ----------
try {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 800 }, permissions: ['camera', 'microphone'] });
  const p = await ctx.newPage(); p.on('pageerror', e => log.push('MD PE ' + e.message));
  await p.addInitScript(() => { try { if (!sessionStorage.getItem('i')) { sessionStorage.setItem('i', '1'); localStorage.setItem('madar.settings.v1', JSON.stringify({ v: 7, viewMode: 'desktop', environment: 'realStudio', clock: true, prayerBar: true, island: true, sounds: false, dwell: false })); localStorage.setItem('madar.firstRun', '1'); } } catch (e) {} });
  await p.goto('https://mazendevloper.github.io/fit/', { waitUntil: 'load', timeout: 60000 }); await p.waitForTimeout(4000);
  log.push('madar version ' + await p.evaluate(() => document.body.innerText.match(/v\s?\d{2}|\b7\d\b/)?.[0] || ''));
  await p.evaluate(() => window.madar.enter()); await p.waitForTimeout(9000);
  await shot(p, 'md1-live-island');
  await p.evaluate(() => window.madar.control.open()); await p.waitForTimeout(1500); await shot(p, 'md2-control-center');
  await p.evaluate(() => window.madar.control.close());
  await p.evaluate(async () => { await window.madar.askAssistant('متى مباراة فريقي القادمة؟'); const n = window.madar.notifier; n.grow = 1; n.seen = true; n.lastLook = performance.now() + 60000; n.panel.redraw(); n.mesh.position.set(0.2, 0.12, -1.0); n.mesh.lookAt(0, 0.12, 0); });
  await p.waitForTimeout(1500); await shot(p, 'md3-assistant');
  await p.evaluate(() => { const a = window.madar; a.notifier.next(); a.notifier.mesh.visible = false; const L = a.launcher; L.open(); L.setTab('settings'); });
  await p.waitForTimeout(1500); await shot(p, 'md4-settings');
  await p.evaluate(() => { const a = window.madar; a.launcher.close(); a.windows.open({ kind: 'panel', panel: 'scoreboard' }); });
  await p.waitForTimeout(4000); await shot(p, 'md5-scoreboard');
  log.push('md socket: ' + await p.evaluate(() => window.madar.sports.ws?.readyState));
  log.push('md log: ' + await p.evaluate(() => (window.madar.logs || []).slice?.(-8).join(' | ')));
  await ctx.close();
} catch (e) { log.push('MD ERR ' + e.message); }
await b.close();
fs.writeFileSync('out/server.txt', log.join('\n'));
