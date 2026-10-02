// The game package: what `pack` writes and what any player loads (D10). Pure functions over
// bytes; the Node side reads and writes the files.
//
//   game.json            the manifest: the game's own fields, `simDataHash`, `assetManifest`
//   sim.json             { systems, tables }: exactly what the sim gets, and nothing else
//   locales/<lang>.json  display text by string id
//   palettes/<id>.json   the palettes the game names
//   assets/<id>/...      the baked atlas and sheets of every asset the game refers to
//   scenes/, ui/, fx.json, audio.json   presentation documents
//
// Every JSON file is canonical (canonical.ts), so packing the same game twice gives the same
// bytes. There are two hashes, after EU4's checksum and research/multiplatform.md §4.1:
//   - `simDataHash` covers sim.json: everything that affects the simulation. Replays,
//     snapshots and saves carry it. A new translation or a recoloured sprite does not change it.
//   - `assetManifest` lists every other file with its size and content hash, and has one hash
//     over that list. It changes when anything a player shows or plays changes.

import { hashSimData, SimError } from "@whz/sim";
import type { SimData } from "@whz/sim";
import { canonicalBytes, CanonicalError, contentHash, toCanonicalJson, utf8Bytes, utf8Text } from "./canonical.ts";
import { JsonParseError, nodeValue, parseJson } from "./json.ts";
import { PACKAGE_FORMAT, PACKAGE_PATH_PATTERN, PACKAGE_SCHEMA } from "./schemas.ts";
import type { AssetManifest, PackageFile, PackageFileKind, PackageManifest } from "./schemas.ts";
import type { LoadedGame } from "./validate.ts";

/** The manifest of a package. */
export const PACKAGE_MANIFEST_FILE = "game.json";
/** The sim data of a package. */
export const PACKAGE_SIM_FILE = "sim.json";

/** A file that comes from outside the game's folder: a palette, a baked atlas, a sheet, a sound. */
export interface ExternalFile {
  /** Its path in the package: `palettes/example.json`, `assets/examples/blinking-dot/atlas.json`. */
  readonly path: string;
  readonly kind: PackageFileKind;
  readonly bytes: Uint8Array;
}

/** A package in memory. */
export interface GamePackage {
  readonly manifest: PackageManifest;
  /** Every file of the package by path, in ascending order of path. `game.json` and `sim.json` included. */
  readonly files: ReadonlyMap<string, Uint8Array>;
}

const PATH = new RegExp(PACKAGE_PATH_PATTERN, "u");

function checkPath(path: string): void {
  if (!PATH.test(path) || path.split("/").some((part) => part === "." || part === "..")) {
    throw new Error(`package: ${JSON.stringify(path)} is not a path inside a package (ASCII letters, digits, . _ - and /)`);
  }
  if (path === PACKAGE_MANIFEST_FILE || path === PACKAGE_SIM_FILE) throw new Error(`package: ${path} is written by the pack step itself`);
}

/** The hash over the file list of an asset manifest. */
export function manifestHash(files: readonly PackageFile[]): string {
  return contentHash(canonicalBytes(files));
}

/**
 * Builds the package of a validated game. `external` are the files that are not in the game's
 * folder (the Node side bakes and reads them). Deterministic: the same game and the same
 * external files give the same bytes.
 */
export function buildPackage(game: LoadedGame, external: readonly ExternalFile[] = []): GamePackage {
  const listed = new Map<string, { kind: PackageFileKind; bytes: Uint8Array }>();
  const put = (path: string, kind: PackageFileKind, bytes: Uint8Array): void => {
    checkPath(path);
    if (listed.has(path)) throw new Error(`package: two files want the path ${path}`);
    listed.set(path, { kind, bytes });
  };
  for (const [lang, text] of game.locales) put(`locales/${lang}.json`, "locale", canonicalBytes(text));
  for (const [path, value] of game.presentation) put(path, "presentation", canonicalBytes(value));
  for (const file of external) put(file.path, file.kind, file.bytes);

  const paths = [...listed.keys()].sort();
  const entries: PackageFile[] = paths.map((path) => {
    const { kind, bytes } = listed.get(path) as { kind: PackageFileKind; bytes: Uint8Array };
    return { path, kind, bytes: bytes.length, hash: contentHash(bytes) };
  });
  const assetManifest: AssetManifest = { hash: manifestHash(entries), files: entries };

  const simBytes = canonicalBytes(game.simData);
  const simDataHash = hashSimData(game.simData);
  if (simDataHash !== game.simDataHash) throw new Error("package: the game's simDataHash is not the hash of its sim data");

  const manifest: PackageManifest = {
    ...game.manifest,
    format: PACKAGE_FORMAT,
    locales: [...game.locales.keys()].sort(),
    simDataHash,
    assetManifest,
  };

  const files = new Map<string, Uint8Array>();
  for (const path of [...paths, PACKAGE_MANIFEST_FILE, PACKAGE_SIM_FILE].sort()) {
    if (path === PACKAGE_MANIFEST_FILE) files.set(path, canonicalBytes(manifest));
    else if (path === PACKAGE_SIM_FILE) files.set(path, simBytes);
    else files.set(path, (listed.get(path) as { bytes: Uint8Array }).bytes);
  }
  return { manifest, files };
}

