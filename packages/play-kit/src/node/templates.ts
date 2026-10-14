// The files of a new game, as text. Two engines: `three` (real-time 3D, as New Hope) and
// `canvas` (a 2D canvas at a native pixel resolution, upscaled by whole numbers). Each starts
// as a moving body on an empty stage that passes its smoke script; /make-game grows it.

export type Engine = "three" | "canvas";
export const ENGINES: readonly Engine[] = ["three", "canvas"];

export interface GameSpec {
  id: string;
  title: string;
  engine: Engine;
  port: number;
  palette: string;
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

export function packageJson(g: GameSpec): string {
  const three = g.engine === "three";
  return json({
    name: `@whz/${g.id}-play`,
    version: "0.0.0",
    private: true,
    description: `${g.title}: the playable game (games/${g.id}).`,
    type: "module",
    scripts: {
      dev: "vite dev --config vite.config.ts",
      build: "vite build --config vite.config.ts --logLevel warn",
      check: "tsc --noEmit -p tsconfig.json && eslint . && vite build --config vite.config.ts --logLevel warn",
    },
    dependencies: { "@whz/det": "0.0.0", "@whz/play-kit": "0.0.0", ...(three ? { three: "^0.180.0" } : {}) },
    devDependencies: { ...(three ? { "@types/three": "^0.180.0" } : {}), vite: "^8.3.2" },
  });
}

export function tsconfig(): string {
  return json({
    extends: "../../tsconfig.base.json",
    compilerOptions: { lib: ["ES2024", "DOM", "DOM.Iterable"], types: [] },
    include: ["src", "vite.config.ts"],
  });
}

export function viteConfig(g: GameSpec): string {
  return `// ${g.title}'s dev server: \`./dev -p ${g.port} npm run dev -w @whz/${g.id}-play\`, then
// http://127.0.0.1:${g.port} in the host browser (the container has no GPU). The shot plugin
// writes \`__game.shot()\` PNGs to build/shots/${g.id}/.
import { shotPlugin } from "@whz/play-kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [shotPlugin("${g.id}")],
  server: { host: "0.0.0.0", port: ${g.port}, strictPort: true },
  preview: { host: "0.0.0.0", port: ${g.port}, strictPort: true },
  build: { outDir: "../../build/${g.id}-play", emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});
`;
}

export function indexHtml(g: GameSpec): string {
  const pixel = g.engine === "canvas" ? " image-rendering: pixelated;" : "";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${g.title}</title>
    <style>
      html, body { margin: 0; height: 100%; background: #101018; overflow: hidden; }
      canvas { display: block;${pixel} }
      #hud { position: fixed; left: 12px; top: 10px; pointer-events: none; font: 600 13px/1.4 ui-monospace, Menlo, monospace; color: #eee; text-shadow: 0 1px 0 #000; }
    </style>
  </head>
  <body>
    <div id="hud"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`;
}

const THREE_MAIN = (g: GameSpec): string => `// ${g.title}: the game's entry. The simulation (\`update\`) runs at a fixed step and holds every
// rule; \`present\` draws once per frame. Same seed + same inputs per step = the same run.
// \`window.__game\` (@whz/play-kit) drives it from scripts: play/*.json.

import * as THREE from "three";
import { createRng } from "@whz/det";
import { captureErrors, fixedLoop, installGameHook, Keys } from "@whz/play-kit";

captureErrors();

const params = new URLSearchParams(location.search);
const seed = Number(params.get("seed") ?? 1) >>> 0;
const rng = createRng(seed, "world");
const STEP = 1 / 120;
const SPEED = 6;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a2238);
scene.fog = new THREE.Fog(0x1a2238, 30, 90);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x302820, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(10, 20, 6);
scene.add(sun);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a4a3a }));
scene.add(ground);
// A few seeded blocks, so motion reads.
for (let i = 0; i < 24; i++) {
  const h = 1 + rng.int(4);
  const block = new THREE.Mesh(new THREE.BoxGeometry(2, h, 2).translate(0, h / 2, 0), new THREE.MeshStandardMaterial({ color: 0x6a7a9a, flatShading: true }));
  block.position.set(rng.range(-40, 40), 0, rng.range(-40, 40));
  scene.add(block);
}

const player = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1, 4, 8).translate(0, 0.9, 0), new THREE.MeshStandardMaterial({ color: 0xffb040 }));
scene.add(player);

