// «غرفة الاجتماع»: five Memoji characters float in a half circle in front of you - المبتكر، المنطقي، الرياضي،
// المشجّع، المتعصّب. Ask anything by voice: ONE request to the assistant returns a short answer in each one's
// voice (cheap), then they speak in turn - the speaker's mouth moves and the others turn to look at it.
import * as THREE from 'three';
import { CanvasPanel, panelGlass } from './ui.js';
import { label, SYS } from './vos.js';
import { settings } from './config.js';

export const PERSONAS = [
  { id: 'innovator', name: 'المبتكر', color: '#bf5af2', voice: { pitch: 1.18, rate: 1.06 }, style: 'يقترح فكرة جديدة جريئة وغير متوقعة',
    cfg: { skin: '#d39b74', hair: 'wavy', hairColor: '#3b2516', eyewear: 'round', frame: '#c9a35a', mouth: 'smile', head: 'none', facial: 'none', brows: 'arched' } },
  { id: 'logical', name: 'المنطقي', color: '#0a84ff', voice: { pitch: 0.92, rate: 0.98 }, style: 'يحلل بالمنطق والأرقام: الإيجابيات والسلبيات والخلاصة',
    cfg: { skin: '#e8b796', hair: 'side', hairColor: '#1b130e', eyewear: 'square', frame: '#2a2a2e', mouth: 'neutral', head: 'none', facial: 'stubble', brows: 'straight' } },
  { id: 'athlete', name: 'الرياضي', color: '#30d158', voice: { pitch: 1.0, rate: 1.12 }, style: 'ينظر من زاوية الصحة واللياقة والانضباط والطاقة',
    cfg: { skin: '#8d5634', hair: 'buzz', head: 'cap', headColor: '#8a1c1c', mouth: 'grin', earring: 'airpods', facial: 'none', brows: 'medium' } },
  { id: 'cheer', name: 'المشجّع', color: '#ff9f0a', voice: { pitch: 1.25, rate: 1.1 }, style: 'يشجّعك ويحفّزك بحماس وإيجابية',
    cfg: { skin: '#c48a63', hair: 'curly', hairColor: '#2a1c14', mouth: 'grin', head: 'none', facial: 'none', blush: 0.85, lashes: true } },
  { id: 'fanatic', name: 'المتعصّب', color: '#ff453a', voice: { pitch: 0.82, rate: 1.04 }, style: 'متعصّب لرأيه ولفريقه، يجادل بحماس وطرافة ولا يقبل الرأي الآخر بسهولة',
    cfg: { skin: '#a86d4b', hair: 'short', head: 'kumma', headColor: '#f4f1ea', mouth: 'smile', facial: 'beard', facialColor: '#160f0a', brows: 'thick' } },
];
const SIZE = 0.1, DIST = 1.45, ANG = [-0.56, -0.28, 0, 0.28, 0.56];   // right to left (Arabic reading order)

