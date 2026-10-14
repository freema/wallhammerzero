// New Hope's dev server: `./dev -p 4200 npm run dev -w @whz/new-hope-play`, then
// http://127.0.0.1:4200 in the host browser (the container has no GPU).
//
// Dev only: `POST /__shot?name=<name>` with a PNG body writes build/shots/new-hope/<name>.png,
// for `__game.shot()` in the page.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

const SHOTS = resolve(import.meta.dirname, "../../build/shots/new-hope");
const PNG = [0x89, 0x50, 0x4e, 0x47];
const MAX_BYTES = 32 * 1024 * 1024;

const shots: Plugin = {
  name: "new-hope-shots",
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
        mkdirSync(SHOTS, { recursive: true });
        writeFileSync(resolve(SHOTS, `${name}.png`), body);
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ path: `build/shots/new-hope/${name}.png`, bytes: body.length }));
      });
    });
  },
};

export default defineConfig({
  root: import.meta.dirname,
  plugins: [shots],
  server: { host: "0.0.0.0", port: 4200, strictPort: true },
  preview: { host: "0.0.0.0", port: 4200, strictPort: true },
  build: { outDir: "../../build/new-hope-play", emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});
