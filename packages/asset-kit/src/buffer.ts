// IndexedBuffer: w x h palette indices, 0 = transparent. Everything an asset program draws
// goes through it. All coordinates, sizes and colours are integers; a float, NaN or undefined
// throws instead of drawing something slightly wrong. Drawing outside the buffer is clipped.
//
// Methods that draw change the buffer and return it (so calls chain). Methods named after
// what they give (`clone`, `crop`, `flipX`, `flipY`, `remap`, `silhouette`) return a new buffer.

/** The palette index of a transparent pixel. */
export const TRANSPARENT = 0;
/** The largest width or height of a buffer. */
export const MAX_BUFFER_SIZE = 4096;

/** The 4 x 4 Bayer matrix: thresholds 0..15, indexed `[y & 3][x & 3]`. */
const BAYER4: readonly (readonly number[])[] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** The Bayer threshold (0..15) of a pixel position. */
export function bayer4(x: number, y: number): number {
  requireInt("bayer4", "x", x);
  requireInt("bayer4", "y", y);
  return (BAYER4[y & 3] as readonly number[])[x & 3] as number;
}

function requireInt(fn: string, name: string, value: number): void {
  if ((value | 0) !== value) {
    throw new RangeError(`${fn}: ${name} must be a 32-bit integer, got ${String(value)}`);
  }
}

function requireSize(fn: string, name: string, value: number): void {
  if ((value | 0) !== value || value < 0) {
    throw new RangeError(`${fn}: ${name} must be a non-negative integer, got ${String(value)}`);
  }
}

function requireColor(fn: string, value: number): void {
  if ((value & 0xff) !== value) {
    throw new RangeError(`${fn}: the colour must be a palette index 0..255, got ${String(value)}`);
  }
}

/** A map from palette index to palette index, for `remap`. */
export type RemapTable = ReadonlyMap<number, number> | Readonly<Record<number, number>>;

/** Options of `blit`. */
export interface BlitOptions {
  /** Mirror the source left to right. */
  readonly mirrorX?: boolean;
  /** Mirror the source top to bottom. */
  readonly mirrorY?: boolean;
}

/** The box around the opaque pixels of a buffer. */
export interface Bounds {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export class IndexedBuffer {
  readonly w: number;
  readonly h: number;
  /** Row-major palette indices, `w * h` bytes. */
  readonly data: Uint8Array;

  /** A transparent buffer, or one over existing `data` (not copied). */
  constructor(w: number, h: number, data?: Uint8Array) {
    for (const [name, value] of [["w", w], ["h", h]] as const) {
      if ((value | 0) !== value || value < 1 || value > MAX_BUFFER_SIZE) {
        throw new RangeError(`IndexedBuffer: ${name} must be an integer in [1, ${MAX_BUFFER_SIZE}], got ${String(value)}`);
      }
    }
    if (data !== undefined && data.length !== w * h) {
      throw new RangeError(`IndexedBuffer: data has ${data.length} bytes, expected ${w} x ${h} = ${w * h}`);
    }
    this.w = w;
    this.h = h;
    this.data = data ?? new Uint8Array(w * h);
  }

  /** True if (x, y) is inside the buffer. */
  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  /** The palette index at (x, y); 0 outside the buffer. */
  get(x: number, y: number): number {
    requireInt("get", "x", x);
    requireInt("get", "y", y);
    return this.inside(x, y) ? (this.data[y * this.w + x] as number) : TRANSPARENT;
  }

  /** Sets one pixel. */
  pset(x: number, y: number, color: number): this {
    requireInt("pset", "x", x);
    requireInt("pset", "y", y);
    requireColor("pset", color);
    if (this.inside(x, y)) this.data[y * this.w + x] = color;
    return this;
  }

  /** Fills the whole buffer with one index (transparent by default). */
  clear(color: number = TRANSPARENT): this {
    requireColor("clear", color);
    this.data.fill(color);
    return this;
  }

  /** A filled rectangle with its top-left corner at (x, y). */
  fill(x: number, y: number, w: number, h: number, color: number): this {
    requireInt("fill", "x", x);
    requireInt("fill", "y", y);
    requireSize("fill", "w", w);
    requireSize("fill", "h", h);
    requireColor("fill", color);
    const x0 = Math.max(x, 0);
    const y0 = Math.max(y, 0);
    const x1 = Math.min(x + w, this.w);
    const y1 = Math.min(y + h, this.h);
    for (let py = y0; py < y1; py += 1) {
      if (x0 < x1) this.data.fill(color, py * this.w + x0, py * this.w + x1);
    }
    return this;
  }

