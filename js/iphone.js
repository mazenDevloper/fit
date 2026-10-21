// «آيفون»: an iPhone's screen inside Madar. The iPhone broadcasts with the Madar app (Control Center → long-press
// Screen Recording → مدار → Start); its H.264 comes through the DriveCast server and is decoded here (WebCodecs).
// iPhones on the same network appear by themselves; from another network the 6-digit code from the iPhone's
// notification is asked for.
const S = 'https://studio.c-p.workers.dev';

export class IPhoneScreens {
  constructor(app) { this.app = app; this.seen = new Set(); this.open = new Map(); this.checkAt = 0; }
  // every 8 s while in the environment: a new iPhone broadcasting nearby → a notification to show it
  update(now) {
    if (!this.app.active || now - this.checkAt < 8000 || typeof VideoDecoder === 'undefined') return;
    this.checkAt = now;
    this.list().then(list => {
      for (const s of list) {
        if (this.seen.has(s.room) || this.open.has(s.room)) continue;
        this.seen.add(s.room);
        this.app.notify({ icon: '📱', title: s.name + ' يبث شاشته', body: 'اعرضه هنا داخل مدار', actions: [['اعرض', () => this.watch(s.room, s.name)]] });
      }
    }).catch(() => {});
  }
  async list() { const d = await (await fetch(S + '/screen/list', { cache: 'no-store' })).json(); return d.senders || []; }
  // the launcher's «آيفون» tile
  async pick() {
    if (typeof VideoDecoder === 'undefined') { this.app.toast('هذا المتصفح لا يدعم فك الفيديو (حدّث Safari/Chrome)', 4000); return; }
    let list = [];
    try { list = await this.list(); } catch (e) {}
    if (list.length) { const s = list[0]; this.watch(s.room, s.name); return; }
    const code = window.prompt('لا يوجد آيفون يبث من نفس الشبكة. اكتب رمز البث من إشعار الآيفون (رقم الغرفة-الرمز):');
    if (code && /^[a-z0-9]+-\d{6}$/i.test(code.trim())) { const [room, pin] = code.trim().split('-'); this.watch(room, 'آيفون', pin); }
    else this.app.toast('على الآيفون: مركز التحكم ← اضغط مطولاً على تسجيل الشاشة ← مدار ← بدء البث', 7000);
  }
  watch(room, name, pin = '') {
    if (this.open.has(room)) return;
    const canvas = document.createElement('canvas'); canvas.width = 1170; canvas.height = 2532;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(30);
    const ws = new WebSocket(S.replace('https', 'wss') + '/screen/watch?room=' + room + (pin ? '&pin=' + pin : ''));
    ws.binaryType = 'arraybuffer';
    let dec = null, ready = false, win = null, frames = 0;
    const st = { ws, close: () => { try { ws.close(); } catch (e) {} try { dec?.close(); } catch (e) {} this.open.delete(room); } };
    this.open.set(room, st);
    const make = cfg => {
      try { dec?.close(); } catch (e) {}
      const a = new Uint8Array(cfg);
      const codec = 'avc1.' + [a[1], a[2], a[3]].map(x => x.toString(16).padStart(2, '0')).join('');
      dec = new VideoDecoder({
        output: f => {
          if (canvas.width !== f.displayWidth || canvas.height !== f.displayHeight) { canvas.width = f.displayWidth; canvas.height = f.displayHeight; win?.setAspect?.(f.displayWidth / f.displayHeight); }
          ctx.drawImage(f, 0, 0); f.close();
          if (!frames++) this.app.log('آيفون: أول صورة ' + canvas.width + '×' + canvas.height);
        },
        error: e => { this.app.log('آيفون: خطأ فك ' + e.message); ready = false; try { ws.send('key'); } catch (x) {} },
      });
      dec.configure({ codec, description: a, optimizeForLatency: true, hardwareAcceleration: 'prefer-hardware' });
      ready = false;
    };
    ws.onmessage = e => {
      if (typeof e.data === 'string') { if (e.data === 'ended') { this.app.toast('📱 ' + name + ' أوقف البث', 3000); st.close(); } return; }
      const buf = e.data, kind = new Uint8Array(buf, 0, 1)[0], t = Number(new DataView(buf).getBigUint64(1)), data = new Uint8Array(buf, 9);
      if (kind === 0) { make(data.slice()); return; }
      if (!dec || dec.state !== 'configured') return;
      if (!ready && kind !== 1) return;   // wait for a key frame
      ready = true;
      try { dec.decode(new EncodedVideoChunk({ type: kind === 1 ? 'key' : 'delta', timestamp: t, data })); } catch (x) { ready = false; }
      if (dec.decodeQueueSize > 8) { ready = false; try { ws.send('key'); } catch (x) {} }   // falling behind: skip to the next key frame
    };
    ws.onopen = () => {
      win = this.app.windows.open({ kind: 'video', stream, name: '📱 ' + name });
      if (win) { win.onClosed = () => st.close(); const d = win.dispose?.bind(win); win.dispose = () => { st.close(); d?.(); }; }
      this.app.toast('📱 ' + name + ' هنا', 2000);
    };
    ws.onerror = () => this.app.toast(pin ? 'الرمز غير صحيح أو البث متوقف' : 'تعذّر الاتصال ببث الآيفون', 3500);
    ws.onclose = () => this.open.delete(room);
  }
}
