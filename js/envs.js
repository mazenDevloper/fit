// Virtual environments shown instead of (or dimming) the real room.
import * as THREE from 'three';
import { neonDesk, study, lounge, realStudy, realNeon, realStudio } from './rooms.js';
import { space, library, viewOffice, gaming, readingRoom, gym, neonLounge } from './rooms2.js';

export const ENVS = {
  passthrough: { label: 'الواقع', note: 'غرفتك الحقيقية', immersive: false },
  dim:         { label: 'خافت',  note: 'الواقع معتّماً للتركيز', immersive: false },
  night:       { label: 'ليل',   note: 'سماء مرصّعة بالنجوم', immersive: true },
  cinema:      { label: 'سينما', note: 'قاعة مظلمة للمشاهدة', immersive: true },
  sunset:      { label: 'غروب',  note: 'أفق دافئ مفتوح', immersive: true },
  neonDesk:    { label: 'مكتب النيون', note: 'غرفة هادئة بإضاءة خافتة', immersive: true },
  study:       { label: 'المكتب البنفسجي', note: 'مكتب نهاري بضوء الشمس', immersive: true },
  realNeon:    { label: 'مكتب النيون · واقعي', note: 'نفس الغرفة بخامات وإضاءة حقيقية', immersive: true },
  realStudio:  { label: 'المكتب البنفسجي · واقعي', note: 'نفس الغرفة بخامات وإضاءة حقيقية', immersive: true },
  lounge:      { label: 'صالة المدفأة', note: 'غرفة حقيقية · واقعية', immersive: true },
  realStudy:   { label: 'الصالة المضيئة', note: 'غرفة حقيقية بضوء النهار', immersive: true },
  space:       { label: 'الفضاء', note: 'الأرض تدور تحتك والنجوم حولك', immersive: true },
  library:     { label: 'المكتبة الهادئة', note: 'رفوف كتب ونوافذ على الجبال', immersive: true },
  reading:     { label: 'غرفة القراءة', note: 'غرفة حقيقية هادئة · واقعية', immersive: true },
  viewOffice:  { label: 'مكتب بإطلالة', note: 'غروب على المدينة', immersive: true },
  nightOffice: { label: 'مكتب ليلي', note: 'أضواء المدينة في الليل', immersive: true },
  gaming:      { label: 'غرفة الألعاب', note: 'نيون بنفسجي وشاشات', immersive: true },
  neonLounge:  { label: 'صالة النيون', note: 'أبيض ووردي وسماوي — كنب منحني وتلفاز', immersive: true },
  gym:         { label: 'صالة التمرين', note: 'أرض واسعة ومرآة ومعدات', immersive: true },
  gamingRed:   { label: 'غرفة الألعاب · أحمر', note: 'إضاءة حمراء وبرتقالية', immersive: true },
  jupiter:     { label: 'المشتري', note: 'على قمر جليدي والمشتري يملأ السماء', immersive: true },
  aurora:      { label: 'الشفق القطبي', note: 'جبال آيسلندا تحت أضواء الشمال', immersive: true },
  gallery:     { label: 'من المكتبة', note: 'بيئة اخترتها من مكتبة البيئات', immersive: true },
  mine:        { label: 'بيئتي', note: 'بيئة استوردتها أنت', immersive: true },
};
export const ENV_ORDER = Object.keys(ENVS).filter(k => k !== 'gallery' && k !== 'mine');
export const envKey = k => (k === 'immersive' ? 'night' : ENVS[k] ? k : 'passthrough');
export const isImmersive = k => ENVS[envKey(k)].immersive;

const VERT = 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
function dome(frag) {
  return new THREE.Mesh(new THREE.SphereGeometry(80, 48, 24), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, vertexShader: VERT, fragmentShader: frag }));
}
function stars(n, color, minY = 0.1) {
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * (1 - minY) + minY);
    pos.set([Math.sin(ph) * Math.cos(th) * 70, Math.cos(ph) * 70, Math.sin(ph) * Math.sin(th) * 70], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color, size: 0.18, transparent: true, opacity: 0.85, depthWrite: false }));
}
function floorGrid(color, opacity) {
  const f = new THREE.Mesh(new THREE.RingGeometry(0.3, 8, 64, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, wireframe: true, depthWrite: false }));
  f.rotation.x = -Math.PI / 2; f.position.y = -1.55;
  return f;
}

