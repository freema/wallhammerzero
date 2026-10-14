// The dev server side of the hook, for a game's vite.config.ts. Dev only:
// `POST /__shot?name=<name>` with a PNG body writes build/shots/<game>/<name>.png, for
// `__game.shot()` in the page.

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

const PNG = [0x89, 0x50, 0x4e, 0x47];
const MAX_BYTES = 32 * 1024 * 1024;
const REPO = resolve(import.meta.dirname, "../../..");

export function shotPlugin(gameId: string): Plugin {
  const dir = resolve(REPO, "build/shots", gameId);
  return {
    name: "whz-play-kit-shots",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__shot", (req, res) => {
        const fail = (code: number, why: string): void => {
          res.statusCode = code;
          res.end(why);
        };
        if (req.method !== "POST") return fail(405, "POST a PNG");
        const name = (new URL(req.url ?? "/", "http://localhost").searchParams.get("name") ?? "").replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 60) || "shot";
        const chunks: Buffer[] = [];
        let size = 0;
        req.on("data", (c: Buffer) => {
          size += c.length;
          if (size <= MAX_BYTES) chunks.push(c);
        });
        req.on("end", () => {
          const body = Buffer.concat(chunks);
          if (size > MAX_BYTES) return fail(413, "too large");
          if (!PNG.every((b, i) => body[i] === b)) return fail(400, "not a PNG");
          mkdirSync(dir, { recursive: true });
          writeFileSync(resolve(dir, `${name}.png`), body);
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ path: `build/shots/${gameId}/${name}.png`, bytes: body.length }));
        });
      });
    },
  };
}
