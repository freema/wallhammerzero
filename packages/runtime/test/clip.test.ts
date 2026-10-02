// The clip player: which frame is shown at a time.

import { describe, expect, it } from "vitest";
import { clipDuration, clipFrame, frameStart, sampleClip } from "../src/index.ts";
import type { ClipTiming } from "../src/index.ts";

/** The example asset's clip: lit for 600 ms, dim for 200 ms. */
const BLINK: ClipTiming = { frames: 2, durations: [600, 200], loop: true };
const WALK: ClipTiming = { frames: 4, durations: [120, 80, 120, 80], loop: true };
const POP: ClipTiming = { frames: 3, durations: [50, 100, 250], loop: false };

/** The frame at a whole millisecond, found the slow way: walk the durations. */
function reference(clip: ClipTiming, time: number): number {
  const total = clip.durations.reduce((sum, ms) => sum + ms, 0);
  let local = clip.loop ? ((time % total) + total) % total : Math.min(Math.max(time, 0), total);
  for (let frame = 0; frame < clip.frames; frame += 1) {
    const ms = clip.durations[frame] as number;
    if (local < ms) return frame;
    local -= ms;
  }
  return clip.frames - 1;
}

describe("clipDuration and frameStart", () => {
  it("add up the durations", () => {
    expect(clipDuration(BLINK)).toBe(800);
    expect(clipDuration(POP)).toBe(400);
    expect([0, 1, 2, 3, 4].map((frame) => frameStart(WALK, frame))).toEqual([0, 120, 200, 320, 400]);
  });

  it("refuse a frame that is not in the clip", () => {
    expect(() => frameStart(WALK, 5)).toThrow(RangeError);
    expect(() => frameStart(WALK, -1)).toThrow(RangeError);
    expect(() => frameStart(WALK, 1.5)).toThrow(RangeError);
  });
});

describe("sampleClip on a looping clip", () => {
  it("shows a frame from its start up to, not including, the next start", () => {
    expect(clipFrame(BLINK, 0)).toBe(0);
    expect(clipFrame(BLINK, 599)).toBe(0);
    expect(clipFrame(BLINK, 600)).toBe(1);
    expect(clipFrame(BLINK, 799)).toBe(1);
    expect(clipFrame(BLINK, 800)).toBe(0);
  });

  it("tells where the time is inside the frame, and which play-through it is", () => {
    expect(sampleClip(BLINK, 650)).toEqual({ frame: 1, elapsed: 50, cycle: 0, finished: false });
    expect(sampleClip(BLINK, 800)).toEqual({ frame: 0, elapsed: 0, cycle: 1, finished: false });
    expect(sampleClip(BLINK, 8 * 800 + 601)).toEqual({ frame: 1, elapsed: 1, cycle: 8, finished: false });
  });

  it("wraps a negative time backwards", () => {
    expect(sampleClip(BLINK, -1)).toEqual({ frame: 1, elapsed: 199, cycle: -1, finished: false });
    expect(sampleClip(BLINK, -200)).toEqual({ frame: 1, elapsed: 0, cycle: -1, finished: false });
    expect(sampleClip(BLINK, -201)).toEqual({ frame: 0, elapsed: 599, cycle: -1, finished: false });
    expect(sampleClip(BLINK, -800)).toEqual({ frame: 0, elapsed: 0, cycle: -1, finished: false });
  });

  it("agrees with a walk over the durations at every whole millisecond", () => {
    for (const clip of [BLINK, WALK]) {
      const total = clipDuration(clip);
      for (let time = -2 * total; time <= 3 * total; time += 1) {
        expect(clipFrame(clip, time), `${clip.frames} frames at ${time} ms`).toBe(reference(clip, time));
      }
    }
  });

  it("stays exact far from zero", () => {
    const far = 800 * 1_000_000_000;
    expect(sampleClip(BLINK, far + 599)).toEqual({ frame: 0, elapsed: 599, cycle: 1_000_000_000, finished: false });
    expect(clipFrame(BLINK, far + 600)).toBe(1);
  });

  it("takes a fractional time: a clock slowed to a quarter shows each frame four times as long", () => {
    // Wall time in whole ms, clip time = wall time * 0.25.
    const shown = [0, 0];
    for (let wall = 0; wall < 4 * 800; wall += 1) shown[clipFrame(BLINK, wall * 0.25)] += 1;
    expect(shown).toEqual([4 * 600, 4 * 200]);
    expect(sampleClip(BLINK, 600.5)).toEqual({ frame: 1, elapsed: 0.5, cycle: 0, finished: false });
  });
});

describe("sampleClip on a one-shot clip", () => {
  it("plays once and holds the last frame", () => {
    expect(sampleClip(POP, 0)).toEqual({ frame: 0, elapsed: 0, cycle: 0, finished: false });
    expect(sampleClip(POP, 49)).toEqual({ frame: 0, elapsed: 49, cycle: 0, finished: false });
    expect(sampleClip(POP, 50)).toEqual({ frame: 1, elapsed: 0, cycle: 0, finished: false });
    expect(sampleClip(POP, 399)).toEqual({ frame: 2, elapsed: 249, cycle: 0, finished: false });
    expect(sampleClip(POP, 400)).toEqual({ frame: 2, elapsed: 250, cycle: 0, finished: true });
    expect(sampleClip(POP, 1_000_000)).toEqual({ frame: 2, elapsed: 250, cycle: 0, finished: true });
  });

  it("shows the first frame before the clip starts", () => {
    expect(sampleClip(POP, -5)).toEqual({ frame: 0, elapsed: 0, cycle: 0, finished: false });
  });

  it("agrees with a walk over the durations at every whole millisecond", () => {
    for (let time = -10; time <= 500; time += 1) expect(clipFrame(POP, time), `${time} ms`).toBe(reference(POP, time));
  });
});

describe("sampleClip is a pure function with checked input", () => {
  it("gives the same answer for the same time, in any order of calls", () => {
    const forwards = [0, 250, 600, 799, 1600].map((time) => sampleClip(BLINK, time));
    const backwards = [1600, 799, 600, 250, 0].map((time) => sampleClip(BLINK, time)).reverse();
    expect(backwards).toEqual(forwards);
  });

  it("refuses a time that is not a finite number", () => {
    expect(() => sampleClip(BLINK, Number.NaN)).toThrow(RangeError);
    expect(() => sampleClip(BLINK, Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => sampleClip(BLINK, "12" as unknown as number)).toThrow(RangeError);
  });

  it("refuses a clip without frames, with a missing duration or with a duration of 0", () => {
    expect(() => sampleClip({ frames: 0, durations: [], loop: true }, 0)).toThrow(RangeError);
    expect(() => sampleClip({ frames: 2, durations: [100], loop: true }, 0)).toThrow(RangeError);
    expect(() => sampleClip({ frames: 2, durations: [100, 0], loop: true }, 0)).toThrow(RangeError);
  });
});
