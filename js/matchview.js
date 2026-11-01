// «مركز المباراة»: two glass panels wrapped around the match you watch (the HDMI screen, a channel or a site) -
// on the left the match itself: score, minute, and tabs for the events (goals, cards, substitutions), the
// statistics and the line-ups; on the right your other matches, live first - pick one to follow it on the left.
import { CanvasPanel, blip, panelGlass } from './ui.js';
import { label, SYS } from './vos.js';
import { settings } from './config.js';

const PW = 0.66, GAP = 0.13, ANG = 0.32, PX = 1100, SRV = 'https://studio.c-p.workers.dev';
const ICON = { goal: '⚽', yellow: '🟨', red: '🟥', sub: '🔁' };

export class MatchView {
  constructor(win, app) {
    this.isMatch = true; this.win = win; this.app = app; this.tab = 'events'; this.det = null; this.sel = null; this.off = 0;
    this.L = this.panel('L'); this.R = this.panel('R'); this.place();
    this.pick(); this.load(); this.timer = setInterval(() => this.load(), 30000);
    win.mgr.refreshTargets();
  }
  panel(side) {
    const p = new CanvasPanel(PW, this.win.h, (ctx, W, H, pp) => side === 'L' ? this.drawL(ctx, W, H, pp) : this.drawR(ctx, W, H, pp), { pxPerM: PX });
    p.mesh.material.depthWrite = false;
    this.win.group.add(p.mesh);
    return p;
  }
  place() {
    const x = 0.5 + GAP + Math.cos(ANG) * PW / 2, z = Math.sin(ANG) * PW / 2;
    this.L.mesh.position.set(-x, 0, z); this.L.mesh.rotation.y = ANG;
    this.R.mesh.position.set(x, 0, z); this.R.mesh.rotation.y = -ANG;
  }
  get matches() { return this.app.sports?.data?.matches || []; }
  // the match to follow: the one you chose, else a live one of your island teams, else live, else the next one
  pick() {
    const ms = this.matches;
    if (this.sel && ms.some(m => m.id === this.sel)) return;
    const live = ms.filter(m => m.status === 'live');
    this.sel = (live.find(m => m.favorite) || live[0] || ms.find(m => m.status === 'upcoming') || ms[0])?.id || null;
  }
  async load() {
    this.pick();
    if (!this.sel) { this.redraw(); return; }
    try { const r = await (await fetch(SRV + '/match?id=' + encodeURIComponent(this.sel) + '&lang=27', { signal: AbortSignal.timeout?.(7000) })).json(); if (r.ok) this.det = r; } catch {}
    this.redraw();
  }
  redraw() { this.L.redraw(); this.R.redraw(); }
  choose(id) { blip('tap', settings.sounds); this.sel = id; this.det = null; this.off = 0; this.load(); }

