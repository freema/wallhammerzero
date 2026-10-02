import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // In the node_modules volume of the dev container, not in a node_modules folder on the bind mount.
  cacheDir: "../../node_modules/.vite-studio",
  environments: {
    ssr: {
      build: {
        // The server build starts at the Express app that wraps the request handler.
        rollupOptions: { input: "./server/app.ts" },
      },
    },
  },
  plugins: [reactRouter()],
  server: {
    fs: {
      // What the dev server may serve as source (its /@fs/ URLs): this package and the
      // dependencies. By default it would be the whole checkout. A note that imports another
      // workspace package into the browser code (the runtime) adds that package's folder here.
      allow: [".", "../../node_modules"],
    },
  },
});
