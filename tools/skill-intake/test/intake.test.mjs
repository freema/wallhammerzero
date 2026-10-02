import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { lintDockerfile, readPin, validateBaseline, validateRegistry } from "../intake-lint.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const intakeDir = join(repoRoot, "security", "skill-intake");
const dockerfile = readFileSync(join(here, "..", "Dockerfile"), "utf8");

// ---- the committed state -------------------------------------------------------------------

test("the scanner image is built from pinned inputs only", () => {
  assert.deepEqual(lintDockerfile(dockerfile), []);
  assert.deepEqual(readPin(dockerfile), {
    version: "2.12.0",
    commit: "c7958a3268d9498644b22edb75d0f051bbc8cbfc",
  });
});

test("security/skill-intake/registry.json is sound and every entry has its evidence", () => {
  const registry = JSON.parse(readFileSync(join(intakeDir, "registry.json"), "utf8"));
  assert.deepEqual(validateRegistry(registry, { intakeDir, repoRoot, pin: readPin(dockerfile) }), []);
});

test("the registry holds the two scans of 2026-10-02, and neither is installed", () => {
  const registry = JSON.parse(readFileSync(join(intakeDir, "registry.json"), "utf8"));
  const byName = new Map(registry.entries.map((entry) => [entry.name, entry]));

  const gameCreator = byName.get("game-creator");
  assert.equal(gameCreator.commit, "4e64b83b5fe400b34ad3a484d9b4a6090b26d512");
  assert.equal(gameCreator.verdict, "ideas-only");
  assert.deepEqual(gameCreator.installed, []);
  const skills = gameCreator.scans.find((scan) => scan.scope === "skills");
  assert.deepEqual([skills.findings, skills.high, skills.critical], [121, 31, 0]);

  const creatures = byName.get("procedural-pixel-creatures");
  assert.equal(creatures.verdict, "ideas-only");
  assert.deepEqual(creatures.installed, []);
  assert.match(creatures.notes, /Never run its Windows launcher/);
});

// ---- the lints themselves ------------------------------------------------------------------

test("Dockerfile lint: an unpinned base image, a tag instead of a commit and pip are errors", () => {
  const sha = "a".repeat(64);
  const good = [
    "ARG SKILLSPECTOR_VERSION=2.12.0",
    `ARG SKILLSPECTOR_COMMIT=${"b".repeat(40)}`,
    `FROM ghcr.io/astral-sh/uv:0.12.22@sha256:${sha} AS uv`,
    `FROM python:3.12-slim-bookworm@sha256:${sha} AS builder`,
    "ADD https://github.com/NVIDIA/SkillSpector.git#${SKILLSPECTOR_COMMIT} /src",
    "RUN uv sync --frozen --no-dev",
    "FROM builder",
    "",
  ].join("\n");
  assert.deepEqual(lintDockerfile(good), []);

  const errorsOf = (from, to) => lintDockerfile(good.replace(from, to)).join("\n");
  assert.match(errorsOf(`python:3.12-slim-bookworm@sha256:${sha}`, "python:3.12-slim-bookworm"), /pinned by digest/);
  assert.match(errorsOf(`=${"b".repeat(40)}`, "=v2.12.0"), /full 40-character commit SHA/);
  assert.match(errorsOf("=2.12.0", "=latest"), /release version/);
  assert.match(errorsOf("uv sync --frozen --no-dev", "pip install ."), /pip install/);
  assert.match(errorsOf("uv sync --frozen --no-dev", "uv sync"), /uv sync --frozen/);
  assert.match(errorsOf("#${SKILLSPECTOR_COMMIT}", "#main"), /SKILLSPECTOR_COMMIT/);
  assert.match(errorsOf("FROM builder", "FROM debian:bookworm"), /pinned by digest/);
});

