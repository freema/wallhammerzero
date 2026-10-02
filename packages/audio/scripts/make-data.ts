// Rebuilds the checked-in tables of @whz/audio:
//
//   data/pow2.json   one octave of 2^x in cents: pitch, decibels and every other exponential
//   data/tan.json    tan(pi * cutoff / sampleRate): the coefficient of every filter
//
// Run it in Docker, from the repo root: `./dev npm run make-data -w @whz/audio`.
// A changed file means the synth's numbers changed: every golden PCM hash moves.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildPow2, buildTan, POW2_STEPS, TABLE_BITS, TAN_LAST, TAN_STEPS } from "./tables.ts";

const dataFile = (name: string): string => fileURLToPath(new URL(`../data/${name}`, import.meta.url));

/** The text of a table file: the header fields one per line, the values packed into rows. */
export function tableText(header: Record<string, string | number>, values: readonly number[]): string {
  const rows: string[] = [];
  for (let i = 0; i < values.length; i += 8) rows.push(`    ${values.slice(i, i + 8).join(", ")}`);
  const head = Object.entries(header).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`);
  return `{\n${head.join("\n")}\n  "values": [\n${rows.join(",\n")}\n  ]\n}\n`;
}

export function pow2Text(): string {
  return tableText(
    {
      format: "wz.audio-pow2/1",
      about: "round(2^(i / steps) * 2^bits) for i = 0 .. steps. Built by packages/audio/scripts/make-data.ts with exact integer arithmetic.",
      steps: POW2_STEPS,
      bits: TABLE_BITS,
    },
    buildPow2(),
  );
}

export function tanText(): string {
  return tableText(
    {
      format: "wz.audio-tan/1",
      about: "round(tan(pi * k / steps) * 2^bits) for k = 0 .. last. Built by packages/audio/scripts/make-data.ts with exact integer arithmetic.",
      steps: TAN_STEPS,
      last: TAN_LAST,
      bits: TABLE_BITS,
    },
    buildTan(),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(dataFile("pow2.json"), pow2Text());
  writeFileSync(dataFile("tan.json"), tanText());
  console.log("wrote data/pow2.json and data/tan.json");
}
