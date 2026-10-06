// Lint fixture: a staff is thrust out sideways for one frame, so an edge of the bounding box
// jumps. Must fail the lint with the rule `bbox-change`.
import { makeWalker } from "../../walker.ts";

export default makeWalker("defects/bbox-jump", "bbox-jump");
