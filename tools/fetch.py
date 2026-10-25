# BodyParts3D 4.0 (DBCLS, CC BY-SA 2.1 JP): the surface muscles one by one (left / right) as labelled point clouds,
# to name and split another body model's muscles.
import urllib.request, zipfile, io, os, re, sys, json, collections, traceback, time, subprocess
os.makedirs('out/musc', exist_ok=True)
log = []
def save(): open('out/musc/log.txt', 'w').write('\n'.join(log))
r0 = subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', '--break-system-packages', 'numpy'], capture_output=True, text=True); log.append('pip ' + str(r0.returncode) + r0.stderr[-300:]); save()
import site, importlib; site.addsitedir(site.getusersitepackages()); importlib.invalidate_caches()
import numpy as np
M = ['temporalis', 'masseter', 'occipitofrontalis', 'frontalis', 'occipitalis', 'orbicularis oculi', 'orbicularis oris', 'sternocleidomastoid', 'splenius capitis', 'levator scapulae', 'platysma',
  'pectoralis major', 'deltoid', 'trapezius', 'latissimus dorsi', 'serratus anterior', 'external oblique', 'rectus abdominis', 'infraspinatus', 'supraspinatus', 'teres major', 'teres minor', 'rhomboid major', 'rhomboid minor', 'iliocostalis', 'longissimus', 'spinalis', 'erector spinae',
  'biceps brachii', 'brachialis', 'triceps brachii', 'coracobrachialis', 'brachioradialis', 'extensor carpi radialis longus', 'extensor carpi radialis brevis', 'extensor digitorum', 'extensor digiti minimi', 'extensor carpi ulnaris', 'flexor carpi radialis', 'palmaris longus', 'flexor carpi ulnaris', 'pronator teres', 'anconeus', 'abductor pollicis longus', 'extensor pollicis brevis', 'extensor pollicis longus', 'flexor digitorum superficialis', 'flexor pollicis longus',
  'gluteus maximus', 'gluteus medius', 'tensor fasciae latae', 'sartorius', 'rectus femoris', 'vastus lateralis', 'vastus medialis', 'adductor longus', 'adductor magnus', 'gracilis', 'pectineus', 'biceps femoris', 'semitendinosus', 'semimembranosus', 'iliotibial tract',
  'gastrocnemius', 'triceps surae', 'soleus', 'tibialis anterior', 'fibularis longus', 'fibularis brevis', 'peroneus longus', 'peroneus brevis', 'extensor digitorum longus', 'extensor hallucis longus',
  'abductor hallucis', 'muscle of anterior abdominal wall', 'abductor digiti minimi', 'first dorsal interosseous', 'thenar', 'hypothenar', 'opponens pollicis', 'abductor pollicis brevis', 'flexor pollicis brevis', 'adductor pollicis']
BONE = r'(^| )(skull|cranium|frontal bone|parietal bone|occipital bone|temporal bone|zygomatic bone|maxilla|mandible|nasal bone|clavicle|patella|tibia|fibula|calcaneus|talus|metatarsal|metacarpal|phalanx|scaphoid|lunate|triquetral|pisiform|trapezium|trapezoid|capitate|hamate|navicular|cuboid|cuneiform|sternum|manubrium|xiphoid|scapula|ulna|radius|humerus|hip bone|sacrum|vertebra)'
def target(n):
    n = re.sub(r'\b(left|right) ', '', n.lower()).replace(' muscle', '').strip()
    if re.search(r'tendon|nerve|artery|vein|branch|ligament', n): return None
    for m in M:
        if n == m or n == m + 's' or re.fullmatch(m + r'( proper)?', n): return m
        if n.endswith(' of ' + m) and re.match(r'^(\w+ ){0,3}(part|head|belly|portion) of ', n): return n
    if re.search(r'tendon|nerve|artery|vein|ligament|cartilage', n): return None
    if re.search(BONE, n): return 'bone'
    return None
try:
    best = {}   # FJ file → (muscle, size of concept) : the most specific concept wins
    con = collections.defaultdict(set); cname = {}
    for fn in ['out/anat/isa_element_parts.txt', 'out/anat/partof_element_parts.txt']:
        for line in open(fn, encoding='utf-8', errors='replace'):
            c = line.rstrip('\n').split('\t')
            if len(c) < 3 or not c[0].startswith('FMA'): continue
            con[c[0]].add(c[2]); cname[c[0]] = c[1]
    for fma, fs in con.items():
        t = target(cname[fma])
        if not t: continue
        for fj in fs:
            if fj not in best or len(fs) < best[fj][1]: best[fj] = (t, len(fs))
    log.append('files ' + str(len(best)) + ' ' + json.dumps(collections.Counter(t for t, _ in best.values()))); save()
    t0 = time.time()
    z = zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(urllib.request.Request('https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_BP3D_4.0_obj_99.zip', headers={'User-Agent': 'MadarBot/1.0'}), timeout=1800).read()))
    log.append(f'zip {time.time()-t0:.0f}s'); save()
    index = {os.path.basename(n).split('.')[0]: n for n in z.namelist() if n.endswith('.obj')}
    rng = np.random.default_rng(0)
    groups = collections.defaultdict(list)
    for fj, (t, _) in best.items():
        n = index.get(fj)
        if not n: continue
        v, f = [], []
        for line in z.read(n).decode('utf-8', 'replace').splitlines():
            if line.startswith('v '): v.append([float(x) for x in line.split()[1:4]])
            elif line.startswith('f '): f.append([int(x.split('/')[0]) - 1 for x in line.split()[1:4]])
        V, F = np.array(v, np.float32), np.array(f, np.int32)
        if not len(F): continue
        side = 'R' if V[:, 0].mean() < 0 else 'L'   # BodyParts3D: x>0 is the body's left (checked below from the heart)
        groups[(t, side)].append((V, F))
    P, LB, names = [], [], []
    for (t, side), parts in sorted(groups.items()):
        V = np.concatenate([p[0] for p in parts]); off = np.cumsum([0] + [len(p[0]) for p in parts])[:-1]
        F = np.concatenate([p[1] + o for p, o in zip(parts, off)])
        a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]; ar = np.linalg.norm(np.cross(b - a, c - a), axis=1) / 2
        k = 2500 if t == 'bone' else 1200
        i = rng.choice(len(F), k, p=ar / ar.sum()); u, w = rng.random((2, k)); s = u + w > 1; u[s], w[s] = 1 - u[s], 1 - w[s]
        pts = a[i] + (b[i] - a[i]) * u[:, None] + (c[i] - a[i]) * w[:, None]
        P.append(pts); LB.append(np.full(k, len(names))); names.append(t + '.' + side)
    np.savez_compressed('out/musc/musc.npz', P=np.concatenate(P).astype(np.float32), L=np.concatenate(LB).astype(np.int16), names=np.array(names))
    log.append('labels ' + str(len(names)) + ' ' + ' '.join(names)); save()
except Exception:
    log.append(traceback.format_exc())
save()
