// The coach's anatomical figure: the real muscles and skeleton of Z-Anatomy (CC BY-SA 4.0, on BodyParts3D), grouped by
// Madar's muscle names, fitted to the coach's skeleton so it performs every exercise - the worked muscles glow.
// The mesh is bound to the same bones as the simple mannequin: each vertex follows the nearest bones of its own
// body part (an arm muscle never follows the chest), blended over the two closest so joints bend smoothly.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const URL_BODY = new URL('../assets/coach/muscles.glb', import.meta.url).href;   // every muscle painted and named (grouped by Madar's names), arms in an A-pose
// which bones may carry each body part ('*' = side-specific: Left / Right)
const CARRY = {
  chest: ['Spine2', 'Spine1', '*Shoulder', '*Arm'], obliques: ['Spine', 'Spine1', 'Spine2', 'Hips'], abs: ['Hips', 'Spine', 'Spine1', 'Spine2'],
  traps: ['Spine2', 'Neck', '*Shoulder', 'Spine1'], upperBack: ['Spine1', 'Spine2', '*Shoulder', '*Arm'], lowerBack: ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head'],
  delts: ['*Arm', '*Shoulder'], biceps: ['*Arm', '*ForeArm'], triceps: ['*Arm', '*ForeArm'], forearms: ['*ForeArm', '*Hand', '*Arm'],
  glutes: ['Hips', '*UpLeg'], quads: ['*UpLeg', '*Leg', 'Hips'], hamstrings: ['*UpLeg', '*Leg', 'Hips'], adductors: ['*UpLeg', 'Hips', 'Spine'],
  calves: ['*Leg', '*Foot'], shins: ['*Leg', '*Foot'], neck: ['Neck', 'Head', 'Spine2', '*Shoulder'],
};
const ALL = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', '*Shoulder', '*Arm', '*ForeArm', '*Hand', '*UpLeg', '*Leg', '*Foot', '*ToeBase'];
const CHILD = { Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head', Head: 'HeadTop_End', Shoulder: 'Arm', Arm: 'ForeArm', ForeArm: 'Hand', Hand: 'HandMiddle1', UpLeg: 'Leg', Leg: 'Foot', Foot: 'ToeBase', ToeBase: 'Toe_End' };

let cache = null;
// meshopt files keep positions as quantised integers: back to plain floats before moving them
function floatGeo(g0) {
  const g = new THREE.BufferGeometry(), a = g0.attributes.position, n = a.count, f = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { f[i * 3] = a.getX(i); f[i * 3 + 1] = a.getY(i); f[i * 3 + 2] = a.getZ(i); }
  g.setAttribute('position', new THREE.BufferAttribute(f, 3)); if (g0.index) g.setIndex(Array.from(g0.index.array));
  const uv = g0.attributes.uv;
  if (uv) { const u = new Float32Array(n * 2); for (let i = 0; i < n; i++) { u[i * 2] = uv.getX(i); u[i * 2 + 1] = uv.getY(i); } g.setAttribute('uv', new THREE.BufferAttribute(u, 2)); }
  return g;
}
function loadBody() {
  if (!cache) cache = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(URL_BODY);
  return cache;
}

// muscle look: deep red with fibres along the limbs, glowing orange (primary) / amber (secondary) when worked
function muscleMaterial(uniforms, map = null) {
  const m = new THREE.MeshStandardMaterial({ color: map ? 0xffffff : 0x9c2a26, map, roughness: map ? 0.7 : 0.55, metalness: 0.0 });
  m.userData.glow = { value: 0 };
  m.onBeforeCompile = sh => {
    sh.uniforms.uGlowM = m.userData.glow; sh.uniforms.uT = uniforms.uT;
    const vs = sh.vertexShader;
    sh.vertexShader = 'varying vec3 vAp;\n' + vs.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vAp = position;');
    sh.fragmentShader = 'varying vec3 vAp;\nuniform float uGlowM;\nuniform float uT;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
  float fib = 0.5 + 0.5 * sin(dot(vAp, vec3(260.0, 40.0, 260.0)) + sin(vAp.y * 60.0) * 2.0);
  diffuseColor.rgb *= mix(${map ? '0.95' : '0.78'}, ${map ? '1.05' : '1.12'}, fib);
  float gP = step(0.5, uGlowM);
  vec3 gC = mix(vec3(1.0, 0.6, 0.18), vec3(1.0, 0.38, 0.08), gP);`)
      .replace('#include <opaque_fragment>', `float gA = uGlowM < 0.01 ? 0.0 : (gP > 0.5 ? 0.85 : 0.6);
  float gL = dot(outgoingLight, vec3(0.3, 0.59, 0.11));
  outgoingLight = mix(outgoingLight, gC * clamp(gL * 1.6, 0.25, 1.1) * (1.0 + 0.25 * sin(uT * 5.0)) * mix(0.8, 1.15, fib), gA);
#include <opaque_fragment>`);
  };
  return m;
}

// The painted muscle model carries its own skeleton and skin weights (every muscle separate, Mixamo bone names).
// It follows the mannequin by retargeting: each bone turns by the mannequin bone's change from its rest pose,
// after a one-time alignment of the two rest poses (A-pose arms → the mannequin's arms).
function buildRigged(fig, g) {
  const B = fig.bones, model = fig.model, body = new THREE.Group();
  fig.resetPose(); model.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const P = n => B[n].getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  const root = g.scene; root.updateMatrixWorld(true);
  const ours = {}; root.traverse(o => { if (o.isBone) ours[o.name.replace(/^mixamorig:?/, '')] = o; });
  const meshes = []; root.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
  // size and place: same height, standing on the mannequin's toes
  const box = new THREE.Box3(); meshes.forEach(m => box.expandByObject(m));
  const H = P('HeadTop_End').y - P('LeftToe_End').y, k = H / (box.max.y - box.min.y);
  root.scale.setScalar(k); root.position.set(P('Hips').x, P('LeftToe_End').y - box.min.y * k, 0);
  body.add(root); model.add(body); body.updateMatrixWorld(true);
  const wq = o => o.getWorldQuaternion(new THREE.Quaternion());
  const wp = o => o.getWorldPosition(new THREE.Vector3());
  const names = Object.keys(ours).filter(n => B[n]);
  const rest = {};   // rest world rotations of both, and the alignment
  const LIMB = /Shoulder|Arm|Hand|UpLeg|Leg|Foot/;
  const CH = { Shoulder: 'Arm', Arm: 'ForeArm', ForeArm: 'Hand', UpLeg: 'Leg', Leg: 'Foot', Foot: 'ToeBase' };
  for (const n of names) {
    const base = n.replace(/^(Left|Right)/, ''), side = n.match(/^(Left|Right)/)?.[1] || '', c = (CH[base] && side + CH[base]) || (/Hand(Thumb|Index|Middle|Ring|Pinky)\d$/.test(n) ? n.replace(/\d$/, x => +x + 1) : null);   // fingers: the next joint
    let align = null;
    const hk = n.match(/^(Left|Right)Hand$/) && ['HandMiddle1', 'HandIndex1', 'HandPinky1'].every(k => ours[side + k] && B[side + k]);
    if (hk) {
      // the hand: full frame (towards the middle knuckle + across the knuckles), so the palm faces the right way
      const fr = (S, x) => { const dd = wp(S[side + 'HandMiddle1']).sub(wp(S[x])).normalize(), ac = wp(S[side + 'HandPinky1']).sub(wp(S[side + 'HandIndex1']));
        const nn = new THREE.Vector3().crossVectors(dd, ac).normalize(), cc = new THREE.Vector3().crossVectors(nn, dd);
        return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(dd, cc, nn)); };
      align = fr(B, n).multiply(fr(ours, n).invert());
    } else if (LIMB.test(n) && c && ours[c] && B[c]) {
      align = new THREE.Quaternion();
      const a = wp(ours[c]).sub(wp(ours[n])).normalize(), b = wp(B[c]).sub(wp(B[n])).normalize();
      align.setFromUnitVectors(a, b);
    }
    // align null: inherits the parent's below (fingers follow the hand's)
    rest[n] = { m0: wq(B[n]), o0: wq(ours[n]), align, hip: n === 'Hips' ? model.worldToLocal(wp(B[n])) : null, hipO: n === 'Hips' ? ours[n].position.clone() : null };
  }
  // parents first
  const depth = o => { let d = 0; while (o.parent) { d++; o = o.parent; } return d; };
  names.sort((a, b) => depth(ours[a]) - depth(ours[b]));
  for (const n of names) if (!rest[n].align) { const pn = ours[n].parent?.name.replace(/^mixamorig:?/, ''); rest[n].align = rest[pn]?.align?.clone() || new THREE.Quaternion(); }
  const q = new THREE.Quaternion(), pq = new THREE.Quaternion(), d = new THREE.Quaternion(), v = new THREE.Vector3();
  const sync = () => {
    model.updateMatrixWorld(true);
    for (const n of names) {
      const o = ours[n], r = rest[n];
      d.copy(wq(B[n])).multiply(q.copy(r.m0).invert());                    // the mannequin bone's turn since rest
      const want = d.clone().multiply(r.align).multiply(r.o0);
      o.parent.getWorldQuaternion(pq); o.quaternion.copy(pq.invert().multiply(want));
      if (r.hip) { v.copy(wp(B[n])).sub(model.localToWorld(r.hip.clone())).applyQuaternion(o.parent.getWorldQuaternion(pq).invert()).divideScalar(o.parent.getWorldScale(new THREE.Vector3()).x); o.position.copy(r.hipO).add(v); }
      o.updateMatrixWorld(true);
    }
  };
  // forearm twist (half of the wrist's turn, spread along the forearm) and fingers that close in a grip
  const extra = [];
  for (const sd of ['Left', 'Right']) {
    const fa = ours[sd + 'ForeArm'], tb = ours[sd + 'ForeArmTwist'], hd = ours[sd + 'Hand'];
    if (fa && tb && hd) extra.push({ twist: true, fa, tb, hd, axis: tb.position.clone().normalize() });
    if (!hd || !ours[sd + 'HandIndex1']) continue;
    // palm side: the thumb tip sits in front of the fingers' plane
    const pw = n => wp(ours[sd + 'Hand' + n]);
    const k1 = pw('Middle1'), dirF = pw('Middle4').sub(k1).normalize(), across = pw('Pinky1').sub(pw('Index1')).normalize();
    let palm = new THREE.Vector3().crossVectors(across, dirF).normalize();
    if (pw('Thumb4').sub(k1).dot(palm) < 0) palm.negate();
    const h0 = wq(hd);
    for (const f of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) {
      const bs = [1, 2, 3].map(i => ours[sd + 'Hand' + f + i]); if (bs.some(b => !b)) continue;
      const dir = wp(ours[sd + 'Hand' + f + '4']).sub(wp(bs[0])).normalize();
      const axis = new THREE.Vector3().crossVectors(dir, palm).normalize();   // turns the finger toward the palm
      extra.push({ hd, h0, bs, axis, ang: f === 'Thumb' ? [0.3, 0.35, 0.4] : [0.85, 0.95, 0.55] });
    }
  }
  const tq = new THREE.Quaternion(), hq = new THREE.Quaternion(), ax = new THREE.Vector3(), cum = new THREE.Quaternion(), rq = new THREE.Quaternion();
  // shoulder blade rhythm: raising the arm high also turns the shoulder (scapula + clavicle) about a third of the way
  // above ~30° - the shoulder rises with the arm, as in a real body, instead of the arm pivoting alone in the armpit
  const sc = ['Left', 'Right'].map(sd => ({ sh: ours[sd + 'Shoulder'], arm: ours[sd + 'Arm'], fa: ours[sd + 'ForeArm'] })).filter(x => x.sh && x.arm && x.fa);
  const up = new THREE.Vector3(), aDir = new THREE.Vector3(), rAx = new THREE.Vector3(), aw = new THREE.Quaternion();
  const scapula = () => {
    if (!ours.Spine2 || !ours.Neck) return;
    up.copy(wp(ours.Neck)).sub(wp(ours.Spine2)).normalize();
    for (const x of sc) {
      aDir.copy(wp(x.fa)).sub(wp(x.arm)).normalize();
      const elev = Math.acos(THREE.MathUtils.clamp(-up.dot(aDir), -1, 1));
      const extra = Math.max(0, elev - 0.52) * 0.33; if (extra < 1e-3) continue;
      rAx.crossVectors(up.clone().negate(), aDir); if (rAx.lengthSq() < 1e-6) continue; rAx.normalize();
      aw.copy(wq(x.arm));
      const want = new THREE.Quaternion().setFromAxisAngle(rAx, extra).multiply(wq(x.sh));
      x.sh.parent.getWorldQuaternion(pq); x.sh.quaternion.copy(pq.invert().multiply(want)); x.sh.updateMatrixWorld(true);
      x.sh.getWorldQuaternion(pq); x.arm.quaternion.copy(pq.invert().multiply(aw)); x.arm.updateMatrixWorld(true);
    }
  };
  // arms never pass through the trunk: this body is broader than the mannequin it follows, so when the elbow,
  // forearm or hand would sink into the waist/chest (hands on hips, arms by the sides) the arm opens out from the
  // shoulder just enough to rest on the surface
  const torsoN = ['Hips', 'Spine', 'Spine1', 'Spine2'].map(n => ours[n]).filter(Boolean);
  const rq2 = new THREE.Quaternion(), lat = new THREE.Vector3(), fwd = new THREE.Vector3(), upv = new THREE.Vector3(), tmp = new THREE.Vector3();
  const Hgt = (() => { const a = ours.HeadTop_End || ours.Head, b = ours.LeftToe_End || ours.LeftFoot; return a && b ? wp(a).distanceTo(wp(b)) : 1.8; })();
  const inside = (p, c0, c1) => {
    // nearest point on the spine line, then the trunk's ellipse there (wider at the chest, narrower at the waist)
    const ab = tmp.copy(c1).sub(c0), t = THREE.MathUtils.clamp(p.clone().sub(c0).dot(ab) / ab.lengthSq(), -0.15, 1.05);
    if (t <= -0.15 || t >= 1.05) return 0;
    const c = c0.clone().addScaledVector(ab, t), d = p.clone().sub(c);
    const hw = Hgt * (0.088 + 0.03 * Math.max(0, t - 0.4)), hd = Hgt * 0.07;
    const v = (d.dot(lat) / hw) ** 2 + (d.dot(fwd) / hd) ** 2;
    return v < 1 ? 1 - v : 0;
  };
  const keepOut = () => {
    if (torsoN.length < 4 || !ours.LeftArm || !ours.RightArm) return;
    lat.copy(wp(ours.LeftArm)).sub(wp(ours.RightArm)).normalize();
    upv.copy(wp(ours.Spine2)).sub(wp(ours.Hips)).normalize(); fwd.crossVectors(lat, upv).normalize();
    const c0 = wp(ours.Hips), c1 = wp(ours.Spine2);
    for (const sd of ['Left', 'Right']) {
      const arm = ours[sd + 'Arm'], pts = [ours[sd + 'ForeArm'], ours[sd + 'ForeArmTwist'], ours[sd + 'Hand'], ours[sd + 'HandMiddle1']].filter(Boolean);
      if (!arm || !pts.length) continue;
      const pen = () => pts.reduce((m, b) => Math.max(m, inside(wp(b), c0, c1)), 0);
      let p0 = pen(); if (!p0) continue;
      const sign = sd === 'Left' ? 1 : -1;
      for (let i = 0; i < 14 && p0 > 0; i++) {
        // open the arm outward around the body's forward axis (shoulder as pivot), small steps
        const want = rq2.setFromAxisAngle(fwd, -sign * 0.045).multiply(wq(arm));
        arm.parent.getWorldQuaternion(pq); arm.quaternion.copy(pq.invert().multiply(want)); arm.updateMatrixWorld(true);
        p0 = pen();
      }
    }
  };
  const after = () => {
    scapula(); keepOut(); const g = fig.grip ?? 0.25;
    for (const e of extra) {
      if (e.twist) {
        // the hand's turn relative to the forearm, around the forearm's own axis → half of it on the twist bone
        e.fa.getWorldQuaternion(tq).invert().multiply(wq(e.hd));
        ax.copy(e.axis).multiplyScalar(ax.copy(e.axis).dot(new THREE.Vector3(tq.x, tq.y, tq.z)));
        const t = new THREE.Quaternion(ax.x, ax.y, ax.z, tq.w).normalize();
        e.tb.quaternion.identity().slerp(t, 0.5); e.tb.updateMatrixWorld(true);
        continue;
      }
      // the axis turns with the hand; each joint adds its bend to the ones before it
      hq.copy(wq(e.hd)).multiply(rq.copy(e.h0).invert());
      ax.copy(e.axis).applyQuaternion(hq); cum.identity();
      e.bs.forEach((b, i) => {
        cum.premultiply(rq.setFromAxisAngle(ax, e.ang[i] * g));
        const want = cum.clone().multiply(wq(b));
        b.parent.getWorldQuaternion(pq); b.quaternion.copy(pq.invert().multiply(want)); b.updateMatrixWorld(true);
      });
    }
  };
  const mats = {}, plain = [];
  let lastFrame = -1;
  for (const m of meshes) {
    const grp = m.userData.group || m.name, map = m.material.map;
    const mat = muscleMaterial(fig.uniforms, map);
    if (grp === 'bone' || grp === 'other') plain.push(mat); else mats[grp] = mat;
    m.material = mat; m.frustumCulled = false; m.name = grp;
    // whichever part draws first this frame moves the skeleton (then every part uses this frame's pose)
    m.onBeforeRender = r => {
      const f = r.info.render.frame;
      if (f !== lastFrame) { lastFrame = f; sync(); after(); }
      m.skeleton.update();
    };
  }
  sync(); after();
  return {
    group: body,
    setGlow(primary = [], secondary = [], k = 1) {
      for (const [name, m] of Object.entries(mats)) if (name !== '_plain') m.userData.glow.value = primary.includes(name) ? Math.max(0.55, k) : secondary.includes(name) ? 0.35 * Math.min(1, k + 0.2) : 0;
    },
  };
}

