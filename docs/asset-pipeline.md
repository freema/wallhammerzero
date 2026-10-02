# The asset pipeline: bake, review, lint

An asset is a program (`assets/<pack>/<name>/gen.ts`, see
[packages/asset-kit/README.md](../packages/asset-kit/README.md)). PNG files, sheets and atlases
are **build outputs** (D18): nothing under `build/` is committed, and everything there can be
made again from the programs. One command line makes them, and the studio calls the same
functions.

```sh
./dev npm run asset -- list                          # every asset: id, kind, size, clips, variants
./dev npm run asset -- bake --all                    # build/assets/<id>/ for every asset
./dev npm run asset -- bake examples/blinking-dot    # ... or for the named ones
./dev npm run asset -- review examples/blinking-dot  # build/review/<id>/: the images to look at
./dev npm run asset -- review --pack examples        # build/review/<pack>/pack.png: the pack on one sheet
./dev npm run asset -- lint --all                    # numeric checks; exit code 1 on any error
```

| Option | Command | Meaning |
|---|---|---|
| `--seed <n>`, `--preset <name>` | `review` | What the contact sheet and the strips render. Default: the first variant seed, the default params. |
| `--zoom <n>` | `review` | Integer zoom, default 8. Lowered by itself when a frame does not fit. |
| `--no-write` | `lint` | Check only, write no `lint.json`. The gate runs it this way. |
| `--json` | `list` | Print JSON. |
| `--assets <dir>`, `--out <dir>` | all | Another folder of asset programs (default `assets`) or of outputs (default `build`). |

Exit codes: **0** fine, **1** an asset failed (a lint error, an asset that cannot be loaded or
rendered), **2** wrong usage. Images are written straight to files; the command prints only
paths, sizes and findings.

`./dev npm run check` lints every asset under `assets/` (the root script `check:assets`), so an
asset with a lint error fails the gate.

## bake

`build/assets/<id>/`:

| File | Content |
|---|---|
| `atlas.json` | Everything a player needs besides the pixels (below) |
| `seed-<seed>.png` | The sheet of one variant: an **indexed PNG** (colour type 3). The pixel values are the palette indices; slot 0 is transparent. |
| `frames/seed-<seed>/<clip>.<facing>.<n>.png` | Every frame on its own, indexed too |
| `error.json` | Only when the bake failed: `{ format: "wz.bake-error/1", id, sourceHash, message }`. It is then the only file in the folder. |

- **Variants** are the asset's `variantSeeds`, rendered with the default params. Presets are
  listed in the atlas by name but not baked.
- **The sheet:** one row per clip and facing, frames left to right, in canonical order (clips,
  then facings, then frames). Every frame has 1 transparent pixel around it. A clip that is
  wider than 4096 px wraps onto the next row. All variants of an asset share one layout.
- **The PNG writer** is our own (`packages/asset-kit/src/node/png.ts`): signature, IHDR, PLTE,
  tRNS, one IDAT, IEND, compressed with Node's `zlib`. No image library.
- **Deterministic:** the same programs give the same files, byte for byte. `bake --all` also
  removes the output of assets that no longer exist, so `build/assets/` never depends on what
  was there before. The folder of an asset is emptied first and `atlas.json` is written last: a
  reader that finds an atlas finds complete files.

### atlas.json (`format: "wz.atlas/1"`)

