// More places to be: space (Earth turning below you), a quiet library, an office with a view (sunset or night city),
// a gaming room in two colour themes, and a photo-real reading room. Built in code + a few scanned pieces of furniture
// (Poly Haven, CC0) and 360° photographs behind the windows; each one is built the first time you choose it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tex, mesh, box, cyl, plane, glow, radial, noise, glb, place, photoSphere, pbr, std, emit, tame, pointL, realRoom, FLOOR, BASE } from './rooms.js';

const SPACE = new URL('../assets/space/', import.meta.url).href;
const ticking = (R, fn) => { R.userData.tick = fn; return R; };

// ---------------------------------------------------------------- space
function starField(n) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    // denser along the Milky Way band (a tilted great circle)
    let x = r * Math.cos(th), y = u, z = r * Math.sin(th);
    if (i % 3 === 0) { const a = Math.random() * Math.PI * 2, spread = (Math.random() - 0.5) * 0.35; x = Math.cos(a); y = spread; z = Math.sin(a); const tilt = 0.9; const yy = y * Math.cos(tilt) - z * Math.sin(tilt); z = y * Math.sin(tilt) + z * Math.cos(tilt); y = yy; const l = Math.hypot(x, y, z); x /= l; y /= l; z /= l; }
    pos.set([x * 60, y * 60, z * 60], i * 3);
    const t = Math.random();
    c.setHSL(t < 0.2 ? 0.6 : t < 0.3 ? 0.08 : 0.12, t < 0.3 ? 0.6 : 0.15, 0.75 + Math.random() * 0.25);
    col.set([c.r, c.g, c.b], i * 3);
    size[i] = Math.random() < 0.02 ? 3.2 + Math.random() * 2 : 0.8 + Math.pow(Math.random(), 3) * 2.2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uPx: { value: window.devicePixelRatio > 2 ? 1.6 : 1.3 } },
    vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC; varying float vTw; uniform float uT; uniform float uPx;
      void main(){ vC = color; vTw = 0.75 + 0.25 * sin(uT * (1.0 + fract(position.x * 7.13)) * 2.0 + position.y);
      vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * uPx; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vC; varying float vTw; void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC * vTw, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = -30;
  return pts;
}
// the Milky Way and faint nebulae, painted once on a canvas around you
function milkyWay() {
  const t = tex(2048, 1024, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      const x = Math.random() * w, band = Math.sin(x / w * Math.PI * 2) * h * 0.18, y = h / 2 + band + (Math.random() - 0.5) * h * 0.16 * (0.4 + Math.random());
      const r = 20 + Math.random() * 90, hue = Math.random() < 0.15 ? 'rgba(255,170,120,' : Math.random() < 0.3 ? 'rgba(150,160,255,' : 'rgba(220,215,255,';
      radial(g, x, y, r, hue + (0.02 + Math.random() * 0.05) + ')', 0.5 + Math.random() * 0.5);
    }
    for (let i = 0; i < 240; i++) { const x = Math.random() * w, y = h / 2 + Math.sin(x / w * Math.PI * 2) * h * 0.18 + (Math.random() - 0.5) * 40; radial(g, x, y, 10 + Math.random() * 30, 'rgba(0,0,0,0.35)'); }
    radial(g, w * 0.78, h * 0.3, 260, 'rgba(160,60,200,0.07)'); radial(g, w * 0.2, h * 0.7, 300, 'rgba(40,120,255,0.06)');
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(70, 48, 24), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.rotation.set(0.5, 0, 0.3); m.renderOrder = -31;
  return m;
}
export function space() {
  const R = new THREE.Group();
  R.add(new THREE.Mesh(new THREE.SphereGeometry(78, 24, 12), new THREE.MeshBasicMaterial({ color: 0x010207, side: THREE.BackSide, depthWrite: false })));
  R.children[0].renderOrder = -32;
  R.add(milkyWay());
  const stars = starField(5200); R.add(stars);
  const L = new THREE.TextureLoader();
  const ld = (f, srgb = false) => { const t = L.load(SPACE + f); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  const sun = new THREE.Vector3(1, 0.35, -0.55).normalize();
  // Earth: day side, city lights on the night side, the oceans catching the sun, a blue rim of air
  const earth = new THREE.Mesh(new THREE.SphereGeometry(3.2, 96, 64), new THREE.ShaderMaterial({
    uniforms: { day: { value: ld('earth_atmos_2048.jpg') }, night: { value: ld('earth_lights_2048.png') }, spec: { value: ld('earth_specular_2048.jpg') }, sunDir: { value: sun } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform sampler2D day, night, spec; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vec3 n = normalize(vN); float l = dot(n, sunDir); float k = smoothstep(-0.12, 0.28, l);
        vec3 d = texture2D(day, vUv).rgb, nt = texture2D(night, vUv).rgb;
        vec3 c = mix(nt * vec3(1.0, 0.82, 0.55) * 1.4, d * (0.18 + 1.0 * max(l, 0.0)), k);
        vec3 h = normalize(sunDir + vV); c += texture2D(spec, vUv).r * pow(max(dot(n, h), 0.0), 60.0) * 0.55 * k;
        float rim = pow(1.0 - max(dot(n, vV), 0.0), 2.6); c += vec3(0.32, 0.58, 1.0) * rim * (0.15 + 0.85 * smoothstep(-0.3, 0.4, l));
        gl_FragColor = vec4(c, 1.0); }`,
  }));
  earth.position.set(0.6, -3.9, -6.2); earth.rotation.set(0.25, -1.2, 0.1); R.add(earth);
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(3.24, 96, 64), new THREE.ShaderMaterial({
    uniforms: { map: { value: ld('earth_clouds_1024.png') }, sunDir: { value: sun } }, transparent: true, depthWrite: false,
    vertexShader: `varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vN; void main(){ vec4 t = texture2D(map, vUv); float l = smoothstep(-0.1, 0.4, dot(normalize(vN), sunDir)); gl_FragColor = vec4(vec3(1.0) * (0.08 + 0.92 * l), t.a * 0.85 * (0.25 + 0.75 * l)); }`,
  }));
  clouds.position.copy(earth.position); clouds.rotation.copy(earth.rotation); R.add(clouds);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(3.42, 64, 32), new THREE.ShaderMaterial({
    uniforms: { sunDir: { value: sun }, center: { value: new THREE.Vector3(0.6, -3.9, -6.2) } }, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vW; varying vec3 vN; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform vec3 sunDir, center; varying vec3 vW; varying vec3 vN;
      void main(){ vec3 v = normalize(cameraPosition - vW); float d = max(dot(-vN, v), 0.0); float f = pow(smoothstep(0.0, 0.36, d), 2.2);
        float l = smoothstep(-0.45, 0.35, dot(normalize(vW - center), sunDir)); gl_FragColor = vec4(vec3(0.32, 0.6, 1.0) * f * (0.12 + 0.95 * l), 1.0); }`,
  }));
  halo.position.copy(earth.position); R.add(halo);
  // the Moon, lit from the same side
  const moon = new THREE.Mesh(new THREE.SphereGeometry(0.42, 48, 32), new THREE.ShaderMaterial({
    uniforms: { map: { value: ld('moon_1024.jpg') }, sunDir: { value: sun } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vN; void main(){ float l = max(dot(normalize(vN), sunDir), 0.0); gl_FragColor = vec4(texture2D(map, vUv).rgb * (0.04 + 1.1 * l), 1.0); }`,
  }));
  moon.position.set(-3.6, 1.5, -8.5); R.add(moon);
  // the Sun: a white-hot core and a wide glow
  const sp = sun.clone().multiplyScalar(40);
  glow(R, 9, 9, 0xfff4dd, 0.9, sp.x, sp.y, sp.z).lookAt(0, 0, 0);
  glow(R, 26, 26, 0xffcf8a, 0.35, sp.x, sp.y, sp.z).lookAt(0, 0, 0);
  R.userData.dim = 0.55;
  return ticking(R, (dt, t) => { earth.rotation.y += dt * 0.006; clouds.rotation.y += dt * 0.0075; stars.material.uniforms.uT.value = t; });
}

// ---------------------------------------------------------------- shelves full of books (one draw call for all of them)
function bookcase(R, x, z, ry, width, height, { rows = 6, depth = 0.34, wood = 0x4a2f1c, seed = 1 } = {}) {
  const g = new THREE.Group(); g.position.set(x, FLOOR, z); g.rotation.y = ry; R.add(g);
  const woodM = new THREE.MeshStandardMaterial({ color: wood, roughness: 0.62, envMapIntensity: 0.25 });
  const parts = [];
  const add = (w, h, d, px, py, pz) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(px, py, pz); parts.push(b); };
  add(width, 0.05, depth, 0, height, 0); add(width, 0.12, depth, 0, 0.06, 0);
  add(0.05, height, depth, -width / 2, height / 2, 0); add(0.05, height, depth, width / 2, height / 2, 0);
  add(width, height, 0.02, 0, height / 2, -depth / 2);
  const rh = (height - 0.17) / rows;
  for (let r = 1; r < rows; r++) add(width, 0.035, depth, 0, 0.12 + r * rh, 0);
  for (let c = 1; c < Math.floor(width / 0.95); c++) add(0.04, height, depth, -width / 2 + c * width / Math.floor(width / 0.95), height / 2, 0);
  g.add(new THREE.Mesh(mergeGeometries(parts), woodM));
  // books
  let rnd = seed * 9301; const rand = () => (rnd = (rnd * 9301 + 49297) % 233280) / 233280;
  const list = [];
  for (let r = 0; r < rows; r++) {
    let bx = -width / 2 + 0.04; const by = 0.12 + r * rh + 0.0175;
    while (bx < width / 2 - 0.08) {
      if (rand() < 0.04) { bx += 0.06 + rand() * 0.12; continue; }   // a gap
      const th = 0.022 + rand() * 0.035, hh = Math.min(rh - 0.04, 0.17 + rand() * 0.12), dd = 0.17 + rand() * 0.08;
      const lean = rand() < 0.05 ? 0.12 : 0;
      list.push({ x: bx + th / 2, y: by + hh / 2, z: -depth / 2 + 0.03 + dd / 2, th, hh, dd, lean, c: rand() });
      bx += th + 0.002;
    }
  }
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const spine = tex(64, 256, (cx, w, h) => { cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.fillStyle = 'rgba(0,0,0,0.25)'; cx.fillRect(0, 22, w, 6); cx.fillRect(0, h - 30, w, 6); cx.fillStyle = 'rgba(255,230,160,0.55)'; cx.fillRect(10, 60, w - 20, 4); cx.fillRect(10, 74, w - 20, 2); noise(cx, w, h, 300, () => `rgba(0,0,0,${Math.random() * 0.12})`); });
  const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ map: spine, roughness: 0.8, envMapIntensity: 0.2 }), list.length);
  const palette = [0x6e1f1a, 0x1e3a5f, 0x2f4f2f, 0x5b3a1a, 0x7a5a2a, 0x3a2a4a, 0x8a6a3a, 0x24323f, 0x6a2a3a, 0x445566, 0x9a7a4a, 0x2a2a2a];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  list.forEach((b, i) => {
    q.setFromEuler(new THREE.Euler(0, 0, b.lean));
    m4.compose(new THREE.Vector3(b.x, b.y, b.z), q, new THREE.Vector3(b.th, b.hh, b.dd));
    im.setMatrixAt(i, m4); im.setColorAt(i, col.setHex(palette[Math.floor(b.c * palette.length)]).multiplyScalar(0.8 + b.c * 0.4));
  });
  g.add(im);
  return g;
}
// a rug: an ornamental pattern painted on a canvas
function rugTex(c1, c2, c3) {
  return tex(1024, 640, (g, w, h) => {
    g.fillStyle = c1; g.fillRect(0, 0, w, h);
    g.strokeStyle = c3; g.lineWidth = 18; g.strokeRect(30, 30, w - 60, h - 60); g.lineWidth = 6; g.strokeRect(62, 62, w - 124, h - 124);
    g.fillStyle = c2; for (let i = 0; i < 26; i++) { g.save(); g.translate(46 + i * (w - 92) / 25, 46); g.rotate(Math.PI / 4); g.fillRect(-8, -8, 16, 16); g.restore(); g.save(); g.translate(46 + i * (w - 92) / 25, h - 46); g.rotate(Math.PI / 4); g.fillRect(-8, -8, 16, 16); g.restore(); }
    g.save(); g.translate(w / 2, h / 2);
    for (let r = 0; r < 3; r++) { g.beginPath(); for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI * 2, rr = (i % 2 ? 150 : 210) - r * 55; g.lineTo(Math.cos(a) * rr * 1.25, Math.sin(a) * rr * 0.8); } g.closePath(); g.fillStyle = r % 2 ? c3 : c2; g.fill(); }
    g.restore();
    noise(g, w, h, 20000, () => `rgba(0,0,0,${Math.random() * 0.12})`);
  });
}

// ---------------------------------------------------------------- the quiet library
export function library() {
  const R = new THREE.Group(), W = 7, D = 9, H = 4.2;
  R.add(new THREE.HemisphereLight(0xffe6c8, 0x3a2a1a, 0.55));
  const sunL = new THREE.DirectionalLight(0xfff0d8, 1.6); sunL.position.set(-2, 3, -6); R.add(sunL);
  // floor, walls, coffered ceiling
  plane(R, W, D, pbr('wood_floor', { repeat: [5, 6], envI: 0.15 }), 0, FLOOR, 0, 0, -Math.PI / 2);
  const wall = pbr('grey_plaster', { color: 0xf0e2c8, repeat: [3, 2], envI: 0.12 });
  plane(R, D, H, wall, -W / 2, FLOOR + H / 2, 0, Math.PI / 2); plane(R, D, H, wall, W / 2, FLOOR + H / 2, 0, -Math.PI / 2);
  // wood panelling under the windows
  box(R, W, 0.72, 0.04, pbr('dark_wood', { color: 0xb08060, repeat: [4, 1], envI: 0.2 }), 0, FLOOR + 0.36, -D / 2 + 0.03);
  plane(R, W, H, wall, 0, FLOOR + H / 2, D / 2, Math.PI);
  plane(R, W, D, std(0x5a3e28, { roughness: 0.7 }), 0, FLOOR + H, 0, 0, Math.PI / 2);
  for (let i = -2; i <= 2; i++) box(R, 0.12, 0.16, D, std(0x4a3020), i * 1.4, FLOOR + H - 0.08, 0);
  // the window wall in front: two tall arched windows with the mountains outside
  const front = new THREE.Shape(); front.moveTo(-W / 2, 0); front.lineTo(W / 2, 0); front.lineTo(W / 2, H); front.lineTo(-W / 2, H); front.closePath();
  for (const cx of [-1.35, 1.35]) { const hole = new THREE.Path(); hole.moveTo(cx - 0.75, 0.75); hole.lineTo(cx + 0.75, 0.75); hole.lineTo(cx + 0.75, 2.6); hole.absarc(cx, 2.6, 0.75, 0, Math.PI, false); hole.lineTo(cx - 0.75, 0.75); front.holes.push(hole); }
  const fw = new THREE.Mesh(new THREE.ShapeGeometry(front, 24), wall); fw.position.set(0, FLOOR, -D / 2); R.add(fw);
  for (const cx of [-1.35, 1.35]) {
    const frameM = std(0x3b2616, { roughness: 0.5 });
    box(R, 1.6, 0.08, 0.2, frameM, cx, FLOOR + 0.71, -D / 2);
    for (const dx of [-0.77, 0, 0.77]) box(R, 0.06, 1.9, 0.12, frameM, cx + dx, FLOOR + 1.68, -D / 2);
    for (const dy of [1.3, 1.95]) box(R, 1.5, 0.05, 0.1, frameM, cx, FLOOR + dy, -D / 2);
    // sunlight falling in (soft beams) and the light on the floor
    const beam = plane(R, 1.2, 4.0, new THREE.MeshBasicMaterial({ map: tex(64, 256, (g, w, h) => { const q = g.createLinearGradient(0, 0, 0, h); q.addColorStop(0, 'rgba(255,240,200,0.0)'); q.addColorStop(0.3, 'rgba(255,236,190,0.07)'); q.addColorStop(1, 'rgba(255,236,190,0)'); g.fillStyle = q; g.fillRect(0, 0, w, h); const e = g.createLinearGradient(0, 0, w, 0); e.addColorStop(0, 'rgba(0,0,0,1)'); e.addColorStop(0.3, 'rgba(0,0,0,0)'); e.addColorStop(0.7, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = e; g.fillRect(0, 0, w, h); }), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), cx * 0.8, FLOOR + 1.5, -D / 2 + 1.6, 0, -0.95);
    beam.renderOrder = -2;
    glow(R, 1.6, 2.4, 0xffe2b0, 0.25, cx * 0.7, FLOOR + 0.01, -D / 2 + 2.6, 0, -Math.PI / 2);
  }
  const view = photoSphere('alps_field.jpg', Math.PI * 0.9); view.scale.set(-1.4, 1.4, 1.4); view.position.y = 0.6; R.add(view);
  // walls of books: both sides and behind you
  bookcase(R, -W / 2 + 0.2, -2.2, Math.PI / 2, 3.6, 3.3, { seed: 1 }); bookcase(R, -W / 2 + 0.2, 1.8, Math.PI / 2, 3.6, 3.3, { seed: 2 });
  bookcase(R, W / 2 - 0.2, -2.2, -Math.PI / 2, 3.6, 3.3, { seed: 3 }); bookcase(R, W / 2 - 0.2, 1.8, -Math.PI / 2, 3.6, 3.3, { seed: 4 });
  bookcase(R, -1.6, D / 2 - 0.2, Math.PI, 3.0, 3.3, { seed: 5 }); bookcase(R, 1.6, D / 2 - 0.2, Math.PI, 3.0, 3.3, { seed: 6 });
  // a big rug and the long reading table in front of you with two green lamps
  plane(R, 3.6, 2.4, new THREE.MeshStandardMaterial({ map: rugTex('#6e2420', '#c9a25a', '#2b3a55'), roughness: 1, envMapIntensity: 0.1 }), 0, FLOOR + 0.006, -1.3, 0, -Math.PI / 2);
  const tz = -1.55, tt = FLOOR + 0.76, dark = pbr('dark_wood', { repeat: [2, 1], envI: 0.25 });
  box(R, 2.4, 0.06, 0.95, dark, 0, tt, tz);
  for (const sx of [-1.1, 1.1]) for (const sz of [-0.38, 0.38]) box(R, 0.08, 0.73, 0.08, dark, sx, FLOOR + 0.365, tz + sz);
  box(R, 2.2, 0.1, 0.06, dark, 0, tt - 0.08, tz + 0.42); box(R, 2.2, 0.1, 0.06, dark, 0, tt - 0.08, tz - 0.42);
  const lamp = x => {
    const brass = std(0xc9a24a, { metalness: 0.85, roughness: 0.3, envMapIntensity: 0.9 });
    cyl(R, 0.07, 0.08, 0.02, brass, x, tt + 0.04, tz - 0.25); cyl(R, 0.008, 0.008, 0.3, brass, x, tt + 0.19, tz - 0.25, 8);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.13, 0.11, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x0f6b45, emissive: 0x0a4a2f, emissiveIntensity: 0.6, roughness: 0.25, metalness: 0.2, side: THREE.DoubleSide }));
    shade.position.set(x, tt + 0.34, tz - 0.25); shade.rotation.x = 0.25; R.add(shade);
    glow(R, 0.7, 0.45, 0xffd28a, 0.55, x, tt + 0.02, tz - 0.2, 0, -Math.PI / 2);
    pointL(R, 0xffcf8a, 1.4, 2.6, x, tt + 0.28, tz - 0.15);
  };
  lamp(-0.75); lamp(0.75);
  // stacked books and an open book on the table
  [[0x7a2b25, 0.05], [0x1e3a5f, 0.045], [0x2f4f2f, 0.04]].forEach(([c, h], i) => box(R, 0.24, h, 0.17, std(c, { roughness: 0.8 }), 0.35, tt + 0.03 + h / 2 + i * 0.045, tz + 0.1).rotation.y = i * 0.18);
  (async () => {
    const [chair, chandelier, oil, rock, globeStand] = await Promise.all(['ArmChair_01', 'Chandelier_03', 'vintage_oil_lamp', 'Rockingchair_01', 'mantel_clock_01'].map(glb));
    R.add(place(tame(chair, 0.25), { x: -1.55, z: -0.9, ry: 0.65, height: 1.05 }));
    R.add(place(tame(rock, 0.25), { x: 1.7, z: -0.7, ry: -0.8, height: 1.0 }));
    const ch = place(tame(chandelier, 0.5), { x: 0, z: -1.5, height: 0.8, y0: FLOOR + H - 0.85 }); R.add(ch);
    pointL(R, 0xffd9a0, 1.2, 5, 0, FLOOR + H - 0.9, -1.5);
    R.add(place(tame(oil, 0.4), { x: -0.25, z: tz + 0.05, height: 0.3, y0: tt + 0.03 }));
    R.add(place(tame(globeStand, 0.3), { x: 2.6, z: -3.9, ry: -0.3, height: 0.3, y0: FLOOR + 1.0 }));
    R.userData.shadowsDirty = true;
  })().catch(e => console.warn('library', e));
  // dust in the sunbeams
  const n = 120, dp = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const cx = (i % 2 ? 1 : -1) * 1.1; dp.set([cx + (Math.random() - 0.5) * 1.2, FLOOR + 0.3 + Math.random() * 2.6, -D / 2 + 0.8 + Math.random() * 2.2], i * 3); }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xfff1cf, size: 0.006, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  R.add(dust);
  R.userData.dim = 0.35;
  return ticking(R, (dt, t) => { const p = dg.attributes.position; for (let i = 0; i < n; i++) { let y = p.getY(i) + dt * 0.02 * (0.5 + (i % 7) / 7); if (y > FLOOR + 2.9) y = FLOOR + 0.3; p.setY(i, y); p.setX(i, p.getX(i) + Math.sin(t * 0.3 + i) * dt * 0.01); } p.needsUpdate = true; });
}

// ---------------------------------------------------------------- a city at night seen from high up (real depth, one draw call)
function nightCity(R, yaw = 0, { count = 420, near = 70, far = 430, eye = 85 } = {}) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(470, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
      void main(){ float y = vP.y; vec3 c = mix(vec3(0.16, 0.12, 0.24), vec3(0.015, 0.02, 0.06), smoothstep(-0.05, 0.45, y));
        c += vec3(0.35, 0.18, 0.12) * exp(-abs(y + 0.02) * 14.0) * 0.6;   // city glow on the haze
        vec3 q = floor(vP * 300.0); float s = step(0.9965, h(q)) * smoothstep(0.08, 0.3, y); c += vec3(s) * 0.8;
        if (y < -0.02) c = mix(vec3(0.05, 0.04, 0.07), vec3(0.01), smoothstep(-0.02, -0.4, y));
        gl_FragColor = vec4(c, 1.0); }` }));
  sky.renderOrder = -5; R.add(sky);
  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
  const size = new Float32Array(count * 3), seed = new Float32Array(count);
  const im = new THREE.InstancedMesh(geo, null, count);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const a = yaw + (Math.random() - 0.5) * 2.4, d = near + Math.pow(Math.random(), 0.55) * (far - near);
    // we are high up: the near blocks stay below the window, the towers rise far away on the horizon
    const cap = d < 150 ? 62 : d < 280 ? 105 : 200;
    const w = 14 + Math.random() * 26, dd = 14 + Math.random() * 26, h = 12 + Math.pow(Math.random(), 2.2) * cap;
    m4.makeRotationY(Math.random() * 0.4 - 0.2); m4.setPosition(-Math.sin(a) * d, -eye, -Math.cos(a) * d);
    m4.multiply(new THREE.Matrix4().makeScale(w, h, dd));
    im.setMatrixAt(i, m4); size.set([w, h, dd], i * 3); seed[i] = Math.random();
  }
  geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 3)); geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
  im.material = new THREE.ShaderMaterial({
    vertexShader: `attribute vec3 aSize; attribute float aSeed; varying vec2 vC; varying float vTop; varying float vSeed; varying float vFog;
      void main(){ vec3 n = normal; vTop = step(0.5, n.y); vSeed = aSeed;
        vec3 p = position; vec2 f = abs(n.x) > 0.5 ? vec2(p.z * aSize.z, p.y * aSize.y) : vec2(p.x * aSize.x, p.y * aSize.y);
        vC = f / vec2(2.8, 3.4); vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0); vFog = smoothstep(120.0, 440.0, length(wp.xz));
        gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `varying vec2 vC; varying float vTop; varying float vSeed; varying float vFog;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)) + vSeed * 91.3) * 43758.5453); }
      void main(){ vec3 base = vec3(0.025, 0.03, 0.045);
        if (vTop > 0.5) { gl_FragColor = vec4(base * 0.7, 1.0); return; }
        vec2 cell = floor(vC), f = fract(vC); float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.22, f.y) * step(f.y, 0.78);
        float r = h(cell), on = step(0.66, r);
        vec3 lit = mix(vec3(1.0, 0.78, 0.45), vec3(0.75, 0.88, 1.0), step(0.85, h(cell + 7.0))) * (0.55 + 0.45 * h(cell + 3.0));
        vec3 c = base + win * on * lit * 0.85 + win * (1.0 - on) * vec3(0.03, 0.04, 0.06);
        c *= 0.75 + 0.25 * step(0.5, fract(vSeed * 13.0));
        c = mix(c, vec3(0.16, 0.12, 0.24) * 0.6, vFog * 0.75);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  R.add(im);
  return im;
}

