# Reference analysis: sakura-crossing (Kenton-GMI)

- Repo: https://github.com/Kenton-GMI/sakura-crossing (MIT, except the one bundled MP3)
- Analysed commit: `de01898` (2026-07-29). It is the only commit, a squashed "initial public release", so there is no git history. The development history exists only as prose in `NEXT.md`.
- Stack: `three ^0.180.0` (lock: 0.180.0) and `vite ^6`. Nothing else (`package.json:17-22`).
- Live demo: none. GitHub `homepage` is null and the Pages API returns 404 (checked 2026-10-02). As of that date the repo had 534 stars and 102 forks.
- Method: a static read of a shallow clone. Nothing was installed or executed. Every figure below comes from the code or the repo's own docs. **No figure was re-measured.**
- Convention: plain statements are **facts**, with `path:lines` at commit `de01898`. Statements prefixed **Opinion** are my assessment.

---

## Executive summary

1. **Everything in the world is authored on a flat XZ plane.** One file (`src/world/planet.js`) bends the finished scene onto a sphere of R = 160 m in a single CPU pass at load (`bakeToPlanet`). Collision, height queries and every builder stay flat. Only the presentation is spherical.
2. **The projection is equirectangular around the railway, which sits on the equator.** That gives an exact seamless loop, but x shrinks by cos(lat). The poles are unusable, so authored content lives in a band. **Opinion:** this does not scale to a planet you can fly over. The pattern does scale if it is generalised to cube-sphere charts.
3. **The look comes from four layers.**
   - A `MeshToonMaterial` ramp with a string-patched shadow tint.
   - A depth-second-difference ink pass.
   - Inverted-hull shells on many meshes: 189 call sites, not "a handful".
   - A split-tone grade, on a 1.5–2× half-float target resolved with FXAA. No bloom and no DoF.
4. **Much of the violet-shadow look does not come from the toon patch.** The patch only tints the ramp's dark bands of *direct* light. Cast shadows get their colour from a strong cool fill light, a violet hemisphere ground colour and the grade's violet split-tone (`main.js:60-75`, `post.js:126-128`).
5. **The renderer is draw-call bound, not fill bound.** Halving the resolution changes nothing. The levers are:
   - per-object, per-material merging via `bake()` with a cached `cel()` material factory;
   - `InstancedMesh` (43 sites);
   - exact frustum culling after the bake.

   There is no LOD, no workers and no async build. The heaviest view is about 13.6k draw calls.
6. **Generators replace models.**
   - `makeShop`: one construction, many tenants.
   - `makeVehicle`: a vehicle type is one row of about 8 numbers in `SPEC`, and arches, lamps, glazing and mirrors are derived from it.
   - `makeBikeRack`: the bake-then-instance pattern.
