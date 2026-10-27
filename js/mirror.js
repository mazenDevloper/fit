// Screen mirroring between Madar on a laptop and Madar on the phone (WebRTC via PeerJS).
// Laptop: shares its screen and shows a 6-digit code / QR / link.
// Phone: joins with the code (or opens the link) and gets the screen as a window.
// The same connection also syncs saved links both ways.
import { loadLinks, saveLinks, settings, deviceIdentity } from './config.js';

const PREFIX = 'madar-scr-';
let libP = null;
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}
export function lib() {
  if (!libP) libP = Promise.all([
    loadScript(new URL('../lib/peer/peerjs.min.js', import.meta.url).href),
    loadScript(new URL('../lib/peer/qrcode.js', import.meta.url).href),
    cloudTurn(),
  ]);
  return libP;
}
// STUN finds a direct path; the public TURN relay carries the picture when the two networks can't
// reach each other directly (e.g. phone on 4G, laptop behind a strict router).
export const rtc = { config: { iceServers: [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:global.stun.twilio.com:3478'] },
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
] } };
// Cloudflare's TURN relay (our server hands out short-lived keys): the screen connects even when the two devices
// are on different networks (4G ↔ home Wi-Fi). Put first; the free public relay stays as a fallback.
async function cloudTurn() {
  try {
    const ctl = new AbortController(); setTimeout(() => ctl.abort(), 3000);
    const d = await (await fetch('https://studio.c-p.workers.dev/turn', { signal: ctl.signal })).json();
    if (Array.isArray(d.iceServers) && d.iceServers.length) rtc.config.iceServers = [...d.iceServers, ...rtc.config.iceServers];
  } catch (e) {}
}
// Optional own signalling server (set localStorage 'madar.peerServer' to {"host":..,"port":..,"path":..,"secure":..}).
try { const own = JSON.parse(localStorage.getItem('madar.peerServer') || 'null'); if (own && own.host) Object.assign(rtc, own); } catch {}

export function mergeLinks(incoming) {
  const mine = loadLinks();
  let added = 0;
  for (const l of incoming || []) if (l && l.url && !mine.some(m => m.url === l.url)) { mine.push(l); added++; }
  if (added) saveLinks(mine);
  return added;
}

export function qrSvg(text, size = 220) {
  const q = window.qrcode(0, 'M'); q.addData(text); q.make();
  return q.createSvgTag({ cellSize: Math.max(2, Math.floor(size / (q.getModuleCount() + 8))), margin: 4, scalable: true });
}

// ---------- Madar Android app: real screen capture of this device ----------
// The app captures the whole screen (MediaProjection) and pushes JPEG frames into the page
// with __madarFrame(); they become a video track. Frames are pushed by the app (not pulled by
// timers) so sharing keeps flowing while you use other apps.
export const isAndroidApp = () => !!window.MadarAndroid;
// JPEG pictures from the Android app → a live video track (MediaStreamTrackGenerator when available, else a canvas).
// Pictures carry their capture time, so the encoder sees evenly paced frames (smoother than arrival time).
class FrameTrack {
  constructor() {
    this.useGen = typeof window.MediaStreamTrackGenerator === 'function' && typeof window.VideoFrame === 'function';
    this.busy = false; this.t0 = performance.now(); this.lastTs = -1;
    if (this.useGen) { this.track = new MediaStreamTrackGenerator({ kind: 'video' }); this.writer = this.track.writable.getWriter(); }
    else {
      this.canvas = document.createElement('canvas'); this.canvas.width = 1280; this.canvas.height = 720; this.ctx = this.canvas.getContext('2d');
      const st = this.canvas.captureStream(0); this.track = st.getVideoTracks()[0];
    }
  }
  async push(u, ts) {
    if (this.busy) return;               // newest frame wins; never queue
    this.busy = true;
    try {
      const bmp = await createImageBitmap(new Blob([u], { type: 'image/jpeg' }));
      if (this.useGen) {
        let us = ts != null ? ts * 1000 : Math.round((performance.now() - this.t0) * 1000);
        if (us <= this.lastTs) us = this.lastTs + 1000;
        this.lastTs = us;
        const f = new VideoFrame(bmp, { timestamp: us });
        await this.writer.write(f); f.close?.();
      } else {
        if (this.canvas.width !== bmp.width || this.canvas.height !== bmp.height) { this.canvas.width = bmp.width; this.canvas.height = bmp.height; }
        this.ctx.drawImage(bmp, 0, 0); this.track.requestFrame?.();
      }
      bmp.close?.();
    } catch {}
    this.busy = false;
  }
  stop() { try { this.track.stop(); } catch {} }
}
const b64bytes = b64 => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
// Raw bytes from the app: "MDR" + kind (1 picture, 2 sound, 3 browser picture + time, 4 screen picture + time).
if (typeof window !== 'undefined' && !window.__madarBin) {
  window.__madarBin = true;
  window.addEventListener('message', e => {
    const d = e.data; if (!(d instanceof ArrayBuffer) || d.byteLength < 5) return;
    const h = new Uint8Array(d, 0, 4); if (h[0] !== 77 || h[1] !== 68 || h[2] !== 82) return;
    const k = h[3];
    if (k === 1) { window.__madarBinFrame?.(new Uint8Array(d, 4)); try { window.__madarTick?.(); } catch {} }
    else if (k === 2) window.__madarBinAudio?.(new Int16Array(d.slice(4)));
    else if (k === 3 || k === 4) {
      const ts = new DataView(d, 4, 4).getUint32(0, true), u = new Uint8Array(d, 8);
      if (k === 4) { window.__madarBinFrame?.(u, ts); try { window.__madarTick?.(); } catch {} }
      else { window.__madarWebBin?.(u, ts); try { window.__madarTick?.(); } catch {} }
    }
  });
}

