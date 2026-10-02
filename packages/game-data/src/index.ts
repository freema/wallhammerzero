// @whz/game-data: what a game is on disk, and the package any player loads. Pure: no DOM, no
// Node, no I/O (the file side is @whz/game-data/node). The layout, the id rules and how to add
// a table are in docs/game-data.md; the API is in README.md.

export { CanonicalError, canonicalBytes, contentHash, toCanonicalJson, utf8Bytes, utf8Text } from "./canonical.ts";
export { JsonParseError, MAX_JSON_DEPTH, itemPath, memberOf, memberPath, nodeValue, parseJson, positionAt } from "./json.ts";
export type { ArrayNode, BooleanNode, JsonNode, Member, NullNode, NumberNode, ObjectNode, StringNode } from "./json.ts";
export { classifyFile, layoutSummary, PRESENTATION, presentationPath } from "./layout.ts";
export type { FileRole, PresentationSlot } from "./layout.ts";
export { buildPackage, manifestHash, openPackage, PACKAGE_MANIFEST_FILE, PACKAGE_SIM_FILE } from "./pack.ts";
export type { ExternalFile, GamePackage, OpenedPackage, OpenResult } from "./pack.ts";
export { EMPTY_CATALOG, parseRef } from "./refs.ts";
export type { Catalog, CatalogAsset, RefSpec } from "./refs.ts";
export { compileSchema, JSON_SCHEMA_DIALECT, SchemaError } from "./schema.ts";
export type {
  ArraySchema,
  BooleanSchema,
  CompiledSchema,
  IntegerSchema,
  ObjectSchema,
  RefSchema,
  RefUse,
  Schema,
  SchemaCheck,
  SchemaIssue,
  StringSchema,
  UnionSchema,
} from "./schema.ts";
export {
  ASSET_ID_PATTERN,
  GAME_ID_PATTERN,
  GAME_SCHEMA,
  HASH_PATTERN,
  LOCALE_PATTERN,
  LOCALE_SCHEMA,
  MAX_ID_LENGTH,
  MAX_STRING_ID_LENGTH,
  NAME_PATTERN,
  PACKAGE_FILE_KINDS,
  PACKAGE_FORMAT,
  PACKAGE_PATH_PATTERN,
  PACKAGE_SCHEMA,
  PALETTE_ID_PATTERN,
  ROW_ID_PATTERN,
  SCHEMA_VERSION,
  STRING_ID_PATTERN,
  tableSchema,
} from "./schemas.ts";
export type { AssetManifest, GameManifest, PackageFile, PackageFileKind, PackageManifest } from "./schemas.ts";
export { analyseGame, compareProblems, formatProblem, resolveGame, validateGame } from "./validate.ts";
export type { GameAnalysis, GameInput, LoadedGame, Problem, Rule, ValidationResult } from "./validate.ts";
