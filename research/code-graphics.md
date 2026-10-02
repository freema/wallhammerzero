# Graphics from code, written by an LLM (Claude Opus 5.5): research for Wallhammer Zero

Date: 2026-10-02 · Scope: 2D pixel art (main), with a section on 3D voxel/toon graphics where it overlaps · Status: research only; nothing here is a decision.

**Legend used throughout**
- **[S]** sourced fact. I read the primary source (repo, post, spec, docs) and the link is given.
- **[R]** reported by a creator or by secondary coverage. I could not check it against the original (most x.com posts return HTTP 402 to fetches).
- **[O]** my opinion or inference. Treat it as a hypothesis to test.

---

## Executive summary

1. **The evidence is real but thin and curated.** Three builds are documented well enough to learn from: the "Clawd: Mannered Prose" development journal, JohnHeibel's PDoomVideo and ClaudeAnimationBase, and Simon Willison's kākāpō source, which I read myself. Most other evidence is highlight-reel posts. The largest list only includes posts with ≥5k views, and it says attribution was "not independently reproduced" [S]. Treat "one-shot" claims as marketing.
2. **Strengths: Opus 5.5 builds whole visual systems in code.** In the kākāpō page (45,880 bytes, no image files) it wrote palette-letter sprite grids, 6 palette variants, 5 poses derived by row operations, a 4×4 Bayer-dithered sky, a bitmap font and beat-synced choreography in one pass [S]. Jake Eaton's paintings use ~7,500 lines of code that emulate brush styles [R].
3. **Weaknesses: composition at tiny sizes, timing, and motion that looks mechanical.** At 32×32 the Ciyo rabbit's hug "reads as two white bars" [S]. ClaudeAnimationBase says timing "is the rule models get wrong most often" and adds that code moves "every part at once, on the same curve, by the same amount" [S]. The model cannot watch motion or hear audio. It judges stills and numbers [S].
4. **The render→inspect→revise loop is where the quality comes from.** The best-documented 15 s cartoon took 9 still passes, 5 full renders, about 70 stills and 3 contact sheets to fix about 21 visual problems [S]. Its lesson: "a still check finds layout errors, and only a number check finds motion errors" [S].
5. **Review at three zoom levels plus numbers.** Contact sheet (the whole piece), strip (every frame of one moment), crop (detail), plus numeric lints [S]. For pixel art, add a 1× in-game-context view and an integer-upscaled view [O].
6. **Opus 5.5's vision limits shape the tooling.** It sees images as 28×28 px patches, up to 2576 px on the long edge or 4784 patches. Images under 200 px are unreliable. Animated GIFs show only their first frame [S]. So every review image has to be integer-upscaled and tiled into sheets, and a GIF is never a review format.
7. **Recommended representation: a hybrid.** A TypeScript program is the source of truth. Small palette-letter ASCII "stamps" are allowed for hand-placed detail. PNGs, sprite sheets and atlases are build outputs. Opus 5.5 picked this split by itself for the kākāpō, and voxel-musou uses it for its 20×20 portraits [S].
8. **Determinism is non-negotiable.** Every frame should be a pure function of (params, seed, t). Simulation RNG stays separate from visual RNG, and per-element randomness comes from a stable hash. Re-renders are checked byte-for-byte. All three serious codebases do this [S].
9. **Style as code beats style as prose.** That means a locked indexed palette with hue-shifted ramps, plus a primitive library the model must use (raster, outline, ramp shading, ordered dither, rig, easing, FX). Anti-aliasing, gradients, sub-pixel positions and blur are forbidden [O, backed by the constraints community pixel-art prompts settled on, S].
10. **Anthropic's skills have three patterns worth copying.** A seed navigator with a parameter panel (`algorithmic-art`). "Philosophy first, then refine rather than add" (`canvas-design`). Utilities plus machine validators (`slack-gif-creator`). Some of their advice is wrong for pixel art: thick anti-aliased lines, bicubic rotation, dithered colour quantisation [S + O].
11. **The tooling is small and needs almost no dependencies.** A PNG encoder is node:zlib `deflateSync` plus `crc32`, and indexed PNG is ideal for palette-locked art. APNG is now part of the W3C PNG 3rd Edition. GIF89a needs a ~150-line LZW encoder or `gifenc` (9 KB, MIT). One TS module that renders into a `Uint8Array` runs unchanged in Node and in the studio [S + O].
12. **3D uses the same loop, with cameras as the fixed points.** Named fixed shots, turntables, a dev render endpoint, seed contact sheets and geometry assertions. sakura-crossing's lesson: "a clean console means nothing, and neither does a screenshot". voxel-musou's coloured boxes → vertex-coloured flat-normal meshes, and toon ramps with hue-shifted shadows, are good templates [S].

---

## 1. Evidence: what Opus 5.5 does well and badly

### 1.1 Case table

