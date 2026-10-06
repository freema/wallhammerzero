// The preview host: every animated preview of a page is drawn by ONE WebGL2 context into ONE
// canvas, in ONE frame loop. A browser gives a page about 16 contexts, so a context per card
// would break a gallery; and the runtime is built for this (packages/runtime/README.md: it
// draws at native resolution into a target and upscales into a rectangle the host names).
//
//   <div class="preview-layer">      covers the page, above the content, below the top bar
//     <canvas>                       the size of the viewport, in device pixels; it is moved
//                                    to where the page is scrolled to before every draw
//
// A preview registers its element and a function that says what it shows now. Per frame the
// host asks every preview that is on screen (IntersectionObserver), reads where its element
// is, and draws it there: `draw` into a shared native-size target, `present` into the
// element's rectangle. The canvas is transparent elsewhere and takes no pointer events, so the
// page under it works as if it were not there. A frame in which nothing moved and no preview
// shows another picture draws nothing.
//
// The host owns the frame loop and passes the time on (`onFrame`); the runtime has no clock.
// Browser only: nothing here runs on the server, and nothing touches the DOM on import.

import type { PaletteTable, Placement, Sheet, Target } from "@whz/runtime";
import { createWebGLBackend } from "@whz/runtime/webgl";
import type { WebGLBackend } from "@whz/runtime/webgl";
import { deviceRect, deviceScale, frameList, onCanvas } from "../lib/scene.ts";
import type { FrameChoice } from "../lib/scene.ts";

/** What a preview shows now. */
export interface PreviewScene {
  readonly sheet: Sheet;
  readonly palette: PaletteTable;
  readonly choice: FrameChoice;
  /** The integer zoom, in CSS pixels per native pixel (at a pixel ratio of 1 or 2). */
  readonly zoom: number;
}

/** Numbers for a script and for the checks: how the page is drawn. */
export interface PreviewStats {
  /** WebGL contexts this page made for previews: 1 once a preview exists, never more. */
  readonly contexts: number;
  /** Canvas elements in the document. */
  readonly canvases: number;
  /** Registered previews, how many of them are on screen, and how many the last draw drew. */
  readonly previews: number;
  readonly visible: number;
  readonly drawn: number;
  /** Draws since the page loaded. It stands still while nothing changes. */
  readonly draws: number;
  /** Frames of the loop since the page loaded. */
  readonly frames: number;
  readonly pixelRatio: number;
  readonly canvas: string;
  readonly contextLost: boolean;
}

export interface PreviewHost {
  /**
   * Adds a preview: `element` is where it is drawn (its top-left corner), `scene` says what it
   * shows now, or null while it has nothing to show. Returns the function that removes it.
   */
  register(element: HTMLElement, scene: () => PreviewScene | null): () => void;
  /** Calls `listener` at the start of every frame with the real time since the frame before, in ms. */
  onFrame(listener: (realMs: number) => void): () => void;
  /** Where the preview of `element` was drawn last, in canvas pixels, or null. */
  placement(element: HTMLElement): Placement | null;
  /**
   * The native framebuffer of what the preview of `element` shows now: RGBA, the top row
   * first, at the asset's own resolution. Null if it has nothing to show.
   */
  readNative(element: HTMLElement): { width: number; height: number; pixels: Uint8Array } | null;
  /** Frees what the GPU holds for a sheet or a palette that is not shown any more. */
  release(resource: Sheet | PaletteTable): void;
  stats(): PreviewStats;
  /** Stops the loop and gives the context back. For hot reload. */
  destroy(): void;
}

interface Entry {
  readonly element: HTMLElement;
  readonly scene: () => PreviewScene | null;
  visible: boolean;
  placement: Placement | null;
}

/** The id of the element the canvas goes into (app/root.tsx renders it). */
export const PREVIEW_LAYER_ID = "preview-layer";

