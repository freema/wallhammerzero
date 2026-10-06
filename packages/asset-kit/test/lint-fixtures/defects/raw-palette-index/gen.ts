// Lint fixture: an Asset object that was not made by defineAsset alone, so its frames are not
// checked when they are rendered; one frame has a pixel with an index the palette does not
// have. Must fail the lint with the rule `palette-index` (a program made with defineAsset fails
// with `render` instead: see ../off-palette).
import { makeWalker, withUncheckedFrames } from "../../walker.ts";

export default withUncheckedFrames(makeWalker("defects/raw-palette-index"), (frame, request) => (request.frame === 1 ? frame.pset(10, 13, 200) : frame));
