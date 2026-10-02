// A throwaway repo that passes the docs check. Each test changes one thing in it.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after } from "node:test";
import { checkDocs, formatProblem } from "../lib/index.mjs";

const lines = (/** @type {string[]} */ ...text) => `${text.join("\n")}\n`;

/** @type {Record<string, string>} */
export const BASE = {
  "package.json": JSON.stringify({
    name: "fixture",
    private: true,
    workspaces: ["tools/*"],
    scripts: { check: "node tools/thing/run.mjs" },
  }),
  ".gitignore": lines("node_modules/", "dist/"),
  "tools/thing/package.json": JSON.stringify({ name: "@fx/thing", scripts: { check: "node --test", build: "node run.mjs" } }),
  "tools/thing/run.mjs": "",
  "CLAUDE.md": lines(
    "# CLAUDE.md",
    "",
    "Read [the decisions](docs/DECISIONS.md) and [the queue](tasks/README.md#queue) (D1).",
    "The gate is `./dev npm run check`; the tool is `tools/thing/run.mjs`.",
  ),
  "README.md": lines("# Fixture", "", "See [CLAUDE.md](CLAUDE.md) and [the guide](docs/guide.md#how-it-works)."),
  "docs/DECISIONS.md": lines(
    "# Decisions",
    "",
    "| ID | Date | Decision |",
    "|---|---|---|",
    "| D1 | 2026-01-01 | First. |",
    "| D2 | 2026-01-02 | Second (was OC-A1). |",
  ),
  "docs/guide.md": lines(
    "# Guide",
    "",
    "## How it works",
    "",
    "The research index is [here](../research/README.md#index). D2 applies; OC-B1 is open.",
  ),
  "tasks/README.md": lines(
    "# tasks/",
    "",
    "## Note format",
    "",
    "```markdown",
    "# <TITLE IN CAPS> (YYYY-MM-DD)",
    "",
    "**GATE:** <owner call or none> · **Priority:** P1–P3 · **Size:** S/M/L · **Depends on:** <notes or none>",
    "",
    "## Origin",
    "<why this exists>",
    "",
    "## Read first",
    "<the research behind the note>",
    "",
    "## Scope",
    "<numbered list>",
    "",
    "## Out of scope",
    "<what it does not do>",
    "",
    "## Acceptance",
    "<checks>",
    "```",
    "",
    "## Queue",
    "",
    "| # | Note | Gate | Depends on |",
    "|---|---|---|---|",
    "| 0 | [Owner calls](2026-01-01-owner-calls.md) | owner answers | none |",
    "| 1 | [Build the thing](2026-01-02-build-thing.md) | none | none |",
    "<!-- queue:end (the studio inserts new rows above this line) -->",
  ),
  "tasks/2026-01-01-owner-calls.md": lines(
    "# OWNER CALLS (2026-01-01)",
    "",
    "**GATE:** owner answers · **Priority:** P1 · **Size:** n/a · **Depends on:** none",
    "",
    "## Origin",
    "Open questions. Answered so far: OC-A1 → D2.",
    "",
    "## A. Platform",
    "",
    "**OC-B1: Which platform?** Open.",
  ),
  "tasks/2026-01-02-build-thing.md": lines(
    "# BUILD THE THING (2026-01-02)",
    "",
    "**GATE:** none · **Priority:** P1 · **Size:** S · **Depends on:** none",
    "",
    "## Origin",
    "D1 says so. It creates `tools/thing/later.mjs`, which does not exist yet.",
    "",
    "## Read first",
    "- [the report](../research/report-a.md)",
    "",
    "## Scope",
    "1. Build it.",
    "",
    "## Out of scope",
    "- Everything else.",
    "",
    "## Acceptance",
    "- `./dev npm run build-thing` passes.",
  ),
  "research/README.md": lines(
    "# Research",
    "",
    "## Index",
    "",
    "| Report | Topic |",
    "|---|---|",
    "| [report-a.md](report-a.md) | A report |",
    "| [scans/2026-01-01-x/](scans/2026-01-01-x/TRIAGE.md) | A scan |",
  ),
  "research/report-a.md": lines("# Report A"),
  "research/scans/2026-01-01-x/TRIAGE.md": lines("# Triage"),
};

const temporary = [];
after(() => {
  for (const dir of temporary) rmSync(dir, { recursive: true, force: true });
});

/**
 * Writes the base repo with changes. A string replaces or adds a file, null removes it, and
 * a function receives the base text and returns the new one.
 * @param {Record<string, string | null | ((text: string) => string)>} [changes]
 * @returns {string} the folder of the repo
 */
export function fixture(changes = {}) {
  const root = mkdtempSync(join(tmpdir(), "whz-docs-check-"));
  temporary.push(root);
  /** @type {Record<string, string | null>} */
  const files = { ...BASE };
  for (const [path, change] of Object.entries(changes)) {
    files[path] = typeof change === "function" ? change(BASE[path]) : change;
  }
  for (const [path, content] of Object.entries(files)) {
    if (content === null) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

/**
 * @param {Record<string, string | null | ((text: string) => string)>} [changes]
 * @returns {string[]} the problems of the changed repo, as the CLI prints them
 */
export function problemsOf(changes = {}) {
  return checkDocs(fixture(changes)).problems.map(formatProblem);
}

/**
 * A change that replaces one piece of the base text, and fails loudly when the piece is not
 * there (so a test never passes because its edit did nothing).
 * @param {string} from
 * @param {string} to
 */
export function swap(from, to) {
  return (/** @type {string} */ text) => {
    if (!text.includes(from)) throw new Error(`the fixture has no "${from}"`);
    return text.replace(from, to);
  };
}

/** A change that appends lines to the base text. @param {string[]} more */
export function append(...more) {
  return (/** @type {string} */ text) => text + lines(...more);
}
