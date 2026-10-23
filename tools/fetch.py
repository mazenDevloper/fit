# Z-Anatomy (CC BY-SA 4.0): download the Blender template and list what is inside (collections, objects, sizes)
import subprocess, os, json, time
os.makedirs('out/za', exist_ok=True)
log = []
def sh(c, t=1800):
    t0 = time.time(); r = subprocess.run(c, shell=True, capture_output=True, text=True, timeout=t); log.append(f'$ {c}\n  -> {r.returncode} {time.time()-t0:.0f}s {r.stdout[-600:]} {r.stderr[-600:]}'); open('out/za/log.txt', 'w').write('\n'.join(log)); return r
sh('curl -sL -o za.zip https://github.com/Z-Anatomy/Models-of-human-anatomy/raw/master/Z-Anatomy.zip && ls -la za.zip && unzip -o -q za.zip -d za && find za -maxdepth 3 | head -50')
sh('curl -sL -o bl.tar.xz https://download.blender.org/release/Blender4.2/blender-4.2.3-linux-x64.tar.xz && tar -xf bl.tar.xz && ls')
open('inv.py', 'w').write(r'''
import bpy, json
out = {"collections": {}, "objects": []}
for c in bpy.data.collections: out["collections"][c.name] = [o.name for o in c.objects][:4000]
for o in bpy.data.objects:
    d = {"n": o.name, "t": o.type, "c": [c.name for c in o.users_collection]}
    if o.type == "MESH": d["v"] = len(o.data.vertices); d["f"] = len(o.data.polygons)
    out["objects"].append(d)
json.dump(out, open("out/za/inventory.json", "w"), ensure_ascii=False)
''')
blend = sh('find za -name "*.blend" | head -5').stdout.split()
if blend: sh(f'./blender-4.2.3-linux-x64/blender -b "{blend[0]}" --python inv.py', 1500)
