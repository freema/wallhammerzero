// New Hope's dev server: `./dev -p 4200 npm run dev -w @whz/new-hope-play`, then
// http://127.0.0.1:4200 in the host browser (the container has no GPU).
import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  server: { host: "0.0.0.0", port: 4200, strictPort: true },
  preview: { host: "0.0.0.0", port: 4200, strictPort: true },
  build: { outDir: "../../build/new-hope-play", emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});
