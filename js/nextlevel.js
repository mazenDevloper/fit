// Madar «المستوى التالي»: free libraries, each loaded only when its feature is turned on.
//  1) لافتة اليوم       troika-three-text   crisp, correctly shaped Arabic floating in the room (time + what's next)
//  2) الشريط الزجاجي    three-mesh-ui       a visionOS-style glass dock with rounded blocks (labels by troika)
//  3) التوهّج الزجاجي   postprocessing      bloom + vignette on each eye's picture (glowing UI, cinema feel)
//  4) غرفة حقيقية      gaussian-splats-3d  a real place captured with a phone (.splat / .ply / .ksplat) around you
//  5) رمي النوافذ       Rapier              let go of a window while moving it: it glides, bumps the others aside, settles
//  6) الإيماءات         MediaPipe Gesture   👍 play/pause · ✌️ match mode · ✋ (held) the launcher · ✊ (held) recenter
//  7) أوامر بلا خادم   Transformers.js     Whisper on the device: Arabic voice commands with no speech service
import * as THREE from 'three';
import { settings, saveSettings } from './config.js';
import { blip, icon } from './ui.js';

const LIB = new URL('../lib/x/', import.meta.url).href;
const FONT = new URL('../assets/fonts/cairo-700.woff', import.meta.url).href;
const HUB = 'https://studio.c-p.workers.dev';
const arNum = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
const hhmm = t => arNum(new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }));
const once = f => { let p; return () => (p ||= f()); };

const troika = once(() => import(LIB + 'troika.js'));
const meshui = once(() => import(LIB + 'meshui.js'));
const postfx = once(() => import(LIB + 'postfx.js'));
const splats = once(() => import(LIB + 'splats.js'));
const rapier = once(async () => { const m = await import(LIB + 'rapier.js'); const R = m.default || m; await R.init(); return R; });

async function text(str, size = 0.06, color = 0xffffff, extra = {}) {
  const { Text } = await troika();
  const t = new Text();
  Object.assign(t, { text: str, font: FONT, fontSize: size, color, anchorX: 'center', anchorY: 'middle', direction: 'rtl', textAlign: 'center',
    outlineWidth: size * 0.04, outlineColor: 0x000000, outlineOpacity: 0.35, depthOffset: -1 }, extra);
  // a base material that ignores depth: the text floats over rooms, floors and windows
  t.material = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false });
  t.renderOrder = 920;
  t.sync();
  return t;
}

// Madar's own line icons (ui.js) on a small plane: no emoji font needed, works offline
function iconPlane(name, size) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d'); ctx.lineWidth = 9; ctx.lineCap = ctx.lineJoin = 'round';
  icon(ctx, name, 64, 64, 96, '#ffffff');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false }));
  m.renderOrder = 925; m.userData.nxIcon = true; return m;
}

export class NextLevel {
  constructor(app) {
    this.app = app; this.targets = [];
    this.sign = null; this.dock = null; this.splat = null; this.phys = null; this.gest = null;
    this.outs = [];
    // what was on last time comes back by itself
    setTimeout(() => {
      if (settings.nxSign) this.toggleSign(true);
      if (settings.nxDock) this.toggleDock(true);
      if (settings.nxGlow) this.toggleGlow(true);
      if (settings.nxPhysics) this.togglePhysics(true);
    }, 1500);
  }
  get W() { return this.app.windows; }
  front(dist, y, rotY = 0) {
    const W = this.W, yaw = W.forwardYaw() + rotY, h = W.headLocal();
    return { pos: new THREE.Vector3(h.x - Math.sin(yaw) * dist, h.y + y, h.z - Math.cos(yaw) * dist), look: new THREE.Vector3(h.x, h.y + y, h.z) };
  }

