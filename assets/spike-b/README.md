# spike-b: variant B of the 2D art spike (16 × 24 chibi, 3/4 top-down)

The same room as `spike-a/`, with characters in a 16 × 24 frame, props 16 × 24, the FX 32 × 32
and a wall two tiles tall. The drawings are shared with A (`assets/spike-lib/`, the `SCALE_B`
table in `style.ts`); `assets/spike-a/README.md` has the loop's lessons, and each asset's
`NOTES.md` here says what is B-specific. The owner compares A and B in the studio:
`/gallery?pack=spike-b` against `/gallery?pack=spike-a`, and the two scenes side by side.

## What B changed

- **The face is the gain.** A 9 × 8 head takes a 2 × 3 eye with a two-pixel shine column and
  three rows of hair over it; the strips read as a face at 8× and as a person with hair at 1×.
  A's 7 × 6 head reads as a person, the eyes as two dots.
- **The rig scaled for free.** Everything in `chibi.ts` is in units of the scale table;
  B cost two lint passes of its own (the face's shade column under the hair ellipse's last
  row, a lit torso pixel under the reaching arm, fixed by a 5-row arm).
- **The props did not scale as well.** A taller desk, shelf, PC and vending machine read fine;
  the sofa and the plant are the A drawings stretched and look squat next to a 16 × 24 person.
  B wants props drawn for B, not A's props with more rows.
- **The room is shorter.** A two-tile wall leaves six floor rows of ten columns; the 1×
  scene is busier, and the characters fill it better than A's.
- **Time.** ~25 min over A for all eleven assets, nearly all of it on the two character
  passes above.
