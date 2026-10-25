// Bluetooth VR remotes (VR Park, VR BOX…) on iPhone. iOS doesn't let a web page see them as game pads, so Madar
// listens to everything such a remote can send in its other modes:
//  • music mode (hold @ + A on most VR Park remotes): play/pause, next, previous → caught through the Media Session
//    (a silent sound keeps Madar the "now playing" app, so the remote's buttons come here instead of to Music)
//  • key mode: any keyboard key → learnt once («تعلّم الأزرار»): press each button when asked
//  • mouse mode (@ + C, with AssistiveTouch on iPhone): works as a mouse already
import { settings, saveSettings } from './config.js';

const ACTIONS = [
  ['select', 'اختيار (نقرة)'], ['back', 'رجوع'], ['launcher', 'القائمة'], ['recenter', 'إعادة التمركز'],
  ['down', 'تمرير لأسفل'], ['up', 'تمرير لأعلى'], ['left', 'دوران يسار'], ['right', 'دوران يمين'],
];

// iCade letters: press → action (defaults), release letters only end a held joystick
const ICADE_DOWN = { w: 'up', x: 'down', a: 'left', d: 'right', y: 'select', h: 'back', u: 'launcher', j: 'recenter', i: 'select', k: 'back', o: 'select', l: 'launcher' };
const ICADE_UP = { e: 'w', z: 'x', q: 'a', c: 'd', t: 'y', r: 'h', f: 'u', n: 'j', m: 'i', p: 'k', g: 'o', v: 'l' };
const ICADE_PAIR = { w: 'e', x: 'z', a: 'q', d: 'c', y: 't', h: 'r', u: 'f', j: 'n', i: 'm', k: 'p', o: 'g', l: 'v' };

