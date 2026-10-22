import fs from 'fs';
const out = [];
const probe = async (label, u, opt = {}) => {
  try {
    const t = Date.now(); const r = await fetch(u, opt);
    const ct = r.headers.get('content-type') || '';
    let body = '';
    if (!opt.method || opt.method === 'GET') { const b = await r.arrayBuffer(); body = ct.includes('json') || ct.includes('text') || ct.includes('xml') ? new TextDecoder().decode(b).slice(0, 700) : '[' + b.byteLength + ' bytes]'; }
    out.push(`## ${label} ${r.status} ${Date.now() - t}ms acao=${r.headers.get('access-control-allow-origin')} ct=${ct} len=${r.headers.get('content-length')}\n${body}`);
  } catch (e) { out.push(`## ${label} ERR ${e.message}`); }
};
await probe('alq page', 'https://api.alquran.cloud/v1/page/1/quran-uthmani');
await probe('alq muyassar', 'https://api.alquran.cloud/v1/ayah/2:255/ar.muyassar');
await probe('alq editions tafsir ar', 'https://api.alquran.cloud/v1/edition?format=text&language=ar&type=tafsir');
await probe('alq audio editions', 'https://api.alquran.cloud/v1/edition?format=audio&language=ar');
await probe('alq audio head', 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/262.mp3', { method: 'HEAD' });
await probe('qcom tafsirs ar', 'https://api.quran.com/api/v4/resources/tafsirs?language=ar');
await probe('qcom by page', 'https://api.quran.com/api/v4/verses/by_page/1?fields=text_uthmani&per_page=50');
await probe('qcom tafsir 16', 'https://api.quran.com/api/v4/tafsirs/16/by_ayah/2:255');
await probe('qcom recitations', 'https://api.quran.com/api/v4/resources/recitations?language=ar');
await probe('everyayah', 'https://everyayah.com/data/Alafasy_128kbps/001001.mp3', { method: 'HEAD' });
await probe('everyayah list', 'https://everyayah.com/data/');
await probe('commons pano cat', 'https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:360%C2%B0_panoramas&cmtype=file&cmlimit=20&format=json&origin=*');
await probe('commons pano sub', 'https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:360%C2%B0_panoramas&cmtype=subcat&cmlimit=50&format=json&origin=*');
await probe('commons 360 video cat', 'https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:360%C2%B0_videos&cmtype=file&cmlimit=30&format=json&origin=*');
await probe('commons 360 video subcat', 'https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:360%C2%B0_videos&cmtype=subcat&cmlimit=50&format=json&origin=*');
await probe('commons search equirect', 'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=filetype:bitmap%20equirectangular%20panorama&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=320&format=json&origin=*');
await probe('commons search 360 video', 'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=filetype:video%20360%C2%B0&gsrnamespace=6&gsrlimit=10&prop=videoinfo&viprop=url|size|mime|derivatives&format=json&origin=*');
await probe('archive 360 search', 'https://archive.org/advancedsearch.php?q=title%3A%28360+video%29+AND+mediatype%3Amovies&fl%5B%5D=identifier&fl%5B%5D=title&rows=10&output=json');
await probe('ph hdris tags', 'https://api.polyhaven.com/assets?t=hdris&c=indoor');
await probe('google font amiri quran', 'https://fonts.googleapis.com/css2?family=Amiri+Quran&display=swap');
await probe('mediapipe pose model', 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', { method: 'HEAD' });
await probe('kenney furniture page', 'https://kenney.nl/assets/furniture-kit');
await probe('three xbot', 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/Xbot.glb', { method: 'HEAD' });
fs.writeFileSync('out/server.txt', out.join('\n\n'));
