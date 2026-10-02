// The WebGL2 backend. It draws a draw list into a native-resolution framebuffer through a
// palette lookup texture, and upscales that framebuffer by a whole number into a rectangle of
// the canvas.
//
// It does not own the canvas, the context or the frame loop: the host makes the context,
// hands it in and calls `draw` and `present` when it wants a picture. Any number of previews
// share one context that way (browsers allow about 16 contexts per page): each is a target
// (or one target drawn again and again) presented into its own rectangle.
//
// GPU objects are made on first use and kept per sheet, palette table and target, so two
// previews of one sheet share one texture. Every call sets the GL state it needs and assumes
// none, so other code may use the same context between calls. After a call: no framebuffer,
// vertex array or program-specific texture is left bound, and the scissor test is off.

import { checkDraw, checkTargetSize } from "../backend.ts";
import type { Backend, DrawOptions, Rgba, Target } from "../backend.ts";
import { spriteRect } from "../draw-list.ts";
import type { DrawList } from "../draw-list.ts";
import { PALETTE_SLOTS, PaletteTable } from "../palette.ts";
import { placeTarget } from "../place.ts";
import type { Placement, Rect } from "../place.ts";
import type { Sheet } from "../sheet.ts";
import { PRESENT_FRAGMENT, PRESENT_VERTEX, SPRITE_FRAGMENT, SPRITE_VERTEX } from "./shaders.ts";

/** Options of `present`. */
export interface PresentOptions {
  /** The whole-number zoom. Default: the largest that fits the rectangle. */
  readonly scale?: number | undefined;
  /**
   * What the rectangle is filled with first; it shows around the image and through its
   * transparent pixels. Written to the canvas as it is. Default: transparent, `[0, 0, 0, 0]`.
   */
  readonly background?: Rgba | undefined;
}

export interface WebGLBackend extends Backend {
  readonly kind: "webgl2";
  /** The context this backend draws with. */
  readonly gl: WebGL2RenderingContext;
  /**
   * Draws a target into a rectangle of the canvas (canvas pixels, origin top-left): the
   * rectangle is cleared to the background, then the image goes in its middle, each native
   * pixel as `scale` x `scale` canvas pixels. Nothing outside the rectangle changes. Returns
   * where the image is, for turning a pointer position into a native pixel (`nativePixel`).
   */
  present(target: Target, rect: Rect, options?: PresentOptions): Placement;
  /**
   * Forgets every GPU object. Call it on `webglcontextrestored`: the next draw uploads sheets
   * and palettes again. A target keeps its size but not its pixels, so draw before presenting.
   */
  reset(): void;
}

/** Integers per sprite instance: two ivec4. */
const INSTANCE_INTS = 8;
const NO_BACKGROUND: Rgba = Object.freeze([0, 0, 0, 0] as const);

class GlTarget implements Target {
  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
}

interface Programs {
  readonly sprite: WebGLProgram;
  readonly spriteTargetSize: WebGLUniformLocation | null;
  readonly spriteSheet: WebGLUniformLocation | null;
  readonly spritePalette: WebGLUniformLocation | null;
  readonly present: WebGLProgram;
  readonly presentTarget: WebGLUniformLocation | null;
  readonly presentPlace: WebGLUniformLocation | null;
  /** The vertex array of the sprite program: two instanced integer attributes on `instances`. */
  readonly spriteArray: WebGLVertexArrayObject;
  /** An empty vertex array: the present quad has no attributes. */
  readonly presentArray: WebGLVertexArrayObject;
  readonly instances: WebGLBuffer;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (shader === null) throw new Error("runtime/webgl: cannot create a shader (is the context lost?)");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
    const log = gl.getShaderInfoLog(shader) ?? "";
    gl.deleteShader(shader);
    throw new Error(`runtime/webgl: a shader does not compile: ${log}`);
  }
  return shader;
}

function link(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const program = gl.createProgram();
  const vs = compile(gl, gl.VERTEX_SHADER, vertex);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
    const log = gl.getProgramInfoLog(program) ?? "";
    gl.deleteProgram(program);
    throw new Error(`runtime/webgl: a program does not link: ${log}`);
  }
  return program;
}

function checkColor(fn: string, name: string, color: Rgba): void {
  if (color.length !== 4 || color.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    throw new RangeError(`${fn}: "${name}" must be four bytes [r, g, b, a], got ${JSON.stringify(color)}`);
  }
}

