// The fixed-step loop's advance: whole steps, then one present.

import { describe, expect, it } from "vitest";
import { fixedLoop } from "../src/loop.ts";

describe("fixedLoop", () => {
  it("advance runs whole steps and presents once with their total", () => {
    const steps: number[] = [];
    const frames: number[] = [];
    const loop = fixedLoop({ step: 0.25, update: (dt) => steps.push(dt), present: (dt) => frames.push(dt) });
    loop.advance(1);
    expect(steps).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(frames).toEqual([1]);
    loop.advance(0.01);
    expect(steps.length).toBe(5);
    expect(frames).toEqual([1, 0.25]);
  });
});
