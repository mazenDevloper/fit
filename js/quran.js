// The Quran for the reader: the Madani mushaf page by page (604 pages × 15 lines, word by word from quran.com),
// tafsir and reciters (alquran.cloud). Every answer is kept in Cache Storage, so pages read once open offline.
const QC = 'https://api.quran.com/api/v4';
const ALQ = 'https://api.alquran.cloud/v1';
const CACHE = 'madar-quran-v1';

// [name, ayahs, first page]
export const SURAHS = [
  ['الفاتحة', 7, 1], ['البقرة', 286, 2], ['آل عمران', 200, 50], ['النساء', 176, 77], ['المائدة', 120, 106], ['الأنعام', 165, 128], ['الأعراف', 206, 151], ['الأنفال', 75, 177], ['التوبة', 129, 187], ['يونس', 109, 208],
  ['هود', 123, 221], ['يوسف', 111, 235], ['الرعد', 43, 249], ['إبراهيم', 52, 255], ['الحجر', 99, 262], ['النحل', 128, 267], ['الإسراء', 111, 282], ['الكهف', 110, 293], ['مريم', 98, 305], ['طه', 135, 312],
  ['الأنبياء', 112, 322], ['الحج', 78, 332], ['المؤمنون', 118, 342], ['النور', 64, 350], ['الفرقان', 77, 359], ['الشعراء', 227, 367], ['النمل', 93, 377], ['القصص', 88, 385], ['العنكبوت', 69, 396], ['الروم', 60, 404],
  ['لقمان', 34, 411], ['السجدة', 30, 415], ['الأحزاب', 73, 418], ['سبأ', 54, 428], ['فاطر', 45, 434], ['يس', 83, 440], ['الصافات', 182, 446], ['ص', 88, 453], ['الزمر', 75, 458], ['غافر', 85, 467],
  ['فصلت', 54, 477], ['الشورى', 53, 483], ['الزخرف', 89, 489], ['الدخان', 59, 496], ['الجاثية', 37, 499], ['الأحقاف', 35, 502], ['محمد', 38, 507], ['الفتح', 29, 511], ['الحجرات', 18, 515], ['ق', 45, 518],
  ['الذاريات', 60, 520], ['الطور', 49, 523], ['النجم', 62, 526], ['القمر', 55, 528], ['الرحمن', 78, 531], ['الواقعة', 96, 534], ['الحديد', 29, 537], ['المجادلة', 22, 542], ['الحشر', 24, 545], ['الممتحنة', 13, 549],
  ['الصف', 14, 551], ['الجمعة', 11, 553], ['المنافقون', 11, 554], ['التغابن', 18, 556], ['الطلاق', 12, 558], ['التحريم', 12, 560], ['الملك', 30, 562], ['القلم', 52, 564], ['الحاقة', 52, 566], ['المعارج', 44, 568],
  ['نوح', 28, 570], ['الجن', 28, 572], ['المزمل', 20, 574], ['المدثر', 56, 575], ['القيامة', 40, 577], ['الإنسان', 31, 578], ['المرسلات', 50, 580], ['النبأ', 40, 582], ['النازعات', 46, 583], ['عبس', 42, 585],
  ['التكوير', 29, 586], ['الانفطار', 19, 587], ['المطففين', 36, 587], ['الانشقاق', 25, 589], ['البروج', 22, 590], ['الطارق', 17, 591], ['الأعلى', 19, 591], ['الغاشية', 26, 592], ['الفجر', 30, 593], ['البلد', 20, 594],
  ['الشمس', 15, 595], ['الليل', 21, 595], ['الضحى', 11, 596], ['الشرح', 8, 596], ['التين', 8, 597], ['العلق', 19, 597], ['القدر', 5, 598], ['البينة', 8, 598], ['الزلزلة', 8, 599], ['العاديات', 11, 599],
  ['القارعة', 11, 600], ['التكاثر', 8, 600], ['العصر', 3, 601], ['الهمزة', 9, 601], ['الفيل', 5, 601], ['قريش', 4, 602], ['الماعون', 7, 602], ['الكوثر', 3, 602], ['الكافرون', 6, 603], ['النصر', 3, 603],
  ['المسد', 5, 603], ['الإخلاص', 4, 604], ['الفلق', 5, 604], ['الناس', 6, 604],
];
export const PAGES = 604;
export const JUZ_PAGES = [1, 22, 42, 62, 82, 102, 121, 142, 162, 182, 201, 222, 242, 262, 282, 302, 322, 342, 362, 382, 402, 422, 442, 462, 482, 502, 522, 542, 562, 582];
const START = []; { let n = 0; SURAHS.forEach((s, i) => { START[i + 1] = n; n += s[1]; }); }
export const globalAyah = (s, a) => START[s] + a;
export const juzOfPage = p => { let j = 1; JUZ_PAGES.forEach((q, i) => { if (p >= q) j = i + 1; }); return j; };
export const surahOfPage = p => { let s = 1; SURAHS.forEach((x, i) => { if (p >= x[2]) s = i + 1; }); return s; };
export const BASMALA = 'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
export const arNum = n => String(n).replace(/\d/g, d => AR_DIGITS[d]);

