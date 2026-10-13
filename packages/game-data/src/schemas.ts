// The schemas of a game's source files and of the package, and the id rules they share.
//
// game.json and the locale files have a fixed schema. The schema of a data table is not
// written by hand: it is derived from the declaration of the table in its sim system
// (`dataRows("items", { price: field.int(1, 100000), ... })`), so the data files, the sim and
// the schema can never disagree. Presentation schemas (scenes, UI, FX and audio cues) are
// registered in layout.ts by the notes that add them.

import type { DataTableDecl, FieldType } from "@whz/sim";
import { compileSchema } from "./schema.ts";
import type { CompiledSchema, ObjectSchema, Schema } from "./schema.ts";

/** The version of the source layout and its schemas. A game names it in game.json. */
export const SCHEMA_VERSION = 1;

/** The `format` of a package's game.json. A change of the package layout changes the number. */
export const PACKAGE_FORMAT = "wz.game-package/1";

// --- the id rules ----------------------------------------------------------------------------
// All ids are ASCII, so they sort, hash and compare the same in every language (never by
// locale), and they are safe as file names and in URLs.

/** A game id, and the id of a scene or a UI file: lowercase words joined by dashes. It is a folder or file name. */
export const GAME_ID_PATTERN = "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$";
/** The id of a row, a system, a command or an event: the sim's `isId`. */
export const ROW_ID_PATTERN = "^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$";
/** The name of a data table or a field: the sim's `isName`, a camelCase identifier. */
export const NAME_PATTERN = "^[a-z][A-Za-z0-9]*$";
/** The id of a display text: names and ids joined by dots (`items.apple.name`, `ui.shop.open-button`). */
export const STRING_ID_PATTERN = "^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$";
/** A locale: a language, and a region if needed (`en`, `cs`, `pt-BR`). */
export const LOCALE_PATTERN = "^[a-z]{2,3}(?:-[A-Z]{2})?$";
/** A palette id: the file name under assets/palettes/. */
export const PALETTE_ID_PATTERN = "^[a-z0-9]+(?:-[a-z0-9]+)*$";
/** An asset id: its folder under assets/, `<pack>/<name>`. */
export const ASSET_ID_PATTERN = "^[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)+$";
/** A content hash or the simDataHash: 16 lowercase hex digits. */
export const HASH_PATTERN = "^[0-9a-f]{16}$";
/** The path of a file inside a package. */
export const PACKAGE_PATH_PATTERN = "^[A-Za-z0-9_-][A-Za-z0-9._-]*(?:/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$";

/** Ids are at most this long (the sim's limit). */
export const MAX_ID_LENGTH = 64;
/** A string id is a table name, a row id and a suffix joined by dots, so it may be longer. */
export const MAX_STRING_ID_LENGTH = 200;

/** game.json, as written by hand. */
export interface GameManifest {
  readonly schemaVersion: number;
  /** The folder name of the game under games/. */
  readonly id: string;
  /** The working title, for tools and the studio. Text the player reads is in the locales. */
  readonly title: string;
  /** The native resolution in pixels; the player scales it by whole numbers. */
  readonly resolution: { readonly width: number; readonly height: number };
  /** The game's palette: assets/palettes/<id>.json. */
  readonly palette: string;
  /** The engine systems the game uses. */
  readonly systems: readonly string[];
  /** The scene the game starts in: scenes/<id>.json. */
  readonly entryScene?: string;
  /**
   * The display texts every row of a data table has: `{ "items": ["name"] }` means each row
   * `<id>` of `items` has the string `items.<id>.name` in every locale.
   */
  readonly rowText?: Readonly<Record<string, readonly string[]>>;
}

const GAME_PROPERTIES = {
  schemaVersion: { type: "integer", minimum: SCHEMA_VERSION, maximum: SCHEMA_VERSION, description: "The version of the source layout." },
  id: { type: "string", pattern: GAME_ID_PATTERN, maxLength: MAX_ID_LENGTH, description: "the game id: lowercase words joined by dashes, the name of the game's folder" },
  title: { type: "string", minLength: 1, maxLength: 80, "x-text": true, description: "the working title, for tools; text the player reads is in the locales" },
  resolution: {
    type: "object",
    description: "The native resolution in pixels.",
    properties: {
      width: { type: "integer", minimum: 16, maximum: 4096 },
      height: { type: "integer", minimum: 16, maximum: 4096 },
    },
    required: ["width", "height"],
    additionalProperties: false,
  },
  palette: { type: "string", pattern: PALETTE_ID_PATTERN, maxLength: MAX_ID_LENGTH, "x-ref": "palette", description: "a palette id" },
  systems: {
    type: "array",
    description: "The engine systems the game uses; empty while a game's systems are not written yet.",
    items: { type: "string", pattern: ROW_ID_PATTERN, maxLength: MAX_ID_LENGTH, "x-ref": "system", description: "a system id" },
    uniqueItems: true,
  },
  entryScene: { type: "string", pattern: GAME_ID_PATTERN, maxLength: MAX_ID_LENGTH, "x-ref": "doc:scenes", description: "a scene id" },
  rowText: {
    type: "object",
    description: "Per data table: the display texts every row has, as string id suffixes.",
    additionalProperties: {
      type: "array",
      items: { type: "string", pattern: NAME_PATTERN, maxLength: MAX_ID_LENGTH, description: "a text suffix: a camelCase name" },
      minItems: 1,
      uniqueItems: true,
    },
    propertyNames: { pattern: NAME_PATTERN, maxLength: MAX_ID_LENGTH, description: "a data table name" },
  },
} as const satisfies Record<string, Schema>;

