# Studio, MCP server, UI and projects for Wallhammer Zero (D18)

Notes written 2026-11-05. Scope: the studio (editor), MCP as the main interface for AI, UI for both the studio and the game, the project system and a concrete proposal (modules, milestones, daily work). The debug server, logging and headless mode (D17) are covered by a parallel research. Here they are treated only as a dependency.

Starting state of the design: `docs/research/open-world-engine-architecture.md` (13 CMake targets, `runtime` as a mediator, `app` + a game DLL through `eng_api`, tools "from M5"), `docs/research/procedural-graphics.md` (asset = program + parameters + seed, recipes in `content/`, `gencli render` with contact sheets, `genlint`, golden hashes, cimgui panels "in parallel from M3") and `docs/DECISIONS.md` D15–D18.

Limits of the research: halfway through the work the shared web search limit ran out (200 queries per session). The rest rests on direct reading of primary pages through WebFetch. It was therefore not possible to find: the Unity CLI (the successor of Unity MCP), Nuklear, Noesis, MSDF and stb_truetype, Flax and Hazel, or the exact list of Epic MCP tools. These items are in the Gaps sections.

---

## 1. Studio architecture: on top of the engine, one or two binaries, play-in-editor, undo and a minimal studio for the art director

### Takeaway
Recommendation: **the studio is a separate binary `wz_studio`, built from the same static libraries as the game.** On top it has only the module `eng_editor`, on which nothing below it may depend (the Godot rule `editor/ → scene/ → servers/ → core/`). The edit mode (generators, viewport, review) runs in the studio. **"Play" starts the game as a subprocess** connected through the debug server from D17, after the model of Fyrox ("the editor will not crash if the game does"). The data model is not in-memory objects as in The Truth, but **text recipes in git**. Undo is a stack of recipe patches and is shared by the panels, MCP and the file watcher. The minimal studio for the art director consists of a viewport with a reference mannequin, a recipe browser, a parameter panel generated from a schema, a contact sheet with A/B and approval, the state of lints and golden hashes, and notes pinned into the world. It does not need modeling tools.