export function makeEnvironments() {
  const all = { gallery: new THREE.Group(), mine: new THREE.Group() };   // filled by the environments library (gallery.js)
  // Night sky
  let g = new THREE.Group();
  g.add(dome(`varying vec3 vP; void main(){ float h = vP.y; vec3 top = vec3(0.012,0.02,0.06); vec3 mid = vec3(0.05,0.06,0.13); vec3 low = vec3(0.10,0.07,0.12);
    vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.6)) : mix(mid, low, pow(-h, 0.5)); gl_FragColor = vec4(c,1.0); }`));
  g.add(stars(1800, 0xcfe2ff));
  g.add(floorGrid(0x8fb4ff, 0.05));
  all.night = g;
  // Cinema: dark room, soft glow where the screen usually sits
  g = new THREE.Group();
  g.add(dome(`varying vec3 vP; void main(){ float h = vP.y; vec3 c = mix(vec3(0.035,0.03,0.04), vec3(0.008,0.008,0.012), smoothstep(-0.2, 0.6, h));
    float glow = pow(max(0.0, -vP.z), 6.0) * smoothstep(-0.3, 0.2, h) * (1.0 - smoothstep(0.2, 0.5, h));
    c += vec3(0.05,0.06,0.09) * glow; gl_FragColor = vec4(c,1.0); }`));
  const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.MeshBasicMaterial({ color: 0x120d12 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -1.55; g.add(floor);
  for (let row = 0; row < 3; row++) for (let i = -4; i <= 4; i++) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.5), new THREE.MeshBasicMaterial({ color: 0x3a1418 }));
    seat.position.set(i * 0.62, -1.32 - 0, 1.4 + row * 0.9); g.add(seat);
  }
  all.cinema = g;
  // Sunset horizon
  g = new THREE.Group();
  g.add(dome(`varying vec3 vP; void main(){ float h = vP.y;
    vec3 c = h > 0.0 ? mix(vec3(1.0,0.55,0.32), vec3(0.20,0.18,0.42), pow(h, 0.45)) : mix(vec3(0.55,0.30,0.25), vec3(0.08,0.06,0.10), pow(-h, 0.4));
    vec3 sd = normalize(vec3(0.0, 0.06, -1.0)); float sun = smoothstep(0.995, 0.999, dot(vP, sd));
    c += vec3(1.0,0.85,0.6) * (sun + pow(max(0.0, dot(vP, sd)), 40.0) * 0.5);
    gl_FragColor = vec4(min(c, 1.0),1.0); }`));
  all.sunset = g;
  // Jupiter (visionOS 26): standing on an icy moon, the giant planet with its bands and the Great Red Spot overhead
  g = new THREE.Group();
  g.add(dome(`varying vec3 vP; uniform float uT;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){ vec3 c = vec3(0.004,0.005,0.012) + vec3(0.6) * step(0.9985, h(floor(vP.xy * 400.0 + vP.z * 91.0)));
      vec3 J = normalize(vec3(0.3, 0.62, -1.0)); float d = acos(clamp(dot(vP, J), -1.0, 1.0)), R = 0.3;
      if (d < R) { vec3 up = vec3(0.0,1.0,0.0); vec3 x = normalize(cross(up, J)); vec3 y = cross(J, x);
        vec2 q = vec2(dot(vP - J, x), dot(vP - J, y)) / sin(R); float lat = q.y;
        float band = sin(lat * 26.0 + sin(q.x * 6.0 + lat * 9.0) * 0.6);
        vec3 col = mix(vec3(0.82,0.70,0.55), vec3(0.62,0.42,0.30), smoothstep(-0.3, 0.6, band));
        col = mix(col, vec3(0.93,0.88,0.80), smoothstep(0.75, 1.0, sin(lat * 13.0 + 1.3)));
        float spot = length((q - vec2(0.22, -0.36)) * vec2(1.0, 1.8)); col = mix(vec3(0.72,0.30,0.18), col, smoothstep(0.08, 0.13, spot));
        float limb = sqrt(max(0.0, 1.0 - dot(q, q))); c = col * (0.25 + 0.9 * limb) * smoothstep(1.0, 0.97, length(q)); }
      gl_FragColor = vec4(c, 1.0); }`));
  { const ice = new THREE.Mesh(new THREE.CircleGeometry(40, 96), new THREE.MeshStandardMaterial({ color: 0x232a36, roughness: 0.95, metalness: 0.0 }));
    ice.rotation.x = -Math.PI / 2; ice.position.y = -1.6; g.add(ice);
    for (let i = 0; i < 40; i++) { const r = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2 + Math.random() * 0.8, 0), new THREE.MeshStandardMaterial({ color: 0x8796ab, roughness: 0.9, flatShading: true })); const a = Math.random() * Math.PI * 2, d = 4 + Math.random() * 25; r.position.set(Math.cos(a) * d, -1.6, Math.sin(a) * d); r.scale.y = 0.5; g.add(r); }
    const sun = new THREE.DirectionalLight(0xfff1dc, 0.8); sun.position.set(-3, 4, -2); g.add(sun); g.add(new THREE.HemisphereLight(0xd8c6a8, 0x1a2030, 0.35)); }
  g.userData.dim = 0.3; all.jupiter = g;
  // Aurora over Icelandic mountains (like Thórsmörk at night)
  g = new THREE.Group();
  const aur = dome(`varying vec3 vP; uniform float uT;
    float n(vec2 p){ return sin(p.x) * sin(p.y * 1.3 + p.x * 0.7); }
    void main(){ float hgt = vP.y; float az = atan(vP.x, -vP.z);
      vec3 c = mix(vec3(0.01,0.02,0.05), vec3(0.03,0.05,0.12), smoothstep(-0.1, 0.5, hgt));
      float st = step(0.9982, fract(sin(dot(floor(vP.xz * 380.0 + vP.y * 77.0), vec2(12.99,78.23))) * 43758.5)); c += vec3(0.7) * st * smoothstep(0.05, 0.3, hgt);
      for (int i = 0; i < 3; i++) { float fi = float(i); float y0 = 0.32 + fi * 0.09 + 0.05 * sin(az * 3.0 + uT * 0.15 + fi);
        float curtain = exp(-pow((hgt - y0) * 9.0, 2.0)) * (0.6 + 0.4 * sin(az * 22.0 + uT * 0.6 + fi * 2.0 + 3.0 * n(vec2(az * 4.0, uT * 0.1))));
        c += mix(vec3(0.1,0.95,0.55), vec3(0.6,0.3,0.95), fi / 2.0) * curtain * 0.55 * smoothstep(0.0, 0.25, hgt); }
      float ridge = 0.06 + 0.07 * abs(sin(az * 2.3)) + 0.04 * abs(sin(az * 7.1 + 1.0)) + 0.02 * sin(az * 23.0);
      if (hgt < ridge) c = mix(vec3(0.015,0.02,0.03), vec3(0.03,0.05,0.06), smoothstep(ridge - 0.03, ridge, hgt));
      gl_FragColor = vec4(c, 1.0); }`);
  aur.material.uniforms = { uT: { value: 0 } }; g.add(aur);
  { const snow = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshStandardMaterial({ color: 0x2c3a44, roughness: 0.95 })); snow.rotation.x = -Math.PI / 2; snow.position.y = -1.6; g.add(snow);
    g.add(new THREE.HemisphereLight(0x6fe0b8, 0x0a1018, 0.5)); }
  const tickers = new THREE.Group(); tickers.userData.tick = (dt, t) => { aur.material.uniforms.uT.value = t; };
  g.add(tickers); g.children.unshift(g.children.pop());   // the tick lives on the first child
  g.userData.dim = 0.2; all.aurora = g;
  // furnished rooms: built the first time they are chosen (keeps start-up light)
  all.neonDesk = lazyRoom(neonDesk);
  all.study = lazyRoom(study);
  all.realNeon = lazyRoom(realNeon, 0.06);
  all.realStudio = lazyRoom(realStudio, 0.35);
  all.lounge = lazyRoom(lounge);
  all.realStudy = lazyRoom(realStudy);
  all.space = lazyRoom(space, 0.55);
  all.library = lazyRoom(library, 0.35);
  all.reading = lazyRoom(readingRoom);
  all.viewOffice = lazyRoom(() => viewOffice(false), 0.5);
  all.nightOffice = lazyRoom(() => viewOffice(true), 0.3);
  all.gaming = lazyRoom(() => gaming('neon'), 0.25);
  all.gym = lazyRoom(gym, 0.3);
  all.neonLounge = lazyRoom(neonLounge, 0.25);
  all.gamingRed = lazyRoom(() => gaming('red'), 0.25);
  Object.values(all).forEach(x => { x.visible = false; });
  return all;
}

function lazyRoom(build, dim) {
  const g = new THREE.Group(); let built = false;
  if (dim != null) g.userData.dim = dim;   // how much of the scene's general light stays on while this room shows
  Object.defineProperty(g, 'visible', { get() { return this._v; }, set(v) { this._v = v; if (v && !built) { built = true; this.add(build()); } } });
  return g;
}
