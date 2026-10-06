# Looking at images

How a Claude Code session looks at pixel art in this repo, what it can and cannot see, and the
measurement behind those rules. The commands that make the images are in
[asset-pipeline.md](asset-pipeline.md); the background is `research/code-graphics.md` §5.3 and
§7.5.

## The rules

1. **Numbers before eyes.** Run `./dev npm run asset -- lint <id>` first. An orphan pixel, a
   1-pixel jump of the feet, a popping loop, a clipped prop and a dark scene are caught by a
   number with a threshold, every time, at no cost in attention. Look at images for what has no
   number: does it read as the thing, is the pose alive, does the pack belong together.
2. **Never open a raw sprite or a GIF.** Open the review images:
   `./dev npm run asset -- review <id>` writes them to `build/review/<id>/`. They are integer
   nearest-neighbour upscales, laid out as numbered cells.
3. **A sprite that is shown at 1x cannot be judged at all.** In the calibration below nothing was
   seen at 1x, not even red hands on a 20 x 22 character. The 1x panel of `context.png` is there
   for one question only: is the silhouette still a readable blob at the size the game shows it.
4. **4x is the smallest zoom that works, and 8x is the default.** Single-pixel defects, a 1-pixel
   jump and a wrong pose were found from 4x up. The sample is too small to rank 4x, 8x and 12x
   against each other.
5. **Keep every image at 2000 px or less on its long edge.** Claude Code's Read tool resamples a
   longer image down to 2000 px (measured: 975 x 2166 arrived as 900 x 2000), and a resampled
   image is no longer an integer upscale: pixel edges blur. The review command never writes a
   longer image (`MAX_REVIEW_EDGE` in `packages/asset-kit/src/review.ts`); it lowers the zoom or
   splits the sheet into pages instead.
6. **Compare against a reference in the same image.** Every calibration sheet had a clean
   reference row. A jump or a wrong colour is found by comparing neighbours, not by
   remembering what the sprite should look like. For an asset, the neighbours are the other
   frames of the strip and the other assets of the pack sheet (`review --pack <pack>`).
7. **Do not trust a weak impression of a colour.** A swap between two neighbouring steps of one
   ramp on a small part was missed at 8x, and looking for it produced false alarms on clean
   sprites. If an asset must use only certain slots, say so in its `lint.allowedSlots` and let
   the lint judge.
8. **An image shows frames, not motion.** Timing is read from the numbers: the durations on the
   strip captions and the clip table in `lint.json`. A human judges motion in the studio.
9. **Many images: use a sub-agent.** Screenshot-heavy checks run in a sub-agent that returns a
   text verdict, so the images do not fill the main session's context.

## The views

`review <id>` writes these into `build/review/<id>/` (a sheet that needs several pages is
`contact-1.png`, `contact-2.png`, ...):

| File | What it shows | Look for |
|---|---|---|
| `contact.png` | Every frame of one seed at 8x, one section per clip and facing. The number over a cell is the frame's `index` in `atlas.json`. | Drawing mistakes, frames that do not belong, facings that disagree |
| `strip-<clip>.png` | One clip, frame by frame, with each frame's number and duration. A looping clip ends with frame 0 again (the cell `> 0`). | The motion from cell to cell, and the seam of the loop |
| `silhouette.png` | Every frame as a dark shape on a light background, at 4x. | Does the shape alone say what it is; limbs that merge with the body |
| `seeds.png` | Frame 0 for every variant seed (curated) and every review seed (fixed, never curated). | Bad seeds, variants that are too alike or do not belong together |
| `context.png` | The variant seeds at 1x and 3x on a neutral floor. Tiles are repeated 3 x 3. | Readability at game size, contrast against a floor, tile seams |
| `lint.json` | The findings, and one row of numbers per frame and per clip. | Read this before any image |

`review --pack <pack>` writes one group sheet, `build/review/<pack>/pack.png`: one row per asset,
its review seeds as columns. It is the cheap way to judge whether a pack is consistent.

## The calibration (2026-10-02)

**Question:** at which zoom does the model reliably see which defect?

**Specimen:** the lint fixture walker (`packages/asset-kit/test/lint-fixtures/walker.ts`): a
20 x 22 front-view character with a 4-frame walk, 9 colours. Four planted defects:

- **orphan pixel**: one pixel of a foreign colour inside a fill, in one frame;
- **wrong slot**: one part painted with another palette slot, in all frames (hands, hair, torso
  shade or shoes);
- **pivot jump**: one frame drawn 1 pixel higher or lower;
- **twinned limbs**: both arms swing together instead of against each other.

**Sheets:** `packages/asset-kit/scripts/calibration.ts` writes, for each zoom (1x, 4x, 8x, 12x),
two sheets. A sheet is a clean reference strip and rows A to E: one row per defect and one clean
row, in an order drawn from a seed, with the defect's frame and place drawn from the seed too.
The answers go to `key.json`. (The first run had a sixth row, a second clean one. That made its
12x sheets 2166 px long, which is how the limit of rule 5 was found; the script was cut to five
rows after it.)

**Protocol:** the model (Claude Fable 5.1, `claude-fable-5-1`, in Claude Code) opened every sheet
with Read, wrote for each row "clean" or the defect and its frame into a file, and only then
opened the key. Two runs, seeds 7391 and 48213, 16 sheets, 88 rows: the first run with six
rows a sheet (48 rows), the second with five (40 rows). The two 12x sheets of the first run
are the resampled ones of the last column.

**Result** (hits / trials; a hit names the right defect on the right row, and for an orphan
pixel or a jump also the right frame):

| Defect | 1x | 4x | 8x | 12x | 12x, resampled by Read |
|---|---|---|---|---|---|
| Orphan pixel | 0 / 4 | 4 / 4 | 4 / 4 | 2 / 2 | 2 / 2 |
| Wrong slot | 0 / 4 | 4 / 4 | 2 / 4 | 2 / 2 | 2 / 2 |
| Pivot jump, 1 px | 1 / 4 | 4 / 4 | 4 / 4 | 2 / 2 | 2 / 2 |
| Twinned limbs | 0 / 4 | 4 / 4 | 3 / 4 | 2 / 2 | 2 / 2 |
| False alarms on clean rows | 0 / 6 | 0 / 6 | 3 / 6 | 0 / 2 | 0 / 4 |
| Sheet size, first run (six rows) | 358 x 472 | 358 x 934 | 655 x 1550 | not in this column | 975 x 2166 → 900 x 2000 |
| Sheet size, second run (five rows) | 358 x 409 | 358 x 805 | 655 x 1333 | 975 x 1861 | none |

What the numbers say, and what they do not:

- **1x is blind.** 15 of the 16 planted defects were not seen; the one hit was called a weak
  guess when it was written down. No false alarms either: nothing can be told apart.
- **From 4x up, a single pixel, a 1-pixel jump and a wrong pose are seen.** The frame of a jump
  was always right; its direction (up or down) was wrong once, at 4x.
- **The two misses of "wrong slot" at 8x are one case:** shoes painted `grey.1` instead of
  `grey.0`, the next step of the same ramp, on 4 pixels. The seed put it only on the 8x sheets,
  so the table does not show whether 4x or 12x would catch it. Swaps on a larger part or to
  another hue (red hands, hair one ramp step brighter, a grey torso shade) were seen every time
  from 4x.
- **The false alarms at 8x came from looking for a defect that had to be there.** The reader knew
  every sheet holds one of each kind; when the shoes were not found, a clean row was named
  instead (twice), and once a twinned row was put on the row next to it. A reviewer who is told
  "find the defect" will find one.
- **The resampled 12x sheets were still read correctly**, but the sample is two sheets, and the
  blur costs exactly the pixel edges that an integer upscale is for. Rule 5 stands.
- **This is an upper bound.** One model, one session, 88 rows, a reader who knew the four defect
  classes and had a clean reference beside every row. A real review has no key and no
  reference. Treat the table as "below 4x: never; above: likely, for defects with contrast".

**What follows for the tools:** every defect of the table that a number can catch has a lint
(`orphan-pixels`, `baseline-drift`, `allowed-slots`). Two have none and stay with the eyes:
twinned limbs (a strip at 4x or more shows them), and a wrong slot that the asset allows
elsewhere, which neither the lint nor the eyes catch reliably.

**Re-running it** (after a model change, or to test another zoom):

```sh
./dev npm run calibration -w @whz/asset-kit -- --seed 1234
```

It writes `build/calibration/z<zoom>-t<trial>.png` and `key.json`. Use a new seed, write the
answers down before opening the key, and add a dated table to this page.
