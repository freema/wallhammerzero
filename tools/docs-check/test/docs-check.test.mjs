import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkDocs } from "../lib/index.mjs";
import { append, fixture, problemsOf, swap } from "./fixture.mjs";

const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "cli.mjs");

/** Asserts the problems are exactly these, each given as [start of the line, pattern of the rest]. */
function assertProblems(actual, expected) {
  const shown = actual.join("\n");
  assert.equal(actual.length, expected.length, `expected ${expected.length} problems, got:\n${shown}`);
  expected.forEach(([start, pattern], index) => {
    assert.ok(actual[index].startsWith(start), `problem ${index + 1} must start with "${start}", got:\n${shown}`);
    assert.match(actual[index], pattern);
  });
}

test("the base fixture passes, and every rule had something to check", () => {
  const { problems, stats } = checkDocs(fixture());
  assert.deepEqual(problems, []);
  assert.deepEqual(stats, {
    files: 8,
    links: 10,
    paths: 1,
    notes: 2,
    queueRows: 2,
    reports: 2,
    indexRows: 2,
    decisions: 2,
    idMentions: 10,
    scripts: 1,
  });
});

// --- links ---

test("a broken link fails with the file and line", () => {
  assertProblems(problemsOf({ "docs/guide.md": append("", "See [the plan](plan.md).") }), [
    ["docs/guide.md:7: broken link", /"plan\.md" names docs\/plan\.md, which does not exist \[links\]$/],
  ]);
  assertProblems(problemsOf({ "tasks/2026-01-02-build-thing.md": swap("../research/report-a.md", "../research/report-b.md") }), [
    ["tasks/2026-01-02-build-thing.md:9: broken link", /research\/report-b\.md, which does not exist/],
  ]);
  assertProblems(problemsOf({ "research/README.md": append("", "More in [the docs](../docs/nope/).") }), [
    ["research/README.md:10: broken link", /docs\/nope/],
  ]);
});

test("a broken anchor fails, in another file and in the same file", () => {
  assertProblems(problemsOf({ "README.md": swap("#how-it-works", "#how-it-worked") }), [
    ["README.md:3: broken anchor", /"#how-it-worked" is not a heading of docs\/guide\.md \[links\]$/],
  ]);
  assertProblems(problemsOf({ "docs/guide.md": append("", "Up to [the top](#guide) or [nowhere](#nowhere).") }), [
    ["docs/guide.md:7: broken anchor", /"#nowhere" is not a heading of docs\/guide\.md/],
  ]);
});

test("a link must match the case of the file, even on a case-insensitive disk", () => {
  assertProblems(problemsOf({ "CLAUDE.md": swap("docs/DECISIONS.md", "docs/decisions.md") }), [
    ["CLAUDE.md:3: broken link", /the case differs: docs\/DECISIONS\.md exists/],
  ]);
});

test("a link may not leave the repo or name a gitignored file", () => {
  assertProblems(
    problemsOf({
      "dist/out.md": "# Built\n",
      "docs/guide.md": append("", "[outside](../../elsewhere.md)", "[built](../dist/out.md)"),
    }),
    [
      ["docs/guide.md:7: broken link", /points outside the repo/],
      ["docs/guide.md:8: broken link", /gitignored/],
    ],
  );
});

test("links to folders, root-relative links, external links and links in code are fine", () => {
  assert.deepEqual(
    problemsOf({
      "docs/guide.md": append(
        "",
        "[a folder](../tasks/) [root-relative](/docs/DECISIONS.md) [external](https://example.com/nope.md)",
        "[mail](mailto:a@example.com) [encoded](../research/report%2Da.md) `[code](nope.md)`",
        "",
        "```",
        "[fenced](nope.md)",
        "```",
      ),
    }),
    [],
  );
});

// --- backticked paths ---