/** A backend on a WebGL2 context the caller made. Several backends may share one context, but one is enough. */
export function createWebGLBackend(gl: WebGL2RenderingContext): WebGLBackend {
  let programs: Programs | null = null;
  const targets = new Map<GlTarget, { framebuffer: WebGLFramebuffer; texture: WebGLTexture }>();
  const sheets = new Map<Sheet, WebGLTexture>();
  const palettes = new Map<PaletteTable, { texture: WebGLTexture; version: number }>();
  let instanceData = new Int32Array(64 * INSTANCE_INTS);
  let maxTextureSize = 0;

  const own = (target: Target): GlTarget => {
    if (!(target instanceof GlTarget)) throw new Error("the WebGL backend draws only into targets made by its own createTarget");
    return target;
  };

  const ensurePrograms = (): Programs => {
    if (programs !== null) return programs;
    const sprite = link(gl, SPRITE_VERTEX, SPRITE_FRAGMENT);
    const present = link(gl, PRESENT_VERTEX, PRESENT_FRAGMENT);
    const instances = gl.createBuffer();
    const spriteArray = gl.createVertexArray();
    const presentArray = gl.createVertexArray();
    gl.bindVertexArray(spriteArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    for (const location of [0, 1]) {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribIPointer(location, 4, gl.INT, INSTANCE_INTS * 4, location * 16);
      gl.vertexAttribDivisor(location, 1);
    }
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    programs = {
      sprite,
      spriteTargetSize: gl.getUniformLocation(sprite, "uTargetSize"),
      spriteSheet: gl.getUniformLocation(sprite, "uSheet"),
      spritePalette: gl.getUniformLocation(sprite, "uPalette"),
      present,
      presentTarget: gl.getUniformLocation(present, "uTarget"),
      presentPlace: gl.getUniformLocation(present, "uPlace"),
      spriteArray,
      presentArray,
      instances,
    };
    return programs;
  };

  const checkTextureSize = (what: string, width: number, height: number): void => {
    if (width > maxTextureSize || height > maxTextureSize) {
      throw new Error(`runtime/webgl: ${what} is ${width} x ${height}, but this GPU's largest texture is ${maxTextureSize} x ${maxTextureSize}`);
    }
  };

  /** A new texture on the active unit, with the sampling every texture here has: nearest, clamped. */
  const newTexture = (): WebGLTexture => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  };

  /** Pixel-store state for uploading bytes exactly as they are. */
  const plainUnpack = (): void => {
    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
  };

  const ensureTarget = (target: GlTarget): { framebuffer: WebGLFramebuffer; texture: WebGLTexture } => {
    const known = targets.get(target);
    if (known !== undefined) return known;
    checkTextureSize("a target", target.width, target.height);
    const texture = newTexture();
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, target.width, target.height);
    gl.bindTexture(gl.TEXTURE_2D, null);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE && !gl.isContextLost()) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      throw new Error(`runtime/webgl: the framebuffer of a ${target.width} x ${target.height} target is not complete (status ${status})`);
    }
    // A new texture holds zeros: transparent, like a new CPU target.
    const made = { framebuffer, texture };
    targets.set(target, made);
    return made;
  };

  /** The sheet's texture, bound to the active unit: one unsigned byte per pixel, the palette index. */
  const bindSheet = (sheet: Sheet): void => {
    const known = sheets.get(sheet);
    if (known !== undefined) {
      gl.bindTexture(gl.TEXTURE_2D, known);
      return;
    }
    checkTextureSize(`the sheet of ${JSON.stringify(sheet.atlas.id)}`, sheet.width, sheet.height);
    const texture = newTexture();
    plainUnpack();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, sheet.width, sheet.height, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, sheet.pixels);
    sheets.set(sheet, texture);
  };

  /** The palette table's texture, bound to the active unit: 256 x rows RGBA, uploaded again when the table changed. */
  const bindPalette = (table: PaletteTable): void => {
    const known = palettes.get(table);
    if (known !== undefined && known.version === table.version) {
      gl.bindTexture(gl.TEXTURE_2D, known.texture);
      return;
    }
    checkTextureSize("the palette table", PALETTE_SLOTS, table.rows);
    let texture = known?.texture;
    if (texture === undefined) texture = newTexture();
    else gl.bindTexture(gl.TEXTURE_2D, texture);
    plainUnpack();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, PALETTE_SLOTS, table.rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, table.data);
    palettes.set(table, { texture, version: table.version });
  };

  /** The state both passes need: plain overwriting of colour, nothing else enabled. */
  const plainState = (): void => {
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DITHER);
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    gl.disable(gl.SAMPLE_COVERAGE);
    gl.colorMask(true, true, true, true);
  };

  return {
    kind: "webgl2",
    gl,

    createTarget(width: number, height: number): Target {
      checkTargetSize(width, height);
      return new GlTarget(width, height);
    },

    draw(target: Target, list: DrawList, options: DrawOptions): void {
      const destination = own(target);
      const clear = checkDraw(list, options);
      if (gl.isContextLost()) return;
      const ready = ensurePrograms();
      const { framebuffer } = ensureTarget(destination);
      const { width, height } = destination;

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(0, 0, width, height);
      plainState();
      gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(clear[0] / 255, clear[1] / 255, clear[2] / 255, clear[3] / 255);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const items = list.sorted();
      if (items.length * INSTANCE_INTS > instanceData.length) instanceData = new Int32Array(items.length * INSTANCE_INTS);

      gl.useProgram(ready.sprite);
      gl.uniform2f(ready.spriteTargetSize, width, height);
      gl.uniform1i(ready.spriteSheet, 0);
      gl.uniform1i(ready.spritePalette, 1);
      gl.activeTexture(gl.TEXTURE1);
      bindPalette(options.palette);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindVertexArray(ready.spriteArray);
      gl.bindBuffer(gl.ARRAY_BUFFER, ready.instances);

      // Sprites are drawn in list order; neighbours that share a sheet go out as one call.
      let start = 0;
      while (start < items.length) {
        const sheet = (items[start] as (typeof items)[number]).sheet;
        let end = start;
        let count = 0;
        for (; end < items.length; end += 1) {
          const item = items[end] as (typeof items)[number];
          if (item.sheet !== sheet) break;
          const rect = spriteRect(item);
          // Outside the target: nothing to draw, and positions stay small enough to be exact as floats.
          if (rect.x >= width || rect.y >= height || rect.x + rect.w <= 0 || rect.y + rect.h <= 0) continue;
          const at = count * INSTANCE_INTS;
          instanceData[at] = rect.x;
          instanceData[at + 1] = rect.y;
          instanceData[at + 2] = rect.w;
          instanceData[at + 3] = rect.h;
          instanceData[at + 4] = rect.sx;
          instanceData[at + 5] = rect.sy;
          instanceData[at + 6] = item.mirror ? 1 : 0;
          instanceData[at + 7] = item.paletteRow;
          count += 1;
        }
        if (count > 0) {
          bindSheet(sheet);
          gl.bufferData(gl.ARRAY_BUFFER, instanceData.subarray(0, count * INSTANCE_INTS), gl.DYNAMIC_DRAW);
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
        }
        start = end;
      }

      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindVertexArray(null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },

    readPixels(target: Target): Uint8Array {
      const source = own(target);
      if (gl.isContextLost()) throw new Error("runtime/webgl: the context is lost; pixels can be read again after it is restored and drawn");
      ensurePrograms();
      const { framebuffer } = ensureTarget(source);
      const out = new Uint8Array(source.width * source.height * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
      gl.pixelStorei(gl.PACK_ROW_LENGTH, 0);
      gl.pixelStorei(gl.PACK_SKIP_ROWS, 0);
      gl.pixelStorei(gl.PACK_SKIP_PIXELS, 0);
      // Framebuffer row 0 is the image's top row (see shaders.ts), so the rows arrive top first.
      gl.readPixels(0, 0, source.width, source.height, gl.RGBA, gl.UNSIGNED_BYTE, out);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return out;
    },

    present(target: Target, rect: Rect, options: PresentOptions = {}): Placement {
      const source = own(target);
      const place = placeTarget(source.width, source.height, rect, options.scale);
      const background = options.background ?? NO_BACKGROUND;
      checkColor("present", "background", background);
      if (gl.isContextLost()) return place;
      const ready = ensurePrograms();
      const { texture } = ensureTarget(source);
      // GL's window origin is the bottom-left corner.
      const canvasHeight = gl.drawingBufferHeight;
      const bottom = canvasHeight - place.y - place.h;

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      plainState();
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(rect.x, canvasHeight - rect.y - rect.h, rect.w, rect.h);
      gl.clearColor(background[0] / 255, background[1] / 255, background[2] / 255, background[3] / 255);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.viewport(place.x, bottom, place.w, place.h);
      gl.useProgram(ready.present);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(ready.presentTarget, 0);
      gl.uniform4i(ready.presentPlace, place.x, bottom, place.scale, source.height);
      gl.bindVertexArray(ready.presentArray);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindVertexArray(null);
      gl.disable(gl.SCISSOR_TEST);
      return place;
    },

    release(resource: Target | Sheet | PaletteTable): void {
      if (resource instanceof GlTarget) {
        const made = targets.get(resource);
        if (made !== undefined) {
          gl.deleteFramebuffer(made.framebuffer);
          gl.deleteTexture(made.texture);
          targets.delete(resource);
        }
      } else if (resource instanceof PaletteTable) {
        const made = palettes.get(resource);
        if (made !== undefined) {
          gl.deleteTexture(made.texture);
          palettes.delete(resource);
        }
      } else {
        const texture = sheets.get(resource as Sheet);
        if (texture !== undefined) {
          gl.deleteTexture(texture);
          sheets.delete(resource as Sheet);
        }
      }
    },

    reset(): void {
      // The old objects died with the old context; there is nothing to delete.
      programs = null;
      targets.clear();
      sheets.clear();
      palettes.clear();
    },

    dispose(): void {
      for (const made of targets.values()) {
        gl.deleteFramebuffer(made.framebuffer);
        gl.deleteTexture(made.texture);
      }
      for (const texture of sheets.values()) gl.deleteTexture(texture);
      for (const made of palettes.values()) gl.deleteTexture(made.texture);
      if (programs !== null) {
        gl.deleteProgram(programs.sprite);
        gl.deleteProgram(programs.present);
        gl.deleteVertexArray(programs.spriteArray);
        gl.deleteVertexArray(programs.presentArray);
        gl.deleteBuffer(programs.instances);
      }
      this.reset();
    },
  };
}