const GAME_REQUIRED = ["schemaVersion", "id", "title", "resolution", "palette", "systems"] as const;

/** The schema of `games/<id>/game.json`. */
export const GAME_SCHEMA: CompiledSchema = compileSchema("game", {
  type: "object",
  description: "A game: what it is called, what it looks like and which engine systems it uses.",
  properties: GAME_PROPERTIES,
  required: GAME_REQUIRED,
  additionalProperties: false,
});

/** The schema of `games/<id>/locales/<lang>.json`: display text by string id. */
export const LOCALE_SCHEMA: CompiledSchema = compileSchema("locale", {
  type: "object",
  description: "Display text by string id.",
  additionalProperties: { type: "string", minLength: 1, maxLength: 2000, "x-text": true, description: "display text" },
  propertyNames: { pattern: STRING_ID_PATTERN, maxLength: MAX_STRING_ID_LENGTH, description: "a string id: names and ids joined by dots" },
});

function fieldSchema(type: FieldType): Schema {
  if (type.kind === "int") return { type: "integer", minimum: type.min, maximum: type.max };
  if (type.kind === "bool") return { type: "boolean" };
  const id = { type: "string", pattern: ROW_ID_PATTERN, maxLength: MAX_ID_LENGTH } as const;
  return type.ref === null
    ? { ...id, description: "an id" }
    : { ...id, "x-ref": `row:${type.ref}`, description: `the id of a row of ${type.ref}` };
}

/**
 * The schema of `games/<id>/data/<name>.json`, from the table's declaration in its system: an
 * array of rows with a unique `id` for a "rows" table, one object for a "record" table.
 */
export function tableSchema(decl: DataTableDecl): CompiledSchema {
  const properties: Record<string, Schema> = {};
  if (decl.shape === "rows") {
    properties["id"] = { type: "string", pattern: ROW_ID_PATTERN, maxLength: MAX_ID_LENGTH, description: "a row id: lowercase ASCII words joined by . - or _" };
  }
  const names = Object.keys(decl.fields).sort();
  for (const name of names) properties[name] = fieldSchema(decl.fields[name] as FieldType);
  const row: ObjectSchema = {
    type: "object",
    properties,
    required: decl.shape === "rows" ? ["id", ...names] : names,
    additionalProperties: false,
  };
  return compileSchema(`table/${decl.name}`, decl.shape === "rows" ? { type: "array", items: row, "x-unique": "id" } : row);
}

/** What kind of file an entry of the asset manifest is. */
export const PACKAGE_FILE_KINDS = ["atlas", "audio", "font", "locale", "palette", "presentation"] as const;
export type PackageFileKind = (typeof PACKAGE_FILE_KINDS)[number];

/** One file of a package, as the asset manifest lists it. */
export interface PackageFile {
  readonly path: string;
  readonly kind: PackageFileKind;
  /** Its size in bytes. */
  readonly bytes: number;
  /** FNV-1a 64 over its bytes, 16 hex digits. */
  readonly hash: string;
}

/** Everything in a package that does not affect the simulation. */
export interface AssetManifest {
  /** One hash over `files`: it changes when any listed file changes, comes or goes. */
  readonly hash: string;
  /** In ascending order of `path`. */
  readonly files: readonly PackageFile[];
}

/** The game.json of a package: the game's own fields, plus what `pack` computed. */
export interface PackageManifest extends GameManifest {
  readonly format: typeof PACKAGE_FORMAT;
  /** The locales of the package, in ascending order. */
  readonly locales: readonly string[];
  /** The hash of sim.json: everything that affects the simulation, and nothing else. */
  readonly simDataHash: string;
  readonly assetManifest: AssetManifest;
}

/** The schema of the `game.json` of a package. */
export const PACKAGE_SCHEMA: CompiledSchema = compileSchema("package", {
  type: "object",
  description: "The manifest of a compiled game package.",
  properties: {
    ...GAME_PROPERTIES,
    format: { type: "string", const: PACKAGE_FORMAT },
    locales: {
      type: "array",
      items: { type: "string", pattern: LOCALE_PATTERN, description: "a locale" },
      minItems: 1,
      uniqueItems: true,
    },
    simDataHash: { type: "string", pattern: HASH_PATTERN, description: "16 hex digits" },
    assetManifest: {
      type: "object",
      properties: {
        hash: { type: "string", pattern: HASH_PATTERN, description: "16 hex digits" },
        files: {
          type: "array",
          "x-unique": "path",
          items: {
            type: "object",
            properties: {
              path: { type: "string", pattern: PACKAGE_PATH_PATTERN, maxLength: 240, description: "a path inside the package" },
              kind: { type: "string", enum: PACKAGE_FILE_KINDS },
              bytes: { type: "integer", minimum: 0, maximum: 0x7fffffff },
              hash: { type: "string", pattern: HASH_PATTERN, description: "16 hex digits" },
            },
            required: ["path", "kind", "bytes", "hash"],
            additionalProperties: false,
          },
        },
      },
      required: ["hash", "files"],
      additionalProperties: false,
    },
  },
  required: [...GAME_REQUIRED, "format", "locales", "simDataHash", "assetManifest"],
  additionalProperties: false,
});
