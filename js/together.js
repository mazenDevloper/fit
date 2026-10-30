// «شاهد معاً» (LiveKit): everyone in the room hears each other, and one of you leads what is watched —
// the others open the same video at the same second and follow play / pause / jumps.
//   the server (studio /lk/token) signs a ticket per device; LiveKit Cloud carries the voices and the sync messages
import { settings } from './config.js';
import { blip } from './ui.js';

const API = 'https://studio.c-p.workers.dev';
const LIB = new URL('../lib/x/livekit.js', import.meta.url).href;
const enc = new TextEncoder(), dec = new TextDecoder();

export class Together {
  constructor(app) { this.app = app; this.room = null; this.lead = false; this.audios = new Map(); this.lastSend = 0; }
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
      room.on(E.ParticipantConnected, p => { blip('open', settings.sounds); a.toast('👥 انضم ' + (p.name || p.identity), 2500); if (this.lead) this.send(true); });
      room.on(E.ParticipantDisconnected, p => a.toast('👋 غادر ' + (p.name || p.identity), 2000));
      room.on(E.ActiveSpeakersChanged, sp => { const s = sp.find(x => !x.isLocal); if (s && performance.now() - (this.spokeAt || 0) > 4000) { this.spokeAt = performance.now(); a.toast('🎙 ' + (s.name || s.identity), 1200); } });
      room.on(E.DataReceived, (bytes, who) => { try { this.receive(JSON.parse(dec.decode(bytes)), who); } catch {} });
      room.on(E.Disconnected, () => { if (this.room === room) this.cleanup(); });
      await room.connect(t.url, t.token);
      await room.localParticipant.setMicrophoneEnabled(true).catch(() => a.toast('المايكروفون غير متاح — تسمع فقط', 2500));
      this.room = room;
      const n = room.remoteParticipants.size;
      a.toast('👥 أنت في «شاهد معاً»' + (n ? ' مع ' + n : ' — أرسل الرابط لمن تريد') + ' · «قُد المشاهدة» ليتبعك الجميع', 4000);
    } catch (e) { a.toast('تعذّر دخول الغرفة: ' + (e?.message || e), 3500); this.cleanup(); }
  }
  leave() { try { this.room?.disconnect(); } catch {} this.cleanup(); this.app.toast('خرجت من «شاهد معاً»', 1500); }
  cleanup() { this.audios.forEach(e => e.remove()); this.audios.clear(); this.room = null; this.lead = false; }
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
    if (m.t !== 'watch' || !m.url) return;
    this.lead = false;   // someone else leads now
    const a = this.app, W = a.windows;
    let w = W.windows.find(x => x.video && (x.url === m.url || x.video.currentSrc === m.url));
    if (!w) { W.open({ kind: 'video', url: m.url, title: m.title }); a.toast('🎬 ' + (who?.name || 'صديق') + ' يشاهد: ' + (m.title || 'فيديو'), 2500); return setTimeout(() => this.receive(m, who), 1500); }
    const v = w.video, want = m.time + (m.playing ? (Date.now() - m.at) / 1000 : 0);
    if (Math.abs(v.currentTime - want) > 1.2) v.currentTime = want;
    if (m.playing && v.paused) v.play().catch(() => {}); else if (!m.playing && !v.paused) v.pause();
  }
  update(now) { if (this.lead && this.room && now - this.lastSend > 1000) { this.lastSend = now; this.send(false); } }
}
