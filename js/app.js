// Madar — mixed reality environment for iPhone + SBS headset. Entry point: home screen + MR session.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { settings, saveSettings, applyPreset, resetSettings, VIEWER_PRESETS, loadLayout, saveLayout, loadLinks, saveLinks } from './config.js';
import { StageOrientation, HeadTracker } from './orient.js';
import { StereoRenderer } from './render.js';
import { HandTracker } from './hands.js';
import { Interaction } from './interaction.js';
import { WindowManager } from './windows.js';
import { Launcher, Calibration, Toast } from './panels.js';
import { Slam } from './slam.js';
import { Controls } from './controls.js';
import { GazeTracker } from './gaze.js';
import { LensAdjust } from './lens.js';
import { ScreenHost, ScreenViewer, qrSvg, AGENT_DOWNLOAD } from './mirror.js';
import { ENVS, ENV_ORDER, envKey, isImmersive, makeEnvironments } from './envs.js';
import { listItems, importFiles, deleteItem, formatSize } from './db.js';
import { audioContext, blip, setMaxAniso } from './ui.js';

const $ = s => document.querySelector(s);
const FIRST_RUN = 'madar.firstRun.v1';
const ANDROID_APK = 'https://github.com/mazenDevloper/fit/releases/download/android-latest/Madar.apk';

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
    this.head = new HeadTracker(this.orientation);
    this.renderer = new StereoRenderer(this.stage, $('#gl'), this.orientation);
    setMaxAniso(Math.min(8, this.renderer.maxAniso));
    this.setupScene();
    this.windows = new WindowManager(this);
    this.launcher = new Launcher(this);
    this.calibration = new Calibration(this);
    this.lensAdjust = new LensAdjust(this);
    this.toastUI = new Toast();
    this.renderer.scene.add(this.launcher.group, this.calibration.group);
    this.renderer.overlay.add(this.toastUI.mesh);
    this.interaction = new Interaction(this);
    this.slam = new Slam(this);
    this.controls = new Controls(this);
    this.gaze = new GazeTracker(this);
    this.gaze.onBlinkClick = () => { if (this.interaction.realTap()) this.toast('نقر بالعين', 800); };
    this.renderer.afterRender = () => { for (const w of this.windows.windows) w.placeCss?.(); };
    this.interaction.setTargets();
    this.debugYaw = 0; this.debugPitch = 0;
    this.bindHome();
    this.bindStageInput();
    this.checkCrash();
    this.renderLog();
    window.addEventListener('error', e => { this.log('خطأ: ' + (e.message || e.error)); if (this.active) this.toast('حدث خطأ: ' + String(e.message || '').slice(0, 60)); });
    window.addEventListener('unhandledrejection', e => { this.log('خطأ: ' + String(e.reason && e.reason.message || e.reason).slice(0, 120)); });
    this.hands.onChange(() => this.renderStatus());
    this.hands.load();
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
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a4a, 1.1));
    const d = new THREE.DirectionalLight(0xffffff, 1.6); d.position.set(1, 2, 1.5); scene.add(d);
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

  systemTargets() { return [...(this.launcher?.targets || []), ...(this.calibration?.targets || [])]; }
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
  async connectMirror(code, attempt = 0) {
    saveSettings({ mirrorCode: code });
    if (!this.active) return;
    // Your own code on this computer = show this computer's screen; any other code = that device's screen.
    if (this.host?.stream && this.host.code === code) { this.showLocalScreen(); return; }
    const again = !!this.mirrorWin;          // reconnecting: keep the window and its last picture
    if (!again) this.toast('جاري الاتصال باللابتوب ' + code + '…', 4000);
    this.log('شاشة اللابتوب: اتصال ' + code + (again ? ' (إعادة)' : ''));
    this.viewer = this.viewer || new ScreenViewer();
    try {
      const stream = await this.viewer.connect(code, {
        onEnd: why => this.mirrorLost(code, why),
        onLinks: n => { if (n) { this.toast('أُضيفت ' + n + ' روابط من اللابتوب'); this.renderLinks(); } },
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
        this.mirrorWin = this.windows.open({ kind: 'video', stream, name: 'شاشة اللابتوب', remote: this.viewer });
        this.toast('ظهرت شاشة اللابتوب أمامك', 2500);
      }
      if (this.viewer.caps) this.mirrorWin.setControl(this.viewer.caps);
      // A picture that stops arriving (frozen) reconnects by itself.
      // (A still screen also sends no new frames, so only reconnect when the link itself is unhealthy.)
      this.mirrorWin.onStall = () => { if (!this.viewer.healthy()) { this.log('شاشة اللابتوب: الصورة متوقفة'); this.mirrorLost(code, 'stall'); } };
      this.log('شاشة اللابتوب: متصلة');
    } catch (e) {
      this.log('شاشة اللابتوب: ' + (e.message || e));
      // The laptop may not be sharing yet (or the network is back soon): keep trying for about a minute.
      if (attempt < 7 && this.active) {
        if (!again) this.toast('بانتظار مشاركة اللابتوب ' + code + '… (' + (attempt + 1) + '/8)', 3000);
        clearTimeout(this.mirrorTimer);
        this.mirrorTimer = setTimeout(() => this.connectMirror(code, attempt + 1), again ? 4000 : 8000);
      } else {
        this.toast(again ? 'توقفت مشاركة شاشة اللابتوب' : (e.message || 'تعذّر الاتصال'), 5000);
        if (this.mirrorWin) this.windows.close(this.mirrorWin);
        this.mirrorWin = null;
      }
    }
  }
  // The live screen dropped (laptop stopped, network blip or frozen picture): reconnect quietly with the same code.
  mirrorLost(code, why) {
    if (!this.active || !this.mirrorWin) return;
    if (this.mirrorWin && !this.windows.windows.includes(this.mirrorWin)) { this.mirrorWin = null; return; }   // window was closed by the user
    this.log('شاشة اللابتوب: انقطاع (' + why + ') — إعادة اتصال');
    this.toast('انقطع البث — جاري إعادة الاتصال…', 2500);
    clearTimeout(this.mirrorTimer);
    this.mirrorTimer = setTimeout(() => this.connectMirror(code, 0), 800);
  }
  bindMirror() {
    // Coming back to Madar (or the screen waking): start paused videos again.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(() => this.windows?.resumeMedia(), 300); });
    const fromHash = (location.hash.match(/^#m(\d{6})$/) || [])[1];
    if (fromHash) { saveSettings({ mirrorCode: fromHash }); history.replaceState(null, '', location.pathname); }
    if (settings.mirrorCode) { $('#mirInput').value = settings.mirrorCode; $('#mirMsg').textContent = 'سيظهر اللابتوب ' + settings.mirrorCode + ' عند الدخول'; }
    $('#mirJoin').addEventListener('submit', e => {
      e.preventDefault();
      const c = $('#mirInput').value.replace(/\D/g, '');
      if (c.length !== 6) { $('#mirMsg').textContent = 'الرمز 6 أرقام'; return; }
      saveSettings({ mirrorCode: c }); $('#mirMsg').textContent = 'حُفظ. ستظهر شاشة اللابتوب عند الدخول'; $('#mirInput').blur();
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
  openCplay() { this.windows.open({ kind: 'web', url: 'https://cplay3.netlify.app/media', title: 'cplay3' }); }
  recenter() { this.head.recenter(); this.toast('تمت إعادة التمركز'); blip('open', settings.sounds); }
  cycleEnvironment() {
    const k = ENV_ORDER[(ENV_ORDER.indexOf(envKey(settings.environment)) + 1) % ENV_ORDER.length];
    saveSettings({ environment: k });
    this.toast('البيئة: ' + ENVS[k].label);
    this.renderEnvChoices?.();
  }
  applySettings() { this.renderer.applySettings(); this.renderer.resize(); }
  persistLayout() { if (this.windows && this.active) saveLayout({ windows: this.windows.serialize() }); }

  // ---------- Home screen ----------
  bindHome() {
    $('#enter').addEventListener('click', () => this.enter());
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
    document.querySelectorAll('input[type=checkbox][data-key]').forEach(inp => inp.addEventListener('change', () => { saveSettings({ [inp.dataset.key]: inp.checked }); }));
    $('#resetSettings').addEventListener('click', () => { resetSettings(); this.renderSettings(); this.applySettings(); });
    $('#resetLayout').addEventListener('click', () => { saveLayout({ windows: [] }); try { localStorage.removeItem(FIRST_RUN); } catch {} $('#resetLayout').textContent = 'سيظهر الترتيب الافتراضي عند الدخول'; });
    this.renderEnvChoices = () => {
      const box = $('#envs'), cur = envKey(settings.environment);
      const sw = { passthrough: 'linear-gradient(135deg,#8a8f99,#c9ccd2)', dim: 'linear-gradient(135deg,#2a2d35,#4b4f5a)', night: 'radial-gradient(circle at 30% 30%,#2a3a70,#070b1a)', cinema: 'radial-gradient(circle at 50% 35%,#2a3550,#0b0910 70%)', sunset: 'linear-gradient(180deg,#3a2f6a,#ff8c52 75%,#5a3030)' };
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
    this.renderLibrary(); this.renderLinks(); this.renderSettings();
  }

  async renderLibrary() {
    const ul = $('#libList'); ul.innerHTML = '';
    let items = [];
    try { items = await listItems(); } catch {}
    $('#libEmpty').hidden = items.length > 0;
    for (const it of items) {
      const li = document.createElement('li');
      const kind = { video: 'فيديو', image: 'صورة', model: 'مجسم ' + (it.format || '').toUpperCase() }[it.type];
      li.innerHTML = `<span class="badge ${it.type}"></span><div class="meta"><b></b><small>${kind} · ${formatSize(it.size)}${it.files.length > 1 ? ' · ' + it.files.length + ' ملفات' : ''}</small></div><button class="del" type="button" aria-label="حذف">حذف</button>`;
      li.querySelector('b').textContent = it.name;
      li.querySelector('.del').addEventListener('click', async () => { await deleteItem(it.id); this.renderLibrary(); });
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
    this.media.unlock();
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
    document.body.classList.add('in-mr');
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
    if (settings.walk) setTimeout(() => this.slam.start(), 1500);
    this.head.recenter();
    this.restoreScene();
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
    this.launcher.close(); this.calibration.close();
    this.slam.stop();
    const s = this.camVideo.srcObject; if (s) s.getTracks().forEach(t => t.stop());
    this.camVideo.srcObject = null;
    this.renderer.setVideo(null);
    this.stopVoice();
    try { this.wakeLock?.release(); } catch {}
    this.stage.hidden = true;
    document.body.classList.remove('in-mr');
    this.renderLibrary();
    this.renderLog();
  }

  async requestMotion() {
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
    if (!navigator.mediaDevices?.getUserMedia) return false;
    const base = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60, max: 60 } };
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
    if (!this.interaction.realTap()) this.toggleLauncher();
  }

  // ---------- Voice commands (optional) ----------
  startVoice() {
    if (!settings.voice) return;
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
  voiceCommand(t) {
    const has = (...w) => w.some(x => t.includes(x));
    if (has('قائمة', 'القائمه', 'الرئيسية')) this.toggleLauncher();
    else if (has('تمركز', 'منتصف')) this.recenter();
    else if (has('ترتيب', 'رتب')) this.windows.arrange();
    else if (has('أغلق الكل', 'اغلق الكل', 'إغلاق الكل')) this.windows.closeAll();
    else if (has('ساعة', 'الساعه')) this.windows.open({ kind: 'panel', panel: 'clock' });
    else if (has('بيئة', 'البيئه')) this.cycleEnvironment();
    else if (has('معايرة', 'المعايره')) this.calibration.open();
    else if (has('خروج', 'اخرج')) this.exit();
    else if (has('أوقف', 'اوقف', 'إيقاف', 'ايقاف', 'شغل', 'تشغيل')) {
      const v = this.windows.windows.filter(w => w.kind === 'video');
      v.forEach(w => (has('شغل', 'تشغيل') ? w.video.play().catch(() => {}) : w.video.pause()));
    }
    else return;
    this.toast('🎙 ' + t.trim(), 1800);
  }

  // ---------- Frame loop ----------
  frame(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    this.renderer.adapt(dt);
    if (this.head.hasData) this.head.pose(settings.poseDelay, this.renderQ);
    else this.renderQ.setFromEuler(new THREE.Euler(-this.debugPitch, -this.debugYaw, 0, 'YXZ'));
    this.controls.applyLook(this.renderQ);
    this.headForward.set(0, 0, -1).applyQuaternion(this.renderQ);
    const touching = this.controls.applyTouches(now);
    if (settings.handsEnabled && !touching) this.hands.update(this.camVideo, now, (x, y) => { const [sx, sy] = this.renderer.imageToStage(x, y); return this.renderer.stageToTan(sx, sy); });
    this.slam.update(this.camVideo, now, this.renderQ);
    if (settings.viewMode === 'desktop' && settings.eyeTrack) this.gaze.update(this.camVideo, now);
    this.controls.update(dt);
    this.interaction.update(dt, now);
    this.windows.update(dt, now);
    this.toastUI.update(now, this.renderQ);
    if (this.launcher.group.visible) this.launcher.group.updateMatrixWorld();
    const ek = envKey(settings.environment);
    for (const k in this.envs) this.envs[k].visible = k === ek;
    this.renderer.updateHandMask(settings.handsEnabled && this.hands.state === 'ready' ? this.hands.slots : null, now);
    this.renderer.render(this.renderQ, isImmersive(ek) ? 'immersive' : ek);
  }
}

// Service worker for offline use and fast reloads.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

window.madar = new App();
