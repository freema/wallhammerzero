// Reference kinds: what the `x-ref` annotation of a schema can say about a string. Every id a
// game uses must resolve before the game is packed, so a typo is a validation error with a
// file and a JSON path, not a missing sprite at run time.
//
//   x-ref            the string is                                    resolved against
//   ---------------  -----------------------------------------------  --------------------------------
//   row:<table>      the id of a row of the data table <table>        the game's data/<table>.json
//   table            the name of a data table                         the tables the game's systems declare
//   system           the name of an engine system                     the engine registry (@whz/sim)
//   string           the id of a display text                         every locales/<lang>.json
//   doc:<slot>       the id of a file in a presentation folder        <slot>/<id>.json (doc:scenes, doc:ui)
//   palette          the id of a palette                              the catalog (assets/palettes/<id>.json)
//   asset            the id of an asset of any kind                   the catalog (assets/<id>/gen.ts)
//   asset:<kind>     the id of an asset of that kind (asset:sprite)   the catalog
//   clip:<field>     a clip of the asset named by the sibling <field>  the catalog
//   sound            the id of a sound                                the catalog
//
// The first five are inside the game. The rest live outside it, so the host hands them in as
// a `Catalog` (the Node side builds it from `assets/`).

/** A parsed `x-ref`. */
export type RefSpec =
  | { readonly kind: "row"; readonly table: string }
  | { readonly kind: "table" }
  | { readonly kind: "system" }
  | { readonly kind: "string" }
  | { readonly kind: "doc"; readonly slot: string }
  | { readonly kind: "palette" }
  | { readonly kind: "asset"; readonly assetKind: string | null }
  | { readonly kind: "clip"; readonly field: string }
  | { readonly kind: "sound" };

const NAME = /^[a-z][A-Za-z0-9]*$/;

/** Reads an `x-ref` value. Throws an `Error` that says what the kinds are. */
export function parseRef(text: unknown): RefSpec {
  if (typeof text === "string") {
    const colon = text.indexOf(":");
    const head = colon < 0 ? text : text.slice(0, colon);
    const tail = colon < 0 ? null : text.slice(colon + 1);
    if (tail === null) {
      if (head === "table" || head === "system" || head === "string" || head === "palette" || head === "sound") return { kind: head };
      if (head === "asset") return { kind: "asset", assetKind: null };
    } else if (NAME.test(tail)) {
      if (head === "row") return { kind: "row", table: tail };
      if (head === "doc") return { kind: "doc", slot: tail };
      if (head === "asset") return { kind: "asset", assetKind: tail };
      if (head === "clip") return { kind: "clip", field: tail };
    }
  }
  throw new Error(
    `x-ref ${JSON.stringify(text)} is not a reference kind (row:<table>, table, system, string, doc:<slot>, palette, asset, asset:<kind>, clip:<field>, sound)`,
  );
}

/** An asset as the catalog knows it, or why it could not be loaded. */
export type CatalogAsset =
  | { readonly kind: string; readonly clips: readonly string[]; readonly facings: readonly string[] }
  | { readonly error: string };

/**
 * The ids that live outside a game: palettes, assets and sounds. `assets` needs an entry only
 * for the ids the game refers to (`GameAnalysis.assetIds`).
 */
export interface Catalog {
  readonly palettes: ReadonlySet<string>;
  readonly assets: ReadonlyMap<string, CatalogAsset>;
  readonly sounds: ReadonlySet<string>;
}

/** A catalog with nothing in it. */
export const EMPTY_CATALOG: Catalog = Object.freeze({ palettes: new Set<string>(), assets: new Map<string, CatalogAsset>(), sounds: new Set<string>() });
