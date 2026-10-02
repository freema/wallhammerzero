// Writes test/golden/parity.json: the pixel hash of every check scene (dev/scenes.ts) as the
// CPU backend draws it. The tests fail when the file is out of date, and the dev page
// compares the WebGL backend's hashes with it.
//
//   ./dev npm run golden -w @whz/runtime
//
// A hash changes only when the example asset, the scenes or the runtime change what is drawn.
// Look at the pictures before committing new hashes.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { bakeExample, cpuHashes, PARITY_FORMAT } from "../test/helpers.ts";

const example = await bakeExample();
try {
  const golden = {
    format: PARITY_FORMAT,
    about: "Pixel hashes (pixelHash of @whz/runtime) of the scenes in dev/scenes.ts, drawn by the CPU backend. Generated: npm run golden -w @whz/runtime.",
    scenes: cpuHashes(example),
  };
  const file = fileURLToPath(new URL("../test/golden/parity.json", import.meta.url));
  writeFileSync(file, `${JSON.stringify(golden, null, 2)}\n`);
  console.log(`${file}: ${Object.keys(golden.scenes).length} scenes`);
} finally {
  example.remove();
}
