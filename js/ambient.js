// Soft sound of a place, made on the fly with WebAudio (nothing to download, almost no CPU):
// rain on the window, a crackling fireplace, a quiet night with crickets and wind, the hum of a library / space.
import { audioContext } from './ui.js';

export class Ambient {
  constructor() { this.kind = 'off'; this.nodes = []; this.timers = []; }
  buffer(a, color, secs = 4) {
    const len = Math.floor(a.sampleRate * secs), b = a.createBuffer(1, len, a.sampleRate), d = b.getChannelData(0);
    let last = 0, p0 = 0, p1 = 0, p2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (color === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else if (color === 'pink') { p0 = 0.99765 * p0 + w * 0.099046; p1 = 0.963 * p1 + w * 0.2965164; p2 = 0.57 * p2 + w * 1.0526913; d[i] = (p0 + p1 + p2 + w * 0.1848) * 0.11; }
      else d[i] = w;
    }
    // fade the loop's ends together so it never clicks
    for (let i = 0; i < 2000; i++) { const k = i / 2000; d[i] *= k; d[len - 1 - i] *= k; }
    return b;
  }
  src(a, buf) { const s = a.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); this.nodes.push(s); return s; }
  filter(a, type, f, q = 0.7) { const n = a.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; this.nodes.push(n); return n; }
  gain(a, v) { const g = a.createGain(); g.gain.value = v; this.nodes.push(g); return g; }
  set(kind) {
    this.stop(); this.kind = kind || 'off';
    if (this.kind === 'off') return;
    const a = audioContext(); if (!a) return;
    try { a.resume(); } catch {}
    const out = this.gain(a, 0); out.connect(a.destination);
    out.gain.setValueAtTime(0, a.currentTime); out.gain.linearRampToValueAtTime(0.55, a.currentTime + 2.5);
    this.out = out;
    const lfo = (target, rate, depth) => { const o = a.createOscillator(); o.frequency.value = rate; const g = this.gain(a, depth); o.connect(g).connect(target); o.start(); this.nodes.push(o); };
    if (this.kind === 'rain') {
      this.src(a, this.buffer(a, 'pink')).connect(this.filter(a, 'bandpass', 1400, 0.5)).connect(this.gain(a, 0.5)).connect(out);
      this.src(a, this.buffer(a, 'brown', 5)).connect(this.filter(a, 'lowpass', 420)).connect(this.gain(a, 0.55)).connect(out);
      const drops = () => { if (this.kind !== 'rain') return; this.burst(a, 0.012, 'highpass', 2500 + Math.random() * 3000, 0.08 + Math.random() * 0.12); this.timers.push(setTimeout(drops, 30 + Math.random() * 160)); };
      drops();
    } else if (this.kind === 'fire') {
      const rumble = this.gain(a, 0.7);
      this.src(a, this.buffer(a, 'brown', 5)).connect(this.filter(a, 'lowpass', 300)).connect(rumble).connect(out);
      lfo(rumble.gain, 0.3, 0.25);
      const crackle = () => { if (this.kind !== 'fire') return; const n = 1 + (Math.random() * 3 | 0); for (let i = 0; i < n; i++) setTimeout(() => this.burst(a, 0.004 + Math.random() * 0.01, 'highpass', 1800 + Math.random() * 2500, 0.12 + Math.random() * 0.3), i * (15 + Math.random() * 40)); this.timers.push(setTimeout(crackle, 60 + Math.random() * 500)); };
      crackle();
    } else if (this.kind === 'night') {
      const wind = this.gain(a, 0.35);
      this.src(a, this.buffer(a, 'brown', 6)).connect(this.filter(a, 'lowpass', 520)).connect(wind).connect(out);
      lfo(wind.gain, 0.07, 0.22);
      const cricket = () => {
        if (this.kind !== 'night') return;
        const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
        o.frequency.value = 4300 + Math.random() * 500; g.gain.value = 0; o.connect(g).connect(out);
        for (let i = 0; i < 3; i++) { g.gain.setValueAtTime(0, t + i * 0.06); g.gain.linearRampToValueAtTime(0.025, t + i * 0.06 + 0.01); g.gain.linearRampToValueAtTime(0, t + i * 0.06 + 0.04); }
        o.start(t); o.stop(t + 0.25);
        this.timers.push(setTimeout(cricket, 500 + Math.random() * 1400));
      };
      cricket();
    } else if (this.kind === 'hum') {
      // a large quiet room / a spaceship: very low, slowly breathing
      const hum = this.gain(a, 0.4);
      this.src(a, this.buffer(a, 'brown', 6)).connect(this.filter(a, 'lowpass', 180)).connect(hum).connect(out);
      lfo(hum.gain, 0.05, 0.15);
    }
  }
  burst(a, dur, type, f, vol) {
    if (!this.out) return;
    const len = Math.max(32, Math.floor(a.sampleRate * dur)), b = a.createBuffer(1, len, a.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const s = a.createBufferSource(); s.buffer = b;
    const fl = a.createBiquadFilter(); fl.type = type; fl.frequency.value = f;
    const g = a.createGain(); g.gain.value = vol;
    s.connect(fl).connect(g).connect(this.out); s.start();
  }
  stop() {
    this.timers.forEach(clearTimeout); this.timers = [];
    for (const n of this.nodes) { try { n.stop?.(); } catch {} try { n.disconnect(); } catch {} }
    this.nodes = []; this.out = null;
  }
}
