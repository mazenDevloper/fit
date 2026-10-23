import urllib.request, os
os.makedirs('out/anat', exist_ok=True)
B = 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/'
for f in ['isa_parts_list_e.txt', 'isa_element_parts.txt', 'partof_parts_list_e.txt', 'partof_element_parts.txt']:
    d = urllib.request.urlopen(urllib.request.Request(B + f, headers={'User-Agent': 'MadarBot/1.0'}), timeout=300).read()
    open('out/anat/' + f, 'wb').write(d)