function createPreviewHost(): PreviewHost {
  const entries = new Map<HTMLElement, Entry>();
  const frameListeners = new Set<(realMs: number) => void>();
  const targets = new Map<string, Target>();
  const ids = new WeakMap<object, number>();
  let nextId = 1;
  const idOf = (thing: object): number => {
    let id = ids.get(thing);
    if (id === undefined) {
      id = nextId;
      nextId += 1;
      ids.set(thing, id);
    }
    return id;
  };

  let canvas: HTMLCanvasElement | null = null;
  let backend: WebGLBackend | null = null;
  let contexts = 0;
  let failed = false;
  let raf = 0;
  let last: number | null = null;
  let signature = "";
  let draws = 0;
  let frames = 0;
  let drawn = 0;
  let destroyed = false;

  // The canvas is the size of the viewport, so only what intersects the viewport is drawn: no
  // margin (a preview just outside it would count as visible and be drawn nowhere).
  const observer = new IntersectionObserver((changes) => {
    for (const change of changes) {
      const entry = entries.get(change.target as HTMLElement);
      if (entry !== undefined) entry.visible = change.isIntersecting;
    }
  });

  /** Makes the canvas and the context on first use. False if this browser gives no WebGL2. */
  const ensure = (): boolean => {
    if (backend !== null) return true;
    if (failed) return false;
    const layer = document.getElementById(PREVIEW_LAYER_ID);
    if (layer === null) return false; // the shell is not there yet
    const made = document.createElement("canvas");
    const gl = made.getContext("webgl2", { antialias: false, alpha: true, premultipliedAlpha: true });
    if (gl === null) {
      failed = true;
      console.warn("[studio] this browser gives no WebGL2 context: previews stay still images");
      return false;
    }
    contexts += 1;
    canvas = made;
    backend = createWebGLBackend(gl);
    made.addEventListener("webglcontextlost", (event) => event.preventDefault());
    made.addEventListener("webglcontextrestored", () => {
      backend?.reset();
      signature = "";
    });
    layer.append(made);
    return true;
  };

  const targetFor = (width: number, height: number): Target => {
    const key = `${width}x${height}`;
    let target = targets.get(key);
    if (target === undefined) {
      target = (backend as WebGLBackend).createTarget(width, height);
      targets.set(key, target);
    }
    return target;
  };

  const draw = (): void => {
    if (!ensure() || canvas === null || backend === null) return;
    const { gl } = backend;
    if (gl.isContextLost()) return;
    const ratio = window.devicePixelRatio || 1;
    const cssW = document.documentElement.clientWidth;
    const cssH = window.innerHeight;
    const width = Math.max(1, Math.round(cssW * ratio));
    const height = Math.max(1, Math.round(cssH * ratio));

    // What is to be drawn, and where.
    const jobs: { entry: Entry; scene: PreviewScene; rect: ReturnType<typeof deviceRect>; scale: number }[] = [];
    let next = `${width}x${height}`;
    for (const entry of entries.values()) {
      entry.placement = null;
      if (!entry.visible) continue;
      const scene = entry.scene();
      if (scene === null) continue;
      const [w, h] = scene.sheet.atlas.size;
      const scale = deviceScale(scene.zoom, ratio);
      const rect = deviceRect(entry.element.getBoundingClientRect(), w, h, scale, ratio);
      if (!onCanvas(rect, width, height)) continue;
      jobs.push({ entry, scene, rect, scale });
      const { choice } = scene;
      next += `|${idOf(scene.sheet)}.${idOf(scene.palette)}.${scene.palette.version}:${choice.clip}/${choice.facing}/${choice.frame}/${choice.prev ?? "-"}/${choice.next ?? "-"}@${rect.x},${rect.y}x${scale}`;
    }

    // The canvas sits where the page is scrolled to, so it covers the viewport. Until the next
    // frame it scrolls with the page, and the previews stay on their elements.
    canvas.style.transform = `translate(${window.scrollX}px, ${window.scrollY}px)`;
    if (next === signature) {
      // The same picture as last time: only say again where each preview is.
      for (const job of jobs) job.entry.placement = { x: job.rect.x, y: job.rect.y, w: job.rect.w, h: job.rect.h, scale: job.scale };
      return;
    }
    signature = next;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    for (const { entry, scene, rect, scale } of jobs) {
      const [w, h] = scene.sheet.atlas.size;
      const target = targetFor(w, h);
      backend.draw(target, frameList(scene.sheet, scene.choice), { palette: scene.palette });
      entry.placement = backend.present(target, rect, { scale });
    }
    drawn = jobs.length;
    draws += 1;
  };

  const tick = (now: number): void => {
    raf = 0;
    if (destroyed) return;
    const realMs = last === null ? 0 : now - last;
    last = now;
    frames += 1;
    for (const listener of [...frameListeners]) listener(realMs);
    draw();
    schedule();
  };

  /** The loop runs while there is a preview or a listener, and rests otherwise. */
  const schedule = (): void => {
    if (raf !== 0 || destroyed) return;
    if (entries.size === 0 && frameListeners.size === 0) {
      last = null;
      return;
    }
    raf = requestAnimationFrame(tick);
  };

  return {
    register(element, scene) {
      const entry: Entry = { element, scene, visible: false, placement: null };
      entries.set(element, entry);
      observer.observe(element);
      signature = "";
      schedule();
      return () => {
        // Only if it is still this registration: an element registered again replaced the entry.
        if (entries.get(element) !== entry) return;
        entries.delete(element);
        observer.unobserve(element);
        signature = "";
        schedule();
      };
    },
    onFrame(listener) {
      frameListeners.add(listener);
      schedule();
      return () => void frameListeners.delete(listener);
    },
    placement: (element) => entries.get(element)?.placement ?? null,
    readNative(element) {
      const scene = entries.get(element)?.scene() ?? null;
      if (scene === null || !ensure() || backend === null || backend.gl.isContextLost()) return null;
      const [width, height] = scene.sheet.atlas.size;
      // A target of its own: the shared ones hold whatever preview was drawn last.
      const target = backend.createTarget(width, height);
      backend.draw(target, frameList(scene.sheet, scene.choice), { palette: scene.palette });
      const pixels = backend.readPixels(target);
      backend.release(target);
      return { width, height, pixels };
    },
    release(resource) {
      backend?.release(resource);
    },
    stats: () => ({
      contexts,
      canvases: document.querySelectorAll("canvas").length,
      previews: entries.size,
      visible: [...entries.values()].filter((entry) => entry.visible).length,
      drawn,
      draws,
      frames,
      pixelRatio: window.devicePixelRatio || 1,
      canvas: canvas === null ? "none" : `${canvas.width}x${canvas.height}`,
      contextLost: backend?.gl.isContextLost() ?? false,
    }),
    destroy() {
      destroyed = true;
      if (raf !== 0) cancelAnimationFrame(raf);
      observer.disconnect();
      entries.clear();
      frameListeners.clear();
      backend?.dispose();
      backend?.gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas?.remove();
      backend = null;
      canvas = null;
    },
  };
}

let host: PreviewHost | null = null;

/** The one host of this page. Call it in the browser only (an effect, an event handler). */
export function previewHost(): PreviewHost {
  host ??= createPreviewHost();
  return host;
}

// Hot reload of this module: give the context back, or every edit would cost one of the
// browser's few.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    host?.destroy();
    host = null;
  });
}
