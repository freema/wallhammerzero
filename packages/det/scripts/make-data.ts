// Rebuilds the checked-in data files of @whz/det:
//
//   data/isin.json      the quarter-wave sine table src/trig.ts reads
//   data/vectors.json   the test vectors for ports
//
// Run it in Docker, from the repo root: `./dev npm run make-data -w @whz/det`.
// A changed file means the kit's numbers changed: every golden hash that depends on them moves.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { stringifyData } from "./json.ts";
import { buildSinQuarter } from "./sin-table.ts";

const TURN = 4096;
const FP_ONE = 65536;

const dataFile = (name: string): string => fileURLToPath(new URL(`../data/${name}`, import.meta.url));

const isin = {
  format: "wz.det-isin/1",
  about:
    "round(sin(2 * pi * i / turn) * one) for i = 0 .. turn / 4. Built by packages/det/scripts/make-data.ts " +
    "with exact integer arithmetic.",
  turn: TURN,
  one: FP_ONE,
  quarter: buildSinQuarter(TURN, FP_ONE),
};
writeFileSync(dataFile("isin.json"), stringifyData(isin));

// The vectors come from src/, which reads the table written above, so it is imported afterwards.
const { buildVectors } = await import("./vectors.ts");
writeFileSync(dataFile("vectors.json"), stringifyData(buildVectors()));

console.log("wrote data/isin.json and data/vectors.json");
