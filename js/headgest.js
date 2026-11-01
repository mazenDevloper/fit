// «أوامر بالرأس»: a nod answers «نعم» (the notification's first button), a shake «لا» (closes it) - no hands, no
// voice. Only while a notification with a choice is in front of you, so ordinary head movement never does anything.
import { settings } from './config.js';
import { blip } from './ui.js';

const DEG = 180 / Math.PI;
export class HeadGestures {
  constructor(app) { this.app = app; this.s = []; this.coolUntil = 0; }
  update(now) {
    if (settings.headGestures === false) return;
    const n = this.app.notifier; if (!n?.cur || !n.mesh.visible) { this.s.length = 0; return; }
    if (now - (n.t0 || 0) < 700 || now < this.coolUntil) return;   // let it appear first
    const f = this.app.headForward;
    this.s.push({ t: now, p: Math.asin(Math.max(-1, Math.min(1, f.y))) * DEG, y: Math.atan2(f.x, -f.z) * DEG });
    while (this.s.length && now - this.s[0].t > 1100) this.s.shift();
    if (this.s.length < 6) return;
    const g = this.detect(); if (!g) return;
    this.s.length = 0; this.coolUntil = now + 1200;
    blip('tap', settings.sounds);
    const acts = n.cur.actions || [];
    if (g === 'nod') { this.app.toast('👍 نعم', 900); try { acts[0]?.[1](); } catch {} n.next(); }
    else { this.app.toast('👎 لا', 900); n.next(); }
  }
  // nod: down then back up (pitch), little side-to-side; shake: left-right-left (yaw), little up-down
  detect() {
    const s = this.s, P = s.map(x => x.p), Y = s.map(x => x.y);
    const rangeP = Math.max(...P) - Math.min(...P), rangeY = Math.max(...Y) - Math.min(...Y);
    if (rangeP > 9 && rangeY < rangeP * 0.6) {
      const i = P.indexOf(Math.min(...P)), start = P[0], end = P[P.length - 1];
      if (i > 0 && i < P.length - 1 && start - P[i] > 7 && end - P[i] > 5) return 'nod';
    }
    if (rangeY > 12 && rangeP < rangeY * 0.6) {
      let turns = 0, dir = 0;
      for (let k = 1; k < Y.length; k++) { const d = Y[k] - Y[k - 1]; if (Math.abs(d) < 0.8) continue; const sg = Math.sign(d); if (dir && sg !== dir) turns++; dir = sg; }
      if (turns >= 2) return 'shake';
    }
    return null;
  }
}
