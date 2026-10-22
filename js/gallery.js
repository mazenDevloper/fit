// «المكتبات»: places to be and things to put in them, all from inside Madar.
//   غرف وأماكن  Madar's own rooms (gaming rooms, offices, the library, space…) + real rooms photographed in 360°
//   إطلالات     hand-picked views: cities at night, skylines, mountains, beaches, starry skies (Poly Haven, CC0)
//   بيئات 360°  all ~1000 Poly Haven environments by category
//   بانوراما    360° photographs from Wikimedia Commons (search by subject)
//   فيديو 360   360° videos around you (re-encoded for every device, played from Cloudflare)
//   أثاث ومجسمات  Poly Haven's furniture and objects - placed in the room and kept with the current environment
//   مخطوطات    your DriveCast manuscripts, as glowing panels on your walls
//   ملفاتي      your own: imported environments (GLB / 360° picture), models, pictures without background, videos
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { CanvasPanel, glass, text, icon, roundRect, COLORS, blip } from './ui.js';
import { settings, saveSettings } from './config.js';
import { ENVS } from './envs.js';
import { listItems, getItem } from './db.js';
import { loadModelFromFiles } from './models.js';

const API = 'https://api.polyhaven.com';
const W8 = 'https://studio.c-p.workers.dev';
const THUMB = id => `https://cdn.polyhaven.com/asset_img/thumbs/${id}.png?width=320&height=200`;
const COMMONS = 'https://commons.wikimedia.org/w/api.php?format=json&origin=*';
export const MANUSCRIPTS_BIN = '69b63c5cc3097a1dd5278b25';
const TABS = [['rooms', 'غرف وأماكن', 'home'], ['views', 'إطلالات', 'globe'], ['hdris', 'بيئات 360°', 'sun'], ['pano', 'بانوراما', 'image'], ['video', 'فيديو 360', 'video'], ['models', 'أثاث ومجسمات', 'cube'], ['manuscripts', 'مخطوطات', 'book'], ['mine', 'ملفاتي', 'stack']];
const HDRI_CATS = [['all', 'الكل'], ['nature', 'طبيعة'], ['urban', 'مدن'], ['indoor', 'داخلي'], ['skies', 'سماء'], ['sunrise-sunset', 'غروب'], ['night', 'ليل'], ['studio', 'استوديو']];
const MODEL_CATS = [['all', 'الكل'], ['furniture', 'أثاث'], ['seating', 'كراسي'], ['table', 'طاولات'], ['shelves', 'رفوف'], ['lighting', 'إضاءة'], ['electronics', 'أجهزة'], ['decorative', 'زينة'], ['plants', 'نباتات']];
// Madar's own places: [key, category]
const OWN = [['gaming', 'games'], ['gamingRed', 'games'], ['viewOffice', 'office'], ['nightOffice', 'office'], ['library', 'read'], ['reading', 'read'], ['space', 'read'], ['realNeon', 'office'], ['realStudio', 'office'], ['neonDesk', 'office'], ['study', 'office'], ['lounge', 'real'], ['realStudy', 'real'], ['night', 'mood'], ['cinema', 'mood'], ['sunset', 'mood']];
const OWN_THUMBS = new Set(['cinema', 'gaming', 'gamingRed', 'library', 'lounge', 'neonDesk', 'night', 'nightOffice', 'reading', 'realNeon', 'realStudio', 'realStudy', 'space', 'study', 'sunset', 'viewOffice']);
const OWN_COL = { gaming: ['#8a3cff', '#18d8ff'], gamingRed: ['#ff2a3c', '#ff9a1a'], viewOffice: ['#f7b267', '#5a3a50'], nightOffice: ['#0b1030', '#ffcf6a'], library: ['#4a2f1c', '#c9a24a'], reading: ['#8a7a60', '#f2e6cc'], space: ['#01020a', '#3a7bd5'],
  realNeon: ['#223a8a', '#5fdcff'], realStudio: ['#e4c6f6', '#a88cc4'], neonDesk: ['#4b5688', '#ff5fd6'], study: ['#c8afe0', '#f4f3f6'], lounge: ['#5a3020', '#ffb070'], realStudy: ['#d8d0c0', '#fff4e0'], night: ['#070b1a', '#2a3a70'], cinema: ['#0b0910', '#2a3550'], sunset: ['#3a2f6a', '#ff8c52'] };
