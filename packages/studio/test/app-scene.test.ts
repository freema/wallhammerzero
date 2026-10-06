// What a preview draws (app/lib/scene.ts), checked with the runtime's CPU backend, which is
// the reference of the WebGL backend the browser uses: a frame of a baked fixture, drawn
// through the player's draw list, is the frame's own PNG pixel for pixel; the onion skin is
// the tinted frames under it; the pixel inspector reads the baked palette indices.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bakeAll, decodePng, openProject } from "@whz/asset-kit/node";
import { createCpuBackend, frameIndex, parseAtlas, sheetFromPng } from "@whz/runtime";
import type { Atlas, Sheet } from "@whz/runtime";
import { cssPixel, deviceRect, deviceScale, frameList, inspectPixel, ONION_NEXT_ROW, ONION_NEXT_TINT, ONION_PAST_ROW, ONION_PAST_TINT, onCanvas, PALETTE_ROW, previewPalette, tintColors, validChoice } from "../app/lib/scene.ts";
import { FIXTURE_ASSETS, removeTemps, tempRoot } from "./helpers.ts";

let out: string;
let atlas: Atlas;
let sheet: Sheet;
const backend = createCpuBackend();

beforeAll(async () => {
  const root = tempRoot("scene");
  const project = openProject({ root, assets: FIXTURE_ASSETS, out: join(root, "build") });
  await bakeAll(project);
  out = join(project.outDir, "assets", "shapes", "square");
  atlas = parseAtlas(JSON.parse(readFileSync(join(out, "atlas.json"), "utf8")));
  sheet = sheetFromPng(atlas, readFileSync(join(out, "seed-1.png")), 1);
});

afterAll(() => {
  backend.dispose();
  removeTemps();
});

/** The RGBA pixels of a frame's own PNG, as the kit wrote it (an indexed PNG with a tRNS). */
function framePng(clip: string, facing: string, frame: number): Uint8Array {
  const png = decodePng(readFileSync(join(out, "frames", "seed-1", `${clip}.${facing}.${frame}.png`)));
  if (png.type !== "indexed" || png.palette === null) throw new Error("the frame PNG is not indexed");
  const rgba = new Uint8Array(png.w * png.h * 4);
  for (let i = 0; i < png.w * png.h; i += 1) {
    const slot = png.data[i] as number;
    rgba.set(png.palette.subarray(slot * 4, slot * 4 + 4), i * 4);
    if (slot === 0) rgba.fill(0, i * 4, i * 4 + 4);
  }
  return rgba;
}

function drawn(choice: Parameters<typeof frameList>[1]): Uint8Array {
  const [w, h] = atlas.size;
  const target = backend.createTarget(w, h);
  backend.draw(target, frameList(sheet, choice), { palette: previewPalette(atlas.palette.colors) });
  const pixels = backend.readPixels(target);
  backend.release(target);
  return pixels;
}

describe("frameList", () => {
  it("draws every frame of every clip exactly as the kit's frame PNG", () => {
    let frames = 0;
    for (const clip of atlas.clips) {
      for (const facing of atlas.facings) {
        for (let frame = 0; frame < clip.frames; frame += 1) {
          expect(drawn({ clip: clip.name, facing, frame }), `${clip.name}/${facing}/${frame}`).toEqual(framePng(clip.name, facing, frame));
          frames += 1;
        }
      }
    }
    expect(frames).toBe(atlas.frames.length);
    // Not a blank: the square has opaque pixels.
    expect(drawn({ clip: "idle", facing: "default", frame: 0 }).some((byte, i) => i % 4 === 3 && byte === 255)).toBe(true);
  });

  it("puts the onion skin under the frame: the frame before in red, the frame after in blue, only where the frame is transparent", () => {
    const facing = atlas.facings[0] as string;
    // Frame 1 of the pulse is the smaller square: frame 0 under it shows around its edge.
    const plain = drawn({ clip: "pulse", facing, frame: 1 });
    const skinned = drawn({ clip: "pulse", facing, frame: 1, prev: 0 });
    const prev = framePng("pulse", facing, 0);
    const tinted = (slot: number, tint: readonly [number, number, number]): number[] => {
      const color = tintColors([atlas.palette.colors[slot] as string], tint)[0] as string;
      return [Number.parseInt(color.slice(1, 3), 16), Number.parseInt(color.slice(3, 5), 16), Number.parseInt(color.slice(5, 7), 16), 255];
    };
    const prevSheetFrame = atlas.frames[frameIndex(atlas, "pulse", 0, facing)] as { x: number; y: number; w: number };
    let under = 0;
    for (let i = 0; i < plain.length; i += 4) {
      const own = plain.subarray(i, i + 4);
      if (own[3] === 255) {
        expect(skinned.subarray(i, i + 4)).toEqual(own); // the frame wins
      } else if (prev[i + 3] === 255) {
        const px = i / 4;
        const slot = sheet.pixels[(prevSheetFrame.y + Math.floor(px / atlas.size[0])) * sheet.width + prevSheetFrame.x + (px % atlas.size[0])] as number;
        expect([...skinned.subarray(i, i + 4)]).toEqual(tinted(slot, ONION_PAST_TINT));
        under += 1;
      } else {
        expect(skinned[i + 3]).toBe(0);
      }
    }
    expect(under).toBeGreaterThan(0);
    // A frame after that is wholly covered shows nowhere; the list still has it, under the frame.
    expect(drawn({ clip: "pulse", facing, frame: 0, next: 1 })).toEqual(drawn({ clip: "pulse", facing, frame: 0 }));
    // The frame before is drawn in the red tint, under the blue one, under the frame.
    const list = frameList(sheet, { clip: "pulse", facing, frame: 1, prev: 0, next: 0 });
    expect(list.items().map((item) => (item.kind === "sprite" ? [item.paletteRow, item.depth] : null))).toEqual([
      [ONION_PAST_ROW, 0],
      [ONION_NEXT_ROW, 1],
      [PALETTE_ROW, 2],
    ]);
    expect(tintColors(["#000000", "#ffffff"], ONION_PAST_TINT)).toEqual(["#742424", "#f4a4a4"]);
    expect(tintColors(["#000000"], ONION_NEXT_TINT)).toEqual(["#244074"]);
  });
});