### Cited Findings
**Godot (the editor = an application on top of its own engine)**
- The Godot editor is drawn with the engine's own renderer and UI system ("does *not* rely on a toolkit such as GTK or Qt"). It is entirely in C++ and its code lies in `editor/`. Some editor modules are enabled "only in editor builds to decrease the binary size of export templates". Dependencies may flow in only one direction: `editor/ → scene/ → servers/ → core/`. New includes from `editor/` must not be added elsewhere, not even under `#ifdef TOOLS_ENABLED` — [Godot docs: Introduction to editor development](https://docs.godotengine.org/en/latest/engine_details/editor/introduction_to_editor_development.html)
- The Godot editor can show and change nodes while the game runs ("Remote" in the Scene dock), replicate scene and script changes into the running project ("Synchronize Scene Changes / Script Changes") and keep the debug server open for sessions started outside the editor ("Keep Debug Server Open"). The page does not explicitly say that the game runs as a separate process. But it follows from the description of the deployment, where an executable connects to the editor over the network — [Godot docs: Overview of debugging tools](https://docs.godotengine.org/en/stable/tutorials/scripting/debug/overview_of_debugging_tools.html)

**Fyrox (the game as a subprocess)**
- FyroxEd "calls `cargo` commands to build and run your game in a separate process" so that "the editor won't crash if your game does". Play mode works only for projects from the `fyrox-template` template. While playing, the editor UI is locked — [Fyrox book: Editor overview](https://fyrox-book.github.io/beginning/editor_overview.html)

**Bevy (the editor as a normal application of the engine, state 2026)**
- Bevy 0.19 (06/2026) brought the BSN scene system and the Feathers widgets built on it. Bevy 0.20 (8 Oct 2026) added to Feathers ("the opinionated editor-centric UI toolkit") Color Input, Scrollable List View, Dropdown and Lazy Menu — [Bevy 0.20](https://bevy.org/news/bevy-0-20/), [Bevy 0.19](https://bevy.org/news/bevy-0-19/) (data from search results, I did not read the pages in full)
- Bevy's sixth birthday (08/2026): "The Bevy Editor … will be a normal Bevy app built on top of Bevy UI + BSN". It will create `.bsn` files and compose them in a visual scene editor. The foundations already exist: "the scene system, the UI system, the editor widget library, the asset system, the remote protocol, the design language and mockups, a proven dynamic plugin loading model, and an extremely functional prototype". The community prototype Jackdaw has a BSN scene editor, an ECS inspector, undo/redo, dynamic plugins, materials, terrain and a **project manager / creator**. But the official editor is not released as of 11/2026 ("You probably shouldn't trust me when I say it is close now"). The post on the editor does not mention AI or MCP at all — [Bevy's Sixth Birthday](https://bevy.org/news/bevys-sixth-birthday/)

**Wicked Engine (a separate application on top of a library)**
- The Wicked Engine editor is a separate project on top of the engine library (`Editor/Editor.xcodeproj`, `Editor_Windows`). It has a Lua console (the Home key) and `startup.lua`. It imports OBJ/FBX/glTF and saves to WISCENE, "then any Wicked Engine application can open them" — [WickedEngine README](https://github.com/turanszkij/WickedEngine)

**The Machinery (data model and document)**
- The Truth stores data as "objects with properties" (bool, int, float, string, buffer, reference, sub-object, sets). **The authority is the data in memory** behind a thread-safe API, the disk serves only as a backup. Changes are recorded uniformly as (object, property, old value, new value), so undo, copy/paste and real-time collaboration are "built into the model". Changes propagate by themselves between editor windows and plugins. References go through unique IDs, not paths. Among the open questions the author lists a **git-friendly disk format** and partial loading of large projects — [The Story behind The Truth](https://ruby0x1.github.io/machinery_blog_archive/post/the-story-behind-the-truth-designing-a-data-model/index.html)
- On the document model: a single undo stack for the whole project keeps the state consistent and allows reverting bulk operations (find-and-replace, renaming), but it may revert a change in an already closed document. In collaboration the stacks are split again by user. The author rejects configurable workflows: "Applications should be opinionated!" — [The Document Model and The Machinery](https://ruby0x1.github.io/machinery_blog_archive/post/the-document-model-and-the-machinery/index.html)
- DLL hot reload: plugin state lives in one struct that is copied over with `memcpy` on reload. APIs are structs of function pointers in a registry, "to patch an API we just replace all the function pointers". It is broken by a change of object layout, inlined functions and breakpoints do not carry over. On Windows Visual Studio locks `.pdb` files. Code on paths that run only during a reload hides bugs, so the author recommends including it in tests — [DLL Hot Reloading in Theory and Practice](https://ruby0x1.github.io/machinery_blog_archive/post/dll-hot-reloading-in-theory-and-practice/index.html)
- The Machinery archive contains a series on its own IMGUI for the editor ("One Draw Call UI", "UI rendering using Primitive Buffers", "DPI-aware IMGUI", "Keyboard Focus and Event Trickling in Immediate Mode GUIs", "Implementing drag-and-drop in an IMGUI") and a series "Borderland between Rendering and Editor" (picking, selection highlighting) — [Machinery blog archive](https://ruby0x1.github.io/machinery_blog_archive/)

**Unreal (undo in AI tools)**
- According to a source from a vendor of a competing plugin, every tool call of the official Epic MCP is "typically one operation with one undo entry". Transactional multi-step execution is missing and reading Blueprint graphs is limited — [StraySpark (vendor, biased)](https://www.strayspark.studio/blog/epic-official-mcp-plugin-ue5-8-vs-third-party)

### Inferences
- **One or two binaries.** Godot and Wicked both separate editor code from runtime (a build flag, or a separate project). Bevy builds the editor as a "normal app" on top of the same libraries. For us this means `wz_run` (the game, with no editor code) and `wz_studio` (the same static libraries + `eng_editor` + `eng_mcp` + ImGui). The game DLL is the same for both binaries. The studio loads it with the same loader as `app`, so the hot reload from M5 works in the studio too.
- **Play-in-editor.** I recommend two modes. (a) **Edit/Preview in the studio process**: the world, generators and camera without game logic. 90 % of the art director's work stands on this: sliders, contact sheets, fly-through. (b) **Play as a subprocess** `wz_run --project P --debug-server <socket>`, connected through the debug server from D17. The studio then shows the remote state (like Remote in Godot) and MCP tools are forwarded to the game through the studio. Reasons: a crash of the game DLL does not take down the studio (Fyrox), headless CI uses the same path as Play, and replay determinism does not depend on the state of the editor. An in-process "Simulate" after the Unreal PIE model can be added later. It requires, however, that the game state lives in `game_memory` (the Handmade Hero rule, which the design already has).
- **Data model.** The Truth has memory as the authority, and therefore it handles a git-friendly format only afterwards. We have recipes as text in git (D8, Procedural graphics). Therefore I recommend **the opposite direction: the authority is the recipe files and in memory there is only their parsed shadow.** Every change, whether from a panel, from MCP, or from a text editor, goes through one API `recipe_patch(doc, path, old, new)`. The record has the same shape (object, property, old, new) as in The Truth, so from it we get undo, history labels and a diff for review. There is one undo stack for the whole project, as Machinery recommends, and **every record carries an author (owner / ai:claude / file-watch)**. The owner can thus see and, with one click, revert what the agent changed.
- **What the art director actually needs** (D8, D11: no modeling, the owner specifies and approves):
  1. A **viewport** with a free camera, camera presets from review (front, 3/4, behind the car, from the street), a reference mannequin and a 1 m grid per D16, and debug views (albedo, normals, cells, LOD, texel density).
  2. A **recipe and asset browser**: materials, archetypes, cells. The preview is the last contact sheet from the cache.
  3. A **parameter panel generated from the schema** of the generator (sliders, enums, seed, palette picker) that writes the recipe. The procedural research already assumes it ("panels only write recipes").
  4. A **contact sheet and A/B review**: 16 seeds, variant A against B, the asset next to the owner's reference at the same scale and light. The buttons **Approve / Reject / Note** write to `review/` and approval moves the golden hash.
  5. **Quality state**: lints, golden hashes, cell generation time.
  6. **Notes in the world**: a click in the viewport pins a note with a position, camera and screenshot ("this roof is too flat"). It is the main channel from the owner to Claude and MCP exposes it as a resource.
  7. **Console, log, CVars** (from D17).
  A gizmo for manual object placement, curve editing and a node graph will come only with the need for manual overrides (stamps and masks in `content/world/`).

### Gaps
- Because search ran out, I did not verify the architecture of the Flax and Hazel editors.
- Whether Godot 4.4+ embeds the window of the running game into the editor (the "Game" view) while the game stays a separate process is not described by the debugging page.
- I did not find out why Our Machinery ended or how the authors of The Truth assessed it in retrospect (the page about the shutdown returned 404). The article on The Truth says it is "still a bit too early" for a post-mortem.

---

## 2. MCP in engines 2025–2026 and the design of an MCP server for our engine

### Takeaway
As of November 2026, three major editors have a built-in MCP server: **Roblox Studio** (a stdio launcher, about 25 tools), **Unreal 5.8** (experimental, HTTP on `127.0.0.1:8000/mcp`, no authentication, tools discovered through meta-tools) and **Unity** (a stdio relay and a socket into the editor, although the 2.19 documentation already lists it as deprecated in favor of the Unity CLI). Godot and Blender have only community bridges (an addon in the editor, TCP or UDP on localhost and a separate MCP process). There is no official C/C++ SDK, but JSON-RPC over stdio is a small job for C17 with yyjson. Recommended shape: **a small stdio launcher `wzmcp`** that Claude Code starts from the project's `.mcp.json`. The launcher finds a running studio (the unix socket or named pipe of the debug server from D17), or starts a headless engine. **Tools are registered by the engine, about 30 tools in 8 sets.** They return machine digests and paths to images, not inline images. Long operations run as tasks and every mutation is one undo record.

### Cited Findings
**Roblox Studio (built in, the most complete model for a game)**
- Tools of the official server: scripts (`script_read`, `multi_edit`, `script_search` max. 10, `script_grep` max. 50 matches), generation (`generate_mesh`, `generate_material`, `generate_procedural_model`, `wait_job_finished`), assets (`search_asset`, `insert_asset`, `upload_image`, `store_image`), the data model (`search_game_tree` as flat JSON with filters, `inspect_instance`), `execute_luau`, playtest (`get_studio_state`, `start_stop_play`, `get_console_output`, `screen_capture` with an optional camera position and target), input simulation (`character_navigation`, `user_keyboard_input` optionally aimed at a UI instance, `user_mouse_input`), documentation (`http_get` only for allowed Roblox documentation URLs, `skill`), `subagent` (types `explore`/`playtest`) and `list_roblox_studios` — [Roblox docs: Studio MCP](https://create.roblox.com/docs/en-us/studio/mcp.md) (page updated 2026-11-05)
- The transport is stdio through a local launcher (`/Applications/RobloxStudio.app/Contents/MacOS/StudioMCP`, on Windows `%LOCALAPPDATA%\Roblox\mcp.bat`). Quick connect works for Claude Code, Codex CLI, Cursor, Gemini CLI, VS Code and others. **Every call carries a `studio_id`**, so the target is explicit, not bound to the session. `multi_edit` and `execute_luau` require a `datamodel_type` of Edit, Client or Server. The security model is limited to the warning "connect only trusted clients", it has no approval of individual actions — [same page](https://create.roblox.com/docs/en-us/studio/mcp.md)
- The earlier standalone server in Rust (`start_stop_play`, `get_studio_mode`, `insert_model`, `run_code`) is "no longer being actively developed in favor of the built-in server" — [Roblox/studio-rust-mcp-server](https://github.com/Roblox/studio-rust-mcp-server)

**Unreal Engine 5.8 (Epic, experimental, 06/2026)**
- The server in the editor supports only HTTP and SSE ("The `stdio` and WebSocket transports are not supported"). The default endpoint is `http://127.0.0.1:8000/mcp`. **Loopback and rejection of non-loopback `Origin`, no authentication**, "not safe to expose beyond the local machine" — [Epic docs: Unreal MCP in Unreal Editor](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-mcp-in-unreal-editor)
- Tools are defined as toolsets: C++ `UToolsetDefinition` with `UFUNCTION(meta=(AICallable))` (a new function requires an editor restart, Live Coding does not propagate them), or Python `unreal.ToolsetDefinition` with the decorator `@toolset_registry.tool_call`, where the JSON Schema is built from type hints and docstrings. Built-in ones include `SceneTools`, `ActorTools`, `MaterialInstanceTools` and `ObjectTools` — [same page](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-mcp-in-unreal-editor)
- **Tool search is on by default**: `tools/list` returns three meta-tools `list_toolsets`, `describe_toolset` and `call_tool`. Resources and Prompts are not yet exposed by any toolset. **Calls run serially on the game thread** ("clients should not issue overlapping calls"). The console command `GenerateClientConfig` writes `.mcp.json` into the project root for Claude Code — [same page](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-mcp-in-unreal-editor)
- Community and commercial servers go for breadth: StraySpark lists 455 tools in 64 categories, a "catalog mode", transactional scripts, bearer authentication with scopes and a defense against DNS rebinding (the source is a vendor) — [StraySpark](https://www.strayspark.studio/blog/epic-official-mcp-plugin-ue5-8-vs-third-party). According to a report from State of Unreal 2026, UE6 (early access at the end of 2027) is to build an "open MCP foundation" as basic infrastructure — [Unreal Engine news](https://www.unrealengine.com/news/state-of-unreal-2026-top-news-from-the-show) (taken from a search summary, I did not read the page)

**Unity**
- Architecture: the AI client starts a stdio relay (`~/.unity/relay/`, the `--mcp` flag). The relay connects to the MCP bridge in the editor through local IPC (pipes on Windows, unix sockets on macOS and Linux). The bridge routes calls to `McpToolRegistry`. Custom tools are registered by attributes, interfaces or at runtime, each with a name, description, inputs and an optional output schema. Direct clients need **approval in Project Settings** (remembered), connections through the "AI gateway" are approved automatically. **The 2.19 documentation states: "Unity MCP server is deprecated. Use the Unity command-line interface (CLI) instead."** — [Unity AI Assistant 2.19: Unity MCP overview](https://docs.unity3d.com/Packages/com.unity.ai.assistant@2.19/manual/integration/unity-mcp-overview.html)

**Godot and Blender (community bridges)**
- Godot MCP Pro (paid) advertises 175 tools and separate `get_editor_screenshot` and `get_game_screenshot` — [youichi-uda/godot-mcp-pro](https://github.com/youichi-uda/godot-mcp-pro). Godot MCP Runtime on `run_project` injects into the project an autoload `McpBridge` with a UDP channel on port 9900 (localhost only) and supports `background: true` — [godot-mcp-runtime](https://chat.mcp.so/server/godot-mcp-runtime/Erodenn?tab=tools). The Coding-Solo server offers `launch_editor`, `run_project`, `stop_project` and `capture_screenshot`, where the screenshot is "experimental" according to the README — [mcp.directory: godot-mcp](https://mcp.directory/servers/godot-mcp). IvanMurzak/Godot-MCP distinguishes a screenshot of the viewport, of the camera and of an isolated node — [Godot-MCP wiki](https://github.com/IvanMurzak/Godot-MCP/wiki)
- Blender MCP: the addon starts a socket server in Blender (default `localhost:9876`, "Plain UTF-8 JSON over TCP — no length prefix", `{"type":..., "params":...}`). The tool `execute_blender_code` sends arbitrary Python and the project itself warns that it is "potentially dangerous". The server must be turned on manually in the addon panel every session — [Glama: execute_blender_code](https://glama.ai/mcp/servers/ahujasid/blender-mcp/tools/execute_blender_code), [Hermes docs: Blender MCP](https://hermes-agent.nousresearch.com/docs/user-guide/skills/optional/creative/creative-blender-mcp)

**The owner's experience from godot-mcp (a local skill, a primary source of practice)**
- "Driving a game through an agent is not like driving it by hand: tens of seconds of model latency can pass between two tool calls". The solution is `freeze`/`step`/`step_until(predicate)`/`thaw` and an input timeline *inside* the stepped window. Events injected during a freeze would otherwise miss the "just pressed" edge. State is set through `godot_exec`. Verification is **from a state digest, not from pixels**: entities are tagged into the group `mcp_watch` and `_mcp_state()` returns live values and also static context (~1 KB). `watch_start`/`watch_collect` summarize fields over time (min, max, mean, slope) and report every data loss. **One 1280×720 frame costs ~1,200 tokens and stays in context for the whole session**, so visual checks are delegated to subagents. Editor errors and running-game errors are two separate channels — `~/.claude/skills/godot-game-testing/SKILL.md` (the owner's local file)

**The MCP specification (versions and what to use from them)**
- 2025-06-18: JSON-RPC batching removed, added **structured tool output**, **elicitation**, **resource links** in tool results, the `MCP-Protocol-Version` header for HTTP, a `title` field next to the programmatic `name` and `_meta` on more types — [MCP changelog 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/changelog)
- 2025-11-25: icons for tools and resources, guidance on tool names, URL elicitation, tools in sampling, **experimental tasks** (polling and a deferred result), servers may log to stderr on stdio, **an invalid `Origin` must get HTTP 403**, input validation errors are returned as a Tool Execution Error so that the model can correct itself, and the default dialect is JSON Schema 2020-12 — [MCP changelog 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/changelog)
- **2026-07-28 (current):** protocol sessions and `Mcp-Session-Id` removed. MCP is stateless, the `initialize` handshake disappeared and the version with capabilities goes in the `_meta` of every request. `server/discover` is mandatory, which the client may also use as a "backward-compatibility probe on STDIO". `subscriptions/listen` was added. Tasks moved to the extension `io.modelcontextprotocol/tasks` (polling `tasks/get`, `tasks/update`). Server-initiated requests were replaced by the Multi Round-Trip Requests pattern (`resultType: "input_required"`). SSE resumability was removed. **Servers "SHOULD return tools from `tools/list` in a deterministic order" because of the prompt cache.** Lists have `ttlMs` and `cacheScope`. Roots, Sampling and Logging ("log to stderr … or use OpenTelemetry") and the HTTP+SSE transport are listed as deprecated. State across calls should be passed as "explicit, server-minted handles passed as ordinary tool arguments" — [MCP changelog 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- The official SDKs for 2026-07-28 are TypeScript, Python, C#, Go, Rust, Ruby (Tier 1), Java (Tier 2), Swift, PHP and Kotlin (Tier 3). **There is no C or C++ SDK among them** — [MCP SDKs](https://modelcontextprotocol.io/docs/2026-07-28/sdk.md)

**Claude Code as the main client (limits that shape the tool design)**
- Transports: stdio, HTTP (`streamable-http`), WebSocket (only in `.mcp.json`). SSE is deprecated. The project `.mcp.json` is committed and an interactive session asks before using it. A stdio server gets `CLAUDE_PROJECT_DIR` in its environment. A timeout can be set for each server (`"timeout"`) — [Claude Code docs: MCP](https://code.claude.com/docs/en/mcp)
- Output: a warning above **10,000 tokens**, a default limit of **25,000 tokens** (`MAX_MCP_OUTPUT_TOKENS`). A text result above **50,000 characters** is saved to a file unless the tool declares `_meta["anthropic/maxResultSizeChars"]` (ceiling 500,000). PNG, JPEG, GIF and WebP images are seen by Claude inline (possibly downscaled) and the original is saved to `tool-results` — [same page](https://code.claude.com/docs/en/mcp)
- Time: the idle timeout without a response or progress notification is **5 min for HTTP and 30 min for stdio**. A call longer than **2 min** moves to a background task. **MCP tasks (public beta, Claude Code v2.1.304+)**: a server may answer `tools/call` with a task object (`taskId`, `status` working, input_required, completed, failed or cancelled, `pollIntervalMs` 250–30,000) if the request carries the extension `io.modelcontextprotocol/tasks` — [same page](https://code.claude.com/docs/en/mcp)
- **Tool search is the default**: at the start of a session only the tool names and server instructions are loaded. Server instructions and descriptions of upfront tools are truncated at **4,096 characters**, descriptions of tools loaded through tool search at **16,384 characters**, and "put the words Claude would search for near the start". `_meta["anthropic/alwaysLoad"]` loads a tool immediately. `_meta["anthropic/requiresUserInteraction"]: true` forces confirmation by a human on every call, even in auto and bypass modes. Resources can be mentioned through `@server:proto://path` and Claude Code adds list/read tools for them by itself. `list_changed` leads to reloading the list without a reconnect. The V2 runtime uses the 2026-07-28 revision, stdio channel servers can be kept on the old handshake through `MCP_PROTOCOL_NEGOTIATION=legacy`. Elicitation works only in an interactive terminal — [same page](https://code.claude.com/docs/en/mcp)

**JSON in C**
- yyjson: ANSI C89, one `.h`/`.c` pair, MIT license, parsing and serialization at the order of GB/s (benchmark 2020). Immutable documents are complemented by a mutable API for building. The README lists JSON Pointer, JSON Patch and Merge Patch among the features, but in the TODO for 1.0 JSON Pointer is unchecked, so the page contradicts itself. Supports a custom allocator — [ibireme/yyjson](https://github.com/ibireme/yyjson)

### Inferences
**Transport and process.** Roblox (a stdio launcher) and Unity (a stdio relay → socket) choose the same pattern: Claude Code starts a small stdio process and that talks to a long-lived editor through local IPC. Epic chooses HTTP in the editor, at the cost of having to guard the port, `Origin` and authentication. For us I recommend:
- **`wzmcp`** as a small C17 EXE (stdio JSON-RPC). (1) It finds the running `wz_studio` of the given project through `.wz/session.json` (the path to the unix socket or named pipe of the debug server from D17, a random token). (2) When the studio is not running, it starts a headless `wz_run --headless --project P` or `gencli serve`, so the same tools work in CI without a window. (3) It forwards frames. The logic of the tools lives in the engine, not in `wzmcp`.
- A unix socket with 0600 permissions in `.wz/` gives local access without an open port. This removes the class of attacks via Origin and DNS rebinding, which Epic handles only with loopback. Add Streamable HTTP on `127.0.0.1` with a token and an `Origin` check (403 per 2025-11-25) only for clients that cannot do stdio.
- Protocol: primarily 2025-11-25 (stdio `initialize`) plus **`server/discover` and reading `_meta` per 2026-07-28**. The stateless design suits us because state (camera, task, A/B comparison) is passed as an explicit handle in arguments anyway. Roblox does the same with `studio_id`.
- **The internal protocol of the debug server from D17 should have the shape of an MCP tool call** (`{"tool": name, "args": {...}}` → `{content, structuredContent, isError}`). One tool registry then serves MCP, the studio console and CI scripts.

**Tool registry in C** (the API shape after The Machinery):
```c
typedef struct eng_tool_desc {
    const char *name;          /* "gen_contact_sheet" – keywords at the start of the description */
    const char *title;
    const char *description;   /* ≤ ~1,500 characters; first sentence = when to use the tool */
    const char *input_schema;  /* JSON Schema 2020-12, generated from the parameter table */
    const char *output_schema; /* for structuredContent */
    uint32_t    flags;         /* TOOL_READ_ONLY | TOOL_MUTATES (=undo record) | TOOL_LONG (=task)
                                  | TOOL_MAIN_THREAD | TOOL_NEEDS_OWNER (=requiresUserInteraction)
                                  | TOOL_PLAY_ONLY | TOOL_EDIT_ONLY */
    eng_tool_result (*call)(const struct eng_tool_args *a, struct eng_tool_ctx *ctx);
} eng_tool_desc;
void eng_tools_register(const eng_tool_desc *d);  /* called by runtime/editor/game (composition root) */
```
- Calls are queued and the main thread executes them **between frames**. Epic also serializes them on the game thread. Read-only queries may run over a state snapshot from FrameParams.
- The game DLL may register its own tools through `eng_api->debug` (e.g. `game_state` as our `_mcp_state()`). After a hot reload the registration is renewed and the server sends `list_changed`. Epic cannot do this, because new `UFUNCTION`s require a restart.
- Return the tool list in a deterministic order (2026-07-28, prompt cache).

**Proposed tool set (about 30, 8 toolsets).** The names are flat, Claude's tool search finds them. Meta-tools à la Epic (`list_toolsets`/`call_tool`) make sense only above roughly 80 tools.

| Toolset | Tool | Input → output (structuredContent) | Note |
|---|---|---|---|
| session | `wz_status` | – → project, engine and API version, mode edit/play, frame, pause, job queue, counts of errors and warnings since the last call, open review notes | "digest", call first; `alwaysLoad` |
| project | `project_build` | target(s) → compiler errors structured (file, line, message) | TOOL_LONG (task), progress |
| | `project_reload` | {game, gen, shaders} → what was reloaded, invalidated hashes | hot reload from M3/M5 |
| gen | `gen_list` | filter → generators, versions, parameter schema (link to a resource) | |
| | `gen_run` | asset, parameter patch, seeds → output hashes, times, tri/texel counts, lints | no images |
| | `gen_contact_sheet` | asset, seeds, views, debug views, `ref` → **path to a PNG + a resource link**, optionally a thumbnail ≤512 px | image inline only on request |
| | `gen_compare` | A, B (parameters or commit) → A/B sheet + metric differences | A/B review |
| recipe | `recipe_get` / `recipe_patch` | path, JSON patch → new hash, undo id, diff | TOOL_MUTATES |
| quality | `lint_run` | scope → list of violations (rule, asset, value, limit) | |
| | `golden_check` | set → matches and mismatches (CPU hash, GPU image with tolerance) | |
| | `golden_accept` | asset, hash → writes the golden | **TOOL_NEEDS_OWNER** |
| world | `world_query` | bbox or cells, archetype filter → counts, IDs, LOD state, cell generation times | pagination |
| | `world_inspect` | handle or ID → archetype, recipe, transforms, materials, origin (pack/cache/gen) | |
| | `world_pick` | pixel or ray → hit (handle, cell, distance) | links a screenshot to data |
| view | `camera_set` | position/target/fov or preset → camera handle | |
| | `screenshot` | camera, size (default 768 px), debug view, overlay (grid, mannequin) → path + optionally inline | |
| time | `time_control` | freeze / step N / step_until(expression over cvars or state) / thaw, input timeline → state at the end | model from godot-mcp |
| debug (D17) | `cvar_get` / `cvar_set` | name, value → old and new value | |
| | `log_tail` | channel, level, cursor → records + new cursor | two channels: studio and game |
| | `profile_snapshot` | N frames → top zones, budgets, overruns | |
| | `console_exec` | console command → output | no arbitrary C |
| play | `play_start` / `play_stop` | spawn point, seed, replay file → game handle | subprocess |
| | `game_state` | select → digest of game entities (the `_mcp_state` equivalent) | registered by the game DLL |
| ui | `ui_tree` | screen → tree of elements (ID, box, text, focus) | see question 3 |
| review | `review_list` / `review_reply` | state → owner's notes (position, camera, screenshot path, text) | |
| | `review_request` | sheet, question → the task waits for the owner's decision in the studio | TOOL_LONG |

- **Resources:** `wz://project/manifest`, `wz://project/style` (style bible), `wz://project/scale` (the D16 scale table), `wz://gen/{id}/schema`, `wz://docs/engine/{topic}` (short pages on the API and conventions), `wz://review/open`, `wz://sheet/{hash}.png`. The owner can mention them through `@wz:` in a prompt.
- **Prompts:** `review_asset` (render a sheet, compare with the reference, list the deviations), `new_generator` (a skeleton of a `gen_*` module + schema + lint + golden), `fix_lint`, `scale_audit`. Unreal has no Prompts yet at all, so this is our own extension.
- **Token savings:** the default output is text or JSON and images go as a path or a resource link. An inline image only on an explicit `inline: true`. Visual judgment is done by a subagent (the owner's experience: ~1,200 tokens per frame permanently). Large listings are paginated with a cursor and never exceed 25k tokens.
- **Security and trust:** no `execute_code`-type tool such as Roblox `execute_luau` and Blender `execute_blender_code`. The escape route is that Claude edits the source and calls `project_build` + `project_reload`. The change is then in git and can be reviewed. Writes go through undo with the author `ai:` and irreversible steps (`golden_accept`, deletion) have `requiresUserInteraction`.
- **Elicitation vs. the studio:** elicitation works only in an interactive terminal and 2026-07-28 reworks it. Owner decisions therefore belong in the studio UI (`review_request` as a task that completes on a click). This is more natural for an art director who sits at the studio, not at the terminal.

### Gaps
- The exact list of built-in Epic MCP tools and its behavior regarding undo are not stated in the documentation. The claim "one tool = one undo record" comes from a competing vendor.
- What the "Unity CLI" that replaces Unity MCP is, and why Unity backed away from MCP, I could not find because search ran out. It is an important signal (CLI instead of MCP?) and worth verifying.
- I did not verify community C/C++ implementations of MCP servers. The official SDK for C/C++ is missing (verified).
- Whether Claude Code itself switches to legacy negotiation for a stdio server that can only do the 2025-11-25 handshake is not stated explicitly in the documentation. All that is known is that `server/discover` serves as a probe and `MCP_PROTOCOL_NEGOTIATION=legacy` exists. Verify with a test during implementation.
- I did not find tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`) in the changelogs I read. They are probably older (2025-03-26), but this is not verified.

---

## 3. UI: studio and game UI in C on SDL_GPU, text, localization, gamepad

### Takeaway
**Studio: Dear ImGui (docking) through dear_bindings (`dcimgui`) and the official backends `imgui_impl_sdl3` + `imgui_impl_sdlgpu3`.** C++ stays behind a C header in an adapter (D4), as with Jolt. **Game: our own thin layer `eng_ui` on top of Clay** (C, zlib, flexbox-style layout, renderer-agnostic render commands, no malloc), our own renderer through SDL_GPU and text through **SDL_ttf 3 (FreeType + HarfBuzz, GPU text engine)**, or kb_text_shape. RmlUi (HTML/CSS) is a strong fallback for menus with a lot of text, but it brings a C++ API with no C interface and its SDL GPU backend has no filters or clip masks. The game UI must be **machine-introspectable** (`ui_tree`) from the start and renderable headless, otherwise AI cannot verify it.

### Cited Findings
**Studio UI**
- dear_bindings generates from `imgui.h` the files `dcimgui.h` (C API), `dcimgui.cpp` (a bridge to C++) and `dcimgui.json` (metadata). It supports the `docking` branch (v0.12 adds docking PlatformIO callbacks) and is intended as a possible replacement for cimgui (cimgui is from 2015, dear_bindings from 2021 and "may be less battle-tested"). The conversion of backends is experimental. Among the tested ones are SDL2/3, the example `example_sdl3_sdlgpu3` exists, the Metal/OSX backend is excluded — [dearimgui/dear_bindings](https://github.com/dearimgui/dear_bindings)
- The official backend `imgui_impl_sdlgpu3` supports `SDL_GPUTexture*` as `ImTextureID` (since 2025-08-08), meshes over 64k vertices with 16-bit indices and a dynamic font atlas (`RendererHasTextures`). The call `ImGui_ImplSDLGPU3_PrepareDrawData` **must happen before** the start of the render pass. The fields `SwapchainComposition` and `PresentMode` serve the multi-viewport mode — [imgui_impl_sdlgpu3.h](https://github.com/ocornut/imgui/blob/master/backends/imgui_impl_sdlgpu3.h)
- Dear ImGui Test Engine injects mouse, keyboard and gamepad input, addresses widgets by path (`ctx->ItemClick("My Button")`), makes screenshots, videos and GIFs and runs headless in CI. The license is **free for individuals, education, open source and small companies**, larger companies pay. The API is C++ only — [ocornut/imgui_test_engine](https://github.com/ocornut/imgui_test_engine)
- microui: roughly 1,100 lines of ANSI C, MIT, fixed memory with no allocations, windows, panels, buttons, sliders and a textbox, draws anything that can do rectangles and text. The author does not accept new features ("pull requests adding additional features will likely not be merged") — [rxi/microui](https://github.com/rxi/microui)
- The Machinery built its own IMGUI for its editor ("One Draw Call UI", DPI, keyboard focus, drag-and-drop) — [Machinery blog archive](https://ruby0x1.github.io/machinery_blog_archive/). Bevy builds its editor on its own UI and the Feathers widgets — [Bevy's Sixth Birthday](https://bevy.org/news/bevys-sixth-birthday/)

**Game UI**
- Clay: C (C99, C++20), zlib, a single header `clay.h` of roughly 4.8k lines with no dependencies. Flexbox-style layout (FIT, GROW, FIXED, PERCENT), text wrapping, scroll containers, floating elements (tooltips, context menus), aspect ratio, transitions and a built-in debug inspector. The output is a sorted `Clay_RenderCommandArray` (rectangles, text, images, borders, custom, scissor). Text is measured with the callback `Clay_SetMeasureTextFunction` with a cache. It promises "microsecond layout performance", a static arena (about 3.5 MB for 8,192 elements) and multiple instances. Limits: it does not support rendering instances from several threads, hover uses boxes from the previous frame and duplicate IDs cause errors — [nicbarker/clay](https://github.com/nicbarker/clay). Renderers include SDL2, SDL3, raylib, sokol, web and win32_gdi. An SDL_GPU renderer is not confirmed in the list — [clay/renderers](https://github.com/nicbarker/clay/tree/main/renderers)
- RmlUi: C++17, MIT, depends on FreeType (a replaceable font engine). RML/RCSS, data bindings (MVC), animations, transforms, flexbox, media queries, decorators, **localization, templates, spatial navigation for controllers** and a Lua plugin. Backends OpenGL 2/3, Vulkan, **SDL GPU (without filters, clip masks and shaders)** and DirectX 11/12. The documentation does not mention a C API — [mikke89/RmlUi](https://github.com/mikke89/RmlUi)

**Text**
- SDL_ttf 3.0 depends on FreeType, **HarfBuzz**, PlutoSVG and PlutoVG and itself has the zlib license — [libsdl-org/SDL_ttf](https://github.com/libsdl-org/SDL_ttf). `TTF_CreateGPUTextEngine(SDL_GPUDevice*)` creates a text engine for drawing through SDL GPU (since SDL_ttf 3.0.0, call it on the thread that created the device) and the draw data is returned by `TTF_GetGPUTextDrawData` — [SDL3_ttf wiki](https://wiki.libsdl.org/SDL3_ttf/TTF_CreateGPUTextEngine)
- kb_text_shape: a single header, zlib. It supports Unicode segmentation (direction, line, script, word, grapheme, compared to ICU), "Harfbuzz-like" OpenType shaping (Arabic, Hindi, Khmer and others) and a font coverage check. It **does not rasterize** and does not do paragraph layout, the result is one endless line — [JimmyLefevre/kb](https://github.com/JimmyLefevre/kb)

**Agent-verifiable UI (precedents)**
- Roblox MCP can aim `user_keyboard_input` and `user_mouse_input` at a specific UI instance — [Roblox docs](https://create.roblox.com/docs/en-us/studio/mcp.md). Epic toolsets can do "inspecting Slate widgets" — [Epic docs](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-mcp-in-unreal-editor). ImGui Test Engine addresses widgets by path — [imgui_test_engine](https://github.com/ocornut/imgui_test_engine)

### Inferences
- **(a) Studio = Dear ImGui.** It has docking, tables, color pickers and plotting ready, an official SDL_GPU backend exists and dear_bindings provides a C API. A big advantage is that ImGui code is very abundant in LLM training data, so Claude writes it reliably (a judgment, not measured). Our own IMGUI à la Machinery would mean months of work with no visual benefit. microui is too small for a studio with docking and tables, but it is suitable as an emergency overlay UI in `wz_run` without C++. Test Engine is fine license-wise for an individual or a small company. Its API is C++, so it would run in the adapter, and for MCP `ui_tree` over ImGui IDs is enough.
- **(b) Game = Clay + our own `eng_ui`.** A HUD in the style of GTA III and WoW (frames from 9-slice textures, minimap, action icons, nameplates above characters) needs stylable textured elements, animations and gamepad control. ImGui does not give that. Clay gives layout in C without allocations and render commands that we can draw with our own SDL_GPU pass. Texture and palette styles come from the style bible, so the UI is generated by code like the rest of the graphics (D8). On top of Clay we add: focus and gamepad navigation (a neighbor graph from boxes), tables of localization strings with IDs, world-anchored elements (projection of a 3D point, clipping), DPI and safe area and a **`ui_tree` dump for MCP** (ID, box, text, focus, visibility) as the UI equivalent of the state digest.
- **When RmlUi:** if the game gets a lot of menus with forms, an inventory and dialogs and the owner wants markup similar to HTML and CSS. AI generates it well and a human can read it. The price is a C++ API behind an adapter, FreeType and an SDL GPU backend without clip masks. Defer the decision to M5 and build the HUD in Clay first.
- **Text:** SDL_ttf 3 is the shortest path (shaping through HarfBuzz, a GPU text engine, the same ecosystem as SDL3). The studio uses the ImGui font atlas. For game UI, where crisp titles at any scale are needed, consider an MSDF atlas (not verified). kb_text_shape is an alternative without FreeType and HarfBuzz (zlib, one header), but rasterization must be supplied by someone else.
- **UI determinism:** the Clay layout is a pure function of its inputs, so a headless HUD frame to PNG with a golden image works the same as for assets.

### Gaps
- Because search ran out, I did not verify Nuklear, Noesis, msdf-atlas-gen or stb_truetype, so there are no facts here about their licenses and features.
- I do not know whether a ready Clay renderer for SDL_GPU exists. An `SDL3` directory exists, but I did not read it.
- I did not verify the performance of the SDL_ttf GPU text engine (atlas size, SDF) or BiDi support.

---

## 4. The project system: structure, templates, engine version pinning, how settings enter the engine, context for AI

### Takeaway
Take from Godot **a single root manifest and a filesystem "as is"** without an asset database, from Unreal **the separation of `Config/`, which overrides engine defaults, and the deletable `Saved/` and `Intermediate/`**, and from Fyrox and Bevy (Jackdaw) **a template and a "project creator"**, on which Play depends. A Wallhammer Zero project is a folder with `wz.project` (manifest: the `eng_api` version, world shape D15, game DLL, gen packs, default CVars), `style/` (the style bible and the D16 scale table, which enter the Merkle key), `content/`, `game/`, `review/`, `CLAUDE.md` and `.mcp.json`. Context for AI is supplied by three layers: `CLAUDE.md` (rules), MCP resources (live data: style, scale, schemas, review) and server instructions (how to use the tools, up to 4,096 characters).

### Cited Findings
- Godot: `project.godot` in the project root. "Godot is scene-based in nature, and uses the filesystem as-is, without metadata or an asset database." It recommends snake_case because of case sensitivity when exporting to Linux, third parties in `addons/` and an empty `.gdignore` that excludes a folder from import — [Godot docs: Project organization](https://docs.godotengine.org/en/stable/tutorials/best_practices/project_organization.html)
- Unreal: `Config/` (default game settings, "override the engine's Config"), `Content/`, `Source/` (a module per directory), `Plugins/` (own sources, binaries and `.uplugin`, may contain assets), `Saved/` and `Intermediate/` ("can be deleted and rebuilt") and `DerivedDataCache/`. `Default.uprojectdirs` looks for projects in subdirectories — [Epic docs: Directory structure](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-directory-structure)
- Fyrox: Play mode works only for projects from `fyrox-template` or with a similar structure — [Fyrox book](https://fyrox-book.github.io/beginning/editor_overview.html). Bevy Jackdaw contains "a project manager / creator" — [Bevy's Sixth Birthday](https://bevy.org/news/bevys-sixth-birthday/). Godot has a Project Manager (`project_manager.cpp`) as part of the editor — [Godot editor dev](https://docs.godotengine.org/en/latest/engine_details/editor/introduction_to_editor_development.html)
- API versioning: The Machinery and the `eng_api` design (`uint32_t version`) version the API structs of function pointers. Hot reload is broken by a change of data layout — [Machinery: DLL hot reloading](https://ruby0x1.github.io/machinery_blog_archive/post/dll-hot-reloading-in-theory-and-practice/index.html)
- Context for AI: Unreal generates `.mcp.json` into the project root (`GenerateClientConfig`) — [Epic docs](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-mcp-in-unreal-editor). Claude Code reads the project `.mcp.json` (committed, subject to approval), passes `CLAUDE_PROJECT_DIR` to a stdio server and resources can be mentioned through `@` — [Claude Code docs: MCP](https://code.claude.com/docs/en/mcp). Roblox has a `skill` tool that returns best practices, and an `http_get` limited to documentation — [Roblox docs](https://create.roblox.com/docs/en-us/studio/mcp.md)
- The 2026-07-28 spec lists Roots as deprecated and recommends "pass directories or files via tool parameters, resource URIs, or server configuration instead" — [MCP changelog 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/changelog)

### Inferences
**Proposed structure** (a monorepo in the early phase, D6 self-sufficiency):
```
wallhammerzero/
├─ engine/                     # src/, tools/, external/, tests/ (from the architecture)
│  └─ templates/{city,planet,empty}/   # project templates for `wz new`
└─ projects/<game>/
   ├─ wz.project               # manifest (the same KV format as recipes)
   ├─ CLAUDE.md                # rules for AI in this game: links to style/scale, forbidden things, workflow
   ├─ .mcp.json                # { "wz": { "command": "../../engine/build/bin/wzmcp", "args": ["--project","."] } }
   ├─ style/style.cfg          # the style bible as code (palettes, ramps, bevel, baked light)
   ├─ style/scale.cfg          # the D16 scale table + stylization deviations
   ├─ style/references/        # the owner's references (images + a description of what is taken from them)
   ├─ content/                 # recipes: materials/, archetypes/, world/{stamps,masks,overrides}
   ├─ source_images/           # D14 AI images + .provenance
   ├─ gen/                     # optional game-specific generators (gen-pack DLL)
   ├─ game/                    # the game DLL (sees only engine_api.h)
   ├─ ui/                      # HUD and menus (C + data layouts)
   ├─ config/                  # default CVars (override engine defaults, like Unreal Config/)
   ├─ review/                  # approvals, owner's notes, A/B decisions (in git)
   ├─ tests/golden/            # hashes and images for this game
   ├─ cache/  (gitignore)      # Merkle cache
   └─ .wz/    (gitignore)      # session.json (socket, token, PID), logs, crash dumps – deletable like Saved/
```
- **`wz.project`** contains: `name`, `id`, `engine_api = 3` (the major version of `eng_api` and of the blob format; the engine rejects an incompatible project with a clear error), `engine_rev` (a git SHA, for reproducibility of golden hashes), `world_shape = flat_grid | cube_sphere` (the D15 port), `cell_size`, `game_module = game`, `gen_packs = [...]`, `startup_world`, `default_camera`, `platforms`.
- **How settings flow into the engine:** `runtime_init(project)` loads the manifest → attaches the VFS roots `wz://engine/` and `wz://project/` → loads `style.cfg` and `scale.cfg` into constant blocks of `gen_core`. Their hashes are in the input of the Merkle key, so a change of scale invalidates exactly what depends on it. → registers the gen packs in `gen_provider` → loads the game DLL → applies the `config/` CVars → registers the tools (engine, editor, game).
- **Pinning the version:** in a monorepo `engine_api` and CI that builds and tests all projects (the golden hashes of every game) on every engine change are enough. This is the only protection of a general engine (D15) against being bent for one game. Once projects are in separate repos, move to the engine as a git submodule with a fixed SHA. A custom launcher with a version map is not needed.
- **A second project right away:** create the `city` and `planet` templates (D15) already in M3 or M4, even if empty. They test that nothing from the city leaked into the engine, and they verify `wz new`.
- **Context for AI in three layers:** (1) `CLAUDE.md` in the project, short: links, rules, how to run review. (2) The MCP resources `wz://project/style`, `wz://project/scale`, `wz://gen/{id}/schema`, `wz://review/open` are live data that changes with the project. Claude reads them with a tool and the owner can mention them through `@`. (3) Server instructions (up to 4,096 characters) describe the order of work: `wz_status` first, images through a subagent, mutations through `recipe_patch`. The engine-wide `CLAUDE.md` in `engine/` describes the layers and dependency rules.

### Gaps
- The Epic page does not describe the content of `.uproject` (EngineAssociation, the list of modules and plugins). The comparison of version pinning with Unreal therefore remains unverified.
- I did not read the project structure of Bevy and Cargo or the internal project format of Jackdaw.

---

## 5. Proposal: modules, placement into milestones and the daily workflow of the owner and Claude

### Takeaway
Add four modules (`eng_project`, `eng_tools` + `eng_mcp`, `eng_ui` + `eng_text`, `eng_editor`) and three binaries (`wz_studio`, `wzmcp`, `wz new` in `gencli`). **MCP does not belong with the editor from M5, but in M0–M1** as a thin layer over the debug server from D17. Claude is the main developer and is blind without eyes. The minimal studio (viewport, console, CVars) comes in M2. **The main studio for the art director (parameters, contact sheets, A/B, approval, notes) is the goal of M3**, together with "assets as programs". Game UI (Clay) comes in M5 with the game.

### Cited Findings
- The current plan puts "tools (editor, inspectors)" in parallel "from M5" — [open-world-engine-architecture.md, local](../../open-world-engine-architecture.md) — and the editor with parameter panels (cimgui) "in parallel from M3". M2 in it already contains "headless offscreen render to PNG" and M3 `gencli`, review sheets, `genlint`, golden tests and hot reload of `gen_*` DLLs — [procedural-graphics.md, local](../../procedural-graphics.md)
- D17 requires debug tools, headless mode and logging "in the first milestones, not at the end". D18 builds MCP "on the debug server from D17" — `wallhammerzero/docs/DECISIONS.md`
- Epic, Roblox and Unity all integrate MCP directly into the editor and Unreal generates the client configuration into the project — [Epic docs](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-mcp-in-unreal-editor), [Roblox docs](https://create.roblox.com/docs/en-us/studio/mcp.md), [Unity docs](https://docs.unity3d.com/Packages/com.unity.ai.assistant@2.19/manual/integration/unity-mcp-overview.html)
- Godot enforces one-way dependencies, where the editor is on top and nothing below it depends on it — [Godot editor dev](https://docs.godotengine.org/en/latest/engine_details/editor/introduction_to_editor_development.html)

### Inferences
**Modules (an addition to the 13 targets):**

| Target | Type | May depend on | Role |
|---|---|---|---|
| `eng_project` | STATIC | core, asset | parsing `wz.project`, VFS roots, API version, loading style and scale (passed by runtime to gen_core) |
| `eng_tools` | STATIC | core, yyjson | the tool registry (`eng_tool_desc`), JSON Schema, a queue of calls to the main thread, tasks, cursors. Knows nothing about the world. Tools are registered by runtime, the editor and the game |
| `eng_mcp` | STATIC | tools | JSON-RPC 2.0, the MCP lifecycle (2025-11-25 + `server/discover`), stdio frames, optionally Streamable HTTP on loopback. Used by `wzmcp` and the studio |
| `eng_debugsrv` | STATIC | tools, platform | (D17, second research) socket/pipe, token, sends tool calls. The studio and `wz_run` have it, `wzmcp` is its client |
| `eng_text` | STATIC | core, SDL_ttf (PRIVATE) | fonts, shaping, atlas, measuring for Clay |
| `eng_ui` | STATIC | text, render | Clay layout, styles from the style bible, focus and gamepad, localization, a render pass, `ui_tree` |
| `eng_editor` | STATIC (studio only) | runtime, ui?, imgui adapter | the recipe document, undo (author owner/ai), panels, review, notes, viewport tools. **Nothing below it depends on it** |
| `imgui_c` | STATIC (C++ inside) | SDL3 | dcimgui + the sdl3/sdlgpu3 backends behind a C header (D4) |
| `wz_run` | EXE | runtime, project, debugsrv, ui | the game, headless mode |
| `wz_studio` | EXE | `wz_run` libraries + editor + mcp + imgui_c | the studio, Play starts `wz_run` as a subprocess |
| `wzmcp` | EXE | mcp, platform | a stdio launcher: finds or starts the studio or headless and forwards |
| `gencli` | EXE | gen_*, gpu, render, tools | additionally `gencli serve` (a headless MCP backend) and `gencli new <template>` |

**Placement into milestones (per the 9 milestones of the procedural research):**
- **M0 Skeleton:** `eng_project` (manifest, `projects/sandbox/`), `eng_tools` + `eng_mcp` + `wzmcp` with 3 tools: `wz_status`, `golden_check` (a noise hash on 3 OSes) and `log_tail`. `.mcp.json` and `CLAUDE.md` in the sandbox project. *Done when* Claude Code starts a headless engine through `wzmcp` and reads the result of the golden test as structured JSON.
- **M1 Core:** JSON lines log (D17), `cvar_get`/`cvar_set`, `profile_snapshot`, `console_exec`, a queue of calls to the main thread and tasks (tasks + progress) for long runs. `project_build` returns structured compiler errors.
- **M2 RHI and stylized lighting:** `camera_set`, `screenshot` (headless and from a window, debug views, mannequin), `time_control`. **Studio v0**: `wz_studio` with ImGui docking, a viewport, console, CVars, log and profiler. It is basically the inspector from D17 in a separate window. In it, in M2, the owner approves the stylized lighting next to references (which M2 already requires).
- **M3 Assets as programs = the studio MVP for the art director:** a recipe document and undo with an author, parameter panels generated from schemas, a recipe browser, a contact sheet, A/B, Approve/Reject → `review/` and golden, notes in the viewport, a lint panel. MCP: `gen_*`, `recipe_*`, `lint_run`, `golden_accept` (requires the owner), `review_*` and `project_reload` for gen DLLs and shaders. Resources `wz://project/style`, `wz://project/scale`, `wz://gen/{id}/schema`. Project templates and `gencli new`.
- **M4 Generated world:** `world_query`, `world_inspect`, `world_pick`, a map panel of cells and layers (roads, parcels, IDs, generation times), the second project `planet` as a test of D15.
- **M5 Game and vehicles:** Play as a subprocess, `play_start`/`play_stop`, `game_state` registered by the game DLL, an input timeline in `time_control`, replay files. `eng_ui` and Clay with HUD v0 (speedometer, minimap), `ui_tree`, golden HUD images.
- **M6–M8:** localization, gamepad navigation and menus (possibly RmlUi, if Clay is not enough), gizmos for manual overrides (stamps, masks), multiple studio windows and Streamable HTTP for other clients.

**Daily workflow (the goal after M3):**
1. The owner opens the studio on a project (`wz_studio projects/city`). The studio writes `.wz/session.json`.
2. In Claude Code in the project folder he writes, e.g., "the roofs of the tenement blocks in the Docks district are too flat, more like WoW Stormwind, see reference X" and pins a note in the viewport.
3. Claude calls `wz_status` (sees the open note), `review_list` (position, camera, screenshot path) and `@wz://project/style`. It edits `gen_arch/roof.c` or the recipe, then `project_build` and `project_reload`. `gen_compare` creates an A/B sheet of 16 seeds next to the reference. Visual judgment is done by a subagent that returns a text verdict. Claude runs `lint_run` and `golden_check`.
4. Claude calls `review_request` with the A/B sheet. A card pops up in the studio. The owner compares, perhaps moves two sliders (the change is written into the recipe with the author owner) and clicks Approve. The task completes, the golden is updated and Claude commits the diff of the recipe, code and `review/`.
5. At any time the owner opens the undo history and sees steps such as "[ai] recipe_patch roof.pitch 18→32" and can revert them. Git has the same history.
6. When the owner is not at the studio (night or CI), the same tools run headless through `gencli serve`. The results wait in `review/` as unapproved sheets.

**Main risks:**
- A swollen tool set (175–455 tools in community servers) worsens tool selection and context consumption. Hence 30 tools, and new ones only on real need.
- Screenshots in the main context, the solution is a subagent.
- The MCP spec changes quickly (the stateless 2026-07-28 revision, Unity retreating to the CLI). Hence the transport layer should be thin and the logic in the tool registry, which the CLI can also call (`gencli tool <name> <json>`). If clients move from MCP to CLI, the transition then costs nothing.

### Gaps
- I did not measure or find in the literature effort estimates (a minimal MCP server in C, the studio MVP).
- How well Claude generates UI in Clay compared with ImGui or RML has not been measured by anyone. Claims about "familiarity in training data" are a judgment.
- Why Unity is moving from MCP to the CLI and whether it is a broader trend, I did not verify (search exhausted). This may affect how much to invest in MCP specifics as opposed to a general CLI over the same tool registry.
