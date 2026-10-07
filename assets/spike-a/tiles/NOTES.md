# spike-a/tiles

- **Reads at 1x:** 8 x 8 floor boards with grout, the wall's cornice and skirting, the wall shadow on the row below it. The floor's 4 variants differ by wear strokes the scene picks by `hash32(x, y)`.
- **Deviations from the brief:** Both packs share the same 16 x 16 tiles; the packs differ in their characters. The wall exists whole (`wall`) and split (`wall-upper`, `wall-lower`) for B's two-tile wall, each with `-end-left`/`-end-right` corners.
- **Open issues:** The wall decorations (a picture, a poster) repeat visibly along a 10-tile wall; the hash gives no spacing rule.
- **Passes:** 2 (`allowed-slots` for the picture's green; identical floor variants when the wear strokes landed on grout).
- **Rough time:** ~15 min.
