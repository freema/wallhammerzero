// Lint fixture: a sim system that makes its own random stream instead of using ctx.rng.
// The determinism lint must reject it (tools/lint/test/determinism.test.mjs).
// This folder is ignored by the normal lint run; the test lints it as if it were under
// packages/sim/src/systems/.

import { createRng } from "@whz/det";
import { field, stateOne } from "@whz/sim";
import type { SystemDef } from "@whz/sim";

const dice = stateOne("dice", { last: field.int(0, 5) });

// Seeded, so it repeats. But it is not in the digest and not in a snapshot: a restored sim
// would start this stream again from its first number.
const own = createRng(7, "dice-of-my-own");

export const ownStream: SystemDef = {
  name: "own-stream",
  state: [dice],
  tick(ctx) {
    ctx.one(dice).last = own.int(6);
  },
};
