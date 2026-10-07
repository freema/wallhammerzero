// The whole studio, end to end: the real server.ts as its own process, in production mode
// (the built app; `npm run check` builds it before the tests), over the fixture assets. What
// the pages show is read from the server-rendered HTML. Dev mode differs only in who serves
// the app code (Vite); it is checked in the browser, not here.

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { copyFixtures, removeTemps, tempRoot, writeTasksReadme } from "./helpers.ts";

const NOTE_BODY = ["## Origin", "Why.", "", "## Read first", "- Nothing.", "", "## Scope", "1. Do it.", "", "## Out of scope", "- The rest.", "", "## Acceptance", "- It is done."].join("\n");

const SERVER = fileURLToPath(new URL("../server.ts", import.meta.url));
const BUILD = fileURLToPath(new URL("../build/server/index.js", import.meta.url));

let child: ChildProcess;
let origin: string;
let root: string;
let output = "";

beforeAll(async () => {
  if (!existsSync(BUILD)) throw new Error("the studio is not built: run `npm run build` in packages/studio first (`npm run check` does)");
  root = tempRoot("server");
  child = spawn(process.execPath, [SERVER], {
    env: { PATH: process.env["PATH"], NODE_ENV: "production", WHZ_STUDIO_ROOT: root, WHZ_STUDIO_ASSETS: copyFixtures(root), WHZ_STUDIO_PORT: "0", WHZ_STUDIO_HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  origin = await new Promise<string>((resolve, reject) => {
    const read = (chunk: Buffer): void => {
      output += chunk.toString();
      const match = /server on (http:\/\/127\.0\.0\.1:\d+)/.exec(output);
      if (match?.[1] !== undefined) resolve(match[1]);
    };
    child.stdout?.on("data", read);
    child.stderr?.on("data", read);
    child.on("exit", (code) => reject(new Error(`the server stopped with exit code ${code}:\n${output}`)));
  });
  // The server bakes the fixtures on start. Wait until no card is unbaked any more.
  for (let i = 0; i < 100; i += 1) {
    if (!(await page("/gallery")).html.includes('data-status="unbaked"')) return;
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error(`the start bake did not finish:\n${output}`);
});

afterAll(async () => {
  if (child.exitCode === null) {
    const gone = new Promise((done) => child.once("exit", done));
    child.kill("SIGTERM");
    await gone;
  }
  removeTemps();
});

async function page(path: string, init?: RequestInit): Promise<{ status: number; html: string; response: Response }> {
  const response = await fetch(`${origin}${path}`, init);
  return { status: response.status, html: await response.text(), response };
}

/** The cards of a gallery page: [id, status, kind] in page order. */
function cards(html: string): string[][] {
  return [...html.matchAll(/<li class="card[^"]*" data-asset-id="([^"]+)" data-status="([^"]+)" data-kind="([^"]+)"/g)].map((match) => match.slice(1, 4));
}

/** Undoes React's HTML escaping of the characters these tests meet. */
const text = (html: string): string => html.replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&amp;", "&");

describe("/gallery", () => {
  it("lists every asset with a thumbnail, and shows the broken one as an error card with its message", async () => {
    const { status, html } = await page("/gallery");
    expect(status).toBe(200);
    expect(cards(html)).toEqual([
      ["ground/floor", "baked", "tiles"],
      ["shapes/broken", "error", "unknown"],
      ["shapes/square", "baked", "sprite"],
    ]);
    expect(html).toContain('data-shown="3" data-total="3"');
    expect(text(html)).toContain("the broken fixture always fails: no corners today");
    expect(html).toContain("bake failed");

    // First-frame thumbnails at the default 4x: integer multiples of the frame size.
    const images = [...html.matchAll(/<img class="pixel" src="([^"]+)"[^>]*width="(\d+)" height="(\d+)" data-native-size="([^"]+)" data-zoom="(\d+)"/g)].map((match) => match.slice(1, 6));
    expect(images.map(([src, w, h, native, zoom]) => [text(src ?? "").replace(/\?h=[0-9a-f]{16}\.[0-9a-f]{16}$/, "?h=<hash>"), w, h, native, zoom])).toEqual([
      ["/api/files/build/assets/ground/floor/frames/seed-1/still.default.0.png?h=<hash>", "64", "64", "16x16", "4"],
      ["/api/files/build/assets/shapes/square/frames/seed-1/idle.default.0.png?h=<hash>", "40", "40", "10x10", "4"],
    ]);
    for (const [src] of images) {
      const image = await fetch(`${origin}${text(src ?? "")}`);
      expect(image.status).toBe(200);
      expect(image.headers.get("content-type")).toBe("image/png");
      expect(image.headers.get("cache-control")).toContain("immutable");
      expect(Buffer.from(await image.arrayBuffer()).subarray(1, 4).toString()).toBe("PNG");
    }
  });

  it("filters by pack, kind, status and text, and takes the zoom from the URL", async () => {
    expect(cards((await page("/gallery?pack=shapes")).html).map(([id]) => id)).toEqual(["shapes/broken", "shapes/square"]);
    expect(cards((await page("/gallery?kind=tiles")).html).map(([id]) => id)).toEqual(["ground/floor"]);
    expect(cards((await page("/gallery?status=error")).html).map(([id]) => id)).toEqual(["shapes/broken"]);
    expect(cards((await page("/gallery?q=pulse")).html).map(([id]) => id)).toEqual(["shapes/square"]);
    expect(cards((await page("/gallery?pack=ground&q=floor&kind=tiles")).html).map(([id]) => id)).toEqual(["ground/floor"]);

    const none = await page("/gallery?q=nothing-like-this");
    expect(cards(none.html)).toEqual([]);
    expect(none.html).toContain("No asset matches these filters.");
    expect(none.html).toContain('data-shown="0" data-total="3"');

    const small = await page("/gallery?kind=tiles&zoom=2");
    expect(small.html).toMatch(/width="32" height="32" data-native-size="16x16" data-zoom="2"/);
    const wrong = await page("/gallery?kind=tiles&zoom=2.5");
    expect(wrong.html).toMatch(/width="64" height="64" data-native-size="16x16" data-zoom="4"/);
  });
});

describe("/asset/:id", () => {
  it("shows the meta, the clips, and the player with every variant on the page as rendered", async () => {
    const { status, html } = await page("/asset/shapes/square");
    expect(status).toBe(200);
    expect(html).toContain('data-asset-id="shapes/square" data-status="baked"');
    expect(html).toContain('<tr data-clip="idle">');
    expect(html).toContain('<tr data-clip="pulse">');
    // The player starts on the first clip, playing, at 8x; the variants grid has both seeds and the preset the studio rendered.
    expect(html).toMatch(/<section class="player" data-player="true" data-clip="idle" data-facing="default" data-frame="0" data-playing="true" data-speed="1" data-zoom="8">/);
    expect([...html.matchAll(/<li data-variant="([^"]+)" data-kind="(\w+)"/g)].map((match) => [match[1], match[2]])).toEqual([
      ["seed-1", "seed"],
      ["seed-2", "seed"],
      ["preset-tight", "preset"],
    ]);
    expect([...html.matchAll(/<option[^>]*>([^<]+)<\/option>/g)].map((match) => match[1])).toEqual(["idle", "pulse", "checker", "dark", "light", "floor tiles"]);
    // The frame is 10 x 10 px; the main preview shows the first frame of the first seed as its still image, at the zoom of the player.
    expect(html).toMatch(/<div class="preview" data-preview="main" data-live="false" data-zoom="8" data-native-size="10x10"[^>]*><img class="pixel" src="\/api\/files\/build\/assets\/shapes\/square\/frames\/seed-1\/idle\.default\.0\.png\?h=[0-9a-f]{16}\.[0-9a-f]{16}"[^>]*width="80" height="80" data-native-size="10x10" data-zoom="8"/);
    // `?zoom=`, `?clip=` and `?facing=` choose the start; what cannot be is the default.
    const asked = (await page("/asset/shapes/square?zoom=3&clip=pulse&facing=default")).html;
    expect(asked).toMatch(/<section class="player" data-player="true" data-clip="pulse" data-facing="default" data-frame="0" data-playing="true" data-speed="1" data-zoom="3">/);
    expect(asked).toMatch(/data-preview="main" data-live="false" data-zoom="3" data-native-size="10x10"/);
    const wrong = (await page("/asset/shapes/square?zoom=40&clip=nope")).html;
    expect(wrong).toMatch(/data-clip="idle" data-facing="default" data-frame="0" data-playing="true" data-speed="1" data-zoom="16">/);
    // The 1x row and the grid hold one preview per variant; a gallery card is a preview too.
    expect([...html.matchAll(/data-preview="([^"]+)"/g)].map((match) => match[1])).toEqual(["main", "seed-1", "seed-2", "preset-tight", "1x-seed-1", "1x-seed-2", "1x-preset-tight"]);
    expect((await page("/gallery")).html).toMatch(/<div class="preview" data-preview="shapes\/square" data-live="false" data-zoom="4" data-native-size="10x10"/);
  });

  it("shows the error of an asset whose bake failed", async () => {
    const { status, html } = await page("/asset/shapes/broken");
    expect(status).toBe(200);
    expect(html).toContain('data-asset-id="shapes/broken" data-status="error"');
    expect(text(html)).toContain("the broken fixture always fails: no corners today");
  });

  it("answers 404 for an asset that does not exist", async () => {
    const { status, html } = await page("/asset/shapes/nope");
    expect(status).toBe(404);
    expect(text(html)).toContain('There is no asset "shapes/nope"');
  });
});

describe("/ (dashboard)", () => {
  const counts = (html: string): Record<string, string> =>
    Object.fromEntries([...html.matchAll(/data-count="([a-z]+)"[^>]*><strong>(\d+)<\/strong>/g)].map((match) => [match[1], match[2]]));

  it("counts the assets by status and by kind, and lists the bake errors", async () => {
    const { status, html } = await page("/");
    expect(status).toBe(200);
    expect(counts(html)).toEqual({ total: "3", baked: "2", stale: "0", error: "1", unbaked: "0" });
    expect([...html.matchAll(/<tr data-kind="([a-z]+)">/g)].map((match) => match[1])).toEqual(["sprite", "tiles", "unknown"]);
    expect(html).toContain('<ul class="errors" data-errors="1">');
    expect(text(html)).toContain("the broken fixture always fails: no corners today");
    // The bake on start is the last run so far.
    expect(html).toContain('data-run="1" data-failed="1"');
  });

  it("Bake all: refused without the studio's own Origin, and runs with it", async () => {
    // The dashboard is the index route, so its form posts to `/?index` (React Router's rule).
    const body = new URLSearchParams({ intent: "bake-all" });
    const headers = { "Content-Type": "application/x-www-form-urlencoded" };
    expect((await page("/?index", { method: "POST", body, headers })).status).toBe(403);
    expect((await page("/?index", { method: "POST", body, headers: { ...headers, Origin: "https://evil.example" } })).status).toBe(403);
    expect((await page("/")).html).toContain('data-run="1"');

    const done = await page("/?index", { method: "POST", body, headers: { ...headers, Origin: origin } });
    expect(done.status).toBe(200);
    expect(done.html).toContain('data-run="2" data-failed="1"');
    expect(counts(done.html)).toEqual({ total: "3", baked: "2", stale: "0", error: "1", unbaked: "0" });

    const unknown = await page("/?index", { method: "POST", body: new URLSearchParams({ intent: "something-else" }), headers: { ...headers, Origin: origin } });
    expect(unknown.status).toBe(400);
  });
});

describe("verdicts", () => {
  const headers = { "Content-Type": "application/x-www-form-urlencoded" };

  it("a verdict posted to the asset page writes review.json and the inbox, and shows on the page and the card", async () => {
    const before = (await page("/asset/shapes/square")).html;
    expect(before).toContain('<section class="verdicts" data-verdicts="true" data-review="none" data-count="0">');
    const hash = /Output hash<\/dt><dd><code>([0-9a-f]{16})<\/code>/.exec(before)?.[1];
    expect(hash).toMatch(/^[0-9a-f]{16}$/);

    const body = new URLSearchParams([["intent", "verdict"], ["status", "rejected"], ["tags", "silhouette"], ["tags", "palette"], ["comment", "Corners too soft."], ["about-frame", "on"], ["frame", "1"], ["seed", "2"], ["preset", ""], ["output-hash", hash ?? ""]]);
    const done = await fetch(`${origin}/asset/shapes/square`, { method: "POST", body, headers: { ...headers, Origin: origin } });
    expect(done.status).toBe(200);
    const file = JSON.parse(readFileSync(join(root, "assets", "shapes", "square", "review.json"), "utf8")) as { format: string; verdicts: Record<string, unknown>[] };
    expect(file.format).toBe("wz.review/1");
    expect(file.verdicts).toHaveLength(1);
    expect(file.verdicts[0]).toMatchObject({ status: "rejected", outputHash: hash, variant: { seed: 2, preset: null }, tags: ["palette", "silhouette"], comment: "Corners too soft.", frame: 1 });
    const inbox = readFileSync(join(root, "reviews", "INBOX.md"), "utf8");
    expect(inbox).toContain("## Rejected\n\n- **shapes/square**");
    expect(inbox).toContain("seed 2 · frame 1 · palette, silhouette");
    expect(inbox).toContain("> Corners too soft.");

    const after = (await page("/asset/shapes/square")).html;
    expect(after).toContain('data-review="rejected" data-count="1"');
    expect(after).toContain('<span class="badge badge-review badge-review-rejected" data-review="rejected"');
    expect(after).toContain("Corners too soft.");
    const card = (await page("/gallery")).html;
    expect(card).toMatch(/data-asset-id="shapes\/square"[^]*?badge-review-rejected/);
    expect(card).not.toMatch(/data-asset-id="ground\/floor"[^]*?badge-review[^]*?data-asset-id="shapes\/broken"/);
    expect(card).toContain('<form class="card-actions" data-verdict-quick="true" data-discover="true" action="/asset/shapes/square" method="post"><input type="hidden" name="intent" value="verdict"/><input type="hidden" name="output-hash" value="' + hash + '"/><input type="hidden" name="seed" value="1"/>');
    expect(cards((await page("/gallery?review=rejected")).html).map((card) => card[0])).toEqual(["shapes/square"]);
    expect(cards((await page("/gallery?review=unreviewed")).html).map((card) => card[0])).toEqual(["ground/floor", "shapes/broken"]);

    // The quick form of a card: approve as it is. The verdict is on what the card showed.
    const quick = await fetch(`${origin}/asset/shapes/square`, { method: "POST", body: new URLSearchParams({ intent: "verdict", status: "approved", "output-hash": hash ?? "", seed: "1" }), headers: { ...headers, Origin: origin } });
    expect(quick.status).toBe(200);
    expect((await page("/asset/shapes/square")).html).toContain('data-review="approved" data-count="2"');
    expect(readFileSync(join(root, "reviews", "INBOX.md"), "utf8")).toContain("## Approved\n\n- **shapes/square**");
  });

  it("is refused without the studio's own Origin, and a bad verdict is refused with the reason", async () => {
    const body = new URLSearchParams({ intent: "verdict", status: "approved" });
    expect((await fetch(`${origin}/asset/shapes/square`, { method: "POST", body, headers })).status).toBe(403);
    expect((await fetch(`${origin}/asset/shapes/square`, { method: "POST", body, headers: { ...headers, Origin: "https://evil.example" } })).status).toBe(403);
    const bad = await fetch(`${origin}/asset/shapes/square`, { method: "POST", body: new URLSearchParams({ intent: "verdict", status: "meh" }), headers: { ...headers, Origin: origin } });
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain("a verdict is one of approved, rejected, comment");
    const other = await fetch(`${origin}/asset/shapes/square`, { method: "POST", body: new URLSearchParams({ intent: "other" }), headers: { ...headers, Origin: origin } });
    expect(other.status).toBe(400);
    expect(await other.text()).toContain("unknown intent");
    expect((await fetch(`${origin}/asset/shapes/nope`, { method: "POST", body, headers: { ...headers, Origin: origin } })).status).toBe(400);
    expect(JSON.parse(readFileSync(join(root, "assets", "shapes", "square", "review.json"), "utf8")).verdicts).toHaveLength(2);
  });
});

describe("task notes", () => {
  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  it("a rejected verdict offers Create task; the POST writes the note and the queue row, links the verdict, and /tasks lists it", async () => {
    writeTasksReadme(root, [], 20);
    expect((await page("/tasks")).html).toContain('<main class="tasks-page" data-tasks="0">');
    const before = (await page("/asset/shapes/square")).html;
    const rejected = /data-verdict="(v-[^"]+)" data-status="rejected"/.exec(before)?.[1];
    expect(rejected).toMatch(/^v-/);
    expect(before).toContain("Create task…");

    const body = new URLSearchParams({ intent: "task", verdict: rejected ?? "", title: "Square: corners too soft", slug: "", priority: "P1", size: "S", body: NOTE_BODY });
    const done = await fetch(`${origin}/asset/shapes/square`, { method: "POST", body, headers: { ...headers, Origin: origin } });
    expect(done.status).toBe(200);
    const date = new Date().toISOString().slice(0, 10);
    const file = `tasks/${date}-square-corners-too-soft.md`;
    expect(readFileSync(join(root, file), "utf8")).toContain(`# SQUARE: CORNERS TOO SOFT (${date})\n\n**GATE:** none · **Priority:** P1 · **Size:** S · **Depends on:** none\n\n## Origin`);
    expect(readFileSync(join(root, "tasks", "README.md"), "utf8")).toContain(`| 21 | [Square: corners too soft](${date}-square-corners-too-soft.md) | none | none |\n<!-- queue:end`);
    const review = JSON.parse(readFileSync(join(root, "assets", "shapes", "square", "review.json"), "utf8")) as { verdicts: { id: string; task: string | null }[] };
    expect(review.verdicts.map((verdict) => verdict.task)).toEqual([file, null]);

    const after = (await page("/asset/shapes/square")).html;
    expect(after).toContain(`<span class="verdict-task" data-task="${file}">`);
    expect(after).toContain(`<code>${file}</code>`);
    expect(after).not.toContain("Create task…");
    const list = (await page("/tasks")).html;
    expect(list).toContain('<main class="tasks-page" data-tasks="1">');
    expect(list).toContain(`<tr data-task="${file}" data-number="21" data-open="true">`);
    expect(list).toContain("SQUARE: CORNERS TOO SOFT");

    // Again on the same verdict: refused, nothing written. A bad note: refused with the reason.
    const twice = await fetch(`${origin}/asset/shapes/square`, { method: "POST", body, headers: { ...headers, Origin: origin } });
    expect(twice.status).toBe(400);
    expect(await twice.text()).toContain("already has a task");
    const bad = await fetch(`${origin}/asset/shapes/square`, { method: "POST", body: new URLSearchParams({ intent: "task", verdict: review.verdicts[1]?.id ?? "", title: "x", priority: "P2", size: "S", body: "## Origin\nonly" }), headers: { ...headers, Origin: origin } });
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain("needs the sections");
    expect((await fetch(`${origin}/asset/shapes/square`, { method: "POST", body, headers })).status).toBe(403);
    expect(readdirSync(join(root, "tasks")).sort()).toEqual([`${date}-square-corners-too-soft.md`, "README.md"]);
    // The event stream takes the tasks topic.
    const stream = await fetch(`${origin}/api/events?topics=assets,tasks`, { headers: { Accept: "text/event-stream" } });
    expect(stream.status).toBe(200);
    await stream.body?.cancel();
  });
});

describe("live reload", () => {
  /** Opens the event stream. `until(ready)` resolves with the text so far once it satisfies `ready`. */
  async function events(path: string): Promise<{ response: Response; until: (ready: (text: string) => boolean) => Promise<string>; close: () => Promise<void> }> {
    const stop = new AbortController();
    const response = await fetch(`${origin}${path}`, { signal: stop.signal });
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let text = "";
    return {
      response,
      async until(ready) {
        while (!ready(text)) {
          const chunk = await reader?.read();
          if (chunk === undefined || chunk.done) throw new Error(`the event stream ended early:\n${text}`);
          text += decoder.decode(chunk.value, { stream: true });
        }
        return text;
      },
      async close() {
        stop.abort();
        await reader?.cancel().catch(() => undefined);
      },
    };
  }

  /** The `data` of every event named `name` in the stream text, parsed. */
  const dataOf = (stream: string, name: string): unknown[] => [...stream.matchAll(new RegExp(`^event: ${name}\\ndata: (.*)$`, "gm"))].map((match) => JSON.parse(match[1] as string) as unknown);

  it("every page carries the live light, and /api/events greets with the state of the server", async () => {
    for (const path of ["/", "/gallery", "/asset/shapes/square"]) expect([path, (await page(path)).html.includes('<span class="live" data-live="offline" role="status"')]).toEqual([path, true]);

    const stream = await events("/api/events?topics=assets");
    expect(stream.response.status).toBe(200);
    expect(stream.response.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    const start = await stream.until((now) => now.includes("event: hello") && now.endsWith("\n\n"));
    expect(start.startsWith("retry: 1000\n\n")).toBe(true);
    const [hello] = dataOf(start, "hello") as [{ boot: string; state: { writing: boolean; running: unknown; revision: number; watching: boolean } }];
    expect(hello.boot).toMatch(/^[a-z0-9]{8,}$/);
    expect(hello.state).toMatchObject({ writing: false, running: null, watching: true });
    expect(hello.state.revision).toBeGreaterThan(0);
    await stream.close();

    expect((await page("/api/events?topics=nope")).status).toBe(400);
  });

  it("a bake run is pushed to an open page: its progress, and at the end that nothing runs", async () => {
    const stream = await events("/api/events");
    await stream.until((now) => now.includes("event: hello"));
    const done = await page("/?index", { method: "POST", body: new URLSearchParams({ intent: "bake-all" }), headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: origin } });
    expect(done.status).toBe(200);

    const finished = (now: string): boolean => {
      const bakes = dataOf(now, "assets").filter((event) => (event as { type: string }).type === "bake") as { running: { done: number; total: number; current: string | null } | null }[];
      return bakes.length > 1 && bakes.at(-1)?.running === null;
    };
    const bakes = (dataOf(await stream.until(finished), "assets") as { type: string; running: { reason: string; done: number; total: number; current: string | null } | null }[]).filter((event) => event.type === "bake");
    expect(bakes[0]?.running).toMatchObject({ reason: "manual", total: 3, done: 0 });
    expect(bakes.map((event) => event.running?.current).filter((id) => typeof id === "string")).toEqual(expect.arrayContaining(["ground/floor", "shapes/broken", "shapes/square"]));
    expect(bakes.at(-1)?.running).toBeNull();
    await stream.close();
  });
});

describe("the guards in front of the app", () => {
  it("refuses a request for another host name, for pages and for files", async () => {
    // fetch does not let a caller set Host, so this goes through a raw request.
    const { request } = await import("node:http");
    const status = (path: string): Promise<number> =>
      new Promise((resolve, reject) => {
        const url = new URL(origin);
        request({ host: url.hostname, port: url.port, path, headers: { Host: "studio.evil.example" } }, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        })
          .on("error", reject)
          .end();
      });
    expect(await status("/gallery")).toBe(403);
    expect(await status("/api/files/build/assets/shapes/square/atlas.json")).toBe(403);
    expect(await status("/api/events")).toBe(403);
  });

  it("serves build outputs only", async () => {
    expect((await page("/api/files/build/assets/shapes/square/atlas.json")).status).toBe(200);
    expect((await page("/api/files/.studio-cache/index.json")).status).toBe(403);
    expect((await page("/api/files/build/..%2f.studio-cache/index.json")).status).toBe(400);
    expect((await page("/api/files/build/assets/shapes/square/nope.png")).status).toBe(404);
  });
});