7. **Hills are a third ground surface.** It is a piecewise-linear lattice (now **1.5 m** cells, not the README's 3 m). It goes through a lower-only slope limiter and has three roughness octaves. Its colour comes from per-facet *material* tone by aspect, height and "cover", because the cel ramp cannot shade gentle slopes.
8. **Water is a contour of the height field.** Surface layers are meshed with marching squares on depth. The only meaningful safety check is a flood fill (`lakeLeakCheck`), because a lake that leaks renders identically to one that does not.
9. **There are 134 Canvas2D texture factories** (signs, notices, interiors, masks) and no image assets in `src/`. The repo still ships one stock MP3, which is not covered by MIT.
10. **The agent tooling is the most transferable part.** It consists of:
    - a dev-only `POST /__shot` Vite plugin plus `window.__shot(name, W, H, {pos, yaw, pitch, orbit, ink, grade})`;
    - `window.__scene` and manual world stepping;
    - a headless `buildWorld` smoke test;
    - numeric invariant checks (`hillSafety`, `lakeLeakCheck`, `boreClearance`, a dev overlap audit);
    - a reachability flood fill run against waypoint lists kept in each module header.
11. **It was clearly written with Claude Code** (`CLAUDE.md` references `mcp__Claude_Browser__javascript_tool` and `preview_start`, and the user wrote briefs in Chinese). About 4.8k lines of docs act as the agent's memory, including a table of about 146 traps. About 30% of the 56k JS lines are comments full of measured numbers.
12. **Top takes, re-ranked for the owner's priority (2D pixel-art sims first; voxels later, also rendered as pixel art; §5.0):**
    - (a) the Canvas2D generator library (`make` + `cached`), made pixel-exact, together with table-row generators;
    - (b) the `__shot`, invariant-check and flood-fill agent toolkit (with PNG output, not JPEG);
    - (c) for the voxel game: hue-shifted toon ramps (2–3 bands, explicit palette ramps) plus *convex-only* 1 px depth ink plus palette quantisation at low resolution, and flat authoring with a projection seam generalised to cube-sphere chunks.

    Supersampling, FXAA, smooth fades and inverted hulls do **not** survive at pixel resolution.

---

## 1. Architecture

### 1.1 Verifying the README-level summary

| Claim in the brief | Verdict | Evidence |
|---|---|---|
| ~64 JS files / ~56k lines | **Correct**: 64 files (1 + 10 `core/` + 53 `world/`), 56,096 lines, of which 16,554 are comment lines | `find src -name '*.js'` |
| No image or model assets; textures via Canvas2D | **Correct for `src/`**: 134 exported texture factories. The repo also ships `public/audio/*.mp3` (stock music, not MIT) and `docs/*.jpg` | `src/core/textures.js`, `README.md:828-835, 899-903` |
| Toon light with hue-shifted shadows, patched `lights_toon_pars_fragment` | Correct. It is a **string replace** that silently turns itself off if three.js changes the line | `src/core/toon.js:48-80` |
| Ink from the second difference of linear depth | Correct | `src/core/post.js:57-96` |
| Inverted-hull outlines for "hero props" | **Understated**: 189 call sites in 33 files, including every `makeShop` wall and roof | `src/world/shops.js:374-379`, grep |
| Anime light setup, split-tone grade, 1.5–2× plus FXAA, no bloom or DoF | Correct. Scale is capped by a 4.6 MP pixel budget | `src/main.js:44-75`, `src/core/post.js:203-268` |
| Sphere R = 160 m, flat world bent by one layer | Correct. `RELIEF = 0`, so the planet is a true sphere | `src/world/planet.js:31, 447` |
| `makeShop`, `makeVehicle` with type as a table row | Correct: 9 `SPEC` rows plus the kei truck, which is delegated | `src/world/vehicles.js:136-223, 284-292` |
| Terrain lattice of 3 m triangles | **Outdated**: `CELL = 1.5`. The README still says 3 m | `src/world/hills.js:168-196` vs `README.md:306-312` |
| Lake contour plus flood-fill leak check | Correct | `src/world/lakeform.js:720-779` |
| Merge per material via `bake()` | **Nuance**: `bake()` only merges a list. Grouping by material happens *per generator instance* (`parts[key]`), not world-wide, which is why there are about 19k meshes | `src/core/util.js:46-74`, `shops.js:81-82, 369-379` |
| ~1.74M tris / 19k meshes | README figure, not re-measured | `README.md:837-844` |
| Dev `POST /__shot` | Correct: dev-only Vite plugin plus `window.__shot` | `vite.config.js:9-47`, `src/main.js:260-329` |

### 1.2 Composition

```
src/main.js            renderer, lights, sky, buildWorld(), Player, HUD, music, e-bike, Pipeline, rAF loop, dev hooks
src/core/  (10 files)  engine-ish, world-agnostic: palette, toon (material factory), post (pipeline),
                       outline, sky, textures (Canvas2D), player, hud, audio, util (bake, RNG, trs)
src/world/ (53 files)  content: index.js (assembly), planet.js (projection), street.js (centreline + terrain grid),
                       landform/lakeform (pure shape descriptions), hills.js (height field), 30+ district modules,
                       shared kits (ground, buildings, housing, blocks, plots, streetprops, props, shops, vehicles, trees, petals)
```

There are two layers of world code:

- **Pure-shape modules.** These have no materials and no props, so anything can read them while it is building. Examples: `landform.js` (the canal hole), `lakeform.js` (basin, shoreline, rim; it "imports nothing that could import it back", `README.md:771-773`), and the analytic parts of `hills.js` (`fieldAt` and `hillAt` are available from module load, `src/world/index.js:250-257`).
- **Builders.** These emit meshes and register colliders, platforms, cuts, interactables and updaters through one `ctx` object.

### 1.3 Lifecycle

Everything is synchronous on the main thread, at module load.

1. `main.js:25-42`: `WebGLRenderer` (no MSAA, `NoToneMapping`, PCF shadows), linear `Fog(44, 205)`, a 46° camera with near/far 0.25/600.
2. `main.js:45-75`: the light rig (§2.3).
3. `main.js:78-79`: `buildSky()`, then `buildWorld(scene)`.
4. `buildWorld` (`src/world/index.js:75-803`):
   1. Create `ctx` (`:91-134`).
   2. Build the base layers: `buildPlanet`, `buildStreet`, `buildRailway`, `buildTrain`, `buildShop` (`:137-141`).
   3. Place the houses from a literal `houseDefs` table (`:144-239`).
   4. Run the **ordered** `districts` array (`:249-327`). Order is load-bearing: a district may measure surfaces laid by earlier ones through `ctx.groundAt`.
   5. Merge all returned planting into a single world-wide pass for sakura, grove, cedar, bamboo, shrubs and fallen petals (`:328-337, 509, 512-525`).
   6. Hand-place the crossing cluster, cat, petals and the crossing sequence (`:593-732`).
   7. **`bakeToPlanet(root, { maxEdge: 4.0 })`**, then `train.planetize()` (`:737-738`).
   8. Return the world API: `heightAt(x, z, fromY)`, `update(dt)`, colliders, platforms and so on (`:741-802`).
5. `main.js:81-118`: create the Player (flat-space walker), HUD, music, and the e-bike. The e-bike is created **after** the bake because it moves anywhere, so it re-seats itself every frame with `basisAt` and `positionAt` (`src/world/ebike.js:5, 21-22, 102-108`; `CLAUDE.md:669-679`).
6. `main.js:127-138`: create the `Pipeline` and size it.
7. The `frame()` loop (`main.js:207-253`): `player.update` → `ebike.update` → `world.update` → re-seat the lights into the player's local tangent frame → move the sky dome to the camera → pick the interactable under the crosshair → update the HUD → `pipeline.render()`.

### 1.4 The `ctx` contract

```js
// src/world/index.js:91-134 (abridged)
const ctx = {
  add: (obj) => { root.add(obj); return obj; },
  collide: (x0, z0, x1, z1, top, bottom) => colliders.push({...}),   // AABB, flat space
  platform: (p) => platforms.push(p),   // walkable box top (stairs are N platforms)
  cut: (c) => cuts.push(c),             // box that lowers the ground (excavations)
  groundAt: (x, z) => { /* street + relief + hill, then cuts (min), then platforms (max) */ },
  interact: (i) => interactables.push(i),
  update: (fn) => updaters.push(fn),
};
```

A district is `build<Name>(ctx)`. It returns `{ sakura, shrubs, grove, bamboo, cedar, petals, update }` and does not plant anything itself (`CLAUDE.md:632-646`).

### 1.5 Simulation stays flat

- **Player** (`src/core/player.js`):
  - Circle-vs-AABB push-out over the *whole* collider list, sub-stepped at 0.18 m (`:172-188, 242-251`).
  - Colliders whose top is within `STEP = 0.38` of the feet are skipped, which is how kerbs work (`:18-20, 174`).
  - x-velocity is scaled by `1/cos(lat)` so walking speed feels even (`:236-241`).
  - x wraps and z is clamped to ±0.24·C (`:267-271`; `index.js:757`).
  - `heightAt(x, z, fromY)` only offers platforms within 0.55 m of the current feet, so you can walk *under* a bridge deck (`index.js:773-793`; `player.js:273-277`).
  - Only `applyCamera` touches the sphere (`player.js:309-327`).
- **Train.** Travel along the equator is literally a rotation about the planet's Z axis: `T(C)·Rz(-x/R)·T(-C)` (`src/world/train.js:407-425`).

### 1.6 Dependencies

`three` core plus three addons: `FullScreenQuad` (`post.js:2`), `mergeGeometries` (`util.js:2`) and `mergeVertices` (`outline.js:2`). Vite is used for dev, build and the frame-grabber plugin. There is no physics engine, no ECS and no UI framework (the HUD is DOM, styled in `index.html`).

### 1.7 How an agent wrote and maintains 56k lines

**Facts:**

- **Provenance.** `CLAUDE.md` is written for Claude Code in the desktop app with the built-in browser:
  - `// via mcp__Claude_Browser__javascript_tool` (`CLAUDE.md:130, 452`);
  - "restart it with `preview_start`" (`:188`);
  - "Do not waste turns" (`:121-123`);
  - "the user writes in Chinese — reply in Chinese" (`:96-97`).

  The work was driven by numbered **briefs** (`NEXT.md:1-25`), each with an "Audit against this round's brief" section (for example `NEXT.md:994`).
- **Docs as memory, split by role** (4,765 lines in total):
  - `README.md` (906 lines): design rationale.
  - `CLAUDE.md` (1,599 lines): operations, verification recipes, conventions, and the **trap table** (`:721-870`, about 146 rows of "Thing | Why").
  - `NEXT.md` (2,260 lines): handover, per-round bugs, "recorded moves to existing content", perf tables, and "Rules that must not be broken" (`:2221-2260`).
- **A single seam for the hardest cross-cutting concern.** The planet bend lives in one file and runs once, so "if the projection is wrong, you fix one file rather than twenty" (`README.md:155-159`; `planet.js:253-268`).
- **Conventions that remove whole classes of sign and axis bugs:**
  - Author facing +Z, then rotate by `face` (`shops.js:19-22, 49`).
  - Vehicles are authored along +x with the nose at +x (`vehicles.js:20-30`).
  - Raked panels are built "between two points", never "a box with a guessed tilt" (`vehicles.js:233-253`).
  - Yaw is derived with a `look(from, to)` helper, never typed (`CLAUDE.md:355-365, 464-471`).
  - All materials go through `cel()` or `flat()`, and all colours come from `PAL` (`CLAUDE.md:683-686`).
  - All randomness goes through `rngKit` (`CLAUDE.md:691-692`). Grep finds `Math.random` only in the music shuffle.
- **Module headers act as local specs.** For example, `rokuchome.js:60-140` contains:
  - a measured list of what neighbouring land is "already spoken for";
  - "WHAT THE ARITHMETIC DECIDED";
  - a `FLOODFILL` list of waypoints that must stay reachable (the same block appears in 12 modules).
- **Verification without eyes.** The agent works through `__shot` plus reading the JPEG, stepping the world by hand because rAF does not fire in the agent's browser pane, a headless `buildWorld` with a stub scene to get stack traces, raycasts for "can this be seen", numeric invariants, and the BFS reachability fill (`CLAUDE.md:119-503`; `NEXT.md:2136-2219`). The stated stance is: "This project's bugs are visual, not exceptions… A clean console means nothing" (`CLAUDE.md:498-503`).

**Opinion.** What made it work is a narrow contract (`ctx`), a single projection seam, aggressive conventions, and executable invariants that let the agent *measure* rather than look. What it costs:

- The docs are now so large that `CLAUDE.md:723-870` alone exceeds 30k tokens and could not be read in one tool call during this analysis.
- Documentation drifts even here: the 3 m vs 1.5 m lattice, "a handful" of outlines vs 189, a stale "snapped grid" comment (§6).
- Several files run to 2–4k lines (`textures.js` 4,397, `hills.js` 3,285, `tunnel.js` 2,440).

For Wallhammer Zero: copy the *roles* of the three docs and the trap table, but cap the size of `CLAUDE.md` and push detail into module headers.

---

## 2. Rendering pipeline

### 2.1 Pass order

| # | Pass | Target | Notes |
|---|---|---|---|
| 0 | Shadow map (three internal) | 2048² depth | One `DirectionalLight`, ortho ±34 m around the player, `PCFShadowMap`, bias −0.0004, normalBias 0.035 (`main.js:45-58`). Not cascaded. In planet view it widens to ±1.15R (`main.js:171-175`). |
| 1 | Scene | `rtScene`: RGBA **HalfFloat**, linear filter, plus `DepthTexture` (UnsignedInt, nearest) at `w·h·scale` | `scale` = 1.5 if dpr < 1.5, else min(dpr, 2), capped so `w·h·scale² ≤ 4.6e6` (`post.js:204-268`). Renderer output stays linear (`NoToneMapping`, `NoColorSpace` RT). |
| 2 | Ink | `rtA`: HalfFloat, no depth | Fullscreen quad, 5 depth taps plus 1 colour tap (`post.js:22-98, 278-283`). |
| 3 | Grade | `rtB`: **UnsignedByte**, no depth | Split-tone, warmth, lift, saturation, vignette, **manual linear→sRGB** (`post.js:100-144`). |
| 4 | FXAA | default framebuffer at canvas size | Classic FXAA 3.x-lite at the supersampled texel size, so the downsample happens through bilinear fetches (`post.js:146-190, 290-294`). |

Each pass can be toggled with `pipeline.enabled.{ink, grade, fxaa}` (keys O and G, or the `__shot` options; `main.js:202-204, 291-292`). There is no bloom, DoF or motion blur (`README.md:143-147`).

### 2.2 Materials

| Factory | Three type | Use | Key properties |
|---|---|---|---|
| `cel(opts)` (`toon.js:88-133`) | `MeshToonMaterial` + `onBeforeCompile` patch | Nearly all lit geometry (888 call sites) | `gradientMap(bands)` DataTexture, Nearest; ramps 2–5 bands plus high-key `soft`/`soft3` (`:15-46`); `flatShading` defaults to **true**; per-material `uShadowTint`; `customProgramCacheKey = 'celTint_'+hex`; **cached by a parameter-string key**, so identical params return the same object (`:108-132`) |
| `flat(opts)` (`toon.js:138-161`) | `MeshBasicMaterial` | Unlit: glass, signs, water layers, petals, clouds, tunnel linings | Cached the same way |
| `hullOutline` (`outline.js:72-105`) | `ShaderMaterial`, BackSide | Ink shells | Per-mesh material with a shared resolution uniform set |
| Sky (`sky.js:13-56`) | `ShaderMaterial`, BackSide sphere r = 500 | Gradient dome | renderOrder −10, soft 26-band quantisation |
| Post (`post.js`) | `ShaderMaterial` × 3 on `FullScreenQuad` | — | depthTest and depthWrite off |

### 2.3 Lights

From `main.js:44-75`:

| Light | Colour / intensity | Direction (local) |
|---|---|---|
| Sun | `#fff1d8` / 2.25, casts shadows | (−52, 62, 56) |
| Fill | `#a9bdf5` / 1.08 | (48, 26, −44) |
| Bounce | `#d8cbe8` / 0.34 | (10, −18, 40), from below |
| Hemisphere | sky `#dcecff`, ground `#b6a6c6` (violet) / 1.12 | — |

**Every frame, every light is re-seated into the player's local tangent frame** (`seatLight`, `main.js:144-157, 229-238`). The sun therefore stands in the same place relative to you anywhere on the planet: "physically a cheat, but it keeps the district lit the same way". The class comment says the shadow camera follows the player "on a snapped grid" (`main.js:19-20`), but **no snapping exists in the code**: the target is `positionAt(player.pos)` (`main.js:233-237`).

---

## 3. Key techniques in depth

### 3.1 Planet bend: author flat, project once

**Files:** `src/world/planet.js` (whole file), `src/world/index.js:734-738`, `src/core/player.js:309-327`, `src/main.js:144-157`.

**How it works.**

```js
// planet.js:30-59
export const R = 160;
export const CENTER = new THREE.Vector3(0, -R, 0);       // flat origin sits on top of the sphere
export function normalAt(x, z, out) {                     // x -> longitude, z -> latitude
  const la = x / R, ph = z / R, cp = Math.cos(ph);
  return out.set(Math.sin(la) * cp, Math.cos(la) * cp, Math.sin(ph));
}
export function positionAt(x, y, z, out) {                // height y is radial
  normalAt(x, z, out).multiplyScalar(R + y).add(CENTER); return out;
}
```

There are also `basisAt` (east, up, north tangent frame, `:66-75`), `frameAt` (`:78-83`), the inverse `flatAt` (`:86-94`) and `wrapDelta`/`wrapX` (`:97-108`).

`bakeToPlanet(root)` (`:269-366`) runs once, after every builder:

1. **Rigid rigs** (`userData.planetRigid`, for animated things such as booms, shutters, vending machines, cat, cloth and wheel hubs) are re-seated as whole groups. Position comes from `positionAt`, orientation from `basisAt(...)·q`. This keeps their pivots intact (`:279-288, 353-363`). Anything under a rigid group is skipped (`:272-277`).
2. **Instanced meshes** get each instance matrix re-seated rigidly and are left **unculled** (`:300-320`).
3. **Everything else:**
   1. Clone the geometry and apply its world matrix.
   2. Run `subdivideLongEdges(geo, maxEdge)`. This bisects the longest edge until every edge is ≤ 4 m (up to 12 passes) and carries `geometry.groups` through. Losing the groups once hid every multi-material sign in the world (`:121-230`).
   3. Map each vertex with `positionAt` and recompute normals (`:236-249`).
   4. Reset the transform to identity and set `frustumCulled = true`. Because the geometry is now in root space, its bounding sphere is an exact world bound (`:321-341`).
4. Container groups are reset to identity so transforms do not apply twice (`:345-351`).

`buildPlanet` (`:509-603`) builds the ground sphere itself:

- an `IcosahedronGeometry(R, 30)` with 5.4 m facets and 30 mm sag (the derivation is in `:513-531`);
- 65 mm under the street's terrain grid;
- canal faces removed;
- **radial normals** instead of `computeVertexNormals`, so the terminator is a curve and not a staircase (`:557-586`);
- 4 bands, `castShadow = false` (a closed sphere would self-shadow the whole world, `:594-597`), never culled.

The train is not re-projected. It is bent once and then **spun** about the planet axis (`train.js:407-425`). The camera uses the tangent frame as its basis (`player.js:316-326`).

**Cost.** The bake is one CPU pass over every vertex at load. Subdivision inflates long geometry: the README notes a 6 m cell's diagonal "takes three passes… 2,200 triangles arrived as 18,000" (`hills.js:153-158`). Per frame, the cost is only the lights, the camera basis and the train matrix.

**Limits (facts):**

- **Distortion.** x-scale is cos(z/R): 0.93 at z = ±60, 0.81 at z = −100, 0.64 at z = −140 (the lake), 0.37 at z = −190 (`README.md:445-454`; `CLAUDE.md:77-83`). The code comment's "under 5% compression for |z| < 60" (`planet.js:25-27`) is really about 7% (cos(0.375) = 0.930).
- **Pole clamp.** The player is clamped at ±0.24·C (`index.js:757`).
- **Height scaling.** Heights scale lateral size by (R+y)/R, so a 10 m object is about 6% wider at the top.
- **Planet-scale meshes are never culled.** Their bounding sphere becomes the planet. The railway ring submits about 900k triangles on every frame from everywhere (`README.md:846-856`; `NEXT.md:2111-2124`).
- **Moving or animated things must be projection-aware.** You may not animate a transform on a folded mesh (`CLAUDE.md:726-729`). See §6 on the falling petals, which are updated in flat space after the bake.
- **Horizon.** The horizon is √(2Rh) ≈ 23 m at eye height. R is deliberately small to hide distance (`README.md:275-279`; `planet.js:38`).

**Does it scale to a planet you can fly high above?**

**Opinion:** not as is. The *pattern* scales once it is generalised.

| Issue | sakura-crossing | What a flyable Light No Fire-like planet needs |
|---|---|---|
| Chart | One equirectangular chart. Poles are degenerate. A content band of about ±25° latitude (≤ 10% squash) covers about 42% of the surface. | **Cube-sphere: 6 flat charts.** With the tangent-warped cube mapping, the max/min area ratio is about 1.41 (raw gnomonic is about 5.2). Every chunk is still "authored flat" in (face, u, v, h) and bent by one projection function. |
| Bake | CPU, once, the whole world, into root space with identity transforms | Per chunk at generation or stream time, with **chunk-local origins** (avoids float32 cancellation at km radii) and per-chunk bounding spheres for culling. Alternatively, bend in the vertex shader. |
| Long edges | `subdivideLongEdges` at 4 m | Voxel **greedy meshing makes long quads**, so cap the merged quad length so the sagitta e²/(8R) stays under about 1–2 cm. That is a 16 m quad at R = 2 km and 3 m at R = 160 m. |
| LOD | None; everything is full detail (no `THREE.LOD` anywhere) | Quadtree LOD per cube face (skirts or geomorph), impostors for trees and buildings, horizon culling. At altitude a whole hemisphere is in view. |
| Physics | Flat-space AABB walker | Walking and riding in chart space are fine. **Flight needs true 3D world-space physics** with radial gravity, plus heading transfer across face seams. |
| Lighting | Lights pinned to the local frame | Choose: pinned (constant art direction everywhere) or world-fixed (a real terminator visible from altitude). Possibly pinned below about 100 m altitude, blended to world-fixed above. |
| Horizon / R | R = 160: horizon 23 m at eye height, 205 m at 100 m altitude | R = 2 km gives 80 m / 640 m / 2.2 km (eye / 100 m / 1 km). R = 5 km gives 127 m / 1.0 km / 3.3 km. **R is the curvature-vs-view-depth knob.** |

### 3.2 Cel ramp with a hue-shifted shadow tint

**File:** `src/core/toon.js:15-133`.

```js
// toon.js:49-53, 60   (three r180 chunk, exact-string replace)
const TOON_LINE  = 'vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;';
const TOON_PATCH = `vec3 celBand = getGradientIrradiance( geometryNormal, directLight.direction );
  vec3 irradiance = celBand * mix( uShadowTint, vec3( 1.0 ), celBand ) * directLight.color;`;
patchedChunk = 'uniform vec3 uShadowTint;\n' + src.replace(TOON_LINE, TOON_PATCH);
```

**How it works.** The ramp texture quantises N·L. Three bands give boundaries at N·L = ±1/3, a fact the code relies on (`README.md:338-344`). The patch multiplies each band's value by a mix toward a cool tint, so a dark band at about 0.36 becomes `0.36·(0.64·tint + 0.36)`: darker *and* violet. One shader program is compiled per distinct tint (`customProgramCacheKey`, `:78`).

**Special cases:**

- Blossom uses the high-key `soft` ramp and `receiveShadow = false`, because "once the shadow map zeroes the sun a blob falls back to ambient… a dark violet lump" (`trees.js:157-189`; `README.md:113-120`).
- The planet sphere uses 4 bands with `flat: false` (`planet.js:588-592`).

**Cost.** Negligible: one texture fetch per light.

**Limits:**

- The tint only affects the *direct-light ramp* (sun and fill, since both are directional). Cast shadows zero `directLight.color` and fall back to fill, hemisphere and grade (`main.js:60-75`). I verified this order in three r180's `lights_fragment_begin`, where `directLight.color *= getShadow(...)` runs *before* `RE_Direct`. The ramp therefore quantises only N·L: PCF shadow edges multiply in linearly and are **not** banded. **Opinion:** the cast-shadow colour is mostly the light rig plus the grade, not the patch. This matters for pixel art (§5.0).
- **Fragility.** The patch depends on an exact source line in three r180. If the line moves, `patchAvailable` is false and the look silently degrades (`toon.js:55-63`). It is WebGL-only (`onBeforeCompile`). A WebGPU/TSL port needs a node-material equivalent.
- **The ramp cannot shade gentle slopes.** Two thirds of the hill sits in the top band, so terrain form has to come from material tone (§3.8).

### 3.3 Screen-space ink from the second difference of depth

**File:** `src/core/post.js:22-98`.

```glsl
// post.js:74-95
float sx = ( dl + dr - 2.0 * dc ) / dc;          // second difference, normalised by distance
float sy = ( du + dd - 2.0 * dc ) / dc;
float convex  = max( 0.0,  sx ) + max( 0.0,  sy );   // near side of a silhouette, ridges
float concave = max( 0.0, -sx ) + max( 0.0, -sy );   // inside corners
float edge = smoothstep( uSens * 0.32, uSens, convex );
edge = max( edge, smoothstep( uConcave, uConcave * 3.4, concave ) * uConcaveAmount );
edge *= 1.0 - smoothstep( uFadeStart, uFadeEnd, dc );   // 40..98 m fade
vec3 line = mix( uInk, col * 0.42, 0.22 );               // ink keeps a hint of the hue
```

**How it works.**

- The second difference is zero on *any* plane, however oblique. A first difference would smear ink across grazing roads (`post.js:13-19`).
- Convex creases ink strongly. Concave creases ink at 0.42 strength, which mimics an animator's lighter contact lines.
- Line width scales with the supersample factor: `uThickness = 1.05 + 0.55·scale` (`:266-267`).
- Sky beyond 420 m is skipped (`:68-72`).
- Materials with `depthWrite: false` (petals, wires, water layers) produce no ink, which is used on purpose (`CLAUDE.md:734`).

**Cost.** 5 depth fetches, 1 colour fetch and a `perspectiveDepthToViewZ` per pixel at the supersampled resolution (at most 4.6 MP). Cheap.

**Limits.**

- It is depth-only. It finds no edge between coplanar surfaces of different colour, which is wanted here. It can miss edges between objects at nearly the same depth.
- The fade hides far detail.
- Every short box gets a silhouette, so geometry had to adapt: a ramp is drawn as one raked box over 8 stepped platforms (`CLAUDE.md:550-558`), and swept solids replace runs of boxes (`CLAUDE.md:543-549`).
- **Opinion:** for voxels, every block step is a crease, so expect busy ink at mid-distance. Tune `uSens`, `uConcaveAmount` and the fade band.

### 3.4 Inverted-hull outlines

**File:** `src/core/outline.js:15-118`.

```glsl
// outline.js:27-30 -- constant screen-space width
vec4 clip = projectionMatrix * mv;
vec3 clipN = normalize( ( projectionMatrix * vec4( n, 0.0 ) ).xyz );
vec2 aspect = vec2( uResolution.y / uResolution.x, 1.0 );
clip.xy += clipN.xy * aspect * uThickness * clip.w * 0.5;
```

**How it works.**

- Smoothed normals come from `mergeVertices` plus `computeVertexNormals`, cached per geometry in a WeakMap (`:51-66`).
- The shell is a BackSide child mesh with renderOrder −1 and no shadows, and it supports `InstancedMesh` by sharing `instanceMatrix` (`:72-105`).
- Typical thickness is 0.003–0.0036 NDC.

**Cost.** One extra draw call per outlined mesh, plus vertex work. That is why vehicles opt in with `hero` only (`vehicles.js:56-63`).

**Limits.** `makeShop` outlines its wall and roof meshes on every shop (`shops.js:378`). With 189 call sites the draw-call cost is real. Two inferences from the code, not verified visually:

- Non-rigid shells go through `wrapGeometry`, which deletes normals and recomputes them on non-indexed geometry, giving face normals (`planet.js:236-249`). That discards the smoothed normals and may open gaps at hull corners.
- The shell is uniform-colour and has no fog (`fog: false`, `outline.js:86`).

### 3.5 Light rig, split-tone grade and supersampling

**Files:** `src/main.js:44-75, 144-157`, `src/core/post.js:100-144, 242-268`.

```glsl
// post.js:126-141
float k = smoothstep( 0.02, 0.55, l );
c *= mix( uShadowTint /*#ada8d0*/, uLightTint /*#fff7e8*/, k );   // violet darks, paper-white lights
c += vec3( uWarmth, uWarmth * 0.45, 0.0 ) * l * 0.35;
c = c + uLift * ( 1.0 - k );                                       // never crush to black
c = mix( vec3( l ), c, uSaturation );                              // 1.12
c *= 1.0 - uVignette * pow( clamp( r, 0.0, 1.0 ), 2.6 );
```

**Cost.** One fetch per pixel. **Limits.** The grade is global, with no per-area grading, and fog colour (`PAL.fog`) is the only depth cue besides the ink fade. The sky dome is a separate system (§3.11).

### 3.6 Draw-call economics: bake, material cache, instancing, culling

**Files:** `src/core/util.js:46-74`, `src/core/toon.js:82-132`, `src/world/planet.js:299-341`, `src/world/props.js:833-844`.

**How it works.**

- Every generator collects `{geometry, matrix}` into `parts[key]` per material slot, then emits one `Mesh(bake(parts[key]), matFor[key])` per slot (`shops.js:81-82, 369-379`; `vehicles.js:255-268`).
- `bake` clones and transforms the parts, flattens indexed/non-indexed mixes, keeps only shared attributes, and calls `mergeGeometries` (`util.js:46-74`).
- The `cel()` and `flat()` caches make "the same material" mean the same object, so programs and state changes are shared.
- Repeated things are instanced: blossom blobs (3 meshes for every cherry in the world), cedar, bamboo, shrubs, rocks, petals and similar (43 `InstancedMesh` sites).
- The fix for many-part props is **bake one item per material, then instance it**: `makeBikeRack` bakes a bicycle into 3 geometries and instances each along the row (`props.js:833-844`).

**Cost and limits.**

- Merging is per object, not per region, which gives about 19k meshes (`README.md:837-844`).
- Instanced meshes are never culled.
- Every merge happens at load on the main thread.
- The known remaining waste is `makePlanter` (11 meshes) and `makeBicycle` (14 meshes) placed dozens of times (`CLAUDE.md:700-704`).

### 3.7 Generators instead of models

**Files:** `src/world/shops.js:11-391`, `src/world/vehicles.js:9-656`, `src/world/traffic.js:13-80, 506-533`, plus the kits in `blocks.js`, `housing.js` and `buildings.js`.

**`makeShop(ctx, o)`** takes `x, z, y, w, d, face, kind, floors, awning, shutter, wall, roof, roofKind, seed`. It builds:

- the main volume, plus an upper storey set back;
- a gable from an extruded triangle, or a flat roof with a parapet "so a flat roof still has an edge to ink";
- **a real 0.9 m recess** with piers and a header, and the interior painted on the back face ("a glazed decal on a solid box reads as a sticker", `:23-26, 117-140`).

It then bakes per material, outlines the wall and roof, rotates by `FACE_RY`, and registers a world-axis collider that accounts for the quarter-turn swap (`:369-390`). It has 15 call sites across 7 districts.

**`makeVehicle(o)`** is driven by a table row:

```js
// vehicles.js:136-147
kei: {
  L: 3.40, W: 1.475, R: 0.275, axle: [1.16, -1.19],
  sill: 0.38, waist: 1.00, roof: 1.70,
  cab: [-1.60, 1.15], rakeF: 0.42, rakeR: 0.14,
  seams: [0.12, -0.80], handles: [-0.60, -1.40],
},
```

- Everything else is derived from the row: wheel arches, bumpers, lamps, plates, seams, handles, mirrors and wipers (`:31-55`).
- Screens use `panel(ax, ay, bx, by)`, which is drawn between two profile points (`:233-253`).
- `parkVehicle` derives the rotated AABB and shrinks it 60 mm inside the sheet metal (`:632-656`).
- `traffic.js` holds every placement in one file, with a written reason and six distribution rules, because "a distribution cannot be reviewed thirty lines at a time in twenty-two modules" (`:13-80`). A pairwise overlap audit runs in DEV (`:506-533`).

**Cost.** About 7–8 meshes per vehicle. **Limits.** The generators are parametric, not grammar-based, and every placement is a literal coordinate (§3.12).

### 3.8 Hill lattice: field, limiter, octaves and tone-by-material

**File:** `src/world/hills.js`. The header is `:14-158`; then `CELL :168`; the lattice `:1543-1778`; the queries `:1781-1870`; `hillSafety :1910-1954`; `faceTone :2018-2133`; `buildSurface :2135-2287`.

**How it works.**

- **A third ground surface.** `hillAt` is added to `streetHeight` inside the height queries (`index.js:126-131, 780`). The drawn mesh sits at `groundY(z) + field − TERRAIN_DROP` (`:2011`). Where the field is below zero it is buried under the flat grid, and the two surfaces meet along the contour field = 0, so there is no z-fighting (`:28-63`).
- **One source of truth.** `nodeAt(i, j)` is the only place a height comes from. `fieldAt` interpolates the same two triangles the mesh draws, so walkable equals visible "to the bit" (`:1781-1817`).
- **Checkerboard diagonals** avoid a straight-line crease grain that the ink pass would draw (`:1543-1556`).
- **The build has four passes** (`:1598-1778`):
  1. Summits: quartic bumps `h·(1−d²)²` with a screen blend, minus a pedestal, times the keep-out mask and the lake.
  2. A **lower-only slope limiter** (0.52 on hillside, 1.9 in railway and canal corridors, up to 140 relaxation passes).
  3. Three roughness octaves (`undulate`, `FINE`, `ULTRA`), damped near trails and water and floored at −0.75·h.
  4. Trail benching: cut *and* fill toward a path profile.
- **Tone by facet material, not by light.** `faceTone` picks one of 5 ground materials from:
  - facet slope (steep means bare earth);
  - aspect against the sun azimuth, weighted by slope;
  - height;
  - a 24 m "cover" field;
  - a jitter hash that is coherent over 2×2 cells, to avoid "confetti".

  Measured split: earth 8%, bracken 10%, sun 27%, mid 24%, deep 31% (`:2018-2133`). There is one non-indexed mesh per tone, which is 8 draw calls (`:2272-2287`).
- **Invariant.** `hillSafety(world)` samples every collider and platform inside a keep-out area and must read 0.00 (`:1910-1954`; `README.md:316-334`).

**Cost.** About 45k nodes, plus up to 140 relaxation sweeps at load ("a couple of milliseconds", `:1559-1561`, written when there were fewer nodes). About 60k triangles after the bake (`:180-192`).

**Limits.**

- It is a bounded window (x ±168, z −196…108). It is not a planet-wide field.
- Platforms are axis-aligned, so slopes are walkable only through `hillAt`.
- Float32 storage caused a silent bug: −1.3 stored as float32 is greater than −1.3, so the buried-apron skip never fired (`:1575-1596`).

### 3.9 Water: a contour above the datum, marching squares and a leak check

**Files:** `src/world/lakeform.js:684-779`, `src/world/lake.js:26-200`, `src/world/landform.js:53-150`.

- **The canal is a hole.** `cutTrench` drops every triangle with any vertex inside the footprint, from both the terrain grid and the sphere, plus a `ctx.cut` so height queries follow the excavation (`landform.js:114-150`; `planet.js:490-507`; `README.md:739-749`).
- **The lake is a contour.** The water is one flat plane at `groundY + LEVEL − TERRAIN_DROP` (`lake.js:68`). The shoreline is wherever the field crosses LEVEL, and `lakeDepthAt = LEVEL − fieldAt` is one line (`hills.js:1843-1845`).
- **Five surface layers from one marching-squares function** (body, shallow, deep, sky panels, reflection "echoes"):

  ```js
  // lake.js:151-176
  const body = contourFill((x, z) => Math.min(lakeDepthAt(x, z), insideness(x, z) + 1.2), WY);
  const shallow = contourFill((x, z) => { const d = lakeDepthAt(x, z);
    return Math.min(d - 0.06, 0.85 - d, insideness(x, z) + 1.0); }, WY + 0.012);
  ```

  `contourFill` emits a convex polygon of 3–6 points per cell, fan-triangulated, and is watertight across cells (`lake.js:81-126`).
- **`lakeLeakCheck`** is a BFS over `field < LEVEL` from a basin seed on a 1.5 m grid. It reports how far outside the shoreline it escaped, plus the wetted area, and `contained` means escaped < 30 m (`lakeform.js:720-779`). The rim is also *derived* from the shoreline, so it cannot leak by construction (`README.md:470-475`).

**Limits.** Water is static; animation is done with rigid groups. The surface is single-sided, so a camera placed below it sees nothing (`CLAUDE.md:346-353`).

### 3.10 Canvas2D procedural textures

**File:** `src/core/textures.js`, 4,397 lines with 134 exported factories (shop fascias, noren, menus, timetables, ema, notices, painted interiors, petal and cloud masks).

```js
// textures.js:16-37
function make(w, h, draw, { srgb = true, repeat = null, aniso = 4 } = {}) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(cv); if (srgb) tex.colorSpace = THREE.SRGBColorSpace; ...
}
function cached(key, fn) { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); }
```

There are also `fitText` (shrinks the font until the text fits, `:41-49`), `centered` with letter-spacing (`:51-67`), vertical text (`:69-75`) and `mirrored()` for back faces (`:534-543`).

**Limits.**

- It uses a system CJK font stack (`:13`). On Linux it can render tofu (`README.md:878-890`).
- Texture aspect must match the face aspect, or the text smears without any error (`CLAUDE.md:730`).
- All textures are drawn at start-up. There were 205 textures at one count (`NEXT.md:988-990`).

### 3.11 Sky

**File:** `src/core/sky.js:12-90`.

- A BackSide sphere with r = 500 and a 3-colour gradient with soft quantisation, `mix(t, floor(t·26)/26, 0.35)`, so it reads as airbrushed (`:37-49`).
- 22 billboard cloud pairs using a Canvas mask with `depthWrite: false` (`:58-87`).
- The dome follows the camera (`main.js:241-243`).
- `buildDistantHills` is dead code. The ridges were removed when the planet went in (`index.js:339-341`).

**Limits.** The gradient is keyed on world +Y (`sky.js:38`), not on local up. §6 asks whether this is visible far from the origin.

### 3.12 Determinism and "procedural"

`mulberry32` and `rngKit(seed)` (`util.js:16-39`) are used at 108 sites. Each object gets a literal seed (for example `seed: 21` in `index.js:148`). **The layout is hand-authored in code**: house tables, tree spots, district coordinates and the vehicle table are all literal numbers (`index.js:144-232, 447-506`; `traffic.js`).

**Opinion:** this is "procedural geometry and textures, art-directed layout", not seed-generated worlds. Wallhammer's "everything from a static seed" needs a hashed seed hierarchy (world → chunk → feature) on top of these generators.

### 3.13 Dev capture and the verification toolkit

**Files:** `vite.config.js:9-47`, `src/main.js:256-329`, `src/core/hud.js:33, 177-199`, `CLAUDE.md:119-503`, `NEXT.md:2136-2219`.

- **Vite plugin** `frameGrabber` with `apply: 'serve'`. `POST /__shot` with `{name, data}` writes `.shots/<name>.jpg`, after sanitising the name (`vite.config.js:9-39`).
- **`window.__shot(name, W, H, opts)`** (DEV only):
  1. Sets the pose (`pos`, `yaw`, `pitch`) or an orbit (`orbit`, `dist`, `tilt`).
  2. Applies pass toggles (`ink`, `grade`) and `scale`.
  3. Resizes the pipeline, re-seats the lights and calls `pipeline.render()`.
  4. Copies the canvas into an offscreen 2D canvas (`toDataURL('image/jpeg', 0.86)`) and POSTs it (`main.js:265-329`).

  `__shot` derives feet height from `world.heightAt` and ignores `pos[1]` (`CLAUDE.md:473-477`).
- **Recipes the agent relies on:**
  - Step `world.update(1/60)` in a loop because rAF does not fire in the agent's browser pane (`CLAUDE.md:141-157`).
  - Run a headless `buildWorld({add(){}, children:[], traverse(){}})` to turn a blank page into a stack trace (`:446-462`).
  - Answer "can this be seen?" with a raycast, not a screenshot (`:159-166, 492-496`).
  - Use a `look(from, to)` yaw helper (`:464-471`).
  - Use a sight-line check over `hillAt` (`:411-429`).
  - Run the BFS reachability fill with the player's radius and step, keyed on (cell, height bucket) and chunked with `setTimeout` (`NEXT.md:2136-2219`).
- **For human-to-agent feedback**, the C key shows flat coordinates, and Shift+C copies a ready `{ pos: [...], yaw, pitch }` line (`hud.js:33, 199`; `README.md:47-48`).

---

## 4. Performance

**Where the bottleneck is (facts from the repo docs):**

- **Draw calls, not fill rate, not shadows.**
  - About 20 ms at about 3,050 calls (the crossing, at an older scene size) and about 11 ms at about 1,400 calls (`CLAUDE.md:693-699`).
  - Halving the internal resolution changes 19.3 → 19.1 ms.
  - Shrinking the shadow cascade from ±34 to ±22 m changes 19.7 → 18.4 ms.
- **Draw calls by view:** crossing about 5.8k, overbridge deck about 7k, **展望台 about 13.6k** (`CLAUDE.md:395-400`). Another round measured the school road at 9,277 (`NEXT.md:965-990`).
- **Scene size:** about 1.74M triangles and about 19k meshes (`README.md:837-844`). An earlier round had 718 colliders and 12,323 geometries (`NEXT.md:988-990`).
- **Fixed cost:** the railway ring, about 900k triangles submitted every frame because it can never be culled (`README.md:846-856`). The canal was cut to a bounded reach partly for this reason (`CLAUDE.md:705-717`).

**Levers in use:**

1. Per-object, per-material `bake()` with material caching (§3.6).
2. Instancing for everything repeated, including CPU-animated petals: 980 instances with matrices rewritten every frame (`petals.js:17, 80-111`).
3. **Exact frustum culling after the bake** ("drawing all of them every frame… cost about 8 ms", `planet.js:326-332`).
4. Planet-scale geometry dressed only where it can be seen ("the structure runs the whole way round; the dressing does not", `README.md:226-232`).
5. Inverted hulls only where they earn their place (`vehicles.js:56-63`).
6. A pixel budget on supersampling (4.6 MP, `post.js:204, 246-248`).
7. A single 2048² shadow map over ±34 m, following the player (`main.js:48-52`).
8. Shallow transparency with `depthWrite: false` (no ink speckle).

**What is absent:**

- LOD, impostors, occlusion culling, BVH or spatial hashing (collision and `heightAt` scan linear lists: `player.js:172-188`, `index.js:784-791`);
- Web Workers or chunked or async world build (the whole world builds synchronously at load);
- any GPU-driven or merged-indirect drawing.

**Measurement discipline.** "Wall-clock frame time on this machine drifts 33–42 ms run to run… Compare draw calls" (`CLAUDE.md:487-490`; `NEXT.md:2124-2128`).

**Opinion:**

- 33–42 ms (about 24–30 fps) on the author's machine in the agent environment suggests the heavy views are not 60 fps material. No figures exist for mid-range or mobile hardware.
- For Wallhammer Zero, draw calls per frame should be a tracked budget from day one. The voxel planet must be chunk-merged with LOD from the start.

---

## 5. What to take and where

Only code-achievable techniques are listed. Priority: **A** = adopt early, **B** = adopt when the feature arrives, **C** = optional.

### 5.0 Pixel-art lens (owner update 2026-10-02)

The owner's priorities: 2D Kairosoft sims come first, voxel games come later, and **voxels will also be rendered as pixel art.** sakura-crossing goes the *other* way: it supersamples, anti-aliases and fades smoothly. The question for each technique is whether it survives being rendered at low resolution, with a fixed palette and integer-upscaled nearest-neighbour pixels.

| Technique (sakura source) | At pixel-art resolution | What has to change (opinion unless cited) |
|---|---|---|
| **Toon ramp with hue-shifted shadows** (`toon.js:15-133`) | **Survives. The most valuable piece.** Hue-shifted ramps (cooler and more violet in shadow, warmer in light) are standard pixel-art practice. | <ul><li>Use **2–3 bands only** (`RAMPS[2]`/`[3]`, `toon.js:15-24`). Four or five bands at 320–480 px width produce 1 px banding noise.</li><li>Replace the multiplicative tint `celBand * mix(uShadowTint, 1, celBand)` (`toon.js:51-53`), which invents in-between colours, with **explicit per-material palette ramps**: N hand-picked colours, band index → colour. Keep the `cel()` factory and cache shape (`toon.js:88-133`).</li><li>Keep `flatShading: true` (the default, `toon.js:93`) so each voxel face is one colour.</li><li>**Cast shadows bypass the ramp** (three r180 multiplies the shadow before the toon BRDF, §3.2). Use `BasicShadowMap` for hard edges, or quantise after shadowing, and make the shadow colour an explicit palette entry.</li></ul> |
| **Depth-based ink as 1 px outlines** (`post.js:22-98`) | **Survives, with changes.** Depth second differences are exact at low resolution, and planar faces still produce no lines. | <ul><li>Set the tap offset to exactly 1 texel (`post.js:65`, `uThickness = 1.0`). Replace `smoothstep` with a hard `step` (`post.js:86-87`) to get binary lines.</li><li>**Ink only the convex term** (`post.js:83-86`). The concave term marks the far-side pixel of the same silhouette, which doubles lines to 2 px. Convex-only puts the outline on the object's own pixels, which is the pixel-art convention.</li><li>For line colour, use the material's next-darker palette entry ("sel-out") or one palette ink, not `mix(uInk, col*0.42, 0.22)` (`post.js:94`, which creates off-palette colours).</li><li>Replace the distance *fade* (`post.js:90`) with a hard cutoff, or a dither threshold.</li><li>Retune `uSens` and `uConcave`. They were tuned for 1.5–2× supersampling (`post.js:30-35, 266-267`).</li></ul> |
| Inverted-hull outlines (`outline.js`) | **Drop.** | Thickness is in NDC: 0.003–0.0036, about 2 px at 1080p (`outline.js:69-72`), so about 0.5 px at 270p. That gives flickering partial lines and extra draw calls, and the depth ink already produces 1 px everywhere. |
| **Canvas2D procedural textures** (`textures.js:16-75`) | **Survives fully. Becomes the core of the 2D sims.** | <ul><li>Keep `make(w, h, draw)` and `cached(key, fn)` as they are (`textures.js:16-37`).</li><li>Set `imageSmoothingEnabled = false` (sakura sets `true`, `:21`). Use integer coordinates and `fillRect` only: arcs, strokes and `fillText` anti-alias into off-palette edge pixels.</li><li>Use `NearestFilter`, no mipmaps and no anisotropy (sakura sets `aniso = 4` with default linear filtering, `:24-25`). Draw at native sprite size (16/24/32 px) and upscale by integers.</li><li>Text: `fillText` anti-aliases *and* depends on system fonts (`README.md:878-890`). Define a **bitmap pixel font in code** (glyph bit arrays drawn with `fillRect`) and port `fitText` (`:41-49`) to it.</li><li>Add a final "snap to palette, threshold alpha" pass per canvas as a safety net.</li></ul> |
| **3D→2D stylisation to pre-render sprites** (generators + `cel` + ink + `__shot`) | **Survives as a sprite factory.** | <ul><li>Render the same generators (`makeShop` tenants, `SPEC` rows) with an **orthographic** camera at the sims' fixed 3/4 angle into a small target, with convex-only 1 px ink and palette quantisation. Capture frames into sprite sheets.</li><li>`__shot` is the capture path, but **must switch JPEG → PNG**: `toDataURL('image/jpeg', 0.86)` at `main.js:322`, and the plugin forces `.jpg` at `vite.config.js:26-28`. JPEG destroys pixel art.</li><li>Disable supersampling and FXAA for these captures (`post.js:245, 290-294`).</li><li>Animation frames: step time by hand per frame (`CLAUDE.md:141-157`), with inner pivots for moving parts (`CLAUDE.md:726-729`).</li><li>Worth it when there are many variants (tenants × 4 facings × states). For a handful of sprites, hand-coded Canvas2D is simpler.</li></ul> |
| Supersample 1.5–2× plus FXAA (`post.js:146-190, 242-268`) | **Invert.** | Render *below* screen resolution (for example 480×270 or 320×180), with an integer nearest upscale and no FXAA or MSAA. Add **camera texel snapping**: snap the camera in its view plane to the texel size, then offset the upscale blit by the remainder. This prevents "pixel crawl". Snapping only works cleanly with an orthographic camera (§6). |
| Split-tone grade (`post.js:100-144`) | Survives | Apply it *before* palette quantisation, or bake it into the palette. Drop the smooth vignette or dither it. |
| Sky soft quantisation `mix(t, q, 0.35)` (`sky.js:41-42`) and linear fog (`main.js:39`) | Partly | Use full quantisation with ordered (Bayer) dithering between bands, for both sky and fog. Smooth gradients break the palette. |
| **Tone by facet material** (`faceTone`, `hills.js:2018-2133`) | **Helps a lot** | Pixel art builds form from deliberate colour areas, not light gradients. "Tone by aspect, height and cover, with a 2×2-coherent hash" maps directly onto voxel terrain, and the "no confetti" rule is pixel art's "no orphan pixels". |
| Narrow `PAL` palette plus "lift dark colours so they don't meet ink in shade" (`palette.js:1-6`; `vehicles.js:91-101`) | Survives | Becomes the fixed game palette that the final quantise pass enforces. |

**Suggested pixel-art pipelines (opinion):**

- **Voxel game (later):**
  1. Low-res 8-bit target plus depth texture.
  2. `cel()` with palette ramps and hard shadows.
  3. Convex-only 1 px depth ink with sel-out colour.
  4. Grade.
  5. Palette quantise, with Bayer dither for sky and fog.
  6. Integer nearest upscale with texel-snap offset.

  This is about 4 fullscreen passes, as cheap as sakura's.
- **2D sims (now):** no runtime 3D. Use Canvas2D pixel generators, with an optional offline sprite bake from 3D generators through the same 3D pipeline once the voxel stack exists.

### (i) Voxel planet game (Three.js, Light No Fire-like)

| Technique (source) | What it gives the voxel planet | Adaptation notes (opinion) | Prio |
|---|---|---|---|
| **Flat authoring plus one projection seam** (`planet.js:30-108, 236-366`) | Generators, collision and height queries stay 2.5D and simple. Curvature comes for free. | Generalise to a **cube-sphere**: chart = (face, u, v), tangent-warped mapping, chunk-local origins. Bend at chunk-mesh time, or in the vertex shader. Keep `basisAt`/`positionAt`/`flatAt`-style APIs as *the* only planet-aware module. | **A** |
| `subdivideLongEdges` (`planet.js:121-230`) | Guarantees long geometry follows the curve | For greedy-meshed voxels, **cap the quad length** so e²/(8R) ≤ about 1 cm. | **A** |
| Rigid re-seat vs bent geometry (`planet.js:279-363`; `CLAUDE.md:726-729`) | Animated mounts, doors and NPCs keep their pivots | Mounts, villagers and flying mounts are "runtime modules" placed every frame with the tangent frame (like `ebike.js:102-108`). Never animate baked meshes. | **A** |
| **Cel ramp plus shadow-tint patch** (`toon.js:15-133`) | A painted look on axis-aligned voxel faces. Only 6 normals map cleanly onto 2–4 bands. | If on WebGPU, rewrite as a TSL lighting node. Pin the three version and assert that the patch applied. | **A** |
| **Depth second-difference ink** (`post.js:22-98`) | Inked block silhouettes and ridges at any distance, with no per-mesh cost | Tune the threshold and fade per biome. Consider convex-only beyond about 30 m so block terraces don't turn to noise. | **A** |
| Split-tone grade, supersample, FXAA (`post.js:100-268`) | A cohesive palette and clean lines | Add a per-biome grade uniform set (desert warm, swamp green). | **A** |
| **Tone by facet material, not by light** (`hills.js:2018-2133`) | Readable terrain form where the light can't separate slopes: aspect, height and cover choose the block or colour variant | Apply per voxel column. Use a 2×2-coherent hash for jitter, never a per-face hash ("confetti"). | **A** |
| Lights pinned to the local tangent frame (`main.js:144-157, 229-238`) | Consistent art direction anywhere on the planet | Blend to a world-fixed sun at high altitude so the terminator and curvature read from the sky. | B |
| Draw-call budget: per-material bake, instancing, exact culling (`util.js:46-74`; `planet.js:300-341`; `props.js:833-844`) | Survives large view distances | One mesh per chunk per material (or a single atlas material). Instance trees, rocks and props with per-chunk bounds, *not* unculled. Track `renderer.info.render.calls`. | **A** |
| Lower-only slope limiter plus keep-out masks plus `hillSafety`-style checks (`hills.js:1618-1650, 1910-1954`) | Villages and fortresses on procedural terrain with guaranteed flat pads | Flatten pads first, then limit slope. Assert numerically that the terrain under every building footprint is 0. | B |
| **Lake = contour of the height field** plus `lakeLeakCheck` (`lakeform.js:720-779`; `lake.js:81-200`) | Lakes with irregular shores for free, and depth-driven dressing (reeds, shallows) | Priority-flood each basin to its spill level, then flood-fill to verify. Water is flat per basin. Marching squares gives non-staircase shorelines if the water is non-voxel. | B |
| Marching squares `contourFill` (`lake.js:81-126`) | Smooth biome borders, shallows bands, road ribbons | It is generic, about 40 lines, and easy to reuse. | C |
| Generator-as-table-row (`vehicles.js:136-223`) | Mounts (horse vs flying mount proportions), houses, towers and fortress pieces as rows of numbers | One row per kind, everything else derived. Add a validator. | **A** |
| Horizon formula `√(2Rh)` (`planet.js:38`; `README.md:275-279`) | Choose R deliberately | R = 2–5 km gives an 80–130 m horizon at eye height and 2.2–3.3 km at 1 km altitude (§3.1 table). | **A** |
| Planet orbit view (`main.js:159-177`) | A dev and marketing "whole planet" shot | Only feasible with LOD at real R. | C |

**Do not copy:**

- the equirectangular chart (poles);
- the single global synchronous build;
- world-space bake with identity transforms at km scale;
- linear collider scans;
- the world-+Y sky gradient.

### (ii) 2D Kairosoft-style sims (pixel art)

| Technique | What it gives | Notes (opinion) | Prio |
|---|---|---|---|
| **Canvas2D texture library pattern**: `make`, `cached`, `fitText`, vertical text (`textures.js:16-75`) | Signage, facility plates, price tags, menus and UI badges generated from data, with auto-fitting labels (good for localisation) | For pixel art: draw at native low resolution with `imageSmoothingEnabled = false`, and use a **generated bitmap font** (avoids the system-font and tofu issue, `README.md:878-890`). | **A** |
| "One generator, many tenants" (`shops.js:11-27`) | Facilities share construction and differ in colour, sign and clutter. This is exactly how Kairosoft rooms read. | Pair it with the "variety is in the clutter outside" principle (`README.md:675-681`). | **A** |
| Table-row generator (`vehicles.js:136-223`) | Room, shop or vehicle kinds as data rows, everything else derived | Fits the content database of a sim. | **A** |
| Narrow `PAL` palette with reserved saturated accents (`palette.js:1-6`) and "lift dark colours so they don't hit ink in shade" (`vehicles.js:91-101`) | Readable sprites at small sizes | Make it the single source for sprite and UI colours. | **A** |
| Painted fake interiors behind glass (`shops.js:136-140`; `textures.js` `shopInterior`, `libraryInterior`, …) | Cheap "life inside" for buildings | For 2D: layered interior sprites behind window cut-outs. | C |
| Split-tone grade (`post.js:100-144`) | A cohesive mood across procedural sprites | A palette-remap LUT or 2D post shader. | C |
| 3D → 2D stylisation (toon ramp, depth ink, grade) | Pre-render facility, vehicle and character sprites (4 facings × states) from 3D generators straight into pixel art | Orthographic camera, convex-only 1 px ink, palette quantise, PNG capture (§5.0). Becomes cheap once the voxel stack exists, since it is the same code. | B |
| One-file distribution with reasons (`traffic.js:13-80`) | Placement rules for decor, NPC spawn points and so on, reviewable in one place | — | B |

### (iii) Studio and generator workflow (agent-written games)

| Technique | What it gives | Notes (opinion) | Prio |
|---|---|---|---|
| **`POST /__shot` Vite dev plugin plus `window.__shot(name, W, H, opts)`** (`vite.config.js:9-47`; `main.js:260-329`) | The agent renders exact frames to disk and reads them. No screenshots of a browser pane needed. | Make it standard in every Wallhammer game template, **using PNG, not JPEG** (`main.js:322`, `vite.config.js:26-28`). JPEG artefacts make pixel-exact review and golden-image diffs impossible. Extend `opts` with `seed`, `timeOfDay`, `biome`, `debugView`, `scale`. Store a **shot list per area** as regression fixtures, as in `CLAUDE.md:191-344`. Diff against golden images. | **A** |
| `window.__scene` plus steppable `world.update(dt)` (`main.js:257`; `CLAUDE.md:141-157`) | Deterministic tests of sequences without rAF | Design every game loop to be fixed-dt steppable from the console. | **A** |
| Headless build smoke test (`CLAUDE.md:446-462`) | A blank page becomes a stack trace | Run as a Node test in CI with a stub scene and stub canvas (they proxy Canvas2D, `CLAUDE.md:159-166`). | **A** |
| **Executable invariants**: `hillSafety`, `lakeLeakCheck`, `boreClearance`, `cribClearance`, the DEV `auditOverlaps`, `bakeStats` rigid count (`hills.js:1910`; `lakeform.js:740`; `tunnel.js:885, 1436`; `traffic.js:506-533`; `CLAUDE.md:726`) | Catches the "visual bugs that throw nothing" class | Every generator exports `check*()` returning numbers. The agent must run them after edits. | **A** |
| **Reachability flood fill** with per-module `FLOODFILL` waypoint lists (`NEXT.md:2136-2219`; `rokuchome.js:125-140`) | Proves routes stay walkable after any prop is added | For the voxel planet: navmesh or voxel BFS between village POIs. For the sims: path checks between rooms. | **A** |
| C-key paste-ready coordinates (`hud.js:33, 199`) | Humans report bugs in agent-ready form | Cheap and high-leverage. | **A** |
| Docs split: README (why), CLAUDE (how and traps), NEXT (handover and audit per brief) (`CLAUDE.md:85-97`; `NEXT.md:1-25`) | Long-horizon agent memory | Cap `CLAUDE.md` at a few hundred lines and move detail into module headers. Keep the **trap table** format "Thing / Why / Symptom". | **A** |
| Module header with a "spoken-for" survey, decisions with arithmetic, and FLOODFILL (`rokuchome.js:60-140`; `CLAUDE.md:647-652`) | Each module is a self-contained spec the agent can re-read | Template it in the generator scaffolding. | B |
| "Count draw calls, not ms" (`CLAUDE.md:487-490, 693-699`) | A stable performance metric under noisy agent environments | Log `renderer.info` in `__shot` results. | **A** |
| "Every nudge to existing content is commented where it happens, with the reason, and listed" (`NEXT.md:2257-2260`) | Prevents agent churn and regressions | Make it a CLAUDE.md rule. | B |
| Generator-as-table-row (`vehicles.js:13-17, 136-223`) | Adding content means editing data, not writing new code paths. Avoids "two hand-placed copies that don't join up". | It is the backbone of the generator itself (game kinds, room kinds, mount kinds). | **A** |

---

## 6. Open questions

1. **Sky orientation off-origin.** `sky.js:38` uses `normalize(vWorld).y` (world +Y) on a dome centred on the camera. By my calculation, at the lake (x ≈ 190, about 68° of longitude) the local zenith maps to h ≈ 0.08, which is the haze colour. Is the sky visibly wrong away from the town, and was it accepted because the lake is "against a pale sky"? This is an inference, not verified in a render.
2. **Falling petals after the bake.** `petals.js:80-111` writes flat-space matrices every frame into instanced meshes that the bake re-seated only once. With |z| up to 34 the sphere has dropped by about z²/(2R) ≈ 3.6 m. Do the petals at the field edges hover above the ground? This is an inference.
3. **Outline shells and normals.** Non-rigid hull shells pass through `wrapGeometry`, which recomputes flat normals (`planet.js:245-246`) and discards `outline.js:51-66`'s smoothed normals. Are there corner gaps in the hulls, masked by the depth ink? This is an inference.
4. **Shadow shimmer.** The "snapped grid" comment (`main.js:19-20`) has no implementation (`main.js:233-237`). Does the shadow swim while walking?
5. **Real-world performance.** There is no demo. The only timings are about 20 ms at about 3k calls and a 33–42 ms drift on the author's machine (`CLAUDE.md:487-490, 693-699`). What are fps, time-to-first-frame (synchronous build of 56k lines of generators plus 134 canvases plus the lattice relaxation) and memory on mid-range or mobile GPUs?
6. **Which model, how many sessions, and how much human art direction?** The single squashed commit hides the process. `NEXT.md` mentions four briefs, but not session counts or how often a human corrected composition.
7. **Ink on voxels.** With depth-only edges, how noisy is the ink at 50–150 m on stepped voxel terrain? Should Wallhammer add a normal-buffer edge term, or fade more aggressively? Needs a prototype.
8. **Projection choice.** Cube-sphere charts (tangent-warped) vs vertex-shader bend vs true 3D voxel density with marching cubes. Which one keeps "author flat" for villages and fortresses while allowing flight? Needs a spike: one face plus the seam handling between two faces.
9. **Pixel art with a perspective camera.** Texel snapping removes pixel crawl only for orthographic projection. A flyable voxel planet wants perspective. Is some shimmer acceptable? Alternatives: orthographic for ground play and perspective for flight; or a stable low-res target with temporal-free nearest sampling while accepting crawl. Needs a prototype at 320×180 and 480×270.
10. **Palette policy.** One global palette across all Wallhammer games, or one per game? How many ramp steps per material (2–3 bands plus an outline step)? Is dithering allowed only for sky and fog? This decides how the toon ramps and Canvas2D generators are parameterised.
11. **Doc drift as a process risk.** The 3 m vs 1.5 m lattice, "<5%" vs about 7% compression, "a handful" of hull outlines vs 189: how should the studio keep agent-written docs truthful? One option is generated stats in the docs (counts emitted by `bakeStats`/`renderer.info` into a JSON the docs cite).

---

## Sources

Repository: https://github.com/Kenton-GMI/sakura-crossing (commit `de01898`, 2026-07-29). The clone was at `…/scratchpad/repos/sakura-crossing`.

- Docs: `README.md` (906 lines), `CLAUDE.md` (1,599), `NEXT.md` (2,260), `.claude/launch.json`, `docs/hero-1-crossing.jpg` (viewed), `.gitignore`, `.gitattributes`
- Build: `package.json`, `package-lock.json` (three 0.180.0), `vite.config.js`, `index.html`
- Core: `src/main.js`, `src/core/toon.js`, `src/core/post.js`, `src/core/outline.js`, `src/core/util.js`, `src/core/sky.js`, `src/core/palette.js`, `src/core/textures.js`, `src/core/player.js`, `src/core/hud.js`
- World: `src/world/planet.js`, `src/world/index.js`, `src/world/hills.js`, `src/world/lakeform.js`, `src/world/lake.js`, `src/world/landform.js`, `src/world/street.js`, `src/world/shops.js`, `src/world/vehicles.js`, `src/world/traffic.js`, `src/world/props.js` (`makeBikeRack`), `src/world/trees.js`, `src/world/petals.js`, `src/world/train.js`, `src/world/tunnel.js` (`boreClearance`, `cribClearance`), `src/world/ebike.js`, `src/world/rokuchome.js` (header conventions)
- GitHub API metadata: `gh api repos/Kenton-GMI/sakura-crossing` (no homepage; Pages 404; 534 stars and 102 forks on 2026-10-02)
- three.js r180 shader chunks, read as text to confirm the shadow-before-ramp order: https://unpkg.com/three@0.180.0/src/renderers/shaders/ShaderChunk/lights_fragment_begin.glsl.js (lines 137-147) and https://unpkg.com/three@0.180.0/src/renderers/shaders/ShaderChunk/lights_toon_pars_fragment.glsl.js (line 12)
- three.js (MIT): https://threejs.org. Vite (MIT): https://vitejs.dev
