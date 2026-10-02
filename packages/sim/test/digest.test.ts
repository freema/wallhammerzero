// The digest: FNV-1a 32 over a canonical binary encoding. The encoding is rebuilt here the
// slow, obvious way (DataView and BigInt) from the documented layout, so a port has a second
// description of it and a change of layout fails a test.

import { fnv1a32 } from "@whz/det";
import { describe, expect, it } from "vitest";
import { createSim, ENCODING_VERSION, field, hex32, stateMap, stateOne } from "../src/index.ts";
import type { Command, Row, Sim, SystemDef } from "../src/index.ts";
import { ByteWriter } from "../src/bytes.ts";
import { LAB_SYSTEMS, labData } from "./helpers.ts";

const cmd = (tick: number, type: string, payload: Command["payload"]): Command => ({ tick, type, payload });

/** The reference encoder: a list of byte arrays, joined at the end. */
class Reference {
  private readonly parts: Uint8Array[] = [];

  private view(size: number, write: (view: DataView) => void): this {
    const bytes = new Uint8Array(size);
    write(new DataView(bytes.buffer));
    this.parts.push(bytes);
    return this;
  }

  u8 = (value: number): this => this.view(1, (view) => view.setUint8(0, value));
  u16 = (value: number): this => this.view(2, (view) => view.setUint16(0, value, true));
  u32 = (value: number): this => this.view(4, (view) => view.setUint32(0, value, true));
  i32 = (value: number): this => this.view(4, (view) => view.setInt32(0, value, true));
  i64 = (value: number): this => this.view(8, (view) => view.setBigInt64(0, BigInt(value), true));
  str = (text: string): this => {
    this.u16(text.length);
    this.parts.push(new TextEncoder().encode(text));
    return this;
  };

