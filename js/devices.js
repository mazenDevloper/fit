// Madar devices: every Madar (iPhone, tablet app, laptop, TV browser) has a permanent 6-digit number and QR code.
//  - Nearby: devices on the same network find each other (same internet address → same "room").
//  - Paired devices are remembered; their screens open with one tap.
//  - Send things between devices: files (videos, photos, 3D models), links and text — they land in the library
//    and open as windows when the receiver is inside Madar.
import { deviceIdentity, pairedDevices, addPaired, savePaired, KIND_LABEL } from './config.js';
import { lib, rtc } from './mirror.js';

const DEV = 'madar-dev-', NET = 'madar-net-', SLOTS = 8, CHUNK = 64 * 1024;

async function netRoom() {
  // The network's public address identifies "the same Wi-Fi". Hash it so the address itself is never published.
  try {
    const r = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' });
    const ip = (await r.json()).ip;
    const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('madar:' + ip));
    return [...new Uint8Array(h)].slice(0, 6).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}

export class DeviceHub {
  constructor(app) {
    this.app = app; this.me = deviceIdentity();
    this.peer = null; this.slotPeer = null; this.nearby = new Map(); this.listeners = new Set();
    this.incoming = new Map();
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach(f => { try { f(); } catch {} }); }
  hello() { return { type: 'hello', code: this.me.code, name: this.me.name, kind: this.me.kind }; }

  async start() {
    if (this.started) return; this.started = true;
    await lib();
    this.openMain();
    this.roomP = this.joinRoom();
    // Stay reachable: rejoin after network changes or when coming back to the app.
    window.addEventListener('online', () => { this.reconnect(); this.roomP = this.joinRoom(true); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.reconnect(); });
    setInterval(() => this.reconnect(), 20000);
  }
  openMain(tries = 0) {
    const p = new window.peerjs.Peer(DEV + this.me.code, rtc);
    p.on('open', () => { this.peer = p; this.online = true; this.emit(); });
    p.on('connection', c => this.accept(c));
    p.on('disconnected', () => { this.online = false; this.emit(); setTimeout(() => { try { if (!p.destroyed) p.reconnect(); } catch {} }, 1500); });
    p.on('error', e => {
      if (e.type === 'unavailable-id' && tries < 6) { try { p.destroy(); } catch {} setTimeout(() => this.openMain(tries + 1), 4000); }
    });
    this.peer = p;
  }
  reconnect() { const p = this.peer; try { if (p && p.disconnected && !p.destroyed) p.reconnect(); } catch {} }

  // ---- Nearby (same network) ----
  async joinRoom(again) {
    if (again) { try { this.slotPeer?.destroy(); } catch {} this.slotPeer = null; }
    this.room = await netRoom();
    if (!this.room) return;
    for (let n = 0; n < SLOTS && !this.slotPeer; n++) {
      try {
        this.slotPeer = await new Promise((res, rej) => {
          const p = new window.peerjs.Peer(NET + this.room + '-' + n, rtc);
          p.once('open', () => res(p)); p.once('error', e => { try { p.destroy(); } catch {} rej(e); });
        });
        this.slot = n;
        this.slotPeer.on('connection', c => c.on('open', () => { c.send(this.hello()); setTimeout(() => c.close(), 3000); }));
      } catch {}
    }
  }
  // Ask every slot of this network's room who is there.
  async scan() {
    await this.start();
    await this.roomP?.catch(() => {});
    if (!this.room) this.room = await netRoom();
    if (!this.room || !this.peer) return [];
    this.nearby.clear(); this.emit();
    const tasks = [];
    for (let n = 0; n < SLOTS; n++) {
      if (n === this.slot) continue;
      tasks.push(new Promise(res => {
        let done = false; const fin = () => { if (!done) { done = true; try { c.close(); } catch {} res(); } };
        const c = this.peer.connect(NET + this.room + '-' + n, { reliable: true });
        c.on('data', d => { if (d && d.type === 'hello' && d.code !== this.me.code) { this.nearby.set(d.code, { code: d.code, name: d.name, kind: d.kind, seen: Date.now() }); this.emit(); } fin(); });
        c.on('error', fin); setTimeout(fin, 4000);
      }));
    }
    await Promise.all(tasks);
    return [...this.nearby.values()];
  }

