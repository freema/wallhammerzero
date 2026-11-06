# Proposed decisions for confirmation (2026-11-06)

All open decisions from the analysis in one place, each with a recommendation. Sources: six research reports, [REVIEW.md](REVIEW.md) and the new requirement for strategy games (D23).

**Status: confirmed 2026-11-06.** The owner accepted all 48 proposals at once, except proposal 12 (Xcode), which he rejected. The valid wording is in [DECISIONS.md](DECISIONS.md) as D24–D71 (decision number = proposal number + 23). This file stays as a record of options and reasons. The milestone numbers in it match report 5, and the valid numbering is in [ROADMAP.md](ROADMAP.md).

## What the strategy requirement (D23) changes

Besides a GTA-style city and a Light No Fire-style planet, the engine must also handle a city builder (Cities: Skylines) and a grand strategy game (Stellaris). The current design is not built for that in six points:

| What strategy games need | What the design has today | Addition |
|---|---|---|
| The simulation runs in the whole world, also outside the camera | simulation only in cells around the player (state ACTIVE) | separate "what is simulated" from "what is drawn" (decision 23) |
| Hundreds of thousands of simulated entities (residents, cars, populations) | actors in hundreds to low thousands, with physics | a third class of objects: mass entities (21) |
| The player builds the world | the world comes from a seed, the player only modifies it | the player's action is a generator input, the cell is regenerated at run time (16, 17) |
| Top-down camera, mouse selection, building tools | third-person and behind-the-car camera | strategy camera, selection and placement in the engine (26) |
| Pause and time acceleration | fixed 60 Hz step in real time | simulation clock with speed and slow ticks (24) |
| Large UI with tables, lists, tooltips | HUD and simple menus | a full widget layer (34) |

Two things in the existing design, on the contrary, fit strategy games exactly: a server-shaped simulation with player commands (`player_cmd`) and "asset = program + parameters + seed" (the player draws a road, the generator makes a mesh from it).

## A. Before M0 (cannot start without them)

| # | Decision | Options | Recommendation | Why |
|---|---|---|---|---|
| 1 | Language (D4) | C17 / "C-like C++20" | **C17** with sanitizers (ASan, UBSan, TSan), `-Werror` and fuzzing of loaders. C++ only inside library adapters. | The whole analysis stands on it. The memory errors that AI makes in C are caught by sanitizers in CI. |
| 2 | Graphics layer (D5) | SDL_GPU as the only backend / SDL_GPU + a planned native Metal / another layer | **SDL3 + SDL_GPU behind our own RHI** built from three portable concepts. A native Metal 3 backend only if the draw cost measurement in M1 forces it. | No other layer callable from C is better at everything. The RHI keeps a way out open. |
| 3 | Compiler | MSVC on Windows / clang everywhere | **clang on all three OS** (clang-cl on Windows). | MSVC has C11 atomics only experimentally. One compiler family reduces float differences. |
| 4 | Renderer type | deferred (G-buffer after GTA V) / forward+ | **Forward+ with clustered lights**, without a mandatory depth prepass. Confirm with measurement 1 in M2. | Apple GPUs are built for forward, MSAA works, transparent effects are lit like the rest, and stylized ramp lighting is naturally forward. It changes reports 1 and 2. |
| 5 | Determinism | everything bit-identical on 3 OS / two tiers | **Two tiers.** Generators and simulation logic (integers, fixed-point, `detmath`) bit-identical on 3 OS. Physics and animation identical only on the same platform and build. | Deterministic Jolt across OS is unverified and expensive. Strategy game logic (economy, population) can be written with integers, so it is identical everywhere and ready for the network. |
| 6 | Plan | accept M0–M9 from report 5 / modify | **Accept**, but write a new `ROADMAP.md`: work in reports 4 and 6, the strategy test scene, and split M0, M3 and M4 into phases. | Today four roadmaps exist. Milestones stay machine-verifiable (`milestones/*.json`). |
| 7 | Tools for AI (D18) | MCP only / CLI only / one registry, two transports | **One tool registry, MCP and CLI** on top of it. No "run arbitrary code" tool. | If clients move away from MCP, the switch costs nothing. |
| 8 | The "up" axis | Y-up / Z-up | **Z up, right-handed system, X east, Y north, meters.** A lint forbids a hard-coded "up". | The map is then the XY plane, which fits cells, roads and the strategy map. GTA and Unreal do the same. |
| 9 | Repo structure | monorepo / separate repos | **Monorepo** `engine/` + `projects/<game>/`, CI tests all projects. | The main safeguard that the engine stays general-purpose (D15, D23). |
| 10 | Hosting and CI | — | **Private repo `freema/wallhammerzero`, new branch `main`.** Linux and Windows in hosted CI on every push. macOS tests locally with one script before merge, hosted macOS only as a nightly run. | Hosted macOS runners are expensive and have no usable GPU. The Mac is the development machine, so tests run on it anyway. |
| 11 | Review rhythm | continuous / grouped gates | **Grouped gates** with an hour budget in the milestone. Measure throughput from M2. | The owner's attention is the scarcest resource of the project. |
| 12 | Exception to D6 (**rejected, see D35**) | no exceptions / allow Xcode | ~~Allow Xcode~~ as the only system-wide install. Tracy and RenderDoc in `.tools/`. | Without Xcode, GPU debugging and measuring on Metal is impossible, and SDL_GPU has no timing queries. |
| 13 | End of the analysis (D11) | — | The analysis ends when decisions 1–14 are confirmed, `ROADMAP.md` and `CONVENTIONS.md` exist, and Linear has tasks for M0 and M1. | D11 has no end condition today. The remaining research (48) does not affect M0 and M1. |
| 14 | What the engine does not do | no list / a short list | **A short list:** mobile and consoles, photorealism, VR, an editor for third parties, network code (for now). | It helps close milestones. It does not limit genres. |

