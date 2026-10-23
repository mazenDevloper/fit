# BodyParts3D (DBCLS, CC BY-SA 2.1 JP) → one compressed GLB of the human muscles + skeleton for Madar's coach.
import urllib.request, zipfile, io, os, re, subprocess, sys, json, collections
os.makedirs('out/anat', exist_ok=True)
B = 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/'
UA = {'User-Agent': 'MadarBot/1.0 (https://github.com/mazenDevloper/fit)'}
log = []
def get(u):
    t = __import__('time').time(); r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=900); d = r.read(); log.append(f'{u} {len(d)} {__import__("time").time()-t:.0f}s'); open('out/anat/log.txt', 'w').write('\n'.join(log)); return d
r0 = subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', '--break-system-packages', 'trimesh', 'fast-simplification', 'numpy'], capture_output=True, text=True)
log.append('pip ' + str(r0.returncode) + r0.stderr[-300:]); open('out/anat/log.txt', 'w').write('\n'.join(log))
import traceback, time
T0=time.time()
try:
    import numpy as np, trimesh, fast_simplification
    parts = get(B + 'partof_parts_list_e.txt').decode('utf-8', 'replace')
    elems = get(B + 'partof_element_parts.txt').decode('utf-8', 'replace')
    open('out/anat/parts_head.txt', 'w').write(parts[:3000] + '\n----\n' + elems[:3000])
    RULES = [
      ('chest', r'pectoralis major'), ('abs', r'rectus abdominis'), ('obliques', r'external oblique|internal oblique|serratus anterior'),
      ('traps', r'trapezius'), ('upperBack', r'latissimus dorsi|rhomboid|teres major|teres minor|infraspinatus|supraspinatus'),
      ('lowerBack', r'erector spinae|iliocostalis|longissimus thoracis|spinalis thoracis|multifidus|quadratus lumborum'),
      ('delts', r'deltoid'), ('biceps', r'biceps brachii|brachialis\b|coracobrachialis'), ('triceps', r'triceps brachii|anconeus'),
      ('forearms', r'brachioradialis|flexor carpi|extensor carpi|palmaris longus|pronator teres|flexor digitorum superficialis|extensor digitorum(?! longus)|supinator|abductor pollicis longus'),
      ('glutes', r'gluteus maximus|gluteus medius|gluteus minimus|tensor fasciae latae|piriformis'),
      ('quads', r'rectus femoris|vastus lateralis|vastus medialis|vastus intermedius|sartorius'),
      ('hamstrings', r'biceps femoris|semitendinosus|semimembranosus'),
      ('adductors', r'adductor longus|adductor magnus|adductor brevis|gracilis|pectineus|iliopsoas|psoas major|iliacus'),
      ('calves', r'gastrocnemius|soleus|plantaris'), ('shins', r'tibialis anterior|fibularis|peroneus|extensor digitorum longus|extensor hallucis longus'),
      ('neck', r'sternocleidomastoid|splenius|scalene|levator scapulae|platysma'),
      ('bone', r'\b(skull|cranium|mandible|cervical vertebra|thoracic vertebra|lumbar vertebra|sacrum|coccyx|rib|sternum|clavicle|scapula|humerus|radius|ulna|carpal bone|scaphoid|lunate|triquetrum|pisiform|trapezium|trapezoid|capitate|hamate|metacarpal|phalanx|hip bone|femur|patella|tibia|fibula|calcaneus|talus|navicular|cuboid|cuneiform|metatarsal)'),
    ]
    # concept → name ; concept → element files
    name = {}
    for line in parts.splitlines():
        c = line.split('\t')
        ids = [x for x in c if re.match(r'^FMA\d+$', x)]
        if ids: name[ids[0]] = c[-1].strip().lower()
    files = collections.defaultdict(list)
    for line in elems.splitlines():
        c = line.split('\t')
        ids = [x for x in c if re.match(r'^FMA\d+$', x)]; fj = [x for x in c if re.match(r'^FJ\d+', x)]
        if ids and fj: files[ids[0]] += fj
        if ids and len(c) > 1 and ids[0] not in name: name[ids[0]] = c[1].strip().lower()
    pick = collections.defaultdict(set)
    for fma, n in name.items():
        if 'tendon' in n or 'nerve' in n or 'artery' in n or 'vein' in n or 'ligament' in n: continue
        for g, rx in RULES:
            if re.search(rx, n):
                for f in files.get(fma, []): pick[g].add(f.split('.')[0])
                break
    log.append('picked ' + json.dumps({g: len(v) for g, v in pick.items()}))
    open('out/anat/log.txt', 'w').write('\n'.join(log))
    z = zipfile.ZipFile(io.BytesIO(get(B + 'partof_BP3D_4.0_obj_99.zip')))
    index = {os.path.basename(n).split('.')[0]: n for n in z.namelist() if n.endswith('.obj')}
    log.append(f'objs in zip {len(index)}')
    def load(fj):
        n = index.get(fj)
        if not n: return None
        v, f = [], []
        for line in z.read(n).decode('utf-8', 'replace').splitlines():
            if line.startswith('v '): v.append([float(x) for x in line.split()[1:4]])
            elif line.startswith('f '): f.append([int(x.split('/')[0]) - 1 for x in line.split()[1:4]])
        return np.array(v, np.float32), np.array(f, np.int32)
    BUDGET = {'bone': 70000}
    scene = trimesh.Scene()
    allv = []
    for g, fjs in pick.items():
        vs, fs, off = [], [], 0
        for fj in sorted(fjs):
            m = load(fj)
            if m is None or len(m[1]) == 0: continue
            vs.append(m[0]); fs.append(m[1] + off); off += len(m[0])
        if not vs: continue
        V, Fc = np.concatenate(vs), np.concatenate(fs)
        target = BUDGET.get(g, 16000)
        if len(Fc) > target:
            V, Fc = fast_simplification.simplify(V, Fc, target_reduction=1 - target / len(Fc))
        mesh = trimesh.Trimesh(V, Fc, process=True)
        mesh.fix_normals()
        scene.add_geometry(mesh, node_name=g, geom_name=g)
        allv.append(V); log.append(f'{g}: {len(fjs)} parts → {len(Fc)} tris')
    A = np.concatenate(allv); log.append('bbox min ' + str(A.min(0)) + ' max ' + str(A.max(0)))
    scene.export('out/anat/body_raw.glb')
    log.append('raw glb ' + str(os.path.getsize('out/anat/body_raw.glb')))
    open('out/anat/log.txt', 'w').write('\n'.join(log))
    r = subprocess.run('npx -y @gltf-transform/cli@4 meshopt out/anat/body_raw.glb out/anat/body.glb', shell=True, capture_output=True, text=True)
    log.append('meshopt ' + str(r.returncode) + ' ' + r.stderr[-400:])
    if os.path.exists('out/anat/body.glb'): log.append('glb ' + str(os.path.getsize('out/anat/body.glb')))
    open('out/anat/log.txt', 'w').write('\n'.join(log))

except Exception:
    log.append(traceback.format_exc()); log.append('t ' + str(time.time()-T0)); open('out/anat/log.txt', 'w').write('\n'.join(log))
