// The studio's pages. A later note adds its route here and its entry to NAV in root.tsx.
// (`/api/files/*` is not a route: server.ts serves it before the app, see server/services/http.ts.)

import { index, route } from "@react-router/dev/routes";
import type { RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/dashboard.tsx"),
  route("gallery", "routes/gallery.tsx"),
  route("tasks", "routes/tasks.tsx"),
  // An asset id is `<pack>/<name>`, so the id is the rest of the path.
  route("asset/*", "routes/asset.tsx"),
] satisfies RouteConfig;