test("baseline lint: a rule needs one rule id, one path and a reason", () => {
  const baseline = (rule) => ({ version: 2, scanner_version: "2.12.0", rules: [rule] });
  const context = { scannerVersion: "2.12.0" };
  const good = { id: "P2", path: "a.sln", message: "*BOM*", reason: "UTF-8 BOM" };
  assert.deepEqual(validateBaseline(baseline(good), context), []);

  assert.match(validateBaseline(baseline({ ...good, reason: " " }), context).join("\n"), /"reason" is required/);
  assert.match(validateBaseline(baseline({ id: "P2", reason: "x" }), context).join("\n"), /"path" must name the file/);
  assert.match(validateBaseline(baseline({ ...good, path: "*" }), context).join("\n"), /"path" must name the file/);
  assert.match(validateBaseline(baseline({ ...good, id: "P*" }), context).join("\n"), /without a glob/);
  assert.match(validateBaseline(baseline({ ...good, severity: "LOW" }), context).join("\n"), /unknown key "severity"/);
  assert.match(validateBaseline({ ...baseline(good), version: 1 }, context).join("\n"), /"version" must be 2/);
  assert.match(validateBaseline(baseline(good), { scannerVersion: "2.13.0" }).join("\n"), /"scanner_version" must be "2.13.0"/);
  assert.match(
    validateBaseline({ version: 2, scanner_version: "2.12.0", fingerprints: [{ hash: "sha256:abc" }] }, context).join("\n"),
    /"hash" must be sha256[\s\S]*"reason" is required/,
  );
});