  // ================================================================ 1) the sign of the day
  async toggleSign(on = !this.sign) {
    saveSettings({ nxSign: on });
    if (!on) { if (this.sign) { this.sign.group.removeFromParent(); this.sign.items.forEach(t => t.dispose()); } this.sign = null; return; }
    if (this.sign) return;
    const g = new THREE.Group();
    const clock = await text('', 0.11, 0xffffff, { letterSpacing: 0.02 });
    const next = await text('...', 0.045, 0xbfe0ff, { maxWidth: 1.4 });
    next.position.y = -0.1;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.32), new THREE.MeshBasicMaterial({ color: 0x0b1020, transparent: true, opacity: 0.38, depthTest: false }));
    glow.position.set(0, -0.04, -0.01); glow.renderOrder = 910;
    g.add(glow, clock, next);
    this.W.root.add(g);
    const { pos, look } = this.front(2.3, 0.42); g.position.copy(pos); g.lookAt(look);
    this.sign = { group: g, clock, next, items: [clock, next], at: 0 };
    this.refreshSign(true);
    this.app.toast('🪧 لافتة اليوم — الوقت وما بعده', 1800);
  }
  async refreshSign(force) {
    const s = this.sign; if (!s) return;
    const now = Date.now();
    s.clock.text = hhmm(now); s.clock.sync();
    if (!force && now - s.at < 60000) return;
    s.at = now;
    try {
      const d = await (await fetch(HUB + '/hub/today', { cache: 'no-store' })).json();
      const it = (d.items || []).find(i => i.live) || (d.items || []).find(i => i.at > now);
      s.next.text = it ? (it.live ? 'مباشر · ' : '') + it.title + (it.sub ? ' · ' + it.sub : '') + (it.live ? '' : ' — ' + hhmm(it.at)) : 'لا شيء بعد اليوم';
    } catch { s.next.text = 'بلا اتصال'; }
    s.next.sync();
  }

  // ================================================================ 2) the glass dock
  async toggleDock(on = !this.dock) {
    saveSettings({ nxDock: on });
    if (!on) { if (this.dock) this.dock.root.removeFromParent(); this.dock = null; this.targets = []; this.app.interaction?.setTargets(); return; }
    if (this.dock) return;
    const UI = (await meshui()).default;
    const items = [
      ['ball', 'المباراة', () => this.app.plus?.matchMode()],
      ['sun', 'استلقاء', () => this.app.plus?.toggleLying()],
      ['clock', 'المساحة', () => this.app.plus?.nextSpace()],
      ['star', 'التوهّج', () => this.toggleGlow()],
      ['cube', 'الرمي', () => this.togglePhysics()],
      ['hand', 'الإيماءات', () => this.toggleGestures()],
      ['mic', 'أمر', () => this.whisperListen()],
    ];
    const W = 0.2, H = 0.2, root = new UI.Block({ width: items.length * (W + 0.025) + 0.05, height: H + 0.06, padding: 0.03, contentDirection: 'row', justifyContent: 'center', alignItems: 'center',
      backgroundColor: new THREE.Color(0x1a2238), backgroundOpacity: 0.55, borderRadius: 0.13, borderWidth: 0.004, borderColor: new THREE.Color(0xffffff), borderOpacity: 0.18 });
    const buttons = [];
    // right to left: the first one on the right
    for (const [name, label, act] of [...items].reverse()) {
      const b = new UI.Block({ width: W, height: H, margin: 0.0125, borderRadius: 0.07, backgroundColor: new THREE.Color(0xffffff), backgroundOpacity: 0.08, justifyContent: 'center', alignItems: 'center' });
      root.add(b);
      const ic = iconPlane(name, 0.085); ic.position.set(0, 0.03, 0.01);
      const lb = await text(label, 0.03, 0xdbe6ff); lb.position.set(0, -0.06, 0.01);
      b.add(ic, lb);
      // the hit plane Madar's pointer, gaze and hands already understand
      const hit = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.z = 0.012; hit.renderOrder = 930;
      hit.userData.interact = { type: 'button', click: () => { blip('tap', settings.sounds); act(); return true; },
        hover: on => { b.set({ backgroundOpacity: on ? 0.26 : 0.08 }); } };
      b.add(hit); buttons.push(hit);
    }
    root.traverse(o => { if (o.material && !o.userData.interact) { o.renderOrder = Math.max(o.renderOrder, 905); } });
    this.W.root.add(root);
    const { pos, look } = this.front(1.5, -0.36); root.position.copy(pos); root.lookAt(look); root.scale.setScalar(0.62);
    this.dock = { root, UI };
    this.targets = buttons; this.app.interaction?.setTargets();
    this.app.toast('🧊 الشريط الزجاجي أسفل نظرك', 1800);
  }

  // ================================================================ 3) glow (bloom + vignette)
  async toggleGlow(on = !this.app.renderer.post) {
    saveSettings({ nxGlow: on });
    const R = this.app.renderer;
    if (!on) { R.post = null; this.outs.forEach(t => t.dispose()); this.outs = []; this.pass?.dispose?.(); this.pass = null; return; }
    const P = await postfx();
    const bloom = new P.BloomEffect({ intensity: 1.15, luminanceThreshold: 0.72, luminanceSmoothing: 0.22, mipmapBlur: true, radius: 0.7 });
    const vig = new P.VignetteEffect({ offset: 0.32, darkness: 0.42 });
    const pass = new P.EffectPass(R.eyes[0], bloom, vig);
    pass.initialize(R.renderer, true, THREE.UnsignedByteType);
    this.pass = pass;
    const target = (w, h, depth = false) => { const t = new THREE.WebGLRenderTarget(w, h, { depthBuffer: depth }); t.texture.colorSpace = THREE.SRGBColorSpace; return t; };
    R.post = {
      // one eye: its picture in, the glowing picture out (the lens distortion reads that)
      eye: (r, rt, i) => {
        const w = rt.width, h = rt.height;
        if (!this.outs[i] || this.outs[i].width !== w) { this.outs[i]?.dispose(); this.outs[i] = target(w, h); pass.setSize(w, h); }
        pass.renderToScreen = false; pass.render(r, rt, this.outs[i], 0.016);
        return this.outs[i];
      },
      // one picture (desktop / phone view): the same path as an eye, then onto the screen
      mono: (w, h) => {
        if (!this.outs[2] || this.outs[2].width !== w || this.outs[2].height !== h) { this.outs[2]?.dispose(); this.outs[2] = target(w, h, true); }
        return this.outs[2];
      },
      monoOut: (r, rt) => { pass.setSize(rt.width, rt.height); pass.renderToScreen = true; pass.render(r, rt, null, 0.016); },
    };
    this.app.toast('✨ التوهّج الزجاجي', 1500);
  }

  // ================================================================ 4) a real place (Gaussian splats)
  async openSplat(url, format) {
    this.closeSplat();
    const S = await splats();
    this.app.toast('🌐 تحميل الغرفة الحقيقية…', 4000);
    const viewer = new S.DropInViewer({ sceneRevealMode: S.SceneRevealMode.Instant, gpuAcceleratedSort: false, sharedMemoryForWorkers: false, enableSIMDInSort: false, dynamicScene: false, sphericalHarmonicsDegree: 0 });
    const opts = { showLoadingUI: false, splatAlphaRemovalThreshold: 5, rotation: [1, 0, 0, 0], position: [0, -1.4, 0], scale: [1, 1, 1] };
    if (format != null) opts.format = format;
    await viewer.addSplatScene(url, opts);
    const sc = new THREE.Scene(); sc.add(viewer);
    this.app.renderer.extraScene = sc;
    this.splat = viewer;
    this.app.immersiveScene = viewer;
    // the first sort needs the renderer's camera, which a drop-in viewer only gets on its first frame
    for (const ms of [300, 1200, 3000]) setTimeout(() => { try { viewer.viewer.runSplatSort(true, true); } catch {} }, ms);   // the room / sky / camera picture step aside: you are inside the captured place
    this.app.toast('🌐 أنت داخل الغرفة الحقيقية — من القائمة لإغلاقها', 3000);
  }
  closeSplat() { if (!this.splat) return; if (this.app.immersiveScene === this.splat) this.app.immersiveScene = null; this.app.renderer.extraScene = null; this.splat.removeFromParent(); try { this.splat.dispose(); } catch {} this.splat = null; }
  pickSplat() {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.splat,.ply,.ksplat,.spz';
    i.onchange = async () => {
      const f = i.files?.[0]; if (!f) return;
      const S = await splats(), ext = f.name.split('.').pop().toLowerCase();
      const fmt = ext === 'ply' ? S.SceneFormat.Ply : ext === 'ksplat' ? S.SceneFormat.KSplat : ext === 'spz' ? S.SceneFormat.Spz : S.SceneFormat.Splat;
      this.openSplat(URL.createObjectURL(f), fmt);
    };
    i.click();
  }
  sampleSplat() { return this.openSplat('https://huggingface.co/cakewalk/splat-data/resolve/main/train.splat'); }

  // ================================================================ 5) throwing windows (Rapier)
  async togglePhysics(on = !this.phys) {
    saveSettings({ nxPhysics: on });
    if (!on) { this.phys?.world.free(); this.phys = null; return; }
    if (this.phys) return;
    const R = await rapier();
    const world = new R.World({ x: 0, y: 0, z: 0 });   // floating in space: no gravity
    this.phys = { R, world, flying: new Map(), last: new Map(), solid: new Map() };
    this.app.toast('🫳 اترك النافذة وهي تتحرك لترميها', 2200);
  }
  // a window becomes a moving body: it glides with this speed, slows down, bounces off the others
  throwWindow(w, v) {
    const P = this.phys; if (!P || P.flying.has(w)) return;
    const { R, world } = P, p = w.group.position;
    const s = P.solid.get(w); if (s) { world.removeRigidBody(s.b); P.solid.delete(w); }
    const b = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z).setLinearDamping(2.2).setAngularDamping(6).lockRotations());
    const half = 0.5 * w.group.scale.x;
    world.createCollider(R.ColliderDesc.cuboid(half, half / (w.aspect || 1.6), 0.03).setRestitution(0.6), b);
    b.setLinvel({ x: v.x, y: v.y, z: v.z }, true);
    P.flying.set(w, b); blip('open', settings.sounds);
  }
  physicsStep(dt) {
    const P = this.phys; if (!P) return;
    const { R, world } = P, W = this.W;
    const dragging = new Set(this.app.interaction.pointers.map(p => p.drag?.win).filter(Boolean));
    // every window is a box the flying ones bump into
    for (const w of W.windows) {
      if (w.sphere || P.flying.has(w)) continue;
      let s = P.solid.get(w);
      const half = new THREE.Vector3(0.5 * w.group.scale.x, 0.5 * w.group.scale.x / (w.aspect || 1.6), 0.03);
      if (!s) { const b = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased()); world.createCollider(R.ColliderDesc.cuboid(half.x, half.y, half.z), b); s = { b }; P.solid.set(w, s); }
      s.b.setNextKinematicTranslation(w.group.position); s.b.setNextKinematicRotation(w.group.quaternion);
    }
    for (const [w, s] of P.solid) if (!W.windows.includes(w)) { world.removeRigidBody(s.b); P.solid.delete(w); }
    // the speed of the window while it is held; let go fast enough → it flies
    for (const w of W.windows) {
      const prev = P.last.get(w), p = w.group.position.clone();
      if (dragging.has(w)) { if (prev) prev.v = p.clone().sub(prev.p).divideScalar(Math.max(dt, 1e-3)); P.last.set(w, { p, v: prev?.v || new THREE.Vector3(), held: true }); continue; }
      if (prev?.held && prev.v.length() > 0.6 && !P.flying.has(w)) this.throwWindow(w, prev.v);
      P.last.set(w, { p, v: new THREE.Vector3(), held: false });
    }
    world.timestep = Math.min(dt, 1 / 30); world.step();
    const h = W.headLocal();
    for (const [w, b] of P.flying) {
      if (!W.windows.includes(w)) { world.removeRigidBody(b); P.flying.delete(w); continue; }
      const t = b.translation(), v = new THREE.Vector3(t.x, t.y, t.z);
      // stay within reach: between 0.8 m and 5 m from your head, bouncing off that shell
      const d = v.clone().sub(h), len = d.length();
      if (len > 5 || len < 0.8) { d.setLength(THREE.MathUtils.clamp(len, 0.8, 5)); v.copy(h).add(d); b.setTranslation(v, true); const lv = b.linvel(); b.setLinvel({ x: -lv.x * 0.5, y: -lv.y * 0.5, z: -lv.z * 0.5 }, true); }
      w.group.position.copy(v); w.group.lookAt(h.x, v.y, h.z);
      const lv = b.linvel();
      if (Math.hypot(lv.x, lv.y, lv.z) < 0.05) { world.removeRigidBody(b); P.flying.delete(w); W.changed?.(); }
    }
  }

  // ================================================================ 6) hand gestures (MediaPipe Gesture Recognizer)
  async toggleGestures(on = !this.gest) {
    if (!on) { this.gest?.rec?.close?.(); this.gest = null; this.app.toast('الإيماءات متوقفة', 1200); return; }
    this.app.toast('✋ تحميل نموذج الإيماءات…', 3000);
    try {
      const V = await import('../lib/mediapipe/vision_bundle.mjs');
      const fs = await V.FilesetResolver.forVisionTasks(new URL('../lib/mediapipe/wasm', import.meta.url).href);
      const rec = await V.GestureRecognizer.createFromOptions(fs, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task', delegate: 'GPU' },
        runningMode: 'VIDEO', numHands: 1,
      });
      this.gest = { rec, at: 0, name: '', since: 0, fired: '' };
      this.app.toast('✋ الإيماءات: 👍 تشغيل/إيقاف · ✌️ المباراة · ✋ القائمة · ✊ التمركز', 4000);
    } catch (e) { this.app.toast('تعذّر تحميل الإيماءات', 2500); this.gest = null; }
  }
  gestureStep(now) {
    const G = this.gest, v = this.app.camVideo; if (!G || !v || v.readyState < 2 || now - G.at < 160) return;
    G.at = now;
    let name = '';
    try { const r = G.rec.recognizeForVideo(v, now); const c = r.gestures?.[0]?.[0]; if (c && c.score > 0.65) name = c.categoryName; } catch { return; }
    if (name !== G.name) { G.name = name; G.since = now; G.fired = ''; return; }
    if (!name || name === 'None' || G.fired === name) return;
    const held = now - G.since, ex = this.app.extras, a = this.app;
    const act = {
      Thumb_Up: [350, () => { const w = ex?.mediaWindows?.()[0]; if (w) ex.togglePlay(w); a.toast('👍', 600); }],
      Victory: [500, () => a.plus?.matchMode()],
      Open_Palm: [900, () => a.toggleLauncher()],
      Closed_Fist: [1100, () => a.recenter()],
      Pointing_Up: [700, () => this.whisperListen()],
    }[name];
    if (act && held > act[0]) { G.fired = name; blip('tap', settings.sounds); act[1](); }
  }

  // ================================================================ 7) voice commands on the device (Whisper)
  async whisperListen() {
    const a = this.app;
    if (this.listening) return;
    this.listening = true;
    try {
      if (!this.asr) {
        a.toast('🎙 تحميل Whisper على جهازك (مرة واحدة ~٤٠ ميغابايت)…', 6000);
        const T = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5/dist/transformers.min.js');
        T.env.allowLocalModels = false;
        this.asr = await T.pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny', { dtype: 'q8', device: navigator.gpu ? 'webgpu' : 'wasm' });
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      const ac = new AudioContext({ sampleRate: 16000 }), src = ac.createMediaStreamSource(stream);
      const proc = ac.createScriptProcessor(4096, 1, 1), chunks = [];
      proc.onaudioprocess = e => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      src.connect(proc); proc.connect(ac.destination);
      blip('open', settings.sounds); a.toast('🎙 تكلّم الآن (٤ ثوانٍ)…', 4000);
      await new Promise(r => setTimeout(r, 4000));
      proc.disconnect(); src.disconnect(); stream.getTracks().forEach(t => t.stop()); await ac.close();
      const pcm = new Float32Array(chunks.reduce((n, c) => n + c.length, 0)); let o = 0; for (const c of chunks) { pcm.set(c, o); o += c.length; }
      a.toast('⏳ أفهم…', 2000);
      const out = await this.asr(pcm, { language: 'arabic', task: 'transcribe' });
      const t = (out?.text || '').trim();
      if (t) a.voiceCommand(t); else a.toast('لم أسمع شيئاً', 1500);
    } catch (e) { a.toast('تعذّر الأمر الصوتي: ' + (e?.message || e), 3000); }
    this.listening = false;
  }

  // ================================================================ per frame
  update(dt, now) {
    if (this.sign && now - (this.signAt || 0) > 1000) { this.signAt = now; this.refreshSign(); }
    if (this.dock) {
      this.dock.UI.update();
      // the dock floats over everything (never cut by a room's floor or a window behind it)
      if ((this.dock.n = (this.dock.n || 0) + 1) % 30 === 1) this.dock.root.traverse(o => { if (o.material && !o.userData.interact && !o.isTroikaText && !o.userData.nxIcon) { o.material.depthTest = false; o.renderOrder = 900; } });
    }
    if (this.phys) this.physicsStep(dt);
    if (this.gest) this.gestureStep(now);
  }
}
