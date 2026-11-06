# Debug tooling, observability, headless mode and logging for an agent-driven C17 engine

Research notes, dated 2026-11-05. Target: Wallhammer Zero engine (C17, SDL3 + SDL_GPU on Metal/Vulkan/D3D12, macOS primary, CMake, GitHub Actions CI on three OSes, no GPU on hosted macOS runners). Almost all code is written by Claude in a terminal, and the owner is an art director. So the main design constraint is that **the engine must be observable and controllable without anyone watching a screen.**

Source caveats:
- The session's shared WebSearch budget ran out after three queries. Everything else came from **direct fetches of primary pages** (engine docs, repos, raw headers, Anthropic engineering posts). Some topics I meant to cover could not be searched: Superluminal, Optick, Our Machinery logger, idTech logging internals, lavapipe conformance level, SwiftShader status, Unreal MCP servers, and Sea of Thieves test numbers. They appear under Gaps, not as facts.
- The Apple page "Capturing a Metal workload programmatically" returned only its title. The `MTLCaptureManager` details below are therefore marked unverified.
- The Handmade Hero day 23 guide page lists only timestamps and topic titles, not code.
- Internal project documents are cited by local path. They are the existing design this layer must plug into:
  - [Architecture](../../open-world-engine-architecture.md)
  - [Procedural graphics](../../procedural-graphics.md)
  - [AI capabilities](../../ai-capabilities-in-procedural-3d.md)
  - [voxel-musou](../reference-repos/voxel-musou.md)
  - [sakura-crossing](../reference-repos/sakura-crossing.md)
- The owner's own skill for driving Godot through godot-mcp is first-hand evidence of what works for an agent: godot-game-testing SKILL.md.

**What the existing design already has:**
- `ENG_HEADLESS` CMake option, `gpu_null.c`, `phys_null.c` and `audio_null.c` backends, and `tests/replay/` run headless over the null backends ([Architecture](../../open-world-engine-architecture.md)).
- An `eng_debug_api` slot in the game port, and `log.h`/`profile.h` in `core` planned for M1.
- `gpu_timer` as a no-op, relying on fence-to-fence timing and Xcode GPU capture.
- From the procedural graphics design: `gencli render` contact sheets, `genlint`, golden hashes (CPU, exact, three OSes) plus image goldens per backend with tolerance, and a golden-hash CI job in M0 ([Procedural graphics](../../procedural-graphics.md)).
- From the reference repos:
  - a headless bot producing a JSON timeline → golden hash, and headless capture always at interpolation alpha = 0 ([voxel-musou](../reference-repos/voxel-musou.md));
  - `__shot` with about 60 named cameras, manual world stepping before capture, and the proposed `gencli shot`, `gencli raycast` and `gencli perf --views` tools ([sakura-crossing](../reference-repos/sakura-crossing.md)).

**What is missing** is the runtime layer that ties these together:
- a log format a machine can parse;
- cvars and commands;
- a control channel into a *running* engine;
- step and freeze for the agent's clock;
- state digests;
- crash and bug bundles;
- performance counters with budgets.

---

## 1. Logging: structured, channelled, cheap, machine-readable

### Takeaway
Every major engine has the same skeleton:
- a **category (channel) × verbosity** filter that can be changed at runtime from the command line and the console;
- several sinks (file, console, in-game overlay);
- an in-memory history that the overlay and crash handlers read.

Only Unreal (UE_LOGFMT, 5.2+) adds **structured key/value fields**, and that is the part an AI agent needs most. For Wallhammer Zero the log should be:
- channel + level, filtered *before* formatting;
- tagged with frame and sim tick;
- written as **JSON Lines** to a file per run, mirrored human-readable to stderr;
- kept in a ring buffer that the overlay, debug server and crash handler all read.

