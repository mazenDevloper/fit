// «عقل مدار»: everything Madar knows right now, in words - the windows and what plays in them, the place, the glass,
// the settings, the widgets, the Quran page, your matches and goals, the prayers, the devices - so a question about
// any of it is answered at once on the phone (no server), and anything else goes to the assistant WITH all of it.
import { settings, pairedDevices } from './config.js';
import { ENVS, envKey } from './envs.js';
import { SURAHS, RECITERS, surahOfPage } from './quran.js';
import { COMMANDS, norm, stem, stemW } from './commands.js';

const pct = v => Math.round((v ?? 0) * 100) + '%';
const mmss = s => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return (h ? h + ' ساعة و' : '') + m + ' دقيقة' + (s % 60 && !h ? ' و' + (s % 60) + ' ثانية' : ''); };
const t12 = ms => new Date(ms).toLocaleTimeString('ar-OM', { hour: 'numeric', minute: '2-digit' });
const host = u => { try { return new URL(u).hostname.replace(/^www\.|^m\./, ''); } catch { return ''; } };
const KIND = { web: 'صفحة', video: 'فيديو', image: 'صورة', model: 'مجسّم', reader: 'المصحف/كتاب', widget: 'أداة', panel: 'لوحة', keyboard: 'لوحة المفاتيح', coach: 'المدرب', shelf: 'رف الكتب', mirror: 'شاشة جهاز' };
const WNAME = { clock: 'الساعة', weather: 'الطقس', timer: 'المؤقت', note: 'ملاحظة', today: 'يومك', photos: 'إطار الصور', nowplaying: 'يُعرض الآن', verse: 'آية اليوم', scenes: 'المشاهد', aihist: 'سجل المساعد', usage: 'استخدامك', dcmedia: 'مكتبتي', dcdash: 'لوحة DriveCast', remote: 'ريموت التلفاز' };
const ON = { sounds: 'الأصوات', dwell: 'النقر بالنظر', handsEnabled: 'تتبع اليد', coolMax: 'التبريد الأقصى', cool: 'التبريد', lite: 'الوضع الخفيف', sportsMode: 'الوضع الرياضي', island: 'جزيرة المباريات', smartBar: 'الشريط الذكي', lookScroll: 'التمرير بالنظر', spatialAudio: 'الصوت المكاني', prayerBar: 'شريط الصلوات', clock: 'الساعة أعلى النظر', stabilizer: 'المثبّت', walk: 'المشي', eyeTrack: 'تتبع العين', handDwell: 'الإصبع فأرة', orb: 'كرة المساعد', allGoals: 'أهداف كل المباريات' };
const isOn = k => k === 'island' || k === 'smartBar' || k === 'lookScroll' || k === 'spatialAudio' || k === 'prayerBar' || k === 'clock' ? settings[k] !== false : !!settings[k];