  /** A horizontal line of `length` pixels going right from (x, y). */
  hline(x: number, y: number, length: number, color: number): this {
    return this.fill(x, y, length, 1, color);
  }

  /** A vertical line of `length` pixels going down from (x, y). */
  vline(x: number, y: number, length: number, color: number): this {
    return this.fill(x, y, 1, length, color);
  }

  /** The 1-pixel outline of a rectangle with its top-left corner at (x, y). */
  rect(x: number, y: number, w: number, h: number, color: number): this {
    requireSize("rect", "w", w);
    requireSize("rect", "h", h);
    if (w === 0 || h === 0) return this.fill(x, y, 0, 0, color);
    this.fill(x, y, w, 1, color);
    this.fill(x, y + h - 1, w, 1, color);
    this.fill(x, y, 1, h, color);
    return this.fill(x + w - 1, y, 1, h, color);
  }

  /** A 1-pixel line from (x0, y0) to (x1, y1), both ends included (integer Bresenham). */
  line(x0: number, y0: number, x1: number, y1: number, color: number): this {
    requireInt("line", "x0", x0);
    requireInt("line", "y0", y0);
    requireInt("line", "x1", x1);
    requireInt("line", "y1", y1);
    requireColor("line", color);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;
    let x = x0;
    let y = y0;
    for (;;) {
      if (this.inside(x, y)) this.data[y * this.w + x] = color;
      if (x === x1 && y === y1) break;
      const doubled = 2 * error;
      if (doubled >= dy) {
        error += dy;
        x += sx;
      }
      if (doubled <= dx) {
        error += dx;
        y += sy;
      }
    }
    return this;
  }

  /**
   * A filled ellipse inscribed in the box with its top-left corner at (x, y). A pixel is in
   * the ellipse when its centre is: a 5 x 5 box gives rows of 3, 5, 5, 5, 3 pixels and an
   * 8 x 8 box rows of 4, 6, 8, 8, 8, 8, 6, 4.
   */
  fillEllipse(x: number, y: number, w: number, h: number, color: number): this {
    requireInt("fillEllipse", "x", x);
    requireInt("fillEllipse", "y", y);
    requireColor("fillEllipse", color);
    const insets = ellipseInsets("fillEllipse", w, h);
    for (let row = 0; row < h; row += 1) {
      const inset = insets[row] as number;
      this.fill(x + inset, y + row, w - 2 * inset, 1, color);
    }
    return this;
  }

  /** The 1-pixel outline of the ellipse `fillEllipse` fills: its pixels that touch the outside. */
  ellipse(x: number, y: number, w: number, h: number, color: number): this {
    requireInt("ellipse", "x", x);
    requireInt("ellipse", "y", y);
    requireColor("ellipse", color);
    const insets = ellipseInsets("ellipse", w, h);
    for (let row = 0; row < h; row += 1) {
      const inset = insets[row] as number;
      // A row's pixels are on the rim where the row above or below is narrower.
      const above = row === 0 ? w : (insets[row - 1] as number);
      const below = row === h - 1 ? w : (insets[row + 1] as number);
      const rim = Math.max(1, Math.max(above, below) - inset);
      const span = w - 2 * inset;
      if (2 * rim >= span) {
        this.fill(x + inset, y + row, span, 1, color);
      } else {
        this.fill(x + inset, y + row, rim, 1, color);
        this.fill(x + w - inset - rim, y + row, rim, 1, color);
      }
    }
    return this;
  }

  /**
   * Replaces the 4-connected area of one index around (x, y) with `color`. Does nothing
   * outside the buffer.
   */
  floodFill(x: number, y: number, color: number): this {
    requireInt("floodFill", "x", x);
    requireInt("floodFill", "y", y);
    requireColor("floodFill", color);
    if (!this.inside(x, y)) return this;
    const { w, h, data } = this;
    const target = data[y * w + x] as number;
    if (target === color) return this;
    const stack = [y * w + x];
    data[y * w + x] = color;
    while (stack.length > 0) {
      const at = stack.pop() as number;
      const px = at % w;
      if (px > 0 && data[at - 1] === target) {
        data[at - 1] = color;
        stack.push(at - 1);
      }
      if (px < w - 1 && data[at + 1] === target) {
        data[at + 1] = color;
        stack.push(at + 1);
      }
      if (at >= w && data[at - w] === target) {
        data[at - w] = color;
        stack.push(at - w);
      }
      if (at < w * (h - 1) && data[at + w] === target) {
        data[at + w] = color;
        stack.push(at + w);
      }
    }
    return this;
  }

