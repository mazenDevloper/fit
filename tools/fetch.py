# Z-Anatomy (CC BY-SA 4.0, built on BodyParts3D) → Madar's anatomical body: muscles grouped by Madar's names
# (incl. rectus abdominis and latissimus dorsi) + the skeleton, decimated and meshopt-compressed into one GLB.
import subprocess, os, json, time, re, sys, site, importlib, collections, traceback
os.makedirs('out/za', exist_ok=True)
log = []
def save(): open('out/za/log.txt', 'w').write('\n'.join(log))
def sh(c, t=1800):
    t0 = time.time(); r = subprocess.run(c, shell=True, capture_output=True, text=True, timeout=t); log.append(f'$ {c[:200]}\n  -> {r.returncode} {time.time()-t0:.0f}s {r.stdout[-800:]} {r.stderr[-800:]}'); save(); return r
sh('curl -sL -o za.zip https://github.com/Z-Anatomy/Models-of-human-anatomy/raw/master/Z-Anatomy.zip && unzip -o -q za.zip -d za')
sh('curl -sL -o bl.tar.xz https://download.blender.org/release/Blender4.2/blender-4.2.3-linux-x64.tar.xz && tar -xf bl.tar.xz')
open('dump.py', 'w').write(r'''
import bpy, bmesh, numpy as np, re
dg = bpy.context.evaluated_depsgraph_get()
names, V, F, counts = [], [], [], []
for o in bpy.data.objects:
    if o.type != "MESH": continue
    cs = [c.name for c in o.users_collection]
    top = "m" if "4: Muscular system" in cs else "b" if "1: Skeletal system" in cs else None
    if not top or not re.search(r"(\.[lr]|^[^.]+)$", o.name): continue
    try:
        e = o.evaluated_get(dg); me = e.to_mesh()
        bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
        mw = o.matrix_world
        v = np.array([tuple(mw @ x.co) for x in me.vertices], np.float32)
        f = np.array([tuple(p.vertices) for p in me.polygons], np.int32)
        e.to_mesh_clear()
        if len(f) == 0: continue
        names.append(top + "|" + o.name); V.append(v); F.append(f)
    except Exception as ex: print("ERR", o.name, ex)
np.savez("dump.npz", names=np.array(names), **{f"v{i}": v for i, v in enumerate(V)}, **{f"f{i}": f for i, f in enumerate(F)})
print("dumped", len(names))
''')
sh('./blender-4.2.3-linux-x64/blender -b za/Z-Anatomy/Startup.blend --python dump.py 2>&1 | grep -E "dumped|ERR|Error" | head -40', 2000)
r0 = subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', '--break-system-packages', 'trimesh', 'fast-simplification', 'numpy', 'scipy', 'networkx'], capture_output=True, text=True)
site.addsitedir(site.getusersitepackages()); importlib.invalidate_caches()
try:
    import numpy as np, trimesh, fast_simplification
    exec(open('tools/rules.py').read())
    RULES.insert(0, ('abs', r'rectus abdominis|pyramidalis'))
    RULES.insert(2, ('obliques', r'abdominal oblique|transversus abdominis'))
    RULES.insert(3, ('neck', r'scalenus|sternohyoid|omohyoid|platysma|longus colli|longus capitis'))
    RULES.insert(4, ('other', r'masseter|temporalis|frontalis|occipitalis|orbicularis o|zygomaticus|bucinator|risorius|depressor anguli|depressor labii|levator labii|levator anguli|mentalis|nasalis|procerus|corrugator'))
    INNER = r'arytenoid|cricothyroid|thyro-aryt|rectus muscle$|^(inferior|superior) oblique muscle$|glossus|pharyn|palat|levator palpebrae|tarsus|diaphragm|intercostal|interspinales|intertransversarii|rotatores|subcostal|transversus thoracis|obturator internus|gemellus|coccygeus|levator ani|pubo|ilioco|sphincter'
    ARM, LEG = ('delts', 'biceps', 'triceps', 'forearms'), ('glutes', 'quads', 'hamstrings', 'adductors', 'calves', 'shins')
    BONE_SKIP = r'tooth|incisor|canine|molar|premolar|malleus|incus|stapes|cartilage of ear|alar cartilage|nasal|arytenoid|corniculate|cricoid|thyroid cartilage|concha|lacrimal|ethmoid|hyoid'
    d = np.load('dump.npz'); names = list(d['names'])
    log.append(f'objects {len(names)}'); save()
    groups = collections.defaultdict(list); unmatched = []
    for i, nm in enumerate(names):
        top, n = nm.split('|', 1); base = re.sub(r'\.[lr]$', '', n).lower()
        if top == 'b':
            if re.search(BONE_SKIP, base): continue
            groups['bone'].append(i); continue
        if re.search(SKIP, base) and not re.search(r'muscle', base): continue
        g = next((g for g, rx in RULES if g != 'bone' and re.search(rx, base)), None)
        if g is None:
            if re.search(r'muscle|head of|part of', base) and not re.search(r'facial|auricular|ocular|tongue|palat|pharyn|laryn|perine|anal|urethr|levator ani|coccygeus|diaphragm|platysma|mentalis|orbicularis|zygomaticus|buccinator|nasalis|risorius|depressor|levator labii|temporalis|masseter|pterygoid|digastric|stylo|mylo|genio|hyoid|epicranius|procerus|corrugator|cremaster|tensor tympani|stapedius|uvula|sphincter|ischio|bulbo', base): g = 'other'
            else: unmatched.append(n); continue
        if re.search(INNER, base): continue
        z = float(d[f'v{i}'][:, 2].mean())
        if g in ARM and z < 0.75: g = 'other'
        if g in LEG and z > 1.05: g = 'other'
        groups[g].append(i)
    open('out/za/unmatched.txt', 'w').write('\n'.join(sorted(set(unmatched))))
    open('out/za/groups.json', 'w').write(json.dumps({g: sorted(set(re.sub(r'\.[lr]$', '', names[i].split('|')[1]) for i in v)) for g, v in groups.items()}, ensure_ascii=False, indent=0))
    BUD = {'bone': 70000, 'other': 18000, 'forearms': 14000, 'lowerBack': 10000, 'abs': 4000, 'upperBack': 14000, 'quads': 14000}
    scene = trimesh.Scene(); allv = []
    for g, idx in groups.items():
        vs, fs, off = [], [], 0
        for i in idx: v, f = d[f'v{i}'], d[f'f{i}']; vs.append(v); fs.append(f + off); off += len(v)
        V, Fc = np.concatenate(vs), np.concatenate(fs); n0 = len(Fc); target = BUD.get(g, 10000)
        if len(Fc) > target: V, Fc = fast_simplification.simplify(V, Fc, target_reduction=1 - target / len(Fc))
        mesh = trimesh.Trimesh(V, Fc, process=True)
        try: mesh.fix_normals()
        except Exception as e: log.append('normals ' + str(e))
        scene.add_geometry(mesh, node_name=g, geom_name=g); allv.append(V)
        log.append(f'{g}: {len(idx)} objects {n0} → {len(Fc)} tris'); save()
    A = np.concatenate(allv); log.append('bbox min ' + str(A.min(0)) + ' max ' + str(A.max(0)))
    scene.export('out/za/body_raw.glb'); log.append('raw ' + str(os.path.getsize('out/za/body_raw.glb')))
    sh('npx -y @gltf-transform/cli@4 meshopt out/za/body_raw.glb out/za/body.glb')
    if os.path.exists('out/za/body.glb'): log.append('glb ' + str(os.path.getsize('out/za/body.glb'))); os.remove('out/za/body_raw.glb')
except Exception:
    log.append(traceback.format_exc())
save()
