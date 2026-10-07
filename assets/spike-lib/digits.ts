// A 3 x 5 digit set for counters in the UI strip: the smallest digits that still read at 1x.
// Rows are text, one letter per pixel (`#` ink, `.` nothing), like a stamp file.

import type { IndexedBuffer } from "@whz/asset-kit";

export const DIGIT_W = 3;
export const DIGIT_H = 5;
/** From the left edge of one digit to the next. */
export const DIGIT_ADVANCE = DIGIT_W + 1;

const DIGITS: Readonly<Record<string, readonly string[]>> = {
  "0": ["###", "#.#", "#.#", "#.#", "###"],
  "1": [".#.", "##.", ".#.", ".#.", "###"],
  "2": ["###", "..#", "###", "#..", "###"],
  "3": ["###", "..#", ".##", "..#", "###"],
  "4": ["#.#", "#.#", "###", "..#", "..#"],
  "5": ["###", "#..", "###", "..#", "###"],
  "6": ["###", "#..", "###", "#.#", "###"],
  "7": ["###", "..#", ".#.", ".#.", ".#."],
  "8": ["###", "#.#", "###", "#.#", "###"],
  "9": ["###", "#.#", "###", "..#", "###"],
  ",": ["...", "...", "...", ".#.", "#.."],
};

/** The width of a number as drawn, in pixels. */
export function numberWidth(text: string): number {
  return text.length * DIGIT_ADVANCE - 1;
}

/** Draws the digits (and commas) of `text` at `x, y` in `color`; an unknown character draws nothing. */
export function drawNumber(out: IndexedBuffer, x: number, y: number, text: string, color: number): void {
  let at = x;
  for (const character of text) {
    const rows = DIGITS[character];
    if (rows !== undefined) {
      rows.forEach((row, dy) => {
        for (let dx = 0; dx < DIGIT_W; dx += 1) if (row[dx] === "#") out.pset(at + dx, y + dy, color);
      });
    }
    at += DIGIT_ADVANCE;
  }
}

/** `12500` → `12,500`. */
export function withThousands(value: number): string {
  const digits = String(value);
  let text = "";
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) text += ",";
    text += digits[i];
  }
  return text;
}