function androidStream(onEnded, method = 'startCapture') {
  const A = window.MadarAndroid;
  return new Promise((res, rej) => {
    let ft = null, started = false;
    // Tablet sound: 40 ms PCM chunks (48 kHz stereo 16-bit) from the app, played into an audio track.
    let ac = null, dest = null, at = 0;
    try { ac = new AudioContext({ sampleRate: 48000 }); dest = ac.createMediaStreamDestination(); ac.resume?.(); } catch { ac = null; }
    const playPcm = pcm => {   // Int16Array, stereo interleaved
      if (!ac || !started) return;
      try {
        const n = pcm.length >> 1, buf = ac.createBuffer(2, n, 48000);
        const L = buf.getChannelData(0), R = buf.getChannelData(1);
        for (let i = 0; i < n; i++) { L[i] = pcm[2 * i] / 32768; R[i] = pcm[2 * i + 1] / 32768; }
        const src = ac.createBufferSource(); src.buffer = buf; src.connect(dest);
        const now = ac.currentTime;
        if (at < now + 0.02 || at > now + 0.4) at = now + 0.08;   // small jitter buffer, resync if drifting
        src.start(at); at += buf.duration;
      } catch {}
    };
    window.__madarAudio = b64 => { const u = b64bytes(b64); playPcm(new Int16Array(u.buffer, 0, u.length >> 1)); };
    window.__madarFrame = b64 => { if (started) ft.push(b64bytes(b64)); try { window.__madarTick?.(); } catch {} };
    window.__madarBinFrame = (u, ts) => { if (started) ft.push(u, ts); };
    window.__madarBinAudio = pcm => playPcm(pcm);
    window.__madarCapture = state => {
      if (state === 'started' && !started) {
        started = true;
        ft = new FrameTrack();
        res(new MediaStream([ft.track, ...(dest ? dest.stream.getAudioTracks() : [])]));
      } else if (state === 'denied') { rej(new Error('أُلغيت المشاركة أو لم يُسمح بها')); }
      else if (state === 'stopped') { started = false; try { ac?.close(); } catch {} onEnded?.(); }
    };
    try { A[method](); } catch (e) { rej(new Error(method === 'startUvc' ? 'تعذّر تشغيل قطعة HDMI' : 'تعذّر بدء التقاط الشاشة')); }
  });
}

