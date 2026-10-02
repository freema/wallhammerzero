// The palette table: the colours a draw resolves palette indices with. One row is one
// palette: 256 slots of RGBA. A sprite names its row, so the same sheet is drawn in other
// colours without a rebake. The WebGL backend uploads the table as its palette lookup
// texture (256 x rows); the CPU backend reads the same bytes.
//
// Slot 0 is transparent in every row, and so is every slot a row does not give. A pixel
// whose colour has alpha 0 is not drawn: that is the only transparency there is.

/** Slots per row: a palette index is one byte. */
export const PALETTE_SLOTS = 256;

const COLOR = /^#[0-9a-fA-F]{6}$/;

/** Rows of colours for a draw. Rows are palettes; a sprite picks one with `paletteRow`. */
export class PaletteTable {
  /** The number of rows. */
  readonly rows: number;
  /** RGBA bytes: slot `s` of row `r` is at `(r * 256 + s) * 4`. Change it only through `setRow`. */
  readonly data: Uint8Array;

  private changes = 0;

  /**
   * @param rows one list of `#rrggbb` colours per row, slot 0 first (an atlas's
   *   `palette.colors` is such a list). The colour given for slot 0 is ignored.
   */
  constructor(rows: readonly (readonly string[])[]) {
    if (rows.length < 1) throw new RangeError("PaletteTable: at least one row is needed");
    this.rows = rows.length;
    this.data = new Uint8Array(rows.length * PALETTE_SLOTS * 4);
    rows.forEach((colors, row) => this.write(row, colors));
  }

  /** Counts the changes made with `setRow`. A backend uses it to know when to upload again. */
  get version(): number {
    return this.changes;
  }

  /** Replaces the colours of one row. */
  setRow(row: number, colors: readonly string[]): this {
    if (!Number.isInteger(row) || row < 0 || row >= this.rows) {
      throw new RangeError(`PaletteTable.setRow: the table has rows 0..${this.rows - 1}, got ${String(row)}`);
    }
    this.write(row, colors);
    this.changes += 1;
    return this;
  }

  private write(row: number, colors: readonly string[]): void {
    if (colors.length < 1 || colors.length > PALETTE_SLOTS) {
      throw new RangeError(`PaletteTable: row ${row} has ${colors.length} colours; a row has 1 to ${PALETTE_SLOTS} slots`);
    }
    const base = row * PALETTE_SLOTS * 4;
    this.data.fill(0, base, base + PALETTE_SLOTS * 4);
    for (let slot = 1; slot < colors.length; slot += 1) {
      const color = colors[slot] as string;
      if (typeof color !== "string" || !COLOR.test(color)) {
        throw new Error(`PaletteTable: row ${row}, slot ${slot} must be "#rrggbb", got ${JSON.stringify(color)}`);
      }
      const value = Number.parseInt(color.slice(1), 16);
      const at = base + slot * 4;
      this.data[at] = value >>> 16;
      this.data[at + 1] = (value >>> 8) & 0xff;
      this.data[at + 2] = value & 0xff;
      this.data[at + 3] = 255;
    }
  }
}