test("a backticked repo path that does not exist fails in docs, CLAUDE.md and README.md", () => {
  assertProblems(
    problemsOf({
      "CLAUDE.md": swap("`tools/thing/run.mjs`", "`tools/thing/gone.mjs`"),
      "README.md": append("", "Run `node tools/thing/main.mjs --fast` or see `docs/Guide.md`."),
      "docs/guide.md": append("", "The folder `tools/thing/run.mjs/` and the pattern `tools/*/nothing.json`."),
    }),
    [
      ["CLAUDE.md:4: `tools/thing/gone.mjs` does not exist [paths]", /./],
      ["README.md:5: `tools/thing/main.mjs` does not exist [paths]", /./],
      ["README.md:5: `docs/Guide.md` does not exist (the case differs: docs/guide.md exists) [paths]", /./],
      ["docs/guide.md:7: `tools/thing/run.mjs/` is a file, not a folder [paths]", /./],
      ["docs/guide.md:7: `tools/*/nothing.json` matches nothing in the repo [paths]", /./],
    ],
  );
});

test("task notes may name files that do not exist yet", () => {
  // The base note names `tools/thing/later.mjs`; the same words in a doc are a problem.
  assertProblems(problemsOf({ "docs/guide.md": append("", "It creates `tools/thing/later.mjs`.") }), [
    ["docs/guide.md:7: `tools/thing/later.mjs` does not exist", /./],
  ]);
});

test("only words that start with a top-level folder are read as repo paths", () => {
  const { problems, stats } = checkDocs(
    fixture({
      "docs/guide.md": append(
        "",
        "Existing: `tools/thing/`, `./tools/thing/run.mjs`, `/work/tools/thing`, `tools/thing/run.mjs:12-20`,",
        "`docs/guide.md#how-it-works`, `tools/*`, `tools/*/package.json`, `docs/**/*.md`, `--root=tools/thing`.",
        "Not repo paths: `packages/later/src/x.ts` (no such top-level folder), `~/projects/x/tasks/README.md`,",
        "`@fx/thing`, `/dev/dri`, `run.mjs`, `tools/<name>/x.mjs`, `tools/${name}`, `tools/.../x`,",
        "`https://example.com/tools/x`, `dist/tools/x.js`, `tools/thing/dist/bundle.js` (gitignored output).",
      ),
    }),
  );
  assert.deepEqual(problems, []);
  assert.equal(stats.paths, 1 + 9);
});

// --- the queue ---

test("a note without a queue row fails with the file and line", () => {
  const note = "# EXTRA (2026-01-03)\n\n**GATE:** none · **Priority:** P2 · **Size:** S · **Depends on:** none\n\n## Origin\n\n## Read first\n\n## Scope\n\n## Out of scope\n\n## Acceptance\n";
  assertProblems(problemsOf({ "tasks/2026-01-03-extra.md": note }), [
    ["tasks/README.md:32: note without a queue row: tasks/2026-01-03-extra.md is not in the Queue table [queue]", /./],
  ]);
});

test("a queue row without a note fails with the file and line", () => {
  // The broken link is reported too: both rules see the same row.
  assertProblems(problemsOf({ "tasks/README.md": swap("<!-- queue:end", "| 2 | [Gone](2026-01-03-gone.md) | none | none |\n<!-- queue:end") }), [
    ["tasks/README.md:32: broken link", /\[links\]$/],
    ["tasks/README.md:32: queue row without a note: tasks/2026-01-03-gone.md does not exist", /\[queue\]$/],
  ]);
});

test("a note has exactly one row, and row numbers are unique", () => {
  assertProblems(
    problemsOf({
      "tasks/README.md": swap(
        "<!-- queue:end",
        "| 1 | [Again](2026-01-02-build-thing.md) | none | none |\n| x | plain text | none | none |\n<!-- queue:end",
      ),
    }),
    [
      ["tasks/README.md:32: queue row #1 appears twice (first on line 31)", /./],
      ["tasks/README.md:32: tasks/2026-01-02-build-thing.md has a second queue row (the first is on line 31)", /./],
      ['tasks/README.md:33: the "#" of a queue row must be a number, not "x"', /./],
      ["tasks/README.md:33: the Note cell of a queue row must link to a note in tasks/", /./],
    ],
  );
});

