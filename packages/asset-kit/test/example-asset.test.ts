// Golden test of the example asset, assets/examples/blinking-dot.
//
// The hashes below are the stored output hashes of its variant seeds. They change only when
// the asset, the kit or the determinism kit changes what is drawn; then look at the new frames
// (the text dumps below, or the review sheet) before updating them.

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import blinkingDot from "../../../assets/examples/blinking-dot/gen.ts";
import { outputHash, renderAll, renderHash } from "../src/index.ts";
import type { AnyAsset } from "../src/index.ts";
import { loadAsset } from "../src/node/index.ts";

const GOLDEN: Record<number, string> = {
  1: "ff98ad430bb70a8f",
  2: "98e464e59024775b",
  5: "2b7d30fc34ab0333",
};

describe("assets/examples/blinking-dot", () => {
  it("has the meta the note asks for: a 2-frame clip, one param, three variant seeds", () => {
    expect(blinkingDot.meta).toEqual({
      id: "examples/blinking-dot",
      kind: "sprite",
      size: [12, 12],
      paletteId: "example",
      clips: [{ name: "blink", frames: 2, durations: [600, 200], loop: true }],
      facings: ["default"],
      pivot: [6, 6],
    });
    expect(Object.keys(blinkingDot.params)).toEqual(["diameter"]);
    expect(blinkingDot.variantSeeds).toEqual([1, 2, 5]);
    expect(blinkingDot.variantSeeds.map(Number)).toEqual(Object.keys(GOLDEN).map(Number));
  });

  it("its id is its folder under assets/", () => {
    const folder = fileURLToPath(new URL(`../../../assets/${blinkingDot.meta.id}/`, import.meta.url));
    expect(readdirSync(folder)).toContain("gen.ts");
  });

  it("golden: every variant seed gives its stored output hash", () => {
    for (const seed of blinkingDot.variantSeeds) {
      expect(outputHash(renderAll(blinkingDot, { seed })), `seed ${seed}`).toBe(GOLDEN[seed]);
    }
  });

  it("rendering twice gives identical bytes", () => {
    for (const seed of [...blinkingDot.variantSeeds, ...blinkingDot.reviewSeeds]) {
      const first = renderAll(blinkingDot, { seed });
      const second = renderAll(blinkingDot, { seed });
      expect(first.frames.length).toBe(2);
      first.frames.forEach((frame, i) => {
        const again = second.frames[i]?.buffer;
        expect(again).not.toBe(frame.buffer);
        expect(Buffer.from(frame.buffer.data).equals(Buffer.from(again?.data ?? []))).toBe(true);
      });
      expect(outputHash(first)).toBe(outputHash(second));
    }
  });

  it("the frames do not depend on the order they are rendered in", () => {
    const lit = blinkingDot.render({ seed: 5, clip: "blink", frame: 0 });
    const dimFirst = blinkingDot.render({ seed: 5, clip: "blink", frame: 1 });
    blinkingDot.render({ seed: 2, clip: "blink", frame: 0, preset: "big" });
    expect(blinkingDot.render({ seed: 5, clip: "blink", frame: 0 }).equals(lit)).toBe(true);
    expect(blinkingDot.render({ seed: 5, clip: "blink", frame: 1 }).equals(dimFirst)).toBe(true);
  });

  it("draws what the program says: a lit dot with a sparkle, then a dim dot", () => {
    const [lit, dim] = renderAll(blinkingDot, { seed: 1 }).frames.map((frame) => frame.buffer.toText().split("\n"));
    // 1 ink, 2 ink-deep, 4 white, 5-7 the red ramp.
    expect(lit).toEqual([
      "............",
      "............",
      "....1111....",
      "...166662...",
      "..16777662..",
      "..16777662..",
      "..16777662..",
      "..16666662..",
      "...266662...",
      "....2222..4.",
      ".........444",
      "..........4.",
    ]);
    expect(dim).toEqual([
      "............",
      "............",
      "....1111....",
      "...155552...",
      "..15666552..",
      "..15666552..",
      "..15666552..",
      "..15555552..",
      "...255552...",
      "....2222....",
      "............",
      "............",
    ]);
  });

  it("the three variant seeds are three colours, and the param and presets change the output", () => {
    const hashes = blinkingDot.variantSeeds.map((seed) => renderHash(blinkingDot as AnyAsset, { seed }));
    expect(new Set(hashes).size).toBe(3);
    const ramps = blinkingDot.variantSeeds.map((seed) => blinkingDot.render({ seed, clip: "blink", frame: 1 }).get(7, 7));
    expect(ramps).toEqual([blinkingDot.palette.slot("red.0"), blinkingDot.palette.slot("teal.0"), blinkingDot.palette.slot("gold.0")]);

    const widths = [3, 4, 5, 6, 7, 8].map(
      (diameter) => blinkingDot.render({ seed: 1, clip: "blink", frame: 1, params: { diameter } }).bounds()?.w,
    );
    expect(widths).toEqual([5, 6, 7, 8, 9, 10]); // the dot plus its outline
    expect(renderHash(blinkingDot as AnyAsset, { seed: 1, preset: "small" })).not.toBe(GOLDEN[1]);
    expect(renderHash(blinkingDot as AnyAsset, { seed: 1, preset: "big" })).toBe(
      renderHash(blinkingDot as AnyAsset, { seed: 1, params: { diameter: 8 } }),
    );
  });

  it("every frame of every review seed and preset fits the frame and has no stray pixels", () => {
    for (const seed of blinkingDot.reviewSeeds) {
      for (const preset of [undefined, ...Object.keys(blinkingDot.presets)]) {
        for (const { buffer, frame } of renderAll(blinkingDot, { seed, preset }).frames) {
          // The dim frame is the dot alone: nothing touches the edge of the frame.
          if (frame === 1) {
            const bounds = buffer.bounds();
            expect(bounds !== null && bounds.x > 0 && bounds.y > 0 && bounds.x + bounds.w < 12 && bounds.y + bounds.h < 12).toBe(true);
          }
          expect(buffer.orphanCount(), `seed ${seed}, preset ${preset}, frame ${frame}`).toBe(0);
        }
      }
    }
  });

  it("is the example of the README, character for character, and the README stays one page", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
    const source = readFileSync(new URL("../../../assets/examples/blinking-dot/gen.ts", import.meta.url), "utf8");
    const block = /```ts\n([\s\S]*?)```/.exec(readme)?.[1];
    expect(block).toBe(source.slice(source.indexOf("import ")));
    expect(readme.split("\n").length).toBeLessThanOrEqual(90);
  });

  it("loads from its file the way the bake CLI will", async () => {
    const loaded = await loadAsset(new URL("../../../assets/examples/blinking-dot/gen.ts", import.meta.url));
    expect(loaded.meta).toEqual(blinkingDot.meta);
    for (const seed of blinkingDot.variantSeeds) expect(renderHash(loaded, { seed })).toBe(GOLDEN[seed]);
  });
});
