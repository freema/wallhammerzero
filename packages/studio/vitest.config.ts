// The server tests. Without this file Vitest would load vite.config.ts and with it the React
// Router plugin, which the tests do not need. The timeouts are the ones every package shares.

import { defineConfig } from "vitest/config";
import { sharedTest } from "../../vitest.shared.ts";

export default defineConfig({
  test: { ...sharedTest, include: ["test/**/*.test.ts"] },
});
