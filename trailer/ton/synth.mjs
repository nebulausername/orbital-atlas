// Offline score for the Orbital Atlas trailer — every sound is synthesised here.
//   node trailer/ton/synth.mjs  →  trailer/public/score.wav (48 kHz, stereo, 16-bit)
// Timing comes from trailer/timeline.json, the same file the video edit reads.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const TL = JSON.parse(readFileSync(new URL('../timeline.json', import.meta.url)));
const B = TL.beats;
const SR = 48000;
const LEN = Math.ceil((TL.duration + 0.4) * SR);
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- buses
const bus = () => ({ L: new Float32Array(LEN), R: new Float32Array(LEN) });
const dry = bus(); // straight to master
const verb = bus(); // reverb send
const dly = bus(); // ping-pong delay send

let seed = 12345;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const midi = (n) => 440 * 2 ** ((n - 69) / 12);
const S = (t) => Math.max(0, Math.round(t * SR));

/** add a mono signal fn(i, tLocal) into a bus with pan (−1..1) */
function add(b, t0, dur, fn, gain = 1, pan = 0) {
  const s0 = S(t0), n = S(dur);
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4), gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < n && s0 + i < LEN; i++) {
    const v = fn(i, i / SR);
    b.L[s0 + i] += v * gl;
    b.R[s0 + i] += v * gr;
  }
}

// ------------------------------------------------------------- DSP bits
class Biquad {
  constructor(type, f, q = 0.707) {
    this.type = type;
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.set(f, q);
  }
  set(f, q = 0.707) {
    const w = (TAU * Math.min(f, SR * 0.45)) / SR, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q);
    let b0, b1, b2;
    if (this.type === 'lp') [b0, b1, b2] = [(1 - c) / 2, 1 - c, (1 - c) / 2];
    else if (this.type === 'hp') [b0, b1, b2] = [(1 + c) / 2, -(1 + c), (1 + c) / 2];
    else [b0, b1, b2] = [a, 0, -a]; // band-pass (0 dB peak)
    const a0 = 1 + a;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = (-2 * c) / a0; this.a2 = (1 - a) / a0;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}
const saw = (ph) => 2 * (ph - Math.floor(ph + 0.5));
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
const adsr = (t, dur, a, r) => Math.min(1, t / a) * Math.min(1, Math.max(0, (dur - t) / r));

// ------------------------------------------------------------ instruments
/** Low drone: D1 + A1, slowly breathing; brightness follows `bright(t)`. */
function drone(t0, dur, gain, bright) {
  const f = new Biquad('lp', 200);
  let p1 = 0, p2 = 0, p3 = 0;
  add(dry, t0, dur, (i, t) => {
    if (i % 64 === 0) f.set(90 + 900 * bright(t0 + t), 0.9);
    p1 += midi(26) / SR; p2 += (midi(33) * 1.002) / SR; p3 += (midi(38) * 0.998) / SR;
    const v = Math.sin(TAU * p1) * 0.6 + saw(p2 % 1) * 0.18 + saw(p3 % 1) * 0.12;
    return f.run(v) * adsr(t, dur, 1.5, 1.2) * (0.85 + 0.15 * Math.sin(TAU * 0.13 * t));
  }, gain);
}

/** Sub boom with a pitch drop and a click on top. */
function boom(t0, gain = 1, f0 = 90, f1 = 34, len = 1.6) {
  let ph = 0;
  add(dry, t0, len, (i, t) => {
    const f = f1 + (f0 - f1) * Math.exp(-t * 9);
    ph += f / SR;
    return Math.tanh(Math.sin(TAU * ph) * 1.6) * Math.exp(-t / (len * 0.35)) + rand() * Math.exp(-t * 180) * 0.4;
  }, gain);
  add(verb, t0, len, (i, t) => Math.sin(TAU * 60 * t) * Math.exp(-t * 4), gain * 0.2);
}

