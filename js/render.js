// Side-by-side stereo renderer: camera passthrough + two eye cameras + lens distortion correction.
import * as THREE from 'three';
import { CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import { settings, pxPerMm } from './config.js';

const TAN_MAX = 1.5;   // half-extent (tan) covered by each eye's render target
export const CSS_K = 1000; // CSS layer works in millimetres so browsers keep 3D precision

const BG_VERT = /* glsl */`
  uniform vec2 uExtent; varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = vec4(position.xy * uExtent, 0.0, 1.0); }`;
const BG_FRAG = /* glsl */`
  uniform sampler2D map; uniform float uRot; uniform float uBright; uniform float uHas; varying vec2 vUv;
  void main(){
    vec2 uv = vUv;
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
  uniform sampler2D map; uniform sampler2D mask; uniform float uRot; uniform float uBright; varying vec2 vUv;
  void main(){
    float a = texture2D(mask, vUv).r;
    if (a < 0.02) discard;
    vec2 uv = vUv;
    if (uRot > 0.5) uv = vec2(vUv.y, 1.0 - vUv.x);
    else if (uRot < -0.5) uv = vec2(1.0 - vUv.y, vUv.x);
    vec3 s = texture2D(map, uv).rgb;
    vec3 c = mix(s * 0.0773993808, pow(s * 0.9478672986 + 0.0521327014, vec3(2.4)), step(0.04045, s)) * uBright;
    gl_FragColor = vec4(c, smoothstep(0.02, 0.6, a));
  }`;

const DIST_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const DIST_FRAG = /* glsl */`
  uniform sampler2D tL; uniform sampler2D tR;
  uniform vec2 uRes; uniform float uPx; uniform float uSep; uniform float uVOff; uniform float uS2L;
  uniform vec2 uK; uniform float uTanMax; varying vec2 vUv;
  void main(){
    vec2 p = vUv * uRes;
    float halfW = uRes.x * 0.5;
    bool right = p.x >= halfW;
    vec2 c = vec2(halfW + (right ? 1.0 : -1.0) * uSep * 0.5 * uPx, uRes.y * 0.5 + uVOff * uPx);
    vec2 o = (p - c) / uPx / uS2L;
    float r2 = dot(o, o);
    vec2 d = o * (1.0 + uK.x * r2 + uK.y * r2 * r2);
    vec2 uv = 0.5 + d / (2.0 * uTanMax);
    vec4 col = right ? texture2D(tR, uv) : texture2D(tL, uv);
    vec2 e = min(uv, 1.0 - uv);
    float edge = smoothstep(0.0, 0.025, min(e.x, e.y));
    float seam = smoothstep(0.0, 2.0, abs(p.x - halfW));
    gl_FragColor = vec4(col.rgb * edge * seam, 1.0);
    #include <colorspace_fragment>
  }`;

export class StereoRenderer {
  constructor(stage, canvas, orientation) {
    this.stage = stage; this.orientation = orientation;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;
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
      uniforms: { map: { value: null }, uExtent: { value: new THREE.Vector2(0.6, 0.35) }, uRot: { value: 0 }, uBright: { value: 1 }, uHas: { value: 0 } },
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
      uniforms: { map: this.bgMat.uniforms.map, mask: { value: this.maskTex }, uExtent: this.bgMat.uniforms.uExtent, uRot: this.bgMat.uniforms.uRot, uBright: this.bgMat.uniforms.uBright },
      vertexShader: BG_VERT, fragmentShader: HAND_FRAG, depthTest: false, depthWrite: false, transparent: true,
    });
    this.handScene = new THREE.Scene();
    const hm = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.handMat); hm.frustumCulled = false;
    this.handScene.add(hm);
    // Cursors and toasts draw on top of everything, including hands.
    this.overlay = new THREE.Scene();

    // Distortion pass.
    this.distScene = new THREE.Scene();
    this.distMat = new THREE.ShaderMaterial({
      uniforms: {
        tL: { value: null }, tR: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uPx: { value: pxPerMm() },
        uSep: { value: 63 }, uVOff: { value: 0 }, uS2L: { value: 42 }, uK: { value: new THREE.Vector2() }, uTanMax: { value: TAN_MAX },
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
    const samples = Math.min(4, this.renderer.capabilities.maxSamples || 0);
    this.rts = [0, 1].map(() => {
      const rt = new THREE.WebGLRenderTarget(size, size, { samples, depthBuffer: true, type: THREE.UnsignedByteType });
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      rt.texture.minFilter = THREE.LinearFilter; rt.texture.magFilter = THREE.LinearFilter;
      rt.texture.generateMipmaps = false;
      return rt;
    });
    this.rtSize = size;
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
    const want = THREE.MathUtils.clamp(Math.round(cssSize * dpr * 0.75 / 64) * 64, 768, 1280);
    if (want !== this.rtSize) this.makeTargets(want);
    this.layoutCss();
  }

  applySettings() {
    const u = this.distMat.uniforms;
    u.uPx.value = pxPerMm();
    u.uSep.value = settings.lensSep;
    u.uVOff.value = settings.vOffset;
    u.uS2L.value = settings.screenToLens;
    u.uK.value.set(settings.k1, settings.k2);
    this.layoutCss();
  }

  // Position each eye's CSS layer so its centre sits on the lens centre (linear approximation of the lens).
  layoutCss() {
    const { width, height } = this.orientation;
    const px = pxPerMm();
    const size = 2 * TAN_MAX * settings.screenToLens * px;
    const halfW = width / 2;
    [0, 1].forEach(i => {
      const holder = this.cssHolders[i];
      holder.style.left = (i ? halfW : 0) + 'px';
      holder.style.width = halfW + 'px';
      holder.style.height = height + 'px';
      const cx = (i ? 1 : -1) * settings.lensSep * 0.5 * px + halfW - (i ? halfW : 0);
      const cy = height / 2 - settings.vOffset * px;
      const el = this.cssRenderers[i].domElement;
      this.cssRenderers[i].setSize(size, size);
      el.style.position = 'absolute';
      el.style.left = (cx - size / 2) + 'px';
      el.style.top = (cy - size / 2) + 'px';
    });
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
    const v = this.video;
    let aspect = 16 / 9;
    if (v && v.videoWidth) { const w = v.videoWidth, h = v.videoHeight; aspect = Math.max(w, h) / Math.min(w, h); }
    const tx = Math.tan(settings.camFov * Math.PI / 360) * settings.worldScale;
    return { x: tx, y: tx / aspect };
  }

  // Convert a MediaPipe landmark (image normalised, y down) into stage-normalised coords (y down).
  imageToStage(ix, iy) {
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

  updateHandMask(slots, now) {
    const ctx = this.maskCtx, W = this.maskCanvas.width, H = this.maskCanvas.height;
    const live = (slots || []).filter(s => s.active && s.pts && now - s.ptsTime < 220);
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
    for (let i = 0; i < 2; i++) {
      const cam = this.eyes[i];
      cam.quaternion.copy(headQ);
      cam.position.set((i ? 0.5 : -0.5) * ipd, 0, 0).applyQuaternion(headQ);
      cam.updateMatrixWorld();
      r.setRenderTarget(this.rts[i]);
      r.setClearColor(0x05060a, 1);
      r.clear(true, true, true);
      if (envMode !== 'immersive') r.render(this.bgScene, this.bgCam);
      r.clearDepth();
      r.render(this.scene, cam);
      if (this.maskOn && u.uHas.value > 0) r.render(this.handScene, this.bgCam);
      r.clearDepth();
      r.render(this.overlay, cam);
    }
    r.setRenderTarget(null);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, true);
    this.distMat.uniforms.tL.value = this.rts[0].texture;
    this.distMat.uniforms.tR.value = this.rts[1].texture;
    r.render(this.distScene, this.distCam);

    if (this.cssCount > 0) for (let i = 0; i < 2; i++) {
      const c = this.cssCams[i];
      c.quaternion.copy(this.eyes[i].quaternion);
      c.position.copy(this.eyes[i].position).multiplyScalar(CSS_K);
      c.updateMatrixWorld();
      this.cssRenderers[i].render(this.cssScenes[i], c);
    }
  }
}