  /**
   * Draws `source` with its top-left corner at (x, y). Transparent source pixels leave the
   * destination as it is.
   */
  blit(source: IndexedBuffer, x: number, y: number, options: BlitOptions = {}): this {
    requireInt("blit", "x", x);
    requireInt("blit", "y", y);
    const mirrorX = options.mirrorX === true;
    const mirrorY = options.mirrorY === true;
    for (let sy = 0; sy < source.h; sy += 1) {
      const py = y + sy;
      if (py < 0 || py >= this.h) continue;
      const fromRow = (mirrorY ? source.h - 1 - sy : sy) * source.w;
      for (let sx = 0; sx < source.w; sx += 1) {
        const px = x + sx;
        if (px < 0 || px >= this.w) continue;
        const color = source.data[fromRow + (mirrorX ? source.w - 1 - sx : sx)] as number;
        if (color !== TRANSPARENT) this.data[py * this.w + px] = color;
      }
    }
    return this;
  }

  /**
   * Ordered dither: sets the pixels of a rectangle whose Bayer threshold is below `level`.
   * Level 0 sets none, 8 a checkerboard, 16 all. The pattern is anchored to the buffer, so
   * neighbouring dithered areas line up.
   */
  dither(x: number, y: number, w: number, h: number, color: number, level: number): this {
    requireInt("dither", "x", x);
    requireInt("dither", "y", y);
    requireSize("dither", "w", w);
    requireSize("dither", "h", h);
    requireColor("dither", color);
    if ((level | 0) !== level || level < 0 || level > 16) {
      throw new RangeError(`dither: level must be an integer in [0, 16], got ${String(level)}`);
    }
    const x1 = Math.min(x + w, this.w);
    const y1 = Math.min(y + h, this.h);
    for (let py = Math.max(y, 0); py < y1; py += 1) {
      const thresholds = BAYER4[py & 3] as readonly number[];
      for (let px = Math.max(x, 0); px < x1; px += 1) {
        if ((thresholds[px & 3] as number) < level) this.data[py * this.w + px] = color;
      }
    }
    return this;
  }