// ---------- Remote control of the sharing device ----------
// The phone sends clicks/scrolls/text (positions as 0..1 of the shared picture).
// Computer: delivered to Madar Agent (a small helper on the computer) on ws://127.0.0.1:8788.
// Madar Android app: delivered to its accessibility service (real taps and swipes on the tablet).
export const AGENT_URL = 'ws://127.0.0.1:8788';
export const AGENT_DOWNLOAD = 'https://github.com/mazenDevloper/fit/releases/tag/agent-latest';
class AgentLink {
  constructor(onChange) { this.onChange = onChange; this.ws = null; this.ok = false; this.on = false; }
  start() { this.on = true; this.connect(); }
  connect() {
    if (!this.on || this.ws) return;
    let ws; try { ws = new WebSocket(AGENT_URL); } catch { this.retry(); return; }
    this.ws = ws;
    ws.onopen = () => { this.ok = true; this.onChange(); };
    ws.onclose = () => { const was = this.ok; this.ws = null; this.ok = false; if (was) this.onChange(); this.retry(); };
    ws.onerror = () => {};
  }
  retry() { clearTimeout(this.t); if (this.on) this.t = setTimeout(() => this.connect(), 4000); }
  send(m) { if (this.ok) try { this.ws.send(JSON.stringify(m)); } catch {} }
  stop() { this.on = false; clearTimeout(this.t); try { this.ws?.close(); } catch {} this.ws = null; this.ok = false; }
}

