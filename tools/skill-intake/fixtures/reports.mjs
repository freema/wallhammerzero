// Small hand-made reports in the shape of SkillSpector 2.12.0 JSON output (only the fields
// that summary.mjs reads). They are not copies of a real scan.

const issue = (id, severity, file = "SKILL.md") => ({
  id,
  severity,
  category: "Test",
  pattern: "Test pattern",
  confidence: 0.6,
  location: { file, start_line: 1, end_line: null, start_column: 1 },
  finding: "matched text",
});

const metadata = (overrides = {}) => ({
  skillspector_version: "2.12.0",
  llm_requested: false,
  llm_available: false,
  filtering_mode: "heuristic",
  ...overrides,
});

/** A single-skill report. */
export function singleReport({ issues = [], suppressed = [], score = 0, llm = {} } = {}) {
  return {
    skill: { name: "example", source: "/scan/example", scanned_at: "2026-10-02T00:00:00+00:00" },
    risk_assessment: {
      score,
      severity: score > 50 ? "HIGH" : "LOW",
      recommendation: score > 50 ? "DO_NOT_INSTALL" : "SAFE",
    },
    components: [],
    issues,
    suppressed_count: suppressed.length,
    suppressed,
    metadata: metadata(llm),
    analysis_completeness: { is_complete: true, status: "complete", coverage_percent: 100 },
  };
}

/** A recursive report of two skills: 3 findings in the first, none in the second. */
export function multiReport() {
  const first = singleReport({
    issues: [issue("PE3", "HIGH"), issue("PE3", "HIGH"), issue("RP1", "MEDIUM", "notes.md")],
    score: 60,
  });
  const second = singleReport();
  return {
    multi_skill: true,
    skill_count: 2,
    max_risk_score: 60,
    risk_severity: "HIGH",
    risk_recommendation: "DO_NOT_INSTALL",
    analysis_completeness: { is_complete: false, status: "partial", coverage_percent: 50 },
    public_finding_records: 3,
    skills: [
      { name: "first", path: "first", finding_count: 2, ...first },
      { name: "second", path: "second", finding_count: 0, ...second },
    ],
  };
}

export { issue };