  // ---- Connections from other devices ----
  accept(c) {
    c.on('open', () => c.send(this.hello()));
    c.on('data', d => this.onData(c, d));
  }
  known(code) { return pairedDevices().some(x => x.code === code); }
  onData(c, d) {
    if (!d || typeof d !== 'object') return;
    if (d.type === 'hello') { c.who = d; if (this.known(d.code)) addPaired(d); return; }
    if (d.type === 'pair') {
      // Someone added this device: remember them (the user sees it in the list and can remove it).
      addPaired(d.from); this.emit();
      this.app.toast?.('أُضيف جهاز: ' + (d.from?.name || d.from?.code), 3500);
      return;
    }
    const from = c.who || {};
    if (!this.known(from.code)) { c.send({ type: 'refused' }); return; }   // only paired devices may send things
    if (d.type === 'link') this.app.receiveLink?.(d, from);
    else if (d.type === 'text') this.app.receiveText?.(d, from);
    else if (d.type === 'file-start') this.incoming.set(d.id, { meta: d, parts: [], got: 0, from });
    else if (d.type === 'file-chunk') { const f = this.incoming.get(d.id); if (f) { f.parts.push(d.data); f.got += d.data.byteLength || d.data.size || 0; this.app.receiveProgress?.(f); } }
    else if (d.type === 'file-end') {
      const f = this.incoming.get(d.id); if (!f) return; this.incoming.delete(d.id);
      const file = new File(f.parts, f.meta.name, { type: f.meta.mime || '' });
      this.app.receiveFile?.(file, f.from);
      c.send({ type: 'file-ok', id: d.id });
    }
  }

  // ---- Talking to one device ----
  async open(code) {
    await this.start();
    for (let i = 0; i < 40 && !this.peer?.open; i++) await new Promise(r => setTimeout(r, 150));
    return new Promise((res, rej) => {
      const c = this.peer.connect(DEV + code, { reliable: true, serialization: 'binary' });
      const t = setTimeout(() => rej(new Error('الجهاز غير متصل الآن — افتح مدار عليه')), 9000);
      c.on('open', () => { c.send(this.hello()); });
      c.on('data', d => { if (d && d.type === 'hello') { clearTimeout(t); c.who = d; addPaired(d); this.emit(); res(c); } else this.onData(c, d); });
      c.on('error', e => { clearTimeout(t); rej(e); });
    });
  }
  // Add a device by its number (also tells it about us, so both sides know each other).
  async pair(code) {
    const c = await this.open(code);
    c.send({ type: 'pair', from: { code: this.me.code, name: this.me.name, kind: this.me.kind } });
    return c.who;
  }
  remove(code) { savePaired(pairedDevices().filter(x => x.code !== code)); this.emit(); }
  async sendLink(code, url, title) { const c = await this.open(code); c.send({ type: 'link', url, title }); setTimeout(() => c.close(), 1500); }
  async sendText(code, text) { const c = await this.open(code); c.send({ type: 'text', text }); setTimeout(() => c.close(), 1500); }
  async sendFile(code, file, onProgress) {
    const c = await this.open(code);
    const id = Math.random().toString(36).slice(2);
    c.send({ type: 'file-start', id, name: file.name, size: file.size, mime: file.type });
    let off = 0;
    while (off < file.size) {
      const part = await file.slice(off, off + CHUNK).arrayBuffer();
      // Let the channel drain so big videos don't overflow it.
      while (c.dataChannel && c.dataChannel.bufferedAmount > 4 * 1024 * 1024) await new Promise(r => setTimeout(r, 30));
      c.send({ type: 'file-chunk', id, data: part });
      off += part.byteLength; onProgress?.(off / file.size);
    }
    c.send({ type: 'file-end', id });
    await new Promise(res => { const t = setTimeout(res, 20000); c.on('data', d => { if (d && d.type === 'file-ok' && d.id === id) { clearTimeout(t); res(); } }); });
    setTimeout(() => c.close(), 500);
  }
  rename(name) { this.me = Object.assign(this.me, { name }); }
}
export { KIND_LABEL };
