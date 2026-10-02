# Voxels for Wallhammer Zero: research

- **Date:** 2026-10-02
- **Author:** Claude Code research agent (Opus 5.5)
- **Revision:** v3.
  - v2 added the owner's Vellum notes ("grafika-reference" → "plan-voxel-hra", 2026-09-24).
  - v3 follows the owner's priority update: **the Kairosoft-style 2D pixel-art sims come first, voxel games come later, and voxels are always rendered as pixel art.**
- **Status:** research only. Nothing here is a decision or a task.

**How to read this document**
- A statement with a link next to it is a **sourced fact**.
- **Opinion:** marks my assessment.
- **(unverified)** marks something I could not confirm from a primary source.
- **(inference)** marks a conclusion drawn from indirect evidence.
- **(my derivation)** marks arithmetic I did myself.
- The session's web-search quota ran out during research. The later checks used direct page fetches and reading shallow-cloned repos (no third-party code was run), so some secondary claims stay flagged.

---

## Executive summary

1. **Priority order.**
   - **Now:** voxels as an *authoring medium* that gets baked into pixel-art sprites for the 2D sims.
   - **Next:** a small real-time voxel layer that renders as pixel art, with a fixed orthographic camera.
   - **Later:** the voxel game (Light-No-Fire-like planet).
   - All three use the same voxel programs and the same palette.
