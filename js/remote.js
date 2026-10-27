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
    // A swipe (the remote sometimes sends the stick as a drag) only MOVES the pointer: it never scrolls or drags.
    // A short tap with little movement clicks where the pointer is.
    let t0 = 0, sx = 0, sy = 0, moved = 0;
    window.addEventListener('touchstart', e => {
      if (!mine(e)) return; e.preventDefault(); e.stopImmediatePropagation();
      try { this.app.windows.windows.forEach(w => w.userGesture?.()); } catch {}
      const t = e.changedTouches[0]; t0 = performance.now(); sx = t.clientX; sy = t.clientY; moved = 0; aim(t, false);
    }, { capture: true, passive: false });
    window.addEventListener('touchmove', e => {
      if (!mine(e)) return; e.preventDefault(); e.stopImmediatePropagation();
      const t = e.changedTouches[0]; moved = Math.max(moved, Math.hypot(t.clientX - sx, t.clientY - sy)); aim(t, false);
    }, { capture: true, passive: false });
    const up = e => {
      if (!settings.remote || !this.app.active || this.app.controls.direct) return; e.preventDefault(); e.stopImmediatePropagation();
      const c = this.app.controls; c.padPtr.last = performance.now();
      if (moved < 14 && performance.now() - t0 < 600) { c.padPtr.down = true; setTimeout(() => { c.padPtr.down = false; c.padPtr.last = performance.now(); }, 120); }
      else c.padPtr.down = false;
    };
    window.addEventListener('touchend', up, { capture: true, passive: false });
    // the stick sent as scroll-wheel steps: move the pointer instead of scrolling
    window.addEventListener('wheel', e => {
      if (!settings.remote || !this.app.active || this.app.controls.direct) return; e.preventDefault(); e.stopImmediatePropagation();
      const p = this.app.controls.padPtr, k = 0.0012;
      p.tx = Math.max(-1.4, Math.min(1.4, p.tx + e.deltaX * k)); p.ty = Math.max(-1.2, Math.min(1.2, p.ty - e.deltaY * k)); p.last = performance.now();
    }, { capture: true, passive: false });
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
    if (r) { if (this.held === k) { clearInterval(this.rep); this.held = null; } if (this.selHeld?.rel === k) this.holdEnd(); return true; }
    if (this.learn) { this.learnKey('icade:' + k); return true; }
    const act = this.map['icade:' + k] || p;
    if (act === 'select') { this.holdStart('icade:' + k, ICADE_PAIR[k]); return true; }
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
    e.preventDefault(); e.stopImmediatePropagation();
    if (act === 'select') { if (!e.repeat) this.holdStart(code); return; }
    this.act(act);
  }
  // ---- a long press on the remote's select button opens the quick menu (short press = click)
  holdStart(id, rel) {
    clearTimeout(this.selT); this.selHeld = { id, rel, at: performance.now() };
    this.selT = setTimeout(() => { if (this.selHeld?.id === id) { this.selHeld = null; this.quickMenu(); } }, 600);
  }
  holdEnd() { if (!this.selHeld) return; clearTimeout(this.selT); this.selHeld = null; this.act('select'); }
  quickMenu() {
    const a = this.app, p = a.plus;
    a.notify({ icon: '🎮', title: 'أوامر سريعة', body: 'اختر بالنظر ثم انقر', important: true, actions: [
      ['⏯', () => { const w = a.extras?.mediaWindows?.()[0]; if (w) a.extras.togglePlay(w); }], ['⚽ المباراة', () => p?.matchMode()],
      ['🎯 تمركز', () => this.act('recenter')], ['🛋 استلقاء', () => p?.toggleLying()], ['☰ القائمة', () => this.act('launcher')]] });
  }
  // ---- game pads (Android: each VR Park in game mode is its own pad): one map per remote
  padKey(gp) { return 'pad' + gp.index + ':' + (gp.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 24); }
  pads() { return navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []; }
  startLearnPad(i) {
    const gp = this.pads()[i]; if (!gp) { this.app.toast('لم أجد ريموت ' + (i + 1) + ' — اضغط أي زر فيه أولاً', 3000); return; }
    saveSettings({ remote: true }); this.padLearn = { key: this.padKey(gp), idx: gp.index, i: 0, map: {}, prev: gp.buttons.map(b => b.pressed), ax: [...gp.axes] };
    this.app.toast('🎮 ريموت ' + (i + 1) + ': ' + ACTIONS[0][1] + ' — اضغط الزر أو حرّك العصا', 15000);
  }
  // per frame (from the app loop): each mapped pad drives Madar by itself; unmapped pads stay with the usual controls
  pollPads(now) {
    const list = this.pads(); if (!list.length) return;
    const maps = settings.padMaps || {}; window.__padCustom = new Set();
    for (const gp of list) {
      const key = this.padKey(gp), L = this.padLearn;
      if (L && L.idx === gp.index) {
        let hit = null;
        gp.buttons.forEach((b, i) => { if (b.pressed && !L.prev[i]) hit = 'b' + i; });
        gp.axes.forEach((v, i) => { if (Math.abs(v) > 0.7 && Math.abs(L.ax[i] || 0) < 0.4) hit = 'a' + i + (v > 0 ? '+' : '-'); });
        L.prev = gp.buttons.map(b => b.pressed); L.ax = [...gp.axes];
        if (hit && !Object.keys(L.map).includes(hit)) {
          L.map[hit] = ACTIONS[L.i][0]; L.i++;
          if (L.i >= ACTIONS.length) { saveSettings({ padMaps: { ...maps, [key]: L.map } }); this.padLearn = null; this.app.toast('✓ حُفظ هذا الريموت وحده', 2500); }
          else this.app.toast('🎮 ' + ACTIONS[L.i][1], 15000);
        }
        window.__padCustom.add(gp.index); continue;
      }
      const m = maps[key]; if (!m) continue;
      window.__padCustom.add(gp.index);
      const st = (this.padState ||= {})[key] ||= { b: [], a: {} };
      gp.buttons.forEach((b, i) => {
        const act = m['b' + i]; if (!act) return;
        if (b.pressed && !st.b[i]) { if (act === 'select') this.holdStart('pad' + key + i); else this.act(act); }
        if (!b.pressed && st.b[i] && act === 'select') this.holdEnd();
        st.b[i] = b.pressed;
      });
      gp.axes.forEach((v, i) => {
        for (const sgn of ['+', '-']) {
          const act = m['a' + i + sgn]; if (!act) continue;
          const on = sgn === '+' ? v > 0.6 : v < -0.6, k = i + sgn;
          if (on && (!st.a[k] || now - st.a[k] > (act === 'up' || act === 'down' ? 140 : 400))) { this.act(act); st.a[k] = now; }
          if (!on) st.a[k] = 0;
        }
      });
    }
  }
  // ---- from the phone remote page / «المركز»: buttons and a touchpad
  rc(m) {
    const c = this.app.controls;
    if (m.action) this.act(m.action);
    if (m.dx != null || m.dy != null) { const p = c.padPtr; p.tx = Math.max(-1.4, Math.min(1.4, p.tx + (m.dx || 0) * 2.2)); p.ty = Math.max(-1.2, Math.min(1.2, p.ty - (m.dy || 0) * 2.2)); p.last = performance.now(); }
    if (m.click) { c.padPtr.down = true; c.padPtr.last = performance.now(); setTimeout(() => { c.padPtr.down = false; }, 120); }
    if (m.scroll) c.scrollPointed?.(m.scroll * 900);
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