// ---------- Laptop side ----------
export class ScreenHost {
  constructor(onStatus) {
    this.onStatus = onStatus; this.code = ''; this.stream = null; this.peer = null; this.viewers = new Set();
    this.agent = new AgentLink(() => { this.sendCaps(); this.status(); });
    this.scrollAcc = null;
  }
  // What the viewer may do with this screen.
  caps() {
    if (settings.mirrorControl === false) return { control: false, why: 'التحكم عن بُعد متوقف من الجهاز المشارِك' };
    const A = window.MadarAndroid;
    if (A) {
      let on = false; try { on = A.controlState && A.controlState() === 'on'; } catch {}
      return on ? { control: true, kind: 'android' } : { control: false, kind: 'android', why: 'فعّل «تحكم مدار» في التابلت: الإعدادات ← سهولة الاستخدام' };
    }
    const surf = this.stream?.getVideoTracks()[0]?.getSettings?.().displaySurface;
    if (surf && surf !== 'monitor') return { control: false, why: 'للتحكم شارك «الشاشة كاملة» وليس نافذة أو تبويباً' };
    if (!this.agent.ok) return { control: false, kind: 'agent', why: 'للتحكم بالماوس شغّل برنامج Madar Agent على الكمبيوتر' };
    return { control: true, kind: 'agent' };
  }
  sendCaps() { const c = this.caps(); this.viewers.forEach(v => { try { v.send({ type: 'caps', ...c }); } catch {} }); }
  // Input from a viewer.
  input(m) {
    if (!this.caps().control) return;
    const A = window.MadarAndroid;
    if (A) {
      // Many small scroll steps become one smooth swipe on the tablet.
      if (m.a === 'scroll') {
        const acc = this.scrollAcc || (this.scrollAcc = { x: m.x, y: m.y, dx: 0, dy: 0 });
        acc.dx += m.dx; acc.dy += m.dy;
        if (!this.scrollT) this.scrollT = setTimeout(() => { this.scrollT = 0; const a = this.scrollAcc; this.scrollAcc = null; try { A.input(JSON.stringify({ a: 'scroll', x: a.x, y: a.y, dx: a.dx, dy: a.dy })); } catch {} }, 110);
        return;
      }
      if (m.a === 'move') return;          // a touch screen has no hover
      try { A.input(JSON.stringify(m)); } catch {}
      return;
    }
    const t = this.stream?.getVideoTracks()[0]?.getSettings?.() || {};
    this.agent.send({ ...m, fw: t.width || 0, fh: t.height || 0 });
  }
  get link() { return location.origin + location.pathname + '#m' + this.code; }
  async start(opts = {}) {
    // switching source while sharing (screen ⇄ HDMI): the old picture stops, the viewers get the new one
    const old = this.stream, live = !!this.peer;
    if (old && live) { try { if (window.MadarAndroid) window.MadarAndroid.stopCapture(); } catch {} old.getTracks().forEach(t => t.stop()); this.stream = null; await new Promise(r => setTimeout(r, 400)); }
    if (opts.controlOnly) {
      // «remote only»: no picture, just the control link (a TV box you watch through HDMI, a tablet across the room)
      this.hdmi = false; this.stream = null; this.controlOnly = true;
      try { window.MadarAndroid?.setRemoteOnly?.(true); } catch {}
    }
    else if (opts.hdmi) {
      this.hdmi = true; this.quality = 'hdmi';
      // Madar's Android app reads USB capture cards itself (Android hides them from the browser's camera list)
      if (window.MadarAndroid?.startUvc) this.stream = await androidStream(() => this.stop(), 'startUvc');
      else this.stream = await hdmiStream(opts.deviceId);
      this.stream.getVideoTracks()[0].addEventListener('ended', () => this.stop());
    }
    else if (window.MadarAndroid) { this.hdmi = false; this.stream = await androidStream(() => this.stop()); clearInterval(this.capT); this.capT = setInterval(() => { const k = JSON.stringify(this.caps()); if (k !== this.lastCaps) { this.lastCaps = k; this.sendCaps(); this.status(); } }, 2000); }
    else {
    this.hdmi = false;
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('هذا المتصفح لا يدعم مشاركة الشاشة — استخدم Chrome أو Edge على الكمبيوتر');
    try { this.stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 30 }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: true }); }
    catch (e) { throw new Error(e.name === 'NotAllowedError' ? 'أُلغيت المشاركة أو لم يُسمح بها' : 'هذا الجهاز لا يسمح بمشاركة الشاشة من المتصفح'); }
    this.stream.getVideoTracks()[0].addEventListener('ended', () => this.stop());
    }
    await lib();
    if (live && this.peer && !this.peer.destroyed) {
      for (const c of this.viewers) { try { const call = this.peer.call(c.peer, this.stream); this.tune(call); c.send({ type: 'caps', ...this.caps(), hdmi: !!this.hdmi }); } catch {} }
      this.status(); return;
    }
    // Always this device's permanent number (so its QR code never changes). If the number is still held by a
    // session that just closed, wait for it to be released; only as a last resort use a temporary one.
    const fixed = deviceIdentity().code;
    for (let tries = 0; tries < 6 && !this.peer; tries++) {
      const code = tries < 5 ? fixed : String(Math.floor(100000 + Math.random() * 900000));
      try { this.peer = await this.open(code); this.code = code; }
      catch (e) { if (e.type !== 'unavailable-id') throw e; await new Promise(r => setTimeout(r, 2500)); }
    }
    this.peer.on('connection', conn => this.accept(conn));
    if (!window.MadarAndroid && !this.hdmi) this.agent.start();
    else {
      let last = 0;
      window.__madarTick = () => {
        const now = Date.now(); if (now - last < 4000 || !this.peer) return; last = now;
        try { if (this.peer.disconnected && !this.peer.destroyed) this.peer.reconnect(); else this.peer.socket?.send?.({ type: 'HEARTBEAT' }); } catch {}
      };
    }
    // Keep the code reachable: if the signalling link drops (Wi-Fi blip, laptop asleep), rejoin with the same code.
    this.peer.on('disconnected', () => { setTimeout(() => { try { if (this.peer && !this.peer.destroyed) this.peer.reconnect(); } catch {} }, 1000); });
    this.status();
  }
  open(code) {
    return new Promise((res, rej) => {
      const p = new window.peerjs.Peer(PREFIX + code, rtc);
      p.once('open', () => res(p)); p.once('error', rej);
    });
  }
  accept(conn) {
    conn.on('open', () => {
      this.viewers.add(conn); this.status();
      conn.send({ type: 'links', links: loadLinks() });
      conn.send({ type: 'caps', ...this.caps(), hdmi: !!this.hdmi });
      const call = this.stream ? this.peer.call(conn.peer, this.stream) : null;
      if (call) this.tune(call);
      conn.on('close', () => { this.viewers.delete(conn); call?.close(); this.status(); });
    });
    conn.on('data', d => {
      if (!d) return;
      if (d.type === 'links') { const n = mergeLinks(d.links); if (n) this.onStatus?.({ synced: n }); }
      else if (d.type === 'input') this.input(d);
      else if (d.type === 'quality') this.setQuality(d.level);
    });
  }
  // Quality chosen in the headset: picture size, JPEG quality (tablet app) and network bitrate.
  setQuality(level) {
    // game: smooth 30 fps first (smaller picture, motion-tuned encoder).
    const Q = { game: [1280, 74, 6000000, 30], low: [960, 62, 1200000, 24], medium: [1280, 72, 2500000, 30], high: [1600, 80, 5000000, 30], max: [1920, 88, 8000000, 30] }[level];
    if (!Q) return;
    if (this.hdmi) return;              // the HDMI card keeps its own low-delay settings
    this.quality = level;
    try { window.MadarAndroid?.setQuality?.(Q[0], Q[1]); window.MadarAndroid?.setFps?.(Q[3]); } catch {}
    this.stream?.getVideoTracks().forEach(t => { try { t.contentHint = level === 'game' ? 'motion' : 'detail'; } catch {} });
    if (!window.MadarAndroid) { const t = this.stream?.getVideoTracks()[0]; t?.applyConstraints?.({ width: { ideal: Q[0] * 16 / 9 > 1920 ? 2560 : 1920 }, frameRate: { ideal: 30 } }).catch(() => {}); }
    (this.calls || []).forEach(c => this.tune(c));
  }
  // Prefer a steady picture over sharpness when the network is weak, so the screen never freezes.
  tune(call) {
    const pc = call && call.peerConnection; if (!pc) return;
    (this.calls || (this.calls = new Set())).add(call);
    const rate = { hdmi: 10000000, game: 6000000, low: 1200000, medium: 2500000, high: 5000000, max: 8000000 }[this.quality || 'high'];
    const apply = () => pc.getSenders().forEach(snd => {
      if (!snd.track || snd.track.kind !== 'video') return;
      try {
        const p = snd.getParameters(); p.encodings = p.encodings && p.encodings.length ? p.encodings : [{}];
        p.encodings[0].maxBitrate = rate; p.encodings[0].maxFramerate = this.hdmi ? Math.min(60, this.stream?.getVideoTracks()[0]?.getSettings?.().frameRate || 30) : 30;
        if (this.hdmi) { p.encodings[0].priority = 'high'; p.encodings[0].networkPriority = 'high'; const w = this.stream?.getVideoTracks()[0]?.getSettings?.().width || 0; if (w > 1280) p.encodings[0].scaleResolutionDownBy = w / 1280; p.encodings[0].maxBitrate = 6000000; }
        p.degradationPreference = this.hdmi || this.quality === 'game' || this.quality === 'low' ? 'maintain-framerate' : 'balanced';
        snd.setParameters(p).catch(() => {});
      } catch {}
    });
    pc.addEventListener('connectionstatechange', () => { if (pc.connectionState === 'connected') apply(); if (pc.connectionState === 'closed') this.calls?.delete(call); });
    if (pc.connectionState === 'connected') apply();
  }
  status() { const live = !!this.stream || !!this.controlOnly; this.onStatus?.({ code: this.code, link: this.link, viewers: this.viewers.size, live, controlOnly: !!this.controlOnly, caps: live ? this.caps() : null }); }
  stop() {
    if (!this.stream && !this.peer) return;
    if (this.controlOnly) { this.controlOnly = false; try { window.MadarAndroid?.setRemoteOnly?.(false); } catch {} }
    this.agent.stop(); clearInterval(this.capT);
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
    if (window.MadarAndroid) try { window.MadarAndroid.stopCapture(); } catch {}
    this.peer?.destroy(); this.peer = null; this.viewers.clear();
    this.onStatus?.({ live: false });
  }
}