const ROOM_CATS = [['all', 'الكل'], ['games', 'ألعاب'], ['office', 'مكاتب'], ['read', 'قراءة'], ['real', 'غرف حقيقية'], ['mood', 'أجواء']];
const PH_ROOMS = ['reading_room', 'wooden_lounge', 'comfy_cafe', 'pine_attic', 'lythwood_room', 'cayley_interior', 'aft_lounge', 'hotel_room', 'ballroom', 'photo_studio_loft_hall', 'colorful_studio', 'brown_photostudio_06', 'kiara_interior', 'artist_workshop'];
const VIEWS = [
  ['citynight', 'مدن ليلاً', ['shanghai_bund', 'hansaplatz', 'neuer_zollhof', 'modern_buildings_night', 'golden_bay', 'blue_lagoon_night', 'st_peters_square_night', 'cobblestone_street_night', 'vignaioli_night', 'rooftop_night', 'winter_evening', 'night_bridge']],
  ['city', 'مدن', ['sunset_jhbcentral', 'canary_wharf', 'potsdamer_platz', 'shanghai_riverside', 'table_mountain_1', 'leadenhall_market']],
  ['nature', 'جبال وطبيعة', ['alps_field', 'kiara_1_dawn', 'golden_gate_hills', 'kloppenheim_06', 'qwantani_dusk_2', 'hilly_terrain_01', 'lakeside', 'snowy_park_01']],
  ['sea', 'بحار وشواطئ', ['spiaggia_di_mondello', 'umhlanga_sunrise', 'blue_lagoon_night', 'aft_lounge']],
  ['stars', 'سماء الليل', ['moonless_golf', 'dikhololo_night', 'satara_night', 'rogland_clear_night', 'pond_bridge_night', 'solitude_night']],
];
const PANO = [['pick', 'مختارات'], ['nature', 'طبيعة', 'landscape nature'], ['mountain', 'جبال', 'mountain'], ['beach', 'شواطئ', 'beach'], ['city', 'مدن', 'city square'], ['mosque', 'مساجد', 'mosque'], ['library', 'مكتبات', 'library'], ['sky', 'سماء الليل', 'night sky'], ['palace', 'قصور وكاتدرائيات', 'cathedral interior']];
const PER = 12;
const imgCache = new Map();

export class Gallery {
  constructor(app) {
    this.app = app;
    this.tab = 'rooms'; this.cat = 'all'; this.page = 0;
    this.lists = {}; this.thumbs = new Map(); this.busy = '';
    this.group = new THREE.Group(); this.group.visible = false;
    app.renderer.scene.add(this.group);
    // the environment you picked last time comes back when Madar starts
    if (settings.galleryEnv?.url && settings.environment === 'gallery') setTimeout(() => (settings.galleryEnv.type === 'img' ? this.applyImage(settings.galleryEnv, true) : this.applyHdri(settings.galleryEnv, true)).catch(() => {}), 1500);
    if (settings.mineEnv && settings.environment === 'mine') setTimeout(() => this.applyMine(settings.mineEnv, true).catch(() => {}), 1500);
  }
  get targets() { return this.group.visible && this.panel ? [this.panel.mesh] : []; }
  build() {
    if (this.panel) return;
    this.panel = new CanvasPanel(1.5, 0.98, (ctx, W, H, p) => this.draw(ctx, W, H, p), { pxPerM: 1250 });
    this.panel.mesh.material.depthTest = false; this.panel.mesh.renderOrder = 940;
    this.group.add(this.panel.mesh);
  }
  open(tab) {
    this.build();
    if (tab) { this.tab = tab; this.page = 0; this.cat = this.defaultCat(); }
    const f = this.app.headForward.clone(); f.y = 0; f.normalize();
    const d = settings.viewMode !== 'sbs' ? 1.9 : 1.35;
    this.group.position.set(f.x * d, -0.05, f.z * d); this.group.lookAt(0, -0.05, 0);
    this.group.visible = true; this.app.interaction?.setTargets(); blip('open', settings.sounds);
    this.load();
  }
  close() { this.group.visible = false; this.app.interaction?.setTargets(); }
  redraw() { this.panel?.redraw(); }
  defaultCat() { return { views: 'citynight', pano: 'pick', video: 'all', rooms: 'all', mine: 'all', manuscripts: 'all' }[this.tab] || 'all'; }
  cats() {
    if (this.tab === 'rooms') return ROOM_CATS;
    if (this.tab === 'views') return VIEWS.map(([k, l]) => [k, l]);
    if (this.tab === 'hdris') return HDRI_CATS;
    if (this.tab === 'models') return MODEL_CATS;
    if (this.tab === 'pano') return PANO.map(([k, l]) => [k, l]);
    if (this.tab === 'video') return [['all', 'الكل'], ...[...new Set((this.lists.video || []).map(v => v.cat))].map(c => [c, c])];
    if (this.tab === 'mine') return [['all', 'الكل'], ['env', 'بيئات'], ['model', 'مجسمات'], ['image', 'صور'], ['video', 'فيديو']];
    return [];
  }

