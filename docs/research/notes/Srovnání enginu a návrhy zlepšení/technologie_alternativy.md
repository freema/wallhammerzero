# Tech-stack alternatives for Wallhammer Zero: C17 + SDL3/SDL_GPU vs the field (2024 → Nov 2026)

These notes critically compare our proposed decisions D4 (C17 core, C++ libraries only behind a C adapter) and D5 (SDL3 for platform + SDL_GPU behind our own thin handle-based RHI) with the alternatives discussed between 2024 and November 2026. Research date: 2026-11-05.

Context taken from our own documents (`docs/DECISIONS.md`, `docs/research/Architektura open world enginu.md`, `docs/research/Schopnosti AI v procedurální 3D grafice.md`):
- Our RHI is already planned to follow sokol_gfx style (typed 32-bit generational handles, descriptor structs). Its binding model is "small per-draw data + a few storage buffers + material texture set". Render passes declare their reads and writes from day one, so native backends stay possible.
- The architecture document plans GPU culling. It writes `SDL_GPUIndexedIndirectDrawCommand` into fixed slots with instance count 0 for culled objects. Material textures go into 2D_ARRAY grouped by format and size. A Metal draw-cost benchmark is planned before M6.
- The AI-capabilities document says MetalFX is unreachable through SDL_GPU, so we need our own TAAU. It also says Tracy can only give encoder-level GPU zones on Metal, and that it needs `MTLDevice`, which SDL_GPU hides. It names KosmicKrisp as the way to get Vulkan on the Mac.

Source caveats:
- Several sources are vendor or author blogs (floooh, LunarG, Aaltonen). For dates and features I treat them as primary sources. Their opinions are flagged as opinions.
- Some search summaries came from secondary aggregators. Where I could not open the primary page, I say so.
- **Environment fact checked this session:** the development machine runs **macOS 15.8.1 (Darwin 24.6)** (`sw_vers`). This matters for every Metal 4 and KosmicKrisp option below.

---

## 1. Graphics layer alternatives and their 2026 status

### Takeaway
No cross-platform C-callable layer in November 2026 offers all four of bindless, real multi-draw-indirect-with-count on Metal, fine-grained timestamps and first-class Metal at the same time.
- SDL_GPU is the most conservative. It has no bindless, no timestamps, and MDI is a CPU loop on Metal.
- wgpu-native (webgpu.h + wgpu.h extensions) is the strongest drop-in alternative on features. It has native texture binding arrays with non-uniform indexing on Metal, timestamp queries at pass boundaries, and experimental mesh shaders. It does not have MDI-count on Metal.
- Diligent's Metal backend is commercial only, NVRHI has no Metal backend at all, and The Forge is a large C++/FSL framework rather than a thin layer. None of the three fits.
- Vulkan everywhere through KosmicKrisp is now a real option, since KosmicKrisp is Vulkan 1.4 conformant (Sep 2026). But it requires macOS 26 and Metal 4, and **our development Mac is on macOS 15**.

### Cited Findings

