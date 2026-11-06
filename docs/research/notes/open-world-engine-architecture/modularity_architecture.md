# Engine-level modularity and architecture for a C17 3D open-world engine (SDL3 + SDL_GPU)

Scope note: research done 2026-11-05. Primary sources fetched in full were the Our Machinery blog (via the ruby0x1 GitHub mirror of the archived blog, because web.archive.org could not be fetched), the Bitsquid blog, Godot docs, Unreal docs, Cockburn's original hexagonal-architecture article, floooh's (sokol author) blog and sokol README, Bevy cheat book, and Handmade Network forums. Gregory's layer stack is only available here through a university course extract that reproduces his figure. Facts not verified in this session are marked "(unverified)" and kept out of the Cited Findings.

## 1. Does hexagonal architecture / ports & adapters / clean architecture fit a game engine?

### Takeaway
Nobody among the engine authors researched here uses the term "hexagonal", and I found no example of it applied to a game engine. Practitioner comments call it overkill for games. But its core idea is already standard in engines: the core does not know which device or technology is on the other side of a small interface. Engines just call these interfaces a platform layer, RHI, "servers", or APIs registered by name. So use the idea at a few coarse seams (platform/OS, GPU, audio, file/IO, physics, maybe networking). Do not apply clean-architecture layering, with its mappers, DTOs and per-use-case ports, to the hot simulation core.

