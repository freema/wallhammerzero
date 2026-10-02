// Small pieces every page uses.

import { useEffect } from "react";
import { useRevalidator } from "react-router";
import type { AssetStatus, BakeProgress } from "../server/services/index.ts";

/**
 * Pixel art, shown at an integer zoom and never smoothed: the element is exactly
 * `w * zoom` by `h * zoom` CSS pixels and scales with `image-rendering: pixelated`.
 */
export function PixelImage(props: { src: string; w: number; h: number; zoom: number; alt: string }) {
  const zoom = Math.max(1, Math.floor(props.zoom));
  return (
    <img
      className="pixel"
      src={props.src}
      alt={props.alt}
      width={props.w * zoom}
      height={props.h * zoom}
      data-native-size={`${props.w}x${props.h}`}
      data-zoom={zoom}
      draggable={false}
    />
  );
}

const STATUS_TEXT: Readonly<Record<AssetStatus, string>> = {
  baked: "baked",
  stale: "stale",
  error: "error",
  unbaked: "not baked",
};

const STATUS_HINT: Readonly<Record<AssetStatus, string>> = {
  baked: "The output on disk was baked from the current source files.",
  stale: "The source files changed since the last bake.",
  error: "The last bake failed.",
  unbaked: "No output yet.",
};

export function StatusBadge({ status }: { status: AssetStatus }) {
  return (
    <span className={`badge badge-${status}`} title={STATUS_HINT[status]}>
      {STATUS_TEXT[status]}
    </span>
  );
}

/** A line that says a bake is in flight, or nothing. */
export function BakeBanner({ running }: { running: BakeProgress | null }) {
  if (running === null) return null;
  return (
    <p className="banner" role="status">
      Baking {running.done} of {running.total}
      {running.current === null ? "" : `: ${running.current}`} …
    </p>
  );
}

/**
 * While a bake is in flight, asks the loaders again every second, so its results appear
 * without a reload. (The live-reload note replaces this with pushed events.)
 */
export function useBakePolling(active: boolean): void {
  const { revalidate } = useRevalidator();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void revalidate(), 1000);
    return () => clearInterval(timer);
  }, [active, revalidate]);
}
