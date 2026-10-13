// The entry of the `city` command: `node packages/citygen/src/node/bin.ts <command>`, which the
// root script `npm run city -- <command>` runs. Everything is in cli.ts.

import { runCityCli } from "./cli.ts";

process.exitCode = runCityCli(process.argv.slice(2), {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
});
