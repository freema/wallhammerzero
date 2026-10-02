// Validating a game: the files of `games/<id>/` in, a list of problems out, each with its file,
// line, JSON path and rule. A game without problems comes back loaded: its manifest, its sim
// data, its locales and its presentation documents, ready to pack.
//
// Two steps, because some ids live outside the game:
//   analyseGame(input)            reads and checks everything inside the folder, and says which
//                                 assets the game refers to;
//   resolveGame(analysis, catalog) checks the ids that live outside it (palettes, assets, clips,
//                                 sounds) and, if all is well, loads the game and lets the sim
//                                 have the last word on its data.
// `validateGame` is both, for a host that already has the catalog. Nothing here touches a
// file: the Node side (`@whz/game-data/node`) reads the folder and builds the catalog.

import { createSim, ENGINE_SYSTEMS, SimError } from "@whz/sim";
import type { DataTableDecl, SimData, SystemDef } from "@whz/sim";
import { JsonParseError, itemPath, memberOf, memberPath, nodeValue, parseJson, positionAt } from "./json.ts";
import type { JsonNode } from "./json.ts";
import { classifyFile, layoutSummary, PRESENTATION, presentationPath } from "./layout.ts";
import type { PresentationSlot } from "./layout.ts";
import { parseRef } from "./refs.ts";
import type { Catalog } from "./refs.ts";
import type { CompiledSchema, RefUse } from "./schema.ts";
import { GAME_SCHEMA, LOCALE_SCHEMA, SCHEMA_VERSION, tableSchema } from "./schemas.ts";
import type { GameManifest } from "./schemas.ts";

/**
 * What kind of problem it is: `json` (not strict JSON, a duplicate key), `layout` (a file that
 * is missing, unknown or unreadable), `schema` (a value the schema does not allow), `ref` (an
 * id that does not resolve), `string` (a display text missing in a locale), `sim` (the sim
 * refuses the data).
 */
export type Rule = "json" | "layout" | "schema" | "ref" | "string" | "sim";

export interface Problem {
  /** The file, with the game's folder in front: `games/examples/counter-shop/data/items.json`. */
  readonly file: string;
  /** 1-based; 0 when the problem is about the file as a whole. */
  readonly line: number;
  readonly col: number;
  /** The JSON path of the value (`$[2].price`); empty when the problem is about the file as a whole. */
  readonly path: string;
  readonly rule: Rule;
  readonly message: string;
}

/** One line per problem: `<file>:<line>:<col>: <json path>: <message> [<rule>]`. */
export function formatProblem(problem: Problem): string {
  const where = problem.line > 0 ? `${problem.file}:${problem.line}:${problem.col}` : problem.file;
  return `${where}: ${problem.path === "" ? "" : `${problem.path}: `}${problem.message} [${problem.rule}]`;
}

/** The order problems are reported in: by file, then by position, then by text. */
export function compareProblems(a: Problem, b: Problem): number {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  if (a.line !== b.line) return a.line - b.line;
  if (a.col !== b.col) return a.col - b.col;
  const [x, y] = [`${a.path} ${a.message}`, `${b.path} ${b.message}`];
  return x < y ? -1 : x > y ? 1 : 0;
}

export interface GameInput {
  /** The game's folder as problems show it, with `/`: `games/examples/counter-shop`. Its last part must be the game id. */
  readonly dir: string;
  /** Every file of the folder: its path inside the folder (with `/`) and its text. */
  readonly files: ReadonlyMap<string, string>;
  /** Files that could not be read as text, and why. They are not in `files`. */
  readonly unreadable?: ReadonlyMap<string, string>;
  /** The engine registry. `ENGINE_SYSTEMS` if not given. */
  readonly systems?: readonly SystemDef[];
  /** The presentation slots. `PRESENTATION` if not given. */
  readonly presentation?: readonly PresentationSlot[];
}

