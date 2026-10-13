// One small district as ASCII, every level, checked in: a change to the generator shows here
// as a readable diff. The file is the output of
//   ./dev npm run -s city -- slice 7 --all --width 16 --depth 16 --levels 12
// and is rewritten by running this test with UPDATE_GOLDEN=1.

import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runCityCli } from "../src/node/index.ts";

const FILE = new URL("golden/district-7-16x16x12.txt", import.meta.url);
const ARGS = ["slice", "7", "--all", "--width", "16", "--depth", "16", "--levels", "12"];

describe("the ASCII of a small district", () => {
  it("matches the checked-in slices", () => {
    const lines: string[] = [];
    const code = runCityCli(ARGS, { out: (line) => lines.push(line), err: (line) => lines.push(`ERR ${line}`) });
    expect(code).toBe(0);
    const text = `${lines.join("\n")}\n`;
    if (process.env.UPDATE_GOLDEN === "1") writeFileSync(FILE, text);
    expect(text).toBe(readFileSync(FILE, "utf8"));
  });
});
