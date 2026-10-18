// Virtual environments shown instead of (or dimming) the real room.
import * as THREE from 'three';
import { neonDesk, study } from './rooms.js';

export const ENVS = {
  passthrough: { label: 'الواقع', note: 'غرفتك الحقيقية', immersive: false },
  dim:         { label: 'خافت',  note: 'الواقع معتّماً للتركيز', immersive: false },
  night:       { label: 'ليل',   note: 'سماء مرصّعة بالنجوم', immersive: true },
  cinema:      { label: 'سينما', note: 'قاعة مظلمة للمشاهدة', immersive: true },
  sunset:      { label: 'غروب',  note: 'أفق دافئ مفتوح', immersive: true },
  neonDesk:    { label: 'مكتب النيون', note: 'غرفة هادئة بإضاءة خافتة', immersive: true },
  study:       { label: 'المكتب البنفسجي', note: 'مكتب نهاري بضوء الشمس', immersive: true },
};
export const ENV_ORDER = Object.keys(ENVS);
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
  const all = {};
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
  // furnished rooms: built the first time they are chosen (keeps start-up light)
  all.neonDesk = lazyRoom(neonDesk);
  all.study = lazyRoom(study);
  Object.values(all).forEach(x => { x.visible = false; });
  return all;
}

function lazyRoom(build) {
  const g = new THREE.Group(); let built = false;
  Object.defineProperty(g, 'visible', { get() { return this._v; }, set(v) { this._v = v; if (v && !built) { built = true; this.add(build()); } } });
  return g;
}