test("the queue:end marker must exist, once, right after the last row", () => {
  assertProblems(problemsOf({ "tasks/README.md": swap("<!-- queue:end (the studio inserts new rows above this line) -->\n", "") }), [
    ["tasks/README.md:26: the `<!-- queue:end ... -->` marker is missing", /./],
  ]);
  assertProblems(problemsOf({ "tasks/README.md": swap("<!-- queue:end", "\n<!-- queue:end") }), [
    ["tasks/README.md:33: the queue:end marker must be on the line right after the last row", /./],
  ]);
  assertProblems(problemsOf({ "tasks/README.md": append("<!-- queue:end -->") }), [
    ["tasks/README.md:34: a second queue:end marker (the first is on line 32)", /./],
  ]);
  assert.deepEqual(problemsOf({ "tasks/README.md": append("", "New rows go above the `<!-- queue:end -->` line.") }), []);
});

test("the queue:last-number line must exist, once, right after the end marker, and no row may be above it", () => {
  const LINE = "<!-- queue:last-number #9 (the highest row number ever given: a new row takes the next one and writes it here) -->\n";
  assertProblems(problemsOf({ "tasks/README.md": swap(LINE, "") }), [
    ["tasks/README.md:32: the `<!-- queue:last-number #N ... -->` line is missing (right after the queue:end marker)", /so a new row never reuses one \[queue\]$/],
  ]);
  assertProblems(problemsOf({ "tasks/README.md": swap("queue:last-number #9 ", "queue:last-number ") }), [
    ["tasks/README.md:33: the queue:last-number line needs a row number, like `<!-- queue:last-number #35 ... -->`", /./],
  ]);
  assertProblems(problemsOf({ "tasks/README.md": swap(LINE, `\n${LINE}`) }), [
    ["tasks/README.md:34: the queue:last-number line must be on the line right after the queue:end marker", /./],
  ]);
  assertProblems(problemsOf({ "tasks/README.md": append("<!-- queue:last-number #12 -->") }), [
    ["tasks/README.md:34: a second queue:last-number line (the first is on line 33)", /./],
  ]);
  // A new row that did not write its number into the line: the gate is red until it does.
  const note = "# NEW THING (2026-01-03)\n\n**GATE:** none · **Priority:** P2 · **Size:** S · **Depends on:** none\n\n## Origin\n\n## Read first\n\n## Scope\n\n## Out of scope\n\n## Acceptance\n";
  const addRow = swap("<!-- queue:end", "| 10 | [New thing](2026-01-03-new-thing.md) | none | none |\n<!-- queue:end");
  assertProblems(problemsOf({ "tasks/README.md": addRow, "tasks/2026-01-03-new-thing.md": note }), [
    ["tasks/README.md:32: queue row #10 is above the queue:last-number line (#9): a new row writes its number there, so no number is given twice", /./],
  ]);
  const raise = swap("queue:last-number #9", "queue:last-number #10");
  assert.deepEqual(problemsOf({ "tasks/README.md": (text) => raise(addRow(text)), "tasks/2026-01-03-new-thing.md": note }), []);
  // A sentence about the line is not the line, and the line inside a code fence is an example.
  assert.deepEqual(problemsOf({ "tasks/README.md": append("", "The `<!-- queue:last-number #3 -->` line keeps the number.", "", "```markdown", "<!-- queue:last-number #3 -->", "```") }), []);
});

test("a note needs the header line with all four labels", () => {
  const file = "tasks/2026-01-02-build-thing.md";
  assertProblems(problemsOf({ [file]: swap("**GATE:** none · **Priority:** P1 · **Size:** S · **Depends on:** none\n", "") }), [
    [`${file}:1: the header line is missing: **GATE:** … · **Priority:** … · **Size:** … · **Depends on:** …`, /./],
  ]);
  assertProblems(problemsOf({ [file]: swap(" · **Size:** S", "") }), [[`${file}:3: the header line has no **Size:**`, /./]]);
  assertProblems(problemsOf({ [file]: swap("**Priority:** P1", "**Priority:**") }), [
    [`${file}:3: **Priority:** in the header line has no value`, /./],
  ]);
});