/** The "braam": detuned saws through an opening and closing low-pass, driven. */
function braam(t0, dur, gain, notes = [26, 38, 45, 50]) {
  const filters = [new Biquad('lp', 200, 1.2), new Biquad('lp', 200, 1.2)];
  const phases = notes.flatMap(() => [Math.random(), Math.random(), Math.random()]);
  for (const [side, pan] of [[0, -0.5], [1, 0.5]]) {
    add(dry, t0, dur, (i, t) => {
      if (i % 64 === 0) filters[side].set(160 + 2600 * Math.exp(-t * 1.6) * Math.min(1, t * 12), 1.3);
      let v = 0;
      notes.forEach((n, k) => {
        for (let d = 0; d < 3; d++) {
          const idx = k * 3 + d;
          phases[idx] += (midi(n) * (1 + (d - 1) * 0.006 + side * 0.002)) / SR;
          v += saw(phases[idx] % 1) / (k + 1.4);
        }
      });
      return Math.tanh(filters[side].run(v) * 1.8) * adsr(t, dur, 0.02, dur * 0.7);
    }, gain, pan);
  }
  add(verb, t0, dur, (i, t) => Math.tanh(saw((midi(38) * t) % 1)) * Math.exp(-t * 1.5) * 0.4, gain * 0.5);
}

/** Shepard–Risset glissando: endlessly rising, here for `dur` seconds. */
function shepard(t0, dur, gain) {
  const voices = 7;
  const ph = new Array(voices).fill(0);
  add(dry, t0, dur, (i, t) => {
    const k = t / dur;
    let v = 0;
    for (let n = 0; n < voices; n++) {
      const pos = (n / voices + k * 1.6) % 1; // position in a 7-octave window
      const f = 40 * 2 ** (pos * 7);
      ph[n] += f / SR;
      const amp = Math.exp(-(((pos - 0.5) / 0.22) ** 2));
      v += Math.sin(TAU * ph[n]) * amp;
    }
    return v * (0.15 + 0.85 * k ** 2) * Math.min(1, (dur - t) / 0.05);
  }, gain);
}

/** Filtered noise sweep (riser, whoosh). */
function sweep(t0, dur, f0, f1, gain, q = 1.2, pan = 0, shape = (k) => Math.sin(Math.PI * k)) {
  const f = new Biquad('bp', f0, q);
  add(dry, t0, dur, (i, t) => {
    const k = t / dur;
    if (i % 32 === 0) f.set(f0 * (f1 / f0) ** k, q);
    return f.run(rand()) * shape(k);
  }, gain, pan);
  add(verb, t0, dur, (i, t) => rand() * 0.2 * Math.sin((Math.PI * t) / dur), gain * 0.15);
}

/** Glassy pluck for the arpeggio and the layer ticks. */
function pluck(t0, note, gain, pan = 0, decay = 0.35, toDelay = 0.4) {
  const f = midi(note);
  const fn = (i, t) => (Math.sin(TAU * f * t) + 0.35 * Math.sin(TAU * f * 2.01 * t) * Math.exp(-t * 8) + 0.15 * Math.sin(TAU * f * 3.99 * t) * Math.exp(-t * 14)) * env(t, 0.003, decay);
  add(dry, t0, decay * 6, fn, gain, pan);
  add(dly, t0, decay * 6, fn, gain * toDelay, pan);
  add(verb, t0, decay * 6, fn, gain * 0.35, pan);
}

function tick(t0, gain = 0.12, f = 2600) {
  add(dry, t0, 0.05, (i, t) => Math.sin(TAU * f * t) * Math.exp(-t * 120) + rand() * Math.exp(-t * 400) * 0.3, gain, rand() * 0.4);
}

function bell(t0, note, gain) {
  const f = midi(note);
  const partials = [[1, 1, 3.2], [2.0, 0.6, 2.2], [2.76, 0.4, 1.5], [5.4, 0.25, 0.8], [8.93, 0.12, 0.5]];
  const fn = (i, t) => partials.reduce((s, [r, a, d]) => s + Math.sin(TAU * f * r * t) * a * Math.exp(-t / d), 0) * Math.min(1, t * 400);
  add(dry, t0, 5, fn, gain * 0.6);
  add(verb, t0, 5, fn, gain * 0.7);
}

