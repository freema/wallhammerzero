// `window.__studio`: what a script (a check in the browser, a verifier) asks the page. It
// answers with numbers and pixels, never with a screenshot.
//
//   __studio.preview.stats()          one context, how many previews, how many drawn
//   __studio.preview.list()           the previews of the page, in page order
//   __studio.preview.readNative(id)   the native framebuffer of a preview: RGBA, top row first
//   __studio.player                   the player of the asset page (app/lib/player.ts), or null

import type { Player } from "../lib/player.ts";
import { previewHost } from "./host.ts";
import type { PreviewStats } from "./host.ts";

export interface StudioApi {
  readonly preview: {
    stats(): PreviewStats;
    /** Every preview element of the page: its name, whether its sheet is loaded, its zoom. */
    list(): { id: string; live: boolean; zoom: number; nativeSize: string }[];
    /**
     * What a preview shows now, at the asset's own resolution. `id` is the preview's name
     * (`data-preview`): `main` on the asset page, the asset id on a gallery card. Without an
     * id: `main`, or the first preview of the page.
     */
    readNative(id?: string): { id: string; width: number; height: number; pixels: Uint8Array } | null;
  };
  /** The player of the asset page; null on the other pages. */
  player: Player | null;
}

declare global {
  interface Window {
    __studio?: StudioApi;
  }
}

const elements = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>("[data-preview]")];

/** Puts `window.__studio` there if it is not, and returns it. Browser only. */
export function studioApi(): StudioApi {
  window.__studio ??= {
    preview: {
      stats: () => previewHost().stats(),
      list: () => elements().map((element) => ({ id: element.dataset["preview"] ?? "", live: element.dataset["live"] === "true", zoom: Number(element.dataset["zoom"]), nativeSize: element.dataset["nativeSize"] ?? "" })),
      readNative(id) {
        const all = elements();
        const element = id === undefined ? (all.find((candidate) => candidate.dataset["preview"] === "main") ?? all[0]) : all.find((candidate) => candidate.dataset["preview"] === id);
        if (element === undefined) return null;
        const read = previewHost().readNative(element);
        return read === null ? null : { id: element.dataset["preview"] ?? "", ...read };
      },
    },
    player: null,
  };
  return window.__studio;
}
