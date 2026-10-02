// ASCII stamps: small text grids for hand-placed detail (faces, icons, parts of a body).
// Each character is one pixel: `.` is transparent, any other character is looked up in the
// legend (a letter or digit -> palette index, from `palette.legend(...)`).
//
// The parser is strict: every row has the same width and every character is known, or it
// throws a StampError that says where. To draw a tapered part, pad it with `padRows` first.
//
// A stamp is either a list of rows or one text (an inline template string, or the content of
// stamps/<name>.txt next to the generator). In a text, lines are trimmed, blank lines at the
// start and end are dropped, and lines that start with `#` are comments.

import { IndexedBuffer, MAX_BUFFER_SIZE } from "./buffer.ts";
import type { Legend } from "./palette.ts";

/** A stamp that could not be parsed. `row` and `column` count from 1. */
export class StampError extends Error {
  /** The row of the problem, counted from 1 (comment lines are not rows). */
  readonly row: number;
  /** The column of the problem, counted from 1; 0 when the whole row is at fault. */
  readonly column: number;

  constructor(message: string, row: number, column: number) {
    super(message);
    this.name = "StampError";
    this.row = row;
    this.column = column;
  }
}

/**
 * The rows of a stamp text: lines trimmed, `#` comment lines and blank lines at the start
 * and end removed. A blank line between rows stays (and fails the width check).
 */
export function stampRows(text: string): string[] {
  const rows = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !line.startsWith("#"));
  while (rows.length > 0 && rows[0] === "") rows.shift();
  while (rows.length > 0 && rows[rows.length - 1] === "") rows.pop();
  return rows;
}

/**
 * Parses a stamp into an IndexedBuffer.
 * @param source rows, or one text (see `stampRows`)
 * @param legend character -> palette index; `.` is always transparent
 * @param name   used in error messages, e.g. the file name
 */
export function parseStamp(source: string | readonly string[], legend: Legend, name = "stamp"): IndexedBuffer {
  const rows = typeof source === "string" ? stampRows(source) : source;
  const first = rows[0];
  if (first === undefined || first.length === 0) throw new StampError(`${name}: the stamp is empty`, 1, 0);
  const width = first.length;
  if (width > MAX_BUFFER_SIZE || rows.length > MAX_BUFFER_SIZE) {
    throw new StampError(`${name}: ${width} x ${rows.length} is larger than ${MAX_BUFFER_SIZE}`, 1, 0);
  }
  const buffer = new IndexedBuffer(width, rows.length);
  rows.forEach((row, y) => {
    if (row.length !== width) {
      throw new StampError(`${name}: row ${y + 1} is ${row.length} wide, expected ${width} (the width of row 1)`, y + 1, 0);
    }
    for (let x = 0; x < width; x += 1) {
      const char = row.charAt(x);
      if (char === ".") continue;
      const index = Object.hasOwn(legend, char) ? legend[char] : undefined;
      if (index === undefined) {
        throw new StampError(
          `${name}: unknown letter ${JSON.stringify(char)} at row ${y + 1}, column ${x + 1} (legend: ${Object.keys(legend).join(" ") || "empty"})`,
          y + 1,
          x + 1,
        );
      }
      buffer.pset(x, y, index);
    }
  });
  return buffer;
}

/** Rows padded on the right with `.` to the width of the widest row. */
export function padRows(rows: readonly string[]): string[] {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return rows.map((row) => row.padEnd(width, "."));
}

/**
 * A copy of `rows` with single rows replaced: `patchRows(rows, { 3: "..oo.." })` swaps row 3
 * (counted from 0). A cheap way to make a blink or a mouth frame from a base stamp.
 */
export function patchRows(rows: readonly string[], patches: Readonly<Record<number, string>>): string[] {
  const out = [...rows];
  for (const [key, row] of Object.entries(patches)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= rows.length) {
      throw new RangeError(`patchRows: row ${key} does not exist (the stamp has ${rows.length} rows)`);
    }
    out[index] = row;
  }
  return out;
}

/**
 * A copy of `rows` moved down by `dy` rows (up for a negative `dy`) inside the same height:
 * rows pushed out are dropped and blank rows come in. A cheap bob frame.
 */
export function shiftRows(rows: readonly string[], dy: number): string[] {
  if (!Number.isInteger(dy)) throw new RangeError(`shiftRows: dy must be an integer, got ${String(dy)}`);
  const blank = ".".repeat(rows.reduce((max, row) => Math.max(max, row.length), 0));
  return rows.map((_, y) => rows[y - dy] ?? blank);
}