// ---------- Built-in browser host (Madar Android app) ----------
// The app runs a real browser on an invisible screen; this streams it to viewers and feeds their taps,
// scrolls and typing straight into it. Started remotely from the headset — no prompt on the tablet.
const WEB_PREFIX = 'madar-web-';
export class WebHost {
  constructor(app) { this.app = app; this.peer = null; this.viewers = new Set(); this.calls = new Set(); this.state = {}; this.ft = null; }
  get available() { return !!window.MadarAndroid?.hasBrowser; }
  async ensure(url, size) {
    const A = window.MadarAndroid; if (!A?.browserStart) return false;
    if (this.ft && this.peer && !this.peer.destroyed) { if (url) A.browserInput(JSON.stringify({ a: 'nav', url })); return true; }
    this.ft = new FrameTrack();
    this.stream = new MediaStream([this.ft.track]);
    window.__madarWebBin = (u, ts) => this.ft?.push(u, ts);
    window.__madarWebFrame = b64 => this.ft?.push(b64bytes(b64));
    window.__madarWebState = s => { this.state = s || {}; this.viewers.forEach(v => { try { v.send({ type: 'page', ...this.state }); } catch {} }); };
    A.browserStart(url || '', size?.w || 1280, size?.h || 800);
    await lib();
    const code = deviceIdentity().code;
    for (let tries = 0; tries < 6 && !this.peer; tries++) {
      try {
        this.peer = await new Promise((res, rej) => { const p = new window.peerjs.Peer(WEB_PREFIX + code, rtc); p.once('open', () => res(p)); p.once('error', e => { try { p.destroy(); } catch {} rej(e); }); });
      } catch (e) { if (e.type !== 'unavailable-id') break; await new Promise(r => setTimeout(r, 2000)); }
    }
    if (!this.peer) { this.stop(); return false; }
    this.peer.on('connection', c => this.accept(c));
    this.peer.on('disconnected', () => setTimeout(() => { try { if (this.peer && !this.peer.destroyed) this.peer.reconnect(); } catch {} }, 1000));
    this.app?.log?.('المتصفح المدمج: يعمل');
    return true;
  }
  accept(conn) {
    conn.on('open', () => {
      this.viewers.add(conn); clearTimeout(this.idleT);
      conn.send({ type: 'caps', control: true, kind: 'browser' });
      conn.send({ type: 'page', ...this.state });
      const call = this.peer.call(conn.peer, this.stream);
      this.tune(call);
      conn.on('close', () => { this.viewers.delete(conn); call?.close(); this.idle(); });
    });
    conn.on('data', d => { if (d && d.type === 'input') this.input(d); else if (d && d.type === 'quality') this.quality(d.level); });
  }
  input(m) {
    const A = window.MadarAndroid; if (!A) return;
    if (m.a === 'move') return;
    if (m.a === 'scroll') {   // many small scroll steps → one smooth swipe
      const acc = this.acc || (this.acc = { x: m.x, y: m.y, dx: 0, dy: 0 });
      acc.dx += m.dx; acc.dy += m.dy;
      if (!this.accT) this.accT = setTimeout(() => { this.accT = 0; const a = this.acc; this.acc = null; A.browserInput(JSON.stringify({ a: 'scroll', x: a.x, y: a.y, dx: a.dx, dy: a.dy })); }, 90);
      return;
    }
    if (m.a === 'resize') {
      const w = m.aspect >= 1 ? 1280 : Math.round(900 * m.aspect), h = Math.round(w / m.aspect);
      A.browserInput(JSON.stringify({ a: 'resize', w, h })); return;
    }
    A.browserInput(JSON.stringify(m));
  }
  quality(level) {
    const Q = { game: [72, 30], low: [62, 24], medium: [74, 30], high: [82, 30], max: [90, 30] }[level];
    if (Q) window.MadarAndroid?.browserQuality?.(Q[0], Q[1]);
    this.level = level; this.calls.forEach(c => this.tune(c));
  }
  tune(call) {
    const pc = call && call.peerConnection; if (!pc) return;
    this.calls.add(call);
    const apply = () => pc.getSenders().forEach(snd => {
      if (!snd.track || snd.track.kind !== 'video') return;
      try {
        const p = snd.getParameters(); p.encodings = p.encodings && p.encodings.length ? p.encodings : [{}];
        p.encodings[0].maxBitrate = this.level === 'low' ? 1500000 : 5000000; p.encodings[0].maxFramerate = 30;
        p.degradationPreference = 'maintain-resolution';   // text stays sharp; motion may drop frames first
        snd.setParameters(p).catch(() => {});
      } catch {}
    });
    pc.addEventListener('connectionstatechange', () => { if (pc.connectionState === 'connected') apply(); if (pc.connectionState === 'closed') this.calls.delete(call); });
    if (pc.connectionState === 'connected') apply();
  }
  // Nobody watching for 2 minutes: close the browser to save the tablet's battery.
  idle() { clearTimeout(this.idleT); if (!this.viewers.size) this.idleT = setTimeout(() => { if (!this.viewers.size) this.stop(); }, 120000); }
  stop() {
    try { window.MadarAndroid?.browserStop(); } catch {}
    this.ft?.stop(); this.ft = null;
    try { this.peer?.destroy(); } catch {} this.peer = null;
    this.viewers.clear(); this.calls.clear();
  }
}

