// The owner's verdicts (server/services/reviews.ts): review.json per asset, written only by
// the studio, tied to the output hash; the generated inbox; what the index shows for them.

import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { VERDICT_TAGS as APP_TAGS } from "../app/lib/reviews.ts";
import { readConfig } from "../server/services/config.ts";
import { createServices } from "../server/services/index.ts";
import type { AssetsEvent, StudioServices } from "../server/services/index.ts";
import { appendVerdict, createReviewService, INBOX_FILE, parseVerdictInput, readReview, renderInbox, REVIEW_FORMAT, reviewState, VERDICT_TAGS } from "../server/services/reviews.ts";
import type { InboxEntry, Verdict } from "../server/services/reviews.ts";
import { removeTemps, tempRoot, waitFor, writeAsset } from "./helpers.ts";

const open: StudioServices[] = [];
afterAll(async () => {
  for (const services of open) await services.close();
  removeTemps();
});

/** A studio over `root` with the watcher on, started, its events collected. */
function studio(root: string): { services: StudioServices; events: AssetsEvent[] } {
  const services = createServices(readConfig({ WHZ_STUDIO_ROOT: root, WHZ_STUDIO_WATCH_POLL_MS: "40" }), { debounceMs: 60 });
  open.push(services);
  const events: AssetsEvent[] = [];
  services.events.subscribe((event) => events.push(event.data as AssetsEvent), { topics: ["assets"] });
  services.start();
  return { services, events };
}

async function quiet(services: StudioServices): Promise<void> {
  await waitFor("no bake in flight", () => services.bake.state().running === null && services.bake.state().queued === 0);
  await services.live.idle();
}

const inbox = (root: string): string => readFileSync(join(root, ...INBOX_FILE.split("/")), "utf8");

describe("review.json", () => {
  it("is written next to the asset, append-only, with every field of the verdict, and nothing else is left behind", () => {
    const root = tempRoot("review-file");
    const gen = writeAsset(root, "props/crate");
    const entry = { id: "props/crate", folder: join(root, "assets", "props", "crate") };
    const target = { entry, outputHash: "1111111111111111", sourceHash: "aaaaaaaaaaaaaaaa" };
    expect(readReview(entry)).toEqual({ format: REVIEW_FORMAT, asset: "props/crate", verdicts: [] });

    const first = appendVerdict(target, { status: "rejected", tags: ["silhouette", "palette", "silhouette"], comment: "  Too dark.\r\nFeet slide.  ", frame: 2, variant: { seed: 1, preset: null } }, new Date("2026-10-07T01:30:12.345Z"));
    expect(first.path).toBe(join(entry.folder, "review.json"));
    expect(first.verdict).toEqual({
      id: "v-20261007T013012-1",
      at: "2026-10-07T01:30:12Z",
      status: "rejected",
      outputHash: "1111111111111111",
      sourceHash: "aaaaaaaaaaaaaaaa",
      variant: { seed: 1, preset: null },
      tags: ["palette", "silhouette"],
      comment: "Too dark.\nFeet slide.",
      frame: 2,
    });
    const second = appendVerdict({ ...target, outputHash: "2222222222222222" }, { status: "approved" }, new Date("2026-10-07T01:30:12Z"));
    expect(second.verdict).toMatchObject({ id: "v-20261007T013012-2", status: "approved", outputHash: "2222222222222222", variant: null, tags: [], comment: "", frame: null });

    const text = readFileSync(first.path, "utf8");
    expect(text.endsWith("\n")).toBe(true);
    expect(JSON.parse(text)).toEqual({ format: REVIEW_FORMAT, asset: "props/crate", verdicts: [first.verdict, second.verdict] });
    expect(readdirSync(entry.folder).sort()).toEqual(["gen.ts", "review.json"]); // no temp file
    expect(existsSync(gen)).toBe(true);
  });

  it("refuses a bad input before writing anything", () => {
    const root = tempRoot("review-bad");
    writeAsset(root, "props/crate");
    const entry = { id: "props/crate", folder: join(root, "assets", "props", "crate") };
    const target = { entry, outputHash: null, sourceHash: "a" };
    expect(() => appendVerdict(target, { status: "maybe" as "approved" })).toThrow(/approved, rejected, comment/);
    expect(() => appendVerdict(target, { status: "rejected", tags: ["ugly"] })).toThrow(/unknown tags: ugly/);
    expect(() => appendVerdict(target, { status: "comment", frame: -1 })).toThrow(/frame/);
    expect(() => appendVerdict(target, { status: "comment", frame: 1.5 })).toThrow(/frame/);
    expect(() => appendVerdict(target, { status: "comment", comment: "x".repeat(4001) })).toThrow(/longer than 4000/);
    expect(existsSync(join(entry.folder, "review.json"))).toBe(false);
    expect(parseVerdictInput({ status: "comment", comment: " note " })).toEqual({ status: "comment", variant: null, tags: [], comment: "note", frame: null });
  });

  it("the state: the last verdict counts, and the asset is changed when its output hash is not the verdict's", () => {
    const verdict = (status: Verdict["status"], outputHash: string | null): Verdict => ({ id: status, at: "", status, outputHash, sourceHash: "", variant: null, tags: [], comment: "", frame: null });
    expect(reviewState({ verdicts: [] }, "1111")).toEqual({ status: null, changed: false, count: 0, last: null, verdicts: [] });
    const two = [verdict("rejected", "1111"), verdict("approved", "2222")];
    expect(reviewState({ verdicts: two }, "2222")).toMatchObject({ status: "approved", changed: false, count: 2 });
    expect(reviewState({ verdicts: two }, "3333")).toMatchObject({ status: "approved", changed: true });
    // Without output now there is nothing to compare: not "changed", but the status shows.
    expect(reviewState({ verdicts: two }, null)).toMatchObject({ status: "approved", changed: false });
    expect(reviewState({ verdicts: [verdict("comment", null)] }, "1111")).toMatchObject({ status: "comment", changed: true });
  });

  it("the app's tag list is the server's", () => {
    expect(APP_TAGS).toEqual(VERDICT_TAGS);
  });

  it("a file that is not a review file counts as empty, and so does one that cannot be parsed; a verdict that is not one is dropped", () => {
    const root = tempRoot("review-junk");
    writeAsset(root, "props/crate");
    const entry = { id: "props/crate", folder: join(root, "assets", "props", "crate") };
    const file = join(entry.folder, "review.json");
    appendFileSync(file, "{ not json");
    expect(readReview(entry).verdicts).toEqual([]);
    const good = { id: "v-1", at: "2026-10-07T01:30:00Z", status: "approved", outputHash: null, sourceHash: "s", variant: null, tags: [], comment: "", frame: null };
    writeFileSync(file, JSON.stringify({ format: REVIEW_FORMAT, asset: "props/crate", verdicts: [{ id: "v-0", status: "maybe" }, good, "junk"] }));
    expect(readReview(entry).verdicts).toEqual([good]);
    writeFileSync(file, JSON.stringify({ format: "wz.other/1", asset: "props/crate", verdicts: [good] }));
    expect(readReview(entry).verdicts).toEqual([]);
  });
});

