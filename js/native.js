// Madar inside its iPhone app (window.MadarIOS from the app's bootstrap): the app does what Safari can't —
// ARKit gives the head's real position and rotation (6DoF) and the room's planes, the camera picture is drawn
// natively under this page (so the page draws no camera), Apple Vision tracks the hands on the Neural Engine,
// speech is recognised on the iPhone, and every website in a window can be clicked, curved and shown in 360°.
import * as THREE from 'three';
import { settings, saveSettings } from './config.js';

export const IOS = typeof window !== 'undefined' && !!window.MadarIOS;
const N = () => window.MadarIOS;
const Y = new THREE.Vector3(0, 1, 0);

// ---------- Head: ARKit pose (rotation + position), smoothed to the display rate ----------
export class NativeHead {
  constructor() {
    this.hasData = false;
    this.yawOffset = 0;
    this.q = new THREE.Quaternion(); this.prevQ = new THREE.Quaternion();
    this.p = new THREE.Vector3();
    this.at = 0; this.prevAt = 0;
    this.raw = this.q;
    window.__madarPose = (qx, qy, qz, qw, px, py, pz) => {
      const now = performance.now();
      this.prevQ.copy(this.q); this.prevAt = this.at;
      this.q.set(qx, qy, qz, qw); this.p.set(px, py, pz); this.at = now;
      if (!this.hasData) { this.prevQ.copy(this.q); this.hasData = true; }
    };
    try { this.yawOffset = +localStorage.getItem('madar.ios.yaw') || 0; } catch {}
  }
  // ARKit sends 30 poses a second; the display runs faster: continue the turn a little (max 40 ms) for smoothness.
  pose(delayMs, out) {
    let q = this.q;
    const dtPose = this.at - this.prevAt, ahead = Math.min(40, performance.now() - this.at);
    if (dtPose > 5 && dtPose < 100 && ahead > 0) q = this.prevQ.clone().slerp(this.q, 1 + ahead / dtPose);
    const yq = new THREE.Quaternion().setFromAxisAngle(Y, -this.yawOffset);
    return out.copy(yq).multiply(q);
  }
  // Head position in Madar's world (the same yaw turn applied).
  position(out) { return out.copy(this.p).applyAxisAngle(Y, -this.yawOffset); }
  currentYaw() { const f = new THREE.Vector3(0, 0, -1).applyQuaternion(this.q); return Math.atan2(-f.x, -f.z); }
  recenter(force) {
    // With a saved room (world map) the old orientation is kept, so windows stay on the walls where you left them.
    if (!force && N()?.last.world?.state === 'relocalizing') return;
    this.yawOffset = this.currentYaw();
    try { localStorage.setItem('madar.ios.yaw', String(this.yawOffset)); } catch {}
  }
}

// ---------- Walking: always on (ARKit). Same interface as the experimental web SLAM ----------
export class NativeSlam {
  constructor(app) { this.app = app; this.pos = new THREE.Vector3(); this.state = 'tracking'; }
  get on() { return true; }
  start() {} stop() {}
  update() { this.app.head.position(this.pos); }
}