describe("validChoice and inspectPixel", () => {
  it("accepts a choice the atlas has and refuses a clip, facing or frame it has not", () => {
    const facing = atlas.facings[0] as string;
    const ok = { clip: "pulse", facing, frame: 1, prev: 0, next: null };
    expect(validChoice(sheet, ok)).toBe(ok);
    expect(validChoice(sheet, { clip: "walk", facing, frame: 0 })).toBeNull();
    expect(validChoice(sheet, { clip: "pulse", facing: "up", frame: 0 })).toBeNull();
    expect(validChoice(sheet, { clip: "pulse", facing, frame: 2 })).toBeNull();
    expect(validChoice(sheet, { clip: "pulse", facing, frame: 0, next: 5 })).toBeNull();
    expect(validChoice(sheet, { clip: "pulse", facing, frame: 0.5 })).toBeNull();
  });

  it("tells the slot, name and colour of a pixel from the sheet, and null outside the frame", () => {
    const facing = atlas.facings[0] as string;
    const [w, h] = atlas.size;
    const png = decodePng(readFileSync(join(out, "frames", "seed-1", `idle.${facing}.0.png`)));
    const names = atlas.palette.colors.map((_, slot) => `slot${slot}`);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const slot = png.data[y * w + x] as number;
        const info = inspectPixel(sheet, { clip: "idle", facing, frame: 0 }, x, y, names);
        expect(info).toMatchObject({ x, y, slot, name: `slot${slot}` });
        if (slot === 0) expect(info).toMatchObject({ color: null, rgb: null });
        else {
          const color = atlas.palette.colors[slot] as string;
          expect(info?.color).toBe(color);
          expect(info?.rgb).toEqual([1, 3, 5].map((at) => Number.parseInt(color.slice(at, at + 2), 16)));
        }
      }
    }
    expect(inspectPixel(sheet, { clip: "idle", facing, frame: 0 }, 1, 1, null)?.name).toBeNull();
    expect(inspectPixel(sheet, { clip: "idle", facing, frame: 0 }, w, 0, names)).toBeNull();
    expect(inspectPixel(sheet, { clip: "idle", facing, frame: 0 }, -1, 0, names)).toBeNull();
    expect(inspectPixel(sheet, { clip: "idle", facing, frame: 0 }, 1.5, 0, names)).toBeNull();
  });
});

describe("where a preview is on the canvas", () => {
  it("scales by a whole number of device pixels, whatever the display's ratio", () => {
    expect(deviceScale(4, 1)).toBe(4);
    expect(deviceScale(4, 2)).toBe(8);
    expect(deviceScale(3, 1.5)).toBe(4);
    expect(deviceScale(1, 1.25)).toBe(1);
    expect(deviceScale(1, 0.8)).toBe(1);
    expect(cssPixel(4, 2)).toBe(4);
    expect(cssPixel(3, 1.5)).toBeCloseTo(4 / 1.5);
  });

  it("snaps the rectangle to whole device pixels and knows what is off the canvas", () => {
    expect(deviceRect({ left: 10.3, top: 20.6 }, 12, 8, 8, 2)).toEqual({ x: 21, y: 41, w: 96, h: 64 });
    expect(onCanvas({ x: 21, y: 41, w: 96, h: 64 }, 200, 100)).toBe(true);
    expect(onCanvas({ x: -96, y: 0, w: 96, h: 64 }, 200, 100)).toBe(false);
    expect(onCanvas({ x: -95, y: 0, w: 96, h: 64 }, 200, 100)).toBe(true);
    expect(onCanvas({ x: 200, y: 0, w: 96, h: 64 }, 200, 100)).toBe(false);
    expect(onCanvas({ x: 0, y: 100, w: 96, h: 64 }, 200, 100)).toBe(false);
  });
});