### Cited Findings
- **Unreal: verbosity levels and sinks.** Unreal has seven verbosity levels:
  - Fatal: prints to console and log file, then crashes.
  - Error: shown in red; errors cause commandlet failure.
  - Warning (yellow) and Display (grey): go to both console and file.
  - Log: file only.
  - Verbose and VeryVerbose: file only, and Verbose only if enabled for that category.

  — [Epic: Logging in Unreal Engine](https://dev.epicgames.com/documentation/en-us/unreal-engine/logging-in-unreal-engine)
- **Unreal: categories and runtime control.** A category is declared with `DECLARE_LOG_CATEGORY_EXTERN(<CAT>, <VERBOSITY>, All)` in a header and `DEFINE_LOG_CATEGORY(<CAT>)` in a source file. Verbosity changes without code edits, via `-LogCmds="LogDerivedDataCache Verbose"` on the command line (several categories and `all` are accepted) or `log LogDerivedDataCache verbose` in the console. Logs go to `Saved/Logs/*.txt`. — [Epic: Logging](https://dev.epicgames.com/documentation/en-us/unreal-engine/logging-in-unreal-engine)
- **Unreal: structured logging.** `UE_LOGFMT` (UE 5.2, `Logging/StructuredLog.h`) records structured events with positional *or* named parameters, never both ("can not mix both styles"). It allows up to 16 fields, named fields in any order, and extra fields. — [Epic: Logging](https://dev.epicgames.com/documentation/en-us/unreal-engine/logging-in-unreal-engine)
- **Wicked Engine: one global backlog, no categories.** `wi::backlog` has levels `None/Default/Success/Warning/Error` and macros `wilog`, `wilog_warning`, `wilog_error`, `wilog_assert`, plus `wilog_debug`, which expands to nothing without `_DEBUG`. Each macro formats into a **1024-byte buffer** before posting. — [wiBacklog.h](https://raw.githubusercontent.com/turanszkij/WickedEngine/master/WickedEngine/wiBacklog.h)
- **Wicked Engine: overlay and file sink.** The same module is the in-game console overlay (`Toggle`, `Scroll`, `Update`, `Draw`, input history, Lua execution) and the file sink. `SetLogFile`, `Flush`, and `SetAutoFlushInterval` (default 1000 ms, 0 disables) control file output. `GetUnseenLogLevelMax()` returns the worst level not yet seen. — [wiBacklog.h](https://raw.githubusercontent.com/turanszkij/WickedEngine/master/WickedEngine/wiBacklog.h)
- **Wicked Engine: threading and crash reading.** It exposes `Lock()/Unlock()` without documenting which calls need them. A `_forEachLogEntry_unsafe` iterator exists "only for crash handlers": it takes no lock, does no allocation, and "might iterate over complete garbage." — [wiBacklog.h](https://raw.githubusercontent.com/turanszkij/WickedEngine/master/WickedEngine/wiBacklog.h)
- **Godot.** Godot exposes `--verbose` and `--log-file <path>` ("Write output/error log to the specified path instead of the default location"). — [Godot command line](https://docs.godotengine.org/en/stable/tutorials/editor/command_line_tutorial.html). godot-mcp requires Godot 4.5+ because its addon uses "the Logger class added in 4.5", which is a script-level hook for intercepting engine log output — [godot-mcp](https://github.com/satelliteoflove/godot-mcp).
- **Unity's headless mode drops logs.** Unity's `-nographics` (with `-batchmode`) "doesn't initialize a graphics device… on machines that don't have a GPU", with the note "**Output logs are turned off in this mode.**" `-logFile -` sends the log to the console. — [Unity player CLI](https://docs.unity.com/en-us/engine/current/manual/unity-editor/command-line-arguments/player)
- **Tracy as a log sink.** Tracy's C API has `TracyCMessage/TracyCMessageL` (plus color and callstack variants). The header defines a severity enum (Trace…Fatal), but these macros always log at Info. With `TRACY_ENABLE` undefined all macros expand to nothing and no library is needed to link. — [TracyC.h](https://raw.githubusercontent.com/wolfpld/tracy/master/public/tracy/TracyC.h)
- **Two error channels in Godot.** Editor-process errors and running-game errors live in two different channels. "A per-frame runtime error can fire all session unnoticed if you only look at pictures." — godot-game-testing skill
- **Agent token budgets.** Claude Code caps tool responses at 25,000 tokens by default. Anthropic recommends pagination, filtering and truncation with sensible defaults, plus a `response_format` concise/detailed switch (concise used about 1/3 of the tokens in their example). — [Anthropic: Writing effective tools for agents, 2025-09-11](https://www.anthropic.com/engineering/writing-tools-for-agents)

### Inferences
- **Recommended record shape (one JSON object per line):** `{"seq":1234,"t_ns":…,"frame":512,"tick":498,"thr":"io0","lvl":"W","ch":"stream","msg":"cell late","src":"stream.c:211","kv":{"cx":12,"cy":-3,"late_ms":41.2}}`. Rationale:
  - `seq` is a monotonic sequence number, so an agent can ask "everything after seq N" (pagination per Anthropic).
  - `frame` and `tick` connect logs to replays and screenshots.
  - `kv` replaces string parsing; it is UE_LOGFMT's idea expressed in C.
- **Channels.**
  - Use a static table of ≤64 channels (`core, mem, jobs, gpu, render, asset, stream, gen, world, phys, audio, game, dbgsrv…`), each a `struct {const char* name; _Atomic uint8_t level;}`.
  - The macro tests the atomic level before evaluating any arguments: `if (ch.level >= L) eng_log_write(...)`. That is one predictable branch when disabled.
  - A compile-time floor `ENG_LOG_MIN_LEVEL` removes Trace/Debug from release builds entirely, like `wilog_debug`.
  - Use an Unreal-style `-log stream=trace,gpu=warn` flag and a `log.level` command.
- **Thread-safety.**
  - Formatting happens on the calling thread into a thread-local scratch buffer (Wicked's 1024 B is fine; truncate with a marker).
  - The record is pushed under a short mutex into a global ring of ~8–16k records. The project's job-system research already found mutexes adequate for global queues.
  - A low-priority log thread (or the frame boundary) drains to the sinks: stderr (human, colored), `runs/<run_id>/log.jsonl`, the Tracy message sink, and the overlay.
  - The ring stays readable for the crash handler without locks, like Wicked's unsafe iterator.
- **Anti-spam is mandatory for an agent.**
  - Provide `LOG_ONCE` and `LOG_EVERY_N`.
  - Track per-frame counters `errors_this_frame` and `warnings_this_frame` (each channel × level).
  - Add a "suppressed N repeats" summary record.
  - The state digest (section 3) should include `log: {errors: 3, warnings: 17, last_error_seq: 9876}`. A per-frame error then cannot hide behind a nice screenshot, which is exactly the godot-mcp lesson.
- **Never silently drop logs in headless mode,** unlike Unity `-nographics`. Headless is the agent's *primary* mode, so its logging must be the most complete.
- **Scoped context.** Add a thread-local stack via `ENG_SCOPE("cell", cell_id)` / `ENG_SCOPE("asset", hash)`. It is appended to every log record and assert from that thread and job. It turns "assert in bake.c:88" into "assert in bake.c:88 while generating cell (12,-3), asset car.sedan seed 7". This is the most valuable context for an agent reading a failure. (This is my design, not sourced.)

### Gaps
- Our Machinery's `tm_logger_api` and idTech's `common->Printf`/developer cvar logging were not fetched, because search ran out. I cannot cite their channel designs.
- I found no published measurement of the runtime cost of a disabled-channel check versus compile-time removal in C engines. Its cost is assumed negligible (one load and branch), but that is unmeasured.

---

## 2. Headless and server modes; offscreen rendering on CI

### Takeaway
Engines have two distinct "headless" modes, and Wallhammer Zero needs both:
1. A **null RHI**, with no GPU device at all. Examples: Unreal `-nullrhi`, Godot `--headless`, Unity `-batchmode -nographics`. It is used for simulation, streaming, generators, replays and unit tests on any CI machine.
2. **Offscreen rendering** on a real (or software) GPU device without a window, read back to PNG. It is used for screenshots, contact sheets and image goldens.

SDL_GPU officially supports windowless rendering and readback.

On CI:
- Linux can use lavapipe (CPU Vulkan).
- Windows has WARP (CPU D3D12, FL 12_1).
- Hosted macOS runners expose only a limited paravirtual Metal device. Pixel-producing tests should run on Linux/Windows software rasterizers and on the owner's M4 Pro, and hosted macOS should run the null backend.

Determinism comes from a **fixed timestep driven by frame count, not wall clock**. Godot's `--fixed-fps` + `--quit-after` and Unreal's `-deterministic` are the precedents.

### Cited Findings
- **Unreal flags:** `-nullrhi` = "Use null rendering hardware interface to run UE headless". Related flags:
  - `-RenderOffScreen` = "Render off screen"
  - `-deterministic` = "Shortcut for `-UseFixedTimeStep -FixedSeed`"
  - `-FixedSeed` = "Use 0 as the seed for FRandomStream"
  - `-fps` = "Override fixed tick rate frames per second"
  - `-ExecCmds` = "Execute the specified console commands"
  - `-stdout` = "Use stdout for log output"
  - `-unattended` = "not monitored by anyone and are unable to receive user input"

  — [Epic: Command-line arguments reference](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-command-line-arguments-reference)
- **Godot flags:**
  - `--headless` = `--display-driver headless --audio-driver Dummy`, "Useful for servers and with `--script`"
  - `--fixed-fps` "Force a fixed number of frames per second. This setting disables real-time synchronization"
  - `--quit-after` "Quit after the given number of iterations"
  - `--write-movie` writes frames (.avi/.png)
  - `--disable-render-loop` "rendering only occurs when called explicitly from script"
  - `--time-scale`
  - `--gpu-abort` "Abort on GPU errors (usually validation layer errors)"

  — [Godot command line](https://docs.godotengine.org/en/stable/tutorials/editor/command_line_tutorial.html)
- **Unity flags:** `-batchmode` "Run the application in headless mode… doesn't display anything or accept user input". `-nographics` "doesn't initialize a graphics device… possible to run your automated workflows on machines that don't have a GPU". — [Unity player CLI](https://docs.unity.com/en-us/engine/current/manual/unity-editor/command-line-arguments/player)
- **SDL_GPU needs no window.** "strictly speaking you can render offscreen entirely… and not use a window at all". A window is needed only for `SDL_ClaimWindowForGPUDevice()`.
  - Readback: `SDL_DownloadFromGPUTexture()` / `SDL_DownloadFromGPUBuffer()`, then `SDL_SubmitGPUCommandBufferAndAcquireFence()`; read the data after the fence signals.
  - A backend is forced by name ("vulkan", "metal", "direct3d12") via `SDL_PROP_GPU_DEVICE_CREATE_NAME_STRING`.
  - The page says nothing about timestamp queries.

  — [SDL3 wiki: CategoryGPU](https://wiki.libsdl.org/SDL3/CategoryGPU)
- **Precedent: SDL_GPU screenshots in CI.** zigui (an SDL_GPU-based UI library) ships `showcase --screenshot out.bmp --gpu`, which "renders through the real pipeline without a window; CI diffs it against the software frame". GPU subpixel snapping differs on <0.01% of pixels. — [zigui v0.2.0 release](https://github.com/ddalcu/zigui/releases/tag/v0.2.0). This is a small project and the CI's Vulkan driver is not stated.
- **Mesa env vars for software rendering:**
  - `LP_NUM_THREADS` sets the llvmpipe/lavapipe rendering threads ("Zero turns off threading completely").
  - `VK_DRIVER_FILES` forces specific Vulkan driver JSONs (it replaces the deprecated `VK_ICD_FILENAMES`).
  - `MESA_VK_DEVICE_SELECT=list` lists devices.
  - `MESA_SHADER_CACHE_DISABLE=true` disables the disk shader cache.

  — [Mesa environment variables](https://docs.mesa3d.org/envvars.html)
- **WARP (D3D12 software rasterizer):**
  - "a high speed, fully conformant software rasterizer". The Windows 10 1709 version supports **D3D12 feature levels 12_0 and 12_1**; 12_2 is in preview (Insider build 27718).
  - Selection: `IDXGIFactory4::EnumWarpAdapter` → `D3D12CreateDevice`.
  - It "can help provide a more deterministic or debuggable result in some cases" and is a "trivial switch" for isolating driver bugs.
  - Newer WARP DLLs are on NuGet (`Microsoft.Direct3D.WARP`) for testing but are not redistributable. WARP passes the WHQL conformance tests.

  — [Microsoft: WARP guide](https://learn.microsoft.com/en-us/windows/win32/direct3darticles/directx-warp)
- **GitHub-hosted runners:**
  - Standard macOS arm64 runners are **3 CPU (M1), 7 GB RAM, 14 GB SSD**.
  - "Nested-virtualization is not supported due to the limitation of Apple's Virtualization Framework".
  - The docs say nothing about GPU access on standard runners; GPU-powered runners are a larger-runner feature for Team/Enterprise plans.

  — [GitHub Docs: GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- **What a hosted macOS runner's Metal device can do:**
  - macos-14 exposes an "Apple Paravirtual GPU" lacking simdgroup support; Metal offload caused a GPU hang. — [java-llama.cpp PR #14](https://github.com/bernardladenthin/java-llama.cpp/pull/14)
  - On macOS 13 runners the device reported as "Apple Paravirtualized Graphics Device" and WebGL via ANGLE/Metal failed, while macOS 14 worked. — [WebKit bug 278277](https://bugs.webkit.org/show_bug.cgi?id=278277)
  - GitHub's (paid) M1 *larger* runner has "GPU hardware acceleration enabled by default", with an 8-core GPU. — [GitHub blog, 2023-10-02](https://github.blog/news-insights/product-news/introducing-the-new-apple-silicon-powered-m1-macos-larger-runner-for-github-actions/)
- **Internal design: hosted CI scope.** The internal capability doc already assigns hosted CI "build, unit tests, null GPU, headless replay, golden hashes of generators across macOS-ARM64 / Linux-x64 / Windows-x64, shader compilation". — [AI capabilities](../../ai-capabilities-in-procedural-3d.md)
- **Internal design: capture timing.** voxel-musou notes propose that headless capture always uses interpolation alpha = 0, so golden screenshots are deterministic. — [voxel-musou](../reference-repos/voxel-musou.md)

### Inferences
- **Three run modes as one CLI flag:**
  - `--gpu=null`: no SDL video or GPU init at all. Deterministic sim, streaming, generators, replay. Runs on every hosted runner.
  - `--gpu=offscreen[:vulkan|metal|d3d12|warp|lavapipe]`: real device, no window; render targets are read back.
  - Default: windowed.

  Forcing lavapipe on Linux CI uses `VK_DRIVER_FILES=<lvp_icd.json>`. Pixel determinism can be improved with `LP_NUM_THREADS=0` or a fixed count. This is a hypothesis: whether thread count affects lavapipe output bits was not verified.
- **Precedent table for the agent:**
  - Unreal `-nullrhi` ≈ `--gpu=null`
  - Unreal `-RenderOffScreen` ≈ `--gpu=offscreen`
  - Godot `--fixed-fps 60 --quit-after N` ≈ `--fixed-dt 1/60 --frames N`
  - Unreal `-ExecCmds` ≈ `--exec "cmd; cmd"` / `--script file`
  - Unreal `-deterministic` ≈ `--deterministic` (fixed dt + fixed seed + no wall-clock reads in sim + job results merged in index order)
- **"Run N frames then dump" is the workhorse.** For example: `wz --gpu=null --seed 7 --script scenarios/drive_loop.wzs --frames 1800 --dump runs/x/`, where the dump holds `log.jsonl`, `digest.json`, `stats.json` and optionally `shot_*.png`. It needs no socket, no latency and no flakiness, and it is the same command in CI and for Claude locally.
- **Image goldens are per backend and per driver** (lavapipe, WARP, M4 Pro Metal), compared with FLIP and a tolerance (section 7). CPU-side hashes stay exact on three OSes. The procedural design already says this ("images/<backend>/ with tolerance").
- **Hosted macOS runners:** treat the paravirtual Metal device as "may work, not trusted". At most run one smoke test that creates an SDL_GPU Metal device and clears a texture, with failure allowed (continue-on-error), to learn early whether it works. Do not keep image goldens there.
- **WARP in SDL_GPU is unverified.** WARP gives Windows CI a second, independent software D3D12 path. Whether SDL_GPU's D3D12 backend can be told to pick the WARP adapter needs checking in SDL source (see Gaps). If it cannot, the fallback is lavapipe on Linux as the single pixel-golden CI platform.

### Gaps
- **lavapipe's current Vulkan conformance and version,** and whether SDL_GPU's Vulkan backend runs on it unmodified (required features and extensions). I could not search for this. The zigui release suggests SDL_GPU headless CI works but does not name the driver.
- **WARP selection in SDL_GPU.** Whether SDL_GPU's D3D12 backend has a property or hint to select WARP was not verified.
- **SwiftShader** status in 2026 was not researched.
- **SDL_GPU Metal on hosted macOS 15/26 runners.** Whether SDL_GPU's Metal backend can create a device on the paravirtual GPU there is undocumented. Only indirect evidence exists (llama.cpp, WebKit).
- **SDL "offscreen"/"dummy" video drivers.** I only found an old third-party mirror of SDL's offscreen video driver source (said to support EGL/framebuffers). Whether SDL3's offscreen video driver matters for SDL_GPU is unclear. The recommendation is to skip SDL video entirely in null mode and create the GPU device without a window in offscreen mode.

---

## 3. Remote control and automation for an AI agent: console, cvars, debug server, MCP

### Takeaway
The proven pattern, from Quake to Unreal, is **cvars + named commands with help text**, settable from:
- the command line;
- config files;
- the console;
- (for agents) a localhost socket.

2025–2026 MCP servers for engines (godot-mcp, unity-mcp, blender-mcp) converge on a thin protocol bridge into the running process. The godot-mcp design, which the owner already uses daily, adds four agent-specific features that matter more than any single tool:
1. **Freeze, step and step-until on the game clock**, because the agent's latency is tens of seconds.
2. **JSON state digests instead of screenshots.**
3. A read-only/mutating split.
4. **In-process exec** for scenario setup.

Anthropic's own guidance says to:
- consolidate tools;
- return human-readable, paginated, concise output;
- write actionable errors;
- prefer letting the agent script against an API over passing bulky intermediates through context.

For a terminal agent that means **a CLI client over a localhost JSON-RPC socket first**, with an MCP wrapper as an optional thin layer on top.

### Cited Findings
- **Quake cvars.** `cvar_t` = `{char *name; char *string; qboolean archive /* saved to vars.rc */; qboolean server /* notifies players when changed */; float value; struct cvar_s *next;}`. Cvars "can be changed or displayed at the console or prog code as well as accessed directly in C code" and "must be registered before use". `Cvar_Command` handles any console token that is not a known command, printing or setting the value. — [id Software Quake cvar.h](https://raw.githubusercontent.com/id-Software/Quake/master/WinQuake/cvar.h)
- **Unreal console variables:**
  - Registration: `TAutoConsoleVariable<T>` or `IConsoleManager::Get().RegisterConsoleVariable`. Reads: `GetValueOnGameThread()` / `GetValueOnRenderThread()`.
  - Flags include `ECVF_Cheat`, `ECVF_RenderThreadSafe`, `ECVF_Scalability`.
  - Change detection: **storing the last value and comparing each frame is the preferred method**. `SetOnChangedCallback` is advised against because it "can deadlock" and fires at unexpected times.
  - The render thread keeps its own copy.
  - Set-by priority, lowest to highest: Constructor < Scalability < GameSetting < ProjectSetting < DeviceProfile < SystemSettingsIni < ConsoleVariablesIni < Commandline < Code < Console. `LastSetBy` records who changed a variable.
  - Help text is shown with `?`. Dev-only variables should be cheats and "ideally compiled out of shipping builds".

  — [Epic: Console variables in C++](https://dev.epicgames.com/documentation/en-us/unreal-engine/console-variables-cplusplus-in-unreal-engine)
- **godot-mcp (satelliteoflove):**
  - 21 tools / 86 actions, split so every read-only tool can be auto-allowed while writes stay gated; a `--read-only` flag.
  - Tools include:
    - `godot_runtime_state` (live state as JSON);
    - `godot_game_time` (freeze, step, step-until on the game clock);
    - `godot_exec` (run GDScript in the running game);
    - `godot_input` (inject actions, keys, mouse-look, text);
    - `godot_profiler` (metric snapshots, per-frame series with spike detection);
    - `godot_validate_meshes` (detect corrupt procedural meshes);
    - `godot_scene3d` (computed transforms, bounds, visibility);
    - screenshots, "when it's actually worth the tokens".
  - Architecture: MCP client ⇄ stdio ⇄ Node server ⇄ WebSocket 127.0.0.1:6550 ⇄ editor addon ⇄ Godot debugger protocol ⇄ game. It serves "a single godot-mcp client at a time".
  - It intentionally does not duplicate operations that file edits already cover.

  — [godot-mcp](https://github.com/satelliteoflove/godot-mcp)
- **The owner's practice with godot-mcp:**
  - "tens of seconds of model latency can pass between two tool calls, and the game keeps running the whole time… make the game observable on your clock, and verify from data rather than pixels".
  - Inputs must "ride the step", since inputs injected while frozen miss their just-pressed edge.
  - `step_until` with a predicate plus `report` expressions folds observation into the same call.
  - Workflow: setup via exec, then freeze, then step, then observe.
  - Per-entity `_mcp_state()` returns live values *and* static context, as JSON scalars capped at ~1 KB.
  - Watch/timeline summaries give start/end/min/max/mean/slope per field instead of per-frame samples. Caps are 16 signals, 200 samples/field and 500 timeline entries, and "all losses are reported, never silent".
  - A 1280×720 screenshot is ~1,200 tokens that "persists for the rest of the session with no decay". Visual checks go to a sub-agent that returns a text verdict.

  — godot-game-testing skill
- **unity-mcp (CoplayDev):** 15.7k stars, latest v10.3.0 (2026-10-04). It has "50 focused MCP tool entrypoints" in tool groups (vfx, animation, ui, testing), routes between multiple Unity instances, validates scripts with Roslyn, and uses a Python (uv) server plus a Unity package. — [unity-mcp](https://github.com/CoplayDev/unity-mcp)
- **blender-mcp (ahujasid):**
  - 33.4k stars. A Blender addon runs a TCP socket server on localhost:9876 with JSON commands `{type, params}` → `{status, result|message}`.
  - Tools include `execute_blender_code` (arbitrary Python), `get_scene_info` ("one line per object") and `look` (viewport, camera, multiple angles, render).
  - Warnings: the socket has "no authentication or encryption", hence localhost or an SSH tunnel; an optional safe mode; "Complex operations might need to be broken down into smaller steps"; timeouts.

  — [blender-mcp](https://github.com/ahujasid/blender-mcp)
- **Anthropic: writing tools for agents (2025-09-11).** Guidance:
  - Consolidate operations into tools with "a clear, distinct purpose".
  - Namespace tools with prefixes.
  - Return human-readable fields rather than opaque IDs; resolving IDs to names reduced hallucinations.
  - Use pagination, filtering and truncation with defaults; Claude Code caps responses at 25k tokens.
  - Offer `response_format` concise/detailed.
  - Write errors that "clearly communicate specific and actionable improvements".
  - Use unambiguous parameter names (`user_id`, not `user`).
  - Evaluate with realistic multi-call tasks and verifiable outcomes.

  — [Anthropic Engineering](https://www.anthropic.com/engineering/writing-tools-for-agents)
- **Anthropic: code execution with MCP (2025-11-04).** Loading all tool definitions plus passing intermediates through context is costly. Presenting tools as code APIs that the agent scripts against cut one example from ~150,000 to ~2,000 tokens (98.7%). Loops and filtering happen in code, not model turns. — [Anthropic: Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)
- **Internal reference repo: sakura-crossing.**
  - The agent could not screenshot the browser (rAF not running), so it **stepped the world manually** (`world.update(1/60)` loops) and then called `__shot(name, W, H, opts)` with named cameras and pass toggles.
  - The repo keeps about 60 named establishing-shot cameras as manual golden images.
  - The proposed `gencli raycast --from eye --to obj` returns the first occluding mesh and generator ID, "faster than a screenshot and deterministic".

  — [sakura-crossing](../reference-repos/sakura-crossing.md)
- **Internal capability doc.** It establishes the workflow order: oracles (lints, golden hashes, multi-view headless renders), then a **separate visual judge that sees only pixels and references**, then the owner. A judge that sees code accepts non-existent features (WorldBench). Claude accepts up to 2,576 px on the long edge. — [AI capabilities](../../ai-capabilities-in-procedural-3d.md)

### Inferences
- **The API surface that works best for an LLM agent** follows from godot-mcp practice and Anthropic's guidance. Ranked by value:
  1. **`sim.pause` / `sim.step {ticks, inputs[]}` / `sim.step_until {pred, max_ticks, report[]}` / `sim.resume`.**
     - The engine started with `--agent` boots *paused*.
     - Rendering keeps running on the last sim state, so overlays and screenshots stay live; only sim ticks are gated.
     - Inputs are part of the step request, so they land on exact ticks. This is also what makes steps replayable.
  2. **`state.digest {select, fields, format: concise|detailed}`.** It returns compact JSON with human-readable names:
     - sim tick, frame, camera cell, player pose;
     - streaming (loaded/pending/late cells, I/O queue);
     - memory per tag, counters;
     - log error/warn counts with last error seq;
     - selected entities' `debug_state()`.

     Each subsystem implements `xxx_debug_state(eng_json_writer*)` with a size cap. This is the C analogue of `_mcp_state()`.
  3. **`log.tail {since_seq, min_level, channel, limit}`.** Paginated, defaulting to warnings and above, always reporting the dropped count.
  4. **`cvar.get / cvar.set / cvar.list {prefix}` and `cmd.exec "text"` / `cmd.list {prefix}`.** Commands return JSON plus a one-line human summary, and errors say what to do ("unknown cvar r.shadwo; did you mean r.shadow.*?").
  5. **`shot {camera: name|pose, w, h, passes, debug_views, out}`.** It returns **a file path plus numeric stats** (mean/percentile luminance, % pixels above a bloom threshold, % sky, NaN/Inf count). The agent decides whether to look; actually looking is delegated to the pixel-only judge sub-agent. Named cameras come from a `cameras.txt` per district, as in sakura-crossing.
  6. **`query.raycast`, `query.cell {cx,cy}`, `query.entity {handle|name}`, `debugdraw.dump`.** These are geometric questions answered numerically, cheaper and deterministic compared with pixels.
  7. **`replay.save {path}`, `bug.bundle {note}`, `gpu.capture {frames}`, `prof.capture {seconds, out}`.**

  There is deliberately **no generic "exec arbitrary C" equivalent of `godot_exec`.** Scenario setup is done with **commands** (`spawn`, `teleport`, `set_time_of_day`, `cell.regen`) and **scenario script files** (`.wzs`, a list of commands plus `step` lines). This keeps the attack surface small, unlike blender-mcp's unauthenticated arbitrary-code socket, and makes every scenario a reusable regression test.
- **Transport:**
  - Newline-delimited JSON-RPC 2.0 over TCP bound to 127.0.0.1. A random port and token are written to `runs/<id>/dbgsrv.json`.
  - It is compiled only into dev builds (`ENG_DEBUG_SERVER`).
  - The server thread only enqueues requests. They execute on the main thread at a fixed point in the frame (after sim, before render submit), so there are no data races and the results are deterministic relative to ticks.
- **Client:** `tools/engctl`, a tiny C or Python CLI, so Claude uses plain Bash. For example: `engctl step --ticks 120 && engctl digest stream --concise | jq .late_cells`. This fits Anthropic's "code execution" finding: the agent filters with `jq` and shell loops instead of pulling bulk JSON through context.
  - An MCP server can later wrap the same JSON-RPC 1:1 (like godot-mcp over the debugger protocol), with read tools auto-allowed and mutating tools gated.
  - Recommendation: **CLI first, MCP optional**. Claude Code already has Bash, and a CLI is also usable from CI and test scripts.
- **CVar design:** Quake simplicity plus Unreal's set-by priority.
  - Typed (bool/int/float/enum/string) with min/max and help text.
  - Flags: `DEV` (compiled out in ship), `READONLY`, `LATCHED` (applied at the next frame or boundary), `ARCHIVE`, `REPLAY`. `REPLAY` marks determinism-affecting values that are recorded in replay headers and bug bundles.
  - Change detection by comparing the cached last value at frame start (Unreal's preferred method; no callbacks).
  - Sources by priority: default < `config/*.cfg` < CLI `+set name value` < console/RPC.
- **A digest beats a screenshot** for "did it work?" (state, counts, flags, timings). Screenshots and contact sheets are for "does it look right?" and go to the separate judge.

### Gaps
- **No Unreal MCP state for 2026.** Search was exhausted, so I could not verify the state of Unreal MCP servers (community or Epic official) in 2026.
- **No measured comparison** of agent success rates with CLI vs MCP control of a game engine. The recommendation rests on Anthropic's token argument and the owner's godot-mcp experience, not on a benchmark.

---

## 4. Debug visualisation: debug draw, ImGui, overlays, GPU capture

### Takeaway
Use:
- an **own C immediate-mode debug-draw buffer** (lines, boxes, spheres, text-in-world, with lifetime and channel), rendered by `render` but also **dumpable as JSON**, so the agent can "see" debug geometry without pixels;
- **Dear ImGui via dear_bindings (dcimgui)**, dev-only, for human inspectors;
- programmatic GPU capture triggers:
  - Metal: `MTLCaptureManager` → `.gputrace` (unverified details);
  - Vulkan/D3D12 on Windows and Linux: RenderDoc in-app API;
  - D3D12: PIX (not researched).

GPU captures are for the human owner or Xcode. An agent cannot read them meaningfully.

### Cited Findings
- **im3d** is "a small, self-contained library for immediate mode rendering of basic primitives (points, lines, triangles), plus an immediate mode UI" with 3D gizmos. It is **C++11**, MIT, API-agnostic, and outputs world-space vertex buffers that the app renders with its own shaders (`NewFrame`/`EndFrame` and draw lists). It has 1.3k stars. — [im3d](https://github.com/john-chapman/im3d)
- **dear_bindings** generates `dcimgui.h`/`.cpp`/`.json` from `imgui.h`.
  - Naming: `ImGui::Text()` → `ImGui_Text()`; default args give `Ex` variants; overloads get suffixes.
  - Tested backends include SDL3, Vulkan and D3D12. **SDL_GPU appears only as an example name** (`example_sdl3_sdlgpu3`), and Metal/OSX backends are excluded.
  - Latest listed version is v0.12; requires ImGui ≥1.84. It is newer (2021) than cimgui (2015, Lua-based) and "maybe less battle-tested".

  — [dear_bindings](https://github.com/dearimgui/dear_bindings)
- **RenderDoc in-app API:**
  - `RENDERDOC_GetAPI()` is fetched at runtime (`GetModuleHandleA("renderdoc.dll")` / `dlopen("librenderdoc.so", RTLD_NOW|RTLD_NOLOAD)`). "You should never link against RenderDoc's library".
  - Functions: `TriggerCapture`, `StartFrameCapture`/`EndFrameCapture`, `SetCaptureFilePathTemplate`, `LaunchReplayUI`.
  - The page names only Windows, Linux/*nix and Android. macOS is not mentioned.

  — [RenderDoc in-application API](https://renderdoc.org/docs/in_application_api.html)
- **SDL_GPU debug labels.** SDL_GPU lists `SDL_PushGPUDebugGroup` / `SDL_InsertGPUDebugLabel` in its API, and per-backend debug layers can be enabled for more detailed errors. — [SDL3 wiki: CategoryGPU](https://wiki.libsdl.org/SDL3/CategoryGPU)
- **GPU timing and capture in the current design.** The internal architecture already plans `gpu_timer` as a no-op, because SDL_GPU lacks timestamp queries, and relies on Xcode GPU capture. The M4 milestone includes "debug visualisation of cells". — [Architecture](../../open-world-engine-architecture.md)
- **Godot debug views and validation.** Godot exposes `--debug-collisions` ("Show collision shapes when running the scene") — [Godot command line](https://docs.godotengine.org/en/stable/tutorials/editor/command_line_tutorial.html). The owner's skill says that if 3D looks wrong with clean logs, validate meshes **before** tuning lights or materials — godot-game-testing skill.

### Inferences
- **Do not adopt im3d as-is.** It is C++ and would break the "no C++ outside adapters" rule. A C debug-draw module is ~300–500 lines:
  - `dd_line`, `dd_aabb`, `dd_obb`, `dd_sphere`, `dd_arrow`, `dd_text3d`, `dd_grid`, each with `color`, `duration_ticks` and `channel`;
  - a per-frame vertex arena consumed by one `render` pass (depth-tested and x-ray variants).

  Gizmos are not needed, since there is no editor.
- **Debug draw doubles as an agent oracle.** `debugdraw.dump {channel}` returns the primitives as JSON, e.g. "the cell-boundary channel shows 12 loaded cells", or "the nav channel shows path nodes at…". The agent can then check debug geometry numerically. The same channels render into screenshots when a human or judge needs to see them.
- **Visualizer channels to plan:**
  - `stream` (cell rings colored by state: requested/loading/resident/late; LOD-tree level per instance);
  - `gen` (parcel and street graph, district IDs);
  - `phys` (colliders);
  - `cull` (frustum, Hi-Z rejects);
  - `lod` (dither transition state);
  - `jobs` (none in-world, overlay only).

  These map onto the procedural design's "top view with layers (roads, parcels, district IDs, scatter density)" review renders ([Procedural graphics](../../procedural-graphics.md)).
- **Dear ImGui (dcimgui)** is a dev-only (`ENG_IMGUI`) human tool: stats overlay, cvar browser, log window, cell inspector. Because dear_bindings excludes Metal backends and SDL_GPU is only an example name, plan to compile ImGui's own SDL3 platform backend plus an SDL_GPU renderer backend in C++ inside one adapter target (`eng_imgui`). C code calls the generated `dcimgui.h`. This needs verification at implementation time (see Gaps).
- **A plain-text stats overlay comes first** (built into `eng_debug`, no ImGui): FPS, CPU phase ms, draw calls, triangles, uploads, cells, memory per tag, and errors/warnings since start. The same numbers also go into `stats.json` and the digest, so overlay and agent read one source.
- **GPU capture triggers** are a `gpu.capture {frames:1}` command:
  - On Metal, the `gpu` module calls `MTLCaptureManager` with a `.gpuTraceDocument` destination into `runs/<id>/`. A native handle is needed, and whether SDL_GPU exposes the `MTLDevice`/queue is unverified.
  - On Vulkan/D3D12, RenderDoc `TriggerCapture` if the DLL is injected; PIX on Windows is not researched.

  The agent only creates and archives the capture for the owner. It does not read it.

### Gaps
- **Programmatic Metal capture (unverified).** Apple's page returned no body. From general knowledge, it is `MTLCaptureManager.shared().startCapture(with:)` with `destination = .gpuTraceDocument` and an `outputURL`, plus `MTL_CAPTURE_ENABLED=1` or Info.plist `MetalCaptureEnabled` outside Xcode. Verify before relying on it.
- **Native Metal handles from SDL_GPU.** Whether SDL_GPU exposes native Metal device/queue/command-buffer handles (needed for MTLCaptureManager scoping and Tracy Metal zones) was not verified.
- **Dear ImGui's SDL_GPU backend.** The status of Dear ImGui's official `imgui_impl_sdlgpu3` backend (existence, maturity) was not fetched.
- **PIX** programmatic capture was not researched.

---

## 5. Profiling: Tracy, built-in timers, counters, memory, budgets

### Takeaway
- **Tracy's C API is the right external profiler.** It covers CPU zones, frame marks, plots, messages, named memory pools and locks. It compiles to nothing without `TRACY_ENABLE`, costs ~2.25 ns per zone, and has a CLI capture tool plus CSV export, which an agent can read.
- **GPU zones are the weak spot.** SDL_GPU has no timestamp queries, Tracy's C GPU API leaves timestamp processing to the user, and Tracy's Metal integration is a C++ header that needs native command encoders.
- So GPU time on SDL_GPU is coarse (fence-to-fence). The real budgets the agent and CI enforce should be **deterministic counters**: draw calls, triangles, upload bytes, pipeline binds, allocations, cell generation time on the dev machine. Do not budget on wall-clock times measured on noisy hosted runners.

### Cited Findings
- **Tracy C API.** It provides:
  - zones (`TracyCZone`, `TracyCZoneN`, colored and callstack variants, `TracyCZoneEnd`, zone text and value);
  - frame marks (`TracyCFrameMark`, `TracyCFrameMarkNamed`, start/end for discontinuous frames, `TracyCFrameImage`);
  - plots (`TracyCPlot/F/I`);
  - messages;
  - memory (`TracyCAlloc`/`TracyCFree`, **named pools `TracyCAllocN`/`TracyCFreeN`**);
  - locks (`TracyCLockCtx` + announce/before/after macros);
  - fibers (`TRACY_FIBERS`);
  - low-level GPU emitters `___tracy_emit_gpu_zone_begin*`, `gpu_time`, `gpu_new_context`, `gpu_calibration`, `gpu_time_sync`.

  Without `TRACY_ENABLE` everything expands to nothing and no library is linked. — [TracyC.h](https://raw.githubusercontent.com/wolfpld/tracy/master/public/tracy/TracyC.h)
- **Tracy GPU zones from C.** The C API for GPU zones is "a low-level interface… no facilities to help with timestamp processing", and the C++ headers are the reference. The Metal backend "works differently" and needs periodic `TracyMetalCollect(ctx)`, with no callstack or transient Metal zones. — Tracy manual via mirror diffs: [hak8or Tracy mirror commit](https://gitea.hak8or.com/mirrors/tracy/commit/092e91d05813867da7e7527649a66b50cb5e8f69), [diff](https://gitea.hak8or.com/mirrors/tracy/commit/e932cbe162a81a24999443fe14570bd46f159de4.diff). These are secondary mirrors of the official manual.
- **Tracy manual facts:**
  - The impact of profiling is "only 2.25" ns per zone (begin + end).
  - `TRACY_ON_DEMAND` profiles only while a server is connected.
  - A command-line utility in `capture/` "will save a data dump that you may later open in the graphical viewer".
  - A CSV export chapter exports zone and frame statistics.
  - The network protocol may change between releases, so client and viewer versions must match.
  - Platforms "confirmed working" include OSX (x64), Windows, Linux, Android, iOS (ARM64) and others. On Apple platforms "the performance hit due to profiling is higher than on other platforms", and `TRACY_NO_EXIT` is not supported on OSX/iOS.

  — [Tracy manual (tracy.tex)](https://raw.githubusercontent.com/wolfpld/tracy/master/manual/tracy.tex)
- **Tracy feature summary.** Tracy describes itself as "A real time, nanosecond resolution, remote telemetry, hybrid frame and sampling profiler". It supports GPU profiling for OpenGL, Vulkan, D3D11/12, Metal, OpenCL, CUDA and WebGPU, and attributes screenshots to frames. — [Tracy repo](https://github.com/wolfpld/tracy)
- **Godot profiling for agents.** godot-mcp's `godot_profiler` provides "metric snapshots and per-frame series with spike detection", meaning summaries rather than raw per-frame dumps. — [godot-mcp](https://github.com/satelliteoflove/godot-mcp)
- **Draw calls in a GTA-like frame.** GTA V renders 88 render targets and 4,155 draw calls per frame, cited in the internal architecture doc as the scale reference — [Architecture](../../open-world-engine-architecture.md). sakura-crossing notes propose `gencli perf --views std.txt` → draw calls and triangles per view, where a regression over a threshold fails the build — [sakura-crossing](../reference-repos/sakura-crossing.md).
- **Hard timing budget for generation.** The procedural design's lint for cell generation time comes from car speed: a 256 m cell at 200 km/h is crossed in 4.6 s and a 128 m cell in 2.3 s. — [Procedural graphics](../../procedural-graphics.md)
- **Hosted macOS runner hardware.** Hosted macOS arm64 runners have 3 vCPU and 7 GB RAM — [GitHub Docs](https://docs.github.com/en/actions/reference/runners/github-hosted-runners). That makes them unsuitable for stable timing baselines (inference below).

### Inferences
- **Wrap Tracy behind a project header** `eng/prof.h`: `PROF_ZONE(name)`/`PROF_END`, `PROF_FRAME()`, `PROF_PLOT(name, v)`, `PROF_ALLOC(pool, p, n)`. Map them to TracyC macros when `ENG_TRACY=ON` and to nothing otherwise. This keeps the option to swap profilers, and the tagged heap reports per-tag allocations as Tracy named pools.
- **The agent can use Tracy headlessly:** run with `ENG_TRACY` + `TRACY_ON_DEMAND`, run the capture CLI to `runs/<id>/trace.tracy`, then the CSV export tool → `zones.csv`. Claude reads the top-N zones by self time. This is unverified end-to-end on macOS ARM64, because the manual lists OSX x64 as confirmed.
- **Built-in timers that need no Tracy:**
  - per-phase CPU ms (input, sim, stream, gen, render-build, gpu-submit, present-wait) as a fixed ring of the last 600 frames;
  - p50/p95/p99/max summaries in `stats.json` and the digest.

  Spike detection (frame > 2× median) logs a `perf` channel record with the phase breakdown. That is godot-mcp's "spike detection" without a GUI.
- **GPU time:** start with fence-to-fence submit→signal intervals per frame, which are coarse. Emit them as a single Tracy GPU "frame" zone via the low-level `___tracy_emit_gpu_*` C API, with CPU-clock timestamps taken at submit and at fence completion. That is approximate but better than nothing. Per-pass GPU timing waits for SDL_GPU timestamp support or a native backend.
- **Per-frame counters** (draw calls, instances, triangles, pipeline/texture binds, bytes uploaded, transient RT memory, cells loaded/evicted, jobs run/stolen, allocations by tag) are deterministic for a given seed, camera path and settings. So they can be **budgets that fail CI on any runner**, including hosted ones with the null GPU, because the counters are counted in the RHI front-end, not by the driver.
  - Files: `budgets/views.txt` (named camera → max draw calls, triangles, upload MB, memory per tag) and `budgets/gen.txt` (asset/cell → max triangles, texture MB).
  - Wall-clock budgets (frame ms, cell generation ms) run only on the owner's M4 Pro, as a `perf` ctest label with stored baselines and tolerance. Hosted runners with 3 vCPU are too noisy for timing.

### Gaps
- **Superluminal and Optick** were not researched because search ran out. Superluminal is commonly described as Windows-focused, and Optick's maintenance status is unknown; both are unverified.
- **Tracy on macOS ARM64.** The manual excerpt lists only "OSX (x64)" as confirmed, so Tracy on macOS ARM64 is not confirmed by the fetched text.
- **Tracy Metal zones over SDL_GPU.** Whether Tracy Metal GPU zones can be used under SDL_GPU depends on access to native Metal objects, which is unverified.
- **Tracy-capture on Apple.** The exact behavior of the CLI capture tool on Apple, given that `TRACY_NO_EXIT` is unsupported there, is unclear. Short-lived headless runs may exit before the trace is flushed.

---

## 6. Reproducibility: input recording and replay, crash handling, bug bundles

### Takeaway
Determinism is the backbone. The project has already committed to deterministic CPU generators and to headless replay as "the thing that replaces QA for a small team".

The proven pattern, from Handmade Hero to Riot's Chronobreak, is to **record inputs plus initial configuration, replay fast without frame-rate throttling, and use the same mechanism for tests**.

Add periodic **per-subsystem state hashes**, so a desync is located at its first divergent tick, and a **bug bundle** (log ring + replay + cvars + digest + screenshot + build ID) written by both the crash handler and a `bug.bundle` command.

For crashes, use an own minimal signal/exception handler that flushes the log ring and backtrace in M0. Add sentry-native (crashpad backend, MIT, no server required with transport `none`) later for minidumps.

### Cited Findings
- **Handmade Hero day 23, "Looped Live Code Editing":**
  - The episode first stores the input stream in memory, then writes it to disk.
  - "Press L to record"; record and playback functions.
  - "Some code to loop the input playback".
  - "Implementing recording of game state".
  - A "Successful looped editing demonstration".
  - Q&A topics: ~2 GB state snapshot size, restoring state at a fixed base address, memory-mapped files for speed.

  — [Handmade Hero episode guide, day 023](https://guide.handmadehero.org/code/day023/) (timestamps and titles only; implementation details not verified from code)
- **Handmade Hero memory model.** The architecture doc's game port follows the same model. The platform owns all memory and the game DLL holds no static data, so the whole game state is one block that can be snapshotted. — [Architecture](../../open-world-engine-architecture.md)
- **Riot (League of Legends, 2017-06-20):**
  - Each esports game produces a Server Network Recording with "a complete record of the inputs, match settings, and configurations".
  - The deterministic server replays it without frame-rate throttling: "a recovery to 40 minutes often takes less than 3 minutes".
  - Determinism was first pursued for **Delta Checker**, a tool for fast, repeatable tests driven by recorded inputs.
  - MVP in December 2016; v2.0 in May 2017 added GUI tools and an automated test system.

  — [Riot Games: Determinism in League of Legends](https://www.riotgames.com/en/news/determinism-league-legends-introduction)
- **Unreal determinism flags.** `-deterministic` = `-UseFixedTimeStep -FixedSeed`. — [Epic CLI reference](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-command-line-arguments-reference)
- **sentry-native backends:**
  - crashpad (out-of-process; default on Windows, Linux, macOS);
  - breakpad (in-process);
  - inproc ("supported on all platforms", default on Android);
  - native (out-of-process daemon on Linux, macOS, Windows);
  - none (for tests).

  Transport `none` is for when "users want to handle uploads themselves", and custom transports are possible. MIT license, plain C API (`sentry_options_new`, `sentry_init`, `sentry_close`). — [sentry-native](https://github.com/getsentry/sentry-native)
- **Wicked Engine crash-time log access.** Wicked provides an allocation-free, lock-free log iterator specifically for crash handlers. — [wiBacklog.h](https://raw.githubusercontent.com/turanszkij/WickedEngine/master/WickedEngine/wiBacklog.h)
- **voxel-musou headless bot.** The headless bot over pure simulation emits one JSON record per run (seed, event timeline, stats). The proposed C port: "Seed + input script → hash of state after N ticks = golden hash". — [voxel-musou](../reference-repos/voxel-musou.md)
- **Floating-point determinism rules.** The procedural design's rules, citing Dawson: `-ffp-contract=off`, no `<math.h>` in `gen_*`, own transcendentals, merge in index order. — [Procedural graphics](../../procedural-graphics.md)

### Inferences
- **Replay file format (`.wzr`):**
  - Header: build hash, engine version, world seed, the list of `REPLAY`-flagged cvars with values, start mode (`boot` or `snapshot:<file>`), fixed dt.
  - Body: per sim tick, a compact delta-encoded input record (buttons bitmask, analog axes quantized to int16, plus any command injected via debug server or script, since agent commands must be recorded too).
  - Every K ticks (e.g. 60): a hash record with one 64-bit hash per subsystem (`world`, `actors`, `phys`, `stream_requests`, `rng_streams`).
  - On replay a mismatch reports `first divergent tick T, subsystem phys`. That is Riot's Delta Checker in miniature, and it turns "replay broke" into an actionable message for the agent.
- **Streaming makes total-state snapshots (Handmade Hero's 2 GB loop) impractical** for an open world. Replays should start from boot or from a small game-state snapshot (game DLL memory + actor pools). Cells are regenerated deterministically from seeds. Streaming *timing* must not influence sim results: sim reads only data marked resident at the tick boundary, and cell completion is applied at the frame sync point. That is a hard rule to test in M4/M5: replay with I/O artificially delayed must give identical hashes.
- **Looped live editing** (Handmade Hero) is still valuable for gameplay tuning in the game DLL at M5, with the game-memory snapshot plus input loop. It is low priority for an agent, which iterates by "edit → rebuild → replay N ticks → compare digest", not by watching a loop.
- **Crash path:**
  - M0: `SIGSEGV`/`SIGABRT`/`SIGBUS`/`SIGILL`/`SIGFPE` via `sigaction` with an alternate signal stack, plus `SetUnhandledExceptionFilter` on Windows.
  - Using only async-signal-safe calls, write `runs/<id>/crash.txt`: signal, `backtrace_symbols_fd` (macOS/Linux) or `CaptureStackBackTrace` (Windows), build ID, the last ~200 log records via the unsafe ring iterator, frame/tick, the current `ENG_SCOPE` stack per thread, and the replay buffer tail.
  - Then re-raise.
  - Later, sentry-native with crashpad (out-of-process, survives stack corruption) and transport `none` writes minidumps locally into the bundle. No sentry.io account is needed.
- **Asserts with context:** `ENG_ASSERT(cond, "fmt", ...)` logs at Fatal with the scope stack, tick, frame and last digest, writes a bug bundle, then breaks (`__builtin_debugtrap`) or aborts. `ENG_VERIFY` stays in release builds. Add `ENG_ASSERT_ONCE` for soft asserts in data code.
- **Bug bundle** (`bugs/<date>-<tick>/`): `log.jsonl` (ring), `replay.wzr`, `cvars.json`, `digest.json`, `stats.json`, `shot.png` (if a GPU is present), `build.txt`, `note.txt`. `wz --repro bugs/<dir>` replays to the failing tick and pauses with the debug server open. That gives Claude a deterministic repro from a single path, and the owner can produce one with a hotkey.

### Gaps
- **Sea of Thieves.** Only the abstract of Rare's GDC 2019 talk ("Automated Testing of Gameplay Features in Sea of Thieves", Robert Masella: the game "was created with automated testing for gameplay from the start") was available. No test counts or practices were extracted — [GDC Vault](https://www.gdcvault.com/play/1026366/Automated-Testing-of-Gameplay-Features).
- **Riot's sources of nondeterminism** are in later posts of the series, which were not fetched.
- **crashpad on hosted macOS runners.** Whether crashpad's out-of-process handler works under the macOS hardened runtime and unsigned dev builds was not verified.

---

## 7. Testing: unit tests in C, golden images, performance regression, fuzzing

### Takeaway
- **Unit tests:** `utest.h`, a single header with gcc/clang/MSVC/clang-cl support, filters, xunit output and random order, registered in CTest with labels (`fast`, `gen`, `replay`, `gpu`, `perf`).
- **Golden layers:**
  - exact hashes for CPU outputs, on three OSes, already in M0;
  - per-backend **image goldens compared with NVIDIA FLIP** (BSD-3, single C++ header or `pip install flip-evaluator`) instead of raw pixel diffs;
  - deterministic counter budgets.
- **Fuzzing** generators with random seeds is cheap, because lints are ready-made oracles.

### Cited Findings
- **utest.h:**
  - "A simple one header solution to unit testing for C/C++", Unlicense.
  - Compilers: gcc, clang, MSVC cl.exe, clang-cl.
  - Macros: `UTEST`, fixtures `UTEST_F`, indexed tests `UTEST_I`, `ASSERT_*` (stop) vs `EXPECT_*` (continue) with `_MSG` variants, `UTEST_SKIP`.
  - CLI: `--filter=`, `--list-tests`, `--random-order`, `--output=` (xunit XML for CI).

  — [utest.h](https://github.com/sheredom/utest.h)
- **FLIP:**
  - Implements **LDR-FLIP and HDR-FLIP** image error metrics, v1.7, BSD 3-Clause (NVIDIA).
  - Ships as a C++ single header `FLIP.h`, plus CUDA, Python (`pip install flip-evaluator`, Python ≥3.10) and PyTorch loss modules.
  - Since v1.7, HDR-FLIP's automatic stop exposure handles reference images whose median luminance is 0.
  - Authors: Pontus Ebelin, Tomas Akenine-Möller et al.

  — [NVlabs/flip](https://github.com/NVlabs/flip)
- **WARP as a reference.** Microsoft compares a large library of single-frame captures between hardware and WARP; differences are "within the tolerances defined by the Direct3D 10 specification". This shows that cross-rasterizer pixel equality is not expected. — [Microsoft: WARP](https://learn.microsoft.com/en-us/windows/win32/direct3darticles/directx-warp)
- **Cross-rasterizer pixel noise.** zigui found GPU vs software frames differ on <0.01% of pixels due to subpixel snapping. — [zigui v0.2.0](https://github.com/ddalcu/zigui/releases/tag/v0.2.0)
- **Planned golden layout.** The procedural design plans `tests/golden/hashes.txt` (CPU, 3 OS) and `images/<backend>/` (with tolerance). Owner approval writes the golden. — [Procedural graphics](../../procedural-graphics.md)
- **Planned validation order.** The capability doc orders validation as lints → golden hashes → headless renders and a pixel-only judge → owner. The VFX brightness metric (% pixels over a luminance threshold) is proposed as a contact-sheet test. — [AI capabilities](../../ai-capabilities-in-procedural-3d.md), [voxel-musou](../reference-repos/voxel-musou.md)
- **Sea of Thieves.** Rare built gameplay automated testing "from the start", with a framework "so team members can write tests quickly" and several test types. — [GDC Vault abstract](https://www.gdcvault.com/play/1026366/Automated-Testing-of-Gameplay-Features)

### Inferences
- **Test pyramid and where each layer runs:**

| Layer | Tool | Runs where | Oracle |
|---|---|---|---|
| Unit (containers, handles, math, detmath, jobs) | utest.h + CTest `fast` | all 3 hosted OSes, every push | asserts |
| Generator goldens | `gencli hash` | all 3 hosted OSes | exact 64-bit hash per (asset, seed) |
| Lints | `genlint` | all 3 | numeric rules (palette, texel density, triangle budget…) |
| Replay/scenario | `wz --gpu=null --script … --frames N` | all 3 | per-subsystem tick hashes + digest assertions (`expect stream.late_cells == 0`) |
| Counter budgets | `wz --gpu=null --bench views.txt` | all 3 | counts ≤ budget |
| Image goldens | `wz --gpu=offscreen --shots cams.txt` + FLIP | Linux lavapipe (CI); M4 Pro Metal (local, pre-merge); Windows WARP if SDL_GPU allows | mean FLIP ≤ τ and max-region FLIP ≤ τ₂ per backend |
| Timing perf | `wz --bench` + baselines | M4 Pro only | p95 within +x% of baseline |
| Visual judgement | pixel-only judge sub-agent | local | pairwise vs. references |

- **FLIP integration.** `FLIP.h` is C++, so it lives in `tools/imgdiff` (C++ allowed in tools) or is called via the Python package from the test runner. On failure, write the FLIP error map PNG next to the result, so the judge or owner sees *where* the difference is.
- **FLIP thresholds** must be calibrated per backend on known-good runs, since no universal threshold exists. Store them in `tests/golden/images/<backend>/thresholds.txt`.
- **Fuzzing generators:**
  - A nightly job runs each generator over N random seeds (e.g. 10,000) with asserts and lints on, in `--gpu=null`. Any failure records `(generator, seed, recipe hash)` as a new permanent regression test. This is property-based testing with lints as properties.
  - Coverage-guided fuzzing (libFuzzer) of parsers for cooked blobs, replay files and cvar config is a later option.
- **Sanitizers.** Run ASan/UBSan builds of the unit + replay suites on Linux CI, and TSan for the job system (already in the M1 definition of done).

### Gaps
- **No published FLIP thresholds** for stylized real-time game frames were found. Calibration is empirical.
- **libFuzzer on Apple clang.** Whether Apple's clang ships libFuzzer (vs Homebrew LLVM) was not verified.
- **Rare's test numbers.** Concrete test-type taxonomy and numbers from Sea of Thieves were not available.

---

## 8. Proposal: module layout, M0 vs later, and how Claude uses each tool

### Takeaway
Add seven pieces to the existing architecture:
1. `eng_log`
2. `eng_cvar`/`eng_cmd`
3. `eng_debug` (debug draw + stats + digest writer)
4. `eng_prof` (Tracy wrapper + built-in timers and counters)
5. the `gpu_null` / offscreen modes
6. `eng_replay`
7. `eng_dbgsrv` (localhost JSON-RPC) + `tools/engctl`

**M0 gets everything that is cheap and has no renderer dependency:** log, asserts with scope context, cvars and commands, CLI batch mode with fixed-step "run N frames then dump", crash dump of the log ring, utest + CTest, and the golden-hash job. The debug server and digest come in M1, offscreen shots and FLIP goldens in M2, debug draw and streaming visualizers in M4, and full input replay in M5. Replay-hash infrastructure is built earlier, for generator and streaming tests.

### Cited Findings
- **Existing module and milestone plan:**
  - `core/` holds `log.h` and `profile.h`; `gpu/` has `gpu_sdl.c` and `gpu_null.c`; `tests/` has `unit/` and `replay/` (headless: gpu_null + phys_null); the game port has `eng_debug_api`.
  - Milestones: M0 Skeleton (CMake, base, platform, CI header check, gpu clear); M1 Core (… log, profiler hooks); M2 RHI (… null backend); M4 World (… debug visualization of cells); M5 Game (… input replay, deterministic headless).

  — [Architecture](../../open-world-engine-architecture.md)
- **Procedural design commitments.** It puts determinism and golden hashes in M0, and `gencli` review sheets, `genlint` and golden tests in M3. — [Procedural graphics](../../procedural-graphics.md)
- **godot-mcp design choices to copy:** freeze/step/step-until, JSON digests, screenshots as a last resort, read/write split, localhost binding, and no duplication of what file edits already do. — [godot-mcp](https://github.com/satelliteoflove/godot-mcp)
- **Anthropic's arguments:** consolidated, paginated, concise tool output with actionable errors — [Anthropic Engineering](https://www.anthropic.com/engineering/writing-tools-for-agents). Scripting against APIs instead of routing intermediates through context — [Anthropic: Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp).

### Inferences

**Module layout** (fits the existing "public headers include only `eng/base/types.h`" rule):

```
src/core/      include/eng/log.h        src/log.c, log_sinks.c         # channels, ring, JSONL/stderr/Tracy sinks
               include/eng/assert.h     src/assert.c, crash_posix.c, crash_win.c   # ENG_ASSERT, ENG_SCOPE, crash bundle
               include/eng/cvar.h       src/cvar.c                     # typed cvars, flags, set-by priority
               include/eng/cmd.h        src/cmd.c                      # named commands -> JSON result, script runner (.wzs)
               include/eng/prof.h       src/prof_tracy.c / prof_null.c # PROF_* -> TracyC or nothing; phase timers
               include/eng/json_w.h     src/json_w.c                   # tiny streaming JSON writer (no parser in core)
src/debug/     include/eng/debug.h      src/dd.c, stats.c, digest.c, overlay.c   # debug draw buffer, counters, digest, text overlay
src/gpu/       src/gpu_sdl.c (+ offscreen device mode, readback), gpu_null.c (counts calls, validates handles)
src/runtime/   src/replay.c, src/dbgsrv.c (ENG_DEBUG_SERVER, dev only), src/runmode.c (CLI: --gpu, --frames, --seed, --script, --dump, --agent)
src/imgui/     (ENG_IMGUI, dev only, C++ adapter: dcimgui + SDL3 + SDL_GPU backend)
tools/engctl/  CLI client for dbgsrv (JSON-RPC over TCP) -> stdout JSON
tools/imgdiff/ FLIP wrapper (C++) -> JSON {mean, p99, max, map.png}
tools/mcp/     (later, optional) MCP server wrapping engctl methods 1:1, read tools auto-allowed
tests/         unit/ (utest), replay/*.wzr + expected hashes, scenarios/*.wzs, golden/{hashes.txt, images/<backend>/}, budgets/*.txt
```

**Key design rules:**
1. **One run-artifact directory per run:** `runs/<date>-<seq>/{log.jsonl, stats.json, digest.json, dbgsrv.json, shots/, crash.txt?, trace.tracy?}`, with a symlink `runs/latest`. Everything the agent needs is in one place and grep/jq-able.
2. **Sim time is owned by the run mode, never by the wall clock, in `--agent` and batch modes.** Fixed dt; frames advance only on `step` or script lines; rendering of the current state continues (offscreen or windowed). Screenshots use alpha = 0.
3. **All mutation paths (keyboard, script, RPC) go through `eng_cmd` and are recorded in the replay stream.** A session driven by Claude is therefore itself a replayable repro.
4. **Every query has a size cap and pagination,** and reports dropped data explicitly (godot-mcp's "losses are reported, never silent").
5. **Errors are sentences with a next step.** For example, "cvar r.shadow.res expects int 256..4096, got 'high'". This is Anthropic's guidance.
6. **The debug server is dev-only,** binds to 127.0.0.1 and uses a token file, with no arbitrary-code endpoint. This is the lesson from blender-mcp's no-auth arbitrary exec.

**Milestone placement** (adds to the existing M0–M5):

| Milestone | Observability deliverable | Done when |
|---|---|---|
| **M0** | `eng_log` (channels, levels, frame/tick tag, stderr + `log.jsonl` + ring); `ENG_ASSERT`/`ENG_SCOPE`; minimal crash handler (signal/SEH → `crash.txt` with backtrace + log tail); `eng_cvar` + `eng_cmd` + `+set`/`--exec`/`--script`; run modes `--gpu=null`, `--frames N`, `--fixed-dt`, `--seed`, `--dump`; utest + CTest labels; golden-hash CI job (already planned) | CI on 3 OSes runs `wz --gpu=null --frames 600 --dump` and checks `log.jsonl` has 0 errors; a deliberate assert in a test produces `crash.txt` containing the scope stack |
| **M1** | `eng_prof` (Tracy C wrapper, phase timers, counters, named memory pools from the tagged heap); `stats.json`; `eng_dbgsrv` + `engctl` with pause/step/step_until/digest/log.tail/cvar/cmd; digest writers for core/jobs/mem | Claude can start `wz --agent`, step 300 ticks, read a <2 KB digest and tail warnings without a screen; Tracy capture from CLI works on macOS |
| **M2** | `--gpu=offscreen` with SDL_GPU readback → PNG; `shot` command with named cameras and pass toggles; numeric image stats; text stats overlay; GPU debug groups per render-graph pass; fence-to-fence GPU time; lavapipe CI job; `tools/imgdiff` (FLIP); programmatic GPU capture command | image golden of the test scene passes FLIP on lavapipe in CI and on Metal locally; `engctl shot` returns path + stats |
| **M3** | `gencli` shares the same run mode/shot code; generator nightly seed fuzz; lints into the digest | review sheets and lints are produced by the same binary paths as the engine |
| **M4** | debug-draw module + `debugdraw.dump`; streaming/LOD/gen visualizer channels; counter budgets per named view (CI); flythrough "camera path replay" with per-tick hashes of stream requests | budget regression fails CI; replay of a camera path with I/O delay injection gives identical sim hashes |
| **M5** | full input replay `.wzr` with per-subsystem hashes and first-divergence report; bug bundle + `--repro`; looped live editing for the game DLL; optional ImGui inspectors; optional sentry-native/crashpad minidumps; optional MCP wrapper | a recorded 5-minute drive replays bit-identically on 3 OSes; a crash on the owner's machine yields a bundle that Claude reproduces with one command |

**How Claude uses each tool day to day:**
1. **After every code change:** `cmake --build build && ctest --test-dir build -L fast --output-on-failure`. utest failures give file:line and expected/actual values. Then `jq 'select(.lvl=="E" or .lvl=="W")' runs/latest/log.jsonl | head` checks that the change introduced no new warnings.
2. **Checking behavior without pixels:** `wz --gpu=null --seed 7 --script tests/scenarios/drive_loop.wzs --frames 1800 --dump runs/x`, then read `runs/x/digest.json`. The script contains assertions (`expect stream.late_cells == 0`, `expect actors.count in 180..220`), so pass/fail is in the exit code. This is the bulk of daily verification: cheap, deterministic, and identical in CI.
3. **Interactive investigation** when a test fails or behavior is unclear:
   - Start `wz --agent --gpu=offscreen` in the background.
   - Then:

     ```
     engctl pause
     engctl cmd "teleport 12 -3"
     engctl step --until "stream.pending==0" --max 600 --report stream,mem
     engctl log.tail --since <seq> --min W
     engctl query.cell 12 -3
     ```
   - Change one cvar and step again. Every RPC is recorded, so `engctl replay.save` turns the session into a regression test.
4. **Visual check:** `engctl shot --cam district_03_establishing --debug-view albedo --out ...` returns a path and luminance stats. Claude does **not** open the PNG in its main context. It hands the path plus references to a pixel-only judge sub-agent (per the capability doc and godot-mcp practice), and runs `tools/imgdiff` against the approved golden for regressions.
5. **Performance:** `wz --gpu=null --bench budgets/views.txt --json` gives counters vs budgets, and is CI-enforced. On the M4 Pro, `wz --bench --timing` plus a Tracy CLI capture → CSV export gives the top zones by self time to read as text.
6. **Bugs from the owner:** the owner presses the bug hotkey, or a crash produces a bundle. Claude runs `wz --repro bugs/<dir>`, which stops at the failing tick with the debug server open. From there: digest, log tail, scope stack in `crash.txt`, fix, then re-run the replay as a permanent test.
7. **GPU-only bugs:** `engctl gpu.capture --frames 1` writes a `.gputrace` or RenderDoc capture for the owner to open in Xcode or RenderDoc. Claude archives it and describes what to look at. It cannot inspect it itself; this is an honest limitation.

**Critical caveats:**
- **Not everything is deterministic.** GPU output differs per backend and driver, and timing is noise on hosted runners. Never compare pixel hashes across backends, and never budget wall-clock on hosted CI.
- **Digests must be designed.** A digest that dumps everything is as bad as a screenshot. Each subsystem's `debug_state` needs a concise default with live values *plus* the context to interpret them (target, limits). That is the `_mcp_state()` lesson.
- **The debug server is a second way to mutate state, which can break determinism.** Hence rule 3: it goes only through `eng_cmd`, applies at the tick boundary, and is recorded.
- **Keep the surface small.** godot-mcp needs 21 tools / 86 actions for a whole editor. A game engine without an editor should fit in ~10 namespaced methods (`sim.*`, `state.*`, `log.*`, `cvar.*`, `cmd.*`, `shot`, `query.*`, `replay.*`, `prof.*`, `gpu.capture`). Add new capability as `cmd` registrations, not new RPC methods.

### Gaps
- **None of the proposed numbers are measured.** These include ring size, digest caps, ~10 RPC methods and module line counts. They are design estimates to validate in M0/M1.
- **The SDL_GPU details remain open,** as in sections 2, 4 and 5: offscreen behavior on lavapipe, WARP and the hosted-macOS paravirtual GPU; native handle access; and timestamps.
- **No public account was found** of an AI agent driving a *custom native C engine* through such an interface. The proposal extrapolates from godot-mcp, unity-mcp and blender-mcp experience and Anthropic's tool-design guidance.