// ---------------------------------------------------------------- the facts
export function windowLine(app, w) {
  let s = KIND[w.kind] || w.kind;
  if (w.kind === 'widget') s = 'أداة ' + (WNAME[w.type] || w.type);
  else if (w.kind === 'panel') s = 'لوحة ' + (w.panelKind === 'scoreboard' ? 'النتائج' : w.panelKind || '');
  const title = w.title || w.name; if (title && w.kind !== 'widget') s += ' «' + String(title).slice(0, 50) + '»';
  if (w.kind === 'web' && w.url) s += ' (' + host(w.pageUrl || w.url) + ')';
  const v = w.video;
  if (v) s += v.paused ? ' · متوقف' : ' · يعمل' + (isFinite(v.duration) ? ' عند ' + mmss(v.currentTime) + ' من ' + mmss(v.duration) : ' (بث مباشر)');
  if (w.setVolume) s += ' · الصوت ' + (w.isMuted?.() ? 'مكتوم' : pct(w.vol ?? 1));
  if (w.type === 'timer' && w.data) s += w.data.mode === 'watch' ? ' (ساعة إيقاف)' : w.data.running ? ' · باقي ' + mmss((w.data.endAt - Date.now()) / 1000) : ' · متوقف';
  if (w.type === 'note' && w.data?.text) s += ': «' + w.data.text.slice(0, 80) + '»';
  if (w.kind === 'reader' && w.book?.quran && w.first) { const sr = SURAHS[surahOfPage(w.first) - 1]; s += ' · صفحة ' + w.first + ' (سورة ' + sr[0] + ')' + (w.recite?.playing ? ' · التلاوة تعمل بصوت ' + w.recite.rec.name : ''); }
  if (w.headLock) s += ' · تتبع رأسك';
  if (w.proj === '360') s += ' · 360';
  if (w === app.controls?.pointedWindow?.()) s += ' ← تنظر إليها';
  return s;
}
export function facts(app) {
  const L = [], now = new Date();
  L.push('الوقت: ' + now.toLocaleString('ar-OM', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }) + ' · مدار v' + (app.version || ''));
  L.push('البيئة: ' + (ENVS[envKey(settings.environment)]?.label || settings.environment) + ' · الانغماس ' + pct(app.extras?.portal?.level ?? settings.immersion ?? 1) + ' · الزجاج ' + pct(settings.glass ?? 1) + ' · الحدة ' + pct(settings.sharpen));
  const ws = app.windows.windows;
  L.push('النوافذ المفتوحة (' + ws.length + '): ' + (ws.map(w => windowLine(app, w)).join('؛ ') || 'لا شيء'));
  const sp = app.sports, ms = sp?.data?.matches || [];
  if (ms.length) {
    const st = { live: 'مباشرة', upcoming: 'قادمة', finished: 'انتهت' };
    L.push('مباريات فرقي: ' + ms.slice(0, 8).map(m => {
      const g = (sp.goals?.[m.id] || []).map(x => x.player + ' ' + x.minute).join('، ');
      return `${m.home?.name} × ${m.away?.name} ${st[m.status] || ''} ${m.status === 'upcoming' ? 'الساعة ' + (m.omanTime || '') : (m.score?.home ?? 0) + '-' + (m.score?.away ?? 0)}${m.elapsed ? ' د' + m.elapsed : ''}${g ? ' (الأهداف: ' + g + ')' : ''}`;
    }).join('؛ '));
  }
  const ev = (sp?.island?.events || []).filter(e => e.at > Date.now() - 60000).slice(0, 4);
  if (ev.length) L.push('القادم: ' + ev.map(e => e.title + ' ' + t12(e.at)).join('؛ '));
  const others = app.hub?.others?.() || [];
  L.push('الأجهزة المتصلة: ' + (others.map(d => d.name + (d.playing ? ' يعرض ' + (d.playing.title || '') : '')).join('، ') || 'لا شيء') + ' · المقترنة: ' + (pairedDevices().map(d => d.name).join('، ') || 'لا شيء'));
  L.push('مُفعَّل: ' + Object.keys(ON).filter(isOn).map(k => ON[k]).join('، ') + ' · متوقف: ' + Object.keys(ON).filter(k => !isOn(k)).map(k => ON[k]).join('، '));
  const b = app.control?.battery; if (b) L.push('البطارية ' + pct(b.level) + (b.charging ? ' تشحن' : ''));
  if (app.together?.on) L.push('في «شاهد معاً»');
  if (app.extras?.sketch?.on) L.push('الرسم في الهواء يعمل');
  return L;
}

