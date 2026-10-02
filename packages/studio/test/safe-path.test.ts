// The safe path resolver: what it opens and what it refuses.

import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { safeResolve } from "../server/services/safe-path.ts";
import { removeTemps, tempRoot } from "./helpers.ts";

let root: string;
let outside: string;
let allowed: string[];

beforeAll(() => {
  root = tempRoot("paths");
  outside = tempRoot("outside");
  mkdirSync(join(root, "build", "assets", "pack", "one"), { recursive: true });
  mkdirSync(join(root, "build-other"), { recursive: true });
  mkdirSync(join(root, "assets"), { recursive: true });
  writeFileSync(join(root, "build", "assets", "pack", "one", "atlas.json"), "{}");
  writeFileSync(join(root, "build", "..hidden.txt"), "dots in a name are fine");
  writeFileSync(join(root, "build-other", "x.txt"), "a folder that only starts like build");
  writeFileSync(join(root, "assets", "secret.txt"), "in the checkout, not served");
  writeFileSync(join(outside, "passwd"), "outside the checkout");
  // Symlinks inside build/: one stays inside, one leaves build/, two leave the checkout.
  symlinkSync(join(root, "build", "assets", "pack", "one", "atlas.json"), join(root, "build", "inside-link.json"));
  symlinkSync(join(root, "assets", "secret.txt"), join(root, "build", "to-secret.txt"));
  symlinkSync(join(outside, "passwd"), join(root, "build", "to-passwd"));
  symlinkSync(outside, join(root, "build", "to-outside"));
  allowed = [join(root, "build")];
});
afterAll(removeTemps);

const resolve = (path: string) => safeResolve(root, allowed, path);

describe("safeResolve", () => {
  it("opens a file under an allowed folder and returns its real path", () => {
    const file = resolve("build/assets/pack/one/atlas.json");
    expect(file).toMatchObject({ ok: true, size: 2 });
    expect(file.ok && file.path).toBe(join(realpathSync(root), "build", "assets", "pack", "one", "atlas.json"));
    expect(resolve("build/..hidden.txt").ok).toBe(true);
  });

  it("follows a symlink that stays inside the allowed folder", () => {
    const file = resolve("build/inside-link.json");
    expect(file.ok && file.path).toBe(join(realpathSync(root), "build", "assets", "pack", "one", "atlas.json"));
  });

  it.each([
    ["build/../assets/secret.txt"],
    ["build/assets/../../assets/secret.txt"],
    ["../outside"],
    [".."],
    ["build/.."],
    ["build/./assets/pack/one/atlas.json"],
    ["build//assets/pack/one/atlas.json"],
    ["build/assets/pack/one/atlas.json/"],
    ["/etc/passwd"],
    ["/build/assets/pack/one/atlas.json"],
    [""],
    ["build\\assets\\pack\\one\\atlas.json"],
    ["build/..\\..\\assets/secret.txt"],
    ["build/assets/pack/one/atlas.json\0.png"],
  ])("refuses %j as invalid, without normalising it", (path) => {
    expect(resolve(path)).toMatchObject({ ok: false, reason: "invalid" });
  });

  it.each([["assets/secret.txt"], ["build-other/x.txt"], ["build"], ["package.json"]])("refuses %j: it is not under an allowed folder", (path) => {
    expect(resolve(path)).toMatchObject({ ok: false, reason: "forbidden" });
  });

  it.each([["build/to-secret.txt"], ["build/to-passwd"], ["build/to-outside/passwd"]])("refuses %j: a symlink that leaves the allowed folder or the checkout", (path) => {
    expect(resolve(path)).toMatchObject({ ok: false, reason: "forbidden" });
  });

  it("says missing for a file that is not there, and for a folder", () => {
    expect(resolve("build/assets/pack/one/nope.png")).toMatchObject({ ok: false, reason: "missing" });
    expect(resolve("build/assets/pack")).toMatchObject({ ok: false, reason: "missing" });
    expect(resolve("build/to-outside")).toMatchObject({ ok: false, reason: "forbidden" });
  });

  it("serves nothing when no folder is allowed", () => {
    expect(safeResolve(root, [], "build/assets/pack/one/atlas.json")).toMatchObject({ ok: false, reason: "forbidden" });
  });
});
