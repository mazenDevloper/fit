// Matches in Madar: today's matches (your teams first), a live "island" at the top of your view for your
// teams' live matches (like the DriveCast APK islands), and goal alerts. Data comes from cplay2's match service.
import * as THREE from 'three';
import { CanvasPanel, glass, text, roundRect, COLORS, blip } from './ui.js';
import { settings, saveSettings } from './config.js';
import { drawIsland, islandWidth, drawWidget, drawGoal, goalDuration, drawClock, setLogoListener } from './matchart.js';

export const SPORTS_ORIGIN = 'https://cplay2.netlify.app';
const MADAR = location.origin;

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
  syncFavorites() {
    if (this.syncing) return; this.syncing = true;
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
    if (!force && now - this.last < 25000) return;
    this.last = now;
    const teams = this.teams().map(t => t.name + (t.country ? '~' + t.country : '')).join('|');
    try {
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
    const every = live ? 30000 : (this.app.windows.windows.some(w => w.panelKind === 'matches') || settings.island !== false) ? 90000 : 0;
    if (every && now - this.timer > every) { this.timer = now; this.refresh(true); }
    this.island.update(now, Q);
    this.goal.update(now, Q);
    this.clock.update(now, Q);
  }
}

// The live island: a small pill at the top of your view while your team plays.
class Island {
  constructor(sports) {
    this.sports = sports;
    this.panel = new CanvasPanel(0.62, 0.075, (ctx, W, H) => this.draw(ctx, W, H), { pxPerM: 1500 });
    this.panel.mesh.userData.interact = null;
    this.panel.mesh.material.depthTest = false;
    this.panel.mesh.renderOrder = 998;
    this.mesh = this.panel.mesh; this.mesh.visible = false;
    this.idx = 0; this.flip = 0;
  }
  redraw() { this.panel.redraw(); }
  draw(ctx, W, H) {
    const live = this.sports.liveMine(); if (!live.length) return;
    const m = live[this.idx % live.length];
    // The APK's island: black glass pill, red minute badge, round logos, the score glowing emerald.
    const h = H * 0.8, w = Math.min(W - 8, islandWidth(ctx, m, h, true));
    drawIsland(ctx, (W - w) / 2, (H - h) / 2, w, h, m, performance.now(), { fav: true, expanded: true });
  }
  update(now, Q) {
    const on = settings.island !== false && this.sports.liveMine().length > 0 && this.sports.app.active && !this.sports.goal.active;
    this.mesh.visible = on; if (!on) return;
    if (now - this.flip > 6000) { this.flip = now; this.idx++; }
    if (now - (this.drawn || 0) > 90) { this.drawn = now; this.panel.redraw(); }   // the score breathes
    this.mesh.position.set(0, 0.36, -1.15).applyQuaternion(Q);
    this.mesh.quaternion.copy(Q);
  }
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
