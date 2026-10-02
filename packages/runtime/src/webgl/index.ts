// @whz/runtime/webgl: the WebGL2 backend. It needs a browser (a WebGL2RenderingContext the
// host made); everything else of the runtime is in `@whz/runtime`.

export { createWebGLBackend } from "./backend.ts";
export type { PresentOptions, WebGLBackend } from "./backend.ts";