// ---------- HDMI capture card (USB "video capture" sticks: PlayStation, TV box, receiver…) ----------
// Read straight from the card like a webcam - no screen capture in between, so less delay and a clean picture.
const CARD_RX = /usb video|capture|hdmi|cam ?link|uvc|macrosilicon|ms21\d\d|elgato|avermedia|ezcap|video grabber|usb3\.0/i;
const BUILTIN_RX = /facetime|integrated|built.?in|front|back|rear|ir camera|truedepth|hd webcam|user facing|environment/i;
export async function captureDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  let list = await navigator.mediaDevices.enumerateDevices();
  if (!list.some(d => d.kind === 'videoinput' && d.label)) {
    // labels appear only after one permission: ask once, close it at once
    try { const t = await navigator.mediaDevices.getUserMedia({ video: true }); t.getTracks().forEach(x => x.stop()); } catch {}
    list = await navigator.mediaDevices.enumerateDevices();
  }
  const cams = list.filter(d => d.kind === 'videoinput');
  const score = d => (CARD_RX.test(d.label) ? 2 : 0) + (BUILTIN_RX.test(d.label) ? -2 : 0);
  return cams.map(d => ({ id: d.deviceId, label: d.label || 'كاميرا', group: d.groupId, card: score(d) > 0, score: score(d) })).sort((a, b) => b.score - a.score);
}
export async function hdmiStream(deviceId) {
  const cams = await captureDevices();
  const cam = cams.find(c => c.id === deviceId) || cams[0];
  if (!cam) throw new Error('لم أجد قطعة HDMI — وصّلها بمنفذ USB 3.0 ثم أعد المحاولة');
  const video = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: cam.id }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
  // the card's own sound (same USB device), raw: no echo cancelling / noise filters that add delay
  try {
    const mics = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
    const key = (cam.label.match(/usb ?\d(\.\d)? ?video|[a-z0-9]{4}:[a-z0-9]{4}/i) || [''])[0].toLowerCase();
    const mic = mics.find(m => m.groupId && m.groupId === cam.group) || mics.find(m => key && m.label.toLowerCase().includes(key)) || mics.find(m => CARD_RX.test(m.label) || /digital audio interface|usb audio/i.test(m.label));
    if (mic) {
      const a = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: mic.deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false, latency: 0, channelCount: 2 } });
      a.getAudioTracks().forEach(t => video.addTrack(t));
    }
  } catch {}
  video.getVideoTracks().forEach(t => { try { t.contentHint = 'motion'; } catch {} });
  video.label = cam.label;
  return video;
}
// H.264 first: the iPhone decodes it in hardware (faster, cooler) - VP8 is decoded by the processor
export function preferH264(sdp) {
  return sdp.replace(/(m=video \d+ [A-Z/]+ )([\d ]+)/, (all, head, pts) => {
    const h264 = [...sdp.matchAll(/a=rtpmap:(\d+) H264\/90000/g)].map(m => m[1]);
    if (!h264.length) return all;
    const rest = pts.split(' ').filter(p => !h264.includes(p));
    return head + [...h264, ...rest].join(' ');
  });
}

