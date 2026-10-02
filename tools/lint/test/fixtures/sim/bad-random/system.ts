// Lint fixture: a sim system that breaks the determinism rule with Math.random().
// The determinism lint must reject it (tools/lint/test/determinism.test.mjs).
// This folder is ignored by the normal lint run; the test lints it as if it were under
// packages/sim/src/systems/.

import { field, stateOne } from "@whz/sim";
import type { SystemDef } from "@whz/sim";

const dice = stateOne("dice", { last: field.int(0, 5) });

export const badRandom: SystemDef = {
  name: "bad-random",
  state: [dice],
  tick(ctx) {
    // Not from the system's stream (ctx.rng): two runs of the same replay differ.
    ctx.one(dice).last = Math.floor(Math.random() * 6);
  },
};