| Field | Content |
|---|---|
| `id`, `kind`, `size`, `pivot` | From the asset. Every frame is `size`; `pivot` is the pixel of a frame that sits on the asset's position. |
| `palette` | `id`, `hash` (changes when the palette file's names or colours change) and `colors` (`#rrggbb` per slot) |
| `clips` | Per clip: `name`, `frames`, `durations` (ms per frame), `loop`, and `start`: per facing, the `index` of the clip's first frame |
| `facings`, `params`, `presets`, `reviewSeeds` | The facings; the default params the variants were rendered with; preset names; the review seeds |
| `sourceHash` | 16 hex digits over every file in the asset's folder (path and content), except `review.json` and Markdown notes. It tells whether the asset's own files changed. Shared code and the palette are not in it. |
| `sheet` | `w`, `h`, `columns`, `rows`, `padding` |
| `frames` | One row per frame: `index` (its number on the review sheets), `clip`, `facing`, `frame`, the rectangle `x`, `y`, `w`, `h` in the sheet, `duration`, and `file` (its PNG inside the variant's frames folder) |
| `variants` | Per variant seed: `seed`, `sheet`, `frames` (the folder) and `outputHash` |

**The output hash** is the identity of what was drawn: a hash over the palette indices, size,
pivot, clip table, facings and palette id (`packages/asset-kit/src/output.ts`), never over PNG
bytes. Two bakes agree when their output hashes agree; a recolour changes `palette.hash` and
leaves the output hash alone.

## review

`build/review/<id>/` gets `contact.png`, one `strip-<clip>.png` per clip, `silhouette.png`,
`seeds.png`, `context.png` and `lint.json`. What each one shows, how to read it, and why they
look the way they do (integer zoom, numbered cells, never longer than 2000 px) is in
[looking-at-images.md](looking-at-images.md). `review` exits with 1 when the asset has a lint
error; the images are written anyway.

## lint

Every rule reads palette indices and compares a number with a threshold. `lint.json`
(`format: "wz.lint/1"`, in `build/review/<id>/`) holds the thresholds that were used, the
findings, and the numbers themselves: one row per frame (`bbox`, `area`, `colors`, `orphans`,
`groups`, `gaps`, `baseline`, `luminance`, `diff` to the next frame) and one per clip
(`totalMs`, `maxDiff`, `seam`, `baselineDrift`, `maxAreaChange`, `maxBboxChange`).

A lint run renders every variant seed and every review seed with the default params, and every
preset with the first variant seed.

| Rule | Fails when | Threshold (default) |
|---|---|---|
| `render` | The program throws, returns a frame of another size, or uses an index the palette does not have | always on |
| `frame-size`, `palette-index` | The same two contract breaks, for frames that did not come through `render` (library callers) | always on |
| `allowed-slots` | A frame uses a slot the asset did not list | `allowedSlots` (the whole palette) |
| `orphan-pixels` | A pixel has no pixel of its colour among its 8 neighbours | `maxOrphans` (0) |
| `detached-groups` | A frame has more separate shapes than allowed; the ground shadow is not counted | `maxGroups` (1) |
| `outline-gaps` | In a shape that has an outline, a fill pixel touches a transparent pixel | `maxOutlineGaps` (0); `outlineSlots` (`ink` and slots named `ink-...`), `unoutlined` (`shadow`) |
| `color-count` | A frame uses more colours than allowed | `maxColors` (16; scene 255) |
| `fits-frame` | A pixel lies in the margin along the frame edge: the pose is clipped or touches the edge | `margin` (sprite 1, others 0 = off) |
| `baseline-drift` | The contact row moves within a clip. The contact row is the lowest pixel of the largest shape in the columns around the pivot, counted from the pivot row, not the lowest pixel of the frame | `baselineDrift` (0 px), `baselineBand` (a quarter of the width) |
| `area-change` | The opaque area changes too much between neighbouring frames | `maxAreaChange` (35 %) |
| `bbox-change` | An edge of the bounding box moves too far between neighbouring frames | `maxBboxChange` (25 % of the frame size, at least 2 px) |
| `loop-seam` | The change from the last frame to the first is larger than the largest change inside the clip (clips of 3 frames or more) | `maxSeamRatio` (150 %) |
| `timing` | A frame of a multi-frame clip is shown too briefly or too long. Two identical frames in a row are a warning | `minFrameMs` (16), `maxFrameMs` (10000) |
| `scene-luminance` | The mean luminance of a scene (0 to 255) is under the floor | `minLuminance` (64) |

Per kind: a **sprite** runs everything but `scene-luminance`. **Tiles** and **scenes** fill the
frame with many shapes and single pixels, so `orphan-pixels`, `detached-groups`, `fits-frame`
and `baseline-drift` are off for them; a scene also has no colour limit, and only a scene has the
luminance floor.

**An asset changes its thresholds in its program**, with the `lint` field of `defineAsset`. The
defaults are strict on purpose: an override says "this is deliberate", next to the drawing code
that needs it. `lint.json` records what was used.

```ts
lint: {
  maxGroups: 2,                       // a sparkle beside the body
  unoutlined: ["white"],              // ... which is drawn after the outline
  allowedSlots: ["ink", "gold", "teal.1"], // slot names or ramp names
  off: ["loop-seam"],                 // a rule this asset does not want
  clips: { jump: { baselineDrift: 6, maxAreaChange: 50 } }, // looser for one clip
},
```

An unknown field, rule, slot or clip is an error when the asset is defined. `render`,
`frame-size` and `palette-index` cannot be turned off. The fields and their ranges are in
`packages/asset-kit/src/lint-config.ts`.

**What the lints do not catch:** anything about meaning (it does not look like a cat), limbs
that move together when they should not, and a wrong colour that the asset allows elsewhere.
Those are for the review images and the owner's verdict in the studio.

### The defect fixtures

`packages/asset-kit/test/lint-fixtures/` holds a clean walker and a clean scene, and one asset
per defect, each failing exactly one rule. The tests run them, and so can a session that
changes a rule:

```sh
./dev npm run asset -- lint --all --assets packages/asset-kit/test/lint-fixtures --out build/fixtures
```

## As a library

The command line is a thin layer. The studio (and any other host) calls the same functions, so a
bake in a worker gives the same bytes as the command.

| Import | Functions | I/O |
|---|---|---|
| `@whz/asset-kit` | `bakeAsset(asset, { sourceHash })` → the atlas and one `IndexedBuffer` sheet per variant; `lintAsset(asset)` → the report; `reviewAsset(asset, options)` and `reviewPack(...)` → RGB images; `layoutSheet`, `lintFrames`, `renderSheet`, `formatJson` | none: runs in Node, in a worker and in the browser |
| `@whz/asset-kit/node` | `openProject`, `findAssets`, `findAsset`, `loadEntry`, `sourceHash`; `bakeToDisk`, `bakeAll`, `pruneBakes`, `lintToDisk`, `reviewToDisk`, `reviewPackToDisk`; `encodeIndexedPng`, `encodeRgbPng`, `decodePng`; `runCli` | files |

A Node process loads each `gen.ts` once (modules are cached). A host that bakes again after an
edit runs the bake in a fresh worker or process. The studio does: its bake worker calls
`bakeToDisk` per asset and `pruneBakes` (the clean-up of `bakeAll`) at the end
([studio.md](studio.md#the-server)).
