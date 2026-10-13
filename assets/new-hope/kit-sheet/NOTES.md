# new-hope/kit-sheet

- **What it is:** A 5 x 6 x 3 cell layout (20 x 72 x 12 voxels) written as text in `gen.ts`, built with `composeCells` and baked once as one part: the undercity (ancient foundations under the building, ruins), the street, a building of two styles (market shops and flats on storeys 0-1, Union offices on 2-3), a lift shaft of three cells with doors to +x, stairs from the street up to a deck beside the lift, a two-cell walkway off the lift, a 2 x 2 pad on the roof. Clips `lit` and `flicker`; param `lit`.
- **Reads at 4x:** A tower. Market and Union storeys stack with no seam and no outline between cells: the only lines are the styles' own floor lines. Each shop cell has its own sign colour. The ancient foundation, the ruins and the crystals read under the street slab. The lift, the deck, the stairs and the pad read; the walkway reads as a bracket.
- **Reads at 1x (context.png):** A lit tower on ruins; the lift and the walkway are grey shapes beside it.
- **What it proves:** at load it runs `checkOffsetInvariance` for every module, style, side and three exposures: each module built at an offset in a larger grid gives the same voxels as alone, and writes nothing outside its cell.
- **Passes:** 2 (pass 2: no kerb at the layout's edge).
- **Rough time:** ~15 min.