/** Warm pad chord (detuned saws, slow filter, a touch of chorus by detune). */
function pad(t0, dur, notes, gain, bright = 1200) {
  const f = [new Biquad('lp', bright, 0.6), new Biquad('lp', bright, 0.6)];
  const ph = notes.flatMap(() => [Math.random(), Math.random()]);
  for (const [side, pan] of [[0, -0.6], [1, 0.6]]) {
    add(dry, t0, dur, (i, t) => {
      let v = 0;
      notes.forEach((n, k) => {
        for (let d = 0; d < 2; d++) {
          const idx = k * 2 + d;
          ph[idx] += (midi(n) * (1 + (d ? 0.004 : -0.004) * (side ? 1 : -1))) / SR;
          v += saw(ph[idx] % 1);
        }
      });
      if (i % 64 === 0) f[side].set(bright * (0.7 + 0.3 * Math.sin(TAU * 0.2 * t + side)), 0.6);
      return f[side].run(v) * 0.085 * adsr(t, dur, 0.8, 1.2);
    }, gain, pan);
    add(verb, t0, dur, (i, t) => 0, 0);
  }
  // send a softened copy to the reverb
  const fv = new Biquad('lp', bright * 0.7);
  let pv = 0;
  add(verb, t0, dur, (i, t) => {
    pv += midi(notes[0] + 12) / SR;
    return fv.run(saw(pv % 1)) * 0.1 * adsr(t, dur, 1, 1);
  }, gain * 0.6);
}

/** Choir-ish "aah": saw chord through two vowel formants. */
function choir(t0, dur, notes, gain) {
  const fa = new Biquad('bp', 800, 4), fb = new Biquad('bp', 1150, 5), fc = new Biquad('bp', 2900, 6);
  const ph = notes.map(() => Math.random());
  add(verb, t0, dur, (i, t) => {
    let v = 0;
    notes.forEach((n, k) => {
      const vib = 1 + 0.004 * Math.sin(TAU * (5.1 + k * 0.3) * t);
      ph[k] += (midi(n) * vib) / SR;
      v += saw(ph[k] % 1);
    });
    return (fa.run(v) + 0.7 * fb.run(v) + 0.25 * fc.run(v)) * adsr(t, dur, 1.2, 1.6) * 0.5;
  }, gain);
  const fa2 = new Biquad('bp', 800, 4);
  const ph2 = notes.map(() => Math.random());
  add(dry, t0, dur, (i, t) => {
    let v = 0;
    notes.forEach((n, k) => {
      ph2[k] += (midi(n) * 1.003) / SR;
      v += saw(ph2[k] % 1);
    });
    return fa2.run(v) * adsr(t, dur, 1.4, 1.6) * 0.35;
  }, gain * 0.6);
}

// ---------------------------------------------------------------- score
const T = TL.duration;
// 1. the bed: a drone that brightens with the zoom and dims for the end card
drone(0, T, 0.3, (t) => (t < B.zoomStart ? 0.05 : t < B.galaxyHit ? 0.05 + 0.6 * ((t - B.zoomStart) / (B.galaxyHit - B.zoomStart)) ** 2 : t < B.endHit ? 0.25 : 0.15));

// 2. the hook: two heartbeats on the two lines of text
boom(B.hook1, 0.7, 70, 32, 1.4);
tick(B.hook1, 0.08, 3200);
boom(B.hook2, 0.85, 80, 32, 1.6);
tick(B.hook2, 0.1, 3600);
pad(0.3, B.zoomStart + 0.4, [62, 69, 74], 0.12, 900);

// 3. powers of ten: Shepard climb + noise riser, cut to a breath of silence, then the braam
shepard(B.zoomStart, B.galaxyHit - B.zoomStart - 0.06, 0.42);
sweep(B.zoomStart, B.galaxyHit - B.zoomStart - 0.06, 180, 7000, 0.7, 1.6, 0, (k) => k ** 2.2);
for (let k = 0; k < 10; k++) tick(B.zoomStart + (k / 10) ** 0.7 * (B.galaxyHit - B.zoomStart - 0.2), 0.06 + 0.01 * k, 2000 + k * 220);
braam(B.galaxyHit, 3.2, 0.42);
boom(B.galaxyHit, 1.0, 110, 30, 2.4);
add(verb, B.galaxyHit, 0.05, () => rand(), 0.8);
pad(B.galaxyHit + 0.2, B.saturnDive - B.galaxyHit + 0.8, [74, 81, 86], 0.18, 2400);

