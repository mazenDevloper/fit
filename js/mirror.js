// Screen mirroring between Madar on a laptop and Madar on the phone (WebRTC via PeerJS).
// Laptop: shares its screen and shows a 6-digit code / QR / link.
// Phone: joins with the code (or opens the link) and gets the screen as a window.
// The same connection also syncs saved links both ways.
import { loadLinks, saveLinks } from './config.js';

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
const rtc = { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] } };

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

// ---------- Laptop side ----------
export class ScreenHost {
  constructor(onStatus) { this.onStatus = onStatus; this.code = ''; this.stream = null; this.peer = null; this.viewers = new Set(); }
  get link() { return location.origin + location.pathname + '#m' + this.code; }
  async start() {
    if (window.MadarAndroid) { this.stream = await androidStream(() => this.stop()); }
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
      const call = this.peer.call(conn.peer, this.stream);
      conn.on('close', () => { this.viewers.delete(conn); call?.close(); this.status(); });
    });
    conn.on('data', d => { if (d && d.type === 'links') { const n = mergeLinks(d.links); if (n) this.onStatus?.({ synced: n }); } });
  }
  status() { this.onStatus?.({ code: this.code, link: this.link, viewers: this.viewers.size, live: !!this.stream }); }
  stop() {
    if (!this.stream && !this.peer) return;
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
    if (window.MadarAndroid) try { window.MadarAndroid.stopCapture(); } catch {}
    this.peer?.destroy(); this.peer = null; this.viewers.clear();
    this.onStatus?.({ live: false });
  }
}

// ---------- Phone side ----------
export class ScreenViewer {
  constructor() { this.peer = null; }
  // Resolves with the remote MediaStream; onEnd is called when the laptop stops sharing.
  async connect(code, { onEnd, onLinks } = {}) {
    await lib();
    this.close();
    const peer = this.peer = new window.peerjs.Peer(undefined, rtc);
    await new Promise((res, rej) => { peer.once('open', res); peer.once('error', rej); });
    return new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error('لم يتم العثور على اللابتوب — تأكد من الرمز وأن مدار مفتوح عليه')), 15000);
      peer.on('error', e => { clearTimeout(timer); rej(new Error(e.type === 'peer-unavailable' ? 'الرمز غير صحيح أو انتهت المشاركة' : (e.message || e.type))); });
      const conn = peer.connect(PREFIX + code, { reliable: true });
      conn.on('open', () => conn.send({ type: 'links', links: loadLinks() }));
      conn.on('data', d => { if (d && d.type === 'links') onLinks?.(mergeLinks(d.links)); });
      conn.on('close', () => onEnd?.());
      peer.on('call', call => {
        call.answer();
        call.on('stream', s => { clearTimeout(timer); res(s); });
        call.on('close', () => onEnd?.());
      });
    });
  }
  close() { try { this.peer?.destroy(); } catch {} this.peer = null; }
}