  /**
   * Outlines the opaque pixels: every transparent pixel that touches one (up, down, left or
   * right) becomes ink. A rim pixel under or to the right of the shape gets `shadowInk`, the
   * others (the top and left rim) get `ink`. The shape needs a 1-pixel margin inside the
   * buffer; an outline that falls outside is clipped.
   */
  outline(ink: number, shadowInk: number = ink): this {
    requireColor("outline", ink);
    requireColor("outline", shadowInk);
    const { w, h } = this;
    const before = this.data.slice();
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const at = y * w + x;
        if (before[at] !== TRANSPARENT) continue;
        const above = y > 0 && before[at - w] !== TRANSPARENT;
        const left = x > 0 && before[at - 1] !== TRANSPARENT;
        const below = y < h - 1 && before[at + w] !== TRANSPARENT;
        const right = x < w - 1 && before[at + 1] !== TRANSPARENT;
        if (above || left) this.data[at] = shadowInk;
        else if (below || right) this.data[at] = ink;
      }
    }
    return this;
  }

  /** A copy. */
  clone(): IndexedBuffer {
    return new IndexedBuffer(this.w, this.h, this.data.slice());
  }

  /** A new buffer holding the w x h area at (x, y); parts outside this buffer are transparent. */
  crop(x: number, y: number, w: number, h: number): IndexedBuffer {
    requireInt("crop", "x", x);
    requireInt("crop", "y", y);
    return new IndexedBuffer(w, h).blit(this, -x, -y);
  }

  /** A copy mirrored left to right. */
  flipX(): IndexedBuffer {
    return new IndexedBuffer(this.w, this.h).blit(this, 0, 0, { mirrorX: true });
  }

  /** A copy mirrored top to bottom. */
  flipY(): IndexedBuffer {
    return new IndexedBuffer(this.w, this.h).blit(this, 0, 0, { mirrorY: true });
  }

  /**
   * A copy with palette indices replaced: `{ 4: 7 }` turns every 4 into 7. Indices that are
   * not in the table stay. All replacements read the original, so `{ 4: 7, 7: 4 }` swaps.
   */
  remap(table: RemapTable): IndexedBuffer {
    const lookup = new Uint8Array(256);
    for (let i = 0; i < 256; i += 1) lookup[i] = i;
    const entries: Iterable<readonly [number | string, number]> =
      table instanceof Map ? table.entries() : Object.entries(table);
    for (const [key, to] of entries) {
      const from = typeof key === "string" ? Number(key) : key;
      requireColor("remap (from)", from);
      requireColor("remap (to)", to);
      lookup[from] = to;
    }
    const out = new Uint8Array(this.data.length);
    for (let i = 0; i < out.length; i += 1) out[i] = lookup[this.data[i] as number] as number;
    return new IndexedBuffer(this.w, this.h, out);
  }

  /** A copy with every opaque pixel in one colour: the shape without its inside. */
  silhouette(color: number): IndexedBuffer {
    requireColor("silhouette", color);
    const out = new Uint8Array(this.data.length);
    for (let i = 0; i < out.length; i += 1) out[i] = this.data[i] === TRANSPARENT ? TRANSPARENT : color;
    return new IndexedBuffer(this.w, this.h, out);
  }

  /** The number of opaque pixels. */
  opaqueCount(): number {
    let count = 0;
    for (let i = 0; i < this.data.length; i += 1) if (this.data[i] !== TRANSPARENT) count += 1;
    return count;
  }

  /**
   * The orphan pixels: opaque pixels with no pixel of the same index among their eight
   * neighbours. A lone highlight is one; so is a stray pixel. Returns their offsets in `data`
   * (`y * w + x`), in row order.
   */
  orphanPixels(): number[] {
    const { w, h, data } = this;
    const found: number[] = [];
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const color = data[y * w + x] as number;
        if (color === TRANSPARENT) continue;
        let alone = true;
        for (let dy = -1; dy <= 1 && alone; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < w && ny < h && data[ny * w + nx] === color) {
              alone = false;
              break;
            }
          }
        }
        if (alone) found.push(y * w + x);
      }
    }
    return found;
  }

  /** The number of orphan pixels (see `orphanPixels`). */
  orphanCount(): number {
    return this.orphanPixels().length;
  }

  /** The box around the opaque pixels, or null for a fully transparent buffer. */
  bounds(): Bounds | null {
    const { w, h, data } = this;
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (data[y * w + x] === TRANSPARENT) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  /** True if `other` has the same size and the same pixels. */
  equals(other: IndexedBuffer): boolean {
    if (other.w !== this.w || other.h !== this.h) return false;
    for (let i = 0; i < this.data.length; i += 1) if (this.data[i] !== other.data[i]) return false;
    return true;
  }

  /**
   * The buffer as text, one row per line: `.` is transparent, `1`..`9` then `a`..`z` are the
   * indices 1..35, and `#` is anything above. For tests and for reading a frame without an image.
   */
  toText(): string {
    const symbols = ".123456789abcdefghijklmnopqrstuvwxyz";
    const rows: string[] = [];
    for (let y = 0; y < this.h; y += 1) {
      let row = "";
      for (let x = 0; x < this.w; x += 1) {
        const color = this.data[y * this.w + x] as number;
        row += color < symbols.length ? symbols.charAt(color) : "#";
      }
      rows.push(row);
    }
    return rows.join("\n");
  }
}

/**
 * For each row of an ellipse inscribed in a w x h box: how many pixels are outside it on each
 * side. Pixel (i, j) is inside when its centre is, in doubled coordinates:
 * (2i + 1 - w)^2 * h^2 + (2j + 1 - h)^2 * w^2 <= w^2 * h^2. Every row keeps at least its
 * centre pixel (two for an even width), so the ellipse always spans the height of the box.
 */
function ellipseInsets(fn: string, w: number, h: number): Int32Array {
  for (const [name, value] of [["w", w], ["h", h]] as const) {
    if ((value | 0) !== value || value < 1 || value > MAX_BUFFER_SIZE) {
      throw new RangeError(`${fn}: ${name} must be an integer in [1, ${MAX_BUFFER_SIZE}], got ${String(value)}`);
    }
  }
  const insets = new Int32Array(h);
  const limit = w * w * h * h;
  const centre = (w - 1) >> 1;
  for (let row = 0; row < h; row += 1) {
    const dy = 2 * row + 1 - h;
    const vertical = dy * dy * w * w;
    let inset = 0;
    while (inset < centre) {
      const dx = 2 * inset + 1 - w;
      if (dx * dx * h * h + vertical <= limit) break;
      inset += 1;
    }
    insets[row] = inset;
  }
  return insets;
}
