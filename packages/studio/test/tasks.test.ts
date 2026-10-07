// Task notes from the studio (server/services/tasks.ts): a note from a rejected verdict in the
// format of tasks/README.md, an exclusive create, the queue row, the link in the verdict, and
// the /tasks list. The created note must pass the repo's docs check: the test runs it.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkDocs, formatProblem } from "@whz/docs-check/lib/index.mjs";
import { afterAll, describe, expect, it } from "vitest";
import { draftTask } from "../app/lib/tasks.ts";
import { readConfig } from "../server/services/config.ts";
import { createServices } from "../server/services/index.ts";
import type { StudioServices, TasksEvent, Verdict } from "../server/services/index.ts";
import { addQueueRow, createNoteFile, createTaskService, listTasks, NOTE_LABELS, NOTE_SECTIONS, parseTaskInput, renderNote, slugify, TASKS_README } from "../server/services/tasks.ts";
import { noteFormatSection, removeTemps, tempRoot, waitFor, writeAsset, writeTasksReadme as writeReadme } from "./helpers.ts";

const open: StudioServices[] = [];
afterAll(async () => {
  for (const services of open) await services.close();
  removeTemps();
});

const BODY = ["## Origin", "Why.", "", "## Read first", "- Nothing.", "", "## Scope", "1. Do it.", "", "## Out of scope", "- The rest.", "", "## Acceptance", "- It is done."].join("\n");

/** The queue problems of the docs check on a scratch root (the other rules need files a scratch root has not). */
function queueProblems(root: string): string[] {
  return checkDocs(root)
    .problems.filter((problem) => problem.rule === "queue")
    .map(formatProblem);
}

function studio(root: string): { services: StudioServices; events: TasksEvent[] } {
  const services = createServices(readConfig({ WHZ_STUDIO_ROOT: root, WHZ_STUDIO_WATCH_POLL_MS: "40" }), { debounceMs: 60 });
  open.push(services);
  const events: TasksEvent[] = [];
  services.events.subscribe((event) => events.push(event.data as TasksEvent), { topics: ["tasks"] });
  services.start();
  return { services, events };
}

async function quiet(services: StudioServices): Promise<void> {
  await waitFor("no bake in flight", () => services.bake.state().running === null && services.bake.state().queued === 0);
  await services.live.idle();
}

describe("the note format", () => {
  it("is the one of tasks/README.md: the header labels and the sections", () => {
    const template = /```markdown\n([\s\S]*?)```/.exec(noteFormatSection())?.[1] ?? "";
    const header = template.split("\n").find((line) => line.startsWith("**")) ?? "";
    expect([...header.matchAll(/\*\*([^*:]+):\*\*/g)].map((match) => match[1])).toEqual([...NOTE_LABELS]);
    expect(template.split("\n").filter((line) => line.startsWith("## ")).map((line) => line.slice(3).trim())).toEqual([...NOTE_SECTIONS]);
  });

  it("takes a title, a priority, a size and a body with the sections in order, and refuses the rest with the reason", () => {
    const fields = parseTaskInput({ title: "  Crate:  feet slide ", priority: "P2", size: "S", body: `${BODY}\r\n` });
    expect(fields).toEqual({ title: "Crate: feet slide", slug: "crate-feet-slide", priority: "P2", size: "S", body: BODY });
    expect(parseTaskInput({ title: "x", slug: "my-own-name", priority: "P1", size: "L", body: BODY }).slug).toBe("my-own-name");
    expect(() => parseTaskInput({ title: " ", priority: "P2", size: "S", body: BODY })).toThrow(/needs a title/);
    expect(() => parseTaskInput({ title: "a [link]", priority: "P2", size: "S", body: BODY })).toThrow(/brackets/);
    expect(() => parseTaskInput({ title: "x", slug: "Not Valid", priority: "P2", size: "S", body: BODY })).toThrow(/lower-case words/);
    expect(() => parseTaskInput({ title: "x", priority: "P4", size: "S", body: BODY })).toThrow(/priority is one of P1, P2, P3/);
    expect(() => parseTaskInput({ title: "x", priority: "P2", size: "XL", body: BODY })).toThrow(/size is one of S, M, L/);
    expect(() => parseTaskInput({ title: "x", priority: "P2", size: "S", body: BODY.replace("## Scope", "## Steps") })).toThrow(/needs the sections/);
    expect(() => parseTaskInput({ title: "x", priority: "P2", size: "S", body: BODY.replace("## Origin\nWhy.\n\n", "") + "\n\n## Origin\nLate." })).toThrow(/order/);
    expect(() => parseTaskInput({ title: "x", priority: "P2", size: "S", body: `${BODY}\n\n## Scope\nAgain.` })).toThrow(/twice/);
    expect(() => parseTaskInput({ title: "x", priority: "P2", size: "S", body: "a".repeat(20_001) })).toThrow(/longer than/);
    expect(slugify("Blinking dot: animation timing, palette!")).toBe("blinking-dot-animation-timing-palette");
  });

  it("renders the title in caps with the date, the header line with an open gate and no dependencies, then the body", () => {
    expect(renderNote({ title: "Crate: feet slide", priority: "P2", size: "S", body: BODY }, "2026-10-07")).toBe(
      `# CRATE: FEET SLIDE (2026-10-07)\n\n**GATE:** none · **Priority:** P2 · **Size:** S · **Depends on:** none\n\n${BODY}\n`,
    );
  });
});

