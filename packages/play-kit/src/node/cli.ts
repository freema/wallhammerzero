// The play command line: `./dev npm run play -- <command>`.
//
//   new <id> --title "<title>" [--engine three|canvas] [--port <n>] [--palette <id>]
//       scaffolds games/<id>/ and packages/<id>-play/ and adds the Compose service
//
// Exit code: 0 ok, 2 wrong usage or a scaffold that would overwrite something.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { nextPort, ScaffoldError, scaffoldGame } from "./scaffold.ts";
import { ENGINES } from "./templates.ts";
import type { Engine } from "./templates.ts";

export interface CliIo {
  out(line: string): void;
  err(line: string): void;
}

export const PLAY_USAGE = 'usage: play new <id> --title "<title>" [--engine three|canvas] [--port <n>] [--palette <id>]';

class UsageError extends Error {}

export function runPlayCli(argv: readonly string[], io: CliIo, root: string, date: string): number {
  try {
    const { values, positionals } = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        title: { type: "string" },
        engine: { type: "string", default: "three" },
        port: { type: "string" },
        palette: { type: "string", default: "example" },
      },
    });
    const [command, ...rest] = positionals;
    if (command !== "new") throw new UsageError(command === undefined ? "no command" : `unknown command ${command}`);
    const [id] = rest;
    if (id === undefined || rest.length !== 1) throw new UsageError("new needs one game id");
    if (values.title === undefined) throw new UsageError("--title is missing");
    const engine = values.engine as Engine;
    if (!ENGINES.includes(engine)) throw new UsageError(`--engine must be one of ${ENGINES.join(", ")}`);
    const port = values.port === undefined ? nextPort(readFileSync(resolve(root, "compose.yaml"), "utf8")) : Number(values.port);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new UsageError(`--port must be an integer in [1024, 65535]`);
    const written = scaffoldGame(root, { id, title: values.title, engine, port, palette: values.palette }, date);
    for (const path of written) io.out(`wrote ${path}`);
    io.out("");
    io.out(`next: ./dev npm install   (links @whz/${id}-play into the workspace)`);
    io.out(`then: ./dev -p ${port} npm run dev -w @whz/${id}-play   and open http://127.0.0.1:${port}/?seed=1`);
    return 0;
  } catch (error) {
    if (error instanceof UsageError || error instanceof ScaffoldError || (error instanceof TypeError && "code" in error)) {
      io.err(`play: ${error.message}`);
      io.err(PLAY_USAGE);
      return 2;
    }
    throw error;
  }
}
