// The configuration: defaults that need no variable, and the overrides.

import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isInside, readConfig } from "../server/services/config.ts";

const REPO = resolve(fileURLToPath(new URL("../../../", import.meta.url)));

describe("readConfig", () => {
  it("defaults to this repo, port 4100 and loopback", () => {
    expect(readConfig({})).toEqual({
      root: REPO,
      assetsDir: join(REPO, "assets"),
      outDir: join(REPO, "build"),
      cacheDir: join(REPO, ".studio-cache"),
      host: "127.0.0.1",
      port: 4100,
      allowedHosts: [],
      bakeTimeoutMs: 30_000,
      dev: true,
      bakeOnStart: true,
    });
  });

  it("listens on every interface only inside the dev container, where Docker publishes the port on 127.0.0.1", () => {
    expect(readConfig({ WHZ_IN_CONTAINER: "1" }).host).toBe("0.0.0.0");
    expect(readConfig({ WHZ_IN_CONTAINER: "1", WHZ_STUDIO_HOST: "127.0.0.1" }).host).toBe("127.0.0.1");
  });

  it("takes every setting from its variable", () => {
    const config = readConfig({
      WHZ_STUDIO_ROOT: "/tmp/checkout",
      WHZ_STUDIO_ASSETS: "packages/studio/test/fixtures/assets",
      WHZ_STUDIO_OUT: ".studio-cache/fixtures-build",
      WHZ_STUDIO_CACHE: ".cache/studio",
      WHZ_STUDIO_PORT: "4107",
      WHZ_STUDIO_ALLOWED_HOSTS: "Studio.test, other.test,",
      WHZ_STUDIO_BAKE_TIMEOUT_MS: "5000",
      WHZ_STUDIO_BAKE_ON_START: "0",
      NODE_ENV: "production",
    });
    expect(config).toEqual({
      root: "/tmp/checkout",
      assetsDir: "/tmp/checkout/packages/studio/test/fixtures/assets",
      outDir: "/tmp/checkout/.studio-cache/fixtures-build",
      cacheDir: "/tmp/checkout/.cache/studio",
      host: "127.0.0.1",
      port: 4107,
      allowedHosts: ["studio.test", "other.test"],
      bakeTimeoutMs: 5000,
      dev: false,
      bakeOnStart: false,
    });
  });

  it.each([["-1"], ["65536"], ["41o7"], ["4107.5"]])("refuses the port %j", (port) => {
    expect(() => readConfig({ WHZ_STUDIO_PORT: port })).toThrow(/WHZ_STUDIO_PORT must be a whole number from 0 to 65535/);
  });

  it("refuses an output or cache folder outside the checkout: the files endpoint serves the output folder", () => {
    expect(() => readConfig({ WHZ_STUDIO_ROOT: "/tmp/checkout", WHZ_STUDIO_OUT: "../elsewhere" })).toThrow(/WHZ_STUDIO_OUT must be a folder inside the checkout/);
    expect(() => readConfig({ WHZ_STUDIO_ROOT: "/tmp/checkout", WHZ_STUDIO_OUT: "/etc" })).toThrow(/WHZ_STUDIO_OUT must be a folder inside the checkout/);
    expect(() => readConfig({ WHZ_STUDIO_ROOT: "/tmp/checkout", WHZ_STUDIO_OUT: "." })).toThrow(/WHZ_STUDIO_OUT must be a folder inside the checkout/);
    expect(() => readConfig({ WHZ_STUDIO_ROOT: "/tmp/checkout", WHZ_STUDIO_CACHE: "/var/cache" })).toThrow(/WHZ_STUDIO_CACHE must be a folder inside the checkout/);
  });
});

describe("isInside", () => {
  it("is true for the folder itself and what is under it, and false for a sibling with the same prefix", () => {
    expect(isInside("/a/b", "/a/b")).toBe(true);
    expect(isInside("/a/b", "/a/b/c/d")).toBe(true);
    expect(isInside("/a/b", "/a/b/..c")).toBe(true);
    expect(isInside("/a/b", "/a/bc")).toBe(false);
    expect(isInside("/a/b", "/a")).toBe(false);
    expect(isInside("/a/b", "/x/y")).toBe(false);
  });
});
