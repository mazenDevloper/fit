import fs from 'fs';
const out = {};
const log = (k, v) => { out[k] = v; };
const j = async (u, h = {}) => { const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Madar probe)', ...h } }); const t = await r.text(); let d = null; try { d = JSON.parse(t); } catch {} return { status: r.status, acao: r.headers.get('access-control-allow-origin'), ct: r.headers.get('content-type'), d, t: d ? null : t.slice(0, 400) }; };
const head = async (u, h = {}) => { try { const r = await fetch(u, { method: 'GET', headers: { Origin: 'https://mazendevloper.github.io', Range: 'bytes=0-99', 'User-Agent': 'Mozilla/5.0', ...h } }); return r.status + ' acao=' + r.headers.get('access-control-allow-origin') + ' ct=' + r.headers.get('content-type') + ' cr=' + r.headers.get('content-range') + ' ar=' + r.headers.get('accept-ranges'); } catch (e) { return 'ERR ' + e.message; } };
const safe = async (k, f) => { try { await f(); } catch (e) { log(k, 'ERR ' + e.message); } };

// --- Poly Haven: full model + hdri summaries
await safe('ph_models', async () => {
  const r = await j('https://api.polyhaven.com/assets?t=models');
  const rows = Object.entries(r.d).sort((a, b) => (b[1].download_count || 0) - (a[1].download_count || 0)).map(([k, v]) => [k, (v.categories || []).filter(c => !c.startsWith('collection')).join(','), v.category || '', v.polycount, (v.dimensions || []).map(x => Math.round(x)).join('x'), v.download_count, (v.tags || []).slice(0, 8).join(',')].join(' | '));
  fs.writeFileSync('out/ph_models_all.txt', rows.join('\n'));
  log('ph_models', rows.length);
});
await safe('ph_hdris', async () => {
  const r = await j('https://api.polyhaven.com/assets?t=hdris');
  const rows = Object.entries(r.d).sort((a, b) => (b[1].download_count || 0) - (a[1].download_count || 0)).map(([k, v]) => [k, (v.categories || []).join(','), (v.tags || []).slice(0, 10).join(','), v.download_count, v.name].join(' | '));
  fs.writeFileSync('out/ph_hdris_all.txt', rows.join('\n'));
  log('ph_hdris', rows.length);
});
await safe('ph_tex', async () => {
  const r = await j('https://api.polyhaven.com/assets?t=textures&c=wood');
  log('ph_tex_wood', Object.entries(r.d).sort((a, b) => (b[1].download_count || 0) - (a[1].download_count || 0)).slice(0, 30).map(([k, v]) => k + '[' + (v.categories || []).join(',') + ']').join(' ; '));
  const f = await j('https://api.polyhaven.com/assets?t=textures&c=floor');
  log('ph_tex_floor', Object.entries(f.d).sort((a, b) => (b[1].download_count || 0) - (a[1].download_count || 0)).slice(0, 30).map(([k, v]) => k).join(' ; '));
});

