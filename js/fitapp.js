// «مدار 2D» fitness apps:
//  - «التمارين»: the anatomical coach in a flat app - the real muscles perform the exercise, a big counter, the
//    goals (تضخيم / تنشيف / حرق) and body areas, rest timers, an Arabic voice, and reps from the front camera.
//  - «جسمي»: body composition - read a screenshot of your scale app (Eufy…), keep the history, see the trends,
//    and a plan that follows from the numbers (which programme, protein, calories), plus your workouts.
import * as THREE from 'three';
import { settings, saveSettings } from './config.js';
import { Figure, poseAt, exerciseById, EXERCISES, withGoal, GOALS, GROUPS, MUSCLE_AR, say, sayNumber, drawMuscleMap } from './coach.js';
import { PoseCam, CAM } from './posecam.js';
import { hubOp } from './hub.js';

const arNum = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
const W8 = 'https://studio.c-p.workers.dev';
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const logWorkout = d => { try { const a = JSON.parse(localStorage.getItem('madar.workouts.v1') || '[]'); a.push({ ...d, at: Date.now() }); localStorage.setItem('madar.workouts.v1', JSON.stringify(a.slice(-400))); } catch {} hubOp({ op: 'push', key: 'workouts', item: { ex: d.ex, reps: d.reps, minutes: d.minutes, kcal: d.kcal }, max: 100 }); };

const CSS = `
.fa{position:absolute;inset:0;display:flex;flex-direction:column;background:radial-gradient(120% 80% at 50% 0%,#1d2333,#0b0d12);color:#eef2fb;font-family:var(--font);overflow:hidden}
.fa .stage{position:relative;flex:1;min-height:0}
.fa canvas.fig{position:absolute;inset:0;width:100%;height:100%}
.fa .hud{position:absolute;inset:8px 10px auto 10px;display:flex;justify-content:space-between;gap:8px;pointer-events:none}
.fa .hud .t{font-weight:900;font-size:clamp(15px,2.6vw,22px)}
.fa .hud .m{font-size:12px;color:#ffb27a;margin-top:2px}
.fa .cnt{position:absolute;inset:auto 10px 8px auto;text-align:center;pointer-events:none}
.fa .cnt b{display:block;font-size:clamp(40px,9vw,84px);line-height:1;color:#fff1e6;text-shadow:0 0 18px rgba(255,120,50,.6)}
.fa .cnt span{font-size:12px;color:#9aa3b8}
.fa .tip{position:absolute;inset:auto auto 10px 10px;max-width:55%;font-size:13px;color:#9fe7c0;font-weight:700;pointer-events:none}
.fa canvas.map{position:absolute;inset:auto;top:56px;left:8px;width:min(34%,170px);height:auto;aspect-ratio:1/1;background:transparent;pointer-events:auto}
.fa canvas.fig{background:transparent}
.fa .ctl{flex:none;display:flex;gap:6px;padding:8px;background:#121621;border-top:1px solid rgba(255,255,255,.08);overflow-x:auto}
.fa .ctl button,.fh button,.fsheet button{border:0;border-radius:12px;padding:9px 12px;background:rgba(255,255,255,.08);color:#eef2fb;font:800 13px var(--font);white-space:nowrap}
.fa .ctl button.go{background:#ff9650;color:#2a1405;min-width:84px}
.fa .ctl button.on{background:#5ee0ff;color:#06222b}
.fsheet{position:absolute;inset:auto 0 0 0;max-height:82%;overflow:auto;background:#121621;border-top:1px solid rgba(255,255,255,.1);border-radius:16px 16px 0 0;padding:12px;transform:translateY(105%);transition:transform .2s;z-index:3}
.fsheet.open{transform:none}
.fsheet .chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
.fsheet .chips button.on{background:#ff9650;color:#2a1405}
.fsheet .ex{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:6px}
.fsheet .ex button{text-align:right;padding:10px;display:flex;flex-direction:column;gap:3px}
.fsheet .ex button small{color:#9aa3b8;font-weight:600;font-size:11px}
.fsheet .ex button.on{background:#ff9650;color:#2a1405}.fsheet .ex button.on small{color:#4a2a10}
.fh{position:absolute;inset:0;overflow:auto;background:#0b0d12;color:#eef2fb;font-family:var(--font);padding:12px 12px 30px}
.fh h2{margin:2px 0 8px;font-size:18px}.fh h3{margin:16px 0 8px;font-size:14px;color:#9aa3b8}
.fh .acts{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
.fh .acts .pri{background:#ff9650;color:#2a1405}
.fh .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}
.fh .card{background:#151925;border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:10px}
.fh .card .l{font-size:12px;color:#9aa3b8}.fh .card .v{font-size:24px;font-weight:900;margin:4px 0 2px;direction:ltr;text-align:right}
.fh .card .v small{font-size:12px;color:#9aa3b8;font-weight:700;margin-inline-start:4px}
.fh .card .s{font-size:11px;font-weight:800}.fh .card svg{display:block;width:100%;height:26px;margin-top:4px}
.fh .plan{background:linear-gradient(135deg,#2a1a10,#151925);border:1px solid rgba(255,150,80,.35);border-radius:14px;padding:12px;line-height:1.7;font-size:14px}
.fh .plan b{color:#ffb27a}
.fh .wk{display:flex;align-items:flex-end;gap:4px;height:90px;padding:6px;background:#151925;border-radius:12px}
.fh .wk div{flex:1;background:#ff9650;border-radius:4px 4px 0 0;min-height:2px;position:relative}
.fh .wk div span{position:absolute;bottom:-16px;left:0;right:0;text-align:center;font-size:9px;color:#9aa3b8}
.fh .note{font-size:11px;color:#9aa3b8;margin-top:10px}
.fh form{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.fh form label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:#9aa3b8}
.fh form input{padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:#0b0d12;color:#eef2fb;font:700 15px var(--font);direction:ltr}
.fh .busy{padding:12px;border-radius:12px;background:#151925;margin:8px 0;font-size:13px}
`;
let cssDone = false;
function css() { if (cssDone) return; cssDone = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }

// ================================================================ «التمارين»
export function mountCoach(host, { onHealth } = {}) {
  css();
  const root = el('div', 'fa'); host.appendChild(root);
  const stage = el('div', 'stage'); root.appendChild(stage);
  const cv = el('canvas', 'fig'); stage.appendChild(cv);
  const hud = el('div', 'hud', '<div><div class="t"></div><div class="m"></div></div>'); stage.appendChild(hud);
  const cnt = el('div', 'cnt', '<b>٠</b><span></span>'); stage.appendChild(cnt);
  const tipEl = el('div', 'tip'); stage.appendChild(tipEl);
  const map = el('canvas', 'map'); stage.appendChild(map);
  const ctl = el('div', 'ctl'); root.appendChild(ctl);
  const sheet = el('div', 'fsheet'); root.appendChild(sheet);
  // ---- 3D: the anatomical figure (30 fps at most; asleep when hidden)
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: 'low-power' });
  r.outputColorSpace = THREE.SRGBColorSpace; r.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xf2f4ff, 0x3a3440, 1.3)); const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(2, 4, 3); sc.add(key);
  const rim = new THREE.DirectionalLight(0x9fd4ff, 0.8); rim.position.set(-3, 2, -3); sc.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.4, 48), new THREE.MeshStandardMaterial({ color: 0x1b2130, roughness: 0.9 })); floor.rotation.x = -Math.PI / 2; sc.add(floor);
  const cam = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
  const fig = new Figure(); sc.add(fig.root); fig.root.position.set(0, 0, 0); root.__fig = fig;
  let loaded = false;
  fig.load().then(() => { loaded = true; choose(st.ex.id); }).catch(e => { tipEl.textContent = 'تعذّر تحميل المجسم: ' + (e.message || e); });
  // ---- state
  const st = { ex: withGoal(exerciseById(settings.coachEx || 'squat')), state: 'idle', rep: 0, set: 1, phase: 0, secs: 0, restLeft: 0, kcal: 0, tip: '', area: null, pick: null };
  const cam2 = new PoseCam();
  function choose(id) { st.ex = withGoal(exerciseById(id)); saveSettings({ coachEx: st.ex.id }); st.state = 'idle'; st.rep = 0; st.set = 1; st.phase = 0; cam2.reset(); fig.setMuscles(st.ex.p, st.ex.s); fig.yaw.rotation.y = st.ex.kind === 'floor' ? -Math.PI / 2 : -0.35; fig.stopClip?.(); ui(); }
  function program() {
    const band = settings.hasBand !== false, g = settings.coachGoal, grp = GROUPS.find(x => x[0] === st.area);
    if (grp) return EXERCISES.filter(e => grp[2](e) && (e.kind !== 'band' || band)).map(e => e.id);
    if (g === 'bulk') return band ? ['squat', 'pushup', 'row', 'curl', 'press', 'overhead', 'chestpress', 'hammer', 'lunge', 'bridge', 'diamond', 'crunch'] : ['squat', 'pushup', 'lunge', 'diamond', 'bridge', 'superman', 'crunch', 'legraise'];
    if (g === 'cut') return band ? ['squat', 'row', 'pushup', 'curl', 'pushdown', 'lunge', 'lateral', 'bicycle', 'legraise', 'climbers', 'plank'] : ['squat', 'pushup', 'lunge', 'diamond', 'bicycle', 'legraise', 'climbers', 'plank'];
    if (g === 'burn') return ['jacks', 'squat', 'climbers', 'knees', 'lunge', 'bicycle', 'russian', 'pushup'];
    return EXERCISES.filter(e => e.kind !== 'band' || band).map(e => e.id);
  }
  function next() { const p = program(), i = p.indexOf(st.ex.id); choose(p[(i + 1) % p.length]); say('التمرين التالي: ' + st.ex.name); }
  function start() {
    if (st.state === 'run' || st.state === 'count') { st.state = 'pause'; say('توقف'); return ui(); }
    if (st.state === 'pause') { st.state = 'run'; say('نكمل'); return ui(); }
    st.state = 'count'; st.countAt = performance.now(); st.rep = 0; st.phase = 0; st.secs = 0;
    say(st.ex.name + '. ' + (st.ex.hold ? 'اثبت ' + st.ex.hold + ' ثانية' : st.ex.reps + ' تكرار') + '. استعد'); ui();
  }
  function finishSet() {
    const e = st.ex;
    logWorkout({ type: settings.coachGoal === 'burn' ? 'hiit' : 'strength', ex: e.id, reps: st.rep, set: st.set, minutes: Math.round(st.secs / 6) / 10, kcal: Math.round(st.kcal * 10) / 10 });
    if (st.set >= e.sets) { st.state = 'done'; say('أحسنت! انتهى تمرين ' + e.name); setTimeout(() => { if (st.state === 'done') next(); }, 3500); }
    else { st.state = 'rest'; st.restLeft = e.rest || settings.coachRest || 30; say('ممتاز. استرح ' + st.restLeft + ' ثانية'); }
    ui();
  }
  function countRep() { st.rep++; sayNumber(st.rep); if (st.rep === st.ex.reps - 2) setTimeout(() => say('آخر تكرارين', { cut: false }), 700); if (st.rep >= st.ex.reps) finishSet(); ui(); }
  function tip(t) { if (performance.now() - (st.tipAt || 0) < 5000) return; st.tipAt = performance.now(); st.tip = t; say(t, { cut: false }); }
  // ---- controls
  const B = (label, cls, fn) => { const b = el('button', cls, label); b.type = 'button'; b.onclick = fn; ctl.appendChild(b); return b; };
  const goB = B('▶ ابدأ', 'go', start);
  B('التالي ←', '', next);
  B('☰ التمارين', '', () => openSheet());
  const camB = B('📷 الكاميرا', '', async () => { if (cam2.on) cam2.stop(); else { camB.textContent = '📷 …'; if (!(await cam2.start())) tipEl.textContent = 'تعذّر تشغيل الكاميرا الأمامية'; else say('أرى جسمك. ضع الهاتف بحيث يظهر جسمك كاملاً'); } ui(); });
  const voiceB = B('🔊 الصوت', settings.coachVoice === false ? '' : 'on', () => { saveSettings({ coachVoice: settings.coachVoice === false }); ui(); });
  const bodyB = B('🧍 المجسم', '', async () => { const real = settings.coachBody !== 'simple'; saveSettings({ coachBody: real ? 'simple' : 'real' }); await fig.useAnatomy(!real); ui(); });
  if (onHealth) B('📊 جسمي', '', onHealth);
  function ui() {
    const e = st.ex;
    hud.querySelector('.t').textContent = e.name + (settings.coachGoal ? ' · ' + GOALS.find(x => x[0] === settings.coachGoal)[1] : '');
    hud.querySelector('.m').textContent = [...e.p, ...e.s].map(m => MUSCLE_AR[m]).join(' · ');
    const big = st.state === 'rest' ? Math.max(0, Math.ceil(st.restLeft)) : st.state === 'count' ? Math.max(1, st.left || 3) : e.hold ? Math.max(0, Math.ceil(e.hold - (st.state === 'run' ? st.secs : 0))) : st.rep;
    cnt.querySelector('b').textContent = String(big);
    cnt.querySelector('span').textContent = (st.state === 'rest' ? 'راحة' : e.hold ? 'ثانية' : 'من ' + arNum(e.reps)) + ' · المجموعة ' + arNum(st.set) + '/' + arNum(e.sets) + ' · ' + arNum(Math.round(st.kcal)) + ' سعرة';
    tipEl.textContent = st.tip || e.tips[Math.floor(performance.now() / 6000) % e.tips.length];
    goB.textContent = st.state === 'run' || st.state === 'count' ? '⏸ إيقاف' : st.state === 'pause' ? '▶ متابعة' : '▶ ابدأ';
    camB.className = cam2.on ? 'on' : ''; camB.textContent = cam2.on ? '📷 الكاميرا ✓' : '📷 الكاميرا';
    voiceB.className = settings.coachVoice === false ? '' : 'on';
    bodyB.textContent = settings.coachBody !== 'simple' ? '🧍 عضلات حقيقية' : '🧍 مجسم بسيط';
    drawMap();
  }
  // the illustrated map (tap a muscle → its exercises)
  let hits = [];
  function drawMap() {
    const d = Math.min(2, devicePixelRatio || 1), w = map.clientWidth * d, h = map.clientHeight * d;
    if (!w) return; if (map.width !== w) { map.width = w; map.height = h; }
    const c = map.getContext('2d'); c.clearRect(0, 0, w, h); c.save(); c.scale(w / 400, h / 400);
    hits = drawMuscleMap(c, 0, 0, 400, 400, st.ex.p, st.ex.s, performance.now() / 1000, st.pick) || []; c.restore();
  }
  map.onclick = ev => {
    const rc = map.getBoundingClientRect(), x = (ev.clientX - rc.left) * 400 / rc.width, y = (ev.clientY - rc.top) * 400 / rc.height, c = map.getContext('2d');
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); const hit = hits.slice().reverse().find(([, p]) => c.isPointInPath(p, x, y)); c.restore();
    if (hit) { st.pick = hit[0]; say('تمارين ' + MUSCLE_AR[hit[0]]); openSheet(); }
  };
  // the exercise sheet: goals, areas, exercises
  function openSheet() {
    const goal = settings.coachGoal || 'free', band = settings.hasBand !== false;
    let list = EXERCISES.filter(e => e.kind !== 'band' || band);
    const grp = GROUPS.find(x => x[0] === st.area);
    if (st.pick) list = list.filter(e => e.p.includes(st.pick) || e.s.includes(st.pick)).sort((a, b) => b.p.includes(st.pick) - a.p.includes(st.pick)); else if (grp) list = list.filter(grp[2]);
    sheet.innerHTML = `<div class="chips g"></div><div class="chips a"></div><div class="ex"></div><div style="height:6px"></div><button type="button" class="x">إغلاق</button>`;
    GOALS.forEach(([k, l]) => { const b = el('button', goal === k ? 'on' : '', l); b.onclick = () => { saveSettings({ coachGoal: k === 'free' ? null : k }); choose(st.ex.id); openSheet(); }; sheet.querySelector('.g').appendChild(b); });
    [['all', st.pick ? 'كل التمارين (إلغاء ' + MUSCLE_AR[st.pick] + ')' : 'كل التمارين'], ...GROUPS].forEach(([k, l]) => { const b = el('button', (st.area || 'all') === k && !st.pick ? 'on' : '', l); b.onclick = () => { st.area = k === 'all' ? null : k; st.pick = null; openSheet(); }; sheet.querySelector('.a').appendChild(b); });
    list.forEach(e => { const b = el('button', e.id === st.ex.id ? 'on' : '', `<span>${e.name}</span><small>${e.p.map(m => MUSCLE_AR[m]).join('، ')}${e.kind === 'band' ? ' · حبل' : ''}</small>`); b.onclick = () => { choose(e.id); sheet.classList.remove('open'); say(e.name); }; sheet.querySelector('.ex').appendChild(b); });
    sheet.querySelector('.x').onclick = () => sheet.classList.remove('open');
    sheet.classList.add('open');
  }
  // ---- the loop
  let last = performance.now(), frameAt = 0, alive = true, visible = true;
  const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; }); io.observe(root);
  function size() { const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return; if (r.domElement.width !== Math.round(w * r.getPixelRatio())) r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  function loop(now) {
    if (!alive) return;
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const e = st.ex;
    if (st.state === 'count') { const left = 3 - Math.floor((now - st.countAt) / 1000); if (left !== st.left) { st.left = left; if (left > 0) say(['', 'واحد', 'اثنان', 'ثلاثة'][left], { rate: 1.1 }); else { say('ابدأ'); st.state = 'run'; st.secs = 0; } ui(); } }
    if (st.state === 'run') {
      const before = st.phase; st.phase = (st.phase + dt / e.tempo) % 1; st.secs += dt; st.kcal += (e.met * (settings.weight || 75) / 3600) * dt;
      if (e.hold) { if (st.secs >= e.hold) { st.rep = 1; finishSet(); } }
      const cm = cam2.on ? cam2.read(now) : null, spec = CAM[e.id], camCounts = !!(cm && cm.seen && spec?.sig);
      if (cm) {
        const rr = cam2.rep(spec, cm);
        if (rr?.rep && !e.hold) { st.sensed = now; countRep(); if (spec.depth && rr.ext > spec.depth[0]) tip(spec.depth[1]); }
        const f = !cm.seen ? 'ابتعد قليلاً حتى تراك الكاميرا' : spec?.form?.(cm);
        st.formT = f ? (st.formT || 0) + dt : 0; if (f && st.formT > 1.2) { tip(f); st.formT = 0; }
      }
      if (!camCounts && !e.hold && before > st.phase && (!st.sensed || now - st.sensed > 6000)) countRep();
    }
    if (st.state === 'rest') { st.restLeft -= dt; const s = Math.ceil(st.restLeft); if (s !== st.lastRest) { st.lastRest = s; if (s === 10) say('عشر ثوانٍ'); if (s <= 3 && s > 0) say(['', 'واحد', 'اثنان', 'ثلاثة'][s]); } if (st.restLeft <= 0) { st.set++; st.rep = 0; st.state = 'run'; st.phase = 0; st.secs = 0; say('المجموعة التالية'); } }
    if (now - frameAt < 33 || !visible || document.hidden) return;   // 30 fps, asleep when hidden: cool phone
    frameAt = now;
    if (Math.floor(now / 250) !== st.uiTick) { st.uiTick = Math.floor(now / 250); ui(); }
    if (!loaded) return;
    size();
    const P = st.state === 'run' ? poseAt(e, st.phase) : st.state === 'idle' ? poseAt(e, (now / 1000 / e.tempo) % 1) : poseAt(e, 0);
    fig.apply(P);
    fig.setMuscles(e.p, e.s, st.state === 'run' ? 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, st.phase * 2)) : 0.8);
    fig.uniforms.uT.value = now / 1000;
    // frame the figure: standing → whole body; on the floor → from the side, wider
    const lying = !!(P.lie || P.lean || (P.hips && P.hips[1] < -0.7));
    const tz = lying ? 3.9 : 4.4, ty = lying ? 0.55 : 0.95;
    cam.position.set(0.25, ty + 0.35, tz * (root.__zoom || 1)); cam.lookAt(0, ty, 0);
    r.render(sc, cam);
  }
  requestAnimationFrame(loop);
  ui();
  return { destroy() { alive = false; io.disconnect(); cam2.stop(); try { speechSynthesis.cancel(); } catch {} r.dispose(); root.remove(); } };
}

