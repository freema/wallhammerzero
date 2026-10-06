// The Vitest options every package shares. Each package's vitest.config.ts takes them from
// here, so the timeouts of the gate are in one place.
//
// Vitest's own defaults (5 s per test, 10 s per hook) are a limit for a quiet machine. The gate
// also runs while other gates share the Docker VM (several worktrees, a studio that bakes), and
// tests that bake every fixture asset, render audio or replay a sim in heavy mode then take
// several times longer. A slow machine must not turn the gate red, so the limits are far above
// the slowest test: they only end a test that hangs.
//
// tools/check/test/vitest-config.test.mjs fails the gate when a package runs Vitest without
// these options.

/** How long one test may run before Vitest calls it hung. */
export const TEST_TIMEOUT_MS = 120_000;
/** The same for a `beforeAll`, `afterAll`, `beforeEach` or `afterEach` hook. */
export const HOOK_TIMEOUT_MS = 120_000;

export const sharedTest = {
  testTimeout: TEST_TIMEOUT_MS,
  hookTimeout: HOOK_TIMEOUT_MS,
} as const;
