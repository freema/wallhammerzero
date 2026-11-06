# Renderer architecture on SDL_GPU: RHI, render graph, GPU-driven open-world rendering, shader pipeline

Research date: 2026-11-05. SDL source facts below come from `libsdl-org/SDL` **main branch headers/backends fetched on 2026-11-05** (raw.githubusercontent.com). The wiki tracks the 3.2/3.4 API. The latest point release seen in search results was 3.4.18 (unverified; one snippet said 3.4.16).

---

## 1. SDL_GPU (SDL3): feature set, limits, binding model, shader formats, tooling, roadmap

### Takeaway
SDL_GPU is a deliberately conservative "Metal-shaped" API. It offers vertex/fragment/compute stages, storage buffers and textures, indirect draw and dispatch, automatic resource "cycling", 4 uniform slots per stage, and small fixed per-stage slot limits (16 samplers, 8 storage textures, 8 storage buffers). It has **no bindless**, **no timestamp or occlusion queries**, **no GPU-side draw count (DrawIndirectCount)**, and no mesh, geometry, tessellation or ray-tracing stages. Bindless was closed as "not planned" again in June 2026. GPU-driven rendering is possible, but in a constrained form: compute culling writes indirect args, and materials must be bucketed by bound texture set or use texture arrays.

### Cited Findings
**Scope and backends**
- Cross-platform 3D + compute API "modeled on Metal, Vulkan, and Direct3D 12". The wiki says: "If you need cutting-edge features with limited hardware support, this API is probably not for you." There are no immediate plans for ray tracing or mesh shaders, though they are not ruled out. — [SDL Wiki CategoryGPU](https://wiki.libsdl.org/SDL3/CategoryGPU)
- **Vulkan backend:** Vulkan 1.0 + `VK_KHR_swapchain` + `VK_KHR_maintenance1`. Requires the features independentBlend, imageCubeArray, depthClamp, shaderClipDistance, drawIndirectFirstInstance and sampleRateShading, some of which can be relaxed via creation properties. **D3D12 backend:** Win10+, Feature Level 11_0, Resource Binding Tier 2 (can be relaxed for Haswell/Broadwell). **Metal backend:** macOS 10.14+ (Apple Silicon or Intel Mac2 family) and iOS/tvOS 13+ (A9+). The iOS/tvOS simulators are unsupported. — [SDL Wiki CategoryGPU](https://wiki.libsdl.org/SDL3/CategoryGPU)
- Shader stages for graphics are only `SDL_GPU_SHADERSTAGE_VERTEX` and `SDL_GPU_SHADERSTAGE_FRAGMENT`. Compute pipelines are separate. No geometry, tessellation or mesh stages. — [SDL_gpu.h (main)](https://raw.githubusercontent.com/libsdl-org/SDL/main/include/SDL3/SDL_gpu.h)
- Texture types: 2D, 2D_ARRAY, 3D, CUBE, CUBE_ARRAY. MSAA 1/2/4/8. Store ops include RESOLVE and RESOLVE_AND_STORE. Helpers include `SDL_GenerateMipmapsForGPUTexture` and `SDL_BlitGPUTexture`. — [SDL_gpu.h](https://raw.githubusercontent.com/libsdl-org/SDL/main/include/SDL3/SDL_gpu.h)
- A render pass targets up to 4 color textures + 1 depth texture at once (per the wiki). Changing targets means ending the pass. — [SDL Wiki CategoryGPU](https://wiki.libsdl.org/SDL3/CategoryGPU). Internally, `MAX_COLOR_TARGET_BINDINGS` = 8. — [SDL_sysgpu.h](https://raw.githubusercontent.com/libsdl-org/SDL/main/src/gpu/SDL_sysgpu.h). The two numbers differ; treat 4 as the documented portable limit.
- Coordinate system: left-handed, NDC z 0..1, top-left texture/viewport origin. SDL converts for Vulkan automatically. — [SDL Wiki CategoryGPU](https://wiki.libsdl.org/SDL3/CategoryGPU)

**Hard limits (internal constants, `src/gpu/SDL_sysgpu.h`, main branch)**
- `MAX_TEXTURE_SAMPLERS_PER_STAGE 16`, `MAX_STORAGE_TEXTURES_PER_STAGE 8`, `MAX_STORAGE_BUFFERS_PER_STAGE 8`, `MAX_UNIFORM_BUFFERS_PER_STAGE 4`, `MAX_COMPUTE_WRITE_TEXTURES 8`, `MAX_COMPUTE_WRITE_BUFFERS 8`, `UNIFORM_BUFFER_SIZE 32768`, `MAX_VERTEX_BUFFERS 16`, `MAX_VERTEX_ATTRIBUTES 16`, `MAX_FRAMES_IN_FLIGHT 3`. — [SDL_sysgpu.h](https://raw.githubusercontent.com/libsdl-org/SDL/main/src/gpu/SDL_sysgpu.h)

**Binding model (strict, fixed register/set layout per backend)**
- Bindings are slot-based and per stage: `SDL_BindGPU{Vertex,Fragment,Compute}{Samplers,StorageTextures,StorageBuffers}`, plus vertex/index buffers. There are no descriptor sets or bind groups in the API. — [SDL Wiki CategoryGPU](https://wiki.libsdl.org/SDL3/CategoryGPU)
- **SPIR-V:** VS uses set 0 for samplers, storage textures and storage buffers, and set 1 for uniforms. FS uses set 2 for resources and set 3 for uniforms. Bindings are contiguous from 0, in the order samplers, then storage textures, then storage buffers. **HLSL (DXIL/DXBC):** VS uses `t[n]`/`s[n]` in space0 and `b[n]` in space1. PS uses space2 and space3. In `t`, sampled textures come first, then storage textures, then storage buffers. **MSL:** texture table = sampled then storage. The buffer table starts with uniforms, then storage buffers. Vertex buffers start at `[[buffer(14)]]`. — [SDL Wiki SDL_CreateGPUShader](https://wiki.libsdl.org/SDL3/SDL_CreateGPUShader)
- The wiki's FAQ says the most common failure is mis-laid-out registers or mismatched resource counts in `SDL_GPUShaderCreateInfo`. It suggests shader reflection. — [SDL Wiki CategoryGPU](https://wiki.libsdl.org/SDL3/CategoryGPU)
- **Uniforms:** 4 slots per stage, pushed with `SDL_PushGPU{Vertex,Fragment,Compute}UniformData`. Values persist until re-pushed. Recommended only for small data; use storage buffers for "more than about a matrix". — [SDL Wiki CategoryGPU](https://wiki.libsdl.org/SDL3/CategoryGPU)

**Compute, indirect, multi-draw**
- `SDL_DispatchGPUCompute` / `SDL_DispatchGPUComputeIndirect`. The wiki says compute "opens up powerful GPU-driven workflows". — [SDL Wiki CategoryGPU](https://wiki.libsdl.org/SDL3/CategoryGPU)
- `SDL_DrawGPUPrimitivesIndirect` / `SDL_DrawGPUIndexedPrimitivesIndirect(render_pass, buffer, offset, draw_count)`. `draw_count` is a **CPU-side Uint32**, and there is no GPU count buffer (no `DrawIndirectCount`/`multiDrawIndirectCount` equivalent). — [SDL_gpu.h](https://raw.githubusercontent.com/libsdl-org/SDL/main/include/SDL3/SDL_gpu.h)
- Backend implementation of multi-draw:
  - **Vulkan** uses native multi-draw only if the optional `multiDrawIndirect` feature is present, and otherwise loops one call per draw. — [SDL_gpu_vulkan.c](https://raw.githubusercontent.com/libsdl-org/SDL/main/src/gpu/vulkan/SDL_gpu_vulkan.c)
  - **Metal** loops on the CPU, issuing one `drawIndexedPrimitives:indirectBuffer:` per draw: `for (Uint32 i = 0; i < drawCount; i += 1) {...}`. — [SDL_gpu_metal.m](https://raw.githubusercontent.com/libsdl-org/SDL/main/src/gpu/metal/SDL_gpu_metal.m)
  - **D3D12** uses `ExecuteIndirect`. — [SDL_gpu_d3d12.c](https://raw.githubusercontent.com/libsdl-org/SDL/main/src/gpu/d3d12/SDL_gpu_d3d12.c)
- Indirect structs: `first_vertex`/`first_instance` are "NOT compatible with built-in vertex/instance ID variables (for example, SV_VertexID)… the only way to keep behavior consistent and portable is to always pass 0". — [SDL Wiki SDL_GPUIndexedIndirectDrawCommand](https://wiki.libsdl.org/SDL3/SDL_GPUIndexedIndirectDrawCommand)

**Resource updates, cycling, sync**
- Uploads go through transfer buffers (`SDL_CreateGPUTransferBuffer`, map/unmap, `SDL_UploadToGPUBuffer/Texture`) in copy passes. Readback uses `SDL_DownloadFromGPU*`. Fences come from `SDL_SubmitGPUCommandBufferAndAcquireFence`, `SDL_QueryGPUFence` and `SDL_WaitForGPUFences`. — [SDL Wiki CategoryGPU](https://wiki.libsdl.org/SDL3/CategoryGPU)
- "Cycling": buffers, textures and transfer buffers are ring buffers of internal resources. With `cycle=true`, a bound resource rotates to an unbound internal copy. After cycling, the whole resource contents are undefined. Writing a referenced region without cycling gives "unexpected results". — [SDL Wiki CategoryGPU](https://wiki.libsdl.org/SDL3/CategoryGPU)
- Background on cycling: Evan Hemsley ("cosmonaut", principal designer of SDL_GPU, Moonside Games) wrote "SDL GPU API Concepts: Data Transfer and Cycling" (Aug 2024) and "Sprite Batcher" (Jan 2025). — [moonside.games posts](https://moonside.games/posts); [sponsor profile](https://sponsors.ecosyste.ms/accounts/thatcosmonaut)

**Threading**
- "Multiple command buffers may be built across multiple threads in parallel, provided they are submitted in the correct order". Most apps need one command buffer per frame. — [SDL Wiki CategoryGPU](https://wiki.libsdl.org/SDL3/CategoryGPU)
- A command buffer may only be used, and must be submitted, on the thread that acquired it. It is valid to acquire multiple command buffers on one thread. Swapchain acquire must happen on the window's thread. — [SDL_gpu.h](https://raw.githubusercontent.com/libsdl-org/SDL/main/include/SDL3/SDL_gpu.h)

**Profiling and debugging**
- Debug labels: `SDL_InsertGPUDebugLabel`, `SDL_PushGPUDebugGroup`/`Pop`. Names: `SDL_SetGPUBufferName`/`TextureName`, plus `SDL_PROP_GPU_SHADER_CREATE_NAME_STRING`. Recommended tools are RenderDoc (Win/Linux), Xcode GPU capture (Metal), and Vulkan/D3D12 validation layers. — [SDL Wiki CategoryGPU](https://wiki.libsdl.org/SDL3/CategoryGPU); [SDL_CreateGPUShader](https://wiki.libsdl.org/SDL3/SDL_CreateGPUShader)
- **No timestamp queries.** A downstream issue states SDL 3.4 has no way to record GPU time between points in a command buffer, only fences. It suggests using native per-API timestamps via device properties. — [Sunrisepeak/mui #3](https://github.com/Sunrisepeak/mui/issues/3); same gap and workarounds (fence-based frame timing, native Vulkan timestamps) in [hexenwail #451](https://github.com/hexenwail/hexenwail/issues/451)
- Occlusion queries exist only in forks or unmerged PRs, not upstream. — [jdolan/quetoo #1093](https://github.com/jdolan/quetoo/issues/1093)
- I found no "query" API in the main-branch `SDL_gpu.h`; the only query function is `SDL_QueryGPUFence`. — [SDL_gpu.h](https://raw.githubusercontent.com/libsdl-org/SDL/main/include/SDL3/SDL_gpu.h)

**SDL 3.4 changes (GPU-relevant)**
- Adds a 2D renderer on top of a GPU device: `SDL_CreateGPURenderer`, `SDL_GetGPURendererDevice`, and GPU render states with custom fragment shaders.
- Adds texture interop properties, `SDL_GetGPUDeviceProperties()`, and Vulkan creation options (`SDL_PROP_GPU_DEVICE_CREATE_VULKAN_OPTIONS_POINTER`), plus properties that let the API run on older hardware.
- Point releases fixed depth texture arrays and multiple read usages.
- Source: [SDL 3.4.0 release](https://github.com/libsdl-org/SDL/releases/tag/release-3.4.0); [Phoronix](https://www.phoronix.com/news/SDL-3.4-Released)

**Roadmap and maintainer stance**
- **Bindless** (issue #11148):
  - Opened 2024-10-10 and closed "not planned". It was reopened for a 3.x milestone in Jan 2025 and **closed again as not planned in Jun 2026**.
  - Maintainers' reasons: platform fragmentation (the feature must work on all backends including consoles), two binding models being confusing, no consensus bindless model, and maintenance cost.
  - Proofs of concept in Jul/Aug 2026 were not accepted. Open problems listed by TheSpydog: 32-bit vs Metal 64-bit handles, cycling validity, read-write barriers, and Vulkan guaranteeing only 4 descriptor sets.
  - slouken's alternative: "use Vulkan directly".
  - Source: [SDL #11148](https://github.com/libsdl-org/SDL/issues/11148)
- Maintainers prefer not to expose optional-feature queries because that invites non-portable code. An `SDL_IsGPUFeatureSupported()` idea was floated. — [SDL #12093](https://github.com/libsdl-org/SDL/issues/12093)

### Inferences
- Indirect draws on Metal are a CPU loop, and the count is always CPU-decided. So "one indirect call for the whole scene" on SDL_GPU still costs O(N) encoder calls on M-series Macs. The standard workaround is to issue `draw_count = maxDraws` and have compute culling write `num_instances = 0` for culled draws. Expect per-draw overhead on Metal even for zero-instance draws (not measured; needs profiling).
- With no base-instance-safe `SV_InstanceID`, pass per-draw data via `first_instance` read as a vertex attribute (instance-rate buffer), or as a storage-buffer index computed in compute. Do not rely on `SV_InstanceID + baseInstance` semantics.
- The 32 KB uniform buffer constant and the 4 uniform slots point to per-draw data living in storage buffers (≤8 per stage), indexed by draw/instance ID. This is the "AZDO-style" pattern without bindless.
- Profiling: plan for an RHI-level GPU timer abstraction that is a no-op on SDL_GPU and implemented natively later. Alternatively, use fence-to-fence frame timing plus Xcode/RenderDoc captures.
- Barriers are implicit in SDL_GPU (pass boundaries plus cycling semantics). Inference from the API surface: no barrier functions exist in the header. This reduces what a render graph can add on SDL_GPU (see §3).

### Gaps
- I found no official SDL_GPU roadmap document. The "requesting GPU features" wiki page referenced in #11148 was not read.
- I did not find the exact per-push uniform size limit in the public docs. 32768 is the internal uniform-buffer block size.
- Whether Vulkan/D3D12 natively batch zero-instance draws efficiently is not measured.
- The status of a WebGPU backend ([#10768](https://github.com/libsdl-org/SDL/issues/10768)) and of upstream occlusion queries was not verified.

---

## 2. RHI abstraction design (handles, command recording, threading, prior art)

### Takeaway
For C17, the best-documented model is sokol_gfx: handle-based (32-bit index + generation) pooled resources, a stateless pass/pipeline/bindings/draw API, and deferred destruction. The 2025 trend, led by Aaltonen's "No Graphics API", goes further: GPU pointers, a global bindless heap, minimal PSOs and stage-mask-only barriers. Design the thin RHI so that its *upper* surface could later grow toward that model, while the SDL_GPU backend implements a "slot binding" subset.

### Cited Findings
**Handles vs pointers (floooh)**
- Use index-handles into fixed arrays instead of pointers. The lower bits are the slot index. The 2025 update uses a per-slot generation counter, bumped on free, and a slot is disabled on counter overflow. 32-bit handles allow ~4 billion items over time. — [floooh: Handles are the better pointers](https://floooh.github.io/2018/06/17/handles-vs-pointers.html)
- Benefits: no dangling-pointer UB (stale handles are detected at lookup), centralized ownership and deferred destruction "when a GPU still uses a resource", relocatable storage, enforced upper bounds ("never more than 1024 textures"), and plain-value handles that suit C APIs. Pointers obtained from handles must never be stored. sokol-gfx is cited as an example of a C API using handles. — [floooh](https://floooh.github.io/2018/06/17/handles-vs-pointers.html)

**sokol_gfx evolution**
- Recent design posts: "compute milestone 2" (2025-05-19), "resource view update" (2025-08-17), and "experimental Vulkan backend" (2025-12-01). — [floooh.github.io](https://floooh.github.io/)
- Vulkan backend design:
  - Maps `sg_apply_bindings()` onto `EXT_descriptor_buffer`, described as "an absolutely perfect match". Bindings are copied into a per-frame descriptor buffer. Set 0 holds uniforms; set 1 holds textures, storage buffers/images and samplers.
  - Requires Vulkan 1.3 plus descriptor_buffer, bufferDeviceAddress, dynamicRendering, synchronization2 and extendedDynamicState.
  - Barriers are lazy, inserted in begin/end pass, apply_bindings and updates by tracking each resource's current access.
  - Resource lifetime uses a double-buffered delete queue drained at frame acquisition with a per-frame VkFence.
  - Uniforms use a per-frame host-visible ring: `sg_apply_uniforms` is a memcpy plus dirty flag.
  - The backend is "a bit over 3 kloc".
  - floooh says dynamic rendering is "a de-OOP'd version of the Metal render-pass model", WebGPU bind groups need hash-and-cache, and "a low-level and explicit API DOES NOT HAVE TO BE a hassle to use."
  - Source: [floooh: Sokol Vulkan backend](https://floooh.github.io/2025/12/01/sokol-vulkan-backend-1.html)

**Sebastian Aaltonen, "No Graphics API" (Dec 2025)**
- Thesis: DX12, Vulkan and Metal were designed around GPUs from about 13 years ago. With coherent caches, CPU-visible memory (UMA/ReBAR) and bindless, most persistent-object machinery is unnecessary. He cites the PSO explosion, with shader caches exceeding 100 GB. — [sebastianaaltonen.com](https://www.sebastianaaltonen.com/blog/no-graphics-api)
- Proposed model:
  - `gpuMalloc` returns CPU-mapped memory with GPU addresses, and creation is separate from heap allocation.
  - Textures are 32-bit indices into a global descriptor heap, and buffers are 64-bit pointers.
  - Each draw or dispatch receives one 64-bit root pointer to a CPU/GPU-shared struct, so there are no bind groups or root signatures, and PSO creation takes only shader IR.
  - Barriers take only producer and consumer stage masks plus a small hazard bitfield. There are no per-resource layout transitions.
  - Sync uses a 64-bit timeline-style counter. Command buffers are transient, re-recorded each frame.
  - Vertex buffers are replaced by manual fetch via pointers.
  - His Vulkan PSO backend is ~400 lines, versus 18 for the proposed equivalent.
  - Source: [sebastianaaltonen.com](https://www.sebastianaaltonen.com/blog/no-graphics-api)
- He criticizes Metal's 64-bit per-texture handles because they prevent contiguous descriptor ranges. He praises Metal's barrier design. — [sebastianaaltonen.com](https://www.sebastianaaltonen.com/blog/no-graphics-api)
- Secondary report: an MIT-licensed "NoGraphicsAPI" prototype on Vulkan 1.4 was released on GitHub on 2026-09-06, tied to a SIGGRAPH 2026 talk. — [CGWorld (JP), unverified elsewhere](https://cgworld.jp/flashnews/01-202610-NoGraphicsAPI.html)

### Inferences
- Recommended C17 RHI shape:
  - Typed 32-bit handles (`rhi_texture_t {uint32_t id;}`) over per-type pools with generation counters.
  - Descriptor structs with designated initializers (sokol style).
  - Per-frame transient command lists recorded on worker threads.
  - Deferred-destroy queue keyed on frame fence.
  - No exposed barriers in v1, since SDL_GPU hides them. Keep the "resource access" declared per pass so a future native backend can derive barriers. This is the sokol Vulkan approach.
- Command recording on multiple threads under SDL_GPU: one `SDL_GPUCommandBuffer` per worker thread, acquired and submitted on that thread, with submission order coordinated by the frame graph. The alternative is to record engine-side command packets on workers and translate them on one render thread. The second is simpler, and safer given the thread-affinity rules.
- Design the binding abstraction as "per-draw small push data + a few storage buffers + material texture set". That maps 1:1 to SDL_GPU slots now and to bindless or root-pointer models later. The other route, root pointer only, cannot be implemented on SDL_GPU.

### Gaps
- Not researched in this pass, so I make no claims about them: bgfx, Diligent, NVRHI, The Forge, Wicked Engine's GraphicsDevice, Our Machinery renderer posts, and Unreal RHI. Most are C++. bgfx has a C99 API wrapper and Diligent offers C interfaces, but I did not verify either here. The report writer should not cite specifics about them without sources.
- I did not read the 2025 sokol "resource views" post in detail; its URL is [here](https://floooh.github.io/2025/08/17/sokol-gfx-view-update.html).
- The NoGraphicsAPI GitHub release is confirmed only by one Japanese news site.

---

## 3. Render graph / frame graph: is it worth it for a small engine?

### Takeaway
Frostbite's FrameGraph (GDC 2017) and Granite's render graph earn their keep mainly through **automatic barriers, layout transitions, transient-memory aliasing and pass culling**. SDL_GPU already hides barriers and layouts and gives no memory-aliasing control. So on SDL_GPU, a *lightweight* graph (declared pass inputs and outputs, topological order, pass culling, transient texture pooling by descriptor, debug visualization) is worth it. A Granite-style ~3 kLOC graph with barrier and aliasing logic only pays off once a native Vulkan, Metal or D3D12 backend exists.

### Cited Findings
- **Frostbite FrameGraph** (Yuriy O'Donnell, GDC 2017): a graph of all render passes and resources that enables decoupled, modular feature implementation. Headline points include automated ESRAM aliasing and "saved tons of GPU memory". Aliasing is opt-in per pass and "can hurt performance if misused". Transient resources live at most one frame. — [GDC Vault session](https://gdcvault.com/play/1024612/contactUs); [SlideShare deck](https://www.slideshare.net/DICEStudio/framegraph-extensible-rendering-architecture-in-frostbite). Exact memory numbers were not retrieved.
- **Granite (themaister, 2017):**
  - Passes declare named inputs and outputs (read-only, write-only or read-write). Resources are transient or persistent, and one is promoted to backbuffer.
  - Goal: "take care of barriers, layout transitions, semaphores, scheduling".
  - The bake step does validation, then topological sort bottom-up from the backbuffer (unreached passes are implicitly culled), then greedy reordering to separate writers and readers, then render-pass merging for tilers, then transient attachments, then barrier generation, then image aliasing, then async compute.
  - Source: [themaister: Render graphs and Vulkan — a deep dive](https://themaister.net/blog/2017/08/15/render-graphs-and-vulkan-a-deep-dive/)
- Granite's caveats:
  - The graph is "a 3 ksloc behemoth (sigh)" and the reorderer is "probably very inoptimal in terms of CPU time".
  - Reordering can break subpass merging, and aliasing can add barriers and reduce overlap, so it "needs a cost model".
  - Two async-compute bugs were found while writing the post.
  - Even so, the author was "quite happy how this turned out". No performance numbers were given.
  - Source: [themaister](https://themaister.net/blog/2017/08/15/render-graphs-and-vulkan-a-deep-dive/)
- sokol's Vulkan backend shows the alternative: lazy, per-resource access tracking inside begin pass, apply bindings and end pass, without a graph. — [floooh Vulkan backend](https://floooh.github.io/2025/12/01/sokol-vulkan-backend-1.html)

### Inferences
- On SDL_GPU, the graph's job reduces to:
  - ordering passes and choosing load and store ops (CLEAR or DONT_CARE vs LOAD),
  - culling unused passes,
  - pooling transient textures by (format, size, usage) across frames, since true aliasing is impossible (no heaps),
  - deciding `cycle` flags,
  - grouping copy, compute and render passes into command buffers for multi-threaded recording.
- A few hundred lines of C should suffice for this tier. This is an estimate, not sourced.
- Keep the API "declare reads and writes per pass" from day one. It is the precondition for barrier generation when a native backend arrives, and for debug tooling (graph dumps).
- For an open world with CSM, G-buffer, SSAO, bloom, reflections and many post passes (GTA V has 88 render targets per frame, §4), a declarative graph significantly simplifies feature toggling and resolution scaling.

### Gaps
- I found no quantitative small-engine cost/benefit study. The "Render graph 101"-type blogs were not fetched.
- FrameGraph memory-saving figures were not retrieved; they are in the slides.

---

## 4. Open-world rendering techniques and what is feasible on SDL_GPU without bindless

### Takeaway
The GTA V reference frame is classic deferred: 4 LDR G-buffer MRTs + depth, 4-cascade CSM in a single atlas, low-res dynamic env map, half-res SSAO, about 4k draw calls. All of this is directly implementable on SDL_GPU. Ubisoft-style GPU-driven pipelines (compute culling + multi-draw indirect + clustering) are implementable *in a reduced form*: compute frustum and Hi-Z occlusion culling into indirect args, with draws bucketed by pipeline + material-texture-set. Fully material-agnostic "one draw for everything" and visibility-buffer shading need bindless or texture-array or virtual-texture tricks.

### Cited Findings
**GTA V (Adrian Courrèges' graphics study, 2015)**
- **G-buffer:** deferred with 5 targets per draw call (MRT): 4 LDR RGBA8 buffers (diffuse, normal, specular, irradiance) + depth-stencil. Depth uses reversed logarithmic Z against Z-fighting at long distance. Stencil tags mesh categories. The G-buffer pass takes ~1900 draw calls. — [Courrèges GTA V study](http://www.adriancourreges.com/blog/2015/11/02/gta-v-graphics-study/)
- **Shadows:** 4 cascades packed in one 1024×4096 texture, frustum-culled, ~1000 draw calls. A 1/8-res "early-out" buffer skips blur for fully lit pixels. — [Courrèges](http://www.adriancourreges.com/blog/2015/11/02/gta-v-graphics-study/)
- **LOD:** per-object draw and LOD decisions, which the study attributes to a compute shader. LOD transitions use alpha stippling (dither) smoothed in post. — [Courrèges](http://www.adriancourreges.com/blog/2015/11/02/gta-v-graphics-study/)
- **Reflections:** 128×128 HDR cubemap per frame (~30 draws per face), converted to dual-paraboloid. Planar water reflection at 240×120 (~650 draws). SSAO at half resolution with depth-aware blur. — [Courrèges](http://www.adriancourreges.com/blog/2015/11/02/gta-v-graphics-study/)
- **Post and totals:** Uncharted 2 tone mapping, bloom, eye adaptation, FXAA, lens distortion. Totals: 4155 draw calls, 1113 textures, 88 render targets per frame. — [Courrèges](http://www.adriancourreges.com/blog/2015/11/02/gta-v-graphics-study/)

**GPU-driven rendering (Haar & Aaltonen, Ubisoft, SIGGRAPH 2015)**
- **Assassin's Creed Unity:** batches per *material instance* rather than per mesh, combined with *mesh clustering* for effective GPU culling. Also uses shadow occlusion culling and pre-calculated triangle back-face culling. — [Advances in RTR 2015](https://advances.realtimerendering.com/s2015/index.html)
- **RedLynx pipeline:** "clean slate" design with async compute, indirect dispatch and multidraw, rendering heavily populated scenes "with only a handful of indirect draw calls and no CPU intervention". Virtual texturing is integral, and the pipeline reaches hundreds of thousands of objects at 60 fps on console. Slides: [PDF](https://advances.realtimerendering.com/s2015/aaltonenhaar_siggraph2015_combined_final_footer_220dpi.pdf). — [Advances in RTR 2015](https://advances.realtimerendering.com/s2015/index.html)
- The standard compute-culling pattern is that compute appends visible commands to an args buffer consumed by indirect execution. Shown for D3D12 ExecuteIndirect: [Microsoft D3D12 indirect drawing & GPU culling](https://learn.microsoft.com/en-us/windows/win32/direct3d12/indirect-drawing-and-gpu-culling-)

**SDL_GPU constraints relevant here** (see §1)
- No bindless (closed not planned, Jun 2026). A user in the thread argued bindless is needed for GPU-driven rendering, and users described texture arrays and atlases as painful (management, bleeding, packing) and mega-buffers as bookkeeping-heavy. — [SDL #11148](https://github.com/libsdl-org/SDL/issues/11148)
- Indirect `draw_count` is CPU-side, and Metal emulates multi-draw with a CPU loop. — [SDL_gpu.h](https://raw.githubusercontent.com/libsdl-org/SDL/main/include/SDL3/SDL_gpu.h); [SDL_gpu_metal.m](https://raw.githubusercontent.com/libsdl-org/SDL/main/src/gpu/metal/SDL_gpu_metal.m)
- Per stage: 16 samplers, 8 storage textures, 8 storage buffers. — [SDL_sysgpu.h](https://raw.githubusercontent.com/libsdl-org/SDL/main/src/gpu/SDL_sysgpu.h)
- No occlusion queries upstream. — [quetoo #1093](https://github.com/jdolan/quetoo/issues/1093)
- Mesh shaders are not planned for now. — [SDL Wiki CategoryGPU](https://wiki.libsdl.org/SDL3/CategoryGPU)

### Inferences (feasibility on SDL_GPU)
**Works well**
- Deferred G-buffer à la GTA V (≤4 color MRT + depth fits the documented limit).
- CSM in an atlas or a 2D_ARRAY (depth texture arrays were fixed in 3.4.x).
- Clustered or tiled light culling in compute, with light lists in storage buffers. This works for both clustered forward (transparents) and deferred.
- Hi-Z pyramid via compute.
- Half-res SSAO, bloom and TAA/FXAA.
- Instanced vegetation with compute-generated instance buffers.

**Works with caveats: GPU-driven culling**
- Keep a persistent storage buffer of instance data (transform, bounds, LOD ranges, material ID) and mesh data in a few big vertex and index buffers ("mega-buffers").
- A compute pass does frustum + Hi-Z occlusion (two-phase with previous-frame depth) + LOD selection and writes `SDL_GPUIndexedIndirectDrawCommand`s into fixed slots, with zero instances for culled ones.
- Then issue one `SDL_DrawGPUIndexedPrimitivesIndirect` per (pipeline, material texture set) bucket.
- Draw-call count becomes O(material buckets), not O(objects). On Metal, CPU cost still grows with slot count because of the per-draw loop.

**Material textures without bindless**
- Use texture 2D_ARRAYs grouped by format and size (e.g. 1024² BC7 albedo array, normal array), with the material ID indexing a layer in a storage buffer.
- Alternatively, use virtual texturing (feedback pass + page table + physical cache texture), as RedLynx did. This is the most bindless-like route, but complex.

**Visibility buffer**
- The geometry pass is feasible: it writes triangle and instance IDs into an R32_UINT target.
- The material-resolve pass needs to fetch any material's textures. That requires texture arrays or virtual texturing, and vertex-attribute fetch from storage buffers (fine).
- Feasible but constrained. Prefer deferred first.

**HLOD and impostors**
- A pure content and streaming concern; nothing in SDL_GPU blocks it. Impostor atlases fit 2D_ARRAY textures.
- Distant terrain and city blocks are good candidates for merged HLOD meshes drawn with ordinary or indirect draws.

**Not feasible in SDL_GPU (needs a native backend)**
- Mesh shaders, meshlet-level cone culling in hardware, true bindless.
- GPU-count indirect (`DrawIndirectCount`); work around it with fixed slots + zero instances.
- GPU timestamps and occlusion queries; Hi-Z compute replaces occlusion queries anyway.
- Async compute queues: SDL_GPU exposes no separate queues. This is an inference from the API surface; there is no queue type in the header.

### Gaps
- Clustered forward vs deferred comparison sources (e.g. Ola Olsson's clustered shading, Doom 2016) were not fetched in this pass.
- No sources were fetched on HLOD/impostors (e.g. Fortnite/UE HLOD, Ryan Brucks' impostors) or visibility buffer (Burns & Hunt 2013, Wihlidal GDC 2016, "Visibility Buffer Rendering" in The Forge).
- I did not find any public engine doing full GPU-driven rendering on SDL_GPU to cite as proof.
- Exact AC Unity cluster size (64 triangles is commonly quoted) is not verified from the slides here.

---

## 5. Shader pipeline: HLSL authoring, shadercross/DXC/SPIRV-Cross, hot reload

### Takeaway
Author in HLSL. Compile offline with SDL_shadercross (CLI) or DXC → SPIR-V, then SPIRV-Cross → MSL, plus DXIL for D3D12. Respect SDL_GPU's fixed register spaces (space0/1 for VS, space2/3 for PS) and generate the resource-count metadata that `SDL_CreateGPUShader` needs from reflection. Hot reload: watch files and recompile at runtime with shadercross-as-a-library (dev builds only, bundling DXC + SPIRV-Cross), then recreate the pipelines.

### Cited Findings
- SDL_shadercross takes SPIR-V or HLSL and outputs DXBC, DXIL, SPIR-V, MSL or HLSL. It supports runtime translation that "conveniently returns compiled SDL GPU shader objects from HLSL or SPIRV source" and has a CLI for offline translation. License: zlib. — [SDL_shadercross GitHub](https://github.com/libsdl-org/SDL_shadercross)
- shadercross dependencies:
  - SPIRV-Cross (spirv-cross-c-shared, from the Vulkan SDK) for SPIR-V translation.
  - dxcompiler + dxil (DXC releases) for DXIL output.
  - d3dcompiler_47 (Windows) or vkd3d-utils (other platforms) for DXBC.
  - "Strongly recommended that you ship SPIRV-Cross and DXIL dependencies along with your application" when using the runtime path.
  - Source: [SDL_shadercross](https://github.com/libsdl-org/SDL_shadercross)
- The repo showed no formal release or version on the fetched page (157 commits, 509 stars). Treat it as pre-1.0 or rolling. — [SDL_shadercross](https://github.com/libsdl-org/SDL_shadercross)
- Hemsley's introduction post: "Introducing: SDL_shadercross" (Nov 2024). — [moonside.games posts](https://moonside.games/posts)
- The SDL wiki prefers offline compilation and calls shadercross the cross-compiler for HLSL/SPIR-V to SPIR-V, DXBC, DXIL and MSL, also usable at runtime. — [SDL Wiki CategoryGPU](https://wiki.libsdl.org/SDL3/CategoryGPU)
- Shader format flags: `PRIVATE` (NDA consoles), `SPIRV`, `DXBC` (SM5.1), `DXIL` (SM6.0), `MSL`, `METALLIB`. The app declares the formats it supplies at device creation, and SDL picks a backend accordingly. — [SDL_gpu.h](https://raw.githubusercontent.com/libsdl-org/SDL/main/include/SDL3/SDL_gpu.h); [SDL Wiki CategoryGPU](https://wiki.libsdl.org/SDL3/CategoryGPU)
- Shaders must declare exact counts of samplers, storage textures, storage buffers and uniform buffers in `SDL_GPUShaderCreateInfo`, and the wiki suggests reflection. `SDL_PROP_GPU_SHADER_CREATE_NAME_STRING` names shaders for debuggers. — [SDL Wiki CategoryGPU](https://wiki.libsdl.org/SDL3/CategoryGPU); [SDL_CreateGPUShader](https://wiki.libsdl.org/SDL3/SDL_CreateGPUShader)

### Inferences
- Offline pipeline per shader:
  1. HLSL → (DXC) SPIR-V and DXIL.
  2. SPIR-V → (SPIRV-Cross) MSL. Optionally precompile to `.metallib` with `xcrun metal` on macOS to avoid runtime MSL compile cost.
  3. Emit a small sidecar (JSON or binary header) with resource counts and threadcount for compute.
  4. Pack all variants into an engine shader archive keyed by hash.
- On macOS dev (M4 Pro), you need SPIR-V → MSL at minimum. DXIL is needed only for the Windows target, but DXC runs on macOS too.
- Use HLSL register macros (e.g. `#define VS_TEX(n) register(t##n, space0)`) or a codegen'd header so the SDL slot layout is enforced at compile time. Mismatches are the #1 reported error.
- Hot reload:
  - In dev builds, link shadercross as a library and watch the source dir.
  - On change, recompile to the active backend's format, create the new `SDL_GPUShader`s, and rebuild the dependent `SDL_GPUGraphicsPipeline`s.
  - Swap the handles at a frame boundary, and release the old objects after the frame fence (deferred-destroy queue from §2).
  - The handle indirection (§2) makes the swap transparent to gameplay code.
- Keep a native-backend escape hatch in mind. If bindless or timestamps become critical, slouken's suggested route is native Vulkan. Equivalents would be Metal argument buffers and D3D12 descriptor heaps. That only works if the RHI's binding abstraction does not hard-code SDL's slot model into material code.

### Gaps
- Not verified: whether the shadercross CLI emits reflection JSON (resource counts), and its exact CLI flags. Check the repo README and source directly.
- No first-hand source fetched on Slang as an alternative HLSL-like front end, or on its 2026 SDL_GPU support.
- Pipeline (PSO) creation cost on SDL_GPU and whether SDL caches pipelines internally were not researched.