// A registry with one entry in a temporary intake folder; `change` edits the entry.
function scratchRegistry(t, change = () => {}) {
  const root = mkdtempSync(join(tmpdir(), "whz-intake-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const intake = join(root, "security", "skill-intake");
  const commit = "c".repeat(40);
  const evidence = `example/2026-10-02-${commit.slice(0, 7)}`;
  mkdirSync(join(intake, evidence), { recursive: true });
  writeFileSync(join(intake, evidence, "TRIAGE.md"), "# triage\n");
  writeFileSync(join(intake, evidence, "example.md"), "# report\n");
  writeFileSync(join(intake, evidence, "baseline.json"), JSON.stringify({ version: 2, scanner_version: "2.12.0", rules: [] }));
  mkdirSync(join(root, ".claude", "skills", "example"), { recursive: true });
  const entry = {
    name: "example",
    kind: "skill",
    source: "https://example.org/example",
    commit,
    treeHash: "d".repeat(40),
    licence: "MIT",
    scanner: { name: "SkillSpector", version: "2.12.0", commit: "e".repeat(40) },
    scanned: "2026-10-02",
    evidence,
    scans: [
      { scope: ".", recursive: false, report: "example.md", findings: 3, critical: 0, high: 1, medium: 2, low: 0, score: 40, recommendation: "CAUTION", exit: 0 },
    ],
    verdict: "ideas-only",
    approval: null,
    installed: [],
    notes: "Ideas only.",
  };
  change(entry, { intake, root });
  const context = { intakeDir: intake, repoRoot: root, pin: { version: "2.12.0", commit: "e".repeat(40) } };
  return { errors: validateRegistry({ schema: 1, entries: [entry] }, context).join("\n"), entry, context };
}

test("registry lint: a sound entry passes", (t) => {
  assert.equal(scratchRegistry(t).errors, "");
});

test("registry lint: the source must be pinned to a full commit and a tree hash", (t) => {
  assert.match(scratchRegistry(t, (entry) => (entry.commit = "c7958a3")).errors, /"commit" must be the full/);
  assert.match(scratchRegistry(t, (entry) => delete entry.treeHash).errors, /"treeHash" must be the git tree hash/);
  assert.match(scratchRegistry(t, (entry) => (entry.source = "git@example.org:x.git")).errors, /https URL/);
  assert.match(scratchRegistry(t, (entry) => (entry.scanner.version = "latest")).errors, /"scanner.version"/);
  assert.match(scratchRegistry(t, (entry) => delete entry.licence).errors, /"licence" is required/);
});

test("registry lint: the evidence must be in the repo", (t) => {
  assert.match(scratchRegistry(t, (entry) => (entry.evidence = "elsewhere")).errors, /"evidence" must be "example\/2026-10-02-ccccccc"/);
  assert.match(scratchRegistry(t, (entry) => (entry.scans[0].report = "missing.md")).errors, /missing.md is not in the evidence folder/);
  assert.match(
    scratchRegistry(t, (entry, { intake }) => rmSync(join(intake, entry.evidence, "TRIAGE.md"))).errors,
    /no TRIAGE.md/,
  );
  assert.match(
    scratchRegistry(t, (entry, { intake }) => rmSync(join(intake, entry.evidence, "baseline.json"))).errors,
    /no baseline.json/,
  );
  assert.match(
    scratchRegistry(t, (entry, { intake }) =>
      writeFileSync(
        join(intake, entry.evidence, "baseline.json"),
        JSON.stringify({ version: 2, scanner_version: "2.12.0", rules: [{ id: "P2", path: "a" }] }),
      ),
    ).errors,
    /baseline.json: rules\[0\]: "reason" is required/,
  );
});

test("registry lint: the counts of a scan must add up", (t) => {
  assert.match(scratchRegistry(t, (entry) => (entry.scans[0].findings = 4)).errors, /is not critical \+ high \+ medium \+ low/);
  assert.match(scratchRegistry(t, (entry) => (entry.scans[0].exit = 2)).errors, /"exit" must be 0 or 1/);
  assert.match(scratchRegistry(t, (entry) => (entry.scans = [])).errors, /at least one scan/);
});

test("registry lint: nothing is installed without the owner's approval", (t) => {
  const approve = (entry) => {
    entry.verdict = "approved";
    entry.approval = { by: "owner", date: "2026-10-03", ref: "D99" };
    entry.installed = [".claude/skills/example"];
  };
  assert.equal(scratchRegistry(t, approve).errors, "");

  assert.match(
    scratchRegistry(t, (entry) => {
      approve(entry);
      entry.approval = null;
    }).errors,
    /needs the owner's approval/,
  );
  assert.match(
    scratchRegistry(t, (entry) => {
      approve(entry);
      entry.approval.by = "session";
    }).errors,
    /"approval" must be null or/,
  );
  assert.match(scratchRegistry(t, (entry) => (entry.installed = [".claude/skills/example"])).errors, /installs nothing/);
  assert.match(
    scratchRegistry(t, (entry) => {
      approve(entry);
      entry.installed = [".claude/skills/other"];
    }).errors,
    /installed path .claude\/skills\/other does not exist/,
  );
  assert.match(
    scratchRegistry(t, (entry) => {
      approve(entry);
      entry.installed = ["../outside"];
    }).errors,
    /must be relative to the repo root/,
  );
  assert.match(scratchRegistry(t, (entry) => (entry.verdict = "fine")).errors, /"verdict" must be one of/);
});

test("registry lint: an installed skill must be re-scanned after a scanner upgrade", (t) => {
  const { entry, context } = scratchRegistry(t, (draft) => {
    draft.verdict = "approved";
    draft.approval = { by: "owner", date: "2026-10-03", ref: "D99" };
    draft.installed = [".claude/skills/example"];
  });
  const upgraded = { ...context, pin: { version: "2.13.0", commit: "f".repeat(40) } };
  assert.match(validateRegistry({ schema: 1, entries: [entry] }, upgraded).join("\n"), /the pin is 2.13.0: re-scan it/);

  // An ideas-only entry installed nothing; it is re-scanned before any copy instead.
  const ideasOnly = { ...entry, verdict: "ideas-only", approval: null, installed: [] };
  assert.deepEqual(validateRegistry({ schema: 1, entries: [ideasOnly] }, upgraded), []);
});

test("registry lint: one entry per source name", (t) => {
  const { entry, context } = scratchRegistry(t);
  assert.match(validateRegistry({ schema: 1, entries: [entry, entry] }, context).join("\n"), /listed twice/);
  assert.match(validateRegistry({ schema: 2, entries: [] }, context).join("\n"), /"schema" must be 1/);
  assert.match(validateRegistry({ schema: 1 }, context).join("\n"), /"entries" must be a list/);
});