test("a note needs the sections of the note format, in order", () => {
  const file = "tasks/2026-01-02-build-thing.md";
  assertProblems(problemsOf({ [file]: swap("## Out of scope\n- Everything else.\n\n", "") }), [
    [`${file}:1: the section "## Out of scope" is missing`, /./],
  ]);
  assertProblems(problemsOf({ [file]: swap("## Read first", "## Scope") }), [
    [`${file}:1: the section "## Read first" is missing`, /./],
    [`${file}:11: the section "## Scope" appears twice`, /./],
  ]);
  const moved = (/** @type {string} */ text) =>
    swap("## Origin\nD1 says so. It creates `tools/thing/later.mjs`, which does not exist yet.\n\n", "")(text) +
    "\n## Origin\nD1 says so.\n";
  assertProblems(problemsOf({ [file]: moved }), [[`${file}:5: the section "## Read first" must come after "## Origin"`, /./]]);
});

test("the note format is read from the template in tasks/README.md", () => {
  assertProblems(problemsOf({ "tasks/README.md": swap("## Acceptance\n<checks>", "## Acceptance\n<checks>\n\n## Risks\n<what can go wrong>") }), [
    ['tasks/2026-01-02-build-thing.md:1: the section "## Risks" is missing', /./],
  ]);
  assertProblems(problemsOf({ "tasks/README.md": swap("## Note format", "## Format") }), [
    ['tasks/README.md:1: the "## Note format" section has no fenced template', /./],
  ]);
});

test("a note has a dated file name and a dated title", () => {
  const note = "# Extra\n\n**GATE:** none · **Priority:** P2 · **Size:** S · **Depends on:** none\n\n## Origin\n\n## Read first\n\n## Scope\n\n## Out of scope\n\n## Acceptance\n";
  assertProblems(
    problemsOf({
      "tasks/extra.md": note,
      "tasks/README.md": swap("<!-- queue:end", "| 2 | [Extra](extra.md) | none | none |\n<!-- queue:end"),
    }),
    [
      ["tasks/extra.md:1: a note is named YYYY-MM-DD-topic.md", /./],
      ["tasks/extra.md:1: the first line of a note is `# <TITLE> (YYYY-MM-DD)`", /./],
    ],
  );
});

// --- the research index ---

test("a report or a scan folder without an index row fails", () => {
  assertProblems(
    problemsOf({
      "research/report-b.md": "# Report B\n",
      "research/scans/2026-01-02-y/report.json": "{}",
    }),
    [
      ["research/README.md:8: research/report-b.md has no row in the index [research-index]", /./],
      ["research/README.md:8: research/scans/2026-01-02-y/ has no row in the index [research-index]", /./],
    ],
  );
  // A link in prose is not a row.
  assertProblems(problemsOf({ "research/report-b.md": "# B\n", "research/README.md": append("", "See also [B](report-b.md).") }), [
    ["research/README.md:8: research/report-b.md has no row in the index", /./],
  ]);
});

// --- ids ---

test("an unknown decision id fails with the file and line", () => {
  assertProblems(
    problemsOf({
      "tasks/2026-01-02-build-thing.md": swap("D1 says so.", "D1 and D7 say so."),
      "docs/guide.md": append("", "As decided (D3, D1–D2)."),
    }),
    [
      ["docs/guide.md:7: unknown decision id D3: it is not a row of docs/DECISIONS.md [ids]", /./],
      ["tasks/2026-01-02-build-thing.md:6: unknown decision id D7: it is not a row of docs/DECISIONS.md [ids]", /./],
    ],
  );
});

test("an unknown owner call fails; a call named in DECISIONS.md or the owner-calls note is known", () => {
  assertProblems(problemsOf({ "docs/guide.md": append("", "Waits for OC-A1, OC-B1, OC-B1-pick and OC-Z9.") }), [
    ["docs/guide.md:7: unknown owner call OC-B1-pick", /neither in docs\/DECISIONS\.md nor in the owner-calls note \[ids\]$/],
    ["docs/guide.md:7: unknown owner call OC-Z9", /./],
  ]);
});

