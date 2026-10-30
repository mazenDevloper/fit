// Madar «Plus»: the daily-use layer on top of the spatial system.
//  1) وضع المباراة   one tap: the game (HDMI / channel / sports page) big in front, live scores + «يومك» beside, cinema dark
//  2) مساحات اليوم   morning / work / evening spaces saved once, opened by themselves at their hour
//  4) الاستلقاء      look up and lie back: every window moves over you (and back)
//  5) إشعارات هادئة  while you watch, only what matters interrupts (goals, prayers, messages); the rest waits in a digest
// 10) ملفات النظارات  one calibration per headset, a 3-step wizard for a new one, switch in one tap
//  + «المركز»: match moments (15 min before, kick-off, goals, final whistle) arrive here like on every other screen
import * as THREE from 'three';
import { settings, saveSettings, applyPreset } from './config.js';
import { blip } from './ui.js';

const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const speak = t => { try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = 'ar-SA'; speechSynthesis.speak(u); } catch {} };

// ------------------------------------------------------------------ 2) the spaces of the day
export const SLOTS = [
  { id: 'morning', name: 'الصباح', icon: '🌅', from: 5, to: 11 },
  { id: 'work', name: 'العمل', icon: '💼', from: 11, to: 17 },
  { id: 'evening', name: 'السهرة', icon: '🌙', from: 17, to: 29 },   // 17:00 → 05:00
];
export const slotNow = (d = new Date()) => { const h = d.getHours(), hh = h < 5 ? h + 24 : h; return SLOTS.find(s => hh >= s.from && hh < s.to) || SLOTS[2]; };

// ------------------------------------------------------------------ 10) headset profiles
const LENS_KEYS = k => /^(preset|lensSep|screenToLens|k1|k2|ipd|vOffset|lens|eye|zoom|shift|scale[LR]|off[A-Z])/.test(k);

