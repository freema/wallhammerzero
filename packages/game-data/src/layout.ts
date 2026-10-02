// The source layout of a game: which files `games/<id>/` may hold and what each one is.
//
//   game.json              what the game is (schemas.ts: GAME_SCHEMA)
//   data/<table>.json      one content table per file; the name is the table's name in its
//                          sim system. Together with game.json's `systems` this is the sim data.
//   locales/<lang>.json    display text by string id
//   scenes/<id>.json, ui/<id>.json, fx.json, audio.json
//                          presentation as data: the slots below
//   *.md                   notes for people and agents; not part of the game
//
// Any other file is an error: a file the loader does not know is a file nobody checks.

import { GAME_ID_PATTERN, LOCALE_PATTERN, NAME_PATTERN } from "./schemas.ts";
import type { CompiledSchema } from "./schema.ts";

/**
 * A place for presentation data: one file (`fx.json`) or a folder of files named by id
 * (`scenes/*.json`). Presentation never affects the simulation, so its files are in the asset
 * manifest of the package and not in the `simDataHash`.
 *
 * A slot whose `schema` is `null` is reserved: its schema comes with the note named in `note`,
 * and until then a game with such a file does not validate.
 */
export interface PresentationSlot {
  /** `scenes`, `ui`, `fx`, `audio`. For a folder slot it is also the folder and the `doc:<name>` reference kind. */
  readonly name: string;
  /** `folder`: `<name>/<id>.json`, any number of files. `file`: `<name>.json`. */
  readonly shape: "folder" | "file";
  readonly schema: CompiledSchema | null;
  /** The task note that adds (or added) the schema. */
  readonly note: string;
}

/**
 * The presentation slots of the engine. A runtime note adds its schema here (and tests for
 * it); a new kind of presentation file is a new entry.
 */
export const PRESENTATION: readonly PresentationSlot[] = Object.freeze([
  { name: "scenes", shape: "folder", schema: null, note: "runtime-tilemap-scene" },
  { name: "ui", shape: "folder", schema: null, note: "runtime-text-ui" },
  { name: "fx", shape: "file", schema: null, note: "fx-emitters" },
  { name: "audio", shape: "file", schema: null, note: "runtime-audio" },
] as const);

/** What a file of a game's folder is. */
export type FileRole =
  | { readonly role: "game" }
  | { readonly role: "table"; readonly name: string }
  | { readonly role: "locale"; readonly lang: string }
  | { readonly role: "presentation"; readonly slot: PresentationSlot; readonly id: string | null }
  | { readonly role: "notes" }
  | { readonly role: "unknown"; readonly why: string };

const DOC_ID = new RegExp(GAME_ID_PATTERN, "u");
const LOCALE = new RegExp(LOCALE_PATTERN, "u");
const NAME = new RegExp(NAME_PATTERN, "u");

/** The file of a presentation document inside a game or a package. */
export function presentationPath(slot: Pick<PresentationSlot, "name" | "shape">, id: string | null): string {
  return slot.shape === "folder" ? `${slot.name}/${String(id)}.json` : `${slot.name}.json`;
}

/** What the file at `path` (relative to the game's folder, with `/`) is. */
export function classifyFile(path: string, slots: readonly PresentationSlot[] = PRESENTATION): FileRole {
  if (path.endsWith(".md")) return { role: "notes" };
  if (path === "game.json") return { role: "game" };
  const parts = path.split("/");
  const file = parts[parts.length - 1] as string;
  const stem = file.endsWith(".json") ? file.slice(0, -".json".length) : null;

  if (parts.length === 1) {
    const slot = slots.find((candidate) => candidate.shape === "file" && `${candidate.name}.json` === path);
    if (slot !== undefined) return { role: "presentation", slot, id: null };
    return { role: "unknown", why: "it is not a file of a game" };
  }

  if (parts.length === 2 && stem !== null) {
    const folder = parts[0] as string;
    if (folder === "data") {
      return NAME.test(stem) ? { role: "table", name: stem } : { role: "unknown", why: `"${stem}" is not a table name (a camelCase identifier)` };
    }
    if (folder === "locales") {
      return LOCALE.test(stem) ? { role: "locale", lang: stem } : { role: "unknown", why: `"${stem}" is not a locale (en, cs, pt-BR)` };
    }
    const slot = slots.find((candidate) => candidate.shape === "folder" && candidate.name === folder);
    if (slot !== undefined) {
      return DOC_ID.test(stem)
        ? { role: "presentation", slot, id: stem }
        : { role: "unknown", why: `"${stem}" is not an id (lowercase words joined by dashes)` };
    }
  }
  return { role: "unknown", why: "it is not a file of a game" };
}

/** The layout in words, for the message of an unknown file. */
export function layoutSummary(slots: readonly PresentationSlot[] = PRESENTATION): string {
  const presentation = slots.map((slot) => (slot.shape === "folder" ? `${slot.name}/<id>.json` : `${slot.name}.json`));
  return ["game.json", "data/<table>.json", "locales/<lang>.json", ...presentation, "*.md"].join(", ");
}
