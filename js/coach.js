// «المدرب الرياضي»: a 3D figure in front of you performs each exercise while the muscles it works glow on its body;
// beside it an illustrated muscle map (front and back), the count, the sets and the rests - in an Arabic voice.
// Exercises for your body weight, your resistance band and your treadmill; reps are counted from your movement
// (ARKit head height in the iPhone app, the phone's motion sensors in Safari, the camera's body pose on a laptop)
// or with the coach's rhythm. Air boxing, eye & neck exercises and the treadmill are in train.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CanvasPanel, IconButton, makeBar, glass, text, icon, roundRect, COLORS, blip } from './ui.js';
import { settings, saveSettings, deviceIdentity } from './config.js';
import { FRONT, BACK } from './musclemap.js';

const XBOT = new URL('../assets/coach/Xbot.glb', import.meta.url).href;
export const MUSCLES = ['none', 'chest', 'abs', 'obliques', 'traps', 'upperBack', 'lowerBack', 'delts', 'rearDelts', 'biceps', 'triceps', 'forearms', 'glutes', 'quads', 'hamstrings', 'adductors', 'calves', 'shins', 'neck'];
export const MUSCLE_AR = { chest: 'الصدر', abs: 'البطن', obliques: 'الخواصر', traps: 'الترابيس', upperBack: 'أعلى الظهر', lowerBack: 'أسفل الظهر', delts: 'الكتف', rearDelts: 'الكتف الخلفي', biceps: 'الباي', triceps: 'الترايسبس', forearms: 'الساعد', glutes: 'الأرداف', quads: 'الفخذ الأمامي', hamstrings: 'الفخذ الخلفي', adductors: 'الفخذ الداخلي', calves: 'السمانة', shins: 'الساق', neck: 'الرقبة' };
// the illustrated map's muscle names → ours
const MAP2 = { chest: 'chest', abs: 'abs', obliques: 'obliques', trapezius: 'traps', 'upper-back': 'upperBack', 'lower-back': 'lowerBack', 'front-deltoids': 'delts', 'back-deltoids': 'rearDelts', biceps: 'biceps', triceps: 'triceps', forearm: 'forearms', gluteal: 'glutes', quadriceps: 'quads', hamstring: 'hamstrings', adductor: 'adductors', abductors: 'glutes', calves: 'calves', 'left-soleus': 'calves', 'right-soleus': 'calves', neck: 'neck' };
const NUM = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر', 'عشرون', 'واحد وعشرون', 'اثنان وعشرون', 'ثلاثة وعشرون', 'أربعة وعشرون', 'خمسة وعشرون', 'ستة وعشرون', 'سبعة وعشرون', 'ثمانية وعشرون', 'تسعة وعشرون', 'ثلاثون'];
const arNum = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);

