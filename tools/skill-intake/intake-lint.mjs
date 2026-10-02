// Lints of the skill intake records (security/skill-intake/) and of the scanner pin. They run in
// the gate (test/intake.test.mjs), so a registry entry cannot lose its evidence, a baseline
// cannot lose its reasons, and the scanner image cannot lose its pins unnoticed.
//
// No dependencies: the registry and the baselines are JSON on purpose (SkillSpector reads a
// JSON baseline as well as a YAML one).

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const VERDICTS = ["approved", "approved-with-exceptions", "ideas-only", "rejected"];
const ADOPTED = new Set(["approved", "approved-with-exceptions"]);

const SHA = /^[0-9a-f]{40}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const NAME = /^[a-z0-9][a-z0-9._-]*$/;
const DIGEST = /@sha256:[0-9a-f]{64}$/;

const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.trim() !== "";
const isCount = (value) => Number.isInteger(value) && value >= 0;

/**
 * Reads the scanner pin from tools/skill-intake/Dockerfile, the only place that holds it.
 * @param {string} dockerfile contents of the Dockerfile
 * @returns {{version: string | null, commit: string | null}}
 */
export function readPin(dockerfile) {
  const arg = (name) => new RegExp(`^ARG ${name}=(\\S+)$`, "m").exec(dockerfile)?.[1] ?? null;
  return { version: arg("SKILLSPECTOR_VERSION"), commit: arg("SKILLSPECTOR_COMMIT") };
}

/**
 * @param {string} dockerfile contents of the Dockerfile
 * @returns {string[]} problems; empty when the image is built from pinned inputs only
 */
export function lintDockerfile(dockerfile) {
  const errors = [];
  const pin = readPin(dockerfile);
  if (pin.version === null || !VERSION.test(pin.version)) {
    errors.push("ARG SKILLSPECTOR_VERSION must be a release version such as 2.12.0");
  }
  if (pin.commit === null || !SHA.test(pin.commit)) {
    errors.push("ARG SKILLSPECTOR_COMMIT must be a full 40-character commit SHA (a tag can move)");
  }

  const stages = new Set();
  const lines = dockerfile.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const from = /^FROM\s+(\S+)(?:\s+AS\s+(\S+))?\s*$/i.exec(line);
    if (from) {
      const [, image, stage] = from;
      if (!stages.has(image) && !DIGEST.test(image)) {
        errors.push(`line ${index + 1}: base image "${image}" must be pinned by digest (@sha256:...)`);
      }
      if (stage) stages.add(stage);
    }
    if (/\bpip3?\s+install\b/.test(line) && !/^\s*#/.test(line)) {
      errors.push(`line ${index + 1}: pip install resolves versions at build time; install from the lock with uv`);
    }
    if (/^ADD\s+https?:/i.test(line) && !/\.git#\$\{SKILLSPECTOR_COMMIT\}\s/.test(line)) {
      errors.push(`line ${index + 1}: a remote ADD must be the git source at #\${SKILLSPECTOR_COMMIT}`);
    }
  }
  if (!/^ADD\s+https:\/\/github\.com\/NVIDIA\/SkillSpector\.git#\$\{SKILLSPECTOR_COMMIT\}\s/m.test(dockerfile)) {
    errors.push("the source must come from https://github.com/NVIDIA/SkillSpector.git#${SKILLSPECTOR_COMMIT}");
  }
  if (!/\buv sync\b[^\n]*--frozen\b/.test(dockerfile)) {
    errors.push("dependencies must be installed with `uv sync --frozen` (upstream's uv.lock, hash-checked)");
  }
  return errors;
}

/**
 * Our baseline of accepted findings. Only tightly scoped rules pass: a rule names one rule id
 * and one path, and says why. Exact fingerprints are allowed with a reason.
 * @param {unknown} baseline parsed baseline.json
 * @param {{scannerVersion: string}} context
 * @returns {string[]} problems
 */
