# BodyParts3D 4.0 (DBCLS, CC BY-SA 2.1 JP) → one compressed GLB: the body's muscles (grouped as Madar's muscle names)
# and the skeleton, for the coach's anatomical figure.
import urllib.request, zipfile, io, os, re, subprocess, sys, json, collections, traceback, time, site, importlib
os.makedirs('out/anat', exist_ok=True)
B = 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/'
log = []
def save(): open('out/anat/log.txt', 'w').write('\n'.join(log))
def get(u):
    t = time.time(); d = urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'MadarBot/1.0'}), timeout=1800).read(); log.append(f'{u} {len(d)} {time.time()-t:.0f}s'); save(); return d
r0 = subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', '--break-system-packages', 'trimesh', 'fast-simplification', 'numpy', 'scipy'], capture_output=True, text=True)
log.append('pip ' + str(r0.returncode)); site.addsitedir(site.getusersitepackages()); importlib.invalidate_caches()
try:
    import numpy as np, trimesh, fast_simplification
    exec(open('tools/rules.py').read())
    files = collections.defaultdict(set); names = {}
    for line in open('out/anat/isa_element_parts.txt', encoding='utf-8', errors='replace'):
        c = line.rstrip('\n').split('\t')
        if len(c) < 3 or not c[0].startswith('FMA'): continue
        files[c[0]].add(c[2]); names[c[0]] = c[1].strip().lower()
    pick = collections.defaultdict(set)
    for fma, n in names.items():
        if re.search(SKIP, n): continue
        for g, rx in RULES:
            if re.search(rx, n): pick[g] |= files[fma]; break
    seen = set()
    for g in list(pick): pick[g] -= seen; seen |= pick[g]
    log.append('picked ' + json.dumps({g: len(v) for g, v in pick.items()})); save()
    z = zipfile.ZipFile(io.BytesIO(get(B + 'isa_BP3D_4.0_obj_99.zip')))
    index = {os.path.basename(n).split('.')[0]: n for n in z.namelist() if n.endswith('.obj')}
    log.append(f'objs in zip {len(index)}'); save()
    def load(fj):
        n = index.get(fj)
        if not n: return None
        v, f = [], []
        for line in z.read(n).decode('utf-8', 'replace').splitlines():
            if line.startswith('v '): v.append([float(x) for x in line.split()[1:4]])
            elif line.startswith('f '): f.append([int(x.split('/')[0]) - 1 for x in line.split()[1:4]])
        return np.array(v, np.float32), np.array(f, np.int32)
    scene = trimesh.Scene(); allv = []
    for g, fjs in pick.items():
        vs, fs, off = [], [], 0
        for fj in sorted(fjs):
            m = load(fj)
            if m is None or len(m[1]) == 0: continue
            vs.append(m[0]); fs.append(m[1] + off); off += len(m[0])
        if not vs: log.append(g + ': nothing'); continue
        V, Fc = np.concatenate(vs), np.concatenate(fs)
        n0 = len(Fc); target = BUDGET.get(g, 9000)
        if len(Fc) > target: V, Fc = fast_simplification.simplify(V, Fc, target_reduction=1 - target / len(Fc))
        mesh = trimesh.Trimesh(V, Fc, process=True)
        try: mesh.fix_normals()
        except Exception as e: log.append('normals ' + str(e))
        scene.add_geometry(mesh, node_name=g, geom_name=g)
        allv.append(V); log.append(f'{g}: {len(fjs)} files {n0} → {len(Fc)} tris'); save()
    A = np.concatenate(allv); log.append('bbox min ' + str(A.min(0)) + ' max ' + str(A.max(0)))
    scene.export('out/anat/body_raw.glb'); log.append('raw glb ' + str(os.path.getsize('out/anat/body_raw.glb'))); save()
    r = subprocess.run('npx -y @gltf-transform/cli@4 meshopt out/anat/body_raw.glb out/anat/body.glb', shell=True, capture_output=True, text=True)
    log.append('meshopt ' + str(r.returncode) + ' ' + (r.stderr or '')[-400:])
    if os.path.exists('out/anat/body.glb'): log.append('glb ' + str(os.path.getsize('out/anat/body.glb')))
except Exception:
    log.append(traceback.format_exc())
save()
