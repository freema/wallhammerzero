// The metrics of a render: what Claude reads instead of listening. Every number is rounded,
// so the sidecar that stores them is the same file on every machine.
//
//   lufsI          integrated loudness (BS.1770), the level the house target is set in
//   dBTP           true peak; above -1 dBTP a lossy codec or a converter may clip
//   clipped        samples outside -1..1, which the 16-bit file cuts off
//   energyAbove8k  share of the energy above 8 kHz: harsh, tiring treble
//   seam           for a loop: the jump from the last sample to the first, next to the
//                  sample-to-sample steps around it. A big jump among small steps is a click.

import type { Finding } from "../findings.ts";
import { clippedSamples } from "../render.ts";
import { measureLoudness, toDb, truePeak } from "./loudness.ts";
import { energyAbove, toMono } from "./spectrum.ts";

/** The house targets (D27): music at -18 LUFS integrated, the master at most -1 dBTP. */
export const MUSIC_TARGET_LUFS = -18;
export const MAX_TRUE_PEAK_DB = -1;
/** A mix further than this from the target gets a warning: the trim would be doing the mixing. */
export const LOUDNESS_TOLERANCE_LU = 3;
/**
 * More than this share of the energy above 8 kHz gets a warning. Measured on this synth: a
 * whole mix reads about 0.02; a lead alone 0.01 to 0.05; a 12.5 % pulse alone in the top octave
 * (C6 to C7) 0.15; hi-hats alone 0.2 to 0.5. A tenth is where the treble has taken over.
 */
export const HARSH_RATIO = 0.1;
export const HARSH_CUTOFF_HZ = 8000;
/** A seam is a click when its jump is above SEAM_FLOOR and above SEAM_RATIO times the steps around it. */
export const SEAM_FLOOR = 0.02;
export const SEAM_RATIO = 4;
/** The seconds on each side of the seam whose steps the jump is compared with. */
const SEAM_WINDOW_SEC = 0.005;

export interface Seam {
  /** The largest step from the last sample of the loop to its first, over the channels (full scale is 1). */
  readonly jump: number;
  /** The largest step between neighbouring samples within 5 ms of the seam. */
  readonly local: number;
  /** `jump / local` (capped at 999). */
  readonly ratio: number;
  /** True if the seam is heard as a click. */
  readonly click: boolean;
}

/** Measures the seam of a loop: `channels` is the loop, and its end runs into its start. */
export function loopSeam(channels: readonly Float32Array[], sampleRate: number): Seam {
  const window = Math.max(2, Math.round(SEAM_WINDOW_SEC * sampleRate));
  let jump = 0;
  let local = 0;
  for (const channel of channels) {
    const frames = channel.length;
    if (frames < 2) continue;
    jump = Math.max(jump, Math.abs((channel[0] as number) - (channel[frames - 1] as number)));
    const span = Math.min(window, frames - 1);
    for (let i = 0; i < span; i += 1) {
      local = Math.max(local, Math.abs((channel[i + 1] as number) - (channel[i] as number)));
      local = Math.max(local, Math.abs((channel[frames - 1 - i] as number) - (channel[frames - 2 - i] as number)));
    }
  }
  const ratio = local > 0 ? Math.min(999, jump / local) : jump > 0 ? 999 : 0;
  return { jump, local, ratio, click: jump > SEAM_FLOOR && ratio > SEAM_RATIO };
}

export interface Metrics {
  readonly seconds: number;
  /** Integrated loudness in LUFS, to 0.1; null for silence. */
  readonly lufsI: number | null;
  /** The loudest 400 ms, in LUFS, to 0.1; null for silence. */
  readonly lufsMomentaryMax: number | null;
  /** True peak in dBTP, to 0.1; null for silence. */
  readonly dBTP: number | null;
  /** Samples outside -1..1. */
  readonly clipped: number;
  /** The share of the energy above 8 kHz, 0..1, to 0.001. */
  readonly energyAbove8k: number;
  /** For a loop: its seam. Null otherwise. */
  readonly seam: { readonly jump: number; readonly ratio: number; readonly click: boolean } | null;
}

