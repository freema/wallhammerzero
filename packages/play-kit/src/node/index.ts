// The Node side of @whz/play-kit: the scaffold of a new game and its command line.

export { PLAY_USAGE, runPlayCli } from "./cli.ts";
export type { CliIo } from "./cli.ts";
export { GAME_ID, nextPort, portVariable, ScaffoldError, scaffoldFiles, scaffoldGame, withComposeService } from "./scaffold.ts";
export { ENGINES } from "./templates.ts";
export type { Engine, GameSpec } from "./templates.ts";
