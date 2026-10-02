import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { formatSummary, summarize } from "../summary.mjs";
import { issue, multiReport, singleReport } from "../fixtures/reports.mjs";

const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "summary.mjs");

test("a single-skill report: counts by severity and by rule", () => {
  const summary = summarize(
    singleReport({
      issues: [issue("P2", "HIGH"), issue("RA2", "MEDIUM"), issue("RA2", "MEDIUM"), issue("EA3", "LOW")],
      score: 94,
    }),
  );
  assert.equal(summary.multiSkill, false);
  assert.equal(summary.skills, 1);
  assert.equal(summary.findings, 4);
  assert.deepEqual(summary.bySeverity, { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 1 });
  assert.deepEqual(summary.byRule, [
    { severity: "HIGH", rule: "P2", count: 1 },
    { severity: "MEDIUM", rule: "RA2", count: 2 },
    { severity: "LOW", rule: "EA3", count: 1 },
  ]);
  assert.equal(summary.score, 94);
  assert.equal(summary.recommendation, "DO_NOT_INSTALL");
  assert.deepEqual(summary.scannerVersions, ["2.12.0"]);
  assert.equal(summary.llmRequested, false);
});

test("a recursive report: findings are the issue records of all skills, the score is the highest", () => {
  const summary = summarize(multiReport());
  assert.equal(summary.multiSkill, true);
  assert.equal(summary.skills, 2);
  assert.equal(summary.findings, 3);
  assert.deepEqual(summary.bySeverity, { CRITICAL: 0, HIGH: 2, MEDIUM: 1, LOW: 0 });
  assert.equal(summary.score, 60);
  assert.equal(summary.severity, "HIGH");
  assert.equal(summary.recommendation, "DO_NOT_INSTALL");
  assert.deepEqual(summary.coverage, { status: "partial", complete: false, percent: 50 });
  assert.deepEqual(
    summary.perSkill.map((skill) => [skill.name, skill.findings]),
    [
      ["first", 3],
      ["second", 0],
    ],
  );
});

test("suppressed findings are counted apart from the active ones", () => {
  const summary = summarize(singleReport({ issues: [issue("E1", "MEDIUM")], suppressed: [{ id: "P2" }, { id: "P2" }] }));
  assert.equal(summary.findings, 1);
  assert.equal(summary.suppressed, 2);
});

test("a severity the scanner adds later is counted under its own name", () => {
  const summary = summarize(singleReport({ issues: [issue("X1", "INFO")] }));
  assert.equal(summary.findings, 1);
  assert.equal(summary.bySeverity.INFO, 1);
  assert.equal(summary.bySeverity.HIGH, 0);
});

test("a report made with the LLM stage is flagged; an unknown LLM state is flagged too", () => {
  assert.equal(summarize(singleReport({ llm: { llm_requested: true } })).llmRequested, true);
  assert.equal(summarize(singleReport({ llm: { llm_available: true } })).llmRequested, true);
  const unknown = singleReport();
  delete unknown.metadata;
  assert.equal(summarize(unknown).llmRequested, true);
});

test("anything that is not a SkillSpector report is an error, not a clean summary", () => {
  assert.throws(() => summarize(null), /not a SkillSpector report/);
  assert.throws(() => summarize([]), /not a SkillSpector report/);
  assert.throws(() => summarize({}), /no issues list/);
  assert.throws(() => summarize({ multi_skill: true }), /without a skills list/);
  assert.throws(() => summarize({ issues: [{ id: "P2" }], risk_assessment: {} }), /no id or no severity/);
});

test("the text summary names the counts the registry records", () => {
  const text = formatSummary(summarize(multiReport()));
  assert.match(text, /^findings: +3 \(CRITICAL 0, HIGH 2, MEDIUM 1, LOW 0\)$/m);
  assert.match(text, /^verdict: +score 60\/100, severity HIGH, recommendation DO_NOT_INSTALL$/m);
  assert.match(text, /^scanner: +SkillSpector 2\.12\.0, static only$/m);
  assert.match(text, /^by rule: +HIGH PE3 ×2, MEDIUM RP1 ×1$/m);
  assert.match(text, /^skills with findings: first 3 \(score 60\)$/m);
});

test("the command line: file or stdin, --json, and exit 2 for an unusable report", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "whz-summary-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const good = join(dir, "good.json");
  writeFileSync(good, JSON.stringify(multiReport()));
  const run = (args, input) => spawnSync(process.execPath, [cli, ...args], { input, encoding: "utf8" });

  const fromFile = run([good]);
  assert.equal(fromFile.status, 0, fromFile.stderr);
  assert.match(fromFile.stdout, /findings: +3 /);

  const fromStdin = run(["-", "--json"], JSON.stringify(multiReport()));
  assert.equal(fromStdin.status, 0, fromStdin.stderr);
  assert.equal(JSON.parse(fromStdin.stdout).findings, 3);

  assert.equal(run(["-"], "not json").status, 2);
  assert.equal(run(["-"], "{}").status, 2);
  assert.equal(run([join(dir, "missing.json")]).status, 2);
  assert.equal(run([]).status, 2);

  const withLlm = run(["-"], JSON.stringify(singleReport({ llm: { llm_requested: true } })));
  assert.equal(withLlm.status, 2);
  assert.match(withLlm.stderr, /static only/);
});
