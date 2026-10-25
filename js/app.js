// Madar — mixed reality environment for iPhone + SBS headset. Entry point: home screen + MR session.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { deviceIdentity, saveDeviceIdentity, pairedDevices, KIND_LABEL } from './config.js';
import { settings, saveSettings, applyPreset, resetSettings, VIEWER_PRESETS, loadLayout, saveLayout, loadLinks, saveLinks, onSettings } from './config.js';
import { StageOrientation, HeadTracker } from './orient.js';
import { StereoRenderer } from './render.js';
import { HandTracker } from './hands.js';
import { Interaction } from './interaction.js';
import { WindowManager, registerKind, setElementVolume } from './windows.js';
import { Launcher, Calibration, Toast } from './panels.js';
import { ControlCenter, LookUp, Notifier } from './control.js';
import { Gallery } from './gallery.js';
import { IPhoneScreens } from './iphone.js';
import { ReaderWindow } from './reader.js';
import { ShelfWindow } from './shelf.js';
import { ManuscriptWindow } from './manuscript.js';
import { FurnitureWindow } from './furniture.js';
import { CoachWindow } from './coach.js';
import { saveWebArticle } from './books.js';
import { Extras } from './extras.js';
import { HubClient } from './hub.js';
import { Ambient } from './ambient.js';
import { SURAHS } from './quran.js';
import { Slam } from './slam.js';
import { Controls } from './controls.js';
import { GazeTracker } from './gaze.js';
import { LensAdjust } from './lens.js';
import { DeviceHub } from './devices.js';
import { Sports } from './sports.js';
import { ScreenHost, ScreenViewer, WebHost, qrSvg, AGENT_DOWNLOAD, lib } from './mirror.js';
import { Room } from './room.js';
import { IOS, NativeHead, NativeSlam, setupNative, toggleDeskHole } from './native.js';
import { ENVS, ENV_ORDER, envKey, isImmersive, makeEnvironments } from './envs.js';
import { listItems, importFiles, deleteItem, formatSize, importPhotoBook, importEnvironment, getItem } from './db.js';
import { depthMap, cachedDepth, saveDepth, forgetDepth } from './depth.js';
import { audioContext, blip, setMaxAniso } from './ui.js';

const $ = s => document.querySelector(s);
const FIRST_RUN = 'madar.firstRun.v1';
export const APP_VERSION = '101';
const ANDROID_APK = 'https://github.com/mazenDevloper/fit/releases/download/android-latest/Madar.apk';

// a tenth of a second of silence (a valid WAV), to unlock the audio element during a real tap
function silentWav() {
  const n = 800, b = new Uint8Array(44 + n * 2), v = new DataView(b.buffer), w = (o, s) => [...s].forEach((c, i) => { b[o + i] = c.charCodeAt(0); });
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  let s = ''; for (const x of b) s += String.fromCharCode(x);
  return 'data:audio/wav;base64,' + btoa(s);
}
// Video elements are unlocked for sound during the Enter tap, then reused by video windows.
class MediaPool {
  constructor(n = 4) {
    this.host = $('#mediaPool');
    this.free = [];
    for (let i = 0; i < n; i++) this.free.push(this.make());
  }
  make() {
    const v = document.createElement('video');
    v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
    v.crossOrigin = 'anonymous'; v.preload = 'auto';
    this.host.appendChild(v);
    return v;
  }
  unlock() {
    for (const v of this.free) {
      try {
        v.src = 'assets/sample.mp4'; v.muted = true;
        const pr = v.play();
        if (pr) pr.then(() => { v.pause(); v.currentTime = 0; }).catch(() => {});
      } catch {}
    }
  }
  acquire() { return this.free.pop() || this.make(); }
  release(v) { if (v.parentNode !== this.host) this.host.appendChild(v); this.free.push(v); }
  // the reciter's / read-aloud audio: one element, unlocked by the Enter tap so it can start from a pinch later
  audioEl() {
    if (!this.audio) { this.audio = document.createElement('audio'); this.audio.preload = 'auto'; this.audio.setAttribute('playsinline', ''); this.host.appendChild(this.audio); }
    return this.audio;
  }
  unlockAudio() {
    const a = this.audioEl();
    try { a.src = silentWav(); a.muted = true; const p = a.play(); if (p) p.then(() => { a.pause(); a.muted = false; }).catch(() => { a.muted = false; }); } catch {}
    // speech too (iOS speaks only after a tap)
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch {}
  }
}

