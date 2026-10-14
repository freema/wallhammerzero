// Tidewright's dev server: `./dev -p 4300 npm run dev -w @whz/tidewright-play`, then
// http://127.0.0.1:4300 in the host browser (the container has no GPU). The shot plugin
// writes `__game.shot()` PNGs to build/shots/tidewright/.
import { shotPlugin } from "@whz/play-kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [shotPlugin("tidewright")],
  server: { host: "0.0.0.0", port: 4300, strictPort: true },
  preview: { host: "0.0.0.0", port: 4300, strictPort: true },
  build: { outDir: "../../build/tidewright-play", emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});
