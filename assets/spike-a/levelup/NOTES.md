# spike-a/levelup

- **Reads at 1x:** A gold dot that grows into a ring, breaks into six sparks, and a cyan arrow that rises and fades.
- **Deviations from the brief:** None in content. The kit's body-motion rules are off for it (`area-change`, `bbox-change`, `baseline-drift`, `loop-seam`), with `maxGroups: 8`: `maxAreaChange` tops at 100 % and a burst grows by 300 %.
- **Open issues:** The ring frames are 1–2 px thick ellipses and look thin at 1x; the arrow's wings are one row.
- **Passes:** 3 (the kit's `maxAreaChange` range, then `baseline-drift`).
- **Rough time:** ~15 min.