2. **Voxel → 2D sprites is a proven pattern.**
   - Tiberian Sun / Red Alert 2 rendered voxel units in software "on demand, then cached" inside a 2D isometric game ([ModEnc](https://modenc.renegadeprojects.com/VXL)).
   - Build-engine games used KVX voxel sprites ([Silverman](http://advsys.net/ken/download.htm)).
   - Dead Cells baked 3D to pixel frames but fought "pixel flicker" ([Game Developer](https://www.gamedeveloper.com/production/art-design-deep-dive-using-a-3d-pipeline-for-2d-animation-in-i-dead-cells-i-)).
3. **Core trick: an integer axonometric projection (my derivation).**
   - Map world x → screen (+2, +1) px, z → (−2, +1) px and y → (0, −2) px. Every voxel edge then lands on whole pixels, which matches classic 2:1 isometric pixel art exactly. Nothing shimmers and nothing flickers.
   - A 4×4×8-voxel chibi becomes a 16×24 px sprite.
   - 90° turns of a voxel grid are lossless, so all 4 facings come out exact.
4. **The sprite baker can be a pure-TypeScript software voxel rasteriser running in Node.**
   - No GPU, bit-identical PNGs, so headless-browser and SwiftShader problems never come up ([Chromium](https://chromium.googlesource.com/chromium/src/+/798e59c5275d4131797e8ea2e96e6c6000256b58/docs/gpu/swiftshader.md)).
   - Opinion: it is small, deterministic and fully "from scratch".
5. **Light on palette ramps, not in RGB (opinion).**
   - Top, left and right faces get fixed ramp steps, and AO subtracts a step.
   - Add a 1-px selective outline.
   - Render palette indices, then resolve them through a lookup table (LUT). Output is always on-palette and shares one palette file with the 2D generators.
6. **Real-time pixel-art voxels later.** The recipe is:
   - a low-res render target with integer upscaling done by us, because CSS `pixelated` smooths non-integer remainders ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/image-rendering));
   - the camera snapped to the texel grid, with the sub-pixel error shifted back for smooth motion ([Holland](https://www.davidhol.land/articles/3d-pixel-art-rendering/));
   - only fixed 90° yaw steps, integer zoom, nearest filtering and palette resolve.
   - **Caveat:** pixel stability holds only for orthographic cameras. A free perspective flight camera (Light-No-Fire-like) will crawl, as in A Short Hike.
7. **LLMs should author voxel *programs*, not arrays.**
   - Use voxel-musou's `sculpt()` pattern: boxes plus per-voxel colour functions → grid → mesh or sprite.
   - Precedents: MC-Bench (LLM-written build code) and SceneCraft (render → critique → fix loop).
   - Add structural, readability and determinism validators.
8. **Runtime question, re-weighed (opinion).** For pixel-art voxels, **our own runtime wins**:
   - the baker needs no GPU at all;
   - a real-time orthographic voxel pass reuses the 2D runtime's framebuffer, upscale and palette code;
   - it is perhaps 1.5–3k lines.
   - Three.js only becomes compelling for the later free-camera planet game, and an engine-neutral core keeps that choice open.
9. **Later voxel game (unchanged analysis).**
   - A small real sphere, R ≈ 2–5 km.
   - A cube-sphere heightfield with a quadtree LOD per face.
   - No blocky depth shells. Surface nets only for caves later.
   - Integer-hash determinism and stored player deltas only.
10. **Platforms.**
    - WebGL2 is the baseline.
    - There is no SharedArrayBuffer in Capacitor, so worker results move by transfer.
    - iOS has a `flat`-attribute context-loss bug ([WebKit](https://bugs.webkit.org/show_bug.cgi?id=289601)).
    - Baked sprites port to Godot 2D trivially. The voxel game ports only via baked meshes or rewritten generators.
11. **Studio.**
    - Contact sheets at 1×, 2× and 4×, rendered by the shipping renderer so they are pixel-exact.
    - A deterministic `__shot()`, numerical validators, and verdicts keyed by generator hash.
12. **First experiment (proposal), inside the sim work.**
    - About 6 props and 1 chibi archetype × 3 seeds, written as voxel programs, baked to an atlas and shown next to 2D-generated sprites.
    - It proves style match, determinism, readability at 16–24 px, part-based 2–4-frame animation, and authoring speed.

---

## 1. Scope, priorities and framing

### 1.1 Game types and order

- **(a) Kairosoft-style 2D pixel-art management sims. Start here.**
  - Voxels enter only as the *source* for some sprites: props, furniture, buildings, maybe characters.
- **(b) Voxel games, later.**
  - The owner's model is **Light No Fire**: announced at The Game Awards 2023, in development since 2018, "an ambitious open world the size of planet Earth" with "real oceans to traverse", no release date as of August 2026 ([Wikipedia](https://en.wikipedia.org/wiki/Light_No_Fire), [PC Gamer](https://pcgamer.com/games/survival-crafting/light-no-fire-guide)).
  - The Vellum guardrails are: one real-sphere fantasy planet with visible curvature; biomes, villages, fortresses and mounts including flying ones; everything from a static seed; no external assets (graphics are code); Three.js; and a loose plan.
- **Across both: voxels are rendered as pixel art.**

### 1.2 Three meanings of "voxel" (keep them separate)

| Layer | Meaning | Examples |
|---|---|---|
| **Data** | World stored or generated as occupancy or density on a 3D grid | NMS: "voxel-based world generation → polygonization → texturing → population" ([GDC 2017](https://www.gdcvault.com/play/1024265/Continuous-World-Generation-in-No)); smooth look |
| **Look** | You can see the cubes | Crossy Road, Cube World, 3D Dot Game Heroes, voxel-musou |
| **Authoring** | Assets are grids built by programs or editors | MagicaVoxel, Teardown ([modding](https://teardowngame.com/modding/)), voxel-musou `sculpt()` |

For the sims, only **authoring** matters, and the "look" is fully pixel art. Opinion: that is the cheapest way to get value from voxels right now.

### 1.3 The owner's reference repos (others analyse them in depth; voxel-relevant points only)

- **01 [sakura-crossing](https://github.com/Kenton-GMI/sakura-crossing)**
  - A flat-authored world bent onto an R = 160 m sphere via an equirectangular `bakeToPlanet()` (`src/world/planet.js`).
  - Ink lines come from the screen-space second difference of depth.
  - Its CLAUDE.md (about 1,600 lines of lessons) records that **flood fill was the only test that found** blocked paths and leaking lakes.
  - (inference) The CLAUDE.md suggests it was built with Claude Code.
- **02 [threejs-conference](https://github.com/ektogamat/threejs-conference)**
  - WebGPU/TSL post and compute techniques only. Not asset-free.
  - Little relevance to pixel-art voxels.
- **03 [voxel-musou](https://github.com/mike007jd/voxel-musou)** (Three.js r186, deterministic 60 Hz simulation)
  - `src/core/voxel.js` (146 lines) holds `boxesGeometry` and `sculpt()`: boxes and per-voxel colour functions → Int32 grid → hash shade jitter → exposed faces only, vertex colours, a `flip` option for AO diagonals.
  - Characters use fine voxels (1.25 cm), parts centred on joints, flat `Float32Array` poses and 2-bone IK (`src/hero/rig.js`).
  - Crowds use instanced parts with 3 LODs, where mid detail is re-voxelised at 2× size.
  - About 2,000 instanced debris cubes.
  - Terrain is a smooth heightfield plus "2 m voxel rock columns … stepped in 1 m courses".
  - Post-processing does "2 px ordered dither + palette quantisation (retro)".
- **04 NMS / Light No Fire procgen** ([NoMansTerrain](https://github.com/gistya/NoMansTerrain) field reference)
  - Terrain is **data**: `VoxelGeneratorSettings` holds 8 "uber noise" layers with `SeedOffset` and region masks, in 31 presets, read by engine code.
  - The uber noise comes from [de Carpentier's Scape extensions](https://www.decarpentier.nl/scape-procedural-extensions).

---

## 2. Styles and references

### 2.1 Chunky vs micro voxels

**Crossy Road**
- Facts: art made in **Qubicle** by Ben Weatherall. Voxels "look better at an angle", and the team wanted "really obvious hit boxes and sharp edges" ([PocketGamer.biz](https://www.pocketgamer.biz/making-of-crossy-road/)).
- Opinion: the chunky, toy-like benchmark for "cozy and readable".

**3D Dot Game Heroes**
- Facts: voxels "to emulate the 2D graphics of earlier video games", plus a sprite editor ([Wikipedia](https://en.wikipedia.org/wiki/3D_Dot_Game_Heroes)).
- Opinion: the closest precedent for **voxels as 3D pixel art**.

**Fez**
- Facts: "trixels", 2D pixel tiles turned into cubes ([Wikipedia](https://en.wikipedia.org/wiki/Fez_(video_game))).
- Opinion: the pixel-art identity survives in 3D.

**Voxel Tycoon**
- Facts: a voxel logistics/tycoon game with procedural biomes, in Early Access since 2021 ([Steam](https://store.steampowered.com/app/732050/Voxel_Tycoon/)).
- Opinion: the clearest voxel precedent in the management genre.

**Townscaper**
- Facts:
  - occupancy on an irregular relaxed grid;
  - meshed from **corner modules** chosen by neighbour configuration;
  - WFC-style solving with 300+ modules.
  - Sources: [Game Developer](https://www.gamedeveloper.com/game-platforms/how-townscaper-works-a-story-four-games-in-the-making), [BorisTheBrave](https://boristhebrave.com/docs/sylves/1/articles/tutorials/townscaper.html).
- Opinion: how voxel occupancy can read cozy instead of cubic. Good for sim buildings and villages.

**Cube World**
- Facts: a voxel RPG ([Wikipedia](https://en.wikipedia.org/wiki/Cube_World)). Characters have floating hands and feet (unverified).
- Opinion: rigid floating parts are cheap to animate.

**Teardown (micro-voxels)**
- Facts:
  - one 3D volume per object, 1 byte per voxel, a 256-entry palette;
  - ray-marched per object;
  - sources: [acko.net](https://acko.net/blog/teardown-frame-teardown/), [voxagon](https://blog.voxagon.se/2020/12/03/spraycan.html).
- Opinion: the opposite of pixel art, and wrong for browsers and phones.

**MagicaVoxel diorama style**
- Facts: models up to 256³ ([spec](https://github.com/ephtracy/voxel-model/blob/master/MagicaVoxel-file-format-vox.txt)).
- Opinion: flat palette colours and soft AO. Its smooth-shaded renders are *not* pixel art.

**Cloudpunk**
- Facts: a voxel city made by about 10 artists ([Wikipedia](https://en.wikipedia.org/wiki/Cloudpunk)).
- Opinion: a scale reference for hand-made voxel worlds.

### 2.2 Pixel-art feel from 3D

- **A Short Hike:** rendered "with a small texture and then enlarged it with a point filter mode", with flat custom shadows and edge detection. The low resolution let the author "create models much faster" ([Wikipedia](https://en.wikipedia.org/wiki/A_Short_Hike)). It uses a **perspective** camera, so some pixel crawl is accepted.
- **t3ssel8r-style 3D pixel art,** per [David Holland's write-up](https://www.davidhol.land/articles/3d-pixel-art-rendering/) (Godot 4.3, custom build):
  - "snap the camera to a view-aligned, texel-sized grid. This removes pixel creep, but movement is no longer smooth";
  - the output is then "shift[ed] back in screen space by the snap error, regaining smooth movement";
  - outlines use depth and normal textures with "just the up, down, left, and right texels";
  - toon lighting;
  - tested at 640×360.
- **voxel-musou post:** a 2-px ordered dither plus palette quantisation.

### 2.3 What reads as cozy and Kairosoft-like (opinion)

- **Chunky, few voxels.** Characters about 8–12 voxels tall at sim scale, props 4–16.
- **A limited, warm, saturated palette.** About 32–64 colours as ramps with hue-shifted shadows. No smooth gradients.
- **A fixed 2:1 isometric (dimetric) view, as in classic pixel-art rooms.** Kairosoft's room views are of this family (from observation, unverified).
- **Corners and transitions matter.** Awnings, roof overhangs, rounded silhouettes, Townscaper-style corner modules.
- **Constant small motion.** Bobbing, 2–4-frame walk cycles, smoke, sparkles, number pop-ups.
- **Kairosoft's real signature is information density and pop-ups**, and that works over any art source.

---

## 3. Voxels → pixel art (priority section)

### 3.1 Precedents (facts)

- **Tiberian Sun / Red Alert 2 VXL:**
  - each voxel stores a colour index plus a **normal index** used for lighting;
  - units were "rendered only on demand, then cached" (up to "32,768 possible facings");
  - HVA files hold rigid-part transforms for turrets and barrels; maximum 255³;
  - the game world itself was 2D isometric ([ModEnc](https://modenc.renegadeprojects.com/VXL), [Wikipedia](https://en.wikipedia.org/wiki/Voxel)).
- **Build engine KVX:** "I designed the KVX format for use with Shadow Warrior and Blood". SLAB6 edits KVX and VOX ([advsys.net](http://advsys.net/ken/download.htm)).
- **SpriteStack:** a slice-by-slice voxel editor for 2D artists that exports spritesheets, `.vox` and normal maps ([spritestack.io](https://spritestack.io/)).
- **Dead Cells:**
  - low-res 3D renders without anti-aliasing, exported as PNG plus normal maps;
  - pose and timing edits became cheap and parts reusable;
  - but "pixel flicker" needed manual cleanup ([Game Developer](https://www.gamedeveloper.com/production/art-design-deep-dive-using-a-3d-pipeline-for-2d-animation-in-i-dead-cells-i-)).
- **RollerCoaster Tycoon:** isometric art made with "several 3D modeling, rendering, and paint programs" ([Wikipedia](https://en.wikipedia.org/wiki/RollerCoaster_Tycoon_(video_game))).

Opinion: Dead Cells' flicker comes from rasterising arbitrary meshes at arbitrary angles. Voxels with an **integer** projection (next section) don't have that problem by construction.

### 3.2 Pixel-exact projection (my derivation)

**Dimetric 2:1, the classic isometric pixel-art grid.** Use a custom orthographic matrix, not a physically "true" camera:

```
screen.x = 2·(x − z)
screen.y = (x + z) − 2·y        // y = up; screen y grows downward
depth    = x + z + y             // (or painter's order by (x+z), then y)
```

- Every lattice point lands on an integer pixel. One voxel's top face is a 4×2 px diamond, and each side face is a 2×2 px parallelogram. That is the standard pixel-art isometric cube.
  - A physically true 30°-pitch camera would give 2.45 px of height per voxel. H = 2 is the usual pixel-art convention.
- Sprite bounding size for a model of nx × nz footprint and h tall: **width = 2·(nx+nz)**, **height = (nx+nz) + 2·h**.

| Model (nx × nz × h voxels) | Sprite size | Use |
|---|---|---|
| 4 × 4 × 8 | 16 × 24 px | Kairosoft-size chibi |
| 5 × 4 × 10 | 18 × 29 px | Slightly taller character |
| 8 × 8 × 16 | 32 × 48 px | Large character, vending machine |
| 8 × 8 floor tile | 32 × 16 px diamond | Common iso tile size |
| 16 × 16 × 16 | 64 × 64 px | Building block or large furniture |

**Facings.**
- Rotating a voxel grid by 90° is a **lossless permutation**, so 4 facings come out exact.
- Mirroring (2 baked facings plus a flip) halves the atlas but flips asymmetric details.
- 45° facings would need resampling. Avoid them.

**Front-facing ¾ ("RPG") alternative.** Map x → (1, 0), y → (0, −1), z → (0, −1).
- One voxel equals one pixel on front faces, which makes the model literally a "3D pixel sprite" (3D Dot Game Heroes).
- Useful for portraits, UI icons and front-facing scenes.

Opinion: at 16–24 px a character has very few voxels (4×4×8). Voxels pay off most for **props, furniture, buildings and anything shown in several facings or states**. Tiny characters may be just as good, or better, from the 2D pixel generators. The experiment in §11 should settle this.

### 3.3 The sprite baker: a software voxel rasteriser (opinion)

- **What it is:** pure TypeScript, run in Node by the generator session. Input is a palette-indexed grid or parts plus a pose. Output is indexed pixels.
- **How it draws:**
  - for each visible voxel face, stamp its fixed pixel footprint (4×2 diamond, 2×2 parallelograms) into a buffer that holds a depth value and a palette index per pixel;
  - use a z-buffer or painter's order.
  - This is the same family as TS/RA2's and Build's software voxel renderers.
- **Why software and not WebGL:**
  - bit-identical output on any machine;
  - no GPU or browser in CI;
  - trivial to unit-test (a hash of the output);
  - nothing to configure.
- **Outputs:**
  - an atlas PNG, which needs a PNG encoder (e.g. Node's zlib plus our own chunk writer);
  - JSON with frames, anchor (foot) point, footprint in tiles, depth-sort key and facing;
  - optionally a per-pixel **normal or face-ID map**, as TS/RA2 and Dead Cells do, for later runtime relighting.
- **Effort (opinion):** a few hundred to about 1,000 lines including the PNG writer. It is the smallest and most "from scratch" piece in this whole document.

### 3.4 Lighting, AO, outlines and palette (opinion)

- **Shading by palette ramps, not RGB.** Each material is a named ramp, such as `wood.0..4`.
  - Top face = base + 1, left = base, right = base − 1 (the classic three-tone isometric cube).
- **AO as a ramp step.** Compute the 0fps per-vertex AO (`side1 && side2 ? 0 : 3 − (side1+side2+corner)`, [0fps](https://0fps.net/2013/07/03/ambient-occlusion-for-minecraft-like-worlds/)) per face corner. Apply it as −1 ramp step on occluded pixels or edges, or as a fixed ordered-dither pattern. Never apply it as a gradient.
- **Outlines.**
  - 1-px *selective outline*: the silhouette uses the darkest step of the adjacent ramp, and inner edges where depth jumps get an outline.
  - Computed in sprite space from the depth and ID buffer, like Holland's 4-neighbour kernel.
- **Palette-index rendering.** The baker writes indices, never RGB. PNGs can be indexed or expanded later.
  - Palette swaps (seasons, night, team colours, damaged or new states) then need no rebake.
  - Output is guaranteed on-palette. This beats nearest-colour quantisation, which can pick odd colours.
- **One shared palette file** feeds the 2D pixel generators, the voxel baker and the later real-time renderer.
  - Starting points: the voxel-model repo ships PICO-8 and Voxatron palettes (CC-0).
  - `.vox` exports get their `RGBA` chunk from this palette.

### 3.5 Animation for baked sprites (opinion)

- Kairosoft-like animation is **2–4 frames** at low fps, so sources only need a few poses.
- **Part offsets first.** Bob the body by 1 voxel and swap leg offsets. This needs no rotation, keeps the projection exact, and stays crisp.
- **Small rotations** (an arm swinging ±20–30°): **re-voxelise** the rotated part with nearest-neighbour sampling before projecting. That avoids sub-pixel smearing, but expect "rotsprite-like" artefacts, so review them in contact sheets.
- **Per-frame voxel models:** `.vox` supports this via `_f` keys. The voxel-model repo ships walk cycles as 4–8 models per file (`horse.vox`, `deer.vox`, `T-Rex.vox`). Use this for special frames such as blinks, squash, sitting or working.
- **Mirroring** gives the other two facings when the asymmetry is acceptable.

### 3.6 Real-time pixel-art voxels (the "next" step)

When a sim or the later voxel game wants live voxels (rotating rooms, destructible props, building placement previews, the voxel game itself):

1. **A low-res render target** (e.g. 320×180 or 480×270) with nearest filtering everywhere. No MSAA, no TAA, no mipmaps.
2. **Integer upscale done by us.** Size the canvas in *device* pixels (`cssSize × devicePixelRatio`) and choose the largest integer scale.
   - Fill leftover screen space by enlarging the low-res target, not with fractional scaling.
   - Fact: CSS `image-rendering: pixelated` scales by nearest neighbour only to "the nearest integer multiple … then uses smooth interpolation" for the remainder ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/image-rendering)), so it is not a complete answer on its own.
3. **The integer axonometric matrix from §3.2** as the camera projection. Static voxel geometry then lands on exact pixels.
4. **Camera snapped to the texel grid,** with the sub-pixel snap error shifted back during the upscale pass so motion stays smooth ([Holland](https://www.davidhol.land/articles/3d-pixel-art-rendering/)).
5. **Actors snapped to whole low-res pixels** (or to the voxel lattice). Moving parts with free rotation will crawl, so prefer offsets and re-voxelised poses as in §3.5.
6. **Rotation only in 90° yaw steps**, with an instant swap or a quick fade. **Zoom only in integer steps.**
7. **A palette resolve pass.**
   - Render ramp ID plus ramp step (and AO and face tone) into the target, then resolve through a palette LUT texture.
   - Same rules as the baker, so live and baked assets match pixel for pixel. That is a testable property.
8. **Dither anchored to the world or texel grid**, not to the screen, so it doesn't "swim" when the camera moves (opinion; untested).
9. **Outline pass** on the low-res depth and ID buffers, 1 low-res pixel wide.

**Caveat (honest).** These tricks give *pixel-stable* output only with **orthographic, fixed-angle** cameras. A Light-No-Fire-style perspective flight camera can at best look like A Short Hike: low-res, point-filtered, with accepted crawl. Options for the later voxel game:
- (i) ortho/iso for ground gameplay, plus a separate perspective flight mode with an accepted crawl;
- (ii) ortho even in flight, where zooming out reveals the planet's curved limb as pixel art;
- (iii) perspective throughout with the A Short Hike look.

This is an owner question (below).

### 3.7 Approaches compared in the pixel-art light (ratings are opinion)

| Criterion | (a) Real-time voxel meshes, perspective | (b) **Pre-rendered voxel → pixel sprites** | (c) **Real-time low-res ortho voxel pass + 2D UI and FX** |
|---|---|---|---|
| Pixel-art fidelity | Low to medium (crawl, AA issues) | **Highest** (exact, hand-tunable) | **High** (exact with the §3.6 rules) |
| Performance on mobile webviews | Medium (geometry and LOD) | **Excellent** (atlas blits) | Very good (low fill-rate) |
| Effort from scratch | High | **Low** | Medium-low (reuses the 2D runtime) |
| Studio preview | Orbit viewer | Contact sheets | Contact sheets plus a live view |
| LLM authorability | High | High | High |
| "Games are data" | Assets yes, world generation is code | **Fully** | Mostly (meshing is engine code) |
| Godot portability | Meshes via glTF; generators need porting | **Trivial (Godot 2D)** | Port one small shader plus mesher, or pre-bake |
| Best for | Later planet flight | **Sims now** | Sims with live 3D bits; a fixed-camera voxel game |

---

## 4. Formats and LLM authoring

### 4.1 MagicaVoxel `.vox` (summary)

Sources: [spec](https://github.com/ephtracy/voxel-model/blob/master/MagicaVoxel-file-format-vox.txt), [extension](https://github.com/ephtracy/voxel-model/blob/master/MagicaVoxel-file-format-vox-extension.txt), [Kaitai](https://formats.kaitai.io/magicavoxel_vox/), [Bourke](https://paulbourke.net/dataformats/vox/).

- **Header and chunks:**
  - The header is `"VOX "` plus a version: 150 in the spec and in all 5 sample files checked; a version 200 is unverified.
  - Each chunk is `id | contentSize | childrenSize | content | children`, under `MAIN`.
- **Models:**
  - `SIZE` gives x, y, z, where z is the "gravity direction", so **Z-up**.
  - `XYZI` stores count plus (x, y, z, colorIndex) **1 byte each**, which gives the 256³ limit.
- **Palette:** `RGBA` holds 256 entries with the off-by-one quirk `palette[i+1] = ReadRGBA()`, and index 0 means empty.
- **Scene graph:** `nTRN`/`nGRP`/`nSHP`, where `_r` is a packed rotation, `_t` a translation and `_f` a frame index (animation).
- **Other chunks:** `MATL`, `LAYR`, `rOBJ`, `rCAM`, `NOTE` (palette names), `IMAP` (palette order).

### 4.2 Source of truth (opinion)

- **The program is the source of truth.** For example `props/office/desk.ts` exports `build(params, seed) → VoxelModel` (palette-indexed parts with pivots).
- **Generated outputs:**
  - our own grid format: dims, palette reference, RLE indices, parts and pivots, generator hash;
  - sprite atlas plus JSON from the baker (§3.3);
  - optional `.vox` to inspect in MagicaVoxel, [vengi](https://github.com/vengi-voxel/vengi) (MIT; converts 20+ formats; headless Lua scripting, [API](https://vengi-voxel.github.io/vengi/LUAScript/)), three.js [VOXLoader](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/loaders/VOXLoader.js) or the [Godot importer](https://godotengine.org/asset-library/asset/1587);
  - optional `.glb` later, for 3D ports.
- **Why `.vox` isn't the source:** it is binary, capped at 256³, has the palette quirk, and stores no parameters.

### 4.3 Builder vocabulary (voxel-musou pattern plus additions; opinion)

**The voxel-musou base**
- `sculpt(boxes)`: each box is `{a, b, c: index | carve | fn(x,y,z,…)→index|null, paint?}`.
- Boxes are applied in order: later boxes overwrite, carve or repaint.
- Per-voxel functions give rounded cross-sections, e.g. `|x|+|z| < w`.

**Additions**
- **SDF primitives:** round box, capsule, ellipsoid, cone, smooth union ([Quilez](https://iquilezles.org/articles/distfunctions/); the fetch failed, so the contents are from memory).
- **Shape operators:** `mirrorX`, `lathe`, `extrude`, `hollow`, `outline`.
- **Ramp-aware painting:** `paint(region, 'wood', step)`.
- **Hash-based jitter**, limited to the same ramp.
- **For sims:** footprint helpers aligned to tile size (e.g. 8×8 voxels per tile) and anchor or foot points.

### 4.4 Why programs, not arrays

**Evidence**
- **MC-Bench:** containerised Minecraft servers run LLM-written build functions ([orchestrator](https://github.com/mc-bench/orchestrator)). The judging method and rankings are unverified.
- **SceneCraft:** the LLM writes Blender Python, a vision-language model critiques the renders, and a "library learning mechanism compiles common script functions into a reusable library" ([arXiv](https://arxiv.org/abs/2403.01248)).
- **3D-GPT** emits procedural parameters ([arXiv](https://arxiv.org/abs/2310.12945)).
- **BlenderLLM** found earlier models weak at CAD scripts ([arXiv](https://arxiv.org/abs/2412.14203)). This predates current models.
- **LLaMA-Mesh** emits OBJ text, which works only at small scale ([arXiv](https://arxiv.org/abs/2411.09595)).

**Opinion: the Claude loop**
- Write or modify the builder, bake the sprites, and render a contact sheet at 1× and 4×.
- Claude reads the image, fixes the program, and promotes helpers into the shared library.

### 4.5 Validation (opinion)

- **Structural:** within bounds and voxel budget; indices map to existing ramps; connected unless parts are intentionally separate; pivots inside parts; mirror-diff for symmetric archetypes.
- **Pixel readability at 1×:**
  - silhouette area and head/body separation;
  - contrast between adjacent ramps;
  - no single-pixel "orphans" on the outline;
  - the sprite fits its tile footprint and height budget.
- **Determinism:** hash every baked atlas. CI fails if a hash changes without a generator or palette change.
- **World (sims and later the planet):** reachability and flood fill for room layouts and paths. The sakura-crossing lesson is that broken connectivity doesn't show up in screenshots.

---

## 5. Characters, creatures, mounts and FX

**Builder and rig (voxel-musou facts)**
- Parts are authored centred on their joint, in fine-voxel units.
- Poses are flat `Float32Array`s blended by lerp, with analytic 2-bone IK.
- Crowds use instanced parts with re-voxelised LODs (§1.3).
- For sim sprites, the same rig drives the baker's few poses (§3.5).

**Archetypes plus seed parameters**
- **Spore** authored motion once in a generalised form relative to body parts, then retargeted it to arbitrary morphologies with IK at runtime ([Hecker et al. 2008](https://www.chrishecker.com/Real-time_Motion_Retargeting_to_Highly_Varied_User-Created_Morphologies)).
- **NMS creatures:** reported part-set recombination (unverified).
- **Opinion: the pipeline:**
  1. an archetype as data (skeleton template plus parameter ranges);
  2. seed → parameter values via hash;
  3. part builders (code);
  4. procedural gait per archetype;
  5. validation across N seeds.
  - At sim scale this yields varied customers, staff and pets from a few archetypes.

**Animation styles**
- Rigid part rigs are the default ([Blockbench](https://www.blockbench.net/) shows box-bone rigs with glTF export are mainstream).
- Per-frame voxel models for special frames.
- [Rosen, GDC 2014](https://www.gdcvault.com/play/1020583/Animation-Bootcamp-An-Indie-Approach): "very few key frames" plus procedural layers.
- [FABRIK](http://www.andreasaristidou.com/FABRIK.html) for longer chains (fetch failed).

**For the later voxel game (opinion)**
- Quadruped mounts: a gait phase table, foot raycasts along the local "up", 2-bone IK, body fitted to the foot plane, a spring-damped spine.
- Flying mounts: 2–3 rigid wing segments on a sine whose phase and amplitude depend on climb rate, banking from turn rate, and a spring tail.
- On a sphere, everything runs in the local tangent frame, as in sakura-crossing's `basisAt()`.

**FX**
- voxel-musou pools about 2,000 instanced cubes for debris, dust and embers in the victim's palette.
- Teardown debris inherits the parent palette ([voxagon](https://blog.voxagon.se/2020/12/03/spraycan.html)).
- For sims (opinion): bake small voxel FX (sparkles, smoke puffs, coins) to sprite frames as well, or draw them as 2D pixel particles. Real-time cube FX belong to the §3.6 stage.

---

## 6. Later: planet-scale voxel tech (voxel game)

This is kept from v2, condensed. It matters once the voxel game starts.

### 6.1 Scale, curvature and precision (my derivation)

The horizon is at `d = √(2Rh + h²)` and dips below level by `acos(R/(R+h))`.

| Radius R | Horizon @1.7 m | Horizon @50 m | Horizon @300 m | Horizon @1 km | Dip @300 m | Surface area |
|---|---|---|---|---|---|---|
| 160 m (sakura-crossing) | 23 m | 136 m | 431 m | 1.1 km | 70° | 0.3 km² |
| 1 km | 58 m | 320 m | 831 m | 1.7 km | 40° | 12.6 km² |
| 2 km | 82 m | 450 m | 1.1 km | 2.2 km | 30° | 50 km² |
| 4 km | 117 m | 634 m | 1.6 km | 3.0 km | 22° | 201 km² |
| 8 km | 165 m | 896 m | 2.2 km | 4.1 km | 16° | 804 km² |
| Earth | 4.7 km | 25 km | 62 km | 113 km | 0.6° | 510 M km² |

- Opinion: **R ≈ 2–5 km** looks clearly round from a mount, and the planet itself caps draw distance.
- The float32 step at 8 km is about 0.5 mm, so **no floating origin** is needed.
- three.js composes model-view matrices on the CPU in double precision ([WebGLRenderer.js](https://raw.githubusercontent.com/mrdoob/three.js/dev/src/renderers/WebGLRenderer.js)).
- A logarithmic depth buffer disables early-Z, with one report showing about 65 → 35 fps ([forum](https://discourse.threejs.org/t/beware-of-logarithmic-depth-buffer-it-can-degrade-scene-performance/88495)). r186's `reversedDepthBuffer` needs `EXT_clip_control`; iOS support is unverified.
- With an **orthographic pixel-art camera** (§3.6, option ii), depth range is a non-issue.

### 6.2 Mapping a world onto a sphere

**A. Fake bend in the vertex shader**
- Reads as: a toy-like "rolling log".
- Effort: very low.
- Verdict (opinion): not a real sphere; fails the brief.

**B. Author flat, bake onto the sphere** (sakura-crossing)
- Reads as: a real sphere, distortion-free along the equator.
- Effort: low to medium.
- Verdict (opinion): a one-time bake doesn't fit a streamed world. Rigs and long edges need care.

**C. Cube-sphere heightfield**
- Reads as: clean everywhere.
- Effort: medium.
- Verdict (opinion): **v1 choice.** No caves. Use a warped mapping ([Nowell](http://mathproofs.blogspot.com/2005/07/mapping-cube-to-sphere.html), [Catlike](https://catlikecoding.com/unity/tutorials/procedural-meshes/cube-sphere/), [Lambers](https://marlam.de/publications/cubemaps/lambers2020cubemaps.pdf)).

**D. Blocky voxels in depth shells**
- Reads as: Minecraft on a globe.
- Effort: high.
- Facts: [Blocky Planet](https://www.bowerbyte.com/posts/blocky-planet/) uses six sectors, shells with 4× more blocks per deeper layer, and neighbour lookup that is "the hardest part".
- Verdict (opinion): a trap unless digging to the core is a core feature.

**E. Cartesian SDF field + surface nets / marching cubes**
- Reads as: smooth, with caves.
- Effort: high.
- Facts: NMS-like; godot_voxel has a "Planet" `SdfSphere` recipe ([docs](https://voxel-tools.readthedocs.io/en/latest/generators/)); SvenFrankson's [Planet Builder](https://forum.babylonjs.com/t/spherical-voxel-engine-demo-version-2/35294) (MIT, Babylon).
- Verdict (opinion): the upgrade path for caves and edits.

Opinion: a middle ground is **radial voxel columns in a single shell**, which works because relief is small compared with R. Add voxel-stepped cliffs and rocks (as in voxel-musou) and box-built actors, buildings and flora.

### 6.3 Surface extraction and LOD

**Blocky meshing** ([0fps](https://0fps.net/2012/06/30/meshing-in-a-minecraft-game/))
- A solid 8³ cube: naive 3,072 quads, culled 384, greedy 6.
- Rough terrain: culled 2,198 vs greedy 1,670.
- [Binary greedy meshing](https://github.com/cgerikj/binary-greedy-meshing) takes about 74 µs per chunk in C++.

**Smooth meshing** ([0fps part 2](https://0fps.net/2012/07/12/smooth-voxel-terrain-part-2/), 65³)

| Method | Time | Triangles |
|---|---|---|
| Marching cubes | 274.6 ms | 154k |
| Surface nets | 124.3 ms | 73k |

- [Transvoxel](https://transvoxel.org/) closes LOD seams with 512-case transition cells. A 2026 browser build log describes "seam chaos" ([cinevva](https://app.cinevva.com/blog/2026-02-25-open-world-browser-part-09-transvoxel-first-cut)).

**LOD schemes**
- Quadtree per cube face ([SimonDev three.js planet](https://github.com/simondevyoutube/ProceduralTerrain_Part4)).
- [CDLOD](https://github.com/fstrugar/CDLOD): vertex morphing, heightfield only.
- [Geometry clipmaps](https://hhoppe.com/proj/geomclipmap/).
- Skirts ([Ulrich](http://tulrich.com/geekstuff/sig-notes.pdf)): "self-contained" crack fillers.
- godot_voxel's LOD terrain prefers smooth meshers; blocky meshers have less LOD support ([VoxelLodTerrain](https://voxel-tools.readthedocs.io/en/latest/api/VoxelLodTerrain/)).
- Distant Horizons renders "simplified chunks" for Minecraft ([GitLab](https://gitlab.com/distant-horizons-team/distant-horizons)).

Opinion:
- Blocky terrain turns into shimmer at distance; in pixel art that shows up as crawl. Heightfield and smooth meshes simplify gracefully.
- v1: cube-sphere quadtree, skirts, then CDLOD morphing if popping shows, plus horizon culling.

### 6.4 Sky, workers, determinism and deltas

**Sky (facts)**
- O'Neil scattering ([GPU Gems 2](https://developer.nvidia.com/gpugems/GPUGems2/gpugems2_chapter16.html)).
- Hillaire LUTs ([EG](https://diglib.eg.org/handle/10.1111/cgf14050)).
- Bruneton ([demo](https://ebruneton.github.io/precomputed_atmospheric_scattering/)).
- [takram three-geospatial](https://github.com/takram-design-engineering/three-geospatial).
- Opinion: a pixel-art game needs only a banded gradient sky, a limb rim around the planet and banded haze, all in palette ramps.

**Workers (facts)**
- ArrayBuffer transfer is zero-copy ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects)).
- SharedArrayBuffer needs COOP and COEP headers ([Chrome](https://developer.chrome.com/blog/enabling-shared-array-buffer)):
  - Electron can set them ([webRequest](https://www.electronjs.org/docs/latest/api/web-request));
  - Android WebView reportedly can't be cross-origin isolated (secondary: [shen.ai](https://developer.shen.ai/getting-started/web-troubleshooting));
  - Capacitor has no documented way to set them ([Ionic forum](https://forum.ionicframework.com/t/webviewlocalserver-additional-http-response-headers/227445)).
- Reference engines:
  - [noa-engine](https://github.com/fenomas/noa) meshes on the main thread in 6 ms time slices.
  - [Divine Voxel Engine](https://github.com/Divine-Star-Software/DivineVoxelEngine) is worker-based but uses SharedArrayBuffer by default.

**Mobile (facts)**
- WKWebView memory is "not possible to increase" ([Apple](https://developer.apple.com/forums/thread/133449)).
- `flat` attributes on more than 30k vertices lose the WebGL context on iOS 18.3 ([WebKit 289601](https://bugs.webkit.org/show_bug.cgi?id=289601)).

**Determinism (facts)**
- `Math.sin/cos/exp/pow` may differ across engines ([es-discuss](https://esdiscuss.org/topic/es6-accuracy-of-special-functions)); a real V8 11.3 vs 14.9 case is documented in [bounce #8](https://codeberg.org/perplexdotgg/bounce/issues/8).
- Position-hash RNG ([Eiserloh GDC 2017](https://gdcvault.com/play/1024365/Math-for-Game-Programmers-Noise)).

**Determinism rules (opinion)**
- Integer hashes only, a seed cascade (planet → face/quadtree path → chunk → object → part), player deltas only, and generator versioning.
- With one static seed, pre-bake the coarse base world as data (e.g. a 4 m heightfield at R = 4 km is about 25 MB, my estimate).

**Settlements (opinion)**
- Author villages flat on the tangent plane: a 50 m village sags about 0.16 m at R = 2 km, hidden by a plinth.
- Villages: [Townscaper](https://www.gamedeveloper.com/game-platforms/how-townscaper-works-a-story-four-games-in-the-making) and [WFC](https://github.com/mxgmn/WaveFunctionCollapse).
- Fortresses: shape grammars ([Müller 2006](https://dl.acm.org/doi/10.1145/1141911.1141931)).

---

## 7. Runtime question re-weighed: Three.js vs our own

**Facts**
- Three.js r186, released 2026-09-24. The manual says WebGPURenderer "is still in an experimental state", while WebGLRenderer is "the recommended choice for pure WebGL 2 applications" ([manual](https://github.com/mrdoob/three.js/blob/dev/manual/pages/webgpurenderer.html)).
- Bundle sizes: about 195 KB gzip on the WebGL path, about 310 KB on the WebGPU path.
- Both "graphics = code" references (sakura-crossing, voxel-musou) use Three.js.

**What each stage actually needs (opinion)**

**Sims now**
- Rendering: a 2D sprite batcher, a low-res framebuffer with integer upscale, a palette LUT, plus a **software baker** for voxel sprites.
- Three.js adds: nothing of value; the baker needs no GPU.
- Own runtime: small; it is the planned 2D runtime.
- **Opinion: own runtime.**

**Next: live ortho voxel pass (§3.6)**
- Rendering: culled voxel meshes, one shader (palette index + face tone + AO), instanced parts, a low-res FBO with depth and ID, an outline and palette-resolve pass, ortho matrices and ID-buffer picking.
- Three.js adds: scene graph and loaders we don't need. Its post chain fights our integer and palette rules.
- Own runtime: about 1.5–3k lines, reusing the FBO, upscale and LUT code from the 2D runtime.
- **Opinion: own runtime.**

**Later: perspective planet flight**
- Rendering: LOD streaming, atmosphere, shadows, possibly WebGPU, and a larger shader set.
- Three.js adds: real time saved (shadows, WebGPU fallback, post, a huge corpus LLMs know well).
- Own runtime: a second project.
- **Opinion: decide then. A Three.js adapter is reasonable, or extend our own if the game stays orthographic.**

**Re-weighed opinion**
- With pixel art as the priority, the original "own small runtime written from scratch" agreement **fits better than the Vellum "Three.js" note** for everything in the next stages.
  - A low-res, ortho, palette-indexed voxel renderer has no PBR, no shadow maps (use baked AO and drop-shadow blobs), no anti-aliasing and no asset loaders. Three.js's main value is in exactly what we don't use.
  - The pixel rules (integer projection, texel snapping, palette resolve, ID outlines) are easier to guarantee in ~2k lines we own than to enforce through someone else's pipeline.
- **Keep the core engine-neutral either way.** Seed cascade, builders, meshing into typed arrays, pose arrays and simulation never touch renderer types; voxel-musou already keeps its views "render-only".
  - Then the later planet game can still add a Three.js (or WebGPU) adapter, or grow our own renderer, without rewriting content.
  - The studio uses **the shipping renderer** for previews, so what the owner judges is what ships.
- **Godot later:**
  - Baked sprites and data port trivially to Godot 2D.
  - A live ortho voxel pass ports as one small shader plus a mesher, or as pre-baked meshes.
  - For the planet game, generators must be rewritten, or run through the experimental [GodotJS](https://github.com/godotjs/GodotJS) ("still under testing").
  - [godot_voxel](https://github.com/Zylann/godot_voxel) (MIT, v1.7 module/GDExtension, [classes](https://voxel-tools.readthedocs.io/en/latest/api/all_classes/)) fits a smooth SDF planet, not a blocky curved one.
  - Consoles via [W4](https://www.w4games.com/w4consoles); support for custom modules is unverified.
- **"Games are pure data":**
  - It holds fully for sims with baked voxel sprites.
  - For the planet game, `world = f(seed, position)` is code. Keep it with the NMS split (generator library = engine, settings/archetypes/palettes = data), or bake the static seed's coarse world as data.

---

## 8. Studio: previewing voxel assets, sprites and seeds

**Facts behind the design**
- Browsers limit active WebGL contexts (the three.js manual says "typically … around 8"); the recommended pattern is one canvas with scissor viewports ([three.js](https://threejs.org/manual/en/multiple-scenes.html)).
- Headless Chrome needs `--enable-unsafe-swiftshader` for software WebGL ([Chromium](https://chromium.googlesource.com/chromium/src/+/798e59c5275d4131797e8ea2e96e6c6000256b58/docs/gpu/swiftshader.md), [intent](https://groups.google.com/a/chromium.org/g/blink-dev/c/yhFguWS_3pM/m/oLrB5up_BwAJ)). The software baker sidesteps this entirely.

**Proposed views (opinion)**

1. **Sprite contact sheet:** per asset or archetype, N seeds × 4 facings × animation frames, shown at **1×, 2× and 4× integer zoom** on a neutral checker and on a real floor tile. Each sheet has a manifest JSON (asset, seeds, parameters, generator hash, palette hash).
2. **In-context preview:** baked sprites placed in a sample sim room next to 2D-generated sprites, for the style-consistency verdict.
3. **Voxel inspector:** a slice view (layer by layer, like SpriteStack), part pivots, voxel count, and ramp-ID false colour. A free-orbit 3D view is a dev aid and can stay simple.
4. **Animation strip:** frames side by side plus a looping preview at game fps.
5. **`__shot({asset|scene|seed, view, zoom, frame})` → PNG.** Deterministic (fixed time, no jitter). The studio calls it, and so does Claude Code through the browser tools available in this environment.
6. **Validators panel:** the §4.5 results. Later, for the planet: water %, walkable %, largest connected walkable region, settlement reachability.
7. **Verdicts** go to the repo, keyed by `(asset, seed, parameters hash, generator hash, palette hash)` with ok / reject / favourite plus a note. They are marked "stale" when the generator or palette changes.

---

## 9. Multiplatform

**Electron**
- Facts: v44 (Chromium M152), v45 due 2026-10-20 ([schedule](https://releases.electronjs.org/schedule)). WebGPU on Windows, macOS and ChromeOS since M113; Linux depends on the GPU ([status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)).
- Implication: safest desktop target.

**Tauri**
- Facts: system webviews. On Linux (WebKitGTK), DMABUF problems on NVIDIA, and WebGL2 may silently fall back to a software rasteriser ([Tauri](https://v2.tauri.app/develop/debug/linux-graphics/)).
- Implication: fine for 2D sims with baked sprites. Risky for live 3D on Linux.

**Capacitor iOS**
- Facts: WebGPU in Safari 26 ([WebKit](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/), [caniuse](https://caniuse.com/webgpu)), and in WKWebView when on by default ([Apple](https://developer.apple.com/forums/thread/770862)). The memory cap is fixed. There is the `flat`-attribute bug.
- Implication: WebGL2 baseline. Watch atlas memory.

**Capacitor Android**
- Facts: Chrome WebGPU on Android 12+ since M121 ([Chrome](https://developer.chrome.com/blog/new-in-webgpu-121)). WebView support is uncertain ([blink-dev](https://groups.google.com/a/chromium.org/g/blink-dev/c/N3RlLGCOTJ4/m/loneRTlPBwAJ)). No cross-origin isolation.
- Implication: WebGL2 is mandatory, and worker results move by transfer.

**Godot**
- Facts: web export is WebGL2-only, single-threaded by default, with no C# ([docs](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html)). godot_voxel's GDExtension is listed for desktop, iOS and Android.
- Implication: baked sprites port trivially. Native exports beat webviews on mobile.

Opinion: integer pixel scaling on phones needs the canvas sized in device pixels. Choose low-res base sizes that divide common phone resolutions, or let the low-res width float and keep the scale an integer.

---

## Recommendations for Wallhammer Zero

All proposals, in the owner's new priority order.

### Now (2D sims)

1. **Voxels as an authoring medium for pixel-art sprites.**
   - Voxel *programs* (the voxel-musou `sculpt()` pattern plus SDF, symmetry and ramp painting) feed a **pure-TypeScript software baker**.
   - It uses the **integer 2:1 dimetric projection** (§3.2), 4 lossless facings (or 2 plus mirroring), ramp lighting plus AO steps, and 1-px selective outlines.
   - It outputs **palette-index** atlases plus JSON.
2. **One shared palette of named ramps** feeds the 2D pixel generators, the baker and everything later.
3. **Target voxels at props, furniture, buildings and multi-state objects first.** Treat tiny characters as an open comparison against the hand-coded 2D generators.
4. **Studio:** sprite contact sheets at 1×, 2× and 4×, in-context room previews, validators, deterministic hashes, and verdicts keyed by generator and palette hash.

### Next (live pixel-art voxels)

5. **A small, own-runtime orthographic voxel pass** following the §3.6 rules:
   - low-res target with integer upscale;
   - integer axonometric matrix;
   - texel-snapped camera with sub-pixel shift-back;
   - 90° yaw steps and integer zoom;
   - palette-LUT resolve and ID/depth outlines.
   - It shares code with the 2D runtime, and live output should match the baker pixel for pixel.

### Later (voxel game)

6. **Decide the camera first:** ortho pixel-stable vs perspective with accepted crawl (§3.6 caveat). It drives the renderer choice.
7. **Planet:** R ≈ 2–5 km, a cube-sphere heightfield with a quadtree LOD per face, radial voxel columns and voxel cliffs near the camera, surface nets only for caves later, integer-hash determinism, deltas only, and generator versioning.
8. **Renderer:** keep the core engine-neutral. Pick a Three.js adapter only if perspective flight with atmosphere and shadows is chosen. Otherwise grow our own.

### Proposed first experiment: "voxel props for the sim" (inside the 2D sim work)

**Content**
- About 6 office or shop props (desk, PC, plant, shelf, vending machine, sofa) plus 1 chibi archetype × 3 seeds, all written as voxel programs on the shared palette.
- Baked by the software baker to a 2:1 dimetric atlas: 4 facings, a 2–4-frame idle and walk for the chibi, ramp lighting, AO and outlines.
- Shown in a sample sim room next to equivalent 2D-generated sprites, and in studio contact sheets.

**It should prove (pass criteria):**
- **(a) Style match.** The owner can't tell the voxel-baked props from the 2D-generated ones by style (palette, outline weight, pixel density). An owner verdict on the contact sheet.
- **(b) Determinism.** Byte-identical atlases across runs and machines (hash), with no GPU involved.
- **(c) Readability at 1×.** Props stay readable at tile scale. The chibi reads at 16×24 px, or shows that voxels don't help at that size. Either answer is useful.
- **(d) Animation.** Part offsets and re-voxelised small rotations look acceptable at 2–4 frames.
- **(e) Authoring loop.** Claude produces each prop in few iterations, with a contact-sheet review per iteration. Log the iterations and time.
- **(f) Multi-state value.** One prop gets 3 states (e.g. empty, in use, broken) and 4 facings at near-zero extra cost, which shows where voxels beat hand-drawn 2D.
- **(g) Stretch goal.** Render one prop live through a minimal WebGL2 ortho pass and get **pixel-identical** output to the baked sprite. That proves the path to live pixel-art voxels.

A later planet experiment, as in v2: a deterministic seed → small planet with LOD in workers, visible curvature, one seeded creature and flying mount, and a 16-seed contact sheet. It only becomes relevant once the voxel game starts and the camera question is settled.

---

## Open questions for the owner

1. **Which sim assets should be voxel-sourced:** props and buildings only, or characters too? Should both pipelines coexist?
2. **Projection.** Classic 2:1 dimetric (Kairosoft rooms), or also front-facing ¾ for some scenes? Is 1 voxel = 2 px steps the right density?
3. **Facings.** 4 exact facings, or 2 plus mirroring to save atlas space?
4. **Palette.** Size and ramp structure: e.g. 32–64 colours, ramps of 4–6 steps, a hue-shift policy. One palette per game or one studio-wide?
5. **Live voxels in the sims.** Ever needed (rotating rooms, building previews, destruction), or should sims stay purely baked?
6. **Voxel-game camera.** Pixel-stable ortho, perspective with an A-Short-Hike-style crawl for flight, or a mix?
7. **Planet scale.** About 2–5 km radius, and how high mounts fly. Blocky ground vs faceted ground with voxel cliffs, rocks and actors. Caves and player edits?
8. **Renderer for the voxel game.** Is "own runtime first; a Three.js adapter only if perspective flight demands it" acceptable given the Vellum note?
9. **Devices.** Must the voxel game run on phones, and from when?
10. **"Games are pure data" for the voxel type.** Is the "generator library = engine code, content = data" split acceptable?
11. **Godot and consoles.** Still a goal for the voxel type?
12. **One static seed or many.** One fixed planet (like Light No Fire), or a new one per save?
13. **Studio verdicts.** Rate individual assets, archetypes across seeds, or generator versions?

---

## Sources

### Owner's references and Light No Fire / NMS
- https://github.com/Kenton-GMI/sakura-crossing
- https://github.com/ektogamat/threejs-conference
- https://github.com/mike007jd/voxel-musou
- https://github.com/gistya/NoMansTerrain
- https://en.wikipedia.org/wiki/Light_No_Fire
- https://pcgamer.com/games/survival-crafting/light-no-fire-guide
- https://www.gdcvault.com/play/1024265/Continuous-World-Generation-in-No
- https://gdcvault.com/play/1024514/Building-Worlds-Using
- https://www.decarpentier.nl/scape-procedural-extensions

### Styles, pixel art and voxel-to-2D pipelines
- https://www.pocketgamer.biz/making-of-crossy-road/
- https://www.gamedeveloper.com/game-platforms/how-townscaper-works-a-story-four-games-in-the-making
- https://boristhebrave.com/docs/sylves/1/articles/tutorials/townscaper.html
- https://github.com/mxgmn/WaveFunctionCollapse
- https://acko.net/blog/teardown-frame-teardown/
- https://teardowngame.com/modding/
- https://blog.voxagon.se/2020/12/03/spraycan.html
- https://en.wikipedia.org/wiki/Fez_(video_game)
- https://en.wikipedia.org/wiki/3D_Dot_Game_Heroes
- https://store.steampowered.com/app/732050/Voxel_Tycoon/
- https://en.wikipedia.org/wiki/Cloudpunk
- https://en.wikipedia.org/wiki/Cube_World
- https://en.wikipedia.org/wiki/A_Short_Hike
- https://www.davidhol.land/articles/3d-pixel-art-rendering/
- https://developer.mozilla.org/en-US/docs/Web/CSS/image-rendering
- https://www.gamedeveloper.com/production/art-design-deep-dive-using-a-3d-pipeline-for-2d-animation-in-i-dead-cells-i-
- https://en.wikipedia.org/wiki/RollerCoaster_Tycoon_(video_game)
- https://modenc.renegadeprojects.com/VXL
- https://en.wikipedia.org/wiki/Voxel
- http://advsys.net/ken/download.htm
- https://spritestack.io/

### Planet tech, meshing and LOD
- https://acko.net/blog/making-worlds-1-of-spheres-and-cubes/
- http://mathproofs.blogspot.com/2005/07/mapping-cube-to-sphere.html
- https://catlikecoding.com/unity/tutorials/procedural-meshes/cube-sphere/
- https://marlam.de/publications/cubemaps/lambers2020cubemaps.pdf
- https://www.bowerbyte.com/posts/blocky-planet/
- https://forum.babylonjs.com/t/spherical-voxel-engine-demo-version-2/35294
- https://github.com/SvenFrankson/planet-builder-web
- https://github.com/simondevyoutube/ProceduralTerrain_Part4
- https://github.com/fstrugar/CDLOD
- https://hhoppe.com/proj/geomclipmap/
- http://tulrich.com/geekstuff/sig-notes.pdf
- https://transvoxel.org/
- https://app.cinevva.com/blog/2026-02-25-open-world-browser-series-guide
- https://app.cinevva.com/blog/2026-02-25-open-world-browser-part-09-transvoxel-first-cut
- https://gitlab.com/distant-horizons-team/distant-horizons
- https://0fps.net/2012/06/30/meshing-in-a-minecraft-game/
- https://0fps.net/2012/07/12/smooth-voxel-terrain-part-2/
- https://0fps.net/2013/07/03/ambient-occlusion-for-minecraft-like-worlds/
- https://github.com/cgerikj/binary-greedy-meshing
- https://developer.nvidia.com/gpugems/GPUGems2/gpugems2_chapter16.html
- https://diglib.eg.org/handle/10.1111/cgf14050
- https://ebruneton.github.io/precomputed_atmospheric_scattering/
- https://github.com/takram-design-engineering/three-geospatial
- https://discourse.threejs.org/t/beware-of-logarithmic-depth-buffer-it-can-degrade-scene-performance/88495
- https://raw.githubusercontent.com/mrdoob/three.js/dev/src/renderers/WebGLRenderer.js
- https://esdiscuss.org/topic/es6-accuracy-of-special-functions
- https://codeberg.org/perplexdotgg/bounce/issues/8
- https://gdcvault.com/play/1024365/Math-for-Game-Programmers-Noise
- https://dl.acm.org/doi/10.1145/1141911.1141931

### Engines, libraries and formats
- https://github.com/fenomas/noa
- https://github.com/Divine-Star-Software/DivineVoxelEngine
- https://github.com/maxogden/voxel-engine
- https://github.com/mrdoob/three.js/tree/dev/manual/pages
- https://github.com/mrdoob/three.js/blob/dev/manual/pages/webgpurenderer.html
- https://github.com/mrdoob/three.js/blob/dev/examples/jsm/loaders/VOXLoader.js
- https://threejs.org/manual/en/multiple-scenes.html
- https://github.com/mikolalysenko/greedy-mesher
- https://github.com/s-macke/VoxelSpace
- https://github.com/guillaumechereau/goxel
- https://github.com/vengi-voxel/vengi
- https://vengi-voxel.github.io/vengi/LUAScript/
- https://github.com/FlorianFe/vox-reader.js
- https://github.com/kevzettler/parse-magica-voxel
- https://github.com/cnlohr/voxeltastic
- https://arxiv.org/abs/2505.02017
- https://github.com/ephtracy/voxel-model/blob/master/MagicaVoxel-file-format-vox.txt
- https://github.com/ephtracy/voxel-model/blob/master/MagicaVoxel-file-format-vox-extension.txt
- https://formats.kaitai.io/magicavoxel_vox/
- https://paulbourke.net/dataformats/vox/

### LLM authoring and animation
- https://github.com/mc-bench/orchestrator
- https://arxiv.org/abs/2310.12945
- https://arxiv.org/abs/2403.01248
- https://arxiv.org/abs/2412.14203
- https://arxiv.org/abs/2411.09595
- https://iquilezles.org/articles/distfunctions/
- https://www.blockbench.net/
- https://www.chrishecker.com/Real-time_Motion_Retargeting_to_Highly_Varied_User-Created_Morphologies
- https://www.gdcvault.com/play/1020583/Animation-Bootcamp-An-Indie-Approach
- http://www.andreasaristidou.com/FABRIK.html

### Platforms and Godot
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects
- https://developer.chrome.com/blog/enabling-shared-array-buffer
- https://www.electronjs.org/docs/latest/api/web-request
- https://developer.shen.ai/getting-started/web-troubleshooting
- https://forum.ionicframework.com/t/webviewlocalserver-additional-http-response-headers/227445
- https://webkit.org/blog/13966/webkit-features-in-safari-16-4/
- https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
- https://caniuse.com/webgpu
- https://developer.apple.com/forums/thread/770862
- https://developer.apple.com/forums/thread/133449
- https://bugs.webkit.org/show_bug.cgi?id=289601
- https://developer.chrome.com/blog/new-in-webgpu-121
- https://groups.google.com/a/chromium.org/g/blink-dev/c/N3RlLGCOTJ4/m/loneRTlPBwAJ
- https://releases.electronjs.org/schedule
- https://github.com/gpuweb/gpuweb/wiki/Implementation-Status
- https://v2.tauri.app/develop/debug/linux-graphics/
- https://chromium.googlesource.com/chromium/src/+/798e59c5275d4131797e8ea2e96e6c6000256b58/docs/gpu/swiftshader.md
- https://groups.google.com/a/chromium.org/g/blink-dev/c/yhFguWS_3pM/m/oLrB5up_BwAJ
- https://github.com/Zylann/godot_voxel
- https://voxel-tools.readthedocs.io/en/latest/api/all_classes/
- https://voxel-tools.readthedocs.io/en/latest/api/VoxelLodTerrain/
- https://voxel-tools.readthedocs.io/en/latest/smooth_terrain/
- https://voxel-tools.readthedocs.io/en/latest/generators/
- https://www.w4games.com/w4consoles
- https://godotengine.org/asset-library/asset/1587
- https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html
- https://github.com/godotjs/GodotJS
