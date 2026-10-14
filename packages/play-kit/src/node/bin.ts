// The entry of the `play` command: `node packages/play-kit/src/node/bin.ts <command>`, which the
// root script `npm run play -- <command>` runs. Everything is in cli.ts.

import { resolve } from "node:path";
import { runPlayCli } from "./cli.ts";

process.exitCode = runPlayCli(
  process.argv.slice(2),
  {
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  },
  resolve(import.meta.dirname, "../../../.."),
  new Date().toISOString().slice(0, 10),
);