## B. World and simulation

| # | Decision | Options | Recommendation | Why |
|---|---|---|---|---|
| 15 | World type | fixed from a seed / new every time / infinite / player-built | **The project chooses:** a world from a seed with manual overrides, a new world for each game, or a player-built world. An infinite world is not a goal. | A flat 65 km world or a finite planet is enough for all four sample games. |
| 16 | World mutability | immutable / player edits / full destruction | **Fully editable by player commands.** The action is a generator input (road, zone, building) and the affected cell is regenerated at run time. Voxel digging only as an optional milestone. | Strategy games require it. The cell state machine with epochs is enough for it. |
| 17 | Persistence | store generated output / changes only | **Changes on top of deterministic regeneration**, stable IDs from the anchor, a versioned format. Plus the full simulation state from the type registry. | Small saves, generator improvements carry through. Strategy games also need to store the economy and entity state. |
| 18 | Network | never / shape only / multiplayer | **Shape only:** player commands, simulation as a server. No network code. | Thanks to decision 5, the path to lockstep multiplayer for strategy games stays open. |
| 19 | Physics | Jolt / other | **Jolt through joltc.** | It provides active ragdoll and vehicles from a pure C API. Two reports recommend it. |
| 20 | Reflection | none / type registry at the boundary | **Type registry** (name, version, fields) for saves, inspector, MCP schemas. Introduce it already in M0–M1. | Tools in M0 need schemas, and strategy games have large saves. |
| 21 | Entity model | fat actors / components / ECS | **Three classes:** static instances per cell, actors with components registered by the game (thousands, with physics), mass entities (hundreds of thousands, dense tables, no physics). No generic ECS in the engine; the game DLL may bring its own. | Mass entities are new because of strategy games. Handles with a 20-bit index are not enough for them, so they get their own 64-bit IDs. |
| 22 | Scripting and game data | Lua right away / no scripting | **No scripting language.** A stable C ABI and game data (buildings, technologies, events) as text tables through the type registry. | AI writes the code and the game DLL has hot reload, so a script brings no speed. Tables also cover Stellaris-style data-driven content. |
| 23 | Simulation scope | only around the player / the whole world | **Two layers.** Global simulation data (road graph, building and entity tables) is always in memory and ticks everywhere. Cells are streamed only for drawing and physics. | In GTA it is enough to simulate the player's surroundings, in a strategy game the whole city runs all the time. |
| 24 | Simulation time | fixed 60 Hz / clock with speed | **Simulation clock:** pause and speed multiples, tick groups with different frequencies (physics 60 Hz, economy slow), work spread across frames. | Strategy games are played with pause and acceleration. Drawing stays smooth regardless of speed. |
| 25 | Number of worlds | one global / multiple instances | **A world is an object, not a global variable.** Several can exist at once. | Stellaris has a galaxy map and a system view. Changing this later is expensive. |
| 26 | Strategy controls | only in the game / basics in the engine | **Basics in the engine:** strategy camera (pan, rotate, zoom from street to whole map), selection by mouse and box, placement with snapping. Game rules in the game DLL. | The studio needs the same tools (selecting and inspecting the world), so they are written once. |
| 27 | Strategy test scene | without it / add | **Add scene C "strategy cutout"** as its own milestone after the planet seed: top-down camera, 100,000 entities on a road graph, a player-drawn road, time acceleration, a panel with a table. | Generality is proved not by a declaration but by a scene in CI, as with the city and the planet. |
| 28 | Order of M7 and M8 | city first / characters first | **City content first.** Reconsider after gate M4. | Both GTA and a city builder need the city, only the first needs characters. |

