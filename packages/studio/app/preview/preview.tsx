// A preview in a page: an element the preview host draws into. The element has the size of
// the picture (the asset's frame at an integer zoom) and holds a still image as its content
// until the sheet is loaded (and for good without JavaScript or WebGL2).
//
// Nothing here redraws through React: the host asks `choice()` every frame, so a preview
// changes its frame without a render.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, ReactNode, Ref } from "react";
import { sampleClip } from "@whz/runtime";
import type { Sheet } from "@whz/runtime";
import { cssPixel, validChoice } from "../lib/scene.ts";
import type { FrameChoice } from "../lib/scene.ts";
import type { SheetSource } from "../lib/variants.ts";
import { studioApi } from "./api.ts";
import { previewHost } from "./host.ts";
import { loadSheet } from "./sheets.ts";
import type { LoadedSheet } from "./sheets.ts";

function subscribePixelRatio(listener: () => void): () => void {
  // The ratio changes when the window moves to another display or the page is zoomed.
  const query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  query.addEventListener("change", listener);
  window.addEventListener("resize", listener);
  return () => {
    query.removeEventListener("change", listener);
    window.removeEventListener("resize", listener);
  };
}

/** The display's device pixel ratio (1 on the server). */
export function usePixelRatio(): number {
  return useSyncExternalStore(
    subscribePixelRatio,
    () => window.devicePixelRatio || 1,
    () => 1,
  );
}

/**
 * The sheet of a source, loaded. While another source is loading it stays the one before, so a
 * re-baked asset swaps its picture without a blank frame. Null before the first load.
 */
export function useLoadedSheet(source: SheetSource | null): LoadedSheet | null {
  const [loaded, setLoaded] = useState<LoadedSheet | null>(null);
  const atlasUrl = source?.atlasUrl ?? null;
  const sheetUrl = source?.sheetUrl ?? null;
  const seed = source?.seed ?? 0;
  useEffect(() => {
    if (atlasUrl === null || sheetUrl === null) {
      setLoaded(null);
      return;
    }
    let current = true;
    loadSheet({ atlasUrl, sheetUrl, seed }).then(
      (value) => {
        if (current) setLoaded(value);
      },
      (error: unknown) => console.error("[studio] a preview could not load its sheet:", error),
    );
    return () => {
      current = false;
    };
  }, [atlasUrl, sheetUrl, seed]);
  return loaded;
}

export interface PreviewBoxProps {
  /** The loaded sheet, or null while there is none. */
  readonly loaded: LoadedSheet | null;
  /** The frame size of the asset, in native pixels: the element is this size times the zoom. */
  readonly width: number;
  readonly height: number;
  readonly zoom: number;
  /** Which frame to show now. Asked every frame; it gets the sheet that is drawn. */
  readonly choice: (sheet: Sheet) => FrameChoice | null;
  /** The name a script finds this preview by (`data-preview`). */
  readonly id: string;
  readonly className?: string | undefined;
  /** The still image shown until the preview draws. */
  readonly children?: ReactNode;
  readonly elementRef?: Ref<HTMLDivElement> | undefined;
}

/** An element the preview host draws one preview into. */
export function PreviewBox({ loaded, width, height, zoom, choice, id, className, children, elementRef }: PreviewBoxProps) {
  const unit = cssPixel(zoom, usePixelRatio());
  const own = useRef<HTMLDivElement | null>(null);
  const latest = useRef({ loaded, zoom, choice });
  useEffect(() => {
    latest.current = { loaded, zoom, choice };
  });
  useEffect(() => {
    const element = own.current;
    if (element === null) return;
    studioApi(); // every page with a preview answers `window.__studio.preview`
    return previewHost().register(element, () => {
      const now = latest.current;
      if (now.loaded === null) return null;
      const wanted = now.choice(now.loaded.sheet);
      const valid = wanted === null ? null : validChoice(now.loaded.sheet, wanted);
      return valid === null ? null : { sheet: now.loaded.sheet, palette: now.loaded.palette, choice: valid, zoom: now.zoom };
    });
  }, []);
  const setRef = useCallback(
    (element: HTMLDivElement | null) => {
      own.current = element;
      if (typeof elementRef === "function") elementRef(element);
      else if (elementRef !== null && elementRef !== undefined) elementRef.current = element;
    },
    [elementRef],
  );
  return (
    <div
      ref={setRef}
      className={className === undefined ? "preview" : `preview ${className}`}
      data-preview={id}
      data-live={loaded !== null}
      data-zoom={zoom}
      data-native-size={`${width}x${height}`}
      style={{ width: width * unit, height: height * unit, "--px": `${unit}px` } as CSSProperties}
    >
      {children}
    </div>
  );
}

/** A preview that loads its own sheet. */
export function SourcePreview({ source, ...rest }: Omit<PreviewBoxProps, "loaded"> & { readonly source: SheetSource | null }) {
  return <PreviewBox loaded={useLoadedSheet(source)} {...rest} />;
}

/**
 * The choice of a card that just plays: the asset's first clip and facing, looping, on the
 * page's clock, so every card of a page is in step.
 */
export function playingChoice(sheet: Sheet): FrameChoice | null {
  const clip = sheet.atlas.clips[0];
  const facing = sheet.atlas.facings[0];
  if (clip === undefined || facing === undefined) return null;
  return { clip: clip.name, facing, frame: sampleClip({ frames: clip.frames, durations: clip.durations, loop: true }, performance.now()).frame };
}
