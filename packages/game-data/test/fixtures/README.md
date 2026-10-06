# Fixture games

`games/` holds one small game per defect. `ok-shop` is the base: it validates, and every other
folder is `ok-shop` with exactly one thing wrong. `test/fixtures.test.ts` expects the exact
line `validate` prints for each, and fails if a folder here is not in its list.

| Fixture | The defect | Rule |
|---|---|---|
| `ok-shop` | none | |
| `dangling-palette` | `game.json` names a palette that is not under `assets/palettes/` | `ref` |
| `dangling-row` | a row names a row of another table that does not exist (`output: "ingot"`). Not on `ok-shop`: see below | `ref` |
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

`dangling-row` is the one fixture that is not `ok-shop`: a dangling row id needs a table with a
field declared as `field.ref`, and no engine system declares one yet. It is a game on the tests'
own `lab` system (`test/helpers.ts`), which the test passes to `validateGameDir`. The command
below does not know `lab`, so it reports that fixture as a game on an unknown system (also
expected by the test). When an engine system gets a `field.ref`, move the fixture onto it.

`assets/` is a small assets folder for the pack tests (`test/pack.test.ts`): one palette and
three assets, two of them drawn with a palette that `pack` must refuse.

```sh
./dev npm run game -- validate --games packages/game-data/test/fixtures/games --all
```

A new way to be wrong gets a folder here and a line in `DEFECTS` of the test.