// ---------- Phone side ----------
export class ScreenViewer {
  // prefix: 'madar-scr-' (shared screens) or 'madar-web-' (a device's built-in browser).
  constructor(prefix = PREFIX) { this.peer = null; this.gen = 0; this.prefix = prefix; }
  // Resolves with the remote MediaStream; onEnd is called when the laptop stops sharing.
  send(m) { try { if (this.conn && this.conn.open) this.conn.send(m); } catch {} }
  // HDMI (games, live TV): show every frame as soon as it arrives - no smoothing buffer
  lowDelay() {
    try { this.pc?.getReceivers().forEach(r => { if ('jitterBufferTarget' in r) r.jitterBufferTarget = 40; }); } catch {}
  }
  // How late the picture is, in ms: network (half the round trip) + waiting in the buffer + decoding + ~1 frame
  // to capture and encode on the other side. Measured every second from the connection's own statistics.
  meter(cb) {
    clearInterval(this.meterT); if (!cb) return;
    let last = null;
    this.meterT = setInterval(async () => {
      const pc = this.pc; if (!pc) return;
      try {
        const st = await pc.getStats(); let rtt = 0, jb = 0, jn = 0, dec = 0, fd = 0, fps = 0, relay = false, lost = 0;
        st.forEach(r => {
          if (r.type === 'candidate-pair' && (r.nominated || r.selected) && r.state === 'succeeded') { rtt = r.currentRoundTripTime || rtt; const lc = st.get(r.localCandidateId), rc = st.get(r.remoteCandidateId); relay = lc?.candidateType === 'relay' || rc?.candidateType === 'relay'; }
          if (r.type === 'inbound-rtp' && r.kind === 'video') { jb = r.jitterBufferDelay || 0; jn = r.jitterBufferEmittedCount || 0; dec = r.totalDecodeTime || 0; fd = r.framesDecoded || 0; fps = r.framesPerSecond || 0; lost = r.packetsLost || 0; }
        });
        const cur = { jb, jn, dec, fd };
        if (last && jn > last.jn && fd > last.fd) {
          const buf = (jb - last.jb) / (jn - last.jn), d = (dec - last.dec) / (fd - last.fd);
          const ms = Math.round((rtt / 2 + buf + d + 1 / Math.max(24, fps || 30)) * 1000 + 15);
          cb({ ms, fps: Math.round(fps), relay, lost });
        }
        last = cur;
      } catch {}
    }, 1000);
  }
  async connect(code, { onEnd, onLinks, onCaps, onPage, onDelay, onStream } = {}) {
    await lib();
    this.close();
    const gen = this.gen;
    let ended = false;
    // Called once per connection, and never for a connection we replaced ourselves.
    const end = why => { if (ended || gen !== this.gen) return; ended = true; onEnd?.(why); };
    const peer = this.peer = new window.peerjs.Peer(undefined, rtc); this.got = false;
    await new Promise((res, rej) => { peer.once('open', res); peer.once('error', rej); });
    return new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error('لم يتم العثور على الجهاز — تأكد من الرقم وأن المشاركة تعمل عليه')), 15000);
      peer.on('error', e => { clearTimeout(timer); rej(new Error(e.type === 'peer-unavailable' ? 'الرمز غير صحيح أو انتهت المشاركة' : (e.message || e.type))); });
      const conn = this.conn = peer.connect(this.prefix + code, { reliable: true });
      conn.on('open', () => conn.send({ type: 'links', links: loadLinks() }));
      conn.on('data', d => {
        if (!d || gen !== this.gen) return;
        if (d.type === 'links') onLinks?.(mergeLinks(d.links));
        else if (d.type === 'caps') { this.caps = d; onCaps?.(d); if (d.hdmi) this.lowDelay(); }
        else if (d.type === 'page') { this.page = d; onPage?.(d); }
      });
      conn.on('close', () => end('closed'));
      peer.on('call', call => {
        call.answer();
        call.on('stream', s => {
          clearTimeout(timer);
          // A small steady buffer evens out Wi-Fi hiccups (smoother picture, ~0.1 s later).
          try { call.peerConnection.getReceivers().forEach(r => { if ('jitterBufferTarget' in r) r.jitterBufferTarget = 100; }); } catch {}
          if (this.caps?.hdmi) this.lowDelay();
          this.meter(onDelay);
          if (this.got) onStream?.(s); else { this.got = true; res(s); }   // a later picture (source switched) replaces the first
        });
        call.on('close', () => end('closed'));
        // Network trouble: 'disconnected' often heals by itself within seconds; 'failed' never does.
        const pc = this.pc = call.peerConnection;
        if (pc) {
          let lost = 0;
          pc.addEventListener('iceconnectionstatechange', () => {
            const st = pc.iceConnectionState;
            clearTimeout(lost);
            if (st === 'failed') end('network');
            else if (st === 'disconnected') lost = setTimeout(() => { if (pc.iceConnectionState === 'disconnected') end('network'); }, 5000);
          });
        }
      });
    });
  }
  healthy() { const st = this.pc && this.pc.iceConnectionState; return st === 'connected' || st === 'completed'; }
  close() { clearInterval(this.meterT); this.gen++; this.pc = null; this.conn = null; this.caps = null; try { this.peer?.destroy(); } catch {} this.peer = null; }
}
