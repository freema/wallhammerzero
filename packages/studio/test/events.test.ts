// The event hub (ids, the ring buffer, what a reconnecting page is told) and the event stream
// over HTTP on a bare Express app.

import { createServer, request } from "node:http";
import type { ClientRequest, Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEventHub, formatSse, parseEventId, parseTopics } from "../server/services/events.ts";
import type { EventHub, HubEvent } from "../server/services/events.ts";
import { eventsHandler } from "../server/services/http.ts";

describe("the event hub", () => {
  it("gives every event an id <boot>-<n>, counting from 1, and hands it to the subscribers of its topic", () => {
    const hub = createEventHub({ boot: "abc" });
    const seen: HubEvent[] = [];
    const subscription = hub.subscribe((event) => seen.push(event));
    expect(subscription.greeting).toEqual({ type: "replay", events: [] });
    expect(subscription.lastId).toBeNull();

    const first = hub.publish("assets", { n: 1 });
    const second = hub.publish("assets", { n: 2 });
    expect([first.id, second.id]).toEqual(["abc-1", "abc-2"]);
    expect(seen).toEqual([first, second]);
    expect(hub.subscribers()).toBe(1);

    subscription.unsubscribe();
    hub.publish("assets", { n: 3 });
    expect(seen).toHaveLength(2);
    expect(hub.subscribers()).toBe(0);
  });

  it("replays exactly the events after the id a reconnecting page names", () => {
    const hub = createEventHub({ boot: "abc", ringSize: 5 });
    for (let n = 1; n <= 4; n += 1) hub.publish("assets", { n });

    const ids = (lastEventId: string): unknown => {
      const subscription = hub.subscribe(() => undefined, { lastEventId });
      subscription.unsubscribe();
      return subscription.greeting.type === "replay" ? subscription.greeting.events.map((event) => event.id) : subscription.greeting;
    };
    expect(ids("abc-2")).toEqual(["abc-3", "abc-4"]);
    expect(ids("abc-4")).toEqual([]); // nothing was missed
    expect(hub.subscribe(() => undefined, { lastEventId: "abc-1" }).lastId).toBe("abc-4");
  });

  it("the ring keeps the last events only, and a page that missed more is told to reset", () => {
    const hub = createEventHub({ boot: "abc", ringSize: 3 });
    for (let n = 1; n <= 10; n += 1) hub.publish("assets", { n });
    expect(hub.buffered().map((event) => event.id)).toEqual(["abc-8", "abc-9", "abc-10"]);

    const greet = (lastEventId: string) => hub.subscribe(() => undefined, { lastEventId }).greeting;
    // abc-7 is the newest id whose successors are all still there.
    expect(greet("abc-7")).toMatchObject({ type: "replay", events: [{ id: "abc-8" }, { id: "abc-9" }, { id: "abc-10" }] });
    expect(greet("abc-6")).toEqual({ type: "reset", reason: "more than 3 events were missed" });
    expect(greet("abc-1")).toEqual({ type: "reset", reason: "more than 3 events were missed" });
  });

  it("resets a page whose id is from another server process, ahead of this one, or not an id", () => {
    const hub = createEventHub({ boot: "abc" });
    hub.publish("assets", {});
    const greet = (lastEventId: string) => hub.subscribe(() => undefined, { lastEventId }).greeting;
    expect(greet("xyz-1")).toEqual({ type: "reset", reason: "the server was restarted" });
    expect(greet("abc-2")).toEqual({ type: "reset", reason: "the last event id is ahead of this server" });
    for (const id of ["", "abc", "abc-0", "abc--1", "abc-1.5", "abc-1 ", "ABC-1", "1"]) {
      expect([id, greet(id)]).toEqual([id, { type: "reset", reason: "the last event id is not one of this server" }]);
    }
  });

  it("a subscriber is not called for events published before it subscribed, and a listener that unsubscribes while called does not disturb the others", () => {
    const hub = createEventHub({ boot: "abc" });
    hub.publish("assets", { early: true });
    const first: string[] = [];
    const second: string[] = [];
    const one = hub.subscribe((event) => {
      first.push(event.id);
      one.unsubscribe();
    });
    hub.subscribe((event) => second.push(event.id));
    hub.publish("assets", {});
    hub.publish("assets", {});
    expect(first).toEqual(["abc-2"]);
    expect(second).toEqual(["abc-2", "abc-3"]);
  });

  it("refuses a ring size or a boot name it cannot use", () => {
    expect(() => createEventHub({ ringSize: 0 })).toThrow(/ring size/);
    expect(() => createEventHub({ boot: "A-1" })).toThrow(/boot name/);
    expect(createEventHub().boot).toMatch(/^[a-z0-9]{8,}$/);
  });
});