class App {
  constructor() {
    this.stage = $('#stage');
    this.camVideo = $('#cam');
    this.active = false;
    this.renderQ = new THREE.Quaternion();
    this.headForward = new THREE.Vector3(0, 0, -1);
    this.media = new MediaPool(4);
    this.hands = new HandTracker();
    this.orientation = new StageOrientation(this.stage);
    this.head = IOS ? new NativeHead() : new HeadTracker(this.orientation);
    this.renderer = new StereoRenderer(this.stage, $('#gl'), this.orientation);
    setMaxAniso(Math.min(8, this.renderer.maxAniso));
    this.setupScene();
    this.windows = new WindowManager(this);
    registerKind('reader', (m, sp) => new ReaderWindow(m, sp), { dist: 1.3, y: -0.05, scale: 1, single: true });
    registerKind('shelf', m => new ShelfWindow(m), { dist: 1.7, y: -0.62, scale: 1, single: true });
    registerKind('manuscript', (m, sp) => new ManuscriptWindow(m, sp), { dist: 2.0, y: 0.1, scale: 1 });
    registerKind('coach', (m, sp) => new CoachWindow(m, sp), { dist: 2.3, y: 0, scale: 1, single: true });
    registerKind('furniture', (m, sp) => new FurnitureWindow(m, sp), { dist: 1.8, y: -1.55, scale: 1 });
    this.ambient = new Ambient();
    this.launcher = new Launcher(this);
    this.calibration = new Calibration(this);
    this.lensAdjust = new LensAdjust(this);
    this.sports = new Sports(this);
    this.room = new Room(this);
    this.webHost = window.MadarAndroid?.hasBrowser ? new WebHost(this) : null;   // this device can serve the built-in browser
    this.toastUI = new Toast();
    this.control = new ControlCenter(this); this.lookUp = new LookUp(this); this.notifier = new Notifier(this); this.gallery = new Gallery(this); this.iphone = new IPhoneScreens(this);
    this.renderer.scene.add(this.launcher.group, this.calibration.group, this.control.group, this.lookUp.mesh, this.notifier.mesh);
    this.renderer.overlay.add(this.toastUI.mesh);
    this.interaction = new Interaction(this);
    this.slam = IOS ? new NativeSlam(this) : new Slam(this);
    this.controls = new Controls(this);
    this.gaze = new GazeTracker(this);
    this.gaze.onBlinkClick = () => { if (this.interaction.realTap()) this.toast('نقر بالعين', 800); };
    this.extras = new Extras(this);
    this.hub = new HubClient(this);   // «المركز»: Madar ⇄ DriveCast
    this.renderer.afterRender = () => { for (const w of this.windows.windows) w.placeCss?.(); };
    if (IOS) setupNative(this);
    this.interaction.setTargets();
    this.debugYaw = 0; this.debugPitch = 0;
    this.bindHome();
    this.bindStageInput();
    this.checkCrash();
    this.renderLog();
    window.addEventListener('error', e => { this.log('خطأ: ' + (e.message || e.error)); if (this.active) this.toast('حدث خطأ: ' + String(e.message || '').slice(0, 60)); });
    window.addEventListener('unhandledrejection', e => { this.log('خطأ: ' + String(e.reason && e.reason.message || e.reason).slice(0, 120)); });
    this.hands.onChange(() => this.renderStatus());
    if (IOS) this.hands.useNative(); else this.hands.load();
    this.renderStatus();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.persistLayout(); }
      else if (this.active) { this.requestWakeLock(); if (this.camVideo.paused) this.camVideo.play().catch(() => {}); }
    });
    window.addEventListener('pagehide', () => this.persistLayout());
  }

  setupScene() {
    const scene = this.renderer.scene;
    const pm = new THREE.PMREMGenerator(this.renderer.renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    const hl = new THREE.HemisphereLight(0xffffff, 0x3a3a4a, 1.1); scene.add(hl);
    const d = new THREE.DirectionalLight(0xffffff, 1.6); d.position.set(1, 2, 1.5); scene.add(d);
    this.globalLights = [[hl, 1.1], [d, 1.6]];
    this.envs = makeEnvironments();
    Object.values(this.envs).forEach(g => scene.add(g));
  }

  // Small diagnostic log kept on the device so problems can be reported.
  log(msg) {
    const line = new Date().toLocaleTimeString('en-GB') + '  ' + msg;
    try {
      const a = JSON.parse(localStorage.getItem('madar.log') || '[]');
      a.push(line); while (a.length > 60) a.shift();
      localStorage.setItem('madar.log', JSON.stringify(a));
      if (this.active) sessionStorage.setItem('madar.last', msg);
    } catch {}
  }
  renderLog() {
    try { $('#logView').textContent = JSON.parse(localStorage.getItem('madar.log') || '[]').slice().reverse().join('\n') || 'لا شيء بعد'; } catch {}
  }
  // If the page reloads while a session was open, iOS ended it (usually memory). Tell the user what was happening.
  checkCrash() {
    let was = null, last = '';
    try { was = sessionStorage.getItem('madar.inMR'); last = sessionStorage.getItem('madar.last') || ''; sessionStorage.removeItem('madar.inMR'); } catch {}
    if (!was) return;
    this.crashed = true;
    this.log('انتهت الجلسة فجأة' + (last ? ' بعد: ' + last : ''));
    const n = $('#crashNote');
    n.textContent = 'أغلق iOS الجلسة السابقة فجأة' + (last ? ' أثناء «' + last + '»' : '') + '. غالباً بسبب امتلاء الذاكرة: أغلق التطبيقات الأخرى ثم ادخل مجدداً.';
    n.hidden = false;
  }

  systemTargets() { return [...(this.launcher?.targets || []), ...(this.calibration?.targets || []), ...(this.control?.targets || []), ...(this.lookUp?.targets || []), ...(this.notifier?.targets || []), ...(this.gallery?.targets || []), ...(this.extras?.targets || [])]; }
  notify(n) { if (this.active && this.notifier) this.notifier.push(n); else this.toast(n.title, 3000); }
  links() { return loadLinks(); }
  toast(msg, ms) { this.toastUI.show(msg, ms); }
  toggleLauncher() { this.launcher.toggle(); }
  toggleWalk() {
    saveSettings({ walk: !settings.walk });
    if (settings.walk) this.slam.start(); else { this.slam.stop(); this.toast('المشي متوقف'); }
  }
  toggleFullscreen() {
    const el = document.documentElement;
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)?.catch?.(() => {});
    } catch {}
  }
  setViewMode(m) {
    const camChange = (m === 'desktop') !== (settings.viewMode === 'desktop');
    saveSettings({ viewMode: m });
    if (camChange && this.active) this.recoverCamera('mode');
    this.controls.sync();
    this.renderer.resize();
    this.toast({ mono: 'وضع الهاتف: عصا للتحرك وعصا للنظر، والمس النوافذ مباشرة', desktop: 'وضع اللابتوب: WASD للتحرك، الأسهم أو السحب للنظر، M للقائمة', sbs: 'وضع النظارة' }[m], 3500);
    this.log('وضع العرض: ' + m);
  }
  toggleEyeTrack() {
    saveSettings({ eyeTrack: !settings.eyeTrack });
    if (!settings.eyeTrack) { this.gaze.stop(); this.toast('تتبع العين متوقف'); return; }
    if (settings.viewMode !== 'desktop') { this.toast('تتبع العين يعمل في وضع اللابتوب'); return; }
    this.gaze.start();
  }
  // ---------- Laptop screen in the environment ----------
  // On a computer: show this computer's screen or any window (e.g. an iPhone mirrored with AirPlay/QuickTime) as a window.
  async showLocalScreen() {
    try {
      let stream = this.host?.stream;
      if (!stream) {
        if (window.MadarAndroid) { await this.host.start(); stream = this.host.stream; }
        else {
        if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('هذا الجهاز لا يسمح بالتقاط الشاشة');
        stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30 } }, audio: false });
        }
      }
      const w = this.windows.open({ kind: 'video', stream, name: 'شاشة' });
      w.video.muted = true;
      stream.getVideoTracks()[0].addEventListener('ended', () => this.windows.close(w));
      this.log('عرض شاشة/نافذة محلية');
    } catch (e) { this.toast(e.message || 'لم يتم اختيار شاشة', 3500); }
  }
  // Friendly name of a device by its number (paired list), e.g. "تابلت مدار" or "جهاز 425950".
  devName(code) { const d = pairedDevices().find(x => x.code === code); return d ? d.name : 'الجهاز ' + code; }
  async connectMirror(code, attempt = 0) {
    saveSettings({ mirrorCode: code });
    if (!this.active) return;
    // Your own code on this computer = show this computer's screen; any other code = that device's screen.
    if (this.host?.stream && this.host.code === code) { this.showLocalScreen(); return; }
    const again = !!this.mirrorWin;          // reconnecting: keep the window and its last picture
    if (!again) this.toast('جاري الاتصال بـ ' + this.devName(code) + '…', 4000);
    this.log('الشاشة: اتصال ' + code + (again ? ' (إعادة)' : ''));
    this.viewer = this.viewer || new ScreenViewer();
    try {
      const stream = await this.viewer.connect(code, {
        onEnd: why => this.mirrorLost(code, why),
        onLinks: n => { if (n) { this.toast('أُضيفت ' + n + ' روابط من ' + this.devName(code)); this.renderLinks(); } },
        onCaps: c => {
          const was = this.mirrorWin?.control;
          this.mirrorWin?.setControl(c);
          if (c.control && !was) this.toast('يمكنك التحكم بالجهاز: انقر واسحب للتمرير · ○ رجوع', 3500);
          else if (!c.control && c.why) this.log('التحكم: ' + c.why);
        },
      });
      if (!this.active) { this.viewer.close(); return; }
      if (this.mirrorWin && this.windows.windows.includes(this.mirrorWin)) {
        this.mirrorWin.setStream(stream);
        this.toast('عادت الشاشة', 1800);
      } else {
        this.mirrorWin = this.windows.open({ kind: 'video', stream, name: this.devName(code), remote: this.viewer });
        this.toast('ظهرت شاشة ' + this.devName(code) + ' أمامك', 2500);
      }
      if (this.viewer.caps) this.mirrorWin.setControl(this.viewer.caps);
      // A picture that stops arriving (frozen) reconnects by itself.
      // (A still screen also sends no new frames, so only reconnect when the link itself is unhealthy.)
      this.mirrorWin.onStall = () => { if (!this.viewer.healthy()) { this.log('الشاشة: الصورة متوقفة'); this.mirrorLost(code, 'stall'); } };
      this.log('الشاشة: متصلة ' + code);
    } catch (e) {
      this.log('الشاشة: ' + (e.message || e));
      // First failure: ask the device itself what it can do, instead of retrying blindly.
      if (attempt === 0 && !again && this.devices) {
        const who = await this.devices.probe(code).catch(() => null);
        if (who && who.sharing === false) {
          if (!who.canShare) {
            this.toast((who.name || code) + ' لا يستطيع مشاركة شاشته (' + (KIND_LABEL[who.kind] || 'جهاز') + ') — أرسل إليه ملفات، أو اعرض عليه شاشة جهاز آخر من «الأجهزة»', 7000);
            this.log('الجهاز ' + code + ' يستقبل فقط');
            return;
          }
          await this.devices.requestShare(code).catch(() => {});
          this.toast('طُلبت المشاركة من ' + (who.name || code) + ' — وافق على الطلب في ذلك الجهاز', 6000);
        } else if (!who) this.toast('الجهاز ' + code + ' غير متصل — افتح مدار عليه', 4500);
      }
      // The device may not be sharing yet (or the network is back soon): keep trying for about a minute.
      if (attempt < 7 && this.active) {
        if (!again) this.toast('بانتظار مشاركة ' + this.devName(code) + '… (' + (attempt + 1) + '/8)', 3000);
        clearTimeout(this.mirrorTimer);
        this.mirrorTimer = setTimeout(() => this.connectMirror(code, attempt + 1), again ? 4000 : 8000);
      } else {
        this.toast(again ? 'توقفت مشاركة ' + this.devName(code) : (e.message || 'تعذّر الاتصال'), 5000);
        if (this.mirrorWin) this.windows.close(this.mirrorWin);
        this.mirrorWin = null;
      }
    }
  }
  // The live screen dropped (laptop stopped, network blip or frozen picture): reconnect quietly with the same code.
  mirrorLost(code, why) {
    if (!this.active || !this.mirrorWin) return;
    if (this.mirrorWin && !this.windows.windows.includes(this.mirrorWin)) { this.mirrorWin = null; return; }   // window was closed by the user
    this.log('الشاشة: انقطاع (' + why + ') — إعادة اتصال');
    this.toast('انقطع البث — جاري إعادة الاتصال…', 2500);
    clearTimeout(this.mirrorTimer);
    this.mirrorTimer = setTimeout(() => this.connectMirror(code, 0), 800);
  }
  // ---------- Devices: permanent number + QR, nearby search, pairing, sending things ----------
  bindDevices() {
    // TVs (Hisense VIDAA, Samsung, LG) get the light receiver screen.
    if (deviceIdentity().kind === 'tv' && !/notv/.test(location.search)) { location.replace('tv.html' + location.hash); return; }
    const hub = this.devices = new DeviceHub(this);
    const me = hub.me, link = location.origin + location.pathname + '#d' + me.code;
    if ($('#devCode')) {
      $('#devCode').textContent = me.code.replace(/(\d{3})(\d{3})/, '$1 $2');
      $('#devName').value = me.name;
      $('#devName').addEventListener('change', () => { const n = $('#devName').value.trim() || me.name; saveDeviceIdentity({ name: n }); hub.rename(n); });
      $('#devCopy').addEventListener('click', () => navigator.clipboard?.writeText(link).then(() => { $('#devCopy').textContent = 'تم النسخ'; }).catch(() => {}));
      $('#devScan').addEventListener('click', async () => {
        $('#devMsg').textContent = 'جاري البحث في شبكتك…';
        const found = await hub.scan().catch(() => []);
        $('#devMsg').textContent = found.length ? 'وُجد ' + found.length + ' جهاز في شبكتك' : 'لم يُعثر على أجهزة — تأكد أن مدار مفتوح عليها وأنها على نفس الواي فاي';
      });
      $('#devAdd').addEventListener('submit', async e => {
        e.preventDefault();
        const c = $('#devAddCode').value.replace(/\D/g, '');
        if (c.length !== 6) { $('#devMsg').textContent = 'الرقم 6 أرقام'; return; }
        $('#devMsg').textContent = 'جاري الاتصال بالجهاز ' + c + '…';
        try { const d = await hub.pair(c); $('#devMsg').textContent = 'أُضيف: ' + (d?.name || c); $('#devAddCode').value = ''; }
        catch (err) { $('#devMsg').textContent = err.message || 'تعذّر الاتصال'; }
      });
      lib().then(() => { try { $('#devQr').innerHTML = qrSvg(link, 160); } catch {} });
    }
    const render = () => {
      if ($('#devOnline')) $('#devOnline').textContent = hub.online ? 'متصل ✓' : 'غير متصل';
      this.launcher?.group.visible && this.launcher.tab === 'devices' && this.launcher.panel.redraw();
      const ul = $('#devList'); if (!ul) return;
      const paired = pairedDevices(), near = [...hub.nearby.values()];
      const all = [...paired.map(d => ({ ...d, paired: true })), ...near.filter(n => !paired.some(p => p.code === n.code))];
      ul.innerHTML = '';
      all.forEach(d => {
        const li = document.createElement('li');
        const isNear = near.some(n => n.code === d.code);
        li.innerHTML = `<b></b>${d.kind === 'tv' ? '<button data-a="watch">اعرض عليه شاشة</button>' : '<button data-a="screen">شاشته</button>'}<button data-a="file">إرسال ملف</button><button data-a="link">إرسال رابط</button>${d.paired ? '<button data-a="del">حذف</button>' : '<button data-a="pair">إضافة</button>'}`;
        li.querySelector('b').innerHTML = '';
        li.querySelector('b').append(d.name || d.code);
        const sm = document.createElement('small'); sm.textContent = (KIND_LABEL[d.kind] || '') + ' · ' + d.code + (isNear ? ' · في شبكتك' : ''); if (isNear) sm.className = 'on';
        li.querySelector('b').append(sm);
        li.addEventListener('click', async e => {
          const act = e.target.dataset?.a; if (!act) return;
          try {
            if (act === 'screen') { saveSettings({ mirrorCode: d.code }); $('#mirInput') && ($('#mirInput').value = d.code); $('#devMsg').textContent = 'ستظهر شاشة ' + (d.name || d.code) + ' عند الدخول'; }
            else if (act === 'pair') { await hub.pair(d.code); }
            else if (act === 'watch') {
              const src = prompt('رقم الجهاز الذي تريد عرض شاشته على ' + (d.name || 'التلفاز'), settings.mirrorCode || '');
              if (src && /^\d{6}$/.test(src.trim())) { await hub.sendWatch(d.code, src.trim()); $('#devMsg').textContent = 'يعرض ' + (d.name || d.code) + ' الآن شاشة ' + src.trim(); }
            }
            else if (act === 'del') { hub.remove(d.code); }
            else if (act === 'link') { const u = prompt('الرابط الذي تريد إرساله'); if (u) { await hub.sendLink(d.code, u, u); $('#devMsg').textContent = 'أُرسل الرابط'; } }
            else if (act === 'file') {
              const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true;
              inp.onchange = async () => {
                for (const f of inp.files) {
                  await hub.sendFile(d.code, f, p => { $('#devMsg').textContent = 'إرسال ' + f.name + ' ' + Math.round(p * 100) + '%'; });
                }
                $('#devMsg').textContent = 'وصلت الملفات إلى ' + (d.name || d.code) + ' ✓';
              };
              inp.click();
            }
          } catch (err) { $('#devMsg').textContent = err.message || 'تعذّر الاتصال بالجهاز'; }
        });
        ul.appendChild(li);
      });
    };
    hub.on(render); render();
    hub.start().catch(() => {});
    // A device link (#d123456) opened here: add that device and show its screen when entering.
    const fromHash = (location.hash.match(/^#d(\d{6})$/) || [])[1];
    if (fromHash && fromHash !== me.code) {
      history.replaceState(null, '', location.pathname);
      saveSettings({ mirrorCode: fromHash });
      hub.pair(fromHash).then(d => { $('#devMsg') && ($('#devMsg').textContent = 'أُضيف: ' + (d?.name || fromHash)); }).catch(() => {});
    }
  }
  openLocalFiles(files) {
    const models = files.filter(f => /\.(glb|gltf|obj|stl|fbx|usdz|bin|mtl|png|jpe?g)$/i.test(f.name) && files.some(m => /\.(glb|gltf|obj|stl|fbx|usdz)$/i.test(m.name)));
    let opened = 0;
    if (models.length) { this.windows.open({ kind: 'model', files: models, name: models[0].name }); opened++; }
    for (const f of files) {
      if (models.includes(f)) continue;
      if (/^video\//.test(f.type) || /\.(mp4|m4v|mov|webm|mkv)$/i.test(f.name)) { this.windows.open({ kind: 'video', url: URL.createObjectURL(f), name: f.name }); opened++; }
      else if (/^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|heic|avif)$/i.test(f.name)) { this.windows.open({ kind: 'image', file: f }); opened++; }
    }
    this.toast(opened ? 'فُتح ' + opened + ' ملف' : 'نوع الملف غير مدعوم', 2500);
    this.log('فتح ملفات مباشرة: ' + files.map(f => f.name).join(', ').slice(0, 120));
  }
  async pairDevice(code) {
    try { const d = await this.devices.pair(code); this.toast('أُضيف ' + (d?.name || code), 2500); } catch (e) { this.toast(e.message || 'تعذّر الاتصال', 3500); }
  }
  async showOnDevice(code, screenCode) {
    if (!screenCode || screenCode === code) { this.toast('اعرض شاشة جهاز أولاً (مثل التابلت) ثم أرسلها للتلفاز', 4000); return; }
    try { await this.devices.sendWatch(code, screenCode); this.toast('أُرسلت الشاشة ' + screenCode + ' إلى الجهاز ✓', 3000); } catch (e) { this.toast(e.message || 'تعذّر الإرسال', 3500); }
  }
  async sendToDevice(code, { url, title }) {
    try { await this.devices.sendLink(code, url, title); this.toast('أُرسل الموقع إلى الجهاز ✓', 2500); } catch (e) { this.toast(e.message || 'تعذّر الإرسال', 3500); }
  }
  // ---- Things arriving from other devices ----
  async receiveFile(file, from) {
    try {
      const made = await importFiles([file]);
      this.renderLibrary();
      const who = from?.name || from?.code || 'جهاز';
      if (!made.length) { this.toast('وصل ملف من ' + who + ' لكن نوعه غير مدعوم', 3500); return; }
      this.toast('وصل من ' + who + ': ' + file.name, 3500);
      this.log('استلام ملف: ' + file.name + ' من ' + who);
      if (this.active) made.forEach(it => this.windows.open({ kind: it.type, itemId: it.id, name: it.name }));
    } catch (e) { this.toast('تعذّر حفظ الملف المستلم', 3500); }
  }
  receiveLink(d, from) {
    const l = loadLinks(); if (!l.some(x => x.url === d.url)) { l.unshift({ id: 'l' + Date.now(), title: d.title || d.url, url: d.url }); saveLinks(l); this.renderLinks(); }
    this.toast('رابط من ' + (from?.name || from?.code || 'جهاز') + ': ' + (d.title || d.url).slice(0, 40), 3500);
    if (this.active) this.windows.open({ kind: 'web', url: d.url, title: d.title || '' });
  }
  shareState() {
    const app = !!window.MadarAndroid, browser = typeof navigator.mediaDevices?.getDisplayMedia === 'function';
    return { sharing: !!this.host?.stream, canShare: app || browser };
  }
  // A paired device asks to see this screen.
  receiveShareRequest(from) {
    if (this.host?.stream) return;
    const who = from?.name || from?.code || 'جهاز';
    this.log('طلب مشاركة من ' + who);
    if (window.MadarAndroid) { this.toast(who + ' يطلب شاشتك', 3000); this.host?.start().catch(() => {}); return; }   // Android shows its own consent dialog
    // Browsers need a click before sharing: show a big button.
    let b = document.getElementById('shareAsk');
    if (!b) { b = document.createElement('button'); b.id = 'shareAsk'; document.body.appendChild(b); }
    Object.assign(b.style, { position: 'fixed', zIndex: 99999, left: '50%', top: '20px', transform: 'translateX(-50%)', padding: '16px 26px', borderRadius: '18px', border: '0', background: '#7cc4ff', color: '#0b1020', font: '800 18px system-ui', boxShadow: '0 10px 40px rgba(0,0,0,.5)' });
    b.textContent = who + ' يطلب شاشتك — اضغط للمشاركة';
    b.onclick = () => { b.remove(); this.host?.start().catch(e => this.showError(e.message || 'لم تبدأ المشاركة')); };
    setTimeout(() => b.remove(), 60000);
  }
  // A paired device asks this one to show a screen (e.g. phone tells the TV to show the tablet).
  receiveWatch(code, from) {
    this.toast((from?.name || 'جهاز') + ' يعرض هنا شاشة ' + code, 3000);
    saveSettings({ mirrorCode: code });
    if (this.active) this.connectMirror(code);
  }
  // «مساعد مدار» (Workers AI on the DriveCast server): answers aloud and in a notification, and may act.
  async askAssistant(q) {
    this.notify({ icon: '✨', title: 'مساعد مدار', body: '«' + q + '» …' });
    let r;
    try {
      const res = await fetch('https://studio.c-p.workers.dev/ask', { method: 'POST', body: JSON.stringify({ q, history: this.aiHist || [], app: 'madar', context: this.hub?.context() || '' }) });
      r = await res.json();
    } catch (e) { this.toast('المساعد غير متاح الآن', 2500); return; }
    if (!r || !r.say) { this.toast('لم أفهم: «' + q + '»', 2500); return; }
    this.aiHist = [...(this.aiHist || []), { role: 'user', content: q }, { role: 'assistant', content: r.say }].slice(-8);
    this.extras?.logAnswer(q, r.say);
    this.notifier.cur = null; this.notifier.queue = [];
    const a = r.action || {};
    const run = () => {
      const v = String(a.value || '');
      if (a.type === 'open_matches') this.openMatches();
      else if (a.type === 'open_url' && /^https?:\/\//.test(v)) this.windows.open({ kind: 'web', url: v, title: v });
      else if (a.type === 'environment' && v) { saveSettings({ environment: v }); this.renderEnvChoices?.(); }
      else if (a.type === 'open_app') ({ youtube: () => this.windows.open({ kind: 'web', url: 'https://m.youtube.com', title: 'YouTube' }), shahid: () => this.windows.open({ kind: 'web', url: 'https://shahid.mbc.net', title: 'شاهد' }),
        netflix: () => this.windows.open({ kind: 'web', url: 'https://www.netflix.com', title: 'Netflix' }), makkah: () => this.openMakkah?.(), games: () => this.openGames(), keyboard: () => this.windows.open({ kind: 'keyboard' }) })[v]?.();
    };
    if (a.type && a.type !== 'none') run();
    this.notify({ icon: '✨', title: 'مساعد مدار', body: r.say, actions: a.type === 'open_matches' ? [] : [['المباريات', () => this.openMatches()]] });
    try { const u = new SpeechSynthesisUtterance(r.say); u.lang = 'ar-SA'; u.rate = 1.05; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) {}
    this.log('المساعد: ' + q + ' → ' + r.say);
  }
  receiveScene(d, from) { this.extras?.receiveScene(d, from); }
  receiveText(d, from) {
    const t = String(d.text || '');
    this.notify({ icon: '💬', title: from?.name || 'جهاز', body: t.slice(0, 120), actions: /^https?:\/\//.test(t) ? [['افتح', () => this.windows.open({ kind: 'web', url: t.trim() })]] : [] });
  }
  receiveProgress(f) {
    const now = performance.now(); if (now - (this.lastRecvToast || 0) < 1200) return; this.lastRecvToast = now;
    if (this.active) this.toast('استلام ' + f.meta.name + ' ' + Math.round(f.got / Math.max(1, f.meta.size) * 100) + '%', 1300);
  }

  bindMirror() {
    // Coming back to Madar (or the screen waking): start paused videos again.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(() => this.windows?.resumeMedia(), 300); });
    const fromHash = (location.hash.match(/^#m(\d{6})$/) || [])[1];
    if (fromHash) { saveSettings({ mirrorCode: fromHash }); history.replaceState(null, '', location.pathname); }
    if (settings.mirrorCode) { $('#mirInput').value = settings.mirrorCode; $('#mirMsg').textContent = 'ستظهر شاشة ' + this.devName(settings.mirrorCode) + ' عند الدخول'; }
    $('#mirJoin').addEventListener('submit', e => {
      e.preventDefault();
      const c = $('#mirInput').value.replace(/\D/g, '');
      if (c.length !== 6) { $('#mirMsg').textContent = 'الرمز 6 أرقام'; return; }
      saveSettings({ mirrorCode: c }); $('#mirMsg').textContent = 'حُفظ. ستظهر شاشة ' + this.devName(c) + ' عند الدخول'; $('#mirInput').blur();
    });
    // Decide by what the browser supports (not by device name): Chrome/Edge/Firefox on computers can share;
    // phone and tablet browsers (iPhone, Android incl. Galaxy Tab) can only receive.
    const app = !!window.MadarAndroid;
    if (app && $('#androidApp')) $('#androidApp').hidden = true;
    const canShare = app || typeof navigator.mediaDevices?.getDisplayMedia === 'function';
    if (!canShare) {
      const android = /Android/i.test(navigator.userAgent);
      $('#mirHost').innerHTML = '<p class="hint" style="margin-top:0">متصفح هذا الجهاز لا يسمح بمشاركة شاشته (هذا قيد في متصفحات الهواتف والأجهزة اللوحية). يمكنه استقبال شاشة جهاز آخر بإدخال رمزه في الأسفل.</p>'
        + (android ? '<p class="hint">على أندرويد (مثل Galaxy Tab) ثبّت <b>تطبيق مدار</b> ليشارك شاشة هذا الجهاز فعلياً: <a href="' + ANDROID_APK + '" style="color:#7cc4ff">تنزيل Madar.apk</a></p>' : '');
      return;
    }
    if (app) { const b = $('#mirStart'); if (b) b.textContent = 'شارك شاشة هذا الجهاز'; }
    this.host = new ScreenHost(s => {
      if (s.synced) { this.renderLinks(); return; }
      $('#mirLive').hidden = !s.live; $('#mirStart').hidden = !!s.live;
      if (!s.live) return;
      $('#mirCode').textContent = s.code; $('#mirLink').textContent = s.link;
      $('#mirQr').innerHTML = qrSvg(s.link);
      $('#mirStatus').textContent = s.viewers ? 'متصل: ' + s.viewers + ' جهاز' : 'بانتظار الهاتف…';
      const c = s.caps, el = $('#mirCtl');
      if (c && el) {
        if (c.control) el.textContent = 'التحكم عن بُعد جاهز ✓';
        else if (c.kind === 'agent') el.innerHTML = c.why + ' — <a href="' + AGENT_DOWNLOAD + '" target="_blank" rel="noopener" style="color:#7cc4ff">تنزيل Madar Agent</a>';
        else if (c.kind === 'android') el.innerHTML = c.why + ' <button type="button" class="ghost" id="mirCtlOpen" style="margin-top:6px">فتح الإعدادات</button>';
        else el.textContent = c.why || '';
        $('#mirCtlOpen')?.addEventListener('click', () => { try { window.MadarAndroid.openControlSettings(); } catch {} });
      }
    });
    const mc = $('#mirControl');
    if (mc) { mc.checked = settings.mirrorControl !== false; mc.addEventListener('change', () => { saveSettings({ mirrorControl: mc.checked }); this.host.sendCaps(); this.host.status(); }); }
    $('#mirStart').addEventListener('click', async () => {
      try { await this.host.start(); this.log('مشاركة الشاشة: ' + this.host.code); }
      catch (e) { $('#mirStatus').textContent = ''; alertBox(e.message || 'لم تبدأ المشاركة'); }
    });
    $('#mirStop').addEventListener('click', () => this.host.stop());
    $('#mirCopy').addEventListener('click', () => { navigator.clipboard?.writeText(this.host.link).then(() => { $('#mirCopy').textContent = 'تم النسخ'; }).catch(() => {}); });
    const alertBox = m => { this.showError(m); };
  }
  bindTeams() {
    const inp = $('#myTeams'); if (!inp) return;
    const show = () => { inp.value = (settings.myTeams || []).map(t => t.name).join('، '); };
    show(); this.renderTeams = show;
    $('#teamsSave').addEventListener('click', () => {
      const names = inp.value.split(/[،,]/).map(s => s.trim()).filter(Boolean).slice(0, 30);
      saveSettings({ myTeams: names.map(n => ({ name: n, country: '' })) });
      $('#teamsMsg').textContent = 'حُفظت ' + names.length + ' فرق';
    });
    $('#teamsSync').addEventListener('click', () => {
      $('#teamsMsg').textContent = 'جاري المزامنة من cplay2…';
      const before = JSON.stringify(settings.myTeams || []);
      this.sports.syncFavorites();
      setTimeout(() => { show(); $('#teamsMsg').textContent = JSON.stringify(settings.myTeams || []) !== before ? 'تمت المزامنة ✓' : 'لم أجد فرقاً محفوظة في cplay2 على هذا الجهاز — اكتبها هنا'; }, 6000);
    });
  }
  // Makkah: your own 360° video or photo of the Haram becomes the world around you.
  async openMakkah() {
    let items = []; try { items = await listItems(); } catch {}
    const it = items.find(i => /مكة|مكه|الحرم|الكعبة|كعبة|makkah|mecca|kaaba|haram/i.test(i.name) && (i.type === 'video' || i.type === 'image'));
    if (!it) {
      this.toast('أضف فيديو أو صورة 360° لمكة إلى مكتبتك (اجعل اسمها يحتوي «مكة») أو أرسلها من جهاز آخر، ثم اختر «مكة المكرمة»', 7000);
      return;
    }
    this.windows.windows.filter(w => w.sphere).forEach(w => this.windows.close(w));
    const w = this.windows.open({ kind: it.type, itemId: it.id, name: it.name, proj: '360', fmt: /sbs|3d/i.test(it.name) ? 'sbsh' : null });
    if (w) { w.group.scale.setScalar(0.5); }
    this.toast('مكة المكرمة · 360° حولك — التفت حولك', 3500);
    this.log('بيئة مكة: ' + it.name);
  }
  // ---------- Built-in browser (served by a paired Madar Android app) ----------
  browserDevice() {
    const l = pairedDevices().filter(d => d.browser);
    if (!l.length) return null;
    const near = this.devices ? [...this.devices.nearby.keys()] : [];
    return l.find(d => near.includes(d.code)) || l.find(d => d.code === settings.browserCode) || l[0];
  }
  useBuiltinBrowser(url) {
    if (window.MadarIOS) return false;   // the iPhone app opens every site with full control already
    if (settings.builtinBrowser === false || settings.viewMode !== 'sbs' || !this.browserDevice()) return false;
    try { return /^https?:/i.test(url) && !new URL(url).hostname.endsWith('mazendevloper.github.io'); } catch { return false; }
  }
  async openBrowser(url = '', attempt = 0, onReady = null) {
    const dev = this.browserDevice();
    if (!dev) { this.toast('المتصفح المدمج يحتاج تطبيق مدار مفتوحاً على التابلت ومضافاً في «أجهزتي»', 5000); return null; }
    const existing = [...this.windows.windows].reverse().find(w => w.browser && w.remote);
    if (existing && attempt === 0) { if (url) existing.navigate(url); onReady?.(existing); return existing; }
    if (attempt === 0) { this.toast('فتح متصفح مدار على ' + dev.name + '…', 2500); this.log('المتصفح المدمج: ' + dev.code + ' ' + url); }
    try { await this.devices.requestBrowser(dev.code, url, 1280, 800); }
    catch (e) { this.toast((e.message || 'تعذّر الاتصال') + ' — افتح تطبيق مدار على ' + dev.name, 5000); return null; }
    const viewer = new ScreenViewer('madar-web-');
    let win = null;
    const connect = async (n) => {
      try {
        const stream = await viewer.connect(dev.code, {
          onEnd: () => { if (win && this.windows.windows.includes(win)) { this.toast('انقطع المتصفح — إعادة الاتصال…', 2000); setTimeout(() => connect(0), 1200); } },
          onCaps: c => win?.setControl(c),
          onPage: s => win?.onPage(s),
        });
        if (win && this.windows.windows.includes(win)) { win.setStream(stream); return; }
        win = this.windows.open({ kind: 'video', stream, name: 'متصفح مدار', remote: viewer, browser: true, url });
        win.setControl(viewer.caps || { control: true, kind: 'browser' });
        if (viewer.page) win.onPage(viewer.page);
        onReady?.(win); onReady = null;
        this.log('المتصفح المدمج: متصل');
      } catch (e) {
        if (n < 6) setTimeout(() => connect(n + 1), 1500);
        else this.toast('تعذّر فتح المتصفح المدمج: ' + (e.message || ''), 5000);
      }
    };
    setTimeout(() => connect(0), 900);   // give the tablet a moment to start its browser
    return null;
  }
  // Another device asked this tablet to run its built-in browser.
  async receiveBrowserOpen(d, from) {
    if (!this.webHost) return;
    this.log('المتصفح المدمج: طلب من ' + (from?.name || from?.code));
    await this.webHost.ensure(d.url || '', { w: d.w, h: d.h });
  }
  openGames() {
    this.windows.open({ kind: 'game' });
    if (settings.viewMode !== 'sbs') this.windows.open({ kind: 'web', url: new URL('emu.html', location.href).href, title: 'ألعاب كلاسيكية', direct: true });
    else this.toast('للألعاب الكلاسيكية: افتح mazendevloper.github.io/fit/emu.html على التابلت أو اللابتوب واعرضه هنا بالميرور (جودة «ألعاب»)', 7000);
  }
  openMatches() {
    let w = this.windows.windows.find(x => x.panelKind === 'matches');
    if (!w) w = this.windows.open({ kind: 'panel', panel: 'matches' });
    this.sports.refresh(true);
    if (!this.sports.teams().length) this.sports.syncFavorites();
    return w;
  }
  // Sports mode: the streaming site in front, the big scoreboard to its right, big islands under the clock.
  startSportsMode() {
    if (!this.active) return;
    const W = this.windows;
    // the demo pieces (welcome, clock, sample video, helmet) have no place next to the match
    [...W.windows].filter(w => w.panelKind === 'welcome' || w.panelKind === 'clock' || /sample\.mp4$/.test(w.url || '') || /helmet\.glb$/.test(w.url || '')).forEach(w => W.close(w));
    if (!W.windows.some(w => w.panelKind === 'scoreboard')) {
      const sb = W.open({ kind: 'panel', panel: 'scoreboard' });
      W.placeBeside?.(sb, -0.62, 2.0, -0.02);
    }
    const hasSite = W.windows.some(w => /dramalive/.test(w.url || w.pageUrl || ''));
    if (!hasSite) { const w = W.open({ kind: 'web', url: 'https://web.dramalive.cc', title: 'البث المباشر' }); if (w) W.placeBeside?.(w, 0.12, 2.2, 0.02); }
    this.sports.refresh(true);
    this.toast('⚽ الوضع الرياضي', 1800);
  }
  stopSportsMode() {
    const sb = this.windows.windows.find(w => w.panelKind === 'scoreboard'); if (sb) this.windows.close(sb);
  }
  // 20-20-20: every 20 minutes of reading / watching, look 20 feet (6 m) away for 20 seconds
  eyeBreak(now) {
    if (settings.eyeBreak === false) return;
    if (!this.eyeT0) this.eyeT0 = now;
    if (now - this.eyeT0 < 20 * 60e3) return;
    this.eyeT0 = now;
    if (!this.windows.windows.some(w => ['reader', 'web', 'video'].includes(w.kind))) return;
    this.notify({ icon: '👁', title: 'استراحة لعينيك', body: 'انظر بعيداً ٢٠ ثانية — قاعدة ٢٠-٢٠-٢٠', actions: [['تمارين العين', () => this.openCoach('eyes')]] });
  }
  // «القراءة»: the mushaf (or one of your books) open in front of you
  openReader(book = 'quran', item = null, page = 0) {
    const cur = this.windows.windows.find(w => w.kind === 'reader');
    if (cur && cur.bookId === book && cur.itemId === item) { if (page) cur.goTo(page); this.windows.placeBeside?.(cur, 0, 1.3, -0.05); return cur; }
    return this.windows.open({ kind: 'reader', book, item, page });
  }
  // «المدرب الرياضي»: train / box / eyes & neck / treadmill
  openCoach(mode = 'train') {
    const cur = this.windows.windows.find(w => w.kind === 'coach');
    if (cur) { if (cur.mode !== mode) cur.setMode(mode); return cur; }
    return this.windows.open({ kind: 'coach', mode });
  }
  openShelf() {
    const cur = this.windows.windows.find(w => w.kind === 'shelf');
    if (cur) { cur.refresh(); return cur; }
    return this.windows.open({ kind: 'shelf' });
  }
  // «اقرأ في مدار»: a web page's article as a book (kept in your library)
  async readWeb(url) {
    if (!url) return;
    this.toast('📖 جاري تحضير المقال…', 2500);
    try { const item = await saveWebArticle(url); this.openReader('doc', item.id); this.renderLibrary?.(); this.hub?.push('articles', { id: url, kind: 'article', url, title: item.name }, 40); }
    catch (e) { this.toast('تعذّر: ' + (e.message || e), 3500); }
  }
  // «سورة الكهف» / «آية الكرسي» by voice
  openSurah(name) {
    const i = SURAHS.findIndex(x => name.includes(x[0]) || name.includes(x[0].replace(/^ال/, '')));
    const r = this.openReader('quran');
    if (i >= 0) setTimeout(() => { const w = this.windows.windows.find(x => x.kind === 'reader'); w?.book ? w.goTo(SURAHS[i][2]) : setTimeout(() => w?.goTo(SURAHS[i][2]), 1500); }, 300);
    return r;
  }
  openCplay() { this.windows.open({ kind: 'web', url: 'https://drivecast.c-p.workers.dev/media', title: 'DriveCast' }); }
  recenter() { this.head.recenter(); this.toast('تمت إعادة التمركز'); blip('open', settings.sounds); }
  cycleEnvironment() {
    const k = ENV_ORDER[(ENV_ORDER.indexOf(envKey(settings.environment)) + 1) % ENV_ORDER.length];
    saveSettings({ environment: k });
    this.toast('البيئة: ' + ENVS[k].label);
    this.renderEnvChoices?.();
  }
  applySettings() { this.renderer.applySettings(); this.renderer.resize(); }
  persistLayout() { if (this.windows && this.active && !settings.guest) saveLayout({ windows: this.windows.serialize() }); }
  toggleDeskHole() { toggleDeskHole(this); }
  // Guest mode: someone else uses Madar — your windows, teams, devices and library stay private and untouched.
  toggleGuest() {
    if (!settings.guest) {
      try { localStorage.setItem('madar.owner', JSON.stringify({ settings: { ...settings }, windows: this.windows.serialize() })); } catch {}
      this.windows.closeAll();
      saveSettings({ guest: true, island: false, mirrorCode: '' });
      this.toast('👤 وضع الضيف: مساحة جديدة — اضبط العدستين لعينيك', 3500);
      setTimeout(() => this.lensAdjust?.open?.(), 1200);
    } else {
      let o = null; try { o = JSON.parse(localStorage.getItem('madar.owner') || 'null'); } catch {}
      this.windows.closeAll();
      if (o?.settings) saveSettings({ ...o.settings, guest: false }); else saveSettings({ guest: false });
      this.renderer.resize();
      if (o?.windows?.length) setTimeout(() => this.windows.restore(o.windows), 300);
      this.toast('عدت إلى مساحتك', 2000);
    }
  }

  // ---------- Home screen ----------
  bindHome() {
    $('#enter').addEventListener('click', () => this.enter());
    // Open files straight from the Files app (no copy into the library): they appear as windows on entering.
    $('#openNow')?.addEventListener('change', async e => {
      const files = [...e.target.files]; e.target.value = '';
      if (!files.length) return;
      try { await this.enter(); } catch {}
      setTimeout(() => this.openLocalFiles(files), 700);
    });
    // Preview and adjust the two lens images (move, zoom, height) straight from the home page.
    $('#lensPreview')?.addEventListener('click', async () => {
      if (settings.viewMode !== 'sbs') saveSettings({ viewMode: 'sbs' });
      try { await this.enter(); } catch (e) { this.log('lens preview: ' + (e.message || e)); }
      setTimeout(() => { if (this.active) this.lensAdjust.open(); }, 900);
    });
    const standalone = window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches;
    $('#install').hidden = standalone;
    $('#files').addEventListener('change', async e => {
      const files = e.target.files; if (!files || !files.length) return;
      $('#libStatus').textContent = 'جاري الحفظ…';
      try { const made = await importFiles(files); $('#libStatus').textContent = made.length ? `أُضيف ${made.length}` : 'لم يُتعرّف على صيغة الملفات'; }
      catch (err) { console.error(err); $('#libStatus').textContent = 'تعذّر حفظ الملفات، قد تكون المساحة ممتلئة'; }
      e.target.value = '';
      this.renderLibrary();
      setTimeout(() => { $('#libStatus').textContent = ''; }, 3500);
    });
    // books, photographed books, your own environments, web articles to read
    const lib = async (fn, okMsg) => {
      $('#libStatus').textContent = 'جاري الحفظ…';
      try { const r = await fn(); $('#libStatus').textContent = r ? okMsg(r) : 'لم يُتعرّف على صيغة الملفات'; }
      catch (err) { console.error(err); $('#libStatus').textContent = 'تعذّر الحفظ: ' + (err.message || 'قد تكون المساحة ممتلئة'); }
      this.renderLibrary(); setTimeout(() => { $('#libStatus').textContent = ''; }, 4500);
    };
    $('#bookFiles')?.addEventListener('change', e => { const f = [...(e.target.files || [])]; e.target.value = ''; if (f?.length) lib(async () => { const m = await importFiles(f); return m.length ? m : null; }, m => '📚 أُضيف ' + m.length + ' كتاب — تجده في «رف الكتب» داخل مدار'); });
    $('#photoBook')?.addEventListener('change', e => { const f = [...(e.target.files || [])]; e.target.value = ''; if (f?.length) lib(() => importPhotoBook(f), it => '📷 كتاب مصوّر من ' + it.files.length + ' صفحة — في «رف الكتب»'); });
    $('#envFiles')?.addEventListener('change', e => {
      const f = [...(e.target.files || [])]; e.target.value = '';
      // a photo (any shape: 360° or an ordinary picture) or a 3D room becomes your environment right away
      if (f?.length) lib(async () => { const it = await importEnvironment(f); if (it) { await this.gallery.applyMine(it.id); this.toast('🌍 «' + it.name + '» صارت بيئتك', 2500); } return it; }, it => '🌍 «' + it.name + '» صارت بيئتك — وتجدها في المكتبات ← ملفاتي');
    });
    $('#readForm')?.addEventListener('submit', e => {
      e.preventDefault(); const url = $('#readUrl').value.trim(); if (!/^https?:\/\//.test(url)) { $('#libStatus').textContent = 'اكتب رابطاً يبدأ بـ https://'; return; }
      lib(async () => { const { saveWebArticle } = await import('./books.js'); return saveWebArticle(url); }, it => '📖 «' + it.name + '» — في «رف الكتب»');
      $('#readUrl').value = '';
    });
    // sports: your weight / height (the Eufy scale through Apple Health, or typed here)
    if ($('#fitWeight')) {
      $('#fitWeight').value = settings.weight || ''; $('#fitHeight').value = settings.height || '';
      $('#fitWeight').addEventListener('change', e => { const v = parseFloat(e.target.value); if (v > 20) { saveSettings({ weight: v, weightAt: Date.now() }); $('#fitMsg').textContent = 'حُفظ الوزن'; } });
      $('#fitHeight').addEventListener('change', e => { const v = parseFloat(e.target.value); if (v > 100) saveSettings({ height: v }); });
      $('#fitHealthUrl').textContent = 'https://studio.c-p.workers.dev/health/' + deviceIdentity().code;
    }
    const saveLink = () => {
      const msg = $('#linkMsg');
      const raw = $('#linkUrl').value.trim();
      // Accept pasted text that contains a link somewhere inside it.
      const found = raw.match(/https?:\/\/[^\s]+/i) || raw.match(/(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[\/?#][^\s]*)?/i);
      let url = found ? found[0] : raw.replace(/\s+/g, '');
      if (!url) { msg.textContent = 'اكتب الرابط أولاً'; return; }
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      let host = '';
      try { host = new URL(url).hostname; } catch {}
      if (!host || !host.includes('.')) { msg.textContent = 'الرابط غير صحيح، مثال: youtube.com/watch?v=…'; return; }
      const title = $('#linkName').value.trim() || host.replace(/^www\./, '');
      const l = loadLinks(); l.unshift({ id: 'l' + Date.now(), title, url }); saveLinks(l);
      $('#linkUrl').value = ''; $('#linkName').value = '';
      $('#linkUrl').blur(); $('#linkName').blur();
      msg.textContent = 'تم حفظ «' + title + '» — تجده في القائمة ← المواقع';
      setTimeout(() => { if (msg.textContent.startsWith('تم')) msg.textContent = ''; }, 4000);
      this.renderLinks();
    };
    $('#linkForm').addEventListener('submit', e => { e.preventDefault(); saveLink(); });
    // Viewer presets
    const pre = $('#presets');
    Object.entries(VIEWER_PRESETS).forEach(([k, p]) => {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.preset = k; b.textContent = p.label;
      b.addEventListener('click', () => { applyPreset(k); this.renderSettings(); this.applySettings(); });
      pre.appendChild(b);
    });
    document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { saveSettings({ viewMode: b.dataset.view }); this.renderSettings(); }));
    document.querySelectorAll('[data-camera]').forEach(b => b.addEventListener('click', () => {
      const cam = b.dataset.camera;
      saveSettings({ camera: cam, camFov: cam === 'ultra' ? 104 : 69 });
      this.renderSettings();
    }));
    document.querySelectorAll('input[type=range][data-key]').forEach(inp => inp.addEventListener('input', () => {
      const k = inp.dataset.key, v = parseFloat(inp.value);
      const patch = { [k]: v };
      if (['k1', 'k2', 'lensSep', 'screenToLens'].includes(k)) patch.preset = 'custom';
      saveSettings(patch); this.renderSettings(); this.applySettings();
    }));
    onSettings((st) => {
      if (st.sportsMode !== this.sportsWas) { const was = this.sportsWas; this.sportsWas = st.sportsMode; if (was !== undefined && this.active) st.sportsMode ? this.startSportsMode() : this.stopSportsMode(); }
      if (st.lite !== this.liteWas) { const was = this.liteWas; this.liteWas = st.lite; if (was !== undefined) { this.renderer.resize(); if (this.active) this.toast(st.lite ? '🪶 الوضع الخفيف — النوافذ بجودة فائقة' : 'الوضع الخفيف متوقف', 2200); } }
    });
    document.querySelectorAll('input[type=checkbox][data-key]').forEach(inp => inp.addEventListener('change', () => { saveSettings({ [inp.dataset.key]: inp.checked }); }));
    $('#resetSettings').addEventListener('click', () => { resetSettings(); this.renderSettings(); this.applySettings(); });
    $('#resetLayout').addEventListener('click', () => { saveLayout({ windows: [] }); try { localStorage.removeItem(FIRST_RUN); } catch {} $('#resetLayout').textContent = 'سيظهر الترتيب الافتراضي عند الدخول'; });
    this.renderEnvChoices = () => {
      const box = $('#envs'), cur = envKey(settings.environment);
      const sw = { passthrough: 'linear-gradient(135deg,#8a8f99,#c9ccd2)', dim: 'linear-gradient(135deg,#2a2d35,#4b4f5a)', night: 'radial-gradient(circle at 30% 30%,#2a3a70,#070b1a)', cinema: 'radial-gradient(circle at 50% 35%,#2a3550,#0b0910 70%)', sunset: 'linear-gradient(180deg,#3a2f6a,#ff8c52 75%,#5a3030)',
        neonDesk: 'linear-gradient(135deg,#4b5688,#ff5fd6)', study: 'linear-gradient(135deg,#c8afe0,#f4f3f6)', realNeon: 'linear-gradient(135deg,#223a8a,#5fdcff)', realStudio: 'linear-gradient(135deg,#e4c6f6,#f0eef2)', lounge: 'linear-gradient(135deg,#5a3020,#ffb070)', realStudy: 'linear-gradient(135deg,#d8d0c0,#fff4e0)',
        space: 'radial-gradient(circle at 60% 85%,#3a7bd5 0 22%,#0a1430 23%,#01020a 70%)', library: 'linear-gradient(135deg,#4a2f1c,#c9a24a)', reading: 'linear-gradient(135deg,#8a7a60,#f2e6cc)', viewOffice: 'linear-gradient(180deg,#f7b267,#f25c54 60%,#3a2c40)', nightOffice: 'linear-gradient(180deg,#0b1030,#3a4a8a 60%,#ffcf6a)', gaming: 'linear-gradient(135deg,#8a3cff,#18d8ff)', gamingRed: 'linear-gradient(135deg,#ff2a3c,#ff9a1a)', jupiter: 'radial-gradient(circle at 60% 35%,#d9b48a 0 25%,#0a0c14 26%)', aurora: 'linear-gradient(180deg,#0a1630,#2ee59d 60%,#101820)' };
      box.innerHTML = '';
      ENV_ORDER.forEach(k => {
        const b = document.createElement('button'); b.type = 'button'; b.className = k === cur ? 'on' : '';
        b.innerHTML = `<i style="background:${sw[k]}"></i>${ENVS[k].label}`; b.title = ENVS[k].note;
        b.addEventListener('click', () => { saveSettings({ environment: k }); this.renderEnvChoices(); });
        box.appendChild(b);
      });
    };
    this.renderEnvChoices();
    this.bindMirror();
    this.bindDevices();
    if ($('#appVer')) $('#appVer').textContent = 'v' + APP_VERSION;
    this.bindTeams();
    this.renderLibrary(); this.renderLinks(); this.renderSettings();
  }

  async renderLibrary() {
    const ul = $('#libList'); ul.innerHTML = '';
    let items = [];
    try { items = await listItems(); } catch {}
    $('#libEmpty').hidden = items.length > 0;
    for (const it of items) {
      const li = document.createElement('li');
      const kind = { video: 'فيديو', image: 'صورة', model: 'مجسم ' + (it.format || '').toUpperCase(), doc: 'كتاب ' + ({ images: 'مصوّر', web: 'مقال' }[it.format] || (it.format || '').toUpperCase()), env: 'بيئة ' + (it.format || '').toUpperCase() }[it.type] || it.type;
      li.innerHTML = `<span class="badge ${it.type}"></span><div class="meta"><b></b><small>${kind} · ${formatSize(it.size)}${it.files.length > 1 ? ' · ' + it.files.length + ' ملفات' : ''}</small></div><button class="del" type="button" aria-label="حذف">حذف</button>`;
      li.querySelector('b').textContent = it.name;
      li.querySelector('.del').addEventListener('click', async () => { await deleteItem(it.id); forgetDepth(it.id); this.renderLibrary(); });
      if (it.type === 'image') {   // 2D → spatial: the depth is estimated here once, the photo then opens in 3D
        const b = document.createElement('button'); b.type = 'button'; b.className = 'del'; b.style.marginInlineEnd = '6px';
        const set = () => { b.textContent = cachedDepth(it.id) ? '🧊 مجسّمة ✓' : '🧊 اجعلها مجسّمة'; };
        set();
        b.addEventListener('click', async () => {
          if (cachedDepth(it.id)) { forgetDepth(it.id); set(); return; }
          b.disabled = true;
          try {
            const full = await getItem(it.id), img = new Image(), url = URL.createObjectURL(full.files[0].blob);
            img.src = url; await img.decode();
            saveDepth(it.id, await depthMap(img, { onStep: m => { b.textContent = m; } }));
            URL.revokeObjectURL(url);
          } catch (e) { $('#libStatus').textContent = 'تعذّر التحويل: ' + (e.message || e); }
          b.disabled = false; set();
        });
        li.insertBefore(b, li.querySelector('.del'));
      }
      ul.appendChild(li);
    }
  }
  renderLinks() {
    const ul = $('#linkList'); ul.innerHTML = '';
    const links = loadLinks();
    $('#linkEmpty').hidden = links.length > 0;
    links.forEach((l, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="badge web"></span><div class="meta"><b></b><small dir="ltr"></small></div><button class="del" type="button">حذف</button>`;
      li.querySelector('b').textContent = l.title; li.querySelector('small').textContent = l.url;
      li.querySelector('.del').addEventListener('click', () => { const a = loadLinks(); a.splice(i, 1); saveLinks(a); this.renderLinks(); });
      ul.appendChild(li);
    });
  }
  renderSettings() {
    document.querySelectorAll('#presets button').forEach(b => b.classList.toggle('on', b.dataset.preset === settings.preset));
    document.querySelectorAll('[data-camera]').forEach(b => b.classList.toggle('on', b.dataset.camera === settings.camera));
    document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === settings.viewMode));
    document.querySelectorAll('input[type=range][data-key]').forEach(inp => {
      const k = inp.dataset.key; inp.value = settings[k];
      const out = document.querySelector(`output[for="${inp.id}"]`);
      if (out) out.textContent = (+settings[k]).toFixed(inp.step.includes('.') ? 2 : 0) + (inp.dataset.unit || '');
    });
    document.querySelectorAll('input[type=checkbox][data-key]').forEach(inp => { inp.checked = !!settings[inp.dataset.key]; });
  }
  renderStatus() {
    const set = (id, state, label) => { const el = $(id); if (!el) return; el.dataset.state = state; el.querySelector('em').textContent = label; };
    const h = this.hands;
    if (h.state === 'ready') set('#st-hands', 'ok', 'جاهز' + (h.delegate === 'CPU' ? ' (وضع المعالج)' : ''));
    else if (h.state === 'loading') set('#st-hands', 'wait', 'تحميل ' + Math.round(h.progress * 100) + '%');
    else if (h.state === 'error') set('#st-hands', 'bad', 'تعذّر التحميل — يعمل النقر بالنظر');
    else set('#st-hands', 'wait', 'بانتظار');
    const standalone = window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
    set('#st-mode', standalone ? 'ok' : 'warn', standalone ? 'تطبيق بملء الشاشة' : 'داخل Safari — يُفضّل التثبيت');
    if (!this.camState) set('#st-camera', 'wait', 'يُطلب عند الدخول');
    if (!this.motionState) set('#st-motion', 'wait', 'يُطلب عند الدخول');
  }

  // ---------- Session ----------
  async enter() {
    if (this.active) return;
    const btn = $('#enter'); btn.disabled = true; btn.textContent = 'جاري التحضير…';
    // Everything that needs the tap's user activation happens first, synchronously where possible.
    try { audioContext()?.resume(); } catch {}
    this.media.unlock(); this.media.unlockAudio();
    if (settings.viewMode === 'desktop') this.toggleFullscreen();
    const motionP = this.requestMotion();
    const camP = this.startCamera();
    this.startVoice();
    const [motionOk, camOk] = await Promise.all([motionP, camP]);
    this.motionState = motionOk ? 'ok' : 'bad';
    this.camState = camOk ? 'ok' : 'bad';
    const set = (id, s, l) => { const el = $(id); el.dataset.state = s; el.querySelector('em').textContent = l; };
    set('#st-motion', motionOk ? 'ok' : 'bad', motionOk ? 'مسموح' : 'مرفوض — فعّله من إعدادات Safari');
    set('#st-camera', camOk ? 'ok' : 'bad', camOk ? 'مسموح' : 'مرفوض — اسمح بالكاميرا لهذا الموقع');
    btn.disabled = false; btn.textContent = 'ادخل إلى مدار';
    if (!camOk) { this.showError('لا يمكن تشغيل الواقع المختلط بدون الكاميرا. من الإعدادات ← Safari ← الكاميرا اختر «سماح» ثم أعد المحاولة.'); return; }
    this.requestWakeLock();
    document.body.classList.add('in-mr'); document.documentElement.classList.add('mr');
    window.MadarIOS?.send('mr', { on: true });   // iPhone app: turn to landscape for the headset
    this.stage.hidden = false;
    this.orientation.layout();
    this.renderer.resize();
    this.active = true;
    try { sessionStorage.setItem('madar.inMR', String(Date.now())); sessionStorage.removeItem('madar.last'); } catch {}
    this.log('دخول البيئة');
    this.controls.sync(); this.controls.reset();
    if (settings.viewMode === 'desktop' && settings.eyeTrack) setTimeout(() => this.gaze.start(), 1200);
    if (this.host?.stream) setTimeout(() => this.showLocalScreen(), 1500);   // already sharing on this computer: show it here too
    else if (settings.mirrorCode) setTimeout(() => this.connectMirror(settings.mirrorCode), 2000);
    if (settings.viewMode === 'desktop') { setTimeout(() => this.toast('WASD للتحرك · الأسهم أو السحب للنظر · M القائمة · F ملء الشاشة', 6000), 2500); }
    if (settings.walk && !IOS) setTimeout(() => this.slam.start(), 1500);
    this.head.recenter();
    this.restoreScene();
    this.extras.enter();
    this.hub.enter();
    if (settings.ambient && settings.ambient !== 'off') setTimeout(() => this.ambient.set(settings.ambient), 1500);
    // Your teams from cplay2 (once a day), then matches for the live island.
    if (!settings.myTeamsAt || Date.now() - settings.myTeamsAt > 864e5) { saveSettings({ myTeamsAt: Date.now() }); setTimeout(() => this.sports.syncFavorites(), 4000); }
    setTimeout(() => this.sports.refresh(true), settings.sportsMode ? 500 : 6000);
    if (settings.sportsMode) setTimeout(() => this.startSportsMode(), 2500);
    this.last = performance.now();
    this.renderer.renderer.setAnimationLoop(t => this.frame(t));
    setTimeout(() => this.toast(motionOk ? 'ضع الهاتف في النظارة · الكاميرا للخارج' : 'حساسات الحركة غير مفعّلة', 4500), 300);
    if (!motionOk) setTimeout(() => this.toast('اسحب على الشاشة لتدوير المشهد', 4000), 5000);
  }

  restoreScene() {
    const saved = loadLayout();
    let first = false; try { first = !localStorage.getItem(FIRST_RUN); } catch {}
    if (this.windows.windows.length) return;
    if (this.crashed) {
      // The last session ended unexpectedly: start light, keep the saved layout for later.
      this.crashed = false;
      const w = this.windows.open({ kind: 'panel', panel: 'welcome' });
      setTimeout(() => this.toast('بدأنا بمساحة خفيفة بعد الإغلاق المفاجئ', 4000), 1500);
      return;
    }
    // Stable start: an empty space (or just the shared screen when a code is saved). Old windows come back only if asked.
    if (!settings.restoreLayout) {
      if (!settings.mirrorCode) setTimeout(() => this.toast('مساحة فارغة · افتح القائمة بزر Options أو بقرصة طويلة', 4500), 1800);
      try { localStorage.setItem(FIRST_RUN, '1'); } catch {}
      return;
    }
    if (saved && saved.windows && saved.windows.length && !first) { this.windows.restore(saved.windows); return; }
    if (settings.sportsMode || !first) { try { localStorage.setItem(FIRST_RUN, '1'); } catch {} return; }   // the demo scene: first run only, never in sports mode
    // Default first scene.
    const w = this.windows;
    const yaw0 = w.forwardYaw();
    const at = (win, yaw, d, y) => { win.group.position.set(-Math.sin(yaw0 + yaw) * d, y, -Math.cos(yaw0 + yaw) * d); if (win.kind !== 'model') win.group.lookAt(0, 0, 0); };
    const welcome = w.open({ kind: 'panel', panel: 'welcome' }); at(welcome, 0, 1.6, 0.02);
    const clock = w.open({ kind: 'panel', panel: 'clock' }); at(clock, 0.05, 1.7, 0.56);
    const vid = w.open({ kind: 'video', url: 'assets/sample.mp4' }); at(vid, -0.95, 2.4, 0.05);
    vid.video.muted = true;
    const model = w.open({ kind: 'model', url: 'assets/helmet.glb' }); at(model, 0.72, 1.25, -0.36);
    model.spin = true;
    try { localStorage.setItem(FIRST_RUN, '1'); } catch {}
    w.changed();
  }

  exit() {
    if (!this.active) return;
    const snapshot = this.windows.serialize();
    this.active = false;
    try { sessionStorage.removeItem('madar.inMR'); } catch {}
    this.log('خروج من البيئة');
    this.renderer.renderer.setAnimationLoop(null);
    this.windows.windows.forEach(w => { if (w.video) w.video.pause(); });
    this.windows.closeAll();
    // closeAll schedules an empty save; keep the real layout instead.
    clearTimeout(this.windows.saveTimer);
    saveLayout({ windows: snapshot });
    this.extras.exit();
    this.launcher.close(); this.calibration.close();
    this.slam.stop();
    const s = this.camVideo.srcObject; if (s) s.getTracks().forEach(t => t.stop());
    this.camVideo.srcObject = null;
    this.renderer.setVideo(null);
    this.stopVoice();
    this.ambient?.stop();
    try { this.wakeLock?.release(); } catch {}
    this.stage.hidden = true;
    document.body.classList.remove('in-mr'); document.documentElement.classList.remove('mr');
    window.MadarIOS?.send('mr', { on: false });
    this.renderLibrary();
    this.renderLog();
  }

  async requestMotion() {
    if (IOS) return true;   // ARKit
    try {
      const reqs = [];
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') reqs.push(DeviceOrientationEvent.requestPermission());
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') reqs.push(DeviceMotionEvent.requestPermission());
      const res = await Promise.all(reqs.map(p => p.catch(() => 'denied')));
      if (res.some(r => r !== 'granted')) return false;
      return 'DeviceOrientationEvent' in window;
    } catch { return false; }
  }

  async startCamera() {
    if (IOS) { this.renderer.setVideo(null); return true; }   // the iPhone app draws the camera itself
    if (!navigator.mediaDevices?.getUserMedia) return false;
    // Cool mode: 30 fps camera is plenty for passthrough and roughly halves the camera's heat.
    const roomShown = !isImmersive(settings.environment);
    const base = { width: { ideal: roomShown || !settings.cool ? 1280 : 640 }, height: { ideal: roomShown || !settings.cool ? 720 : 360 }, frameRate: settings.cool ? { ideal: 30, max: 30 } : { ideal: 60, max: 60 } };
    let stream = null;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...base, facingMode: { ideal: settings.viewMode === 'desktop' ? 'user' : 'environment' } } }); }
    catch (e) { console.warn(e); try { stream = await navigator.mediaDevices.getUserMedia({ video: true }); } catch { return false; } }
    if (settings.camera === 'ultra') {
      try {
        const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
        const uw = devs.find(d => /ultra|فائق|واسعة جد/i.test(d.label));
        if (uw) {
          stream.getTracks().forEach(t => t.stop());
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...base, deviceId: { exact: uw.deviceId } } });
        } else { saveSettings({ camera: 'wide', camFov: 69 }); this.renderSettings(); setTimeout(() => this.toast('الكاميرا فائقة الاتساع غير متاحة، تم استخدام العادية'), 1500); }
      } catch (e) { console.warn(e); }
    }
    const v = this.camVideo;
    v.srcObject = stream;
    v.muted = true; v.playsInline = true;
    try { await v.play(); } catch (e) { console.warn(e); }
    this.renderer.setVideo(v);
    const track = stream.getVideoTracks()[0];
    track?.addEventListener('ended', () => this.recoverCamera('ended'));
    track?.addEventListener('mute', () => setTimeout(() => { if (track.muted) this.recoverCamera('mute'); }, 1500));
    return true;
  }

  // Thermal guard: inside a virtual place the camera only feeds hand tracking - a small picture, 20 a second.
  coolCamera(immersive) {
    const tr = this.camVideo?.srcObject?.getVideoTracks?.()[0]; if (!tr?.applyConstraints || IOS) return;
    const c = immersive ? { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: settings.handsEnabled ? 20 : 10, max: 24 } }
      : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: settings.cool ? { ideal: 30, max: 30 } : { ideal: 60, max: 60 } };
    tr.applyConstraints(c).catch(() => {});
  }
  // iOS can stop the camera (e.g. when another app or audio takes over). Restart it quietly.
  async recoverCamera(why) {
    if (!this.active || this.recovering) return;
    this.recovering = true;
    this.log('إعادة تشغيل الكاميرا (' + why + ')');
    try { const old = this.camVideo.srcObject; old && old.getTracks().forEach(t => t.stop()); } catch {}
    const ok = await this.startCamera();
    if (!ok) this.toast('توقفت الكاميرا — اخرج وادخل مجدداً', 5000);
    setTimeout(() => this.windows?.resumeMedia(), 400);
    this.recovering = false;
  }

  async requestWakeLock() {
    try { this.wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
  }

  showError(msg) { const e = $('#homeError'); e.textContent = msg; e.hidden = false; e.scrollIntoView({ behavior: 'smooth', block: 'center' }); }

  // ---------- Input on the stage ----------
  bindStageInput() {
    let t0 = 0, sx = 0, sy = 0, moved = false, timer = 0, lastX = 0, lastY = 0;
    const st = this.stage;
    st.addEventListener('touchstart', e => {
      e.preventDefault();
      if (this.controls.direct) { this.controls.touchDown(e.changedTouches); return; }
      const t = e.touches[0];
      t0 = performance.now(); sx = lastX = t.clientX; sy = lastY = t.clientY; moved = false;
      clearTimeout(timer);
      // Exit needs two fingers held for 2 s, so a headset button that stays pressed can never close the session.
      if (e.touches.length >= 2) timer = setTimeout(() => { if (this.active) { this.log('خروج بإصبعين'); blip('close', settings.sounds); this.exit(); } }, 2000);
    }, { passive: false });
    st.addEventListener('touchmove', e => {
      e.preventDefault();
      if (this.controls.direct) { this.controls.touchMove(e.changedTouches); return; }
      const t = e.touches[0];
      if (Math.hypot(t.clientX - sx, t.clientY - sy) > 12) { moved = true; clearTimeout(timer); }
      if (!this.head.hasData) {
        const a = this.orientation.toStage(t.clientX, t.clientY), b = this.orientation.toStage(lastX, lastY);
        this.debugYaw += (a.x - b.x) * 0.005; this.debugPitch = THREE.MathUtils.clamp(this.debugPitch + (a.y - b.y) * 0.005, -1.2, 1.2);
      }
      lastX = t.clientX; lastY = t.clientY;
    }, { passive: false });
    const touchUp = e => { if (this.controls.direct) { e.preventDefault(); this.controls.touchUp(e.changedTouches); return true; } return false; };
    st.addEventListener('touchcancel', touchUp, { passive: false });
    st.addEventListener('touchend', e => {
      if (touchUp(e)) return;
      e.preventDefault();
      clearTimeout(timer);
      if (!moved && performance.now() - t0 < 450) this.onRealTap();
    }, { passive: false });
    // Desktop testing: mouse drag rotates the view, click = tap.
    let down = false;
    st.addEventListener('mousedown', e => { return; down = true; sx = e.clientX; sy = e.clientY; moved = false; });
    window.addEventListener('mousemove', e => {
      if (!down || this.head.hasData) return;
      this.debugYaw += e.movementX * 0.004; this.debugPitch = THREE.MathUtils.clamp(this.debugPitch + e.movementY * 0.004, -1.2, 1.2);
      if (Math.hypot(e.clientX - sx, e.clientY - sy) > 6) moved = true;
    });
    window.addEventListener('mouseup', () => { down = false; });
  }
  onRealTap() {
    if (!this.active) return;
    try { audioContext()?.resume(); } catch {}
    this.windows.windows.forEach(w => w.userGesture?.());
    if (this.voicePending) { const m = this.voicePending; this.voicePending = null; this.listen(m); return; }   // a tap grants the microphone
    if (!this.interaction.realTap()) this.toggleLauncher();
  }

  // ---------- Voice commands (optional) ----------
  startVoice() {
    if (!settings.voice || this.extras?.captions.on) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    try {
      const rec = new SR();
      rec.lang = 'ar-SA'; rec.continuous = true; rec.interimResults = false;
      rec.onresult = e => { const r = e.results[e.results.length - 1]; if (r && r.isFinal) this.voiceCommand(r[0].transcript); };
      rec.onend = () => { if (this.active && this.voice === rec) { try { rec.start(); } catch {} } };
      rec.onerror = () => {};
      rec.start();
      this.voice = rec;
    } catch (e) { console.warn(e); }
  }
  stopVoice() { const r = this.voice; this.voice = null; try { r?.stop(); } catch {} }
  // ---- Voice: push-to-talk commands and dictation (Siri speech recognition in Safari) ----
  // Hold △ on the controller, use «أمر صوتي» in the menu, or say commands continuously if «الأوامر الصوتية» is on.
  listen(mode = 'command') {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { this.toast('التعرف على الصوت غير متاح في هذا المتصفح', 3000); return; }
    this.stopVoice();
    try {
      const rec = new SR();
      rec.lang = 'ar-SA'; rec.continuous = false; rec.interimResults = true; rec.maxAlternatives = 1; rec.madarMode = mode;
      let finalText = '';
      rec.onresult = e => {
        let txt = '';
        for (const r of e.results) txt += r[0].transcript;
        this.toast((mode === 'dictate' ? '✍️ ' : '🎙 ') + txt, 2500);
        if (e.results[e.results.length - 1].isFinal) finalText = txt;
      };
      rec.onerror = e => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { this.voicePending = mode; this.toast('المس الشاشة مرة للسماح بالميكروفون', 3500); }
        else if (e.error === 'no-speech') this.toast('لم أسمع شيئاً', 1500);
      };
      rec.onend = () => {
        if (this.voice === rec) this.voice = null;
        const t = finalText.trim(); if (!t) return;
        if (mode === 'dictate') this.dictate(t); else if (mode === 'assist') this.askAssistant(t); else this.voiceCommand(t);
        if (settings.voice && this.active) setTimeout(() => this.startVoice(), 400);
      };
      rec.start();
      this.voice = rec;
      blip('open', settings.sounds);
      this.toast(mode === 'dictate' ? '✍️ تكلم الآن… سأكتب ما تقول' : mode === 'assist' ? '✨ أسمعك… اسأل المساعد' : '🎙 تكلم الآن… مثل: «اعرض شاشة التابلت»', 3000);
    } catch (e) { this.toast('تعذّر تشغيل الميكروفون', 2500); }
  }
  // Spoken text goes where typing would go: the keyboard, the controlled device, or the open page.
  dictate(t) {
    if (this.extras?.takeDictation(t)) { this.toast('✍️ ' + t, 1500); return; }
    const kb = this.windows.windows.find(w => w.kind === 'keyboard');
    if (kb) { kb.text += (kb.text && !kb.text.endsWith(' ') ? ' ' : '') + t; kb.panel.redraw(); this.toast('✍️ ' + t, 2000); return; }
    const m = [...this.windows.windows].reverse().find(x => x.remote && x.control);
    if (m) { m.typeText(t); this.toast('✍️ أُرسل إلى ' + (m.name || 'الجهاز'), 2000); return; }
    const w = [...this.windows.windows].reverse().find(x => x.kind === 'web' && x.bridge);
    if (w) { w.send({ type: 'text', value: t }); this.toast('✍️ كُتب في الصفحة', 2000); return; }
    this.windows.openKeyboard(t);
  }
  voiceCommand(t) {
    t = t.trim();
    if (this.extras?.voice(t)) { this.toast('🎙 ' + t, 1500); this.log('أمر صوتي: ' + t); return; }
    const has = (...w) => w.some(x => t.includes(x));
    const after = (...w) => { for (const x of w) { const i = t.indexOf(x); if (i >= 0) return t.slice(i + x.length).trim(); } return ''; };
    const pointed = () => this.controls.pointedWindow() || [...this.windows.windows].reverse().find(w => w.kind !== 'keyboard');
    // a question (or «يا مساعد …»): the assistant answers from the live situation and can act
    if (/^(متى|كم|من |هل|ماذا|ماذا|ما |شو|كيف|أين|وين|ليش|لماذا|اي |أي )|النتيجة|سجّل|سجل الهدف|يا مساعد|المساعد/.test(t)) { this.askAssistant(t); return; }
    if (has('امسح الغرفة', 'مسح الغرفة', 'تعرف على الغرفة')) { this.room.scan(); return; }
    if (has('على التلفاز', 'فوق التلفاز')) { const w = pointed(); if (w?.onTv) w.onTv(); return; }
    if (has('السينما')) { const w = pointed(); if (w) { this.windows.cinema = this.windows.cinema === w ? null : w; } return; }
    const devices = pairedDevices();
    const dev = devices.find(d => t.includes(d.name)) || devices.find(d => (has('تابلت', 'التابلت') && d.kind === 'tablet') || (has('لابتوب', 'كمبيوتر') && d.kind === 'computer') || (has('تلفاز', 'التلفزيون', 'التلفاز') && d.kind === 'tv'));
    if (has('اكتب', 'أكتب')) { const x = after('اكتب', 'أكتب'); if (x) this.dictate(x); else this.listen('dictate'); return; }
    if (has('ابحث عن', 'إبحث عن', 'بحث عن')) { const q = after('ابحث عن', 'إبحث عن', 'بحث عن'); if (q) this.windows.open({ kind: 'web', url: 'https://www.google.com/search?q=' + encodeURIComponent(q), title: q }); }
    else if (dev && has('شاشة', 'اعرض', 'افتح')) { if (dev.kind === 'tv') this.showOnDevice(dev.code, settings.mirrorCode); else this.connectMirror(dev.code); }
    else if (has('مباريات', 'المباريات', 'مباراة')) this.openMatches?.();
    else if (has('ارفع الصوت', 'علي الصوت', 'علّي الصوت', 'زد الصوت', 'زيد الصوت', 'خفض الصوت', 'اخفض الصوت', 'وطي الصوت', 'قلل الصوت', 'اكتم', 'كتم الصوت', 'شغل الصوت', 'الغ الكتم', 'ألغ الكتم')) {
      // the volume of the window you look at (or the recitation)
      const up = has('ارفع', 'علي', 'علّي', 'زد', 'زيد'), down = has('خفض', 'اخفض', 'وطي', 'قلل'), mute = has('اكتم', 'كتم الصوت') && !has('الغ', 'ألغ');
      const w = [this.controls.pointedWindow(), ...[...this.windows.windows].reverse()].find(x => x?.setVolume || x?.kind === 'reader');
      if (w?.setVolume) { if (mute) w.setVolume(w.vol ?? 1, true); else if (up || down) w.stepVolume(up ? 0.2 : -0.2); else w.setVolume(w.vol || 0.6, false); w.toggleVolume?.(); if (!w.volPop?.mesh.parent) w.toggleVolume?.(); }
      else if (w?.kind === 'reader' && w.recite) { const v = mute ? 0 : Math.max(0, Math.min(1, (settings.reciteVolume ?? 1) + (up ? 0.25 : down ? -0.25 : 0.5))); saveSettings({ reciteVolume: v }); setElementVolume(w.recite.audio, v); this.toast('🔊 التلاوة ' + Math.round(v * 100) + '%', 1500); }
    }
    else if (has('كبر', 'كبّر', 'تكبير')) pointed()?.scaleBy?.(1.25);
    else if (has('صغر', 'صغّر', 'تصغير')) pointed()?.scaleBy?.(1 / 1.25);
    else if (has('ثبت', 'ثبّت', 'تثبيت')) { const w = pointed(); if (w) { w.headLock = !w.headLock; } }
    else if (has('أغلق الكل', 'اغلق الكل', 'إغلاق الكل')) this.windows.closeAll();
    else if (has('أغلق', 'اغلق', 'سكر')) { const w = pointed(); if (w) this.windows.close(w); }
    else if (has('قائمة', 'القائمه', 'الرئيسية')) this.toggleLauncher();
    else if (has('تمركز', 'منتصف', 'أمامي')) this.recenter();
    else if (has('ترتيب', 'رتب')) this.windows.arrange();
    else if (has('cplay', 'سي بلاي', 'كبلاي')) this.openCplay();
    else if (has('كيبورد', 'لوحة المفاتيح')) this.windows.open({ kind: 'keyboard' });
    else if (has('رف الكتب', 'كتبي', 'المكتبة الخاصة')) this.openShelf();
    else if (has('ملاكمة', 'الملاكمة')) this.openCoach('box');
    else if (has('جهاز المشي', 'المشي على الجهاز', 'تريدميل')) this.openCoach('tread');
    else if (has('تمارين العين', 'تمارين الرقبة', 'عيني', 'رقبتي')) this.openCoach('eyes');
    else if (has('تمرين', 'المدرب', 'رياضة', 'سكوات')) this.openCoach('train');
    else if (has('آية الكرسي')) { const r = this.openReader('quran'); setTimeout(() => this.windows.windows.find(x => x.kind === 'reader')?.goToKey?.('2:255'), 1200); }
    else if (has('سورة')) this.openSurah(after('سورة'));
    else if (has('المصحف', 'القرآن', 'القران', 'اقرأ', 'إقرأ')) { const w = this.windows.windows.find(x => x.kind === 'reader'); if (w && has('اقرأ', 'إقرأ', 'تلاوة')) w.togglePlay(); else this.openReader('quran'); }
    else if (has('الصفحة التالية', 'التالية', 'قلب الصفحة')) this.windows.windows.find(x => x.kind === 'reader')?.next();
    else if (has('الصفحة السابقة', 'السابقة')) this.windows.windows.find(x => x.kind === 'reader')?.prev();
    else if (has('مركز التحكم', 'التحكم')) this.control.open();
    else if (has('المكتبات', 'مكتبة البيئات', 'البيئات')) this.gallery.open('rooms');
    else if (has('المجسمات')) this.gallery.open('models');
    else if (has('الآيفون', 'الايفون', 'آيفون', 'ايفون')) this.iphone.pick();
    else if (has('ساعة', 'الساعه')) this.windows.open({ kind: 'panel', panel: 'clock' });
    else if (has('مكة', 'الحرم', 'الكعبة')) this.openMakkah?.();
    else if (has('بيئة', 'البيئه')) this.cycleEnvironment();
    else if (has('معايرة', 'المعايره')) this.calibration.open();
    else if (has('خروج', 'اخرج')) this.exit();
    else if (has('أوقف', 'اوقف', 'إيقاف', 'ايقاف', 'شغل', 'تشغيل')) {
      const v = this.windows.windows.filter(w => w.kind === 'video');
      v.forEach(w => (has('شغل', 'تشغيل') ? (w.userPaused = false, w.video.play().catch(() => {})) : (w.userPaused = true, w.video.pause())));
    }
    else { this.askAssistant(t); return; }   // not a known command: the assistant takes it
    this.toast('🎙 ' + t, 1800);
    this.log('أمر صوتي: ' + t);
  }


  // ---------- Frame loop ----------
  frame(now) {
    if (this.head.hasData) this.head.pose(settings.poseDelay, this.renderQ);
    else this.renderQ.setFromEuler(new THREE.Euler(-this.debugPitch, -this.debugYaw, 0, 'YXZ'));
    this.controls.applyLook(this.renderQ);
    // Cool mode: while your head is still, draw 30 times a second instead of 60 (the GPU does half
    // the work, the iPhone stays much cooler); any head movement goes straight back to full smoothness.
    if (this.lastQ && this.lastQ.angleTo(this.renderQ) > 0.004) this.movingAt = now;
    // Smart drawing: inside a virtual room (no live camera picture to keep moving) with your head still and
    // nothing animating, the picture is identical frame after frame — draw it 10 times a second instead of 30–60.
    // Any head turn, hand, playing video, dwell countdown, island or toast brings full speed back at once.
    if (settings.smartRender !== false && this.lastQ && this.envModeNow === 'immersive' && now - (this.movingAt || 0) > 400 && now - this.last < 100) {
      const g = this.interaction.pointers[2];
      const busy = (g.dwellObj && !g.dwellDone) || this.hands.slots?.some(s => s.active) || this.launcher.group.visible || this.control.group.visible || this.gallery.group.visible || this.lookUp.mesh.visible || this.notifier.mesh.visible
        || this.toastUI.mesh.visible || this.sports?.island?.mesh.visible || this.sports?.goal?.active
        || this.windows.windows.some(w => w.kind === 'web' || w.kind === 'game' || (w.video && !w.video.paused) || w.moving || w.busy?.());
      if (!busy) return;
    }
    // Idle: 45 s without moving your head, nothing playing or animating → 6 pictures a second (any movement: full speed)
    if (settings.idleSlow !== false && this.lastQ && now - (this.movingAt || 0) > 45000 && now - this.last < 160 && !this.hands.slots?.some(s => s.active)
      && !this.windows.windows.some(w => (w.video && !w.video.paused) || w.kind === 'web' || w.kind === 'game' || w.kind === 'coach' || w.moving)) return;
    if ((settings.cool || settings.lite) && this.lastQ) {
      if ((settings.coolMax || settings.lite || now - (this.movingAt || 0) > 250) && now - this.last < 28) return;
    }
    (this.lastQ ||= new THREE.Quaternion()).copy(this.renderQ);
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    if (!settings.cool || (!settings.coolMax && now - (this.movingAt || 0) < 250)) this.renderer.adapt(dt);   // half-rate still frames aren't slowness
    this.headForward.set(0, 0, -1).applyQuaternion(this.renderQ);
    const touching = this.controls.applyTouches(now);
    if (settings.handsEnabled && !touching) this.hands.update(this.camVideo, now, (x, y) => { const [sx, sy] = this.renderer.imageToStage(x, y); return this.renderer.stageToTan(sx, sy); });
    if (!settings.lite) this.slam.update(this.camVideo, now, this.renderQ);
    if (settings.viewMode === 'desktop' && settings.eyeTrack) this.gaze.update(this.camVideo, now);
    this.controls.update(dt);
    this.interaction.update(dt, now);
    this.windows.update(dt, now);
    this.extras.update(dt, now);
    this.toastUI.update(now, this.renderQ);
    this.sports?.update(now, this.renderQ);
    if (this.room) { if (!this.room.group.parent) this.room.attach(this.windows.root); this.room.update(now, this.renderQ); }
    if (this.launcher.group.visible) this.launcher.group.updateMatrixWorld();
    this.control.update(now); this.lookUp.update(); this.notifier.update(now); this.iphone.update(now);
    const ek = envKey(settings.environment);
    // animated places (space, gaming room, library dust) - a third of the frames in maximum cooling
    this.envDt = (this.envDt || 0) + dt;
    this.envN = (this.envN || 0) + 1;
    if (!settings.coolMax || this.envN % 3 === 0) { this.envs[ek]?.children[0]?.userData.tick?.(this.envDt, now / 1000); this.envDt = 0; }
    // A 360° picture surrounds you completely: hide the room/sky so nothing cuts into it.
    const around = this.windows.windows.some(w => w.sphere) || !!this.immersiveScene?.visible, cinema = !!this.windows.cinema;
    for (const k in this.envs) this.envs[k].visible = !around && !cinema && k === ek;
    // a room with its own lights (the photo-real ones) turns the general light down
    const dim = this.envs[ek]?.visible ? (this.envs[ek].userData.dim ?? 1) : 1;
    const room = this.envs[ek]?.visible && this.envs[ek].children[0];
    if (this.renderer.renderer.shadowMap.enabled === !!settings.lite) { this.renderer.renderer.shadowMap.enabled = !settings.lite; this.renderer.renderer.shadowMap.needsUpdate = true; }
    if (room && room.userData.shadowsDirty) { room.userData.shadowsDirty = false; this.renderer.renderer.shadowMap.needsUpdate = true; }
    if (dim !== this.lightDim) { this.renderer.renderer.shadowMap.needsUpdate = true; this.lightDim = dim; this.globalLights?.forEach(([l, i]) => { l.intensity = i * dim; }); this.renderer.scene.environmentIntensity = dim; }
    this.renderer.updateHandMask(settings.handsEnabled && this.hands.state === 'ready' ? this.hands.slots : null, now);
    this.envModeNow = cinema || this.immersiveScene?.visible ? 'immersive' : this.extras.portal.active() && !around ? 'portal' : isImmersive(ek) ? 'immersive' : ek;
    this.eyeBreak(now);
    this.renderer.render(this.renderQ, this.envModeNow);
  }
}

// Service worker for offline use and fast reloads.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update().catch(() => {})).catch(() => {});
  // A new version took over: reload once on the home page so it shows immediately (never inside the environment).
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || document.body.classList.contains('in-mr')) return;
    reloaded = true; location.reload();
  });
}

window.madar = new App();
window.__madarToast = m => window.madar.toast(m, 6000);