const round = (value: number, digits: number): number => {
  const scale = 10 ** digits;
  const rounded = Math.round(value * scale) / scale;
  return rounded === 0 ? 0 : rounded;
};
const finiteOrNull = (value: number, digits: number): number | null => (Number.isFinite(value) ? round(value, digits) : null);

/** Measures a signal of one or two channels. */
export function measure(channels: readonly Float32Array[], sampleRate: number, options: { readonly loop?: boolean } = {}): Metrics {
  const frames = channels.length === 0 ? 0 : (channels[0] as Float32Array).length;
  const loudness = measureLoudness(channels, sampleRate);
  const seam = options.loop === true ? loopSeam(channels, sampleRate) : null;
  return {
    seconds: round(frames / sampleRate, 3),
    lufsI: finiteOrNull(loudness.integrated, 1),
    lufsMomentaryMax: finiteOrNull(loudness.momentaryMax, 1),
    dBTP: finiteOrNull(toDb(truePeak(channels)), 1),
    clipped: clippedSamples(channels),
    energyAbove8k: round(energyAbove(toMono(channels), sampleRate, HARSH_CUTOFF_HZ), 3),
    seam: seam === null ? null : { jump: round(seam.jump, 4), ratio: round(seam.ratio, 1), click: seam.click },
  };
}

/**
 * The gain, in dB, that a player applies to a render to bring it to the house level. The
 * composed gains in the song are never edited for this, and nothing is rendered again.
 * - music and jingles (`target` given): up or down to the target loudness, but never so far
 *   up that the true peak passes -1 dBTP;
 * - SFX (`target` null): only down, and only if the true peak is above -1 dBTP.
 */
export function trimDb(metrics: Metrics, target: number | null): number {
  if (metrics.dBTP === null) return 0;
  const headroom = MAX_TRUE_PEAK_DB - metrics.dBTP;
  if (target === null || metrics.lufsI === null) return round(Math.min(0, headroom), 1);
  return round(Math.min(target - metrics.lufsI, headroom), 1);
}

/** What the metrics of a render say is wrong with it. `path` names the render in the findings. */
export function metricFindings(metrics: Metrics, target: number | null, path = ""): Finding[] {
  const findings: Finding[] = [];
  const add = (severity: Finding["severity"], rule: string, message: string): void => {
    findings.push({ severity, rule, path, message });
  };
  if (metrics.lufsI === null) add("warning", "silent", "the render is silent");
  if (metrics.clipped > 0) {
    add("error", "clip", `${metrics.clipped} sample(s) are above full scale and are cut off in the 16-bit file: lower the channel gains`);
  } else if (metrics.dBTP !== null && metrics.dBTP > MAX_TRUE_PEAK_DB) {
    add("warning", "peak", `the true peak is ${metrics.dBTP} dBTP, above ${MAX_TRUE_PEAK_DB} dBTP (the trim brings it down, but the headroom is gone)`);
  }
  if (target !== null && metrics.lufsI !== null && Math.abs(metrics.lufsI - target) > LOUDNESS_TOLERANCE_LU) {
    add("warning", "loudness", `the loudness is ${metrics.lufsI} LUFS, more than ${LOUDNESS_TOLERANCE_LU} LU from the target of ${target} LUFS: move the channel gains`);
  }
  if (metrics.energyAbove8k > HARSH_RATIO) {
    add("warning", "harsh", `${Math.round(metrics.energyAbove8k * 100)} % of the energy is above 8 kHz: lower the bright channels, use a wider duty or lower notes`);
  }
  if (metrics.seam !== null && metrics.seam.click) {
    add("warning", "loop-seam", `the loop point clicks: the signal jumps by ${metrics.seam.jump} there, ${metrics.seam.ratio} times the steps around it`);
  }
  return findings;
}
