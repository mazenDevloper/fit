// «شاهد معاً» (LiveKit): everyone in the room hears each other, and one of you leads what is watched —
// the others open the same video at the same second and follow play / pause / jumps.
//   the server (studio /lk/token) signs a ticket per device; LiveKit Cloud carries the voices and the sync messages
import { settings } from './config.js';
import { blip } from './ui.js';
import * as THREE from 'three';

const API = 'https://studio.c-p.workers.dev';
const LIB = new URL('../lib/x/livekit.js', import.meta.url).href;
const enc = new TextEncoder(), dec = new TextDecoder();

export class Together {
  constructor(app) { this.app = app; this.room = null; this.lead = false; this.audios = new Map(); this.lastSend = 0; this.people = new Map(); this.yaw = 0; }
  get on() { return !!this.room; }
  async toggle(roomName = 'madar-home') { return this.on ? this.leave() : this.join(roomName); }

  async join(roomName) {
    const a = this.app;
    try {
      a.toast('👥 الاتصال بغرفة المشاهدة…', 2500);
      const LK = await import(LIB);
      const name = (settings.deviceName || 'مدار') + ' · ' + (/iPhone|iPad/.test(navigator.userAgent) ? 'آيفون' : /Android/.test(navigator.userAgent) ? 'أندرويد' : 'كمبيوتر');
      const t = await (await fetch(`${API}/lk/token?room=${encodeURIComponent(roomName)}&name=${encodeURIComponent(name)}`)).json();
      if (!t.token) throw new Error(t.error || 'no token');
      const room = new LK.Room({ adaptiveStream: true, dynacast: true, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const E = LK.RoomEvent;
      room.on(E.TrackSubscribed, (track, _pub, who) => {
        if (track.kind !== 'audio') return;
        const el = track.attach(); el.autoplay = true; document.body.appendChild(el); this.audios.set(who.identity, el);
      });
      room.on(E.TrackUnsubscribed, (track, _pub, who) => { track.detach().forEach(e => e.remove()); this.audios.delete(who.identity); });
      room.on(E.ParticipantConnected, p => { blip('open', settings.sounds); a.toast('👥 انضم ' + (p.name || p.identity), 2500); if (this.lead) this.send(true); this.sendMe(); });
      room.on(E.ParticipantDisconnected, p => { a.toast('👋 غادر ' + (p.name || p.identity), 2000); this.drop(p.identity); });
      room.on(E.ActiveSpeakersChanged, sp => { const s = sp.find(x => !x.isLocal); if (s && performance.now() - (this.spokeAt || 0) > 4000) { this.spokeAt = performance.now(); a.toast('🎙 ' + (s.name || s.identity), 1200); } });
      room.on(E.DataReceived, (bytes, who) => { try { this.receive(JSON.parse(dec.decode(bytes)), who); } catch {} });
      room.on(E.Disconnected, () => { if (this.room === room) this.cleanup(); });
      await room.connect(t.url, t.token);
      await room.localParticipant.setMicrophoneEnabled(true).catch(() => a.toast('المايكروفون غير متاح — تسمع فقط', 2500));
      this.room = room;
      // the room sits around where you look now: each friend's Memoji on an arc in front of you
      this.yaw = Math.atan2(-a.headForward.x, -a.headForward.z);
      this.sendMe();
      const n = room.remoteParticipants.size;
      a.toast('👥 أنت في «شاهد معاً»' + (n ? ' مع ' + n : ' — أرسل الرابط لمن تريد') + ' · «قُد المشاهدة» ليتبعك الجميع', 4000);
    } catch (e) { a.toast('تعذّر دخول الغرفة: ' + (e?.message || e), 3500); this.cleanup(); }
  }
  leave() { try { this.room?.disconnect(); } catch {} this.cleanup(); this.app.toast('خرجت من «شاهد معاً»', 1500); }
  cleanup() { this.audios.forEach(e => e.remove()); this.audios.clear(); this.room = null; this.lead = false; this.faceOff(); [...this.people.keys()].forEach(k => this.drop(k)); }
  toggleMic() { const lp = this.room?.localParticipant; if (!lp) return; const on = !lp.isMicrophoneEnabled; lp.setMicrophoneEnabled(on); this.app.toast(on ? '🎙 المايكروفون يعمل' : '🔇 المايكروفون مكتوم', 1200); }

  // ---- lead the watching: what plays in front of you, the others follow
  leadNow() {
    if (!this.on) return this.app.toast('ادخل «شاهد معاً» أولاً', 1800);
    this.lead = true; this.send(true);
    this.app.toast('🎬 أنت تقود المشاهدة — الجميع يتبعك', 2500);
  }
  media() { return this.app.extras?.mediaWindows?.().find(w => w.video) || null; }
  state() {
    const w = this.media(); if (!w) return null;
    const v = w.video;
    return { t: 'watch', url: w.url || v.currentSrc, title: w.title || '', time: v.currentTime || 0, playing: !v.paused, at: Date.now() };
  }
  send(force) {
    const s = this.state(); if (!s || !this.room) return;
    const key = s.url + '|' + s.playing + '|' + Math.round(s.time / 3);
    if (!force && key === this.lastKey) return;
    this.lastKey = key;
    this.room.localParticipant.publishData(enc.encode(JSON.stringify(s)), { reliable: true }).catch(() => {});
  }
  receive(m, who) {
    if (m.t === 'me' || m.t === 'face') return this.persona(m, who);
    if (m.t !== 'watch' || !m.url) return;
    this.lead = false;   // someone else leads now
    const a = this.app, W = a.windows;
    let w = W.windows.find(x => x.video && (x.url === m.url || x.video.currentSrc === m.url));
    if (!w) { W.open({ kind: 'video', url: m.url, title: m.title }); a.toast('🎬 ' + (who?.name || 'صديق') + ' يشاهد: ' + (m.title || 'فيديو'), 2500); return setTimeout(() => this.receive(m, who), 1500); }
    const v = w.video, want = m.time + (m.playing ? (Date.now() - m.at) / 1000 : 0);
    if (Math.abs(v.currentTime - want) > 1.2) v.currentTime = want;
    if (m.playing && v.paused) v.play().catch(() => {}); else if (!m.playing && !v.paused) v.pause();
  }
  // ---- Personas: everyone in the room as their own Memoji, talking when they talk, and (with «وجهي في الغرفة»)
  // moving with their real face. Only the Memoji's look (cfg) and ~12 face numbers a second travel, never video.
  data(m, reliable = true) { try { this.room?.localParticipant.publishData(enc.encode(JSON.stringify(m)), { reliable }).catch(() => {}); } catch {} }
  async sendMe() { if (!this.room) return; try { const M = await import('./memoji.js'); this.data({ t: 'me', cfg: M.load().cfg }); } catch {} }
  async persona(m, who) {
    const id = who?.identity; if (!id || settings.memoji === false) return;
    let P = this.people.get(id);
    if (!P) {
      if (m.t !== 'me') return;
      P = { who, cfg: m.cfg, F: null }; this.people.set(id, P);
      const M = await import('./memoji.js');
      if (this.people.get(id) !== P) return;
      P.F = new M.Floating({ ...M.DEFAULT, ...m.cfg }, M.envFor(this.app.renderer.renderer), { lite: true });
      P.F.group.scale.setScalar(0.16); this.app.renderer.scene.add(P.F.group); this.layout();
      return;
    }
    if (m.t === 'me' && P.F && JSON.stringify(m.cfg) !== JSON.stringify(P.cfg)) { P.cfg = m.cfg; const M = await import('./memoji.js'); P.F.rebuild({ ...M.DEFAULT, ...m.cfg }); }
    if (m.t === 'face' && P.F) P.F.drive(m.bs || {}, m.rot || null);
  }
  drop(id) { const P = this.people.get(id); if (!P) return; this.people.delete(id); if (P.F) { this.app.renderer.scene.remove(P.F.group); import('./memoji.js').then(M => M.dispose(P.F.group)).catch(() => {}); } this.layout(); }
  // up to 6 on an arc 1.6 m away, a little below the eyes, spread 22° apart around the direction you faced
  layout() {
    const list = [...this.people.values()].filter(P => P.F), n = list.length;
    list.forEach((P, i) => { const ang = this.yaw + (i - (n - 1) / 2) * 0.38; P.goal = new THREE.Vector3(-Math.sin(ang) * 1.6, -0.18, -Math.cos(ang) * 1.6); if (!P.placed) { P.F.group.position.copy(P.goal); P.placed = true; } });
  }
  // «وجهي في الغرفة»: your camera moves your Memoji at the others (laptop / iPad / phone in front of you)
  async faceToggle() {
    if (this.stopFace) { this.faceOff(); return this.app.toast('وجهك لم يعد يُرسل', 1500); }
    if (!this.on) return this.app.toast('ادخل «شاهد معاً» أولاً', 1800);
    try {
      const { track } = await import('./animoji.js');
      let last = 0;
      this.stopFace = await track((bs, rot) => {
        const now = performance.now(); if (now - last < 80) return; last = now;
        const r = x => Math.round(x * 100) / 100;
        this.data({ t: 'face', bs: { jawOpen: r(bs.jawOpen || 0), eyeBlinkLeft: r(bs.eyeBlinkLeft || 0), eyeBlinkRight: r(bs.eyeBlinkRight || 0) }, rot: rot ? { x: r(rot.x), y: r(rot.y), z: r(rot.z) } : null }, false);
      });
      this.app.toast('🙂 ميموجيك يتحرك بوجهك عند الآخرين', 2500);
    } catch (e) { this.app.toast('الكاميرا الأمامية غير متاحة: ' + (e?.message || e), 3000); }
  }
  faceOff() { try { this.stopFace?.(); } catch {} this.stopFace = null; }
  update(now) {
    if (this.lead && this.room && now - this.lastSend > 1000) { this.lastSend = now; this.send(false); }
    if (!this.people.size) return;
    const rp = this.room?.remoteParticipants;
    for (const [id, P] of this.people) {
      if (!P.F) continue;
      if (P.goal) P.F.group.position.lerp(P.goal, 0.1);
      const who = rp?.get?.(id), talking = !!(who && (who.isSpeaking || (who.audioLevel || 0) > 0.04));
      P.F.update(now, new THREE.Vector3(0, 0, 0), talking);
    }
  }
}