// ---------------------------------------------------------------- an office with a view (sunset city / night city)
export function viewOffice(night = false) {
  const R = new THREE.Group(), W = 6.4, D = 6.4, H = 3.1, GZ = -2.9;
  if (night) nightCity(R, 0);
  else { const view = photoSphere('sunset_jhbcentral.jpg', -1.19); view.scale.set(-1.5, 1.5, 1.5); view.position.y = -0.2; R.add(view); }
  R.add(new THREE.HemisphereLight(night ? 0x8fa8ff : 0xffd6b0, night ? 0x1a1a2a : 0x4a3a30, night ? 0.35 : 0.75));
  const key = new THREE.DirectionalLight(night ? 0x9fb4ff : 0xffb27a, night ? 0.5 : 1.8); key.position.set(-1.5, 1.2, -5); R.add(key);
  plane(R, W, D, pbr(night ? 'laminate_floor_02' : 'marble_01', { repeat: night ? [4, 4] : [3, 3], envI: 0.35, rough: night ? 1 : 0.6 }), 0, FLOOR, 0, 0, -Math.PI / 2);
  const wall = pbr('grey_plaster', { color: night ? 0x6c6f7a : 0xe0d6cc, repeat: [3, 2], envI: 0.1 });
  plane(R, D, H, wall, -W / 2, FLOOR + H / 2, 0, Math.PI / 2); plane(R, D, H, wall, W / 2, FLOOR + H / 2, 0, -Math.PI / 2); plane(R, W, H, wall, 0, FLOOR + H / 2, D / 2, Math.PI);
  plane(R, W, D, std(night ? 0x2a2c33 : 0xf2efea, { roughness: 0.9 }), 0, FLOOR + H, 0, 0, Math.PI / 2);
  // the glass wall: thin black mullions, a faint reflection
  const mull = std(0x16171b, { metalness: 0.6, roughness: 0.35 });
  for (let i = 0; i <= 5; i++) box(R, 0.05, H, 0.08, mull, -W / 2 + i * W / 5, FLOOR + H / 2, GZ);
  box(R, W, 0.08, 0.1, mull, 0, FLOOR + 0.04, GZ); box(R, W, 0.1, 0.1, mull, 0, FLOOR + H - 0.05, GZ); box(R, W, 0.04, 0.06, mull, 0, FLOOR + 1.0, GZ);
  plane(R, W, H, new THREE.MeshBasicMaterial({ color: night ? 0x8899cc : 0xffe0c0, transparent: true, opacity: 0.05, depthWrite: false }), 0, FLOOR + H / 2, GZ + 0.01);
  // desk facing the view: walnut top, black frame; laptop, lamp, plant
  const dz = -1.5, top = FLOOR + 0.75, walnut = pbr('dark_wood', { color: 0xc89a70, repeat: [2, 1], envI: 0.3, rough: 0.7 });
  box(R, 1.8, 0.045, 0.8, walnut, 0, top, dz);
  for (const sx of [-0.85, 0.85]) { box(R, 0.05, 0.73, 0.05, mull, sx, FLOOR + 0.365, dz - 0.34); box(R, 0.05, 0.73, 0.05, mull, sx, FLOOR + 0.365, dz + 0.34); box(R, 0.05, 0.05, 0.7, mull, sx, FLOOR + 0.05, dz); }
  if (night) { glow(R, 1.2, 0.8, 0xffd59a, 0.4, 0.55, top + 0.01, dz, 0, -Math.PI / 2); pointL(R, 0xffd08a, 1.2, 2.4, 0.55, top + 0.5, dz); }
  (async () => {
    const names = ['classic_laptop', 'desk_lamp_arm_01', 'pachira_aquatica_01', 'sofa_03', 'coffee_table_round_01', 'ceramic_vase_04', 'wall_clock', 'hanging_picture_frame_03', 'modern_ceiling_lamp_01', 'modern_arm_chair_01'];
    const [laptop, lamp, plant, sofa, table, vase, clock, frame, ceil, chair] = await Promise.all(names.map(glb));
    const E = night ? 0.15 : 0.35;
    R.add(place(tame(laptop, E), { x: -0.15, z: dz + 0.05, height: 0.24, y0: top + 0.022 }));
    R.add(place(tame(lamp, E), { x: 0.65, z: dz - 0.1, ry: -0.6, height: 0.55, y0: top + 0.022 }));
    R.add(place(tame(chair, E), { x: 0.0, z: dz + 0.75, ry: Math.PI + 0.15, height: 0.95 }));
    R.add(place(tame(plant, E), { x: -2.6, z: -2.3, height: 1.6 }));
    R.add(place(tame(sofa, E), { x: 2.3, z: 0.6, ry: -Math.PI / 2, height: 0.8 }));
    const t = place(tame(table, E), { x: 1.25, z: 0.6, height: 0.42 }); R.add(t);
    R.add(place(tame(vase, E), { on: t, height: 0.28 }));
    R.add(place(tame(clock, E), { x: -W / 2 + 0.05, z: 0.5, ry: Math.PI / 2, height: 0.4, y0: FLOOR + 1.9 }));
    R.add(place(tame(frame, E), { x: W / 2 - 0.05, z: -0.6, ry: -Math.PI / 2, height: 0.9, y0: FLOOR + 1.1 }));
    for (const x of [-1.2, 1.2]) R.add(place(tame(ceil.clone(true), E), { x, z: -0.6, height: 0.5, y0: FLOOR + H - 0.52 }));
    R.userData.shadowsDirty = true;
  })().catch(e => console.warn('office', e));
  R.userData.dim = night ? 0.3 : 0.5;
  return R;
}

