// @whz/audio/node: the file side of the package, for Node only (the `audio` CLI, the studio
// server, tests). The synth never imports this.

export { analyse, checkEntry, loadEntry, renderToDisk, SIDECAR_FORMAT, sidecarText } from "./build.ts";
export type { Analysis, AnalyseOptions, CheckResult, Loaded, RenderResult, Sidecar, StateSidecar } from "./build.ts";
export { runCli } from "./cli.ts";
export type { CliIo } from "./cli.ts";
export { findEntries, findStrays, openProject, renderDir, SFX_SUFFIX, SIDECAR_SUFFIX, SONG_SUFFIX } from "./project.ts";
export type { AudioEntry, AudioProject, ProjectOptions } from "./project.ts";
