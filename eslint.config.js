// The one ESLint config of the repo (flat config). Each TypeScript package runs `eslint .` in
// its own check; the root script check:assets lints assets/.
//
// A new package needs no change here unless it joins the determinism lint: then add its
// source glob to DETERMINISTIC.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import { determinism } from "./tools/lint/determinism.js";

/**
 * Code that must give the same result on every engine and in a later port: no clocks, no
 * unseeded randomness, no floating-point Math. Tests and build scripts are not under it.
 * A later note adds the synth here.
 */
const DETERMINISTIC = [
  "assets/**/*.ts",
  "packages/det/src/**/*.ts",
  "packages/asset-kit/src/**/*.ts",
  "packages/sim/src/**/*.ts",
  "packages/runtime/src/**/*.ts",
  "packages/voxel-kit/src/**/*.ts",
];

/** Node-side entry points of deterministic packages: they load files, they do not draw. */
const DETERMINISTIC_EXCEPT = ["packages/asset-kit/src/node/**", "packages/sim/src/node/**", "packages/runtime/src/node/**"];

const TYPESCRIPT = ["**/*.ts", "**/*.tsx"];

export default [
  {
    name: "whz/ignores",
    ignores: ["**/node_modules/**", "**/dist/**", "build/**", "coverage/**", ".tools/**", "tools/lint/test/fixtures/**"],
  },
  // The studio's generated files: the built app and React Router's route types.
  { name: "whz/ignores-studio", ignores: ["packages/studio/build/**", "packages/studio/.react-router/**"] },
  { name: "whz/options", linterOptions: { reportUnusedDisableDirectives: "error" } },
  { ...js.configs.recommended, name: "whz/js-recommended", files: TYPESCRIPT },
  ...tseslint.configs.recommended.map((config) => ({ ...config, files: TYPESCRIPT })),
  {
    name: "whz/typescript",
    files: TYPESCRIPT,
    rules: {
      eqeqeq: ["error", "always"],
      "no-var": "error",
      "prefer-const": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  determinism({ files: DETERMINISTIC, ignores: DETERMINISTIC_EXCEPT }),
];
