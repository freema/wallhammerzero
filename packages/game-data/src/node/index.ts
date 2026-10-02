// @whz/game-data/node: the file side of game data, for Node only (the `game` CLI, the studio
// server, tests). The core (`@whz/game-data`) never touches a file.

export { packageDir, packGame, readPackageDir, validateGameDir, writePackageDir } from "./build.ts";
export type { PackResult, ValidateOptions } from "./build.ts";
export { GAME_COMMANDS, runCli, selectGames, UsageError } from "./cli.ts";
export type { CliIo, CommandArgs, GameCommand } from "./cli.ts";
export { assetEntry, findGame, findGames, findPalettes, loadCatalog, openGameProject, readGameFiles, shownPath } from "./project.ts";
export type { GameEntry, GameFiles, GameProject, GameProjectOptions } from "./project.ts";
