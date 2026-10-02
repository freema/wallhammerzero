# Reference analysis: procedural-pixel-creatures

- **Repo:** https://github.com/idlerunner00/procedural-pixel-creatures, commit
  `24d26df10e9f0d369f1caf5b6ba0e8e724ec0888` (2026-10-01, "Add Procedural Pixel Creatures source
  release"), 2 commits. Analysed 2026-10-02 for Wallhammer Zero (WZ).
- **Licence:** MIT © 2026 idlerunner00, plus an Apache-2.0 PCG32 port and the fdlibm notice (§9).
- **Security scan:** `research/scans/2026-10-02-procedural-pixel-creatures/TRIAGE.md`. No real
  finding; the scanner's CRITICAL label rests on four false positives. It is not a skill.
- **Method:**
  - Static reading of the engine-independent Core (about 19,400 lines of C#), the families,
    tests and docs. Sub-agents swept the families, the motion code and the genetics.
  - Then a **Docker-only run** (`--network none`, clone read-only): our own driver rendered the
    8 uncurated seeds of all 9 families, and the upstream test harness ran (17/17 pass). Nothing
    ran on the host; the Godot editor and the Windows launcher were never started.
- **Conventions:**
  - **Fact** means verified in code or by running it, with a citation.
  - **Opinion** means my assessment or recommendation for WZ.
  - `Core/` stands for `addons/procedural_creatures/Core/`. Other paths are relative to the repo root.
  - "px" are sprite pixels at 1×.
- **Samples:** `research/scans/2026-10-02-procedural-pixel-creatures/samples/` (contact sheets,
  `stats.tsv`, the driver source).

---

## 1. Executive summary

1. **What it is.** A Godot 4.5 .NET plug-in plus a "workshop" app that generates pixel-art
   monsters and animals from a seed: 9 families, 54 sample genomes, animated, 8 facings, exported
   as sprite sheets with JSON. The README says it was written mainly by Claude Opus 5.5 from one
   prompt, with GPT follow-ups (`README.md:13-14`). *(Fact)*
2. **It is not a mask or cellular-automaton generator.** Each creature is a small 3D model made
   of analytic primitives (ellipsoids, round cones, triangle plates). A CPU rasteriser evaluates
   them per pixel and toon-shades the result into palette indices. It is a 3D → pixel-art baker,
   closer to our voxel baker than to Bollinger-style sprite generators. *(Fact:
   `Core/Rendering/CreatureRenderer.cs:147-200`)*
3. **The pixel-art rules are coded explicitly:**
   - 6 shade levels per material;
   - soft union inside a part group and a z-test between groups;
   - selective outline (the lit side uses the dark ramp step instead of the outline colour);
   - interior contours only where parts are separated in depth;
   - far-side parts one level darker;
   - screen-space contact shadows;
   - speck and isolated-shade cleanup;
   - eyes and nostrils stamped as designed pixel clusters after rasterising.
   *(Fact: `CreatureRenderer.cs:828-1451`)*
4. **Palettes are built in OKLCH:** fixed lightness steps, hue shifted toward yellow in lights and
   blue-violet in shadows, ramps sharing colours. About 10–16 visible colours per creature.
   *(Fact: `Core/Palettes/PaletteRules.cs:67-109`)*
5. **Variety comes from priors, not from uniform noise.**
   - Each archetype has centre values; genes are drawn from a truncated Gaussian around them.
   - Weighted choice tables pick discrete options.
   - "Coherence" fixes run after sampling, e.g. a staff implies a robe or hood.
   *(Fact: `Core/Families/BipedFamily.cs:119-403`)*
6. **Separate RNG streams per concern** (anatomy, colour, pattern, motion, each derived from a
   string label). A recolour never changes the body. *(Fact: `Core/Framework/CreatureModel.cs:211-229`)*
7. **Animation is procedural simulation:** a fixed-step motor, gait phase tables, planted feet
   with IK, spring chains and additive pose parameters. Export runs the simulation and **quantises
   loops**, e.g. the gait frequency is snapped so a walk cycle is exactly n frames. *(Fact:
   `Core/Export/SpritesheetExporter.cs:171-286`)*
8. **Determinism: strong, with leaks.**
   - The 72 sample creatures re-rendered byte-identically.
   - The upstream golden hashes (generated on Linux x64) **also matched on linux-arm64**.
   - Yet the code breaks its own "no `System.Math` transcendentals in Core" rule 19 times in
     5 files.
   - Frames are not pure f(frame); they depend on accumulated simulation state.
   *(Fact; §5)*
9. **Quality (Opinion):** the best procedural monster pixel art I have seen from code; the samples
   are in §6.
   - Strong: quadrupeds, reptiles, arthropods, fish, slimes, plant creatures.
   - Weakest: humanoids (tiny faces, lumpy bodies) and serpents (sausages).
10. **It is tuned for 20–90 px creatures, not for 16×24 chibis.**
    - At the smallest size setting, silhouettes still read, but faces and interiors turn into
      noise (§6.3).
    - A code comment targets "30-60 px figure height" (`BipedFamily.cs:476-479`).
11. **Licence:** MIT plus Apache-2.0 (PCG) and fdlibm notices. Copying is legally possible with
    attribution, but **the recommendation is ideas only**: C#, doubles and simulation-based
    animation don't fit our TypeScript, integer-only, f(params, seed, frame) contract (D18).
12. **Most valuable for us (Opinion):**
    - the outline, contour, far-side and contact-shadow rules for the **voxel-sprite-baker**;
    - the OKLCH ramp recipe as an **offline palette tool**;
    - priors + coherence rules + uncurated review seeds for **asset-kit-core**;
    - loop quantisation and lint ideas for **asset-render-cli**;
    - "stamp the face after the body" for **both art spikes**.
13. **What not to take:** the Godot/C# code and launcher, float determinism via fdlibm,
    simulation-state animation for baked sprites, IK and springs at 16 px, 24-frame idles.

---

## 2. Architecture

**Layers.** *(Fact)*

| Layer | Where | Size | Notes |
|---|---|---|---|
| Core (engine-independent) | `addons/procedural_creatures/Core` | ~19,400 lines | No Godot types, no file or network I/O. Builds with plain .NET 8 |
| Plantfolk extension | `addons/procedural_creatures_plantfolk/Core` | 835 lines | Shows the extension API: a family registered via a `[CreatureExtension]` attribute |
| Godot runtime | `addons/procedural_creatures/Runtime` | ~800 lines | Actor node, render queue (CPU render → texture upload) |
| Workshop app | `workshop/` | ~5,900 lines | Gallery, genome editor, breeding, export panel, test area with procedural terrain |
| Tests | `tests/Core/CoreTests.cs` (17 tests), `tests/SelfTest.cs` (28 Godot self-tests) | | `README.md:180-189` |
| Console harness | `tools/core_harness` | | Compiles Core + Plantfolk + tests without Godot. Commands: `test`, `goldens` |

**Pipeline** (`docs/ARCHITECTURE.md:5-22`). *(Fact)*

```
seed ─► GenomeFactory.Sample ─► CreatureGenome (genes + 4 stream seeds + generator version)
        family.Build(anatomy stream) ─► CreatureAnatomy: skeleton (bones with roles),
                                        primitives in groups, features (eyes…), MotionRig
        PaletteRule.Build(colour genes) ─► CreaturePalette (ramps per material slot)
        SurfaceBuilder(pattern genes)   ─► SurfaceSpec (pattern, textures, material styles)
CreatureMotor.Step(1/60 s) ─► PoseParams ─► RigDriver + locomotion ─► Pose
CreatureRenderer.Render(anatomy, palette, surface, pose, view) ─► PixelFrame (palette indices)
SpritesheetExporter ─► sheet PNG + `ppc.spritesheet` JSON
```

**Family contract** (`Core/Framework/ICreatureFamily.cs:23-90`). *(Fact)* A family declares:
- a stable id ("never rename; add a migration instead") and a gene schema;
- weighted archetypes and a palette rule id;
- `StyleHints(archetype)`, which biases colour, pattern and motion;
- `SampleAnatomy`, `AdjustSample` and `Build` (anatomy stream only).

The 9 families are quadruped, biped, reptile, arthropod, winged, serpent, aquatic, amorphous and
plantfolk.

**Gene schema** (`Core/Genetics/GeneSchema.cs:59-116`). *(Fact)*
- Each gene has:
  - a float range and default, or a choice list;
  - a label and a description;
  - a stream (anatomy / colour / pattern / motion);
  - a group, a linkage key for crossover, and a mutation scale.
- 32 genes are shared by every family: 12 colour, 13 pattern, 7 motion
  (`Core/Genetics/SharedGenes.cs:120-162`).
- Families add 18–47 genes. Totals: quadruped 72, biped 79, reptile 65, arthropod 61, winged 61,
  serpent 51, aquatic 53, amorphous 50, plantfolk 54.

**Genome file** (`Core/Serialization/GenomeSerializer.cs`). *(Fact)*
- JSON `ppc.creature` with format, formatVersion, generatorVersion, family, name, four stream
  seeds **as decimal strings**, genes, lineage and meta.
- Validation separates errors from warnings. A generator-version mismatch is a warning:
  "Appearance may differ" (`Core/Framework/CreatureModel.cs:152-153`).

**Opinion.** The architecture is clean and close to what WZ wants:
- a pure core producing palette indices;
- engine glue kept thin;
- a headless harness that builds without the engine.

It is a good existence proof that an AI-written generator of this size can stay coherent when it
has a written architecture doc, tests and golden hashes.

---

## 3. The generation algorithm

### 3.1 Seed → genome

**Fact.**
- `GenomeFactory.Sample` (`CreatureModel.cs:211-229`):
  1. picks a weighted archetype from `Rng.Derive(seed, "archetype.<family>")`;
  2. samples anatomy genes from `"genes.anatomy.<family>"`;
  3. samples colour, pattern and motion genes from their own labelled streams, biased by the
     archetype's `StyleHints`;
  4. runs `AdjustSample` from `"genes.adjust.<family>"`.
- `Derive(seed, label)` is `Mix64(seed ^ FNV1a64(label))`, i.e. SplitMix64 over a label hash
  (`Core/Math/Random.cs:65-67, 112-113`).
- Priors (`BipedFamily.cs:242-287`):
  - each archetype has a centre value per gene;
  - `Around(…, centre, σ)` draws a Gaussian with σ = 0.11 (size: 0.12), truncated at ±2.2σ;
  - discrete genes (teeth, eye style, ears) come from weighted tables per archetype.
- `AdjustSample` (`BipedFamily.cs:357-403`):
  - glowing eye style → raise the glow colour gene;
  - clothing dyes from per-culture tables (hue, saturation range, value range, weight);
  - hair colour tables per archetype;
  - weapon/outfit consistency (a staff implies a robe or hood).
- Mutation always consumes the same number of random draws per gene, "so that toggling a stream"
  doesn't shift the others (`Core/Genetics/GenomeOps.cs:92-107`). Colour genes mutate with a
  1.6× boost.
- Crossover picks per linkage group: 40 % parent A, 40 % parent B, 20 % blend (`GenomeOps.cs:197-204`).
- Locks keep chosen genes or groups through regeneration and mutation (`GenomeOps.cs:10-42, 72-85`).
- `UncuratedSeeds = {101, 202, …, 808}`: "Fixed, uncurated seed sample used for quality reviews
  … Never edited to hide bad results" (`CreatureModel.cs:203-208`).

**Opinion.** Priors + coherence fixes is why the samples look designed rather than random. A gene
can wander, but only around a believable centre, and contradictions are patched after sampling.
This transfers directly to presets and variant seeds in asset-kit-core.

### 3.2 Anatomy: primitives, groups and features

**Fact.**
- `BuildAnatomy` (biped, `BipedFamily.cs:414-834`) turns genes into world-unit geometry.
- Base length is `lerp(12, 30, size^1.05)` (`:422`). Heads are deliberately generous: "faces
  carry the character at 30-60 px figure height" (`:476-479`). Eye size is clamped to 1.4–5.5 (`:512`).
- Limbs are built in loops over `side = -1, 1` (`:562-654`), so **symmetry lives in the spec,
  not in pixel mirroring**. Then come gear (`:663-723`), tail (`:726-748`), back features
  (`:751-806`) and the motion rig (`:809-833`).
- Primitives come in three kinds:
  - **Ellipsoid**: a 2D SDF of the projected ellipse plus an analytic depth and normal;
  - **RoundCone**: a capsule with two radii, ray-intersected exactly, "after Inigo Quilez"
    (`CreatureRenderer.cs:511-569`);
  - **Triangle plate**: ears, fins, membranes.
  SDFs are at `CreatureRenderer.cs:426-485`.
- Each primitive belongs to a **group** (torso+neck+head, a leg, an arm, a tail, a wing) with a
  blend radius. `Gear.Cover` grows a shell (armour, clothing) over a body part
  (`Core/Shapes/Gear.cs:67-80`).
- **Features** are not geometry. Eyes, nostrils and spots are anchors with size, aspect and style,
  drawn after rasterising (§3.6).
- `ValidateAndRepair` checks structure only (bones, NaNs, sizes), not looks
  (`Core/Anatomy/CreatureAnatomy.cs:232-251`). In 72 samples it repaired nothing.

### 3.3 Palette

**Fact.**
- **Indices** (`Core/Palettes/CreaturePalette.cs:20-50`):
  - 0 = transparent;
  - **1 = translucent ground shadow** (RGBA 18,14,28 at alpha 92);
  - 2 = waterline;
  - 3+ = colours, deduplicated, so ramps share entries.
- **Material slots:** Primary, Secondary, Accent, Membrane, Mouth, Teeth, Eye, Marking, Glow,
  White, Cloth, Metal, Hair. Each has a 6-step ramp: **Outline 0, Deep 1, Shadow 2, Base 3,
  Light 4, Highlight 5** (`CreaturePalette.cs:10-19`).
- **The primary ramp recipe** (`PaletteRules.cs:78-99`). All values are OKLCH; L is 0–1 and
  C is chroma.

  | Step | L | Chroma | Hue shift |
  |---|---|---|---|
  | Base | `lerp(0.30, 0.86, value)` | `lerp(0.012, 0.175, sat^0.85)`, reduced for very dark or light bases | — |
  | Shadow | base − 0.13 | ×1.06 + 0.01 | 18°·shift toward **285°** (blue-violet) |
  | Deep | base − 0.25 | ×0.94 + 0.014 | 32°·shift toward 285° |
  | Outline | deep − 0.11 − 0.07·outline gene, clamped 0.08–0.26 | ≤ 0.075 | as deep |
  | Light | base + min(0.11, room/2) | ×0.9 | 16°·shift toward **92°** (yellow) |
  | Highlight | base + min(0.215, 0.92·room) | ×0.6 | 30°·shift toward 92° |

  "Room" is the lightness left above the base (0.975 − L). The lower four steps are then pushed
  apart to **at least 0.085 L each** (`EnforceSteps`, `:102-109`).
- Gamut mapping: binary search on chroma (`ColorMath.cs:106-123`).
- Colour schemes for secondary and accent colours: natural, analogous, complementary, triadic,
  split and monochrome (`PaletteRules.cs:111-138`).

**Opinion.** This is a compact, correct version of the hue-shifting advice in
`research/code-graphics.md` §2.2, expressed as numbers.

### 3.4 Patterns and micro-texture

**Fact.**
- **Surface coordinates:** every primitive has a pattern domain (body, neck, tail, limb,
  wing…) with U0..U1, so patterns continue across primitives of the same domain
  (`CreatureRenderer.cs:1070-1135`).
  - U = distance along the domain;
  - θ = angle from the dorsal line (180° = belly);
  - V = arc length.
- **Patterns are body-anchored** (`Core/Palettes/SurfaceSpec.cs:119-341`), so they stick to the
  body as it moves:
  - stripes, spots, rosettes, saddle, dorsal stripe, mottled, bands, blotches;
  - countershade (θ above a limit gives the secondary colour; the limit accounts for the 30°
    camera), muzzle, mask, socks, tips, piebald;
  - insect wing marks: eyespot, border, bands, veins.
- **Textures** (fur, scales, plates, feathers, bark) are not colours. They are **lighting
  offsets** in surface space that push a pixel one shade level up or down
  (`CreatureRenderer.cs:1197-1244`). Turtle scutes use a Voronoi pattern (`:1143-1171`); stone
  uses faceted normals (`:1173-1194`).

### 3.5 Rasterising and shading

**Fact.** `Render` (`CreatureRenderer.cs:147-200`) runs these steps in order:

1. **Camera.** Oblique orthographic, 30° elevation. World light `(-0.47, 0.87, 0.06)`, i.e. from
   the upper left (`Core/Rendering/PixelCamera.cs:16-27`).
2. **Raster groups** (`:669-824`). Per pixel and per group, every primitive gives a signed
   distance, depth and normal.
   - **Inside a group: soft union.** With blend radius k, the weight is
     `h = sat(0.5 + 0.5·(z − zAcc)/k)`, depth is `zAcc + (z − zAcc)·h + k·h·(1−h)`, and normals
     are lerped by h (`:744-747`). This is the polynomial smooth-max on depth.
   - A field term adds fillets where primitives nearly touch (`:755-770`).
   - **Between groups: a plain z-test** (`:775-823`). Legs stay separate from the body while the
     neck melts into the head.
3. **Silhouette cleanup** (`:828-869`). Remove single-pixel specks; fill one-pixel holes, but only
   when the surrounding pixels belong to the same group. Then remove "interior groups" whose
   visible area is tiny (`:876-901`).
4. **Stylise** (`:932-1004`).
   - The level comes from `MaterialStyle.Level` (`CreaturePalette.cs:121-132`):
     - wrap lighting `(n·l + wrap)/(1 + wrap)`;
     - a global remap `(x − 0.11)·1.08` "so that roughly a third of a body faces away from it
       (readable volume)";
     - per-material thresholds for Light, Base and Shadow;
     - Highlight only via a specular threshold.
   - 15 material styles: fur, hide, scales, chitin, stone, slime, feather, horn, membrane, matte,
     glossy, emissive, bark, leaf, metal (`CreaturePalette.cs:149-166`).
   - Texture offsets apply, then: back faces −1, a crease shade, and **groups on the far side of
     the body −1** (`:990-994`).
5. **Contact shadows** (`:1012-1049`). From each pixel, march up to 6 px through the depth buffer
   toward the light. If something in front occludes it, drop one level.
6. **Shading cleanup** (`:1248-1306`). Isolated single-pixel shade or material changes are merged
   into their neighbours.
7. **Compose** (`:1338-1411`).
   - **Interior contours.** A covered pixel whose 4-neighbour is nearer by more than
     `ContourDepth` (1.6 px; same group: 5.0 + blend radius) becomes a contour. Gap > 6 px or an
     already-dark pixel gives the **front material's Outline**; a small gap gives the **back
     material's Deep** ("soft contour for touching parts, full outline for clear separations").
   - **Exterior outline**, 4-neighbourhood ("clean diagonals"). Each empty pixel next to the body
     takes the Outline step of the **nearest neighbour's material**, so the outline is coloured
     per material.
   - **Selective outline.** If the outline pixel lies above or left of the shape and touches a
     lit pixel, it uses Deep instead of Outline.
8. **Features** (`:1415-1670`). Eyes are drawn as pixel clusters with an outline, pupil and shine:
   - "round up generously: a 2x2 eye with a shine pixel reads far better than a single dot";
   - "a 1-pixel-wide eye in three-quarter view reads as a dash: keep two columns while it faces
     us" (`:1456-1462`);
   - pupils look toward the screen-space forward direction (`:1464-1470`);
   - eye openness (blink) and a mood (neutral, angry, pain, sleep, happy, alert) change the mask
     (`Core/Anatomy/CreaturePose.cs:7-27`).
9. **Ground shadow and water.** The ground shadow is a metaball blob under the feet, drawn with
   the translucent index 1 (`:1683-1777`). A waterline is added for swimmers (`:1779-1820`).

**Opinion.** Steps 2, 3, 6 and 7 are where generic 3D-to-pixel bakers usually fail, and this
code spells out a working rule for each. Its eye rules are the clearest statement I have found of
why procedural faces fail at small sizes, and of the fix: design the face as a stamp, not as
geometry.

---

## 4. Animation

**Fact.**
- **Motor** (`Core/Motion/CreatureMotor.cs:24-31, 177-319`): a fixed step of 1/60 s. Each step
  runs behaviours, then locomotion, then writes `PoseParams`, a flat set of named parameters
  (body pitch, head yaw, jaw, ear pitch, tail curl, wing fold, squash…).
- **Parameters, not pixels.** Behaviours add to the parameters: breathing, blink, fidgets, look,
  attack strike, hit reaction, rest (`Core/Motion/Behaviors.cs`).
  - The action envelope `Curves.Strike(t, …)` has anticipation → strike → hold → recover phases;
    `Curves.Shake` adds jitter (`Core/Motion/PoseParams.cs:164-187`).
  - In export mode, idle is "loopable: one blink per loop at a fixed loop-relative time, no random
    gestures" (`Behaviors.cs:51`).
- **Legged gaits** (`Core/Motion/LeggedLocomotion.cs:86-154`):
  - phase offsets: biped 0 / 0.5; quadruped lateral walk 0 / 0.25 / 0.5 / 0.75; trot on the
    diagonals; gallop 0 / 0.1 / 0.5 / 0.62; tripod for 6+ legs;
  - offsets blend by speed: trot from 0.15–0.55 of the walk → run blend, gallop from 0.72–0.98;
  - duty factor: walk 0.62 (biped) / 0.66 (others), run 0.36 / 0.4.
  - **Feet are planted in world space** ("a foot in stance never moves, so there is no foot
    sliding", `:3`). Swing feet follow an arc to a predicted landing point.
- **IK:** analytic 2-bone and 3-bone (digitigrade) solvers (`Core/Anatomy/Kinematics.cs:15-66`).
- **Secondary motion:** Verlet-style spring chains for tails and multi-bone appendages (`RigDriver.cs:45-60`), with damping via
  `Math.Exp` (`Core/Motion/SpringChain.cs:50-85`).
- **Squash:** `ys = 1 − sq` and `xs = zs = 1/√ys`, so volume is preserved (`Core/Motion/RigDriver.cs:77-81`).
- Flight, swim, serpentine, hop and float are separate locomotion modules.
- **Export** (`SpritesheetExporter.cs:171-286`):
  - every clip starts after 30 settle steps;
  - idle = a 2 s loop (24 frames at 12 fps);
  - walk:
    1. simulate 90 steps, then read the cycle frequency f;
    2. pick **n = max(4, round(fps/f))** frames and lock the frequency to fps/n;
    3. simulate 3n more frames to settle the springs;
    4. capture n frames;
  - fps must divide 60 (error message in German, "Fps muss 60 teilen").
  - Gaps found by a sub-agent:
    - hop ignores the frequency override;
    - flight idle is not quantised;
    - no test that a loop's last frame flows into its first.
- **Sheet format** (`SpritesheetExporter.cs:94-169, 296-354`):
  - one frame size and one origin (ground point) for the whole sheet;
  - one row per clip × direction;
  - root-motion speed in the metadata;
  - the hit flash baked in through the palette.
- **8 facings** come from rotating the 3D model (`PixelCamera.cs:33`). West is rendered, not
  mirrored, so the light stays top-left.

**Measured** (driver, 12 fps, SE facing; `samples/stats.tsv`). *(Fact)*

| Clip | Frames | Changed px to next frame | Loop seam (last → first) | Lowest-pixel Y |
|---|---|---|---|---|
| biped 101 idle | 24 | 26–139 | 120 (inside the range, so the loop closes) | 60–61 |
| biped 101 walk | 6 | 429–1079 | 429 | 58–61 |
| quadruped 202 idle | 24 | 21–121 | 72 | 49 |
| quadruped 202 walk | 6 | 529–662 | 529 | 47–52 |
| amorphous 303 walk | 5 | 227–460 | 460 | 33–34 |

**Opinion.**
- The *rules* travel well:
  - gait phase tables and duty factors;
  - one blink per loop at a fixed time;
  - snapping the cycle so n is an integer;
  - squash with preserved volume.
- The *mechanism* does not suit baked sprites. A frame is the state of a simulation after many
  steps, not f(frame); this is why the exporter needs settle steps.
- A 24-frame idle at this size is mostly invisible: breathing moves about ±0.35 px. Kairosoft-
  style sprites need 2–4 frames with deliberate poses instead.
- The quadruped's lowest pixel moves by 5 px during a walk (near and far feet in a 3/4 view). A
  baseline lint on "lowest pixel" would raise false alarms for multi-legged sprites.

---

## 5. Determinism

**Fact.**
- **RNG:** PCG32 XSH-RR (Apache-2.0, ported from pcg-c-basic). SplitMix64 and FNV-1a 64 derive
  seeds and streams; bounded integers use Lemire's method; Gaussians use Box–Muller
  (`Random.cs:23-205`). Pattern noise (Perlin, fBm, cellular) is in the same file (`:208-323`).
- **Floats are used everywhere,** made deterministic by `DMath`: fdlibm kernels for sin, cos,
  atan2, exp, pow and the like, built only from IEEE-754 basic operations, plus a rule "no
  System.Math transcendentals in Core" (`Core/Math/DMath.cs:1-19`).
- **The rule is broken** by 19 calls on 15 lines (Sin 7, Cos 4, Atan2 5, Exp 3). `Sqrt`/`Abs`/
  `Floor`/`Round` are exact in IEEE, so they are allowed.
  - `Core/Shapes/Gear.cs:108, 259`
  - `Core/Motion/SpringChain.cs:56, 66`
  - `Core/Motion/SerpentineLocomotion.cs:117, 118, 128, 242, 250, 251, 355`
  - `Core/Palettes/SurfaceSpec.cs:235, 246, 256`
  - `Core/Families/AmorphousFamily.cs:365`
- **Golden tests hash palette indices, not RGB or PNG bytes** (`tests/Core/CoreTests.cs:393-418,
  730-765`). Per family: seed 2024, SE facing, rest pose plus a walk frame after 90 steps.
  Upstream generated them "on Linux x64" (`docs/ARCHITECTURE.md:55-75`).
- **Run in Docker on linux-arm64:** all 27 golden values matched (17/17 tests pass), and all 72
  sample creatures rendered byte-identically twice. So determinism held across x64 → arm64 for
  .NET 8, including the code paths that use `System.Math`. Windows (UCRT maths) was not tested.
- **Caches:** LRU caches (192 anatomies, 384 palettes and surfaces; `CreatureModel.cs:127-132`) do not change output; a cold-cache test checks
  this (`CoreTests.cs:393-418`).
- **Trap:** C# `Math.Round` rounds half to even by default; JavaScript `Math.round` rounds half
  up. A port of any number here would drift at .5.

**Opinion.**
- The leaks are the lesson. An AI-written codebase with an explicit written rule and a dedicated
  maths library still broke the rule 19 times; the goldens didn't notice, because .NET on Linux
  happens to agree across these two CPUs. A **lint**, not a convention, is what keeps the rule
  (our asset-kit-core already plans an ESLint ban).
- Hashing indices rather than PNG bytes matches our asset-kit-core plan.
- The cross-architecture result is evidence for .NET doubles, not for JavaScript `Math.sin` across
  engines. It does not weaken the integer-only rule in D18.

---

## 6. Output quality

### 6.1 What I ran and where the images are

**Fact.** Commands are in the scan's `TRIAGE.md`. Images were upscaled by integers with
nearest-neighbour inside Docker and viewed as contact sheets.

| File | Content |
|---|---|
| [`overview-72-2x.png`](scans/2026-10-02-procedural-pixel-creatures/samples/overview-72-2x.png) | All 9 families × 8 uncurated seeds, first idle frame, SE facing, 2× |
| [`family-biped-3x.png`](scans/2026-10-02-procedural-pixel-creatures/samples/family-biped-3x.png), [`family-quadruped-3x.png`](scans/2026-10-02-procedural-pixel-creatures/samples/family-quadruped-3x.png), [`family-winged-3x.png`](scans/2026-10-02-procedural-pixel-creatures/samples/family-winged-3x.png), [`family-amorphous-3x.png`](scans/2026-10-02-procedural-pixel-creatures/samples/family-amorphous-3x.png) | One family per sheet at 3× |
| [`strips-walk-idle-3x.png`](scans/2026-10-02-procedural-pixel-creatures/samples/strips-walk-idle-3x.png) | Walk and idle strips: biped 101, quadruped 202, amorphous 303 |
| [`facings-8dir-3x.png`](scans/2026-10-02-procedural-pixel-creatures/samples/facings-8dir-3x.png) | 8 facings: biped 101, quadruped 202 |
| [`small-size-1x.png`](scans/2026-10-02-procedural-pixel-creatures/samples/small-size-1x.png), [`small-size-5x.png`](scans/2026-10-02-procedural-pixel-creatures/samples/small-size-5x.png) | Size gene 0 (biped also: max head size, shortest legs, max eye size). Labels are truncated; the order is biped 101/202/303, quadruped 101/202/303, amorphous 101/202/303, winged 101/202/303 |
| [`stats.tsv`](scans/2026-10-02-procedural-pixel-creatures/samples/stats.tsv) | Per creature: frame and bbox size, colours, palette size, walk frames, repairs, warnings, determinism |

### 6.2 Numbers at default size

**Fact** (`stats.tsv`; content bounding box at 1×).

| Family | Content W × H (px) | Colours in frame | Walk frames | Archetypes seen in 8 seeds |
|---|---|---|---|---|
| quadruped | 41–82 × 28–61 | 12–17 | 5–7 | canine, bovine, cervine, ursine, feline |
| biped | 26–38 × 33–59 | 10–28 | 4–6 | troll, dwarf, goblin, imp, kobold, golem, ogre |
| reptile | 41–89 × 29–47 | 10–16 | 4–9 | tortoise, salamander, lizard, crocodile |
| arthropod | 34–58 × 21–59 | 9–16 | 4 | scorpion, spider, beetle, mantis |
| winged | 26–37 × 17–29 | 12–16 | 4 | raptor, dragonfly, songbird |
| serpent | 28–76 × 16–36 | 10–16 | 7–14 | constrictor, viper, worm |
| aquatic | 32–56 × 22–40 | 10–21 | 4–7 | puffer, angler, reef fish, shark, ray |
| amorphous | 18–37 × 17–40 | 9–14 | 5–10 | slime, ooze, jelly, octopus, beholder |
| plantfolk | 22–33 × 30–55 | 12–25 | 4–5 | mandrake, mushroom, bloom, flytrap, sapling |

All 72 had 0 repairs, 0 validation warnings, and identical bytes on a second render.

### 6.3 Visual verdict

**Opinion**, from the upscaled sheets.

**Strong:**
- Consistent top-left light, readable volume and clean silhouettes.
- Coloured selective outlines and hue-shifted ramps; the contact shadows give a SNES-era monster
  look.
- Quadrupeds (wolf, deer, bear), tortoises, scorpions, sharks, jellyfish and the plant creatures
  read at a glance.
- Variety within a family is real (different archetypes, not just recolours), and the uncurated
  seeds contain no broken creature.

**Weak:**
- **Humanoids** are the weakest family: small faces, dark coats with little internal contrast,
  lumpy "clay" bodies. Golem and ogre are blobs; the kobold reads as a dog.
- **Serpents and worms** often read as sausages.
- Eyes are mostly 1–2 px even with the round-up rule.
- Detached specks appear in some frames: dashes of ground shadow under the dog, a dark dot under
  biped walk frame 3. The cleanup passes don't catch everything.

**Animation:**
- Walk cycles have clear contact poses and planted feet.
- Idles are nearly static at 1×.
- The 8 facings rotate correctly and keep the light consistent; long animals become thin strips
  in N/S views.

**Small size** (`small-size-*.png`):
- Content at the minimum size setting:

  | Family | Content W × H (px) | Colours |
  |---|---|---|
  | biped | 18–23 × 31–33 | 15–24 |
  | quadruped | 26–27 × 18–20 | 13–15 |
  | amorphous | 11–15 × 11–20 | 6–12 |
  | winged | 16–19 × 13–14 | 13–16 |

- Silhouettes still read. Faces and interiors become noise: pattern speckle, contact-shadow
  pixels, micro-texture.
- The "chibi push" (big head, short legs, big eyes) is not cute. It is a small monster with a
  big head, not a Kairosoft character.
- **Conclusion:** this pipeline does not reach 16×24 chibi quality, and was never meant to.

---

## 7. Prior art and lineage

| Generator | Representation | How variety is made | Size sweet spot | Licence |
|---|---|---|---|---|
| Dave Bollinger, "Pixel Spaceships" / "Pixel Robots" | A hand-made **mask template** of cell types; random fill; mirror; outline | Random cells inside the mask | ~12×12 | Original pages are offline; known through credits in later ports. No code licence seen |
| [zfedoran/pixel-sprite-generator](https://github.com/zfedoran/pixel-sprite-generator) (JS) | Mask values: −1 always border, 0 empty, 1 empty-or-body (random), 2 border-or-body (random); `mirrorX/Y`; outline pass | Seeded fill; colour options `colored`, `edgeBrightness`, `colorVariations`, `brightnessNoise`, `saturation` | 8–16 px | MIT; credits Bollinger |
| [yurkth/sprator](https://github.com/yurkth/sprator) | 4×8 noise grid; a **cellular automaton** (survive with 2–3 neighbours, birth with ≤ 1); mirror to 8×8; outline | Seed + CA iterations | 8–10 px | MIT |
| **procedural-pixel-creatures** (C#) | **3D analytic primitives** → SDF raster → toon shading → pixel-art post rules | Families × archetype priors × genes; separate streams; breeding | 20–90 px | MIT (+ Apache-2.0 PCG, fdlibm) |

**Fact.** The lineage of procedural-pixel-creatures is not the mask/CA line. It builds on:
- Inigo Quilez's SDF and ray-intersector maths, credited in a comment (his articles page states no
  licence);
- OKLab/OKLCH (Björn Ottosson);
- PCG (O'Neill), fdlibm (Sun) and Lemire's bounded integers, credited in
  `THIRD_PARTY_NOTICES.md`.

The 3D → pixel precedents (Dead Cells, Tiberian Sun voxels) are in `research/voxels.md` §3.1.

**Opinion.**
- **Mask/CA generators** shine below 16 px and produce "space-invader" shapes. Their useful idea
  for us is the **probabilistic stamp**: an ASCII stamp whose letters can mean "always body",
  "maybe body" and "maybe outline", filled by the seed and mirrored. That fits D18's ASCII stamps
  and could give cheap variety for tiny props, bugs or FX.
- **procedural-pixel-creatures** is the opposite end: it needs ≥ 24 px to show its strengths, and
  its real competitor in WZ is the voxel baker.

---

## 8. What to take and where

All of this is **ideas, re-implemented clean-room in TypeScript** (§9). Nothing is copied.
Proposals that would change a task note's scope are marked as proposals; the owner decides.

### 8.1 asset-kit-core (`tasks/2026-10-02-asset-kit-core.md`)

1. **OKLCH ramp builder as an offline palette tool** *(Opinion)*.
   - Write a small script (in Docker) that builds named ramps with §3.3's recipe and writes
     `assets/palettes/<name>.json`:
     - fixed lightness steps;
     - chroma that peaks mid-ramp and drops at the ends;
     - shadows toward 285° and lights toward 92°;
     - at least 0.085 L between steps.
   - Floats live only in the tool; the checked-in JSON is data. `render()` stays integer-only
     (D18), and the determinism lint scope (`assets/**`) is unaffected.
   - Ramps share colours (outline and deep steps), which keeps the art spike's ~32-colour
     palette tight.
2. **Reserved palette semantics** *(proposal)*. Index 0 transparent, **one translucent shadow
   index**, then colours. A soft ground shadow is then part of the sprite data, not a runtime
   effect. The palette JSON would need an alpha for that one slot.
3. **Named sub-streams per concern** *(confirms the plan)*. ppc derives streams from string labels
   (`Derive(seed, "genes.color")`), so recolouring never changes shape. Its mutation code also
   always consumes a fixed number of draws per gene.
   - Our equivalent is simpler: derive per param, `hash32(seed, paramName)`. Then adding a param
     never shifts the others.
4. **Presets as priors, variant seeds as spread** *(proposal)*. A preset gives centre values per
   param; a variant seed jitters them inside a clamped range; a `coherence(params)` hook fixes
   contradictions after sampling (staff → robe, glow eyes → glow colour; `BipedFamily.cs:357-403`).
   - This needs no floats: integer ranges with a triangular or clamped distribution are enough.
5. **A `description` per param** *(proposal)*. ppc's genes carry one ("Heavy brow ridge for a
   fierce expression"). It helps the studio and the next Claude session.
6. **Uncurated review seeds** *(proposal)*. Keep a fixed list per asset, separate from the curated
   `variant seeds`, that review sheets always render and that is "never edited to hide bad results"
   (`CreatureModel.cs:203-208`). It keeps the render → inspect loop honest.
7. **The determinism lint is necessary, not optional** *(Opinion, from §5)*. ppc's written rule
   leaked 19 times. Hashing indices, not PNG bytes, matches ppc's goldens.

### 8.2 asset-render-cli (`tasks/2026-10-02-asset-render-cli.md`)

1. **Loop-seam lint** *(proposal)*. Count the changed pixels from the last frame to the first,
   and compare with the range of in-clip frame diffs (ppc idle: seam 120 within 26–139, fine). A
   seam far above the range means a popping loop.
2. **Baseline lint uses the pivot, not the lowest pixel** *(Fact → Opinion)*. A walking
   quadruped's lowest pixel moves 47–52 because near and far feet differ in a 3/4 view. Check the
   pivot or ground point from meta and the grounded foot, with a tolerance per clip.
3. **Detached-component lint** *(proposal)*. Count connected components of body pixels and of
   shadow pixels separately; one body component is expected. ppc has cleanup passes and still
   leaves specks.
4. **Colours-per-frame and "too static" checks** *(proposal)*.
   - The upper bound on distinct indices per frame comes from STYLE.md (ppc: 9–28).
   - An idle whose largest frame diff is a handful of pixels is probably invisible at 1×.
5. **A stats table in `lint.json`** *(proposal)*: frame size, content bbox, colours, frames per
   clip, seam diff, as in `samples/stats.tsv`. Numbers before pictures (CLAUDE.md).
6. **Contact-sheet practice.** Label strips need room: my small-size sheet truncated its labels
   when a frame was narrower than the text. Put labels on their own row or column.

### 8.3 art-spike-2d (`tasks/2026-10-02-art-spike-2d.md`)

1. **Do not port ppc's 3D pipeline to 16×16 or 16×24** *(Opinion, §6.3)*. Its smallest output
   is about 18×31 for humanoids and already noisy.
2. **Draw the face last, as a stamp** *(Fact → Opinion)*. ppc's best idea at small sizes:
   - features are anchors on the body, drawn after it as designed clusters;
   - an eye facing the camera is at least 2 px wide, with a shine pixel;
   - expression is a stamp swap.
   For chibi staff and visitors: one ASCII face stamp per expression × facing, placed at an anchor.
3. **Rules for `assets/STYLE.md` v0** *(proposal)*:
   - far limb (far arm or leg in side and 3/4 views) one ramp step darker;
   - selective outline: the lit edge (top and left) uses the darkest ramp step of the material
     instead of the outline colour;
   - outlines coloured by the adjacent material;
   - one contact-shadow step under the head and arms;
   - a translucent ground blob;
   - 4-neighbourhood outlines for clean diagonals.
4. **Visitors from archetype tables** *(proposal)*. Build visitor variety the way ppc builds
   bipeds: per-archetype weighted tables for clothing dyes (hue, saturation range, value range),
   hair colours and accessories, plus coherence rules.
5. **Loop rules** *(Fact → Opinion)*. A walk cycle is exactly n frames; one blink per idle loop at
   a fixed frame; no random gestures in a loop. These match D18's f(params, seed, frame) directly.
6. **Mirrored side facings flip the light** *(Fact)*. ppc renders west separately for this reason.
   The spike plans to mirror the other side, which is common at Kairosoft scale; it is noted so
   the choice is deliberate (open question 4).

### 8.4 voxel-sprite-baker and art-spike-voxel

The strongest match: ppc *is* a 3D → pixel baker with a different primitive.

1. **Builder primitives** *(proposal)*. Add a **round cone** (capsule with two radii) and a
   **smooth union with blend radius k inside a named part** to the planned SDF primitives
   (round box, capsule, ellipsoid). Keep a hard union between parts. Organic forms (pets,
   mascots, animals) then look like bodies instead of stacked beads, and part boundaries stay
   crisp for contours. When voxelising, the smooth-min can use integer maths on a fine grid.
2. **Interior contours from the depth/ID buffer** *(proposal, extends the planned selective
   outline)*. Draw a contour only between **different parts** whose depth gap exceeds a threshold
   (ppc 1.6 px). A small gap gives the back material's dark step (soft); a large gap gives the
   front material's outline (hard).
3. **Lit-side selective outline:** the top and left outline uses the dark step instead of the
   outline colour (`CreatureRenderer.cs:1380-1411`).
4. **Far-side parts −1 ramp step.** Chibi legs and arms separate without extra outline pixels.
5. **Contact shadow as a ramp step.** Marching a few pixels toward the light through the depth
   buffer complements the per-corner AO rule, e.g. under a chibi's head or a shelf's top.
6. **Post-bake cleanup + lint.** Remove speck and isolated-shade pixels after projection (ppc
   steps 3 and 6), then let `lint` catch the rest. This is the "pixel flicker" mitigation from
   `voxels.md` §3.1, as concrete rules.
7. **Faces are stamps after the bake** *(Opinion)*. At 16×24 a voxel face can't read. Stamp eyes
   and mouth at projected anchor points, with facing-dependent width as in ppc's `DrawEye`. This
   likely decides the spike's criterion (c), readability at 1×.
8. **Symmetry in the spec** (`side = ±1` loops or `mirrorX`), not by mirroring pixels. This
   agrees with the planned builder.
9. **Keep 4 lossless 90° facings.** ppc shows 8 free-yaw facings work, but long bodies become
   thin strips in N/S views, and free yaw loses the lossless voxel rotation.

### 8.5 Later: creatures for the voxel game

Relevant to `research/ref-nms-procgen.md` §3.9 and `research/voxels.md` §5. *(Opinion)*

1. **Family contract** (§2): schema, weighted archetypes, style hints, sample, adjust, build from
   the anatomy stream only, a stable id with migrations.
2. **Genome hygiene:**
   - stream seeds stored as **decimal strings** (in JS this avoids losing 64-bit seeds above 2^53);
   - a `generatorVersion` field, with a mismatch warning instead of silent drift.
3. **Breeding**, if a game wants it: crossover by linkage group, mutation with fixed draw counts,
   gene locks.
4. **Live locomotion** (not baked sprites): gait phase tables and duty factors, world-planted feet,
   2- and 3-bone IK, spring tails. These match the mount ideas in `voxels.md` §5.

### 8.6 What not to take

- **The Godot/C# code, the workshop and the Windows launcher** (`Start.cmd`, `scripts/bootstrap.ps1`
  downloads a toolchain to the host; never run it, D16).
- **Float maths with fdlibm as the determinism strategy.** D18 and asset-kit-core chose integers;
  ppc's cross-architecture luck is not evidence for JS engines.
- **Simulation-state animation for baked sprites.** Settle steps, accumulated phases and springs
  break f(params, seed, frame). Take the loop rules, not the motor.
- **IK, spring chains and micro-texture at ≤ 24 px.** Sub-pixel motion and texture offsets turn
  into boiling noise.
- **24-frame idles** for small sprites. Use 2–4 key poses.
- **The 6-step ramp per material as a fixed rule.** At 16 px, 3–4 steps per ramp is the usual
  budget; take the recipe, choose the count in STYLE.md.
- **Any code copy without notices.** If the owner ever allows a copy, it needs the MIT notice
  plus the Apache-2.0 notice for PCG32 and the fdlibm notice.

---

## 9. Licence

**Fact.**
- `LICENSE`: MIT, © 2026 idlerunner00.
- `THIRD_PARTY_NOTICES.md`:
  - **PCG32** port, Apache-2.0 (`Core/Math/Random.cs:10-14`);
  - **fdlibm**-derived kernels, Sun Microsystems permissive notice (`Core/Math/DMath.cs`);
  - FNV-1a, SplitMix64 and Lemire's method (public algorithms);
  - Godot (MIT) and the .NET SDK, downloaded only by the Windows launcher;
  - a statement that there are "no premade sprite packs or AI images".
- The round-cone intersector is credited "after Inigo Quilez"; his articles page states no licence.
- The sample images in our repo are our own renders, made by our driver from upstream code (MIT).

**Opinion: what may be copied.**
- Legally, MIT allows copying with the notice; PCG32 adds Apache-2.0 obligations, and DMath the
  fdlibm notice.
- **Recommendation: copy nothing.** Ideas only, re-implemented clean-room in TypeScript, because:
  - the stack differs (C# vs TS);
  - the maths model differs (doubles vs integers);
  - every useful idea above fits in a few lines of our own code.
- Suggested line for `research/README.md` "Licence flags" (for the caller to integrate):
  "procedural-pixel-creatures: MIT (+ Apache-2.0 PCG32, fdlibm notice); fine to reference, ideas
  only by choice."

---

## 10. Open questions for the owner

1. **A smooth-primitive creature path?**
   - Should animals, pets and monsters in the sims get smooth SDF primitives (round cone + smooth
     union) inside the voxel-sprite-baker?
   - Or stay with boxes and the planned primitives until the art spike verdict (OC-A2-pick)?
   - *My recommendation:* add the two primitives to the voxel builder only if the voxel spike's
     chibi or pets look like stacked beads; no separate fourth pipeline.
2. **Creature size budget.**
   - Will the sims have creatures larger than 16×24 (pets, mascots, bosses at 24–48 px)?
   - This pipeline's style only pays off from about 30 px.
3. **Breeding and genetics.** Is creature breeding a game mechanic we want, in the sims or later?
   It decides whether genome files, linkage crossover and locks matter at all.
4. **Mirrored facings.** Accept mirroring the side facing (the light flips), or render both sides
   so the light stays top-left?
5. **Uncurated review seeds.** Make a fixed, never-edited review seed list a standing rule for
   every generated asset (§8.1 item 6)?
6. **Floats in offline tools.** Is floating-point OKLCH maths acceptable in a palette-building
   tool whose output JSON is checked in, with `render()` staying integer-only?
7. **Copying policy.** Confirm "ideas only, clean-room" for this repo even though MIT would allow
   copying with notices.

---

## 11. Sources

- Target repo at `24d26df10e9f0d369f1caf5b6ba0e8e724ec0888`. Files read:
  - `README.md`, `LICENSE`, `THIRD_PARTY_NOTICES.md`, `docs/ARCHITECTURE.md`;
  - `Core/Rendering/*`, `Core/Palettes/*`, `Core/Math/*`;
  - `Core/Families/*`, `Core/Framework/*`, `Core/Genetics/*`, `Core/Motion/*`, `Core/Export/*`;
  - `tests/Core/CoreTests.cs`, `tools/core_harness/Program.cs`, `scripts/*`;
  - `addons/procedural_creatures_plantfolk/Core/*`.
- Docker run outputs: `research/scans/2026-10-02-procedural-pixel-creatures/samples/` (sheets,
  `stats.tsv`, driver source); harness report (17/17 pass, linux-arm64).
- Scan: `research/scans/2026-10-02-procedural-pixel-creatures/TRIAGE.md`, `root.md`, `scripts.md`.
- zfedoran/pixel-sprite-generator, README and source (MIT): https://github.com/zfedoran/pixel-sprite-generator
- yurkth/sprator, README (MIT): https://github.com/yurkth/sprator
- Inigo Quilez, ray-surface intersectors: https://iquilezles.org/articles/intersectors/
- Björn Ottosson, "A perceptual color space for image processing" (OKLab): https://bottosson.github.io/posts/oklab/
- PCG, a family of better random number generators: https://www.pcg-random.org/
- WZ context: `docs/DECISIONS.md` (D12, D13, D16–D20), `research/code-graphics.md` §2–3,
  `research/voxels.md` §3 and §5, `research/ref-nms-procgen.md` §3.9, and the task notes
  asset-kit-core, asset-render-cli, art-spike-2d, art-spike-voxel and voxel-sprite-baker.