describe("the files", () => {
  it("creates the note exclusively: the same name again gets a suffix and nothing is overwritten", () => {
    const dir = join(tempRoot("task-create"), "tasks");
    expect(createNoteFile(dir, "2026-10-07", "crate-feet", "one\n")).toBe("2026-10-07-crate-feet.md");
    expect(createNoteFile(dir, "2026-10-07", "crate-feet", "two\n")).toBe("2026-10-07-crate-feet-2.md");
    expect(createNoteFile(dir, "2026-10-07", "crate-feet", "three\n")).toBe("2026-10-07-crate-feet-3.md");
    expect(readFileSync(join(dir, "2026-10-07-crate-feet.md"), "utf8")).toBe("one\n");
    expect(readFileSync(join(dir, "2026-10-07-crate-feet-2.md"), "utf8")).toBe("two\n");
    expect(readdirSync(dir).sort()).toEqual(["2026-10-07-crate-feet-2.md", "2026-10-07-crate-feet-3.md", "2026-10-07-crate-feet.md"]);
  });

  it("adds the row above the end marker with the next number and writes that number on the last-number line", () => {
    const root = tempRoot("task-row");
    const readme = readFileSync(writeReadme(root, ["| 3 | [Three](2026-10-02-three.md) | none | none |"], 7), "utf8");
    const { text, number } = addQueueRow(readme, { file: "2026-10-07-crate-feet.md", title: "Crate: feet slide" });
    expect(number).toBe(8);
    expect(text).toContain("| 3 | [Three](2026-10-02-three.md) | none | none |\n| 8 | [Crate: feet slide](2026-10-07-crate-feet.md) | none | none |\n<!-- queue:end");
    expect(text).toContain("<!-- queue:last-number #8 (the highest row number ever given) -->");
    expect(text.endsWith("Text.\n")).toBe(true);
    // The next row after that one takes 9: the line remembers.
    expect(addQueueRow(text, { file: "2026-10-07-x.md", title: "X" }).number).toBe(9);
    expect(() => addQueueRow(readme.replace("<!-- queue:end (the studio inserts new rows above this line) -->\n", ""), { file: "a.md", title: "A" })).toThrow(/queue:end/);
    expect(() => addQueueRow(readme.replace(/<!-- queue:last-number.*\n/, ""), { file: "a.md", title: "A" })).toThrow(/queue:last-number/);
    expect(() => addQueueRow(readme.replace("| 3 | [Three]", "| x | [Three]"), { file: "a.md", title: "A" })).toThrow(/cannot be changed/);
  });

  it("lists the notes in queue order, with the header fields, and a note without a row last", () => {
    const root = tempRoot("task-list");
    writeReadme(root, ["| 5 | [Five](2026-10-03-five.md) | OC-X1 | #2 |", "| 2 | [Two](2026-10-02-two.md) | none | none |"]);
    writeFileSync(join(root, "tasks", "2026-10-02-two.md"), renderNote({ title: "Two", priority: "P1", size: "M", body: BODY }, "2026-10-02"));
    writeFileSync(join(root, "tasks", "2026-10-03-five.md"), `# FIVE (2026-10-03)\n\n**GATE:** OC-X1 · **Priority:** P3 · **Size:** L · **Depends on:** #2\n\n${BODY}\n\n## REMAINING 2026-10-05\n- the end\n`);
    writeFileSync(join(root, "tasks", "2026-10-04-loose.md"), renderNote({ title: "Loose", priority: "P2", size: "S", body: BODY }, "2026-10-04"));
    writeFileSync(join(root, "tasks", "notes.txt"), "not a note");
    expect(listTasks(root)).toEqual([
      { file: "tasks/2026-10-02-two.md", title: "TWO (2026-10-02)", date: "2026-10-02", gate: "none", priority: "P1", size: "M", dependsOn: "none", number: 2, remaining: false, open: true },
      { file: "tasks/2026-10-03-five.md", title: "FIVE (2026-10-03)", date: "2026-10-03", gate: "OC-X1", priority: "P3", size: "L", dependsOn: "#2", number: 5, remaining: true, open: false },
      { file: "tasks/2026-10-04-loose.md", title: "LOOSE (2026-10-04)", date: "2026-10-04", gate: "none", priority: "P2", size: "S", dependsOn: "none", number: null, remaining: false, open: true },
    ]);
    expect(listTasks(tempRoot("task-list-empty"))).toEqual([]);
  });
});

