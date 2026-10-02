// Replays and the Node runner. The golden replay is the acceptance test of the kernel: the
// same seed and commands must give the stored digests, here and on every later engine.

import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkReplay, createSim, hashSimData, parseReplay, recordReplay, runReplay, SimError } from "../src/index.ts";
import type { Command, Replay } from "../src/index.ts";
import { checkReplayFile, readReplayFile, writeReplayFile } from "../src/node/index.ts";
import { GOLDEN_DATA_FILE, GOLDEN_REPLAY_FILE, clone, goldenReplay, here, shopData } from "./helpers.ts";

const CLI = here("../src/node/cli.ts");
const scratch = mkdtempSync(join(tmpdir(), "whz-sim-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function cli(...args: string[]): { status: number | null; stdout: string; stderr: string } {
  const run = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", cwd: scratch });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

/** A copy of the golden replay and its data in the scratch folder, with a change applied. */
function scratchReplay(name: string, change: (replay: Record<string, unknown>) => void = () => {}): string {
  const file = join(scratch, `${name}.replay.json`);
  const replay = JSON.parse(readFileSync(GOLDEN_REPLAY_FILE, "utf8")) as Record<string, unknown>;
  change(replay);
  writeFileSync(file, JSON.stringify(replay));
  copyFileSync(GOLDEN_DATA_FILE, join(scratch, "counter-shop.data.json"));
  return file;
}

describe("the golden replay", () => {
  it("is a real session: commands of every type, one of them rejected, digests every 50 ticks", () => {
    const replay = readReplayFile(GOLDEN_REPLAY_FILE);
    expect(replay.simDataHash).toBe(hashSimData(shopData()));
    expect(replay.ticks).toBeGreaterThanOrEqual(500);
    expect(replay.digests).toHaveLength(replay.ticks / replay.digestEvery);
    expect(new Set(replay.digests).size).toBe(replay.digests.length);
    expect(new Set(replay.commands.map((command) => command.type))).toEqual(new Set(["shop.set-price", "shop.restock", "shop.set-open"]));

    const sim = createSim({ data: shopData(), seed: replay.seed });
    for (const command of replay.commands) expect(sim.submit(command).ok).toBe(true);
    const types = new Set(sim.step(replay.ticks).map((event) => event.type));
    for (const type of ["customer.arrived", "sale", "customer.left", "price.changed", "shelf.restocked", "door.changed", "command.rejected"]) {
      expect(types, type).toContain(type);
    }
    expect(sim.digestHex()).toBe(replay.finalDigest);
  });

  it("the same seed and commands give the stored digests", () => {
    const replay = goldenReplay();
    const check = checkReplay({ data: shopData(), replay });
    expect(check.mismatch).toBeNull();
    expect(check.ok).toBe(true);
    expect(check.digests).toEqual(replay.digests);
    expect(check.finalDigest).toBe(replay.finalDigest);
    expect(check.sim.tick).toBe(replay.ticks);
  });

  it("another seed or another command gives other digests, and the check says where", () => {
    const replay = goldenReplay();
    const reseeded = checkReplay({ data: shopData(), replay: { ...replay, seed: replay.seed + 1 } });
    expect(reseeded.ok).toBe(false);
    expect(reseeded.mismatch).toMatchObject({ afterTicks: replay.digestEvery, expected: replay.digests[0] });

    const late: Command = { tick: 310, type: "shop.set-price", payload: { item: "apple", price: 2 } };
    const changed = checkReplay({ data: shopData(), replay: { ...replay, commands: [...replay.commands, late] } });
    expect(changed.ok).toBe(false);
    // The first six digests (ticks 50 to 300) are from before the new command.
    expect(changed.digests.slice(0, 6)).toEqual(replay.digests.slice(0, 6));
    expect(changed.mismatch?.afterTicks).toBe(350);
  });

  it("a stored digest that is wrong, missing or extra is a mismatch", () => {
    const replay = goldenReplay();
    const data = shopData();
    const wrongFinal = checkReplay({ data, replay: { ...replay, finalDigest: "00000000" } });
    expect(wrongFinal.mismatch).toEqual({ afterTicks: replay.ticks, expected: "00000000", actual: replay.finalDigest });
    const missing = checkReplay({ data, replay: { ...replay, digests: replay.digests.slice(0, 3) } });
    expect(missing.mismatch).toEqual({ afterTicks: 4 * replay.digestEvery, expected: null, actual: replay.digests[3] });
    const extra = checkReplay({ data, replay: { ...replay, digests: [...replay.digests, "12345678"] } });
    expect(extra.mismatch).toEqual({ afterTicks: 13 * replay.digestEvery, expected: "12345678", actual: null });
  });

  it("is refused against other sim data: a replay names the data it was recorded with", () => {
    const data = shopData();
    (data.tables.items as { price: number }[])[0]!.price += 1;
    expect(() => runReplay({ data, replay: goldenReplay() })).toThrow(/it was recorded with sim data "[0-9a-f]{16}", and this sim data is/);
  });

  it("is refused if the sim refuses one of its commands", () => {
    const replay = goldenReplay();
    const commands = [...replay.commands, { tick: 5, type: "shop.fly", payload: {} }];
    expect(() => runReplay({ data: shopData(), replay: { ...replay, commands } })).toThrow(/command 9 was refused: unknown command type "shop.fly"/);
  });
});

describe("recording", () => {
  it("records the commands in the order they apply, with the digests they give", () => {
    const commands: Command[] = [
      { tick: 40, type: "shop.set-price", payload: { price: 2, item: "apple" } },
      { tick: 10, type: "shop.restock", payload: { item: "bread", amount: 3 } },
      { tick: 40, type: "shop.set-open", payload: { open: false } },
    ];
    const replay = recordReplay({ data: shopData(), seed: 77, commands, ticks: 95, digestEvery: 10 });
    expect(replay.commands.map((command) => [command.tick, command.type])).toEqual([
      [10, "shop.restock"],
      [40, "shop.set-price"],
      [40, "shop.set-open"],
    ]);
    expect(replay.digests).toHaveLength(9);
    expect(parseReplay(clone(replay))).toEqual(replay);
    expect(checkReplay({ data: shopData(), replay }).ok).toBe(true);
    // The recorded order is canonical: recording the recording changes nothing.
    expect(recordReplay({ data: shopData(), seed: 77, commands: replay.commands, ticks: 95, digestEvery: 10 })).toEqual(replay);
  });

  it("parseReplay refuses a file that is not a replay", () => {
    const good = goldenReplay() as unknown as Record<string, unknown>;
    const cases: [Record<string, unknown> | null, RegExp][] = [
      [null, /not an object/],
      [{ ...good, format: "save" }, /the format is not "whz-sim-replay"/],
      [{ ...good, version: 2 }, /version 2, and this sim reads version 1/],
      [{ ...good, simDataHash: "abc" }, /simDataHash must be 16 hex digits/],
      [{ ...good, seed: 1.5 }, /seed must be an unsigned 32-bit integer/],
      [{ ...good, ticks: -1 }, /ticks must be a non-negative integer/],
      [{ ...good, digestEvery: 0 }, /digestEvery must be a positive integer/],
      [{ ...good, digests: ["xyz"] }, /digests must be a list of digests/],
      [{ ...good, finalDigest: 7 }, /finalDigest must be 8 hex digits/],
      [{ ...good, commands: "none" }, /commands must be a list/],
    ];
    for (const [value, message] of cases) expect(() => parseReplay(value)).toThrow(message);
    for (const [value] of cases) expect(() => parseReplay(value)).toThrow(SimError);
  });
});

describe("the Node runner", () => {
  it("checkReplayFile finds the data file next to the replay", () => {
    const check = checkReplayFile(GOLDEN_REPLAY_FILE);
    expect(check.ok).toBe(true);
    expect(check.dataFile).toBe(GOLDEN_DATA_FILE);
    expect(checkReplayFile(GOLDEN_REPLAY_FILE, { heavy: true, data: GOLDEN_DATA_FILE }).ok).toBe(true);
  });

  it("writeReplayFile writes what readReplayFile reads", () => {
    const file = join(scratch, "round-trip.replay.json");
    const replay: Replay = { ...goldenReplay(), dataFile: "counter-shop.data.json" };
    writeReplayFile(file, replay);
    expect(readReplayFile(file)).toEqual(replay);
    // The golden file is in exactly this layout, so recording it again gives a small diff.
    expect(readFileSync(file, "utf8")).toBe(readFileSync(GOLDEN_REPLAY_FILE, "utf8"));
  });

  it("replay <file> exits 0 when the digests match, in normal and in heavy mode", () => {
    const normal = cli("replay", GOLDEN_REPLAY_FILE);
    expect(normal.stderr).toBe("");
    expect(normal.status).toBe(0);
    expect(normal.stdout).toMatch(/ok: 12 digests and the final digest [0-9a-f]{8} match/);
    const heavy = cli("replay", GOLDEN_REPLAY_FILE, "--heavy");
    expect(heavy.status).toBe(0);
    expect(heavy.stdout).toMatch(/heavy mode: save and load on every tick/);
    expect(heavy.stdout).toMatch(/ok: 12 digests/);
  });

  it("--describe prints the final state as text", () => {
    const run = cli("replay", GOLDEN_REPLAY_FILE, "--describe");
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/^sim tick 600 seed 20261002 data [0-9a-f]{16} digest [0-9a-f]{8}$/m);
    expect(run.stdout).toMatch(/^till: busy=\d+ money=\d+ sales=\d+ served=\d+$/m);
    expect(run.stdout).toMatch(/^shelf \(3 by key\): key price sold stock$/m);
  });

  it("exits 1 and names the tick when a digest does not match", () => {
    const file = scratchReplay("tampered", (replay) => void ((replay.digests as string[])[4] = "0badc0de"));
    const run = cli("replay", file);
    expect(run.status).toBe(1);
    expect(run.stdout).toMatch(/MISMATCH after 250 ticks: the replay stores 0badc0de, this run gives [0-9a-f]{8}/);
  });

  it("exits 1 when the replay cannot run: other data, a missing file, broken JSON", () => {
    const file = scratchReplay("other-data");
    const data = shopData();
    (data.tables.shop as { startMoney: number }).startMoney = 21;
    const dataFile = join(scratch, "other.data.json");
    writeFileSync(dataFile, JSON.stringify(data));
    const other = cli("replay", file, "--data", dataFile);
    expect(other.status).toBe(1);
    expect(other.stderr).toMatch(/sim: replay: it was recorded with sim data/);

    const missing = cli("replay", join(scratch, "nope.replay.json"));
    expect(missing.status).toBe(1);
    expect(missing.stderr).toMatch(/sim: cannot read the replay/);

    const broken = join(scratch, "broken.replay.json");
    writeFileSync(broken, "{ not json");
    expect(cli("replay", broken)).toMatchObject({ status: 1 });

    const noData = scratchReplay("no-data", (replay) => void delete replay.dataFile);
    const run = cli("replay", noData);
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/names no dataFile: pass the sim data with --data <file>/);
    expect(cli("replay", noData, "--data", GOLDEN_DATA_FILE).status).toBe(0);
  });

  it("exits 2 on wrong usage", () => {
    for (const args of [[], ["replay"], ["dance"], ["replay", "a", "b"], ["replay", GOLDEN_REPLAY_FILE, "--fast"]]) {
      const run = cli(...args);
      expect(run.status, args.join(" ")).toBe(2);
      expect(run.stdout + run.stderr).toMatch(/usage: sim replay <file>/);
    }
  });

  it("--record writes the digests of the run into the file, and the file then passes", () => {
    const file = scratchReplay("recorded", (replay) => {
      replay.seed = 5;
      delete replay.digests;
      delete replay.finalDigest;
      delete replay.simDataHash;
    });
    expect(cli("replay", file).status).toBe(1);
    const record = cli("replay", file, "--record");
    expect(record.status).toBe(0);
    expect(record.stdout).toMatch(/recorded .*recorded.replay.json: 600 ticks, 9 commands, 12 digests/);
    expect(cli("replay", file).status).toBe(0);
    expect(cli("replay", file, "--heavy").status).toBe(0);
    const recorded = readReplayFile(file);
    expect(recorded.seed).toBe(5);
    expect(recorded.dataFile).toBe("counter-shop.data.json");
    expect(recorded.finalDigest).not.toBe(goldenReplay().finalDigest);
  });
});