// ---------------------------------------------------------------- questions answered here, at once
const Q = /^(كم|متي|وش|ايش|شو|ما |ماذا|ماهو|ما هو|ما هي|مين|من |هل|كيف|اين|وين|ليش|لماذا|اي |قل لي|خبرني|عطني)/;
export const isQuestion = t => { const n = norm(t); return Q.test(n) || / (كم|متي|وش|ايش|مين|هل|كيف|وين|اين|ليش) /.test(' ' + n + ' ') || /[؟?]/.test(t); };
const media = app => app.extras?.mediaWindows?.() || [];
const surahName = n => SURAHS.find(s => n.includes(norm(s[0])) || n.includes(norm(s[0]).replace(/^ال/, '')));
// how to do something: the commands whose words are closest to the question
export function howTo(text) {
  const words = stem(norm(text)).split(' ').filter(w => w.length > 2 && !/^(كيف|اقدر|ممكن|اسوي|اعمل|الطريقه|طريقه|اقول|عشان|علشان|حتي)$/.test(w));
  const scored = COMMANDS.map(c => { const hay = stem(norm(c[2] + ' ' + c[3].join(' '))); return [c, words.filter(w => hay.includes(w)).length]; }).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
  const best = c => c[3].map(x => [x, words.filter(w => stem(norm(x)).includes(w)).length + x.length / 100 + (/[a-z]/i.test(x) ? -1 : 0)]).sort((a, b) => b[1] - a[1])[0][0];
  return scored.filter(x => x[1] === scored[0][1]).slice(0, 2).map(([c]) => '«' + best(c) + '» — ' + c[2].split(' (')[0].split('، ويبقى')[0]);
}
export function answer(app, text) {
  const n = norm(text), has = (...w) => w.some(x => n.includes(x)), ws = app.windows.windows;
  if (!isQuestion(text)) return null;
  // how do I…: the closest commands
  if (has('كيف ا', 'كيف ن', 'وش اقول', 'ايش اقول', 'ماذا اقول', 'وش الامر', 'ايش الامر', 'كيف اخلي', 'كيف اسوي')) { const h = howTo(text); if (h.length) return 'قل ' + h.join('، أو '); }
  // the time and the date
  if (has('كم الساعه', 'كم الوقت', 'الساعه كم')) return 'الساعة ' + t12(Date.now());
  if (has('التاريخ', 'اي يوم', 'وش اليوم', 'ايش اليوم', 'كم التاريخ')) return 'اليوم ' + new Date().toLocaleDateString('ar-OM', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' · ' + new Date().toLocaleDateString('ar-SA-u-ca-islamic', { day: 'numeric', month: 'long' });
  // the prayers and what is next
  const P = { فجر: 'الفجر', ظهر: 'الظهر', عصر: 'العصر', مغرب: 'المغرب', 'العشا': 'العشاء', 'عشاء': 'العشاء' };
  const evs = (app.sports?.island?.events || []).filter(e => e.at > Date.now() - 60000);
  if (has('صلاه', 'الصلاه', 'اذان', 'الاذان') || Object.keys(P).some(k => (' ' + n + ' ').match(new RegExp('\\s(ال)?' + k + '(\\s|$)')))) {
    const want = Object.keys(P).find(k => n.includes(k)), e = evs.find(e => !want || norm(e.title).includes(norm(P[want]).replace(/^ال/, ''))) || evs[0];
    return e ? (e.title + ' الساعة ' + t12(e.at) + ' — بعد ' + mmss((e.at - Date.now()) / 1000)) : 'مواقيت الصلاة لم تصل بعد';
  }
  // matches, scores, scorers
  const ms = app.sports?.data?.matches || [];
  if (has('نتيجه', 'مباراه', 'مباريات', 'سجل', 'هدف', 'اهداف', 'الدوري', 'يلعب', 'فريقي', 'متي يلعب')) {
    if (!ms.length) return 'لا مباريات لفرقك اليوم';
    const named = ms.find(m => n.includes(norm(m.home?.name || '-')) || n.includes(norm(m.away?.name || '-'))) || ms.find(m => m.status === 'live') || ms[0];
    const g = (app.sports.goals?.[named.id] || []).map(x => x.player + ' (' + x.minute + ')').join('، ');
    if (named.status === 'upcoming') return `${named.home.name} × ${named.away.name} الساعة ${named.omanTime || ''}`;
    return `${named.home.name} ${named.score?.home ?? 0} - ${named.score?.away ?? 0} ${named.away.name}${named.status === 'live' ? ' — الدقيقة ' + (named.elapsed || '') : ' — انتهت'}${g ? '. سجّل: ' + g : ''}`;
  }
  // what is open / playing
  if (has('كم نافذه', 'النوافذ', 'ايش مفتوح', 'وش مفتوح', 'شو مفتوح', 'ماذا مفتوح', 'المفتوح')) return ws.length ? 'مفتوح ' + ws.length + ': ' + ws.map(w => windowLine(app, w)).join('؛ ') : 'لا نوافذ مفتوحة';
  if (has('ايش يعرض', 'وش يعرض', 'وش اشوف', 'ايش اشوف', 'وش يشتغل', 'ايش يشتغل', 'الفيديو', 'كم باقي علي', 'كم باقي من', 'كم باقي في الفيديو')) {
    const w = media(app).find(w => w.video && !w.video.paused) || media(app)[0];
    if (!w?.video) return 'لا يعمل فيديو الآن';
    const v = w.video;
    return (w.title || 'الفيديو') + (isFinite(v.duration) ? ' — مضى ' + mmss(v.currentTime) + ' وباقي ' + mmss(v.duration - v.currentTime) : ' — بث مباشر') + (v.paused ? ' (متوقف)' : '');
  }
  if (has('المؤقت', 'كم باقي')) { const t = ws.find(w => w.type === 'timer' && w.data?.running); return t ? 'باقي في المؤقت ' + mmss((t.data.endAt - Date.now()) / 1000) : 'لا يوجد مؤقت يعمل'; }
  if (has('ملاحظه', 'ملاحظات', 'كتبت')) { const ns = ws.filter(w => w.type === 'note' && w.data?.text); return ns.length ? 'ملاحظاتك: ' + ns.map(w => '«' + w.data.text + '»').join('، ') : 'لا ملاحظات مكتوبة'; }
  // the Quran
  if (has('اي صفحه', 'الصفحه', 'اي سوره', 'السوره', 'القارئ', 'التلاوه')) { const r = ws.find(w => w.kind === 'reader' && w.book?.quran); if (!r) return 'المصحف غير مفتوح'; if (!r.first) return 'المصحف يُفتح الآن'; const sr = SURAHS[surahOfPage(r.first) - 1]; return 'المصحف عند صفحة ' + r.first + '، سورة ' + sr[0] + (r.recite ? ' · القارئ ' + r.recite.rec.name + (r.recite.playing ? ' (يتلو الآن)' : '') : ''); }
  if (has('القراء', 'اي قارئ', 'مين القراء')) return 'القرّاء في مدار: ' + RECITERS.map(r => r.name).join('، ');
  if (has('الجو', 'الطقس', 'الحراره', 'درجه الحراره')) { app.extras?.widget('weather'); return 'فتحت لك أداة الطقس أمامك'; }
  // the place and the look
  if (has('البيئه', 'وين انا', 'اين انا', 'المكان')) return 'أنت في ' + (ENVS[envKey(settings.environment)]?.label || settings.environment) + ' · الانغماس ' + pct(app.extras?.portal?.level ?? settings.immersion ?? 1);
  if (has('الحده')) return 'الحدة ' + pct(settings.sharpen);
  if (has('الزجاج', 'الشفافيه')) return 'الزجاج ' + pct(settings.glass ?? 1);
  if (has('الانغماس')) return 'الانغماس ' + pct(app.extras?.portal?.level ?? settings.immersion ?? 1);
  if (has('الصوت') && !has('كيف')) { const w = media(app)[0]; return w?.setVolume ? 'الصوت ' + (w.isMuted?.() ? 'مكتوم' : pct(w.vol ?? 1)) : 'لا شيء يعمل بصوت'; }
  // devices, battery, version
  if (has('متصل', 'الاجهزه', 'اجهزتي', 'التلفاز', 'السياره', 'التابلت')) { const o = app.hub?.others?.() || []; return o.length ? 'متصل الآن: ' + o.map(d => d.name + (d.playing ? ' (يعرض ' + (d.playing.title || 'شيئاً') + ')' : '')).join('، ') : 'لا أجهزة متصلة الآن'; }
  if (has('البطاريه', 'الشحن')) { const b = app.control?.battery; return b ? 'البطارية ' + pct(b.level) + (b.charging ? ' وتشحن' : '') : 'لا أعرف البطارية الآن'; }
  if (has('النسخه', 'الاصدار', 'اي نسخه')) return 'مدار visionOS 27 · v' + (app.version || '');
  // is X on?
  const key = Object.keys(ON).find(k => stem(n).includes(stem(norm(ON[k]))));
  if (key && has('هل', 'شغال', 'مفعل', 'يعمل')) return ON[key] + (isOn(key) ? ' يعمل' : ' متوقف');
  // how do I…
  return null;
}
