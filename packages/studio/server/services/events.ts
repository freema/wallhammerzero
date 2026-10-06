// The event hub: what the server pushes to open pages. One stream (`GET /api/events`, Server-
// Sent Events) carries every topic; a page opens it once and picks what it wants.
//
// - An event has a topic (`assets` today; later notes add `reviews`, `tasks`, `concepts`,
//   `audio`, `builds`), a JSON payload and an id.
// - Ids are `<boot>-<n>`: `boot` names this server process, `n` counts up from 1. A browser
//   that reconnects sends the last id it saw (`Last-Event-ID`), and the hub replays what came
//   after it from a ring buffer of the last events.
// - When it cannot replay (the id is from another process, or older than the buffer), it says
//   so with a `reset` event, and the page loads its data again. A page never has to guess
//   whether it missed something.

/** The topics of the stream. A later note adds its topic here. */
export const TOPICS = ["assets"] as const;
export type Topic = (typeof TOPICS)[number];

/** How many events the hub keeps for reconnecting pages. */
export const DEFAULT_RING_SIZE = 256;

/** One published event. */
export interface HubEvent {
  /** `<boot>-<n>`. */
  readonly id: string;
  readonly topic: Topic;
  /** The payload: plain JSON data. */
  readonly data: unknown;
}

/** What a new subscriber is told first. */
export type Greeting =
  /** Nothing was missed: `events` are the ones after the id the subscriber named (often none). */
  | { readonly type: "replay"; readonly events: readonly HubEvent[] }
  /** The subscriber may have missed events that the hub no longer has: load everything again. */
  | { readonly type: "reset"; readonly reason: string };

export interface Subscription {
  readonly greeting: Greeting;
  /** The id of the newest event when the subscription began, or null before the first event. */
  readonly lastId: string | null;
  unsubscribe(): void;
}

export interface EventHub {
  /** The name of this server process in event ids. */
  readonly boot: string;
  /** Publishes to every subscriber of the topic and keeps the event for reconnects. */
  publish(topic: Topic, data: unknown): HubEvent;
  /**
   * Starts a subscription. `lastEventId` is the id the subscriber saw last (null for a new
   * page). `topics` limits what it gets (null: everything). `listener` is called for every
   * later event, in order.
   */
  subscribe(listener: (event: HubEvent) => void, options?: { lastEventId?: string | null; topics?: readonly Topic[] | null }): Subscription;
  /** How many subscriptions are open. */
  subscribers(): number;
  /** The events in the buffer, oldest first. */
  buffered(): readonly HubEvent[];
}

export interface EventHubOptions {
  /** How many events are kept. */
  readonly ringSize?: number;
  /** The process name in ids. Tests set it; the default is random. */
  readonly boot?: string;
}

/** Splits `<boot>-<n>`. Null if the text is not an id. */
export function parseEventId(id: string): { boot: string; n: number } | null {
  const match = /^([a-z0-9]+)-([1-9][0-9]*)$/.exec(id);
  if (match === null) return null;
  const n = Number(match[2]);
  return Number.isSafeInteger(n) ? { boot: match[1] as string, n } : null;
}

export function createEventHub(options: EventHubOptions = {}): EventHub {
  const ringSize = options.ringSize ?? DEFAULT_RING_SIZE;
  if (!Number.isInteger(ringSize) || ringSize < 1) throw new Error(`the ring size must be a whole number of 1 or more, got ${ringSize}`);
  const boot = options.boot ?? Math.random().toString(36).slice(2, 10).padEnd(8, "0");
  if (!/^[a-z0-9]+$/.test(boot)) throw new Error(`the boot name must be lowercase letters and digits, got ${JSON.stringify(boot)}`);

  /** The last `ringSize` events, oldest first. The event `n` is at `ring[n - first]`. */
  const ring: HubEvent[] = [];
  /** The number of the newest event; 0 before the first. */
  let count = 0;
  const listeners = new Set<{ listener: (event: HubEvent) => void; topics: readonly Topic[] | null }>();

  const greet = (lastEventId: string | null, topics: readonly Topic[] | null): Greeting => {
    if (lastEventId === null) return { type: "replay", events: [] };
    const seen = parseEventId(lastEventId);
    if (seen === null) return { type: "reset", reason: "the last event id is not one of this server" };
    if (seen.boot !== boot) return { type: "reset", reason: "the server was restarted" };
    if (seen.n > count) return { type: "reset", reason: "the last event id is ahead of this server" };
    // The oldest event still in the buffer is `count - ring.length + 1`.
    if (seen.n < count - ring.length) return { type: "reset", reason: `more than ${ringSize} events were missed` };
    const missed = ring.slice(ring.length - (count - seen.n));
    return { type: "replay", events: topics === null ? missed : missed.filter((event) => topics.includes(event.topic)) };
  };

  return {
    boot,
    publish(topic, data) {
      count += 1;
      const event: HubEvent = { id: `${boot}-${count}`, topic, data };
      ring.push(event);
      if (ring.length > ringSize) ring.shift();
      for (const entry of [...listeners]) {
        if (entry.topics === null || entry.topics.includes(topic)) entry.listener(event);
      }
      return event;
    },
    subscribe(listener, { lastEventId = null, topics = null } = {}) {
      const greeting = greet(lastEventId, topics);
      const entry = { listener, topics };
      listeners.add(entry);
      return { greeting, lastId: count === 0 ? null : `${boot}-${count}`, unsubscribe: () => void listeners.delete(entry) };
    },
    subscribers: () => listeners.size,
    buffered: () => [...ring],
  };
}

/**
 * One event in the text form of Server-Sent Events. `data` is one line of JSON. Without an
 * `id` the browser keeps the id it remembers; an empty `id` clears it.
 */
export function formatSse(event: { id?: string | null; event: string; data: unknown }): string {
  const id = event.id === undefined || event.id === null ? "" : event.id === "" ? "id:\n" : `id: ${event.id}\n`;
  return `${id}event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

/** Reads the `topics` query value (`assets,reviews`). Null means every topic; unknown names are an error. */
export function parseTopics(value: string | undefined): { ok: true; topics: readonly Topic[] | null } | { ok: false; message: string } {
  if (value === undefined || value === "") return { ok: true, topics: null };
  const names = value.split(",").map((name) => name.trim()).filter((name) => name !== "");
  const unknown = names.filter((name) => !(TOPICS as readonly string[]).includes(name));
  if (unknown.length > 0) return { ok: false, message: `unknown topic ${unknown.map((name) => JSON.stringify(name)).join(", ")} (topics: ${TOPICS.join(", ")})` };
  return { ok: true, topics: names as Topic[] };
}