describe("the text of the stream", () => {
  it("formats an event as id, event and one line of JSON data", () => {
    expect(formatSse({ id: "abc-7", event: "assets", data: { text: "two\nlines" } })).toBe('id: abc-7\nevent: assets\ndata: {"text":"two\\nlines"}\n\n');
    expect(formatSse({ event: "hello", data: 1 })).toBe("event: hello\ndata: 1\n\n");
    expect(formatSse({ id: "", event: "reset", data: null })).toBe("id:\nevent: reset\ndata: null\n\n");
  });

  it("reads event ids and topic lists strictly", () => {
    expect(parseEventId("abc-12")).toEqual({ boot: "abc", n: 12 });
    expect(parseEventId("abc-012")).toBeNull();
    expect(parseTopics(undefined)).toEqual({ ok: true, topics: null });
    expect(parseTopics("assets")).toEqual({ ok: true, topics: ["assets"] });
    expect(parseTopics("assets,nope")).toEqual({ ok: false, message: 'unknown topic "nope" (topics: assets, tasks)' });
  });
});

describe("GET /api/events over HTTP", () => {
  let server: Server;
  let port: number;
  let hub: EventHub;
  const open: ClientRequest[] = [];

  beforeAll(async () => {
    hub = createEventHub({ boot: "http", ringSize: 4 });
    const app = express();
    app.use("/api/events", eventsHandler(hub, () => ({ writing: false })));
    server = createServer(app);
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    for (const client of open) client.destroy();
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  });

  /** Opens the stream and collects its text. `until(text)` resolves once the text satisfies it. */
  function stream(path: string, headers: Record<string, string> = {}): Promise<{ status: number; type: string | undefined; text: () => string; until: (ready: (text: string) => boolean) => Promise<string>; close: () => void }> {
    return new Promise((resolve, reject) => {
      const client = request({ host: "127.0.0.1", port, path, headers }, (res) => {
        let text = "";
        let waiting: { ready: (text: string) => boolean; done: (text: string) => void }[] = [];
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          text += chunk;
          waiting = waiting.filter((entry) => (entry.ready(text) ? (entry.done(text), false) : true));
        });
        resolve({
          status: res.statusCode ?? 0,
          type: res.headers["content-type"],
          text: () => text,
          until: (ready) => (ready(text) ? Promise.resolve(text) : new Promise((done) => waiting.push({ ready, done }))),
          close: () => client.destroy(),
        });
      });
      client.on("error", reject);
      open.push(client);
      client.end();
    });
  }

  it("starts with the retry time and hello (the state now), then sends every event as it is published", async () => {
    const page = await stream("/api/events");
    expect(page.status).toBe(200);
    expect(page.type).toBe("text/event-stream; charset=utf-8");
    const start = await page.until((text) => text.includes("event: hello"));
    expect(start).toBe('retry: 1000\n\nevent: hello\ndata: {"boot":"http","state":{"writing":false}}\n\n');

    const event = hub.publish("assets", { type: "activity", writing: true });
    const text = await page.until((now) => now.includes(event.id));
    expect(text.slice(start.length)).toBe(`id: ${event.id}\nevent: assets\ndata: {"type":"activity","writing":true}\n\n`);
    page.close();
  });

  it("a page that reconnects with Last-Event-ID gets what it missed, in order, and then the live events", async () => {
    const missedFrom = hub.publish("assets", { n: "seen" }).id;
    const a = hub.publish("assets", { n: "missed-1" }).id;
    const b = hub.publish("assets", { n: "missed-2" }).id;
    const page = await stream("/api/events", { "Last-Event-ID": missedFrom });
    const text = await page.until((now) => now.includes(b));
    expect(text).not.toContain('"seen"');
    expect(text.indexOf(a)).toBeGreaterThan(text.indexOf("event: hello"));
    expect(text.indexOf(b)).toBeGreaterThan(text.indexOf(a));
    expect(text).not.toContain("event: reset");

    const live = hub.publish("assets", { n: "live" }).id;
    expect(await page.until((now) => now.includes(live))).toContain('"live"');
    page.close();
  });

  it("a page that missed more than the ring holds, or comes from another server process, gets one reset with the id of now", async () => {
    for (let n = 0; n < 6; n += 1) hub.publish("assets", { n });
    const newest = hub.buffered().at(-1)?.id as string;
    for (const lastEventId of ["http-1", "other-3"]) {
      const page = await stream(`/api/events?lastEventId=${lastEventId}`);
      const text = await page.until((now) => now.includes("event: reset"));
      expect(text).toContain(`id: ${newest}\nevent: reset\ndata: {"reason":`);
      expect(text).not.toContain("event: assets");
      page.close();
    }
  });

  it("refuses an unknown topic with 400 and a write with 405, and stops listening when the page goes away", async () => {
    expect((await stream("/api/events?topics=nope")).status).toBe(400);
    const post = await new Promise<number>((resolve, reject) => {
      const client = request({ host: "127.0.0.1", port, path: "/api/events", method: "POST" }, (res) => resolve(res.statusCode ?? 0));
      client.on("error", reject);
      client.end();
    });
    expect(post).toBe(405);

    const before = hub.subscribers();
    const page = await stream("/api/events?topics=assets");
    await page.until((text) => text.includes("event: hello"));
    expect(hub.subscribers()).toBe(before + 1);
    page.close();
    for (let i = 0; i < 200 && hub.subscribers() > before; i += 1) await new Promise((done) => setTimeout(done, 10));
    expect(hub.subscribers()).toBe(before);
  });
});
