// «المكتبات»: browse Poly Haven's free (CC0) library from inside Madar - 360° environments (HDRI) to stand in,
// and 3D models to place in the room. Thumbnails stream in as you page; a pick loads straight from Poly Haven.
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { CanvasPanel, glass, text, icon, roundRect, COLORS, blip } from './ui.js';
import { settings, saveSettings } from './config.js';

const API = 'https://api.polyhaven.com';
const THUMB = id => `https://cdn.polyhaven.com/asset_img/thumbs/${id}.png?width=320&height=200`;
const HDRI_CATS = [['all', 'الكل'], ['nature', 'طبيعة'], ['urban', 'مدن'], ['indoor', 'داخلي'], ['skies', 'سماء'], ['sunrise-sunset', 'غروب'], ['night', 'ليل'], ['studio', 'استوديو']];
const MODEL_CATS = [['all', 'الكل'], ['furniture', 'أثاث'], ['decorative', 'زينة'], ['plants', 'نباتات'], ['props', 'أغراض'], ['electronics', 'أجهزة'], ['food', 'طعام'], ['nature', 'طبيعة']];
const PER = 12;

export class Gallery {
  constructor(app) {
    this.app = app;
    this.tab = 'hdris'; this.cat = 'all'; this.page = 0;
    this.lists = {}; this.thumbs = new Map(); this.busy = '';
    this.group = new THREE.Group(); this.group.visible = false;
    app.renderer.scene.add(this.group);
    // the environment you picked last time comes back when Madar starts
    if (settings.galleryEnv?.id && settings.environment === 'gallery') setTimeout(() => this.applyHdri(settings.galleryEnv, true), 1500);
  }
  get targets() { return this.group.visible && this.panel ? [this.panel.mesh] : []; }
  build() {
    if (this.panel) return;
    this.panel = new CanvasPanel(1.4, 0.92, (ctx, W, H, p) => this.draw(ctx, W, H, p), { pxPerM: 1250 });
    this.panel.mesh.material.depthTest = false; this.panel.mesh.renderOrder = 940;
    this.group.add(this.panel.mesh);
  }
  open(tab) {
    this.build();
    if (tab) { this.tab = tab; this.page = 0; this.cat = 'all'; }
    const f = this.app.headForward.clone(); f.y = 0; f.normalize();
    const d = settings.viewMode !== 'sbs' ? 1.8 : 1.3;
    this.group.position.set(f.x * d, -0.05, f.z * d); this.group.lookAt(0, -0.05, 0);
    this.group.visible = true; this.app.interaction?.setTargets(); blip('open', settings.sounds);
    this.load();
  }
  close() { this.group.visible = false; this.app.interaction?.setTargets(); }
  redraw() { this.panel?.redraw(); }

  async load() {
    if (this.lists[this.tab]) { this.redraw(); return; }
    this.busy = 'جاري التحميل…'; this.redraw();
    try {
      const d = await (await fetch(`${API}/assets?t=${this.tab}`)).json();
      // most downloaded first (the popular, well-made ones)
      this.lists[this.tab] = Object.entries(d).map(([id, a]) => ({ id, name: a.name, cats: a.categories || [], dl: a.download_count || 0 })).sort((a, b) => b.dl - a.dl);
      this.busy = '';
    } catch (e) { this.busy = 'تعذّر الوصول للمكتبة — تحقق من الإنترنت'; }
    this.redraw();
  }
  shown() {
    const all = this.lists[this.tab] || [];
    return this.cat === 'all' ? all : all.filter(a => a.cats.includes(this.cat));
  }
  thumb(id) {
    let t = this.thumbs.get(id);
    if (!t) {
      t = new Image(); t.crossOrigin = 'anonymous';
      t.onload = () => this.redraw();
      t.src = THUMB(id);
      this.thumbs.set(id, t);
      if (this.thumbs.size > 120) { const k = this.thumbs.keys().next().value; this.thumbs.delete(k); }
    }
    return t;
  }