// 4. Saturn: whoosh into the dive, then a glassy arpeggio over a pulsing bass
sweep(B.saturnDive - 0.5, 1.4, 300, 2600, 0.5, 1.0, -0.3);
const ARP = [62, 65, 69, 72, 74, 76, 74, 69, 65, 69, 72, 77, 76, 72, 69, 65];
const step16 = 60 / 112 / 4;
for (let k = 0; k * step16 < B.cutOpen - 0.35 - B.arpStart; k++) {
  const t = B.arpStart + k * step16;
  pluck(t, ARP[k % ARP.length], 0.22 * Math.min(1, k / 8), k % 2 ? 0.35 : -0.35, 0.22);
  if (k % 2 === 0) {
    const ph = { v: 0 };
    add(dry, t, step16 * 1.8, (i, tt) => {
      ph.v += midi(k % 16 < 8 ? 38 : 41) / SR;
      return Math.tanh(saw(ph.v % 1) * 2) * Math.exp(-tt * 9) * 0.6;
    }, 0.26);
  }
}
pad(B.arpStart, B.cutOpen - B.arpStart + 0.5, [50, 57, 60, 65], 0.2, 900);

// 5. the cut: a riser into a heavy "thunk", then one tick per layer label
sweep(B.cutOpen - 0.6, 0.62, 400, 5000, 0.32, 2.0, 0, (k) => k ** 3);
boom(B.cutOpen, 1.0, 140, 38, 1.8);
braam(B.cutOpen, 1.6, 0.18, [26, 33]);
B.layerTicks.forEach((t, i) => pluck(t, 86 - i * 3, 0.1, i % 2 ? 0.4 : -0.4, 0.18, 0.2));
pad(B.cutOpen + 0.1, B.rewindStart - B.cutOpen + 0.3, [50, 53, 57, 64], 0.2, 1400);

// 6. rewind forty years: reversed swells, a whirring tape, clock ticks racing then slowing
const rw0 = B.rewindStart, rw1 = B.rewindEnd;
add(dry, rw0, rw1 - rw0, (i, t) => {
  const k = t / (rw1 - rw0);
  const speed = Math.sin(Math.PI * k); // fastest in the middle, like the date counter
  const f = 120 + 900 * speed;
  return Math.sin(TAU * f * t + 3 * Math.sin(TAU * 7 * t)) * 0.12 * speed;
}, 0.9);
sweep(rw0, rw1 - rw0, 2400, 300, 0.55, 0.9, 0.2);
{
  let t = rw0;
  while (t < rw1) {
    const k = (t - rw0) / (rw1 - rw0);
    tick(t, 0.1, 3000 - 1200 * k);
    t += 0.03 + 0.25 * (1 - Math.sin(Math.PI * k)) ** 2;
  }
}
for (let k = 0; k < 12; k++) {
  // arpeggio notes played "backwards": swelling in, cut off
  const t = rw0 + 0.15 + k * 0.28;
  const n = ARP[(15 - k) % 16] - 12;
  add(dry, t, 0.28, (i, tt) => Math.sin(TAU * midi(n) * tt) * (tt / 0.28) ** 3 * 0.5, 0.2, k % 2 ? 0.5 : -0.5);
}
boom(B.halley, 0.6, 70, 40, 1.2);
bell(B.halley + 0.02, 81, 0.09);
pad(B.halley, B.accuracy - B.halley + 0.6, [57, 62, 69, 74], 0.18, 2000);

// 7. accuracy: a calm metronome, like a clock that keeps perfect time
for (let k = 0; k < 8; k++) tick(B.accuracy + k * (60 / 100), 0.1, 1500);
pad(B.accuracy, B.endHit - B.accuracy + 0.4, [50, 57, 60, 64, 69], 0.22, 1000);

// 8. the end card: final hit, choir, and a bell for the address
braam(B.endHit, 3.6, 0.32, [26, 38, 45, 50, 57]);
boom(B.endHit, 1.0, 100, 30, 3.0);
choir(B.endHit + 0.1, T - B.endHit, [50, 57, 62, 65, 69], 0.3);
bell(B.urlBell, 86, 0.11);
bell(B.urlBell + 0.18, 81, 0.07);

