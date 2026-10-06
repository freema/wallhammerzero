import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { readQueueFiles } from "../cli.mjs";
import {
  analyseQueue,
  formatReport,
  parseDependsOn,
  parseGate,
  parseNoteHeader,
  parseQueue,
  resolveNote,
  slugOf,
} from "../queue.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "..", "cli.mjs");
const repoRoot = join(here, "..", "..", "..");

/**
 * A tasks/README.md with the given rows: [number, file, gate, dependsOn]. `lastNumber` is the
 * number in the queue:last-number line: by default the highest row number (as in a README that
 * was kept right), `null` for a README without the line.
 */
function readme(rows, { marker = true, lastNumber = Math.max(1, ...rows.map(([number]) => (Number.isInteger(number) ? number : 0))) } = {}) {
  const lines = [
    "# tasks/",
    "",
    "## Queue",
    "",
    "The order is the priority.",
    "",
    "| # | Note | Gate | Depends on |",
    "|---|---|---|---|",
    ...rows.map(([number, file, gate, dependsOn]) => `| ${number} | [Title of ${slugOf(file)}](${file}) | ${gate} | ${dependsOn} |`),
  ];
  if (marker) lines.push("<!-- queue:end (the studio inserts new rows above this line) -->");
  if (lastNumber !== null) lines.push(`<!-- queue:last-number #${lastNumber} (the highest row number ever given: a new row takes the next one and writes it here) -->`);
  lines.push("", "### The queue by track", "", "| Track | Notes |", "|---|---|", "| Infra | #1 Docker is done |", "");
  return lines.join("\n");
}

function note({ gate = "none", dependsOn = "none", remaining = false } = {}) {
  return [
    "# A NOTE (2026-10-02)",
    "",
    `**GATE:** ${gate} · **Priority:** P1 · **Size:** S · **Depends on:** ${dependsOn}`,
    "",
    ...(remaining ? ["## REMAINING 2026-10-03", "- Left: the docs page.", ""] : []),
    "## Origin",
    "A test.",
    "",
  ].join("\n");
}

const OWNER_CALLS = [0, "2026-10-02-owner-calls.md", "owner answers", "none"];
const ownerCallsNote = { "2026-10-02-owner-calls.md": note({ gate: "owner answers" }) };

test("parseQueue reads the rows, the marker and the next free row number", () => {
  const parsed = parseQueue(
    readme([OWNER_CALLS, [3, "2026-10-02-a.md", "none", "#1 (gate command)"], [22, "2026-10-02-b.md", "OC-A2-pick", "#18, #20"]]),
  );
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.warnings, []);
  assert.deepEqual(
    parsed.rows.map((row) => [row.number, row.file, row.gate, row.dependsOn]),
    [
      [0, "2026-10-02-owner-calls.md", "owner answers", "none"],
      [3, "2026-10-02-a.md", "none", "#1 (gate command)"],
      [22, "2026-10-02-b.md", "OC-A2-pick", "#18, #20"],
    ],
  );
  assert.equal(parsed.rows[1].title, "Title of a");
  assert.equal(parsed.rows[1].line, 10);
  assert.equal(parsed.endMarkerLine, 12);
  // one more than every number the README mentions, so the number of a finished note is not reused
  assert.equal(parsed.nextNumber, 23);
  assert.equal(parseQueue(readme([[3, "2026-10-02-a.md", "none", "#40"]])).nextNumber, 41);
});

