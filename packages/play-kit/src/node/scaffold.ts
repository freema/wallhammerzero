// The scaffold of a new game: games/<id>/ (game.json, README, STATE.md), the package
// packages/<id>-play/ (vite, the hook, a smoke script) and a Compose service with its own port.
// It refuses to overwrite anything.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { gameJson, gameReadme, indexHtml, mainTs, packageJson, packageReadme, smokeScript, stateMd, tsconfig, viteConfig } from "./templates.ts";
import type { GameSpec } from "./templates.ts";

export const GAME_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
/** The Compose comment the new service goes above. */
const COMPOSE_MARKER = "  # Port convention";
const FIRST_PORT = 4300;

export class ScaffoldError extends Error {}

/** The next free default port: above every default in compose.yaml, in steps of 100. */
export function nextPort(compose: string): number {
  const used = [...compose.matchAll(/:-(\d+)\}/g)].map((m) => Number(m[1]));
  const top = Math.max(FIRST_PORT - 100, ...used);
  return Math.ceil((top + 1) / 100) * 100;
}

export function portVariable(id: string): string {
  return `WHZ_${id.toUpperCase().replace(/-/g, "_")}_PORT`;
}

/** compose.yaml with the game's service added above the port-convention comment. */
export function withComposeService(compose: string, g: GameSpec): string {
  if (new RegExp(`^  ${g.id}:$`, "m").test(compose)) throw new ScaffoldError(`compose.yaml already has a service "${g.id}"`);
  const at = compose.indexOf(COMPOSE_MARKER);
  if (at < 0) throw new ScaffoldError(`compose.yaml has no "${COMPOSE_MARKER.trim()}" comment to put the service above`);
  const service = [
    `  # ${g.title} (games/${g.id}): \`./dev compose up ${g.id}\`, then http://127.0.0.1:${g.port}.`,
    `  ${g.id}:`,
    "    <<: *node-service",
    "    network_mode: bridge",
    `    command: ["npm", "run", "dev", "--workspace", "@whz/${g.id}-play"]`,
    "    ports:",
    `      - "127.0.0.1:\${${portVariable(g.id)}:-${g.port}}:${g.port}"`,
    "",
    "",
  ].join("\n");
  return compose.slice(0, at) + service + compose.slice(at);
}

/** The files to write, by path relative to the repo root. */
export function scaffoldFiles(g: GameSpec, date: string): Map<string, string> {
  const pkg = `packages/${g.id}-play`;
  const game = `games/${g.id}`;
  return new Map([
    [`${game}/game.json`, gameJson(g)],
    [`${game}/README.md`, gameReadme(g)],
    [`${game}/STATE.md`, stateMd(g, date)],
    // A game needs at least one locale; text the player reads goes here by string id.
    [`${game}/locales/en.json`, "{}\n"],
    [`${pkg}/package.json`, packageJson(g)],
    [`${pkg}/tsconfig.json`, tsconfig()],
    [`${pkg}/vite.config.ts`, viteConfig(g)],
    [`${pkg}/index.html`, indexHtml(g)],
    [`${pkg}/src/main.ts`, mainTs(g)],
    [`${pkg}/play/smoke.json`, smokeScript(g)],
    [`${pkg}/README.md`, packageReadme(g)],
  ]);
}

/** Write a new game into the repo at `root`. Returns the paths written, compose.yaml last. */
export function scaffoldGame(root: string, g: GameSpec, date: string): string[] {
  if (!GAME_ID.test(g.id)) throw new ScaffoldError(`"${g.id}" is not a game id: lowercase words joined by "-", starting with a letter`);
  for (const dir of [`games/${g.id}`, `packages/${g.id}-play`]) {
    if (existsSync(resolve(root, dir))) throw new ScaffoldError(`${dir} already exists`);
  }
  const composePath = resolve(root, "compose.yaml");
  const compose = withComposeService(readFileSync(composePath, "utf8"), g);
  const files = scaffoldFiles(g, date);
  for (const [path, text] of files) {
    mkdirSync(dirname(resolve(root, path)), { recursive: true });
    writeFileSync(resolve(root, path), text);
  }
  writeFileSync(composePath, compose);
  return [...files.keys(), "compose.yaml"];
}
