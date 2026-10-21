// Loads 3D models (GLB, GLTF + resources, OBJ + MTL, STL, FBX, USDZ) from library items.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { USDZLoader } from 'three/addons/loaders/USDZLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { ext } from './db.js';

let draco = null;
function gltfLoader(manager) {
  const l = new GLTFLoader(manager);
  if (!draco) { draco = new DRACOLoader(); draco.setDecoderPath(new URL('../lib/three/addons/libs/draco/gltf/', import.meta.url).href); }
  l.setDRACOLoader(draco);
  l.setMeshoptDecoder(MeshoptDecoder);
  return l;
}

const base = s => decodeURIComponent(String(s).split(/[\\/]/).pop().split('?')[0].split('#')[0]).toLowerCase();

function managerFor(urlMap) {
  const m = new THREE.LoadingManager();
  m.setURLModifier(url => urlMap[base(url)] || url);
  return m;
}

const defaultMat = () => new THREE.MeshStandardMaterial({ color: 0xc7cfdc, roughness: 0.45, metalness: 0.1 });

// Returns { object, animations, revoke() }.
export async function loadModelFromFiles(files, format) {
  const urlMap = {};
  const urls = [];
  for (const f of files) { const u = URL.createObjectURL(f.blob); urls.push(u); urlMap[base(f.name)] = u; }
  const revoke = () => urls.forEach(u => URL.revokeObjectURL(u));
  const main = files[0];
  const fmt = (format || ext(main.name)).toLowerCase();
  const manager = managerFor(urlMap);
  try {
    if (fmt === 'glb' || fmt === 'gltf') {
      const g = await gltfLoader(manager).loadAsync(urlMap[base(main.name)]);
      return { object: g.scene, animations: g.animations || [], revoke };
    }
    if (fmt === 'obj') {
      const loader = new OBJLoader(manager);
      const mtl = files.find(f => ext(f.name) === 'mtl');
      if (mtl) {
        const mats = new MTLLoader(manager).parse(await mtl.blob.text(), '');
        mats.preload();
        loader.setMaterials(mats);
      }
      const obj = loader.parse(await main.blob.text());
      if (!mtl) obj.traverse(o => { if (o.isMesh) o.material = defaultMat(); });
      return { object: obj, animations: [], revoke };
    }
    if (fmt === 'stl') {
      const geo = new STLLoader().parse(await main.blob.arrayBuffer());
      geo.computeVertexNormals();
      const mat = defaultMat();
      if (geo.hasColors) { mat.vertexColors = true; mat.color.set(0xffffff); }
      return { object: new THREE.Mesh(geo, mat), animations: [], revoke };
    }
    if (fmt === 'fbx') {
      const obj = new FBXLoader(manager).parse(await main.blob.arrayBuffer(), '');
      return { object: obj, animations: obj.animations || [], revoke };
    }
    if (fmt === 'usdz') {
      const obj = new USDZLoader(manager).parse(await main.blob.arrayBuffer());
      return { object: obj, animations: [], revoke };
    }
    throw new Error('صيغة غير مدعومة: ' + fmt);
  } catch (e) { revoke(); throw e; }
}

// `includes`: the model's other files by their relative name → full address (Poly Haven keeps textures elsewhere)
export async function loadModelFromUrl(url, includes = null) {
  let manager;
  if (includes) {
    manager = new THREE.LoadingManager();
    const keys = Object.keys(includes);
    manager.setURLModifier(u => { const d = decodeURIComponent(u); const k = keys.find(k => d.endsWith(k)); return k ? includes[k] : u; });
  }
  const g = await gltfLoader(manager).loadAsync(url);
  return { object: g.scene, animations: g.animations || [], revoke() {} };
}

// Large textures (e.g. 2048-4096 px) are redrawn at most `max` px to keep GPU memory low on iPhone.
const shrunk = new WeakSet();
function shrinkTexture(t, max) {
  const img = t.image;
  if (!img || shrunk.has(t)) return;
  const w = img.width || img.videoWidth, h = img.height || img.videoHeight;
  if (!w || !h || Math.max(w, h) <= max || img instanceof HTMLVideoElement) return;
  try {
    const k = max / Math.max(w, h);
    const c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    if (img.close) img.close();
    t.image = c; t.needsUpdate = true; shrunk.add(t);
  } catch {}
}

// Scale to `size` metres on the longest side and sit the model on y = 0, centred in x/z.
export function normalize(object, size = 0.42) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return { radius: 0.2, height: 0.2 };
  const dim = box.getSize(new THREE.Vector3());
  const k = size / Math.max(dim.x, dim.y, dim.z, 1e-6);
  object.scale.multiplyScalar(k);
  object.updateMatrixWorld(true);
  box.setFromObject(object);
  const c = box.getCenter(new THREE.Vector3());
  object.position.x -= c.x; object.position.z -= c.z; object.position.y -= box.min.y;
  object.traverse(o => {
    if (o.isMesh) {
      o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => {
        if (!m) return;
        for (const v of Object.values(m)) if (v && v.isTexture) { shrinkTexture(v, 1024); v.anisotropy = 4; }
      });
    }
  });
  const d = box.getSize(new THREE.Vector3());
  return { radius: Math.max(d.x, d.z) / 2, height: d.y };
}