test("a new row never gets a number that was used before: closing the highest-numbered note gives a fresh number", () => {
  const rows = [OWNER_CALLS, [34, "2026-10-02-mobile.md", "none", "none"], [35, "2026-10-02-hardening.md", "none", "none"]];
  const notes = { ...ownerCallsNote, "2026-10-02-mobile.md": note(), "2026-10-02-hardening.md": note() };
  const before = analyseQueue({ readme: readme(rows), notes });
  assert.deepEqual(before.warnings, []);
  assert.equal(before.lastNumber, 35);
  assert.equal(before.nextNumber, 36);

  // #35 is finished: its note is deleted and its row removed. Nothing else in the README names
  // #35 any more; only the queue:last-number line remembers it.
  const closedReadme = readme(rows.slice(0, 2), { lastNumber: 35 });
  assert.doesNotMatch(closedReadme.replace(/<!-- queue:last-number.*-->/, ""), /35/);
  const { "2026-10-02-hardening.md": _closed, ...left } = notes;
  const after = analyseQueue({ readme: closedReadme, notes: left });
  assert.deepEqual(after.errors, []);
  assert.deepEqual(after.warnings, []);
  assert.equal(after.nextNumber, 36, "the number of the closed note must not be given again");
  assert.match(formatReport(after), /^NEW ROW NUMBER: 36$/m);

  // Closing every note still does not free a number.
  const empty = analyseQueue({ readme: readme([], { lastNumber: 35 }), notes: {} });
  assert.equal(empty.nextNumber, 36);
  // A new row takes 36 and writes it into the line; closing it again gives 37.
  const next = analyseQueue({ readme: readme([[36, "2026-10-03-new.md", "none", "none"]], { lastNumber: 36 }), notes: { "2026-10-03-new.md": note() } });
  assert.deepEqual(next.warnings, []);
  assert.equal(analyseQueue({ readme: readme([], { lastNumber: 36 }), notes: {} }).nextNumber, 37);
});