// ---------------------------------------------------------------- the exercises
// Poses: hand / foot targets in metres (left side; the right side mirrors unless given), angles in degrees.
//   hips [x,y,z] pelvis offset · tilt pelvis pitch · spine [pitch, side, twist] · head [pitch, roll, yaw]
//   hand / handR: wrist target from the shoulder · elbow / elbowR: where the elbow points · foot / footR: ankle offset · knee: knee direction · heel: heel raise
const DOWN = [0.05, -0.53, 0.03], HIPS = [-0.13, -0.32, 0.12];
export const EXERCISES = [
  { id: 'squat', name: 'سكوات', kind: 'body', p: ['quads', 'glutes'], s: ['hamstrings', 'calves', 'lowerBack', 'abs'], tempo: 3.2, reps: 12, sets: 3, met: 5, detect: 'down',
    tips: ['انزل كأنك تجلس على كرسي', 'ظهرك مستقيم وصدرك مرفوع', 'ركبتاك باتجاه أصابع قدميك'],
    keys: [[0, { hand: DOWN }], [0.42, { hips: [0, -0.4, -0.16], tilt: 26, spine: [8, 0, 0], hand: [-0.12, -0.04, 0.5], knee: [0.25, 0, 1] }], [0.58, { hips: [0, -0.4, -0.16], tilt: 26, spine: [8, 0, 0], hand: [-0.12, -0.04, 0.5], knee: [0.25, 0, 1] }], [1, { hand: DOWN }]] },
  { id: 'lunge', name: 'طعنة أمامية', kind: 'body', p: ['quads', 'glutes'], s: ['hamstrings', 'calves', 'abs'], tempo: 4.4, reps: 10, sets: 3, met: 4, detect: 'down',
    tips: ['خطوة واسعة للأمام', 'الركبة الخلفية تقترب من الأرض', 'جذعك مستقيم'],
    keys: [[0, { hand: HIPS, handR: [0.13, -0.32, 0.12] }], [0.22, { hips: [0, -0.36, 0.08], foot: [0, 0, 0.55], footR: [0, 0.06, -0.42], heelR: 40, hand: HIPS, handR: [0.13, -0.32, 0.12] }], [0.32, { hips: [0, -0.36, 0.08], foot: [0, 0, 0.55], footR: [0, 0.06, -0.42], heelR: 40, hand: HIPS, handR: [0.13, -0.32, 0.12] }], [0.5, { hand: HIPS, handR: [0.13, -0.32, 0.12] }],
      [0.72, { hips: [0, -0.36, 0.08], footR: [0, 0, 0.55], foot: [0, 0.06, -0.42], heel: 40, hand: HIPS, handR: [0.13, -0.32, 0.12] }], [0.82, { hips: [0, -0.36, 0.08], footR: [0, 0, 0.55], foot: [0, 0.06, -0.42], heel: 40, hand: HIPS, handR: [0.13, -0.32, 0.12] }], [1, { hand: HIPS, handR: [0.13, -0.32, 0.12] }]] },
  { id: 'jacks', name: 'قفز جانبي (جامبينغ جاك)', kind: 'body', p: ['calves', 'delts'], s: ['glutes', 'adductors', 'quads'], tempo: 1.3, reps: 25, sets: 2, met: 8, detect: 'bounce',
    tips: ['اهبط على مقدمة قدميك', 'ذراعاك مستقيمتان فوق رأسك'],
    keys: [[0, { hand: DOWN }], [0.25, { hips: [0, 0.05, 0], hand: [0.4, 0.3, 0.02], foot: [0.12, 0.05, 0], heel: 15 }], [0.5, { hand: [0.12, 0.6, 0.02], foot: [0.2, 0, 0] }], [0.75, { hips: [0, 0.05, 0], hand: [0.4, 0.3, 0.02], foot: [0.12, 0.05, 0], heel: 15 }], [1, { hand: DOWN }]] },
  { id: 'knees', name: 'رفع الركبتين', kind: 'body', p: ['quads', 'abs'], s: ['calves', 'glutes'], tempo: 1.0, reps: 30, sets: 2, met: 8, detect: 'bounce',
    tips: ['الركبة إلى مستوى الورك', 'حرّك ذراعيك مع الخطوة'],
    keys: [[0, { hand: [-0.02, -0.3, -0.2], handR: [0.02, -0.25, 0.3], elbow: [0, -1, -1] }], [0.25, { foot: [0, 0.48, 0.36], knee: [0, 0.3, 1], hand: [-0.02, -0.25, 0.3], handR: [0.02, -0.3, -0.2] }], [0.5, { hand: [-0.02, -0.3, -0.2], handR: [0.02, -0.25, 0.3] }], [0.75, { footR: [0, 0.48, 0.36], hand: [-0.02, -0.3, -0.2], handR: [0.02, -0.25, 0.3] }], [1, { hand: [-0.02, -0.3, -0.2], handR: [0.02, -0.25, 0.3] }]] },
  { id: 'calf', name: 'رفع السمانة', kind: 'body', p: ['calves'], s: ['shins'], tempo: 2.2, reps: 20, sets: 3, met: 3, detect: 'up',
    tips: ['ارتفع على أطراف أصابعك', 'انزل ببطء'],
    keys: [[0, { hand: HIPS }], [0.45, { hips: [0, 0.07, 0], foot: [0, 0.07, -0.02], heel: 32, hand: HIPS }], [0.6, { hips: [0, 0.07, 0], foot: [0, 0.07, -0.02], heel: 32, hand: HIPS }], [1, { hand: HIPS }]] },
  { id: 'pushup', name: 'ضغط', kind: 'floor', p: ['chest', 'triceps'], s: ['delts', 'abs'], tempo: 2.6, reps: 10, sets: 3, met: 8, detect: 'tempo', floor: 70,
    tips: ['جسمك خط مستقيم من الرأس للقدمين', 'المرفقان بزاوية ٤٥ درجة'],
    keys: [[0, { lean: 68, plantHands: 1 }], [0.45, { lean: 79, plantHands: 1 }], [0.55, { lean: 79, plantHands: 1 }], [1, { lean: 68, plantHands: 1 }]] },
  { id: 'plank', name: 'بلانك', kind: 'floor', p: ['abs', 'obliques'], s: ['delts', 'glutes', 'lowerBack'], tempo: 30, reps: 1, sets: 3, met: 4, hold: 30, detect: 'tempo',
    tips: ['شدّ بطنك', 'لا ترفع الأرداف'],
    keys: [[0, { lean: 78, plantForearms: 1 }], [1, { lean: 78, plantForearms: 1 }]] },
  { id: 'curl', name: 'باي بالحبل المطاطي', kind: 'band', band: 'feet', p: ['biceps'], s: ['forearms'], tempo: 2.6, reps: 12, sets: 3, met: 3.5, detect: 'tempo',
    tips: ['ثبّت مرفقيك بجانب جسمك', 'انزل ببطء ضد مقاومة الحبل'],
    keys: [[0, { hand: [0.06, -0.5, 0.14], elbow: [0.2, -1, -0.5] }], [0.42, { hand: [0.06, -0.12, 0.26], elbow: [0.2, -1, -0.5] }], [0.55, { hand: [0.06, -0.12, 0.26], elbow: [0.2, -1, -0.5] }], [1, { hand: [0.06, -0.5, 0.14], elbow: [0.2, -1, -0.5] }]] },
  { id: 'press', name: 'ضغط الكتف بالحبل', kind: 'band', band: 'feet', p: ['delts', 'triceps'], s: ['traps', 'upperBack'], tempo: 2.6, reps: 12, sets: 3, met: 3.5, detect: 'tempo',
    tips: ['ادفع للأعلى حتى تستقيم ذراعاك', 'لا تقوّس ظهرك'],
    keys: [[0, { hand: [0.2, 0.02, 0.1], elbow: [1, -1, 0] }], [0.45, { hand: [0.12, 0.56, 0.04], elbow: [1, 0, 0] }], [0.55, { hand: [0.12, 0.56, 0.04], elbow: [1, 0, 0] }], [1, { hand: [0.2, 0.02, 0.1], elbow: [1, -1, 0] }]] },
  { id: 'lateral', name: 'رفرفة جانبية بالحبل', kind: 'band', band: 'feet', p: ['delts'], s: ['traps'], tempo: 2.6, reps: 12, sets: 3, met: 3.5, detect: 'tempo',
    tips: ['ارفع ذراعيك حتى مستوى الكتف', 'المرفق مثني قليلاً'],
    keys: [[0, { hand: [0.12, -0.5, 0.06], elbow: [1, 0, -0.5] }], [0.45, { hand: [0.54, -0.04, 0.06], elbow: [0, 1, -0.5] }], [0.55, { hand: [0.54, -0.04, 0.06], elbow: [0, 1, -0.5] }], [1, { hand: [0.12, -0.5, 0.06], elbow: [1, 0, -0.5] }]] },
  { id: 'row', name: 'تجديف بالحبل', kind: 'band', band: 'front', p: ['upperBack', 'rearDelts'], s: ['biceps', 'forearms'], tempo: 2.8, reps: 12, sets: 3, met: 3.5, detect: 'tempo',
    tips: ['اسحب مرفقيك للخلف', 'اضغط لوحي كتفيك معاً'],
    keys: [[0, { hand: [-0.04, -0.2, 0.52], elbow: [0.3, -1, 0] }], [0.45, { hand: [0.12, -0.24, 0.06], elbow: [0.4, -0.3, -1] }], [0.55, { hand: [0.12, -0.24, 0.06], elbow: [0.4, -0.3, -1] }], [1, { hand: [-0.04, -0.2, 0.52], elbow: [0.3, -1, 0] }]] },
  { id: 'chestpress', name: 'ضغط الصدر بالحبل', kind: 'band', band: 'back', p: ['chest'], s: ['triceps', 'delts'], tempo: 2.8, reps: 12, sets: 3, met: 3.5, detect: 'tempo',
    tips: ['ادفع للأمام بمستوى الصدر', 'ارجع ببطء'],
    keys: [[0, { hand: [0.22, -0.12, 0.08], elbow: [1, -0.4, -0.6] }], [0.45, { hand: [-0.02, -0.08, 0.55], elbow: [1, -0.6, 0] }], [0.55, { hand: [-0.02, -0.08, 0.55], elbow: [1, -0.6, 0] }], [1, { hand: [0.22, -0.12, 0.08], elbow: [1, -0.4, -0.6] }]] },
  { id: 'pushdown', name: 'ترايسبس بالحبل', kind: 'band', band: 'up', p: ['triceps'], s: ['forearms'], tempo: 2.4, reps: 15, sets: 3, met: 3, detect: 'tempo',
    tips: ['المرفقان ثابتان بجانبك', 'مدّ ذراعيك للأسفل بالكامل'],
    keys: [[0, { hand: [0.02, -0.16, 0.28], elbow: [0.1, -1, -0.4] }], [0.45, { hand: [0.04, -0.52, 0.14], elbow: [0.1, -1, -0.4] }], [0.55, { hand: [0.04, -0.52, 0.14], elbow: [0.1, -1, -0.4] }], [1, { hand: [0.02, -0.16, 0.28], elbow: [0.1, -1, -0.4] }]] },
  { id: 'neck', name: 'إطالة الرقبة', kind: 'stretch', p: ['neck'], s: ['traps'], tempo: 8, reps: 4, sets: 1, met: 1.5, detect: 'tempo',
    tips: ['ببطء دون ألم', 'أرخِ كتفيك'],
    keys: [[0, { hand: DOWN }], [0.2, { head: [0, 35, 0], hand: DOWN }], [0.4, { head: [0, 0, 0], hand: DOWN }], [0.6, { head: [0, -35, 0], hand: DOWN }], [0.8, { head: [30, 0, 0], hand: DOWN }], [1, { hand: DOWN }]] },
];
export const exerciseById = id => EXERCISES.find(e => e.id === id) || EXERCISES[0];

