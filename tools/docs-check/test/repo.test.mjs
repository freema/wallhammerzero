import assert from "node:assert/strict";
import { test } from "node:test";
import { globSource, normalize, openRepo } from "../lib/repo.mjs";
import { fixture } from "./fixture.mjs";

test("paths are looked up with their exact case", () => {
  const repo = openRepo(fixture());
  assert.equal(repo.kind("docs/DECISIONS.md"), "file");
  assert.equal(repo.kind("docs"), "dir");
  assert.equal(repo.kind("docs/"), "dir");
  assert.equal(repo.kind(""), "dir");
  assert.equal(repo.kind("docs/decisions.md"), null);
  assert.equal(repo.kind("Docs/DECISIONS.md"), null);
  assert.equal(repo.kind("docs/DECISIONS.md/x"), null);
  assert.equal(repo.kind("../outside"), null);
  assert.equal(repo.differsByCase("Docs/decisions.md"), "docs/DECISIONS.md");
  assert.equal(repo.differsByCase("docs/DECISIONS.md"), null);
  assert.equal(repo.differsByCase("docs/nope.md"), null);
  assert.equal(repo.read("docs"), null);
  assert.equal(repo.read("research/report-a.md"), "# Report A\n");
});

test("normalize keeps a path inside the repo", () => {
  assert.equal(normalize("docs/../tasks/./README.md"), "tasks/README.md");
  assert.equal(normalize("docs/"), "docs");
  assert.equal(normalize("."), "");
  assert.equal(normalize("docs/../../x"), null);
  assert.equal(normalize("/etc/passwd"), null);
});

test("gitignored paths: the root .gitignore, nested ones, globs and anchored patterns", () => {
  const repo = openRepo(
    fixture({
      ".gitignore": "# comment\nnode_modules/\ndist/\n*.log\n/build\n!keep.log\n",
      "tools/thing/.gitignore": "out/\ncache/*.bin\n",
      "tools/thing/out/a.txt": "",
      "docs/notes.log": "",
    }),
  );
  for (const path of [".git/config", "node_modules/x", "tools/thing/node_modules/y", "dist", "a/dist/b", "x.log", "docs/notes.log", "build/x", "tools/thing/out/a.txt", "tools/thing/cache/a.bin"]) {
    assert.equal(repo.isIgnored(path), true, path);
  }
  for (const path of ["docs/guide.md", "tools/build/x", "out/a.txt", "tools/thing/cache/a.txt", "distance/x", ""]) {
    assert.equal(repo.isIgnored(path), false, path);
  }
  assert.deepEqual(repo.tracked("tools/thing"), [".gitignore", "package.json", "run.mjs"]);
  assert.deepEqual(repo.markdownFiles("docs"), ["docs/DECISIONS.md", "docs/guide.md"]);
});

test("globs match tracked files and folders", () => {
  const repo = openRepo(fixture({ "dist/tools/x.md": "" }));
  assert.equal(globSource("a/*.md"), "a/[^/]*\\.md");
  for (const glob of ["tools/*", "tools/*/package.json", "research/report-?.md", "research/**/TRIAGE.md", "**/*.mjs", "docs/**"]) {
    assert.equal(repo.globMatches(glob), true, glob);
  }
  for (const glob of ["tools/*/nope.json", "research/ref-*.md", "tools/thing/run.mjs/*", "dist/**/*.md", "nope/*"]) {
    assert.equal(repo.globMatches(glob), false, glob);
  }
});
