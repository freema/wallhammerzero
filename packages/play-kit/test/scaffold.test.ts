// The scaffold of a new game: the files, the Compose service and port, and the refusals.

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { nextPort, runPlayCli, scaffoldGame, withComposeService } from "../src/node/index.ts";
import type { GameSpec } from "../src/node/index.ts";

const REPO_COMPOSE = readFileSync(resolve(import.meta.dirname, "../../../compose.yaml"), "utf8");
const SPEC: GameSpec = { id: "moth-run", title: "Moth Run", engine: "three", port: 4300, palette: "example" };

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "play-kit-"));
  writeFileSync(join(root, "compose.yaml"), REPO_COMPOSE);
  return root;
}

function run(root: string, args: string[]): { code: number; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  const code = runPlayCli(args, { out: (l) => out.push(l), err: (l) => err.push(l) }, root, "2026-10-14");
  return { code, out, err };
}

describe("scaffold", () => {
  it("writes the game folder, the package and the Compose service", () => {
    const root = repo();
    const written = scaffoldGame(root, SPEC, "2026-10-14");
    expect(written).toContain("games/moth-run/STATE.md");
    expect(written).toContain("games/moth-run/locales/en.json");
    expect(written).toContain("packages/moth-run-play/src/main.ts");
    expect(written.at(-1)).toBe("compose.yaml");
    const pkg = JSON.parse(readFileSync(join(root, "packages/moth-run-play/package.json"), "utf8")) as { name: string; dependencies: Record<string, string> };
    expect(pkg.name).toBe("@whz/moth-run-play");
    expect(pkg.dependencies).toHaveProperty("three");
    expect(readFileSync(join(root, "packages/moth-run-play/src/main.ts"), "utf8")).toContain('id: "moth-run"');
    const game = JSON.parse(readFileSync(join(root, "games/moth-run/game.json"), "utf8")) as { id: string };
    expect(game.id).toBe("moth-run");
    const compose = readFileSync(join(root, "compose.yaml"), "utf8");
    expect(compose).toContain('      - "127.0.0.1:${WHZ_MOTH_RUN_PORT:-4300}:4300"');
    expect(compose.indexOf("  moth-run:")).toBeLessThan(compose.indexOf("  # Port convention"));
  });

  it("a canvas game has no three.js and a pixel-art shot", () => {
    const root = repo();
    scaffoldGame(root, { ...SPEC, id: "tiny", engine: "canvas" }, "2026-10-14");
    const pkg = readFileSync(join(root, "packages/tiny-play/package.json"), "utf8");
    expect(pkg).not.toContain("three");
    expect(readFileSync(join(root, "packages/tiny-play/src/main.ts"), "utf8")).toContain("imageSmoothingEnabled = false");
  });

  it("refuses to overwrite a game, a service or to take a bad id", () => {
    const root = repo();
    scaffoldGame(root, SPEC, "2026-10-14");
    expect(() => scaffoldGame(root, SPEC, "2026-10-14")).toThrow("games/moth-run already exists");
    expect(() => withComposeService(readFileSync(join(root, "compose.yaml"), "utf8"), SPEC)).toThrow('already has a service "moth-run"');
    expect(() => scaffoldGame(root, { ...SPEC, id: "Moth_Run" }, "2026-10-14")).toThrow("is not a game id");
  });

  it("picks the next free port above the defaults in compose.yaml", () => {
    expect(nextPort(REPO_COMPOSE)).toBeGreaterThanOrEqual(4300);
    expect(nextPort('"127.0.0.1:${A:-4100}:4100"\n"127.0.0.1:${B:-4200}:4200"')).toBe(4300);
    expect(nextPort('"127.0.0.1:${A:-4350}:4350"')).toBe(4400);
  });
});

describe("play CLI", () => {
  it("new writes the files and prints the next steps", () => {
    const r = run(repo(), ["new", "moth-run", "--title", "Moth Run"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("wrote games/moth-run/game.json");
    expect(r.out.join("\n")).toContain("./dev npm install");
  });

  it("usage errors exit 2", () => {
    expect(run(repo(), []).code).toBe(2);
    expect(run(repo(), ["new", "x"]).err[0]).toBe("play: --title is missing");
    expect(run(repo(), ["new", "x", "--title", "X", "--engine", "godot"]).code).toBe(2);
  });
});