// ---------------------------------------------------------------- the figure
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
// rotate a bone so that its child lands on a point (world), keeping the rest of the chain
function aim(bone, child, target) {
  const bp = bone.getWorldPosition(v1), cp = child.getWorldPosition(v2);
  const cur = cp.sub(bp).normalize(), want = v3.copy(target).sub(bp).normalize();
  if (cur.lengthSq() < 1e-8 || want.lengthSq() < 1e-8) return;
  const d = q1.setFromUnitVectors(cur, want);
  const wq = bone.getWorldQuaternion(q2);
  const nq = d.multiply(wq);
  const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  bone.quaternion.copy(pq.multiply(nq));
  bone.updateMatrixWorld(true);
}
// two-bone IK: upper bone, lower bone, end → reach the target, the middle joint bending towards the pole
function ik2(a, b, c, target, pole) {
  const pa = a.getWorldPosition(new THREE.Vector3()), pb = b.getWorldPosition(new THREE.Vector3()), pc = c.getWorldPosition(new THREE.Vector3());
  const l1 = pa.distanceTo(pb), l2 = pb.distanceTo(pc);
  const d = target.clone().sub(pa); const dist = THREE.MathUtils.clamp(d.length(), Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.999); d.normalize();
  const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), y = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const pd = pole.clone(); pd.sub(d.clone().multiplyScalar(pd.dot(d)));
  if (pd.lengthSq() < 1e-6) pd.set(0, 0, 1).sub(d.clone().multiplyScalar(d.z));
  pd.normalize();
  const mid = pa.clone().addScaledVector(d, x).addScaledVector(pd, y);
  aim(a, b, mid);
  aim(b, c, pa.clone().addScaledVector(d, dist));
}
// which muscle a vertex belongs to (distances in cm): its main bone, where it sits and which way it faces (the figure faces +z, its left is +x)
function classify(name, p, n, ref) {
  const u = ref.u, ax = Math.abs(p.x) / u, inward = (p.x >= 0 ? -n.x : n.x);
  switch (name) {
    case 'Hips': return n.z < -0.25 ? 'glutes' : n.z > 0.35 && ax < 10 ? 'abs' : 'none';
    case 'Spine': return n.z > 0.35 ? (ax < 10 ? 'abs' : 'obliques') : n.z < -0.35 ? 'lowerBack' : 'obliques';
    case 'Spine1': return n.z > 0.35 ? (p.y > ref.spine1 + 2 * u ? 'chest' : ax < 9.5 ? 'abs' : 'obliques') : n.z < -0.3 ? 'upperBack' : 'obliques';
    case 'Spine2': return n.z > 0.25 ? 'chest' : p.y > ref.spine2 + 7 * u ? 'traps' : n.z < -0.2 ? 'upperBack' : (n.z > 0 ? 'chest' : 'upperBack');
    case 'Neck': return n.z < -0.2 || n.y > 0.45 ? 'traps' : 'neck';
    case 'LeftShoulder': case 'RightShoulder': return n.y > 0.35 || n.z < -0.25 ? 'traps' : 'delts';
    case 'LeftArm': case 'RightArm':
      if (ax - ref.armX / u < 9) return n.z < -0.2 ? 'rearDelts' : 'delts';
      return n.z >= -0.05 ? 'biceps' : 'triceps';
    case 'LeftForeArm': case 'RightForeArm': return 'forearms';
    case 'LeftUpLeg': case 'RightUpLeg':
      if (inward > 0.55) return 'adductors';
      if (n.z < -0.25 && p.y > ref.hipY - 16 * u) return 'glutes';
      return n.z >= -0.1 ? 'quads' : 'hamstrings';
    case 'LeftLeg': case 'RightLeg': return n.z < 0 ? 'calves' : 'shins';
    default: return 'none';
  }
}

