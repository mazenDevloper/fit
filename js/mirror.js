// Screen mirroring between Madar on a laptop and Madar on the phone (WebRTC via PeerJS).
// Laptop: shares its screen and shows a 6-digit code / QR / link.
// Phone: joins with the code (or opens the link) and gets the screen as a window.
// The same connection also syncs saved links both ways.
import { loadLinks, saveLinks, settings } from './config.js';

const PREFIX = 'madar-scr-';
let libP = null;
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}
function lib() {
  if (!libP) libP = Promise.all([
    loadScript(new URL('../lib/peer/peerjs.min.js', import.meta.url).href),
    loadScript(new URL('../lib/peer/qrcode.js', import.meta.url).href),
  ]);
  return libP;
}
// STUN finds a direct path; the public TURN relay carries the picture when the two networks can't
// reach each other directly (e.g. phone on 4G, laptop behind a strict router).
const rtc = { config: { iceServers: [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:global.stun.twilio.com:3478'] },
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
] } };

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
function androidStream(onEnded) {
  const A = window.MadarAndroid;
  return new Promise((res, rej) => {
    let track = null, writer = null, canvas = null, ctx = null, busy = false, t0 = performance.now(), started = false;
    const useGen = typeof window.MediaStreamTrackGenerator === 'function' && typeof window.VideoFrame === 'function';
    const draw = async b64 => {
      if (busy) return; busy = true;
      try {
        const bin = atob(b64), u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        const bmp = await createImageBitmap(new Blob([u], { type: 'image/jpeg' }));
        if (useGen) {
          const f = new VideoFrame(bmp, { timestamp: Math.round((performance.now() - t0) * 1000) });
          await writer.write(f); f.close?.();
        } else {
          if (canvas.width !== bmp.width || canvas.height !== bmp.height) { canvas.width = bmp.width; canvas.height = bmp.height; }
          ctx.drawImage(bmp, 0, 0); track.requestFrame?.();
        }
        bmp.close?.();
      } catch {}
      busy = false;
    };
    window.__madarFrame = b64 => { if (started) draw(b64); };
    window.__madarCapture = state => {
      if (state === 'started' && !started) {
        started = true;
        let stream;
        if (useGen) {
          track = new MediaStreamTrackGenerator({ kind: 'video' });
          writer = track.writable.getWriter();
          stream = new MediaStream([track]);
        } else {
          canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
          ctx = canvas.getContext('2d');
          stream = canvas.captureStream(0); track = stream.getVideoTracks()[0];
        }
        res(stream);
      } else if (state === 'denied') { rej(new Error('أُلغيت المشاركة أو لم يُسمح بها')); }
      else if (state === 'stopped') { started = false; onEnded?.(); }
    };
    try { A.startCapture(); } catch (e) { rej(new Error('تعذّر بدء التقاط الشاشة')); }
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
  async start() {
    if (window.MadarAndroid) { this.stream = await androidStream(() => this.stop()); clearInterval(this.capT); this.capT = setInterval(() => { const k = JSON.stringify(this.caps()); if (k !== this.lastCaps) { this.lastCaps = k; this.sendCaps(); this.status(); } }, 2000); }
    else {
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('هذا المتصفح لا يدعم مشاركة الشاشة — استخدم Chrome أو Edge على الكمبيوتر');
    try { this.stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 30 }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: true }); }
    catch (e) { throw new Error(e.name === 'NotAllowedError' ? 'أُلغيت المشاركة أو لم يُسمح بها' : 'هذا الجهاز لا يسمح بمشاركة الشاشة من المتصفح'); }
    this.stream.getVideoTracks()[0].addEventListener('ended', () => this.stop());
    }
    await lib();
    for (let tries = 0; tries < 4 && !this.peer; tries++) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      try { this.peer = await this.open(code); this.code = code; } catch (e) { if (e.type !== 'unavailable-id') throw e; }
    }
    this.peer.on('connection', conn => this.accept(conn));
    if (!window.MadarAndroid) this.agent.start();
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
      conn.send({ type: 'caps', ...this.caps() });
      const call = this.peer.call(conn.peer, this.stream);
      this.tune(call);
      conn.on('close', () => { this.viewers.delete(conn); call?.close(); this.status(); });
    });
    conn.on('data', d => {
      if (!d) return;
      if (d.type === 'links') { const n = mergeLinks(d.links); if (n) this.onStatus?.({ synced: n }); }
      else if (d.type === 'input') this.input(d);
    });
  }
  // Prefer a steady picture over sharpness when the network is weak, so the screen never freezes.
  tune(call) {
    const pc = call && call.peerConnection; if (!pc) return;
    const apply = () => pc.getSenders().forEach(snd => {
      if (!snd.track || snd.track.kind !== 'video') return;
      try {
        const p = snd.getParameters(); p.encodings = p.encodings && p.encodings.length ? p.encodings : [{}];
        p.encodings[0].maxBitrate = 2500000; p.encodings[0].maxFramerate = 30;
        p.degradationPreference = 'maintain-framerate';
        snd.setParameters(p).catch(() => {});
      } catch {}
    });
    pc.addEventListener('connectionstatechange', () => { if (pc.connectionState === 'connected') apply(); });
  }
  status() { this.onStatus?.({ code: this.code, link: this.link, viewers: this.viewers.size, live: !!this.stream, caps: this.stream ? this.caps() : null }); }
  stop() {
    if (!this.stream && !this.peer) return;
    this.agent.stop(); clearInterval(this.capT);
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
    if (window.MadarAndroid) try { window.MadarAndroid.stopCapture(); } catch {}
    this.peer?.destroy(); this.peer = null; this.viewers.clear();
    this.onStatus?.({ live: false });
  }
}

// ---------- Phone side ----------
export class ScreenViewer {
  constructor() { this.peer = null; this.gen = 0; }
  // Resolves with the remote MediaStream; onEnd is called when the laptop stops sharing.
  send(m) { try { if (this.conn && this.conn.open) this.conn.send(m); } catch {} }
  async connect(code, { onEnd, onLinks, onCaps } = {}) {
    await lib();
    this.close();
    const gen = this.gen;
    let ended = false;
    // Called once per connection, and never for a connection we replaced ourselves.
    const end = why => { if (ended || gen !== this.gen) return; ended = true; onEnd?.(why); };
    const peer = this.peer = new window.peerjs.Peer(undefined, rtc);
    await new Promise((res, rej) => { peer.once('open', res); peer.once('error', rej); });
    return new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error('لم يتم العثور على اللابتوب — تأكد من الرمز وأن مدار مفتوح عليه')), 15000);
      peer.on('error', e => { clearTimeout(timer); rej(new Error(e.type === 'peer-unavailable' ? 'الرمز غير صحيح أو انتهت المشاركة' : (e.message || e.type))); });
      const conn = this.conn = peer.connect(PREFIX + code, { reliable: true });
      conn.on('open', () => conn.send({ type: 'links', links: loadLinks() }));
      conn.on('data', d => {
        if (!d || gen !== this.gen) return;
        if (d.type === 'links') onLinks?.(mergeLinks(d.links));
        else if (d.type === 'caps') { this.caps = d; onCaps?.(d); }
      });
      conn.on('close', () => end('closed'));
      peer.on('call', call => {
        call.answer();
        call.on('stream', s => { clearTimeout(timer); res(s); });
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
  close() { this.gen++; this.pc = null; this.conn = null; this.caps = null; try { this.peer?.destroy(); } catch {} this.peer = null; }
}
