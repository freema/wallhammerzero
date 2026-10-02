// VoxelGrid: nx x ny x nz palette indices, 0 = empty. The y axis points up; a model's front
// looks along +z. Everything is integers: a float coordinate or value throws instead of
// building something slightly wrong. Reading outside the grid gives 0; writing outside it does
// nothing (the builder checks its boxes against the grid before it writes).
//
// Methods that write change the grid and return it. `clone`, `rotatedY` and `mirroredX`
// return a new grid.

/** A lattice point or a size: x, y (up), z. */
export type Vec3 = readonly [x: number, y: number, z: number];

/** The value of an empty voxel. */
export const EMPTY = 0;
/** The largest size of a grid along one axis. */
export const MAX_GRID_SIZE = 128;

/** A box of voxels: `min` inclusive, `max` exclusive. */
export interface VoxelBounds {
  readonly min: Vec3;
  readonly max: Vec3;
}

export function requireInt(fn: string, name: string, value: number): void {
  if ((value | 0) !== value) {
    throw new RangeError(`${fn}: ${name} must be a 32-bit integer, got ${String(value)}`);
  }
}

/** Throws unless `value` is three integers. */
export function requireVec3(fn: string, name: string, value: Vec3): void {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new RangeError(`${fn}: ${name} must be [x, y, z], got ${JSON.stringify(value)}`);
  }
  for (const part of value as readonly number[]) {
    if ((part | 0) !== part) throw new RangeError(`${fn}: ${name} must hold integers, got ${JSON.stringify(value)}`);
  }
}

export class VoxelGrid {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  /** One byte per voxel; the voxel (x, y, z) is at `(y * nz + z) * nx + x`. */
  readonly data: Uint8Array;

  /** An empty grid, or one over existing `data` (not copied). */
  constructor(nx: number, ny: number, nz: number, data?: Uint8Array) {
    for (const [name, value] of [["nx", nx], ["ny", ny], ["nz", nz]] as const) {
      if ((value | 0) !== value || value < 1 || value > MAX_GRID_SIZE) {
        throw new RangeError(`VoxelGrid: ${name} must be an integer in [1, ${MAX_GRID_SIZE}], got ${String(value)}`);
      }
    }
    if (data !== undefined && data.length !== nx * ny * nz) {
      throw new RangeError(`VoxelGrid: data has ${data.length} bytes, expected ${nx} x ${ny} x ${nz} = ${nx * ny * nz}`);
    }
    this.nx = nx;
    this.ny = ny;
    this.nz = nz;
    this.data = data ?? new Uint8Array(nx * ny * nz);
  }

  /** An empty grid of a size `[nx, ny, nz]`. */
  static of(size: Vec3): VoxelGrid {
    requireVec3("VoxelGrid.of", "size", size);
    return new VoxelGrid(size[0], size[1], size[2]);
  }

  /** `[nx, ny, nz]`. */
  get size(): Vec3 {
    return [this.nx, this.ny, this.nz];
  }

  /** True if (x, y, z) is a voxel of the grid. */
  inside(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.nx && y < this.ny && z < this.nz;
  }

  /** The value at (x, y, z); 0 outside the grid. */
  get(x: number, y: number, z: number): number {
    return this.inside(x, y, z) ? (this.data[(y * this.nz + z) * this.nx + x] as number) : EMPTY;
  }

  /** Sets one voxel. A voxel outside the grid is ignored. */
  set(x: number, y: number, z: number, value: number): this {
    requireInt("set", "x", x);
    requireInt("set", "y", y);
    requireInt("set", "z", z);
    if ((value & 0xff) !== value) throw new RangeError(`set: the value must be 0..255, got ${String(value)}`);
    if (this.inside(x, y, z)) this.data[(y * this.nz + z) * this.nx + x] = value;
    return this;
  }

  /** The number of voxels that are not empty. */
  count(): number {
    let count = 0;
    for (let i = 0; i < this.data.length; i += 1) if (this.data[i] !== EMPTY) count += 1;
    return count;
  }

