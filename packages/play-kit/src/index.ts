// @whz/play-kit: what every playable game in the browser shares. The test hook `window.__game`
// and its script runner, the fixed-step loop. The dev server's shot plugin is
// `@whz/play-kit/vite`; the scaffold of a new game is `./dev npm run play -- new`.

export { captureErrors, installGameHook } from "./hook.ts";
export type { GameHook, PlayableGame } from "./hook.ts";
export { Keys } from "./keys.ts";
export { fixedLoop } from "./loop.ts";
export type { Loop, LoopParts } from "./loop.ts";
export { at, hold, press, rounded, runScript } from "./runner.ts";
export type { Script, ScriptResult, ScriptStep, ScriptTarget } from "./runner.ts";
