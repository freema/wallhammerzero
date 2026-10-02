// The clip player: which frame of a clip is shown at a time. Pure functions: the caller owns
// the clock (a scrubber, a slow-motion factor, the game loop) and passes the time in.
//
// A frame is shown for its duration, from its start up to (not including) the start of the
// next one. Time is in milliseconds from the start of the clip. Whole milliseconds are exact;
// a fractional time is accepted too (a clock scaled by 0.25).
//
//   looping clip      the time wraps around the clip's length, in both directions
//   one-shot clip     before 0 it shows frame 0; from its end on it holds the last frame

/** What the player needs of a clip. An `AtlasClip` is one. */
export interface ClipTiming {
  readonly frames: number;
  /** One duration per frame, in milliseconds, each above 0. */
  readonly durations: readonly number[];
  readonly loop: boolean;
}

/** The answer of `sampleClip`. */
export interface ClipSample {
  /** The frame number inside the clip, from 0. */
  readonly frame: number;
  /** Milliseconds since that frame started. */
  readonly elapsed: number;
  /** How many times a looping clip has played through before this time (negative before 0). Always 0 for a one-shot clip. */
  readonly cycle: number;
  /** True when a one-shot clip has played to its end. Never true for a looping clip. */
  readonly finished: boolean;
}

function checkClip(fn: string, clip: ClipTiming): void {
  if (!Number.isInteger(clip.frames) || clip.frames < 1 || clip.durations.length !== clip.frames) {
    throw new RangeError(`${fn}: a clip needs at least one frame and one duration per frame, got ${String(clip.frames)} frames and ${clip.durations.length} durations`);
  }
  for (let i = 0; i < clip.frames; i += 1) {
    const ms = clip.durations[i] as number;
    if (!(ms > 0) || !Number.isFinite(ms)) throw new RangeError(`${fn}: the duration of frame ${i} must be above 0, got ${String(ms)}`);
  }
}

/** The length of one play-through, in milliseconds. */
export function clipDuration(clip: ClipTiming): number {
  checkClip("clipDuration", clip);
  let total = 0;
  for (const ms of clip.durations) total += ms;
  return total;
}

/** The time at which a frame starts, in milliseconds from the start of the clip. `frame` may be `clip.frames`: the end. */
export function frameStart(clip: ClipTiming, frame: number): number {
  checkClip("frameStart", clip);
  if (!Number.isInteger(frame) || frame < 0 || frame > clip.frames) {
    throw new RangeError(`frameStart: the frame must be in [0, ${clip.frames}], got ${String(frame)}`);
  }
  let start = 0;
  for (let i = 0; i < frame; i += 1) start += clip.durations[i] as number;
  return start;
}

/** The frame shown at `timeMs`, with where the time is inside it. */
export function sampleClip(clip: ClipTiming, timeMs: number): ClipSample {
  const total = clipDuration(clip);
  if (typeof timeMs !== "number" || !Number.isFinite(timeMs)) {
    throw new RangeError(`sampleClip: the time must be a finite number of milliseconds, got ${String(timeMs)}`);
  }
  const last = clip.frames - 1;
  let local = timeMs;
  let cycle = 0;
  if (clip.loop) {
    // `%` on numbers is exact, so whole milliseconds never drift, however large the time.
    local = timeMs % total;
    if (local < 0) local += total;
    // 0 also when `%` gave -0, or when a negative time was so small that adding the length rounded up.
    if (local === 0 || local >= total) local = 0;
    cycle = Math.floor(timeMs / total);
  } else if (timeMs <= 0) {
    return { frame: 0, elapsed: 0, cycle: 0, finished: false };
  } else if (timeMs >= total) {
    return { frame: last, elapsed: clip.durations[last] as number, cycle: 0, finished: true };
  }
  let start = 0;
  for (let frame = 0; frame < last; frame += 1) {
    const end = start + (clip.durations[frame] as number);
    if (local < end) return { frame, elapsed: local - start, cycle, finished: false };
    start = end;
  }
  return { frame: last, elapsed: local - start, cycle, finished: false };
}

/** The frame number shown at `timeMs`: `sampleClip(clip, timeMs).frame`. */
export function clipFrame(clip: ClipTiming, timeMs: number): number {
  return sampleClip(clip, timeMs).frame;
}
