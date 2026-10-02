// The vision calibration sheets: which zoom lets a model see which defect?
// (research/code-graphics.md §5.3 and §7.5; the result is recorded in docs/looking-at-images.md.)
//
//   ./dev npm run calibration -w @whz/asset-kit -- --seed 7391
//
// Writes build/calibration/z<zoom>-t<trial>.png for the zooms 1, 4, 8 and 12, two trials each,
// and key.json. Every sheet has a clean reference walker (REF) and five rows A-E: four carry
// one planted defect each (an orphan pixel, a wrong palette slot, a 1-pixel pivot jump,
// twinned arms) and one is clean. Which row has what, in which frame and where is drawn from
// the seed, and differs per sheet. Five rows is what fits one image at 12x.
//
// The protocol: open every sheet with Read, write down for each row "clean" or the defect and
// its frame, and only then open key.json and score. Re-run it when the model changes.

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRng } from "@whz/det";
import { formatJson, renderAll, renderSheet } from "../src/index.ts";
import type { SheetSection } from "../src/index.ts";
import { encodeRgbPng } from "../src/node/index.ts";
import { describeDefect, makeWalker } from "../test/lint-fixtures/walker.ts";
import type { WalkerDefect } from "../test/lint-fixtures/walker.ts";

const ZOOMS = [1, 4, 8, 12];
const TRIALS = 2;
const PLANTED: readonly WalkerDefect[] = ["orphan-pixel", "wrong-slot", "pivot-jump", "twinned"];
const LABELS = ["A", "B", "C", "D", "E"];

function option(name: string, fallback: string): string {
  const at = process.argv.indexOf(name);
  return at >= 0 && process.argv[at + 1] !== undefined ? (process.argv[at + 1] as string) : fallback;
}

const seed = Number(option("--seed", "1"));
if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("--seed must be an integer in [0, 4294967295]");
const out = resolve(option("--out", fileURLToPath(new URL("../../../build/calibration/", import.meta.url))));
mkdirSync(out, { recursive: true });

function strip(title: string, defect: WalkerDefect | null, pick: number): SheetSection {
  const asset = makeWalker("calibration/walker", defect, pick);
  const colors = asset.palette.rgba();
  return {
    title,
    cells: renderAll(asset, { seed: 1 }).frames.map((frame) => ({ caption: String(frame.frame), buffer: frame.buffer, colors })),
  };
}

const sheets = [];
for (const zoom of ZOOMS) {
  for (let trial = 1; trial <= TRIALS; trial += 1) {
    const rng = createRng(seed, `sheet-${zoom}-${trial}`);
    const rows = rng.shuffle<WalkerDefect | null>([...PLANTED, null]).map((defect, i) => ({
      label: LABELS[i] as string,
      defect,
      pick: rng.int(16),
    }));
    const sheet = renderSheet({
      header: `calibration  trial ${trial}`,
      sections: [strip("REF", null, 0), ...rows.map((row) => strip(row.label, row.defect, row.pick))],
      zoom,
    });
    if (sheet.pages.length !== 1 || sheet.zoom !== zoom) throw new Error(`the sheet for zoom ${zoom} does not fit one image`);
    const image = sheet.pages[0] as (typeof sheet.pages)[number];
    const file = `z${zoom}-t${trial}.png`;
    writeFileSync(join(out, file), encodeRgbPng(image));
    console.log(`${join(out, file)}  ${image.w}x${image.h}`);
    sheets.push({
      file,
      zoom,
      trial,
      rows: rows.map((row) => ({
        label: row.label,
        defect: row.defect,
        detail: row.defect === null ? "clean" : describeDefect(row.defect, row.pick),
      })),
    });
  }
}
writeFileSync(join(out, "key.json"), formatJson({ seed, sheets }));
console.log(`${join(out, "key.json")}  (the answers: open it after you have written down what you saw)`);