export async function buildAnatomy(fig) {
  const g = await loadBody();
  { let rigged = false; g.scene.traverse(o => { if (o.isSkinnedMesh) rigged = true; }); if (rigged) return buildRigged(fig, g); }
  const B = fig.bones, model = fig.model;
  const body = new THREE.Group();
  // ---- orientation and size: height axis = the longest; the front = where the chest is
  const parts = [];
  g.scene.updateMatrixWorld(true);
  g.scene.traverse(o => { if (o.isMesh) parts.push(o); });
  const meta = g.scene.getObjectByName('body')?.userData || {}, painted = !!meta.armDir;   // the painted muscle model (A-pose, its own colours)
  const tex = painted ? parts.find(p => p.material?.map)?.material.map : null;
  const box = new THREE.Box3(); parts.forEach(p => box.expandByObject(p));
  const size = box.getSize(new THREE.Vector3()), up = size.x > size.y && size.x > size.z ? 'x' : size.y > size.z ? 'y' : 'z';
  const toY = new THREE.Matrix4();
  if (up === 'z') toY.makeRotationX(-Math.PI / 2); else if (up === 'x') toY.makeRotationZ(Math.PI / 2);
  const centroid = name => { const p = parts.find(x => x.name === name); if (!p) return null; const b = new THREE.Box3().setFromObject(p); return b.getCenter(new THREE.Vector3()).applyMatrix4(toY); };
  const chest = centroid('chest'), back = centroid('upperBack') || centroid('lowerBack');
  const flip = chest && back && chest.z < back.z ? new THREE.Matrix4().makeRotationY(Math.PI) : new THREE.Matrix4();
  const M = new THREE.Matrix4().multiplyMatrices(flip, toY);
  const b2 = new THREE.Box3(); parts.forEach(p => { const gg = floatGeo(p.geometry).applyMatrix4(p.matrixWorld).applyMatrix4(M); gg.computeBoundingBox(); b2.union(gg.boundingBox); gg.dispose(); });
  // the mannequin's skeleton in model space: height from soles to the top of the head
  model.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const P = n => (B[n] || B[n.replace('*', 'Left')]).getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  const top = P('HeadTop_End'), toe = P('LeftToe_End');
  const H = top.y - toe.y, k = H / (b2.max.y - b2.min.y);
  const c = b2.getCenter(new THREE.Vector3());
  const fit = new THREE.Matrix4().makeTranslation(P('Hips').x, toe.y - b2.min.y * k, 0).multiply(new THREE.Matrix4().makeScale(k, k, k)).multiply(new THREE.Matrix4().makeTranslation(-c.x, 0, -c.z));
  M.premultiply(fit);
  // ---- pose the mannequin like the anatomical model (arms down at the sides, palms forward) to bind
  fig.resetPose();
  const Z = new THREE.Vector3(0, 0, 1), X = new THREE.Vector3(1, 0, 0);
  const lowerArm = (side, s) => {
    const arm = B[side + 'Arm'], fore = B[side + 'ForeArm'];
    const a = arm.getWorldPosition(new THREE.Vector3()), f = fore.getWorldPosition(new THREE.Vector3());
    const ad = painted && meta.armDir[side];
    const want = ad ? new THREE.Vector3(...ad).transformDirection(M).normalize() : new THREE.Vector3(s * 0.18, -1, 0.02).normalize(), cur = f.clone().sub(a).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(cur, want).multiply(arm.getWorldQuaternion(new THREE.Quaternion()));
    arm.quaternion.copy(arm.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q)); arm.updateMatrixWorld(true);
  };
  model.updateMatrixWorld(true); lowerArm('Left', 1); lowerArm('Right', -1); model.updateMatrixWorld(true);
  const bonesArr = [], segs = [];
  const add = n => { const b = B[n]; if (!b) return -1; let i = bonesArr.indexOf(b); if (i < 0) { i = bonesArr.length; bonesArr.push(b); } return i; };
  for (const name of ALL) for (const side of name.startsWith('*') ? ['Left', 'Right'] : ['']) {
    const n = side + name.replace('*', ''), base = name.replace('*', '');
    const ch = CHILD[base] ? (CHILD[base].startsWith('Head') || CHILD[base] === 'Spine' || CHILD[base].startsWith('Spine') || CHILD[base] === 'Neck' ? CHILD[base] : side + CHILD[base]) : null;
    if (!B[n]) continue;
    const a = P(n), bb = ch && B[ch] ? P(ch) : a.clone().add(new THREE.Vector3(0, 0.05, 0));
    segs.push({ key: name, side, i: add(n), a, b: bb });
  }
  const skeleton = new THREE.Skeleton(bonesArr);
  const adjacent = (i, j) => { const a = bonesArr[i], b = bonesArr[j]; return a.parent === b || b.parent === a || (a.parent && a.parent === b.parent && /Spine|Hips/.test(a.name + b.name)); };   // the bind = this arms-down pose
  // ---- every body part → a skinned mesh
  const mats = {};
  const bone = new THREE.MeshStandardMaterial({ color: 0xe9dcc0, roughness: 0.6 });
  const other = new THREE.MeshStandardMaterial({ color: 0x7e2422, roughness: 0.6 });
  const tmp = new THREE.Vector3(), seg = new THREE.Vector3();
  const trunkHalf = Math.abs(P('LeftArm').x - P('Hips').x) * 0.95, pelvisHalf = Math.abs(P('LeftUpLeg').x - P('Hips').x) * 0.7, hipJ = P('LeftUpLeg').y, sp2y = P('Spine2').y, SPINE = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head'];
  const distSeg = (p, s) => { seg.subVectors(s.b, s.a); const t = THREE.MathUtils.clamp(tmp.subVectors(p, s.a).dot(seg) / Math.max(1e-9, seg.lengthSq()), 0, 1); return tmp.copy(s.a).addScaledVector(seg, t).distanceTo(p); };
  const meshes = [];
  for (const p of parts) {
    const geo = floatGeo(p.geometry).applyMatrix4(p.matrixWorld).applyMatrix4(M);
    geo.computeVertexNormals();
    const allow = CARRY[p.name] || ALL, pos = geo.attributes.position, n = pos.count;
    // bones and the small deep muscles: each separate piece belongs to one body region (from its centre) -
    // a bone moves rigidly with one bone of the rig, a deep muscle only with the bones of its region
    let comp = null, region = null;
    if (!painted && (p.name === 'bone' || p.name === 'other') && geo.index) {
      const par = new Int32Array(n).map((_, i) => i), find = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
      const ix = geo.index.array; for (let t = 0; t < ix.length; t += 3) { const a = find(ix[t]), b = find(ix[t + 1]), c = find(ix[t + 2]); par[b] = a; par[find(c)] = a; }
      comp = new Int32Array(n); const cen = new Map();
      for (let i = 0; i < n; i++) { const r = find(i); comp[i] = r; let c = cen.get(r); if (!c) cen.set(r, c = [0, 0, 0, 0]); c[0] += pos.getX(i); c[1] += pos.getY(i); c[2] += pos.getZ(i); c[3]++; }
      region = new Map();
      for (const [r, c] of cen) {
        const cv = new THREE.Vector3(c[0] / c[3], c[1] / c[2 + 1] * 0 + c[1] / c[3], c[2] / c[3]), cdx = Math.abs(cv.x - P('Hips').x), side = cv.x >= P('Hips').x ? 'Left' : 'Right';
        let keys;
        if (cv.y > sp2y + 0.12 && cdx < trunkHalf * 0.7) keys = ['Neck', 'Head', 'Spine2'];
        else if (cdx < trunkHalf * 1.02 && cv.y > hipJ - 0.12) keys = SPINE.concat(cv.y > sp2y ? ['*Shoulder'] : []);
        else if (cv.y < hipJ - 0.05 && cdx < Math.abs(P('LeftUpLeg').x - P('Hips').x) * 2.4) keys = ['*UpLeg', '*Leg', '*Foot', '*ToeBase'];
        else keys = ['*Shoulder', '*Arm', '*ForeArm', '*Hand'];
        let best = [1e9, 0];
        if (p.name === 'bone') for (const sg of segs) { if (!keys.includes(sg.key) || (sg.side && sg.side !== side)) continue; const d = distSeg(cv, sg); if (d < best[0]) best = [d, sg.i]; }
        region.set(r, { keys, rigid: p.name === 'bone' ? best[1] : -1 });
      }
    }
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i);
      const side = v.x >= P('Hips').x ? 'Left' : 'Right';
      // the trunk's own bones and deep muscles never follow the arms
      const deepName = !painted && (p.name === 'bone' || p.name === 'other') || p.name === 'obliques' || p.name === 'lowerBack';
      const aboveHip = deepName && v.y > hipJ + 0.03;
      const dx = Math.abs(v.x - P('Hips').x), deep = deepName;
      const inTrunk = deep && ((dx < trunkHalf && v.y > hipJ + 0.03) || (dx < pelvisHalf && v.y > hipJ - 0.16));   // ribs, spine, pelvis: the trunk only
      const reg = region ? region.get(comp[i]) : null;
      if (reg && reg.rigid >= 0) { si[i * 4] = reg.rigid; sw[i * 4] = 1; continue; }
      let best = [[1e9, 0], [1e9, 0]];
      for (const s of segs) {
        if (!allow.includes(s.key) || (s.side && s.side !== side) || (aboveHip && /UpLeg|Leg|Foot|Toe/.test(s.key))) continue;
        if (reg ? !reg.keys.includes(s.key) : (inTrunk && !(SPINE.includes(s.key) || (s.key === '*Shoulder' && v.y > sp2y)))) continue;
        const d = distSeg(v, s);
        if (d < best[0][0]) { best[1] = best[0]; best[0] = [d, s.i]; } else if (d < best[1][0]) best[1] = [d, s.i];
      }
      if (best[0][0] > 1e8) { for (const s of segs) { const d = distSeg(v, s); if (d < best[0][0]) best[0] = [d, s.i]; } best[1] = best[0]; }
      const near = best[1][1] !== best[0][1] && adjacent(best[0][1], best[1][1]);   // blend only across a joint
      const w0 = 1 / Math.pow(best[0][0] + 0.02, 4), w1 = near ? 1 / Math.pow(best[1][0] + 0.02, 4) : 0, t = w0 + w1;
      si[i * 4] = best[0][1]; si[i * 4 + 1] = best[1][1]; sw[i * 4] = w0 / t; sw[i * 4 + 1] = w1 / t;
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    const mat = painted ? (p.name === 'bone' || p.name === 'other' ? (mats._plain ||= muscleMaterial(fig.uniforms, tex)) : (mats[p.name] = muscleMaterial(fig.uniforms, tex)))
      : p.name === 'bone' ? bone : p.name === 'other' ? other : (mats[p.name] = muscleMaterial(fig.uniforms));
    const sm = new THREE.SkinnedMesh(geo, mat); sm.name = p.name; sm.frustumCulled = false;
    meshes.push(sm);
  }
  // ---- the abdominal wall when the model has no rectus abdominis (BodyParts3D): eight rounded segments over the belly
  if (!meshes.some(m => m.name === 'abs')) {
    const hipY = P('Hips').y, ch2 = P('Spine2'), frontZ = (() => { const bm = meshes.find(m => m.name === 'bone'); let z = -1; if (bm) { const a = bm.geometry.attributes.position; for (let i = 0; i < a.count; i += 3) { const y = a.getY(i), x = a.getX(i); if (Math.abs(x - P('Hips').x) < 0.07 && y > hipY + 0.05 && y < ch2.y) z = Math.max(z, a.getZ(i)); } } return z > -1 ? z : P('Spine1').z + 0.11; })();
    const parts2 = [], y0 = hipY - 0.04, y1 = ch2.y - 0.02, segH = (y1 - y0) / 4;
    for (let r = 0; r < 4; r++) for (const sx of [-1, 1]) {
      const gg = new RoundedBoxGeometry(0.066, segH * 0.9, 0.022, 3, 0.009);
      gg.translate(P('Hips').x + sx * 0.04, y0 + segH * (r + 0.5), frontZ + 0.005 - Math.pow((r - 1.5) / 3, 2) * 0.03);
      parts2.push(gg);
    }
    const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
    const geo = mergeGeometries(parts2.map(x => x.toNonIndexed())); geo.computeVertexNormals();
    const n = geo.attributes.position.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), v = new THREE.Vector3();
    const abSegs = segs.filter(s => CARRY.abs.includes(s.key));
    for (let i = 0; i < n; i++) { v.fromBufferAttribute(geo.attributes.position, i); let b = [1e9, 0]; for (const s of abSegs) { const d = distSeg(v, s); if (d < b[0]) b = [d, s.i]; } si[i * 4] = b[1]; sw[i * 4] = 1; }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    const sm = new THREE.SkinnedMesh(geo, mats.abs = muscleMaterial(fig.uniforms)); sm.name = 'abs'; sm.frustumCulled = false; meshes.push(sm);
  }
  // bind everything to the arms-down pose, then give the bones back to the poser
  model.add(body);
  body.updateMatrixWorld(true);
  for (const m of meshes) body.add(m);
  body.updateMatrixWorld(true);
  for (const m of meshes) m.bind(skeleton);
  fig.resetPose(); model.updateMatrixWorld(true);
  return {
    group: body,
    setGlow(primary = [], secondary = [], k = 1) {
      for (const [name, m] of Object.entries(mats)) if (name !== '_plain') m.userData.glow.value = primary.includes(name) ? Math.max(0.55, k) : secondary.includes(name) ? 0.35 * Math.min(1, k + 0.2) : 0;
    },
  };
}