| Case | What was made | How: representation and loop | Status | What we learn |
|---|---|---|---|---|
| **Jake Eaton** (Anthropic) | Four paintings in the styles of different painters | "every image here is a python program generated pixel by pixel. there is no image model, and no off-the-shelf art software. instead, it's about 7,500 lines of code…" emulating brush styles with standard libraries. The agents "don't use any pictures as reference, instead working only from what they know about each painter." The thread opens with "for the past few months i've been asking our models to paint." | [R]: tweet text via search snippets and coverage (newfacedesign, ohmyopus, The Rundown); x.com returns 402 | Style = a large reusable *library* of procedural brushes, refined over months and across models. It is not a prompt. |
| **Voxyz_ai**, "small print" | 29 s narrative animation | Opus 5.5 wrote the story, drew the frames in JavaScript and synthesised the music in Python, all in one `index.html`. The model then reviewed the rendered video frame by frame. Tool reported: HyperFrames. "i didn't write a single line of code." | [R] (newfacedesign, awesome list `cases.json`) | End-to-end pipeline. The review method is claimed but not documented. |
| **Simon Willison**, kākāpō party | Interactive pixel-art party with ≥20 birds, confetti, disco ball; later a 15 s MP4 | One prompt plus three reference photos. Output: one 45,880-byte HTML file, one canvas, no images or fonts. **Source read by me:** the bird is an 18-px-wide, 21-row grid of palette letters (`K` outline, `G/D/L/H/Y` greens…). 3 green × 2 face palettes = 6 variants. Poses (STAND, SQUASH, UP, DOWN, PUFF) are *derived* by row operations (`widen()` for squash, duplicated rows for stretch, swapped leg rows). Wings are mirrored in code. 4×4 Bayer dither for the night sky and moon halo, a custom bitmap font with macrons, 124 BPM choreography. The video came from a separate Claude Code session driving Playwright. | [S] post + source. I could not open the claude.ai transcript, so whether the art itself went through a render loop is **unknown**. | The model chose the hybrid "grid stamps + code that derives frames and variants" by itself. A palette-swap system came for free. |
| **MindGate_dev** | 25 s animation: a character breaks a rolling boulder with a bomb (Japanese prompt) | A **hand-drawn** 45×45 pixel character, "rigged and animated by Claude Opus 5.5". "All art and sound made with code, refined over feedback rounds". The listing marks `reference_assets: true`. | [R] (jasonzhu.ai, `cases.json`) | A realistic split: human draws the key sprite, the model rigs, animates and adds FX. [O] In the published thumbnail, the trees and boulder use a different pixel density from the character ("mixels") and have soft painterly gradients. That is a classic consistency failure. |
| **Ciyo**, 32×32 test | "a white rabbit hugging a black chess rook, facing right", ≤8 colours, SVG | SVG of 1×1 `rect`s on an integer grid. **Four** render→inspect cycles (draft, revision, gap/paw patching, hand-composed version), "a little over a minute". Exact 32×32, 629 filled pixels, 6 of 8 colours. Failure: "the rabbit's hug reads as two white bars across the rook… A pixel artist would cheat the pose." 26,444 bytes against a PNG of "a few hundred bytes". | [S] | The model satisfies hard constraints well and composes poorly at tiny sizes. In Ciyo's words, the feedback loop is "the main reason the result holds together". |
| **az9713 "Clawd: Mannered Prose"** | 15 s, 1920×1080 cartoon with a synthesised score | Opus 5.5, medium effort, Claude Code. p5.brush sprites are painted **once** with fixed seeds, then each frame is `renderFrame(i)`, a pure function of `t = i/24`. Clawd is drawn from a pixel grid. Check loop: tiled stills, asset and pose sheets, a motion check (jumps >40 px, >0.15 scale, >12° lean or >45° arm between frames), ffprobe, `cmp` of frame 0 across two renders, and a second "advisor" model. **9 still passes, 5 full renders, ~70 stills, 3 contact sheets, ~21 visual fixes, ~298k context tokens, ~70 min build.** "Most time went into check-and-fix, not into first drafts." | [S]: full development journal in the repo | The best quantitative picture of the loop. Each check exists because a class of error needed it. |
| **JohnHeibel PDoomVideo + ClaudeAnimationBase** | 156.6 s music video (~3,760 frames); a starter kit | Two generations, the second a revision. Opus wrote `STORYBOARD.md` and an `ANIMATION_GUIDE.md` "to brief the subagents it ran in parallel". Frames "render in parallel and out of order. Every shot must be a pure function of `t`". Review uses `--sheet`, `--strip` and `--crop`. The kit's README: "the reasoning level corresponds to how 'extravagant' and detail-oriented the model makes the scene"; test videos used xhigh. | [S] | The most transferable rules: timing ("the rule models get wrong most often"), "avoid twinning", "a sign that repeats the story is the classic failure", and an explicit review budget. |
| **Community pixel prompts** (Majid Manzarpour's wizard; Rikuo's meteor dodger) | Pixel animations in Canvas2D | Fixed logical resolution (128×96; 160×90) blitted at the largest integer scale. `imageSmoothingEnabled=false`. Fixed palette (~24 and ~32 colours). "No sub-pixel positions, anti-aliasing, gradients, or shadowBlur." Pose parameters. Motion quantised to an ~8–12 fps look inside a 60 Hz loop. Pooled particles with colour-transition tables, deterministic 1–2 px shake, hit-stop. | [S]: prompt text on jasonzhu.ai | The constraint set practitioners settled on. Most of it carries over directly. |
| **victormustar**, horse | Galloping horse, 128×96, 12 poses, "inverse kinematics… without a single image" | Canvas2D | [R] (ohmyopus) | [O] In the thumbnail the silhouette and leg arcs read well, but the body shading is blocky and patchy. Structure is strong and surface finish weaker. |
| **yugen_matuni**, knight | Side by side: "完全手打ち" (fully typed by hand, i.e. code only) vs "リファレンス＋手修正" (reference plus hand correction) | Not published | [R] (thumbnail labels; the aggregator calls the right one "skill-assisted", which looks like a mistranslation) | [O] The code-only knight is clean and readable but flatter and less detailed than the reference-assisted one. |
| **Sprite Fusion** (Hugo Duprez) | Looping pixel-art Halloween diorama for a lofi video | Opus 5.5 Extra High, ~10 min. "much better than what an LLM could have done before". It put fire under rain. | [S] | Physical-logic slips. Slow for an interactive loop. |
| **developedbyed** | Pixel-art test, Opus 5.5 vs GPT-6 Astra | Astra "ends up looking so damn generic". Highlights: the fountain water and the cave bat eyes. | [R] | Anecdotal comparison. |
| **Anthropic launch post** | — | A tester had several Claude models build a game from one prompt, and "Opus 5.5 scored higher than any other model on the strength of its graphics and polish." | [S] (vendor claim) | No visual benchmark is published. |
| **Latent Space roundup** | — | Sholto Douglas on 3D perception: "a serious step up"; the model "can see now; it was a bit blind before". | [R] | Points to better visual self-review. Not measured. |
| **a16z**, "The next frontier of visual AI is code" (Yoko Li) | Essay | Code-native vs pixel-native generation; Code→Render→Inspect→Revise as test-time compute; "A rendered image of a chair is not a chair." Does not discuss Opus 5.5. | [S] | Framing only. |
| **Render-in-the-Loop** (arXiv 2604.20730) | SVG generation research | Open-loop "blind drawing" struggles "to reason about partial canvas states and implicit occlusion relationships". Applying the visual loop "naively to off-the-shelf models is suboptimal" without their training. | [S] | Caveat: the loop is not magic. It helps only if the model can map a visual error back to the line of code that caused it. That paper uses open-weight models. The Opus 5.5 build logs suggest a frontier model can do this mapping [O]. |

### 1.2 What Opus 5.5 does well (evidence-backed)

