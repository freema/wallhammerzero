// The engine's system registry. The order of this list is the order systems run in, for every
// game: a game chooses which systems it uses, never their order. A new system is added here.

import type { SystemDef } from "../system.ts";
import { shopArrivals, shopCounter } from "./counter-shop.ts";

export const ENGINE_SYSTEMS: readonly SystemDef[] = Object.freeze([shopArrivals, shopCounter]);