test("the queue:last-number line: missing, behind a row, or unreadable is a warning that says what to do", () => {
  const rows = [[34, "2026-10-02-mobile.md", "none", "none"], [35, "2026-10-02-hardening.md", "none", "none"]];
  const notes = { "2026-10-02-mobile.md": note(), "2026-10-02-hardening.md": note() };

  const missing = analyseQueue({ readme: readme(rows, { lastNumber: null }), notes });
  assert.equal(missing.lastNumber, null);
  assert.equal(missing.nextNumber, 36);
  assert.match(missing.warnings.join("\n"), /queue:last-number #35 .* line is missing/);
  assert.match(formatReport(missing), /^WARNING: .*queue:last-number/m);

  const behind = analyseQueue({ readme: readme(rows, { lastNumber: 34 }), notes });
  assert.equal(behind.nextNumber, 36);
  assert.match(behind.warnings.join("\n"), /row #35 is above the queue:last-number line \(#34\): set it to #35/);

  const unreadable = analyseQueue({ readme: readme(rows, { lastNumber: null }) + "<!-- queue:last-number thirty-five -->\n", notes });
  assert.match(unreadable.warnings.join("\n"), /queue:last-number line has no row number/);

  // The line counts wherever the number is highest: a hand-lowered table cannot lower it.
  assert.equal(analyseQueue({ readme: readme(rows, { lastNumber: 90 }), notes }).nextNumber, 91);
});

test("a table that cannot be trusted is an error, and nothing is selected from it", () => {
  const cases = [
    ["# tasks\n\nno queue here\n", /no "## Queue" heading/],
    ["## Queue\n\ntext only\n\n## Next\n\n| # | Note | Gate | Depends on |\n", /no table under/],
    ["## Queue\n\n| Note | What | Status |\n|---|---|---|\n", /table header must be/],
    [readme([[3, "2026-10-02-a.md", "none", "none"], [3, "2026-10-02-b.md", "none", "none"]]), /row number 3 is already used on line 9/],
    [readme([[3, "2026-10-02-a.md", "none", "none"], [4, "2026-10-02-a.md", "none", "none"]]), /already has a row/],
    [readme([["x", "2026-10-02-a.md", "none", "none"]]), /the # cell must be a number/],
    [readme([[3, "2026-10-02-a.md", "", "none"]]), /Gate cell is empty/],
    ["## Queue\n\n| # | Note | Gate | Depends on |\n|---|---|---|---|\n| 3 | a plain title | none | none |\n", /must be a link/],
    ["## Queue\n\n| # | Note | Gate | Depends on |\n|---|---|---|---|\n| 3 | [A](2026-10-02-a.md) | none |\n", /has 4 cells/],
  ];
  for (const [text, expected] of cases) {
    const analysis = analyseQueue({ readme: text, notes: { "2026-10-02-a.md": note(), "2026-10-02-b.md": note() } });
    assert.equal(analysis.errors.length > 0, true, text);
    assert.match(analysis.errors.join("\n"), expected);
    assert.equal(analysis.next, null);
    assert.match(formatReport(analysis), /^ERROR: /);
    assert.match(formatReport(analysis), /NEXT: none \(the Queue table cannot be read/);
  }
});

test("a missing queue:end marker is a warning, not an error", () => {
  const analysis = analyseQueue({
    readme: readme([[3, "2026-10-02-a.md", "none", "none"]], { marker: false }),
    notes: { "2026-10-02-a.md": note() },
  });
  assert.deepEqual(analysis.errors, []);
  assert.match(analysis.warnings.join("\n"), /queue:end/);
  assert.equal(analysis.next.number, 3);
});

test("parseGate: none is open, none (...) is open with a gated part, anything else is closed", () => {
  assert.deepEqual(parseGate("none"), { open: true, partial: null });
  assert.deepEqual(parseGate("None"), { open: true, partial: null });
  assert.deepEqual(parseGate("none (iOS build: OC-B4)"), { open: true, partial: "iOS build: OC-B4" });
  assert.deepEqual(parseGate("OC-A2-pick"), { open: false, partial: null });
  assert.deepEqual(parseGate("owner answers"), { open: false, partial: null });
  assert.deepEqual(parseGate("nonexistent call"), { open: false, partial: null });
});

test("parseDependsOn reads row numbers and note topics, and ignores comments in parentheses", () => {
  assert.deepEqual(parseDependsOn("none"), { refs: [], unreadable: [] });
  assert.deepEqual(parseDependsOn("#1 (gate command)"), { refs: [{ number: 1 }], unreadable: [] });
  assert.deepEqual(parseDependsOn("#30, #25, #23").refs, [{ number: 30 }, { number: 25 }, { number: 23 }]);
  assert.deepEqual(parseDependsOn("asset-kit-core (`packages/det`, PCG32), asset-render-cli (PNG writer)").refs, [
    { slug: "asset-kit-core" },
    { slug: "asset-render-cli" },
  ]);
  assert.deepEqual(parseDependsOn("tasks/2026-10-02-sim-core.md").refs, [{ slug: "sim-core" }]);
  assert.deepEqual(parseDependsOn("the studio, once it exists"), { refs: [], unreadable: ["the studio", "once it exists"] });
});

test("parseNoteHeader reads the gate, the dependencies and a REMAINING block", () => {
  assert.deepEqual(parseNoteHeader(note({ gate: "OC-A2-pick (the projection)", dependsOn: "sim-core, runtime-input" })), {
    gate: "OC-A2-pick (the projection)",
    dependsOn: "sim-core, runtime-input",
    remaining: false,
  });
  assert.equal(parseNoteHeader(note({ remaining: true })).remaining, true);
  assert.deepEqual(parseNoteHeader("# no header line\n"), { gate: null, dependsOn: null, remaining: false });
});

test("takes the first row whose gate is open and whose dependencies are done", () => {
  const analysis = analyseQueue({
    readme: readme([
      OWNER_CALLS,
      [2, "2026-10-02-gated.md", "OC-X1", "none"],
      [3, "2026-10-02-needs-five.md", "none", "#5"],
      [4, "2026-10-02-first-open.md", "none", "#1 (done long ago)"],
      [5, "2026-10-02-second-open.md", "none", "none"],
    ]),
    notes: {
      ...ownerCallsNote,
      "2026-10-02-gated.md": note({ gate: "OC-X1" }),
      "2026-10-02-needs-five.md": note({ dependsOn: "second-open" }),
      "2026-10-02-first-open.md": note({ dependsOn: "docker-dev-environment (gate command)" }),
      "2026-10-02-second-open.md": note(),
    },
  });
  assert.deepEqual(analysis.errors, []);
  assert.deepEqual(analysis.warnings, []);
  assert.equal(analysis.next.number, 4);
  assert.equal(analysis.next.path, "tasks/2026-10-02-first-open.md");
  assert.deepEqual(analysis.open.map((row) => row.number), [4, 5]);
  assert.deepEqual(analysis.waiting.map((row) => row.number), [3]);
  assert.deepEqual(analysis.blocked.map((row) => row.number), [2]);
  assert.equal(analysis.ownerCallsNote, "tasks/2026-10-02-owner-calls.md");
  assert.equal(analysis.rows[0].state, "owner-calls");

  const report = formatReport(analysis);
  assert.match(report, /^NEXT: #4 tasks\/2026-10-02-first-open\.md \(Title of first-open\)$/m);
  assert.match(report, /OPEN AFTER IT \(1\):\n {2}#5 /);
  assert.match(report, /WAITING FOR OTHER NOTES \(1\):\n {2}#3 needs-five · needs #5/);
  assert.match(report, /BLOCKED ON THE OWNER \(1\):\n {2}#2 .* · gate: OC-X1/);
  assert.match(report, /^OWNER CALLS NOTE: tasks\/2026-10-02-owner-calls\.md$/m);
  assert.match(report, /^NEW ROW NUMBER: 6$/m);
});

test("a dependency is done when its note is gone, by row number and by topic", () => {
  const rows = [[7, "2026-10-02-studio.md", "none", "#1, #5"]];
  const done = analyseQueue({ readme: readme(rows), notes: { "2026-10-02-studio.md": note({ dependsOn: "asset-render-cli" }) } });
  assert.equal(done.next.number, 7);

  // the note header names a note that still exists, though the table's numbers are all done
  const pending = analyseQueue({
    readme: readme([...rows, [9, "2026-10-02-asset-render-cli.md", "none", "none"]]),
    notes: { "2026-10-02-studio.md": note({ dependsOn: "asset-render-cli" }), "2026-10-02-asset-render-cli.md": note() },
  });
  assert.equal(pending.rows[0].state, "waiting");
  assert.deepEqual(pending.rows[0].needs, [{ ref: "#9", number: 9, file: "2026-10-02-asset-render-cli.md" }]);
  assert.equal(pending.next.number, 9);
});

test("a note is gated if the table or the note says so, and the disagreement is reported", () => {
  const analysis = analyseQueue({
    readme: readme([[3, "2026-10-02-a.md", "none", "none"], [4, "2026-10-02-b.md", "OC-B2", "none"]]),
    notes: { "2026-10-02-a.md": note({ gate: "OC-A6 (parked)" }), "2026-10-02-b.md": note({ gate: "none" }) },
  });
  assert.equal(analysis.next, null);
  assert.deepEqual(analysis.rows.map((row) => [row.state, row.gateReason]), [
    ["gated", "OC-A6 (parked)"],
    ["gated", "OC-B2"],
  ]);
  assert.equal(analysis.warnings.length, 2);
  assert.match(analysis.warnings[0], /#3 .*Gate cell says "none" and the note says "OC-A6 \(parked\)"/);
});

test("a partly gated note is open, and the gated part is named", () => {
  const analysis = analyseQueue({
    readme: readme([[34, "2026-10-02-mobile-wrapper.md", "none (iOS build: OC-B4)", "none"]]),
    notes: { "2026-10-02-mobile-wrapper.md": note({ gate: "none (the iOS build waits for OC-B4)" }) },
  });
  assert.deepEqual(analysis.warnings, []);
  assert.equal(analysis.next.number, 34);
  assert.equal(analysis.next.partialGate, "iOS build: OC-B4");
  assert.match(formatReport(analysis), /NEXT: #34 .*\n {2}partly gated: iOS build: OC-B4/);
});

test("a REMAINING block is flagged on the note", () => {
  const analysis = analyseQueue({
    readme: readme([[3, "2026-10-02-a.md", "none", "none"]]),
    notes: { "2026-10-02-a.md": note({ remaining: true }) },
  });
  assert.equal(analysis.next.remaining, true);
  assert.match(formatReport(analysis), /has a ## REMAINING block: unfinished work, read it first/);
});

test("with only gated notes left there is no next note, and every note names the owner call that blocks it", () => {
  const analysis = analyseQueue({
    readme: readme([
      OWNER_CALLS,
      [22, "2026-10-02-tilemap.md", "OC-A2-pick", "none"],
      [40, "2026-10-02-first-game-map.md", "none", "#22"],
      [41, "2026-10-02-first-game-art.md", "none", "#40"],
      [42, "2026-10-02-signing.md", "OC-B2", "none"],
    ]),
    notes: {
      ...ownerCallsNote,
      "2026-10-02-tilemap.md": note({ gate: "OC-A2-pick (the projection)" }),
      "2026-10-02-first-game-map.md": note({ dependsOn: "tilemap" }),
      "2026-10-02-first-game-art.md": note(),
      "2026-10-02-signing.md": note({ gate: "OC-B2" }),
    },
  });
  assert.deepEqual(analysis.warnings, []);
  assert.equal(analysis.next, null);
  assert.deepEqual(analysis.open, []);
  assert.deepEqual(analysis.waiting, []);
  assert.deepEqual(analysis.blocked.map((row) => [row.number, row.blockedBy]), [
    [22, ["#22: OC-A2-pick"]],
    [40, ["#22: OC-A2-pick"]],
    [41, ["#22: OC-A2-pick"]],
    [42, ["#42: OC-B2"]],
  ]);
  const report = formatReport(analysis);
  assert.match(report, /^NEXT: none \(every remaining note waits for the owner\)$/m);
  assert.match(report, /BLOCKED ON THE OWNER \(4\):/);
  assert.match(report, /#22 tasks\/2026-10-02-tilemap\.md \(Title of tilemap\) · gate: OC-A2-pick$/m);
  assert.match(report, /#41 .* · needs #40 · blocked by #22: OC-A2-pick$/m);
  assert.match(report, /#42 .* · gate: OC-B2$/m);
});

test("an empty queue says so", () => {
  const onlyCalls = analyseQueue({ readme: readme([OWNER_CALLS]), notes: ownerCallsNote });
  assert.equal(onlyCalls.next, null);
  assert.match(formatReport(onlyCalls), /^NEXT: none \(the queue is empty\)$/m);
  const nothing = analyseQueue({ readme: readme([]), notes: {} });
  assert.deepEqual(nothing.errors, []);
  assert.match(formatReport(nothing), /^NEXT: none \(the queue is empty\)$/m);
  assert.match(formatReport(nothing), /^NEW ROW NUMBER: 2$/m);
});

test("faults in the queue are reported and never selected: a row without a note, a note without a row, a cycle, an unreadable dependency", () => {
  const analysis = analyseQueue({
    readme: readme([
      [3, "2026-10-02-no-file.md", "none", "none"],
      [4, "2026-10-02-behind-no-file.md", "none", "#3"],
      [5, "2026-10-02-cycle-a.md", "none", "#6"],
      [6, "2026-10-02-cycle-b.md", "none", "#5"],
      [7, "2026-10-02-prose.md", "none", "when the studio exists"],
      [8, "2026-10-02-behind-orphan.md", "none", "none"],
    ]),
    notes: {
      "2026-10-02-behind-no-file.md": note(),
      "2026-10-02-cycle-a.md": note(),
      "2026-10-02-cycle-b.md": note(),
      "2026-10-02-prose.md": note(),
      "2026-10-02-behind-orphan.md": note({ dependsOn: "orphan" }),
      "2026-10-03-orphan.md": note(),
    },
  });
  assert.deepEqual(analysis.errors, []);
  assert.equal(analysis.next, null);
  assert.deepEqual(analysis.stuck.map((row) => row.number), [3, 4, 5, 6, 7, 8]);
  assert.deepEqual(analysis.orphans, ["2026-10-03-orphan.md"]);
  const warnings = analysis.warnings.join("\n");
  assert.match(warnings, /#3: the row names 2026-10-02-no-file\.md, which does not exist/);
  assert.match(warnings, /tasks\/2026-10-03-orphan\.md has no row in the Queue table/);
  assert.match(warnings, /cannot read the dependency "when the studio exists"/);
  assert.match(warnings, /a dependency cycle through #5/);
  const report = formatReport(analysis);
  assert.match(report, /^NEXT: none \(nothing can be taken until the queue is fixed; see STUCK\)$/m);
  assert.match(report, /STUCK, FIX THE QUEUE \(6\):/);
  assert.match(report, /#4 .* · needs #3 · stuck: #3 has no note/);
  assert.match(report, /#8 .* · needs orphan · stuck: tasks\/2026-10-03-orphan\.md has no queue row/);
});

test("resolveNote finds a note by number, path, file name or topic", () => {
  const analysis = analyseQueue({
    readme: readme([[12, "2026-10-02-sim-core.md", "none", "none"], [13, "2026-10-02-sim-conformance.md", "OC-Q1", "none"]]),
    notes: { "2026-10-02-sim-core.md": note(), "2026-10-02-sim-conformance.md": note({ gate: "OC-Q1" }), "2026-10-05-loose.md": note() },
  });
  for (const argument of ["#12", "12", "tasks/2026-10-02-sim-core.md", "2026-10-02-sim-core.md", "2026-10-02-sim-core", "sim-core", "core"]) {
    assert.equal(resolveNote(analysis, argument).row?.number, 12, argument);
  }
  assert.match(resolveNote(analysis, "sim").error, /matches 2 notes/);
  assert.match(resolveNote(analysis, "#99").error, /no row #99/);
  assert.match(resolveNote(analysis, "nope").error, /no note matches "nope"/);
  assert.match(resolveNote(analysis, "loose").error, /has no row in the Queue table/);

  const gated = resolveNote(analysis, "sim-conformance").row;
  const report = formatReport(analysis, { requested: gated });
  assert.match(report, /^NOT READY: #13 tasks\/2026-10-02-sim-conformance\.md .*\n {2}gate: OC-Q1$/m);
  assert.doesNotMatch(report, /^NEXT:/m);
  assert.match(formatReport(analysis, { requested: resolveNote(analysis, "#12").row }), /^NEXT: #12 /m);
});

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "whz-task-queue-"));
  temporary.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}
const temporary = [];
after(() => {
  for (const dir of temporary) rmSync(dir, { recursive: true, force: true });
});

function run(...args) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test("the CLI prints the next note, one note on request, JSON, and uses exit code 2 for a queue it cannot read", () => {
  const root = fixture({
    "tasks/README.md": readme([OWNER_CALLS, [3, "2026-10-02-a.md", "none", "none"], [4, "2026-10-02-b.md", "OC-X1", "none"]]),
    "tasks/2026-10-02-owner-calls.md": note({ gate: "owner answers" }),
    "tasks/2026-10-02-a.md": note(),
    "tasks/2026-10-02-b.md": note({ gate: "OC-X1" }),
    "tasks/img/readme.txt": "not a note",
  });
  const next = run("--root", root);
  assert.equal(next.status, 0, next.stderr);
  assert.match(next.stdout, /^NEXT: #3 tasks\/2026-10-02-a\.md/);

  const one = run("--root", root, "b");
  assert.equal(one.status, 0, one.stderr);
  assert.match(one.stdout, /^NOT READY: #4 .*\n {2}gate: OC-X1/);

  const json = run("--root", root, "--json");
  assert.equal(json.status, 0, json.stderr);
  assert.equal(JSON.parse(json.stdout).next.file, "2026-10-02-a.md");

  const unknown = run("--root", root, "nope");
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /no note matches "nope"/);

  const broken = run("--root", fixture({ "tasks/README.md": "# no queue\n" }));
  assert.equal(broken.status, 2);
  assert.match(broken.stdout, /^ERROR: /);

  assert.equal(run("--root", fixture({ "x.txt": "" })).status, 2);
  assert.equal(run("--bogus").status, 2);
});

test("the CLI changes no file", () => {
  const files = {
    "tasks/README.md": readme([[3, "2026-10-02-a.md", "none", "none"]]),
    "tasks/2026-10-02-a.md": note(),
  };
  const root = fixture(files);
  assert.equal(run("--root", root).status, 0);
  assert.deepEqual(readQueueFiles(root), { readme: files["tasks/README.md"], notes: { "2026-10-02-a.md": files["tasks/2026-10-02-a.md"] } });
});

test("the repo's own queue can be read", () => {
  const analysis = analyseQueue(readQueueFiles(repoRoot));
  assert.deepEqual(analysis.errors, []);
  assert.notEqual(analysis.endMarkerLine, null, "the queue:end marker is in place");
  assert.notEqual(analysis.lastNumber, null, "the queue:last-number line is in place");
  assert.deepEqual(analysis.warnings.filter((warning) => warning.includes("queue:last-number")), []);
  assert.ok(analysis.nextNumber > analysis.lastNumber);
  for (const row of analysis.rows) assert.ok(row.number <= analysis.lastNumber, `row #${row.number} is above the queue:last-number line`);
  assert.match(formatReport(analysis), /^NEXT: /m);
});

test("--help prints the usage and exits 0", () => {
  const help = run("--help");
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--json/);
  assert.match(help.stdout, /cli\.mjs <note>/);
});