describe("the draft from a verdict", () => {
  const verdict: Verdict = { id: "v-20261007T013012-1", at: "2026-10-07T01:30:12Z", status: "rejected", outputHash: "1111111111111111", sourceHash: "s", variant: { seed: 2, preset: null }, tags: ["animation-timing", "palette"], comment: "Feet slide on frame 3.\nAnd too dark.", frame: 3, task: null };
  const asset = { id: "props/crate", genFile: "assets/props/crate/gen.ts" };

  it("names the asset and the reasons, quotes the comment, points at the review sheets, and is a valid note", () => {
    const draft = draftTask(asset, verdict);
    expect(draft.title).toBe("crate: animation timing, palette");
    expect(draft).toMatchObject({ priority: "P2", size: "S", slug: "" });
    expect(draft.body).toContain("## Origin\nThe owner rejected `props/crate` in the studio: verdict v-20261007T013012-1 (2026-10-07T01:30:12Z) on output 1111111111111111, seed 2, frame 3.\nReasons: animation timing, palette.\nThe owner's comment:\n> Feet slide on frame 3.\n> And too dark.\n");
    expect(draft.body).toContain("`./dev npm run asset -- review props/crate`");
    expect(draft.body).toContain("`contact.png`");
    expect(draft.body).toContain("`strip-<clip>.png`");
    expect(draft.body).toContain("`build/review/props/crate/`");
    expect(draft.body).toContain("## Read first\n- `CLAUDE.md`");
    expect(draft.body).toContain("`assets/props/crate/gen.ts` and its verdicts `assets/props/crate/review.json`");
    expect(draft.body).toContain("## Scope\n1. Feet slide on frame 3.\n");
    expect(draft.body).toContain("## Acceptance\n- The owner approves `props/crate` in the studio");
    expect(parseTaskInput(draft).slug).toBe("crate-animation-timing-palette");
  });

  it("without tags and comment it still says what to do", () => {
    const draft = draftTask(asset, { ...verdict, tags: [], comment: "", variant: null, frame: null });
    expect(draft.title).toBe("crate: rejected in the studio");
    expect(draft.body).toContain("on output 1111111111111111.\nLook at the review sheets");
    expect(draft.body).toContain("## Scope\n1. Fix what the verdict rejects.\n");
    expect(() => parseTaskInput(draft)).not.toThrow();
  });
});

