// Sound written as code (WebAudio, no samples): the city's drone and a slow synth pad, the hover
// car's engine, rain, Union sirens, and short cues for jobs, crashes and body-passing.

export interface AudioState {
  driving: boolean;
  speed: number;
  throttle: number;
  altitude: number;
  wanted: number;
  rain: boolean;
}

const CHORDS = [
  [45, 52, 57, 60, 64],
  [41, 48, 53, 57, 60],
  [43, 50, 55, 59, 62],
  [40, 47, 52, 55, 59],
];
const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private engine!: { osc: OscillatorNode; sub: OscillatorNode; filter: BiquadFilterNode; gain: GainNode };
  private siren!: { osc: OscillatorNode; gain: GainNode };
  private rain!: GainNode;
  private wind!: GainNode;
  private pad: OscillatorNode[] = [];
  private padFilter!: BiquadFilterNode;
  private chord = 0;
  private chordTime = 0;
  private time = 0;
  muted = false;

  /** Starts on a user gesture (browsers keep audio off until then). */
  start(): void {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);

    // A slow reverb: a noise impulse response.
    const verb = ctx.createConvolver();
    const len = ctx.sampleRate * 3;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.5;
    }
    verb.buffer = ir;
    const verbGain = ctx.createGain();
    verbGain.gain.value = 0.35;
    verb.connect(verbGain).connect(this.master);

    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    {
      const d = noise.getChannelData(0);
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        d[i] = last * 3.5;
      }
    }
    const white = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    {
      const d = white.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const loop = (buffer: AudioBuffer): AudioBufferSourceNode => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.start();
      return src;
    };

    // The city: brown-noise rumble and wind that grows with altitude.
    this.wind = ctx.createGain();
    this.wind.gain.value = 0.25;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = "lowpass";
    windFilter.frequency.value = 420;
    loop(noise).connect(windFilter).connect(this.wind).connect(this.master);

    // Rain: filtered white noise.
    this.rain = ctx.createGain();
    this.rain.gain.value = 0;
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = "highpass";
    rainFilter.frequency.value = 2400;
    loop(white).connect(rainFilter).connect(this.rain).connect(this.master);

    // The pad: five detuned saws through a slowly breathing low-pass, into the reverb.
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = "lowpass";
    this.padFilter.frequency.value = 700;
    this.padFilter.Q.value = 2;
    const padGain = ctx.createGain();
    padGain.gain.value = 0.045;
    this.padFilter.connect(padGain);
    padGain.connect(this.master);
    padGain.connect(verb);
    for (const note of CHORDS[0] as number[]) {
      for (const detune of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = hz(note);
        o.detune.value = detune;
        o.connect(this.padFilter);
        o.start();
        this.pad.push(o);
      }
    }

    // The engine: a saw and a sub through a low-pass that opens with speed.
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 300;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    const sub = ctx.createOscillator();
    sub.type = "sine";
    osc.connect(filter);
    sub.connect(filter);
    filter.connect(gain).connect(this.master);
    osc.start();
    sub.start();
    this.engine = { osc, sub, filter, gain };

    // The siren: a square wave whose pitch an LFO swings between two tones.
    const sOsc = ctx.createOscillator();
    sOsc.type = "square";
    sOsc.frequency.value = 700;
    const lfo = ctx.createOscillator();
    lfo.type = "square";
    lfo.frequency.value = 1.6;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain).connect(sOsc.frequency);
    const sFilter = ctx.createBiquadFilter();
    sFilter.type = "bandpass";
    sFilter.frequency.value = 900;
    const sGain = ctx.createGain();
    sGain.gain.value = 0;
    sOsc.connect(sFilter).connect(sGain).connect(this.master);
    sGain.connect(verb);
    sOsc.start();
    lfo.start();
    this.siren = { osc: sOsc, gain: sGain };
  }

  toggleMute(): void {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.ctx.currentTime, 0.1);
  }

  update(dt: number, s: AudioState): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.time += dt;
    const now = ctx.currentTime;
    const e = this.engine;
    const on = s.driving ? 1 : 0;
    e.gain.gain.setTargetAtTime(on * (0.05 + Math.min(0.09, s.speed * 0.0016) + s.throttle * 0.03), now, 0.15);
    e.osc.frequency.setTargetAtTime(48 + s.speed * 1.6 + s.throttle * 12, now, 0.12);
    e.sub.frequency.setTargetAtTime(36 + s.speed * 0.8, now, 0.12);
    e.filter.frequency.setTargetAtTime(220 + s.speed * 22 + s.throttle * 300, now, 0.12);
    this.wind.gain.setTargetAtTime(0.12 + Math.min(0.35, s.altitude / 300) + (s.driving ? s.speed * 0.003 : 0), now, 0.5);
    this.rain.gain.setTargetAtTime(s.rain ? 0.05 : 0, now, 1.5);
    this.siren.gain.gain.setTargetAtTime(s.wanted > 0 ? 0.035 : 0, now, 0.4);
    this.padFilter.frequency.setTargetAtTime(500 + Math.sin(this.time * 0.15) * 300, now, 1);
    this.chordTime += dt;
    if (this.chordTime > 9) {
      this.chordTime = 0;
      this.chord = (this.chord + 1) % CHORDS.length;
      const chord = CHORDS[this.chord] as number[];
      this.pad.forEach((o, i) => o.frequency.setTargetAtTime(hz(chord[Math.floor(i / 2)] as number), now, 1.2));
    }
  }

  private blip(freq: number, at: number, dur: number, type: OscillatorType, vol: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.master);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  /** A rising arpeggio: a job done. */
  chime(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [72, 76, 79, 84].forEach((n, i) => this.blip(hz(n), t + i * 0.09, 0.5, "triangle", 0.12));
  }

  /** A falling minor figure: busted. */
  fail(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [64, 60, 57, 52].forEach((n, i) => this.blip(hz(n), t + i * 0.14, 0.6, "sawtooth", 0.07));
  }

  /** A thud whose size follows the impact. */
  crash(impact: number): void {
    const ctx = this.ctx;
    if (!ctx || impact < 6) return;
    const t = ctx.currentTime;
    const len = 0.4;
    const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 300 + impact * 20;
    const g = ctx.createGain();
    g.gain.value = Math.min(0.6, impact / 60);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  /** A psionic sweep: Kylo passes into another body. */
  whoosh(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(1760, t + 0.5);
    const o2 = ctx.createOscillator();
    o2.type = "triangle";
    o2.frequency.setValueAtTime(330, t);
    o2.frequency.exponentialRampToValueAtTime(110, t + 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g);
    o2.connect(g);
    g.connect(this.master);
    o.start(t);
    o2.start(t);
    o.stop(t + 1);
    o2.stop(t + 1);
  }
}