## C. Look and content

| # | Decision | Options | Recommendation | Why |
|---|---|---|---|---|
| 29 | Art style (D10) | — | **Stylized painted 3D:** textures with baked light in the WoW style, ramp lighting with tinted shadow, one global palette and LUT, fog and aerial perspective, city density like GTA III. Outlines off, only as an optional parameter. Confirm on a scene in M2 next to the references. | It is a style in which generators compete with silhouette and color, not with detail. |
| 30 | Scale (D16) | proposed profile / own | **The proposed profile as a start:** character 1.80 m, openings ×1.20, floors ×1.10, lanes ×1.15, distances ×0.5, module 0.5 m. Freeze in M2 next to the references. Each project has its own table. | The numbers are a proposal, not a measurement from GTA III. A strategy game will have a different profile than a street-level city. |
| 31 | Resolution | native / lower + upscale | **Internally 1080p, own upscale, UI native.** Confirm with measurements 1 and 6. | Native Retina on the M4 Pro will not give 60 fps by estimate. |
| 32 | Extension of D14 | unchanged / extend | **Extend:** a whole map set may be an AI source, provenance with license and C2PA, a report for Steam. | Height derived from brightness is wrong. Steam requires disclosure of AI content. |
| 33 | Second judge | Claude only / a model from another vendor | **Allow** a cheap model from another vendor, mandatory only for risky categories (characters, cars, painted textures). | A model favors its own work. It means sending renders to another service. |
| 34 | UI | Clay / RmlUi / own | **Studio: Dear ImGui. Game: own `eng_ui`** on top of Clay and SDL_ttf with widgets (tables, lists, tooltips, windows), data binding and a UI description in text files. Evaluate RmlUi as a fallback. | Strategy games are half UI. Clay alone is only layout, with no widgets. |

## D. Audio and effects

| # | Decision | Recommendation | Why |
|---|---|---|---|
| 35 | AI audio (A1) | **Only effects and ambience**, with provenance as in D14. No music. | Footsteps, glass and crowds are beyond what code can do. The legal risk is in music. |
| 36 | Model for sounds (A2) | **ElevenLabs** with a pinned model version. Read the terms before first use. | Higher quality and no heavy local stack. The terms are not verified from the primary source. |
| 37 | Radio music (A3) | **Postpone.** Build the engine independent of the music source. | The lawsuits around AI music are open. |
| 38 | Planet and strategy music (A4) | **Fragments from code** composed by place and situation, the owner curates. | Generative ambient is within reach of code. |
| 39 | Sound style (A5) | **A stylized sound palette** matched to the image. | It fits the style from decision 29 and depends less on AI samples. |
| 40 | Spatial audio (A6) | **Stylized occlusion and reverb zones.** Steam Audio later behind a port. | Steam Audio does not fit streamed cells. |
| 41 | Loudness (A7) | **−23 LUFS**, peaks up to −1 dBTP, plus a louder profile for laptop speakers. | More dynamics, the laptop is handled by a profile. |
| 42 | Audio device (A8) | **SDL3 device + miniaudio as the mixer.** | It keeps D5 and audio can be tested without a sound card. |
| 43 | Effect rules (V1) | **Adopt Riot's rules as lints**, approve the numbers in the style bible. | Brightness and coverage caps keep things readable. |
| 44 | AI images for effects (V2) | **Code by default**, allow a small AI sheet of brush strokes under D14. | A painted look is done worse with code. |
| 45 | Weather scope (V3) | **Rain, fog and lightning with the city. Snow, sand and wind with the planet.** | Each phenomenon is an extra module and budget. |

## E. Organization

| # | Decision | Recommendation | Why |
|---|---|---|---|
| 46 | "Projectiles" in D18 | **Projects yes. Projectiles belong in the game DLL**, the engine provides physics queries and effects. | The engine stays general-purpose. |
| 47 | Committing the documentation | **Commit right away** to the private repo. | The analysis is on one disk only. |
| 48 | More research | **Four topics in parallel with M0 and M1:** (1) traffic, pedestrians and mass entity simulation for GTA and a city builder, (2) driving physics, (3) light, sky and time of day, (4) strategy games: data-rich UI and data-driven content. | M0 and M1 do not depend on them, later milestones do. |
