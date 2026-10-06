// scan.sh and fetch.sh are host scripts; the gate runs in a container without Docker and without
// git. These tests run the real scan.sh against a stand-in `docker` on the PATH that records its
// arguments and plays the scanner, and check what a reader of the script cannot see at a glance:
// the scanner never gets a network, a host variable or a writable view of the scanned folder,
// and the exit code of the command is the scanner's.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { multiReport, singleReport } from "../fixtures/reports.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const scan = join(here, "..", "scan.sh");
const fetch = join(here, "..", "fetch.sh");

// The stand-in for `docker`. It handles what scan.sh and ./dev call:
//   image inspect  -> prints $STUB_RECIPE (the label of an existing image), or fails if unset
//   build          -> succeeds
//   volume         -> succeeds (./dev checks its npm cache volume)
//   compose ... dev <cmd>  -> runs <cmd> (./dev would run it in the dev container; we are in it)
//   run            -> the scanner: writes $STUB_REPORT (JSON run) or a stub file (Markdown run)
//                     where the host folder mounted at /out is, and exits $STUB_EXIT
const STUB = `#!/bin/sh
{
  printf 'docker'
  for arg in "$@"; do printf '\\t%s' "$arg"; done
  printf '\\n'
} >>"$STUB_LOG"
case "$1" in
  image)
    [ -n "\${STUB_RECIPE:-}" ] || exit 1
    echo "$STUB_RECIPE"
    ;;
  build) cat >/dev/null ;;
  volume) ;;
  compose)
    while [ $# -gt 0 ] && [ "$1" != dev ]; do shift; done
    shift
    exec "$@"
    ;;
  run)
    out='' output='' format='' previous=''
    for arg in "$@"; do
      case "$previous" in
        --volume) case "$arg" in *:/out) out=\${arg%:/out} ;; esac ;;
        --output) output=$arg ;;
        --format) format=$arg ;;
      esac
      previous=$arg
    done
    if [ "$format" = json ]; then
      [ ! -f "$STUB_REPORT" ] || cp "$STUB_REPORT" "$out/\${output#/out/}"
    else
      echo '# stub report' >"$out/\${output#/out/}"
    fi
    exit "\${STUB_EXIT:-0}"
    ;;
  *) exit 64 ;;
esac
`;

/** A scratch world: a folder to scan, a report folder, the stand-in docker and its log. */
function world(t, { report = singleReport() } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "whz-scan-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, "bin");
  const target = join(dir, "some-skill");
  const out = join(dir, "reports");
  mkdirSync(bin);
  mkdirSync(target);
  writeFileSync(join(target, "SKILL.md"), "# a skill\n");
  writeFileSync(join(bin, "docker"), STUB);
  chmodSync(join(bin, "docker"), 0o755);
  const reportFile = join(dir, "scanner-output.json");
  if (report !== null) writeFileSync(reportFile, JSON.stringify(report));
  const log = join(dir, "docker.log");
  writeFileSync(log, "");

  const run = (args, env = {}) => {
    const result = spawnSync("/bin/sh", [scan, ...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        STUB_LOG: log,
        STUB_REPORT: reportFile,
        ...env,
      },
    });
    const calls = readFileSync(log, "utf8")
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => line.split("\t").slice(1));
    return { ...result, calls, scans: calls.filter((call) => call[0] === "run") };
  };
  return { dir, target, out, run };
}

const valueAfter = (args, flag) => args.flatMap((arg, index) => (arg === flag ? [args[index + 1]] : []));

test("scan.sh: the scanner runs offline, static only, with a read-only view of the folder", (t) => {
  const { target, out, run } = world(t);
  const result = run(["--out", out, target]);
  assert.equal(result.status, 0, result.stderr);

  // One run per report format, both with the same isolation.
  assert.equal(result.scans.length, 2);
  for (const args of result.scans) {
    assert.deepEqual(valueAfter(args, "--network"), ["none"]);
    assert.ok(args.includes("--read-only"));
    assert.deepEqual(valueAfter(args, "--cap-drop"), ["ALL"]);
    assert.deepEqual(valueAfter(args, "--security-opt"), ["no-new-privileges"]);
    assert.deepEqual(valueAfter(args, "--volume"), [`${target}:/scan/some-skill:ro`, `${out}:/out`]);
    assert.ok(args.includes("--no-llm"));
    assert.ok(args.includes("--fail-on-incomplete"));
    assert.ok(!args.includes("--use-shipped-baseline"));
    assert.ok(!args.includes("--recursive"));
    assert.ok(!args.includes("--baseline"));
    const image = args.findIndex((arg) => arg.startsWith("whz-skillspector:"));
    assert.equal(args[image], "whz-skillspector:2.12.0-c7958a3");
    assert.deepEqual(args.slice(image + 1, image + 3), ["scan", "/scan/some-skill"]);
  }
  assert.deepEqual(result.scans.map((args) => valueAfter(args, "--format")[0]), ["json", "markdown"]);
  assert.deepEqual(result.scans.map((args) => valueAfter(args, "--output")[0]), ["/out/some-skill.json", "/out/some-skill.md"]);

  assert.ok(existsSync(join(out, "some-skill.json")));
  assert.ok(existsSync(join(out, "some-skill.md")));
  assert.match(result.stdout, /^findings: +0 \(CRITICAL 0, HIGH 0, MEDIUM 0, LOW 0\)$/m);
  assert.match(result.stdout, /^exit: +0 /m);
});

