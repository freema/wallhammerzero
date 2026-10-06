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
      // What the dev server may serve as source (its /@fs/ URLs). By default it would be the
      // whole checkout. It is this package, the dependencies, and the four workspace packages
      // the browser side is built from: a workspace package is a symlink in node_modules, and
      // Vite serves it from its real folder, so each one must be named. Nothing else of the
      // checkout (test/dev-server.test.ts); a new package for the browser is added here.
      allow: [".", "../../node_modules", "../runtime", "../asset-kit", "../voxel-kit", "../det"],
    },
  },
});