// ---------- Setup ----------
export function setupNative(app) {
  const M = N();
  let lensKey = '';
  // The camera picture drawn by the app must match this page's lens settings exactly.
  app.renderer.nativeCam = true;
  app.renderer.afterRender = (prev => () => {
    prev?.();
    const r = app.renderer, t = r.camTan(), m = r.monoTan(), env = app.envModeNow || 'passthrough';
    const L = {
      sbs: settings.viewMode === 'sbs', sep: settings.lensSep, vOff: settings.vOffset, vSkew: settings.vSkew || 0,
      s2l: settings.screenToLens, k1: settings.k1, k2: settings.k2, px: r.distMat.uniforms.uPx.value, tanMax: r.distMat.uniforms.uTanMax.value,
      tx: t.x, ty: t.y, mx: m.x, my: m.y, bright: env === 'dim' ? 0.32 : 1, show: (env !== 'immersive' || !!app.deskHole) && app.active,
      fps: settings.coolMax || settings.lite ? 30 : 60,
    };
    const k = JSON.stringify(L);
    if (k !== lensKey) { lensKey = k; M.send('lens', L); }
  })(app.renderer.afterRender);

  M.on('camera', c => { app.renderer.nativeTan = { x: c.tx, y: c.ty }; app.log(`كاميرا ARKit: ${c.w}×${c.h}`); });
  M.on('thermal', p => {
    app.thermal = p.level;
    if (p.level >= 2 && !settings.coolMax) { settings.coolMax = true; app.renderer.resize(); }
    if (p.level >= 2 && !app.hotWarned) { app.hotWarned = true; app.toast(p.level >= 3 ? '🌡 الآيفون ساخن جداً — خفّفت كل شيء، يُفضّل استراحة قصيرة' : '🌡 الآيفون يسخن — تبريد تلقائي', 4000); }
    if (p.level < 2) app.hotWarned = false;
    app.log('حرارة الآيفون: ' + ['طبيعية', 'معتدلة', 'مرتفعة', 'حرجة'][p.level]);
  });
  M.on('tracking', p => {
    if (p.state === 'error' || p.state === 'unavailable') { app.toast('الكاميرا غير متاحة لمدار — اسمح بها من الإعدادات ← مدار', 6000); }
    const msg = { dark: 'المكان مظلم — التتبع ضعيف', fast: 'حركة سريعة — ببطء قليلاً', relocalizing: 'أتعرّف على غرفتك…', interrupted: 'توقف التتبع مؤقتاً' }[p.state];
    if (msg && app.active) app.toast(msg, 2500);
    app.log('ARKit: ' + p.state);
  });
  M.on('world', p => {
    if (p.state === 'relocalized') { app.toast('✅ تعرّفت على غرفتك — النوافذ في أماكنها', 3000); app.log('ARKit: الغرفة معروفة'); }
  });
  M.on('hands', p => app.hands.ingestNative?.(p.hands, performance.now(), (x, y) => { const [sx, sy] = app.renderer.imageToStage(x, y); return app.renderer.stageToTan(sx, sy); }));
  M.on('openUrl', p => { if (app.active && p.url) app.windows.open({ kind: 'web', url: p.url }); });
  M.on('files', p => {
    if (p.state === 'loading') app.toast(`جاري نقل ${p.count} ملف…`, 2500);
    else if (p.state === 'converting') app.toast('🎬 تحويل الفيديو المكاني إلى ثلاثي الأبعاد…', 6000);
    else if (p.state === 'depth') app.toast('🧊 أفهم عمق الصورة…', 3000);
    else if (p.state === 'noDepth' || p.state === 'noModel') app.toast('تعذّر فهم عمق هذه الصورة', 3000);
    else if (p.state === 'notSpatial') app.toast('هذا الفيديو ليس مكانياً — سيُفتح عادياً', 3000);
  });
  window.addEventListener('madar-file', async e => {
    const f = e.detail;
    try { const { importFiles } = await import('./db.js'); await importFiles([f]); app.renderLibrary?.(); } catch {}
    const dp = app.pendingDepth;
    if (dp && /^image\//.test(f.type) && app.active) { app.pendingDepth = null; app.windows.open({ kind: 'image', file: f, depth: dp.png }); return; }
    if (app.active) app.openLocalFiles([f]); else app.toast('أُضيف إلى المكتبة: ' + f.name, 2500);
  });
  // Hand tracking settings follow the page's settings.
  const sendHands = () => M.send('hands', { on: settings.handsEnabled !== false, every: settings.lite ? 95 : settings.coolMax ? 60 : settings.cool ? 45 : 35 });
  sendHands(); setInterval(sendHands, 5000);
  M.send('guard', { on: !!settings.roomGuard });
  M.on('record', p => {
    if (p.state === 'started') { app.recording = true; app.toast('⏺ التسجيل بدأ — اضغط «تسجيل» مرة أخرى للإيقاف', 3000); }
    else if (p.state === 'saved') { app.recording = false; app.toast('✅ حُفظ التسجيل في الصور', 3000); }
    else if (p.state === 'error') { app.recording = false; app.toast('تعذّر التسجيل: ' + (p.message || ''), 4000); }
  });
  M.on('depth', p => { app.pendingDepth = p; });   // the photo itself arrives next as a file
  // Windows come back where you left them (ARKit remembers the room).
  if (!settings.iosDefaults) saveSettings({ restoreLayout: true, iosDefaults: 1 });
  app.log('تطبيق مدار للآيفون: ARKit + Vision + Metal');
}

// Keyboard passthrough: a window onto your real desk below you, even inside a virtual environment,
// so you can see your keyboard (and your drink). The iPhone app's camera shows through it.
export function toggleDeskHole(app) {
  if (app.deskHole) { app.windows.root.remove(app.deskHole); app.deskHole.geometry.dispose(); app.deskHole = null; app.toast('أُغلقت نافذة لوحة المفاتيح', 1500); return; }
  const mat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vUv; void main(){ vec2 e = min(vUv, 1.0 - vUv); float a = smoothstep(0.0, 0.12, min(e.x * 1.6, e.y)); gl_FragColor = vec4(0.0, 0.0, 0.0, a); }',
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.ZeroFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.42), mat);
  m.renderOrder = 1000; m.frustumCulled = false;
  // In front of you and below, tilted like a desk.
  const f = app.headForward.clone(); f.y = 0; if (f.lengthSq() < 1e-4) f.set(0, 0, -1); f.normalize();
  const root = app.windows.root; root.updateMatrixWorld();
  const world = new THREE.Vector3(0, -0.42, 0).addScaledVector(f, 0.45);
  m.position.copy(root.worldToLocal(world.clone()));
  m.lookAt(root.worldToLocal(new THREE.Vector3(0, 0.25, 0)));
  root.add(m); app.deskHole = m;
  app.toast('⌨ نافذة على لوحة مفاتيحك أمامك وأسفل', 2200);
}