/** A package that was opened and verified. */
export interface OpenedPackage {
  readonly manifest: PackageManifest;
  /** The content of sim.json: pass it to `createSim`. Its hash is `manifest.simDataHash`. */
  readonly simData: SimData;
  readonly files: ReadonlyMap<string, Uint8Array>;
}

export interface OpenResult {
  /** What is wrong with the package, one line each. Empty when it verified. */
  readonly problems: readonly string[];
  /** The package, or `null` if there is any problem. */
  readonly opened: OpenedPackage | null;
}

function readCanonical(files: ReadonlyMap<string, Uint8Array>, path: string, problems: string[]): unknown {
  const bytes = files.get(path);
  if (bytes === undefined) {
    problems.push(`${path} is missing`);
    return undefined;
  }
  try {
    const value = nodeValue(parseJson(utf8Text(bytes)));
    const canonical = utf8Bytes(toCanonicalJson(value));
    if (canonical.length !== bytes.length || canonical.some((byte, index) => byte !== bytes[index])) {
      problems.push(`${path} is not canonical JSON: a package is written by the pack step, never by hand`);
      return undefined;
    }
    return value;
  } catch (error) {
    if (!(error instanceof JsonParseError) && !(error instanceof CanonicalError)) throw error;
    problems.push(`${path} cannot be read: ${error.message}`);
    return undefined;
  }
}

/**
 * Opens a package and verifies it: the manifest fits its schema, sim.json hashes to
 * `simDataHash`, and the files are exactly the ones the asset manifest lists, each with its
 * size and hash. A player calls this before it creates the sim.
 */
export function openPackage(files: ReadonlyMap<string, Uint8Array>): OpenResult {
  const problems: string[] = [];
  const manifestValue = readCanonical(files, PACKAGE_MANIFEST_FILE, problems);
  if (manifestValue === undefined) return { problems, opened: null };

  const format = (manifestValue as { format?: unknown } | null)?.format;
  if (format !== PACKAGE_FORMAT) {
    problems.push(`${PACKAGE_MANIFEST_FILE}: the format is ${JSON.stringify(format)}, and this game-data reads ${JSON.stringify(PACKAGE_FORMAT)}`);
    return { problems, opened: null };
  }
  const check = PACKAGE_SCHEMA.check(parseJson(toCanonicalJson(manifestValue)));
  for (const issue of check.issues) problems.push(`${PACKAGE_MANIFEST_FILE}: ${issue.path}: ${issue.message}`);
  if (problems.length > 0) return { problems, opened: null };
  const manifest = manifestValue as PackageManifest;

  const simData = readCanonical(files, PACKAGE_SIM_FILE, problems) as SimData | undefined;
  if (simData !== undefined) {
    try {
      const hash = hashSimData(simData);
      if (hash !== manifest.simDataHash) problems.push(`${PACKAGE_SIM_FILE} hashes to ${hash}, and the manifest says simDataHash ${manifest.simDataHash}`);
    } catch (error) {
      if (!(error instanceof SimError)) throw error;
      problems.push(`${PACKAGE_SIM_FILE} is not sim data: ${error.message}`);
    }
  }

  const { assetManifest } = manifest;
  if (manifestHash(assetManifest.files) !== assetManifest.hash) problems.push("assetManifest.hash is not the hash of its file list");
  const listed = new Set<string>([PACKAGE_MANIFEST_FILE, PACKAGE_SIM_FILE]);
  for (const entry of assetManifest.files) {
    listed.add(entry.path);
    const bytes = files.get(entry.path);
    if (bytes === undefined) problems.push(`${entry.path} is in the asset manifest and not in the package`);
    else if (bytes.length !== entry.bytes || contentHash(bytes) !== entry.hash) {
      problems.push(`${entry.path} is not the file the asset manifest lists (${bytes.length} bytes, hash ${contentHash(bytes)}; listed: ${entry.bytes} bytes, hash ${entry.hash})`);
    }
  }
  for (const path of [...files.keys()].sort()) {
    if (!listed.has(path)) problems.push(`${path} is in the package and not in the asset manifest`);
  }
  for (const lang of manifest.locales) {
    if (!assetManifest.files.some((entry) => entry.path === `locales/${lang}.json` && entry.kind === "locale")) {
      problems.push(`the manifest lists the locale "${lang}", and locales/${lang}.json is not in the asset manifest`);
    }
  }

  if (problems.length > 0 || simData === undefined) return { problems, opened: null };
  return { problems, opened: { manifest, simData, files } };
}