// ---------------------------------------------------------------- effects
// ping-pong delay (dotted eighth at 112 BPM)
{
  const d = S((60 / 112) * 0.75), fb = 0.42;
  const bl = new Float32Array(LEN), br = new Float32Array(LEN);
  for (let i = 0; i < LEN; i++) {
    const inL = dly.L[i] + (i >= d ? br[i - d] * fb : 0);
    const inR = dly.R[i] + (i >= d ? bl[i - d] * fb : 0);
    bl[i] = inL;
    br[i] = inR;
    if (i >= d) {
      dry.L[i] += bl[i - d] * 0.5;
      dry.R[i] += br[i - d] * 0.5;
      verb.L[i] += bl[i - d] * 0.15;
      verb.R[i] += br[i - d] * 0.15;
    }
  }
}
// Freeverb (Jezar's tuning), large room, damped
function freeverb(inL, inR, room = 0.92, damp = 0.35) {
  const combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((v) => Math.round((v * SR) / 44100));
  const apT = [556, 441, 341, 225].map((v) => Math.round((v * SR) / 44100));
  const out = [new Float32Array(LEN), new Float32Array(LEN)];
  [inL, inR].forEach((inp, ch) => {
    const spread = ch ? Math.round((23 * SR) / 44100) : 0;
    const combs = combT.map((n) => ({ buf: new Float32Array(n + spread), i: 0, store: 0 }));
    const aps = apT.map((n) => ({ buf: new Float32Array(n + spread), i: 0 }));
    for (let s = 0; s < LEN; s++) {
      const x = inp[s] * 0.015;
      let acc = 0;
      for (const c of combs) {
        const y = c.buf[c.i];
        c.store = y * (1 - damp) + c.store * damp;
        c.buf[c.i] = x + c.store * room;
        c.i = (c.i + 1) % c.buf.length;
        acc += y;
      }
      for (const a of aps) {
        const b = a.buf[a.i];
        a.buf[a.i] = acc + b * 0.5;
        acc = b - acc;
        a.i = (a.i + 1) % a.buf.length;
      }
      out[ch][s] = acc;
    }
  });
  return out;
}
const [wl, wr] = freeverb(verb.L, verb.R);

// ---------------------------------------------------------------- master
const L = new Float32Array(LEN), R = new Float32Array(LEN);
const hp = [new Biquad('hp', 24), new Biquad('hp', 24)];
// section gain automation (dB), crossfaded over 120 ms: the dynamic contour of the edit
const AUTO = [
  [0, 0],
  [B.arpStart, 3],
  [B.cutOpen - 0.6, 0],
  [B.rewindStart, 8],
  [B.halley, 4],
  [B.accuracy, 7],
  [B.endHit, 0],
];
const autoGain = (t) => {
  let g = 0;
  for (let k = 0; k < AUTO.length; k++) {
    const [t0, db] = AUTO[k];
    const prev = k ? AUTO[k - 1][1] : 0;
    if (t >= t0) g = prev + (db - prev) * Math.min(1, (t - t0) / 0.12);
  }
  return 10 ** (g / 20);
};
for (let i = 0; i < LEN; i++) {
  const t = i / SR;
  const fade = Math.min(1, t / 0.05) * (t > B.fadeOut ? Math.max(0, 1 - (t - B.fadeOut) / (TL.duration + 0.3 - B.fadeOut)) : 1);
  const ag = autoGain(t);
  L[i] = hp[0].run(dry.L[i] + wl[i] * 2.2) * fade * ag;
  R[i] = hp[1].run(dry.R[i] + wr[i] * 2.2) * fade * ag;
}
// gentle bus compression (RMS follower) and a soft limiter
{
  let rms = 0;
  const a = Math.exp(-1 / (0.08 * SR));
  for (let i = 0; i < LEN; i++) {
    const p = (L[i] * L[i] + R[i] * R[i]) / 2;
    rms = a * rms + (1 - a) * p;
    const lvl = Math.sqrt(rms) + 1e-9;
    const g = lvl > 0.42 ? (0.42 / lvl) ** 0.35 : 1;
    L[i] *= g;
    R[i] *= g;
  }
}
let peak = 0;
for (let i = 0; i < LEN; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const norm = 0.89 / peak;
const pcm = Buffer.alloc(44 + LEN * 4);
pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + LEN * 4, 4); pcm.write('WAVE', 8); pcm.write('fmt ', 12);
pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22); pcm.writeUInt32LE(SR, 24);
pcm.writeUInt32LE(SR * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(LEN * 4, 40);
for (let i = 0; i < LEN; i++) {
  pcm.writeInt16LE(Math.round(Math.tanh(L[i] * norm * 1.1) * 32000), 44 + i * 4);
  pcm.writeInt16LE(Math.round(Math.tanh(R[i] * norm * 1.1) * 32000), 46 + i * 4);
}
mkdirSync(new URL('../public/', import.meta.url), { recursive: true });
writeFileSync(new URL('../public/score.wav', import.meta.url), pcm);
console.log(`score.wav ${(LEN / SR).toFixed(2)} s, peak before norm ${peak.toFixed(3)}`);
