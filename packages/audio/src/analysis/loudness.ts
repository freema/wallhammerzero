// Loudness and true peak after ITU-R BS.1770: the numbers the house targets are given in
// (music -18 LUFS integrated, master at most -1 dBTP; docs/audio.md).
//
// This is analysis, not synthesis: it uses floating-point Math freely and is not under the
// determinism lint. Its results are rounded before they are stored, and nothing compares
// them bit for bit.

/** A biquad filter in transposed direct form II. */
interface Biquad {
  readonly b0: number;
  readonly b1: number;
  readonly b2: number;
  readonly a1: number;
  readonly a2: number;
}

/**
 * The two filters of the K-weighting for a sample rate: the high shelf that models the head,
 * and the high-pass. At 48 kHz these are the coefficients printed in BS.1770; for other rates
 * the same analogue prototypes are transformed again.
 */
export function kWeighting(sampleRate: number): readonly [Biquad, Biquad] {
  const shelfK = Math.tan((Math.PI * 1681.974450955533) / sampleRate);
  const vh = 10 ** (3.999843853973347 / 20);
  const vb = vh ** 0.4996667741545416;
  const shelfQ = 0.7071752369554196;
  const a0 = 1 + shelfK / shelfQ + shelfK * shelfK;
  const shelf: Biquad = {
    b0: (vh + (vb * shelfK) / shelfQ + shelfK * shelfK) / a0,
    b1: (2 * (shelfK * shelfK - vh)) / a0,
    b2: (vh - (vb * shelfK) / shelfQ + shelfK * shelfK) / a0,
    a1: (2 * (shelfK * shelfK - 1)) / a0,
    a2: (1 - shelfK / shelfQ + shelfK * shelfK) / a0,
  };
  const passK = Math.tan((Math.PI * 38.13547087602444) / sampleRate);
  const passQ = 0.5003270373238773;
  const p0 = 1 + passK / passQ + passK * passK;
  const pass: Biquad = { b0: 1, b1: -2, b2: 1, a1: (2 * (passK * passK - 1)) / p0, a2: (1 - passK / passQ + passK * passK) / p0 };
  return [shelf, pass];
}

function filter(input: Float32Array | Float64Array, biquad: Biquad): Float64Array {
  const out = new Float64Array(input.length);
  let z1 = 0;
  let z2 = 0;
  for (let i = 0; i < input.length; i += 1) {
    const x = input[i] as number;
    const y = biquad.b0 * x + z1;
    z1 = biquad.b1 * x - biquad.a1 * y + z2;
    z2 = biquad.b2 * x - biquad.a2 * y;
    out[i] = y;
  }
  return out;
}

export interface Loudness {
  /** Integrated loudness in LUFS (gated: -70 LUFS absolute, -10 LU relative). -Infinity for silence. */
  readonly integrated: number;
  /** The loudest 400 ms block, in LUFS. -Infinity for silence. */
  readonly momentaryMax: number;
}

const BLOCK_SEC = 0.4;
const HOP_SEC = 0.1;
const ABSOLUTE_GATE = -70;
const RELATIVE_GATE = -10;

const toLufs = (meanSquare: number): number => (meanSquare > 0 ? -0.691 + 10 * Math.log10(meanSquare) : -Infinity);

/**
 * The loudness of a signal of one or two channels (each weighs 1). A signal shorter than one
 * 400 ms block is measured as one block padded with silence, which is how a short SFX is
 * compared with another.
 */
export function measureLoudness(channels: readonly Float32Array[], sampleRate: number): Loudness {
  const [shelf, pass] = kWeighting(sampleRate);
  const weighted = channels.map((channel) => filter(filter(channel, shelf), pass));
  const frames = channels.length === 0 ? 0 : (channels[0] as Float32Array).length;
  const block = Math.round(BLOCK_SEC * sampleRate);
  const hop = Math.round(HOP_SEC * sampleRate);

  // The sum over channels of the mean square of every block.
  const powers: number[] = [];
  const blockPower = (start: number): number => {
    let sum = 0;
    for (const channel of weighted) {
      for (let i = start; i < Math.min(start + block, frames); i += 1) sum += (channel[i] as number) * (channel[i] as number);
    }
    return sum / block;
  };
  if (frames <= block) powers.push(blockPower(0));
  else for (let start = 0; start + block <= frames; start += hop) powers.push(blockPower(start));

  const momentaryMax = toLufs(Math.max(0, ...powers));
  const loud = powers.filter((power) => toLufs(power) > ABSOLUTE_GATE);
  if (loud.length === 0) return { integrated: -Infinity, momentaryMax };
  const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
  const threshold = toLufs(mean(loud)) + RELATIVE_GATE;
  const gated = loud.filter((power) => toLufs(power) > threshold);
  return { integrated: gated.length === 0 ? -Infinity : toLufs(mean(gated)), momentaryMax };
}

/** Samples on each side of a point that the true-peak interpolation reads. */
const HALF_TAPS = 12;
/** The interpolation makes 4 samples out of 1. */
const OVERSAMPLE = 4;

/** For each of the 3 positions between two samples: the 24 weights of a windowed sinc. */
const PHASES: readonly Float64Array[] = Array.from({ length: OVERSAMPLE - 1 }, (_, phase) => {
  const offset = (phase + 1) / OVERSAMPLE;
  return Float64Array.from({ length: HALF_TAPS * 2 }, (_, tap) => {
    const t = tap - HALF_TAPS + 1 - offset;
    const window = 0.5 * (1 + Math.cos((Math.PI * t) / HALF_TAPS));
    return (Math.sin(Math.PI * t) / (Math.PI * t)) * window;
  });
});

/**
 * The true peak of a signal as a linear value: the largest magnitude of the signal
 * interpolated to 4 times its sample rate, which is close to what a converter puts out
 * between the samples.
 */
export function truePeak(channels: readonly Float32Array[]): number {
  let peak = 0;
  for (const channel of channels) {
    const frames = channel.length;
    for (let i = 0; i < frames; i += 1) {
      const here = Math.abs(channel[i] as number);
      if (here > peak) peak = here;
      // The curve between two samples is not looked at when both are below a quarter of the
      // peak so far: it would have to overshoot them by 12 dB to matter.
      if (here < peak * 0.25 && Math.abs((channel[i + 1] as number | undefined) ?? 0) < peak * 0.25) continue;
      for (const weights of PHASES) {
        let sum = 0;
        for (let tap = 0; tap < HALF_TAPS * 2; tap += 1) {
          const at = i + tap - HALF_TAPS + 1;
          if (at >= 0 && at < frames) sum += (channel[at] as number) * (weights[tap] as number);
        }
        if (Math.abs(sum) > peak) peak = Math.abs(sum);
      }
    }
  }
  return peak;
}

/** A linear magnitude in decibels relative to full scale. -Infinity for 0. */
export function toDb(value: number): number {
  return value > 0 ? 20 * Math.log10(value) : -Infinity;
}
