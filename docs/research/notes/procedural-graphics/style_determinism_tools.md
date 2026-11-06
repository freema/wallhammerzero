# Art direction for fully procedural content (3D pixel art first), cross-platform determinism, and tooling for assets-as-code

Scope note: the user's target changed twice during this research. The **final target** is the most achievable good-looking style, with **"3D pixel art"** (low internal resolution plus nearest-neighbour upscale) as the preferred candidate, partly for performance. Photorealism is explicitly **out of scope**. A3 keeps the realism evidence briefly, to record why. Parts B and C are unchanged. The search budget was exceeded (about 35 tool calls) because of the two scope changes. Several primary sources could not be fetched (t3ssel8r's own explanation, Lucas Pope's TIGSource devlog text, Kate Compton's original essay, A Short Hike's GDC talk), and this is flagged where it applies.

---

## A1) "3D pixel art": low-res 3D rendering with nearest-neighbour upscale, palette, outlines and stable pixel snapping

### Takeaway
3D pixel art is a well-trodden, achievable style for a small team. The recipe: render the 3D scene at a low internal resolution such as 640×360 into an offscreen target with no MSAA/TAA, apply toon/quantised lighting and a 1-px depth+normal edge-detect outline, then upscale by an **integer factor with nearest-neighbour**. The hard part is temporal stability. Shimmer and "pixel creep" are solved for **orthographic, non-rotating** cameras by snapping the camera to the texel grid and re-adding the sub-texel remainder as a screen-space offset after upscale. **Perspective cameras and free camera rotation have no clean solution.** The newest research (Texel Splatting, 2026) proposes one with open trade-offs. This argues for a fixed-angle orthographic or near-orthographic camera, which constrains GTA-style third-person driving, a real design tension to flag.