/** What `analyseGame` found. Hand it to `resolveGame` with a catalog that knows `assetIds`. */
export interface GameAnalysis {
  readonly dir: string;
  /** The problems found inside the folder, in report order. */
  readonly problems: readonly Problem[];
  /** The asset ids the game refers to, in ascending order: what the catalog must know about. */
  readonly assetIds: readonly string[];
}

/** A game that validated. Plain data: nothing here refers back to the files. */
export interface LoadedGame {
  readonly dir: string;
  readonly manifest: GameManifest;
  /** What the sim gets: the systems and their data tables. */
  readonly simData: SimData;
  /** `hashSimData(simData)`, as the sim computed it. */
  readonly simDataHash: string;
  /** Display text by locale, then by string id. Locales and ids are in ascending order. */
  readonly locales: ReadonlyMap<string, Readonly<Record<string, string>>>;
  /** Presentation documents by their path in the game and in the package (`fx.json`, `scenes/shop.json`). */
  readonly presentation: ReadonlyMap<string, unknown>;
  /** The palettes, assets and sounds the game refers to, each in ascending order. */
  readonly palettes: readonly string[];
  readonly assets: readonly string[];
  readonly sounds: readonly string[];
}

export interface ValidationResult {
  /** In report order. Empty when the game is valid. */
  readonly problems: readonly Problem[];
  /** The loaded game, or `null` if there is any problem. */
  readonly game: LoadedGame | null;
}

interface Doc {
  readonly file: string;
  readonly root: JsonNode;
}

/** Where an id is used: a file of the game, and the offset and JSON path of the value. */
interface Site {
  readonly file: string;
  readonly offset: number;
  readonly path: string;
}

interface FileRef extends RefUse {
  readonly file: string;
}

/** What `resolveGame` needs from the analysis, kept out of the public interface. */
interface State {
  readonly input: GameInput;
  readonly registry: readonly SystemDef[];
  readonly problems: Problem[];
  readonly manifest: GameManifest | null;
  readonly tableDocs: ReadonlyMap<string, Doc>;
  readonly localeDocs: ReadonlyMap<string, Doc>;
  readonly presentationDocs: ReadonlyMap<string, Doc>;
  readonly external: readonly FileRef[];
}

const STATES = new WeakMap<GameAnalysis, State>();
const TABLE_SCHEMAS = new WeakMap<DataTableDecl, CompiledSchema>();

function schemaOf(decl: DataTableDecl): CompiledSchema {
  let schema = TABLE_SCHEMAS.get(decl);
  if (schema === undefined) {
    schema = tableSchema(decl);
    TABLE_SCHEMAS.set(decl, schema);
  }
  return schema;
}

const sorted = (ids: Iterable<string>): string[] => [...ids].sort();

/** A short list for a message: the first ids, and how many more there are. */
function listed(ids: Iterable<string>, limit = 12): string {
  const all = sorted(ids);
  if (all.length === 0) return "none";
  return all.length <= limit ? all.join(", ") : `${all.slice(0, limit).join(", ")}, and ${all.length - limit} more`;
}

function problemAdder(input: GameInput, problems: Problem[]): (file: string, rule: Rule, message: string, at?: { offset: number; path: string }) => void {
  return (file, rule, message, at) => {
    const text = input.files.get(file);
    const position = at !== undefined && text !== undefined ? positionAt(text, at.offset) : { line: 0, col: 0 };
    problems.push({ file: `${input.dir}/${file}`, line: position.line, col: position.col, path: at?.path ?? "", rule, message });
  };
}

/**
 * Reads and checks everything inside a game's folder: the layout, strict JSON, the schemas,
 * and every id that resolves inside the game (rows, tables, systems, strings, scenes).
 */