// --- quran.com: words with line numbers, chapters, tafsir resources, recitations + segments
await safe('qc_words', async () => {
  for (const p of [1, 2, 3, 50, 187]) {
    const r = await j(`https://api.quran.com/api/v4/verses/by_page/${p}?words=true&word_fields=text_uthmani,line_number,page_number,char_type_name&per_page=50&fields=text_uthmani`);
    const vs = r.d?.verses || [];
    const lines = {};
    for (const v of vs) for (const w of v.words || []) (lines[w.line_number] ||= []).push((w.char_type_name === 'end' ? '#' : '') + w.text_uthmani);
    log('qc_page_' + p, { status: r.status, acao: r.acao, verses: vs.length, keys: Object.keys(vs[0] || {}), wordKeys: Object.keys((vs[0]?.words || [])[0] || {}), lines });
  }
  const r2 = await j('https://api.quran.com/api/v4/verses/by_page/3?words=true&word_fields=text_uthmani,line_number&per_page=50&mushaf=1');
  log('qc_mushaf1_p3', { status: r2.status, firstLines: (r2.d?.verses || []).slice(0, 2).map(v => (v.words || []).map(w => w.line_number + ':' + w.text_uthmani).join(' ')) });
});
await safe('qc_chapters', async () => {
  const r = await j('https://api.quran.com/api/v4/chapters?language=ar');
  log('qc_chapters', { status: r.status, acao: r.acao, sample: (r.d?.chapters || []).slice(0, 3), count: (r.d?.chapters || []).length });
});
await safe('qc_tafsirs', async () => {
  const r = await j('https://api.quran.com/api/v4/resources/tafsirs');
  log('qc_tafsirs', (r.d?.tafsirs || []).map(t => t.id + ':' + t.name + ':' + t.language_name + ':' + (t.translated_name?.name || '')).join(' ; '));
});
await safe('qc_recitations', async () => {
  const r = await j('https://api.quran.com/api/v4/resources/recitations?language=ar');
  log('qc_recitations', (r.d?.recitations || []).map(t => t.id + ':' + t.reciter_name + ':' + (t.style || '') + ':' + (t.translated_name?.name || '')).join(' ; '));
  const a = await j('https://api.quran.com/api/v4/recitations/7/by_ayah/2:255');
  log('qc_rec7_255', { status: a.status, acao: a.acao, d: JSON.stringify(a.d).slice(0, 800) });
  const c = await j('https://api.quran.com/api/v4/chapter_recitations/7/1?segments=true');
  log('qc_chrec7_1', { status: c.status, acao: c.acao, d: JSON.stringify(c.d).slice(0, 800) });
});
await safe('qdc', async () => {
  const r = await j('https://api.qurancdn.com/api/qdc/audio/reciters/7/audio_files?chapter=1&segments=true', { Origin: 'https://mazendevloper.github.io' });
  log('qdc_7_1', { status: r.status, acao: r.acao, d: JSON.stringify(r.d || r.t).slice(0, 1500) });
  const r2 = await j('https://api.qurancdn.com/api/qdc/audio/reciters?locale=ar', { Origin: 'https://mazendevloper.github.io' });
  log('qdc_reciters', { status: r2.status, acao: r2.acao, d: (r2.d?.reciters || []).map(x => x.id + ':' + x.name + ':' + (x.translated_name?.name || '') + ':' + (x.style?.name || '')).join(' ; ') });
  const r3 = await j('https://api.qurancdn.com/api/qdc/audio/reciters/7/audio_files?chapter=2&segments=true', { Origin: 'https://mazendevloper.github.io' });
  const af = r3.d?.audio_files?.[0];
  log('qdc_7_2', { status: r3.status, url: af?.audio_url, timings: (af?.verse_timings || []).slice(0, 3) });
  if (af?.audio_url) log('qdc_audio_head', await head(af.audio_url));
});
await safe('spa5k', async () => {
  const r = await j('https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/editions.json');
  log('spa5k', (Array.isArray(r.d) ? r.d : []).map(e => e.slug + ':' + e.language_name + ':' + e.name).join(' ; ') || r.t);
});
await safe('alq_audio', async () => {
  const r = await j('https://api.alquran.cloud/v1/edition?format=audio&language=ar');
  log('alq_audio', (r.d?.data || []).map(e => e.identifier + ':' + e.name + ':' + e.englishName + ':' + e.type).join(' ; '));
  const p = await j('https://api.alquran.cloud/v1/page/2/ar.alafasy');
  log('alq_page_audio', JSON.stringify(p.d?.data?.ayahs?.[0] || p.t).slice(0, 600));
  log('alq_audio_head', await head('https://cdn.islamic.network/quran/audio/128/ar.alafasy/8.mp3'));
});
await safe('asbab', async () => {
  for (const u of ['https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/en-asbab-al-nuzul-by-al-wahidi/2/6.json', 'https://api.quran.com/api/v4/tafsirs/86/by_ayah/2:6']) {
    const r = await j(u); log('asbab ' + u, { status: r.status, acao: r.acao, d: JSON.stringify(r.d || r.t).slice(0, 500) });
  }
});
// --- DriveCast bins through the worker
await safe('dc_bins', async () => {
  for (const id of ['69b63c5cc3097a1dd5278b25', '6a573cdbf5f4af5e29915034']) {
    const r = await j('https://studio.c-p.workers.dev/bin/' + id);
    const d = r.d;
    const arr = Array.isArray(d) ? d : (d?.manuscripts || d?.fonts || []);
    log('dc_bin_' + id, { status: r.status, acao: r.acao, topKeys: d && !Array.isArray(d) ? Object.keys(d) : 'array', count: arr.length, items: arr.slice(0, 40).map(x => ({ id: x.id, type: x.type, name: x.name, url: (x.url || '').slice(0, 120), content: (x.content || '').slice(0, 60), font: x.fontFamily, png: x.pngDataUrl ? (x.pngDataUrl.slice(0, 60) + ' len=' + x.pngDataUrl.length) : null, words: x.words?.length })) });
  }
});
// --- Wikimedia upload CORS + panorama search quality
await safe('wm', async () => {
  const r = await j('https://commons.wikimedia.org/w/api.php?action=query&generator=categorymembers&gcmtitle=Category:360%C2%B0_panoramas_with_equirectangular_projection&gcmtype=file&gcmlimit=5&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=4096&format=json&origin=*');
  const pages = Object.values(r.d?.query?.pages || {});
  log('wm_eq', pages.map(p => p.title + ' | ' + p.imageinfo?.[0]?.width + 'x' + p.imageinfo?.[0]?.height + ' | ' + p.imageinfo?.[0]?.thumburl + ' | ' + p.imageinfo?.[0]?.extmetadata?.LicenseShortName?.value));
  const t = pages[0]?.imageinfo?.[0]?.thumburl; if (t) log('wm_thumb_head', await head(t));
  for (const q of ['mosque equirectangular', 'beach 360 panorama equirectangular', 'mountain 360 equirectangular', 'Masjid al-Haram 360', 'night sky 360 equirectangular', 'library interior 360']) {
    const s = await j('https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=30&gsrsearch=' + encodeURIComponent(q) + '&prop=imageinfo&iiprop=size|mime&format=json&origin=*');
    const ps = Object.values(s.d?.query?.pages || {});
    log('wm_search ' + q, ps.length + ' results, 2:1 → ' + ps.filter(p => { const i = p.imageinfo?.[0]; return i && Math.abs(i.width / i.height - 2) < 0.02 && /jpeg|png/.test(i.mime); }).map(p => p.title.replace('File:', '') + ' (' + p.imageinfo[0].width + ')').slice(0, 12).join(' ; '));
  }
  const cats = await j('https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:360%C2%B0_panoramas_with_equirectangular_projection&cmtype=subcat&cmlimit=200&format=json&origin=*');
  log('wm_eq_subcats', (cats.d?.query?.categorymembers || []).map(c => c.title.replace('Category:', '')).join(' ; '));
  const vid = await j('https://commons.wikimedia.org/w/api.php?action=query&titles=File:Video_360%C2%B0._Timelapse._Bled_Lake_in_Slovenia..webm&prop=videoinfo&viprop=url|size|extmetadata&format=json&origin=*');
  const vi = Object.values(vid.d?.query?.pages || {})[0]?.videoinfo?.[0];
  log('wm_vid', { url: vi?.url, lic: vi?.extmetadata?.LicenseShortName?.value, artist: (vi?.extmetadata?.Artist?.value || '').slice(0, 200) });
  if (vi?.url) log('wm_vid_head', await head(vi.url));
});
// --- fonts + libs on jsDelivr
await safe('cdn', async () => {
  for (const u of ['https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs', 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs', 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js', 'https://tessdata.projectnaptha.com/4.0.0/ara.traineddata.gz', 'https://fonts.gstatic.com/s/amiriquran/v19/_Xmo-Hk0rD6DbUL4_vH8Zq5t.ttf', 'https://cdn.jsdelivr.net/npm/@fontsource/amiri-quran@5.1.0/files/amiri-quran-arabic-400-normal.woff2', 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'])
    log('cdn ' + u, await head(u));
});
fs.writeFileSync('out/probe5.json', JSON.stringify(out, null, 1));