// Fetch JSON once, keep it (pages, tafsir, reciters' audio lists) - read again from the cache, even offline.
const mem = new Map();
export async function getJSON(url, { keep = true } = {}) {
  if (mem.has(url)) return mem.get(url);
  const p = (async () => {
    let cache = null;
    try { cache = keep && 'caches' in window ? await caches.open(CACHE) : null; const hit = cache && await cache.match(url); if (hit) return await hit.json(); } catch {}
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const copy = r.clone();
    const d = await r.json();
    try { if (cache) await cache.put(url, copy); } catch {}
    return d;
  })();
  mem.set(url, p);
  p.catch(() => mem.delete(url));
  if (mem.size > 400) mem.delete(mem.keys().next().value);
  return p;
}

// One mushaf page: 15 lines of words (with each word's ayah), plus the surah banners and basmalas between them.
// line = { type: 'text', words: [{ t, key, end }] } | { type: 'surah', s } | { type: 'basmala' }
export async function loadPage(n) {
  try { return await pageFromQuranCom(n); }
  catch (e) { console.warn('quran.com page', n, e); return pageFromAlquran(n); }
}
async function pageFromQuranCom(n) {
  const d = await getJSON(`${QC}/verses/by_page/${n}?words=true&word_fields=text_uthmani,line_number&per_page=50&fields=text_uthmani`);
  const verses = d.verses || [];
  if (!verses.length) throw new Error('empty page');
  const byLine = new Map();
  const ayahs = [];
  for (const v of verses) {
    ayahs.push({ key: v.verse_key, text: v.text_uthmani || '' });
    for (const w of v.words || []) {
      const ln = w.line_number || 1;
      if (!byLine.has(ln)) byLine.set(ln, []);
      byLine.get(ln).push({ t: w.text_uthmani || w.text || '', key: v.verse_key, end: w.char_type_name === 'end', pos: w.position });
    }
  }
  const lines = [];
  const used = [...byLine.keys()];
  const special = n <= 2;   // al-Fatiha and the opening of al-Baqarah: a short centred block in the printed mushaf
  const lastLine = special ? Math.max(...used) : Math.max(15, ...used);
  // first ayah of a surah on this page → its banner (and basmala) sit on the empty lines just above it
  const starts = new Map();
  for (const v of verses) { const [s, a] = v.verse_key.split(':').map(Number); if (a === 1) starts.set(s, Math.min(...(v.words || []).map(w => w.line_number || 99))); }
  for (let ln = 1; ln <= lastLine; ln++) lines[ln - 1] = byLine.has(ln) ? { type: 'text', words: byLine.get(ln) } : { type: 'empty' };
  for (const [s, ln] of starts) {
    let i = ln - 2;   // the line above the first words
    if (s !== 1 && s !== 9 && i >= 0 && lines[i].type === 'empty') { lines[i] = { type: 'basmala' }; i--; }
    if (i >= 0 && lines[i].type === 'empty') lines[i] = { type: 'surah', s };
  }
  // a page that ends with empty lines: the next surah's banner (its first ayah is on the next page)
  const firstEmptyTail = special ? -1 : lines.findIndex((l, i) => l.type === 'empty' && lines.slice(i).every(x => x.type === 'empty'));
  if (firstEmptyTail > 0 && n < PAGES) {
    const next = SURAHS.findIndex(x => x[2] === n + 1);
    if (next >= 0) { lines[firstEmptyTail] = { type: 'surah', s: next + 1 }; if (next + 1 !== 9 && lines[firstEmptyTail + 1]) lines[firstEmptyTail + 1] = { type: 'basmala' }; }
  }
  return { n, lines, ayahs, special, juz: verses[0].juz_number || juzOfPage(n), hizb: verses[0].hizb_number, exact: true };
}
// fallback (quran.com unreachable): the page's ayahs from alquran.cloud, laid out by the reader itself
async function pageFromAlquran(n) {
  const d = await getJSON(`${ALQ}/page/${n}/quran-uthmani`);
  const ay = d.data?.ayahs || [];
  const ayahs = ay.map(a => {
    const s = a.surah.number, k = s + ':' + a.numberInSurah;
    let t = a.text || '';
    if (a.numberInSurah === 1 && s !== 1 && s !== 9) t = t.replace(/^﻿?بِسۡمِ\s*ٱللَّهِ\s*ٱلرَّحۡمَٰنِ\s*ٱلرَّحِيمِ\s*/, '').replace(/^﻿?بِسْمِ\s*[^\s]+\s*[^\s]+\s*[^\s]+\s*/, m => (m.includes('ٱلرَّحِيمِ') || m.includes('الرَّحِيمِ') ? '' : m));
    return { key: k, text: t, s, a: a.numberInSurah };
  });
  return { n, flow: ayahs, ayahs: ayahs.map(a => ({ key: a.key, text: a.text })), juz: ay[0]?.juz || juzOfPage(n), exact: false };
}

