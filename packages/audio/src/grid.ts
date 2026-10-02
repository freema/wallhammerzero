// The step grid: one string per bar, `|` between beats, one token per step.
//
//   C#5  Bb4     a note starts (letter, optional # or b, octave 0-9; C4 is middle C)
//   -            the note before it keeps sounding
//   .            silence
//   C4@047       an arpeggio: the note, then +4 and +7 semitones, cycled at the instrument's
//                arpHz (offsets are single digits 0-9, or a b c for 10 11 12; 2 to 4 of them)
//   C5:9         velocity 1-9 after a colon (7 if not given; 9 is an accent, 3 a ghost note)
//   k  s  h      in a kit channel: the keys of the kit's drums (velocity works here too)
//   "=0"         the whole bar repeats bar 0 of the same channel in the same section
//
// Time is the position in the string, so channels cannot drift apart: a bar with a wrong
// number of beats or steps is an error with its path, not a song that slowly falls out of
// sync (the main failure of LLM-written multi-voice music, research/audio-from-code.md §1.3).

import type { Anchor, Report } from "./findings.ts";
import { parseNoteName } from "./pitch.ts";

/** The velocity of a token without `:n`, and the highest one. */
export const DEFAULT_VELOCITY = 7;
export const MAX_VELOCITY = 9;

export type Token =
  | { readonly kind: "rest" }
  | { readonly kind: "hold" }
  | { readonly kind: "note"; readonly midi: number; readonly arp: readonly number[] | null; readonly velocity: number }
  | { readonly kind: "drum"; readonly key: string; readonly velocity: number };

const REST: Token = { kind: "rest" };
const HOLD: Token = { kind: "hold" };

/** What the tokens of a channel may be. */
export interface TokenContext {
  /** The drum keys of the channel's kit; null for a melodic channel. */
  readonly drums: readonly string[] | null;
}

/** One token; a string with the reason if it is not valid. */
export function parseToken(text: string, context: TokenContext): Token | string {
  if (text === ".") return REST;
  if (text === "-") return HOLD;
  const match = /^([^@:]+)(?:@([0-9a-c]+))?(?::(.+))?$/.exec(text);
  if (match === null) return `"${text}" is not a token`;
  let velocity = DEFAULT_VELOCITY;
  if (match[3] !== undefined) {
    if (!/^[1-9]$/.test(match[3])) return `"${text}": a velocity is one digit 1-9 after the colon`;
    velocity = Number(match[3]);
  }
  const head = match[1] as string;
  if (context.drums !== null) {
    if (match[2] !== undefined) return `"${text}": a drum cannot have an arpeggio`;
    if (!context.drums.includes(head)) return `"${head}" is not a drum of this kit (known: ${context.drums.join(", ")}); use "." for silence`;
    return { kind: "drum", key: head, velocity };
  }
  const midi = parseNoteName(head);
  if (midi === null) return `"${text}" is not a note ("C4", "F#3", "Bb5"), "-" (hold) or "." (silence)`;
  let arp: number[] | null = null;
  if (match[2] !== undefined) {
    if (match[2].length < 2 || match[2].length > 4) return `"${text}": an arpeggio has 2 to 4 offsets, e.g. C4@047`;
    arp = Array.from(match[2], (digit) => Number.parseInt(digit, 13));
  }
  return { kind: "note", midi, arp, velocity };
}

/** The shape of a bar: how many beats, and how many steps in each. */
export interface BarShape {
  readonly beatsPerBar: number;
  readonly stepsPerBeat: number;
}

/** `=3`: the index of the bar this bar repeats; null if the text is not a repeat. */
export function repeatTarget(text: string): number | null {
  const match = /^=(\d{1,3})$/.exec(text.trim());
  return match === null ? null : Number(match[1]);
}

/**
 * The tokens of one bar, `beatsPerBar * stepsPerBeat` of them, or null after reporting what
 * is wrong: the number of beats, the number of steps in a beat, or a token.
 */
export function parseBar(report: Report, text: string, shape: BarShape, context: TokenContext, path: string, at: Anchor): Token[] | null {
  const beats = text.split("|");
  if (beats.length !== shape.beatsPerBar) {
    report.error("steps", path, `the bar has ${beats.length} beat(s) (separated by "|"), the meter needs ${shape.beatsPerBar}`, at);
    return null;
  }
  const tokens: Token[] = [];
  let fine = true;
  beats.forEach((beatText, beat) => {
    const words = beatText.split(/\s+/).filter((word) => word !== "");
    if (words.length !== shape.stepsPerBeat) {
      report.error("steps", path, `beat ${beat + 1} has ${words.length} step(s), stepsPerBeat is ${shape.stepsPerBeat}: "${beatText.trim()}"`, { ...at, beat });
      fine = false;
      return;
    }
    words.forEach((word, step) => {
      const token = parseToken(word, context);
      if (typeof token === "string") {
        report.error("token", path, `beat ${beat + 1}, step ${step + 1}: ${token}`, { ...at, beat, step });
        fine = false;
      } else tokens.push(token);
    });
  });
  return fine ? tokens : null;
}
