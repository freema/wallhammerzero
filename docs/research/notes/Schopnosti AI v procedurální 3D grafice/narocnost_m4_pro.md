# Hardware demands of a custom procedural 3D open-world engine on MacBook Pro 14" M4 Pro (12C CPU / 16C GPU / 24 GB)

Research date: 2026-11-05. Target machine (verified locally via system_profiler/sysctl): Mac16,8, M4 Pro 8P+4E, 16-core GPU, 24 GB (25,769,803,776 B), 460 GB SSD with 160 GB free, macOS 15.8.1. Most M4 Pro reviews date from Nov 2024 (launch); Notebookcheck's analysis page was last modified 2026-10-05. Many reviews tested the 14-core/20-GPU bin, not this 12-core/16-GPU bin. Every number below says which bin it is for.

**Scope (updated):** The low-res "3D pixel art" look was rejected. The GPU analysis targets a **native or near-native resolution, free-perspective 3D camera, at GTA III / World of Warcraft visual level or better**: stylised textured 3D, a dense city, many textured instances, shadows and fog. Pixel counts used in the estimates:

| Resolution | Mpx |
|---|---|
| Retina native 3024×1964 | 5.94 |
| 1512×982 (exact 2× integer scale on the 14" panel) | 1.48 |
| 1080p | 2.07 |
| 1440p | 3.69 |

## 1. GPU: raw specs, benchmarks vs discrete GPUs, real games, TBDR, and what SDL_GPU exposes

### Takeaway
The M4 Pro 16-core GPU is roughly an RTX 4050 Laptop on modern rasterization (Steel Nomad 1620 vs 4050L 1613 and 4060L 2178). It is close to an RTX 4060 Laptop only on older or lighter tests like Wild Life Extreme. It runs Cyberpunk 2077 at about 38–60 fps at native 1080p, depending on preset.

Recommended targets for a stylised GTA III / WoW-class renderer (internal resolution):
- **60 fps:** comfortable at about **1512×982 to 1080p**.
- **60 fps at 1440p:** feasible with care.
- **Full Retina 3024×1964 (5.9 Mpx):** a 30–45 fps proposition unless shading is kept very cheap.

MetalFX is not reachable through SDL_GPU, so any upscaling has to be a custom shader: spatial (FSR1-like) or a self-written TAA upsampler.

### Cited Findings
**Specs**
- The 16-core GPU is a 16-of-20-core bin of the M4 Pro SoC. It uses shared LPDDR5x-8533 at **273 GB/s**, has hardware ray tracing and mesh shading, and is built on TSMC second-generation 3 nm. Announced 30 Oct 2024. Notebookcheck does not list ALU count, clock or TFLOPS. — [Notebookcheck: M4 Pro 16-Core GPU](https://www.notebookcheck.net/Apple-M4-Pro-16-Core-GPU-Benchmarks-and-Specs.937474.0.html)
- Bandwidth rose from 150 GB/s on the M3 Pro (LPDDR5-6400) to 273 GB/s on the M4 Pro (LPDDR5x-8533). Both M4 Pro bins have the same bandwidth and the same 24/48 GB RAM options. — [Notebookcheck M4 Pro analysis (2024-11-11, mod. 2026-10-05)](https://www.notebookcheck.net/Apple-M4-Pro-analysis-Extremely-fast-but-not-as-efficient.915270.0.html)
- The only TFLOPS figure found was a third-party estimate of ~17.2 **FP16** TFLOPS for the 20-core bin. No sourced FP32 figure exists for the 16-core bin. — [jdhodges Apple CPU comparison chart](https://www.jdhodges.com/blog/apple-cpu-compared-m1-m3-m3-m4-m5-max/) (secondary source)
- GPU power: about 25 W iGPU under Unigine Valley for the 12-core M4 Pro (powermetrics). System draw was ~60.6 W in GFXBench Aztec and ~64–68.6 W in Cyberpunk 2077. The 20-core bin's GPU peaks at 32 W. — [Notebookcheck 16-core GPU page](https://www.notebookcheck.net/Apple-M4-Pro-16-Core-GPU-Benchmarks-and-Specs.937474.0.html); [Notebookcheck analysis](https://www.notebookcheck.net/Apple-M4-Pro-analysis-Extremely-fast-but-not-as-efficient.915270.0.html)

**Synthetic benchmarks (M4 Pro 16-core GPU)**

All figures are from [Notebookcheck 16-core GPU page](https://www.notebookcheck.net/Apple-M4-Pro-16-Core-GPU-Benchmarks-and-Specs.937474.0.html) and [Notebookcheck analysis](https://www.notebookcheck.net/Apple-M4-Pro-analysis-Extremely-fast-but-not-as-efficient.915270.0.html).

| Benchmark | M4 Pro 16C | Comparison |
|---|---|---|
| 3DMark Steel Nomad | 1620 | RTX 4050 Laptop 1613, RTX 4060 Laptop 2178 |
| 3DMark Steel Nomad Light | avg 6738 (6624–6851) | RTX 4060 Laptop 9584, RTX 4070 Laptop (ProArt P16) 12189 |
| 3DMark Wild Life Extreme Unlimited | 16,143 | RTX 4060 Laptop 17,749 on the GPU page / 21,662 in the analysis (two different 4060L results); M4 Pro 20C 19,284 |
| 3DMark Solar Bay | 15,814 | |
| 3DMark Solar Bay Extreme | 5035 | |
| GFXBench 4K Aztec High | ~103–104 fps | |
| GFXBench 1440p Aztec High | 234.5 fps | |
| Blender 3.3 Classroom (Metal) | 52 s | |
| Geekbench 6 Metal | ~98–99k | M4 Pro 20C 113k, M3 Max 155k |
| Geekbench 6 OpenCL | ~60.4k | |
| Cinebench 2024 GPU | 7768 | 20C 9085 |

- The 20-core bin leads the 16-core bin by about 14–22% across tests. — [Notebookcheck analysis](https://www.notebookcheck.net/Apple-M4-Pro-analysis-Extremely-fast-but-not-as-efficient.915270.0.html)
- Nanoreview agrees on Steel Nomad Light (16C ≈ 6739 vs 4060 Laptop 10212). — [Nanoreview M4 Pro 16C](https://nanoreview.net/en/gpu/apple-m4-pro-gpu-16-core)

**Native and ported games on this GPU**
- Cyberpunk 2077 at 1080p (Notebookcheck): ~60 fps low, 51 medium, 43 high, 38 ultra.
- Baldur's Gate 3 at 1080p: 84 fps low, 71 medium, 53 high, ~51 ultra. Notebookcheck says BG3 performance is similar to an RTX 4050 Laptop under Windows 11.
- Civilization 7: 145 fps at 1080p high, 95.9 at 1440p, 47.8 at 4K.
- Total War: Pharaoh at 1080p: 49–65 fps.
- Sources for the four lines above: [Notebookcheck 16-core GPU page](https://www.notebookcheck.net/Apple-M4-Pro-16-Core-GPU-Benchmarks-and-Specs.937474.0.html)
- Cyberpunk 2077 community benchmarks (12C/16G M4 Pro at 1600p): ~56.3 fps on Medium with MetalFX Balanced and no RT, ~28.8 fps on Ultra+RT with MetalFX Performance. The 14C/20G bin gets 63.2 and 32.8 fps. Column mapping in the ComputerBase table is approximate. — [ComputerBase community benchmark thread](https://www.computerbase.de/forum/threads/cyberpunk-2077-auf-dem-mac-community-benchmarks-mit-apple-silicon-von-m1-bis-m4-max.2247687); [Tom's Hardware summary](https://tomshardware.com/video-games/pc-gaming/cyberpunk-2077-mac-benchmarks-show-most-apple-silicon-can-run-the-game-at-over-30-fps-on-medium-settings-results-vary-from-a-smooth-130-fps-to-a-cinematic-24-fps)
- GPU gaming efficiency on the M4 Pro 20C is *worse* than the M3 Pro: Witcher 3 0.883 vs 1.075 fps/W. — [Notebookcheck analysis](https://www.notebookcheck.net/Apple-M4-Pro-analysis-Extremely-fast-but-not-as-efficient.915270.0.html)

**Tile-based deferred rendering (TBDR) and SDL_GPU**
- Apple GPUs perform best when system-memory bandwidth is minimized. Apple recommends structuring render passes to cut load and store traffic. — [WWDC20 "Optimize Metal Performance for Apple silicon Macs" (10632)](https://developer.apple.com/videos/play/wwdc2020/10632)
- Load and store actions are per-tile bulk operations. Apple's main advice is to avoid loading what you don't need (use don't-care or clear). — [WWDC21 10153](https://developer.APPle.com/videos/play/wwdc2021/10153/)
- Tile memory is fast on-GPU temporary storage. Each tile's final result is written to device memory, and tile shaders can keep intermediate data in tile memory. — [Apple: Tailor your apps for Apple GPUs and TBDR](https://developer.apple.com/tutorials/data/documentation/metal/tailor-your-apps-for-apple-gpus-and-tile-based-deferred-rendering.md)
- SDL_GPU exposes `SDL_GPULoadOp` (LOAD / CLEAR / DONT_CARE) and `SDL_GPUStoreOp` (STORE / DONT_CARE / RESOLVE / RESOLVE_AND_STORE). DONT_CARE means the contents "are not needed and may be discarded". — [SDL wiki SDL_GPUStoreOp](https://wiki.libsdl.org/SDL3/SDL_GPUStoreOp)
- SDL's Metal backend maps these 1:1 through lookup tables to `MTLLoadAction{Load,Clear,DontCare}` and `MTLStoreAction{Store,DontCare,MultisampleResolve,StoreAndMultisampleResolve}` in `METAL_BeginRenderPass`. Textures are created with `MTLStorageModePrivate`. No `MTLStorageModeMemoryless` usage was found in the first ~100k characters of the file, which is about 54% of it. — [SDL_gpu_metal.m (main)](https://raw.githubusercontent.com/libsdl-org/SDL/main/src/gpu/metal/SDL_gpu_metal.m)

### Inferences
- **FP32 throughput (unsourced estimate):** Apple GPU cores have 128 FP32 ALUs, and the M4-family GPU clock is about 1.5–1.6 GHz. That gives 16 × 128 × 2 × ~1.55 GHz ≈ **~6.3–6.5 FP32 TFLOPS**. Treat this as an estimate; I did not find it in a source.
- **Calibration against Cyberpunk:**
  - Cyberpunk 2077 at native 1080p takes ~16.7 ms (low) to ~26 ms (ultra) per frame on this GPU.
  - A GTA III / WoW-class stylised renderer has much simpler per-pixel shading: albedo texture, one sun light with cascaded shadows, fog, a few point lights, no RT and no heavy volumetrics.
  - Plausible cost: roughly **⅓–½ of Cyberpunk-low per pixel**, i.e. ~5–9 ms of GPU at 1080p for the full frame including shadows.
  - Scale the pixel-bound part linearly:
    - 1440p: ×1.8
    - Retina native: ×2.9 vs 1080p
    - 1512×982: ×0.72
- **Internal resolution and upscale choices on the 14" Retina panel:**
  - **1512×982 → 2× integer upscale.** Cleanest and cheapest. It matches macOS's default "looks like" resolution. Render the UI at native resolution on top.
  - **~2016×1309 (⅔ scale) + spatial upscale.** An FSR1-style EASU+RCAS shader is custom code; FSR1 is open source and a single compute or fragment pass.
  - **Native 3024×1964.** Only with very cheap shading or a 30 fps target.
  - **External monitor:** 1080p or 1440p native.
- **MetalFX is unavailable:** SDL_GPU deliberately does not expose native API objects (MTLDevice/MTLTexture). The SDL forum statement predates current SDL3, but no SDL_GPU getter for native Metal handles was found in 2026 searches. The only Metal-interop properties found are on the 2D renderer (SDL_render.h, July 2026 patch). — [SDL Discourse: Metal texture access](https://discourse.libsdl.org/t/metal-texture-access/42337); [SDL: extended interop with the 2D Metal renderer](https://discourse.libsdl.org/t/sdl-support-extended-interop-with-the-2d-metal-renderer/68996). MetalFX temporal upscaling would therefore need a side Metal path outside SDL_GPU or an SDL patch.
- **What scales with scene complexity, not resolution:**
  - Cascaded shadow maps: 3–4 cascades at 2048². Their cost grows with draw count and triangle count per cascade, plus distant LOD.
  - Vertex and instance throughput for tens of thousands of textured instances in dense city cells.
  - Overdraw from building facades, foliage and alpha-tested props.
  In a GTA-like city, shadows and geometry typically take a third to a half of GPU time.
- **TBDR, forward vs deferred:** Assume a G-buffer of ~20 B per pixel (depth + 3–4 RTs) with ~3 read/write passes:
  - 1512×982: ~90 MB per frame, ~5 GB/s at 60 fps.
  - Retina native: ~360 MB per frame, ~21 GB/s.
  - Both fit in 273 GB/s, but the bandwidth is shared with the CPU, and on TBDR every STORE/LOAD of a full-screen target is a real cost.
  - **Forward(+) with 4× MSAA** suits Apple TBDR well: MSAA samples live in tile memory and are resolved on store, with the MSAA target set to DONT_CARE. SDL_GPU exposes RESOLVE store ops.
  - Deferred is fine if light counts are high, but set every intermediate that isn't reused (depth after lighting, MSAA colour) to DONT_CARE.
  - SDL_GPU exposes neither memoryless attachments nor tile shaders.
- **Shadows:** Use 3 cascades at 2048² for the near city plus static or cached far shadows (re-render far cascades every N frames). This is the most effective GPU saving in a GTA-like scene.

### Gaps
- No primary source for FP32 TFLOPS or GPU clock of the 16-core bin. Apple's spec page does not publish TFLOPS.
- Death Stranding and Resident Evil (Village / RE4 / RE Requiem) fps on the M4 Pro 16C were not found. The Notebookcheck page was truncated before those entries.
- The second half of SDL_gpu_metal.m was not read, so memoryless usage is not fully ruled out.

## 2. CPU: single-core and multi-core performance, P and E cores, job-system scaling

### Takeaway
The 12-core M4 Pro has very fast single-thread performance: Geekbench 6 single-core ~3840 and Cinebench 2024 single-core 176, ahead of desktop Ryzen 9 9950X and Core Ultra 9 285K in these tests. Multi-core is about 20.4k in Geekbench 6 and ~1400–1435 in Cinebench 2024. For a job system, plan on 8 P-cores as the real compute pool. The 4 E-cores give background throughput at roughly a third of P-core speed and must be fed with the right QoS.

### Cited Findings
- **M4 Pro 12-core** (all figures from [Notebookcheck analysis](https://www.notebookcheck.net/Apple-M4-Pro-analysis-Extremely-fast-but-not-as-efficient.915270.0.html)):
  - Cinebench 2024 single 176, multi 1403–1435.
  - Geekbench 6.7 single 3837–3844, multi 20385–20458.
  - Cinebench R23 multi 18569.
- **M4 Pro 14-core**, same source: Cinebench 2024 multi 1662, Geekbench 6 multi 22544, R23 multi 23433. The 12-core trails it by 10–26% in multi-core and 1–2% in single-core.
- **Comparison CPUs:** Ryzen 9 9950X scores Cinebench 2024 single 136 and Geekbench 6 single 3408. Core Ultra 9 285K scores Geekbench 6 single 3306. — same source
- **CPU power:** single-core ~6–6.5 W; multi-core peaks at 46 W and settles at ~40 W sustained. — [Notebookcheck MBP 14 review](https://www.notebookcheck.net/Apple-MacBook-Pro-14-2024-review-The-M4-Pro-and-matte-display-are-massive-upgrades.914597.0.html); [analysis](https://www.notebookcheck.net/Apple-M4-Pro-analysis-Extremely-fast-but-not-as-efficient.915270.0.html)
- **Core topology:** M4 E-cores sit in one cluster of 4 sharing L2 and running at a common frequency of 1020–2592 MHz. M4 P-core maximum frequency is 140% of M1. — [Eclectic Light: Inside M4 chips: E and P cores (2024-11-18)](https://eclecticlight.co/2024/11/18/inside-m4-chips-e-and-p-cores/); [CPU core performance](https://eclecticlight.co/2024/11/20/inside-m4-chips-cpu-core-performance/). The article describes the 14-core bin as two P clusters of 5. The 12-core bin's 8 P-cores are presumably 2×4; this split was not found in a source.
- **Scheduling:**
  - Threads with QoS ≤ 9 (background) run *only* on E-cores. Higher-QoS threads prefer P-cores.
  - An E-core gets work only after all P-cores are busy. On the 14-core part that needs 11 threads.
  - Low-QoS threads cannot be moved up to P-cores.
  - Low-QoS E-core threads run near minimum frequency, at about 30% of a Xeon/i9 core.
  - Source for all four points: [Eclectic Light: CPU core management (2024-12-05)](https://eclecticlight.co/2024/12/05/inside-m4-chips-cpu-core-management/)

### Inferences
- **Worker pool:** Use 1 main thread + 7 P-core workers at user-interactive or user-initiated QoS for per-frame jobs: culling, animation, physics islands, command-buffer recording. Run world, mesh and texture generation on separate workers at utility QoS, which can use both P and E cores. Do *not* put generation workers at background QoS. That pins them to E-cores at low clock, and cell generation will lag behind camera speed.
- **Job-system scaling:** Expect near-linear scaling up to ~8 threads for frame jobs. Beyond that, adding the E-cores gives roughly +15–25% total throughput. This estimate comes from multi-core scores of ~20.4k against single-core ~3.84k, i.e. ~5.3× single-core, which is below 8 P + 4 E linear and reflects the shared power limit.
- **Procedural throughput:** Single-thread speed this high makes per-cell CPU generation (SDF meshing, noise textures) feasible on 3–6 workers in the background. The disk content-hash cache removes repeat costs.

### Gaps
- No direct measurement of a game job system (e.g. enkiTS, or Jolt's own JobSystemThreadPool) on the M4 Pro 12-core found.
- No Jolt PerformanceTest numbers for M4 Pro found.

## 3. Thermals, sustained performance, power modes, battery vs AC

### Takeaway
In the 14" chassis the CPU sustains ~40 W, and the 20-core GPU bin is rated at about 32 W. Notebookcheck notes that performance is limited when CPU and GPU are loaded *together*, which is exactly the engine's profile: GPU rendering while CPU workers generate cells. High Power Mode exists on the 14" M4 Pro but mostly raises fan speed. Measured peak gains are negligible, though it may help on long combined loads. Performance on battery is reported as unchanged.

### Cited Findings
- **High Power Mode:** Apple extended it to the MacBook Pro and Mac mini with M4 Pro in Nov 2024. Its stated purpose is to let fans run faster for sustained graphics-heavy workloads. — [MacRumors 2024-11-07](https://www.macrumors.com/2024/11/07/high-power-mode-for-m4-pro-macs/)
- **Notebookcheck MBP 14 review** (2024-11-14; tested the 14C/20G, 48 GB unit, not this machine's bin):
  - No performance difference between Automatic and High Performance modes.
  - Maximum fan noise ~56 dB(A) in High Performance vs 44.5 dB(A) in Automatic.
  - Low Power mode caps the SoC at ~9.5 W.
  - CPU limits: 46 W short burst, 40 W sustained. GPU TDP 32 W.
  - "Performance is limited when CPU and GPU are loaded at the same time." No figures given.
  - CPU performance stays constant on battery. GPU performance stays stable on battery and under constant load.
  - Surface temperatures "can get pretty high", especially around the keyboard.
  - 72.6 Wh battery; 96 W adapter in the tested configuration.
  - Source: [Notebookcheck MBP 14 2024 review](https://www.notebookcheck.net/Apple-MacBook-Pro-14-2024-review-The-M4-Pro-and-matte-display-are-massive-upgrades.914597.0.html)
- Ars Technica (Mac mini M4 Pro) measured High Power Mode gains as "essentially negligible" in CPU and most GPU tests, with "considerably increased" fan noise. — via [heise](https://heise.de/-10014283) / [MacRumors forums](https://forums.macrumors.com/threads/apple-expands-high-power-mode-to-macbook-pro-and-mac-mini-models-with-m4-pro-chip.2442254) (secondary)
- The M4 Pro is less efficient per watt than the M3 Pro in Cinebench R23 multi (281 vs 358 pts/W for the 12-core) and in games. — [Notebookcheck analysis](https://www.notebookcheck.net/Apple-M4-Pro-analysis-Extremely-fast-but-not-as-efficient.915270.0.html)

### Inferences
- **Combined thermal envelope:** Assume ~25 W GPU (12C/16G under load) plus up to ~40 W CPU, for ~60–70 W SoC in a 14" chassis. The Cyberpunk system draw of ~64–68 W supports this range. At ~1080p internal resolution the GPU will sit at roughly 50–80% of its 16.7 ms budget, so it runs well below peak power; at native Retina it would run near its ~25 W ceiling. The risk case is cell generation saturating all 12 cores while the GPU is busy. Mitigations:
  - Cap generation workers at ~4–6.
  - Use utility QoS for generation.
  - Rate-limit cells per second.
  - Test long sessions (20–30 min) with High Power Mode on and off.
- **Frame cap and battery:** Cap at 60 fps (or the display's 120 Hz ProMotion divided down) to avoid wasting the thermal budget. Battery mode should not change performance (per Notebookcheck), but battery life under a game load will be short. This is unquantified.

### Gaps
- No sustained combined CPU+GPU stress log (clocks and temperatures over time) for the **14" M4 Pro 12C/16G** specifically. The Notebookcheck review text was truncated before the stress-test section, and Max Tech data was not retrieved.
- No measurement of the 70 W vs 96 W adapter effect on M4 Pro sustained load. Which adapter this machine has is unknown.

## 4. Unified memory 24 GB: GPU working set and memory pressure

### Takeaway
Metal's `recommendedMaxWorkingSetSize` is a soft guidance threshold ("without affecting runtime performance"). It is commonly about 75% of RAM on large Macs and reportedly lower (~66%) on machines with 32 GB or less. On 24 GB, plan for roughly 16 GB GPU-visible at most. With Xcode, a browser, Claude Code and the OS also resident, a realistic engine budget is about 6–10 GB total (CPU + GPU).

### Cited Findings
- Apple defines `recommendedMaxWorkingSetSize` as "an approximation of how much memory, in bytes, this GPU device can allocate without affecting its runtime performance". — [Apple Developer docs](https://developer.apple.com/tutorials/data/documentation/metal/mtldevice/recommendedmaxworkingsetsize.md); [Apple dev forums thread 732035](https://developer.apple.com/forums/thread/732035)
- Reported ratios:
  - ~75% of RAM is the common community figure.
  - ~84% was measured on a 128 GB M4 Max.
  - ~66% for ≤32 GB machines comes from an anecdotal Reddit claim.
  - Apple does not document the ratio.
  - Sources: [ithelp.ithome.com.tw article](https://ithelp.ithome.com.tw/articles/10403674); [llmconfigurator guide](https://llmconfigurator.com/en/guides/troubleshooting/increase-metal-vram-limit-apple-silicon); [r/LocalLLaMA comment (anecdotal)](https://red.127.pp.ua/r/LocalLLaMA/comments/186phti/m1m2m3_increase_vram_allocation_with_sudo_sysctl/kbbb821/?context=3)
- SDL's Metal backend does not query `recommendedMaxWorkingSetSize` in the visible half of its source. — [SDL_gpu_metal.m](https://raw.githubusercontent.com/libsdl-org/SDL/main/src/gpu/metal/SDL_gpu_metal.m)

### Inferences
- **Engine memory budget for 24 GB with dev tools open** (estimate):

  | Item | Estimate |
  |---|---|
  | macOS + WindowServer | ~3–4 GB |
  | Browser | ~1–3 GB |
  | Xcode with a capture open | ~2–4 GB (a GPU frame capture can spike much higher) |
  | IDE / editor | ~0.5–2 GB |
  | Claude Code (Node process) plus build processes | ~0.5–2 GB |
  | **Left for the engine before swapping** | **~8–12 GB** |

  Set the engine target at **≤6 GB GPU resources + ≤2–3 GB CPU-side**, and keep a hard streaming budget.
- **Streaming budget example (native-resolution textured world):**
  - **Texture sizes:** At 1080p to Retina, materials need ~512²–1024² textures with mips to look sharp up close.
    - 1024² RGBA8 with mips ≈ 5.6 MB uncompressed.
    - 1024² in BC7 or ASTC 4×4 (1 B/px) with mips ≈ 1.4 MB.
    - Apple-silicon Macs support both BC and ASTC. This is general knowledge, not verified here; check `SDL_GPUTextureSupportsFormat`.
  - **Textures must be a shared library, not per instance.** Generate a procedural material library of e.g. 200–500 materials reused across cells, not unique textures per cell or object. 300 materials × ~1.4–5.6 MB ≈ **0.4–1.7 GB**, which fits.
  - **Compression cost:** Unique per-object textures, such as procedural signs or decals, need atlases or a virtual-texture budget. BC7/ASTC encoding on the CPU is slow, roughly tens to hundreds of ms per 1024² texture with good encoders. That makes it a new generation-pipeline cost, which the disk cache by content hash amortises. This is an inference, unmeasured.
  - **Meshes:** ~16–32 B per vertex. A dense city cell with LODs is ~20–80 MB.
  - **Residency:** With ~25–50 resident cells (a 5×5 to 7×7 grid plus far LOD), geometry is ~1–3 GB. Add textures 0.5–2 GB and render targets ~0.1–0.4 GB (Retina G-buffer ≈ 6 Mpx × 20 B ≈ 120 MB plus 2048² shadow cascades at 16 MB each). The GPU total of **~2–5 GB** fits.
  - **What would break it:** uncompressed unique textures per object, or high-poly SDF meshes without LOD.
- **Unified memory:** CPU→GPU uploads are not PCIe copies. Shared-storage buffers can be written directly, but SDL_GPU still uses transfer buffers and copy passes, so the API-level copies remain. Upload cost is mostly memcpy at ~100+ GB/s, which is cheap. This is an inference.
- **Headless review renders:** These run as a second process holding their own GPU resources. Budget about 1–2 GB extra, or run them sequentially rather than alongside the game.

### Gaps
- The exact `recommendedMaxWorkingSetSize` value on a 24 GB M4 Pro under macOS 15.8 was not found. Measuring it with a 5-line Metal snippet on the target machine would settle it.
- No sourced measurements of Claude Code, Xcode or Chrome memory footprints.

## 5. Build side: compile times, toolchains, disk

### Takeaway
Building the project itself is cheap: a C17 codebase of 50–200k lines should do a full clean build in tens of seconds and incremental builds in about a second. The expensive items are third-party: building a full LLVM takes ~6 minutes on the *14-core* M4 Pro. Building DXC from source is avoidable, because prebuilt macOS arm64 DXC exists from community repos (Microsoft ships none for macOS), and SDL_shadercross macOS arm64 builds are available as official CI artifacts.

### Cited Findings
- **LLVM compile time:** Timed LLVM 21.1 compilation with Ninja on a MacBook Pro M4 Pro **14-core** (macOS 26.0.1, Apple clang 21) took **373.97 s ± 3.78 s**. The OpenBenchmarking average across systems for that config is ~30 min. — [OpenBenchmarking result 2510247](https://mail.openbenchmarking.org/result/2510247-NE-TESTMACOS03&export=html); [PTS build-llvm profile](https://openbenchmarking.org/test/pts/build-llvm)
- **Prebuilt DXC binaries:**
  - Upstream Microsoft DXC does not publish macOS binaries.
  - MethanePowered/DirectXShaderCompilerBinary provides DXC **v1.9.2602 (Feb 2026)** prebuilt for macOS arm64, Windows and Linux.
  - double-buffer/shader-compilers-bin publishes DXC + SPIRV-Cross for macOS arm64, not officially supported.
  - hexops/mach-dxcompiler builds for macOS aarch64.
  - Sources: [MethanePowered DXC binaries](https://github.com/MethanePowered/DirectXShaderCompilerBinary); [double-buffer/shader-compilers-bin](https://github.com/double-buffer/shader-compilers-bin); [hexops devlog](https://devlog.hexops.org/2024/building-the-directx-shader-compiler-better-than-microsoft/)
- Upstream DXC 1.9.2607.13 libs export only ARM64EC symbols on Windows ARM. This is a Windows-ARM issue and probably not relevant to macOS. — [DXC issue #8934](https://github.com/microsoft/DirectXShaderCompiler/issues/8934)
- **SDL_shadercross:**
  - Official GitHub Actions artifacts include `SDL3_shadercross-macos-arm64`, available via nightly.link. These are CI builds of `main`, not tagged releases.
  - Third-party bundles exist, e.g. a universal2 tarball with bundled dylibs and a DXC built from the SDL fork.
  - Sources: [nightly.link SDL_shadercross](https://nightly.link/libsdl-org/SDL_shadercross/workflows/main/main); [krsbx/tsgui release](https://github.com/krsbx/tsgui/releases/tag/SDL_shadercross-1ff05be)

### Inferences
- **12-core vs 14-core LLVM build:** The 12-core multi-core score is ~0.86× the 14-core (Cinebench 2024 1435/1662). Expect a full LLVM build in **~7–8 minutes** on this machine. DXC is based on an old LLVM 3.7 fork, which is smaller but still large; estimate ~5–15 minutes and several GB of build directory. Using prebuilt DXC or shadercross avoids this, and the build is needed only to patch the compiler.
- **Engine C17 code:** clang compiles C at roughly thousands of lines per second per core at -O0 to -O2. 200k lines over ~8 effective cores means a clean build of roughly **10–40 s**, and an incremental build of one translation unit plus link of **<1–2 s** with Ninja. These are estimates, not measured.
- **Third-party libraries:**
  - SDL3 from source: ~1–2 min.
  - Jolt (C++ with ~100 TUs) + joltc: ~1–2 min at Release.
  - Both are one-off costs and cached by the build tree. Estimates, not measured.
- **Shader compilation:** Offline HLSL → DXC → SPIR-V → SPIRV-Cross → MSL takes ~50–300 ms per shader variant (estimate). Keep variant counts low and cache by hash.
- **Disk:**
  - Xcode: ~10–40 GB including simulators. The Command Line Tools alone are smaller.
  - Vulkan SDK: ~1–2 GB.
  - LLVM/DXC build tree if built from source: 10–60 GB, depending on debug info.
  - Procedural on-disk cache: grows unbounded unless capped.
  - Of the 160 GB free, cap the procedural asset cache at ~10–20 GB and avoid Debug LLVM builds. All of these figures are unsourced estimates.

### Gaps
- No sourced compile-time benchmarks for SDL3, Jolt or DXC on M4 Pro.
- No sourced disk-usage numbers for Xcode, the Vulkan SDK or a DXC build tree.

## 6. Debugging and profiling on the Mac

### Takeaway
Xcode GPU frame capture and the Metal debugger work with SDL_GPU's Metal backend. The SDL wiki documents running the executable under Xcode with "GPU Frame Capture: Metal", and programmatic capture via `MTLCaptureManager` is an alternative. Tracy supports macOS CPU zones and Metal GPU zones, but only at encoder granularity. Instruments (Time Profiler, Metal System Trace) is native.

### Cited Findings
- **SDL wiki procedure for SDL_GPU on Metal:** Xcode → Debug → Debug Executable…, then set GPU Frame Capture to "Metal" in the scheme options. Run the app and click the Metal icon to capture. Running under Xcode also surfaces detailed Metal validation errors. — [SDL wiki CategoryGPU](https://wiki.libsdl.org/SDL3/CategoryGPU)
- A community report says the capture shortcut failed for a non-Xcode-built SDL3 app. The suggested workaround was Metal's programmatic capture API. — [SDL Discourse: GPU Debugger on Mac](https://discourse.libsdl.org/t/gpu-debugger-on-mac-how-to-attach-metal-debugger-on-macos-to-sdl3-gpu-app-using-odin/65551)
- GPU Frame Capture must be enabled in scheme options, and shader debugging is available from the same tool. — [WWDC20 10605](https://developer.apple.com/videos/play/wwdc2020/10605/)
- **Tracy Metal back-end** (merged PR #793):
  - Uses `TracyMetalContext(device)`; zones wrap whole command *encoders*, because not all Apple hardware supports command-level timestamps.
  - No transient or callstack Metal zones.
  - Tested on Apple Silicon M1.
  - Sources: [Tracy PR #793](https://github.com/wolfpld/tracy/pull/793); [mirror commit](https://gitea.hak8or.com/mirrors/tracy/commit/e8ff26e173bd9f23ef19a0a4b20df2ba6b794136)

### Inferences
- **Tracy with SDL_GPU:** SDL_GPU hides `MTLDevice` and its encoders. An SDL forum thread says the GPU API intentionally doesn't expose the underlying API objects: [SDL Discourse](https://discourse.libsdl.org/t/metal-texture-access/42337). Tracy's Metal GPU zones therefore need either a patched SDL or SDL-level timestamp queries, and SDL_GPU does not obviously expose timestamp queries. Practical setup:
  - Tracy for CPU and jobs.
  - Xcode / Instruments Metal System Trace for GPU timing.
  - A coarse GPU frame time from command-buffer completion callbacks or fences.
- **Sanitizers:** Apple clang supports ASan, TSan and UBSan on arm64 macOS (general knowledge, not verified for this note). TSan is valuable for the job system. ASan roughly doubles memory use, which matters at 24 GB.

### Gaps
- No source found confirming whether SDL3 exposes the native `MTLDevice` or command buffer via properties for Tracy integration.
- Sanitizer support and TSan on macOS 15 + Apple clang was not explicitly sourced.

## 7. Cross-platform testing gap: Vulkan on Mac, D3D12 in a VM, CI runners

### Takeaway
- **Vulkan:** The Vulkan path *can* be exercised on this Mac. One user got SDL_GPU's Vulkan backend running in 2026 through the Vulkan loader with KosmicKrisp, requesting Vulkan 1.3 and the shaderDrawParameters feature. MoltenVK failed on SPIR-V→MSL in that same report.
- **D3D12:** It cannot be tested here. Parallels' Windows 11 ARM is limited to DirectX 11-class graphics.
- **CI:** GitHub-hosted macOS arm64 runners lack GPU/Metal (MPS unsupported). GPU runners exist only for Linux and Windows (T4), so default CI means build plus headless/null tests.

### Cited Findings
- **SDL issue #15349** (Apr–Oct 2026, M1 Max):
  - MoltenVK 1.4.1 with SDL_GPU Vulkan failed: "[mvk-error] SPIR-V to MSL conversion error: nullptr", `VK_ERROR_INITIALIZATION_FAILED`.
  - The maintainer advised using the Vulkan loader rather than loading MoltenVK or KosmicKrisp directly.
  - Working setup:
    - `SDL_HINT_VULKAN_LIBRARY` set to `/usr/local/lib/libvulkan.dylib` (Vulkan SDK loader → KosmicKrisp).
    - `SDL_GPUVulkanOptions.vulkan_api_version = VK_API_VERSION_1_3`.
    - `shaderDrawParameters` enabled via a feature list.
  - Closed "Not an issue" on 2026-10-01. The MoltenVK error was never confirmed fixed.
  - Source: [SDL issue #15349](https://github.com/libsdl-org/SDL/issues/15349)
- `SDL_HINT_GPU_DRIVER` forces a backend and is available since SDL 3.2.0. — [SDL wiki](https://wiki.libsdl.org/SDL3/SDL_HINT_GPU_DRIVER)
- **Parallels:** Windows 11 ARM on Apple silicon supports DirectX 11-class graphics, and DirectX 12 has been unsupported since launch. Parallels 27 adds a Metal-based driver with OpenGL 4.3 but no claimed DX12. Forum users report DX12 games still fail. — [tech2geek guide](https://www.tech2geek.net/how-to-run-windows-11-on-mac-parallels/) (secondary); [GSMArena on initial support](https://m.gsmarena.com/parallels_desktop_can_now_run_windows_11_on_apple_silicon_powered_macs-news-57593.php); [Parallels forum](https://forum.parallels.cn/posts/938535); [Parallels 26 user guide](https://docs.parallels.com/landing/pdfm-ug/parallels-desktop-for-mac-26-users-guide/readme/what-versions-of-windows-you-can-install)
- **GitHub Actions:** Arm64 macOS hosted runners don't support nested virtualization or Metal Performance Shaders, because of Apple's Virtualization Framework. GPU hosted runners (NVIDIA T4) are GA for Windows and Linux only. — [GitHub Docs: hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners); [GitHub changelog](https://github.blog/changelog/label/runners/). A third-party page claims Metal acceleration on `macos-15-xlarge`, which conflicts with the official docs. — [tessl registry](https://tessl.io/registry/pantheon-ai/github-actions-toolkit/1.0.1/files/validator/references/runners.md)

### Inferences
- **Vulkan testing:** Install the LunarG Vulkan SDK (loader + KosmicKrisp/MoltenVK) and keep a dev flag that forces `SDL_HINT_GPU_DRIVER=vulkan`. This validates the SPIR-V shader path and the validation layers. Since shaders come from shadercross/DXC, check the SPIR-V version and extensions it emits (e.g. DrawParameters).
- **D3D12/DXIL:** Can only be checked offline on the Mac (shadercross compiles to DXIL) and at runtime on a real Windows x64 PC, a cloud Windows GPU VM, or a Windows T4 GitHub GPU runner (paid).
- **CI plan:**
  - macOS, Linux and Windows hosted runners: build, unit tests, procedural-generation determinism tests (content hashes), and shader compilation for all three formats.
  - Rendering tests: the local Mac, or Linux GPU runners with Vulkan (lavapipe as a software fallback is an option, but unverified here).

### Gaps
- Official GitHub docs on larger macOS runners and GPU access were not fetched.
- Current Parallels 26/27 release notes on DX12 were not checked directly.
- Whether lavapipe/llvmpipe can run SDL_GPU Vulkan in CI was not verified.

## 8. Bottlenecks and frame budget at 60 fps on M4 Pro 12C/16G/24 GB (INFERENCE — not measured)

### Takeaway
For a GTA III / WoW-class stylised textured open world with a free camera, plan the GPU around an **internal resolution of 1512×982 to 1080p**, with a cheap custom upscale to Retina and the UI at native resolution. That gives ~8–13 ms of GPU per frame at 60 fps.
- 1440p internal is possible at ~11–17 ms if shadows are cached.
- Full native 3024×1964 at 60 fps is unlikely for this scene density, which points to a 30–45 fps or "quality mode" target.

The main bottlenecks are:
1. Shadow and geometry cost of a dense city.
2. CPU main-thread draw submission through SDL_GPU.
3. Streaming hitches from generation, texture compression, upload and pipeline creation.
4. The combined CPU+GPU thermal limit in the 14" chassis, which matters more now that the GPU sits closer to its ~25 W ceiling.
5. Memory pressure with dev tools open.

### Cited Findings (anchors used for the estimate)
- GPU ≈ RTX 4050 Laptop class on modern rasterization (Steel Nomad 1620). Cyberpunk 2077 runs at native 1080p at ~60 fps (low) to 38 fps (ultra). Baldur's Gate 3 runs at 1080p at 84 fps (low) to 51 fps (ultra). Civilization 7 runs at 1440p high at 95.9 fps and 4K at 47.8 fps. — [Notebookcheck 16C GPU](https://www.notebookcheck.net/Apple-M4-Pro-16-Core-GPU-Benchmarks-and-Specs.937474.0.html)
- Cyberpunk 2077 on the 12C/16G at 1600p with MetalFX Balanced, Medium preset: ~56 fps. — [ComputerBase community thread](https://www.computerbase.de/forum/threads/cyberpunk-2077-auf-dem-mac-community-benchmarks-mit-apple-silicon-von-m1-bis-m4-max.2247687)
- CPU single-thread is top-tier (GB6 ~3840). The CPU sustains ~40 W, with contention under combined CPU+GPU load. The GPU draws ~25 W under load (12C). — [Notebookcheck analysis](https://www.notebookcheck.net/Apple-M4-Pro-analysis-Extremely-fast-but-not-as-efficient.915270.0.html); [Notebookcheck MBP14 review](https://www.notebookcheck.net/Apple-MacBook-Pro-14-2024-review-The-M4-Pro-and-matte-display-are-massive-upgrades.914597.0.html)
- Memory bandwidth is 273 GB/s, shared by CPU and GPU. — [Notebookcheck analysis](https://www.notebookcheck.net/Apple-M4-Pro-analysis-Extremely-fast-but-not-as-efficient.915270.0.html)
- SDL_GPU gives no access to native Metal objects, so MetalFX is unreachable without workarounds. — [SDL Discourse](https://discourse.libsdl.org/t/metal-texture-access/42337)

### Inferences — budget at 60 fps (16.67 ms)
**Scene assumptions:** a GTA-like dense city cell, ~20–50k visible-candidate instances culled to ~5–15k drawn, instanced into ~1–3k draw calls, 200–500 shared procedural materials, a sun with 3 shadow cascades at 2048², distance fog, a handful of point lights, simple PBR-lite or stylised lighting, and FXAA/SMAA or MSAA.

**CPU, main / render thread (target ≤ 9–11 ms wall time)**

| Task | Budget |
|---|---|
| Input, game logic, AI/traffic/pedestrians, scripts | 1.0–2.5 ms |
| Physics, Jolt step (vehicles + characters + static city colliders) on 4–7 job workers; wall time | 1.0–2.5 ms |
| Procedural animation, IK, skinning prep (jobs) | 0.5–1.5 ms |
| Frustum + cascade + distance/LOD culling of 20–50k instances (SIMD, jobs) | 0.5–1.5 ms |
| Instance buffer build + SDL_GPU command encoding of ~1–3k draws × (main + 3 cascades) | 2.0–4.0 ms |
| Streaming bookkeeping (finished cells, capped uploads per frame) | 0.3–1.0 ms |
| **Total main-thread wall time** | **~6–13 ms** |

- **Generation workers (async, outside the frame):** 3–6 threads at utility QoS run cell generation (layout, SDF meshing, LOD), procedural textures and **BC/ASTC compression**. A new cell takes ~0.2–1 s of CPU per worker set. Driving fast through a city (2–5 cells/s) continuously occupies 2–4 cores. The disk cache removes this cost on revisits.
- **CPU risks:**
  - Draw count multiplied by 4 passes (main + 3 cascades), because SDL_GPU recording is effectively single-threaded per command buffer. Use instancing, sort by pipeline and material, use bindless-like texture arrays where SDL_GPU allows, and merge static geometry per cell.
  - Pipeline creation mid-frame: pre-warm all pipelines.

**GPU (internal resolution scenarios)**

| Pass | 1512×982 (1.48 Mpx) | 1080p (2.07 Mpx) | 1440p (3.69 Mpx) | Native 3024×1964 (5.94 Mpx) |
|---|---|---|---|---|
| Shadow cascades 3× 2048² (geometry-bound, resolution-independent; far cascades cached) | 2.0–3.5 | 2.0–3.5 | 2.0–3.5 | 2.0–3.5 |
| Depth prepass (optional) | 0.4–0.8 | 0.5–1.0 | 0.8–1.5 | 1.2–2.2 |
| Main textured pass: forward+ or G-buffer, 5–15k instances | 2.0–3.5 | 2.5–4.5 | 4.0–7.0 | 6.0–10.5 |
| Lighting resolve / fog / point lights / cheap AO | 0.7–1.5 | 1.0–2.0 | 1.8–3.5 | 2.8–5.5 |
| Sky, particles, transparents, water | 0.5–1.0 | 0.6–1.2 | 0.9–1.8 | 1.3–2.6 |
| Post (tonemap, bloom-lite, SMAA/FXAA) | 0.3–0.7 | 0.4–0.9 | 0.7–1.5 | 1.1–2.3 |
| Upscale to 3024×1964 (2× integer or FSR1-style EASU+RCAS) + native UI | 0.3–0.8 | 0.4–0.9 | 0.4–0.9 | 0.2–0.4 (UI only) |
| **Total GPU (ms)** | **~6–12** | **~7–14** | **~11–20** | **~14–27** |
| **Verdict at 60 fps** | comfortable | OK | borderline; needs cached shadows and tight shading | no — ~35–60 fps; use a 30 fps cap or reduce resolution |

- **Scaling method:** Pixel-bound rows scale with Mpx from a 1080p baseline. The 1080p baseline was set at ~⅓–½ of Cyberpunk-low per-pixel cost. Shadow rows are held constant.
- **Recommended default:** internal **1512×982 or 1080p**, a custom spatial upscale (or a clean 2× integer upscale at 1512×982), and native-resolution UI and text. Offer a "native" quality toggle.
- **Custom TAA upsampling:** A self-written temporal upsampler (TAAU) at ~0.5–1 ms could raise perceived quality to Retina from 1080p internal. It adds jitter, motion vectors and ghosting work.
- **MetalFX:** Would require bypassing SDL_GPU.
- **ProMotion 120 Hz (8.33 ms):** Realistic only at 1512×982 with lighter settings. CPU main thread is the limit.

**Memory**

| Item | Budget |
|---|---|
| GPU: geometry for resident cells + far LOD | 1–3 GB |
| GPU: shared material library BC7/ASTC | 0.5–2 GB |
| GPU: render targets + shadows | 0.1–0.4 GB |
| GPU: instance/streaming buffers | 0.2–0.5 GB |
| **GPU subtotal** | **≈ 2–5 GB** |
| CPU side: world data, physics, nav, job scratch, generation scratch, compression buffers | 1.5–3 GB |
| **Engine total** | **3.5–8 GB** |
| Dev environment (Xcode, browser, editor, Claude Code, OS) | ~8–12 GB |
| Headroom on 24 GB | ~4–8 GB |

Swap risk comes from an Xcode GPU capture of a dense city frame, ASan builds, and parallel headless review renders.

**Ranked bottlenecks (most likely first)**
1. **GPU geometry and shadows in dense city cells.** Cascades multiply draws and triangles; cache far cascades and use aggressive LOD and merged static meshes.
2. **CPU main-thread submission** of thousands of draws × 4 passes through SDL_GPU.
3. **Pixel cost if pushed to native Retina.** Fix with internal resolution + upscale. No MetalFX via SDL_GPU.
4. **Streaming hitches:** CPU texture compression, mesh generation, uploads and pipeline creation.
5. **Thermal:** combined ~25 W GPU + up to ~40 W CPU in the 14" chassis during fast traversal with generation running.
6. **Memory pressure** with dev tools open.
7. **Cross-API correctness:** D3D12 cannot be tested locally; Vulkan is only testable via KosmicKrisp/MoltenVK.

**Overall feasibility:** The M4 Pro 12C/16G/24 GB can run a GTA III / WoW-class stylised textured open world at **60 fps at ~1080p internal resolution, upscaled to the Retina panel**. Full native Retina at 60 fps in a dense city is not a realistic target for this GPU. Development itself (builds, tooling, Claude Code alongside) is well within the machine's capacity, provided third-party compilers (DXC) are taken prebuilt.

### Gaps
- None of the GPU or CPU numbers above are measured. The per-pixel cost ratio versus Cyberpunk is a judgement call. Validate with a profiling spike on the target machine:
  - A synthetic city cell with 10k textured instances and 3 cascades, measured at 1512×982, 1080p, 1440p and native.
  - A Tracy CPU trace plus Instruments Metal System Trace.
  - A 30-minute soak with generation workers on, logging `powermetrics` and thermal state.
- No sourced timing for FSR1-style or TAAU upscale passes on Apple M4 Pro.
- No sourced CPU BC7/ASTC encoder throughput on M4 Pro.
