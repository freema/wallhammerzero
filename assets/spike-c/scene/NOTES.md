# spike-c/scene

- **Reads at 1x:** An iso room of 10 x 8 tiles on a plain backdrop: walls along the two back edges, a shelf, a plant, a desk with a PC behind it, a vending machine in use, a sofa, three chibis and the 2D level-up pop; the same UI strip as A and B.
- **Deviations from the brief:** The pop is the 2D FX of variant B (FX stay 2D in every variant). The shadows are the baker's contact shadows: opaque only.
- **Open issues:** Items on one screen column (same tx - tz) cover each other fully: the chibi 'at the machine' had to move two tiles aside. Painter's order needs walls before props on the same tile.
- **Passes:** 3 visual passes (hidden machine, hidden desk, order of walls).
- **Rough time:** ~30 min.