export class Plus {
  constructor(app) {
    this.app = app; this.digest = []; this.lying = null;
    // 5) quiet notifications: wrap the app's notify
    const raw = app.notify.bind(app);
    app.notify = n => this.notify(n, raw);
    this.rawNotify = raw;
  }
  // ================================================================ 5) only what matters while you watch
  watching() {
    const ex = this.app.extras; if (!ex || settings.quietWatch === false) return false;
    return (ex.mediaWindows?.() || []).some(w => w.kind === 'video' && ex.isPlaying?.(w));
  }
  important(n) {
    if (n.important || n.actions?.length) return true;
    return /⚽|🕌|🕋|⏰|📥|🌡|🔔|💬|👥|🏁|🟢/.test((n.icon || '') + (n.title || ''));
  }
  notify(n, raw) {
    if (!this.watching() || this.important(n)) return raw(n);
    this.digest.push({ ...n, at: Date.now() });
    if (this.digest.length > 30) this.digest.shift();
  }
  // the moment the video stops (or you leave), what waited comes as one card
  flushDigest() {
    if (!this.digest.length || this.watching()) return;
    const list = this.digest.splice(0);
    this.rawNotify({ icon: '📬', title: list.length + ' إشعارات أثناء المشاهدة', body: list.slice(-3).map(x => x.title).join(' · '), important: true });
  }
  // ================================================================ + match moments from «المركز»
  onMatch(m) {
    const goal = m.kind === 'goal';
    // goal sound off unless turned on (settings.goalSound); the card always shows
    const loud = !goal || settings.goalSound === true;
    if (loud) { blip('open', settings.sounds); if (goal) { setTimeout(() => blip('open', settings.sounds), 180); setTimeout(() => blip('open', settings.sounds), 360); } }
    this.rawNotify({ icon: goal ? '⚽' : m.kind === 'end' ? '🏁' : m.kind === 'pre' ? '⏰' : '🟢', title: m.title.replace(/^[^\p{L}]+/u, ''), body: m.body || '', important: true,
      actions: m.kind === 'pre' || m.kind === 'start' ? [['وضع المباراة', () => this.matchMode()]] : undefined });
    if ((goal && loud) || m.kind === 'end') speak(m.title.replace(/^[^\p{L}]+/u, '') + (m.kind === 'end' && m.body ? '. ' + m.body : ''));
    this.app.windows.windows.forEach(w => w.type === 'today' && w.loadToday?.());
  }
  // ================================================================ 1) match mode
  async matchMode() {
    const app = this.app, W = app.windows;
    if (this.matchOn) return this.exitMatch();
    this.matchOn = { env: settings.environment, imm: settings.immersion, before: W.serialize() };
    blip('open', settings.sounds);
    // the game: the HDMI / shared screen if it's on, else the last channel watched anywhere, else the sports page
    let main = app.mirrorWin && W.windows.includes(app.mirrorWin) ? app.mirrorWin : W.windows.find(w => w.kind === 'video' && (w.stream || /m3u8|ts|live/i.test(w.url || '')));
    if (!main) {
      const ch = Object.values(app.hub?.state.resume || {}).filter(x => x.kind === 'iptv').sort((a, b) => b.at - a.at)[0];
      if (ch) { app.hub.open(ch); await new Promise(r => setTimeout(r, 600)); main = W.windows[W.windows.length - 1]; }
      else main = W.open({ kind: 'web', url: 'https://drivecast.c-p.workers.dev/hihi2' });
    }
    // the scores and the day beside it
    const score = W.windows.find(w => w.type === 'dcdash') || app.extras.widget('dcdash');
    const today = W.windows.find(w => w.type === 'today') || app.extras.widget('today');
    const yaw = W.forwardYaw(), h = W.headLocal();
    const put = (w, a, d, y, s) => { if (!w) return; const g = w.group; g.position.set(h.x - Math.sin(yaw + a) * d, h.y + y, h.z - Math.cos(yaw + a) * d); g.lookAt(h.x, h.y + y, h.z); if (s) g.scale.setScalar(s); };
    put(main, 0, 2.2, 0.05, 2.0);
    put(score, 0.62, 1.5, 0.12);
    put(today, -0.62, 1.5, 0.12);
    // the room goes dark like a cinema; other windows step back
    for (const w of W.windows) if (![main, score, today].includes(w)) w.group.visible = false;
    saveSettings({ environment: 'cinema' });
    app.extras?.portal?.set?.(1);
    W.changed?.();
    app.toast('⚽ وضع المباراة — اضغط مرة أخرى للعودة', 2500);
  }
  exitMatch() {
    const app = this.app, m = this.matchOn; this.matchOn = null; if (!m) return;
    for (const w of app.windows.windows) w.group.visible = true;
    saveSettings({ environment: m.env }); if (m.imm != null) app.extras?.portal?.set?.(m.imm);
    app.toast('عدت إلى مساحتك', 1500);
  }
  // ================================================================ 2) spaces of the day
  spaces() { return store.get('madar.spaces.v1', {}); }
  saveSpace(slot = slotNow()) {
    const name = '⏱ ' + slot.name;
    this.app.extras.saveScene(name);
    const sp = this.spaces(); sp[slot.id] = name; store.set('madar.spaces.v1', sp);
    this.app.toast(slot.icon + ' حُفظت مساحة ' + slot.name + ' — تُفتح وحدها كل يوم في وقتها', 3000);
  }
  openSpace(slot = slotNow(), quiet = false) {
    const name = this.spaces()[slot.id];
    if (!name) { if (!quiet) this.app.toast('لم تُحفظ مساحة ' + slot.name + ' بعد — رتّب نوافذك ثم «احفظ كمساحة ' + slot.name + '»', 3500); return false; }
    this.app.extras.openScene(name); this.curSlot = slot.id; return true;
  }
  nextSpace() { const i = SLOTS.findIndex(s => s.id === (this.curSlot || slotNow().id)); this.openSpace(SLOTS[(i + 1) % SLOTS.length]); }
  // on entering Madar (and when the hour moves to the next part of the day with nothing playing)
  enter() {
    this.curSlot = null;
    if (settings.autoSpaces !== false && this.app.windows.windows.length <= 1) this.openSpace(slotNow(), true);
  }
  // ================================================================ 4) lying down
  toggleLying() {
    const app = this.app, W = app.windows;
    if (this.lying) {
      for (const [w, p, q] of this.lying) if (W.windows.includes(w)) { w.group.position.copy(p); w.group.quaternion.copy(q); }
      this.lying = null; app.toast('🛋 عادت النوافذ أمامك', 1500); return;
    }
    // the windows turn up by the angle you look up (straight up when lying flat)
    const f = app.headForward, pitch = THREE.MathUtils.clamp(Math.asin(Math.max(-1, Math.min(1, f.y))), 0.6, Math.PI / 2);
    const yaw = W.forwardYaw(), h = W.headLocal(), axis = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).normalize();
    this.lying = [];
    for (const w of W.windows) {
      const g = w.group; this.lying.push([w, g.position.clone(), g.quaternion.clone()]);
      const v = g.position.clone().sub(h).applyAxisAngle(axis, pitch);
      g.position.copy(h).add(v); g.lookAt(h);
    }
    app.toast('🛋 وضع الاستلقاء — النوافذ فوقك', 2000);
  }
  // looking up steadily for 4 s with windows in front → offer it once
  watchPosture(now) {
    if (this.lying || settings.lieHint === false || !this.app.windows.windows.length) { this.upSince = 0; return; }
    const up = this.app.headForward.y > 0.75;
    this.upSince = up ? this.upSince || now : 0;
    if (up && now - this.upSince > 4000 && now - (this.offeredAt || 0) > 120000) {
      this.offeredAt = now;
      this.rawNotify({ icon: '🛋', title: 'مستلقٍ؟', body: 'انقل النوافذ فوقك', important: true, actions: [['نعم', () => this.toggleLying()]] });
    }
  }
  // ================================================================ 10) headsets
  headsets() { return store.get('madar.headsets.v1', {}); }
  saveHeadset(name) {
    const snap = {}; for (const [k, v] of Object.entries(settings)) if (LENS_KEYS(k)) snap[k] = v;
    const h = this.headsets(); h[name] = { ...snap, at: Date.now() }; store.set('madar.headsets.v1', h); saveSettings({ headset: name });
    this.app.toast('🥽 حُفظت نظارة «' + name + '»', 2200);
  }
  useHeadset(name) {
    const h = this.headsets()[name]; if (!h) return;
    const { at, ...s } = h; saveSettings({ ...s, headset: name }); this.app.applySettings?.();
    this.app.toast('🥽 ' + name, 1500);
  }
  // the wizard: lens type → lens adjust (move / zoom the two pictures) → name it
  headsetWizard() {
    const app = this.app;
    const step3 = () => app.notify({ icon: '🥽', title: 'الخطوة ٣: احفظها', body: 'سمِّ هذه النظارة لتعود إليها بلمسة', important: true,
      actions: [['احفظ', () => { const n = prompt('اسم النظارة', 'نظارة ' + (Object.keys(this.headsets()).length + 1)); if (n) this.saveHeadset(n.trim()); }]] });
    const step2 = () => { app.lensAdjust?.open?.(); app.notify({ icon: '🥽', title: 'الخطوة ٢: طابِق الصورتين', body: 'حرّك وكبّر حتى تصبح الصورة واحدة واضحة، ثم أغلق', important: true, actions: [['انتهيت', step3]] }); };
    app.notify({ icon: '🥽', title: 'الخطوة ١: نوع العدسات', body: 'اختر الأقرب لنظارتك', important: true,
      actions: [['عامة', () => { (applyPreset('vrbox'), app.applySettings?.()); step2(); }], ['Cardboard', () => { (applyPreset('cardboard'), app.applySettings?.()); step2(); }], ['خفيفة', () => { (applyPreset('light'), app.applySettings?.()); step2(); }]] });
  }
  // ================================================================ per frame (cheap)
  update(now) {
    if (now - (this.tickAt || 0) < 500) return; this.tickAt = now;
    this.watchPosture(now);
    if (this.digest.length) this.flushDigest();
  }
}