// ---- tafsir ----  (quran.com, alquran.cloud and the open spa5k collection on jsDelivr)
const SPA = 'https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/';
export const TAFSIRS = [
  { id: 'muyassar', name: 'التفسير الميسر', alq: 'ar.muyassar', qc: 16 },
  { id: 'mukhtasar', name: 'المختصر في التفسير', spa: 'ar-tafsir-al-mukhtasar' },
  { id: 'saadi', name: 'تفسير السعدي', qc: 91, spa: 'ar-tafsir-as-saadi' },
  { id: 'ibnkathir', name: 'تفسير ابن كثير', qc: 14 },
  { id: 'tabari', name: 'تفسير الطبري', qc: 15 },
  { id: 'qurtubi', name: 'تفسير القرطبي', qc: 90 },
  { id: 'baghawi', name: 'تفسير البغوي', qc: 94 },
  { id: 'wasit', name: 'التفسير الوسيط', qc: 93 },
  { id: 'tanwir', name: 'التحرير والتنوير', spa: 'ar-tafseer-tahrir-al-tanwir' },
  { id: 'jalalayn', name: 'تفسير الجلالين', alq: 'ar.jalalayn' },
  { id: 'tadabbur', name: 'تدبّر وعمل', spa: 'tadabbur-wa-amal' },
  { id: 'gharib', name: 'غريب القرآن (السراج)', spa: 'asseraj-fi-bayan-gharib-alquran' },
  { id: 'irab', name: 'إعراب القرآن الميسر', spa: 'al-i-rab-al-muyassar' },
  { id: 'durr', name: 'الدر المنثور · روايات وأسباب النزول', spa: 'al-durr-al-manthur' },
  { id: 'asbab', name: 'أسباب النزول · الواحدي (إنجليزي)', spa: 'en-asbab-al-nuzul-by-al-wahidi', ltr: true },
  { id: 'miqbas', name: 'تنوير المقباس', alq: 'ar.miqbas' },
];
const strip = h => String(h || '').replace(/<sup[^>]*>.*?<\/sup>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
async function tafsirOne(t, key) {
  const [s, a] = key.split(':');
  const tries = [];
  if (t.qc) tries.push(async () => strip((await getJSON(`${QC}/tafsirs/${t.qc}/by_ayah/${key}`)).tafsir?.text));
  if (t.spa) tries.push(async () => strip((await getJSON(`${SPA}${t.spa}/${s}/${a}.json`)).text));
  if (t.alq) tries.push(async () => strip((await getJSON(`${ALQ}/ayah/${key}/${t.alq}`)).data?.text));
  let err = null;
  for (const f of tries) { try { const x = await f(); if (x) return x; } catch (e) { err = e; } }
  if (err) throw err;
  return '';
}
// The tafsir of one ayah. Some books explain several ayahs together: an empty answer looks back (up to 6 ayahs)
// to the passage that covers it.
export async function tafsirText(id, key) {
  const t = TAFSIRS.find(x => x.id === id) || TAFSIRS[0];
  let [s, a] = key.split(':').map(Number);
  for (let back = 0; back < 7 && a >= 1; back++, a--) {
    const x = await tafsirOne(t, s + ':' + a);
    if (x) return back ? `(تفسير الآيات ${arNum(a)}–${arNum(a + back)})\n` + x : x;
  }
  return '';
}

// ---- reciters ----
// q = Quran.com's recordings with every word's timing (the recited word lights up); a = alquran.cloud verse by verse
export const RECITERS = [
  { id: 'q7', name: 'مشاري العفاسي', q: 7 }, { id: 'q6', name: 'محمود خليل الحصري', q: 6 }, { id: 'q9', name: 'محمد صديق المنشاوي', q: 9 },
  { id: 'q2', name: 'عبد الباسط (مرتّل)', q: 2 }, { id: 'q1', name: 'عبد الباسط (مجوّد)', q: 1 }, { id: 'q3', name: 'عبد الرحمن السديس', q: 3 },
  { id: 'q10', name: 'سعود الشريم', q: 10 }, { id: 'q97', name: 'ياسر الدوسري', q: 97 }, { id: 'q4', name: 'أبو بكر الشاطري', q: 4 },
  { id: 'q5', name: 'هاني الرفاعي', q: 5 }, { id: 'q161', name: 'خليفة الطنيجي', q: 161 }, { id: 'q12', name: 'الحصري (المعلّم)', q: 12 },
  { id: 'ar.mahermuaiqly', name: 'ماهر المعيقلي', a: 'ar.mahermuaiqly' }, { id: 'ar.hudhaify', name: 'علي الحذيفي', a: 'ar.hudhaify' },
  { id: 'ar.muhammadayyoub', name: 'محمد أيوب', a: 'ar.muhammadayyoub' }, { id: 'ar.muhammadjibreel', name: 'محمد جبريل', a: 'ar.muhammadjibreel' },
  { id: 'ar.ahmedajamy', name: 'أحمد العجمي', a: 'ar.ahmedajamy' }, { id: 'ar.abdullahbasfar', name: 'عبد الله بصفر', a: 'ar.abdullahbasfar' },
  { id: 'ar.ibrahimakhbar', name: 'إبراهيم الأخضر', a: 'ar.ibrahimakhbar' }, { id: 'ar.aymanswoaid', name: 'أيمن سويد', a: 'ar.aymanswoaid' },
  { id: 'ar.husarymujawwad', name: 'الحصري (مجوّد)', a: 'ar.husarymujawwad' }, { id: 'ar.minshawimujawwad', name: 'المنشاوي (مجوّد)', a: 'ar.minshawimujawwad' },
];
// a whole surah from Quran.com: the audio file + each ayah's start/end and its words' timings
export async function surahTimings(q, s) {
  const d = await getJSON(`https://api.qurancdn.com/api/qdc/audio/reciters/${q}/audio_files?chapter=${s}&segments=true`);
  const f = d.audio_files?.[0];
  if (!f?.audio_url) throw new Error('no audio');
  const ayahs = {};
  for (const v of f.verse_timings || []) ayahs[v.verse_key] = { from: v.timestamp_from, to: v.timestamp_to, words: (v.segments || []).filter(x => x.length >= 3).map(([w, a, b]) => [w, a, b]) };
  return { url: f.audio_url, ayahs };
}
// the audio address of every ayah on a page for a verse-by-verse reciter (the API knows each reciter's bitrate)
export async function pageAudio(n, rec) {
  const d = await getJSON(`${ALQ}/page/${n}/${rec}`);
  const out = {};
  for (const a of d.data?.ayahs || []) out[a.surah.number + ':' + a.numberInSurah] = [a.audio, ...(a.audioSecondary || [])].filter(Boolean);
  return out;
}
export const fallbackAudio = (rec, key) => { const [s, a] = key.split(':').map(Number); return `https://cdn.islamic.network/quran/audio/128/${rec}/${globalAyah(s, a)}.mp3`; };
export const ayahCount = s => SURAHS[s - 1]?.[1] || 0;
export function nextKey(key, d = 1) {
  let [s, a] = key.split(':').map(Number);
  a += d;
  if (a > ayahCount(s)) { s++; a = 1; } else if (a < 1) { s--; a = ayahCount(s); }
  return s >= 1 && s <= 114 ? s + ':' + a : null;
}
export function pageOfKey(key, hint) {
  // the page that holds an ayah: the surah's first page, refined by the pages already loaded (see the reader)
  const s = +key.split(':')[0];
  return hint || SURAHS[s - 1][2];
}

// ---- the fonts (bundled, OFL): Amiri Quran for the mushaf, Amiri for books and tafsir ----
let fontP = null;
const AR = 'U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC';
export function readerFonts() {
  if (!fontP) {
    const f = (fam, file, d = {}) => { const ff = new FontFace(fam, `url(${new URL('../assets/fonts/' + file, import.meta.url).href})`, d); return ff.load().then(x => { document.fonts.add(x); return true; }); };
    fontP = Promise.allSettled([f('Amiri Quran', 'amiri-quran.woff2'), f('Amiri', 'amiri.woff2', { unicodeRange: AR }), f('Amiri', 'amiri-latin.woff2', { unicodeRange: 'U+0000-00FF,U+0131,U+0152-0153,U+2000-206F,U+20AC,U+2122,U+2212' }), f('Amiri', 'amiri-bold.woff2', { weight: '700', unicodeRange: AR })])
      .then(r => r[0].status === 'fulfilled');
  }
  return fontP;
}
export const QFONT = '"Amiri Quran", "Amiri", "Noto Naskh Arabic", "Geeza Pro", serif';
export const BFONT = '"Amiri", "Noto Naskh Arabic", "Geeza Pro", "Times New Roman", serif';
