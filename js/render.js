// Side-by-side stereo renderer: camera passthrough + two eye cameras + lens distortion correction.
import * as THREE from 'three';
import { CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import { settings, pxPerMm } from './config.js';

const TAN_MAX = 1.4;   // half-extent (tan) covered by each eye's render target (smaller = sharper centre)
export const CSS_K = 1000; // CSS layer works in millimetres so browsers keep 3D precision

const BG_VERT = /* glsl */`
  uniform vec2 uExtent; varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = vec4(position.xy * uExtent, 0.0, 1.0); }`;
const BG_FRAG = /* glsl */`
  uniform sampler2D map; uniform float uRot; uniform float uBright; uniform float uHas; uniform float uMirror; varying vec2 vUv;
  void main(){
    vec2 uv = vec2(uMirror > 0.5 ? 1.0 - vUv.x : vUv.x, vUv.y);
    if (uRot > 0.5) uv = vec2(vUv.y, 1.0 - vUv.x);
    else if (uRot < -0.5) uv = vec2(1.0 - vUv.y, vUv.x);
    vec3 s = texture2D(map, uv).rgb;
    // Video textures are uploaded without hardware sRGB decode, so decode here.
    vec3 c = mix(s * 0.0773993808, pow(s * 0.9478672986 + 0.0521327014, vec3(2.4)), step(0.04045, s)) * uBright;
    vec2 e = min(vUv, 1.0 - vUv);
    float f = smoothstep(0.0, 0.035, min(e.x, e.y));
    gl_FragColor = vec4(mix(vec3(0.02,0.025,0.04), c, uHas * f), 1.0);
  }`;

// Passthrough again, but only where the hand mask is set: real hands stay in front of virtual content.
const HAND_FRAG = /* glsl */`
  uniform sampler2D map; uniform sampler2D mask; uniform float uRot; uniform float uBright; uniform float uMirror; varying vec2 vUv;
  void main(){
    float a = texture2D(mask, vUv).r;
    if (a < 0.02) discard;
    vec2 uv = vec2(uMirror > 0.5 ? 1.0 - vUv.x : vUv.x, vUv.y);
    if (uRot > 0.5) uv = vec2(vUv.y, 1.0 - vUv.x);
    else if (uRot < -0.5) uv = vec2(1.0 - vUv.y, vUv.x);
    vec3 s = texture2D(map, uv).rgb;
    vec3 c = mix(s * 0.0773993808, pow(s * 0.9478672986 + 0.0521327014, vec3(2.4)), step(0.04045, s)) * uBright;
    gl_FragColor = vec4(c, smoothstep(0.02, 0.6, a));
  }`;

const DIST_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const DIST_FRAG = /* glsl */`
  uniform sampler2D tL; uniform sampler2D tR;
  uniform vec2 uRes; uniform float uPx; uniform float uSep; uniform float uVOff; uniform float uVSkew; uniform float uS2L;
  uniform vec2 uK; uniform float uTanMax; uniform float uTex; uniform vec3 uSL; uniform vec3 uSR; varying vec2 vUv;
  // Per-eye sharpening: isotropic unsharp mask plus a directional term along the eye's
  // astigmatic blur meridian (x = amount, y = directional amount, z = angle).
  vec4 sharp(sampler2D t, vec2 uv, vec3 S){
    vec4 c = texture2D(t, uv);
    if (S.x + S.y < 0.01) return c;
    vec2 dx = vec2(uTex, 0.0), dy = vec2(0.0, uTex);
    vec4 n = texture2D(t, uv + dx) + texture2D(t, uv - dx) + texture2D(t, uv + dy) + texture2D(t, uv - dy);
    vec2 dir = vec2(cos(S.z), sin(S.z)) * uTex * 1.5;
    vec4 a = texture2D(t, uv + dir) + texture2D(t, uv - dir);
    vec3 rgb = c.rgb + S.x * (c.rgb - n.rgb * 0.25) + S.y * (c.rgb - a.rgb * 0.5);
    return vec4(clamp(rgb, 0.0, 1.0), c.a);
  }
  void main(){
    vec2 p = vUv * uRes;
    float halfW = uRes.x * 0.5;
    bool right = p.x >= halfW;
    vec2 c = vec2(halfW + (right ? 1.0 : -1.0) * uSep * 0.5 * uPx, uRes.y * 0.5 + (uVOff + (right ? 0.5 : -0.5) * uVSkew) * uPx);
    vec2 o = (p - c) / uPx / uS2L;
    float r2 = dot(o, o);
    vec2 d = o * (1.0 + uK.x * r2 + uK.y * r2 * r2);
    vec2 uv = 0.5 + d / (2.0 * uTanMax);
    vec4 col = right ? sharp(tR, uv, uSR) : sharp(tL, uv, uSL);
    vec2 e = min(uv, 1.0 - uv);
    float edge = smoothstep(0.0, 0.025, min(e.x, e.y));
    float seam = smoothstep(0.0, 2.0, abs(p.x - halfW));
    float k = edge * seam;
    // Alpha stays 0 where a web window shows through (its page sits under this canvas).
    gl_FragColor = vec4(col.rgb * k, 1.0 - k * (1.0 - col.a));
    #include <colorspace_fragment>
  }`;

// Which eye is being drawn (0 left / 1 right): stereo videos and photos show each eye its own half.
export const EYE = { value: 0 };

export class StereoRenderer {
  constructor(stage, canvas, orientation) {
    this.stage = stage; this.orientation = orientation;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;
    // real shadows (only the photo-real study uses them; drawn once, then reused - the room doesn't move)
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.VSMShadowMap; this.renderer.shadowMap.autoUpdate = false;
    this.maxAniso = this.renderer.capabilities.getMaxAnisotropy();

    this.scene = new THREE.Scene();
    this.head = new THREE.Quaternion();
    this.eyes = [new THREE.PerspectiveCamera(), new THREE.PerspectiveCamera()];
    this.eyes.forEach(c => { c.near = 0.05; c.far = 200; c.aspect = 1; c.fov = 2 * Math.atan(TAN_MAX) * 180 / Math.PI; c.updateProjectionMatrix(); });
    this.center = new THREE.PerspectiveCamera(this.eyes[0].fov, 1, 0.05, 200);

    // Passthrough background.
    this.bgScene = new THREE.Scene();
    this.bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.videoTex = null;
    this.bgMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: null }, uExtent: { value: new THREE.Vector2(0.6, 0.35) }, uRot: { value: 0 }, uBright: { value: 1 }, uHas: { value: 0 }, uMirror: { value: 0 } },
      vertexShader: BG_VERT, fragmentShader: BG_FRAG, depthTest: false, depthWrite: false,
    });
    this.bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bgMat);
    this.bgMesh.frustumCulled = false;
    this.bgScene.add(this.bgMesh);

    // Hand occlusion: a soft hand-shaped mask drawn from the tracked joints, in passthrough-image space.
    this.maskCanvas = document.createElement('canvas');
    this.maskCanvas.width = 320; this.maskCanvas.height = 180;
    this.maskCtx = this.maskCanvas.getContext('2d');
    this.maskTex = new THREE.CanvasTexture(this.maskCanvas);
    this.maskTex.minFilter = THREE.LinearFilter; this.maskTex.magFilter = THREE.LinearFilter; this.maskTex.generateMipmaps = false;
    this.maskOn = false;
    this.handMat = new THREE.ShaderMaterial({
      uniforms: { map: this.bgMat.uniforms.map, mask: { value: this.maskTex }, uExtent: this.bgMat.uniforms.uExtent, uRot: this.bgMat.uniforms.uRot, uBright: this.bgMat.uniforms.uBright, uMirror: this.bgMat.uniforms.uMirror },
      vertexShader: BG_VERT, fragmentShader: HAND_FRAG, depthTest: false, depthWrite: false, transparent: true,
    });
    this.handScene = new THREE.Scene();
    const hm = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.handMat); hm.frustumCulled = false;
    this.handScene.add(hm);
    // iPhone app: the camera is underneath the page, so real hands show through holes cut in the virtual layer.
    this.holeMat = new THREE.ShaderMaterial({
      uniforms: { mask: { value: this.maskTex }, uExtent: this.bgMat.uniforms.uExtent },
      vertexShader: BG_VERT,
      fragmentShader: `uniform sampler2D mask; varying vec2 vUv; void main(){ float a = smoothstep(0.02, 0.6, texture2D(mask, vUv).r); if (a < 0.01) discard; gl_FragColor = vec4(0.0, 0.0, 0.0, a); }`,
      depthTest: false, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.ZeroFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.holeScene = new THREE.Scene();
    const ho = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.holeMat); ho.frustumCulled = false;
    this.holeScene.add(ho);
    // Cursors and toasts draw on top of everything, including hands.
    this.overlay = new THREE.Scene();

    // Distortion pass.
    this.distScene = new THREE.Scene();
    this.distMat = new THREE.ShaderMaterial({
      uniforms: {
        tL: { value: null }, tR: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uPx: { value: pxPerMm() },
        uSep: { value: 63 }, uVOff: { value: 0 }, uVSkew: { value: 0 }, uS2L: { value: 42 }, uK: { value: new THREE.Vector2() }, uTanMax: { value: TAN_MAX }, uTex: { value: 1 / 1024 }, uSL: { value: new THREE.Vector3() }, uSR: { value: new THREE.Vector3() },
      },
      vertexShader: DIST_VERT, fragmentShader: DIST_FRAG, depthTest: false, depthWrite: false,
    });
    const dq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.distMat); dq.frustumCulled = false;
    this.distScene.add(dq);
    this.distCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // CSS3D layers for web windows, one per eye.
    this.cssScenes = [new THREE.Scene(), new THREE.Scene()];
    this.cssRenderers = [new CSS3DRenderer(), new CSS3DRenderer()];
    this.cssHolders = [stage.querySelector('#eyeL'), stage.querySelector('#eyeR')];
    this.cssRenderers.forEach((r, i) => { r.domElement.className = 'css-eye'; this.cssHolders[i].appendChild(r.domElement); });
    this.cssCount = 0;
    this.cssCams = [0, 1].map(() => this.eyes[0].clone());

    this.rtSize = 0;
    this.rts = [];
    orientation.onChange(() => this.resize());
    this.resize();
  }

  makeTargets(size) {
    this.rts.forEach(r => r.dispose());
    const samples = Math.min(2, this.renderer.capabilities.maxSamples || 0);
    this.rts = [0, 1].map(() => {
      const rt = new THREE.WebGLRenderTarget(size, size, { samples, depthBuffer: true, type: THREE.UnsignedByteType });
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      rt.texture.minFilter = THREE.LinearFilter; rt.texture.magFilter = THREE.LinearFilter;
      rt.texture.generateMipmaps = false;
      return rt;
    });
    this.rtSize = size;
    this.distMat.uniforms.uTex.value = 1 / size;
  }

  resize() {
    const { width, height } = this.orientation;
    if (!width || !height) return;
    const dpr = Math.min(window.devicePixelRatio || 2, 3);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, true);
    this.distMat.uniforms.uRes.value.set(width, height);
    this.applySettings();
    const px = pxPerMm();
    const cssSize = 2 * TAN_MAX * settings.screenToLens * px;
    // Match the screen's pixel density at the lens centre (1:1), within memory limits.
    // Leave memory for web pages when one is open; cool mode renders a little lighter to keep the iPhone cool.
    // light mode: the rest is lightened elsewhere, the windows keep the full resolution (no adaptive drop)
    let cap = settings.lite ? (this.cssCount > 0 ? 1536 : 1664) : this.cssCount > 0 ? 1280 : settings.coolMax ? 1216 : settings.cool ? 1408 : 1664;
    // a tablet / laptop screen is open: its text needs the sharp resolution, cool mode or not
    if (this.readCount > 0) cap = Math.max(cap, this.cssCount > 0 ? 1280 : 1408);   // more crashed iOS (memory)
    this.quality = settings.lite || this.readCount > 0 ? 1 : this.quality || 1;
    const want = THREE.MathUtils.clamp(Math.round(cssSize * dpr * this.quality / 64) * 64, 896, cap);
    if (want !== this.rtSize) this.makeTargets(want);
    this.layoutCss();
  }

  applySettings() {
    const u = this.distMat.uniforms;
    u.uPx.value = pxPerMm();
    u.uSep.value = settings.lensSep;
    u.uVOff.value = settings.vOffset;
    u.uVSkew.value = settings.vSkew || 0;
    u.uS2L.value = settings.screenToLens;
    u.uK.value.set(settings.k1, settings.k2);
    // Prescription → sharpening per eye. Axis is TABO (examiner's view); converted to the wearer's screen view.
    const eye = (sph, cyl, axis) => {
      const se = Math.abs(sph + cyl / 2);
      const ang = (180 - ((axis + 90) % 180)) * Math.PI / 180;
      return [settings.sharpen + Math.min(0.6, 0.15 * se), Math.min(1.2, 0.35 * Math.abs(cyl)) * settings.rxStrength, ang];
    };
    u.uSL.value.set(...eye(settings.rxL.sph, settings.rxL.cyl, settings.rxL.axis));
    u.uSR.value.set(...eye(settings.rxR.sph, settings.rxR.cyl, settings.rxR.axis));
    this.layoutCss();
  }

  // Position each eye's CSS layer so its centre sits on the lens centre (linear approximation of the lens).
  layoutCss() {
    const { width, height } = this.orientation;
    const px = pxPerMm();
    const size = 2 * TAN_MAX * settings.screenToLens * px;
    const halfW = width / 2;
    if (settings.viewMode !== 'sbs') {
      Object.assign(this.cssHolders[0].style, { left: '0px', width: width + 'px', height: height + 'px', display: '' });
      this.cssHolders[1].style.display = 'none';
      return;
    }
    this.cssHolders[1].style.display = '';
    [0, 1].forEach(i => {
      const holder = this.cssHolders[i];
      holder.style.left = (i ? halfW : 0) + 'px';
      holder.style.width = halfW + 'px';
      holder.style.height = height + 'px';
      const cx = (i ? 1 : -1) * settings.lensSep * 0.5 * px + halfW - (i ? halfW : 0);
      const cy = height / 2 - (settings.vOffset + (i ? 0.5 : -0.5) * (settings.vSkew || 0)) * px;
      const el = this.cssRenderers[i].domElement;
      this.cssRenderers[i].setSize(size, size);
      el.style.position = 'absolute';
      el.style.left = (cx - size / 2) + 'px';
      el.style.top = (cy - size / 2) + 'px';
    });
  }

  // Project a world point into eye i's CSS holder, in px (linear lens approximation). Null if behind.
  eyePx(i, v) {
    if (settings.viewMode !== 'sbs') {
      if (i === 1) return null;
      const p = v.clone().applyMatrix4(this.center.matrixWorldInverse);
      if (p.z > -0.05) return null;
      const m = this.monoTan(), { width, height } = this.orientation;
      return [width / 2 + (p.x / -p.z) / m.x * width / 2, height / 2 - (p.y / -p.z) / m.y * height / 2];
    }
    const cam = this.eyes[i];
    const p = v.clone().applyMatrix4(cam.matrixWorldInverse);
    if (p.z > -0.05) return null;
    let tx = p.x / -p.z, ty = p.y / -p.z;
    // Undo the lens pre-distortion so the page lands where the scene draws the window.
    const dl = Math.hypot(tx, ty);
    if (dl > 1e-5 && (settings.k1 || settings.k2)) {
      let r = dl;
      for (let n = 0; n < 6; n++) { const r2 = r * r, f = r * (1 + settings.k1 * r2 + settings.k2 * r2 * r2) - dl, df = 1 + 3 * settings.k1 * r2 + 5 * settings.k2 * r2 * r2; r -= f / df; }
      tx *= r / dl; ty *= r / dl;
    }
    const { width, height } = this.orientation;
    const px = pxPerMm(), k = settings.screenToLens * px, halfW = width / 2;
    const cx = (i ? 1 : -1) * settings.lensSep * 0.5 * px + halfW - (i ? halfW : 0);
    const cy = height / 2 - (settings.vOffset + (i ? 0.5 : -0.5) * (settings.vSkew || 0)) * px;
    return [cx + tx * k, cy - ty * k];
  }

  setVideo(video) {
    if (this.videoTex) this.videoTex.dispose();
    this.video = video;
    if (!video) { this.videoTex = null; this.bgMat.uniforms.uHas.value = 0; return; }
    const t = new THREE.VideoTexture(video);
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
    this.videoTex = t;
    this.bgMat.uniforms.map.value = t;
  }

  // Rotation needed to bring camera frames into stage orientation (0, 90, -90).
  videoRotation() {
    const v = this.video;
    if (!v || !v.videoWidth) return 0;
    const portraitVideo = v.videoHeight > v.videoWidth;
    if (!portraitVideo) return 0;
    return this.orientation.rotation || this.orientation.physical || 90;
  }

  // Half-extents (tan) of the passthrough image as drawn, in stage orientation.
  camTan() {
    if (this.nativeTan) return { x: this.nativeTan.x * settings.worldScale, y: this.nativeTan.y * settings.worldScale };
    const v = this.video;
    let aspect = 16 / 9;
    if (v && v.videoWidth) { const w = v.videoWidth, h = v.videoHeight; aspect = Math.max(w, h) / Math.min(w, h); }
    const tx = Math.tan(settings.camFov * Math.PI / 360) * settings.worldScale;
    return { x: tx, y: tx / aspect };
  }

  // Convert a MediaPipe landmark (image normalised, y down) into stage-normalised coords (y down).
  imageToStage(ix, iy) {
    if (settings.viewMode === 'desktop') ix = 1 - ix;   // front camera is shown mirrored
    const r = this.videoRotation();
    if (r === 90) return [iy, 1 - ix];
    if (r === -90) return [1 - iy, ix];
    return [ix, iy];
  }

  // Head-local direction for a stage-normalised point.
  stageToTan(sx, sy) {
    const t = this.camTan();
    return [(sx - 0.5) * 2 * t.x, (0.5 - sy) * 2 * t.y];
  }

  // Dynamic resolution: drop render size a little only while frames run slow, restore when smooth.
  adapt(dt) {
    if (settings.lite || this.readCount > 0) return;
    this.ft = this.ft ? this.ft * 0.95 + dt * 0.05 : dt;
    const now = performance.now();
    if (now - (this.lastAdapt || 0) < 2500) return;
    this.lastAdapt = now;
    const q = this.quality || 1;
    if (this.ft > 0.024 && q > 0.7) { this.quality = q - 0.1; this.resize(); }
    else if (this.ft < 0.0178 && q < 1) { this.quality = Math.min(1, q + 0.1); this.resize(); }
  }

  updateHandMask(slots, now) {
    const ctx = this.maskCtx, W = this.maskCanvas.width, H = this.maskCanvas.height;
    const live = (slots || []).filter(s => s.active && s.pts && now - s.ptsTime < 220);
    const stamp = live.map(s => s.ptsTime).join();
    if (live.length && stamp === this.maskStamp) return;   // redraw only on a new detection
    this.maskStamp = stamp;
    if (!live.length) { if (this.maskOn) { ctx.clearRect(0, 0, W, H); this.maskTex.needsUpdate = true; this.maskOn = false; } return; }
    const t = this.camTan();
    const P = p => [(0.5 + p[0] / (2 * t.x)) * W, (0.5 - p[1] / (2 * t.y)) * H];
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = ctx.strokeStyle = '#fff';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const s of live) {
      const q = s.pts.map(P);
      const d = (a, b) => Math.hypot(q[a][0] - q[b][0], q[a][1] - q[b][1]);
      const palm = Math.max(d(5, 17), d(0, 9) * 0.75, 4);
      // Palm
      ctx.beginPath(); [0, 1, 2, 5, 9, 13, 17].forEach((i, k) => k ? ctx.lineTo(q[i][0], q[i][1]) : ctx.moveTo(q[i][0], q[i][1])); ctx.closePath();
      ctx.lineWidth = palm * 0.45; ctx.fill(); ctx.stroke();
      // Fingers
      const chains = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
      chains.forEach((c, ci) => {
        ctx.lineWidth = palm * (ci === 0 ? 0.42 : ci === 4 ? 0.32 : 0.36);
        ctx.beginPath(); c.forEach((i, k) => k ? ctx.lineTo(q[i][0], q[i][1]) : ctx.moveTo(q[i][0], q[i][1])); ctx.stroke();
        ctx.beginPath(); ctx.arc(q[c[3]][0], q[c[3]][1], ctx.lineWidth * 0.62, 0, 7); ctx.fill();
      });
      // Forearm: continue from the wrist away from the fingers.
      const dx = q[0][0] - q[9][0], dy = q[0][1] - q[9][1], len = Math.hypot(dx, dy) || 1;
      ctx.lineWidth = palm * 1.05;
      ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); ctx.lineTo(q[0][0] + dx / len * palm * 4, q[0][1] + dy / len * palm * 4); ctx.stroke();
    }
    this.maskTex.needsUpdate = true;
    this.maskOn = true;
  }

  // Phone mode: one full-screen view (no headset), camera image fills the screen.
  monoTan() {
    const t = this.camTan(), A = this.orientation.width / this.orientation.height;
    const Ty = Math.min(t.y, t.x / A);
    return { x: Ty * A, y: Ty, t };
  }
  renderMono(t, envMode) {
    const r = this.renderer, u = this.bgMat.uniforms, m = this.monoTan();
    const cam = this.center;
    const fov = 2 * Math.atan(m.y) * 180 / Math.PI, A = this.orientation.width / this.orientation.height;
    if (cam.fov !== fov || cam.aspect !== A) { cam.fov = fov; cam.aspect = A; cam.updateProjectionMatrix(); }
    u.uExtent.value.set(t.x / m.x, t.y / m.y);
    this.eyes.forEach(e => { e.quaternion.copy(cam.quaternion); e.position.set(0, 0, 0); e.updateMatrixWorld(); });
    r.setRenderTarget(null);
    r.setClearColor(0x05060a, this.nativeCam && envMode !== 'immersive' ? 0 : 1);
    r.clear(true, true, true);
    if (envMode !== 'immersive' && !this.nativeCam) r.render(this.bgScene, this.bgCam);
    r.clearDepth();
    r.render(this.scene, cam);
    if (this.maskOn && u.uHas.value > 0) r.render(this.handScene, this.bgCam);
    else if (this.maskOn && this.nativeCam && envMode !== 'immersive') r.render(this.holeScene, this.bgCam);
    r.clearDepth();
    r.render(this.overlay, cam);
    this.afterRender?.();
  }

  render(headQ, envMode) {
    const r = this.renderer;
    this.head.copy(headQ);
    const ipd = settings.ipd / 1000;
    const t = this.camTan();
    const u = this.bgMat.uniforms;
    u.uExtent.value.set(t.x / TAN_MAX, t.y / TAN_MAX);
    u.uRot.value = this.videoRotation();
    u.uRot.value = u.uRot.value === 90 ? 1 : u.uRot.value === -90 ? -1 : 0;
    u.uBright.value = envMode === 'dim' ? 0.32 : 1;
    u.uHas.value = this.video && this.video.readyState >= 2 ? 1 : 0;

    this.center.quaternion.copy(headQ); this.center.position.set(0, 0, 0); this.center.updateMatrixWorld();
    u.uMirror.value = settings.viewMode === 'desktop' ? 1 : 0;
    if (settings.viewMode !== 'sbs') { this.renderMono(t, envMode); return; }
    for (let i = 0; i < 2; i++) {
      const cam = this.eyes[i];
      cam.quaternion.copy(headQ);
      cam.position.set((i ? 0.5 : -0.5) * ipd, 0, 0).applyQuaternion(headQ);
      cam.updateMatrixWorld();
      EYE.value = i;
      r.setRenderTarget(this.rts[i]);
      // In the iPhone app the camera is drawn by the app underneath: leave the room transparent here.
      r.setClearColor(0x05060a, this.nativeCam && envMode !== 'immersive' ? 0 : 1);
      r.clear(true, true, true);
      if (envMode !== 'immersive' && !this.nativeCam) r.render(this.bgScene, this.bgCam);
      r.clearDepth();
      r.render(this.scene, cam);
      if (this.maskOn && u.uHas.value > 0) r.render(this.handScene, this.bgCam);
      else if (this.maskOn && this.nativeCam && envMode !== 'immersive') r.render(this.holeScene, this.bgCam);
      r.clearDepth();
      r.render(this.overlay, cam);
    }
    EYE.value = 0;
    r.setRenderTarget(null);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, true);
    this.distMat.uniforms.tL.value = this.rts[0].texture;
    this.distMat.uniforms.tR.value = this.rts[1].texture;
    r.render(this.distScene, this.distCam);

    if (this.cssCount !== this.lastCss || (this.readCount || 0) !== this.lastRead) { this.lastCss = this.cssCount; this.lastRead = this.readCount || 0; this.resize(); }
    this.afterRender?.();
    if (false) for (let i = 0; i < 2; i++) {
      const c = this.cssCams[i];
      c.quaternion.copy(this.eyes[i].quaternion);
      c.position.copy(this.eyes[i].position).multiplyScalar(CSS_K);
      c.updateMatrixWorld();
      this.cssRenderers[i].render(this.cssScenes[i], c);
    }
  }
}
