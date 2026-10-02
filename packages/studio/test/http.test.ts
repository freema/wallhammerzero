// The guards and the files endpoint over real HTTP, mounted the way server.ts mounts them.
// Requests are sent with node:http and a raw path: `fetch` would tidy `..` away before the
// server ever sees it, and the point is what the server does when a client does not.

import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer, request } from "node:http";
import type { IncomingHttpHeaders, Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { filesHandler, hostGuard, writeGuard } from "../server/services/http.ts";
import { safeResolve } from "../server/services/safe-path.ts";
import { removeTemps, tempRoot } from "./helpers.ts";

let server: Server;
let port: number;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

beforeAll(async () => {
  const root = tempRoot("http");
  mkdirSync(join(root, "build", "assets", "pack", "one"), { recursive: true });
  writeFileSync(join(root, "build", "assets", "pack", "one", "seed-1.png"), PNG);
  writeFileSync(join(root, "build", "assets", "pack", "one", "atlas.json"), '{"format":"wz.atlas/1"}');
  writeFileSync(join(root, "build", "page.html"), "<script>alert(1)</script>");
  writeFileSync(join(root, "secret.txt"), "not served");
  symlinkSync(join(root, "secret.txt"), join(root, "build", "link.txt"));

  const app = express();
  app.use(hostGuard());
  app.use(writeGuard());
  app.use("/api/files", filesHandler((path) => safeResolve(root, [join(root, "build")], path)));
  app.post("/write", (_req, res) => void res.send("written"));
  app.use((_req, res) => void res.status(404).send("the app would answer here"));
  server = createServer(app);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise((done) => server.close(done));
  removeTemps();
});

interface Reply {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

/** One request with the path exactly as given. */
function send(path: string, options: { method?: string; headers?: Record<string, string> } = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method: options.method ?? "GET", headers: options.headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("GET /api/files", () => {
  it("serves a build output with its type", async () => {
    const png = await send("/api/files/build/assets/pack/one/seed-1.png");
    expect(png.status).toBe(200);
    expect(png.headers["content-type"]).toBe("image/png");
    expect(png.headers["x-content-type-options"]).toBe("nosniff");
    expect(png.body.equals(PNG)).toBe(true);
    const json = await send("/api/files/build/assets/pack/one/atlas.json");
    expect(json.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(json.body.toString()).toBe('{"format":"wz.atlas/1"}');
  });

  it("revalidates a plain URL and caches a hash-pinned URL for good", async () => {
    const plain = await send("/api/files/build/assets/pack/one/seed-1.png");
    expect(plain.headers["cache-control"]).toBe("no-cache");
    const etag = plain.headers["etag"] as string;
    expect(etag).toMatch(/^"[0-9a-f]+-[0-9a-f]+"$/);
    const again = await send("/api/files/build/assets/pack/one/seed-1.png", { headers: { "If-None-Match": etag } });
    expect(again.status).toBe(304);
    expect(again.body.length).toBe(0);
    const pinned = await send("/api/files/build/assets/pack/one/seed-1.png?h=ff98ad430bb70a8f");
    expect(pinned.status).toBe(200);
    expect(pinned.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
  });

  it("answers HEAD without a body", async () => {
    const head = await send("/api/files/build/assets/pack/one/seed-1.png", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers["content-length"]).toBe(String(PNG.length));
    expect(head.body.length).toBe(0);
  });

  it("sends a file of an unknown type as a download, never as a page", async () => {
    const html = await send("/api/files/build/page.html");
    expect(html.status).toBe(200);
    expect(html.headers["content-type"]).toBe("application/octet-stream");
    expect(html.headers["content-disposition"]).toBe("attachment");
  });

  it.each([
    ["/api/files/build/../secret.txt"],
    ["/api/files/../secret.txt"],
    ["/api/files/build/assets/../../secret.txt"],
    ["/api/files/build/%2e%2e/secret.txt"],
    ["/api/files/build/..%2fsecret.txt"],
    ["/api/files/build%2f..%2fsecret.txt"],
    ["/api/files/%2e%2e/%2e%2e/etc/passwd"],
    ["/api/files//etc/passwd"],
    ["/api/files/build/..%5csecret.txt"],
    ["/api/files/build/%00"],
    ["/api/files/build/%zz"],
  ])("refuses the traversal %s with 400", async (path) => {
    const reply = await send(path);
    expect(reply.status).toBe(400);
    expect(reply.body.toString()).not.toContain("not served");
  });

  it.each([["/api/files/secret.txt"], ["/api/files/build/link.txt"], ["/api/files/package.json"]])("refuses %s with 403: outside the served folder, or a symlink out of it", async (path) => {
    const reply = await send(path);
    expect(reply.status).toBe(403);
    expect(reply.body.toString()).not.toContain("not served");
  });

  it("answers 404 for a missing file and for a folder", async () => {
    expect((await send("/api/files/build/assets/pack/one/nope.png")).status).toBe(404);
    expect((await send("/api/files/build/assets/pack")).status).toBe(404);
  });

  it("is read-only: a write from the studio's own origin gets 405", async () => {
    const reply = await send("/api/files/build/assets/pack/one/atlas.json", { method: "PUT", headers: { Origin: `http://127.0.0.1:${port}` } });
    expect(reply.status).toBe(405);
    expect(reply.headers["allow"]).toBe("GET, HEAD");
  });
});

describe("the guards as middleware", () => {
  it("refuses any request addressed to another host name", async () => {
    const read = await send("/api/files/build/assets/pack/one/atlas.json", { headers: { Host: "evil.example" } });
    expect(read.status).toBe(403);
    expect(read.body.toString()).not.toContain("wz.atlas");
    expect((await send("/", { headers: { Host: `192.168.1.20:${port}` } })).status).toBe(403);
    expect((await send("/", { headers: { Host: `localhost:${port}` } })).status).toBe(404);
  });

  it("refuses a write without a same-origin Origin, and lets one with it through", async () => {
    expect((await send("/write", { method: "POST" })).status).toBe(403);
    expect((await send("/write", { method: "POST", headers: { Origin: "https://evil.example" } })).status).toBe(403);
    expect((await send("/write", { method: "POST", headers: { Origin: `http://localhost:${port}` } })).status).toBe(403);
    const own = await send("/write", { method: "POST", headers: { Origin: `http://127.0.0.1:${port}` } });
    expect(own.status).toBe(200);
    expect(own.body.toString()).toBe("written");
  });
});
