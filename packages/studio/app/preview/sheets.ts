// Loading what a preview draws: the atlas of a bake and the sheet of one variant, read with
// the runtime's own parser and PNG decoder, exactly as a game reads them. Both files come
// from `/api/files/` under a URL that carries the hash of their content, so the browser keeps
// them and a re-bake has other URLs.
//
// Loads are shared: thirty cards of one asset fetch its atlas once. The few sheets that were
// used last stay in memory; an older one is dropped and its texture freed.

import { parseAtlas, sheetFromPng } from "@whz/runtime";
import type { Atlas, PaletteTable, Sheet } from "@whz/runtime";
import { previewPalette } from "../lib/scene.ts";
import type { SheetSource } from "../lib/variants.ts";
import { previewHost } from "./host.ts";

/** A sheet ready to draw, with the palette table of its atlas. */
export interface LoadedSheet {
  readonly sheet: Sheet;
  readonly palette: PaletteTable;
}

/** How many sheets are kept. A gallery page shows one per card. */
const KEEP_SHEETS = 256;
const KEEP_ATLASES = 256;

const atlases = new Map<string, Promise<{ atlas: Atlas; palette: PaletteTable }>>();
const sheets = new Map<string, Promise<LoadedSheet>>();

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response;
}

/** Moves `key` to the newest end of a cache and drops the oldest entries over `keep`. */
function touch<T>(cache: Map<string, Promise<T>>, key: string, value: Promise<T>, keep: number, dropped?: (value: T) => void): void {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > keep) {
    const oldest = cache.keys().next().value as string;
    const gone = cache.get(oldest);
    cache.delete(oldest);
    if (dropped !== undefined) void gone?.then(dropped, () => undefined);
  }
}

function loadAtlas(url: string): Promise<{ atlas: Atlas; palette: PaletteTable }> {
  let loading = atlases.get(url);
  if (loading === undefined) {
    loading = fetchOk(url)
      .then((response) => response.json())
      .then((json: unknown) => {
        const atlas = parseAtlas(json);
        return { atlas, palette: previewPalette(atlas.palette.colors) };
      });
    loading.catch(() => atlases.delete(url)); // a failed load is tried again next time
  }
  touch(atlases, url, loading, KEEP_ATLASES, ({ palette }) => previewHost().release(palette));
  return loading;
}

/** Loads a sheet, or gives the load that is already there. */
export function loadSheet(source: SheetSource): Promise<LoadedSheet> {
  const key = `${source.atlasUrl}\n${source.sheetUrl}`;
  let loading = sheets.get(key);
  if (loading === undefined) {
    loading = Promise.all([loadAtlas(source.atlasUrl), fetchOk(source.sheetUrl).then((response) => response.arrayBuffer())]).then(([{ atlas, palette }, bytes]) => ({
      sheet: sheetFromPng(atlas, new Uint8Array(bytes), source.seed),
      palette,
    }));
    loading.catch(() => sheets.delete(key));
  }
  touch(sheets, key, loading, KEEP_SHEETS, ({ sheet }) => previewHost().release(sheet));
  return loading;
}
