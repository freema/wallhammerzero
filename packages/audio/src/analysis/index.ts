// @whz/audio/analysis: measuring and drawing sound. Runs in Node and in the browser (the
// studio shows the same numbers). It is analysis, not synthesis: floating-point Math is used
// freely here, and nothing in this folder may be imported by the synth.

export { kWeighting, measureLoudness, toDb, truePeak } from "./loudness.ts";
export type { Loudness } from "./loudness.ts";
export {
  HARSH_CUTOFF_HZ,
  HARSH_RATIO,
  loopSeam,
  LOUDNESS_TOLERANCE_LU,
  MAX_TRUE_PEAK_DB,
  measure,
  metricFindings,
  MUSIC_TARGET_LUFS,
  SEAM_FLOOR,
  SEAM_RATIO,
  trimDb,
} from "./metrics.ts";
export type { Metrics, Seam } from "./metrics.ts";
export { drawPianoRoll, drawSpectrogram, sfxRoll, songRoll } from "./pictures.ts";
export type { RollLane, RollModel, RollNote, SpectrogramOptions } from "./pictures.ts";
export { energyAbove, fft, Spectrum, toMono } from "./spectrum.ts";