// ---------------------------------------------------------------- the gaming room
const THEMES = { neon: [0x8a3cff, 0x18d8ff], red: [0xff2a3c, 0xff9a1a] };
export function gaming(theme = 'neon') {
  const [c1, c2] = THEMES[theme] || THEMES.neon;
  const R = new THREE.Group(), W = 5.2, D = 5.2, H = 2.8, BW = -2.3;
  R.add(new THREE.HemisphereLight(0x6070a0, 0x101018, 0.35));
  const wallM = pbr('grey_plaster', { color: 0x2a2b33, repeat: [3, 2], envI: 0.05 });
  plane(R, W, D, pbr('laminate_floor_02', { color: 0x4a4a55, repeat: [4, 4], envI: 0.25 }), 0, FLOOR, 0, 0, -Math.PI / 2);
  plane(R, D, H, wallM, -W / 2, FLOOR + H / 2, 0, Math.PI / 2); plane(R, W, H, wallM, 0, FLOOR + H / 2, D / 2, Math.PI);
  plane(R, W, D, std(0x15161b), 0, FLOOR + H, 0, 0, Math.PI / 2);
  // right wall with a window on the night city
  const rw = new THREE.Shape(); rw.moveTo(-D / 2, 0); rw.lineTo(D / 2, 0); rw.lineTo(D / 2, H); rw.lineTo(-D / 2, H); rw.closePath();
  const hole = new THREE.Path(); hole.moveTo(-1.4, 0.9); hole.lineTo(0.6, 0.9); hole.lineTo(0.6, 2.3); hole.lineTo(-1.4, 2.3); hole.closePath(); rw.holes.push(hole);
  const rwm = new THREE.Mesh(new THREE.ShapeGeometry(rw), wallM); rwm.position.set(W / 2, FLOOR, 0); rwm.rotation.y = -Math.PI / 2; R.add(rwm);
  const frameM = std(0x0d0d10, { metalness: 0.5, roughness: 0.4 });
  box(R, 0.08, 1.4, 0.06, frameM, W / 2 - 0.02, FLOOR + 1.6, -0.4); box(R, 0.08, 0.06, 2.0, frameM, W / 2 - 0.02, FLOOR + 1.6, -0.4);
  nightCity(R, -Math.PI / 2, { count: 220 });
  // front wall: hexagon acoustic panels with light running through their edges (animated)
  plane(R, W, H, wallM, 0, FLOOR + H / 2, BW - 0.25);
  const hexU = { uT: { value: 0 }, c1: { value: new THREE.Color(c1) }, c2: { value: new THREE.Color(c2) } };
  const hexM = new THREE.ShaderMaterial({ uniforms: hexU, transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uT; uniform vec3 c1, c2; varying vec2 vUv;
      float hexd(vec2 p){ p = abs(p); return max(dot(p, normalize(vec2(1.0, 1.732))), p.x); }
      void main(){ vec2 uv = vUv * vec2(9.0, 4.6); vec2 r = vec2(1.0, 1.732); vec2 h = r * 0.5;
        vec2 a = mod(uv, r) - h, b = mod(uv - h, r) - h; vec2 g = dot(a, a) < dot(b, b) ? a : b; vec2 id = uv - g;
        float d = hexd(g); float edge = smoothstep(0.47, 0.5, d) - smoothstep(0.5, 0.53, d);
        float wave = 0.5 + 0.5 * sin(uT * 1.2 - id.x * 0.7 + id.y * 0.5);
        vec3 col = mix(c1, c2, wave); float fill = 0.08 + 0.1 * step(0.86, fract(sin(dot(id, vec2(12.9, 78.2))) * 43758.5)) * wave;
        gl_FragColor = vec4(col * (edge * 1.4 + fill), edge * 0.95 + fill); }` });
  const hex = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 1.6), hexM); hex.position.set(0, FLOOR + 1.95, BW - 0.24); hex.renderOrder = -2; R.add(hex);
  // neon sign
  const sign = tex(1024, 256, (g, w, h) => { g.font = '900 170px system-ui, "Geeza Pro", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl'; g.shadowColor = '#fff'; g.shadowBlur = 40; g.fillStyle = '#ffffff'; g.fillText('مدار', w / 2, h / 2 + 8); });
  const signM = new THREE.MeshBasicMaterial({ map: sign, color: new THREE.Color(c2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  plane(R, 1.2, 0.3, signM, -1.75, FLOOR + 2.2, BW - 0.2).renderOrder = -2;
  glow(R, 1.8, 0.8, c2, 0.35, -1.75, FLOOR + 2.2, BW - 0.22);
  // LED strips along the ceiling and under the desk
  const ledU = { uT: { value: 0 }, c1: hexU.c1, c2: hexU.c2 };
  const ledM = new THREE.ShaderMaterial({ uniforms: ledU, toneMapped: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vP,1.0); }',
    fragmentShader: 'uniform float uT; uniform vec3 c1, c2; varying vec3 vP; void main(){ float w = 0.5 + 0.5 * sin(uT * 2.0 + (vP.x + vP.z) * 1.5); gl_FragColor = vec4(mix(c1, c2, w) * 1.3, 1.0); }' });
  const strips = [];
  const strip = (w, x, y, z, ry = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, 0.02), ledM); m.position.set(x, y, z); m.rotation.y = ry; R.add(m); strips.push(m); };
  strip(W - 0.1, 0, FLOOR + H - 0.05, BW - 0.2); strip(D - 0.1, -W / 2 + 0.05, FLOOR + H - 0.05, 0, Math.PI / 2); strip(D - 0.1, W / 2 - 0.05, FLOOR + H - 0.05, 0, Math.PI / 2); strip(W - 0.1, 0, FLOOR + H - 0.05, D / 2 - 0.05);
  glow(R, W, 0.9, c1, 0.25, 0, FLOOR + H - 0.2, BW - 0.22); glow(R, W, 0.9, c2, 0.18, 0, FLOOR + H - 0.12, D / 2 - 0.1, Math.PI);
  pointL(R, c1, 1.0, 4, -1.5, FLOOR + H - 0.3, -1); pointL(R, c2, 1.0, 4, 1.5, FLOOR + H - 0.3, -1);
  // the desk: black top, RGB light underneath
  const dz = BW + 0.45, top = FLOOR + 0.75, black = std(0x111114, { roughness: 0.35, metalness: 0.2 });
  box(R, 2.2, 0.04, 0.8, black, 0, top, dz);
  for (const sx of [-1.0, 1.0]) box(R, 0.06, 0.73, 0.7, black, sx, FLOOR + 0.365, dz);
  strip(2.15, 0, top - 0.03, dz + 0.4);
  glow(R, 2.6, 0.8, c1, 0.4, 0, top - 0.02, dz + 0.1, 0, Math.PI / 2);
  glow(R, 2.8, 1.0, c2, 0.3, 0, FLOOR + 0.02, dz + 0.2, 0, -Math.PI / 2);
  // three monitors: a curved centre screen playing a synthwave scene + two side screens
  const screen = tex(1024, 512, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h * 0.62); sky.addColorStop(0, '#0b0326'); sky.addColorStop(1, theme === 'red' ? '#ff4a2a' : '#c33cff'); g.fillStyle = sky; g.fillRect(0, 0, w, h * 0.62);
    g.fillStyle = theme === 'red' ? '#ffd23a' : '#ff9ad5'; g.beginPath(); g.arc(w / 2, h * 0.5, 110, Math.PI, 0); g.fill();
    g.fillStyle = '#0b0326'; for (let i = 0; i < 6; i++) g.fillRect(w / 2 - 120, h * 0.5 - 70 + i * 14, 240, 4 + i);
    g.fillStyle = '#120830'; g.beginPath(); g.moveTo(0, h * 0.62); for (let x = 0; x <= w; x += 32) g.lineTo(x, h * 0.62 - 30 - Math.abs(Math.sin(x * 0.013)) * 70 - (x % 96 ? 0 : 25)); g.lineTo(w, h * 0.62); g.fill();
    g.fillStyle = '#05020f'; g.fillRect(0, h * 0.62, w, h); g.strokeStyle = theme === 'red' ? '#ff5a3a' : '#37f0ff'; g.lineWidth = 2;
    for (let i = 0; i < 14; i++) { const y = h * 0.62 + Math.pow(i / 14, 2) * h * 0.38; g.globalAlpha = 0.3 + i / 20; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    for (let i = -16; i <= 16; i++) { g.beginPath(); g.moveTo(w / 2 + i * 12, h * 0.62); g.lineTo(w / 2 + i * 90, h); g.stroke(); }
  });
  screen.wrapS = THREE.RepeatWrapping; screen.repeat.x = -1;   // seen from inside the curve
  const monM = new THREE.MeshBasicMaterial({ map: screen, toneMapped: false, side: THREE.BackSide });
  const curve = new THREE.CylinderGeometry(1.6, 1.6, 0.42, 32, 1, true, Math.PI - 0.28, 0.56);
  const mon = new THREE.Mesh(curve, monM); mon.position.set(0, top + 0.42, dz + 1.33); R.add(mon);
  box(R, 0.06, 0.26, 0.06, black, 0, top + 0.15, dz - 0.2); box(R, 0.3, 0.015, 0.2, black, 0, top + 0.03, dz - 0.18);
  const side = tex(512, 320, (g, w, h) => { g.fillStyle = '#0a0d18'; g.fillRect(0, 0, w, h); g.fillStyle = '#18d8ff'; g.font = '700 26px system-ui'; g.fillText('FPS 144  ·  PING 12ms', 20, 40); for (let i = 0; i < 9; i++) { g.fillStyle = i % 2 ? '#1c2440' : '#141a30'; g.fillRect(20, 70 + i * 26, w - 40, 22); g.fillStyle = '#8fa4d8'; g.font = '18px system-ui'; g.fillText('Player_' + (i + 1) + '   ' + (2400 - i * 130), 30, 87 + i * 26); } });
  for (const sx of [-1, 1]) { const m = plane(R, 0.52, 0.32, new THREE.MeshBasicMaterial({ map: side, toneMapped: false }), sx * 0.86, top + 0.38, dz - 0.05, -sx * 0.5); box(R, 0.54, 0.34, 0.02, black, sx * 0.86 + sx * 0.005, top + 0.38, dz - 0.062).rotation.y = -sx * 0.5; }
  glow(R, 2.4, 1.2, c1, 0.35, 0, top + 0.45, BW - 0.2);
  // keyboard (lit keys) and mouse
  box(R, 0.44, 0.02, 0.14, black, -0.05, top + 0.03, dz + 0.18);
  plane(R, 0.42, 0.12, new THREE.MeshBasicMaterial({ map: tex(256, 64, (g, w, h) => { g.fillStyle = '#0a0a0e'; g.fillRect(0, 0, w, h); for (let r = 0; r < 4; r++) for (let c = 0; c < 15; c++) { g.fillStyle = `hsl(${(c * 18 + r * 30) % 360},90%,60%)`; g.fillRect(4 + c * 16.5, 4 + r * 15, 13, 11); } }), toneMapped: false }), -0.05, top + 0.041, dz + 0.18, 0, -Math.PI / 2);
  box(R, 0.06, 0.03, 0.1, black, 0.32, top + 0.035, dz + 0.2);
  // the gaming chair: bucket seat, tall winged back with coloured stripes, star base on wheels
  const chair = new THREE.Group(); chair.position.set(1.05, FLOOR, -0.55); chair.rotation.y = Math.PI * 0.72; R.add(chair);
  const leather = std(0x16161a, { roughness: 0.45 }), stripeM = std(c1, { roughness: 0.4, emissive: new THREE.Color(c1).multiplyScalar(0.15) });
  box(chair, 0.52, 0.1, 0.5, leather, 0, 0.5, 0);
  for (const sx of [-1, 1]) { box(chair, 0.08, 0.12, 0.48, leather, sx * 0.25, 0.57, 0); box(chair, 0.05, 0.25, 0.05, black, sx * 0.3, 0.68, 0.05); box(chair, 0.07, 0.03, 0.26, leather, sx * 0.3, 0.8, 0.05); }
  const back = box(chair, 0.5, 0.82, 0.1, leather, 0, 0.98, -0.25); back.rotation.x = -0.12;
  for (const sx of [-1, 1]) { const w = box(chair, 0.07, 0.62, 0.12, leather, sx * 0.27, 1.0, -0.22); w.rotation.set(-0.12, 0, -sx * 0.12); const s = box(chair, 0.06, 0.66, 0.02, stripeM, sx * 0.17, 0.98, -0.198); s.rotation.x = -0.12; }
  box(chair, 0.26, 0.12, 0.04, stripeM, 0, 1.32, -0.29).rotation.x = -0.12;
  cyl(chair, 0.03, 0.03, 0.3, black, 0, 0.3, 0, 12);
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, leg = box(chair, 0.06, 0.04, 0.32, black, Math.sin(a) * 0.16, 0.08, Math.cos(a) * 0.16); leg.rotation.y = a; cyl(chair, 0.03, 0.03, 0.04, black, Math.sin(a) * 0.32, 0.03, Math.cos(a) * 0.32, 10).rotation.z = Math.PI / 2; }
  // shelf with lit figures, the console, the controller and a dartboard
  const shelfY = FLOOR + 1.45;
  box(R, 0.25, 0.03, 1.6, black, -W / 2 + 0.14, shelfY, -0.6); strip(1.55, -W / 2 + 0.26, shelfY - 0.02, -0.6, Math.PI / 2);
  (async () => {
    const [pad, cons, duck, dart] = await Promise.all(['gamepad', 'gaming_console', 'rubber_duck_toy', 'dartboard'].map(glb));
    R.add(place(tame(pad, 0.4), { x: 0.55, z: dz + 0.15, ry: 0.4, height: 0.05, y0: top + 0.02 }));
    R.add(place(tame(cons, 0.4), { x: -0.9, z: dz - 0.05, ry: 0.3, height: 0.09, y0: top + 0.02 }));
    R.add(place(tame(duck.clone(true), 0.4), { x: -W / 2 + 0.14, z: -1.1, ry: Math.PI / 2, height: 0.16, y0: shelfY + 0.015 }));
    R.add(place(tame(duck, 0.4, 0xff70d0), { x: -W / 2 + 0.14, z: -0.2, ry: Math.PI / 2 + 0.5, height: 0.12, y0: shelfY + 0.015 }));
    R.add(place(tame(dart, 0.4), { x: -W / 2 + 0.03, z: 1.3, ry: Math.PI / 2, height: 0.45, y0: FLOOR + 1.35 }));
  })().catch(e => console.warn('gaming', e));
  // round rug
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.25, 48), new THREE.MeshStandardMaterial({ map: tex(512, 512, (g, w, h) => { g.fillStyle = '#16131f'; g.fillRect(0, 0, w, h); for (let r = 240; r > 0; r -= 30) { g.strokeStyle = r % 60 ? '#2a2440' : '#' + new THREE.Color(c1).multiplyScalar(0.5).getHexString(); g.lineWidth = 10; g.beginPath(); g.arc(w / 2, h / 2, r, 0, 7); g.stroke(); } noise(g, w, h, 15000, () => `rgba(255,255,255,${Math.random() * 0.05})`); }), roughness: 1, envMapIntensity: 0.05 }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(0, FLOOR + 0.005, -0.6); R.add(rug);
  R.userData.dim = 0.25;
  return ticking(R, (dt, t) => { hexU.uT.value = t; ledU.uT.value = t; });
}

// ---------------------------------------------------------------- the gym: a clear floor for the coach
// Rubber floor and a wooden training platform in front of you, a long mirror, windows on the mountains to the right,
// a dumbbell rack, kettlebells, a bench, wall bars and a punching bag - and nothing standing between you and the coach.
export function gym() {
  const R = new THREE.Group(), W = 7.5, D = 9, H = 3.4, FZ = -D / 2 + 0.6;
  R.add(new THREE.HemisphereLight(0xf6f8ff, 0x5a5e66, 1.6)); R.add(new THREE.AmbientLight(0xffffff, 0.35));
  const sunL = new THREE.DirectionalLight(0xfff2de, 1.3); sunL.position.set(5, 4, -2); R.add(sunL);
  // rubber tiles everywhere, a light wooden platform where the coach trains
  const rubber = tex(512, 512, (g, w, h) => { g.fillStyle = '#2b2e34'; g.fillRect(0, 0, w, h); noise(g, w, h, 26000, () => `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.12})`); g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h); });
  rubber.wrapS = rubber.wrapT = THREE.RepeatWrapping; rubber.repeat.set(W / 1, D / 1);
  plane(R, W, D, new THREE.MeshStandardMaterial({ map: rubber, roughness: 0.92, envMapIntensity: 0.1 }), 0, FLOOR, 0, 0, -Math.PI / 2);
  plane(R, 3.2, 3.0, pbr('laminate_floor_02', { color: 0xe8d2b4, repeat: [3, 3], envI: 0.2 }), 0, FLOOR + 0.004, -2.6, 0, -Math.PI / 2);
  // an exercise mat on the platform
  plane(R, 0.7, 1.8, std(0x1f8a7a, { roughness: 0.8 }), 0, FLOOR + 0.008, -2.55, Math.PI / 2, -Math.PI / 2);
  // walls (light concrete), ceiling with light panels
  const wall = std(0xe3e6eb, { roughness: 0.9 }), accent = std(0x1f8a7a, { roughness: 0.8 });
  plane(R, D, H, wall, -W / 2, FLOOR + H / 2, 0, Math.PI / 2); plane(R, W, H, wall, 0, FLOOR + H / 2, D / 2, Math.PI);
  plane(R, W, D, std(0xe9ebef, { roughness: 0.9 }), 0, FLOOR + H, 0, 0, Math.PI / 2);
  box(R, 0.02, 0.5, D, accent, -W / 2 + 0.012, FLOOR + 0.25, 0); box(R, W, 0.5, 0.02, accent, 0, FLOOR + 0.25, D / 2 - 0.012);
  for (const x of [-1.8, 0, 1.8]) for (const z of [-2.8, 0, 2.8]) { box(R, 1.2, 0.03, 0.6, emit(0xfafcff), x, FLOOR + H - 0.02, z); }
  pointL(R, 0xffffff, 0.8, 7, 0, FLOOR + H - 0.3, -2.4); pointL(R, 0xfff4e6, 0.5, 7, 0, FLOOR + H - 0.3, 1.5);
  // the front wall: a long mirror (soft reflections of the light) and the sign above it
  plane(R, W, H, wall, 0, FLOOR + H / 2, -D / 2, 0);
  const mirror = tex(1024, 512, (g, w, h) => {
    const q = g.createLinearGradient(0, 0, w, h); q.addColorStop(0, '#9aa6b2'); q.addColorStop(0.5, '#7d8995'); q.addColorStop(1, '#94a0ac'); g.fillStyle = q; g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.16; g.fillStyle = '#ffffff'; for (const [x, k] of [[120, 60], [330, 26], [610, 80], [860, 34]]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + k, 0); g.lineTo(x + k - 220, h); g.lineTo(x - 220, h); g.fill(); }
    g.globalAlpha = 0.5; g.fillStyle = '#c8ccd2'; g.fillRect(0, h * 0.78, w, h * 0.22);
  });
  plane(R, 5.2, 1.9, new THREE.MeshStandardMaterial({ map: mirror, roughness: 0.08, metalness: 0.6, envMapIntensity: 1.0 }), 0, FLOOR + 1.25, -D / 2 + 0.02);
  box(R, 5.3, 0.05, 0.04, std(0x9aa0a8, { metalness: 0.8, roughness: 0.3 }), 0, FLOOR + 2.22, -D / 2 + 0.03);
  box(R, 5.3, 0.05, 0.04, std(0x9aa0a8, { metalness: 0.8, roughness: 0.3 }), 0, FLOOR + 0.28, -D / 2 + 0.03);
  const sign = tex(1024, 256, (g, w, h) => { g.font = '900 150px system-ui, "Geeza Pro", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl'; g.shadowColor = '#7dffd6'; g.shadowBlur = 30; g.fillStyle = '#eafff8'; g.fillText('مدار · لياقة', w / 2, h / 2 + 6); });
  plane(R, 1.9, 0.48, new THREE.MeshBasicMaterial({ map: sign, transparent: true, depthWrite: false, toneMapped: false }), 0, FLOOR + 2.75, -D / 2 + 0.04).renderOrder = -2;
  glow(R, 2.6, 0.9, 0x34d399, 0.22, 0, FLOOR + 2.75, -D / 2 + 0.05);
  // the right wall: big windows on the mountains
  const rw = new THREE.Shape(); rw.moveTo(-D / 2, 0); rw.lineTo(D / 2, 0); rw.lineTo(D / 2, H); rw.lineTo(-D / 2, H); rw.closePath();
  for (const cz of [-2.4, 0.2]) { const hole = new THREE.Path(); hole.moveTo(cz - 1.1, 0.6); hole.lineTo(cz + 1.1, 0.6); hole.lineTo(cz + 1.1, 2.75); hole.lineTo(cz - 1.1, 2.75); hole.closePath(); rw.holes.push(hole); }
  const rwm = new THREE.Mesh(new THREE.ShapeGeometry(rw), wall); rwm.position.set(W / 2, FLOOR, 0); rwm.rotation.y = -Math.PI / 2; R.add(rwm);
  const frameM = std(0x2a2d33, { metalness: 0.6, roughness: 0.35 });
  for (const cz of [-2.4, 0.2]) { box(R, 0.1, 0.06, 2.24, frameM, W / 2 - 0.02, FLOOR + 0.6, cz); box(R, 0.1, 0.06, 2.24, frameM, W / 2 - 0.02, FLOOR + 2.75, cz); for (const dz of [-1.1, 0, 1.1]) box(R, 0.1, 2.2, 0.05, frameM, W / 2 - 0.02, FLOOR + 1.67, cz + dz); }
  const view = photoSphere('alps_field.jpg', -Math.PI * 0.35); view.scale.set(-1.5, 1.5, 1.5); view.position.y = 0.6; R.add(view);
  glow(R, 2.6, 2.2, 0xfff0d0, 0.2, W / 2 - 1.6, FLOOR + 0.01, 1.0, 0, -Math.PI / 2);
  // the left wall: a dumbbell rack (one draw call per material), kettlebells, a bench and the wall bars
  const steel = std(0x9ea4ac, { metalness: 0.85, roughness: 0.3, envMapIntensity: 0.8 }), rubberM = std(0x17191d, { roughness: 0.55 }), rack = std(0x1d1f24, { metalness: 0.4, roughness: 0.45 });
  const rx = -W / 2 + 0.45, rz0 = -1.4;
  for (const [y, d] of [[0.45, 0.32], [0.85, 0.24]]) { const b = box(R, d + 0.04, 0.04, 2.4, rack, rx + (0.32 - d) / 2, FLOOR + y, rz0); b.rotation.z = 0.12; }
  for (const dz of [-1.2, 1.2]) for (const dx of [0, 0.28]) box(R, 0.04, 0.9, 0.04, rack, rx - 0.14 + dx, FLOOR + 0.45, rz0 + dz);
  const n = 10, heads = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 0.07, 6), rubberM, n * 2), bars = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.015, 0.015, 0.26, 10), steel, n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  for (let i = 0; i < n; i++) {
    const upper = i >= 6, z = rz0 - 1.05 + (upper ? (i - 6) * 0.55 + 0.25 : i * 0.42), y = FLOOR + (upper ? 0.92 : 0.52), x = rx - (upper ? 0.02 : 0.05), k = upper ? 0.75 : 1 - i * 0.04;
    bars.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1)));
    for (const s of [-1, 1]) heads.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), m4.compose(new THREE.Vector3(x, y, z + s * 0.11), q, new THREE.Vector3(k, 1, k)));
  }
  R.add(heads, bars);
  for (let i = 0; i < 5; i++) {
    const kb = new THREE.Group(), s = 0.8 + i * 0.1; kb.position.set(-W / 2 + 0.4, FLOOR, 0.6 + i * 0.42); kb.scale.setScalar(s); R.add(kb);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 16), std([0x2b6cb0, 0x2f855a, 0xd69e2e, 0xc53030, 0x553c9a][i], { roughness: 0.4, metalness: 0.2 })); ball.position.y = 0.11; kb.add(ball);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.016, 10, 24, Math.PI), rubberM); handle.position.y = 0.19; kb.add(handle);
  }
  const bench = new THREE.Group(); bench.position.set(-2.3, FLOOR, 1.9); bench.rotation.y = 0.5; R.add(bench);
  box(bench, 0.32, 0.07, 1.25, std(0x222428, { roughness: 0.5 }), 0, 0.45, 0); box(bench, 0.3, 0.02, 1.22, std(0x34d399, { roughness: 0.6 }), 0, 0.49, 0);
  for (const z of [-0.5, 0.5]) { box(bench, 0.06, 0.42, 0.06, rack, 0, 0.21, z); box(bench, 0.42, 0.04, 0.06, rack, 0, 0.02, z); }
  for (const dz of [-0.45, 0.45]) box(R, 0.05, 2.6, 0.05, std(0xc9a77a, { roughness: 0.6 }), -W / 2 + 0.06, FLOOR + 1.3, -3.6 + dz);
  for (let j = 0; j < 14; j++) cyl(R, 0.018, 0.018, 0.9, std(0xd9bb8c, { roughness: 0.55 }), -W / 2 + 0.07, FLOOR + 0.18 + j * 0.17, -3.6, 10).rotation.x = Math.PI / 2;
  // the punching bag (hangs in the right corner, swaying a little)
  const bag = new THREE.Group(); bag.position.set(W / 2 - 1.1, FLOOR + H, -3.4); R.add(bag);
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.65, 6), steel); chain.position.y = -0.83; bag.add(chain);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 1.15, 28), std(0x9b1c1c, { roughness: 0.45 })); body.position.y = -2.23; bag.add(body);
  for (const y of [-1.67, -2.79]) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.192, 0.192, 0.06, 28), rubberM); cap.position.y = y; bag.add(cap); }
  // a wall clock, the time training
  glb('wall_clock').then(c => R.add(place(tame(c, 0.4), { x: -W / 2 + 0.05, z: 1.4, ry: Math.PI / 2, height: 0.42, y0: FLOOR + 2.2 }))).catch(() => {});
  R.userData.dim = 0.3;
  return ticking(R, (dt, t) => { bag.rotation.z = Math.sin(t * 0.9) * 0.025; bag.rotation.x = Math.sin(t * 0.7 + 1) * 0.02; });
}

// ---------------------------------------------------------------- photo-real reading room (a 360° photo + furniture)
export function readingRoom() {
  return realRoom('reading_room.jpg', 0.35, { sky: 0xfff2e0, ground: 0x6a5a4a, amb: 1.1, key: 0xfff0d8, keyI: 1.4, dir: [-2, 3, -1] }, async R => {
    const [chair, table, oil, books] = await Promise.all(['ArmChair_01', 'round_wooden_table_01', 'vintage_oil_lamp', 'book_encyclopedia_set_01'].map(glb));
    const t = place(table, { x: 0, z: -1.35, height: 0.62 }); R.add(t);
    R.add(place(oil, { on: t, dx: -0.15, height: 0.32 }));
    R.add(place(books, { on: t, dx: 0.2, dz: 0.05, height: 0.12, ry: 0.4 }));
    R.add(place(chair, { x: 1.1, z: -1.2, ry: -0.9, height: 1.05 }));
  });
}
