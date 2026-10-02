// File-watch probe, container half. Start it with tools/dev-env/watch-probe.sh on the host.
//
// Question: when a process on the HOST (Claude Code, an editor) writes files into the
// bind-mounted repo, does a watcher in the container hear about it, how fast, and does it
// miss anything in a burst?
//
// How it measures without comparing two clocks: this script asks for each write by renaming a
// command file into place (the rename returns once the host has it). The host half spins on
// that file and writes at once. Latency is the time from the rename returning to the watch
// event arriving, all on the container's monotonic clock. It includes the host's reaction
// time (well under a millisecond for one file) and, for bursts, the time the host needs to
// write the files, so the numbers are upper bounds.

import { mkdirSync, readdirSync, renameSync, rmSync, statSync, watch, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const positional = args.filter((arg) => !arg.startsWith("--"));
const probeDir = positional[0] ?? "/work/.tools/watch-probe";
const SINGLE_ROUNDS = Number(process.env.WATCH_PROBE_ROUNDS ?? 20);
const BURST_FILES = Number(process.env.WATCH_PROBE_BURST ?? 100);
const BURST_REPEATS = Number(process.env.WATCH_PROBE_REPEATS ?? 3);
const SINGLE_TIMEOUT_MS = 3000;
const BURST_QUIET_MS = 5000;
const BURST_MAX_MS = 30000;

const cmdDir = join(probeDir, "cmd");
const filesDir = join(probeDir, "files");
mkdirSync(cmdDir, { recursive: true });
mkdirSync(filesDir, { recursive: true });

// --- the watcher under test: fs.watch (inotify on Linux), recursive, as chokidar 5 uses it ---

/** @type {Map<string, number> | null} first arrival time per watched path, for the current round */
let arrivals = null;
let rawEvents = 0;
let onArrival = () => {};
const watcher = watch(probeDir, { recursive: true }, (_type, filename) => {
  if (arrivals === null || filename === null) return;
  const now = performance.now();
  rawEvents += 1;
  const path = filename.split("\\").join("/");
  if (!arrivals.has(path)) {
    arrivals.set(path, now);
    onArrival();
  }
});

let commandNumber = 0;
/** Sends one command to the host half and returns the time the host could first see it. */
function send(op, count, name) {
  commandNumber += 1;
  const tmp = join(cmdDir, `.tmp-${commandNumber}`);
  writeFileSync(tmp, `${op} ${count} ${name}\n`);
  renameSync(tmp, join(cmdDir, String(commandNumber)));
  return performance.now();
}

/**
 * One round: ask the host for `count` writes and wait for an event on each expected path.
 * `tempOnly` counts missed paths for which an event did arrive, but only under the temporary
 * name the host wrote before renaming it into place.
 * @returns {Promise<{latencies: number[], missed: string[], tempOnly: number, rawEvents: number}>}
 */
async function round(op, count, name, expected, quietMs, maxMs) {
  arrivals = new Map();
  rawEvents = 0;
  const wanted = new Set(expected);
  let seen = 0;
  let last = performance.now();
  const done = new Promise((resolve) => {
    onArrival = () => {
      last = performance.now();
      seen = 0;
      for (const path of wanted) if (arrivals.has(path)) seen += 1;
      if (seen === wanted.size) resolve();
    };
  });
  const start = send(op, count, name);
  last = start;
  const timeout = (async () => {
    for (;;) {
      await sleep(50);
      const now = performance.now();
      if (now - last > quietMs || now - start > maxMs) return;
    }
  })();
  await Promise.race([done, timeout]);
  onArrival = () => {};
  const latencies = [];
  const missed = [];
  let tempOnly = 0;
  for (const path of wanted) {
    if (arrivals.has(path)) latencies.push(arrivals.get(path) - start);
    else {
      missed.push(path);
      if (arrivals.has(path.replace(/^files\//, "files/.tmp-"))) tempOnly += 1;
    }
  }
  const result = { latencies, missed, tempOnly, rawEvents };
  arrivals = null;
  return result;
}

function stats(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const round1 = (v) => Math.round(v * 10) / 10;
  return { min: round1(sorted[0]), median: round1(at(0.5)), p95: round1(at(0.95)), max: round1(sorted.at(-1)) };
}

const singleExpect = {
  create: (name) => [`files/${name}-0`],
  modify: (name) => [`files/${name}-0`],
  rename: (name) => [`files/${name}-0`],
  mkdir: (name) => [`files/${name}-0.d/file`],
};

async function singles(op, label) {
  const latencies = [];
  let missed = 0;
  let tempOnly = 0;
  for (let i = 0; i < SINGLE_ROUNDS; i += 1) {
    const result = await round(op, 1, `s${i}`, singleExpect[op](`s${i}`), SINGLE_TIMEOUT_MS, SINGLE_TIMEOUT_MS);
    latencies.push(...result.latencies);
    missed += result.missed.length;
    tempOnly += result.tempOnly;
    await sleep(60);
  }
  return { phase: label, writes: SINGLE_ROUNDS, received: latencies.length, missed, tempOnly, latencyMs: stats(latencies) };
}

async function bursts(op, label) {
  const runs = [];
  for (let repeat = 0; repeat < BURST_REPEATS; repeat += 1) {
    const name = `b${repeat}`;
    const expected = [];
    for (let i = 0; i < BURST_FILES; i += 1) {
      expected.push(op === "mkdir" ? `files/${name}-${i}.d/file` : `files/${name}-${i}`);
    }
    const result = await round(op, BURST_FILES, name, expected, BURST_QUIET_MS, BURST_MAX_MS);
    const onDisk = expected.filter((path) => {
      try {
        statSync(join(probeDir, path));
        return true;
      } catch {
        return false;
      }
    }).length;
    runs.push({
      files: BURST_FILES,
      onDisk,
      received: result.latencies.length,
      missed: result.missed.length,
      tempOnly: result.tempOnly,
      rawEvents: result.rawEvents,
      latencyMs: stats(result.latencies),
    });
    await sleep(300);
  }
  return { phase: label, runs };
}

// --- the polling fallback: how soon does a stat() in the container see a host write? ---

async function pollVisibility(op, label) {
  const latencies = [];
  let missed = 0;
  for (let i = 0; i < SINGLE_ROUNDS; i += 1) {
    const file = join(filesDir, `s${i}-0`);
    const before = statSync(file, { bigint: true }).mtimeNs;
    const start = send(op, 1, `s${i}`);
    let seen = null;
    while (performance.now() - start < SINGLE_TIMEOUT_MS) {
      try {
        if (statSync(file, { bigint: true }).mtimeNs !== before) {
          seen = performance.now();
          break;
        }
      } catch (error) {
        if (error.code !== "ENOENT") throw error; // between the two halves of a replace
      }
      await sleep(1);
    }
    if (seen === null) missed += 1;
    else latencies.push(seen - start);
    await sleep(60);
  }
  return { phase: label, writes: SINGLE_ROUNDS, received: latencies.length, missed, latencyMs: stats(latencies) };
}

function scanCost() {
  const times = [];
  let entries = 0;
  for (let i = 0; i < 5; i += 1) {
    const start = performance.now();
    entries = 0;
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        entries += 1;
        if (entry.isDirectory()) walk(path);
        else statSync(path);
      }
    };
    walk(filesDir);
    times.push(performance.now() - start);
  }
  const best = Math.min(...times);
  return { entries, scanMs: Math.round(best * 10) / 10, perEntryMs: Math.round((best / entries) * 1000) / 1000 };
}

// --- run ---

const report = { node: process.version, platform: `${process.platform}/${process.arch}`, date: new Date().toISOString(), singles: [], bursts: [], polls: [] };
await sleep(300); // let the watcher settle

report.singles.push(await singles("create", "single: create a file"));
report.singles.push(await singles("modify", "single: append to a file"));
report.singles.push(await singles("rename", "single: replace a file (write temp + rename)"));
report.singles.push(await singles("mkdir", "single: new folder with a file in it"));
report.bursts.push(await bursts("create", `burst: create ${BURST_FILES} files`));
report.bursts.push(await bursts("modify", `burst: append to ${BURST_FILES} files`));
report.bursts.push(await bursts("rename", `burst: replace ${BURST_FILES} files`));
report.bursts.push(await bursts("mkdir", `burst: ${BURST_FILES} new folders with a file in each`));
report.polls.push(await pollVisibility("modify", "poll: stat sees an appended file"));
report.polls.push(await pollVisibility("rename", "poll: stat sees a replaced file"));
report.scan = scanCost();

send("quit", 0, "-");
watcher.close();
rmSync(probeDir, { recursive: true, force: true });

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const ms = (s) => (s === null ? "n/a" : `${s.min} / ${s.median} / ${s.p95} / ${s.max}`);
  console.log(`file-watch probe: host writes -> bind mount -> fs.watch in the container (${report.node}, ${report.platform})`);
  console.log(`latency columns are min / median / p95 / max in ms\n`);
  const temp = (row) => (row.tempOnly > 0 ? ` (${row.tempOnly} of them got an event for the temp name only)` : "");
  for (const row of [...report.singles, ...report.polls]) {
    console.log(`${row.phase}: ${row.received}/${row.writes} seen, ${row.missed} missed${temp(row)}, latency ${ms(row.latencyMs)}`);
  }
  for (const burst of report.bursts) {
    burst.runs.forEach((run, index) => {
      console.log(
        `${burst.phase}, run ${index + 1}: ${run.received}/${run.files} seen, ${run.missed} missed${temp(run)} ` +
          `(${run.onDisk} on disk, ${run.rawEvents} raw events), latency ${ms(run.latencyMs)}`,
      );
    });
  }
  console.log(`\npolling scan of ${report.scan.entries} entries on the bind mount: ${report.scan.scanMs} ms (${report.scan.perEntryMs} ms per entry)`);
}

const lost =
  [...report.singles, ...report.polls].reduce((sum, row) => sum + row.missed, 0) +
  report.bursts.reduce((sum, burst) => sum + burst.runs.reduce((s, run) => s + run.missed, 0), 0);
process.exitCode = lost === 0 ? 0 : 3;
