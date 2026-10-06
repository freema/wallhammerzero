// Lint fixture: an Asset object that was not made by defineAsset alone, so its frames are not
// checked when they are rendered; one frame is a pixel narrower than the asset's size. Must
// fail the lint with the rule `frame-size` (a program made with defineAsset fails with
// `render` instead: see ../wrong-frame-size).
import { makeWalker, withUncheckedFrames } from "../../walker.ts";

export default withUncheckedFrames(makeWalker("defects/raw-frame-size"), (frame, request) => (request.frame === 3 ? frame.crop(0, 0, frame.w - 1, frame.h) : frame));
