// The implement-tasks skill is prose that a session follows. These checks keep the prose tied to
// the repo: its links resolve, the commands and files it names exist, and the progress file has
// the shape the skill reads.

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const skillDir = join(repoRoot, ".claude", "skills", "implement-tasks");

function markdownFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const file = join(dir, name);
    if (statSync(file).isDirectory()) return markdownFiles(file);
    return name.endsWith(".md") ? [file] : [];
  });
}

const skillFiles = markdownFiles(skillDir);
const read = (file) => readFileSync(file, "utf8");
const name = (file) => relative(repoRoot, file);

test("SKILL.md has the frontmatter Claude Code needs", () => {
  const text = read(join(skillDir, "SKILL.md"));
  const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.notEqual(frontmatter, null, "SKILL.md starts with a frontmatter block");
  assert.match(frontmatter[1], /^name: implement-tasks$/m, "the name is the folder name");
  const description = /^description: "(.+)"$/m.exec(frontmatter[1]);
  assert.notEqual(description, null, "the description is one quoted line");
  assert.ok(description[1].length <= 1024, "the description fits the 1024-character limit");
});

test("every relative link in the skill resolves", () => {
  assert.ok(skillFiles.length >= 5, "SKILL.md and its references are there");
  for (const file of skillFiles) {
    // examples inside fenced code blocks are not links of this page
    const prose = read(file).replace(/^ *```[\s\S]*?^ *```/gm, "");
    for (const match of prose.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = match[1].split("#")[0];
      if (target === "" || /^[a-z]+:/.test(target)) continue;
      assert.ok(existsSync(resolve(dirname(file), target)), `${name(file)} links to ${match[1]}, which does not exist`);
    }
  }
});

test("the repo files and commands the skill names exist", () => {
  const all = skillFiles.map(read).join("\n");
  const named = [
    "CLAUDE.md",
    "tasks/README.md",
    "docs/progress.md",
    "docs/DECISIONS.md",
    "docs/dev-environment.md",
    "research/README.md",
    "compose.yaml",
    "tools/task-queue/cli.mjs",
  ];
  for (const path of named) {
    assert.ok(all.includes(`\`${path}\``) || all.includes(` ${path}`), `the skill names ${path}`);
    assert.ok(existsSync(join(repoRoot, path)), `${path} exists`);
  }
  assert.ok(existsSync(join(repoRoot, "dev")), "./dev exists");
  const scripts = JSON.parse(read(join(repoRoot, "package.json"))).scripts;
  assert.equal(typeof scripts.check, "string", "`npm run check` is a root script");
  assert.ok(all.includes("./dev npm run check && git commit"), "the gate is chained to the commit with &&");
});

test("the skill has no rounds and none of the tracker, PR and release flow of its sources", () => {
  for (const file of skillFiles) {
    const text = read(file);
    assert.doesNotMatch(text, /\bR[1-9]\b|## Rounds|STATUS block|## STATUS/, `${name(file)} still talks about rounds or STATUS blocks`);
    assert.doesNotMatch(text, /\bLinear\b|pull request|gh pr |npm publish/i, `${name(file)} still has tracker, PR or release steps`);
  }
});

test("docs/progress.md has the sections the skill reads", () => {
  const text = read(join(repoRoot, "docs", "progress.md"));
  for (const heading of ["## Now", "## Blocked on the owner", "## Attempt ledger", "## Open questions for the owner"]) {
    assert.ok(text.split("\n").some((line) => line.startsWith(heading)), `docs/progress.md has "${heading}"`);
  }
  for (const label of ["**In flight:**", "**Last finished:**", "**Next:**"]) {
    assert.ok(text.includes(label), `docs/progress.md has the ${label} line`);
  }
});

test("tasks/README.md says how to run the loop", () => {
  const text = read(join(repoRoot, "tasks", "README.md"));
  for (const command of ["`/implement-tasks`", "`/implement-tasks <note>`", "`/loop <interval> /implement-tasks`"]) {
    assert.ok(text.includes(command), `tasks/README.md shows ${command}`);
  }
});