### Cited Findings
- Cockburn's original intent statement: "Allow an application to equally be driven by users, programs, automated test or batch scripts, and to be developed and tested in isolation from its eventual run-time devices and databases." — [Cockburn, Hexagonal Architecture (HaT Technical Report 2005.02)](https://alistair.cockburn.us/hexagonal-architecture/)
- Mechanism: "As events arrive from the outside world at a port, a technology-specific adapter converts it into a usable procedure call or message and passes it to the application. The application is blissfully ignorant of the nature of the input device." — [Cockburn](https://alistair.cockburn.us/hexagonal-architecture/)
- Cockburn himself prefers few ports: "My selection tends to favor a small number, two, three or four ports"; "It doesn't appear that there is any particular damage in choosing the 'wrong' number of ports." — [Cockburn](https://alistair.cockburn.us/hexagonal-architecture/)
- A web search for "hexagonal architecture game engine ports adapters" returned only general articles and a toy Conway's Game of Life repo, with no engine. — [serfer2/game-of-life-ports-and-adapters](https://github.com/serfer2/game-of-life-ports-and-adapters)
- Practitioner sentiment is mostly skeptical. A game-dev blog argues that "in game development, abstraction can often be taken too far, leading to unnecessary layers of complexity" — [Wayline: Breaking rules / clean code hurts game dev](https://www.wayline.io/blog/breaking-rules-clean-code-hurts-game-development). A developer who built a game with clean architecture recommends making "clean" a little "dirty" by skipping excessive mappers and abstractions — [Medium: How "clean" should your architecture be?](https://medium.com/@yankalbaska/how-clean-should-your-architecture-be-b2157eeea737). An Unreal forum commenter questioned "the relevance of the hexagonal architecture applied as it is" — [Unreal forums: Good and best practices in UE (Architecture)](https://forums.unrealengine.com/t/good-and-best-practices-in-ue-architecture/1642211/15)
- Counterpoint: in a Godot C# thread, a commenter says the layered architecture "provides a happy path for building out full game-state serialization." — [r/GodotCSharp thread (mirror)](https://redlib.hbubli.cc/r/GodotCSharp/comments/1hsonqk/godot_dev_and_enterprise_c_patterns/m5cbuah/?context=3)
- The "port" idea is already built into engines (details in the sections below):
  - Godot has "Servers" with "opaque handles to the server implementation" (RIDs) — [Godot docs: Optimization using Servers](https://docs.godotengine.org/en/stable/tutorials/performance/using_servers.html)
  - Godot's RenderingDevice is an abstraction implemented by Vulkan, D3D12 and Metal drivers — [Godot docs: Internal rendering architecture](https://docs.godotengine.org/en/latest/engine_details/architecture/internal_rendering_architecture.html)
  - Gregory's "Platform Independence Layer" "shields upper layers from the knowledge of the underlying platform" — [course extract reproducing Gregory's figure](https://tams.informatik.uni-hamburg.de/lectures/2026ss/seminar/engine/doc/GameEngineCourseExtract.pdf)
  - The Machinery's API registry allows "multiple implementations of the same interface" — [Gray, Little Machines Working Together pt.1](https://gamedeveloper.com/programming/little-machines-working-together-part-1-)
- Cost of the abstraction, from an engine author: abstract interfaces "add a bit of verbosity and a performance cost (no inlined functions, for example)". The rule is to "pay the cost of abstraction where it makes sense (for high-level objects) and avoid it otherwise", and "anything that we have lots and lots of should be managed behind the APIs, in raw buffers." — [Gray, Little Machines Working Together pt.2](https://ruby0x1.github.io/machinery_blog_archive/post/little-machines-working-together-part-2/)
- Testability benefit, from the same author: "systems can be easily mocked for testing purposes." — [Gray pt.2](https://ruby0x1.github.io/machinery_blog_archive/post/little-machines-working-together-part-2/)

### Inferences
- In engine terms, Cockburn's "application core" is the simulation/world (entities, streaming logic, gameplay rules). His "secondary/driven ports" are GPU, audio device, filesystem/IO, clock, threads, network socket, and the physics middleware. His "primary/driving ports" are input devices, the editor/tools, a replay or test harness, and scripting. Cockburn's own advice (2–4 ports) matches the engine reality of a handful of coarse platform seams.
- The fit question comes down to granularity and frequency. A port called a few times per frame with batch data (submit a frame's draw list, poll the input state, issue N async file reads) has negligible indirection cost. A port called per entity, per vertex or per particle, such as a virtual `get_position()`, is where clean architecture hurts. The Machinery's "where there is one, there are many" rule ([Physical Design](https://ruby0x1.github.io/machinery_blog_archive/post/physical-design/)) is the engine-world answer to "hexagonal overhead".
- What doesn't carry over from enterprise clean architecture: DTO mapping layers, a port per use case, dependency-injection containers, and repository abstractions around in-memory data. Engines move data in bulk. Copying between a "domain" model and an "infrastructure" model every frame is exactly the cost the data-oriented authors warn against.
- With SDL3 + SDL_GPU, SDL itself already acts as the adapter for OS and graphics API (unverified in this session: SDL_GPU targets Vulkan, Metal and D3D12). Wrapping SDL_GPU in a second RHI port is mostly worthwhile for headless/null rendering in tests and to keep SDL types out of engine headers. It isn't needed for portability.

### Gaps
- I found no published case study or talk of an engine (AAA or indie) explicitly built as "hexagonal/ports & adapters", and no measurements of its overhead in a game context.
- I found no r/gamedev or HN thread that directly debates hexagonal architecture for engines (as opposed to gameplay code). The sentiment above comes from blogs and forum posts about game code in general.
- RAGE (Rockstar) internal modularity is not publicly documented in primary sources that I found. Nothing in these notes describes RAGE's internals.

## 2. Jason Gregory's runtime engine layer stack and dependency rules

### Takeaway
Gregory's "Runtime Engine Architecture" figure is a strict bottom-up stack: Hardware → Drivers → OS → 3rd-party SDKs → Platform Independence Layer → Core Systems → Resources/Assets Manager → a band of peer subsystems (low-level renderer, profiling/debugging, collision/physics, animation, HID, audio, online) → scene graph/culling, visual effects, front end → gameplay foundations → game-specific subsystems. Upper layers depend on lower ones, never the reverse.

### Cited Findings
- The layer list as reproduced from "J. Gregory, Game Engine Architecture 1st edition" in a university course (bottom to top): Hardware; Drivers; OS; 3rd Party SDKs; Platform Independence Layer; Core systems; Resources / Assets Manager. Above those come Low-Level Renderer, Profiling & Debugging, Collision & Physics, Human Interface Devices, Skeletal Animation, Online Multiplayer and Audio. Then Scene-graph / Culling Optimizations, Visual Effects and Front End. Then Gameplay Foundations (Game Flow, Scripting, Events, Game Objects, World Editor), and finally Game-Specific subsystems (Game-Specific Rendering, Player Mechanics, Game Camera, AI). — [Bouyer & Allard, Introduction to Game Programming & Game Engines (course extract, figure "Source: J. Gregory, Game Engine Architecture 1st edition")](https://tams.informatik.uni-hamburg.de/lectures/2026ss/seminar/engine/doc/GameEngineCourseExtract.pdf)
- Platform Independence Layer: "Wrap/replace common standard library functions, OS calls, and other foundational APIs"; "Shields upper layers from the knowledge of the underlying platform." — [same course extract](https://tams.informatik.uni-hamburg.de/lectures/2026ss/seminar/engine/doc/GameEngineCourseExtract.pdf)
- Core Systems: "Assertions, unit testing… Memory allocation, Custom data structures and algorithms, Math library, random number generator." — [same](https://tams.informatik.uni-hamburg.de/lectures/2026ss/seminar/engine/doc/GameEngineCourseExtract.pdf)
- Resources/Assets Manager: "Interfaces for accessing game assets and other input data — 3D model, texture, material, font, skeleton, collision, map…" — [same](https://tams.informatik.uni-hamburg.de/lectures/2026ss/seminar/engine/doc/GameEngineCourseExtract.pdf). Another lecture deck describes it as "a unified interface for accessing assets" — [search summary of UMD CMSC425 lecture 2](https://www.cs.umd.edu/class/spring2018/cmsc425/Lects/lect02-architecture.pdf) (the PDF itself returned 403)
- The 4th edition is now split into volumes (Volume I: Foundations and Core Engine Systems). — [Routledge](https://www.routledge.com/Game-Engine-Architecture-Volume-I-Foundations-and-Core-Engine-Systems/Gregory/p/book/9781032443089)
- On game objects, the same course notes the cross-cutting dependency problem: "Dependencies between the objects; Dependencies on various engine subsystems; Interdependencies between those engine subsystems themselves." — [course extract](https://tams.informatik.uni-hamburg.de/lectures/2026ss/seminar/engine/doc/GameEngineCourseExtract.pdf)

### Inferences
- Gregory's stack maps directly onto a C17 module/directory layout with a one-way include rule: `platform/` (wraps SDL3) ← `core/` (alloc, containers, math, log, jobs) ← `resource/` (asset DB, streaming IO) ← peer subsystems `gfx/`, `phys/`, `anim/`, `audio/`, `input/`, `net/` ← `scene/` (culling, world partition, streaming cells for open world) ← `gameplay/`. This is "layered architecture", not hexagonal. In practice, the Platform Independence Layer is the one hexagonal-style port that every engine has.
- Peer subsystems at the same level should not include each other. Bitsquid's "high level system shuffles data between them" rule (section 5) is how that is usually enforced.

### Gaps
- I could not access Gregory's own text. His exact dependency-rule wording and the 3rd/4th-edition figure changes (e.g. any new layers) are unverified. Also unverified: the book's chapter on subsystem start-up/shut-down, which (from memory) recommends explicit `StartUp()`/`ShutDown()` calls in a fixed order from `main` instead of relying on static constructors. Verify against the book.

## 3. Our Machinery / The Machinery: C plugin architecture

### Takeaway
The Machinery (Niklas Gray and Tobias Persson, ex-Bitsquid) is the closest primary-source model for a modular C engine. Its pieces:
- every interface is a C struct of function pointers;
- APIs are registered by string name in a central API registry;
- every plugin is a DLL with `load_xxx(reg, reload)` / `unload_xxx(reg, reload)`;
- header files may not include other headers;
- OS types are opaque byte blobs;
- objects are `{opaque inst*, fnptrs}`;
- APIs are bulk ("where there is one, there are many");
- in-place DLL hot reload, with plugin-controlled state transfer;
- later, versioned API structs for binary compatibility.

All of this applies directly to C17.

### Cited Findings
- Goal: "What we are building at Our Machinery is not so much a single monolithic thing as a collection of little things"; each component lives in its own DLL and is meant to be plugged in and out, with hot reloading as a stated goal. — [Gray, Little Machines Working Together pt.1 (May 2017)](https://gamedeveloper.com/programming/little-machines-working-together-part-1-)
- APIs are structs of function pointers because dynamic linking rules out static global functions. The struct groups related functions, lets one pointer pass the whole API, and acts like a namespace (example: `struct tm_piper_compression_i { compress; decompress; }`). Each API has a name string such as `#define TM_PIPER_COMPRESSION_API_NAME "tm_piper_compression_i"`. — [pt.1](https://gamedeveloper.com/programming/little-machines-working-together-part-1-)
- Registry: `tm_api_registry_i` with `add`, `remove`, `first(name)` and `next(prev)`. Multiple modules can implement the same API (e.g. all `tm_unit_test_i` implementations are iterated), and distinguishing between them must be built into the API itself (e.g. a `name()` function). — [pt.1](https://gamedeveloper.com/programming/little-machines-working-together-part-1-). The later shipped registry had `set, remove, get, get_optional, add_implementation, remove_implementation, implementations, add_listener, static_variable, log_missing_apis` — [tm-rs bindings of tm_api_registry_api (third-party)](https://docs.rs/tm-rs/latest/tm_rs/ffi/struct.tm_api_registry_api.html)
- Why C for interfaces: a de facto standard ABI (C++ would need a DLL per compiler, version and configuration), simplicity, a smaller design space, and the view that C++ "encourages tightly coupled object composition". Implementations may be C or C++; only the interfaces must be C. — [pt.1](https://gamedeveloper.com/programming/little-machines-working-together-part-1-)
- Objects as "C with classes":
  - `struct tm_allocator_i { struct tm_allocator_o *inst; void *(*realloc)(struct tm_allocator_o *inst, void *ptr, uint64_t size); };`, called as `allocator->realloc(allocator->inst, NULL, 1024*1024)`.
  - Objects are not registered in the registry. APIs expose create/destroy functions instead, e.g. `tm_heap_i { create_static_heap; destroy_static_heap; }`.
  - Gray: "they are more like what you would get if you consistently used the PIMPL idiom in C++."

  — [Gray, Little Machines Working Together pt.2 (Jun 2017)](https://ruby0x1.github.io/machinery_blog_archive/post/little-machines-working-together-part-2/)
- Per-object function pointers rather than shared vtables. Shared vtables are "essentially a memory optimization" that only matters with many objects, and "if you have lots and lots of things … the abstract PIMPL design doesn't make sense anyway … A particle should just be some data in a SIMD vector or on the GPU." — [pt.2](https://ruby0x1.github.io/machinery_blog_archive/post/little-machines-working-together-part-2/)
- Cross-module dependencies go only through forward declarations. For example, `struct tm_allocator_i;` is declared at the top of the compression header, and the allocator is passed as a parameter (`compress(struct tm_allocator_i *a, ...)`), so "our header doesn't need to include any other headers at all." — [pt.2](https://ruby0x1.github.io/machinery_blog_archive/post/little-machines-working-together-part-2/)
- Plugin = DLL exporting `void load_xxx(struct tm_api_registry_i *reg, bool reload); void unload_xxx(struct tm_api_registry_i *reg, bool reload);`. Unique names "allow us to link the plugins either statically or dynamically, depending on the kind of executable we are building". The loader uses `GetProcAddress()`/`dlsym()`. — [pt.2](https://ruby0x1.github.io/machinery_blog_archive/post/little-machines-working-together-part-2/)
- Hot reload protocol: "the manager first calls load_xxx() on the new DLL with the reload flag set and then it calls unload_xxx() on the old DLL with the reload flag set," which lets the plugin transfer state. Hot reload is opt-in per plugin. Users of an API can ask the registry to be notified when it is (re)loaded. Windows file locks on DLL/PDB need workarounds: copy the DLL to a random name, move the PDB as a pre-compile step, and clean up old copies at launch. — [pt.2](https://ruby0x1.github.io/machinery_blog_archive/post/little-machines-working-together-part-2/)
- In-practice hot reload: "Patching the APIs for a DLL reload is easy. All the APIs are stored in a global lookup table. To patch an API we just replace all the function pointers in the API with the function pointers from the new DLL." Objects that store their own function pointers must be tracked so they can be patched, which "is a bit painful". Gray considers moving to shared vtables for that reason. Listed obstacles to hot reload: complicated (C++) architectures, long build times, bad tooling (the VS debugger locking PDBs, including `vc141.pdb`), state transfer, and instability of rarely exercised reload paths. — [Gray, DLL Hot Reloading in Theory and Practice (Aug 2017)](https://ruby0x1.github.io/machinery_blog_archive/post/dll-hot-reloading-in-theory-and-practice/)
- Physical design rule: "Header files (.h) cannot include other header files (except for <inttypes.h> and <stdbool.h>)". The rule was chosen because it is "simple and clear enough to be machine verifiable" (pre-commit hook). Headers are "plain old C, C99 to be precise". — [Gray, Physical Design of The Machinery (Apr 2017)](https://ruby0x1.github.io/machinery_blog_archive/post/physical-design/)
- OS types as opaque bits: `struct tm_file_o {uint64_t opaque;};`, with the implementation `memcpy`ing the native `HANDLE` in and out. This keeps `<windows.h>` out of headers. — [Physical Design](https://ruby0x1.github.io/machinery_blog_archive/post/physical-design/)
- Bulk APIs instead of inline getters: `uint32_t get_positions(float **x, float **y, float **z);`. "This is a part of our data-oriented design philosophy: where there is one, there are many." Meatier functions make call overhead irrelevant and enable SIMD. — [Physical Design](https://ruby0x1.github.io/machinery_blog_archive/post/physical-design/)
- API versioning (2021): changing a function-pointer signature silently breaks old DLLs ("the function will just try to get the parameters from the stack, get some garbage values back and most likely crash horribly"). The goals are backward compatibility with older DLLs or, failing that, a graceful refusal to load. — [Gray, API Versioning (Sep 2021)](https://ruby0x1.github.io/machinery_blog_archive/post/api-versioning/)
- "The Truth" data model rationale: a structured data model lets features such as backward compatibility, undo and collaboration be implemented once "on the data model itself, rather than on the systems that use it." Games convert a structured editing format into a streamable runtime format in a data-compile step. — [Gray, The Story behind The Truth (Nov 2018)](https://ruby0x1.github.io/machinery_blog_archive/post/the-story-behind-the-truth-designing-a-data-model/)
- The renderer is itself a plugin. It is a graphics-API-agnostic library with a separate Vulkan backend plugin. — [A modern rendering architecture (search summary)](https://ruby0x1.github.io/machinery_blog_archive/post/a-modern-rendering-architecture)
- The full archived blog index (useful follow-ups: "minimalist-container-library-in-c", "virtual-memory-tricks", "fiber-based-job-system", "data-structures-part-1..3", "multi-threading-the-truth", "porting-the-machinery-to-linux", "one-button-source-code-builds") — [Machinery blog archive mirror](https://ruby0x1.github.io/machinery_blog_archive/)

### Inferences
- The Machinery is effectively "ports and adapters in C" done right for an engine. The API struct is the port, the implementing plugin is the adapter, and the registry is the composition root. It keeps every port coarse-grained and bulk-oriented, so it avoids the hexagonal overhead problem. Gray also reports mocking for tests as a side benefit.
- For a solo developer, the full registry plus string lookup is more machinery than needed on day one. A smaller version keeps the same benefits: per-module API structs, a compile-time "static registry" (a plain struct holding pointers to every API), and `load_xxx(reg, reload)` entry points so modules can later move into a hot-reloadable DLL. Gray explicitly notes that unique names allow static or dynamic linking from the same code.
- The no-header-includes rule is cheap to adopt and verify in C17 (a grep in CI). One conflict to plan for: C17 code wanting `static inline` math in headers (vec3 etc.) breaks the rule. The Machinery's answer was bulk APIs, plus .inl files only for templates. In C, a reasonable exception is one `math.inl`/`types.h` allowed to be included everywhere.

### Gaps
- I did not fetch the full API Versioning post body (versioned struct naming and the fail-gracefully mechanism details), or the Truth's API and threading posts.
- The Machinery was discontinued in 2022 (blog index shows posts until early 2022). The shutdown reasons were not researched here.

## 4. Handmade Hero platform layer, game-as-DLL, unity builds, stb-style and sokol

### Takeaway
Handmade Hero reverses the usual library model. The platform executable owns the OS (window, audio, input, memory) and calls into a hot-reloadable game DLL, passing in memory, input and a small set of platform function pointers. The game DLL holds no static state, so it can be swapped at any time. sokol and stb show the single-header C library style. They select backends at compile time with `#define`s, use one implementation translation unit, and expose resources as handles.

### Cited Findings
- Handmade Hero's code is split into platform-independent game code and a platform layer. Casey's Windows layer uses WinAPI, XInput and DirectSound, and community ports reimplement only the platform layer (e.g. macOS). — [vbo/handmadehero_osx_platform_layer](https://github.com/vbo/handmadehero_osx_platform_layer)
- Day 22, "Instantaneous Live Code Editing", makes WinMain reload the game DLL when it changes, detected via `CompareFileTime()`. — [Handmade Hero annotations, code022](https://git.handmade.network/Annotation-Pushers/cinera_handmade.network/src/branch/master/cmuratori/hero/code/code022.hmml)
- Reload rules quoted in a forum thread: "GAME DLL can be reloaded safely at any time"; "NO STATIC DATA IN GAMEDLL, except for a single pointer to be rewritten each time the gameloop tick". Also: "You can't reload code if you change the data layout or otherwise break ABI." — [Handmade Hero forums thread 253](https://hero.handmade.network/forums/code-discussion/t/253/p/1529); [p/1513](https://hero.handmade.network/forums/code-discussion/t/253/p/1513)
- Why the game is a DLL: hot reloading, because "Most of the time you'll be modifying and tweaking game code". Doom/Quake split out a game DLL for a different reason, so that different games can be built on one engine without recompiling it. — [Mārtiņš Možeiko, handmade.network forum #29653](https://handmade.network/forums/t/8796/p/29649)
- Game → platform calls are allowed if narrow: "There's nothing wrong with game code calling into platform layer," provided the calls are controlled and the API surface is limited. Handmade Hero does this for async asset loading and thread-pool work (via function pointers the platform passes to the game). — [Možeiko, handmade.network forum #29649](https://handmade.network/forums/t/8796/p/29649)
- sokol's design: "The core headers are standalone and can be used independently from each other." Why C: "easier integration with other languages; easier integration into other projects; adds only minimal size overhead to executables." — [sokol README](https://github.com/floooh/sokol)
- sokol uses compile-time backend selection. You define `SOKOL_IMPL` "in exactly one C or C++ translation unit", and in that unit "select exactly one rendering backend … `SOKOL_GLCORE`, `SOKOL_GLES3`, `SOKOL_D3D11`, `SOKOL_METAL`, `SOKOL_WGPU` or `SOKOL_VULKAN`". sokol_gfx "does *not* handle window creation or 3D API context initialization", which is a separate header (sokol_app.h). — [sokol README](https://github.com/floooh/sokol)
- floooh on handles: "move all memory management into centralized systems (like rendering, physics, animation, …), with the systems being the sole owner of their memory allocations; group items of the same type into arrays…; when creating an item, only return an 'index-handle' to the outside world, not a pointer; … use the remaining bits for additional memory safety checks; only convert a handle to a pointer when absolutely needed, and don't store the pointer anywhere." — [floooh, Handles are the better pointers (2018)](https://floooh.github.io/2018/06/17/handles-vs-pointers.html)
- The Machinery explicitly rejects unity builds as a fix for bad physical design: "in a lot of large codebases, people essentially just give up and switch to unity builds … Once you are in that hole, it might even be the right decision, but that's not where we want to end up." — [Physical Design](https://ruby0x1.github.io/machinery_blog_archive/post/physical-design/)

### Inferences
- For this project, the Handmade pattern maps onto SDL3 as follows. The executable is `main` plus SDL3 (window, SDL_GPU device, audio, input, file, threads). It loads `game.dylib`/`.so`/`.dll` via `SDL_LoadObject`/`SDL_LoadFunction` and calls `game_update(game_memory*, input*, platform_api*)`. All persistent state lives in a platform-allocated arena, so a reload only swaps code. That gives hot reload on macOS, Linux and Windows with one code path.
- Unity builds and the Handmade/Machinery approaches don't conflict. A unity build (one `.c` per module including its implementation files) is a build-speed tactic. The Machinery no-include rule is a coupling tactic. A solo C17 project can do both: one unity TU per module/DLL, with the strict header rule at module boundaries.
- sokol shows that compile-time backend selection (one implementation TU plus `#define`) is enough when there is exactly one backend per platform build. Runtime selection (function-pointer struct) is only needed when one binary must choose between backends at runtime (e.g. null renderer for tests or server, Vulkan vs. D3D12 on Windows). SDL_GPU already does that choice internally.

### Gaps
- I did not verify Casey Muratori's own wording on the game/platform interface in the episodes (Day 1–25). Quotes above are from forum participants and annotations, not Casey directly.
- I did not fetch stb's own "stb_howto" / single-header FAQ, so stb-specific rules (e.g. `STB_*_IMPLEMENTATION`, `STBI_MALLOC` override macros for allocators) are unverified here.

## 5. Bitsquid/Stingray: modularity, data-driven design, IDs, C-style APIs

### Takeaway
Bitsquid (Niklas Frykholm, the same people who later founded Our Machinery) argued four things. Each system should be isolated, and global "frameworks" (root classes, RTTI, reflection, global serialization) are coupling hazards. A higher-level layer should shuffle data between low-level systems instead of systems calling each other. Some duplication beats coupling. Objects in other systems should be referenced by integer IDs with generation checks, not pointers.

### Cited Findings
- "Ideally, each system should be completely isolated." — [Frykholm, Managing Coupling (Jan 30, 2011)](https://bitsquid.blogspot.com/2011/01/managing-coupling.html)
- On frameworks: root classes, RTTI, serialization and reference counting are global systems, and "Such global systems introduce a coupling across the entire engine." Instead, "You would be much better off if each system just defined its own save() and load() functions." — [Managing Coupling](https://bitsquid.blogspot.com/2011/01/managing-coupling.html)
- Mediation: "Instead of directly coupling low level systems, use a high level system to shuffle data between them". The messy gameplay glue stays out of clean engine code. — [Managing Coupling](https://bitsquid.blogspot.com/2011/01/managing-coupling.html)
- Duplication: "Code sharing has a price that is not always recognized, in that it increases system coupling … Sometimes a little judiciously applied code duplication can be a better solution." — [Managing Coupling](https://bitsquid.blogspot.com/2011/01/managing-coupling.html)
- IDs over pointers: "The IDs are just an integers uniquely identifying an object, that the user can throw away when she is done with them". IDs are plain data, so they can be passed to Lua or across DMA. Lookup uses a fixed array split into index plus unique-id bits, so stale IDs can be detected. — [Managing Coupling](https://bitsquid.blogspot.com/2011/01/managing-coupling.html)
- The essay was republished as "Managing Decoupling" on GameDev.net (2013). — [GameDev.net](https://gamedev.net/tutorials/programming/general-and-gameplay-programming/managing-decoupling-r3034)

### Inferences
- Bitsquid's "high-level system shuffles data" is the engine equivalent of a hexagonal application service. The difference is that it shuffles arrays between systems (e.g. physics → transform → render each frame) instead of calling through per-object interfaces. For an open-world engine this suggests a frame/world orchestrator that owns the update order and copies or points data between subsystems, with no subsystem-to-subsystem includes.
- "Each system defines its own save()/load()" also argues against building a global reflection or serialization framework early in a C17 engine.

### Gaps
- The Bitsquid "behind the scenes" slide PDF (KTH) could not be text-extracted via fetch. Other relevant Bitsquid posts were not fetched in this session: data-oriented "Building a Data-Oriented Entity System" parts, "Code Hot Reloading", and the Lua/flow scripting posts. The original bitsquid.blogspot.com URLs for "managing-decoupling" parts 2–4 returned 404 at the guessed paths.

## 6. Other engines: how they enforce module boundaries (Godot, Unreal, Bevy, others)

### Takeaway
- Godot: a "server" layer of low-level APIs (RenderingServer, PhysicsServer, AudioServer) addressed via opaque RIDs, with the scene/node system built on top. Rendering has a second port, RenderingDevice, with Vulkan, D3D12 and Metal drivers.
- Unreal: build-system-enforced modules (Public/Private folders, Build.cs dependency lists, startup/shutdown, loading phases).
- Bevy: plugins as functions that register systems and resources into an App.

All three are "port"-like boundaries enforced by build system, handles, or registration, not by OOP layering.

### Cited Findings
- Godot: "At the core, Godot uses the concept of Servers". The scene system is built on top of them, and you can bypass it and call servers directly (RenderingServer, PhysicsServer2D/3D, AudioServer). RIDs are "opaque handles to the server implementation," allocated and freed manually. Servers often run asynchronously, so functions that return values can stall them, and you should avoid querying them every frame. — [Godot docs: Optimization using Servers](https://docs.godotengine.org/en/stable/tutorials/performance/using_servers.html)
- Godot rendering: "Godot uses its own abstraction called RenderingDevice". Forward+ and Mobile are built on it, and Vulkan, Direct3D 12 and Metal (Metal 4 plus a Metal 3 fallback) implement it. "The OpenGL driver does not use the RenderingDevice abstraction", and "Only the Compatibility rendering method can be used with the OpenGL driver." Core GLSL shaders are shared across Vulkan, D3D12 and Metal (transpiled to DXIL and MSL). — [Godot docs: Internal rendering architecture](https://docs.godotengine.org/en/latest/engine_details/architecture/internal_rendering_architecture.html)
- Unreal: "Modules are the basic building block of Unreal Engine's software architecture." The documented benefits: "Modules enforce good code separation, providing a means to encapsulate functionality and hide internal parts of the code", modules "are compiled as separate compilation units", and they "are linked together in a dependency graph and limit header includes to code that is actually used, per the Include What You Use (IWYU) standard". Each module has `Public`/`Private` folders, a `[ModuleName].Build.cs` declaring dependencies, and a `[ModuleName]Module.cpp` "for starting up and shutting down your module". Loading is controlled by `Type` (Runtime/Editor) and `LoadingPhase`. — [Unreal Engine docs: Unreal Engine Modules](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-modules)
- Bevy: "Plugins are simply collections of things to be added to the App Builder". A plugin is a `fn(&mut App)` or a struct implementing `Plugin::build`, which adds resources, events and systems. "Everything the plugin adds will be flattened into your App". Engine features come as `DefaultPlugins`. — [Unofficial Bevy Cheat Book: Plugins (Bevy 0.14, marked outdated)](https://bevy-cheatbook.github.io/programming/plugins.html)

### Inferences
- Godot's two levels of ports apply directly here. Level 1 is a coarse "server" API per domain (render world, physics world, audio) addressed by handles; gameplay and scene code only see this. Level 2 is a backend abstraction under the renderer only. With SDL_GPU, level 2 is SDL's job. The engine's own render "server" API (submit meshes/instances/lights by handle) is the port worth owning.
- Unreal's mechanism translates to C17 + CMake as one static lib or object target per module, with `include/` (public) vs `src/` (private), explicit `target_link_libraries` dependencies, and `module_init`/`module_shutdown` functions called in a declared order. The build system then enforces boundaries (a private header is simply not on another module's include path).
- Bevy's plugin is conceptually the same as Machinery's `load_xxx(registry)`: a function that registers things into a central app or registry. In C this is `void physics_plugin_register(engine_registry *r)`.

### Gaps
- Not researched in this session (no primary sources fetched): id Tech's game/engine DLL split (e.g. Quake's game module via `game_import_t`/`game_export_t` function-pointer tables, unverified), raylib (a single flat C API with compile-time platform backends `PLATFORM_DESKTOP`/`rcore_*` splits, unverified), Wicked Engine and Hazel (C++ engines, so their class-based module structure transfers less to C). Godot's PhysicsServer3D backend swapping (GodotPhysics vs. Jolt integration) is also not verified here.

## 7. Practical C17 techniques: handles, vtables, backend selection, init order, errors, allocators, testing

### Takeaway
The primary sources agree on a small toolkit:
- integer handles with generation bits for anything owned by a system;
- function-pointer API structs for the few coarse seams;
- opaque fixed-size blobs for OS types in headers;
- forward-declared struct pointers instead of includes;
- allocators passed explicitly as an interface struct (or arenas from the platform);
- bulk, "where there is one, there are many" APIs;
- compile-time backend selection unless a single binary truly needs a runtime choice.

### Cited Findings
- Handles: system-owned arrays, return an index handle, spare bits for safety checks (a generation counter per slot to prevent "handle collisions"), never store converted pointers. — [floooh, Handles are the better pointers](https://floooh.github.io/2018/06/17/handles-vs-pointers.html); the same idea is in [Bitsquid, Managing Coupling](https://bitsquid.blogspot.com/2011/01/managing-coupling.html) (index plus unique-id bits) and in [Godot RIDs](https://docs.godotengine.org/en/stable/tutorials/performance/using_servers.html)
- Opaque OS types in headers: `struct tm_file_o {uint64_t opaque;};`. — [Physical Design](https://ruby0x1.github.io/machinery_blog_archive/post/physical-design/)
- Function-pointer API structs and objects (`{inst*, fnptr...}`), plus the shared-vtable variant `obj->vtable->a_method(obj->instance, ...)`. The latter makes hot-reload patching easier, because only one table needs replacing and empty slots can be reserved for new methods. — [Gray pt.2](https://ruby0x1.github.io/machinery_blog_archive/post/little-machines-working-together-part-2/); [DLL Hot Reloading in Theory and Practice](https://ruby0x1.github.io/machinery_blog_archive/post/dll-hot-reloading-in-theory-and-practice/)
- Allocator passed in as an interface: `struct tm_allocator_i { struct tm_allocator_o *inst; void *(*realloc)(...); }`. APIs take `struct tm_allocator_i *a` as their first parameter (e.g. `compress(struct tm_allocator_i *a, const uint8_t *raw, uint64_t raw_size)`). A single `realloc` entry point covers alloc, free and resize. — [Gray pt.2](https://ruby0x1.github.io/machinery_blog_archive/post/little-machines-working-together-part-2/)
- Compile-time backend selection via one implementation TU plus a backend `#define`. — [sokol README](https://github.com/floooh/sokol). Runtime selection via a registry with multiple implementations of one API. — [Gray pt.1](https://gamedeveloper.com/programming/little-machines-working-together-part-1-)
- Init/shutdown: Unreal gives each module explicit startup/shutdown methods plus a declared LoadingPhase. — [Unreal docs](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-modules). The Machinery's plugins do it in `load_xxx`/`unload_xxx`, and users can subscribe to API load/unload notifications. — [Gray pt.2](https://ruby0x1.github.io/machinery_blog_archive/post/little-machines-working-together-part-2/)
- Testing in isolation:
  - The Machinery's unit tests are an API (`tm_unit_test_i`) that any plugin can implement, and the test runner iterates all implementations. — [pt.1](https://gamedeveloper.com/programming/little-machines-working-together-part-1-)
  - In `-r` mode the runner re-runs a module's tests whenever that plugin hot-reloads. — [pt.2](https://ruby0x1.github.io/machinery_blog_archive/post/little-machines-working-together-part-2/)
  - Interfaces make "systems … easily mocked for testing purposes." — [pt.2](https://ruby0x1.github.io/machinery_blog_archive/post/little-machines-working-together-part-2/)
- ABI/versioning hazard: changing a function-pointer signature silently crashes old binaries, so you need versioned API names/structs if modules are ever shipped separately. — [API Versioning](https://ruby0x1.github.io/machinery_blog_archive/post/api-versioning/)
- Hot-reload state rule: no static data in the reloadable module, with state in platform-owned memory. — [Handmade Hero forums](https://hero.handmade.network/forums/code-discussion/t/253/p/1529)

### Inferences
- A concrete C17 recommendation, synthesized from the above:
  1. **Layering (Gregory).** `platform` (SDL3 wrapper) → `core` → `resource` → subsystems → `scene/world` → `game`. Enforce it with CMake targets and a CI check that headers include nothing except `<stdint.h>`/`<stdbool.h>`/`<stddef.h>`, or a tiny `base_types.h`.
  2. **Ports only at coarse seams.** Platform (window/input/time/fs/threads), GPU (own "render server" API over SDL_GPU), audio, physics, and asset IO/streaming. Each port is a `const struct xxx_api *` of function pointers taking handles and bulk arrays. Everything else (math, containers, ECS/world data) is direct calls, `static inline` where hot.
  3. **Handles everywhere across module boundaries** (32-bit index plus generation). Pointers stay inside a module.
  4. **Memory.** The platform reserves big arenas once (Handmade-style). Modules receive an allocator interface or arena at init, and nothing calls malloc directly. This also makes hot reload trivial, because state survives in platform-owned memory.
  5. **Init/shutdown.** Explicit `xxx_init(const engine_apis*, allocator*)` and `xxx_shutdown()` calls in a single hand-written order in `main`, in reverse for shutdown. This avoids registry-resolved ordering until the module count actually demands it.
  6. **Backend selection.** Compile-time (one TU per backend, sokol style) by default. Use runtime function-pointer swapping only for null/headless test backends and the hot-reloaded game DLL.
  7. **Testing.** Each module links against a null or fake platform/GPU port in a test executable. Run headless simulation tests (replay of an input stream into the game DLL), the "driven by automated test" use that Cockburn's intent describes.
  8. **Errors.** Inferred from the C-API style above, not sourced: return codes or bool plus out-parameters at API boundaries, asserts for programmer errors, no `longjmp`.

### Gaps
- I found no primary-source guidance in this session on error-handling conventions (result codes vs. asserts vs. error callbacks) from these engine authors.
- I found no measurement of function-pointer-call overhead vs. direct calls in a modern engine context. The claim that it is negligible at coarse/bulk granularity rests on the authors' reasoning, not benchmarks.
- I did not verify SDL3's own module and backend design (SDL_GPU backends; `SDL_LoadObject`/`SDL_LoadFunction` for hot reload) in this session. Check against the SDL3 wiki.