  // ---- data
  async load() {
    const key = this.tab === 'pano' ? 'pano:' + this.cat : this.tab;
    if (this.lists[key] && this.tab !== 'mine') { this.redraw(); return; }
    this.busy = 'جاري التحميل…'; this.redraw();
    try {
      if (this.tab === 'hdris' || this.tab === 'models' || this.tab === 'views' || this.tab === 'rooms') {
        const t = this.tab === 'models' ? 'models' : 'hdris';
        if (!this.lists[t]) {
          const d = await (await fetch(`${API}/assets?t=${t}`)).json();
          this.lists[t] = Object.entries(d).map(([id, a]) => ({ id, name: a.name, cats: a.categories || [], dl: a.download_count || 0, kind: t === 'models' ? 'model' : 'hdri' })).sort((a, b) => b.dl - a.dl);
        }
        if (this.tab === 'views') { const by = new Map(this.lists.hdris.map(a => [a.id, a])); this.lists.views = VIEWS.flatMap(([k, , ids]) => ids.map(id => ({ ...(by.get(id) || { id, name: id, kind: 'hdri' }), cats: [k] }))); }
        if (this.tab === 'rooms') {
          const by = new Map(this.lists.hdris.map(a => [a.id, a]));
          this.lists.rooms = [...OWN.map(([k, c]) => ({ id: k, own: true, name: ENVS[k]?.label || k, note: ENVS[k]?.note, cats: [c] })), ...PH_ROOMS.filter(id => by.has(id)).map(id => ({ ...by.get(id), cats: ['real'] }))];
        }
      } else if (this.tab === 'pano') this.lists[key] = await this.panoList(this.cat);
      else if (this.tab === 'video') this.lists.video = (await (await fetch(W8 + '/m/manifest.json')).json()).map(v => ({ ...v, name: v.title, kind: 'video', cats: [v.cat] }));
      else if (this.tab === 'manuscripts') this.lists.manuscripts = await this.manuscripts();
      else if (this.tab === 'mine') this.lists.mine = (await listItems()).filter(i => ['env', 'model', 'image', 'video'].includes(i.type)).map(i => ({ id: i.id, name: i.name, kind: 'mine', type: i.type, format: i.format, cats: [i.type], item: i }));
      this.busy = '';
    } catch (e) { this.busy = 'تعذّر الوصول للمكتبة — تحقق من الإنترنت'; this.app.log('المكتبات: ' + (e.message || e)); }
    this.redraw();
  }
  async panoList(cat) {
    const c = PANO.find(x => x[0] === cat);
    const q = !c || !c[2]
      ? `${COMMONS}&action=query&generator=categorymembers&gcmtitle=${encodeURIComponent('Category:360° panoramas with equirectangular projection')}&gcmtype=file&gcmlimit=120&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=420`
      : `${COMMONS}&action=query&generator=search&gsrnamespace=6&gsrlimit=120&gsrsearch=${encodeURIComponent(c[2] + ' 360 panorama equirectangular')}&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=420`;
    const d = await (await fetch(q)).json();
    return Object.values(d.query?.pages || {}).map(p => ({ p, i: p.imageinfo?.[0] })).filter(({ i }) => i && /jpeg|png/.test(i.mime) && Math.abs(i.width / i.height - 2) < 0.03 && i.width >= 3000)
      .map(({ p, i }) => ({ id: p.title, name: p.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '').replace(/[_]/g, ' '), thumb: i.thumburl, kind: 'pano', cats: [cat] }));
  }
  async manuscripts() {
    const d = await (await fetch(W8 + '/bin/' + MANUSCRIPTS_BIN)).json();
    const list = Array.isArray(d) ? d : d.manuscripts || [];
    return list.filter(m => m.pngDataUrl || m.content).map(m => ({ id: m.id, name: m.type === 'text' ? m.content : 'مخطوطة', thumb: m.pngDataUrl, kind: 'manuscript', m, cats: ['all'] }));
  }
  shown() {
    const key = this.tab === 'pano' ? 'pano:' + this.cat : this.tab;
    const all = this.lists[key] || [];
    if (this.tab === 'pano' || this.cat === 'all') return all;
    return all.filter(a => a.cats.includes(this.cat));
  }
  thumb(a) {
    const src = a.own ? (OWN_THUMBS.has(a.id) ? new URL('../assets/rooms/thumbs/' + a.id + '.jpg', import.meta.url).href : null) : a.thumb || (a.kind === 'video' ? W8 + '/m/' + a.poster : a.kind === 'mine' ? null : THUMB(a.id));
    if (!src) return null;
    let t = this.thumbs.get(src);
    if (!t) {
      t = new Image(); if (!src.startsWith('data:')) t.crossOrigin = 'anonymous';
      t.onload = () => this.redraw();
      t.src = src;
      this.thumbs.set(src, t);
      if (this.thumbs.size > 160) { const k = this.thumbs.keys().next().value; this.thumbs.delete(k); }
    }
    return t;
  }

  // ---- drawing
  draw(ctx, W, H, p) {
    roundRect(ctx, 0, 0, W, H, 60); ctx.fillStyle = 'rgba(14,16,24,0.86)'; ctx.fill();
    glass(ctx, 0, 0, W, H, 60);
    // close
    const hc = p.isHover('x'); ctx.beginPath(); ctx.arc(76, 66, 34, 0, 7); ctx.fillStyle = hc ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)'; ctx.fill();
    icon(ctx, 'close', 76, 66, 30); p.region(36, 26, 80, 80, () => { blip('close', settings.sounds); this.close(); }, 'x');
    // tabs (right to left)
    const tw = (W - 180) / TABS.length;
    TABS.forEach(([k, l, ic], i) => {
      const x = W - 40 - (i + 1) * tw, id = 'tab' + k, on = this.tab === k, hov = p.isHover(id);
      roundRect(ctx, x + 4, 30, tw - 8, 76, 24); ctx.fillStyle = on ? 'rgba(255,255,255,0.92)' : hov ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)'; ctx.fill();
      icon(ctx, ic, x + tw / 2, 56, 26, on ? '#151821' : COLORS.text);
      text(ctx, l, x + tw / 2, 88, 21, { weight: 800, color: on ? '#151821' : COLORS.text, maxWidth: tw - 16, fit: true });
      p.region(x, 30, tw, 76, () => { blip('tap', settings.sounds); this.tab = k; this.cat = this.defaultCat(); this.page = 0; this.load(); }, id);
    });
    // categories
    const cats = this.cats();
    if (cats.length) {
      const cw = Math.min(200, (W - 100) / cats.length);
      cats.forEach(([k, l], i) => {
        const x = W - 50 - (i + 1) * cw, id = 'c' + k, on = this.cat === k, hov = p.isHover(id);
        roundRect(ctx, x + 5, 124, cw - 10, 48, 24); ctx.fillStyle = on ? 'rgba(52,211,153,0.85)' : hov ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)'; ctx.fill();
        text(ctx, l, x + cw / 2, 149, 21, { weight: 800, color: on ? '#04140d' : COLORS.text, maxWidth: cw - 20, fit: true });
        p.region(x, 124, cw, 48, () => { blip('tap', settings.sounds); this.cat = k; this.page = 0; if (this.tab === 'pano') this.load(); else this.redraw(); }, id);
      });
    }
    const hint = { rooms: 'اختر مكاناً لتكون فيه', views: 'إطلالات حقيقية 360° · Poly Haven', hdris: 'Poly Haven · مجانية', pano: 'صور 360° من ويكيميديا كومنز', video: 'فيديوهات 360° حولك · اضبط سرعة جهاز المشي من وضع الرياضة', models: 'تُثبّت في البيئة الحالية · ⋯ لإلغاء التثبيت', manuscripts: 'من DriveCast · تظهر بلا خلفية على جدارك', mine: 'أضف بيئاتك ومجسماتك وصورك من الشاشة الرئيسية' }[this.tab];
    text(ctx, hint, W / 2, H - 38, 22, { color: COLORS.dim, maxWidth: W * 0.5, fit: true });
    if (this.busy) { text(ctx, this.busy, W / 2, H / 2, 34, { weight: 700, color: COLORS.dim }); return; }
    const list = this.shown(), pages = Math.max(1, Math.ceil(list.length / PER));
    this.page = Math.min(this.page, pages - 1);
    if (!list.length) { text(ctx, this.tab === 'mine' ? 'لا توجد ملفات بعد — من الشاشة الرئيسية: «استيراد بيئة» أو «ملفاتك»' : 'لا شيء هنا', W / 2, H / 2, 30, { color: COLORS.dim, maxWidth: W - 160, fit: true }); return; }
    const cols = 4, rows = 3, top = 192, pad = 50, g = 16;
    const tw2 = (W - pad * 2 - g * (cols - 1)) / cols, th = (H - top - 84 - g * (rows - 1)) / rows;
    list.slice(this.page * PER, this.page * PER + PER).forEach((a, i) => {
      const c = i % cols, r = Math.floor(i / cols), x = W - pad - (c + 1) * tw2 - c * g, y = top + r * (th + g);
      const id = 'a' + i, hov = p.isHover(id), loading = this.loadingId === a.id, cur = this.isCurrent(a);
      ctx.save(); roundRect(ctx, x, y, tw2, th, 22); ctx.clip();
      this.card(ctx, a, x, y, tw2, th);
      const grd = ctx.createLinearGradient(0, y + th * 0.55, 0, y + th); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.82)');
      ctx.fillStyle = grd; ctx.fillRect(x, y, tw2, th);
      ctx.restore();
      if (hov || cur) { roundRect(ctx, x, y, tw2, th, 22); ctx.strokeStyle = cur ? '#34d399' : 'rgba(255,255,255,0.8)'; ctx.lineWidth = 5; ctx.stroke(); }
      if (a.dur) { roundRect(ctx, x + 12, y + 12, 86, 34, 17); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fill(); text(ctx, Math.floor(a.dur / 60) + ':' + String(a.dur % 60).padStart(2, '0'), x + 55, y + 30, 19, { weight: 700, dir: 'ltr' }); }
      text(ctx, loading ? 'جاري التحميل…' : a.name, x + tw2 / 2, y + th - 24, 22, { weight: 800, maxWidth: tw2 - 20, fit: true, dir: 'auto' });
      p.region(x, y, tw2, th, () => { blip('tap', settings.sounds); this.pick(a); }, id);
    });
    text(ctx, `${this.page + 1} / ${pages} · ${list.length}`, 210, H - 38, 22, { color: COLORS.dim, dir: 'ltr' });
    [['chevR', W - 120, -1], ['chevL', W - 210, 1]].forEach(([ic, x, d]) => {
      const id = 'pg' + d, hov = p.isHover(id);
      ctx.beginPath(); ctx.arc(x, H - 38, 28, 0, 7); ctx.fillStyle = hov ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'; ctx.fill();
      icon(ctx, ic, x, H - 38, 26);
      p.region(x - 45, H - 76, 90, 76, () => { blip('tap', settings.sounds); this.page = (this.page + d + pages) % pages; this.redraw(); }, id);
    });
  }
  card(ctx, a, x, y, w, h) {
    if (a.own) {   // Madar's own room: its colours
      const [c1, c2] = OWN_COL[a.id] || ['#334', '#667'];
      const g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, c1); g.addColorStop(1, c2); ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      const im = this.thumb(a);   // a real look at the room (rendered once, shipped with Madar)
      if (im && im.complete && im.naturalWidth) {
        const k = Math.max(w / im.naturalWidth, h / im.naturalHeight); ctx.drawImage(im, x + (w - im.naturalWidth * k) / 2, y + (h - im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k);
        if (a.note) { const sh = ctx.createLinearGradient(0, y + h * 0.45, 0, y + h * 0.78); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.55)'); ctx.fillStyle = sh; ctx.fillRect(x, y + h * 0.45, w, h * 0.33); text(ctx, a.note, x + w / 2, y + h * 0.66, 17, { color: 'rgba(255,255,255,0.92)', maxWidth: w - 20, fit: true }); }
        return;
      }
      icon(ctx, { games: 'grid', office: 'home', read: 'book', real: 'image', mood: 'moon' }[OWN.find(o => o[0] === a.id)?.[1]] || 'home', x + w / 2, y + h * 0.4, h * 0.3, 'rgba(255,255,255,0.85)');
      if (a.note) text(ctx, a.note, x + w / 2, y + h * 0.66, 17, { color: 'rgba(255,255,255,0.85)', maxWidth: w - 20, fit: true });
      return;
    }
    ctx.fillStyle = a.kind === 'manuscript' ? '#0d1220' : '#1b2030'; ctx.fillRect(x, y, w, h);
    if (a.kind === 'mine') { icon(ctx, { env: 'globe', model: 'cube', image: 'image', video: 'video' }[a.type] || 'stack', x + w / 2, y + h * 0.42, h * 0.32, 'rgba(255,255,255,0.75)'); text(ctx, { env: 'بيئة', model: 'مجسم', image: 'صورة', video: 'فيديو' }[a.type] + (a.format ? ' · ' + a.format.toUpperCase() : ''), x + w / 2, y + h * 0.7, 17, { color: COLORS.dim }); return; }
    const im = this.thumb(a);
    if (im && im.complete && im.naturalWidth) {
      if (a.kind === 'manuscript') {   // the strokes in gold on dark, like on DriveCast's board
        const k = Math.min((w - 30) / im.naturalWidth, (h - 50) / im.naturalHeight);
        ctx.save(); ctx.filter = 'brightness(0) invert(1) sepia(1) saturate(3) hue-rotate(-12deg)'; ctx.drawImage(im, x + (w - im.naturalWidth * k) / 2, y + 8 + (h - 50 - im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k); ctx.restore();
      } else { const k = Math.max(w / im.naturalWidth, h / im.naturalHeight); ctx.drawImage(im, x + (w - im.naturalWidth * k) / 2, y + (h - im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k); }
    }
  }
  isCurrent(a) {
    if (a.own) return settings.environment === a.id;
    if (a.kind === 'hdri') return settings.environment === 'gallery' && settings.galleryEnv?.id === a.id;
    if (a.kind === 'pano') return settings.environment === 'gallery' && settings.galleryEnv?.id === a.id;
    if (a.kind === 'mine' && a.type === 'env') return settings.environment === 'mine' && settings.mineEnv === a.id;
    return false;
  }

  // ---- choosing
  async pick(a) {
    if (this.loadingId) return;
    if (a.own) { saveSettings({ environment: a.id }); this.app.renderEnvChoices?.(); this.app.toast('🌍 ' + a.name, 2000); this.redraw(); this.app.windows.windows.find(w => w.kind === 'reader')?.applyLayout(); return; }
    this.loadingId = a.id; this.redraw();
    try {
      if (a.kind === 'hdri') {
        const f = await (await fetch(`${API}/files/${a.id}`)).json();
        const url = f.hdri?.['2k']?.hdr?.url || f.hdri?.['1k']?.hdr?.url;
        if (!url) throw new Error('no hdr');
        await this.applyHdri({ id: a.id, name: a.name, url });
      } else if (a.kind === 'model') {
        const f = await (await fetch(`${API}/files/${a.id}`)).json();
        const g = f.gltf?.['1k']?.gltf;
        if (!g) throw new Error('no gltf');
        const includes = {}; for (const [k, v] of Object.entries(g.include || {})) includes[k] = v.url;
        const w = this.app.windows.open({ kind: 'model', url: g.url, includes, name: a.name });
        // furniture belongs to the place you are in (it shows only there and comes back with it)
        if (w && !['passthrough', 'dim'].includes(settings.environment)) this.app.windows.pinToEnv(w, true);
        this.app.toast('📦 ' + a.name + (w?.envPin ? ' · ثُبّت في هذه البيئة' : ''), 2500);
        this.close();
      } else if (a.kind === 'pano') {
        const d = await (await fetch(`${COMMONS}&action=query&titles=${encodeURIComponent(a.id)}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=4096`)).json();
        const i = Object.values(d.query?.pages || {})[0]?.imageinfo?.[0];
        if (!i?.thumburl) throw new Error('no image');
        await this.applyImage({ id: a.id, name: a.name, url: i.thumburl, type: 'img' });
      } else if (a.kind === 'video') {
        this.app.windows.open({ kind: 'video', url: W8 + '/m/' + a.file, name: a.title, proj: '360' });
        this.app.toast('🎥 ' + a.title + ' · ' + (a.license || '') + (a.author ? ' — ' + a.author : ''), 4000);
        this.close();
      } else if (a.kind === 'manuscript') {
        this.app.windows.open({ kind: 'manuscript', id: a.id });
        this.close();
      } else if (a.kind === 'mine') {
        if (a.type === 'env') await this.applyMine(a.id);
        else { const w = this.app.windows.open({ kind: a.type, itemId: a.id, name: a.name }); if (w && a.type === 'model' && !['passthrough', 'dim'].includes(settings.environment)) this.app.windows.pinToEnv(w, true); this.close(); }
      }
    } catch (e) { this.app.toast('تعذّر تحميل «' + a.name + '»', 2500); this.app.log('المكتبات: ' + (e.message || e)); }
    this.loadingId = null; this.redraw();
  }

  // a sphere around you inside the «من المكتبة» environment
  sphereEnv(map, env, type) {
    const g = this.app.envs.gallery;
    g.children.forEach(c => { c.geometry?.dispose(); c.material?.map?.dispose(); c.material?.dispose(); });
    g.clear();
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(60, 64, 32), new THREE.MeshBasicMaterial({ map, side: THREE.BackSide, depthWrite: false }));
    sphere.scale.x = -1; sphere.renderOrder = -20;
    g.add(sphere); g.userData.dim = 1;
    saveSettings({ environment: 'gallery', galleryEnv: { id: env.id, name: env.name, url: env.url, type } });
    this.app.renderEnvChoices?.();
    this.app.log('بيئة من المكتبة: ' + env.name);
  }
  // HDRI (2K: sharp enough, light on memory)
  async applyHdri(env, quiet) {
    const t = await new RGBELoader().loadAsync(env.url);
    t.colorSpace = THREE.LinearSRGBColorSpace;
    this.sphereEnv(t, env, 'hdri');
    if (!quiet) this.app.toast('🌍 ' + env.name, 2200);
  }
  // a 360° photograph (Commons panoramas, your own pictures)
  async applyImage(env, quiet) {
    const t = await new THREE.TextureLoader().loadAsync(env.url);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    this.sphereEnv(t, env, 'img');
    if (!quiet) this.app.toast('🌍 ' + env.name, 2200);
  }
  // your own environment: a 3D room (GLB / glTF) set on the floor around you, or a 360° picture / HDR
  async applyMine(id, quiet) {
    const item = await getItem(id);
    if (!item) { if (!quiet) this.app.toast('البيئة غير موجودة', 2000); return; }
    const g = this.app.envs.mine;
    g.traverse(o => { if (o.isMesh) { o.geometry?.dispose(); [].concat(o.material).forEach(m => { if (!m) return; Object.values(m).forEach(v => v?.isTexture && v.dispose()); m.dispose(); }); } });
    g.clear();
    if (['glb', 'gltf'].includes(item.format)) {
      const res = await loadModelFromFiles(item.files, item.format);
      const obj = res.object;
      const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3());
      const big = Math.max(size.x, size.y, size.z);
      const k = big < 2.5 ? 8 / big : 1;   // a small model of a room → room-sized
      obj.scale.multiplyScalar(k);
      const b2 = new THREE.Box3().setFromObject(obj), c = b2.getCenter(new THREE.Vector3());
      obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y += -1.55 - b2.min.y;
      g.add(obj, new THREE.HemisphereLight(0xffffff, 0x444455, 1.0));
      const d = new THREE.DirectionalLight(0xffffff, 1.4); d.position.set(2, 4, 3); g.add(d);
      g.userData.dim = 0.4;
    } else {
      const url = URL.createObjectURL(item.files[0].blob);
      const t = item.format === 'hdr' ? await new RGBELoader().loadAsync(url) : await new THREE.TextureLoader().loadAsync(url);
      t.colorSpace = item.format === 'hdr' ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace;
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(60, 64, 32), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, depthWrite: false }));
      sphere.scale.x = -1; sphere.renderOrder = -20; g.add(sphere); g.userData.dim = 1;
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
    saveSettings({ environment: 'mine', mineEnv: id });
    this.app.renderEnvChoices?.();
    if (!quiet) this.app.toast('🌍 ' + item.name, 2200);
  }
}
