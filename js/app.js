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
import { listItems, importFiles, deleteItem, formatSize } from './db.js';
import { audioContext, blip, setMaxAniso } from './ui.js';

const $ = s => document.querySelector(s);
const FIRST_RUN = 'madar.firstRun.v1';

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

// Immersive environment: night-sky dome with stars and a soft floor ring.
function makeEnvironment() {
  const g = new THREE.Group();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(80, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP;
      void main(){ float h = vP.y; vec3 top = vec3(0.012,0.02,0.06); vec3 mid = vec3(0.05,0.06,0.13); vec3 low = vec3(0.10,0.07,0.12);
      vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.6)) : mix(mid, low, pow(-h, 0.5)); gl_FragColor = vec4(c,1.0); }`,
  }));
  g.add(sky);
  const n = 1800, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random(), v = Math.random() * 0.9 + 0.1;
    const th = u * Math.PI * 2, ph = Math.acos(v);
    pos.set([Math.sin(ph) * Math.cos(th) * 70, Math.cos(ph) * 70, Math.sin(ph) * Math.sin(th) * 70], i * 3);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfe2ff, size: 0.18, sizeAttenuation: true, transparent: true, opacity: 0.85, depthWrite: false })));
  const floor = new THREE.Mesh(new THREE.RingGeometry(0.3, 6, 64, 6), new THREE.MeshBasicMaterial({ color: 0x8fb4ff, transparent: true, opacity: 0.05, wireframe: true, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -1.55;
  g.add(floor);
  g.visible = false;
  return g;
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
    this.toastUI = new Toast();
    this.renderer.scene.add(this.launcher.group, this.calibration.group);
    this.renderer.overlay.add(this.toastUI.mesh);
    this.interaction = new Interaction(this);
    this.slam = new Slam(this);
    this.controls = new Controls(this);
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
    this.env = makeEnvironment();
    scene.add(this.env);
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
  openCplay() { this.windows.open({ kind: 'web', url: 'https://cplay2.netlify.app/media', title: 'cplay2' }); }
  recenter() { this.head.recenter(); this.toast('تمت إعادة التمركز'); blip('open', settings.sounds); }
  cycleEnvironment() {
    const order = ['passthrough', 'dim', 'immersive'];
    saveSettings({ environment: order[(order.indexOf(settings.environment) + 1) % order.length] });
    this.toast({ passthrough: 'البيئة: الواقع الحقيقي', dim: 'البيئة: واقع خافت', immersive: 'البيئة: غامرة' }[settings.environment]);
  }
  applySettings() { this.renderer.applySettings(); this.renderer.resize(); }
  persistLayout() { if (this.windows && this.active) saveLayout({ windows: this.windows.serialize() }); }

  // ---------- Home screen ----------
  bindHome() {
    $('#enter').addEventListener('click', () => this.enter());
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
    st.addEventListener('mousedown', e => { if (this.controls.direct) return; down = true; sx = e.clientX; sy = e.clientY; moved = false; });
    window.addEventListener('mousemove', e => {
      if (!down || this.head.hasData) return;
      this.debugYaw += e.movementX * 0.004; this.debugPitch = THREE.MathUtils.clamp(this.debugPitch + e.movementY * 0.004, -1.2, 1.2);
      if (Math.hypot(e.clientX - sx, e.clientY - sy) > 6) moved = true;
    });
    window.addEventListener('mouseup', () => { if (down && !moved) this.onRealTap(); down = false; });
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
    this.controls.update(dt);
    this.interaction.update(dt, now);
    this.windows.update(dt, now);
    this.toastUI.update(now, this.renderQ);
    if (this.launcher.group.visible) this.launcher.group.updateMatrixWorld();
    this.env.visible = settings.environment === 'immersive';
    this.renderer.updateHandMask(settings.handsEnabled && this.hands.state === 'ready' ? this.hands.slots : null, now);
    this.renderer.render(this.renderQ, settings.environment);
  }
}

// Service worker for offline use and fast reloads.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

window.madar = new App();