describe("the task service in the studio", () => {
  it("creates the note, the queue row and the link in the verdict; the inbox and the index show it; the docs check passes; the same verdict gets no second note; only a rejection", async () => {
    const root = tempRoot("task-service");
    writeAsset(root, "props/crate", "gold.1");
    writeReadme(root, [], 12);
    const { services, events } = studio(root);
    await quiet(services);
    const rejected = await services.reviews.add("props/crate", { status: "rejected", tags: ["silhouette"], comment: "Too round." });
    const approved = await services.reviews.add("props/crate", { status: "approved" });
    expect(rejected.task).toBeNull();

    const draft = draftTask({ id: "props/crate", genFile: "assets/props/crate/gen.ts" }, rejected);
    const created = await services.tasks.create("props/crate", rejected.id, draft);
    expect(created).toEqual({ file: `tasks/${new Date().toISOString().slice(0, 10)}-crate-silhouette.md`, number: 13, title: "crate: silhouette" });
    const note = readFileSync(join(root, created.file), "utf8");
    expect(note.startsWith(`# CRATE: SILHOUETTE (${created.file.slice(6, 16)})\n\n**GATE:** none · **Priority:** P2 · **Size:** S · **Depends on:** none\n\n## Origin\n`)).toBe(true);
    expect(note).toContain("> Too round.");
    const readme = readFileSync(join(root, ...TASKS_README.split("/")), "utf8");
    expect(readme).toContain(`| 13 | [crate: silhouette](${created.file.slice(6)}) | none | none |\n<!-- queue:end`);
    expect(readme).toContain("<!-- queue:last-number #13 ");
    // The verdict carries the note; the other verdict is as it was.
    const file = JSON.parse(readFileSync(join(root, "assets", "props", "crate", "review.json"), "utf8")) as { verdicts: Verdict[] };
    expect(file.verdicts.map((verdict) => verdict.task)).toEqual([created.file, null]);
    expect(file.verdicts[1]).toEqual(approved);
    expect(services.index.get("props/crate")?.review.verdicts[0]?.task).toBe(created.file);
    // The inbox says where the task is (the last verdict is "approved", so the rejected one is in the history only: a second rejection shows it).
    const again = await services.reviews.add("props/crate", { status: "rejected", comment: "Still round." });
    const second = await services.tasks.create("props/crate", again.id, { ...draft, title: "Crate: still round" });
    expect(second.number).toBe(14);
    expect(readFileSync(join(root, "reviews", "INBOX.md"), "utf8")).toContain(`- **props/crate** (${again.at}, on ${again.outputHash}) · → \`${second.file}\`\n`);
    expect(services.tasks.list().map((task) => [task.number, task.file])).toEqual([
      [13, created.file],
      [14, second.file],
    ]);
    // The queue is consistent for the docs check (the gate).
    expect(queueProblems(root)).toEqual([]);

    await expect(services.tasks.create("props/crate", rejected.id, draft)).rejects.toThrow(/already has a task/);
    await expect(services.tasks.create("props/crate", "v-nope", draft)).rejects.toThrow(/no verdict "v-nope"/);
    await expect(services.tasks.create("props/nope", rejected.id, draft)).rejects.toThrow(/no verdict/);
    await expect(services.tasks.create("props/crate", approved.id, draft)).rejects.toThrow(/a task is made from a rejected verdict; v-.* is approved/);
    const commented = await services.reviews.add("props/crate", { status: "comment", comment: "Hm." });
    await expect(services.tasks.create("props/crate", commented.id, draft)).rejects.toThrow(/is comment/);
    await expect(services.tasks.create("props/crate", again.id, draft)).rejects.toThrow(/already has a task/);
    const fresh = await services.reviews.add("props/crate", { status: "rejected", comment: "C." });
    await expect(services.tasks.create("props/crate", fresh.id, { ...draft, priority: "P9" })).rejects.toThrow(/priority is one of/);
    expect(readdirSync(join(root, "tasks")).filter((name) => name !== "README.md")).toHaveLength(2); // nothing was written for the refusals

    // The tasks topic reported the files (the studio's own writes included: the /tasks page follows them).
    await waitFor("tasks events", () => events.length > 0);
    await new Promise((done) => setTimeout(done, 300));
    const paths = new Set(events.flatMap((event) => event.paths));
    expect(paths.has("README.md")).toBe(true);
    expect(paths.has(created.file.slice(6))).toBe(true);
    expect(paths.has(second.file.slice(6))).toBe(true);
  });

  it("the same slug twice makes a second, suffixed note, and a session's note appears in the list through the watcher", async () => {
    const root = tempRoot("task-twice");
    writeAsset(root, "props/crate", "gold.1");
    writeReadme(root, [], 0);
    const { services, events } = studio(root);
    await quiet(services);
    const one = await services.reviews.add("props/crate", { status: "rejected", comment: "A." });
    const two = await services.reviews.add("props/crate", { status: "rejected", comment: "B." });
    const input = { title: "Crate: round", priority: "P3", size: "M", body: BODY };
    const [first, second] = await Promise.all([services.tasks.create("props/crate", one.id, input), services.tasks.create("props/crate", two.id, input)]);
    expect(first.file.endsWith("-crate-round.md")).toBe(true);
    expect(second.file.endsWith("-crate-round-2.md")).toBe(true);
    expect([first.number, second.number]).toEqual([1, 2]);
    expect(queueProblems(root)).toEqual([]);

    // A note a session writes by hand (with its row) shows up without the studio's help.
    const seen = events.length;
    const readmePath = join(root, ...TASKS_README.split("/"));
    writeFileSync(join(root, "tasks", "2026-10-05-by-hand.md"), renderNote({ title: "By hand", priority: "P1", size: "S", body: BODY }, "2026-10-05"));
    writeFileSync(readmePath, readFileSync(readmePath, "utf8").replace("<!-- queue:end", "| 3 | [By hand](2026-10-05-by-hand.md) | none | none |\n<!-- queue:end").replace("queue:last-number #2", "queue:last-number #3"));
    await waitFor("the watcher saw the note", () => events.slice(seen).some((event) => event.paths.includes("2026-10-05-by-hand.md")));
    expect(services.tasks.list().map((task) => task.number)).toEqual([1, 2, 3]);
    expect(queueProblems(root)).toEqual([]);
  });

  it("a README whose table cannot be changed refuses the task before the note is written", async () => {
    const root = tempRoot("task-bad-readme");
    const readme = writeReadme(root, ["| x | [Bad](2026-10-02-bad.md) | none | none |"]);
    const service = createTaskService({ root, verdict: () => ({ status: "rejected", task: null }), link: () => Promise.resolve() });
    await expect(service.create("a/b", "v-1", { title: "x", priority: "P2", size: "S", body: BODY })).rejects.toThrow(/cannot be changed/);
    expect(readdirSync(join(root, "tasks"))).toEqual(["README.md"]); // no note without a row
    writeFileSync(readme, readFileSync(writeReadme(root), "utf8").replace("<!-- queue:end (the studio inserts new rows above this line) -->\n", ""));
    await expect(service.create("a/b", "v-1", { title: "x", priority: "P2", size: "S", body: BODY })).rejects.toThrow(/queue:end/);
    expect(readdirSync(join(root, "tasks"))).toEqual(["README.md"]);
  });

  it("without a tasks/README.md the list is empty and a note cannot be made", async () => {
    const root = tempRoot("task-no-readme");
    const service = createTaskService({ root, verdict: () => ({ status: "rejected", task: null }), link: () => Promise.resolve() });
    expect(service.list()).toEqual([]);
    await expect(service.create("a/b", "v-1", { title: "x", priority: "P2", size: "S", body: BODY })).rejects.toThrow(/no tasks\/README.md/);
    expect(existsSync(join(root, "tasks"))).toBe(false);
  });
});
