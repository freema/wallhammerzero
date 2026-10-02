// The dev page: 16 previews of the baked example asset in 16 rectangles of one canvas, drawn
// by one WebGL2 context, and `window.__runtime` with the checks a verifier scripts.
//
// The frame loop is here, in the host, and nowhere in the runtime: the page turns its clock
// into a time and passes it in. The checks pass a time of their own.

import golden from "../test/golden/parity.json" with { type: "json" };
import { createCpuBackend, decodeIndexedPng, nativePixel, PALETTE_SLOTS, parseAtlas, pixelHash, sheetFromPng } from "../src/index.ts";
import type { Placement, Rect, Rgba, Sheet, Target } from "../src/index.ts";
import { createWebGLBackend } from "../src/webgl/index.ts";
import { EXAMPLE_ID, frameFile, GRID_CELLS, gridPreviews, isBakedFrameScene, parityScenes, examplePalette } from "./scenes.ts";
import type { Scene } from "./scenes.ts";

const BAKED = `/baked/${EXAMPLE_ID}`;
const COLUMNS = 4;
const CELL_W = 144;
const CELL_H = 112;

/** One compared scene of `parity()`. */
interface SceneReport {
  readonly name: string;
  readonly size: string;
  /** Pixels where the WebGL read-back differs from the CPU backend's buffer. */
  readonly mismatches: number;
  /** For a frame drawn as baked: pixels where the WebGL read-back differs from the baked frame file mapped through the palette. */
  readonly bakedMismatches: number | null;
  readonly webglHash: string;
  readonly cpuHash: string;
  /** The hash the Node tests pin for this scene (test/golden/parity.json). */
  readonly goldenHash: string | null;
  readonly ok: boolean;
}

interface ParityReport {
  readonly ok: boolean;
  readonly scenes: number;
  readonly failed: readonly string[];
  readonly renderer: string;
  readonly report: readonly SceneReport[];
}

interface GridReport {
  readonly ok: boolean;
  readonly timeMs: number;
  readonly canvases: number;
  readonly contexts: number;
  readonly cells: readonly { readonly cell: number; readonly native: string; readonly scale: number; readonly pixels: number; readonly mismatches: number }[];
}

interface RuntimeDevApi {
  /** What drew the page. */
  readonly info: { readonly renderer: string; readonly version: string; readonly canvas: string; readonly contexts: number };
  /** The time of the last draw, in milliseconds. */
  time(): number;
  play(): void;
  pause(): void;
  /** Pauses and draws the grid at a time. */
  setTime(timeMs: number): void;
  /** The native framebuffer of cell 0 (the example asset as baked) as drawn last: RGBA, the top row first. */
  readNative(): { width: number; height: number; timeMs: number; pixels: Uint8Array };
  /** WebGL against the CPU backend, the golden hashes and the baked frames, for every scene. */
  parity(): Promise<ParityReport>;
  /** Draws the 16 previews at a time and compares every rectangle of the canvas with the CPU backend's upscaled picture. */
  grid(timeMs?: number): GridReport;
  /** Loses and restores the WebGL context, then runs `parity()` again. */
  contextLoss(): Promise<ParityReport>;
}