export class Remote {
  constructor(app) {
    this.app = app; this.learn = null;
    this.map = settings.remoteKeys || {};
    window.addEventListener('keydown', e => this.key(e), true);
    // @ + C (mouse mode, with AssistiveTouch on iPhone): the stick moves the iPhone's cursor and a button "taps" where it
    // is. In the headset, that tap is aimed through the lens at the cursor's place (not a tap at your gaze): press,
    // drag and scroll work as with a pinch there.
    const aim = (t, down) => {
      const c = this.app.controls, p = this.app.orientation.toStage(t.clientX, t.clientY);
      [c.padPtr.tx, c.padPtr.ty] = c.pointTan(p.x, p.y); c.padPtr.last = performance.now(); if (down != null) c.padPtr.down = down;
    };
    const mine = e => settings.remote && this.app.active && !this.app.controls.direct && e.touches.length < 2;
    window.addEventListener('touchstart', e => { if (!mine(e)) return; e.preventDefault(); e.stopImmediatePropagation(); try { this.app.windows.windows.forEach(w => w.userGesture?.()); } catch {} aim(e.changedTouches[0], true); }, { capture: true, passive: false });
    window.addEventListener('touchmove', e => { if (!mine(e)) return; e.preventDefault(); e.stopImmediatePropagation(); aim(e.changedTouches[0]); }, { capture: true, passive: false });
    const up = e => { if (!settings.remote || !this.app.active || this.app.controls.direct) return; e.preventDefault(); e.stopImmediatePropagation(); this.app.controls.padPtr.down = false; this.app.controls.padPtr.last = performance.now(); };
    window.addEventListener('touchend', up, { capture: true, passive: false });
    window.addEventListener('touchcancel', up, { capture: true, passive: false });
    if (settings.remote) document.addEventListener('pointerdown', () => this.media(), { once: true });
  }
  get on() { return !!settings.remote; }
  toggle() {
    const on = !settings.remote; saveSettings({ remote: on });
    if (on) { this.media(); this.app.toast('🎮 الريموت يعمل · @+C: العصا تحرّك المؤشر والزر ينقر مكانه (فعّل AssistiveTouch) · @+D: أزرار · أو «تعلّم الأزرار»', 6000); }
    else { this.stopMedia(); this.app.toast('أُوقف الريموت', 2000); }
  }
  // music mode → Media Session
  media() {
    if (!settings.remote) return;
    try {
      if (!this.audio) {
        // 1 s of silence, looped: keeps Madar the "now playing" app so the remote's media buttons arrive here
        const a = new Audio('data:audio/wav;base64,UklGRsQPAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YaAPAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA');
        a.loop = true; a.volume = 0.01; a.setAttribute('playsinline', ''); this.audio = a;
      }
      this.audio.play().catch(() => {});
      const ms = navigator.mediaSession; if (!ms) return;
      ms.metadata = new MediaMetadata({ title: 'مدار', artist: 'ريموت VR' });
      const h = (a, f) => { try { ms.setActionHandler(a, () => { f(); ms.playbackState = 'playing'; this.audio.play().catch(() => {}); }); } catch {} };
      h('play', () => this.act('select')); h('pause', () => this.act('select'));
      h('nexttrack', () => this.act('down')); h('previoustrack', () => this.act('back'));
      h('seekforward', () => this.act('right')); h('seekbackward', () => this.act('left'));
      ms.playbackState = 'playing';
    } catch {}
  }
  stopMedia() {
    try { this.audio?.pause(); const ms = navigator.mediaSession; for (const a of ['play', 'pause', 'nexttrack', 'previoustrack', 'seekforward', 'seekbackward']) ms?.setActionHandler(a, null); } catch {}
  }
  // key mode
  // @ + D (iCade mode): every button sends one letter when pressed and another when released
  icade(e) {
    const k = (e.key || '').toLowerCase(), r = ICADE_UP[k], p = ICADE_DOWN[k];
    if (!r && !p) return false;
    e.preventDefault(); e.stopImmediatePropagation();
    if (r) { if (this.held === k) { clearInterval(this.rep); this.held = null; } return true; }
    if (this.learn) { this.learnKey('icade:' + k); return true; }
    const act = this.map['icade:' + k] || p;
    this.act(act);
    if (act === 'up' || act === 'down') { clearInterval(this.rep); this.held = ICADE_PAIR[k]; this.rep = setInterval(() => this.act(act), 140); }
    return true;
  }
  learnKey(code) {
    const [id] = ACTIONS[this.learn.i]; this.map[code] = id; this.learn.i++;
    if (this.learn.i >= ACTIONS.length) { this.learn = null; saveSettings({ remoteKeys: this.map, remote: true }); this.app.toast('✓ حُفظت أزرار الريموت', 3000); }
    else this.ask();
  }
  key(e) {
    if (!this.app.active) return;
    if (settings.remote && !e.metaKey && !e.ctrlKey && this.icade(e)) return;
    const code = e.code || e.key;
    if (this.learn) {
      e.preventDefault(); e.stopImmediatePropagation(); this.learnKey(code); return;
    }
    const act = this.map[code]; if (!act) return;
    e.preventDefault(); e.stopImmediatePropagation(); this.act(act);
  }
  startLearn() { saveSettings({ remote: true }); this.map = {}; this.learn = { i: 0 }; this.ask(); }
  ask() { const [, ar] = ACTIONS[this.learn.i]; this.app.toast(`🎮 ${this.learn.i + 1}/${ACTIONS.length} · اضغط الزر الذي تريده لـ «${ar}»`, 15000); }
  act(a) {
    const app = this.app, c = app.controls;
    if (a === 'select') app.onRealTap();
    else if (a === 'launcher') app.toggleLauncher();
    else if (a === 'recenter') { c.reset?.(); app.recenter(); }
    else if (a === 'down' || a === 'up') c.scrollPointed?.(a === 'down' ? 400 : -400);
    else if (a === 'left' || a === 'right') c.look.yaw += (a === 'left' ? 1 : -1) * Math.PI / 6;
    else if (a === 'back') {
      if (app.launcher.group.visible) app.launcher.close();
      else { const kb = app.windows.windows.find(w => w.kind === 'keyboard'); if (kb) app.windows.close(kb); else c.pointedWindow?.()?.goBack?.(); }
    }
  }
}
