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

export class Remote {
  constructor(app) {
    this.app = app; this.learn = null;
    this.map = settings.remoteKeys || {};
    window.addEventListener('keydown', e => this.key(e), true);
    if (settings.remote) document.addEventListener('pointerdown', () => this.media(), { once: true });
  }
  get on() { return !!settings.remote; }
  toggle() {
    const on = !settings.remote; saveSettings({ remote: on });
    if (on) { this.media(); this.app.toast('🎮 الريموت يعمل · وضع الموسيقى: ▶ اختيار · ⏭ تمرير · ⏮ رجوع · أو «تعلّم الأزرار»', 6000); }
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
  key(e) {
    if (!this.app.active) return;
    const code = e.code || e.key;
    if (this.learn) {
      e.preventDefault(); e.stopImmediatePropagation();
      const [id] = ACTIONS[this.learn.i]; this.map[code] = id; this.learn.i++;
      if (this.learn.i >= ACTIONS.length) { this.learn = null; saveSettings({ remoteKeys: this.map, remote: true }); this.app.toast('✓ حُفظت أزرار الريموت', 3000); }
      else this.ask();
      return;
    }
    const act = this.map[code]; if (!act) return;
    e.preventDefault(); e.stopImmediatePropagation(); this.act(act);
  }
  startLearn() { this.map = {}; this.learn = { i: 0 }; this.ask(); }
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
