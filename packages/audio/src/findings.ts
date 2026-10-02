// What the parsers and validators report. Claude cannot hear, so a song or an SFX is judged
// like code: every problem is a line with a rule, a place in the file and a message, and an
// error fails the check the way a compile error fails a build.

export type Severity = "error" | "warning";

/**
 * Where in the music a finding is, in musical coordinates (never in seconds: a tempo change
 * moves seconds). `bar` is the index in the section's list of bars (0 is the first), `beat`
 * and `step` count from 0 inside the bar and the beat. The studio's review comments use the
 * same anchor.
 */
export interface Anchor {
  readonly section?: string;
  readonly bar?: number;
  readonly beat?: number;
  readonly step?: number;
  readonly channel?: string;
  readonly state?: string;
}

export interface Finding {
  readonly severity: Severity;
  /** The id of the rule, e.g. `steps`, `off-key`, `range`. The list is in docs/audio.md. */
  readonly rule: string;
  /** The place in the JSON file, e.g. `sections.A.lead[2]`. */
  readonly path: string;
  readonly message: string;
  readonly at?: Anchor;
}

/** One finding as a line of text. */
export function formatFinding(finding: Finding): string {
  return `${finding.severity} ${finding.rule}  ${finding.path === "" ? "(file)" : finding.path}: ${finding.message}`;
}

/** Thrown by `parseSong` and `parseSfx`: the data has errors. */
export class AudioDataError extends Error {
  readonly findings: readonly Finding[];

  constructor(what: string, findings: readonly Finding[]) {
    const errors = findings.filter((finding) => finding.severity === "error");
    super(`${what} has ${errors.length} error(s):\n${errors.map((finding) => `  ${formatFinding(finding)}`).join("\n")}`);
    this.name = "AudioDataError";
    this.findings = findings;
  }
}

/** Collects findings while a file is read. */
export class Report {
  readonly findings: Finding[] = [];

  error(rule: string, path: string, message: string, at?: Anchor): void {
    this.findings.push(at === undefined ? { severity: "error", rule, path, message } : { severity: "error", rule, path, message, at });
  }

  warning(rule: string, path: string, message: string, at?: Anchor): void {
    this.findings.push(at === undefined ? { severity: "warning", rule, path, message } : { severity: "warning", rule, path, message, at });
  }

  get errors(): number {
    let count = 0;
    for (const finding of this.findings) if (finding.severity === "error") count += 1;
    return count;
  }
}
