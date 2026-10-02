// The router context key of the studio's server services. A loader or an action reads them
// with `context.get(studioContext)`; server/app.ts sets them for every request.

import { createContext } from "react-router";
import type { StudioServices } from "../server/services/index.ts";

export const studioContext = createContext<StudioServices>();