- **Turning a look into a system.** Palettes as data, ramps, dithering matrices, bitmap fonts, particle systems, beat clocks, state machines (kākāpō [S], the wizard and meteor prompts [S]), and painterly brush libraries (Eaton [R]).
- **Complete, self-contained programs.** Single-file HTML with zero assets (kākāpō, Voxyz, Sakura Crossing's 4,397-line Canvas2D texture module) [S].
- **Hard constraints.** Exact grid, colour cap, transparency (Ciyo [S]); exact colour, verified by measuring the mean colour of Clawd's body, 215,119,87 [S].
- **Fixing what it can measure or see in a still.** Reversed text, off-screen labels, pivot bugs, layering, scale (the Clawd list of 21 fixes [S]).
- **Writing its own process documents and briefs for subagents.** STORYBOARD and ANIMATION_GUIDE in PDoom [S]. This matters for a "generator" that hands work from one session to the next.
- **Procedural geometry in 3D.** Voxel characters as box lists with joints, cel-shaded towns with no image assets (voxel-musou, sakura-crossing [S]).

### 1.3 What Opus 5.5 does badly or cannot do

- **Composition and readability at tiny sizes.** Ciyo 32×32 [S]. [O] Expect this to be the main problem at Kairosoft scale (16–32 px characters).
- **Timing and acting.** "Everything moves at one brisk speed, events pile on top of each other, and moments are over before anyone understands them" [S]. In Clawd, about 20 arm jumps between frames looked fine in every still and were caught only by the numeric motion check [S].
- **Mechanical motion.** Twinning (both arms or eyes in sync, crowds bouncing in unison), constant-speed lerps, all parts moving at once [S].
- **Too much text.** "Models overuse text… A sign that repeats the story is the classic failure" [S].
- **Blind spots it cannot close by itself.** It "cannot watch motion and… cannot hear". Motion and comedy timing were "not verified" by the model [S].
- **Consistency of pixel scale and medium.** [O] Mixed pixel densities and soft gradients in the MindGate background. Flat or blocky shading in the code-only knight and the horse.
- **World logic.** Fire burning under rain [S].
- **Pipeline brittleness.** Escaping bugs when editing JS through two layers of shell quoting; platform-specific ffmpeg glob support [S]. Sakura Crossing: bugs "that threw nothing, logged nothing and looked fine in a screenshot" [S].

### 1.4 Hype vs evidence

- **Selection bias.** The awesome list includes posts with ≥5,000 views and states "Model attribution is as stated by each creator and was not independently reproduced" [S]. Coverage itself calls these "a highlight reel… multiple attempts precede posted successes" [R].
- **"One-shot."** OrcaRouter's analysis of PDoomVideo: "the work was not one pass". The second generation was "a revision rather than a restart". No one published attempt counts or token totals [S].
- **"N% great / M% garbage" claims.** I found **no primary source** that measures a hit rate for Opus 5.5 visual output. Treat any such ratio as anecdote. [O] Measure our own: approve rate per asset kind (FX, tiles, UI, characters) in the studio. My prior is high for FX, tiles and UI and low for characters on the first pass.
- **Effort and cost.** Clawd: ~298k context tokens and ~70 min for 15 s of video, with 5–6 min per full render [S]. Sprite Fusion: ~10 min per scene [S]. ClaudeAnimationBase: higher reasoning effort gives more elaborate scenes [S].

---

## 2. Best practices

### 2.1 The render → inspect → revise loop

**What the documented builds do [S]**
- **Pure frames.** `frame = f(params, seed, t)`, with no state carried between frames, so frames can render in parallel, out of order, and repeat exactly (PDoom, ClaudeAnimationBase, Clawd).
- **Determinism check.** `cmp` of frame 0 across two renders (Clawd).
- **Three zoom levels** (ClaudeAnimationBase):
  - **sheet:** first, middle and last frame of every shot;
  - **strip:** *every* frame of one moment (turns, takes, jumps, transitions);
  - **crop:** full-resolution detail (faces, contacts).
- **Timing read from sheets at a fixed step.** Every 0.1–0.15 s. Count the frames each "read" gets; 24 frames = 1 s.
- **Numbers for motion.** Per-frame pose deltas with thresholds. About 30 jumps were found; 5 deliberate impacts remained (Clawd).
- **Budget.** "At least one sheet per shot, a strip for every key motion and transition, and a crop for every face that carries the story… this is cheap: don't skip it."
- **Iteration counts seen:** 4 passes for a 32×32 still (Ciyo); 9 still passes plus 5 full renders for 15 s of animation (Clawd).
- **Second pair of eyes.** An advisor model told the builder to read the final contact sheet it had skipped, and found a 17.4° lean jump in the builder's own motion log (Clawd).
- **3D:** a dev render endpoint with named camera shots, and time stepped by hand because `requestAnimationFrame` does not fire headless (Sakura Crossing). See §6.

**What to add for pixel sprites [O]**
- **1× in context.** The sprite on a real game background, at the game's real zoom, next to approved neighbours. Readability is judged here.
- **Integer-upscaled sheet.** Nearest-neighbour ×8 (×12–16 for ≤16 px sprites), PNG only, one cell per frame, labelled with frame index, seed and parameter preset.
- **Diagnostic views, each one image, rendered automatically:**
  - **silhouette:** all opaque pixels black on white, to check readability;
  - **value:** greyscale, to check contrast;
  - **onion skin:** previous frame tinted under the current one;
  - **frame diff:** changed pixels highlighted, to catch unwanted "boil" or jitter;
  - **palette-swap test:** the asset in 2–3 alternative ramps, to catch hard-coded colours.
- **Pixel lints, numbers instead of eyes:**
  - every pixel's index is in the asset's palette slots;
  - orphan pixels (single isolated pixels);
  - outline gaps;
  - "pillow shading" heuristic: shading that follows the outline concentrically instead of the light direction;
  - colour count per sprite;
  - baseline and pivot drift between frames;
  - opaque-area change between frames (volume preservation);
  - bounding box within cell;
  - tile seams (see §2.6).
- **Stopping rule.** About 3 passes for a static asset and about 5 for an animated character, then stop and produce **variants** for the owner to choose from rather than polishing forever. Calibrate these numbers from studio data.
- **Context hygiene.** Each large sheet costs ~1.5–4.8k visual tokens (§5.3), and the 15 s Clawd film used ~298k context tokens [S]. Use subagents for heavy visual review where the work can be split. PDoom briefed parallel subagents with a written guide [S]. Clawd deliberately did not, because each step depended on the previous image [S].

### 2.2 Style as code

- **Locked, indexed palette** [O]. Assets reference palette *slots* (for example `skin.2`, `outline`, `accent.red`) and never raw hex. This makes palette swaps, seasons, team colours and night tints free. The kākāpō does it with letter→colour maps [S]. Sakura Crossing keeps "one place for every colour", with a deliberately narrow palette and saturated accents "reserved for focal objects" [S].
- **Ramps with hue shift.** Shift hue about 20° between swatches, warming toward the highlights. Saturation peaks in the mid-tones. Value steps get smaller near full brightness (Slynyrd) [S]. The 3D version of the same idea: Sakura's toon ramp tints shadows "toward a cool violet… that hue shift in shadow is most of what separates 'anime cel' from 'low-poly 3D'" [S].
- **One global light direction**, for example top-left, as a constant in the style library. Shading is computed from per-part normals or height hints → ramp index, never painted ad hoc [O].
- **Outlines.** A dark outline vs a selective outline (selout: the outline is a darker step of the adjacent fill). Which one applies is a style-bible decision, and the library enforces it [O]. Ink and line rules in the reviewed repos are equally explicit ("one shape, one outline", ClaudeAnimationBase [S]).
- **Dithering only through ordered patterns** (Bayer 2×2/4×4) at controlled transitions such as sky gradients and glows. The kākāpō does exactly this [S]. No error-diffusion dithering on sprites [O].
- **Forbidden primitives:** anti-aliased paths, gradients, `shadowBlur`, sub-pixel positions, arbitrary-angle rotation of small sprites (community prompts [S]; reasoning in §2.3 [O]).
- **Brush and stroke libraries as reusable style.** Eaton's ~7,500 lines of brush emulation [R]; the paint/ink/hatch vocabulary in PDoom [S]. For us the "brushes" are pixel primitives: clusters, highlight dabs, outline styles, material patterns (wood grain, tiles, fabric) [O].

### 2.3 Parametric characters and rigs

- **Parts plus pivots plus pose parameters → frames.** Majid's wizard: "Parameterized pose (staff angle, arm raise, head tilt, robe sway)" [S]. ClaudeAnimationBase's `clawd(x, y, u, {dy, sq, rot, aL, aR, eyes, mouth, hat, view…})` [S]. voxel-musou's officers are "written as data — a model def and a moveset" [S].
- **Pivots matter.** Clawd's arm nubs rotate about the *outer* edge of the body. A known bug: "arms that turn about a point inside the body disappear into it" [S].
- **Views are drawn, not projected.** "Everything is flat 2D. Never project 3D… Clawd turns through drawn key views (front → 3/4 → side → back 3/4 → back)" [S].
- **Pixel-specific [O].** Rotating 16–32 px parts by arbitrary angles produces broken lines (rotsprite-style artifacts). Prefer:
  - pre-drawn angle variants (0°/45°/90°) or 90° steps;
  - stamp swaps (open/closed hand, 3 eye states) plus 1-px offsets for bobbing;
  - squash as row and column insertion or removal, as the kākāpō's `widen()` does, instead of scaling.
- **Expressions as small swappable stamps.** Clawd has 8 eye modes [S], ClaudeAnimationBase 31 emotions [S]. Mood changes "never snap between faces" [S].
- **Model sheets as first-class outputs.** ClaudeAnimationBase ships `emotions.jpg` and `views.jpg`, rendered from code as loops [S]. Every character should have an auto-rendered model sheet (views × expressions × palette variants) that the studio shows and the next session reads [O].

### 2.4 Animation craft at low fps

- **Principles, as written for code** (ClaudeAnimationBase [S]): anticipation, squash and stretch that keeps volume, slow in/out, weight, arcs, overlap and follow-through, avoiding twinning, exaggeration ("subtle reads as nothing"), strong key poses first, show the thought (eyes lead), secondary action.
- **Volume-preserving squash.** `sx = 1/√sy` (Clawd) [S]. The slack-gif-creator helper does the same approximately [S].
- **Follow-through in a pure-function world.** Blend the last 3 frames' raw poses with weights 0.55/0.30/0.15. It "stays a pure function of t, because it only calls rawPose at earlier times" [S].
- **Timing is written down before animating.** "Write the reads": each read gets a start, an end and time to land; "one read at a time"; "fast actions, slow meanings" [S]. For game sprites, the equivalent is a **timing table per clip** (frame index → hold in ms or in game ticks) instead of uniform fps [O].
- **Low-fps look.** The community prompts quantise motion to an 8–12 fps feel even in a 60 Hz loop, with 4-frame walk cycles and 1–2 px squash [S]. Saint11's tutorials cover walk, run, jump, impact, smear frames and easing for pixel art [S].
- **Blocking first.** "Within a shot, block the key poses first and check them as stills. Add the motion between them once they read" [S].

### 2.5 FX

- **Catalogue from the reviewed builds [S]:**
  - pooled particles with colour-transition tables (white → yellow → orange → dark);
  - integer shake (1–2 px, deterministic);
  - hit-stop and slow motion;
  - full-frame flash wash (`flash(k, colour)`);
  - iris reveals;
  - comic sound-effect words that pop, wobble and fade (`sfx()`);
  - emotes (sweat, `!`, `?`, `!?`, hearts, zzz) used instead of captions;
  - confetti bursts on input (kākāpō).
- **FX as data, not baked frames [O].** An emitter is a parameter record (spawn shape, count, palette ramp over life, velocity, gravity, lifetime, frame stamps), plus a seed. The studio can put sliders on it and the game runtime can replay it from data. This fits "games are pure data".
- **Kairosoft staples to plan for [O]:**
  - floating numbers and labels (bitmap font, rise plus palette-step fade);
  - sparkles (4-point star stamps, 3–5 frames);
  - "level up" bursts;
  - popularity hearts;
  - dust puffs;
  - money pops;
  - screen flash on big events.
  - Keep each readable over busy tiles: outline it or put a 1-px dark shadow under it.
- **Physical logic as a checklist item** (fire under rain [S]).

### 2.6 Seamless tilesets

- **Tile counts** [S] (boristhebrave): 2-edge Wang = 16, 2-corner (marching squares) = 16, blob = 47, 3-corner = 81. Rotation and mirroring cut marching squares from 16 to 6. CR31's interpretations show the same count can give "quite different looks and behaviour".
- **Generator approach [O].** One function `tile(mask, seed)` instead of 47 hand-made tiles. Detail is placed by `hash(x, y)` so the same map cell always gets the same variant, with low-probability decorations to break repetition.
- **Seam checks as images and numbers [O].** Render each tile 3×3 wrapped, and render a random 16×16 map. Numerically compare edge pixel columns between tiles that should match.
- **Projection is an open question** (top-down oblique vs isometric). It changes the whole tile scheme (§8).

### 2.7 Consistency across a large asset set

- **One style library and one palette file. Every asset imports them** [O].
- **Exemplar sheets** that every new asset is compared against: model sheets, a "lineup" (new asset at 1× next to 5–10 approved ones), and a scale guide [O]. ClaudeAnimationBase: "Look at the model sheets first" [S].
- **Regression on library changes [O].** When a primitive or palette changes, re-render every approved asset and pixel-diff it against its approved PNG. Changed assets go back to the owner flagged "changed by library", not "approved".
- **Written guide for parallel sessions.** ANIMATION_GUIDE.md in PDoom was written by Opus *for its own subagents*, with a shared-files rule ("Only edit your own chapter file… if you find a real bug in a shared file, report it; don't edit it") [S].

### 2.8 Handling variance: variants plus a human pick

- **Seeds as a navigation axis.** `algorithmic-art` requires seed prev/next/random/jump, "Same seed ALWAYS produces identical output", and a "Gallery Mode that shows thumbnails of multiple seeds side-by-side" [S].
- **[O] Studio flow:**
  - Each request yields 4–9 variants, from seeds and named parameter presets, as one grid.
  - The owner picks or rejects and comments.
  - The verdict pins `{assetId, generatorHash, libHash, params, seed}`. A later session can reproduce exactly what was approved, or branch from it.
- **[O] Say "reject" in specific words.** Ask the owner for a reason tag (readability, scale, palette, motion, timing, on-model, logic). Those tags become the lint backlog.

### 2.9 Readability over the literal brief

- "A pixel artist would cheat the pose to keep both characters readable" (Ciyo) [S].
- "One focal action at a time… Stage it with a clear silhouette" and "If the key poses don't read, the motion won't fix it" (ClaudeAnimationBase) [S].
- [O] Make "readable at 1× in context" the first acceptance criterion in the skill. Let the model change a pose, prop or proportion when doing so serves the read, and record the change in the asset's notes.

---

## 3. Representations an LLM can author

| Representation | LLM authoring | Git diffs | Regeneration and variants | Studio live sliders | Determinism | Human hand-edit | Verdict |
|---|---|---|---|---|---|---|---|
| **A. Raw pixel grid as text** (one char per pixel; letters → palette slots) | Good for small, hand-placed detail (faces, icons ≤32 px). Weak for large areas, where row alignment drifts [O]. Validators help: voxel-musou asserts every portrait is 20×20 and every char is in the palette [S]. | Excellent: line diffs show exactly which pixels changed | Poor: every variant is another grid | None, except palette swaps | Perfect | Easy, in a text editor or with a tiny grid-editor widget in the studio | Use for **stamps** only |
| **B. Drawing program** (TS that rasterises shapes, ramps and patterns into an indexed buffer) | Strong. This is where the model is best: rules, symmetry, parametric parts (kākāpō helpers, Eaton's brushes, voxel `sculpt`) | Good, as semantic diffs ("arm length 6→7") | Excellent: seeds plus params | Excellent: the params *are* the sliders | Good if RNG is seeded and hashed | Edit numbers. Painting individual pixels needs an override layer | Use for **structure, frames, variants, FX, tiles** |
| **C. Hybrid** (B as source of truth; A as stamps; post-pass pixel overrides allowed) | Best of both. This is what Opus 5.5 produced for the kākāpō [S] | Good | Excellent | Excellent | Good | Yes, through stamps and an override file | **Recommended** |
| **D. SVG or vector rects** | Workable (Ciyo) | Noisy: 26 KB of `<rect>` for 32×32 [S] | Poor | Poor | Good | Poor | Avoid. The owner also excluded SVG. |
| **E. Canvas2D path drawing** (`arc`, `fill`) | Easy | Good | Good | Good | **Risky**: anti-aliasing and rasterisation can differ between browsers and GPUs, and AA breaks palette lock [O] | Poor | Use only for previews and UI, not for game art |
| **F. Image model, then pixelate** | — | Binary blobs | Re-prompt only | No | No | — | Out of scope (owner decision) |

**Where outputs live [O]:**
- Source = generator TS + stamps + overrides + params, in git.
- Outputs = PNG frames, sprite sheets, atlas JSON and previews. They are build artifacts, reproducible from source. Whether to commit them is an owner question (§8).
- Approved outputs need a stable, diffable snapshot (an approved PNG plus its hash) so library changes can be detected.

**Token economics [O]:**
- A 32×32 grid is ~1.1k characters.
- A 4-frame 32×32 animation as raw grids is ~4.5k characters.
- A program that derives those frames and 6 palette variants can be smaller than one grid, and it does not grow with frame count. This is the main reason B/C scale to "a large asset set" and A does not.

---

## 4. Anthropic's official skills: patterns worth copying

Read from `github.com/anthropics/skills` (shallow clone, nothing executed).

| Skill | What it does | Copy | Do not copy |
|---|---|---|---|
| **algorithmic-art** | p5.js generative art: write an "algorithmic philosophy" `.md` first, then a single-HTML viewer from a fixed template | **Seeded randomness** ("Same seed ALWAYS produces identical output"). A `params` object designed from "what qualities of this system can be adjusted?" (quantities, scales, probabilities, ratios, angles, thresholds). A **template with FIXED vs VARIABLE regions**, so every viewer has the same UX. A seed navigator (prev/next/random/jump) and a gallery of seeds. "90% algorithmic generation, 10% essential parameters". | Anthropic branding rules. A free-form "philosophy" with no checks. p5.js from CDN as the runtime. |
| **canvas-design** | Static posters and art as PNG/PDF: a design-philosophy `.md`, then a canvas | Philosophy first, as a **style bible**. A forced **second pass**: "avoid adding more graphics; instead refine what has been created… If the instinct is to call a new function or draw a new shape, STOP." Boundary checks: "nothing falls off the page and nothing overlaps". | "Never… cartoony" (Kairosoft *is* cartoony). Repeated "masterpiece" exhortations, which are no substitute for measurable checks. No explicit render-and-look step. |
| **slack-gif-creator** | GIFs via PIL plus a small toolkit | **Toolkit plus validators.** `validate_gif()` checks hard constraints (size, frames, fps). **Easing library** (ease in/out, back, bounce, elastic), `apply_squash_stretch`, `calculate_arc_motion`, near-duplicate frame removal. A catalogue of motion concepts (shake, pulse, bounce, spin, fade, slide, zoom, particle burst). Constraints first: size, fps, colours, duration. | "Use thicker lines… width=1 look choppy" (wrong for pixel art). Bicubic rotation. Colour quantisation with dithering. Gradients. All break pixel-art palette lock. |

**Also worth copying from non-Anthropic repos [S]:**
- ClaudeAnimationBase's `render.mjs` modes (`--sheet`, `--strip`, `--crop`, `--crop-at`, `--loop`) and the `?loop=` scrub URLs in its studio page.
- Clawd's `--motion` numeric check and `--sheet assets|poses`.
- Sakura's `__shot(name, w, h, camera)` endpoint and its list of named "camera positions worth keeping".

---

## 5. Tooling

### 5.1 Node, zero or minimal dependencies

- **PNG** (PNG 3rd Edition, W3C Recommendation 2025-06-24 [S]):
  - Layout: 8-byte signature, `IHDR`, optional `PLTE`/`tRNS`, `IDAT` (zlib-compressed scanlines, each prefixed with a filter byte), `IEND`. Every chunk has a CRC-32.
  - `node:zlib` provides `deflateSync` and `crc32()` [S: current docs]. [U] I believe `crc32` arrived in Node 22.2 / 20.15; check the project's Node version. A minimal encoder is roughly 50–80 lines [O].
  - **Indexed PNG** (colour type 3 with `PLTE` and `tRNS`) matches palette-locked art. Files are tiny, and palette compliance is checkable by reading the file back [O].
- **APNG** is now part of the same W3C spec: `acTL`, `fcTL`, `fdAT` [S]. Animated previews keep exact colours and full alpha [O].
- **GIF89a** (spec: w3.org/Graphics/GIF/spec-gif89a.txt):
  - Pieces needed: an LZW encoder with variable code size, plus a Graphic Control Extension for delay (centiseconds), transparency index and disposal. Roughly 150 lines [O].
  - Alternative: **gifenc**, "9KB before GZIP", no dependencies, Node and browser, MIT. Its own README says "No dithering", which is exactly what pixel art wants [S].
  - [U] Browsers commonly clamp very short GIF delays (≤1 cs) up to ~10 cs. Keep frame delays ≥2 cs.
- **Sprite sheets and atlas** [O]: pack frames into a grid, padded or extruded by 1 px to avoid bleeding, plus `atlas.json` with frame rectangles, pivots, durations and tags. The game runtime reads only the PNG and the JSON, so the data stays swappable to Godot later.
- **Contact sheet and preview compositor** [O]: nearest-neighbour integer upscale, grid layout, a 1-px gutter, a checkerboard or key colour behind transparency, and labels drawn with our own bitmap font (no font dependency). This is the most important tool in the loop.
- **Avoid native canvas packages** (node-canvas/Cairo, skia-canvas, @napi-rs/canvas) for game art [O]. Native builds are fragile, and their anti-aliased rasterisers are not what we want. **Headless Chrome via Playwright or Puppeteer** is needed only for WebGL/3D captures and for studio screenshots. PDoom, Clawd and Willison all used it for video [S].

### 5.2 Browser: the studio and the runtime

- **One isomorphic generator module [O].** Generators write into `Uint8Array` index buffers plus a palette. Node encodes PNG from that. The browser blits it with `ImageData` → `putImageData` to a canvas or uploads it as a WebGL texture. Output is the same everywhere, sliders can call the generator live (in a Web Worker with `OffscreenCanvas` if it is heavy), and the PNG approved in the studio is byte-identical to the one the CLI produces.
- **Display rules** [S, from community prompts and the kākāpō]: `imageSmoothingEnabled = false`, CSS `image-rendering: pixelated`, integer scale only. In WebGL: `NEAREST` filtering, no mipmaps for pixel art, and the camera snapped to integer pixels at the logical resolution [O].
- **Determinism:**
  - Seeded PRNG (voxel-musou's mulberry32).
  - Separate `rng` (simulation) from `vrng` (visual only: "Never feed it back into the sim").
  - `hash01(a, b, c)` "for procedural detail that must not consume RNG state" [S].
  - ClaudeAnimationBase gives each element its own boil seed, or "one moving thing makes everything drawn after it jitter" [S].

### 5.3 How Claude Code looks at its renders

- **The Read tool shows PNG/JPG to the model as images.** The Clawd harness relied on this: "open PNG/JPG files as images" [S].
- **Vision constraints for Opus 5.5** (Anthropic vision docs) [S]:
  - Images are processed in **28×28-px patches** ("visual tokens"), costing `⌈w/28⌉ × ⌈h/28⌉`.
  - Opus 5.5 is in the **high-resolution tier**: max long edge **2576 px**, max **4784** visual tokens. Larger images are **downscaled**, which resamples and blurs pixel boundaries.
  - Accuracy drops on "very small images under 200 pixels".
  - GIF and WebP are accepted, but "**Animations are unsupported, and only the first frame is used.**"
  - Lossy compression "can introduce artifacts that are detrimental to model performance".
- **Rules that follow [O]:**
  - Never show the model a raw 16–48 px sprite. Integer-upscale it (×8 is a good default; ×12–16 for ≤16 px), as **PNG**.
  - Keep each review image within ~2576 px on the long edge and ~3.7 MP so it is not downscaled. Example: 16 frames of 32×32 at ×8 in an 8×2 grid = 2048×512 px ≈ 74×19 = 1,406 tokens.
  - Turn animation into **strips and sheets**. A GIF or APNG is for the owner, not for the model.
  - Label every cell (frame number, seed, preset). Put the 1× in-context view and the upscaled view in the same review set.
  - Calibrate once: render a test sheet with known planted defects (orphan pixel, 1-px outline gap, off-palette pixel, 1-px baseline jitter) at ×4, ×8 and ×16, and record which zoom the model reliably catches each defect at. The skill then fixes the zoom per defect class. Defects too small to see are caught by the lints in §2.1.

---

## 6. 3D graphics from code: voxels and toon, where it meets this topic

The owner wants 3D voxel games too. The first one is a Light No Fire-like seeded planet with no external assets. Other agents analyse sakura-crossing and voxel-musou in depth. This section only covers what changes about "graphics from code" in 3D.

### 6.1 Building blocks the LLM writes well (from the repos) [S]

- **Voxel builders** (voxel-musou `src/core/voxel.js`, 124 lines):
  - `boxesGeometry(boxes)` merges coloured boxes `{s, p, c, r, skip}` into **one vertex-coloured, flat-normal BufferGeometry**.
  - `sculpt(boxes, v, jitter)` rasterises boxes into a voxel grid. Later boxes overwrite, `c: -1` carves, `paint` boxes only recolour. It emits **only exposed faces** and adds per-voxel shade jitter from `hash01(i, j, k)`.
  - A `quad(..., k)` hook bakes per-corner brightness (ambient occlusion).
  - Characters are box lists per **joint**, so rigs move parts, not vertices.
- **Characters as data.** A def-kit = `build()` (parts per joint), `chains()` (cloth, hair, tassels as spring chains), a palette and an FX palette, plus a moveset table. The "generator instead of model" idea applied to 3D.
- **Generators instead of models, places as table rows** (sakura-crossing). `makeShop(ctx, {x, z, w, d, face, kind, floors, wall, roof, awning, noren, shutter, lit, seed, …})` is called once per row of a WEST/EAST table. Dozens of shopfronts come from one generator plus data.
- **Procedural textures via Canvas2D.** "Every sign, fascia, lantern and price strip… is drawn at runtime with Canvas2D — there is not one image asset in `src/`" (`textures.js`, 4,397 lines).
- **Toon or cel shading.** `MeshToonMaterial` with hand-authored ramps of 2–5 bands, using `NearestFilter` data textures. The toon BRDF is patched so shadow bands are **hue-shifted toward cool violet**. High-key "soft" ramps are used for pale masses. Blossom does not receive shadows, because a ramp only shapes direct light.
- **Outlines in two layers.** A screen-space ink pass from the **second difference of linearised depth**: "flat across any planar surface no matter how oblique, so it fires only on real silhouettes and real creases". Plus **inverted-hull** outlines for hero props, offset in clip space for a constant pixel width.
- **One palette file** (`palette.js`) for sky, light, ink, ground, materials and accents.

### 6.2 The render→inspect→revise loop in 3D [S + O]

- **Render endpoint, not screenshots** [S]. Sakura's dev server mounts `POST /__shot`, and `window.__shot(name, w, h, {pos, yaw, pitch | orbit, dist, tilt, ink:false})` writes `.shots/name.jpg`, which the model then reads. `requestAnimationFrame` does not fire in a headless pane, so time is **stepped by hand** (`world.update(1/60)` × N) before shooting.
- **Fixed camera shot list** [S]. "Camera positions worth keeping… use them before and after any change that could touch them." That is dozens of named establishing shots, one or more per district. This is 3D's version of a regression contact sheet.
- **Pass toggles** [S]. Shots with ink off or grade off isolate which pass causes an artifact.
- **Geometry assertions instead of eyes** [S]:
  - Sakura answers "can this be seen?" with a raycast in Node, no browser.
  - Connectivity is checked with flood fills: "a notice board sealed the only way into the new alley… Found by flood fill; invisible in every frame."
  - voxel-musou's `check.mjs` asserts finite poses for every clip frame, valid hit windows, and 20×20 palette-valid portraits.
- **Additions for voxel assets and planets [O]:**
  - **Turntable sheet:** 8 or 16 yaw angles, fixed pitch and light, one image per asset.
  - **Orthographic model sheet:** front, side, top and 3/4 views.
  - **Pose sheet:** key poses per clip.
  - **Seed contact sheet:** planet or biome seeds 1..N as small orbit shots, to judge variety and to catch degenerate seeds.
  - **Scale lineup:** the asset next to a reference character and a 1 m cube.
  - **Numbers:** triangles, draw calls, ms per frame, voxel count; for planets, the ratio of land, water and each biome.
- **Shared with 2D [O].** The same palette and ramp tokens (hue-shifted shadows in both), the same seed discipline, the same verdict format and the same studio views (grid of variants, sheet, strip). One "graphics from code" skill can cover both, with a 3D appendix that points to the voxel research.

---

## 7. Recommendations for Wallhammer Zero (proposal only)

### 7.1 Representation

1. **Hybrid source:**
   - **TS generators** draw into indexed buffers using a shared style library.
   - **ASCII stamps** (palette-slot letters, validated sizes) hold hand-placed detail.
   - An optional **override layer** holds per-pixel fixes, from the owner or the model, applied after generation and kept as data.
2. **Outputs are build artifacts:** indexed PNG frames, a sprite sheet with `atlas.json` (rectangles, pivots, per-frame durations, tags), APNG/GIF previews for humans, and review sheets for the model.
3. **Every asset is a pure function** `render(params, seed, t | frame) → indexed frames`. The generator declares a **params schema** (name, type, range, default) that the studio turns into sliders, and **named presets**.
4. **FX and simple motion stay as data** (emitter records, tween tables) so the runtime replays them. Characters and anything with pixel-level acting get **baked frames**.

### 7.2 Folder layout idea

```
art/
  STYLE.md                    style bible in prose: logical resolution, scale, light dir, outline rule, palette rules, do/don't gallery
  palette/                    locked palettes + named ramps (hue-shifted), slot names; per-game palette extensions
  lib/                        style-as-code primitives (raster, stamps, ramps/shading, outline, ordered dither,
                              rig/pose, easing/timing tables, FX emitters, tile bitmasks, seeded rng + hash)
  assets/<kind>/<id>/
    gen.ts                    generator: meta (id, kind, size, palette slots, params schema, presets) + render()
    stamps/*.txt              optional ASCII stamps (validated size + palette letters)
    overrides.json            optional per-pixel fixes, applied post-generation
    NOTES.md                  brief, the "reads", deliberate deviations from the brief, open issues
  exemplars/                  approved model sheets / lineups that new work must match
verdicts/<id>.json            studio-written: status, chosen seed+preset+params, generator/lib hash, reason tags, comments
build/                        reproducible outputs (frames, sheets, atlas.json, previews)
  review/<id>/                model-facing images: sheet@8x, strip, crop, silhouette, value, diff, in-context@1x, lint.json
tools/                        CLI: render, sheet, lint, png/apng/gif encoders, regression diff
```

### 7.3 Inspection loop

1. **Brief → reads.** Write in `NOTES.md` what must be understood at 1× (who, what action, what mood) before drawing.
2. **Block out.** Silhouette and key poses only. Review the silhouette sheet and the 1× in-context view.
3. **Build.** Generator plus stamps. Lints must pass before the model looks at anything (palette, orphans, outline gaps, baseline/pivot drift, area change, bbox, seams).
4. **Look.** Sheet@8x (all frames), strip for every key motion, crop for faces, value and diff views. Fix and repeat, within a **pass budget** (draft: 3 for static, 5 for animated).
5. **Variants.** Render 4–9 seeds and presets as one grid and stop.
6. **Studio.** The owner approves, rejects or comments, with reason tags. The verdict pins seed, params and hashes.
7. **Next session.** Read the verdicts first. Approved assets are only touched with the owner's consent. Library changes trigger regression re-renders and diffs.
8. **Optional second reviewer.** A fresh-context subagent judges the final sheets against `STYLE.md` and the exemplars without seeing the code, the role the Clawd advisor played [S].

### 7.4 Skeleton of our own "graphics from code" skill (headings, one line each)

1. **Purpose and scope.** Pixel-art sprites, animations, FX, tiles and UI for Wallhammer games, generated as code. 3D/voxel is covered in an appendix.
2. **Non-negotiables.** Palette slots only, integer grid, no AA/gradients/blur, seeded and pure `render()`, outputs are build artifacts.
3. **Read first.** `STYLE.md`, the palette, the exemplars of this asset kind, and this asset's verdict history.
4. **Brief → reads.** Write what must read at 1× in game context before writing code. Readability beats the literal brief, and every deviation gets a note.
5. **Representation rules.** When to use code, when to use an ASCII stamp, when to use an override. Validators on stamp sizes and letters.
6. **Style library API.** Which primitives to use (and which are forbidden), light direction, ramps, outlines, ordered dither.
7. **Characters and rigs.** Part list, pivots, pose params, drawn views, expression stamps, palette variants. The model sheet is required output.
8. **Animation.** Per-clip timing tables, holds, anticipation, squash by row/column, smears, follow-through, no twinning, low-fps rules.
9. **FX.** Emitter-as-data schema, the Kairosoft FX catalogue, palette-over-life, readability over busy backgrounds.
10. **Tiles.** Bitmask scheme, `hash(x, y)` variation, wrap and seam checks.
11. **Render and look.** CLI commands for sheets, strips, crops, silhouette, value, diff and 1× in-context views, with zoom rules from the calibration.
12. **Lints.** The list of numeric checks with thresholds. Fix anything they flag before looking.
13. **Pass budget and stopping rule.** Number of passes, when to stop polishing and produce variants.
14. **Variants and handoff.** Seeds, presets, variant grid, what to write in `NOTES.md` for the owner and the next session.
15. **Verdicts.** Read and write format, never overwrite approved work, regression on library changes.
16. **Known failure modes.** Gallery: mixels, pillow shading, twinning, text overuse, unreadable hugs, world-logic slips, boil.
17. **3D/voxel appendix.** Box/voxel builders, toon ramps, outlines, shot list, turntables, seed sheets, geometry assertions, plus a link to the voxel research.

### 7.5 Experiments to run before committing (cheap) [O]

- **Vision calibration sheet** (§5.3): which zoom catches which defect.
- **Representation bake-off:** the same 32×32 character as (a) pure grid, (b) pure program, (c) hybrid. Compare first-pass quality, pass count, tokens, diff readability, and how it holds up under 3 owner revisions.
- **Small pilot set:** 1 character (idle/walk/work), 1 FX (level up), 1 tile family (floor + wall), 1 UI panel, each through the full studio loop. Measure approve rate and passes per kind, to replace hype numbers with ours.

---

## 8. Open questions for the owner

1. **Target pixel scale.** Logical resolution, character sprite size (Kairosoft-like 16–32 px chibis?), game zoom levels, and the projection (top-down oblique vs isometric). This decides the tile scheme.
2. **Palette policy.** One global palette (for example 32–64 colours) shared by all 2D games and the voxel games, or one per game? Are palette swaps (night, seasons, team colours) a planned feature?
3. **Committing outputs.** Should generated PNGs and atlases be committed (diffable approvals, larger repo) or regenerated on demand (requires strict determinism across Node and browser versions)?
4. **Hand edits.** Will you ever paint pixels yourself? If yes, the stamp and override layer needs a round-trip editor in the studio.
5. **Animation model in the runtime.** All baked frames, or baked frames plus data-driven tweens (bob, squash, FX)? Which fps feel (8, 10 or 12)?
6. **Reference material.** Are your own sketches or mood boards allowed as model input (MindGate- and Willison-style references)? How close may we get to the "Kairosoft look" before it becomes imitation?
7. **Review budget.** How many variants per pick, and roughly how many tokens or minutes per asset are acceptable? May a second reviewer model or subagent pass judgement before you see the work?
8. **Studio sliders.** Is it acceptable that the studio executes generator TS live (in a worker) to drive sliders, with the same module the CLI uses?
9. **Text.** Do we need bitmap fonts made from code (Czech diacritics, Japanese)? Is in-world lettering wanted, or should we follow the "no text, use emotes" rule?
10. **One skill or two.** Should the "graphics from code" skill cover 2D and 3D with a shared core (palette, seeds, verdicts, loop), or should voxels get a separate skill?

---

## 9. Sources

**Primary or near-primary (read)**
- Simon Willison, "Kākāpō party" post: https://simonwillison.net/2026/Sep/26/kakapo-party/
- Kākāpō party artifact (source read): https://tools.simonwillison.net/kakapo-party
- az9713, Clawd "Mannered Prose" repo and development journal: https://github.com/az9713/opus-5.5-musical-cartoon · https://az9713.github.io/opus-5.5-musical-cartoon/DEVELOPMENT-JOURNEY.html
- JohnHeibel, PDoomVideo (STORYBOARD.md, ANIMATION_GUIDE.md): https://github.com/JohnHeibel/PDoomVideo
- JohnHeibel, ClaudeAnimationBase (ANIMATION_GUIDE.md, render modes): https://github.com/JohnHeibel/ClaudeAnimationBase
- Ciyo, "Can Claude Opus 5.5 generate images?": https://ciyo.ai/blog/can-claude-opus-5-5-generate-images
- Sprite Fusion, Opus 5.5 for pixel-art scenes: https://www.spritefusion.com/blog/opus-5-5-for-pixel-art-scenes
- Anthropic skills repo (algorithmic-art, canvas-design, slack-gif-creator): https://github.com/anthropics/skills
- Anthropic, Claude Opus 5.5 announcement: https://www.anthropic.com/news/claude-opus-5-5
- Anthropic, Vision docs (patches, tiers, GIF first frame, small images): https://platform.claude.com/docs/en/build-with-claude/vision
- Liang et al., "Render-in-the-Loop: Vector Graphics Generation via Visual Self-Feedback", arXiv 2604.20730: https://arxiv.org/abs/2604.20730
- a16z (Yoko Li), "The next frontier of visual AI is code": https://a16z.com/the-next-frontier-of-visual-ai-is-code
- voxel-musou (src/core/voxel.js, rng.js, chars/check.mjs): https://github.com/mike007jd/voxel-musou
- sakura-crossing (CLAUDE.md, README.md, NEXT.md, src/core/toon.js, outline.js, palette.js, textures.js, world/shop.js): https://github.com/Kenton-GMI/sakura-crossing
- W3C, PNG Specification (Third Edition), includes APNG: https://www.w3.org/TR/png-3/
- Node.js zlib docs (`deflateSync`, `crc32`): https://nodejs.org/api/zlib.html
- gifenc: https://github.com/mattdesl/gifenc
- GIF89a specification: https://www.w3.org/Graphics/GIF/spec-gif89a.txt
- Slynyrd, Pixelblog 1, colour palettes (hue shifting): https://www.slynyrd.com/blog/2018/1/10/pixelblog-1-color-palettes
- Saint11 (Pedro Medeiros), pixel art tutorials: https://saint11.art/blog/pixel-art-tutorials/
- Boris the Brave, "Classification of Tilesets": https://www.boristhebrave.com/2021/11/14/classification-of-tilesets/

**Prompt and case aggregators (reported, not reproduced)**
- awesome-opus-5.5-video README and cases.json: https://github.com/zhuyansen/awesome-opus-5.5-video
- jasonzhu.ai prompt pages: MindGate_dev https://jasonzhu.ai/en/prompts/claude-opus-5-5/2103712991409774609 · Majid wizard https://jasonzhu.ai/en/prompts/claude-opus-5-5/2102476258948927543 · Rikuo meteors https://jasonzhu.ai/en/prompts/claude-opus-5-5/2102515055116063144 · yugen_matuni knight https://jasonzhu.ai/en/prompts/claude-opus-5-5/2102623847166116294 · Opus vs Astra cheetah https://jasonzhu.ai/en/prompts/claude-opus-5-5/2103120423005425972
- TripoGrowthLab awesome-opus-5-5-prompts: https://github.com/TripoGrowthLab/awesome-opus-5-5-prompts
- ohmyopus motion collection: https://ohmyopus.com/en/s/motion

**Secondary coverage**
- newfacedesign, "Opus 5.5 paints, animates and scores music with code alone": https://newfacedesign.com/blog/claude-opus-5-5-art-animation-from-code
- OrcaRouter, kākāpō demo analysis: https://www.orcarouter.ai/blog/claude-opus-5-5-kakapo-pixel-art-demo
- OrcaRouter, "video plan one shot" analysis: https://www.orcarouter.ai/blog/claude-opus-5-5-video-plan-one-shot
- Latent Space AINews, Claude Opus 5.5: https://www.latent.space/p/ainews-claude-opus-55-the-new-default
- Pasquale Pillitteri, Opus 5.5 motion design (not reachable during research): https://pasqualepillitteri.it/en/news/19007/opus-5-5-motion-design-video-en

**Original posts (x.com returns HTTP 402 to fetches; content known only through the sources above)**
- Jake Eaton: https://x.com/jkeatn/status/2102441348075057539
- Voxyz_ai: https://x.com/Voxyz_ai/status/2102531681450119426
- MindGate_dev: https://x.com/MindGate_dev/status/2103712991409774609
- developedbyed: https://x.com/developedbyed/status/2102522318559858721
- victormustar horse: https://x.com/victormustar/status/2102707412704919910
- yugen_matuni knight: https://x.com/yugen_matuni/status/2102623847166116294
