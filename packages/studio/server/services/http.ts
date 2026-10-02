// The Express side of the services: the guards as middleware, and the read-only files
// endpoint. They sit in front of Vite and React Router in server.ts, and the tests mount them
// on a bare Express app.

import { readFileSync } from "node:fs";
import { extname } from "node:path";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { checkHost, checkSameOrigin } from "./guard.ts";
import type { GuardVerdict } from "./guard.ts";
import type { SafePath } from "./safe-path.ts";

function answer(res: Response, verdict: GuardVerdict, next: NextFunction): void {
  if (verdict.ok) next();
  else res.status(verdict.status).type("text/plain").send(`${verdict.message}\n`);
}

/** The Host check on every request (see guard.ts). */
export function hostGuard(extraHosts: readonly string[] = []): RequestHandler {
  return (req, res, next) => answer(res, checkHost(req.headers.host, extraHosts), next);
}

/** The same-origin check on every request that is not GET, HEAD or OPTIONS (see guard.ts). */
export function writeGuard(): RequestHandler {
  return (req, res, next) => answer(res, checkSameOrigin({ method: req.method, host: req.headers.host, origin: req.headers.origin }), next);
}

/** What the files endpoint serves. Anything else goes out as a download, never as a page. */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const STATUS: Readonly<Record<Exclude<SafePath, { ok: true }>["reason"], number>> = { invalid: 400, forbidden: 403, missing: 404 };

/**
 * `GET /api/files/<path relative to the checkout>`: a build output, read-only. Mount it at
 * `/api/files`. `resolve` is the safe path resolver bound to the checkout (services.files).
 *
 * With a `?h=<hash>` query the answer may be cached for good: the caller put the content's
 * hash in the URL, so a changed file has another URL. Without it the browser revalidates
 * every time (ETag from size and modification time).
 */
export function filesHandler(resolve: (requestPath: string) => SafePath): RequestHandler {
  return (req: Request, res: Response) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");
      res.status(405).type("text/plain").send("the files endpoint is read-only\n");
      return;
    }
    let requestPath: string;
    try {
      // req.path is still percent-encoded. Decoding first means an encoded slash or dot is
      // judged like a plain one.
      requestPath = decodeURIComponent(req.path).replace(/^\//, "");
    } catch {
      res.status(400).type("text/plain").send("not a valid path\n");
      return;
    }
    const file = resolve(requestPath);
    if (!file.ok) {
      res.status(STATUS[file.reason]).type("text/plain").send(`${file.message}\n`);
      return;
    }
    const etag = `"${file.size.toString(16)}-${Math.floor(file.mtimeMs).toString(16)}"`;
    const pinned = typeof req.query["h"] === "string" && req.query["h"] !== "";
    res.setHeader("Cache-Control", pinned ? "public, max-age=31536000, immutable" : "no-cache");
    res.setHeader("ETag", etag);
    if (req.headers["if-none-match"] === etag) {
      res.status(304).end();
      return;
    }
    const type = CONTENT_TYPES[extname(file.path).toLowerCase()];
    res.setHeader("Content-Type", type ?? "application/octet-stream");
    if (type === undefined) res.setHeader("Content-Disposition", "attachment");
    // Build outputs are small (sheets, frames, JSON): read whole, so the length is always the
    // length of what is sent, even while a bake is replacing the file.
    let content: Buffer;
    try {
      content = readFileSync(file.path);
    } catch {
      res.status(404).type("text/plain").send("no such file\n");
      return;
    }
    res.setHeader("Content-Length", content.length);
    res.end(req.method === "HEAD" ? undefined : content);
  };
}
