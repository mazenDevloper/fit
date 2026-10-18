// Matches in Madar: today's matches (your teams first), a live "island" at the top of your view for your
// teams' live matches (like the DriveCast APK islands), and goal alerts. Data comes from cplay2's match service.
import * as THREE from 'three';
import { CanvasPanel, glass, text, roundRect, COLORS, blip } from './ui.js';
import { settings, saveSettings } from './config.js';
import { drawIsland, islandWidth, drawWidget, drawGoal, goalDuration, drawClock, setLogoListener } from './matchart.js';

export const SPORTS_ORIGIN = 'https://cplay2.netlify.app';
const MADAR = location.origin;
// Straight from the sources: favourite teams (with their 365Scores ids) from the cloud bin, games from 365Scores.
const BIN = 'https://api.jsonbin.io/v3/b/69c782cbb7ec241ddcb0b99a/latest';
const BIN_KEY = '$2a$10$SYrYv.ct8hiMU9YeUxEQ.ecRkOrTqs.TDchJRV3wW.aKJnDXy2oVy';
const LOGO = id => 'https://imagecache.365scores.com/image/upload/f_png,w_64,h_64,c_limit,q_auto:eco/Competitors/' + id;
async function cloudFavourites() {
  const r = await fetch(BIN, { headers: { 'X-Master-Key': BIN_KEY, 'X-Bin-Meta': 'false' }, cache: 'no-store' });
  if (!r.ok) throw new Error('bin ' + r.status);
  const d = await r.json();
  return ((d.record || d).favoriteTeams || []).filter(t => t && +t.id > 0)
    .map(t => ({ id: +t.id, name: t.name || '', country: t.country || '', island: t.island !== false }));
}
async function direct365(teams) {
  const ids = teams.filter(t => t.id).map(t => t.id);
  if (!ids.length) throw new Error('no ids');
  const u = 'https://webws.365scores.com/web/games/current/?appTypeId=5&langId=27&timezoneName=Asia/Muscat&userCountryId=1&competitors=' + ids.join(',');
  const r = await fetch(u, { cache: 'no-store' });
  if (!r.ok) throw new Error('365 ' + r.status);
  const d = await r.json(), isl = new Set(teams.filter(t => t.island).map(t => t.id)), now = Date.now();
  const out = [];
  for (const g of d.games || []) {
    const h = g.homeCompetitor, a = g.awayCompetitor; if (!h || !a || !g.startTime) continue;
    const grp = g.statusGroup, txt = g.statusText || '';
    if (grp !== 3 && grp !== 4 && /postpon|cancel|abandon|suspend|مؤجل|ملغ/i.test(txt)) continue;
    const status = grp === 3 ? 'live' : grp === 4 ? 'finished' : 'upcoming', t = Date.parse(g.startTime);
    if (status === 'upcoming' && (t - now > 36 * 3.6e6 || now - t > 3 * 3.6e6)) continue;
    if (status === 'finished' && now - t > 8 * 3.6e6) continue;
    const st = status !== 'upcoming', sc = v => st && typeof v === 'number' && v >= 0 ? v : null;
    out.push({ id: '365' + g.id, status, statusText: txt, timestamp: t / 1000,
      home: { id: '' + h.id, name: h.name, logo: LOGO(h.id) }, away: { id: '' + a.id, name: a.name, logo: LOGO(a.id) },
      score: { home: sc(h.score), away: sc(a.score) }, league: { id: '' + g.competitionId, name: g.competitionDisplayName || '' },
      omanTime: new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Muscat' }),
      favorite: isl.has(h.id) || isl.has(a.id), elapsed: status === 'live' && g.gameTime >= 0 ? Math.floor(g.gameTime) : undefined });
  }
  out.sort((x, y) => (y.status === 'live') - (x.status === 'live') || x.timestamp - y.timestamp);
  return { matches: out, source: '365scores' };
}

