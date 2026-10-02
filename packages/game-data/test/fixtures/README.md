# Fixture games

`games/` holds one small game per defect. `ok-shop` is the base: it validates, and every other
folder is `ok-shop` with exactly one thing wrong. `test/fixtures.test.ts` expects the exact
line `validate` prints for each, and fails if a folder here is not in its list.

| Fixture | The defect | Rule |
|---|---|---|
| `ok-shop` | none | |
| `dangling-palette` | `game.json` names a palette that is not under `assets/palettes/` | `ref` |
| `dangling-scene` | `entryScene` names a scene with no file | `ref` |
| `dangling-system` | `systems` lists a system the engine does not have | `ref` |
| `dangling-table` | `rowText` names a table no system of the game declares | `ref` |
| `duplicate-key` | a row has the key `weight` twice | `json` |
| `duplicate-row` | two rows of a table have one id | `schema` |
| `float-integer` | `220.5` where an integer is declared | `schema` |
| `missing-string` | a row's name is in `en` and not in `cs` | `string` |
| `sim-refuses` | the data fits the schemas and the system refuses it (`budgetMin` above `budgetMax`) | `sim` |
| `unknown-field` | a field the table does not declare | `schema` |
| `unknown-file` | a table file no system declares, and a `notes.txt` | `layout` |

A dangling **row** id (a field declared with `field.ref`) has no fixture on disk: no engine
system declares such a field yet, so `test/validate.test.ts` covers it with a test-only system.

```sh
./dev npm run game -- validate --games packages/game-data/test/fixtures/games --all
```

A new way to be wrong gets a folder here and a line in `DEFECTS` of the test.
