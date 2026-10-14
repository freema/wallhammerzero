// The frame loop: the simulation at a fixed step, the picture once per frame. `advance` runs
// the same steps without the browser's clock, so a test and the real loop share one code path
// and a hidden tab can be driven.

export interface LoopParts {
  /** Seconds per simulation step (1/120 is a good default). */
  step: number;
  /** One simulation step. All game rules live here. */
  update(dt: number): void;
  /** Camera, sound, HUD and the render, once per frame; `dt` is the frame's game time. */
  present(dt: number): void;
}

export interface Loop {
  /** Run whole steps for `seconds` of game time, then present once. */
  advance(seconds: number): void;
  /** Start the requestAnimationFrame loop. */
  start(): void;
}

/** At most this many steps per frame; after a long stall the debt is dropped, not repaid. */
const MAX_STEPS = 12;

export function fixedLoop(parts: LoopParts): Loop {
  const { step } = parts;
  let last = 0;
  let owed = 0;
  const frame = (now: number): void => {
    let dt = last === 0 ? step : Math.min(0.1, (now - last) / 1000);
    last = now;
    // Snap a frame time near a whole number of steps to it, so a steady 60 or 120 Hz screen
    // gets exactly 2 or 1 steps per frame instead of an occasional 1 or 3.
    const whole = Math.round(dt / step);
    if (whole > 0 && Math.abs(dt - whole * step) < step * 0.25) dt = whole * step;
    owed += dt;
    let n = 0;
    while (owed >= step - 1e-9 && n < MAX_STEPS) {
      parts.update(step);
      owed -= step;
      n++;
    }
    if (n === MAX_STEPS) owed = 0;
    parts.present(dt);
    requestAnimationFrame(frame);
  };
  return {
    advance(seconds) {
      const n = Math.max(1, Math.round(seconds / step));
      for (let i = 0; i < n; i++) parts.update(step);
      parts.present(n * step);
    },
    start() {
      requestAnimationFrame(frame);
    },
  };
}
