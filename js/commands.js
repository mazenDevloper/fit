// «مساعد مدار» - every command Madar understands, in one list: what it does, how people say it, and the code that
// does it. The spoken text is first matched here on the phone (instant, works offline, any wording that contains a
// known phrase); anything else - a new wording, a question, several steps at once («افتح يوتيوب وكبّره») - goes to
// the assistant on the server WITH this whole list and what is on screen now, and it answers with the commands to run.
import { settings, saveSettings, pairedDevices } from './config.js';
import { ENVS, ENV_ORDER, envKey } from './envs.js';
import { RECITERS } from './quran.js';

// ---------------------------------------------------------------- Arabic, the way people speak it
export function norm(s) {
  return String(s || '').toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[؟?!،,]|\.(?=\s|$)/g, ' ')
    .replace(/^(يا )?مدار\s*/, '').replace(/(^|\s)(لو سمحت|من فضلك|ممكن|رجاء|ابي|ابغى|ابغي|اريد|بدي|ودي|خلني|خليني|يا مدار)(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
const WORDS = { 'دقيقه': 1, 'دقيقتين': 2, 'ثلاث': 3, 'خمس': 5, 'عشر': 10, 'ربع': 15, 'عشرين': 20, 'نص': 30, 'نصف': 30, 'ثلاثين': 30, 'ساعه': 60, 'نص ساعه': 30, 'ربع ساعه': 15 };
const num = t => { const n = norm(t), m = n.match(/\d+/); if (m) return +m[0]; const w = Object.keys(WORDS).sort((a, b) => b.length - a.length).find(k => (' ' + n + ' ').includes(' ' + k + ' ')); return w ? WORDS[w] : null; };

// ---------------------------------------------------------------- helpers over the app
const P = a => (a._chainWin && a.windows.windows.includes(a._chainWin) ? a._chainWin : null) || a.controls?.pointedWindow?.() || [...a.windows.windows].reverse().find(w => w.kind !== 'keyboard') || null;
const V = a => { const l = a.extras?.mediaWindows?.() || []; const p = a.controls?.pointedWindow?.(); return (p && l.includes(p) ? p : null) || l.find(w => w.video && !w.video.paused) || l[0] || null; };
// what the sentence talks about: «كل النوافذ», «القائمة», or the window you look at
const MENU = /(القايمه|القائمه|الرئيسيه|الشاشه الرئيسيه|التطبيقات|الهوم|المنيو)/, ALL = /((كل|جميع) (النوافذ|الشاشات)|(^|\s)الكل(\s|$))/;
const T = (a, t = '') => {
  const n = norm(t), L = a.launcher;
  if (MENU.test(n) && L) return [L];
  if (ALL.test(n)) return a.windows.windows.filter(w => w.kind !== 'keyboard');
  const w = (a._chainWin && a.windows.windows.includes(a._chainWin) ? a._chainWin : null) || a.controls?.pointedWindow?.();
  if (!w && L?.group.visible) return [L];   // the Home View is open and no window is looked at: the Home View
  const p = w || P(a); return p ? [p] : [];
};
const each = (a, t, f) => T(a, t).forEach(x => { try { f(x); } catch {} });
const grow = (x, f) => x.group && (x.scaleBy ? x.scaleBy(f) : x.group.scale.multiplyScalar(f));
const SIZE = t => { const n = norm(t); return /(الترا|اولترا|عريض جدا|عريضه جدا|32)/.test(n) ? 'ultra' : /(عادي|طبيعي|الاصلي|رجع المقاس|16)/.test(n) ? 'normal' : /(عريض|عريضه|وايد سكرين|21)/.test(n) ? 'wide' : null; };
const WEB = a => [a.controls?.pointedWindow?.(), ...[...a.windows.windows].reverse()].find(w => w?.kind === 'web') || null;
const READER = a => a.windows.windows.find(w => w.kind === 'reader');
const web = (a, url, title) => a.windows.open({ kind: 'web', url, title });
const tog = (a, key, label, on = settings[key] === false) => { saveSettings({ [key]: on }); a.toast((on ? '✓ ' : '✕ ') + label, 1500); a.control?.redraw(); };
const vol = (a, d, mute) => { const w = V(a); if (!w?.setVolume) return a.toast('لا شيء يعمل', 1500); if (mute != null) w.setVolume(w.vol ?? 1, mute); else w.stepVolume(d); };
const seek = (a, s) => { const v = V(a)?.video; if (v && isFinite(v.duration)) v.currentTime = Math.max(0, Math.min(v.duration - 0.5, v.currentTime + s)); };
const play = (a, on) => { const w = V(a); if (!w?.video) return; if (on) { w.userPaused = false; w.video.play().catch(() => {}); } else { w.userPaused = true; w.video.pause(); } };
const env = (a, k) => { saveSettings({ environment: k }); a.renderEnvChoices?.(); a.toast('البيئة: ' + (ENVS[k]?.label || k), 1500); };
const folder = (a, f) => { const L = a.launcher; if (!L) return; if (!L.group.visible) L.open(); L.folder = f; L.page = 0; L.panel.redraw(); };
const devByWord = t => { const d = pairedDevices(), n = norm(t); return d.find(x => n.includes(norm(x.name))) || d.find(x => (/تابلت/.test(n) && x.kind === 'tablet') || (/(تلفاز|تلفزيون)/.test(n) && x.kind === 'tv') || (/(لابتوب|كمبيوتر)/.test(n) && x.kind === 'computer')); };

// ---------------------------------------------------------------- YouTube by voice
// «شغل سورة الكوثر بقراءة ياسر الدوسري في اليوتيوب، الأجمل الأطول»: the words that are not the request itself are
// dropped, «الأجمل / الأفضل / الأشهر» = the most watched, «الأطول» = the longest, «الأحدث» = the newest. The server
// reads YouTube's results and the chosen video opens and plays; if it can't, the results page opens filtered the same way.
const YT_DROP = /(^|\s)(شغل|شغلي|افتح|اعرض|ابحث|عن|دور|على|في|من|لي|علي|اليوتيوب|يوتيوب|youtube|بقراءه|قراءه|بصوت|صوت|بتلاوه|تلاوه|القارئ|الشيخ|مقطع|فيديو|و|و?ال?اجمل|و?ال?افضل|و?ال?احلي|و?ال?اشهر|و?ال?اطول|طويل|و?ال?احدث|جديد|واحد|نسخه)(?=\s|$)/g;
export function ytQuery(text) {
  const n = norm(text), pick = [];
  if (/(اجمل|افضل|احلي|اشهر)/.test(n)) pick.push('views');
  if (/(اطول|طويل)/.test(n)) pick.push('long');
  if (/(احدث|جديد)/.test(n)) pick.push('new');
  let q = n; for (let k = 0; k < 3; k++) q = q.replace(YT_DROP, ' ');
  return { q: q.replace(/\s+/g, ' ').trim(), pick };
}
async function ytPlay(a, text) {
  const { q, pick } = ytQuery(text);
  if (!q) return web(a, 'https://m.youtube.com', 'YouTube');
  a.toast('🔎 يوتيوب: ' + q + (pick.length ? ' · ' + pick.map(p => ({ views: 'الأكثر مشاهدة', long: 'الأطول', new: 'الأحدث' })[p]).join(' و') : ''), 2500);
  try {
    const r = await fetch('https://studio.c-p.workers.dev/yt/find?q=' + encodeURIComponent(q) + '&pick=' + pick.join(','), { signal: AbortSignal.timeout?.(6000) }).then(x => x.json());
    const v = r.items?.[0];
    if (v) { a.toast('▶︎ ' + v.title, 3000); return web(a, 'https://m.youtube.com/watch?v=' + v.id, v.title); }
  } catch {}
  const sp = pick.includes('long') ? (pick.includes('views') ? '&sp=CAMSAhgC' : '&sp=EgIYAg%3D%3D') : pick.includes('views') ? '&sp=CAM%3D' : pick.includes('new') ? '&sp=CAI%3D' : '';
  return web(a, 'https://m.youtube.com/results?search_query=' + encodeURIComponent(q) + sp, q);
}

// ---------------------------------------------------------------- the list: [id, group, what it does, how people say it, run]
// «arg»: the words after the phrase (a name, a number, a text)
export const COMMANDS = [
  // ---- windows
  ['close', 'النوافذ', 'أغلق النافذة التي تنظر إليها', ['اغلق النافذه', 'اغلق هذا', 'سكر', 'سكرها', 'سكره', 'اقفل النافذه', 'اغلقها', 'اغلقه'], (a, x, t) => { const L = T(a, t); if (L[0] === a.launcher) return a.launcher.close(); const w = L.length > 1 ? null : L[0]; if (L.length > 1) return L.forEach(v => a.windows.close(v)); if (w) a.windows.close(w); }],
  ['close_all', 'النوافذ', 'أغلق كل النوافذ', ['اغلق الكل', 'سكر الكل', 'اغلق كل النوافذ', 'نظف المكان'], a => a.windows.closeAll()],
  ['bigger', 'النوافذ', 'كبّر النافذة', ['كبر', 'كبرها', 'كبره', 'اكبر', 'تكبير'], (a, x, t) => each(a, t, v => grow(v, 1.25))],
  ['smaller', 'النوافذ', 'صغّر النافذة', ['صغر', 'صغرها', 'صغره', 'اصغر', 'تصغير'], (a, x, t) => each(a, t, v => grow(v, 1 / 1.25))],
  ['closer', 'النوافذ', 'قرّب النافذة', ['قربها', 'قربه', 'قرب النافذه', 'اقرب'], (a, x, t) => { each(a, t, w => { w.group.position.multiplyScalar(0.8); w.updateRadius?.(); }); a.windows.changed(); }],
  ['farther', 'النوافذ', 'أبعد النافذة', ['بعدها', 'بعده', 'ابعد النافذه', 'ابعدها'], (a, x, t) => { each(a, t, w => { w.group.position.multiplyScalar(1.25); w.updateRadius?.(); }); a.windows.changed(); }],
  ['pin', 'النوافذ', 'ثبّت النافذة أمام عينيك (تتبع رأسك)', ['ثبت', 'ثبتها', 'ثبته', 'تثبيت', 'خليها معي', 'تتبعني'], a => { const w = P(a); if (w) { w.headLock = !w.headLock; a.toast(w.headLock ? 'النافذة تتبع رأسك' : 'النافذة ثابتة في الغرفة', 1800); } }],
  ['arrange', 'النوافذ', 'رتّب النوافذ حولك', ['رتب', 'رتب النوافذ', 'ترتيب'], a => a.windows.arrange()],
  ['recenter', 'النوافذ', 'أعد التمركز أمامك', ['تمركز', 'اعد التمركز', 'امامي', 'المنتصف', 'رجعها قدامي'], a => a.recenter()],
  ['curve', 'النوافذ', 'اجعل النافذة منحنية / مسطحة', ['منحني', 'منحنيه', 'اجعلها منحنيه', 'مسطحه', 'مسطح'], (a, x, t) => each(a, t, w => w.setCurved?.(!/مسطح/.test(norm(t))))],
  ['view360', 'النوافذ', 'اعرض الصفحة أو الفيديو 360 حولك', ['360', 'حولي', 'كروي'], a => { const w = P(a); w?.view360?.(w.proj !== '360'); }],
  ['size_mode', 'النوافذ', 'المقاس للنافذة التي تنظر إليها أو القائمة أو كل النوافذ: عادي، عريض 21:9، الترا وايد 32:9', ['المقاس', 'عريض', 'عريضه', 'عريض جدا', 'الترا وايد', 'الترا', 'اولترا', 'التراوايد', 'ultra wide', 'ultrawide', 'وايد سكرين', 'سينمائي', 'رجع المقاس'], (a, x, t) => { const m = SIZE(t); each(a, t, w => m ? w.setSize?.(m) : w.cycleSize?.()); }],
  ['cinema', 'النوافذ', 'وضع السينما: نافذة واحدة فقط', ['السينما', 'وضع السينما'], a => { const w = P(a); if (w) a.windows.cinema = a.windows.cinema === w ? null : w; }],
  ['on_tv', 'النوافذ', 'ضع النافذة فوق التلفاز الحقيقي', ['على التلفاز', 'فوق التلفاز', 'على الشاشه الحقيقيه'], a => P(a)?.onTv?.()],
  ['send_window', 'الأجهزة', 'أرسل النافذة إلى جهاز آخر', ['ارسل الى', 'ارسلها', 'حولها للتلفاز', 'انقلها'], a => { const w = P(a); if (w) a.hub?.sendWindow(w); }],
  // ---- video & sound
  ['play', 'الفيديو', 'شغّل الفيديو', ['شغل', 'كمل', 'استمر', 'تشغيل'], a => play(a, true)],
  ['pause', 'الفيديو', 'أوقف الفيديو مؤقتاً', ['اوقف', 'وقف', 'ايقاف', 'استوب', 'لحظه'], a => play(a, false)],
  ['forward', 'الفيديو', 'قدّم الفيديو (عدد الثواني أو 10)', ['قدم', 'تقديم', 'للامام', 'قدمه'], (a, x, t) => seek(a, (num(t) || 10) * (/دقيق/.test(norm(t)) ? 60 : 1))],
  ['back10', 'الفيديو', 'أرجع الفيديو (عدد الثواني أو 10)', ['رجع', 'ارجع', 'للخلف', 'اعد اخر'], (a, x, t) => seek(a, -(num(t) || 10) * (/دقيق/.test(norm(t)) ? 60 : 1))],
  ['vol_up', 'الصوت', 'ارفع الصوت', ['ارفع الصوت', 'علي الصوت', 'زد الصوت', 'زيد الصوت', 'صوت اعلى'], a => vol(a, 0.2)],
  ['vol_down', 'الصوت', 'اخفض الصوت', ['اخفض الصوت', 'خفض الصوت', 'وطي الصوت', 'قلل الصوت', 'صوت اقل'], a => vol(a, -0.2)],
  ['mute', 'الصوت', 'اكتم الصوت', ['اكتم', 'كتم', 'بدون صوت', 'اسكت'], a => vol(a, 0, true)],
  ['unmute', 'الصوت', 'أعد الصوت', ['الغ الكتم', 'رجع الصوت', 'شغل الصوت'], a => vol(a, 0, false)],
  ['sleep_timer', 'الفيديو', 'أوقف الفيديو بعد دقائق', ['مؤقت النوم', 'اوقف بعد', 'وقف بعد', 'نام بعد'], (a, x, t) => { const m = num(t) || 30; setTimeout(() => play(a, false), m * 60000); a.toast('😴 يتوقف بعد ' + m + ' دقيقة', 2000); }],
  ['multiview', 'الفيديو', 'عرض متعدد: عدة فيديوهات معاً', ['عرض متعدد', 'شاشات متعدده', 'ملتي فيو'], a => a.extras?.toggleMultiview()],
  ['captions', 'الفيديو', 'الترجمة النصية الحية', ['الترجمه', 'ترجمه نصيه', 'ترجمه فوريه', 'ترجم الكلام'], (a, x, t) => a.extras?.captions.toggle(/(انجليز)/.test(norm(t)) ? 'en-US' : undefined)],
  ['together', 'الفيديو', 'شاهد معاً مع أهلك', ['شاهد معا', 'مشاهده جماعيه', 'نشاهد سوا'], a => a.together?.toggle()],
  // ---- screens & devices
  ['hdmi', 'الأجهزة', 'اعرض شاشة التابلت / HDMI', ['hdmi', 'اتش دي ام اي', 'الرسيفر', 'القطعه', 'شاشه التابلت', 'اعرض التابلت'], (a, x, t) => { const d = devByWord(t) || pairedDevices().find(x => x.kind === 'tablet') || pairedDevices()[0]; if (!d) return folder(a, 'screens'); a.hub?.op({ op: 'send', to: 'sys-' + d.code, msg: { type: 'wake', share: true } }); a.toast('📺 يفتح شاشة ' + (d.name || 'التابلت') + '…', 2500); a.connectMirror(d.code); }],
  ['show_device', 'الأجهزة', 'اعرض شاشة جهاز بالاسم', ['اعرض شاشه', 'افتح شاشه', 'شاشه الجهاز'], (a, x, t) => { const d = devByWord(t); if (!d) return a.toast('لم أعرف أي جهاز', 1800); if (d.kind === 'tv') a.showOnDevice(d.code, settings.mirrorCode); else a.connectMirror(d.code); }],
  ['wake', 'الأجهزة', 'أيقظ أجهزتي (تفتح شاشاتها هنا)', ['ايقظ', 'صحي الاجهزه', 'شغل الاجهزه', 'ايقاظ'], a => { a.hub?.op({ op: 'send', to: 'kind:sys', msg: { type: 'wake', share: true } }); a.toast('⏻ أُرسل الإيقاظ', 1800); }],
  ['iphone', 'الأجهزة', 'اعرض شاشة الآيفون', ['شاشه الايفون', 'الايفون', 'ايفوني'], a => a.iphone?.pick()],
  ['clipboard', 'الأجهزة', 'أرسل ما نسخته لكل أجهزتك', ['الحافظه', 'ارسل المنسوخ', 'ارسل ما نسخته'], a => a.welcome?.sendClipboard()],
  ['remote_tv', 'الأجهزة', 'ريموت التلفاز (DriveCast)', ['ريموت', 'الريموت', 'التحكم بالتلفاز'], a => a.extras?.widget('remote')],
  ['devices', 'الأجهزة', 'من متصل الآن؟', ['الاجهزه المتصله', 'من متصل', 'اجهزتي'], a => a.toast(a.hub?.others().map(d => d.name).join(' · ') || 'لا أجهزة متصلة', 3500)],
  ['welcome', 'الأجهزة', 'مرحباً: التاريخ والصلاة ومباراتك وأجهزتك', ['مرحبا', 'صباح الخير', 'مساء الخير', 'ملخص اليوم'], a => a.welcome?.show()],
  // ---- places & look
  ['env_next', 'البيئة', 'البيئة التالية', ['غير البيئه', 'البيئه التاليه', 'بيئه ثانيه'], a => a.cycleEnvironment()],
  ['env_real', 'البيئة', 'الواقع (الكاميرا)', ['الواقع', 'الغرفه الحقيقيه', 'شيل البيئه'], a => env(a, 'passthrough')],
  ['env_dim', 'البيئة', 'غرفة خافتة', ['خافت', 'خفف الاضاءه', 'عتم'], a => env(a, 'dim')],
  ['env_space', 'البيئة', 'الفضاء', ['الفضاء', 'النجوم'], a => env(a, 'space')],
  ['env_named', 'البيئة', 'بيئة بالاسم (المكتبة، صالة النيون، المشتري…)', ['بيئه', 'خذني الى', 'انقلني الى', 'خذني', 'ودني', 'انقلني', 'روح'], (a, x, t) => { const n = norm(t); const have = new Set(stem(n).split(' ')), score = k => norm(ENVS[k]?.label || '').split(/[\s·]+/).filter(w => w.length > 2 && have.has(stemW(w))).length;
      const k = ENV_ORDER.filter(k => score(k) > 0).sort((x, y) => score(y) - score(x) || ENVS[x].label.length - ENVS[y].label.length)[0]; if (k) env(a, k); else a.gallery?.open('rooms'); }],
  ['env_library', 'البيئة', 'مكتبة البيئات والغرف', ['مكتبه البيئات', 'المكتبات', 'البيئات', 'الغرف'], a => a.gallery?.open('rooms')],
  ['immersion', 'البيئة', 'الانغماس (نسبة مئوية أو زد/قلل)', ['الانغماس', 'انغماس'], (a, x, t) => { const p = a.extras?.portal, n = num(t), w = norm(t); if (!p) return; p.set(n != null ? n / 100 : /(زد|كامل|اكثر)/.test(w) ? Math.min(1, (p.level || 0) + 0.25) : /(قلل|خفف|اقل)/.test(w) ? Math.max(0, (p.level || 0) - 0.25) : 0.5); }],
  ['glass', 'البيئة', 'شفافية الزجاج (أكثر / أقل)', ['الزجاج', 'شفافيه'], (a, x, t) => { a.smartBar?.select?.('glass'); a.smartBar?.step?.(/(اقل|شفاف|خفف)/.test(norm(t)) ? -2 : 2); }],
  ['sharpness', 'البيئة', 'الحدة (أكثر / أقل)', ['الحده', 'اوضح', 'حده'], (a, x, t) => { const d = /(اقل|خفف|نعم)/.test(norm(t)) ? -0.1 : 0.1; saveSettings({ sharpen: Math.max(0, Math.min(1.5, settings.sharpen + d)) }); a.renderer.applySettings(); a.toast('الحدة ' + Math.round(settings.sharpen * 100) + '%', 1500); }],
  ['scan_room', 'البيئة', 'تعرّف على الغرفة (مسح)', ['امسح الغرفه', 'مسح الغرفه', 'تعرف على الغرفه'], a => a.room?.scan()],
  ['makkah', 'البيئة', 'مكة المكرمة مباشر', ['مكه', 'لمكه', 'خذني لمكه', 'الحرم', 'للحرم', 'الكعبه'], a => a.openMakkah?.()],
  ['lying', 'البيئة', 'وضع الاستلقاء (النوافذ فوقك)', ['استلقاء', 'مستلقي', 'فوقي', 'السقف'], a => a.plus?.toggleLying()],
  ['travel', 'البيئة', 'وضع السفر (في السيارة أو الطائرة)', ['وضع السفر', 'انا في الطائره', 'انا مسافر'], a => a.extras?.toggleTravel()],
  ['focus', 'البيئة', 'وضع التركيز (يخفت ما حولك)', ['وضع التركيز', 'ركزني'], a => a.extras?.toggleFocus()],
  // ---- menus
  ['home', 'القوائم', 'الشاشة الرئيسية', ['القائمه', 'الرئيسيه', 'الشاشه الرئيسيه', 'التطبيقات'], a => a.toggleLauncher()],
  ['control', 'القوائم', 'مركز التحكم', ['مركز التحكم', 'التحكم السريع', 'الاعدادات السريعه'], a => a.control?.open()],
  ['keyboard', 'القوائم', 'لوحة المفاتيح', ['كيبورد', 'لوحه المفاتيح'], a => a.windows.open({ kind: 'keyboard' })],
  ['type', 'القوائم', 'اكتب كلاماً (في الصفحة أو الجهاز)', ['اكتب', 'سجل'], (a, x) => { if (x) a.dictate(x); else a.listen('dictate'); }],
  ['calibrate', 'القوائم', 'معايرة النظارة', ['معايره', 'عاير النظاره'], a => a.calibration?.open()],
  ['exit', 'القوائم', 'الخروج من مدار', ['خروج', 'اخرج من مدار', 'اطلع'], a => a.exit()],
  ['help', 'القوائم', 'ماذا أستطيع أن أقول؟', ['ماذا تستطيع', 'الاوامر', 'وش اقول', 'ماذا اقول', 'مساعده'], a => a.showCommands?.()],
  // ---- web & apps
  ['search', 'المواقع', 'ابحث في جوجل', ['ابحث عن', 'دور على', 'بحث عن', 'قوقل'], (a, x) => { if (x) web(a, 'https://www.google.com/search?q=' + encodeURIComponent(x), x); }],
  ['youtube', 'المواقع', 'يوتيوب: يبحث ويشغّل ما طلبت («شغل سورة الكوثر بصوت ياسر الدوسري في اليوتيوب، الأجمل الأطول»)', ['يوتيوب', 'اليوتيوب'], (a, x, t) => ytPlay(a, t)],
  ['shahid', 'المواقع', 'شاهد', ['شاهد نت', 'منصه شاهد', 'افتح شاهد'], a => web(a, 'https://shahid.mbc.net', 'شاهد')],
  ['netflix', 'المواقع', 'نتفلكس', ['نتفلكس', 'نتفليكس'], a => web(a, 'https://www.netflix.com', 'Netflix')],
  ['open_site', 'المواقع', 'افتح موقعاً بالاسم أو الرابط', ['افتح موقع', 'روح لموقع', 'ادخل موقع'], (a, x) => { if (!x) return; const u = /^https?:/.test(x) ? x : /\./.test(x) ? 'https://' + x.replace(/\s/g, '') : 'https://www.google.com/search?btnI=1&q=' + encodeURIComponent(x); web(a, u, x); }],
  ['drivecast', 'المواقع', 'DriveCast مدار: الفيديو في الوسط ومكتبتك والمقترحات حوله', ['درايف كاست', 'درايفكاست', 'دي سي'], a => a.openYouTube('drivecast')],
  ['cplay_site', 'المواقع', 'موقع DriveCast كما هو (cplay2)', ['سي بلاي', 'كبلاي', 'موقع درايف'], a => a.openCplay()],
  ['yt_view', 'المواقع', 'يوتيوب مدار: الفيديو في الوسط وقنواتك والمقترحات على الجانبين', ['يوتيوب مدار', 'واجهه يوتيوب', 'افتح يوتيوب'], a => a.openYouTube('youtube')],
  ['watch_mode', 'الفيديو', 'وضع المشاهدة: تختفي القوائم وتخفت الغرفة', ['وضع المشاهده', 'وضع السينما للفيديو'], a => { const w = [...a.windows.windows].reverse().find(x => x.ytv); if (w) w.ytv.toggleWatch(); else a.toast('افتح يوتيوب مدار أولاً', 1800); }],
  ['yt_signin', 'المواقع', 'الدخول بحسابك في يوتيوب (Google)', ['سجل الدخول', 'تسجيل الدخول', 'ادخل بحسابي', 'حسابي في يوتيوب'], async a => { try { const G = await import('./google.js'); await G.signIn(); a.toast('✓ دخلت بحساب ' + (G.account() || 'Google'), 2500); a.windows.windows.forEach(w => { w.ytv?.loadLeft(); w.ytv?.loadRight(); }); } catch (e) { a.toast(e.message, 3500); } }],
  ['on_tablet', 'المواقع', 'افتح هذه الصفحة في متصفح التابلت', ['افتح في التابلت', 'في متصفح التابلت', 'على التابلت'], a => { const w = WEB(a); if (!w) return; if (!a.browserOnline?.()) return a.toast('التابلت غير متصل الآن', 2000); a.openBrowser(w.pageUrl || w.url); }],
  ['web_back', 'المواقع', 'الصفحة السابقة في المتصفح', ['الصفحه السابقه في المتصفح', 'رجوع الصفحه', 'ارجع للخلف'], a => WEB(a)?.goBack?.()],
  ['text_bigger', 'المواقع', 'كبّر نص الصفحة', ['كبر الخط', 'كبر النص', 'الخط اكبر'], a => { const w = WEB(a); if (w) { w.zoom = Math.min(1.8, (w.zoom || 1) + 0.15); w.send({ type: 'zoom', value: w.zoom }); } }],
  ['text_smaller', 'المواقع', 'صغّر نص الصفحة', ['صغر الخط', 'صغر النص', 'الخط اصغر'], a => { const w = WEB(a); if (w) { w.zoom = Math.max(0.7, (w.zoom || 1) - 0.15); w.send({ type: 'zoom', value: w.zoom }); } }],
  ['night', 'المواقع', 'الوضع الليلي للصفحة', ['الوضع الليلي', 'ليلي', 'غامق'], a => { const w = WEB(a); if (w) { w.night = !w.night; w.send({ type: 'night', on: w.night }); } }],
  ['summarize', 'المواقع', 'لخّص الصفحة', ['لخص', 'ملخص', 'اختصر'], a => { const w = WEB(a); if (w) a.extras?.summarize(w.url, w.title); else a.toast('افتح صفحة أولاً', 1800); }],
  ['read_page', 'المواقع', 'اقرأ الصفحة في القارئ', ['اقرا في مدار', 'وضع القراءه', 'اقرا الصفحه'], a => { const w = WEB(a); if (w) a.readWeb?.(w.pageUrl || w.url); }],
  ['games', 'المواقع', 'الألعاب', ['العاب', 'الالعاب', 'لعبه'], a => a.openGames?.()],
  // ---- sport
  ['matches', 'الرياضة', 'مباريات اليوم وفرقي', ['المباريات', 'مباريات', 'مباراه اليوم'], a => a.openMatches?.()],
  ['sports_mode', 'الرياضة', 'الوضع الرياضي: البث المباشر + لوحة النتائج، ويبقى عند كل دخول (تشغيل / إيقاف)', ['الوضع الرياضي', 'وضع رياضي', 'وضع الرياضه', 'الرياضي', 'وضع الكوره', 'وضع الكره'], (a, x, t) => { const w = norm(t), off = /(اطفي|اوقف|وقف|الغ|اقفل|اغلق|بدون|سكر)/.test(w), on = /(شغل|فعل|افتح|ابي|ادخل)/.test(w); saveSettings({ sportsMode: off ? false : on ? true : !settings.sportsMode }); a.toast(settings.sportsMode ? '⚽ الوضع الرياضي يعمل' : 'أُوقف الوضع الرياضي', 1800); }],
  ['match_mode', 'الرياضة', 'وضع المباراة: البث + لوحة النتائج', ['وضع المباراه', 'المباراه الكبيره'], a => a.plus?.matchMode()],
  ['island', 'الرياضة', 'جزيرة المباريات (إظهار / إخفاء)', ['الجزيره', 'جزيره المباريات'], a => tog(a, 'island', 'جزيرة المباريات')],
  ['goals_all', 'الرياضة', 'أهداف كل المباريات أو فرقي فقط', ['كل الاهداف', 'اهداف فرقي'], a => tog(a, 'allGoals', 'أهداف كل المباريات', !settings.allGoals)],
  // ---- quran & reading
  ['quran', 'القرآن', 'المصحف', ['المصحف', 'القران'], a => a.openReader('quran')],
  ['surah', 'القرآن', 'سورة بالاسم، وبصوت القارئ الذي تسمّيه («سورة الكوثر بصوت ياسر الدوسري»)', ['سوره', 'اقرا سوره', 'شغل سوره', 'افتح سوره', 'اسمع سوره'], (a, x, t) => { a.openSurah(x); const n = norm(t), rec = RECITERS.find(r => n.includes(norm(r.name)) || norm(r.name).split(' ').some(w => w.length > 3 && (' ' + n + ' ').includes(' ' + w + ' '))); if (rec || /(اقرا|شغل|اسمع|رتل|تلاوه|بصوت|بقراءه)/.test(n)) setTimeout(() => { const r = READER(a); if (!r?.recite) return; if (rec) r.recite.setReciter(rec.id); if (!r.recite.playing) r.togglePlay(); }, 2500); }],
  ['kursi', 'القرآن', 'آية الكرسي', ['ايه الكرسي'], a => { a.openReader('quran'); setTimeout(() => READER(a)?.goToKey?.('2:255'), 1200); }],
  ['recite', 'القرآن', 'شغّل / أوقف التلاوة', ['اقرا', 'التلاوه', 'رتل', 'شغل التلاوه', 'اوقف التلاوه', 'وقف التلاوه'], a => READER(a)?.togglePlay?.()],
  ['page_next', 'القرآن', 'الصفحة التالية', ['الصفحه التاليه', 'التاليه', 'اقلب الصفحه', 'قلب الصفحه', 'الصفحه الجايه'], a => READER(a)?.next?.()],
  ['page_prev', 'القرآن', 'الصفحة السابقة', ['الصفحه السابقه', 'السابقه'], a => READER(a)?.prev?.()],
  ['verse', 'القرآن', 'آية اليوم', ['ايه اليوم'], a => a.extras?.widget('verse')],
  ['shelf', 'القرآن', 'رف الكتب', ['رف الكتب', 'كتبي'], a => a.openShelf()],
  // ---- fitness
  ['coach', 'الرياضة', 'وضع التمارين: المدرب الرياضي', ['وضع التمارين', 'التمارين', 'تمارين', 'تمرين', 'اتمرن', 'المدرب', 'سكوات', 'اسوي رياضه', 'العب رياضه', 'تدريب', 'لياقه', 'ضغط', 'بطن'], a => a.openCoach('train')],
  ['boxing', 'الرياضة', 'الملاكمة', ['ملاكمه', 'الملاكمه', 'بوكس'], a => a.openCoach('box')],
  ['treadmill', 'الرياضة', 'جهاز المشي', ['جهاز المشي', 'تريدميل'], a => a.openCoach('tread')],
  ['eyes', 'الرياضة', 'تمارين العين والرقبة', ['تمارين العين', 'تمارين الرقبه', 'عيني تعبت', 'رقبتي'], a => a.openCoach('eyes')],
  // ---- widgets
  ['clock', 'الأدوات', 'الساعة', ['الساعه', 'ساعه', 'كم الوقت'], a => a.extras?.widget('clock')],
  ['weather', 'الأدوات', 'الطقس', ['الطقس', 'الجو', 'الحراره'], a => a.extras?.widget('weather')],
  ['timer', 'الأدوات', 'مؤقت بالدقائق', ['مؤقت', 'نبهني بعد', 'عداد'], (a, x, t) => { const w = a.windows.open({ kind: 'widget', type: 'timer', data: { mode: 'timer' } }); const n = num(t); if (n && w) w.timerSet(n); }],
  ['stopwatch', 'الأدوات', 'ساعة إيقاف', ['ساعه ايقاف', 'ستوب واتش'], a => a.windows.open({ kind: 'widget', type: 'timer', data: { mode: 'watch' } })],
  ['note', 'الأدوات', 'ملاحظة (بصوتك)', ['ملاحظه', 'دون', 'سجل ملاحظه'], (a, x) => { x = (x || '').replace(/^(لاصقه|جديده)\s*/, '').replace(/^(اكتب|سجل|دون)?\s*(فيها|فيه)?\s*/, '').trim(); const w = a.windows.open({ kind: 'widget', type: 'note', data: { text: x } }); if (!x && w) a.extras?.dictateInto(w); }],
  ['today', 'الأدوات', 'يومك: المباريات والصلاة والتذكيرات', ['يومي', 'جدولي', 'وش عندي اليوم'], a => a.extras?.widget('today')],
  ['photos', 'الأدوات', 'إطار الصور', ['اطار الصور', 'صوري'], a => a.extras?.widget('photos')],
  ['nowplaying', 'الأدوات', 'يُعرض الآن', ['يعرض الان', 'المشغل'], a => a.extras?.widget('nowplaying')],
  ['library', 'الأدوات', 'مكتبتي في DriveCast', ['مكتبتي', 'مكتبه درايف', 'المحفوظات'], a => a.extras?.widget('dcmedia')],
  ['usage', 'الأدوات', 'استخدامك ووقتك', ['استخدامي', 'وقت الاستخدام'], a => a.extras?.widget('usage')],
  // ---- spaces & scenes
  ['save_scene', 'المساحات', 'احفظ ترتيب النوافذ كمشهد', ['احفظ المشهد', 'احفظ الترتيب'], (a, x) => a.extras?.saveScene(x || undefined)],
  ['open_scene', 'المساحات', 'افتح مشهداً محفوظاً', ['افتح المشهد', 'المشاهد'], (a, x) => { if (x) a.extras?.openScene(x); else a.extras?.widget('scenes'); }],
  ['next_space', 'المساحات', 'المساحة التالية (الصباح، العمل، السهرة)', ['المساحه التاليه', 'غير المساحه'], a => a.plus?.nextSpace()],
  ['screenshot', 'المساحات', 'لقطة للمشهد', ['لقطه شاشه', 'لقطه للمشهد', 'لقطه', 'صور المشهد', 'سكرين شوت'], a => a.extras?.shot()],
  ['share_space', 'المساحات', 'شارك مساحتي', ['شارك مساحتي', 'شارك المساحه'], a => a.extras?.shareSpace()],
  // ---- vision & draw
  ['look', 'الذكاء', 'ما هذا الذي أمامي؟ (يرى بالكاميرا)', ['ما هذا', 'شو هذا', 'ماذا امامي', 'اقرا هذا', 'ترجم هذا'], (a, x, t) => a.extras?.lookAndAsk(t)],
  ['draw', 'الذكاء', 'الرسم في الهواء', ['ارسم', 'الرسم'], a => a.extras?.sketch.toggle()],
  ['orb', 'الذكاء', 'كرة المساعد العائمة', ['كره المساعد', 'المساعد العائم'], a => { const on = !settings.orb; saveSettings({ orb: on }); a.extras?.orb.show(on); }],
  // ---- settings
  // ---- more: the air drawing, the spaces of the day, the shared watching
  ['draw_undo', 'الذكاء', 'تراجع عن آخر خط في الرسم', ['تراجع', 'الغ اخر خط'], a => a.extras?.sketch.on && a.extras.sketch.undo()],
  ['draw_color', 'الذكاء', 'غيّر لون الرسم', ['لون', 'غير اللون'], a => a.extras?.sketch.on && a.extras.sketch.color()],
  ['draw_clear', 'الذكاء', 'امسح الرسم', ['امسح الرسم'], a => a.extras?.sketch.clear()],
  ['ai_history', 'الذكاء', 'سجل محادثاتي مع المساعد', ['سجل المساعد', 'محادثاتي'], a => a.extras?.widget('aihist')],
  ['space_morning', 'المساحات', 'مساحة الصباح', ['مساحه الصباح'], a => a.plus?.openSpace({ id: 'morning', name: 'الصباح' })],
  ['space_work', 'المساحات', 'مساحة العمل', ['مساحه العمل'], a => a.plus?.openSpace({ id: 'work', name: 'العمل' })],
  ['space_evening', 'المساحات', 'مساحة السهرة', ['مساحه السهره'], a => a.plus?.openSpace({ id: 'evening', name: 'السهره' })],
  ['save_space', 'المساحات', 'احفظ النوافذ كمساحة هذا الوقت', ['احفظ المساحه', 'احفظ كمساحه'], a => a.plus?.saveSpace()],
  ['lead_watch', 'الفيديو', 'قُد المشاهدة (الكل يتبعك)', ['قد المشاهده'], a => a.together?.leadNow()],
  ['models', 'البيئة', 'المجسمات ثلاثية الأبعاد', ['المجسمات', 'مجسم'], a => a.gallery?.open('models')],
  ['dashboard', 'الأدوات', 'لوحة السيارة من DriveCast', ['لوحه السياره', 'لوحه درايف'], a => a.extras?.widget('dcdash')],
  // ---- the Home View folders
  ['widgets', 'القوائم', 'الأدوات المصغّرة (الساعة، الطقس، المؤقت، الملاحظة، آية اليوم…)', ['الادوات المصغره', 'الاداه المصغره', 'المصغره', 'المصغرات', 'الودجات', 'الويدجت', 'الويدجات', 'ودجت', 'ودجات', 'الادوات الصغيره'], a => folder(a, 'widgets')],
  ['tools', 'القوائم', 'أدوات الإعداد (المعايرة، العدستين، الإيماءات…)', ['ادوات الاعداد', 'الاعدادات', 'اعدادات'], a => folder(a, 'tools')],
  ['screens', 'الأجهزة', 'شاشات أجهزتي (HDMI، التابلت، التي في بوكس)', ['شاشات اجهزتي', 'شاشات الاجهزه'], a => folder(a, 'screens')],
  ['nx_folder', 'القوائم', 'المستوى التالي (لافتة اليوم، الشريط الزجاجي، التوهج…)', ['المستوي التالي', 'الميزات الجديده'], a => folder(a, 'nx')],
  ['dc_folder', 'القوائم', 'مجلد DriveCast (مكتبتي، اللوحة، الريموت)', ['مجلد درايف'], a => folder(a, 'dc')],
  ['apps', 'القوائم', 'التطبيقات (يوتيوب، شاهد، نتفليكس…)', ['التطبيقات', 'تطبيقات'], a => a.launcher?.openApps ? a.launcher.openApps() : a.toggleLauncher()],
  ['verse_w', 'الأدوات', 'آية اليوم', ['ايه اليوم'], a => a.extras?.widget('verse')],
  ['scenes_w', 'المساحات', 'المشاهد المحفوظة', ['المشاهد', 'مشاهدي'], a => a.extras?.widget('scenes')],
  // ---- the next level
  ['sign', 'المستوى التالي', 'لافتة اليوم بخط عربي مجسّم', ['لافته اليوم', 'اللافته'], a => a.nx?.toggleSign()],
  ['dock', 'المستوى التالي', 'الشريط الزجاجي أسفل نظرك', ['الشريط الزجاجي', 'الدوك'], a => a.nx?.toggleDock()],
  ['glow', 'المستوى التالي', 'التوهّج الزجاجي والإطار السينمائي', ['التوهج', 'توهج'], a => a.nx?.toggleGlow()],
  ['real_room', 'المستوى التالي', 'غرفة حقيقية ثلاثية الأبعاد حولك', ['غرفه حقيقيه', 'مكان حقيقي'], a => a.nx?.splat ? a.nx.closeSplat() : a.nx?.sampleSplat()],
  ['physics', 'المستوى التالي', 'رمي النوافذ', ['رمي النوافذ', 'الرمي'], a => a.nx?.togglePhysics()],
  ['gestures', 'المستوى التالي', 'الإيماءات بدون لمس 👍 ✌️ ✋', ['الايماءات', 'ايماءات'], a => a.nx?.toggleGestures()],
  ['gesture_guide', 'القوائم', 'دليل الإيماءات (كيف أتحكم)', ['دليل الايماءات', 'كيف اتحكم', 'كيف استخدم'], a => a.windows.open({ kind: 'panel', panel: a.controls?.pad?.id ? 'pad' : 'guide' })],
  // ---- iPhone and the room
  ['iphone_photos', 'الأجهزة', 'صور وفيديوهات الآيفون', ['صور الايفون', 'معرض الصور', 'الاستوديو'], a => window.MadarIOS?.send('pickMedia', { spatial: false })],
  ['spatial_video', 'الأجهزة', 'فيديو مكاني صوّرته بالآيفون', ['فيديو مكاني', 'الفيديو المكاني'], a => window.MadarIOS?.send('pickMedia', { spatial: true })],
  ['new_room', 'البيئة', 'غرفة جديدة: انسَ مكان النوافذ', ['غرفه جديده', 'ابدا من جديد'], a => window.MadarIOS?.send('resetWorld', { forget: true })],
  ['update', 'الإعدادات', 'تحديث التطبيق', ['حدث التطبيق', 'تحديث التطبيق', 'تحديث مدار'], a => window.MadarIOS?.send('update')],
  ['lens', 'الإعدادات', 'ضبط العدستين', ['ضبط العدستين', 'العدسات'], a => a.lensAdjust?.open()],
  ['headset', 'الإعدادات', 'نظارة جديدة (معالج)', ['نظاره جديده'], a => a.plus?.headsetWizard()],
  ['learn_remote', 'الإعدادات', 'تعلّم أزرار الريموت', ['تعلم ازرار الريموت', 'علم الريموت', 'ازرار الريموت'], a => a.remote?.startLearn()],
  ['reset_pos', 'النوافذ', 'ارجع لمكاني (إلغاء التحرك)', ['مكاني', 'ارجع لمكاني'], a => a.controls?.reset()],
  ['walk', 'الإعدادات', 'المشي (التحرك بخطواتك)', ['المشي', 'وضع المشي'], a => a.toggleWalk?.()],
  ['eye_track', 'الإعدادات', 'تتبع العين', ['تتبع العين'], a => a.toggleEyeTrack?.()],
  ['lite', 'الإعدادات', 'الوضع الخفيف (توفير البطارية)', ['الوضع الخفيف', 'وفر البطاريه', 'البطاريه'], a => tog(a, 'lite', 'الوضع الخفيف', !settings.lite)],
  ['prayers_bar', 'الإعدادات', 'شريط الصلوات', ['شريط الصلوات', 'الصلوات', 'مواقيت الصلاه'], a => tog(a, 'prayerBar', 'شريط الصلوات')],
  ['look_scroll', 'الإعدادات', 'التمرير بالنظر', ['التمرير بالنظر'], a => tog(a, 'lookScroll', 'التمرير بالنظر')],
  ['spatial_audio', 'الإعدادات', 'الصوت المكاني', ['الصوت المكاني'], a => tog(a, 'spatialAudio', 'الصوت المكاني')],
  ['finger_mouse', 'الإعدادات', 'الإصبع فأرة', ['الاصبع فاره', 'الماوس بالاصبع'], a => tog(a, 'handDwell', 'الإصبع فأرة', !settings.handDwell)],
  ['stabilizer', 'الإعدادات', 'المثبّت (يثبّت الصورة)', ['المثبت', 'ثبت الصوره'], a => tog(a, 'stabilizer', 'المثبّت', !settings.stabilizer)],
  ['mic_together', 'الفيديو', 'المايكروفون في «شاهد معاً»', ['المايكروفون', 'المايك'], a => a.together?.toggleMic()],
  ['sounds', 'الإعدادات', 'أصوات النقر', ['الاصوات', 'اصوات النقر'], a => tog(a, 'sounds', 'الأصوات')],
  ['cool', 'الإعدادات', 'تبريد الآيفون', ['التبريد', 'الجهاز حار', 'برد الجهاز'], a => { tog(a, 'coolMax', 'التبريد الأقصى', !settings.coolMax); a.renderer.resize(); }],
  ['gaze', 'الإعدادات', 'النقر بالنظر', ['النقر بالنظر', 'النظر'], a => tog(a, 'dwell', 'النقر بالنظر', !settings.dwell)],
  ['hands', 'الإعدادات', 'تتبع اليد', ['تتبع اليد', 'اليد', 'الايدي'], a => tog(a, 'handsEnabled', 'تتبع اليد', !settings.handsEnabled)],
  ['smart_open', 'القوائم', 'افتح الشريط الذكي (الدائرة الصغيرة تتمدّد إلى الشريط)', ['افتح الشريط', 'وسع الشريط', 'الشريط الذكي افتح', 'افتح الدائره'], a => a.smartBar?.expand()],
  ['smart_fold', 'القوائم', 'اطوِ الشريط الذكي إلى دائرة', ['اطوي الشريط', 'صغر الشريط', 'اغلق الشريط'], a => a.smartBar?.fold()],
  ['smart_bar', 'الإعدادات', 'الشريط الذكي (إظهار / إخفاء)', ['الشريط الذكي', 'الشريط'], a => tog(a, 'smartBar', 'الشريط الذكي')],
  ['clock_hud', 'الإعدادات', 'الساعة أعلى النظر', ['الساعه فوق', 'ساعه النظر'], a => tog(a, 'clock', 'الساعة')],
];

// ---------------------------------------------------------------- matching
const LIST = COMMANDS.map(([id, group, desc, says, run]) => ({ id, group, desc, says: says.map(norm), run }));
export const byId = id => LIST.find(c => c.id === id);
// the best command for these words: a known phrase inside the sentence wins (the longest one); else most shared words
const WEAK = new Set(['play', 'pause', 'home', 'search_none']);
// «وافتح» «فالساعه» «الساعه/ساعه» «للتلفاز»: the same word
export const stemW = w => w.replace(/^[وف](?=\S{3,})/, '').replace(/^(ال|لل)(?=\S{2,})/, '');
export const stem = s => s.split(' ').map(stemW).join(' ');
export function match(text) {
  const t = norm(text), words = new Set(t.split(' '));
  // the stemmed sentence, and where each stemmed word starts in the original
  const W = t.split(' '), map2 = {}; let T2 = '', o = 0;
  W.forEach((w, k) => { map2[T2.length + (k ? 1 : 0)] = k; T2 += (k ? ' ' : '') + stemW(w); });
  const starts = W.map((w, k) => W.slice(0, k).join(' ').length + (k ? 1 : 0));
  let best = null;
  for (const c of LIST) for (const s of c.says) {
    let score = 0;
    let i = (' ' + t).indexOf(' ' + s), loose = false;
    if (i < 0) { const j = (' ' + T2).indexOf(' ' + stem(s)); if (j >= 0 && map2[j] != null) { loose = map2[j]; i = starts[loose]; } }
    if (i >= 0) {
      score = 1 + s.length / 40 - i / 400 + (i === 0 ? 0.1 : 0) - (loose !== false ? 0.03 : 0);
      if (WEAK.has(c.id) && t.slice(i + s.length).trim().split(' ').length > 1) score = 0.5;   // «شغل سورة…» is not «play»
      if (c.id === 'surah' && t.slice(i + s.length).trim()) score += 0.4;   // «… سورة الكهف»: the surah's name decides
      if (c.id === 'youtube' && t.replace(s, '').trim().split(' ').length > 1) score = 3;     // «… في اليوتيوب»: a YouTube request, all of it
    } else { const sw = s.split(' '); const hit = sw.filter(w => words.has(w) || [...words].some(x => x.length > 3 && (x.startsWith(w) || w.startsWith(x)))).length; score = sw.length > 1 ? hit / sw.length * 0.8 : 0; }
    if (score > (best?.score || 0)) best = { cmd: c, score, arg: i < 0 ? '' : loose !== false ? W.slice(loose + s.split(' ').length).join(' ') : t.slice(i + s.length).trim() };
    if (c.id === 'youtube' && score === 3) best.arg = t;
  }
  // «خلّي القائمة الترا وايد» / «رجّع النافذة عادي»: a size said with a thing to apply it to is a size command
  if ((/(الترا|اولترا|عريض|وايد سكرين|ultra)/.test(t) || (/(عادي|عاديه|طبيعي)/.test(t) && /(القايمه|النافذه|النوافذ|المقاس|الشاشه|رجع|رجعها|خليها)/.test(t))) && (!best || best.score < 2)) best = { cmd: byId('size_mode'), score: 1.6, arg: t };
  return best;
}
// «افتح يوتيوب ثم كبّره وقرّبه»: split at «ثم / و / بعدين»; a piece that is not a command of its own belongs to the
// one before it («… في اليوتيوب والأجمل الأطول» stays one YouTube request). null = not all known → the assistant.
export function plan(text) {
  const parts = norm(text).split(/\s+(?:ثم|وبعدين|بعدين|بعدها|وبعد ذلك|و)\s+|\s+و(?!ضع|قف|طي|سط|ين|ايد)(?=\S{3,})/).map(x => x.trim()).filter(Boolean);
  const steps = [];
  for (const p of parts) {
    const m = match(p);
    if (m && m.cmd.id === 'recite' && steps.at(-1)?.cmd.id === 'surah') { steps.at(-1).text += ' واقرا'; continue; }   // «سورة الكهف واقرأ»
    if (m && m.cmd.id === 'search' && steps.at(-1)?.cmd.id === 'youtube') { steps.at(-1).text = 'يوتيوب ' + m.arg; continue; }   // «افتح يوتيوب وابحث عن…»
    if (m && m.score >= 1 && !(steps.length && steps.at(-1).cmd.id === 'youtube' && m.cmd.id !== 'youtube' && m.score < 1.1 && !/^(كبر|صغر|قرب|ابعد|اغلق|سكر|ثبت)/.test(p))) steps.push({ ...m, text: p });
    else if (steps.length) { const l = steps.at(-1); l.text += ' و ' + p; l.arg = (l.arg + ' ' + p).trim(); }
    // else: talk before the request («انا تعبان اليوم و…») is left out
  }
  return steps.length ? steps : null;
}
// several things in one sentence, or a question: the assistant plans it
export const needsBrain = t => / (ثم|وبعدين|بعدها|وبعد) /.test(' ' + norm(t) + ' ') || /^(متي|كم|من |هل|ماذا|ليش|لماذا|كيف|اين|وين|شو |ايش)/.test(norm(t)) || (norm(t).split(' ').length > 6 && / و/.test(norm(t)));
// the list the assistant receives: id · group · what it does
export const catalog = () => LIST.map(c => `${c.id} · ${c.desc}`).join('\n');
export async function run(app, id, arg = '', text = '') { const c = byId(id); if (!c) return false; try { await c.run(app, arg, text || arg); } catch (e) { console.warn('cmd', id, e); } return true; }
// the steps in order; a window a step opens is the one the next steps act on («افتح يوتيوب ثم كبّره»)
export async function runPlan(app, steps) {
  for (const st of steps) {
    const before = app.windows.windows.length;
    await run(app, st.cmd?.id || st.id, st.arg || '', st.text || st.arg || '');
    await new Promise(r => setTimeout(r, 450));
    if (app.windows.windows.length > before) app._chainWin = app.windows.windows.at(-1);
  }
  app._chainWin = null;
}
// what is on screen now, for the assistant
export function context(app) {
  const ws = app.windows.windows.map(w => `${w.kind}${w.title || w.name ? ' «' + String(w.title || w.name).slice(0, 40) + '»' : ''}${w.video ? (w.video.paused ? ' متوقف' : ' يعمل') : ''}${w === app.controls?.pointedWindow?.() ? ' (ينظر إليها)' : ''}`);
  return `مدار الآن: البيئة ${ENVS[envKey(settings.environment)]?.label || settings.environment} · الانغماس ${Math.round((app.extras?.portal?.level ?? 1) * 100)}% · النوافذ: ${ws.join('، ') || 'لا شيء'} · التبريد ${settings.coolMax ? 'أقصى' : 'عادي'}`;
}
