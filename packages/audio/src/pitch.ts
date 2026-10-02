// Note names, keys and chord symbols: the music theory the formats and the validators share.
// Everything is a pitch class (0 = C .. 11 = B) or a MIDI note number (60 = C4, 69 = A4).

const LETTERS: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/** The lowest and highest note a melodic channel may play: C1 and C7. */
export const MIN_NOTE = 24;
export const MAX_NOTE = 96;

/** The pitch class of `C`, `F#`, `Bb`; null if the text is not one. */
export function parsePitchClass(text: string): number | null {
  const match = /^([A-G])([#b]?)$/.exec(text);
  if (match === null) return null;
  const base = LETTERS[match[1] as string] as number;
  const shift = match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0;
  return (base + shift + 12) % 12;
}

/** The MIDI number of `C4`, `F#3`, `Bb5` (octaves 0 to 9; C4 = 60); null if the text is not a note name. */
export function parseNoteName(text: string): number | null {
  const match = /^([A-G])([#b]?)([0-9])$/.exec(text);
  if (match === null) return null;
  // Cb4 is the B below C4 and B#4 the C above B4: the octave belongs to the letter.
  const shift = match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0;
  return 12 * (Number(match[3]) + 1) + (LETTERS[match[1] as string] as number) + shift;
}

/** The name of a MIDI note, with sharps: 61 is `C#4`. */
export function noteName(midi: number): string {
  const pitchClass = ((midi % 12) + 12) % 12;
  return `${SHARP_NAMES[pitchClass] as string}${Math.floor(midi / 12) - 1}`;
}

/** The name of a pitch class, with sharps. */
export function pitchClassName(pitchClass: number): string {
  return SHARP_NAMES[((pitchClass % 12) + 12) % 12] as string;
}

/** The scales a key may use: semitones above the root. */
export const MODES: Readonly<Record<string, readonly number[]>> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
};

/** A key: a root and a mode. `pitchClasses[pc]` is true for the notes of its scale. */
export interface Key {
  readonly name: string;
  readonly root: number;
  readonly mode: string;
  readonly pitchClasses: readonly boolean[];
}

/** `F major`, `D minor`, `G mixolydian`; null if the text is not a key. */
export function parseKey(text: string): Key | null {
  const match = /^([A-G][#b]?) ([a-z]+)$/.exec(text);
  if (match === null) return null;
  const root = parsePitchClass(match[1] as string);
  const mode = match[2] as string;
  const scale = Object.hasOwn(MODES, mode) ? (MODES[mode] as readonly number[]) : undefined;
  if (root === null || scale === undefined) return null;
  const pitchClasses = new Array<boolean>(12).fill(false);
  for (const interval of scale) pitchClasses[(root + interval) % 12] = true;
  return { name: text, root, mode, pitchClasses };
}

/** The chord qualities the chord lane understands: semitones above the root. */
export const CHORD_QUALITIES: Readonly<Record<string, readonly number[]>> = {
  "": [0, 4, 7],
  m: [0, 3, 7],
  "5": [0, 7],
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  "9": [0, 4, 7, 10, 2],
  add9: [0, 4, 7, 2],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],
  aug: [0, 4, 8],
};

/** A chord of the chord lane. `pitchClasses[pc]` is true for its tones (the slash bass too). */
export interface Chord {
  readonly name: string;
  readonly root: number;
  readonly pitchClasses: readonly boolean[];
}

/** The text of a bar of the chord lane with no chord (a drum break): nothing is checked there. */
export const NO_CHORD = "-";

/** `F`, `Dm7`, `Bbmaj7`, `C/E`; null if the text is not a chord symbol. */
export function parseChord(text: string): Chord | null {
  const match = /^([A-G][#b]?)([a-z0-9]*)(?:\/([A-G][#b]?))?$/.exec(text);
  if (match === null) return null;
  const root = parsePitchClass(match[1] as string);
  const quality = match[2] as string;
  const intervals = Object.hasOwn(CHORD_QUALITIES, quality) ? (CHORD_QUALITIES[quality] as readonly number[]) : undefined;
  if (root === null || intervals === undefined) return null;
  const pitchClasses = new Array<boolean>(12).fill(false);
  for (const interval of intervals) pitchClasses[(root + interval) % 12] = true;
  if (match[3] !== undefined) {
    const bass = parsePitchClass(match[3]);
    if (bass === null) return null;
    pitchClasses[bass] = true;
  }
  return { name: text, root, pitchClasses };
}