// ================================================================ «جسمي»
const BODY_KEY = 'madar.body.v1';
const METRICS = [
  ['weight', 'الوزن', 'kg'], ['muscle', 'كتلة العضلات', 'kg'], ['bmi', 'مؤشر كتلة الجسم', ''], ['bodyFat', 'نسبة الدهون', '%'],
  ['subcutaneous', 'دهون تحت الجلد', '%'], ['visceral', 'الدهون الحشوية', ''], ['water', 'الماء', '%'], ['fatMass', 'كتلة الدهون', 'kg'],
  ['leanMass', 'الكتلة الخالية من الدهون', 'kg'], ['skeletal', 'العضلات الهيكلية', 'kg'], ['protein', 'البروتين', '%'], ['boneMass', 'كتلة العظام', 'kg'],
  ['bmr', 'الاستقلاب الأساسي', 'kcal'], ['bodyAge', 'عمر الجسم', ''],
];
// general adult (male) reference ranges - for orientation, not a diagnosis
function status(k, v) {
  const R = { bmi: [[18.5, 'منخفض', '#5ee0ff'], [25, 'طبيعي', '#34d399'], [30, 'مرتفع', '#fbbf24'], [1e9, 'مرتفع جداً', '#f87171']],
    bodyFat: [[6, 'منخفض جداً', '#5ee0ff'], [14, 'رياضي', '#34d399'], [18, 'لياقة جيدة', '#34d399'], [25, 'متوسط', '#fbbf24'], [1e9, 'مرتفع', '#f87171']],
    visceral: [[10, 'طبيعي', '#34d399'], [15, 'مرتفع', '#fbbf24'], [1e9, 'مرتفع جداً', '#f87171']],
    water: [[50, 'منخفض', '#fbbf24'], [65, 'طبيعي', '#34d399'], [1e9, 'مرتفع', '#5ee0ff']],
    protein: [[16, 'منخفض', '#fbbf24'], [20, 'طبيعي', '#34d399'], [1e9, 'مرتفع', '#5ee0ff']] }[k];
  if (!R || v == null) return null;
  const x = R.find(([lim]) => v < lim); return x ? { t: x[1], c: x[2] } : null;
}
export const bodyHistory = () => { try { return JSON.parse(localStorage.getItem(BODY_KEY) || '[]'); } catch { return []; } };
function saveBody(m) { const a = bodyHistory(); a.push({ ...m, at: Date.now() }); try { localStorage.setItem(BODY_KEY, JSON.stringify(a.slice(-200))); } catch {} if (m.weight) saveSettings({ weight: m.weight, weightAt: Date.now() }); hubOp({ op: 'set', key: 'body', value: { last: { ...m, at: Date.now() }, prev: a[a.length - 2] || null } }); }
function spark(vals) {
  const v = vals.filter(x => x != null); if (v.length < 2) return '';
  const lo = Math.min(...v), hi = Math.max(...v), n = v.length;
  const pts = v.map((x, i) => `${(i / (n - 1) * 100).toFixed(1)},${(24 - (hi > lo ? (x - lo) / (hi - lo) : 0.5) * 20 - 2).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 100 26" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="#ff9650" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}
// what the numbers suggest (general fitness guidance)
function plan(m) {
  if (!m) return '';
  const w = m.weight, bf = m.bodyFat, vis = m.visceral, lean = m.leanMass || (w && bf != null ? w * (1 - bf / 100) : null);
  let goal, why;
  if ((bf != null && bf >= 22) || (vis != null && vis >= 10)) { goal = 'burn'; why = 'نسبة الدهون أو الدهون الحشوية أعلى من المعدل — الأولوية للحرق مع مقاومة.'; }
  else if (bf != null && bf < 15 && (m.bmi == null || m.bmi < 25)) { goal = 'bulk'; why = 'دهونك منخفضة وجسمك نحيف وعضلي — الأنسب بناء العضل (تضخيم).'; }
  else { goal = 'cut'; why = 'جسمك في المعدل — التنشيف يُظهر العضلات ويحافظ عليها.'; }
  const tdee = m.bmr ? Math.round(m.bmr * 1.5 / 10) * 10 : null;
  const kcal = tdee ? (goal === 'bulk' ? tdee + 300 : goal === 'cut' ? tdee - 300 : tdee - 400) : null;
  const prot = w ? [Math.round(w * 1.6), Math.round(w * 2.0)] : null;
  const gl = { bulk: 'تضخيم', cut: 'تنشيف', burn: 'حرق' }[goal];
  return { goal, html: `<div><b>البرنامج المقترح: ${gl}</b> — ${why}</div>
    ${tdee ? `<div>احتياجك التقريبي مع نشاط متوسط: <b>${arNum(tdee)}</b> سعرة يومياً${kcal ? ` · للهدف: حوالي <b>${arNum(kcal)}</b>` : ''}.</div>` : ''}
    ${prot ? `<div>البروتين: حوالي <b>${arNum(prot[0])}–${arNum(prot[1])}</b> غراماً يومياً (١٫٦–٢ غ لكل كغ).</div>` : ''}
    ${lean ? `<div>كتلتك الخالية من الدهون <b>${arNum(lean.toFixed(1))}</b> كغ — راقبها: يجب أن تثبت أو ترتفع.</div>` : ''}` };
}
async function readScreenshot(file, onStep) {
  // 1) Workers AI vision on the server
  try {
    onStep('🔎 قراءة الصورة بالذكاء الاصطناعي…');
    const ask = img => fetch(W8 + '/vision/body', { method: 'POST', body: JSON.stringify({ image: img }) }).then(r => r.json()).catch(() => null);
    // the whole screenshot first (the model reads it best with every label); a long one that came back short is
    // read again in pieces, which only fill the values still missing
    const whole = await ask(await downscale(file, 2000)), got = { ...(whole?.metrics || {}) };
    if (Object.keys(got).length < 10) {
      onStep('🔎 قراءة الصورة على أجزاء…');
      const rs = await Promise.all((await slices(file)).map(ask));
      for (const r of rs) for (const [k, v] of Object.entries(r?.metrics || {})) if (v != null && got[k] == null) got[k] = v;
    }
    if (Object.keys(got).length >= 4) return got;
  } catch {}
  // 2) on-device OCR: the numbers of the cards, in the order the scale app lays them out (Eufy: two columns, right first)
  onStep('🔎 قراءة الأرقام على الجهاز (قد تأخذ نصف دقيقة)…');
  await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');
  const res = await window.Tesseract.recognize(file, 'eng', { tessedit_char_whitelist: '0123456789.,%kgcal ' });
  const words = (res.data.words || []).map(w => ({ t: w.text.replace(',', '.'), b: w.bbox, h: w.bbox.y1 - w.bbox.y0 })).filter(w => /^\d+(\.\d+)?$/.test(w.t));
  if (!words.length) throw new Error('لم أجد أرقاماً');
  const hs = words.map(w => w.h).sort((a, b) => a - b), big = hs[Math.floor(hs.length * 0.5)] * 1.15;
  const vals = words.filter(w => w.h >= big * 0.8);
  const imgW = Math.max(...vals.map(w => w.b.x1));
  vals.sort((a, b) => Math.abs(a.b.y0 - b.b.y0) > a.h * 1.5 ? a.b.y0 - b.b.y0 : (b.b.x0 > imgW / 2) - (a.b.x0 > imgW / 2));
  const ORDER = ['muscle', 'weight', 'subcutaneous', 'bmi', 'water', 'bodyFat', 'bmr', 'fatMass', 'leanMass', 'boneMass', 'visceral', 'protein', 'skeletal', 'bodyAge'];
  const m = {}; ORDER.forEach((k, i) => { if (vals[i]) m[k] = parseFloat(vals[i].t); });
  return m;
}
function slices(file) {
  return new Promise((ok, bad) => { const img = new Image(); img.onload = () => {
    const w = img.width, h = img.height, ph = Math.min(h, Math.round(w * 1.25)), out = [];
    const n = Math.min(5, Math.max(1, Math.ceil((h - ph * 0.15) / (ph * 0.85))));
    for (let i = 0; i < n; i++) {
      const y = n === 1 ? 0 : Math.round(i * (h - ph) / (n - 1)), k = Math.min(1, 900 / Math.max(w, ph)), c = document.createElement('canvas');
      c.width = w * k; c.height = ph * k; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, y, w, ph, 0, 0, c.width, c.height);
      out.push(c.toDataURL('image/jpeg', 0.88));
    }
    ok(out); }; img.onerror = bad; img.src = URL.createObjectURL(file); });
}
function downscale(file, max) {
  return new Promise((ok, bad) => { const img = new Image(); img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); ok(c.toDataURL('image/jpeg', 0.85)); }; img.onerror = bad; img.src = URL.createObjectURL(file); });
}
const scripts = {};
function loadScript(src) { return scripts[src] || (scripts[src] = new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = bad; document.head.appendChild(s); })); }

export function mountHealth(host, { onTrain } = {}) {
  css();
  const root = el('div', 'fh'); host.appendChild(root);
  const file = el('input'); file.type = 'file'; file.accept = 'image/*'; file.hidden = true; root.appendChild(file);
  function render(edit = null, busy = '') {
    const hist = bodyHistory(), last = hist[hist.length - 1];
    const p = plan(last);
    const wk = (() => { try { return JSON.parse(localStorage.getItem('madar.workouts.v1') || '[]'); } catch { return []; } })();
    const days = [...Array(14)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 13 + i); const t0 = +d, t1 = t0 + 864e5; const m = wk.filter(x => x.at >= t0 && x.at < t1).reduce((s, x) => s + (x.minutes || 0), 0); return { m, d }; });
    const maxM = Math.max(5, ...days.map(x => x.m));
    root.innerHTML = `<h2>جسمي</h2>
      <div class="acts"><button type="button" class="pri scan">📷 اقرأ صورة الميزان</button><button type="button" class="man">✎ أدخل الأرقام</button>${onTrain ? '<button type="button" class="tr">💪 التمارين</button>' : ''}</div>
      ${busy ? `<div class="busy">${busy}</div>` : ''}
      ${edit ? '<h3>راجع الأرقام ثم احفظ</h3><form></form><div class="acts" style="margin-top:8px"><button type="button" class="pri save">حفظ القياس</button><button type="button" class="cancel">إلغاء</button></div>' : ''}
      ${last && !edit ? `<h3>آخر قياس · ${new Date(last.at).toLocaleDateString('ar-OM', { day: 'numeric', month: 'long' })}${last.bodyType ? ' · ' + last.bodyType : ''}</h3><div class="cards"></div>` : ''}
      ${!last && !edit ? '<div class="busy">لا قياسات بعد — صوّر شاشة تطبيق الميزان (Eufy وغيره) وارفعها، أو أدخل الأرقام.</div>' : ''}
      ${p && !edit ? `<h3>ما تقوله أرقامك</h3><div class="plan">${p.html}<div class="acts" style="margin-top:8px"><button type="button" class="pri go">ابدأ برنامج ${({ bulk: 'التضخيم', cut: 'التنشيف', burn: 'الحرق' })[p.goal]}</button></div></div>` : ''}
      <h3>تمارينك في أسبوعين (دقائق)</h3><div class="wk">${days.map(x => `<div style="height:${Math.round(x.m / maxM * 100)}%"><span>${arNum(x.d.getDate())}</span></div>`).join('')}</div>
      <div class="note">النطاقات العامة للبالغين للتوجيه فقط وليست تشخيصاً · تُحفظ القياسات على جهازك.</div>`;
    root.querySelector('.scan').onclick = () => file.click();
    root.querySelector('.man').onclick = () => render(last ? { ...last } : {});
    root.querySelector('.tr')?.addEventListener('click', onTrain);
    root.querySelector('.go')?.addEventListener('click', () => { saveSettings({ coachGoal: p.goal }); hubOp({ op: 'set', key: 'plan', value: { goal: p.goal, today: 'برنامج ' + ({ bulk: 'التضخيم', cut: 'التنشيف', burn: 'الحرق' })[p.goal] + ' — تمرين اليوم في مدار', at: Date.now() } }); onTrain?.(); });
    if (last && !edit) {
      const cards = root.querySelector('.cards');
      for (const [k, l, u] of METRICS) {
        if (last[k] == null) continue;
        const s = status(k, last[k]), prev = hist.length > 1 ? hist[hist.length - 2][k] : null, d = prev != null ? last[k] - prev : null;
        const c = el('div', 'card', `<div class="l">${l}</div><div class="v">${last[k]}<small>${u}</small></div>${s ? `<div class="s" style="color:${s.c}">${s.t}</div>` : ''}${d ? `<div class="s" style="color:#9aa3b8">${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(k === 'bmr' ? 0 : 1)} عن السابق</div>` : ''}${spark(hist.slice(-12).map(h => h[k]))}`);
        cards.appendChild(c);
      }
    }
    if (edit) {
      const f = root.querySelector('form');
      for (const [k, l, u] of METRICS) { const lab = el('label', '', `${l}${u ? ' (' + u + ')' : ''}<input inputmode="decimal" name="${k}" value="${edit[k] ?? ''}">`); f.appendChild(lab); }
      root.querySelector('.save').onclick = () => { const m = {}; for (const [k] of METRICS) { const v = parseFloat(String(f.elements[k].value).replace(',', '.')); if (isFinite(v)) m[k] = v; } if (edit.bodyType) m.bodyType = edit.bodyType; if (Object.keys(m).length) saveBody(m); render(); };
      root.querySelector('.cancel').onclick = () => render();
    }
  }
  file.onchange = async () => {
    const f = file.files?.[0]; file.value = ''; if (!f) return;
    try { const m = await readScreenshot(f, msg => render(null, msg)); render(m, '✓ قرأت ' + arNum(Object.keys(m).length) + ' قيمة — راجعها قبل الحفظ'); }
    catch (e) { render({}, 'تعذّرت القراءة: ' + (e.message || e) + ' — أدخل الأرقام يدوياً'); }
  };
  render();
  return { destroy() { root.remove(); } };
}
