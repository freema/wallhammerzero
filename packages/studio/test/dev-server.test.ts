// What the dev server hands to a browser as source. In dev mode Vite serves files by path
// (`/@fs/<absolute path>`), so `server.fs.allow` in vite.config.ts decides what of the checkout
// a page can read: the studio's own code, node_modules, and the four workspace packages the
// browser side of the studio is built from (runtime, asset-kit, voxel-kit, det). Nothing else:
// not the task notes, not CLAUDE.md, not the other packages.
//
// The real server.ts runs as its own process in dev mode. No browser is needed: the rule is
// enforced by the server, so plain requests show it.

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FIXTURE_ASSETS, removeTemps, tempRoot } from "./helpers.ts";

const SERVER = fileURLToPath(new URL("../server.ts", import.meta.url));
/** The checkout, without a trailing slash: `/work` in the dev container. */
const REPO = fileURLToPath(new URL("../../../", import.meta.url)).replace(/\/$/, "");

let child: ChildProcess;
let origin: string;
let output = "";

beforeAll(async () => {
  child = spawn(process.execPath, ["--conditions", "development", SERVER], {
    env: {
      PATH: process.env["PATH"],
      HOME: process.env["HOME"],
      NODE_ENV: "development",
      WHZ_STUDIO_ROOT: tempRoot("dev-server"),
      WHZ_STUDIO_ASSETS: FIXTURE_ASSETS,
      WHZ_STUDIO_PORT: "0",
      WHZ_STUDIO_HOST: "127.0.0.1",
      WHZ_STUDIO_BAKE_ON_START: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  origin = await new Promise<string>((resolve, reject) => {
    const read = (chunk: Buffer): void => {
      output += chunk.toString();
      const match = /dev server on (http:\/\/127\.0\.0\.1:\d+)/.exec(output);
      if (match?.[1] !== undefined) resolve(match[1]);
    };
    child.stdout?.on("data", read);
    child.stderr?.on("data", read);
    child.on("exit", (code) => reject(new Error(`the dev server stopped with exit code ${code}:\n${output}`)));
  });
});

afterAll(async () => {
  if (child.exitCode === null) {
    const gone = new Promise((done) => child.once("exit", done));
    child.kill("SIGTERM");
    await gone;
  }
  removeTemps();
});

/** The status of a GET, and the start of the body. `path` is sent as written (no `..` folding by fetch). */
async function get(path: string): Promise<{ status: number; body: string }> {
  const { request } = await import("node:http");
  const url = new URL(origin);
  return new Promise((resolve, reject) => {
    request({ host: url.hostname, port: url.port, path, headers: { Host: url.host, Accept: "*/*" } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: body.slice(0, 2000) }));
    })
      .on("error", reject)
      .end();
  });
}

const fsUrl = (path: string): string => `/@fs${REPO}/${path}`;

describe("the dev server (Vite in middleware mode)", () => {
  it("serves the workspace packages the browser needs as modules", async () => {
    for (const path of ["packages/runtime/src/index.ts", "packages/asset-kit/src/index.ts", "packages/voxel-kit/src/index.ts", "packages/det/src/index.ts", "packages/runtime/src/webgl/index.ts"]) {
      const reply = await get(fsUrl(path));
      expect([path, reply.status]).toEqual([path, 200]);
      // Transformed TypeScript: a module the browser can run.
      expect(reply.body, path).toMatch(/\bexport\b/);
    }
  });

  it("serves the studio's own code and node_modules", async () => {
    expect((await get(fsUrl("packages/studio/app/lib/assets.ts"))).status).toBe(200);
    expect((await get("/app/lib/assets.ts")).status).toBe(200);
    expect((await get(fsUrl("node_modules/react/package.json"))).status).toBe(200);
  });

  it.each([
    "CLAUDE.md",
    "README.md",
    "package.json",
    "compose.yaml",
    "tasks/README.md",
    "docs/DECISIONS.md",
    "security/skill-intake/registry.json",
    "games/examples/counter-shop/game.json",
    "assets/examples/blinking-dot/gen.ts",
    "packages/sim/src/index.ts",
    "packages/game-data/src/index.ts",
    "packages/audio/src/index.ts",
    "packages/game-data/src/node/build.ts",
    "tools/check/run.mjs",
    "eslint.config.js",
  ])("refuses %s: it is not something the browser side is built from", async (path) => {
    for (const query of ["", "?raw", "?import", "?url", "?import&raw"]) {
      const reply = await get(fsUrl(path) + query);
      expect([path + query, reply.status]).toEqual([path + query, 403]);
    }
  });

  it("refuses a path that leaves an allowed folder with ..", async () => {
    for (const path of [
      "packages/runtime/../sim/src/index.ts",
      "packages/runtime/src/../../../CLAUDE.md",
      "packages/studio/../../tasks/README.md",
      "packages/det/%2e%2e/sim/src/index.ts",
    ]) {
      const reply = await get(fsUrl(path));
      expect([path, reply.status === 200, reply.body.includes("export")]).toEqual([path, false, false]);
    }
  });

  it("refuses files outside the checkout", async () => {
    for (const path of ["/@fs/etc/passwd", "/@fs/etc/hostname?raw", `/@fs${REPO}/../etc/passwd`]) {
      const reply = await get(path);
      expect([path, reply.status === 200]).toEqual([path, false]);
      expect(reply.body).not.toMatch(/root:/);
    }
  });

  it("still serves the app itself", async () => {
    const page = await get("/gallery");
    expect(page.status).toBe(200);
    expect(page.body).toContain("<!DOCTYPE html>");
  });
});
