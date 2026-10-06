// Shared by the tests: the checkout, the example game, a small game in memory, and a system
// set and presentation slots made for the tests (row references, every reference kind).

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dataRecord, dataRows, field } from "@whz/sim";
import type { SystemDef } from "@whz/sim";
import { afterAll } from "vitest";
import { compileSchema } from "../src/index.ts";
import type { Catalog, GameInput, PresentationSlot, Problem } from "../src/index.ts";
import { openGameProject } from "../src/node/index.ts";
import type { GameProject } from "../src/node/index.ts";

export const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/** The checkout. */
export const REPO = here("../../../");
export const EXAMPLE = "games/examples/counter-shop";
export const FIXTURES = "packages/game-data/test/fixtures/games";
/** A small assets folder (one palette, three assets) for the pack tests. */
export const FIXTURE_ASSETS = "packages/game-data/test/fixtures/assets";
export const GOLDEN_REPLAY = join(REPO, "packages/sim/golden/counter-shop.replay.json");
export const GOLDEN_DATA = join(REPO, "packages/sim/golden/counter-shop.data.json");

/** A scratch folder that is removed after the tests of the file. */
export function scratch(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `whz-${name}-`));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/**
 * A project whose games folder is a scratch copy of the example game and whose outputs go to
 * a scratch folder; assets and palettes are the checkout's. `edit` changes the copy first.
 */
export function exampleCopy(dir: string, edit: (gameDir: string) => void = () => {}): GameProject {
  const games = join(dir, "games");
  rmSync(games, { recursive: true, force: true });
  cpSync(join(REPO, EXAMPLE), join(games, "counter-shop"), { recursive: true });
  edit(join(games, "counter-shop"));
  return openGameProject({ root: REPO, games, out: join(dir, "build") });
}

/** Replaces `from` by `to` in a file; the text must be there exactly once. */
export function replaceInFile(file: string, from: string, to: string): void {
  const text = readFileSync(file, "utf8");
  if (text.split(from).length !== 2) throw new Error(`${file}: expected exactly one ${JSON.stringify(from)}`);
  writeFileSync(file, text.replace(from, to));
}

// --- a small game in memory ----------------------------------------------------------------

/** The files of a small valid game on the engine's `shop.arrivals` system. */
export const MINI: Readonly<Record<string, string>> = {
  "game.json": JSON.stringify(
    {
      schemaVersion: 1,
      id: "mini",
      title: "Mini",
      resolution: { width: 320, height: 180 },
      palette: "example",
      systems: ["shop.arrivals"],
      rowText: { customerKinds: ["name"] },
    },
    null,
    2,
  ),
  "data/arrivals.json": '{ "perMille": 220, "queueLimit": 6 }\n',
  "data/customerKinds.json":
    '[\n  { "id": "student", "weight": 5, "budgetMin": 2, "budgetMax": 6, "patience": 12 },\n  { "id": "tourist", "weight": 1, "budgetMin": 10, "budgetMax": 40, "patience": 6 }\n]\n',
  "locales/en.json": '{\n  "customerKinds.student.name": "Student",\n  "customerKinds.tourist.name": "Tourist"\n}\n',
  "locales/cs.json": '{\n  "customerKinds.student.name": "Student",\n  "customerKinds.tourist.name": "Turista"\n}\n',
};

/** A game input from `MINI` with files replaced, added (a string) or removed (`null`). */
export function mini(changes: Readonly<Record<string, string | null>> = {}, extra: Partial<GameInput> = {}): GameInput {
  const files = new Map(Object.entries(MINI));
  for (const [path, text] of Object.entries(changes)) {
    if (text === null) files.delete(path);
    else files.set(path, text);
  }
  return { dir: "games/mini", files, ...extra };
}

/** `MINI`'s game.json with fields changed (`undefined` removes one). */
export function miniGame(changes: Readonly<Record<string, unknown>>): string {
  return JSON.stringify({ ...(JSON.parse(MINI["game.json"] as string) as Record<string, unknown>), ...changes }, null, 2);
}

/** A catalog with the checkout's example palette and one sprite. */
export const CATALOG: Catalog = {
  palettes: new Set(["example"]),
  assets: new Map([
    ["examples/blinking-dot", { kind: "sprite", clips: ["blink"], facings: ["default"] }],
    ["examples/floor", { kind: "tiles", clips: ["idle"], facings: ["default"] }],
    ["examples/broken", { error: "the program throws" }],
  ]),
  sounds: new Set(["examples/coin"]),
};

/** `<file>: <path>: [<rule>]` of each problem, for short assertions. */
export function brief(problems: readonly Problem[]): string[] {
  return problems.map((problem) => `${problem.file.replace(/^games\/mini\//, "")} ${problem.path} [${problem.rule}]`);
}

// --- the "lab" system: data tables that refer to each other ---------------------------------

export const labKinds = dataRows("kinds", { size: field.int(1, 9) });
export const labRecipes = dataRows("recipes", { input: field.ref("kinds"), output: field.ref("kinds"), ticks: field.int(1, 100) });
export const labConfig = dataRecord("lab", { start: field.ref("kinds"), fast: field.bool, tag: field.id });

export const LAB_SYSTEMS: readonly SystemDef[] = [{ name: "lab", data: [labKinds, labRecipes, labConfig] }];

export const LAB: Readonly<Record<string, string>> = {
  "game.json": JSON.stringify({ schemaVersion: 1, id: "lab", title: "Lab", resolution: { width: 64, height: 64 }, palette: "example", systems: ["lab"] }),
  "data/kinds.json": '[\n  { "id": "ore", "size": 1 },\n  { "id": "bar", "size": 2 }\n]\n',
  "data/recipes.json": '[\n  { "id": "smelt", "input": "ore", "output": "bar", "ticks": 5 }\n]\n',
  "data/lab.json": '{ "start": "ore", "fast": false, "tag": "any.thing" }\n',
  "locales/en.json": "{}\n",
};

export function lab(changes: Readonly<Record<string, string | null>> = {}): GameInput {
  const files = new Map(Object.entries(LAB));
  for (const [path, text] of Object.entries(changes)) {
    if (text === null) files.delete(path);
    else files.set(path, text);
  }
  return { dir: "games/lab", files, systems: LAB_SYSTEMS };
}

// --- presentation slots for the tests: every reference kind ---------------------------------

/** A stand-in for the view bindings a later note adds: one file, with every external reference kind. */
export const VIEW_SCHEMA = compileSchema("view", {
  type: "object",
  properties: {
    title: { type: "string", "x-ref": "string" },
    start: { type: "string", "x-ref": "doc:scenes" },
    table: { type: "string", "x-ref": "table" },
    bindings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", "x-ref": "row:customerKinds" },
          sprite: { type: "string", "x-ref": "asset:sprite" },
          clip: { type: "string", "x-ref": "clip:sprite" },
          icon: { type: "string", "x-ref": "asset" },
          sound: { type: "string", "x-ref": "sound" },
        },
        required: ["kind"],
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
});

export const SCENE_SCHEMA = compileSchema("scene", {
  type: "object",
  properties: { tileSize: { type: "integer", minimum: 8, maximum: 64 }, floor: { type: "string", "x-ref": "asset:tiles" } },
  required: ["tileSize"],
  additionalProperties: false,
});

export const TEST_SLOTS: readonly PresentationSlot[] = [
  { name: "scenes", shape: "folder", schema: SCENE_SCHEMA, note: "test" },
  { name: "view", shape: "file", schema: VIEW_SCHEMA, note: "test" },
  { name: "fx", shape: "file", schema: null, note: "fx-emitters" },
];
