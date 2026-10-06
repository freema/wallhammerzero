// The Express side of the services: the guards as middleware, the read-only files endpoint
// and the event stream. They sit in front of Vite and React Router in server.ts, and the
// tests mount them on a bare Express app.

import { readFileSync } from "node:fs";
import { extname } from "node:path";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { formatSse, parseTopics } from "./events.ts";
import type { EventHub } from "./events.ts";
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

/** How often an idle stream gets a comment line, so nothing between the server and the page closes it. */
const HEARTBEAT_MS = 20_000;

/**
 * `GET /api/events`: the event stream (Server-Sent Events), one per page. Mount it at
 * `/api/events`.
 *
 *   ?topics=assets            only these topics (default: all)
 *   Last-Event-ID: <id>       sent by the browser when it reconnects (or `?lastEventId=<id>`)
 *
 * The stream begins with `hello` (the state now: `state()`), then either the events the page
 * missed or one `reset` (it must load its data again), then every event as it is published.
 * The SSE event name is the topic; `data` is one line of JSON; `id` is the hub's event id.
 */
export function eventsHandler(hub: EventHub, state: () => unknown): RequestHandler {
  return (req: Request, res: Response) => {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      res.status(405).type("text/plain").send("the event stream is read-only\n");
      return;
    }
    const topics = parseTopics(typeof req.query["topics"] === "string" ? req.query["topics"] : undefined);
    if (!topics.ok) {
      res.status(400).type("text/plain").send(`${topics.message}\n`);
      return;
    }
    const header = req.headers["last-event-id"];
    const query = req.query["lastEventId"];
    const lastEventId = typeof header === "string" && header !== "" ? header : typeof query === "string" && query !== "" ? query : null;

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    // no-transform: nothing on the way may buffer or compress the stream.
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.flushHeaders();

    const subscription = hub.subscribe((event) => res.write(formatSse({ id: event.id, event: event.topic, data: event.data })), { lastEventId, topics: topics.topics });
    res.write("retry: 1000\n\n");
    res.write(formatSse({ event: "hello", data: { boot: hub.boot, state: state() } }));
    if (subscription.greeting.type === "reset") {
      // The id moves the page's Last-Event-ID to now (an empty id clears it), so the next
      // reconnect is judged from here.
      res.write(formatSse({ id: subscription.lastId ?? "", event: "reset", data: { reason: subscription.greeting.reason } }));
    } else {
      for (const event of subscription.greeting.events) res.write(formatSse({ id: event.id, event: event.topic, data: event.data }));
    }
    const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
    req.on("close", () => {
      clearInterval(heartbeat);
      subscription.unsubscribe();
    });
  };
}
