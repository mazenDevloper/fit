// «مساعد مدار» - every command Madar understands, in one list: what it does, how people say it, and the code that
// does it. The spoken text is first matched here on the phone (instant, works offline, any wording that contains a
// known phrase); anything else - a new wording, a question, several steps at once («افتح يوتيوب وكبّره») - goes to
// the assistant on the server WITH this whole list and what is on screen now, and it answers with the commands to run.
import { settings, saveSettings, pairedDevices } from './config.js';
import { ENVS, ENV_ORDER, envKey } from './envs.js';

// ---------------------------------------------------------------- Arabic, the way people speak it
export function norm(s) {
  return String(s || '').replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[؟?!،,]|\.(?=\s|$)/g, ' ')
    .replace(/^(يا )?مدار\s*/, '').replace(/(^|\s)(لو سمحت|من فضلك|ممكن|رجاء|ابي|ابغى|ابغي|اريد|بدي|ودي|خلني|خليني|يا مدار)(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
const WORDS = { 'دقيقه': 1, 'دقيقتين': 2, 'ثلاث': 3, 'خمس': 5, 'عشر': 10, 'ربع': 15, 'عشرين': 20, 'نص': 30, 'نصف': 30, 'ثلاثين': 30, 'ساعه': 60, 'نص ساعه': 30, 'ربع ساعه': 15 };
const num = t => { const n = norm(t), m = n.match(/\d+/); if (m) return +m[0]; const w = Object.keys(WORDS).sort((a, b) => b.length - a.length).find(k => (' ' + n + ' ').includes(' ' + k + ' ')); return w ? WORDS[w] : null; };

// ---------------------------------------------------------------- helpers over the app
const P = a => a.controls?.pointedWindow?.() || [...a.windows.windows].reverse().find(w => w.kind !== 'keyboard') || null;
const V = a => { const l = a.extras?.mediaWindows?.() || []; const p = a.controls?.pointedWindow?.(); return (p && l.includes(p) ? p : null) || l.find(w => w.video && !w.video.paused) || l[0] || null; };
const WEB = a => [a.controls?.pointedWindow?.(), ...[...a.windows.windows].reverse()].find(w => w?.kind === 'web') || null;
const READER = a => a.windows.windows.find(w => w.kind === 'reader');
const web = (a, url, title) => a.windows.open({ kind: 'web', url, title });
const tog = (a, key, label, on = settings[key] === false) => { saveSettings({ [key]: on }); a.toast((on ? '✓ ' : '✕ ') + label, 1500); a.control?.redraw(); };
const vol = (a, d, mute) => { const w = V(a); if (!w?.setVolume) return a.toast('لا شيء يعمل', 1500); if (mute != null) w.setVolume(w.vol ?? 1, mute); else w.stepVolume(d); };
const seek = (a, s) => { const v = V(a)?.video; if (v && isFinite(v.duration)) v.currentTime = Math.max(0, Math.min(v.duration - 0.5, v.currentTime + s)); };
const play = (a, on) => { const w = V(a); if (!w?.video) return; if (on) { w.userPaused = false; w.video.play().catch(() => {}); } else { w.userPaused = true; w.video.pause(); } };
const env = (a, k) => { saveSettings({ environment: k }); a.renderEnvChoices?.(); a.toast('البيئة: ' + (ENVS[k]?.label || k), 1500); };
const devByWord = t => { const d = pairedDevices(), n = norm(t); return d.find(x => n.includes(norm(x.name))) || d.find(x => (/تابلت/.test(n) && x.kind === 'tablet') || (/(تلفاز|تلفزيون)/.test(n) && x.kind === 'tv') || (/(لابتوب|كمبيوتر)/.test(n) && x.kind === 'computer')); };

// ---------------------------------------------------------------- the list: [id, group, what it does, how people say it, run]
// «arg»: the words after the phrase (a name, a number, a text)
export const COMMANDS = [
  // ---- windows
  ['close', 'النوافذ', 'أغلق النافذة التي تنظر إليها', ['اغلق النافذه', 'اغلق هذا', 'سكر', 'سكرها', 'اقفل النافذه', 'اغلقها'], a => { const w = P(a); if (w) a.windows.close(w); }],
  ['close_all', 'النوافذ', 'أغلق كل النوافذ', ['اغلق الكل', 'سكر الكل', 'اغلق كل النوافذ', 'نظف المكان'], a => a.windows.closeAll()],
  ['bigger', 'النوافذ', 'كبّر النافذة', ['كبر', 'كبرها', 'اكبر', 'تكبير'], a => P(a)?.scaleBy?.(1.25)],
  ['smaller', 'النوافذ', 'صغّر النافذة', ['صغر', 'صغرها', 'اصغر', 'تصغير'], a => P(a)?.scaleBy?.(1 / 1.25)],
  ['closer', 'النوافذ', 'قرّب النافذة', ['قربها', 'قرب النافذه', 'اقرب'], a => { const w = P(a); if (w) { w.group.position.multiplyScalar(0.8); w.updateRadius?.(); a.windows.changed(); } }],
  ['farther', 'النوافذ', 'أبعد النافذة', ['بعدها', 'ابعد النافذه', 'ابعدها'], a => { const w = P(a); if (w) { w.group.position.multiplyScalar(1.25); w.updateRadius?.(); a.windows.changed(); } }],
  ['pin', 'النوافذ', 'ثبّت النافذة أمام عينيك (تتبع رأسك)', ['ثبت', 'ثبتها', 'تثبيت', 'خليها معي', 'تتبعني'], a => { const w = P(a); if (w) { w.headLock = !w.headLock; a.toast(w.headLock ? 'النافذة تتبع رأسك' : 'النافذة ثابتة في الغرفة', 1800); } }],
  ['arrange', 'النوافذ', 'رتّب النوافذ حولك', ['رتب', 'رتب النوافذ', 'ترتيب'], a => a.windows.arrange()],
  ['recenter', 'النوافذ', 'أعد التمركز أمامك', ['تمركز', 'اعد التمركز', 'امامي', 'المنتصف', 'رجعها قدامي'], a => a.recenter()],
  ['curve', 'النوافذ', 'اجعل النافذة منحنية / مسطحة', ['منحني', 'منحنيه', 'اجعلها منحنيه', 'مسطحه', 'مسطح'], (a, x, t) => { const w = P(a); w?.setCurved?.(!/مسطح/.test(norm(t))); }],
  ['view360', 'النوافذ', 'اعرض الصفحة أو الفيديو 360 حولك', ['360', 'حولي', 'كروي'], a => { const w = P(a); w?.view360?.(w.proj !== '360'); }],
  ['size_mode', 'النوافذ', 'غيّر المقاس: عادي، عريض، عريض جداً', ['المقاس', 'عريض', 'عريض جدا', 'الترا وايد', 'سينمائي'], a => P(a)?.cycleSize?.()],
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
  ['hdmi', 'الأجهزة', 'اعرض شاشة التابلت / HDMI', ['hdmi', 'اتش دي ام اي', 'الرسيفر', 'القطعه', 'شاشه التابلت', 'اعرض التابلت'], (a, x, t) => { const d = devByWord(t) || pairedDevices().find(x => x.kind === 'tablet') || pairedDevices()[0]; if (d) a.connectMirror(d.code); else a.launcher?.open(); }],
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
  ['env_named', 'البيئة', 'بيئة بالاسم (المكتبة، صالة النيون، المشتري…)', ['بيئه', 'خذني الى', 'انقلني الى', 'روح'], (a, x, t) => { const n = norm(t); const k = ENV_ORDER.find(k => ENVS[k]?.label && n.includes(norm(ENVS[k].label))); if (k) env(a, k); else a.gallery?.open('rooms'); }],
  ['env_library', 'البيئة', 'مكتبة البيئات والغرف', ['مكتبه البيئات', 'المكتبات', 'البيئات', 'الغرف'], a => a.gallery?.open('rooms')],
  ['immersion', 'البيئة', 'الانغماس (نسبة مئوية أو زد/قلل)', ['الانغماس', 'انغماس'], (a, x, t) => { const p = a.extras?.portal, n = num(t), w = norm(t); if (!p) return; p.set(n != null ? n / 100 : /(زد|كامل|اكثر)/.test(w) ? Math.min(1, (p.level || 0) + 0.25) : /(قلل|خفف|اقل)/.test(w) ? Math.max(0, (p.level || 0) - 0.25) : 0.5); }],
  ['glass', 'البيئة', 'شفافية الزجاج (أكثر / أقل)', ['الزجاج', 'شفافيه'], (a, x, t) => { a.smartBar?.select?.('glass'); a.smartBar?.step?.(/(اقل|شفاف|خفف)/.test(norm(t)) ? -2 : 2); }],
  ['sharpness', 'البيئة', 'الحدة (أكثر / أقل)', ['الحده', 'اوضح', 'حده'], (a, x, t) => { const d = /(اقل|خفف|نعم)/.test(norm(t)) ? -0.1 : 0.1; saveSettings({ sharpen: Math.max(0, Math.min(1.5, settings.sharpen + d)) }); a.renderer.applySettings(); a.toast('الحدة ' + Math.round(settings.sharpen * 100) + '%', 1500); }],
  ['scan_room', 'البيئة', 'تعرّف على الغرفة (مسح)', ['امسح الغرفه', 'مسح الغرفه', 'تعرف على الغرفه'], a => a.room?.scan()],
  ['makkah', 'البيئة', 'مكة المكرمة مباشر', ['مكه', 'الحرم', 'الكعبه'], a => a.openMakkah?.()],
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
  ['youtube', 'المواقع', 'يوتيوب (أو ابحث فيه)', ['يوتيوب', 'اليوتيوب'], (a, x) => web(a, x ? 'https://m.youtube.com/results?search_query=' + encodeURIComponent(x) : 'https://m.youtube.com', 'YouTube')],
  ['shahid', 'المواقع', 'شاهد', ['شاهد نت', 'منصه شاهد', 'افتح شاهد'], a => web(a, 'https://shahid.mbc.net', 'شاهد')],
  ['netflix', 'المواقع', 'نتفلكس', ['نتفلكس', 'نتفليكس'], a => web(a, 'https://www.netflix.com', 'Netflix')],
  ['open_site', 'المواقع', 'افتح موقعاً بالاسم أو الرابط', ['افتح موقع', 'روح لموقع', 'ادخل موقع'], (a, x) => { if (!x) return; const u = /^https?:/.test(x) ? x : /\./.test(x) ? 'https://' + x.replace(/\s/g, '') : 'https://www.google.com/search?btnI=1&q=' + encodeURIComponent(x); web(a, u, x); }],
  ['drivecast', 'المواقع', 'DriveCast في مدار', ['درايف كاست', 'سي بلاي', 'كبلاي'], a => a.openCplay()],
  ['web_back', 'المواقع', 'الصفحة السابقة في المتصفح', ['الصفحه السابقه في المتصفح', 'رجوع الصفحه', 'ارجع للخلف'], a => WEB(a)?.goBack?.()],
  ['text_bigger', 'المواقع', 'كبّر نص الصفحة', ['كبر الخط', 'كبر النص', 'الخط اكبر'], a => { const w = WEB(a); if (w) { w.zoom = Math.min(1.8, (w.zoom || 1) + 0.15); w.send({ type: 'zoom', value: w.zoom }); } }],
  ['text_smaller', 'المواقع', 'صغّر نص الصفحة', ['صغر الخط', 'صغر النص', 'الخط اصغر'], a => { const w = WEB(a); if (w) { w.zoom = Math.max(0.7, (w.zoom || 1) - 0.15); w.send({ type: 'zoom', value: w.zoom }); } }],
  ['night', 'المواقع', 'الوضع الليلي للصفحة', ['الوضع الليلي', 'ليلي', 'غامق'], a => { const w = WEB(a); if (w) { w.night = !w.night; w.send({ type: 'night', on: w.night }); } }],
  ['summarize', 'المواقع', 'لخّص الصفحة', ['لخص', 'ملخص', 'اختصر'], a => { const w = WEB(a); if (w) a.extras?.summarize(w.url, w.title); else a.toast('افتح صفحة أولاً', 1800); }],
  ['read_page', 'المواقع', 'اقرأ الصفحة في القارئ', ['اقرا في مدار', 'وضع القراءه', 'اقرا الصفحه'], a => { const w = WEB(a); if (w) a.readWeb?.(w.pageUrl || w.url); }],
  ['games', 'المواقع', 'الألعاب', ['العاب', 'الالعاب', 'لعبه'], a => a.openGames?.()],
  // ---- sport
  ['matches', 'الرياضة', 'مباريات اليوم وفرقي', ['المباريات', 'مباريات', 'مباراه اليوم'], a => a.openMatches?.()],
  ['match_mode', 'الرياضة', 'وضع المباراة: البث + لوحة النتائج', ['وضع المباراه', 'المباراه الكبيره'], a => a.plus?.matchMode()],
  ['island', 'الرياضة', 'جزيرة المباريات (إظهار / إخفاء)', ['الجزيره', 'جزيره المباريات'], a => tog(a, 'island', 'جزيرة المباريات')],
  ['goals_all', 'الرياضة', 'أهداف كل المباريات أو فرقي فقط', ['كل الاهداف', 'اهداف فرقي'], a => tog(a, 'allGoals', 'أهداف كل المباريات', !settings.allGoals)],
  // ---- quran & reading
  ['quran', 'القرآن', 'المصحف', ['المصحف', 'القران'], a => a.openReader('quran')],
  ['surah', 'القرآن', 'سورة بالاسم', ['سوره'], (a, x) => a.openSurah(x)],
  ['kursi', 'القرآن', 'آية الكرسي', ['ايه الكرسي'], a => { a.openReader('quran'); setTimeout(() => READER(a)?.goToKey?.('2:255'), 1200); }],
  ['recite', 'القرآن', 'شغّل / أوقف التلاوة', ['اقرا', 'التلاوه', 'رتل'], a => READER(a)?.togglePlay?.()],
  ['page_next', 'القرآن', 'الصفحة التالية', ['الصفحه التاليه', 'التاليه', 'اقلب الصفحه'], a => READER(a)?.next?.()],
  ['page_prev', 'القرآن', 'الصفحة السابقة', ['الصفحه السابقه', 'السابقه'], a => READER(a)?.prev?.()],
  ['verse', 'القرآن', 'آية اليوم', ['ايه اليوم'], a => a.extras?.widget('verse')],
  ['shelf', 'القرآن', 'رف الكتب', ['رف الكتب', 'كتبي'], a => a.openShelf()],
  // ---- fitness
  ['coach', 'الرياضة', 'المدرب الرياضي', ['تمرين', 'المدرب', 'سكوات', 'رياضه'], a => a.openCoach('train')],
  ['boxing', 'الرياضة', 'الملاكمة', ['ملاكمه', 'الملاكمه', 'بوكس'], a => a.openCoach('box')],
  ['treadmill', 'الرياضة', 'جهاز المشي', ['جهاز المشي', 'تريدميل'], a => a.openCoach('tread')],
  ['eyes', 'الرياضة', 'تمارين العين والرقبة', ['تمارين العين', 'تمارين الرقبه', 'عيني تعبت', 'رقبتي'], a => a.openCoach('eyes')],
  // ---- widgets
  ['clock', 'الأدوات', 'الساعة', ['الساعه', 'ساعه', 'كم الوقت'], a => a.extras?.widget('clock')],
  ['weather', 'الأدوات', 'الطقس', ['الطقس', 'الجو', 'الحراره'], a => a.extras?.widget('weather')],
  ['timer', 'الأدوات', 'مؤقت بالدقائق', ['مؤقت', 'نبهني بعد', 'عداد'], (a, x, t) => { const w = a.windows.open({ kind: 'widget', type: 'timer', data: { mode: 'timer' } }); const n = num(t); if (n && w) w.timerSet(n); }],
  ['stopwatch', 'الأدوات', 'ساعة إيقاف', ['ساعه ايقاف', 'ستوب واتش'], a => a.windows.open({ kind: 'widget', type: 'timer', data: { mode: 'watch' } })],
  ['note', 'الأدوات', 'ملاحظة (بصوتك)', ['ملاحظه', 'دون', 'سجل ملاحظه'], (a, x) => { const w = a.windows.open({ kind: 'widget', type: 'note', data: { text: x || '' } }); if (!x && w) a.extras?.dictateInto(w); }],
  ['today', 'الأدوات', 'يومك: المباريات والصلاة والتذكيرات', ['يومي', 'جدولي', 'وش عندي اليوم'], a => a.extras?.widget('today')],
  ['photos', 'الأدوات', 'إطار الصور', ['اطار الصور', 'صوري'], a => a.extras?.widget('photos')],
  ['nowplaying', 'الأدوات', 'يُعرض الآن', ['يعرض الان', 'المشغل'], a => a.extras?.widget('nowplaying')],
  ['library', 'الأدوات', 'مكتبتي في DriveCast', ['مكتبتي', 'مكتبه درايف', 'المحفوظات'], a => a.extras?.widget('dcmedia')],
  ['usage', 'الأدوات', 'استخدامك ووقتك', ['استخدامي', 'وقت الاستخدام'], a => a.extras?.widget('usage')],
  // ---- spaces & scenes
  ['save_scene', 'المساحات', 'احفظ ترتيب النوافذ كمشهد', ['احفظ المشهد', 'احفظ الترتيب'], (a, x) => a.extras?.saveScene(x || undefined)],
  ['open_scene', 'المساحات', 'افتح مشهداً محفوظاً', ['افتح المشهد', 'المشاهد'], (a, x) => { if (x) a.extras?.openScene(x); else a.extras?.widget('scenes'); }],
  ['next_space', 'المساحات', 'المساحة التالية (الصباح، العمل، السهرة)', ['المساحه التاليه', 'غير المساحه'], a => a.plus?.nextSpace()],
  ['screenshot', 'المساحات', 'لقطة للمشهد', ['لقطه شاشه', 'صور المشهد', 'سكرين شوت'], a => a.extras?.shot()],
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
  ['sounds', 'الإعدادات', 'أصوات النقر', ['الاصوات', 'اصوات النقر'], a => tog(a, 'sounds', 'الأصوات')],
  ['cool', 'الإعدادات', 'تبريد الآيفون', ['التبريد', 'الجهاز حار', 'برد الجهاز'], a => { tog(a, 'coolMax', 'التبريد الأقصى', !settings.coolMax); a.renderer.resize(); }],
  ['gaze', 'الإعدادات', 'النقر بالنظر', ['النقر بالنظر', 'النظر'], a => tog(a, 'dwell', 'النقر بالنظر', !settings.dwell)],
  ['hands', 'الإعدادات', 'تتبع اليد', ['تتبع اليد', 'اليد', 'الايدي'], a => tog(a, 'handsEnabled', 'تتبع اليد', !settings.handsEnabled)],
  ['smart_bar', 'الإعدادات', 'الشريط الذكي (إظهار / إخفاء)', ['الشريط الذكي', 'الشريط'], a => tog(a, 'smartBar', 'الشريط الذكي')],
  ['clock_hud', 'الإعدادات', 'الساعة أعلى النظر', ['الساعه فوق', 'ساعه النظر'], a => tog(a, 'clock', 'الساعة')],
];

// ---------------------------------------------------------------- matching
const LIST = COMMANDS.map(([id, group, desc, says, run]) => ({ id, group, desc, says: says.map(norm), run }));
export const byId = id => LIST.find(c => c.id === id);
// the best command for these words: a known phrase inside the sentence wins (the longest one); else most shared words
export function match(text) {
  const t = norm(text), words = new Set(t.split(' '));
  let best = null;
  for (const c of LIST) for (const s of c.says) {
    let score = 0;
    const i = (' ' + t + ' ').indexOf(' ' + s) >= 0 ? t.indexOf(s) : -1;
    if (i >= 0) score = 1 + s.length / 40 - i / 40;
    else { const sw = s.split(' '); const hit = sw.filter(w => words.has(w) || [...words].some(x => x.length > 3 && (x.startsWith(w) || w.startsWith(x)))).length; score = sw.length > 1 ? hit / sw.length * 0.8 : 0; }
    if (score > (best?.score || 0)) best = { cmd: c, score, arg: i >= 0 ? t.slice(i + s.length).trim() : '' };
  }
  return best;
}
// several things in one sentence, or a question: the assistant plans it
export const needsBrain = t => / (ثم|وبعدين|بعدها|وبعد) /.test(' ' + norm(t) + ' ') || /^(متي|كم|من |هل|ماذا|ليش|لماذا|كيف|اين|وين|شو |ايش)/.test(norm(t)) || (norm(t).split(' ').length > 6 && / و/.test(norm(t)));
// the list the assistant receives: id · group · what it does
export const catalog = () => LIST.map(c => `${c.id} · ${c.desc}`).join('\n');
export function run(app, id, arg = '', text = '') { const c = byId(id); if (!c) return false; try { c.run(app, arg, text || arg); } catch (e) { console.warn('cmd', id, e); } return true; }
// what is on screen now, for the assistant
export function context(app) {
  const ws = app.windows.windows.map(w => `${w.kind}${w.title || w.name ? ' «' + String(w.title || w.name).slice(0, 40) + '»' : ''}${w.video ? (w.video.paused ? ' متوقف' : ' يعمل') : ''}${w === app.controls?.pointedWindow?.() ? ' (ينظر إليها)' : ''}`);
  return `مدار الآن: البيئة ${ENVS[envKey(settings.environment)]?.label || settings.environment} · الانغماس ${Math.round((app.extras?.portal?.level ?? 1) * 100)}% · النوافذ: ${ws.join('، ') || 'لا شيء'} · التبريد ${settings.coolMax ? 'أقصى' : 'عادي'}`;
}