test("ids are not read out of other words or out of code", () => {
  assert.deepEqual(
    problemsOf({
      "tasks/2026-01-01-owner-calls.md": append("", "**OC-D9: A later call.** Open."),
      "docs/guide.md": append("", "OC-D9 is an owner call. These are not ids: 3D9, #D9D9D9, D9x, `D9`, WD9, x-D9.", "", "```", "D9 OC-Q1", "```"),
    }),
    [],
  );
});

test("decision ids are unique and ascending", () => {
  assertProblems(
    problemsOf({
      "docs/DECISIONS.md": append("| D5 | 2026-01-03 | Fifth. |", "| D4 | 2026-01-04 | Out of order. |", "| D2 | 2026-01-05 | Again. |"),
    }),
    [
      ["docs/DECISIONS.md:8: D4 comes after D5: decision ids must ascend [ids]", /./],
      ["docs/DECISIONS.md:9: D2 is defined twice (first on line 6) [ids]", /./],
    ],
  );
});

// --- npm scripts ---

test("`./dev npm run <script>` must name a real script", () => {
  assertProblems(
    problemsOf({
      "CLAUDE.md": append("", "```sh", "./dev npm run lint && ./dev npm run check -- --bail", "./dev -p 4101 npm run serve", "```"),
      "docs/guide.md": append(
        "",
        "Run `./dev npm run build -w @fx/thing`, `./dev npm run build -w tools/thing`, `./dev npm run check -ws`,",
        "`./dev npm -w @fx/thing run build`, `./dev npm run <script>` and `./dev npm run check -- -w @fx/none`.",
        "Not `./dev npm run build`, `./dev npm run test -w @fx/thing`, `./dev npm run build -w @fx/none` or",
        "`./dev npm run deploy --workspaces`.",
      ),
    }),
    [
      ['CLAUDE.md:7: `./dev npm run lint`: there is no npm script "lint" in the root package.json [scripts]', /./],
      ['CLAUDE.md:8: `./dev npm run serve`: there is no npm script "serve" in the root package.json [scripts]', /./],
      ['docs/guide.md:9: `./dev npm run build`: there is no npm script "build" in the root package.json [scripts]', /./],
      ['docs/guide.md:9: `./dev npm run test`: there is no npm script "test" in tools/thing/package.json [scripts]', /./],
      ["docs/guide.md:9: `./dev npm run build` names the workspace @fx/none, which does not exist [scripts]", /./],
      ['docs/guide.md:10: `./dev npm run deploy`: there is no npm script "deploy" in any workspace [scripts]', /./],
    ],
  );
});

test("task notes may name scripts that do not exist yet", () => {
  // The base note names `./dev npm run build-thing`.
  assertProblems(problemsOf({ "README.md": append("", "Run `./dev npm run build-thing`.") }), [
    ["README.md:5: `./dev npm run build-thing`", /./],
  ]);
});

// --- the whole ---

test("a missing required file is a problem, not a skipped check", () => {
  assertProblems(problemsOf({ "research/README.md": null, "docs/guide.md": swap("[here](../research/README.md#index)", "here") }), [
    ["research/README.md:1: this file is missing, and the docs check needs it [files]", /./],
  ]);
});

test("the CLI prints file:line lines and exits 1 on problems, 0 without, 2 on a usage error", () => {
  const run = (/** @type {string[]} */ ...args) => {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
    return { status: result.status, out: result.stdout, err: result.stderr };
  };
  const good = run("--root", fixture());
  assert.equal(good.status, 0, good.out + good.err);
  assert.match(good.out, /^docs-check: ok \(8 Markdown files: 10 relative links, /);

  const bad = run("--root", fixture({ "docs/guide.md": append("", "See [the plan](plan.md) (D9).") }));
  assert.equal(bad.status, 1, bad.out + bad.err);
  const printed = bad.out.split("\n");
  assert.match(printed[0], /^docs\/guide\.md:7: unknown decision id D9: .* \[ids\]$/);
  assert.match(printed[1], /^docs\/guide\.md:7: broken link: .* \[links\]$/);
  assert.match(bad.out, /\ndocs-check: FAILED, 2 problems \(/);

  assert.equal(run("--nope").status, 2);
  assert.equal(run("--root", join(fixture(), "docs")).status, 2);
});