  drawL(ctx, W, H, p) {
    panelGlass(ctx, 0, 0, W, H, 44);
    const m = this.matches.find(x => x.id === this.sel), d = this.det && this.det.id === this.sel ? this.det : null;
    if (!m) { label(ctx, 'لا مباريات لفرقك الآن', W / 2, H / 2, 26, { weight: 700, color: SYS.label2 }); return; }
    // the score card
    const live = m.status === 'live';
    label(ctx, m.league?.name || '', W / 2, 34, 20, { weight: 600, color: SYS.label2, maxWidth: W - 40 });
    label(ctx, m.home?.name || '', W * 0.8, 82, 26, { weight: 800, color: '#fff', maxWidth: W * 0.34 });
    label(ctx, m.away?.name || '', W * 0.2, 82, 26, { weight: 800, color: '#fff', maxWidth: W * 0.34 });
    label(ctx, m.status === 'upcoming' ? (m.omanTime || '') : (m.score?.home ?? 0) + ' - ' + (m.score?.away ?? 0), W / 2, 92, 46, { weight: 800, color: '#fff', dir: 'ltr' });
    if (live) { ctx.fillStyle = SYS.red; ctx.beginPath(); ctx.roundRect(W / 2 - 46, 124, 92, 30, 15); ctx.fill(); label(ctx, (d?.minute || m.elapsed || '') + (m.elapsed && !d?.minute ? "'" : ''), W / 2, 139, 18, { weight: 800, color: '#fff', dir: 'ltr' }); }
    // tabs
    const tabs = [['events', 'الأحداث'], ['stats', 'الإحصائيات'], ['lineup', 'التشكيلة']], tw = (W - 60) / 3;
    tabs.forEach(([k, n], i) => {
      const x = W - 20 - (i + 1) * tw, on = this.tab === k, hov = p.isHover('t' + k);
      ctx.beginPath(); ctx.roundRect(x + 4, 168, tw - 8, 44, 22); ctx.fillStyle = on ? 'rgba(255,255,255,0.92)' : hov ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.1)'; ctx.fill();
      label(ctx, n, x + tw / 2, 190, 21, { weight: 700, color: on ? '#141824' : '#fff' });
      p.region(x, 168, tw, 44, () => { blip('tap', settings.sounds); this.tab = k; this.L.redraw(); }, 't' + k);
    });
    const top = 232;
    ctx.save(); ctx.beginPath(); ctx.rect(0, top, W, H - top - 12); ctx.clip();
    const row = (i, right, mid, left, color = '#fff') => {
      const y = top + 22 + i * 46;
      if (right) label(ctx, right, W - 30, y, 21, { weight: 700, color, align: 'right', maxWidth: W * 0.42 });
      if (mid) label(ctx, mid, W / 2, y, 19, { weight: 600, color: SYS.label2, maxWidth: W * 0.3 });
      if (left) label(ctx, left, 30, y, 21, { weight: 700, color, align: 'left', maxWidth: W * 0.42 });
    };
    if (this.tab === 'events') {
      const evs = d?.events?.length ? d.events : (this.app.sports?.goals?.[m.id] || []).map(g => ({ type: 'goal', side: g.side, minute: g.minute, player: g.player }));
      if (!evs.length) row(1, '', live || m.status === 'finished' ? 'لا أحداث بعد' : 'لم تبدأ', '');
      [...evs].reverse().slice(0, 12).forEach((e, i) => { const t = (ICON[e.type] || '•') + ' ' + (e.player || e.name || ''); row(i, e.side === 'home' ? t : '', e.minute, e.side === 'away' ? t : ''); });
    } else if (this.tab === 'stats') {
      if (!d?.stats?.length) row(1, '', 'الإحصائيات تظهر أثناء المباراة', '');
      (d?.stats || []).slice(0, 11).forEach((s, i) => row(i, String(s.home ?? ''), s.name, String(s.away ?? '')));
    } else {
      const hl = d?.home?.lineup || [], al = d?.away?.lineup || [];
      if (!hl.length && !al.length) row(1, '', 'التشكيلة تظهر قبل المباراة بقليل', '');
      else { row(0, d.home.formation || '', 'الخطة', d.away.formation || '', SYS.label2); for (let i = 0; i < 11; i++) row(i + 1, hl[i] ? hl[i].num + '  ' + hl[i].name : '', '', al[i] ? al[i].name + '  ' + al[i].num : ''); }
    }
    ctx.restore();
  }
  drawR(ctx, W, H, p) {
    panelGlass(ctx, 0, 0, W, H, 44);
    label(ctx, 'مبارياتي', W - 30, 46, 34, { weight: 800, color: '#fff', align: 'right' });
    const st = { live: 0, upcoming: 1, finished: 2 };
    const ms = [...this.matches].sort((a, b) => (st[a.status] ?? 3) - (st[b.status] ?? 3)).slice(0, 9);
    if (!ms.length) { label(ctx, 'لا مباريات لفرقك اليوم', W / 2, H / 2, 24, { weight: 600, color: SYS.label2 }); return; }
    ms.forEach((m, i) => {
      const y = 92 + i * 86, id = 'm' + i, on = m.id === this.sel, hov = p.isHover(id);
      if (on || hov) { ctx.beginPath(); ctx.roundRect(14, y, W - 28, 78, 18); ctx.fillStyle = on ? 'rgba(10,132,255,0.32)' : 'rgba(255,255,255,0.14)'; ctx.fill(); }
      label(ctx, (m.home?.name || '') + '  ×  ' + (m.away?.name || ''), W - 30, y + 26, 21, { weight: 700, color: '#fff', align: 'right', maxWidth: W - 170 });
      label(ctx, m.league?.name || '', W - 30, y + 56, 16, { weight: 600, color: SYS.label2, align: 'right', maxWidth: W - 170 });
      const sc = m.status === 'upcoming' ? (m.omanTime || '') : (m.score?.home ?? 0) + '-' + (m.score?.away ?? 0);
      label(ctx, sc, 70, y + 30, 26, { weight: 800, color: '#fff', dir: 'ltr' });
      if (m.status === 'live') label(ctx, (m.elapsed || '') + "'", 70, y + 58, 16, { weight: 800, color: SYS.red, dir: 'ltr' });
      p.region(14, y, W - 28, 78, () => this.choose(m.id), id);
    });
  }
  update(now) {
    if (Math.abs(this.win.h - this.L.heightM) > 0.01) { for (const q of [this.L, this.R]) { this.win.group.remove(q.mesh); q.dispose?.(); } this.L = this.panel('L'); this.R = this.panel('R'); this.place(); this.win.mgr.refreshTargets(); }
    // the scores move with the island data (goals arrive live): redraw when it changes
    const v = this.app.sports?.version; if (v !== this.v) { this.v = v; this.redraw(); }
  }
  dispose() { clearInterval(this.timer); for (const q of [this.L, this.R]) { this.win.group.remove(q.mesh); q.dispose?.(); } }
}
