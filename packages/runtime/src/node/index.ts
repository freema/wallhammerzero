// @whz/runtime/node: reading a bake from disk, for Node only (headless runs, tests, the
// studio server). The runtime itself does no I/O: a browser host fetches the two files and
// calls `parseAtlas` and `sheetFromPng` from `@whz/runtime`.

export { readAtlas, readSheet } from "./load.ts";