export function analyseGame(input: GameInput): GameAnalysis {
  const registry = input.systems ?? ENGINE_SYSTEMS;
  const slots = input.presentation ?? PRESENTATION;
  const problems: Problem[] = [];
  const add = problemAdder(input, problems);
  const refs: FileRef[] = [];
  const external: FileRef[] = [];
  const tableDocs = new Map<string, Doc>();
  const localeDocs = new Map<string, Doc>();
  const presentationDocs = new Map<string, Doc>();
  let manifest: GameManifest | null = null;

  const finish = (): GameAnalysis => {
    const assetIds = sorted(new Set(external.filter((use) => parseRef(use.ref).kind === "asset").map((use) => use.value)));
    const analysis: GameAnalysis = { dir: input.dir, problems: [...problems].sort(compareProblems), assetIds };
    STATES.set(analysis, { input, registry, problems, manifest, tableDocs, localeDocs, presentationDocs, external });
    return analysis;
  };

  const parse = (file: string): Doc | null => {
    try {
      return { file, root: parseJson(input.files.get(file) as string) };
    } catch (error) {
      if (!(error instanceof JsonParseError)) throw error;
      add(file, "json", error.message, { offset: error.offset, path: error.path });
      return null;
    }
  };

  /** Checks a document against a schema; true if it fits. Its references are collected. */
  const check = (doc: Doc, schema: CompiledSchema): boolean => {
    const result = schema.check(doc.root);
    for (const issue of result.issues) add(doc.file, "schema", issue.message, issue);
    for (const use of result.refs) refs.push({ ...use, file: doc.file });
    return result.issues.length === 0;
  };

  // --- 1. the layout: every file is one the loader knows --------------------------------------
  const files = sorted(input.files.keys());
  const roles = new Map(files.map((file) => [file, classifyFile(file, slots)] as const));
  for (const file of sorted((input.unreadable ?? new Map<string, string>()).keys())) {
    add(file, "layout", `cannot be read: ${(input.unreadable as ReadonlyMap<string, string>).get(file) as string}`);
  }
  for (const [file, role] of roles) {
    if (role.role === "unknown") add(file, "layout", `unknown file: ${role.why} (a game holds: ${layoutSummary(slots)})`);
  }

  // --- 2. game.json -----------------------------------------------------------------------------
  if (!input.files.has("game.json")) {
    add("game.json", "layout", "is missing: a game is a folder with a game.json");
    return finish();
  }
  const gameDoc = parse("game.json");
  if (gameDoc === null) return finish();
  const root = gameDoc.root;
  const version = root.kind === "object" ? memberOf(root, "schemaVersion")?.value : undefined;
  if (version?.kind === "number" && Number.isInteger(version.value) && version.value !== SCHEMA_VERSION) {
    // Another version may mean other schemas for every file, so nothing else is checked.
    add("game.json", "schema", `schemaVersion ${version.raw}: this game-data reads schemaVersion ${SCHEMA_VERSION}`, {
      offset: version.offset,
      path: "$.schemaVersion",
    });
    return finish();
  }
  if (check(gameDoc, GAME_SCHEMA)) manifest = nodeValue(root) as GameManifest;
  const folder = input.dir.split("/").pop() as string;
  if (manifest !== null && manifest.id !== folder) {
    const id = memberOf(root as Extract<JsonNode, { kind: "object" }>, "id") as { value: JsonNode };
    add("game.json", "schema", `the id ${JSON.stringify(manifest.id)} is not the name of the game's folder (${JSON.stringify(folder)})`, {
      offset: id.value.offset,
      path: "$.id",
    });
  }

  // --- 3. the systems, and the data tables they declare ----------------------------------------
  const used: SystemDef[] = [];
  /** False when a listed system is unknown: then the set of declared tables is not known either. */
  let systemsKnown = false;
  const systemsNode = root.kind === "object" ? memberOf(root, "systems")?.value : undefined;
  if (systemsNode?.kind === "array") {
    systemsKnown = systemsNode.items.length > 0;
    const names = systemsNode.items.map((item) => (item.kind === "string" ? item.value : null));
    systemsNode.items.forEach((item, index) => {
      const def = item.kind === "string" ? registry.find((candidate) => candidate.name === item.value) : undefined;
      if (def === undefined) {
        systemsKnown = false; // reported as a schema problem or as an unknown system (a reference)
        return;
      }
      if (!used.includes(def)) used.push(def);
      for (const required of def.requires ?? []) {
        if (!names.includes(required)) {
          add("game.json", "ref", `the system "${def.name}" requires "${required}", which the game does not list`, {
            offset: item.offset,
            path: itemPath("$.systems", index),
          });
        }
      }
    });
  }
  const tables = new Map<string, { decl: DataTableDecl; system: string }>();
  for (const def of used) for (const decl of def.data ?? []) tables.set(decl.name, { decl, system: def.name });

  // --- 4. data/<table>.json ----------------------------------------------------------------------
  /** Per "rows" table that could be read: its row ids and where each one is. */
  const rows = new Map<string, Map<string, { offset: number; path: string }>>();
  /** The tables whose file fits its schema. */
  const cleanTables = new Set<string>();
  for (const name of sorted(tables.keys())) {
    const { decl, system } = tables.get(name) as { decl: DataTableDecl; system: string };
    const file = `data/${name}.json`;
    if (!input.files.has(file)) {
      add(file, "layout", `is missing: the system "${system}" declares the data table "${name}"`);
      continue;
    }
    const doc = parse(file);
    if (doc === null) continue;
    if (check(doc, schemaOf(decl))) cleanTables.add(name);
    tableDocs.set(name, doc);
    if (decl.shape !== "rows" || doc.root.kind !== "array") continue;
    const ids = new Map<string, { offset: number; path: string }>();
    doc.root.items.forEach((item, index) => {
      const id = item.kind === "object" ? memberOf(item, "id")?.value : undefined;
      if (id?.kind === "string" && !ids.has(id.value)) ids.set(id.value, { offset: id.offset, path: memberPath(itemPath("$", index), "id") });
    });
    rows.set(name, ids);
  }
  for (const [file, role] of roles) {
    if (role.role === "table" && !tables.has(role.name) && systemsKnown) {
      add(file, "layout", `no system the game uses declares the data table "${role.name}" (declared: ${listed(tables.keys())})`);
    }
  }

  // --- 5. locales/<lang>.json --------------------------------------------------------------------
  /** Per locale that could be read: its string ids. */
  const strings = new Map<string, Set<string>>();
  let localeFiles = 0;
  for (const [file, role] of roles) {
    if (role.role !== "locale") continue;
    localeFiles += 1;
    const doc = parse(file);
    if (doc === null) continue;
    check(doc, LOCALE_SCHEMA);
    localeDocs.set(role.lang, doc);
    if (doc.root.kind === "object") strings.set(role.lang, new Set(doc.root.members.map((member) => member.key)));
  }
  if (localeFiles === 0) add("locales", "layout", "is missing: a game needs at least one locale, locales/<lang>.json");

  // --- 6. presentation ---------------------------------------------------------------------------
  for (const [file, role] of roles) {
    if (role.role !== "presentation") continue;
    const { slot } = role;
    if (slot.schema === null) {
      add(file, "layout", `there is no schema for ${presentationPath(slot, "<id>")} yet: the note "${slot.note}" adds it to packages/game-data/src/layout.ts`);
      continue;
    }
    const doc = parse(file);
    if (doc === null) continue;
    check(doc, slot.schema);
    presentationDocs.set(file, doc);
  }

  // --- 7. the strings the rows of a table must have (game.json: rowText) -----------------------
  /** Every string id the game uses, with the first place that uses it. */
  const needs = new Map<string, Site>();
  const need = (id: string, site: Site): void => {
    if (!needs.has(id)) needs.set(id, site);
  };
  const rowText = manifest !== null && root.kind === "object" ? memberOf(root, "rowText")?.value : undefined;
  if (rowText?.kind === "object") {
    for (const member of rowText.members) {
      const at = { offset: member.keyOffset, path: memberPath("$.rowText", member.key) };
      const declared = tables.get(member.key);
      if (declared === undefined) {
        if (systemsKnown) add("game.json", "ref", `no data table "${member.key}" (the game's systems declare: ${listed(tables.keys())})`, at);
        continue;
      }
      if (declared.decl.shape !== "rows") {
        add("game.json", "ref", `"${member.key}" is a record, not a table of rows: it has no rows to name`, at);
        continue;
      }
      // A table with a schema problem is fixed first: its row ids may not be ids at all.
      if (!cleanTables.has(member.key)) continue;
      const suffixes = member.value.kind === "array" ? member.value.items : [];
      for (const [rowId, site] of rows.get(member.key) ?? []) {
        for (const suffix of suffixes) {
          if (suffix.kind === "string") need(`${member.key}.${rowId}.${suffix.value}`, { file: `data/${member.key}.json`, ...site });
        }
      }
    }
  }

  // --- 8. references that resolve inside the game -----------------------------------------------
  for (const use of refs) {
    const spec = parseRef(use.ref);
    const at = { offset: use.offset, path: use.path };
    if (spec.kind === "row") {
      const declared = tables.get(spec.table);
      const ids = rows.get(spec.table);
      if (declared === undefined) {
        add(use.file, "ref", `refers to the data table "${spec.table}", which no system the game uses declares`, at);
      } else if (declared.decl.shape !== "rows") {
        add(use.file, "ref", `refers to "${spec.table}", which is a record, not a table of rows`, at);
      } else if (ids !== undefined && !ids.has(use.value)) {
        // A table file that is missing or broken is reported once, at the file.
        add(use.file, "ref", `no row "${use.value}" in the data table "${spec.table}" (data/${spec.table}.json has: ${listed(ids.keys())})`, at);
      }
    } else if (spec.kind === "table") {
      if (!tables.has(use.value) && systemsKnown) {
        add(use.file, "ref", `no data table "${use.value}" (the game's systems declare: ${listed(tables.keys())})`, at);
      }
    } else if (spec.kind === "system") {
      if (!registry.some((def) => def.name === use.value)) {
        add(use.file, "ref", `unknown system "${use.value}" (the engine has: ${listed(registry.map((def) => def.name))})`, at);
      }
    } else if (spec.kind === "string") {
      need(use.value, { file: use.file, ...at });
    } else if (spec.kind === "doc") {
      const slot = slots.find((candidate) => candidate.shape === "folder" && candidate.name === spec.slot);
      if (slot === undefined) {
        add(use.file, "ref", `the schema refers to the presentation folder "${spec.slot}", which is not registered in layout.ts`, at);
      } else if (!input.files.has(presentationPath(slot, use.value))) {
        add(use.file, "ref", `"${use.value}" does not resolve: ${presentationPath(slot, use.value)} does not exist`, at);
      }
    } else {
      external.push(use);
    }
  }

  // --- 9. strings: every string that is used, and every string any locale has, is in every locale
  const langs = sorted(strings.keys());
  for (const id of sorted(needs.keys())) {
    const site = needs.get(id) as Site;
    for (const lang of langs) {
      if (!(strings.get(lang) as Set<string>).has(id)) {
        add(site.file, "string", `the string "${id}" is missing in the locale "${lang}" (locales/${lang}.json)`, site);
      }
    }
  }
  const elsewhere = new Map<string, string>();
  for (const lang of langs) {
    for (const id of strings.get(lang) as Set<string>) if (!needs.has(id) && !elsewhere.has(id)) elsewhere.set(id, lang);
  }
  for (const id of sorted(elsewhere.keys())) {
    for (const lang of langs) {
      if (!(strings.get(lang) as Set<string>).has(id)) {
        add(`locales/${lang}.json`, "string", `the string is missing in this locale (locales/${elsewhere.get(id) as string}.json has it)`, {
          offset: 0,
          path: memberPath("$", id),
        });
      }
    }
  }

  return finish();
}

