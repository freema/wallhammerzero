// The entry of the `game` command: `node packages/game-data/src/node/bin.ts <command>`, which
// the root script `npm run game -- <command>` runs. Everything is in cli.ts.

import { runCli } from "./cli.ts";

process.exitCode = await runCli(process.argv.slice(2), {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
  cwd: process.cwd(),
});