export class Figure {
  constructor() {
    this.root = new THREE.Group(); this.yaw = new THREE.Group(); this.pivot = new THREE.Group();
    this.root.add(this.yaw); this.yaw.add(this.pivot);
    this.glow = new Float32Array(MUSCLES.length);
    this.uniforms = { uGlow: { value: this.glow }, uT: { value: 0 }, uGlowCol: { value: new THREE.Color(0xff6418) } };
    // a soft light ring under its feet
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 64), new THREE.MeshBasicMaterial({ color: 0x7cc4ff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.004; this.root.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.5, 64), new THREE.MeshBasicMaterial({ color: 0x0b1322, transparent: true, opacity: 0.45, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.002; this.root.add(disc);
  }
  async load() {
    const g = await new GLTFLoader().loadAsync(XBOT);
    const model = g.scene;
    this.model = model;
    this.pivot.add(model);
    this.bones = {};
    // real size: 1.78 m from the soles to the top of the head (measured on the skeleton, the skinned box lies)
    let top = null, toe = null;
    model.updateMatrixWorld(true);
    model.traverse(o => { if (o.isBone && /HeadTop_End$/.test(o.name)) top = o; if (o.isBone && /LeftToe_End$/.test(o.name)) toe = o; });
    const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
    const ty = top.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv).y, fy = toe.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv).y;
    const k = 1.78 / Math.max(1e-6, ty - fy);
    model.scale.multiplyScalar(k); model.position.y = -fy * k;
    this.toeZ = toe.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv).z * k;   // floor work pivots on the toes
    const body = new THREE.MeshStandardMaterial({ color: 0xc9d0dc, roughness: 0.38, metalness: 0.05, envMapIntensity: 0.9 });
    const joints = new THREE.MeshStandardMaterial({ color: 0x2b303b, roughness: 0.4, metalness: 0.3, envMapIntensity: 0.7 });
    model.traverse(o => {
      if (o.isBone) this.bones[o.name.replace(/^mixamorig:?/, '')] = o;
      if (o.isSkinnedMesh) { o.frustumCulled = false; o.castShadow = false; o.material = /Joint/i.test(o.name) ? joints : body; }
    });
    model.updateMatrixWorld(true);
    model.traverse(o => { if (o.isSkinnedMesh) this.paint(o, o.material === body); });
    body.onBeforeCompile = joints.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = 'attribute float aMuscle;\nvarying float vGlow;\nuniform float uGlow[' + MUSCLES.length + '];\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGlow = uGlow[int(aMuscle + 0.5)];');
      sh.fragmentShader = 'varying float vGlow;\nuniform vec3 uGlowCol;\nuniform float uT;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  float gPrim = step(0.5, vGlow);\n  vec3 gCol = mix(vec3(1.0, 0.55, 0.12), uGlowCol, gPrim);\n  float gAmt = vGlow < 0.01 ? 0.0 : gPrim > 0.5 ? 0.62 + 0.66 * (vGlow - 0.5) : 0.25 + vGlow * 0.8;\n  diffuseColor.rgb = mix(diffuseColor.rgb, gCol * 0.72, clamp(gAmt, 0.0, 0.95));\n  totalEmissiveRadiance += gCol * gAmt * (0.2 + 0.1 * sin(uT * 5.0));').replace('#include <opaque_fragment>', 'float gL = dot(outgoingLight, vec3(0.299, 0.587, 0.114));\n  outgoingLight = mix(outgoingLight, gCol * clamp(gL, 0.3, 1.1) * (1.1 + 0.3 * sin(uT * 5.0)), vGlow < 0.01 ? 0.0 : gPrim > 0.5 ? 0.97 : 0.8);\n#include <opaque_fragment>');
    };
    // rest pose: every bone's own rotation and the hips' position
    this.rest = new Map();
    for (const b of Object.values(this.bones)) this.rest.set(b, { q: b.quaternion.clone(), p: b.position.clone() });
    this.mixer = new THREE.AnimationMixer(model);
    this.clips = Object.fromEntries(g.animations.map(c => [c.name, c]));
    return this;
  }
  // tag every vertex of the body with its muscle (once)
  paint(mesh, isBody) {
    const geo = mesh.geometry, n = geo.attributes.position.count, ids = new Float32Array(n);
    {
      const pos = geo.attributes.position, nor = geo.attributes.normal, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, bones = mesh.skeleton.bones;
      const bm = mesh.bindMatrix, nm = new THREE.Matrix3().getNormalMatrix(bm);
      const at = name => { const i = bones.findIndex(b => b.name.replace(/^mixamorig:?/, '') === name); return i < 0 ? 0 : new THREE.Vector3().setFromMatrixPosition(mesh.skeleton.boneInverses[i].clone().invert()); };
      const ref = { spine1: at('Spine1').y, spine2: at('Spine2').y, armX: Math.abs(at('LeftArm').x), hipY: at('Hips').y };
      ref.u = ref.hipY / 104;   // the model's units per centimetre (the hips stand ~104 cm high)
      const p = new THREE.Vector3(), nn = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        const ws = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)], is = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)];
        let best = 0, bw = -1; for (let j = 0; j < 4; j++) if (ws[j] > bw) { bw = ws[j]; best = is[j]; }
        const name = bones[best].name.replace(/^mixamorig:?/, '');
        p.fromBufferAttribute(pos, i).applyMatrix4(bm); nn.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
        ids[i] = isBody || name === 'Hips' ? MUSCLES.indexOf(classify(name, p, nn, ref)) : 0;
      }
    }
    geo.setAttribute('aMuscle', new THREE.BufferAttribute(ids, 1));
  }
  setMuscles(primary = [], secondary = [], k = 1) {
    this.glow.fill(0);
    for (const m of secondary) this.glow[MUSCLES.indexOf(m)] = 0.45 * k;
    for (const m of primary) this.glow[MUSCLES.indexOf(m)] = 1.0 * k;
  }
  // ---- posing
  resetPose() { for (const [b, r] of this.rest) { b.quaternion.copy(r.q); b.position.copy(r.p); } this.pivot.rotation.set(0, 0, 0); this.pivot.position.set(0, 0, 0); if (this.model) this.model.position.z = 0; }
  // pose = the interpolated keyframe (see EXERCISES)
  apply(P) {
    const B = this.bones; if (!B.Hips) return;
    this.resetPose();
    this.root.updateMatrixWorld(true);
    // where the ankles stand when upright (the legs reach back to them)
    const restFoot = { L: B.LeftFoot.getWorldPosition(new THREE.Vector3()), R: B.RightFoot.getWorldPosition(new THREE.Vector3()) };
    // floor exercises: the whole body leans forward around the feet (seen from the side)
    if (P.lean) { this.pivot.position.z = this.toeZ || 0; this.model.position.z = -(this.toeZ || 0); this.pivot.rotation.x = THREE.MathUtils.degToRad(P.lean); this.root.updateMatrixWorld(true); }
    const X = new THREE.Vector3(1, 0, 0);
    const k = this.root.getWorldScale(new THREE.Vector3()).y / B.Hips.parent.getWorldScale(new THREE.Vector3()).y;   // metres → the skeleton's units
    const hip = this.rest.get(B.Hips).p;
    if (P.hips) B.Hips.position.set(hip.x + P.hips[0] * k, hip.y + P.hips[1] * k, hip.z + P.hips[2] * k);
    if (P.tilt) { B.Hips.quaternion.multiply(q1.setFromAxisAngle(X, THREE.MathUtils.degToRad(P.tilt))); B.Spine.quaternion.multiply(q1.setFromAxisAngle(X, -THREE.MathUtils.degToRad(P.tilt) * 0.6)); }
    if (P.spine) { const [pt, sd, tw] = P.spine.map(THREE.MathUtils.degToRad); for (const [n, f] of [['Spine', 0.4], ['Spine1', 0.3], ['Spine2', 0.3]]) B[n].quaternion.multiply(q1.setFromEuler(new THREE.Euler(pt * f, tw * f, sd * f))); }
    if (P.head) { const [pt, rl, yw] = P.head.map(THREE.MathUtils.degToRad); for (const n of ['Neck', 'Head']) B[n].quaternion.multiply(q1.setFromEuler(new THREE.Euler(pt * 0.5, yw * 0.5, rl * 0.5))); }
    this.root.updateMatrixWorld(true);
    const bodyQ = this.pivot.getWorldQuaternion(new THREE.Quaternion());
    // legs: the ankles where the pose wants them, knees bending forward, feet flat (or heels raised)
    if (!P.lean) for (const s of ['L', 'R']) {
      const side = s === 'L' ? 'Left' : 'Right', m = s === 'L' ? 1 : -1;
      const up = B[side + 'UpLeg'], leg = B[side + 'Leg'], foot = B[side + 'Foot'];
      const f = s === 'L' ? P.foot : (P.footR ?? P.foot);
      const t = restFoot[s].clone();
      if (f) t.add(this.toWorldDir(new THREE.Vector3(f[0] * m, f[1], f[2])));
      const kn = P.knee ? new THREE.Vector3(P.knee[0] * m, P.knee[1], P.knee[2]) : new THREE.Vector3(0.1 * m, 0, 1);
      ik2(up, leg, foot, t, this.toWorldDir(kn));
      const heel = (s === 'L' ? P.heel : (P.heelR ?? P.heel)) || 0;
      const want = bodyQ.clone().multiply(q1.setFromAxisAngle(X, THREE.MathUtils.degToRad(heel)));
      foot.quaternion.copy(foot.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(want)); foot.updateMatrixWorld(true);
    }
    // arms: wrists to the targets (from the shoulder joint), elbows pointing where asked
    for (const s of ['L', 'R']) {
      const side = s === 'L' ? 'Left' : 'Right', m = s === 'L' ? 1 : -1;
      const arm = B[side + 'Arm'], fore = B[side + 'ForeArm'], hand = B[side + 'Hand'];
      const sh = arm.getWorldPosition(new THREE.Vector3());
      if (P.plantHands || P.plantForearms) {
        // on the floor, under the shoulders
        const floorY = this.root.getWorldPosition(new THREE.Vector3()).y + 0.04 * this.root.getWorldScale(new THREE.Vector3()).y;
        const t = sh.clone().add(this.toWorldDir(new THREE.Vector3(0.06 * m, 0, P.plantForearms ? 0.22 : 0.02))); t.y = floorY;
        ik2(arm, fore, hand, t, this.toWorldDir(new THREE.Vector3(0.6 * m, 0, -1)));
        continue;
      }
      const h = (s === 'R' && P.handR) ? P.handR : (P.hand || DOWN);
      const t = sh.clone().add(this.toWorldDir(new THREE.Vector3(h[0] * m, h[1], h[2])));
      const e = (s === 'R' && P.elbowR) ? P.elbowR : (P.elbow || [0.4, -0.3, -1]);
      ik2(arm, fore, hand, t, this.toWorldDir(new THREE.Vector3(e[0] * m, e[1], e[2])));
    }
  }
  // a direction / offset in the figure's own space (metres) → the world
  toWorldDir(v) { return v.applyQuaternion(this.yaw.getWorldQuaternion(new THREE.Quaternion())).multiplyScalar(this.root.getWorldScale(new THREE.Vector3()).x); }
  // treadmill / idle: the built-in walk and run
  play(name, speed = 1) {
    if (!this.mixer) return;
    if (this.action && this.action._clip.name === name) { this.action.timeScale = speed; return; }
    this.action?.fadeOut(0.3);
    const c = this.clips[name]; if (!c) return;
    // keep it walking on the spot
    const clip = c.clone(); clip.tracks = clip.tracks.filter(t => !/Hips\.position/.test(t.name) || (t.values = t.values.map((v, i) => (i % 3 === 1 ? v : i % 3 === 0 ? v : 0))));
    this.action = this.mixer.clipAction(clip); this.action.reset().fadeIn(0.3).play(); this.action.timeScale = speed;
  }
  stopClip() { this.action?.stop(); this.action = null; }
}