declare global {
  interface Window {
    __runtime?: RuntimeDevApi;
  }
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url}: ${response.status} ${await response.text()}`);
  return new Uint8Array(await response.arrayBuffer());
}

function countMismatches(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) return Math.max(a.length, b.length) / 4;
  let count = 0;
  for (let at = 0; at < a.length; at += 4) {
    if (a[at] !== b[at] || a[at + 1] !== b[at + 1] || a[at + 2] !== b[at + 2] || a[at + 3] !== b[at + 3]) count += 1;
  }
  return count;
}

async function start(): Promise<void> {
  const status = document.querySelector<HTMLPreElement>("#status") as HTMLPreElement;
  const canvas = document.querySelector<HTMLCanvasElement>("#view") as HTMLCanvasElement;
  const say = (text: string, bad = false): void => {
    status.textContent = text;
    status.classList.toggle("bad", bad);
  };

  // The bake: atlas.json and one indexed PNG per variant, read by the runtime's own decoder.
  const atlasResponse = await fetch(`${BAKED}/atlas.json`, { cache: "no-store" });
  if (!atlasResponse.ok) throw new Error(`${BAKED}/atlas.json: ${atlasResponse.status} ${await atlasResponse.text()}`);
  const atlas = parseAtlas(await atlasResponse.json());
  const sheets: Sheet[] = [];
  for (const variant of atlas.variants) sheets.push(sheetFromPng(atlas, await fetchBytes(`${BAKED}/${variant.sheet}`), variant.seed));
  const palette = examplePalette(atlas);

  // One canvas, one context, sized in device pixels so a canvas pixel is a screen pixel.
  const rows = Math.ceil(GRID_CELLS / COLUMNS);
  canvas.width = COLUMNS * CELL_W;
  canvas.height = rows * CELL_H;
  canvas.style.width = `${canvas.width / window.devicePixelRatio}px`;
  canvas.style.height = `${canvas.height / window.devicePixelRatio}px`;
  let contexts = 0;
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: true, premultipliedAlpha: true });
  if (gl === null) throw new Error("this browser gives no WebGL2 context");
  contexts += 1;
  const webgl = createWebGLBackend(gl);
  const cpu = createCpuBackend();
  canvas.addEventListener("webglcontextlost", (event) => event.preventDefault());
  canvas.addEventListener("webglcontextrestored", () => webgl.reset());

  const cellRect = (cell: number): Rect => ({ x: (cell % COLUMNS) * CELL_W, y: Math.floor(cell / COLUMNS) * CELL_H, w: CELL_W, h: CELL_H });

  // Targets are native-resolution framebuffers. Cell 0 keeps its own, so readNative() reads
  // it at any time; the other cells share one target per size and draw it again and again.
  const mainTarget = webgl.createTarget(atlas.size[0], atlas.size[1]);
  const shared = new Map<string, Target>();
  const targetFor = (cell: number, scene: Scene): Target => {
    if (cell === 0) return mainTarget;
    const key = `${scene.width}x${scene.height}`;
    let target = shared.get(key);
    if (target === undefined) {
      target = webgl.createTarget(scene.width, scene.height);
      shared.set(key, target);
    }
    return target;
  };

  let timeMs = 0;
  let playing = true;
  let placements: Placement[] = [];

  const drawGrid = (at: number): void => {
    timeMs = at;
    placements = gridPreviews(sheets, at).map(({ scene, background }, cell) => {
      const target = targetFor(cell, scene);
      webgl.draw(target, scene.list, { palette, clear: scene.clear });
      return webgl.present(target, cellRect(cell), { background });
    });
  };

  const drawBoth = (scene: Scene): { webglPixels: Uint8Array; cpuPixels: Uint8Array } => {
    const onGpu = webgl.createTarget(scene.width, scene.height);
    webgl.draw(onGpu, scene.list, { palette, clear: scene.clear });
    const webglPixels = webgl.readPixels(onGpu);
    webgl.release(onGpu);
    const onCpu = cpu.createTarget(scene.width, scene.height);
    cpu.draw(onCpu, scene.list, { palette, clear: scene.clear });
    return { webglPixels, cpuPixels: cpu.readPixels(onCpu) };
  };

  const parity = async (): Promise<ParityReport> => {
    const expected: Record<string, string> = golden.scenes;
    const report: SceneReport[] = [];
    for (const scene of parityScenes(sheets)) {
      const { webglPixels, cpuPixels } = drawBoth(scene);
      let bakedMismatches: number | null = null;
      if (isBakedFrameScene(scene)) {
        // The baked frame file, mapped through the palette: what the frame must look like.
        const item = scene.list.items()[0] as ReturnType<typeof scene.list.items>[number];
        const frame = decodeIndexedPng(await fetchBytes(`${BAKED}/${frameFile(item.sheet, item.frame)}`));
        const baked = new Uint8Array(frame.w * frame.h * 4);
        for (let i = 0; i < frame.data.length; i += 1) baked.set(palette.data.subarray((frame.data[i] as number) * 4, (frame.data[i] as number) * 4 + 4), i * 4);
        bakedMismatches = countMismatches(webglPixels, baked);
      }
      const mismatches = countMismatches(webglPixels, cpuPixels);
      const webglHash = pixelHash(scene.width, scene.height, webglPixels);
      const goldenHash = expected[scene.name] ?? null;
      report.push({
        name: scene.name,
        size: `${scene.width}x${scene.height}`,
        mismatches,
        bakedMismatches,
        webglHash,
        cpuHash: pixelHash(scene.width, scene.height, cpuPixels),
        goldenHash,
        ok: mismatches === 0 && (bakedMismatches ?? 0) === 0 && webglHash === goldenHash,
      });
    }
    const failed = report.filter((scene) => !scene.ok).map((scene) => scene.name);
    const ok = failed.length === 0 && report.length === Object.keys(expected).length;
    say(`parity: ${ok ? "ok" : "FAILED"}, ${report.length} scenes${failed.length > 0 ? `, failed: ${failed.join("; ")}` : ""}`, !ok);
    return { ok, scenes: report.length, failed, renderer: info.renderer, report };
  };

  const grid = (at: number = timeMs): GridReport => {
    playing = false;
    drawGrid(at);
    // Read the canvas back in the same task as the draw: the drawing buffer is still there.
    const previews = gridPreviews(sheets, at);
    const cells = previews.map(({ scene, background }, cell) => {
      const rect = cellRect(cell);
      const place = placements[cell] as Placement;
      const onCanvas = new Uint8Array(rect.w * rect.h * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(rect.x, canvas.height - rect.y - rect.h, rect.w, rect.h, gl.RGBA, gl.UNSIGNED_BYTE, onCanvas);
      const onCpu = cpu.createTarget(scene.width, scene.height);
      cpu.draw(onCpu, scene.list, { palette, clear: scene.clear });
      const native = cpu.pixels(onCpu);
      let mismatches = 0;
      for (let y = 0; y < rect.h; y += 1) {
        for (let x = 0; x < rect.w; x += 1) {
          // What the cell must show here: the native pixel under it, or the background.
          const under = nativePixel(place, rect.x + x, rect.y + y);
          let want: Rgba | Uint8Array = background;
          if (under !== null) {
            const at4 = (under.y * scene.width + under.x) * 4;
            if (native[at4 + 3] !== 0) want = native.subarray(at4, at4 + 4);
          }
          const got = ((rect.h - 1 - y) * rect.w + x) * 4; // readPixels gives the bottom row first
          if (onCanvas[got] !== want[0] || onCanvas[got + 1] !== want[1] || onCanvas[got + 2] !== want[2] || onCanvas[got + 3] !== want[3]) mismatches += 1;
        }
      }
      return { cell, native: `${scene.width}x${scene.height}`, scale: place.scale, pixels: rect.w * rect.h, mismatches };
    });
    const ok = cells.length === GRID_CELLS && cells.every((cell) => cell.mismatches === 0);
    say(`grid: ${ok ? "ok" : "FAILED"}, ${cells.length} rectangles on ${document.querySelectorAll("canvas").length} canvas, ${contexts} context`, !ok);
    return { ok, timeMs: at, canvases: document.querySelectorAll("canvas").length, contexts, cells };
  };

  const contextLoss = async (): Promise<ParityReport> => {
    const extension = gl.getExtension("WEBGL_lose_context");
    if (extension === null) throw new Error("WEBGL_lose_context is not available");
    const event = (name: string): Promise<void> => new Promise((done) => canvas.addEventListener(name, () => done(), { once: true }));
    const lost = event("webglcontextlost");
    extension.loseContext();
    await lost;
    // Restoring is allowed only once the lost event is over (its default was prevented above).
    await new Promise((done) => setTimeout(done, 0));
    const restored = event("webglcontextrestored");
    extension.restoreContext();
    await restored;
    const report = await parity();
    drawGrid(timeMs);
    return report;
  };

  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const info = {
    renderer: String(gl.getParameter(debug === null ? gl.RENDERER : debug.UNMASKED_RENDERER_WEBGL)),
    version: String(gl.getParameter(gl.VERSION)),
    canvas: `${canvas.width}x${canvas.height}`,
    contexts,
  };

  window.__runtime = {
    info,
    time: () => timeMs,
    play: () => {
      playing = true;
    },
    pause: () => {
      playing = false;
    },
    setTime: (at) => {
      playing = false;
      drawGrid(at);
    },
    readNative: () => ({ width: mainTarget.width, height: mainTarget.height, timeMs, pixels: webgl.readPixels(mainTarget) }),
    parity,
    grid,
    contextLoss,
  };

  // The host's frame loop. The runtime has none: it is told the time.
  const began = performance.now();
  const tick = (now: number): void => {
    if (playing && !gl.isContextLost()) drawGrid(Math.floor(now - began));
    requestAnimationFrame(tick);
  };
  drawGrid(0);
  requestAnimationFrame(tick);
  say(`${EXAMPLE_ID}: ${sheets.length} variants, ${atlas.frames.length} frames, palette ${atlas.palette.id} (${atlas.palette.colors.length} of ${PALETTE_SLOTS} slots)\n${info.renderer}`);
}

start().catch((error: unknown) => {
  const status = document.querySelector("#status");
  if (status !== null) {
    status.textContent = `failed: ${error instanceof Error ? error.message : String(error)}`;
    status.classList.add("bad");
  }
  throw error;
});