  bytes(): Uint8Array {
    const out = new Uint8Array(this.parts.reduce((sum, part) => sum + part.length, 0));
    let at = 0;
    for (const part of this.parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  }
}

/** The lab sim's state, encoded from the layout in docs/sim.md. */
function referenceEncoding(sim: Sim, nextId: number): Uint8Array {
  const out = new Reference();
  out.u8(0x57).u8(0x48).u8(0x5a).u8(0x53); // "WHZS"
  out.u16(ENCODING_VERSION).i64(sim.tick).i64(nextId).u16(1);
  // The one system: its name, its four rng words, its tables by ascending name.
  out.str("lab");
  for (const word of sim.rngState("lab")) out.u32(word);
  out.u16(3);
  const bins = sim.read("bins");
  out.str("bins").u8(2).u32(bins.length);
  for (const row of bins) out.str(row.key as string).i32(row.amount as number);
  const things = sim.read("things");
  out.str("things").u8(1).u32(things.length);
  for (const row of things) out.i64(row.id as number).str(row.kind as string).i32(row.size as number);
  const totals = sim.read("totals")[0] as Row;
  out.str("totals").u8(0).u32(1);
  // Fields by ascending name: big (64 bits: its bounds leave 32), flag, label, small.
  out.i64(totals.big as number).u8(totals.flag === true ? 1 : 0).str(totals.label as string).i32(totals.small as number);
  return out.bytes();
}

function busyLab(): Sim {
  const sim = createSim({ data: labData(), seed: 31337, systems: LAB_SYSTEMS });
  sim.submit(cmd(0, "lab.make", { kind: "axle" }));
  sim.submit(cmd(0, "lab.make", { kind: "cog" }));
  sim.submit(cmd(1, "lab.fill", { amount: 7, bin: "ore" }));
  sim.submit(cmd(1, "lab.fill", { amount: 9, bin: "coal" }));
  sim.submit(cmd(2, "lab.add", { amount: -70000 }));
  sim.submit(cmd(2, "lab.scrap", { thing: 1 }));
  sim.submit(cmd(3, "lab.make", { kind: "cog" }));
  sim.step(4);
  return sim;
}

describe("the byte writer", () => {
  it("writes little-endian integers like DataView does", () => {
    const values64 = [0, 1, -1, 255, -256, 4294967295, 4294967296, -4294967296, -4294967297, 2 ** 53 - 1, -(2 ** 53 - 1), 1234567890123];
    const ours = new ByteWriter();
    const theirs = new Reference();
    for (const value of values64) {
      ours.i64(value);
      theirs.i64(value);
    }
    for (const value of [0, 1, -1, 2147483647, -2147483648, 65536]) {
      ours.i32(value);
      theirs.i32(value);
    }
    ours.u8(200).u16(51234).u32(4000000000).str("shop.set-price").str("");
    theirs.u8(200).u16(51234).u32(4000000000).str("shop.set-price").str("");
    expect(ours.finish()).toEqual(theirs.bytes());
    expect(ours.length).toBe(theirs.bytes().length);
  });

  it("throws on what does not fit, instead of writing a truncated value", () => {
    const writer = new ByteWriter();
    expect(() => writer.i32(0.5)).toThrow(/not a signed 32-bit integer/);
    expect(() => writer.i32(2147483648)).toThrow(/not a signed 32-bit integer/);
    expect(() => writer.i64(2 ** 53)).toThrow(/not a safe integer/);
    expect(() => writer.i64(Number.NaN)).toThrow(/not a safe integer/);
    expect(() => writer.u8(256)).toThrow();
    expect(() => writer.u16(-1)).toThrow();
    expect(() => writer.u32(4294967296)).toThrow();
    expect(() => writer.str("č")).toThrow(/not ASCII/);
    expect(writer.length).toBe(2); // only the length of the refused string
  });

  it("grows past its first buffer", () => {
    const writer = new ByteWriter();
    for (let i = 0; i < 1000; i += 1) writer.u32(i);
    const bytes = writer.finish();
    expect(bytes.length).toBe(4000);
    expect(new DataView(bytes.buffer).getUint32(3996, true)).toBe(999);
  });
});

describe("the state encoding", () => {
  it("is the documented layout, byte for byte", () => {
    const sim = busyLab();
    expect(sim.read("things").map((row) => row.id)).toEqual([2, 3]);
    expect(sim.read("totals")[0]).toMatchObject({ small: -69995, big: -70000 * 4294967296 });
    expect(sim.encodeState()).toEqual(referenceEncoding(sim, 4));
  });

  it("the digest is FNV-1a 32 of the encoding, never of text", () => {
    const sim = busyLab();
    expect(sim.digest()).toBe(fnv1a32(referenceEncoding(sim, 4)));
    expect(sim.digestHex()).toBe(hex32(sim.digest()));
    expect(sim.digestHex()).toMatch(/^[0-9a-f]{8}$/);
    expect(hex32(0)).toBe("00000000");
    expect(hex32(0xdeadbeef)).toBe("deadbeef");
  });

  it("the same seed and commands give the same digest; another seed or command does not", () => {
    expect(busyLab().digest()).toBe(busyLab().digest());
    const other = busyLab();
    other.submit(cmd(4, "lab.add", { amount: 1 }));
    other.step();
    const same = busyLab();
    same.step();
    expect(other.digest()).not.toBe(same.digest());
  });

  it("every part of the state is in it: the tick, the ids given out, the streams, each field", () => {
    const base = busyLab();
    const variants: Sim[] = [];
    const next = (change: (sim: Sim) => void): void => {
      const sim = busyLab();
      change(sim);
      variants.push(sim);
    };
    next((sim) => sim.step()); // the tick (and the flag)
    next((sim) => void [sim.submit(cmd(4, "lab.fill", { amount: 1, bin: "ore" })), sim.step()]);
    next((sim) => void [sim.submit(cmd(4, "lab.fill", { amount: 1, bin: "tin" })), sim.step()]);
    next((sim) => void [sim.submit(cmd(4, "lab.add", { amount: 1 })), sim.step()]);
    const digests = new Set([base, ...variants].map((sim) => sim.digestHex()));
    expect(digests.size).toBe(variants.length + 1);

    // An entity that came and went leaves only the id counter behind: that is state too.
    const plain = busyLab();
    plain.step(2);
    const churned = busyLab();
    churned.submit(cmd(4, "lab.make", { kind: "cog" }));
    churned.submit(cmd(5, "lab.scrap", { thing: 4 }));
    churned.step(2);
    expect(churned.read("things")).toEqual(plain.read("things"));
    expect(churned.digest()).not.toBe(plain.digest());
  });

  it("does not depend on the order fields are declared in or rows are added in", () => {
    const build = (reversed: boolean): Sim => {
      const fieldsA = { apple: field.i32, zebra: field.bool };
      const fieldsB = { zebra: field.bool, apple: field.i32 };
      const one = stateOne("one", reversed ? fieldsB : fieldsA);
      const map = stateMap("map", { n: field.count });
      const keys = reversed ? ["c", "a", "b"] : ["a", "b", "c"];
      const system: SystemDef = {
        name: "order",
        // The table order in the declaration does not matter either.
        state: reversed ? [map, one] : [one, map],
        init(ctx) {
          for (const key of keys) ctx.put(map, key, { n: key.charCodeAt(0) });
          ctx.one(one).apple = 12;
        },
      };
      return createSim({ data: { systems: ["order"], tables: {} }, seed: 5, systems: [system] });
    };
    expect(build(true).encodeState()).toEqual(build(false).encodeState());
  });

  it("gives one digest per system, so a difference can be traced to a system", () => {
    const data = labData();
    data.systems = ["lab", "noise"];
    data.tables.noise = [{ id: "a", rolls: 1 }];
    const a = createSim({ data, seed: 1, systems: LAB_SYSTEMS });
    const b = createSim({ data, seed: 1, systems: LAB_SYSTEMS });
    a.submit(cmd(0, "lab.add", { amount: 1 }));
    a.step(3);
    b.step(3);
    const [labA, noiseA] = a.digestParts();
    const [labB, noiseB] = b.digestParts();
    expect([labA?.system, noiseA?.system]).toEqual(["lab", "noise"]);
    expect(labA?.digest).not.toBe(labB?.digest);
    expect(noiseA?.digest).toBe(noiseB?.digest);
  });
});