test("scan.sh: without --out, two folders with the same name get their own report folders", (t) => {
  // Two sources that both call their folder "some-skill" (every world() does), scanned one
  // after the other with the default report folder.
  const first = world(t, { report: singleReport() });
  const second = world(t, { report: multiReport() });
  const reportOf = (result) => /^reports: +(\S+\.json)$/m.exec(result.stdout)?.[1];
  const folders = [];
  t.after(() => folders.forEach((folder) => rmSync(folder, { recursive: true, force: true })));

  const a = first.run([first.target]);
  assert.equal(a.status, 0, a.stderr);
  const reportA = reportOf(a);
  folders.push(dirname(reportA));
  const b = second.run(["-r", second.target]);
  assert.equal(b.status, 0, b.stderr);
  const reportB = reportOf(b);
  folders.push(dirname(reportB));

  // Under .tools/skill-intake/reports/ of this checkout, named after the folder and its path.
  const reports = join(here, "..", "..", "..", ".tools", "skill-intake", "reports");
  for (const report of [reportA, reportB]) {
    assert.equal(dirname(dirname(report)), reports);
    assert.match(report, /\/some-skill-\d+\/some-skill\.json$/);
  }
  assert.notEqual(dirname(reportA), dirname(reportB), "two sources share one report folder");
  // The second scan did not overwrite the first report.
  assert.deepEqual(JSON.parse(readFileSync(reportA, "utf8")), singleReport());
  assert.deepEqual(JSON.parse(readFileSync(reportB, "utf8")), multiReport());
  assert.ok(existsSync(reportA.replace(/\.json$/, ".md")));

  // The same source again goes to the same folder, and --name names the files, not the source.
  assert.equal(reportOf(first.run([first.target])), reportA);
  const named = first.run(["--name", "intake", first.target]);
  assert.equal(named.status, 0, named.stderr);
  assert.equal(reportOf(named), join(dirname(reportA), "intake.json").replace(/some-skill-(\d+)/, "intake-$1"));
  folders.push(dirname(reportOf(named)));
});

