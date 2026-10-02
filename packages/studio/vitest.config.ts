// The server tests. Without this file Vitest would load vite.config.ts and with it the React
// Router plugin, which the tests do not need.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["test/**/*.test.ts"], testTimeout: 30_000 },
});
