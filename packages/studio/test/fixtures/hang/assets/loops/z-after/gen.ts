// Studio fixture: a fine asset that sorts after `loops/forever`: it must still be baked after
// the timeout stopped the worker.

import { makeDot } from "../dot.ts";

export default makeDot("loops/z-after");
