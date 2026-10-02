// The dev page of the runtime: a bare Vite page that draws the baked example asset. It is a
// stand-in until the studio exists. Start it with `./dev -p 4101 npm run dev -w @whz/runtime`
// (see ../README.md). The gate builds the page once (`vite build`) to prove that it bundles.

import { createReadStream, statSync } from "node:fs";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
/** What `asset bake` writes: build/assets/<id>/. Served under /baked/. */
const baked = join(repo, "build", "assets");

const TYPES: Record<string, string> = { ".json": "application/json", ".png": "image/png" };

/** Serves the bake outputs (build outputs are not in the page's folder) at /baked/<id>/<file>. */
function bakedFiles(): Plugin {
  return {
    name: "whz-baked-files",
    configureServer(server) {
      server.middlewares.use("/baked", (request, response) => {
        const path = decodeURIComponent((request.url ?? "/").split("?")[0] ?? "/");
        const file = normalize(join(baked, path));
        if (!file.startsWith(baked + sep) || !(statSync(file, { throwIfNoEntry: false })?.isFile() ?? false)) {
          response.statusCode = 404;
          response.end(`not baked: ${path} (run: ./dev npm run asset -- bake --all)`);
          return;
        }
        response.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
        response.setHeader("Cache-Control", "no-store");
        createReadStream(file).pipe(response);
      });
    },
  };
}

export default defineConfig({
  root: here,
  plugins: [bakedFiles()],
  // In the node_modules volume of the dev container, not in the bind-mounted repo.
  cacheDir: join(repo, "node_modules", ".vite-runtime"),
  clearScreen: false,
  // Inside the container a server listens on 0.0.0.0; ./dev -p publishes it on 127.0.0.1 only.
  server: { host: "0.0.0.0", port: 4101, strictPort: true },
  build: { outDir: join(repo, "build", "runtime-dev"), emptyOutDir: true },
});