export class Sports {
  constructor(app) {
    this.app = app; this.data = null; this.version = 0; this.timer = 0; this.last = 0;
    this.scores = new Map();
    this.island = new Island(this);
    app.renderer.overlay.add(this.island.mesh);
    this.goal = new GoalCard(app); app.renderer.overlay.add(this.goal.mesh);
    this.clock = new Clock(app); app.renderer.overlay.add(this.clock.mesh);
    setLogoListener(() => { this.version++; this.island.redraw(); });
  }
  teams() { return settings.myTeams || []; }
  // Your favourite teams from cplay2 (same list as the APK) — read once from cplay2's own storage via a tiny page.
  async syncFavorites() {
    if (this.syncing) return;
    try {
      const teams = await cloudFavourites();
      if (teams.length) { saveSettings({ myTeams: teams }); this.app.renderTeams?.(); this.refresh(true); return; }
    } catch (e) { this.app.log('المفضلة من السحابة: ' + (e && e.message || e)); }
    this.syncing = true;
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-10px;top:-10px';
    f.src = SPORTS_ORIGIN + '/madar-sync.html';
    const done = () => { window.removeEventListener('message', on); f.remove(); this.syncing = false; };
    const on = e => {
      if (e.origin !== SPORTS_ORIGIN || !e.data || e.data.madar !== 1 || e.data.type !== 'favorites') return;
      const teams = (e.data.teams || []).filter(t => t && t.name).map(t => ({ name: t.name, country: t.country || '', island: t.island !== false }));
      if (teams.length) { saveSettings({ myTeams: teams }); this.app.renderTeams?.(); this.refresh(true); }
      done();
    };
    window.addEventListener('message', on);
    setTimeout(done, 12000);
    document.body.appendChild(f);
  }
  async refresh(force) {
    const now = Date.now();
    if (!force && now - this.last < 9000) return;
    this.last = now;
    const teams = this.teams().map(t => t.name + (t.country ? '~' + t.country : '')).join('|');
    try {
      try {   // our server: one small ready file
        const r = await fetch('https://studio.c-p.workers.dev/matches?lang=27', { cache: 'no-store' });
        const d = r.ok && await r.json();
        if (d && Array.isArray(d.matches) && d.teams?.length) {
          if (JSON.stringify(d.teams.map(t => t.id)) !== JSON.stringify(this.teams().map(t => t.id))) { saveSettings({ myTeams: d.teams }); this.app.renderTeams?.(); }
          this.checkGoals(d.matches); this.data = d; this.version++; this.error = null; this.island.redraw(); return;
        }
      } catch (e) {}
      if (!this.teams().some(t => t.id) && !this.binTried) {
        this.binTried = true;
        try { const t = await cloudFavourites(); if (t.length) { saveSettings({ myTeams: t }); this.app.renderTeams?.(); } } catch (e) {}
      }
      if (this.teams().some(t => t.id)) {
        try {
          const d = await direct365(this.teams());
          this.checkGoals(d.matches); this.data = d; this.version++; this.error = null; this.island.redraw(); return;
        } catch (e) { this.app.log('365Scores: ' + (e && e.message || e)); }
      }
      const r = await fetch(SPORTS_ORIGIN + '/api/matches?limit=20' + (teams ? '&teams=' + encodeURIComponent(teams) : ''), { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      if (!d || !Array.isArray(d.matches)) throw new Error('no matches');
      this.checkGoals(d.matches);
      this.data = d; this.version++; this.error = null;
    } catch (e) { this.error = 'تعذّر جلب المباريات'; this.app.log('المباريات: ' + (e && e.message || e)); this.version++; }
    this.island.redraw();
  }
  mine(m) { return m.favorite || this.teams().some(t => [m.home.name, m.away.name].some(n => n && (n.includes(t.name) || t.name.includes(n)))); }
  liveMine() { return (this.data?.matches || []).filter(m => m.status === 'live' && this.mine(m)); }
  checkGoals(list) {
    for (const m of list) {
      const k = m.id, s = (m.score.home ?? 0) + (m.score.away ?? 0), prev = this.scores.get(k);
      if (prev != null && s > prev && m.status === 'live' && (this.mine(m) || settings.allGoals)) {
        const prevM = this.prevById?.get(k);
        const side = prevM && (m.score.away ?? 0) > (prevM.score.away ?? 0) ? 'away' : 'home';
        this.goal.show({ home: m.home.name, away: m.away.name, homeLogo: m.home.logo, awayLogo: m.away.logo, sh: m.score.home ?? 0, sa: m.score.away ?? 0, side, league: m.league?.name || '', minute: m.elapsed ? "د" + m.elapsed : '' });
        blip('open', true); this.app.controls?.rumbleAll?.(0.6, 300);
        this.app.log('هدف: ' + m.home.name + ' ' + m.score.home + '-' + m.score.away + ' ' + m.away.name);
      }
      this.scores.set(k, s);
    }
    this.prevById = new Map(list.map(m => [m.id, m]));
  }
  // Called every frame: poll faster while your team plays.
  update(now, Q) {
    if (!this.app.active) return;
    const live = this.liveMine().length > 0;
    const every = live ? 10000 : (this.app.windows.windows.some(w => w.panelKind === 'matches') || settings.island !== false) ? 120000 : 0;
    if (every && now - this.timer > every) { this.timer = now; this.refresh(true); }
    this.island.update(now, Q);
    this.goal.update(now, Q);
    this.clock.update(now, Q);
  }
}

// The live island: a small pill at the top of your view while your team plays.
// The top bar, pinned like the clock: every live match of your teams (up to 3, one under the other) and the next
// adhan / iqamah / reminder with its countdown (from the DriveCast server).
const ROWS = 4, ROW_H = 0.075;
class Island {
  constructor(sports) {
    this.sports = sports; this.events = []; this.evAt = 0;
    this.panel = new CanvasPanel(0.62, ROW_H * ROWS, (ctx, W, H) => this.draw(ctx, W, H), { pxPerM: 1500 });
    this.panel.mesh.userData.interact = null;
    this.panel.mesh.material.depthTest = false;
    this.panel.mesh.renderOrder = 998;
    this.mesh = this.panel.mesh; this.mesh.visible = false;
    this.events = []; this.evAt = 0;
  }
  redraw() { this.panel.redraw(); }
  async loadEvents() {
    this.evAt = Date.now();
    try {
      const r = await fetch('https://studio.c-p.workers.dev/events', { cache: 'no-store' });
      const d = r.ok && await r.json();
      if (d && Array.isArray(d.events)) { this.events = d.events; this.redraw(); }
    } catch (e) {}
  }
  nextEvent() { const now = Date.now(); return (this.events || []).find(e => e.at > now - 30000); }
  rows() {
    const live = this.sports.liveMine().slice(0, ROWS - 1);
    const ev = settings.prayerBar !== false ? this.nextEvent() : null;
    return { live, ev };
  }
  draw(ctx, W, H) {
    const { live, ev } = this.rows(), rh = H / ROWS, h = rh * 0.8;
    let y = 0;
    for (const m of live) {
      const w = Math.min(W - 8, islandWidth(ctx, m, h, true));
      drawIsland(ctx, (W - w) / 2, y + (rh - h) / 2, w, h, m, performance.now(), { fav: true, expanded: true });
      y += rh;
    }
    if (ev) drawEvent(ctx, W, y + (rh - h) / 2, h, ev);
  }
  update(now, Q) {
    if (now - this.evAt > 10 * 60e3) this.loadEvents();   // the list is today's + tomorrow's: refreshed every 10 min
    const { live, ev } = this.rows();
    const on = settings.island !== false && (live.length > 0 || !!ev) && this.sports.app.active && !this.sports.goal.active;
    this.mesh.visible = on; if (!on) return;
    const every = live.length ? 90 : 1000;   // the score breathes; the countdown ticks each second
    if (now - (this.drawn || 0) > every) { this.drawn = now; this.panel.redraw(); }
    // the first row sits where the single island was; more rows go downwards
    this.mesh.position.set(0, 0.36 - ROW_H * (ROWS - 1) / 2, -1.15).applyQuaternion(Q);
    this.mesh.quaternion.copy(Q);
  }
}

// adhan (blue) / iqamah, reminder (green): name, then a big countdown
function drawEvent(ctx, W, y, h, e) {
  const col = e.kind === 'azan' ? '#60a5fa' : '#34d399';
  const left = Math.max(0, e.at - Date.now()), s = Math.floor(left / 1000);
  const hh = Math.floor(s / 3600), mm = Math.floor(s / 60) % 60, ss = s % 60, p2 = n => String(n).padStart(2, '0');
  const t = left <= 0 ? 'الآن' : hh ? `${hh}:${p2(mm)}:${p2(ss)}` : `${p2(mm)}:${p2(ss)}`;
  ctx.font = `800 ${h * 0.4}px "Thmanyah Sans", system-ui, sans-serif`; const tw = ctx.measureText(e.title).width;
  ctx.font = `900 ${h * 0.6}px system-ui, sans-serif`; const cw = ctx.measureText(t).width;
  const w = Math.min(W - 8, h * 0.9 + tw + cw + h * 1.1), x = (W - w) / 2, r = h / 2;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = 'rgba(0,0,0,0.92)'; ctx.fill();
  ctx.strokeStyle = col + '66'; ctx.lineWidth = h * 0.04; ctx.stroke();
  ctx.beginPath(); ctx.arc(x + r, y + r, h * 0.2, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
  ctx.textBaseline = 'middle'; ctx.direction = 'rtl'; ctx.textAlign = 'right';
  ctx.font = `800 ${h * 0.4}px "Thmanyah Sans", system-ui, sans-serif`; ctx.fillStyle = '#fff';
  ctx.fillText(e.title, x + w - r * 0.8, y + h / 2);
  ctx.direction = 'ltr'; ctx.textAlign = 'center'; ctx.font = `900 ${h * 0.6}px system-ui, sans-serif`;
  ctx.shadowColor = col; ctx.shadowBlur = h * 0.25; ctx.fillStyle = col;
  ctx.fillText(t, x + r * 1.6 + cw / 2, y + h / 2 + h * 0.03); ctx.shadowBlur = 0;
}

// The goal celebration, exactly like the APK: the pill grows into a card, colour wipe, GOAAAL!, then the score
// bar with the scoring digit popping green. Shown at the top of your view.
class GoalCard {
  constructor(app) {
    this.app = app;
    this.panel = new CanvasPanel(0.8, 0.34, (ctx, W, H) => { if (this.g) drawGoal(ctx, W, H, this.g, performance.now() - this.t0); }, { pxPerM: 1300 });
    this.panel.mesh.userData.interact = null; this.panel.mesh.material.depthTest = false; this.panel.mesh.renderOrder = 999;
    this.mesh = this.panel.mesh; this.mesh.visible = false; this.active = false;
  }
  show(g) { this.g = g; this.t0 = performance.now(); this.active = true; }
  update(now, Q) {
    if (!this.active) { this.mesh.visible = false; return; }
    if (now - this.t0 > goalDuration(this.g)) { this.active = false; this.mesh.visible = false; return; }
    this.mesh.visible = true; this.panel.redraw();
    this.mesh.position.set(0, 0.24, -1.2).applyQuaternion(Q);
    this.mesh.quaternion.copy(Q);
  }
}

// A light clock floating at the top of your view.
class Clock {
  constructor(app) {
    this.app = app;
    this.panel = new CanvasPanel(0.14, 0.045, (ctx, W, H) => drawClock(ctx, W, H), { pxPerM: 1500 });
    this.panel.mesh.userData.interact = null; this.panel.mesh.material.depthTest = false; this.panel.mesh.renderOrder = 997;
    this.panel.mesh.material.opacity = 0.75;
    this.mesh = this.panel.mesh; this.mesh.visible = false; this.min = -1;
  }
  update(now, Q) {
    const on = settings.clock !== false && this.app.active;
    this.mesh.visible = on; if (!on) return;
    const m = new Date().getMinutes(); if (m !== this.min) { this.min = m; this.panel.redraw(); }
    this.mesh.position.set(0, 0.45, -1.2).applyQuaternion(Q);
    this.mesh.quaternion.copy(Q);
  }
}

// Draws the matches list onto a panel window's canvas.
export function drawMatches(ctx, W, H, sports) {
  const d = sports?.data;
  if (!d) { ctx.clearRect(0, 0, W, H); drawWidget(ctx, W, H, [], { empty: sports?.error || 'جاري التحميل…' }); return; }
  const mine = sports.teams().length > 0;
  const list = [...d.matches].sort((a, b) => (sports.mine(b) - sports.mine(a)) || ((b.status === 'live') - (a.status === 'live')) || a.timestamp - b.timestamp);
  ctx.clearRect(0, 0, W, H);
  drawWidget(ctx, W, H, list, { heading: mine ? 'مباريات فرقي ⚽' : 'المباريات ⚽', favOf: m => sports.mine(m) });
}