  draw(ctx, W, H, p) {
    roundRect(ctx, 0, 0, W, H, 60); ctx.fillStyle = 'rgba(14,16,24,0.82)'; ctx.fill();
    glass(ctx, 0, 0, W, H, 60);
    text(ctx, 'المكتبات', W - 60, 70, 48, { align: 'right', weight: 800 });
    text(ctx, 'Poly Haven · مجانية', W - 60, 112, 22, { align: 'right', color: COLORS.dim, dir: 'auto' });
    // tabs
    [['hdris', 'بيئات 360°'], ['models', 'مجسمات']].forEach(([k, l], i) => {
      const id = 'tab' + k, on = this.tab === k, hov = p.isHover(id);
      const tx = i === 0 ? W / 2 + 10 : W / 2 - 250;
      roundRect(ctx, tx, 40, 240, 62, 31); ctx.fillStyle = on ? 'rgba(255,255,255,0.9)' : hov ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)'; ctx.fill();
      text(ctx, l, tx + 120, 72, 30, { weight: 800, color: on ? '#151821' : COLORS.text });
      p.region(tx, 40, 240, 62, () => { blip('tap', settings.sounds); this.tab = k; this.cat = 'all'; this.page = 0; this.load(); }, id);
    });
    // close
    const hc = p.isHover('x'); ctx.beginPath(); ctx.arc(80, 72, 34, 0, 7); ctx.fillStyle = hc ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)'; ctx.fill();
    icon(ctx, 'close', 80, 72, 30); p.region(40, 32, 80, 80, () => { blip('close', settings.sounds); this.close(); }, 'x');
    // categories
    const cats = this.tab === 'hdris' ? HDRI_CATS : MODEL_CATS, cw = (W - 100) / cats.length;
    cats.forEach(([k, l], i) => {
      const x = W - 50 - (i + 1) * cw, id = 'c' + k, on = this.cat === k, hov = p.isHover(id);
      roundRect(ctx, x + 5, 135, cw - 10, 50, 25); ctx.fillStyle = on ? 'rgba(52,211,153,0.85)' : hov ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)'; ctx.fill();
      text(ctx, l, x + cw / 2, 161, 23, { weight: 800, color: on ? '#04140d' : COLORS.text, maxWidth: cw - 20, fit: true });
      p.region(x, 135, cw, 50, () => { blip('tap', settings.sounds); this.cat = k; this.page = 0; this.redraw(); }, id);
    });
    if (this.busy) { text(ctx, this.busy, W / 2, H / 2, 34, { weight: 700, color: COLORS.dim }); return; }
    const list = this.shown(), pages = Math.max(1, Math.ceil(list.length / PER));
    this.page = Math.min(this.page, pages - 1);
    const cols = 4, rows = 3, top = 205, pad = 50, g = 16;
    const tw = (W - pad * 2 - g * (cols - 1)) / cols, th = (H - top - 80 - g * (rows - 1)) / rows;
    list.slice(this.page * PER, this.page * PER + PER).forEach((a, i) => {
      const c = i % cols, r = Math.floor(i / cols), x = W - pad - (c + 1) * tw - c * g, y = top + r * (th + g);
      const id = 'a' + a.id, hov = p.isHover(id), loading = this.loadingId === a.id, cur = settings.galleryEnv?.id === a.id && settings.environment === 'gallery';
      ctx.save(); roundRect(ctx, x, y, tw, th, 22); ctx.clip();
      ctx.fillStyle = '#1b2030'; ctx.fillRect(x, y, tw, th);
      const im = this.thumb(a.id);
      if (im.complete && im.naturalWidth) { const k = Math.max(tw / im.naturalWidth, th / im.naturalHeight); ctx.drawImage(im, x + (tw - im.naturalWidth * k) / 2, y + (th - im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k); }
      const grd = ctx.createLinearGradient(0, y + th * 0.55, 0, y + th); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.8)');
      ctx.fillStyle = grd; ctx.fillRect(x, y, tw, th);
      ctx.restore();
      if (hov || cur) { roundRect(ctx, x, y, tw, th, 22); ctx.strokeStyle = cur ? '#34d399' : 'rgba(255,255,255,0.8)'; ctx.lineWidth = 5; ctx.stroke(); }
      text(ctx, loading ? 'جاري التحميل…' : a.name, x + tw / 2, y + th - 24, 22, { weight: 800, maxWidth: tw - 20, fit: true, dir: 'auto' });
      p.region(x, y, tw, th, () => { blip('tap', settings.sounds); this.pick(a); }, id);
    });
    text(ctx, `${this.page + 1} / ${pages} · ${list.length}`, W / 2, H - 38, 24, { color: COLORS.dim, dir: 'ltr' });
    [['chevR', W / 2 - 150, -1], ['chevL', W / 2 + 150, 1]].forEach(([ic, x, d]) => {
      const id = 'pg' + d, hov = p.isHover(id);
      ctx.beginPath(); ctx.arc(x, H - 38, 28, 0, 7); ctx.fillStyle = hov ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'; ctx.fill();
      icon(ctx, ic, x, H - 38, 26);
      p.region(x - 45, H - 76, 90, 76, () => { blip('tap', settings.sounds); this.page = (this.page + d + pages) % pages; this.redraw(); }, id);
    });
  }

  async pick(a) {
    if (this.loadingId) return;
    this.loadingId = a.id; this.redraw();
    try {
      const f = await (await fetch(`${API}/files/${a.id}`)).json();
      if (this.tab === 'hdris') {
        const url = f.hdri?.['2k']?.hdr?.url || f.hdri?.['1k']?.hdr?.url;
        if (!url) throw new Error('no hdr');
        await this.applyHdri({ id: a.id, name: a.name, url });
        this.close();
      } else {
        const g = f.gltf?.['1k']?.gltf;
        if (!g) throw new Error('no gltf');
        const includes = {}; for (const [k, v] of Object.entries(g.include || {})) includes[k] = v.url;
        this.app.windows.open({ kind: 'model', url: g.url, includes, name: a.name });
        this.app.toast('📦 ' + a.name, 2000);
        this.close();
      }
    } catch (e) { this.app.toast('تعذّر تحميل «' + a.name + '»', 2500); this.app.log('المكتبات: ' + (e.message || e)); }
    this.loadingId = null; this.redraw();
  }

  // An HDRI all around you: a big sphere inside the «من المكتبة» environment (2K: sharp enough, light on memory).
  async applyHdri(env, quiet) {
    const tex = await new RGBELoader().loadAsync(env.url);
    tex.colorSpace = THREE.LinearSRGBColorSpace;
    const g = this.app.envs.gallery;
    g.children.forEach(c => { c.geometry?.dispose(); c.material?.map?.dispose(); c.material?.dispose(); });
    g.clear();
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(60, 64, 32), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false }));
    sphere.scale.x = -1; sphere.material.side = THREE.FrontSide;   // seen from inside, not mirrored
    sphere.renderOrder = -20;
    g.add(sphere);
    g.userData.dim = 1;
    saveSettings({ environment: 'gallery', galleryEnv: { id: env.id, name: env.name, url: env.url } });
    this.app.renderEnvChoices?.();
    if (!quiet) this.app.toast('🌍 ' + env.name, 2200);
    this.app.log('بيئة من المكتبة: ' + env.name);
  }
}