export function validateBaseline(baseline, { scannerVersion }) {
  if (!isObject(baseline)) return ["the baseline is not a JSON object"];
  const errors = [];
  if (baseline.version !== 2) errors.push('"version" must be 2 (the SkillSpector baseline format)');
  if (baseline.scanner_version !== scannerVersion) {
    errors.push(`"scanner_version" must be "${scannerVersion}", the scanner of the registry entry`);
  }
  const known = new Set(["version", "scanner_version", "rules", "fingerprints"]);
  for (const key of Object.keys(baseline)) if (!known.has(key)) errors.push(`unknown key "${key}"`);

  const rules = baseline.rules ?? [];
  if (!Array.isArray(rules)) errors.push('"rules" must be a list');
  else {
    for (const [index, rule] of rules.entries()) {
      const where = `rules[${index}]`;
      if (!isObject(rule)) {
        errors.push(`${where} is not an object`);
        continue;
      }
      if (!isText(rule.id) || /[*?[]/.test(rule.id)) {
        errors.push(`${where}: "id" must name one rule id, without a glob`);
      }
      if (!isText(rule.path) || /^[*?]+$/.test(rule.path)) {
        errors.push(`${where}: "path" must name the file; a rule for every file hides new findings`);
      }
      if (rule.message !== undefined && !isText(rule.message)) errors.push(`${where}: "message" must be text`);
      if (!isText(rule.reason)) errors.push(`${where}: "reason" is required: why is this finding accepted?`);
      for (const key of Object.keys(rule)) {
        if (!["id", "path", "message", "reason"].includes(key)) errors.push(`${where}: unknown key "${key}"`);
      }
    }
  }

  const fingerprints = baseline.fingerprints ?? [];
  if (!Array.isArray(fingerprints)) errors.push('"fingerprints" must be a list');
  else {
    for (const [index, fingerprint] of fingerprints.entries()) {
      const where = `fingerprints[${index}]`;
      if (!isObject(fingerprint)) {
        errors.push(`${where} is not an object`);
        continue;
      }
      if (!/^sha256:[0-9a-f]{64}$/.test(fingerprint.hash ?? "")) errors.push(`${where}: "hash" must be sha256:<64 hex>`);
      if (!isText(fingerprint.reason)) errors.push(`${where}: "reason" is required`);
    }
  }
  return errors;
}

function validateScan(scan, where, evidenceDir) {
  const errors = [];
  if (!isObject(scan)) return [`${where} is not an object`];
  if (!isText(scan.scope)) errors.push(`${where}: "scope" names the scanned folder ("." for the repo root)`);
  if (typeof scan.recursive !== "boolean") errors.push(`${where}: "recursive" must be true or false`);
  for (const key of ["findings", "critical", "high", "medium", "low", "score"]) {
    if (!isCount(scan[key])) errors.push(`${where}: "${key}" must be a count`);
  }
  if (errors.length === 0 && scan.findings !== scan.critical + scan.high + scan.medium + scan.low) {
    errors.push(`${where}: "findings" (${scan.findings}) is not critical + high + medium + low`);
  }
  if (isCount(scan.score) && scan.score > 100) errors.push(`${where}: "score" is at most 100`);
  if (!isText(scan.recommendation)) errors.push(`${where}: "recommendation" is the scanner's (e.g. DO_NOT_INSTALL)`);
  if (scan.exit !== 0 && scan.exit !== 1) errors.push(`${where}: "exit" must be 0 or 1 (2 is a failed scan)`);
  if (!isText(scan.report)) errors.push(`${where}: "report" names the Markdown report in the evidence folder`);
  else if (evidenceDir !== null && !existsSync(join(evidenceDir, scan.report))) {
    errors.push(`${where}: the report ${scan.report} is not in the evidence folder`);
  }
  return errors;
}

/**
 * @param {unknown} registry parsed registry.json
 * @param {object} context
 * @param {string} context.intakeDir the folder of registry.json (security/skill-intake)
 * @param {string} context.repoRoot
 * @param {{version: string | null, commit: string | null}} context.pin the scanner pin of the Dockerfile
 * @returns {string[]} problems; empty when the registry is sound
 */
export function validateRegistry(registry, { intakeDir, repoRoot, pin }) {
  if (!isObject(registry)) return ["the registry is not a JSON object"];
  const errors = [];
  if (registry.schema !== 1) errors.push('"schema" must be 1');
  if (!Array.isArray(registry.entries)) return [...errors, '"entries" must be a list'];

  const names = new Set();
  for (const [index, entry] of registry.entries.entries()) {
    if (!isObject(entry)) {
      errors.push(`entries[${index}] is not an object`);
      continue;
    }
    const where = isText(entry.name) ? entry.name : `entries[${index}]`;
    const problem = (message) => errors.push(`${where}: ${message}`);

    if (!isText(entry.name) || !NAME.test(entry.name)) problem('"name" must be lower-case letters, digits, ".", "_" or "-"');
    else if (names.has(entry.name)) problem("is listed twice: a new scan of the same source replaces its entry");
    else names.add(entry.name);

    if (!isText(entry.kind)) problem('"kind" says what the source is (a skill, a plugin, a reference repo)');
    if (!isText(entry.source) || !entry.source.startsWith("https://")) problem('"source" must be an https URL');
    if (!SHA.test(entry.commit ?? "")) problem('"commit" must be the full 40-character commit SHA');
    if (!SHA.test(entry.treeHash ?? "")) problem('"treeHash" must be the git tree hash of that commit (fetch.sh prints it)');
    if (!isText(entry.licence)) problem('"licence" is required, even if it only says that the licence is unclear');
    if (!DATE.test(entry.scanned ?? "")) problem('"scanned" must be a date, YYYY-MM-DD');
    if (!isText(entry.notes)) problem('"notes" is required: what the verdict means for this source');

    const scanner = isObject(entry.scanner) ? entry.scanner : {};
    if (scanner.name !== "SkillSpector") problem('"scanner.name" must be "SkillSpector"');
    if (!VERSION.test(scanner.version ?? "")) problem('"scanner.version" must be a release version');
    if (!SHA.test(scanner.commit ?? "")) problem('"scanner.commit" must be the full commit SHA of the scanner');

    if (!VERDICTS.includes(entry.verdict)) problem(`"verdict" must be one of: ${VERDICTS.join(", ")}`);

    // The evidence folder: <name>/<scan date>-<first 7 of the commit>/
    let evidenceDir = null;
    const expected = `${entry.name}/${entry.scanned}-${String(entry.commit).slice(0, 7)}`;
    if (entry.evidence !== expected) problem(`"evidence" must be "${expected}" (<name>/<scan date>-<sha7>)`);
    else if (!existsSync(join(intakeDir, expected)) || !statSync(join(intakeDir, expected)).isDirectory()) {
      problem(`the evidence folder ${expected} does not exist`);
    } else {
      evidenceDir = join(intakeDir, expected);
      if (!existsSync(join(evidenceDir, "TRIAGE.md"))) problem("the evidence folder has no TRIAGE.md");
      const baselineFile = join(evidenceDir, "baseline.json");
      if (!existsSync(baselineFile)) problem("the evidence folder has no baseline.json");
      else {
        let baseline;
        try {
          baseline = JSON.parse(readFileSync(baselineFile, "utf8"));
        } catch (error) {
          problem(`baseline.json is not JSON: ${error.message}`);
        }
        if (baseline !== undefined) {
          for (const message of validateBaseline(baseline, { scannerVersion: scanner.version })) {
            problem(`baseline.json: ${message}`);
          }
        }
      }
    }

    if (!Array.isArray(entry.scans) || entry.scans.length === 0) problem('"scans" must list at least one scan');
    else {
      for (const [scanIndex, scan] of entry.scans.entries()) {
        errors.push(...validateScan(scan, `${where}: scans[${scanIndex}]`, evidenceDir));
      }
    }

    // Approval and installation go together: nothing is installed without the owner's approval.
    const adopted = ADOPTED.has(entry.verdict);
    const approval = entry.approval;
    if (approval !== null) {
      if (!isObject(approval) || approval.by !== "owner" || !DATE.test(approval.date ?? "") || !isText(approval.ref)) {
        problem('"approval" must be null or {"by": "owner", "date": "YYYY-MM-DD", "ref": "<decision id or the owner\'s words>"}');
      }
    } else if (adopted) {
      problem(`verdict "${entry.verdict}" needs the owner's approval (D13, D17)`);
    }

    if (!Array.isArray(entry.installed)) problem('"installed" must be a list of repo paths (empty when nothing is installed)');
    else if (!adopted && entry.installed.length > 0) problem(`verdict "${entry.verdict}" installs nothing: "installed" must be empty`);
    else if (adopted && entry.installed.length === 0) problem('an approved entry lists what it installed in "installed"');
    else {
      for (const path of entry.installed) {
        if (!isText(path) || path.startsWith("/") || path.split("/").includes("..")) problem(`installed path ${JSON.stringify(path)} must be relative to the repo root`);
        else if (!existsSync(join(repoRoot, path))) problem(`installed path ${path} does not exist`);
      }
    }

    // Re-scan trigger "scanner upgrade": an installed skill must have been scanned by the
    // scanner that is pinned now. Entries that installed nothing are re-scanned before any copy.
    if (adopted && (scanner.version !== pin.version || scanner.commit !== pin.commit)) {
      problem(`is installed but was scanned with SkillSpector ${scanner.version}; the pin is ${pin.version}: re-scan it`);
    }
  }
  return errors;
}
