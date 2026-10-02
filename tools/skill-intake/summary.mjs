// Counts the findings of a SkillSpector JSON report, so that a scan can be compared with the
// numbers in the registry (security/skill-intake/registry.json).
//
//   node tools/skill-intake/summary.mjs <report.json | ->  [--json]
//
// "-" reads the report from stdin. Exit 0: summary printed. Exit 2: not a readable SkillSpector
// report, or the report was made with the LLM stage (scans are static only, D27).
//
// A finding here is one issue record of the report (`issues[]`), the same way the counts of
// 2026-10-02 were taken. The scanner's own `finding_count` groups records and is lower.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

const rank = (severity) => {
  const index = SEVERITIES.indexOf(severity);
  return index === -1 ? SEVERITIES.length : index;
};

const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * @typedef {object} Summary
 * @property {string[]} scannerVersions versions named in the report (one, unless reports were mixed)
 * @property {boolean} multiSkill a recursive scan of several skills
 * @property {number} skills
 * @property {number} findings issue records, all severities
 * @property {Record<string, number>} bySeverity always has CRITICAL, HIGH, MEDIUM and LOW
 * @property {{severity: string, rule: string, count: number}[]} byRule
 * @property {number} suppressed findings hidden by a baseline
 * @property {number | null} score the highest risk score
 * @property {string | null} severity
 * @property {string | null} recommendation
 * @property {{status: string | null, complete: boolean | null, percent: number | null}} coverage
 * @property {boolean} llmRequested true if any part of the scan asked for the LLM stage
 * @property {{name: string, score: number | null, severity: string | null, findings: number}[]} perSkill
 */

/**
 * @param {unknown} report a parsed SkillSpector JSON report (single skill or multi-skill)
 * @returns {Summary}
 */
export function summarize(report) {
  if (!isObject(report)) throw new Error("not a SkillSpector report: the top level is not an object");

  const multiSkill = report.multi_skill === true;
  let parts;
  if (multiSkill) {
    if (!Array.isArray(report.skills)) throw new Error("not a SkillSpector report: multi_skill without a skills list");
    parts = report.skills;
  } else {
    parts = [report];
  }

  const bySeverity = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0]));
  const rules = new Map();
  const versions = new Set();
  const perSkill = [];
  let findings = 0;
  let suppressed = 0;
  let llmRequested = false;

  for (const [index, part] of parts.entries()) {
    const where = multiSkill ? `skills[${index}]` : "the report";
    if (!isObject(part) || !Array.isArray(part.issues) || !isObject(part.risk_assessment)) {
      throw new Error(`not a SkillSpector report: ${where} has no issues list or no risk_assessment`);
    }
    for (const issue of part.issues) {
      if (!isObject(issue) || typeof issue.severity !== "string" || typeof issue.id !== "string") {
        throw new Error(`not a SkillSpector report: an issue of ${where} has no id or no severity`);
      }
      findings += 1;
      bySeverity[issue.severity] = (bySeverity[issue.severity] ?? 0) + 1;
      const key = `${issue.severity} ${issue.id}`;
      const rule = rules.get(key) ?? { severity: issue.severity, rule: issue.id, count: 0 };
      rule.count += 1;
      rules.set(key, rule);
    }
    suppressed += Array.isArray(part.suppressed) ? part.suppressed.length : 0;
    const metadata = isObject(part.metadata) ? part.metadata : {};
    if (typeof metadata.skillspector_version === "string") versions.add(metadata.skillspector_version);
    // Anything but an explicit `false` counts as requested: an unknown state must not pass.
    if (metadata.llm_requested !== false || metadata.llm_available === true) llmRequested = true;
    perSkill.push({
      name: String(part.name ?? part.skill?.name ?? "?"),
      score: typeof part.risk_assessment.score === "number" ? part.risk_assessment.score : null,
      severity: part.risk_assessment.severity ?? null,
      findings: part.issues.length,
    });
  }

  const completeness = isObject(report.analysis_completeness) ? report.analysis_completeness : {};
  const byRule = [...rules.values()].sort(
    (a, b) => rank(a.severity) - rank(b.severity) || b.count - a.count || a.rule.localeCompare(b.rule),
  );

  return {
    scannerVersions: [...versions].sort(),
    multiSkill,
    skills: parts.length,
    findings,
    bySeverity,
    byRule,
    suppressed,
    score: multiSkill ? (report.max_risk_score ?? null) : (report.risk_assessment.score ?? null),
    severity: multiSkill ? (report.risk_severity ?? null) : (report.risk_assessment.severity ?? null),
    recommendation: multiSkill
      ? (report.risk_recommendation ?? null)
      : (report.risk_assessment.recommendation ?? null),
    coverage: {
      status: completeness.status ?? null,
      complete: typeof completeness.is_complete === "boolean" ? completeness.is_complete : null,
      percent: typeof completeness.coverage_percent === "number" ? completeness.coverage_percent : null,
    },
    llmRequested,
    perSkill,
  };
}

/**
 * @param {Summary} summary
 * @returns {string} the summary as lines of text
 */
export function formatSummary(summary) {
  const severities = Object.entries(summary.bySeverity)
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([severity, count]) => `${severity} ${count}`)
    .join(", ");
  const lines = [
    `scanner:        SkillSpector ${summary.scannerVersions.join(", ") || "(version not in the report)"}, ${
      summary.llmRequested ? "LLM STAGE REQUESTED" : "static only"
    }`,
    `skills:         ${summary.skills}${summary.multiSkill ? " (recursive scan)" : ""}`,
    `findings:       ${summary.findings} (${severities})`,
    `suppressed:     ${summary.suppressed}`,
    `verdict:        score ${summary.score ?? "?"}/100, severity ${summary.severity ?? "?"}, recommendation ${
      summary.recommendation ?? "?"
    }`,
    `coverage:       ${summary.coverage.status ?? "?"}${
      summary.coverage.percent === null ? "" : `, ${summary.coverage.percent} %`
    }`,
  ];
  if (summary.byRule.length > 0) {
    lines.push(`by rule:        ${summary.byRule.map((rule) => `${rule.severity} ${rule.rule} ×${rule.count}`).join(", ")}`);
  }
  if (summary.multiSkill) {
    const flagged = summary.perSkill.filter((skill) => skill.findings > 0);
    lines.push(
      `skills with findings: ${
        flagged.map((skill) => `${skill.name} ${skill.findings} (score ${skill.score ?? "?"})`).join(", ") || "none"
      }`,
    );
  }
  return lines.join("\n");
}

function main(argv) {
  const json = argv.includes("--json");
  const files = argv.filter((arg) => arg !== "--json");
  if (files.length !== 1 || (files[0].startsWith("-") && files[0] !== "-")) {
    console.error("usage: node tools/skill-intake/summary.mjs <report.json | -> [--json]");
    return 2;
  }
  let summary;
  try {
    const text = readFileSync(files[0] === "-" ? 0 : files[0], "utf8");
    summary = summarize(JSON.parse(text));
  } catch (error) {
    console.error(`summary: ${error.message}`);
    return 2;
  }
  console.log(json ? JSON.stringify(summary, null, 2) : formatSummary(summary));
  if (summary.llmRequested) {
    console.error("summary: this report was not made with --no-llm; scans are static only (D27)");
    return 2;
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = main(process.argv.slice(2));
}
