// Vitest for this package: the options every package shares (the timeouts of the gate), and
// nothing of its own.

import { defineConfig } from "vitest/config";
import { sharedTest } from "../../vitest.shared.ts";

export default defineConfig({ test: { ...sharedTest } });