describe("the inbox", () => {
  const entry = (id: string, review: InboxEntry["review"], outputHash = "now0000000000000"): InboxEntry => ({ id, genFile: `assets/${id}/gen.ts`, outputHash, review });
  const verdict = (status: Verdict["status"], at: string, extra: Partial<Verdict> = {}): Verdict => ({ id: `v-${at}`, at, status, outputHash: "now0000000000000", sourceHash: "s", variant: null, tags: [], comment: "", frame: null, ...extra });
  const state = (last: Verdict | null, changed = false): InboxEntry["review"] => ({ status: last?.status ?? null, changed, count: last === null ? 0 : 1, last, verdicts: last === null ? [] : [last] });

  it("lists the rejected with their reasons, the comments, what changed since a verdict, and the approved; says it is generated", () => {
    const text = renderInbox([
      entry("props/crate", state(verdict("rejected", "2026-10-07T01:30:00Z", { tags: ["silhouette", "palette"], comment: "Too dark.\nFeet slide.", frame: 2, variant: { seed: 1, preset: null } }))),
      entry("props/lamp", state(verdict("comment", "2026-10-07T01:31:00Z", { comment: "Nice flicker.", variant: { seed: 3, preset: "night" } }))),
      entry("props/old", state(verdict("approved", "2026-10-06T10:00:00Z", { outputHash: "old0000000000000" }), true)),
      entry("props/moved", state(verdict("rejected", "2026-10-06T11:00:00Z", { outputHash: "old0000000000000" }), true)),
      entry("props/good", state(verdict("approved", "2026-10-05T10:00:00Z"))),
      entry("props/new", state(null)),
    ]);
    expect(text).toMatch(/^# Review inbox\n\nGenerated by the studio[^\n]*\*\*Do not edit\*\*/);
    expect(text).toContain("Updated: 2026-10-07T01:31:00Z · assets: 6 · reviewed: 5 · rejected: 1 · comments: 1 · changed since verdict: 2 · approved: 1");
    expect(text).toContain("## Rejected\n\n- **props/crate** (2026-10-07T01:30:00Z, on now0000000000000) · seed 1 · frame 2 · silhouette, palette\n  source: `assets/props/crate/gen.ts` · verdicts: `assets/props/crate/review.json`\n  > Too dark.\n  > Feet slide.\n");
    expect(text).toContain("## Comments\n\n- **props/lamp** (2026-10-07T01:31:00Z, on now0000000000000) · preset night (seed 3)\n");
    expect(text).toContain("## Changed since verdict\n\n- **props/moved** (2026-10-06T11:00:00Z, on old0000000000000, now now0000000000000)\n");
    expect(text).toContain("- **props/old** (2026-10-06T10:00:00Z, on old0000000000000, now now0000000000000)\n");
    expect(text).toContain("The output changed after this verdict (approved): the owner has not seen the new one.");
    // A changed asset is in one section only: the owner has not seen the output that is there now.
    expect(text.slice(text.indexOf("## Rejected"), text.indexOf("## Comments"))).not.toContain("props/moved");
    expect(text).toContain("## Approved\n\n- **props/good** (2026-10-05T10:00:00Z, on now0000000000000) — do not change without the owner's consent\n");
    expect(text).not.toContain("props/new");
  });

  it("is the same text for the same files, whatever the order and the clock, and says so when there is nothing", () => {
    const a = entry("a/x", state(verdict("approved", "2026-10-07T01:30:00Z")));
    const b = entry("b/y", state(verdict("rejected", "2026-10-07T01:31:00Z")));
    expect(renderInbox([a, b])).toBe(renderInbox([b, a]));
    const empty = renderInbox([entry("a/x", state(null))]);
    expect(empty).toContain("Updated: never · assets: 1 · reviewed: 0");
    expect(empty).toContain("Nothing is rejected.");
    expect(empty).toContain("Nothing is approved yet.");
  });
});

describe("the review service in the studio", () => {
  it("a verdict through the service lands in review.json and the inbox, the index shows it, and the watcher stays quiet", async () => {
    const root = tempRoot("review-service");
    writeAsset(root, "props/crate", "gold.1");
    writeAsset(root, "props/lamp", "teal.1");
    const { services, events } = studio(root);
    await quiet(services);
    expect(inbox(root)).toContain("reviewed: 0");
    const before = services.index.get("props/crate");
    expect(before?.review).toEqual({ status: null, changed: false, count: 0, last: null, verdicts: [] });
    const seen = events.length;

    const verdict = await services.reviews.add("props/crate", { status: "rejected", tags: ["palette"], comment: "Wrong gold.", variant: { seed: 1, preset: null } });
    expect(verdict).toMatchObject({ status: "rejected", outputHash: before?.outputHash, sourceHash: before?.sourceHash, tags: ["palette"], comment: "Wrong gold." });
    const file = JSON.parse(readFileSync(join(root, "assets", "props", "crate", "review.json"), "utf8")) as { verdicts: Verdict[] };
    expect(file.verdicts).toEqual([verdict]);
    const after = services.index.get("props/crate");
    expect(after?.review).toEqual({ status: "rejected", changed: false, count: 1, last: verdict, verdicts: [verdict] });
    expect(after?.status).toBe("baked"); // review.json is not source
    expect(inbox(root)).toContain("## Rejected\n\n- **props/crate**");
    expect(inbox(root)).toContain("> Wrong gold.");
    // The index published the new record once; the watcher did not report the studio's own write.
    const changed = events.slice(seen).filter((event) => event.type === "changed");
    expect(changed.map((event) => event.changed.map((record) => `${record.id}:${record.review.status}`))).toEqual([["props/crate:rejected"]]);
    await new Promise((done) => setTimeout(done, 300));
    await services.live.idle();
    expect(events.slice(seen).filter((event) => event.type === "activity")).toEqual([]);
    expect(services.bake.state().last?.number).toBe(1); // only the start bake

    await expect(services.reviews.add("props/nope", { status: "approved" })).rejects.toThrow(/no asset "props\/nope"/);
    await expect(services.reviews.add("props/lamp", { status: "approved", tags: ["weird"] })).rejects.toThrow(/unknown tags/);
    expect(existsSync(join(root, "assets", "props", "lamp", "review.json"))).toBe(false);
  });

  it("two quick verdicts lose nothing", async () => {
    const root = tempRoot("review-race");
    writeAsset(root, "props/crate");
    const { services } = studio(root);
    await quiet(services);
    const [a, b, c] = await Promise.all([
      services.reviews.add("props/crate", { status: "comment", comment: "one" }),
      services.reviews.add("props/crate", { status: "comment", comment: "two" }),
      services.reviews.add("props/crate", { status: "approved" }),
    ]);
    const file = JSON.parse(readFileSync(join(root, "assets", "props", "crate", "review.json"), "utf8")) as { verdicts: Verdict[] };
    expect(file.verdicts).toEqual([a, b, c]);
    expect(new Set(file.verdicts.map((verdict) => verdict.id)).size).toBe(3);
    expect(services.index.get("props/crate")?.review).toMatchObject({ status: "approved", count: 3 });
    expect(inbox(root)).toContain("## Approved\n\n- **props/crate**");
    expect(readdirSync(join(root, "assets", "props", "crate")).sort()).toEqual(["gen.ts", "review.json"]);
  });

  it("a generator change that changes the pixels marks the asset changed since the verdict; one that does not, does not", async () => {
    const root = tempRoot("review-changed");
    const gen = writeAsset(root, "props/crate", "gold.1");
    const { services } = studio(root);
    await quiet(services);
    await services.reviews.add("props/crate", { status: "approved" });
    const approvedOn = services.index.get("props/crate")?.outputHash;

    // A comment in the program: the source hash changes, the pixels do not.
    appendFileSync(gen, "// a note\n");
    await waitFor("re-bake after the comment", () => services.bake.state().last?.number === 2);
    await quiet(services);
    expect(services.index.get("props/crate")).toMatchObject({ status: "baked", outputHash: approvedOn, review: { status: "approved", changed: false } });
    expect(inbox(root)).toContain("changed since verdict: 0");

    // Another colour: the pixels change.
    writeAsset(root, "props/crate", "teal.1");
    await waitFor("re-bake after the colour", () => services.bake.state().last?.number === 3);
    await quiet(services);
    const now = services.index.get("props/crate");
    expect(now?.outputHash).not.toBe(approvedOn);
    expect(now?.review).toMatchObject({ status: "approved", changed: true });
    expect(inbox(root)).toContain("## Changed since verdict\n\n- **props/crate**");
    expect(inbox(root)).toContain(`on ${approvedOn}, now ${now?.outputHash}`);

    // Looking again puts it right.
    await services.reviews.add("props/crate", { status: "approved" });
    expect(services.index.get("props/crate")?.review).toMatchObject({ status: "approved", changed: false, count: 2 });
  });

  it("the inbox is rewritten on start from the files as they are", async () => {
    const root = tempRoot("review-start");
    writeAsset(root, "props/crate");
    const entry = { id: "props/crate", folder: join(root, "assets", "props", "crate") };
    appendVerdict({ entry, outputHash: null, sourceHash: "x" }, { status: "comment", comment: "written while the studio was off" });
    const { services } = studio(root);
    await quiet(services);
    expect(inbox(root)).toContain("written while the studio was off");
    // Without output at verdict time and with output now: a verdict on "no output" is changed since.
    expect(services.index.get("props/crate")?.review).toMatchObject({ status: "comment", changed: true });
    const written = services.reviews.refreshInbox();
    expect(written).toBe(false); // the same text is not written again
  });

  it("createReviewService serializes and rescans: the target is read when the verdict is written, not when it was asked", async () => {
    const root = tempRoot("review-unit");
    writeAsset(root, "props/crate");
    const entry = { id: "props/crate", folder: join(root, "assets", "props", "crate") };
    let hash = "1111111111111111";
    const wrote: string[][] = [];
    let scans = 0;
    const service = createReviewService({
      project: { root } as never,
      target: (id) => (id === "props/crate" ? { entry, outputHash: hash, sourceHash: "s" } : undefined),
      entries: () => [{ id: "props/crate", genFile: "assets/props/crate/gen.ts", outputHash: hash, review: reviewState(readReview(entry), hash) }],
      wrote: (paths) => void wrote.push([...paths]),
      rescan: () => void (scans += 1),
      now: () => new Date("2026-10-07T02:00:00Z"),
    });
    const first = service.add("props/crate", { status: "approved", outputHash: "1111111111111111" }); // what the page showed
    hash = "2222222222222222";
    const second = service.add("props/crate", { status: "rejected" }); // no hash sent: the asset's hash when written
    expect((await first).outputHash).toBe("1111111111111111");
    expect((await second).outputHash).toBe("2222222222222222");
    await expect(service.add("props/crate", { status: "approved", outputHash: "nope" })).rejects.toThrow(/16 hex digits/);
    expect((await second).id).toBe("v-20261007T020000-2");
    expect(wrote).toEqual([[join(entry.folder, "review.json")], [join(entry.folder, "review.json")]]);
    expect(scans).toBe(2);
    expect(inbox(root)).toContain("## Rejected\n\n- **props/crate** (2026-10-07T02:00:00Z, on 2222222222222222)");
  });
});
