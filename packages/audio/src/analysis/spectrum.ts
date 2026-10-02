// The spectrum of a signal: a radix-2 FFT, a short-time transform with a Hann window, and the
// share of the energy above a frequency (the number behind the "harsh treble" check).
// Analysis code: floating-point Math is fine here.

/** An in-place FFT of `size` complex numbers (a power of two). */
export function fft(re: Float64Array, im: Float64Array): void {
  const size = re.length;
  if (size < 2 || (size & (size - 1)) !== 0 || im.length !== size) throw new RangeError("fft: the size must be a power of two");
  for (let i = 1, j = 0; i < size; i += 1) {
    let bit = size >> 1;
    for (; (j & bit) !== 0; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const r = re[i] as number;
      re[i] = re[j] as number;
      re[j] = r;
      const m = im[i] as number;
      im[i] = im[j] as number;
      im[j] = m;
    }
  }
  for (let length = 2; length <= size; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const stepRe = Math.cos(angle);
    const stepIm = Math.sin(angle);
    for (let start = 0; start < size; start += length) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < length / 2; k += 1) {
        const a = start + k;
        const b = a + length / 2;
        const tRe = (re[b] as number) * wRe - (im[b] as number) * wIm;
        const tIm = (re[b] as number) * wIm + (im[b] as number) * wRe;
        re[b] = (re[a] as number) - tRe;
        im[b] = (im[a] as number) - tIm;
        re[a] = (re[a] as number) + tRe;
        im[a] = (im[a] as number) + tIm;
        const nextRe = wRe * stepRe - wIm * stepIm;
        wIm = wRe * stepIm + wIm * stepRe;
        wRe = nextRe;
      }
    }
  }
}

/** Computes power spectra of windows of a signal, reusing its buffers. */
export class Spectrum {
  readonly size: number;
  /** `size / 2 + 1` powers, scaled so that a full-scale sine reads 1 in its bin. */
  readonly power: Float64Array;
  private readonly window: Float64Array;
  private readonly re: Float64Array;
  private readonly im: Float64Array;

  constructor(size: number) {
    this.size = size;
    this.power = new Float64Array(size / 2 + 1);
    this.window = Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size));
    this.re = new Float64Array(size);
    this.im = new Float64Array(size);
  }

  /** The power spectrum of the `size` samples that start at `start` (silence outside the signal). */
  at(signal: Float32Array | Float64Array, start: number): Float64Array {
    const { size, re, im, window, power } = this;
    for (let i = 0; i < size; i += 1) {
      const index = start + i;
      re[i] = index >= 0 && index < signal.length ? (signal[index] as number) * (window[i] as number) : 0;
      im[i] = 0;
    }
    fft(re, im);
    // The Hann window sums to size / 2, and a sine of amplitude 1 puts half of that in a bin.
    const scale = 16 / (size * size);
    for (let bin = 0; bin <= size / 2; bin += 1) power[bin] = ((re[bin] as number) * (re[bin] as number) + (im[bin] as number) * (im[bin] as number)) * scale;
    return power;
  }
}

/** The mean of two channels (or the one channel itself). */
export function toMono(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0] as Float32Array;
  const [left, right] = channels as [Float32Array, Float32Array];
  const mono = new Float32Array(left.length);
  for (let i = 0; i < left.length; i += 1) mono[i] = ((left[i] as number) + (right[i] as number)) / 2;
  return mono;
}

/** The share (0..1) of a signal's energy that lies above `cutoffHz`. 0 for silence. */
export function energyAbove(signal: Float32Array, sampleRate: number, cutoffHz: number): number {
  const size = 2048;
  const spectrum = new Spectrum(size);
  const first = Math.ceil((cutoffHz * size) / sampleRate);
  let above = 0;
  let total = 0;
  for (let start = 0; start < Math.max(1, signal.length - size / 2); start += size / 2) {
    const power = spectrum.at(signal, start);
    // Bin 0 and 1 are left out: a DC offset is not energy anyone hears.
    for (let bin = 2; bin <= size / 2; bin += 1) {
      total += power[bin] as number;
      if (bin >= first) above += power[bin] as number;
    }
  }
  return total > 0 ? above / total : 0;
}
