# spike-a: variant A of the 2D art spike (16 × 16, 3/4 top-down)

The same room as `spike-b/`, with characters in a 16 × 16 frame. Everything is drawn by the
shared programs in `assets/spike-lib/` (`style.ts` holds the two scale tables; `chibi.ts`,
`props.ts`, `tiles.ts`, `fx.ts`, `scene.ts` the drawings; `digits.ts` the 3 × 5 counter
digits), under the rules of `assets/STYLE.md` and the palette `assets/palettes/spike32.json`.
Each asset's `NOTES.md` has its reads, deviations, open issues, passes and time. The owner
compares A and B in the studio: `/gallery?pack=spike-a` against `/gallery?pack=spike-b`, and
the two scenes (`spike-a/scene`, `spike-b/scene`) side by side at 1× and 3×.

## What worked, what didn't (the first run of the render → inspect → revise loop)

**Passes and time per kind.** The staff rig took 8 lint passes and ~90 min; everything built
on it after that was cheap: the visitor 1 pass / 5 min, the six props 1–3 passes / 5–15 min
each, the tiles 2 passes / 15 min, the FX 3 passes / 15 min, the scene 2 visual passes /
30 min. The budget (3 static, 5 animated) held for every asset but the rig itself: a shared
rig is where the passes go, and they pay off in every later character.

**Lints that caught real defects.** `orphan-pixels` found most of them: an arm over the
torso's shade column, the outline's concave corners (ink next to ink-deep, fixed by
`mendOutline`), a hair mid-tone pocket, a shadow pixel between the feet, a 1 px fringe, the
shade column outside the hair ellipse, a lit pixel under a reaching arm. `fits-frame` caught
the outline under the feet (the pivot row moved up) and the plant's leaves over the top edge.
`timing` caught identical work frames. `allowed-slots` caught a ramp missing from a list, not
a drawing defect. The lints a drawing needed off were the body-motion rules on the FX
(`area-change` tops at 100 %, a burst grows by 300 %; `baseline-drift` and `loop-seam` do not
apply to a one-shot pop).

**Zoom.** 8× strips for every judgement of a pose or a face; the 3× `context.png` for "does it
read", the 1× cells of the scene's `context.png` for the final answer. Nothing was judged at
1× directly; `toText()` dumps (one letter per pixel) settled every lint error faster than any
image.

**What the kit is missing.** A thin-line budget: `orphan-pixels` at 0 forbids every 1 px
shine, stem and spark, so the drawings use 2 px blocks everywhere (good for the read, but a
rule, not a choice). A per-slot exemption (`white` shine pixels) would let B keep a 1 px
shine. `review <id>` takes one id at a time; `review --pack` writes the pack sheets only. A
scene wants a clip of a few frames (idle bobs, the pop) to judge motion in context; the
`timing` rule and the frame budget make that a sprite concern today. The scene composes
sprites by hand (tile hash, painter's order, shadows): a small "place on tile" helper in the
kit would stop every scene from re-doing it.
