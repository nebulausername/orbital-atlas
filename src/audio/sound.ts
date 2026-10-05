/**
 * Generative sound, synthesised in the browser (no audio files):
 *  - a slow pad whose brightness follows the zoom level (dark at galactic scales)
 *  - a filtered-noise whoosh for flights, ticks for controls, a bell for selections
 * Off until the user switches it on (browsers require a gesture anyway).
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private padFilter!: BiquadFilterNode;
  private padGain!: GainNode;
  private wet!: GainNode;
  private noise!: AudioBuffer;
  enabled = false;

  private ensure() {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(comp).connect(ctx.destination);

    // reverb from a synthetic impulse response
    const len = ctx.sampleRate * 4.5;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.55;
    conv.connect(this.wet).connect(this.master);
    this.reverb = conv;

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    // pad: an open voicing in D with a ninth, gently detuned
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 600;
    this.padFilter.Q.value = 0.7;
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.22;
    this.padFilter.connect(this.padGain);
    this.padGain.connect(this.master);
    this.padGain.connect(conv);
    const notes = [73.42, 110.0, 164.81, 220.0, 329.63];
    notes.forEach((f, i) => {
      for (const det of [-4, 5]) {
        const o = ctx.createOscillator();
        o.type = i < 2 ? 'sine' : 'triangle';
        o.frequency.value = f;
        o.detune.value = det + i;
        const g = ctx.createGain();
        g.gain.value = (i < 2 ? 0.16 : 0.07) / 2;
        // slow independent swells
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.03 + i * 0.017;
        const lg = ctx.createGain();
        lg.gain.value = g.gain.value * 0.8;
        lfo.connect(lg).connect(g.gain);
        o.connect(g).connect(this.padFilter);
        o.start();
        lfo.start();
      }
    });
    // a whisper of wind
    const wind = ctx.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 420;
    wf.Q.value = 0.6;
    const wg = ctx.createGain();
    wg.gain.value = 0.018;
    wind.connect(wf).connect(wg).connect(this.master);
    wind.start();
    return ctx;
  }
  private reverb!: ConvolverNode;

  async setEnabled(on: boolean) {
    this.enabled = on;
    const ctx = this.ensure();
    if (ctx.state === 'suspended') await ctx.resume();
    const now = ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(on ? 0.7 : 0, now, on ? 0.8 : 0.25);
  }

  /** Map the camera's log distance (AU) to the pad's brightness. */
  setZoom(logD: number) {
    if (!this.ctx || !this.enabled) return;
    const x = Math.min(1, Math.max(0, (logD + 4) / 14)); // 0 close … 1 galactic
    const f = 1400 * Math.pow(1 - x, 1.6) + 160;
    this.padFilter.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.4);
  }

  whoosh(duration: number) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(180, now);
    bp.frequency.exponentialRampToValueAtTime(1600, now + duration * 0.45);
    bp.frequency.exponentialRampToValueAtTime(140, now + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.16, now + duration * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    src.connect(bp).connect(g);
    g.connect(this.master);
    g.connect(this.reverb);
    src.start(now);
    src.stop(now + duration + 0.1);
  }

  tick() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1850, now);
    o.frequency.exponentialRampToValueAtTime(900, now + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.06, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    o.connect(g).connect(this.master);
    o.start(now);
    o.stop(now + 0.08);
  }

  bell() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    [880, 1318.5, 1760 * 1.002].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.07 / (i + 1), now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.6 - i * 0.3);
      o.connect(g);
      g.connect(this.master);
      g.connect(this.reverb);
      o.start(now);
      o.stop(now + 1.7);
    });
  }

  thunk() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, now);
    o.frequency.exponentialRampToValueAtTime(42, now + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    o.connect(g);
    g.connect(this.master);
    g.connect(this.reverb);
    o.start(now);
    o.stop(now + 0.75);
    this.whoosh(1.2);
  }
}
