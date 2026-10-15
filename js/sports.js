// Matches in Madar: today's matches (your teams first), a live "island" at the top of your view for your
// teams' live matches (like the DriveCast APK islands), and goal alerts. Data comes from cplay3's match service.
import * as THREE from 'three';
import { CanvasPanel, glass, text, roundRect, COLORS, blip } from './ui.js';
import { settings, saveSettings } from './config.js';

export const SPORTS_ORIGIN = 'https://cplay3.netlify.app';
const MADAR = location.origin;

export class Sports {
  constructor(app) {
    this.app = app; this.data = null; this.version = 0; this.timer = 0; this.last = 0;
    this.scores = new Map();
    this.island = new Island(this);
    app.renderer.overlay.add(this.island.mesh);
  }
  teams() { return settings.myTeams || []; }
  // Your favourite teams from cplay3 (same list as the APK) — read once from cplay3's own storage via a tiny page.
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
    } catch (e) { this.error = 'تعذّر جلب المباريات'; this.version++; }
    this.island.redraw();
  }
  mine(m) { return m.favorite || this.teams().some(t => [m.home.name, m.away.name].some(n => n && (n.includes(t.name) || t.name.includes(n)))); }
  liveMine() { return (this.data?.matches || []).filter(m => m.status === 'live' && this.mine(m)); }
  checkGoals(list) {
    for (const m of list) {
      const k = m.id, s = (m.score.home ?? 0) + (m.score.away ?? 0), prev = this.scores.get(k);
      if (prev != null && s > prev && m.status === 'live' && (this.mine(m) || settings.allGoals)) {
        this.app.toast('⚽ هدف! ' + m.home.name + ' ' + m.score.home + ' - ' + m.score.away + ' ' + m.away.name, 7000);
        blip('open', true); this.app.controls?.rumbleAll?.(0.6, 300);
        this.app.log('هدف: ' + m.home.name + ' ' + m.score.home + '-' + m.score.away + ' ' + m.away.name);
      }
      this.scores.set(k, s);
    }
  }
  // Called every frame: poll faster while your team plays.
  update(now, Q) {
    if (!this.app.active) return;
    const live = this.liveMine().length > 0;
    const every = live ? 30000 : (this.app.windows.windows.some(w => w.panelKind === 'matches') || settings.island !== false) ? 90000 : 0;
    if (every && now - this.timer > every) { this.timer = now; this.refresh(true); }
    this.island.update(now, Q);
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
    glass(ctx, 2, 2, W - 4, H - 4, (H - 4) / 2, true);
    ctx.beginPath(); ctx.arc(W - H * 0.5, H / 2, H * 0.12, 0, 7); ctx.fillStyle = '#ff4d5e'; ctx.fill();
    const score = (m.score.home ?? 0) + ' - ' + (m.score.away ?? 0);
    text(ctx, m.home.name, W * 0.68, H / 2 + 2, H * 0.34, { weight: 800, maxWidth: W * 0.28, dir: 'auto' });
    text(ctx, score, W * 0.45, H / 2 + 2, H * 0.44, { weight: 900, dir: 'ltr', color: '#ffffff' });
    text(ctx, m.away.name, W * 0.22, H / 2 + 2, H * 0.34, { weight: 800, maxWidth: W * 0.24, dir: 'auto' });
    text(ctx, m.statusText || (m.elapsed ? m.elapsed + "'" : ''), H * 0.85, H / 2 + 2, H * 0.28, { color: '#7cf0a8', weight: 800, dir: 'ltr' });
  }
  update(now, Q) {
    const on = settings.island !== false && this.sports.liveMine().length > 0 && this.sports.app.active;
    this.mesh.visible = on; if (!on) return;
    if (now - this.flip > 6000) { this.flip = now; this.idx++; this.panel.redraw(); }
    this.mesh.position.set(0, 0.36, -1.15).applyQuaternion(Q);
    this.mesh.quaternion.copy(Q);
  }
}

// Draws the matches list onto a panel window's canvas.
export function drawMatches(ctx, W, H, sports) {
  const d = sports?.data;
  text(ctx, 'المباريات', W - 70, 92, 72, { align: 'right', weight: 800 });
  const teams = sports?.teams() || [];
  text(ctx, teams.length ? 'فرقي: ' + teams.map(t => t.name).slice(0, 6).join('، ') : 'أضف فرقك من الشاشة الرئيسية أو افتح cplay3 مرة لمزامنتها', W - 70, 160, 34, { align: 'right', color: '#d5ddef', weight: 600, maxWidth: W - 140 });
  if (!d) { text(ctx, sports?.error || 'جاري التحميل…', W / 2, H / 2, 48, { weight: 700 }); return; }
  const list = [...d.matches].sort((a, b) => (sports.mine(b) - sports.mine(a)) || ((b.status === 'live') - (a.status === 'live')) || a.timestamp - b.timestamp).slice(0, 8);
  if (!list.length) { text(ctx, 'لا مباريات مهمة اليوم', W / 2, H / 2, 48, { weight: 700 }); return; }
  const top = 210, rh = (H - top - 30) / Math.max(6, list.length);
  list.forEach((m, i) => {
    const y = top + i * rh, mine = sports.mine(m), live = m.status === 'live';
    roundRect(ctx, 50, y + 6, W - 100, rh - 12, 26);
    ctx.fillStyle = live ? 'rgba(255,77,94,0.16)' : mine ? 'rgba(124,196,255,0.12)' : 'rgba(255,255,255,0.04)'; ctx.fill();
    const cy = y + rh / 2;
    const mid = live || m.status === 'finished' ? (m.score.home ?? 0) + ' - ' + (m.score.away ?? 0) : m.omanTime;
    text(ctx, m.home.name, W * 0.66, cy - 8, rh * 0.3, { weight: 800, maxWidth: W * 0.27, dir: 'auto' });
    text(ctx, mid, W * 0.47, cy - 8, rh * 0.36, { weight: 900, dir: 'ltr', color: live ? '#ff8a96' : '#ffffff' });
    text(ctx, m.away.name, W * 0.28, cy - 8, rh * 0.3, { weight: 800, maxWidth: W * 0.27, dir: 'auto' });
    text(ctx, (mine ? '★ ' : '') + (m.league?.name || '') + (live ? ' · ' + (m.statusText || '') : m.status === 'finished' ? ' · انتهت' : ''), W / 2, cy + rh * 0.28, rh * 0.2, { color: COLORS.dim, maxWidth: W - 160, dir: 'auto' });
  });
}