### Cited Findings
**Core technique and why it suits procedural assets**
- A Short Hike (Adam Robinson-Yu): "I wanted to see if I could make a beautiful (and readable) 3D world using as few pixels as possible." The style led to "flat cohesive shading and no anti-aliasing", and objects got a soft outline to stay readable at low resolution. Low resolution "can help the world feel lush, and let your imagination fill in the details." Because some players disliked the pixelation, he added a **pixel-size option**, and 4K output is available on PS4 Pro/PS5 — [PlayStation Blog](https://blog.playstation.com/2021/08/05/crafting-a-tiny-open-world-a-look-behind-the-scenes-at-the-creation-of-a-short-hike/)
- The low-res "pixels" and simple models let Robinson-Yu expand the game's scope despite limited art skills — [Wikipedia: A Short Hike](https://wikipedia.com/wiki/A_Short_Hike). Recreations describe the method as rendering the main camera to a downscaled render texture, then scaling it up without anti-aliasing — [Arcade Flight Sim write-up](https://j-red.github.io/arcadeflight). Palette-reduced textures plus a colour-grading post shader is an unconfirmed community guess — [itch.io comment](https://itch.io/post/2065934)

**Stability: snapping, sub-pixel offset, orthographic vs. perspective**
- Recipe from a Godot 4.3 3D pixel art write-up (t3ssel8r-inspired): snap the camera to a **view-aligned grid with one-texel cells**. This removes pixel creep but makes motion choppy. Then shift the rendered output back in screen space by the snap error to restore smooth motion. Remaining pitfall: moving through a low-res 3D scene causes "swimming and creeping and jittering of pixels" — [David Holland, "3D Pixel Art Rendering"](https://davidholland.netlify.app/articles/3d-pixel-art-rendering)
- Texel Splatting (Dylan Ebert, arXiv, March 2026): under orthographic projection every pixel shifts by the same amount, so one snap fixes all of them. Under perspective, pixels at different depths drift at different rates, and "no single snap corrects all depths." The proposed fix renders geometry into a cubemap from a grid-snapped fixed probe origin, shades per cubemap texel, and splats each texel as a world-space quad. Cubemap indexing gives rotation invariance and origin snapping gives translation invariance. Limitation: a fixed origin can't see all geometry, so disocclusion at probe boundaries is an open trade-off — [arXiv 2603.14587](https://arxiv.org/abs/2603.14587)
- "Snapping to a grid is what makes the pixel colors stable", and moving objects flicker by default — [UPixelator docs (Unity asset)](https://github.com/Radivarig/UPixelator_Documentation)
- Non-integer scaling causes shimmer, because each source pixel's on-screen size changes with its viewport position — [Pixel Art Smooth Camera and Anti-Aliasing](https://apples-moonflowergames-com.pages.dev/articles/pixel-art-smooth-camera-anti-aliasing). Standard fixes: integer-scale offscreen target, point sampling, no MSAA, vertex-shader pixel snap — [bugnet debugging guide](https://bugnet.io/blog/how-to-debug-pixel-perfect-2d-rendering-issues). Even with stable pixels, the camera snapping can show as a slight stutter — [Otavio Peixoto, 3D Pixel Art](https://otaviopeixoto1.github.io/portfolio/3DPixelArt)
- Godot practice: render a low-res SubViewport and upscale with nearest-neighbour. A 45° orthographic view needs about √2 vertical scale to keep proportions, which can misalign lines — [Godot forum](https://forum.godotengine.org/t/pixel-perfect-orthographic-camera-and-physics-side-effects/47415); [Godot forum: voxel jitter](https://forum.godotengine.org/t/displaying-a-voxel-based-world-pixel-perfectly-but-experiencing-jitter/100025)
- Commercial implementations exist (Unreal "low resolution rendering with native upscaling and snapping to eliminate pixel creep and jitter", with outline materials; Godot Pixel Renderer with Sobel edges and Bayer dithering), which shows the technique is mainstream — [Fab listing](https://www.fab.com/listings/816f34f2-1a2e-4910-b3dd-009b5da0873b); [bukkbeek Pixel Renderer](https://bukkbeek.itch.io/pixel-renderer)

**Outlines, lighting and effects at low resolution**
- Outlines: edge detection on screen depth and normals with a 4-texel kernel (up, down, left, right) keeps lines 1 px thick. Depth drives object outlines and normals drive edge highlights, applied only on convex edges. Parameters need per-scene tuning, and "low-poly models with clear outer edges work best". Credited to t3ssel8r's early videos (around 2020) and Roystan's outline shader — [Holland](https://davidholland.netlify.app/articles/3d-pixel-art-rendering)
- Toon lighting tricks: smooth the directional light attenuation to reduce shadow flicker from a slowly moving sun, and add noise to normals to reduce shadow popping on flat surfaces. Cloud shadows come from a global noise texture. Volumetric god rays as a fullscreen raymarch cost about 1.7 ms on a GTX 1060 laptop. Grass is billboard quads lit from the mesh base — [Holland](https://davidholland.netlify.app/articles/3d-pixel-art-rendering)
- A Short Hike uses a soft outline for readability at low resolution — [PlayStation Blog](https://blog.playstation.com/2021/08/05/crafting-a-tiny-open-world-a-look-behind-the-scenes-at-the-creation-of-a-short-hike/)

**Dithering / palette quantisation (Return of the Obra Dinn)**
- A screen-fixed dither made solid shapes shimmer ("a wiggling mess of pixels") when the camera moved. Lucas Pope's fix mapped the dither pattern onto a **sphere centred on the camera/player head**. This pins the dither to geometry under rotation, but not under translation. He tuned a "rings" mapping, since a square texture can't tile a sphere perfectly. The game uses an 8×8 Bayer matrix and a 128×128 blue-noise field — [Set Side B summary of the TIGSource devlog](https://setsideb.com/?p=5672); [MetaFilter thread](https://www.Metafilter.com/170872/man-this-dithering-is-stable-as-shit-total-magic-going-on-here); [Alan Zucconi Shader Showcase](https://www.alanzucconi.com/?p=10365)
- A follow-up technique, "Surface-Stable Fractal Dithering" (Rune Skovbo Johansen), inspired by Obra Dinn, attaches dither to surfaces — [runevision](https://runevision.com/tech/dither3d)

**HD-2D (Octopath Traveler) as a related "pixel + modern lighting" style**
- Producer Takahashi: the team first tried full pixel-style art, but it looked fake and low-quality compared to their vision. HD-2D sets pixel sprites against a 3D environment lit with modern rendering (Unreal: depth of field, lighting) — [Siliconera](https://www.siliconera.com/project-octopath-traveler-developers-answer-project-started-troubles-developing-hd-2d/); [Unreal Engine spotlight](https://www.unrealengine.com/spotlights/octopath-traveler-s-hd-2d-art-style-and-story-make-for-a-jrpg-dream-come-true); [Nintendo Everything](https://nintendoeverything.com/octopath-traveler-devs-on-character-origins-visual-style-initial-hd-rumble-plans-much-more/)
- Dragon Quest HD-2D producer Hayasaka: pixel characters on 3D backgrounds technically *define* HD-2D, but the feel depends on an art director who understands the sensibility — [The Verge (via scour.ing)](https://scour.ing/@tyler/p/https://www.theverge.com/entertainment/840080/square-enix-hd2d-games-octopath-dragon-quest)

### Inferences
- **Performance**: fragment and post-processing cost scales roughly with pixel count. 640×360 is 1/9 of 1080p and 1/36 of 4K, which leaves large headroom for an M4 Pro on Metal and lower-end Linux/Windows GPUs. The vertex/geometry and CPU (streaming, simulation, draw-call) budgets do not shrink, so an open world still needs LOD, culling and instancing. The upscale itself is a trivial nearest-neighbour blit, which SDL_GPU's `SDL_BlitGPUTexture` with nearest filtering covers (API name from background knowledge; verify).
- **Why it suits procedural assets**: low resolution hides noisy or imperfect procedural surface detail and makes low-poly generated meshes look intentional. A constrained palette or quantised lighting makes outputs from different generators look cohesive. This is the main "oatmeal" and cohesion risk in an all-code pipeline. Texture generation can target tiny textures (e.g. 16–64 px per metre at a fixed texel density), which makes cooking fast and deterministic outputs small.
- **Texel density consistency**: keep a single world-space texel density in generated textures that roughly matches screen pixels at the typical camera distance (e.g. 1 texel ≈ 1 screen pixel). Otherwise generated textures alias or blur against the pixel grid. Mipmapping must be nearest or limited. This is a known pixel-art 3D rule of thumb with no single source found.
- **Camera tension with GTA-style gameplay**: the stable techniques assume orthographic, fixed-pitch, ideally fixed-yaw cameras. A free-orbiting perspective chase camera will shimmer. Options: (a) fixed-angle isometric/top-down camera like GTA 1/2, where the technique is solved; (b) quantised yaw rotation in steps, as some t3ssel8r-style demos appear to do (not verified); (c) accept some shimmer in perspective and use a slightly higher internal resolution (e.g. 960×540), possibly with a pixel-size option like A Short Hike; (d) experiment with Texel Splatting. This decision should be made early, because it constrains level scale, building heights and vehicle handling.
- **Determinism tie-in (part B)**: the snapped camera and quantised lighting make golden-image tests at native low resolution more meaningful. A 640×360 PNG is small enough for an AI assistant to inspect directly in the render→look→revise loop.

### Gaps
- No primary statement or write-up from t3ssel8r was found; all t3ssel8r references are secondary (Holland, forums). His YouTube videos are the primary source.
- Lucas Pope's TIGSource devlog was not fetched directly; Obra Dinn details are from summaries.
- No source found on how 3D pixel art games handle **perspective, free-rotating, fast vehicle cameras** in shipped products.

---

## A2) Other achievable stylised looks for procedural content (low-poly flat shading, toon), with developer statements

### Takeaway
Low-poly flat shading and toon/outline styles are explicitly chosen by small teams to cut content cost (no textures), speed iteration, and keep readability. Developers say the loss of texture detail is compensated with **lighting, fog and lines**. Both styles combine well with A1: 3D pixel art is essentially low-poly/toon rendered at low resolution.

### Cited Findings
- **Astroneer**: chose a style "realistically possible to achieve" for a small team (2 full-time artists), "something much more minimalistic" than their AAA backgrounds. Low-poly lets them "execute content relatively inexpensively" ("just a day or two" per game-ready asset). It "completely removed the necessity for creating textures", and the faceted terrain "requires no textures to achieve". Concept and in-game mesh are nearly the same thing, so iteration is fast — [Astroneer dev blog](https://blog.astroneer.space/?p=7)
- **Sable** (Shedworks, 2 people): low-poly, flat, Moebius-inspired. Flat shading left fewer tools, so they relied on lighting, fog and lines for readability and depth. Outlines are a "really useful tool" — [Game Developer GDC 2022](https://gamedeveloper.com/gdc2022/how-shedworks-refined-the-art-of-sable-in-pursuit-of-readability); [Cook and Becker](https://www.cookandbecker.com/en/article/170/exploration-through-line-art.html); [GDC Vault](https://gdcvault.com/play/1027721/The-Art-of-Sable-Imperfection)
- **Tiny Glade** (fully procedural building): began as a weekend procedural-wall generator. Opara describes the procedural rules as hand-crafted art — [80.lv interview](https://80.lv/articles/exclusive-tiny-glade-developers-discuss-bevy-proceduralism-publishers-cozy-games); procedural windows/roofs — [80.lv](https://80.lv/articles/procedural-windows-in-pounce-light-s-tiny-glade-get-an-upgrade/), [80.lv](https://80.lv/articles/a-look-at-procedural-tower-roofs-in-tiny-glade)
- **Teardown**: voxels with an 8-bit palette per volume (1 byte per voxel, up to 255 materials). Fragments inherit the parent palette. Shading variants eat palette slots (255 down to 28 usable). Simple voxel scenes made real-time ray tracing feasible — [Voxagon blog](https://blog.voxagon.se/2020/12/03/spraycan.html); [Wikipedia](https://en.wikipedia.org/wiki/Teardown_(video_game))
- **MouseBot** dev: stylised visuals let a team with one or two artists "cut a lot of corners" — [Vector Unit blog](https://vectorunit.com/blog-posts/2017/5/23/designing-mousebot-part-ii-toons-and-tech). Counterpoint: some studios would choose low-poly even with 40 people because they think it looks better — [Polylusion blog](https://polylusion-games-site.pages.dev/blog/polylusion-art-style)
- **Dreams**: Media Molecule struggled to find its "painterly" style and abandoned multiple renderers — [Media Molecule blog](https://www.mediamolecule.com/blog/article/alex_at_umbra_ignite_2015_learning_from_failure_video)

### Inferences
- For a code-only pipeline, flat/vertex-colour shading removes the hardest generator category (high-frequency photoreal textures) entirely. Colour comes from a palette lookup indexed by material ID plus a lighting band, which is trivially deterministic. Pairing it with a global palette/LUT and atmospheric fog gives the cohesion that Sable and Astroneer credit.
- A recommended stack for this engine: low-poly procedural meshes, vertex or palette colours plus tiny procedural textures at a fixed texel density, banded toon lighting with a few shadow steps, depth/normal outlines, distance fog/aerial perspective tinted by time of day, a final palette LUT/quantise, and optional surface-stable dithering, all rendered at 360p–540p with integer nearest upscale.

### Gaps
- No direct statements were gathered for No Man's Sky, Valheim, Outer Wilds or Firewatch.

---

## A3) Why photorealism is out of scope (brief record)

### Takeaway
Every realistic "procedural" world found relies on authored or scanned building blocks plus heavy rendering tech. Procedural rules do layout and placement. Faces, hair and motion remain unsolved even with capture. For a small team generating everything from code, photorealism is not achievable at GTA V quality, which supports the decision to go stylised.

### Cited Findings
- Matrix Awakens city: procedural rules in Houdini/UE5 assembled 7,000 buildings from "thousands of modular pieces" in a 16 km² city, plus 3D face scans and 4D capture (3Lateral) and MetaHuman crowds. Realism was credited to Nanite, Lumen GI, ray-traced shadows and TSR — [CGW](https://www.cgw.com/Press-Center/In-Focus/2021/The-Matrix-Awaits-in-The-Matrix-Awakens-An-Unrea.aspx)
- Horizon Zero Dawn procedurally *places* all vegetation (500+ asset types, 100k+ objects, about 250 µs GPU), but the placed assets are authored — [Guerrilla GDC 2017 slides](https://www.guerrilla-games.com/media/News/Files/GDC2017_VanMuijden_GPUBasedProceduralPlacementInHorizonZeroDawn.pdf)
- Ghost Recon Wildlands: a Houdini terrain/road pipeline built from scratch for open-world scale — [80.lv](https://80.lv/articles/landscape-and-material-pipeline-of-ghost-recon-wildlands/)
- MSFS 2020: outside about 400 photogrammetry cities, buildings are autogenerated by Blackshark.ai from footprints and imagery, and bad source data yields absurd results — [PC Gamer via PressReader](https://www.pressreader.com/usa/pc-gamer-us/20201229/284670439721263); [MSFS forums](https://forums.flightsimulator.com/t/best-examples-of-photogrammetry-in-msfs/560774/25)
- Substance Designer can produce photoreal materials fully procedurally, but production often uses scan hybrids, and unbroken procedural noise is "a dead giveaway" — [Evermotion](https://evermotion.org/articles/show/10637/oldest); [Polycount](https://polycount.com/discussion/comment/2261087)
- Faces are "orders of magnitude more challenging than realistic environments". Skin (SSS), eyes (refraction/moisture) and hair (hundreds of thousands of strands) are the sticking points, and motion raises expectations further — [Unreal tech blog](https://www.unrealengine.com/en-US/tech-blog/creating-realistic-digital-humans-using-ue4-livestream-recap); [Imaginary Worlds transcript](https://www.imaginaryworldspodcast.org/s/Stuck-in-the-Uncanny-Valley-transcript.pdf)
- Realism also requires calibrated PBR inputs, e.g. albedo kept within 50–243 sRGB and dielectric F0 around 4% — [Unity Dark Dielectrics guide](https://docs-alpha.unity3d.com/cn/2018.1/uploads/ExpertGuides/Dark_Dielectric_Materials.pdf); [Frostbite PBR slides](https://blog.selfshadow.com/publications/s2014-shading-course/frostbite/s2014_pbs_frostbite_slides.pdf)

### Inferences
- Procedural *placement*, *terrain*, *roads* and *city layout* techniques from these AAA pipelines transfer directly to the stylised target, and are easier there because primitives can be simple.

### Gaps
- No example was found of a fully code-generated photoreal open world.

---

## A4) Pitfall: procedural sameness ("10,000 bowls of oatmeal") and cohesion

### Takeaway
Variation that is mathematically unique but perceptually identical is the main failure mode of all-procedural content. Stylisation helps cohesion but does not fix sameness. That needs perceptually distinct variation tied to meaning (district identity, landmarks, gameplay).

### Cited Findings
- Kate Compton's "10,000 bowls of oatmeal": each oat differs in position and orientation, so each bowl is unique, yet users perceive them as the same — [Wikipedia: Procedural generation](https://en.wikipedia.org/wiki/Procedural_generation); [Emily Short](https://emshort.blog/2016/09/21/bowls-of-oatmeal-and-text-generation/) (variation matters when connected to mechanics); [Rabii & Cook, "Why Oatmeal is Cheap", FDG 2023](https://pyrofoux.github.io/why-oatmeal-is-cheap/why_oatmeal_is_cheap_fdg2023.pdf)

### Inferences
- In a low-res pixel style, small-scale variation such as surface noise is literally invisible below the pixel size. Variation must live at **silhouette, colour-block and layout scale** (roof shapes, building massing, palette per district, landmark placement). This makes generators cheaper, but it means the variation budget should go into large-scale structure.

### Gaps
- Kate Compton's original "So you want to build a generator" essay could not be located or fetched.

---

## B1) CPU floating-point determinism across compilers, OS and CPU (x86-64 vs ARM64)

### Takeaway
Bit-identical results across MSVC, clang and gcc and across x86-64 and ARM64 are achievable only for a **restricted subset**: IEEE basic ops (+ − × ÷ sqrt) with FMA contraction disabled, no fast-math, fixed evaluation order, and **your own transcendental implementations**. Platform libms (Apple, glibc, MSVC CRT) differ in the last ULP. Most shipped lockstep games either constrained platforms or used software or fixed-point math.

### Cited Findings
- Sources of divergence (Bruce Dawson): per-thread FPU state (rounding, x87 precision, denormal/FTZ) can be changed by injected DLLs, so assert it on all threads. Intermediate precision is unspecified by C/C++ and depends on compiler, `/fp`, `/arch`. `a+b+c` can be reordered, especially under `/fp:fast`. **FMA keeps an unrounded product**, so `a*b + c*d` can fail to give zero when it should; control it with `-ffp-contract`. rcp/rsqrt estimate instructions differ by vendor. `sin`/`cos` are not IEEE-specified. Libraries dispatch on CPU features. Debug vs. release differ — [Dawson, "Floating-Point Determinism"](https://randomascii.wordpress.com/2013/07/16/floating-point-determinism/)
- Dawson's recommendations: use only IEEE-defined ops for anything that must match; fix the FP environment and check it; avoid `/fp:fast`, FMA contraction and estimate instructions; implement transcendentals yourself; control order with parentheses and casts; initialise everything; serialise floats in binary. A one-ULP difference can flip branches, so epsilons don't fix divergence. The same binary on the same CPU is easiest — [Dawson](https://randomascii.wordpress.com/2013/07/16/floating-point-determinism/)
- Reader-reported cases (unverified, from Dawson's comments): Company of Heroes 2 used per-platform multiplayer because cross-compiler float identity was too hard; Spring RTS used **streflop** (software float) — [Dawson comments](https://randomascii.wordpress.com/2013/07/16/floating-point-determinism/)
- Glenn Fiedler's summary: "yes, if…" Determinism holds with the same compiler, same architecture and careful settings, while arbitrary C/C++ float code is not reproducible across compilers or debug/release. Battlezone 2 (Ken Miller) saw AMD vs. Intel differences in sin/cos/tan, fixed by wrapping them. Shawn Hargreaves: replays broke between Xbox and PC and after a compiler upgrade. Apple DTS: basic IEEE ops match across platforms with the same control settings — [Gaffer On Games](https://gafferongames.com/post/floating_point_determinism/)
- Platform libm differs in the last ULP between macOS, glibc, MSVC and wasm. One deterministic-physics crate therefore ships polynomial sin/cos and tests bit-identity across hardware FMA, software fma and wasm — [alice-physics det_math.rs](https://docs.rs/crate/alice-physics/1.2.0/source/src/det_math.rs)
- **Correctly rounded libm**: CORE-MATH binary32 functions are being upstreamed into glibc (2025 patch series by Zanella, reviewed by Paul Zimmermann). sinpif/acospif were verified correctly rounded for all binary32 inputs and all rounding modes, with benchmarks on x86-64 and aarch64 — [glibc patchwork sinpif](https://patchwork.sourceware.org/project/glibc/patch/20250131191844.2582716-14-adhemerval.zanella@linaro.org/); [acospif](https://patchwork.sourceware.org/project/glibc/patch/20250131191844.2582716-9-adhemerval.zanella@linaro.org/)

### Inferences
- Concrete C17 policy for generators:
  1. Compile generator translation units with `-ffp-contract=off -fno-fast-math` (clang/gcc; note that clang's default contraction differs by target) and `/fp:precise` on MSVC. Never use `-ffast-math` or `/fp:fast` in cook code.
  2. Ban `<math.h>` transcendentals in generator code. Provide `det_sin`, `det_exp`, `det_pow` and so on, built from +−×÷ only, or vendor CORE-MATH's portable C sources (correctly rounded means identical on every platform by definition). Apple libm and the MSVC CRT will not adopt CORE-MATH, so vendoring is required.
  3. Prefer integer and fixed-point arithmetic for anything that drives *discrete decisions* (placement counts, branch choices, topology), and use floats only for continuous attributes. A one-ULP flip in a discrete decision is what breaks content hashes.
  4. Avoid SIMD intrinsics with estimate instructions (`_mm_rcp_ps`, `vrecpeq_f32`), which differ between x86 and ARM. Avoid compiler auto-vectorised reductions that reorder sums.
  5. Run a **cross-platform golden-hash CI job**: cook a fixed seed set on macOS-ARM64, Linux-x86-64 and Windows-x86-64, then compare content hashes.
- An alternative to full determinism: make the cache key include the platform, or treat the cooked artefact as authoritative and ship it. Cross-platform determinism matters only if clients regenerate content and must agree with each other or with a server.

### Gaps
- No primary source was fetched for the current default `-ffp-contract` in Apple clang vs. upstream clang vs. gcc. Verify per toolchain.
- The current glibc release status of CORE-MATH functions is not confirmed.

---

## B2) GPU compute determinism across Metal, Vulkan and D3D12

### Takeaway
Cross-vendor bit-exact GPU results are **not guaranteed**. The Vulkan/SPIR-V spec defines transcendental precision as ULP or absolute error *bounds*, so two conformant drivers can legitimately return different bits. Generate anything whose hash or decisions must be reproducible on the CPU. Use the GPU only for (a) derived, non-authoritative data that is regenerated locally, or (b) kernels restricted to integer math or to IEEE basic ops with your own transcendentals, validated per vendor.

### Cited Findings
- The Vulkan SPIR-V environment specifies per-operation precision as correctly rounded, a ULP bound, or inherited from a formula. Exp, log and sin fall under bounded error — [Vulkan spec, Appendix A](https://registry.khronos.org/vulkan/specs/1.3/html/chap37.html)
- Example bounds: highp `exp` is (3 + 2·|x|) ULP, and highp `sin`/`cos` has 2⁻¹¹ absolute error on [−π, π] — [Vulkan CTS precision spec](https://fuchsia.googlesource.com/third_party/vulkan-cts/+/30e25b62d60b36b923d19a0c0759ef6cb7201f9e/doc/testspecs/GLES3/functional.shaders.builtin_functions.precision.txt)
- Halide disabled bit-exact accuracy tests on GPU backends because they "don't play nice without proper control over floating point optimizations". Vulkan `native_tan` compiles to hardware sin/cos/div approximations — [Halide PR #8566](https://gh.r-mj.com/halide/Halide/pull/8566)
- WebGPU discussion: Vulkan "does not require full IEEE semantics", and one participant proposed replacing driver math with browser-supplied implementations — [W3C public-gpu, Aug 2019](https://lists.w3.org/Archives/Public/public-gpu/2019Aug/0013.html)
- Counter-example of a shipped GPU procedural system: Horizon's GPU placement was designed to be "deterministic and locally stable" on a **single console GPU target** — [Guerrilla slides](https://www.guerrilla-games.com/media/News/Files/GDC2017_VanMuijden_GPUBasedProceduralPlacementInHorizonZeroDawn.pdf)

### Inferences
- With SDL_GPU, shaders are typically compiled from one source to SPIR-V, MSL and DXIL through different compilers (e.g. SPIRV-Cross/DXC/Metal compiler). Each can apply fast-math by default. Metal's compiler enables fast-math unless disabled, which is background knowledge to verify. That adds a second source of divergence on top of hardware.
- Pragmatic split: CPU worker threads produce the authoritative, hashed outputs (heightfields, placement lists, meshes, material parameter textures). The GPU does "visual only" expansion (grass blades, detail noise, decals) that never feeds back into gameplay or hashes. If GPU generation is needed for speed, use integer hash noise (no transcendentals), avoid derivatives and atomics with order-dependent float accumulation, and accept per-vendor golden images rather than cross-vendor hashes.
- Denormals: GPUs commonly flush denormals in fp32. Keep generator values away from the denormal range or flush explicitly on the CPU as well, by setting FTZ/DAZ consistently. That is an inference not verified for each API.

### Gaps
- No source found on the exact Metal (`-ffast-math` default, `precise::` namespace) and D3D12/DXIL precision guarantees. Those vendor docs were not fetched.

---

## B3) Hash-based and counter-based RNG for order-independent generation

### Takeaway
Use **stateless, counter/hash-based** randomness: `rand = hash(seed, cell_x, cell_y, layer, index)`. Results are then independent of thread scheduling, streaming order and generation order, which is exactly what multi-threaded streamed generation with content-hash caching needs. Squirrel Eiserloh's noise-based RNG, Philox (Random123) and SplitMix64-style finalisers are the established options.

### Cited Findings
- Eiserloh, "Math for Game Programmers: Noise-Based RNG" (GDC 2017, SMU Guildhall): a hash/noise function taking `(position, seed)` doubles as an RNG, with no stored state, suited to world and NPC generation — [GDC Vault](https://gdcvault.com/play/1024365/Math-for-Game-Programmers-Noise); [Squirrel3 Swift port description](https://swiftpackageregistry.com/heckj/Squirrel3)
- **Use SquirrelNoise5, not the talk's Squirrel3.** Eiserloh's later gist credits Peter Schmidt-Nielsen's analysis with finding a weakness in the GDC 2017 code — [Squirrel3 package notes / SquirrelNoise5 references](https://swiftpackageregistry.com/heckj/Squirrel3); [npm squirrel-noise-5](https://npmjs.com/package/squirrel-noise-5)
- Philox (Salmon, Moraes, Dror, Shaw, SC'11, "Parallel Random Numbers: As Easy as 1, 2, 3"): counter-based PRNGs where output = keyed bijection(counter). They pass TestU01 BigCrush and give ≥2⁶⁴ independent streams with period ≥2¹²⁸. Philox was faster than CURAND on GPU. The C/C++ implementation is Random123 — [paper PDF](https://users.cs.utah.edu/~hari/teaching/bigdata/random123sc11.pdf); [SC11 listing](https://sc11.supercomputing.org/schedule/event_detail.php-evid=pap274.html)
- Horizon's placement lists determinism and local stability as design requirements, the property that hash-per-location RNG provides — [Guerrilla slides](https://www.guerrilla-games.com/media/News/Files/GDC2017_VanMuijden_GPUBasedProceduralPlacementInHorizonZeroDawn.pdf)

### Inferences
- A recommended seed-derivation scheme (design inference): `world_seed`, then `seed_for(asset_kind_id)`, then `seed_for(cell_x, cell_y, lod)`, then `seed_for(layer_id)`, then `rand(index)`. Each step is a 64-bit mix such as a SplitMix64 finaliser or wyhash/xxHash3 over the packed tuple. Hash *stable string IDs* (e.g. "tree.oak.bark") rather than enum values, so reordering enums doesn't reseed the world. Also include a `generator_version` in the derivation only when output *should* change.
- Use integer-only RNG output, then convert to float as `(u >> 40) * 0x1p-24f` for float or `(u >> 11) * 0x1p-53` for double. This conversion is bit-exact on all platforms.
- PCG (O'Neill), SplitMix64 (Steele et al., OOPSLA 2014), xxHash and wyhash are standard and suitable, but their primary sources were not fetched this session. Cite pcg-random.org and github.com/Cyan4973/xxHash when finalising.

### Gaps
- No independent statistical comparison (TestU01/PractRand) of SquirrelNoise5 vs. a SplitMix64 finaliser vs. Philox was gathered.

---

## C) Tooling and workflow for assets-as-code

### Takeaway
The proven pattern, from demoscene tools to Houdini city pipelines, is: a **small operator vocabulary**, store **the recipe, not the pixels**, regenerate everything from rules on demand, plus a tight live-edit loop. In C17 that means hot-reloadable generator DLLs (cr.h), content-hash caching of cooked outputs keyed by (generator code hash, params, seed, version), a headless render-to-PNG harness, and golden-hash and golden-image CI.

### Cited Findings
- **.kkrieger / .werkkzeug (Farbrausch/.theprodukkt, Breakpoint 2004, 96 KB)**: the game stores "the individual steps employed by the artists to produce their textures and meshes" rather than the data, possibly about 300 bytes per texture at any resolution — [Wikipedia](https://en.wikipedia.org/wiki/.kkrieger); [gamedev.net "Procedural Content"](https://gamedev.net/blogs/entry/508015-book-i-procedural-content). Operator categories are generators (cell, noise, gradient), filters (blur, sharpen), combiners (add, multiply, blend) and effects (distortion). This is a community-written summary of the open-sourced werkkzeug3 — [DeepWiki werkkzeug3](https://deepwiki.com/jaromil/kkrieger-werkkzeug3/2.3-content-generation)
- **Houdini rules-based cities**: whole-city regeneration until the last day, built by a small core team — [CGW](https://www.cgw.com/Press-Center/In-Focus/2021/The-Matrix-Awaits-in-The-Matrix-Awakens-An-Unrea.aspx). Ghost Recon's roads were "operational quickly", which shows the power of a tool-driven pipeline — [80.lv](https://80.lv/articles/landscape-and-material-pipeline-of-ghost-recon-wildlands/)
- **Horizon**: placement rules are authored in a graph editor and executed by GPU algorithms, which keeps it data-driven and quick to iterate — [Guerrilla](https://www.guerrilla-games.com/read/gpu-based-procedural-placement-in-horizon-zero-dawn)
- **cr.h** (fungos): a single-header, MIT live-reload library for C. The host defines `CR_HOST` and loads a .so/.dylib/.dll exposing `cr_main(ctx, op)` with LOAD/UNLOAD/CLOSE/STEP. `CR_STATE` keeps statics across reloads. It is tested on Linux, macOS and Windows, and the last changelog entry is 2025-03-30 (moved to CMake) — [GitHub fungos/cr](https://www.Github.com/fungos/cr). It has been used to hot-reload procedural city generation in an engine editor — [Alex Dixon, polymonster blog](https://hn.jakechampion.name/reader/https://www.polymonster.co.uk/blog/live-reloading)
- Wildlands notes World Machine generation was "not fully deterministic", a practical warning that deterministic regeneration must be designed in from the start — [80.lv](https://80.lv/articles/landscape-and-material-pipeline-of-ghost-recon-wildlands/)

### Inferences
- **Cache key** = `H(generator_source_or_binary_hash ‖ generator_version ‖ canonical_params_bytes ‖ seed ‖ dependency_output_hashes ‖ platform_tag?)`. This mirrors Bazel/Nix-style action keys. Include dependency *output* hashes, not input hashes, so that a no-op change upstream doesn't invalidate downstream assets ("early cutoff"). Serialise params canonically in a fixed field order with floats as raw bits.
- **Hot reload loop**: generators live in `gen_*.dylib` modules with a stable C ABI (`gen_desc`, `gen_run(params, seed, out_arena)`). A file watcher rebuilds, cr.h reloads, the cache entries keyed by the old code hash invalidate, the asset viewer re-cooks visible assets on worker threads, and ImGui (cimgui) param panels write a params file that is itself hashed.
- **Headless review for the AI-assistant loop**: a CLI `cook --asset X --seed N --render turntable.png` that renders with SDL_GPU to an offscreen texture and writes PNG. Fixed camera rigs (front, 3/4, top, close-up), fixed HDRI/sun, and an albedo/roughness/normal debug contact sheet. That makes the output "lookable" by a model or a human in one image. The code-pixel-game skill's render→look→revise idea applies directly.
- **CI**: (1) golden *hashes* of cooked CPU outputs per platform, which must match across macOS-ARM64, Linux-x64 and Windows-x64 if B1 rules are followed; (2) golden *images* with a perceptual tolerance (FLIP or SSIM) per GPU vendor, because GPU output will not be bit-exact (see B2); (3) calibration lint, as in A2.
- **Node graph vs. code**: the demoscene and Substance show graphs suit artists. With an AI assistant writing C, code with a small operator library (`op_noise`, `op_blur`, `op_blend`, `op_warp`, `op_erode`, `op_curvature`) gives graph-like composability while staying diffable and greppable. An optional read-only graph *visualiser* of the call DAG may be enough.

### Gaps
- Inigo Quilez live-coding workflow specifics, Houdini Engine runtime-in-game usage, golden-image tooling (NVIDIA FLIP) and Dear ImGui/cimgui specifics were not researched with sources this session.
- No source found on how other engines key procedural caches. The Bazel analogy above is an inference.
