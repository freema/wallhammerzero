// The README shows real output: its example hash and its two slices are what the generator
// gives today.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkDistrict, generateDistrict, gridHash, sliceAscii } from "../src/index.ts";

const README = readFileSync(new URL("../README.md", import.meta.url), "utf8");

/** The fenced `text` blocks of the README, in order. */
function textBlocks(): string[] {
  return [...README.matchAll(/```text\n([\s\S]*?)\n```/g)].map((match) => match[1] as string);
}

describe("README", () => {
  const district = generateDistrict(2);

  it("states the example's grid hash", () => {
    expect(README).toContain(`gridHash(district);                                  // "${gridHash(district)}"`);
    expect(checkDistrict(district).ok).toBe(true);
  });

  it("shows the street level and a middle level of seed 2", () => {
    const [street, middle] = textBlocks();
    expect(street).toBe(sliceAscii(district, district.params.bands.streets[0]));
    expect(middle).toBe(sliceAscii(district, 6));
    expect(district.params.bands.middle[0] <= 6 && 6 <= district.params.bands.middle[1]).toBe(true);
  });
});
