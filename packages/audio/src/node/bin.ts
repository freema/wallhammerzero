// The entry of the `audio` command: `node packages/audio/src/node/bin.ts <command>`, which the
// root script `npm run audio -- <command>` runs. Everything is in cli.ts.

import { runCli } from "./cli.ts";

process.exitCode = runCli(process.argv.slice(2), {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
  cwd: process.cwd(),
});