// interpolate the keyframes at phase t (0..1)
export function poseAt(ex, t) {
  const k = ex.keys; let i = 0;
  while (i < k.length - 2 && t > k[i + 1][0]) i++;
  const [t0, a] = k[i], [t1, b] = k[i + 1];
  let f = t1 > t0 ? (t - t0) / (t1 - t0) : 0; f = f * f * (3 - 2 * f);
  const out = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const x = a[key], y = b[key];
    if (Array.isArray(x) || Array.isArray(y)) {
      const xx = x || (key === 'hand' || key === 'handR' ? DOWN : [0, 0, 0]), yy = y || (key === 'hand' || key === 'handR' ? DOWN : [0, 0, 0]);
      out[key] = xx.map((v, j) => v + (yy[j] - v) * f);
    } else out[key] = (x ?? 0) + ((y ?? 0) - (x ?? 0)) * f;
  }
  return out;
}

// ---------------------------------------------------------------- the illustrated muscle map
export function drawMuscleMap(ctx, x, y, w, h, primary, secondary, t = 0) {
  const draw = (data, ox, label) => {
    const k = Math.min((w / 2 - 20) / 100, (h - 40) / 200), bx = ox + (w / 2 - 100 * k) / 2, by = y + 30;
    for (const [name, polys] of data) {
      const m = MAP2[name];
      const on = m && primary.includes(m) ? 2 : m && secondary.includes(m) ? 1 : 0;
      for (const pts of polys) {
        ctx.beginPath();
        for (let i = 0; i < pts.length; i += 2) { const px = bx + pts[i] * k, py = by + pts[i + 1] * k; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
        ctx.closePath();
        if (on === 2) { const g = ctx.createLinearGradient(bx, by, bx + 100 * k, by + 200 * k); g.addColorStop(0, '#ff3d1f'); g.addColorStop(1, '#ff9a3c'); ctx.fillStyle = g; ctx.shadowColor = 'rgba(255,90,30,' + (0.6 + 0.3 * Math.sin(t * 5)) + ')'; ctx.shadowBlur = 18; }
        else if (on === 1) { ctx.fillStyle = 'rgba(255,190,90,0.85)'; ctx.shadowBlur = 0; }
        else { ctx.fillStyle = name === 'head' || name === 'knees' ? 'rgba(200,210,230,0.55)' : 'rgba(150,165,195,0.42)'; ctx.shadowBlur = 0; }
        ctx.fill(); ctx.shadowBlur = 0;
        ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(20,24,34,0.6)'; ctx.stroke();
      }
    }
    text(ctx, label, ox + w / 4, y + 14, 22, { weight: 800, color: COLORS.dim });
  };
  draw(FRONT, x + w / 2, 'أمام');
  draw(BACK, x, 'خلف');
}

// ---------------------------------------------------------------- the voice
export function say(msg, opts = {}) {
  try {
    const s = window.speechSynthesis; if (!s || settings.coachVoice === false) return;
    if (opts.cut !== false) s.cancel();
    const u = new SpeechSynthesisUtterance(msg); u.lang = 'ar-SA'; u.rate = opts.rate || 1.05; u.volume = 1;
    const v = s.getVoices().find(x => /^ar/i.test(x.lang)); if (v) u.voice = v;
    s.speak(u);
  } catch {}
}
export const sayNumber = n => say(NUM[n] || String(n), { rate: 1.2 });

// ---------------------------------------------------------------- your movement → reps
// iPhone app: ARKit head position (centimetre-precise). Safari: the motion sensors (vertical acceleration integrated
// with a leak, good enough for squats and jumps). Laptop: MediaPipe body pose from the camera (joint angles).
export class Motion {
  constructor(app) {
    this.app = app; this.y = 0; this.v = 0; this.base = null; this.hist = []; this.reps = 0; this.state = 'up'; this.ok = false;
    this.native = !!window.MadarIOS;
    this.onMotion = e => {
      const a = e.accelerationIncludingGravity, l = e.acceleration; if (!a || !l) return;
      const g = this.g || (this.g = new THREE.Vector3(a.x, a.y, a.z));
      g.lerp(new THREE.Vector3(a.x, a.y, a.z), 0.04);
      const up = g.clone().normalize();
      const av = -(l.x * up.x + l.y * up.y + l.z * up.z);   // upward acceleration (m/s²)
      const dt = Math.min(0.05, (e.interval || 16) / (e.interval > 1 ? 1000 : 1));
      this.v = (this.v + av * dt) * 0.985; this.y = (this.y + this.v * dt) * 0.992;
      this.ok = true;
    };
    if (!this.native) window.addEventListener('devicemotion', this.onMotion);
  }
  height() {
    if (this.native && this.app.head.hasData) { const p = this.app.head.position(new THREE.Vector3()); this.ok = true; return p.y; }
    return this.y;
  }
  // one rep = going down (squat) / up (calf raise) and back, measured from your standing height
  update(now, mode) {
    const y = this.height(); if (!this.ok) return null;
    this.hist.push([now, y]); while (this.hist.length && now - this.hist[0][0] > 4000) this.hist.shift();
    const top = Math.max(...this.hist.map(h => h[1])), bot = Math.min(...this.hist.map(h => h[1]));
    const rel = y - top, span = top - bot;
    let rep = false, depth = 0;
    if (mode === 'down') {
      const thr = this.native ? 0.16 : 0.07;
      if (this.state === 'up' && rel < -thr) { this.state = 'down'; this.low = rel; }
      if (this.state === 'down') { this.low = Math.min(this.low, rel); if (rel > -thr * 0.35) { this.state = 'up'; rep = true; depth = -this.low; } }
    } else if (mode === 'up' || mode === 'bounce') {
      const rel2 = y - bot, thr = mode === 'up' ? (this.native ? 0.035 : 0.025) : (this.native ? 0.03 : 0.02);
      if (this.state === 'up' && rel2 > thr && span > thr) this.state = 'peak';
      else if (this.state === 'peak' && rel2 < thr * 0.4) { this.state = 'up'; rep = true; }
    }
    return { y, rel, rep, depth };
  }
  dispose() { window.removeEventListener('devicemotion', this.onMotion); }
}

// ---------------------------------------------------------------- the coach window
let cid = 5000;
const MODES = [['train', 'التمارين', 'muscle'], ['box', 'الملاكمة', 'glove'], ['eyes', 'العين والرقبة', 'eye'], ['tread', 'جهاز المشي', 'walk']];
export class CoachWindow {
  constructor(mgr, { mode = 'train', ex = null } = {}) {
    this.mgr = mgr; this.app = mgr.app; this.kind = 'coach'; this.id = ++cid;
    this.group = new THREE.Group(); this.group.userData.window = this;
    this.mode = mode;
    this.ex = exerciseById(ex || settings.coachEx || (settings.hasBand ? 'curl' : 'squat'));
    this.state = 'idle'; this.rep = 0; this.set = 1; this.phase = 0; this.clock = 0; this.restLeft = 0; this.kcal = 0; this.secs = 0; this.log = [];
    this.figure = new Figure();
    this.figure.root.position.set(0, -1.55, -0.2);   // standing on the floor in front of you
    this.figure.root.scale.setScalar(0.9);
    this.group.add(this.figure.root);
    this.figure.load().then(() => { this.loaded = true; this.applyEx(); }).catch(e => { this.app.toast('تعذّر تحميل المجسم', 2500); this.app.log('المدرب: ' + (e.message || e)); });
    this.motion = new Motion(this.app);
    // panels: the coach (right), the muscle map (left), the exercise list (pop-up)
    this.main = new CanvasPanel(0.66, 0.86, (ctx, W, H, p) => this.drawMain(ctx, W, H, p), { pxPerM: 1500 });
    this.main.mesh.position.set(0.78, -0.12, 0.12); this.main.mesh.rotation.y = -0.35; this.group.add(this.main.mesh);
    this.map = new CanvasPanel(0.56, 0.86, (ctx, W, H, p) => this.drawMap(ctx, W, H, p), { pxPerM: 1500 });
    this.map.mesh.position.set(-0.74, -0.12, 0.12); this.map.mesh.rotation.y = 0.35; this.group.add(this.map.mesh);
    this.menu = new CanvasPanel(1.2, 0.7, (ctx, W, H, p) => this.drawMenu(ctx, W, H, p), { pxPerM: 1300 });
    this.menu.mesh.position.set(0, -0.08, 0.3); this.menu.mesh.renderOrder = 950; this.menu.mesh.material.depthTest = false;
    const { mesh: bar, hit } = makeBar(0.24, 0.024);
    hit.userData.interact = { type: 'drag', window: this, hover: on => { bar.userData.drawHover(on); return true; } };
    bar.position.set(0, -0.62, 0.2); this.group.add(bar);
    this.closeBtn = new IconButton('close', 0.05, () => this.mgr.close(this)); this.closeBtn.mesh.position.set(-0.17, -0.62, 0.204); this.group.add(this.closeBtn.mesh);
    // the resistance band (two elastic cords from the anchor to the hands)
    const bandM = new THREE.MeshStandardMaterial({ color: 0x2ad17a, roughness: 0.45, emissive: 0x0a3a20 });
    this.cords = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 8), bandM); m.visible = false; this.figure.pivot.add(m); return m; });
    this.train = null;   // boxing / eyes / treadmill (train.js) when chosen
    this.setMode(mode);
  }
  // ---- program
  applyEx() {
    const e = this.ex;
    this.figure.setMuscles(e.p, e.s);
    this.figure.yaw.rotation.y = e.kind === 'floor' ? -Math.PI / 2 : 0;   // floor work seen from the side
    this.figure.stopClip();
    this.main.redraw(); this.map.redraw();
  }
  choose(id) { this.ex = exerciseById(id); saveSettings({ coachEx: this.ex.id }); this.state = 'idle'; this.rep = 0; this.set = 1; this.applyEx(); }
  program() {
    const band = settings.hasBand !== false;
    return band ? ['squat', 'curl', 'press', 'row', 'lateral', 'chestpress', 'pushdown', 'lunge', 'calf', 'plank'] : ['squat', 'lunge', 'jacks', 'knees', 'pushup', 'plank', 'calf'];
  }
  start() {
    if (this.state === 'run' || this.state === 'count') { this.state = 'pause'; say('توقف'); this.main.redraw(); return; }
    if (this.state === 'pause') { this.state = 'run'; say('نكمل'); this.main.redraw(); return; }
    this.state = 'count'; this.countAt = performance.now(); this.rep = 0; this.phase = 0;
    say(this.ex.name + '. ' + (this.ex.hold ? 'اثبت ' + this.ex.hold + ' ثانية' : this.ex.reps + ' تكرار') + '. استعد');
    this.main.redraw();
  }
  next() {
    const pr = this.program(), i = pr.indexOf(this.ex.id);
    this.choose(pr[(i + 1) % pr.length]);
    say('التمرين التالي: ' + this.ex.name);
  }
  finishSet() {
    const e = this.ex;
    this.log.push({ ex: e.id, reps: this.rep, set: this.set, at: Date.now() });
    if (this.set >= e.sets) { this.state = 'done'; say('أحسنت! انتهى تمرين ' + e.name); blip('open', true); setTimeout(() => { if (this.state === 'done') this.next(); }, 3500); }
    else { this.state = 'rest'; this.restLeft = settings.coachRest || 30; say('ممتاز. استرح ' + this.restLeft + ' ثانية'); }
    this.main.redraw();
  }
  countRep() {
    this.rep++;
    sayNumber(this.rep);
    if (this.rep === this.ex.reps - 2) setTimeout(() => say('آخر تكرارين', { cut: false }), 700);
    if (this.rep >= this.ex.reps) this.finishSet();
    this.main.redraw();
  }
  // ---- modes
  async setMode(m) {
    this.mode = m; this.train?.dispose(); this.train = null;
    this.figure.root.visible = m === 'train' || m === 'tread';
    this.map.mesh.visible = m === 'train';
    if (m !== 'train') {
      const T = await import('./train.js');
      const K = { box: T.Boxing, eyes: T.EyesNeck, tread: T.Treadmill }[m];
      if (K && this.mode === m) this.train = new K(this);
    } else this.applyEx();
    this.main.redraw(); this.mgr.refreshTargets?.();
  }
  // ---- per frame
  update(dt, now) {
    this.figure.uniforms.uT.value = now / 1000;
    if (this.train) { this.train.update(dt, now); this.figure.mixer?.update(dt); if (now - (this.drawnAt || 0) > 500) { this.drawnAt = now; this.main.redraw(); } return; }
    if (!this.loaded) return;
    const e = this.ex;
    if (this.state === 'count') {
      const left = 3 - Math.floor((now - this.countAt) / 1000);
      if (left !== this.left) { this.left = left; if (left > 0) say(NUM[left], { rate: 1.1 }); else { say('ابدأ'); this.state = 'run'; this.secs = 0; } this.main.redraw(); }
    }
    if (this.state === 'run') {
      const step = dt / e.tempo;
      const before = this.phase;
      this.phase = (this.phase + step) % 1;
      this.secs += dt;
      this.kcal += (e.met * (settings.weight || 75) / 3600) * dt;
      if (e.hold) { if (this.secs >= e.hold) { this.rep = 1; this.finishSet(); } else if (Math.floor(this.secs) !== this.lastSec) { this.lastSec = Math.floor(this.secs); if (this.lastSec % 10 === 0 && this.lastSec) say(String(e.hold - this.lastSec) + ' ثانية'); this.main.redraw(); } }
      // reps: from your own movement when the sensors see it, else with the coach's rhythm
      const m = e.detect !== 'tempo' ? this.motion.update(now, e.detect) : null;
      if (m && m.rep && settings.coachSensors !== false) { this.sensed = now; this.countRep(); if (e.detect === 'down' && m.depth && m.depth < (window.MadarIOS ? 0.25 : 0.1)) this.tip('انزل أكثر قليلاً'); }
      else if (!e.hold && before > this.phase && (!this.sensed || now - this.sensed > 6000)) this.countRep();
    }
    if (this.state === 'rest') {
      this.restLeft -= dt;
      const s = Math.ceil(this.restLeft);
      if (s !== this.lastRest) { this.lastRest = s; if (s === 10) say('عشر ثوانٍ'); if (s <= 3 && s > 0) say(NUM[s]); this.main.redraw(); }
      if (this.restLeft <= 0) { this.set++; this.rep = 0; this.state = 'run'; this.phase = 0; say('المجموعة ' + ['', 'الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة'][this.set]); }
    }
    // the figure: the exercise's movement (breathing gently while it waits)
    const P = this.state === 'run' ? poseAt(e, this.phase) : this.state === 'rest' || this.state === 'done' ? poseAt(e, 0) : poseAt(e, (now / 1000 / e.tempo) % 1 * (this.state === 'idle' ? 1 : 0));
    this.figure.apply(P);
    // contraction makes the muscles glow brighter
    const effort = this.state === 'run' ? 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, this.phase * 2)) : 0.8;
    this.figure.setMuscles(e.p, e.s, effort);
    this.updateBand(e);
    if (now - (this.mapAt || 0) > 120) { this.mapAt = now; this.map.redraw(); }
    if (this.state === 'run' && now - (this.drawnAt || 0) > 500) { this.drawnAt = now; this.main.redraw(); }
  }
  updateBand(e) {
    const on = e.kind === 'band', F = this.figure, B = F.bones;
    this.cords.forEach((c, i) => {
      c.visible = !!(on && B.LeftHand);
      if (!c.visible) return;
      const hand = B[i ? 'RightHand' : 'LeftHand'].getWorldPosition(new THREE.Vector3());
      let anchor;
      if (e.band === 'feet') anchor = B[i ? 'RightFoot' : 'LeftFoot'].getWorldPosition(new THREE.Vector3());
      else if (e.band === 'front') anchor = F.root.localToWorld(new THREE.Vector3((i ? -0.1 : 0.1), 1.05, 1.2));
      else if (e.band === 'back') anchor = F.root.localToWorld(new THREE.Vector3((i ? -0.25 : 0.25), 1.2, -0.7));
      else anchor = F.root.localToWorld(new THREE.Vector3(0, 2.2, 0.35));
      const a = F.pivot.worldToLocal(anchor.clone()), b = F.pivot.worldToLocal(hand.clone());
      const mid = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b);
      c.position.copy(mid); c.scale.set(1, len, 1);
      c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
    });
  }
  tip(t) { if (performance.now() - (this.tipAt || 0) < 5000) return; this.tipAt = performance.now(); this.tipText = t; say(t, { cut: false }); }
  // ---- drawing
  drawMain(ctx, W, H, p) {
    roundRect(ctx, 0, 0, W, H, 50); ctx.fillStyle = 'rgba(12,16,26,0.86)'; ctx.fill(); glass(ctx, 0, 0, W, H, 50);
    // modes
    const mw = (W - 60) / MODES.length;
    MODES.forEach(([k, l, ic], i) => {
      const x = W - 30 - (i + 1) * mw, id = 'm' + k, on = this.mode === k, hov = p.isHover(id);
      roundRect(ctx, x + 4, 26, mw - 8, 84, 26); ctx.fillStyle = on ? 'rgba(255,255,255,0.92)' : hov ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)'; ctx.fill();
      icon(ctx, ic, x + mw / 2, 54, 28, on ? '#151821' : COLORS.text);
      text(ctx, l, x + mw / 2, 90, 21, { weight: 800, color: on ? '#151821' : COLORS.text, maxWidth: mw - 14, fit: true });
      p.region(x, 26, mw, 84, () => { blip('tap', settings.sounds); this.setMode(k); }, id);
    });
    if (this.train) { this.train.drawPanel(ctx, W, H, p, 130); return; }
    const e = this.ex;
    text(ctx, e.name, W / 2, 168, 44, { weight: 800, maxWidth: W - 60, fit: true });
    text(ctx, [...e.p, ...e.s].map(m => MUSCLE_AR[m]).join(' · '), W / 2, 214, 22, { color: '#ffb27a', weight: 700, maxWidth: W - 60, fit: true });
    // the big number
    const big = this.state === 'rest' ? Math.max(0, Math.ceil(this.restLeft)) : e.hold ? Math.max(0, Math.ceil(e.hold - (this.state === 'run' ? this.secs : 0))) : this.rep;
    const label = this.state === 'rest' ? 'راحة' : this.state === 'count' ? 'استعد' : e.hold ? 'ثانية' : 'من ' + arNum(e.reps);
    ctx.save(); ctx.shadowColor = this.state === 'rest' ? 'rgba(124,196,255,0.7)' : 'rgba(255,120,50,0.7)'; ctx.shadowBlur = 30;
    text(ctx, this.state === 'count' ? arNum(Math.max(1, this.left || 3)) : arNum(big), W / 2, 330, 150, { weight: 800, color: this.state === 'rest' ? '#9fd4ff' : '#fff1e6', dir: 'rtl' });
    ctx.restore();
    text(ctx, label, W / 2, 425, 28, { color: COLORS.dim, weight: 700 });
    text(ctx, 'المجموعة ' + arNum(this.set) + ' / ' + arNum(e.sets) + '  ·  ' + arNum(Math.round(this.kcal)) + ' سعرة', W / 2, 475, 26, { weight: 700 });
    const src = e.detect === 'tempo' ? 'العدّ مع إيقاع المدرب' : this.motion.ok ? (window.MadarIOS ? 'العدّ من حركة رأسك (ARKit)' : 'العدّ من حساسات الحركة') : 'العدّ مع إيقاع المدرب';
    text(ctx, src, W / 2, 515, 21, { color: COLORS.dim });
    text(ctx, this.tipText || e.tips[Math.floor(performance.now() / 6000) % e.tips.length], W / 2, 560, 25, { color: '#9fe7c0', weight: 700, maxWidth: W - 60, fit: true });
    // buttons
    const btns = [
      ['go', this.state === 'run' || this.state === 'count' ? 'pause' : 'play', this.state === 'run' ? 'إيقاف' : this.state === 'pause' ? 'متابعة' : 'ابدأ', () => this.start(), true],
      ['nx', 'chevL', 'التالي', () => this.next()],
      ['ls', 'grid', 'التمارين', () => this.openMenu()],
      ['hl', 'heart', 'صحة', () => this.toHealth()],
    ];
    const bw = (W - 60) / btns.length;
    btns.forEach(([id, ic, l, act, strong], i) => {
      const x = W - 30 - (i + 1) * bw, y = H - 150, hov = p.isHover(id);
      roundRect(ctx, x + 6, y, bw - 12, 116, 30);
      ctx.fillStyle = strong ? (hov ? '#ffd2a8' : 'rgba(255,150,80,0.92)') : hov ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)'; ctx.fill();
      icon(ctx, ic, x + bw / 2, y + 42, 34, strong ? '#2a1405' : COLORS.text);
      text(ctx, l, x + bw / 2, y + 90, 23, { weight: 800, color: strong ? '#2a1405' : COLORS.text });
      p.region(x, y, bw, 116, () => { blip('tap', settings.sounds); act(); this.main.redraw(); }, id);
    });
  }
  drawMap(ctx, W, H, p) {
    roundRect(ctx, 0, 0, W, H, 50); ctx.fillStyle = 'rgba(12,16,26,0.82)'; ctx.fill(); glass(ctx, 0, 0, W, H, 50);
    text(ctx, 'العضلات العاملة', W / 2, 52, 32, { weight: 800 });
    drawMuscleMap(ctx, 20, 80, W - 40, H - 250, this.ex.p, this.ex.s, performance.now() / 1000);
    // legend
    const ly = H - 150;
    [['#ff5a1f', 'الأساسية: ' + this.ex.p.map(m => MUSCLE_AR[m]).join('، ')], ['#ffbe5a', 'المساعدة: ' + (this.ex.s.map(m => MUSCLE_AR[m]).join('، ') || '—')]].forEach(([c, l], i) => {
      ctx.beginPath(); ctx.arc(W - 46, ly + i * 52, 12, 0, 7); ctx.fillStyle = c; ctx.fill();
      text(ctx, l, W - 70, ly + i * 52, 22, { align: 'right', weight: 700, maxWidth: W - 100, fit: true });
    });
  }
  openMenu() { if (this.menu.mesh.parent) { this.group.remove(this.menu.mesh); } else { this.group.add(this.menu.mesh); this.menu.redraw(); } this.mgr.refreshTargets?.(); }
  drawMenu(ctx, W, H, p) {
    roundRect(ctx, 0, 0, W, H, 46); ctx.fillStyle = 'rgba(12,16,26,0.95)'; ctx.fill(); glass(ctx, 0, 0, W, H, 46);
    text(ctx, 'اختر تمريناً', W - 50, 60, 38, { align: 'right', weight: 800 });
    text(ctx, settings.hasBand !== false ? 'وزن الجسم والحبل المطاطي' : 'وزن الجسم', W - 50, 104, 24, { align: 'right', color: COLORS.dim });
    const hc = p.isHover('x'); ctx.beginPath(); ctx.arc(64, 60, 32, 0, 7); ctx.fillStyle = hc ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)'; ctx.fill(); icon(ctx, 'close', 64, 60, 28);
    p.region(24, 20, 80, 80, () => this.openMenu(), 'x');
    const list = EXERCISES.filter(e => e.kind !== 'band' || settings.hasBand !== false), cols = 4, top = 130, pad = 30, g = 12;
    const cw = (W - pad * 2 - g * (cols - 1)) / cols, rows = Math.ceil(list.length / cols), ch = Math.min(120, (H - top - 20 - g * (rows - 1)) / rows);
    list.forEach((e, i) => {
      const c = i % cols, r = Math.floor(i / cols), x = W - pad - (c + 1) * cw - c * g, y = top + r * (ch + g), id = 'e' + i, hov = p.isHover(id), on = e.id === this.ex.id;
      roundRect(ctx, x, y, cw, ch, 24); ctx.fillStyle = on ? 'rgba(255,150,80,0.9)' : hov ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)'; ctx.fill();
      text(ctx, e.name, x + cw / 2, y + ch * 0.38, 25, { weight: 800, color: on ? '#2a1405' : COLORS.text, maxWidth: cw - 16, fit: true });
      text(ctx, e.p.map(m => MUSCLE_AR[m]).join('، ') + (e.kind === 'band' ? ' · حبل' : ''), x + cw / 2, y + ch * 0.72, 18, { color: on ? '#4a2a10' : COLORS.dim, maxWidth: cw - 16, fit: true });
      p.region(x, y, cw, ch, () => { blip('tap', settings.sounds); this.choose(e.id); this.openMenu(); }, id);
    });
  }
  // ---- Apple Health (through an iPhone Shortcut; no special permission needed in the app)
  toHealth(extra = {}) {
    const minutes = Math.max(1, Math.round((this.secs + (extra.secs || 0)) / 60)), kcal = Math.round(this.kcal + (extra.kcal || 0));
    const data = { type: extra.type || (this.mode === 'box' ? 'boxing' : this.mode === 'tread' ? 'walking' : 'strength'), minutes, kcal, km: extra.km || 0 };
    try { const a = JSON.parse(localStorage.getItem('madar.workouts.v1') || '[]'); a.push({ ...data, at: Date.now() }); localStorage.setItem('madar.workouts.v1', JSON.stringify(a.slice(-200))); } catch {}
    const url = 'shortcuts://run-shortcut?name=' + encodeURIComponent('مدار تمرين') + '&input=text&text=' + encodeURIComponent(JSON.stringify(data));
    if (window.MadarIOS) window.MadarIOS.send('openExternal', { url }); else location.href = url;
    this.app.toast('❤️ يُرسل إلى «صحة» عبر اختصار «مدار تمرين» — ' + minutes + ' د · ' + kcal + ' سعرة', 4000);
  }
  // your weight from Apple Health (the Eufy scale), sent by the «مدار وزن» Shortcut to the server
  async fetchWeight() {
    try {
      const d = await (await fetch('https://studio.c-p.workers.dev/health/' + deviceIdentity().code, { cache: 'no-store' })).json();
      if (d.weight) { saveSettings({ weight: d.weight, weightAt: d.at }); this.app.toast('⚖️ وزنك ' + d.weight + ' كغ (من صحة Apple)', 2500); return d.weight; }
    } catch {}
    const url = 'shortcuts://run-shortcut?name=' + encodeURIComponent('مدار وزن');
    if (window.MadarIOS) window.MadarIOS.send('openExternal', { url }); else location.href = url;
    return null;
  }
  busy() { return this.group.visible; }   // the figure moves: full frame rate
  scaleBy(f) { this.group.scale.setScalar(THREE.MathUtils.clamp(this.group.scale.x * f, 0.4, 3)); this.mgr.changed(); }
  serialize() { const g = this.group; return { kind: 'coach', ref: { mode: this.mode, ex: this.ex.id }, p: g.position.toArray().map(v => +v.toFixed(3)), q: g.quaternion.toArray().map(v => +v.toFixed(4)), s: +g.scale.x.toFixed(3) }; }
  dispose() {
    try { speechSynthesis.cancel(); } catch {}
    this.train?.dispose(); this.motion.dispose();
    [this.main, this.map, this.menu].forEach(p => p.dispose()); this.closeBtn.dispose();
    this.group.traverse(o => { if (o.isMesh) o.geometry?.dispose(); });
  }
}