test("scan.sh: no variable of the host reaches the scanner, so no API key can", (t) => {
  const { target, out, run } = world(t);
  const result = run(["--out", out, target], {
    OPENAI_API_KEY: "whz-canary-1",
    ANTHROPIC_API_KEY: "whz-canary-2",
    NVIDIA_INFERENCE_KEY: "whz-canary-3",
    SKILLSPECTOR_PROVIDER: "openai",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.scans.length, 2);
  for (const args of result.scans) {
    // The one variable is a literal. `--env NAME` without a value would forward the host's.
    assert.deepEqual(valueAfter(args, "--env"), ["HOME=/tmp"]);
    for (const arg of args) {
      assert.ok(!/^(-e|--env-file)$/.test(arg) && !arg.startsWith("--env="), `unexpected ${arg}`);
      assert.ok(!/canary|API_KEY|INFERENCE_KEY|SKILLSPECTOR_PROVIDER/.test(arg), `unexpected ${arg}`);
    }
  }
});

test("scan.sh: the exit code is the scanner's: 1 for a risky or incomplete scan", (t) => {
  const { target, out, run } = world(t, { report: multiReport() });
  const result = run(["-r", "--out", out, target], { STUB_EXIT: "1" });
  assert.equal(result.status, 1, result.stderr);
  assert.ok(result.scans.every((args) => args.includes("--recursive")));
  assert.match(result.stdout, /^findings: +3 \(CRITICAL 0, HIGH 2, MEDIUM 1, LOW 0\)$/m);
  assert.match(result.stdout, /^exit: +1 /m);
});

test("scan.sh: a scanner error, a crash or a missing report is exit 2, never a clean result", (t) => {
  const failed = world(t);
  assert.equal(failed.run(["--out", failed.out, failed.target], { STUB_EXIT: "2" }).status, 2);

  const killed = world(t);
  const result = killed.run(["--out", killed.out, killed.target], { STUB_EXIT: "137" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /the scanner failed \(exit 137\)/);

  const silent = world(t, { report: null });
  const noReport = silent.run(["--out", silent.out, silent.target]);
  assert.equal(noReport.status, 2);
  assert.match(noReport.stderr, /wrote no JSON report/);

  const garbage = world(t, { report: { not: "a report" } });
  assert.equal(garbage.run(["--out", garbage.out, garbage.target]).status, 2);
});

test("scan.sh: a report that says the LLM stage ran is refused", (t) => {
  const { target, out, run } = world(t, { report: singleReport({ llm: { llm_requested: true } }) });
  const result = run(["--out", out, target]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /static only/);
});

test("scan.sh: a stale report of an earlier run never stands in for a failed scan", (t) => {
  const { target, out, run } = world(t);
  assert.equal(run(["--out", out, target]).status, 0);
  const result = run(["--out", out, target], { STUB_REPORT: "/nonexistent" });
  assert.equal(result.status, 2);
  assert.ok(!existsSync(join(out, "some-skill.json")));
});

test("scan.sh: our baseline is mounted read-only; one inside the scanned folder is refused", (t) => {
  const { dir, target, out, run } = world(t);
  const baseline = join(dir, "baseline.json");
  writeFileSync(baseline, "{}");
  const result = run(["--out", out, "--baseline", baseline, target]);
  assert.equal(result.status, 0, result.stderr);
  for (const args of result.scans) {
    assert.ok(valueAfter(args, "--volume").includes(`${baseline}:/baseline/baseline.json:ro`));
    assert.deepEqual(valueAfter(args, "--baseline"), ["/baseline/baseline.json"]);
    assert.ok(args.includes("--show-suppressed"));
  }

  const shipped = join(target, ".skillspector-baseline.json");
  writeFileSync(shipped, "{}");
  const refused = run(["--out", out, "--baseline", shipped, target]);
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /inside the scanned folder/);
  assert.equal(refused.scans.length, result.scans.length, "no scanner run for the refused baseline");
});

test("scan.sh: the image is built when it is missing or was built from another Dockerfile", (t) => {
  const { target, out, run } = world(t);
  const first = run(["--out", out, target]);
  assert.equal(first.status, 0, first.stderr);
  const builds = first.calls.filter((call) => call[0] === "build");
  assert.equal(builds.length, 1);
  assert.deepEqual(valueAfter(builds[0], "--tag"), ["whz-skillspector:2.12.0-c7958a3"]);
  const recipe = valueAfter(builds[0], "--label")[0].replace("whz.skillspector.recipe=", "");
  assert.match(recipe, /^\d+$/);

  const second = run(["--out", out, target], { STUB_RECIPE: recipe });
  assert.equal(second.status, 0, second.stderr);
  assert.equal(second.calls.filter((call) => call[0] === "build").length, 1, "an up-to-date image is reused");

  const third = run(["--out", out, target], { STUB_RECIPE: "1" });
  assert.equal(third.calls.filter((call) => call[0] === "build").length, 2, "a stale image is rebuilt");
});

test("scan.sh: usage errors are exit 2 and run nothing", (t) => {
  const { dir, target, out, run } = world(t);
  const cases = [
    [[], /tools\/skill-intake\/scan\.sh \[options\] <folder>/],
    [[join(dir, "missing")], /is not a folder/],
    [["--frobnicate", target], /unknown option/],
    [["--out"], /--out needs a value/],
    [[target, target], /one folder at a time/],
    [["--out", join(target, "reports"), target], /inside the scanned folder/],
    [["--name", "a b", "--out", out, target], /report name/],
    [["--baseline", join(dir, "missing.json"), "--out", out, target], /is not a file/],
  ];
  for (const [args, message] of cases) {
    const result = run(args);
    assert.equal(result.status, 2, `scan.sh ${args.join(" ")}`);
    assert.match(result.stderr, message);
    assert.equal(result.scans.length, 0);
  }
  assert.equal(run(["--help"]).status, 0);
});

test("fetch.sh: only an https URL and a full commit SHA are accepted", () => {
  const run = (...args) => spawnSync("/bin/sh", [fetch, ...args], { encoding: "utf8" });
  const sha = "4e64b83b5fe400b34ad3a484d9b4a6090b26d512";
  const cases = [
    [[], /fetch\.sh <https git URL> <40-hex commit SHA>/],
    [["git@github.com:a/b.git", sha], /must start with https:\/\//],
    [["http://example.org/a.git", sha], /must start with https:\/\//],
    [["https://example.org/a.git", "main"], /full 40-character/],
    [["https://example.org/a.git", sha.slice(0, 7)], /full 40-character/],
    [["https://example.org/a.git", sha.toUpperCase()], /full 40-character/],
    [["https://example.org/a.git", sha, "../escape"], /the name must be/],
    [["https://example.org/a.git", sha, "name", "extra"], /fetch\.sh <https git URL>/],
  ];
  for (const [args, message] of cases) {
    const result = run(...args);
    assert.equal(result.status, 2, `fetch.sh ${args.join(" ")}`);
    assert.match(result.stderr, message);
  }
  assert.equal(run("--help").status, 0);
});