/**
 * Checks the ids that live outside the game against the catalog. If the game then has no
 * problem at all, the sim is created once from its data (so whatever the sim checks is checked
 * here too) and the game comes back loaded.
 */
export function resolveGame(analysis: GameAnalysis, catalog: Catalog): ValidationResult {
  const state = STATES.get(analysis);
  if (state === undefined) throw new Error("resolveGame: the analysis does not come from analyseGame");
  const problems = [...state.problems];
  const add = problemAdder(state.input, problems);
  const palettes = new Set<string>();
  const assets = new Set<string>();
  const sounds = new Set<string>();

  for (const use of state.external) {
    const spec = parseRef(use.ref);
    const at = { offset: use.offset, path: use.path };
    if (spec.kind === "palette") {
      palettes.add(use.value);
      if (!catalog.palettes.has(use.value)) {
        add(use.file, "ref", `no palette "${use.value}": assets/palettes/${use.value}.json does not exist (palettes: ${listed(catalog.palettes)})`, at);
      }
    } else if (spec.kind === "asset") {
      assets.add(use.value);
      const asset = catalog.assets.get(use.value);
      if (asset === undefined) add(use.file, "ref", `no asset "${use.value}": assets/${use.value}/gen.ts does not exist`, at);
      else if ("error" in asset) add(use.file, "ref", `the asset "${use.value}" cannot be loaded: ${asset.error}`, at);
      else if (spec.assetKind !== null && asset.kind !== spec.assetKind) {
        add(use.file, "ref", `the asset "${use.value}" is of kind "${asset.kind}", and "${spec.assetKind}" is needed here`, at);
      }
    } else if (spec.kind === "clip") {
      const owner = use.parent === null ? undefined : memberOf(use.parent, spec.field)?.value;
      if (owner?.kind !== "string") {
        add(use.file, "ref", `the clip belongs to the asset in the field "${spec.field}", which is missing here`, at);
        continue;
      }
      const asset = catalog.assets.get(owner.value);
      // An asset that is missing or broken is reported at its own field.
      if (asset !== undefined && !("error" in asset) && !asset.clips.includes(use.value)) {
        add(use.file, "ref", `the asset "${owner.value}" has no clip "${use.value}" (clips: ${listed(asset.clips)})`, at);
      }
    } else if (spec.kind === "sound") {
      sounds.add(use.value);
      if (!catalog.sounds.has(use.value)) add(use.file, "ref", `no sound "${use.value}" (sounds: ${listed(catalog.sounds)})`, at);
    }
  }

  let game: LoadedGame | null = null;
  if (problems.length === 0 && state.manifest !== null) {
    const { manifest } = state;
    const tables: Record<string, unknown> = {};
    for (const name of sorted(state.tableDocs.keys())) tables[name] = nodeValue((state.tableDocs.get(name) as Doc).root);
    const simData: SimData = { systems: manifest.systems, tables };
    try {
      const sim = createSim({ data: simData, seed: 0, systems: state.registry });
      const locales = new Map<string, Readonly<Record<string, string>>>();
      for (const lang of sorted(state.localeDocs.keys())) {
        const text = nodeValue((state.localeDocs.get(lang) as Doc).root) as Record<string, string>;
        locales.set(lang, Object.fromEntries(sorted(Object.keys(text)).map((id) => [id, text[id] as string])));
      }
      const presentation = new Map<string, unknown>();
      for (const file of sorted(state.presentationDocs.keys())) presentation.set(file, nodeValue((state.presentationDocs.get(file) as Doc).root));
      game = {
        dir: state.input.dir,
        manifest,
        simData,
        simDataHash: sim.simDataHash,
        locales,
        presentation,
        palettes: sorted(palettes),
        assets: sorted(assets),
        sounds: sorted(sounds),
      };
    } catch (error) {
      if (!(error instanceof SimError)) throw error;
      add("game.json", "sim", `the sim refuses the game's data: ${error.message}`);
    }
  }
  return { problems: problems.sort(compareProblems), game };
}

/** `analyseGame` and `resolveGame` in one call, for a host that already has the catalog. */
export function validateGame(input: GameInput, catalog: Catalog): ValidationResult {
  return resolveGame(analyseGame(input), catalog);
}