const keys = new Keys().listen();
const hud = document.getElementById("hud") as HTMLElement;
let tick = 0;

function update(dt: number): void {
  const x = keys.axis(["KeyA", "ArrowLeft"], ["KeyD", "ArrowRight"]);
  const z = keys.axis(["KeyW", "ArrowUp"], ["KeyS", "ArrowDown"]);
  player.position.x += x * SPEED * dt;
  player.position.z += z * SPEED * dt;
  tick++;
  keys.endStep();
}

function present(): void {
  camera.position.set(player.position.x, player.position.y + 8, player.position.z + 10);
  camera.lookAt(player.position);
  hud.textContent = \`${g.title} · WASD\`;
  renderer.render(scene, camera);
}

const loop = fixedLoop({ step: STEP, update, present });
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

installGameHook({
  id: "${g.id}",
  seed,
  step: STEP,
  state: () => ({ tick, player: { pos: player.position.toArray() } }),
  advance: loop.advance,
  key: (code, down) => keys.set(code, down),
  capture: (ratio) => {
    const old = renderer.getPixelRatio();
    renderer.setPixelRatio(ratio);
    present();
    // Read the canvas in the same task as the render: the drawing buffer is not preserved.
    const url = renderer.domElement.toDataURL("image/png");
    renderer.setPixelRatio(old);
    present();
    return url;
  },
  scenarios: {
    start: () => {
      player.position.set(0, 0, 0);
      return true;
    },
  },
  perf: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries }),
  extra: { three: { scene, camera, renderer } },
});
loop.start();
`;

const CANVAS_MAIN = (g: GameSpec): string => `// ${g.title}: the game's entry. A 2D canvas at a native pixel resolution, upscaled by whole
// numbers. The simulation (\`update\`) runs at a fixed step and holds every rule; \`present\`
// draws once per frame. Same seed + same inputs per step = the same run.
// \`window.__game\` (@whz/play-kit) drives it from scripts: play/*.json.

import { createRng } from "@whz/det";
import { captureErrors, fixedLoop, installGameHook, Keys } from "@whz/play-kit";

captureErrors();

const params = new URLSearchParams(location.search);
const seed = Number(params.get("seed") ?? 1) >>> 0;
const rng = createRng(seed, "world");
const W = 320;
const H = 180;
const STEP = 1 / 60;
const SPEED = 60; // pixels per second

const canvas = document.createElement("canvas");
canvas.width = W;
canvas.height = H;
document.body.append(canvas);
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

function fit(): void {
  const scale = Math.max(1, Math.floor(Math.min(innerWidth / W, innerHeight / H)));
  canvas.style.width = \`\${W * scale}px\`;
  canvas.style.height = \`\${H * scale}px\`;
  canvas.style.margin = \`\${Math.floor((innerHeight - H * scale) / 2)}px auto 0\`;
}
fit();
addEventListener("resize", fit);

// A few seeded stones, so motion reads.
const stones = Array.from({ length: 30 }, () => ({ x: rng.int(W), y: rng.int(H) }));
const player = { x: W / 2, y: H / 2 };
const keys = new Keys().listen();
const hud = document.getElementById("hud") as HTMLElement;
let tick = 0;

function update(dt: number): void {
  player.x = Math.min(W - 4, Math.max(4, player.x + keys.axis(["KeyA", "ArrowLeft"], ["KeyD", "ArrowRight"]) * SPEED * dt));
  player.y = Math.min(H - 4, Math.max(4, player.y + keys.axis(["KeyW", "ArrowUp"], ["KeyS", "ArrowDown"]) * SPEED * dt));
  tick++;
  keys.endStep();
}

function present(): void {
  ctx.fillStyle = "#2a3a2a";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#5a6a5a";
  for (const s of stones) ctx.fillRect(s.x, s.y, 2, 2);
  ctx.fillStyle = "#ffb040";
  ctx.fillRect(Math.round(player.x) - 3, Math.round(player.y) - 3, 6, 6);
  hud.textContent = \`${g.title} · WASD\`;
}

const loop = fixedLoop({ step: STEP, update, present });

installGameHook({
  id: "${g.id}",
  seed,
  step: STEP,
  state: () => ({ tick, player: { x: player.x, y: player.y } }),
  advance: loop.advance,
  key: (code, down) => keys.set(code, down),
  // Pixel art is judged upscaled: a shot is the native frame times a whole number.
  capture: (ratio) => {
    present();
    const k = Math.max(1, Math.round(ratio * 4));
    const big = document.createElement("canvas");
    big.width = W * k;
    big.height = H * k;
    const b = big.getContext("2d") as CanvasRenderingContext2D;
    b.imageSmoothingEnabled = false;
    b.drawImage(canvas, 0, 0, W * k, H * k);
    return big.toDataURL("image/png");
  },
  scenarios: {
    start: () => {
      player.x = W / 2;
      player.y = H / 2;
      return true;
    },
  },
});
loop.start();
`;

export function mainTs(g: GameSpec): string {
  return g.engine === "three" ? THREE_MAIN(g) : CANVAS_MAIN(g);
}

export function smokeScript(g: GameSpec): string {
  const moved = g.engine === "three" ? { expect: "player.pos.0", from: "start", gt: 4 } : { expect: "player.x", from: "start", gt: 40 };
  return json({
    name: "smoke",
    seed: 1,
    steps: [
      { do: "scenario", name: "start" },
      { do: "save", name: "start" },
      { do: "hold", code: "KeyD", seconds: 1, ...moved, note: "D moves the player right", shot: "moved" },
    ],
  });
}

export function packageReadme(g: GameSpec): string {
  return `# @whz/${g.id}-play

${g.title}, playable (\`${g.engine}\`). Concept and state: [games/${g.id}](../../games/${g.id}/README.md).

\`\`\`sh
./dev compose up ${g.id}        # http://127.0.0.1:${g.port}
# or: ./dev -p ${g.port} npm run dev -w @whz/${g.id}-play
\`\`\`

## Controls

| Key | Does |
|---|---|
| WASD / arrows | move |

## How it is built

| File | What it does |
|---|---|
| \`src/main.ts\` | The entry: the fixed-step \`update\` (every rule), \`present\` (the picture), the hook. |
| \`play/*.json\` | Scripts for \`__game.runScript(<name>)\`: \`smoke\`. |

## Testing: \`window.__game\`

The hook of \`@whz/play-kit\` ([packages/play-kit/README.md](../play-kit/README.md)):
\`describe()\`, \`state()\`, \`digest()\`, \`advance(s)\`, \`key\`, \`press\`, \`hold\`,
\`scenario(name)\`, \`act(name, ...args)\`, \`runScript(name)\`, \`shot(name)\`, \`perf()\`,
\`errors()\`. From the DevTools MCP: \`await __game.runScript("smoke")\` on a fresh \`?seed=1\`.
`;
}

export function gameJson(g: GameSpec): string {
  return json({ schemaVersion: 1, id: g.id, title: g.title, resolution: g.engine === "canvas" ? { width: 320, height: 180 } : { width: 480, height: 270 }, palette: g.palette, systems: [] });
}

export function gameReadme(g: GameSpec): string {
  return `# ${g.title}

<!-- The pitch the owner picked: the hook, the view, the core verb, the scope ceiling. -->

The game is the package [packages/${g.id}-play](../../packages/${g.id}-play/README.md):
\`./dev compose up ${g.id}\`, then http://127.0.0.1:${g.port}. Where it stands: [STATE.md](STATE.md).
`;
}

export function stateMd(g: GameSpec, date: string): string {
  return `# ${g.title}: state

Where the game stands between \`/continue-game ${g.id}\` runs. Each run updates this file in its
own commit. It is not a queue: Next holds at most three items.

**Status:** building. Updated ${date}, scaffolded (\`${g.engine}\`).

## How to run

- \`./dev compose up ${g.id}\` (or \`./dev -p ${g.port} npm run dev -w @whz/${g.id}-play\`), then
  http://127.0.0.1:${g.port}. The scripts use \`?seed=1\`.
- Scripts in \`packages/${g.id}-play/play/\`: \`smoke\`. From the browser: \`await __game.runScript("smoke")\`.

## Plays now

- A body that moves with WASD on an empty stage.

## Last owner feedback

- None yet.

## Next

1. The core verb, as grey boxes, with a script that measures it.

## Rejected

Ideas and looks the owner turned down. Never re-propose them.
- None yet.

## Budgets

| Count | Now | Budget |
|---|---|---|
| Draw calls per frame | not measured | |
`;
}