**SDL_GPU (our current choice)**
- SDL #11148 "SDL3 Support Bindless Resources" was opened on 2024-10-10 and first closed as not planned by flibitijibibo. His reason was policy: a PR must cover all backends, including consoles. — [SDL #11148](https://github.com/libsdl-org/SDL/issues/11148)
- thatcosmonaut wrote on 2025-01-05: "Bindless is definitely the future". He also argued that the missing feature "is not limiting anyone's ability to use the SDL3 GPU API effectively" (opinion), and he suggested waiting for SDL4 and "a stronger hardware and API consensus". — [SDL #11148](https://github.com/libsdl-org/SDL/issues/11148)
- In January 2025 slouken reopened the issue on the 3.x milestone ("it could be added in the future"). On 2026-06-23 thatcosmonaut closed it again as not planned, saying he would not spend "hundreds of hours" without paid work requiring it. He invited a proposal with a proof of concept. — [SDL #11148](https://github.com/libsdl-org/SDL/issues/11148)
- **New since our documents were written:** on 2026-07-30 loganbenjamin posted a Vulkan-only bindless prototype and API proposal, and TheSpydog called it "not a viable path forward". A revised proposal on 2026-08-13 was called "closer to what I think a bindless API should look like". TheSpydog still listed open problems: handle sizes differ per backend, interaction with resource cycling, and barrier design for compute passes. — [SDL #11148](https://github.com/libsdl-org/SDL/issues/11148)
- Workarounds the maintainers and users suggest in the thread: use Vulkan directly alongside SDL (slouken), texture arrays or atlases, batched mesh buffers, or loganbenjamin's unofficial fork. — [SDL #11148](https://github.com/libsdl-org/SDL/issues/11148)
- SDL_shadercross has **no formal releases** ("No releases published"). Its prebuilt-DXC script downloads DXC only on Linux and Windows. The macOS CI builds DXC vendored from source. DXC was bumped to v1.9.2602 (2026-02-20) in a commit dated 2026-03-01. — [shadercross repo](https://github.com/libsdl-org/SDL_shadercross); [DXC bump announcement](https://discourse.libsdl.org/t/sdl-shadercross-build-scripts-bump-pre-built-directxshadercompiler-binaries-to-2026-02-20/66462); [download script](https://raw.githubusercontent.com/libsdl-org/SDL_shadercross/main/build-scripts/download-prebuilt-DirectXShaderCompiler.cmake)
- A third-party repo has macOS arm64 DXC binaries, but only v1.7.2308 (2023). — [MethanePowered/DirectXShaderCompilerBinary](https://www.Github.com/MethanePowered/DirectXShaderCompilerBinary)

**sokol_gfx (floooh)**
- Compute shaders landed on 2025-03-08. The `storage_buffer` feature flag was renamed to `compute`. — [floooh: compute update](https://floooh.github.io/2025/03/03/sokol-gfx-compute-update.html)
- "Compute milestone 2" (2025-05-19) lets compute shaders write images. — [floooh](https://floooh.github.io/2025/05/19/sokol-gfx-compute-ms2.html)
- The resource-view update (2025-08-17) added offsets to storage buffer bindings and made storage images regular bindings. Storage buffers now need a view object. — [floooh](https://floooh.github.io/2025/08/17/sokol-gfx-view-update.html)
- The experimental Vulkan backend merged on 2025-12-02. The author describes it as "a bit over 3 kloc", with barriers inserted lazily based on tracked access. — [floooh: Sokol Vulkan backend](https://floooh.github.io/2025/12/01/sokol-vulkan-backend-1.html)
- The blog index shows no 2026 posts. None of the 2025 post titles cover indirect draw, multi-draw, bindless or GPU timing. — [floooh.github.io](https://floooh.github.io/)

**wgpu / wgpu-native (webgpu.h C API)**
- Feature support in wgpu 30.0.1 (docs.rs) — [wgpu Features](https://docs.rs/wgpu/latest/wgpu/struct.Features.html):
  - `MULTI_DRAW_INDIRECT_COUNT`: DX12 and Vulkan 1.2+ only, **no Metal**, native only. The docs say the feature means multi-draw is "not being emulated with a series of draw_indirect calls".
  - `TEXTURE_BINDING_ARRAY` and `SAMPLED_TEXTURE_AND_STORAGE_BUFFER_ARRAY_NON_UNIFORM_INDEXING`: DX12, **Metal (MSL 2.0+, macOS 10.13+)** and Vulkan, native only.
  - `BUFFER_BINDING_ARRAY`: Vulkan only.
  - `PARTIALLY_BOUND_BINDING_ARRAY`: Vulkan and DX12, no Metal.
  - `TIMESTAMP_QUERY`: Vulkan, DX12, Metal, GL and WebGPU, on web and native.
  - `TIMESTAMP_QUERY_INSIDE_PASSES` and `_INSIDE_ENCODERS` on Metal: "AMD and Intel, **not Apple GPUs**". The docs add: "Generally unavailable on tile-based GPUs".
  - `EXPERIMENTAL_MESH_SHADER`: Vulkan, DX12 and Metal. Naga compiles mesh shaders only for Vulkan; other platforms need passthrough shaders.
  - `IMMEDIATES` (formerly push constants): DX12, Vulkan and Metal.
  - `INDIRECT_FIRST_INSTANCE`: Metal Apple3+/Mac1+.
- A third-party capability matrix (wgpu-hal 29.0.1) reports texture, sampler and storage-texture binding arrays with non-uniform indexing as stable on all three backends, and MDI-count plus in-pass timestamps as DX12/Vulkan only. Its claim about Metal bindless contradicts parts of the official docs. — [gariasf/praxis #19](https://github.com/gariasf/praxis/issues/19)
- webgpu.h is the multi-vendor C header shared by Dawn/Emdawnwebgpu and wgpu-native. The README still says wgpu-native "does not yet implement the stable version of this header". Issue #589 says wgpu-native v29.0.0.0 is only "a couple of commits behind", and the thread does not settle the question. — [webgpu-headers](https://github.com/webgpu-native/webgpu-headers); [#589](https://github.com/webgpu-native/webgpu-headers/issues/589)
- An earlier issue says official API stability "probably won't officially come until we have compliant implementations in both Dawn and wgpu-native". ABI stability is a later goal. — [webgpu-headers #281](https://github.com/webgpu-native/webgpu-headers/issues/281)
- A downstream Go wrapper reports that in its wgpu-native v29 fallback path, multi-draw is emulated and barriers and fences are no-ops. This is a secondary source. — [dvoyni/cog #660](https://github.com/dvoyni/cog/issues/660)

**WebGPU standard (Dawn) — bindless and MDI**
- gpuweb is designing bindless around a host-side resource table plus shader-side index lookup (`GPUResourceTable`, `resource_table` WGSL extension):
  - In January 2026 the group resolved that resource table creation fails out-of-memory like textures and buffers do. — [GPU Web 2026-01-07](https://github.com/gpuweb/gpuweb/wiki/GPU-Web-2026%E2%80%9001%E2%80%9007)
  - A PR allowing non-uniform indexing merged in late October 2026. — [gpuweb PR #10960](https://github.com/gpuweb/gpuweb/pull/10960)
  - A secondary tracker says Chrome 155–156 offers bindless "for early experimentation" on Android, Linux and Windows, which excludes macOS. I could not confirm this on Chrome's own pages. — [typeshade #537](https://github.com/typeshade/typeshade/issues/537)
- The gpuweb MultiDrawIndirect proposal (#5175, opened 2025-04-25) was still open as of the January 2026 comments. It explicitly **excludes the indirect-count variant**. An experimental Chrome implementation exists behind a flag. The author cites roughly 57 ms in WebGPU vs roughly 5 ms in native Vulkan with multiDrawIndirect for their workload. — [gpuweb #5175](https://github.com/gpuweb/gpuweb/issues/5175)

**bgfx**
- bgfx backends: D3D11, D3D12, Metal, OpenGL 4.3+, GLES 3+, Vulkan, WebGL 2, WebGPU (Dawn native only) and GNM. It is BSD-2-Clause, copyright 2010–2026, with about 9,600 commits. It has "C/C++ API documentation" and many language bindings, including Zig and Rust. — [bgfx README](https://github.com/bkaradzic/bgfx)
- The README does not mention bindless or multi-draw. (Not verified further; see Gaps.)

**Diligent Engine**
- Apache 2.0, and its feature list includes bindless resources. **The Metal backend is "available for commercial clients"** and not part of the open-source release. — [DiligentEngine mirror](https://github.com/awkr/DiligentEngine); [socket.dev summary](https://socket.dev/go/package/github.com/diligentgraphics/diligentengine)

**NVRHI (NVIDIA)**
- Backends: D3D11, D3D12 and Vulkan 1.3. **No Metal.** It is C++17, has no C API, and is MIT licensed. It supports graphics, compute, ray tracing and meshlet pipelines. — [NVRHI](https://github.com/NVIDIA-RTX/NVRHI)

**The Forge (ConfettiFX)**
- Apache 2.0 for PC, macOS/iOS, Android, Steam Deck and Quest. Consoles need a commercial license. — [The-Forge](https://github.com/ConfettiFX/The-Forge)
- It is mostly C++ moving toward C99; release 1.62 reported a C99 rewrite of the Vulkan and DirectX runtimes. Shaders use FSL, "a superset of HLSL".
- The last GitHub release is 1.63 (2025-03-20). Development of 1.64 "continued on Codeberg".
- Its Visibility Buffer relies on a bindless texture array of 128 entries through Metal argument buffers. — [The-Forge](https://github.com/ConfettiFX/The-Forge)

**Direct Vulkan + Metal, Aaltonen's "No Graphics API"**
- Aaltonen's "No Graphics API" (2025-12-16) proposes:
  - CUDA-like `gpuMalloc`/`gpuFree`, with CPU-mapped memory as the default.
  - One 64-bit root pointer per shader; pointers inside structs are plain GPU addresses.
  - A single global texture descriptor heap indexed by 32-bit integers.
  - Barriers that take only producer and consumer stage masks, with no resource lists or image layouts.
  - Timeline-style counters for synchronization, and mesh plus pixel shaders only.

  — [Aaltonen, No Graphics API](https://www.sebastianaaltonen.com/blog/no-graphics-api)
- On Metal he notes that **Metal 4 cannot allocate texture IDs in contiguous ranges**, so each texture needs its own 64-bit handle. In his view Apple hardware could support SM 6.6-style heaps and the API is the limit. He calls Metal's barrier model (no resource lists) and depth-stencil state objects good matches for hardware. — [same](https://www.sebastianaaltonen.com/blog/no-graphics-api)
- A secondary source reports an MIT-licensed prototype, `sebbbi/NoGraphicsAPI`, released in September 2026. It is a Vulkan 1.4 wrapper tied to a SIGGRAPH 2026 talk. I did not open the repo. — [CGWorld](https://cgworld.jp/flashnews/01-202610-NoGraphicsAPI.html)
- An Odin community library ("no-gfx-api") was built on the post. — [Odin forum](https://forum.odin-lang.org/t/no-gfx-api-an-odin-graphics-library-based-on-no-graphics-api-blogpost/1927)
- Metal bindless through argument buffers requires Tier 2, which covers the Apple6 and Mac2 GPU families and newer. — [WWDC21 10286](https://developer.apple.com/videos/play/wwdc2021/10286)
- Metal has **indirect command buffers (ICB)** that compute kernels can fill on the GPU. This gives true GPU-driven draw submission on Metal, which SDL_GPU does not expose. — [Apple: indirect command encoding](https://developer.apple.com/documentation/metal/indirect-command-encoding.md); [Kodeco Metal by Tutorials ch. 27](https://www.kodeco.com/books/metal-by-tutorials/v5.0/chapters/27-gpu-command-encoding)

**Vulkan on the Mac: KosmicKrisp and MoltenVK**
- LunarG announced on 2026-09-25 that KosmicKrisp passed the Vulkan 1.4 CTS. SDK 1.4.363.0 (2026-09-28/29) ships it as a conformant ICD next to MoltenVK. — [LunarG](https://www.lunarg.com/kosmickrisp-achieves-vulkan-1-4-conformance-on-apple-silicon/); [LunarG SDK](https://www.lunarg.com/lunarg-releases-vulkan-sdk-1-4-363-0/)
- **KosmicKrisp is layered on Metal 4, requires macOS 26 or later, and runs on Apple Silicon only.** The loader does not list it on older macOS. LunarG recommends bundling the loader and driver with the app. — [LunarG: State of Vulkan on Apple, Oct 2026](https://www.lunarg.com/the-state-of-vulkan-on-apple-oct-2026/)
- Performance claims:
  - LunarG says performance roughly tripled since the 1.3 milestone. — [LunarG](https://www.lunarg.com/kosmickrisp-achieves-vulkan-1-4-conformance-on-apple-silicon/)
  - Phoronix reports it is "not far behind native Metal". I found no published numbers. — [Phoronix](https://www.phoronix.com/news/KosmicKrisp-Vulkan-1.4-2026)
- MoltenVK provides Vulkan 1.4 functionality but **is not conformant**. It remains the option for Intel Macs and iOS. — [LunarG Oct 2026](https://www.lunarg.com/the-state-of-vulkan-on-apple-oct-2026/)
- RPCS3 ships KosmicKrisp. UTM found that conformance does not imply all Zink requirements are met and kept MoltenVK as its default. — [VideoCardz](https://videocardz.com/newz/playstation-3-emulator-rpcs3-gets-graphics-update-for-apple-silicon-macs); [UTM fork issue](https://github.com/joshan-kana/UTM/issues/22)

### Inferences
- **Our KosmicKrisp plan conflicts with the machine we have.** `Schopnosti AI…` names KosmicKrisp as the way to test the Vulkan backend on the Mac. KosmicKrisp needs macOS 26+, and the dev Mac runs macOS 15.8.1. Any "Vulkan on Mac" or "Metal 4" path requires an OS upgrade first, which is an owner decision. Native Metal 3 with Tier 2 argument buffers works on macOS 15.
- **Timestamps:** "SDL_GPU has no timestamps" matters less on Apple than it looks. Even wgpu and native Metal on Apple GPUs give timestamps only at pass or encoder boundaries, not inside passes, which matches the Tracy note in our doc. On Vulkan and D3D12 machines the gap is real.
- **Comparison matrix (for the Metal-primary + Linux + Windows target):**

| Layer | Bindless / descriptor indexing | MDI with count | Timestamps | Mesh shaders | Metal quality | C API | Maturity / maintenance | AI-friendliness (docs, stability, training data) |
|---|---|---|---|---|---|---|---|---|
| **SDL_GPU** (current) | no (closed 2026-06; fork proposals in progress) | no; CPU loop on Metal | no | no | first-class, Metal 3, no native object access | **yes, pure C** | stable API since 3.2 (2025), active | good wiki; newer than most training data (our doc already plans vendored headers) |
| **sokol_gfx** | no (none found) | no (none found) | no (none found) | no | first-class | **yes, single-header C** | one maintainer; Vulkan backend experimental (Dec 2025) | excellent: small, well-documented, many samples, stable style |
| **wgpu-native** | texture arrays + non-uniform indexing on Metal; buffer arrays Vulkan only | DX12/Vulkan only | pass-level on Apple | experimental (Naga Vulkan only) | good, mature | yes (webgpu.h + wgpu.h) | very active; webgpu.h stability still settling (v29/v30) | medium: frequent breaking releases; WebGPU docs plentiful |
| **Dawn** | experimental (Chrome 155–156, not macOS per secondary source) | MDI experimental, no count | yes (pass) | no | very good (Chrome's Mac path) | yes (webgpu.h) | Google, very active; heavy build | medium |
| **bgfx** | not documented | not documented | not verified | no | yes | yes (C99 API in bgfx/c99) | 2010–2026, active, one main maintainer | medium: custom shader language and shaderc |
| **Diligent** | yes | yes on Vulkan/D3D12 | yes | yes | **commercial only** | C interface exists (not verified this session) | active | n/a: Metal is excluded |
| **The Forge** | yes (argument buffers on Metal) | via ExecuteIndirect/ICB (not verified) | GPU profiler (not verified) | not stated | strong | partial (moving to C99) | moved to Codeberg; large framework | low: large, FSL, opinionated |
| **NVRHI** | yes | yes | yes | yes | **none** | no (C++17) | NVIDIA | n/a |
| **Own Vulkan 1.3/1.4 + own Metal backend** | full (descriptor indexing / argument buffers / Metal 4) | Vulkan drawIndirectCount, Metal ICB | full on Vulkan, pass-level on Apple | yes (both) | as good as we make it | yes | we maintain it | Vulkan and Metal have huge training data, but the code is ~2× and bugs are subtle (sync, barriers) |
| **Vulkan-only via KosmicKrisp** | likely (1.4 conformance; specific features not verified) | likely Vulkan 1.2 core, but optional feature | yes | unknown | layered on Metal 4, near-native per Phoronix | yes | conformant since 2026-09 | high; needs **macOS 26+** |

### Gaps
- I could not confirm whether KosmicKrisp exposes `descriptorIndexing`/`descriptorBuffer`, `drawIndirectCount`, `VK_EXT_mesh_shader` or timestamp queries. LunarG's page does not list them. The next step is to run `vulkaninfo` on macOS 26.
- I could not confirm whether sokol_gfx gained indirect drawing in 2026. The CHANGELOG did not render through the fetch tool.
- I could not confirm bgfx's current indirect, bindless or timestamp support (bgfx docs not fetched). I believe bgfx has had `drawIndirect` and a C99 header for years, but that is from memory and was not verified.
- I could not confirm Dawn's macOS status for experimental bindless or MDI, or the webgpu.h "1.0" freeze date.
- I could not confirm Diligent's C interface status in 2026 or The Forge's indirect and timestamp specifics.
- I have no measured numbers for KosmicKrisp vs native Metal.

---

## 2. How much do missing bindless and real MDI hurt a GPU-driven open-world renderer?

### Takeaway
For a GTA III / WoW-class stylized open world, missing bindless is manageable. Large shipped games (GTA V on DX11) and the original GPU-driven pipelines used texture arrays, virtual texturing and index-buffer compaction instead. The real problem on SDL_GPU is the Metal MDI CPU loop, because CPU encode cost scales with the number of indirect draw commands.

The strongest workaround does not need MDI at all: GPU cluster culling plus **index-buffer compaction**, one indirect draw per pipeline × texture-array bucket, with materials resolved by an index into texture arrays. This keeps the draw count O(material buckets × passes), not O(objects).

### Cited Findings
- GTA V's frame has 88 render targets and 4,155 draw calls on DX11-class hardware without bindless. — [Courrèges GTA V graphics study](https://www.adriancourreges.com/blog/2015/11/02/gta-v-graphics-study/) (already cited in our architecture doc)
- Haar & Aaltonen's GPU-driven pipeline (SIGGRAPH 2015) has these stages: multi-draw, instance culling, cluster culling (64-triangle clusters) and **index buffer compaction**, an index buffer appended on the fly. — [SIGGRAPH 2015 slides](https://advances.realtimerendering.com/s2015/aaltonenhaar_siggraph2015_combined_final_footer_220dpi.pdf)
- In a related Beyond3D thread (author handle sebbbi, attribution unverified), the author explains how virtual texturing plus deferred texturing removes per-draw texture binding. — [Beyond3D](https://forum.beyond3d.com/threads/gpu-driven-rendering-siggraph-2015-follow-up.57240)
- Everything in one multi-draw must share the shader, buffers, textures, blend and stencil state. So without bindless, MDI batches are bounded by material/texture buckets anyway. — [renderer-opinions](https://github.com/expenses/renderer-opinions) (secondary)
- SDL maintainers and users point to texture arrays, atlases and batched mesh buffers as the bindless substitutes. — [SDL #11148](https://github.com/libsdl-org/SDL/issues/11148)
- The Forge's Visibility Buffer needs only a 128-entry bindless texture array. That shows how small a "bindless" table a vis-buffer renderer can work with. — [The-Forge](https://github.com/ConfettiFX/The-Forge)
- An SDL3 GPU performance issue: maintainers say to disable debug mode and validation, and that "fewer API calls improve performance". — [SDL #11537](https://github.com/libsdl-org/SDL/issues/11537)
- A dxx-rebirth research issue explores draw volume and binding conventions per backend through SDL_GPU. Results were not visible. — [dxx-rebirth #71](https://github.com/neostar/dxx-rebirth/issues/71)
- In WebGPU, which has the same "no MDI" constraint, one reported workload ran roughly 57 ms vs roughly 5 ms in native Vulkan with MDI. This shows the cost when a renderer does need one draw per object. — [gpuweb #5175](https://github.com/gpuweb/gpuweb/issues/5175)
- Native Metal ICBs let a compute kernel encode draws, which removes the CPU loop entirely. This is the main thing a native Metal backend would buy us. — [Apple: indirect command encoding](https://developer.apple.com/documentation/metal/indirect-command-encoding.md)

### Inferences
- **The cost model to plan around:** with SDL_GPU on Metal, CPU cost ≈ number of indirect draw records × passes, not number of instances. If GPU culling writes instance counts for each (mesh LOD × material bucket), a city with a few hundred archetype meshes × 3 LODs × (main + 4 CSM) gives a few thousand encoder calls per frame. That is probably acceptable on an M4 Pro, but it is unmeasured (estimate). The benchmark in our plan (1k/3k/10k draws × 4 passes, empty indirect draws) is the right test and should move from "before M6" to M2/M3, before the renderer design hardens.
- **Better than the current plan (one slot per object with instance count 0):** use cluster culling with compute-written compacted index buffers, as in Haar & Aaltonen. That makes the draw count independent of object count. It needs storage buffers (we have 8 per stage) and vertex pulling. It works the same on SDL_GPU, wgpu and native backends, so it is portable de-risking.
- **Shadows:** CSM multiplies draws per cascade. Index compaction per cascade, or caching static-geometry shadow cascades and updating them less often, cuts the multiplier. Shadow passes need no textures (except alpha-tested ones), so they bucket into very few draws.
- **Textures:** 2D_ARRAY buckets by format and size, plus a per-instance material index, cover a code-generated, shared-library texture set (D8/D14 already require shared textures). Bindless becomes compelling only with thousands of unique textures or virtual texturing. That is when "native backend" pays off.
- **Procedural planet:** terrain is usually a few large instanced or indirect draws over a quadtree or cube-sphere, so it does not suffer from MDI.

### Gaps
- I found no published measurement of SDL_GPU Metal per-draw encode cost (µs per indirect record). Our own benchmark remains necessary.
- Not verified: Metal's limit on texture array layers (I believe 2048) and the SDL_GPU limits on array size. Check `SDL_gpu.h` and Apple's feature set tables.
- I found no shipped commercial game built on SDL_GPU with a dense open world. No evidence either way.

---

## 3. Language: C17 vs C++20 vs Odin vs Zig vs Rust (2026), with an AI writing most of the code

### Takeaway
For AI-written code, the language has to be stable and heavily represented in training data. That rules out Zig (breaking std/build changes up to 0.15 and 0.16 measurably trip LLMs) and makes Odin a gamble, since there is no data on LLM quality for it.

Rust has the best "the compiler catches the AI's mistakes" story. One large study reports that 16.7% of Rust compile errors in LLM code would have been silent memory bugs in C/C++. But Rust's graphics and C-interop overhead and friction for engine-style code are high.

C17 stays defensible for API stability, the best match to SDL3/sokol/meshoptimizer C APIs, and fast builds. Its weakness is exactly what the AI is bad at: silent out-of-bounds errors and overflows. So C17 should be kept only with mandatory ASan/UBSan, bounds-checked containers and golden tests. A "C-style C++20" subset would also be a reasonable alternative that eases Jolt and Manifold integration.

### Cited Findings
- Aider Polyglot uses 225 Exercism exercises in C++, Go, Java, JS, Python and Rust. **It has no C or Zig**, and the published leaderboard is aggregate, not per language. Top score 0.880 (GPT-5), leaderboard updated November 2026. — [llm-stats Aider-Polyglot](https://llm-stats.com/benchmarks/aider-polyglot)
- Multi-SWE-bench covers repository-level issue resolution across Java, TS, JS, Go, Rust, C and C++. Per-language figures were not visible in the search results. — [KDnuggets overview](https://www.kdnuggets.com/top-10-open-source-benchmarks-for-ai-coding-agents-in-2026)
- A University of Coimbra analysis of 86,726 erroneous LLM code samples (7 LLMs; C, C++, Java, Rust), as summarized by a blog (secondary; the original paper was not opened):
  - Faults that are hidden in C/C++/Java surface immediately in Rust.
  - Out-of-bounds and overflow errors survive iterative feedback.
  - 16.7% of Rust compile errors are ownership/lifetime violations that would be silent memory bugs in C/C++.

  — [danielvaughan summary](https://codex.danielvaughan.com/2026/08/13/unreliable-in-practice-llm-generated-code-errors-codex-cli-posttooluse-verification-memory-safety-input-validation/)
- LLM C→Rust translation research (SafeTrans, SmartC2Rust ICSE 2026) finds that LLM Rust often fails to compile and needs iterative compiler feedback. — [SafeTrans arXiv](https://arxiv.org/abs/2505.10708v1); [SmartC2Rust](https://www.os.is.s.u-tokyo.ac.jp/publication/conference/2026-icse-shiraishi/)
- **Zig:**
  - Zig 0.15 brought large breaking changes ("Writergate" I/O rewrite, std cuts). — [Zig 0.15.1 release notes](https://ziglang.org/download/0.15.1/release-notes.html)
  - In a single-author test, "half the LLMs struggled a lot" with the 0.15 ArrayList change, and some took more than an hour; web lookup of migration docs helped most. — [akitaonrails, Jan 2026](https://akitaonrails.com/en/2026/01/11/ai-agents-comparing-top-llms-on-the-zig-challenge/)
  - Hacker News comments: "LLMs only know old … versions", and LLMs generate syntactically invalid Zig. One commenter reports Claude doing well on a large Zig project (mixed opinions). — [HN 46862586](https://news.ycombinator.com/item?id=46862586)
  - Raylib had to update `build.zig` for breaking 0.15 changes. — [raylib #5126](https://github.com/raysan5/raylib/issues/5126)
- **Odin:**
  - I found no benchmark of LLM quality on Odin. There is one positive anecdote (LessWrong comment) about an agent navigating "a pretty obscure programming language (Odin)". — [LessWrong](https://www.lesswrong.com/posts/k3CSx2dCswfffkQn9/seeing-how-well-an-agentic-ai-coding-tool-can-do-compared-to)
  - Odin's GitHub says the compiler is "still in development". — [Odin](https://github.com/gingerBill/Odin)
  - The Odin forum has no LLM policy, and one reply speculates AI contributions to core would be ignored. — [Odin forum](https://forum.odin-lang.org/t/official-llm-ai-policy/1824)
- **Library ecosystem from C:**
  - joltc is a C wrapper for Jolt 5.x, "work in progress", MIT/Apache-2.0. Its SecondHalfGames fork is used by a Rust sys crate (oxijolt-sys 1.1.0, Jolt 5.6.0) and by Odin bindings (joltc-odin). Recent commit activity was not confirmed. — [SecondHalfGames/JoltC](https://github.com/SecondHalfGames/JoltC); [oxijolt-sys](https://docs.rs/crate/oxijolt-sys/latest/source/README.md); [joltc-odin](https://github.com/jrdurandt/joltc-odin)

### Inferences
- **C17 vs C++20.** For an AI author the gap is smaller than human debates suggest. Both are massively represented in training data, while C++20 has a much larger surface: templates, modules, coroutines, and three ways to do everything. The AI drifts toward idioms the engine does not want (exceptions, STL allocations, RAII-heavy objects that clash with handle pools).
  - **Option worth considering:** "C-like C++20" (no exceptions or RTTI, designated initializers, `constexpr`, `std::span` for bounds, `[[nodiscard]]`, templates only in containers). It removes the joltc and Manifold adapter tax and adds compile-time checking that C lacks. The cost is slower builds and a fuzzier style that needs to be pinned down in CLAUDE.md lint rules.
  - This is a judgement call, not evidence-backed. I found no head-to-head benchmark of LLM C vs C++ quality.
- **Rust.** It has the best automatic error-catching for AI code (Coimbra), but:
  - Engine patterns (handle pools, arenas, unsafe GPU memory, a job system with shared mutable data) force `unsafe` or awkward borrow workarounds.
  - wgpu would be the natural GPU layer.
  - Our existing research and decisions (C APIs, Gregory layering in CMake) would need redoing.

  Rust is plausible but means a full restart of the analysis.
- **Zig as a language:** not recommended while it is pre-1.0 with breaking std changes, because of the AI-authorship constraint. **Zig as a toolchain** (zig cc / build.zig) is a separate question; see section 4.
- **Odin:** pleasant for engines and ships vendor bindings (SDL3, etc.), but there is no evidence of LLM quality and the training corpus is small. Not recommended for AI-first development.
- **If we stay on C17,** the de-risking mandates are:
  - ASan, UBSan and TSan in CI on macOS (Apple clang supports ASan/UBSan/TSan; LeakSanitizer is limited on macOS).
  - Bounds-checked array/slice macros in debug builds.
  - `-Wall -Wextra -Wconversion -Werror` and clang-tidy.
  - Fuzzing of asset loaders.

  These target exactly the out-of-bounds and overflow classes that survive LLM feedback loops.

### Gaps
- I found no per-language LLM benchmark covering C vs C++ vs Rust vs Zig vs Odin on systems or engine code. MultiPL-E current numbers did not surface. The Multi-SWE-bench per-language breakdown was not retrieved.
- Not verified this session: meshoptimizer's C API, Manifold's C binding (manifoldc) status, and LeakSanitizer support on macOS 15. These are from background knowledge only.
- I found no 2026 community survey of engine-language adoption (C vs Odin vs Zig) with numbers.

---

## 4. Build and tooling: CMake vs zig build, DXC on macOS, Slang vs HLSL+shadercross

### Takeaway
- **CMake + Ninja remains the safest build choice for AI authorship.** It has the most training data and it works with SDL3, shadercross and Jolt. zig build is attractive for zero-install cross-compilation, which fits D6 "don't pollute the system", but reports are mixed.
- **Shader toolchain:** shadercross has no releases and no prebuilt macOS DXC, so on our Mac we would build DXC from source. That is a fragile dependency.
- **Slang** (Khronos-hosted since Nov 2024) is a serious alternative front end. It is production-proven on SPIR-V (Valve), but its Metal output was labelled experimental in the source I found.

### Cited Findings
- **zig build anecdotes** — [r/Zig: compiling C with zig](https://r.enesgenc.dev/r/Zig/comments/1laeg6p/compiling_c_with_zig):
  - Positive: a developer moved a C++ project from CMake to `zig build` in "a couple of afternoon hours" with AI help and missed only `compile_commands.json` for clangd.
  - Positive: "one `zig build` on a fresh machine" is a big advantage.
  - Negative: "build.zig is pain, too complicated" (opinion).
- `zig cc` works as a drop-in cross C compiler under CMake, setting CC/CXX to Zig. That lets us keep CMake and use only the Zig toolchain. — [same thread](https://r.enesgenc.dev/r/Zig/comments/1laeg6p/compiling_c_with_zig)
- build.zig breaks between Zig versions; for example `addStaticLibrary()` was removed in 0.15. — [Zig 0.15 LLM guide gist](https://gist.github.com/svenyurgensson/e016010fd544d3301ee1f4aad3c5f64f); [raylib #5126](https://github.com/raysan5/raylib/issues/5126)
- shadercross has no releases. Prebuilt DXC (v1.9.2602) is downloaded only for Linux and Windows, and macOS is built vendored. — [shadercross](https://github.com/libsdl-org/SDL_shadercross); [download script](https://raw.githubusercontent.com/libsdl-org/SDL_shadercross/main/build-scripts/download-prebuilt-DirectXShaderCompiler.cmake)
- **Slang:**
  - Khronos launched the Slang Initiative (Nov 2024), taking over the language NVIDIA had developed since 2017. — [Khronos press release](https://www.khronos.org/news/press/khronos-group-launches-slang-initiative-hosting-open-source-compiler-contributed-by-nvidia); [GamingOnLinux](https://gamingonlinux.com/2024/11/khronos-group-takes-over-cross-platform-slang-shading-language-from-nvidia)
  - Valve migrated Source 2 HLSL to Slang and ships the generated SPIR-V in CS2 and Dota 2 "with minimal changes to our shaders". — [Khronos 2024 presentation](https://members.khronos.org/document/dl/33712)
  - Releases are frequent (v2026.5.2, March 2026). — [newreleases](https://newreleases.io/project/github/shader-slang/slang/release/v2026.5.2)
  - Metal output is labelled "experimental" in an undated repo README mirror. — [zalo/slang mirror](https://github.com/zalo/slang)

### Inferences
- **Recommended build setup:**
  - Keep CMake + Ninja in `.tools/`, per D6.
  - Optionally evaluate `zig cc` only as a hermetic cross-compiler for Linux and Windows CI builds from the Mac, not as the build system.
  - Unity or jumbo builds per CMake target are cheap in C and fit our module-per-target layout. Use `UNITY_BUILD` in CMake.
- **De-risk the shader pipeline:**
  - Pin a shadercross commit and vendor it.
  - Build DXC once and cache the binary in `.tools/`, or use the DXC from the Vulkan SDK on macOS. That needs checking: the LunarG macOS SDK ships `dxc` per its tools list (not verified this session).
  - Keep the shader source in plain HLSL so a later switch to Slang (HLSL-compatible syntax) is cheap.
- **Slang vs HLSL+shadercross.** Slang's modules, generics and reflection API would replace our hand-made "sidecar with resource counts". It also targets SPIR-V, HLSL/DXIL and MSL from one tool. But its Metal path is the experimental one, and Metal is our primary platform.
  - **Proposal:** pilot Slang → SPIR-V → (SPIRV-Cross) → MSL vs Slang → MSL directly in M2. Keep HLSL source compatibility either way.
  - For DXIL, Slang uses DXC internally, so the macOS DXC problem remains. That is background knowledge, not verified this session.

### Gaps
- Not confirmed: the current Slang Metal backend status in 2026 (official docs not fetched), or whether the Vulkan SDK for macOS includes `dxc` and `slangc` binaries.
- I found no controlled comparison of CMake vs zig build for AI-authored C projects.

---

## 5. Recommendation: keep SDL_GPU, switch now, or SDL3 + a different GPU layer?

### Takeaway
**Keep SDL3 for the platform layer and keep SDL_GPU as the first backend, but change the RHI's target shape now.** Before any code exists:
1. Design the RHI binding model and draw submission around index-compaction / texture-array buckets, which work everywhere.
2. Write the RHI interface so a **native Metal 3 backend (argument buffers Tier 2 + ICB + MetalFX + Tracy)** can replace SDL_GPU on the Mac without touching the renderer.
3. Pull the Metal draw-cost benchmark forward to M2/M3.

wgpu-native is the only drop-in alternative with materially better features (texture binding arrays on Metal, timestamps). Its MDI-count is also missing on Metal, and its C API stability is still settling. So switching to it gains less than it costs, unless bindless arrays turn out to be decisive early.

Vulkan-only through KosmicKrisp is the most interesting medium-term option (one backend, full features), but it requires upgrading the dev Mac to macOS 26+ and accepting a translation layer on our primary platform. Re-evaluate it in 2027.

### Cited Findings
- SDL_GPU bindless will not come soon: closed 2026-06-23. A community proposal (Aug 2026) has unresolved design issues. The maintainers' guidance is "use Vulkan directly alongside SDL". — [SDL #11148](https://github.com/libsdl-org/SDL/issues/11148)
- wgpu exposes Metal texture binding arrays with non-uniform indexing and timestamps, but MDI-count only on DX12 and Vulkan. — [wgpu Features](https://docs.rs/wgpu/latest/wgpu/struct.Features.html)
- KosmicKrisp is Vulkan 1.4 conformant, but on macOS 26+ only. — [LunarG Oct 2026](https://www.lunarg.com/the-state-of-vulkan-on-apple-oct-2026/)
- Diligent Metal is commercial and NVRHI has no Metal. — [Diligent](https://github.com/awkr/DiligentEngine); [NVRHI](https://github.com/NVIDIA-RTX/NVRHI)
- sokol's Vulkan backend is experimental (Dec 2025). — [floooh](https://floooh.github.io/2025/12/01/sokol-vulkan-backend-1.html)
- Aaltonen's model (root pointer + global texture heap + simple barriers) maps to Vulkan 1.4 extensions and D3D12 SM 6.6. On Metal 4, texture handles are not contiguous. — [Aaltonen](https://www.sebastianaaltonen.com/blog/no-graphics-api)
- Metal ICBs allow GPU-encoded draws. — [Apple](https://developer.apple.com/documentation/metal/indirect-command-encoding.md)

### Inferences

**Decision matrix.** Scores 1–5 (5 = best). Weights reflect our constraints: Metal primary, AI authorship, dense city, compute, three OSes. The scores are judgement, not measurement.

| Criterion (weight) | A: SDL3 + SDL_GPU behind thin RHI (status quo) | B: A + planned native Metal backend later (recommended) | C: SDL3 + wgpu-native | D: SDL3 + sokol_gfx | E: bgfx | F: own Vulkan 1.4 + own Metal now | G: Vulkan-only via KosmicKrisp |
|---|---|---|---|---|---|---|---|
| Metal quality / access to MetalFX, Tracy, ICB (5) | 3 | 5 (after backend) | 3 | 3 | 3 | 5 | 3 (translation; no MetalFX) |
| Bindless / large texture sets (3) | 2 | 4 | 4 | 1 | 2 | 5 | 5 (expected, unverified) |
| MDI / draw-count scaling on Metal (4) | 2 | 4 | 2 | 1 | 2? | 5 | 4? |
| GPU timing (2) | 1 | 4 | 4 | 1 | 3? | 5 | 4 |
| C API + API stability for AI (5) | 4 | 4 | 3 | 5 | 4 | 3 | 4 |
| Docs and AI-friendliness (4) | 3 | 3 | 3 | 5 | 3 | 4 (huge corpus, subtle sync) | 4 |
| Implementation cost before first pixel (4) | 5 | 5 | 4 | 5 | 4 | 1 | 3 |
| Maintenance risk / bus factor (3) | 4 | 3 | 4 | 3 (one maintainer) | 3 | 2 (all on us) | 3 |
| Works on our Mac today (macOS 15) (5) | 5 | 5 | 5 | 5 | 5 | 5 (Metal 3) | **1** |
| **Weighted total** (max 175) | 120 | **147** | 123 | 123 | 117 | 136 | 116 |

(The weighted totals are my arithmetic over the judgement scores above; "?" marks unverified cells.)

**Concrete improvements to propose for D4 and D5:**
1. **D5 rewording:** "SDL3 for platform; GPU through our own RHI whose first backend is SDL_GPU. Planned second backend: native Metal 3 (argument buffers Tier 2, ICB, MetalFX, timestamps at encoder boundaries, Tracy). Vulkan native or KosmicKrisp is re-evaluated after the dev machine moves to macOS 26+."
   - Add an explicit **trigger** for the native backend: the M2/M3 benchmark shows more than X ms CPU encode for the target city frame, or the material count exceeds texture-array bucketing.
2. **RHI shape:** design it around three portable concepts:
   - (a) buffer device-address-like handles, emulated as storage-buffer index + offset on SDL_GPU;
   - (b) a material texture table (texture-array bucket + layer on SDL_GPU; argument buffer or descriptor heap natively);
   - (c) "indirect draw stream" objects (a loop on SDL_GPU Metal, an ICB on native Metal, drawIndirectCount on Vulkan).

   This follows Aaltonen's direction without requiring it from SDL_GPU.
3. **Renderer:** adopt cluster culling + compute index compaction from M2. Do not rely on one indirect slot per object. This removes most of the MDI penalty on every backend.
4. **Platform reality check:** KosmicKrisp and Metal 4 need macOS 26+. Record an owner decision on whether and when to upgrade the dev Mac. Until then, "Vulkan on Mac" testing in our docs is unachievable, so Linux GPU CI covers Vulkan.
5. **D4:** keep C17, but record the alternative of "C-like C++20 subset" with the trade-off (Jolt and Manifold direct, `std::span` bounds vs. slower builds and style drift). Make sanitizers, `-Werror` and bounds-checked debug containers mandatory in the definition of done, because LLM-written C fails silently on out-of-bounds and overflow errors.
6. **Shaders:** keep HLSL source, but vendor a pinned shadercross and cache a self-built DXC. Pilot Slang in M2 as a possible single front end (reflection replaces the sidecar), and watch its Metal backend maturity.
7. **Do not switch to** Zig or Odin (AI reliability), NVRHI (no Metal), Diligent (Metal commercial), The Forge (too large and opinionated, FSL), or Dawn (heavy build, bindless experimental and not on macOS).

### Gaps
- The decision matrix scores are judgement-based. The weight on "Metal quality" and the MDI scores should be revisited after the M2/M3 Metal encode benchmark.
- Unknown: whether SDL_GPU will gain bindless from the community proposal in 2027. Unknown: effort to write a native Metal 3 backend for our RHI. The sokol Vulkan backend at ~3 kloc suggests the order of magnitude for a thin backend, but a Metal ICB + argument buffer backend is likely larger (estimate).
- Not checked: whether SDL3 exposes enough to create a native Metal layer next to SDL's window (`SDL_Metal_CreateView` / `SDL_Metal_GetLayer` exist in SDL3, from memory, not verified this session). This is needed for option B.
