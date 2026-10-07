# STYLE.md v0 (art spike, 2026-10-07)

The look of the 2D assets, as rules a program can follow. v0 was written for the art spike
(`spike-a/`, `spike-b/`); it grows from the owner's verdicts (`reviews/INBOX.md`). Where this
file and `packages/asset-kit/README.md` disagree, the kit wins.

## Resolution and scale

- **Logical resolution 160 × 144** (a 10 × 8 room of 16 px tiles, plus a 16 px UI strip at the
  bottom). The game shows it at an integer zoom; never scale art by a fraction (no mixels).
- **Tile 16 × 16**, 3/4 top-down: a tile's top 4 rows are its back edge, the bottom 2 its
  front edge. A wall tile is 16 wide × 16 tall and stands on the row behind the floor.
- **Characters**: variant A is a 16 × 16 frame (the pivot between the feet on row 13, the
  outline under them on row 14, the last row free); variant B is 16 × 24 (pivot on row 21).
  Head 6 px tall in A and 8 in B, so the face reads. One pixel of margin all round: nothing
  touches the frame (the kit's `fits-frame` rule). The sizes are the `Scale` tables in
  `assets/spike-lib/style.ts`.
- **Props** fit one tile (16 × 16, A) or stand on one tile and rise into the one behind
  (16 × 24, B); the pivot is the bottom middle of the body, two rows over the frame's edge.
  **FX** are 24 × 24 (A) or 32 × 32 (B), centred.

## Palette (`assets/palettes/spike32.json`)

- Programs name slots and ramps, never RGB. Every ramp has three steps, dark → light, with
  the shadow step cooler and the light step warmer than the middle.
- **Inks:** `ink` (#2b2238) for the outline, `ink-deep` for the rim under and to the right of
  a shape (the shadow side), `shadow` only for the ground shadow. Never pure black.
- **Materials:** skin, hair, wood, cloth (`red`, `blue`, `green`), metal, plant, floor,
  wall, `ui` (two steps), `gold` (money, highlights, level-up), `fx` (pops). `white` is for
  eye shine, teeth, paper and the hottest FX pixel.
- A character uses: one skin, one hair, one cloth ramp for the outfit (a second for trim at
  most), `metal` or `wood` for a prop. Saturated accents (`gold`, `fx`, `red.2`) belong to
  focal points and FX, not to floors and walls.

## Light and shading

- **One light, top-left.** The light step goes on top and left faces, the shadow step on
  bottom and right. Two or three bands per material; never a band that follows the outline
  inward (pillow shading).
- **No anti-aliasing, no gradients, no blur.** Ordered Bayer dither only for the checker
  contact shadow and large soft edges (a glow), never on a small sprite.
- **Outline:** one pass of `compose` after the parts are stacked: `ink` all round, `ink-deep`
  on the shadow side. Interior lines (a belt, a seam, a drawer) in the material's darkest
  step. Thin things (a plant stem, a cable, a sparkle, the face) are drawn **after** the
  outline, so they stay one pixel wide.
- **Ground shadow:** an ellipse of `shadow` under a character or prop, 2 rows tall, drawn
  first and one row in front of the feet, so the body does not cover it. A character sprite
  carries two shadow tabs beside its feet; a prop has none of its own: the scene draws the
  shadows, both ways (opaque on the left half, checker-dithered on the right); the owner picks.

## Faces (the Kairosoft read)

- The face is a stamp drawn last at an anchor point. An eye facing the camera is a **2 × 2**
  ink block in A. In B it is 2 × 3 with a two-pixel `white` shine column on its lit side: one
  shine pixel would be an orphan for the lint and a speck for the eye. No nose; a mouth only in
  emotes.
- Side facing: one eye near the front edge; back facing: no face, hair only.

## Animation

- **Low fps by design.** Idle 2 frames (600 / 400 ms): a 1 px squash (head and torso drop
  one pixel, the legs one shorter), so the tallest pose is the rest pose and nothing leaves
  the frame. Walk 4 frames at 140 ms: contact, pass, contact, pass; the lifted leg 1 px
  shorter, the body 1 px down on the pass frames; arms opposite to legs, never twinned. Work
  2 frames at 400 / 300 ms: the prop, the reach or the nod moves, the arms hold (a raised arm
  collides with the head at this size).
- The pivot never drifts within a clip (`baseline-drift` 0). The frame never changes by more
  than a third of its area between neighbours.
- FX 8 frames, 60–100 ms each, fastest at the start: a burst grows, holds one frame, then
  thins into sparks and fades by dropping to the ramp's darker steps. An FX turns the kit's
  body-motion rules off (`area-change`, `bbox-change`, `baseline-drift`, `loop-seam`) and
  allows several groups: it is light, not a body.

## Do / don't

- **Do** cheat the pose for the read: a prop at 2 px wide, a hand that is a 2 × 2 block, a
  head that is half the body. **Do** write what must read at 1× in `NOTES.md` before
  drawing, and note every deviation from the brief.
- **Do** give every clip a timing table and every asset `lint.allowedSlots`.
- **Don't** draw text where an icon or an emote does. **Don't** rotate sprites by arbitrary
  angles; draw the key views. **Don't** use error-diffusion dither, gradients, half pixels or
  a sixth colour on a part that has three.
- **Don't** change an approved asset without the owner's consent (`CLAUDE.md`, Verdicts).