export class Meeting {
  constructor(app) { this.app = app; this.open = false; this.group = new THREE.Group(); this.members = []; this.speaker = -1; this.queue = []; }
  async start() {
    if (this.open) return;
    this.open = true;
    const app = this.app, M = await import('./memoji.js'), env = M.envFor(app.renderer.renderer);
    app.windows.root.add(this.group);
    // half a circle in front of you, at eye height
    const yaw = app.windows.forwardYaw(), h = app.windows.headLocal();
    this.caption = new CanvasPanel(1.1, 0.16, (ctx, W, H) => this.drawCaption(ctx, W, H), { pxPerM: 1200 });
    this.caption.mesh.position.set(h.x - Math.sin(yaw) * DIST, h.y - 0.3, h.z - Math.cos(yaw) * DIST);
    this.caption.mesh.lookAt(h.x, h.y - 0.3, h.z); this.group.add(this.caption.mesh);
    app.toast('👥 غرفة الاجتماع: اسأل أي سؤال وسيجيب الخمسة', 3500);
    // the heads are built one at a time (each is heavy), so the room appears without a freeze
    for (let i = 0; i < PERSONAS.length && this.open; i++) {
      await new Promise(r => setTimeout(r, 30));
      const p = PERSONAS[i], F = new M.Floating({ ...M.DEFAULT, ...p.cfg }, env, { lite: true });
      const a = yaw + ANG[i], pos = new THREE.Vector3(h.x - Math.sin(a) * DIST, h.y + 0.02, h.z - Math.cos(a) * DIST);
      F.group.position.copy(pos); F.group.scale.setScalar(SIZE);
      const tag = new CanvasPanel(0.3, 0.06, (ctx, W, H) => { panelGlass(ctx, 0, 0, W, H, H / 2); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(W - H * 0.55, H / 2, H * 0.17, 0, 7); ctx.fill(); label(ctx, p.name, W / 2, H / 2, H * 0.48, { weight: 800, color: '#fff' }); }, { pxPerM: 1200 });
      tag.mesh.position.copy(pos).add(new THREE.Vector3(0, -SIZE * 1.45, 0)); tag.mesh.lookAt(h.x, tag.mesh.position.y, h.z);
      this.group.add(F.group, tag.mesh);
      this.members.push({ p, F, tag, pos });
    }
  }
  stop() {
    this.open = false; try { speechSynthesis.cancel(); } catch {}
    this.members.forEach(m => { m.F.group.removeFromParent(); m.tag.mesh.removeFromParent(); });
    this.members = []; this.caption?.mesh.removeFromParent(); this.group.removeFromParent(); this.speaker = -1; this.text = '';
    this.app.toast('انتهى الاجتماع', 1500);
  }
  drawCaption(ctx, W, H) {
    if (!this.text) return;
    panelGlass(ctx, 0, 0, W, H, 40);
    const p = PERSONAS[this.speaker];
    if (p) label(ctx, p.name, W - 30, H * 0.28, H * 0.2, { weight: 800, color: p.color, align: 'right' });
    label(ctx, this.text, W - 30, H * 0.64, H * 0.2, { weight: 600, color: '#fff', align: 'right', maxWidth: W - 60, wrap: true });
  }
  // one question → one request → five short answers, spoken in turn
  async ask(q, only = null) {
    if (!this.open) await this.start();
    const who = only ? PERSONAS.filter(p => p.id === only) : PERSONAS;
    this.text = '…'; this.speaker = -1; this.caption.redraw();
    const prompt = `اجتماع في غرفة واحدة. السؤال: «${q}».\nأجب بـ ${who.length} أسطر فقط، كل سطر يبدأ باسم الشخصية ثم نقطتين ثم جملة أو جملتين قصيرتين بأسلوبها:\n` + who.map(p => `${p.name}: ${p.style}`).join('\n') + `\nلا تكرر نفس الفكرة بين الشخصيات، ولا تكتب أي شيء آخر.`;
    let lines = {};
    try {
      const r = await (await fetch('https://studio.c-p.workers.dev/ask', { method: 'POST', body: JSON.stringify({ q: prompt, app: 'madar', context: this.app.hub?.context?.() || '' }) })).json();
      const say = String(r.say || '');
      for (const p of who) { const m = say.match(new RegExp(p.name.replace(/ّ/g, 'ّ?') + '\\s*[:：]\\s*([^\\n]+)')); if (m) lines[p.id] = m[1].replace(/\s*(المبتكر|المنطقي|الرياضي|المشج.?ع|المتعص.?ب)\s*[:：].*$/, '').trim(); }
      if (!Object.keys(lines).length && say) lines[who[0].id] = say;
    } catch { this.text = 'المساعد غير متاح الآن'; this.caption.redraw(); return; }
    for (const p of who) { const t = lines[p.id]; if (t) await this.say(PERSONAS.indexOf(p), t); }
    this.speaker = -1; this.caption.redraw();
  }
  say(i, text) {
    return new Promise(res => {
      this.speaker = i; this.text = text; this.caption.redraw();
      const p = PERSONAS[i];
      try {
        const u = new SpeechSynthesisUtterance(text); u.lang = 'ar-SA'; u.pitch = p.voice.pitch; u.rate = p.voice.rate;
        u.onend = u.onerror = () => setTimeout(res, 250); speechSynthesis.speak(u);
        setTimeout(res, 2500 + text.length * 90);   // never stuck if the voice never ends
      } catch { setTimeout(res, 1500 + text.length * 60); }
    });
  }
  update(now) {
    if (!this.open) return;
    const h = this.app.windows.headLocal(), sp = this.members[this.speaker];
    this.members.forEach((m, i) => {
      // the speaker looks at you and talks; the others turn toward the speaker
      const look = !sp || i === this.speaker ? h : sp.pos;
      let talking = false; if (i === this.speaker) { try { talking = speechSynthesis.speaking; } catch {} }
      m.F.update(now, this.app.windows.root.localToWorld(look.clone()), talking);
      const s = SIZE * (i === this.speaker ? 1.15 : 1); m.F.group.scale.setScalar(m.F.group.scale.x + (s - m.F.group.scale.x) * 0.15);
    });
  }
}