  /** The box around the voxels that are not empty, or null for an empty grid. */
  bounds(): VoxelBounds | null {
    const { nx, ny, nz, data } = this;
    let x0 = nx;
    let y0 = ny;
    let z0 = nz;
    let x1 = -1;
    let y1 = -1;
    let z1 = -1;
    let i = 0;
    for (let y = 0; y < ny; y += 1) {
      for (let z = 0; z < nz; z += 1) {
        for (let x = 0; x < nx; x += 1, i += 1) {
          if (data[i] === EMPTY) continue;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
          if (z < z0) z0 = z;
          if (z > z1) z1 = z;
        }
      }
    }
    return x1 < 0 ? null : { min: [x0, y0, z0], max: [x1 + 1, y1 + 1, z1 + 1] };
  }

  /** A copy. */
  clone(): VoxelGrid {
    return new VoxelGrid(this.nx, this.ny, this.nz, this.data.slice());
  }

  /** True if `other` has the same size and the same voxels. */
  equals(other: VoxelGrid): boolean {
    if (other.nx !== this.nx || other.ny !== this.ny || other.nz !== this.nz) return false;
    for (let i = 0; i < this.data.length; i += 1) if (this.data[i] !== other.data[i]) return false;
    return true;
  }

  /**
   * A copy turned around the vertical axis by quarter turns. It is a permutation of the
   * voxels, so nothing is lost: four quarter turns give the same grid. One quarter turn moves
   * what looked along +z (the front) to look along +x; the size becomes `[nz, ny, nx]`.
   */
  rotatedY(quarterTurns: number): VoxelGrid {
    requireInt("rotatedY", "quarterTurns", quarterTurns);
    const turns = quarterTurns & 3;
    const { nx, ny, nz } = this;
    const out = turns % 2 === 0 ? new VoxelGrid(nx, ny, nz) : new VoxelGrid(nz, ny, nx);
    let i = 0;
    for (let y = 0; y < ny; y += 1) {
      for (let z = 0; z < nz; z += 1) {
        for (let x = 0; x < nx; x += 1, i += 1) {
          const value = this.data[i] as number;
          if (value === EMPTY) continue;
          let tx = x;
          let tz = z;
          if (turns === 1) {
            tx = z;
            tz = nx - 1 - x;
          } else if (turns === 2) {
            tx = nx - 1 - x;
            tz = nz - 1 - z;
          } else if (turns === 3) {
            tx = nz - 1 - z;
            tz = x;
          }
          out.data[(y * out.nz + tz) * out.nx + tx] = value;
        }
      }
    }
    return out;
  }

  /** A copy mirrored along x: the voxel at x goes to nx - 1 - x. */
  mirroredX(): VoxelGrid {
    const { nx, ny, nz } = this;
    const out = new VoxelGrid(nx, ny, nz);
    for (let row = 0; row < ny * nz; row += 1) {
      for (let x = 0; x < nx; x += 1) out.data[row * nx + nx - 1 - x] = this.data[row * nx + x] as number;
    }
    return out;
  }

  /**
   * One horizontal layer as text, seen from above: a line per z (z = 0 first), a character
   * per x. `.` is empty, `1`..`9` then `a`..`z` are the values 1..35, and `#` is anything
   * above. For tests and for reading a model without an image.
   */
  slice(y: number): string {
    requireInt("slice", "y", y);
    const symbols = ".123456789abcdefghijklmnopqrstuvwxyz";
    const rows: string[] = [];
    for (let z = 0; z < this.nz; z += 1) {
      let row = "";
      for (let x = 0; x < this.nx; x += 1) {
        const value = this.get(x, y, z);
        row += value < symbols.length ? symbols.charAt(value) : "#";
      }
      rows.push(row);
    }
    return rows.join("\n");
  }
}

/**
 * How far a grid is from its own mirror image along x: the number of voxels that are filled
 * on one side and empty at the mirrored place. With `colors`, a pair filled with two different
 * values counts too. 0 means symmetric.
 */
export function mirrorDiff(grid: VoxelGrid, options: { readonly colors?: boolean } = {}): number {
  const { nx, ny, nz } = grid;
  let diff = 0;
  for (let row = 0; row < ny * nz; row += 1) {
    for (let x = 0; x < nx >> 1; x += 1) {
      const a = grid.data[row * nx + x] as number;
      const b = grid.data[row * nx + nx - 1 - x] as number;
      if ((a === EMPTY) !== (b === EMPTY)) diff += 1;
      else if (options.colors === true && a !== b) diff += 1;
    }
  }
  return diff;
}
