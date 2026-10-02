// The shaders of the WebGL2 backend. Everything that decides a pixel is an integer: sheets are
// integer textures read with texelFetch, a sprite's rectangle reaches the fragment shader as
// flat integers, and the pixel's own position comes from gl_FragCoord. No texture coordinate
// is interpolated and no filter runs, so the output is the CPU backend's, bit for bit.
//
// The native target is stored with its top row at framebuffer row 0. A read-back then gives
// the rows top first, like every other image in this repo; `present` turns it upright.

/** One sprite is one instance: a quad made from gl_VertexID, placed in native pixels. */
export const SPRITE_VERTEX = `#version 300 es
layout(location = 0) in ivec4 aDst; // x, y, w, h in the target (top-left origin)
layout(location = 1) in ivec4 aSrc; // x, y of the frame in the sheet, mirror (0 or 1), palette row
uniform vec2 uTargetSize;
flat out ivec4 vDst;
flat out ivec4 vSrc;
void main() {
  vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  vec2 pixel = vec2(aDst.xy) + corner * vec2(aDst.zw);
  gl_Position = vec4(pixel / uTargetSize * 2.0 - 1.0, 0.0, 1.0);
  vDst = aDst;
  vSrc = aSrc;
}
`;

/** Palette index from the sheet, colour from the palette row; a transparent colour is not drawn. */
export const SPRITE_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
precision highp sampler2D;
uniform usampler2D uSheet;
uniform sampler2D uPalette;
flat in ivec4 vDst;
flat in ivec4 vSrc;
out vec4 outColor;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy) - vDst.xy;
  if (vSrc.z != 0) p.x = vDst.z - 1 - p.x;
  int index = int(texelFetch(uSheet, vSrc.xy + p, 0).r);
  vec4 color = texelFetch(uPalette, ivec2(index, vSrc.w), 0);
  if (color.a == 0.0) discard;
  outColor = color;
}
`;

/** A quad over the whole viewport; the viewport is the image's place on the canvas. */
export const PRESENT_VERTEX = `#version 300 es
void main() {
  gl_Position = vec4(float(gl_VertexID & 1) * 2.0 - 1.0, float(gl_VertexID >> 1) * 2.0 - 1.0, 0.0, 1.0);
}
`;

/** The integer upscale: every screen pixel takes the native pixel it lies in. Transparent pixels show the background. */
export const PRESENT_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D uTarget;
uniform ivec4 uPlace; // x, y of the image's bottom-left corner in window pixels, the zoom, the native height
out vec4 outColor;
void main() {
  ivec2 p = (ivec2(gl_FragCoord.xy) - uPlace.xy) / uPlace.z;
  vec4 color = texelFetch(uTarget, ivec2(p.x, uPlace.w - 1 - p.y), 0);
  if (color.a == 0.0) discard;
  outColor = color;
}
`;
