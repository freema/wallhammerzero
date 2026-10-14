// The sound, all synthesised with WebAudio from one loop of noise: wind in the rigging (louder
// and higher with the apparent wind, a whistle in a storm), water hissing past the hull (with
// the boat's speed), the sail flapping when it luffs, a bell when cargo is delivered, a thud
// when the keel hits the bottom. Nothing plays before the first click; M mutes; a hidden tab is
// silent.

export interface SoundNow {
  /** Apparent wind, m/s. */
  wind: number;
  /** Boat speed through the water, m/s. */
  speed: number;
  /** 0..1: how hard the sail is flapping. */
  luff: number;
  /** 0..1. */
  storm: number;
}

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private whistleGain!: GainNode;
  private whistleFilter!: BiquadFilterNode;
  private waterGain!: GainNode;
  private waterFilter!: BiquadFilterNode;
  private flapGain!: GainNode;
  private flapRate!: OscillatorNode;
  muted = false;

  /** Call from a click: browsers only start audio after a gesture. */
  start(): void {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(ctx.destination);
    // Two seconds of white noise, from a fixed sequence so every session sounds the same.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    let s = 0x9e3779b9;
    for (let i = 0; i < data.length; i++) {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      data[i] = ((s >>> 0) / 4294967296) * 2 - 1;
    }

    [this.windFilter, this.windGain] = this.band("bandpass", 500, 0.6);
    [this.whistleFilter, this.whistleGain] = this.band("bandpass", 1100, 9);
    [this.waterFilter, this.waterGain] = this.band("lowpass", 900, 0.5);
    // Waves slap: the water's level breathes slowly.
    const slap = ctx.createOscillator();
    slap.frequency.value = 0.35;
    const slapDepth = ctx.createGain();
    slapDepth.gain.value = 0.35;
    slap.connect(slapDepth).connect(this.waterGain.gain);
    slap.start();
    // The flap: band-passed noise chopped by a fast oscillator.
    const [, flapIn] = this.band("bandpass", 260, 1.2);
    const chop = ctx.createGain();
    chop.gain.value = 0.5;
    flapIn.disconnect();
    flapIn.connect(chop);
    this.flapRate = ctx.createOscillator();
    this.flapRate.type = "square";
    this.flapRate.frequency.value = 9;
    const chopDepth = ctx.createGain();
    chopDepth.gain.value = 0.5;
    this.flapRate.connect(chopDepth).connect(chop.gain);
    this.flapRate.start();
    this.flapGain = ctx.createGain();
    this.flapGain.gain.value = 0;
    chop.connect(this.flapGain).connect(this.master);
    flapIn.gain.value = 1;

    document.addEventListener("visibilitychange", () => this.wake());
  }

  /** Looping noise through a filter into a gain on the master; returns both. */
  private band(type: BiquadFilterType, freq: number, q: number): [BiquadFilterNode, GainNode] {
    const ctx = this.ctx as AudioContext;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    // Each source starts at a different point of the loop, so the layers do not correlate.
    src.start(0, (freq % 1.7) + 0.1);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.master);
    return [f, g];
  }

  private wake(): void {
    if (!this.ctx) return;
    if (document.hidden || this.muted) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  toggle(): boolean {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.value = this.muted ? 0 : 0.8;
    this.wake();
    return this.muted;
  }

  update(now: SoundNow): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const at = ctx.currentTime;
    const w = Math.min(30, now.wind);
    this.windGain.gain.setTargetAtTime(Math.min(0.5, 0.0009 * w * w + 0.01), at, 0.4);
    this.windFilter.frequency.setTargetAtTime(320 + w * 32, at, 0.4);
    this.whistleGain.gain.setTargetAtTime(now.storm * 0.06 + Math.max(0, w - 12) * 0.002, at, 0.6);
    this.whistleFilter.frequency.setTargetAtTime(900 + w * 28, at, 0.8);
    const v = Math.min(5, Math.abs(now.speed));
    this.waterGain.gain.setTargetAtTime(0.02 + v * 0.05, at, 0.3);
    this.waterFilter.frequency.setTargetAtTime(500 + v * 420, at, 0.3);
    this.flapGain.gain.setTargetAtTime(now.luff * Math.min(0.4, 0.004 * w * w), at, 0.08);
    this.flapRate.frequency.setTargetAtTime(6 + w * 0.5, at, 0.3);
  }

  /** A ship's bell, two strokes. */
  bell(): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    for (const delay of [0, 0.45]) {
      const t0 = ctx.currentTime + delay;
      for (const [freq, level, decay] of [
        [784, 0.22, 2.4],
        [784 * 2.76, 0.08, 1.2],
        [784 * 5.4, 0.03, 0.5],
      ] as const) {
        const o = ctx.createOscillator();
        o.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(level, t0 + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
        o.connect(g).connect(this.master);
        o.start(t0);
        o.stop(t0 + decay + 0.05);
      }
    }
  }

  /** The keel on rock: a low thump and a scrape. */
  thud(): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(90, t0);
    o.frequency.exponentialRampToValueAtTime(32, t0 + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.7, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + 0.65);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 700;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.35, t0);
    sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
    src.connect(f).connect(sg).connect(this.master);
    src.start(t0, 0.3);
    src.stop(t0 + 1);
  }
}
