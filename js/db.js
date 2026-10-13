// Local media library kept in IndexedDB (videos, images, 3D models with their resources).
const DB_NAME = 'madar-library';
const STORE = 'items';
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const s = t.objectStore(STORE);
    const r = fn(s);
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const VIDEO_EXT = ['mp4', 'm4v', 'mov', 'webm'];
export const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'avif'];
export const MODEL_MAIN_EXT = ['glb', 'gltf', 'obj', 'stl', 'fbx', 'usdz'];
export const ext = name => (name.split('.').pop() || '').toLowerCase();

export async function listItems() {
  const items = await tx('readonly', s => s.getAll());
  return (items || []).sort((a, b) => b.added - a.added);
}
export function getItem(id) { return tx('readonly', s => s.get(id)); }
export function putItem(item) { return tx('readwrite', s => s.put(item)); }
export function deleteItem(id) { return tx('readwrite', s => s.delete(id)); }

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// Turn a FileList into library items. Images that come with an OBJ/GLTF are treated as its textures.
export async function importFiles(fileList) {
  const files = Array.from(fileList);
  const hasBundle = files.some(f => ['gltf', 'obj'].includes(ext(f.name)));
  const made = [];
  const bundleMain = files.filter(f => ['gltf', 'obj'].includes(ext(f.name)));
  const resources = files.filter(f => !MODEL_MAIN_EXT.includes(ext(f.name)) && !VIDEO_EXT.includes(ext(f.name)) && (hasBundle || !IMAGE_EXT.includes(ext(f.name))));

  for (const f of files) {
    const e = ext(f.name);
    let item = null;
    if (VIDEO_EXT.includes(e)) item = { type: 'video', files: [{ name: f.name, blob: f }] };
    else if (IMAGE_EXT.includes(e) && !hasBundle) item = { type: 'image', files: [{ name: f.name, blob: f }] };
    else if (['glb', 'stl', 'fbx', 'usdz'].includes(e)) item = { type: 'model', format: e, files: [{ name: f.name, blob: f }] };
    else if (bundleMain.includes(f)) item = { type: 'model', format: e, files: [{ name: f.name, blob: f }, ...resources.map(r => ({ name: r.name, blob: r }))] };
    if (!item) continue;
    item.id = uid();
    item.name = f.name.replace(/\.[^.]+$/, '');
    item.added = Date.now();
    item.size = item.files.reduce((n, x) => n + (x.blob.size || 0), 0);
    // Store blobs as ArrayBuffer-backed Blobs so Safari keeps them after the picker closes.
    // Very large files are stored as-is to avoid doubling memory.
    item.files = await Promise.all(item.files.map(async x => ({
      name: x.name,
      blob: x.blob.size < 150e6 ? new Blob([await x.blob.arrayBuffer()], { type: x.blob.type || '' }) : x.blob,
    })));
    await putItem(item);
    made.push(item);
  }
  try { navigator.storage?.persist?.(); } catch {}
  return made;
}

export function formatSize(n) {
  if (n > 1e9) return (n / 1e9).toFixed(1) + ' GB';
  if (n > 1e6) return (n / 1e6).toFixed(1) + ' MB';
  return Math.max(1, Math.round(n / 1e3)) + ' KB';
}
