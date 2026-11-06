# Data-Oriented Design and Entity/Object Models for a C17 Open-World Engine

Research notes for a native C17 engine (SDL3 + SDL_GPU) inspired by RAGE/GTA. It must handle tens of thousands of streamed objects: buildings, props, vehicles and pedestrians.

Source caveats:
- Several primary sources could not be fetched: Sander Mertens' Medium "Building an ECS" (HTTP 403), GTAMods wiki YMAP pages (404) and the original re3 GitHub repo (taken down; every raw URL returned 404).
- For GTA III internals I used the community reverse-engineered headers in DK22Pac/plugin-sdk (`plugin_III/game_III/*.h`). These describe the same game structures re3 reimplemented, with memory offsets checked by `VALIDATE_OFFSET`.
- Anything I could not verify this session is in a Gaps section, not stated as fact.

---

## 1. Core ideas of data-oriented design (Acton, Fabian, Llopis): which concrete rules follow?

### Takeaway
Data-oriented design (DOD) treats a program as transforms from one data form to another. You design from the real data, its access frequency and the hardware cost, not from a model of the domain. The concrete rules that follow are:
- Solve the common case, not the generic one ("where there is one, there are many").
- Avoid low-density structs (bools and rarely used fields next to hot fields).
- Store each state type separately instead of keeping a state enum or bool per object (existence-based processing).
- Lay data out for the specific read pattern (SoA, split search keys).
- Batch mutations separately from reads.

### Cited Findings

**Mike Acton, "Data-Oriented Design and C++", CppCon 2014.** Quotes are taken from the slide-deck text.
- The principles slides say, verbatim:
  - "The purpose of all programs, and all parts of those programs, is to transform data from one form to another."
  - "If you don't understand the data you don't understand the problem."
  - "Different problems require different solutions."
  - "If you have different data, you have a different problem."
  - "If you don't understand the hardware, you can't reason about the cost of solving the problem."
  - "Everything is a data problem. Including usability, maintenance, debug-ability, etc."
  - "Solving problems you probably don't have creates more problems you definitely do."
  - "Latency and throughput are only the same in sequential systems."

  Source: [Acton slides PDF](https://neil3d.github.io/assets/img/ecs/DOD-Cpp.pdf); talk listing at [isocpp.org](https://isocpp.org/blog/2015/01/cppcon-2014-data-oriented-design-and-c-mike-acton).
- Rules of thumb from the same deck:
  - "Where there is one, there are many. Try looking on the time axis."
  - "The more context you have, the better you can make the solution. Don't throw away data you need."
  - "NUMA extends to I/O and pre-built data all the way back through time to original source creation." This means offline data preparation is part of the design.

  Source: [Acton slides](https://neil3d.github.io/assets/img/ecs/DOD-Cpp.pdf).
- "Programmer's job is NOT to write code; Programmer's job is to solve (data transformation) problems." "Solve for the most common case first, not the most generic." — [Acton slides](https://neil3d.github.io/assets/img/ecs/DOD-Cpp.pdf)
- Cache-line waste example. When a loop reads only a bool (or 4 bytes) from a 64-byte struct, it wastes "56 bytes / 64 bytes" or "60 bytes / 64 bytes": "90% waste!". The deck labels bools in structs as "(3) Extremely low information density" and asks "What's the most commonly accessed data?" and "How big is your cache line?". It also says the problem "Applies to any member fields especially. (Not particular to bools)." — [Acton slides](https://neil3d.github.io/assets/img/ecs/DOD-Cpp.pdf)
- Back-of-the-envelope cost model: about 200 cycles per L2 miss, times about 2 misses per object, times the object count. The deck works an example of "~2 L2 misses each frame x 10,000" objects. — [Acton slides](https://neil3d.github.io/assets/img/ecs/DOD-Cpp.pdf)
- On "bools and last-minute decision making" and over-generalization, complex constructors and objects imply:
  - "Reads are unmanaged (one at a time…)"
  - "Unmanaged icache (i.e. virtuals)"
  - "Unnecessarily complex state machines… e.g. 2^7 states"

  The rule of thumb given is: "Store each state type separately. Store same states together. (No state value needed)." — [Acton slides](https://neil3d.github.io/assets/img/ecs/DOD-Cpp.pdf)
- Acton's process: "Step 1: organize — Separate states so you can reason about them. Step 2: triage — What are the relative values of each case, i.e. p(call) * count (e.g. in-game vs. in-editor). Step 3: reduce waste." — [Acton slides](https://neil3d.github.io/assets/img/ecs/DOD-Cpp.pdf)
- "Undefined or under-defined constraints imply more (wasted) reads because pretending you don't know what it could be. e.g. Strings, generally. Filenames, in particular." — [Acton slides](https://neil3d.github.io/assets/img/ecs/DOD-Cpp.pdf)
- The deck describes the game-dev C++ subset as Mars-rover-like: no exceptions, templates, iostream, multiple inheritance, operator overloading or RTTI, "No STL", "Custom allocators (lots)" and custom debugging tools. Most of that is close to plain C anyway. — [Acton slides](https://neil3d.github.io/assets/img/ecs/DOD-Cpp.pdf)
- The deck cites Tony Albrecht's "Pitfalls of Object Oriented Programming" (GCAP 09) as background reading. — [Acton slides](https://neil3d.github.io/assets/img/ecs/DOD-Cpp.pdf), linking [research.scee.net PDF](http://research.scee.net/files/presentations/gcapaustralia09/Pitfalls_of_Object_Oriented_Programming_GCAP_09.pdf)
- "Three Big Lies" is a separate, earlier GDC talk by Acton (GDC Vault). — [GDC Vault](https://gdcvault.com/play/1012200/Three-Big-Lies-Typical-Design)

**Richard Fabian, *Data-Oriented Design* (dataorienteddesign.com), "Searching" chapter.**
- "If the search is not necessary, then that's your biggest possible saving." — [Fabian, Searching](https://www.dataorienteddesign.com/dodbook/node7.html)
- Pull search keys into their own array, separate from the payload. Fabian's timings show a linear search over a pre-extracted key array beating a binary search over full structs. "Two different data layouts for an algorithm could have more impact than the algorithm used." — [Fabian, Searching](https://www.dataorienteddesign.com/dodbook/node7.html)
- Choose the index structure by mutation rate:
  - hash tables for interleaved modification and lookup;
  - trees for mostly static data;
  - a perfect hash for constant data.

  Batch all modifications into one stage, rebalance, then do reads. Indexes can be created just in time after a query repeats. — [Fabian, Searching](https://www.dataorienteddesign.com/dodbook/node7.html)
- For "nearest N" queries, keep a sorted top-N that is updated on insert, modify and delete, instead of searching each time. — [Fabian, Searching](https://www.dataorienteddesign.com/dodbook/node7.html)

**Bitsquid (Niklas Frykholm), DOD applied to entities.**
- Component data should be laid out "as a structure of arrays in a single continuous buffer". Updates run "one component manager at a time, not one entity at a time" so data stays hot in the cache. — [Bitsquid: Building a Data-Oriented Entity System](https://bitsquid.blogspot.com/2014/08/building-data-oriented-entity-system.html)

### Inferences
- Concrete rules for a C17 engine:
  1. **SoA per hot loop.** For example, culling reads only `bounds[]` and `flags[]`, not a fat entity struct.
  2. **Hot/cold split.** Transform, bounds and LOD state are hot. Debug name, script data and spawn metadata are cold.
  3. **Existence-based processing.** Keep "vehicles currently simulated" in their own array instead of a `bIsActive` flag that every loop branches on.
  4. **Batch structural changes.** Spawns and despawns from streaming are queued, then applied at one sync point per frame.
  5. **Bake data offline.** Acton's NUMA-to-source-creation rule argues that the asset pipeline should emit per-cell entity arrays already in their runtime layout.
- The "~200 cycles × misses × count" model is useful for budgeting. At 30k objects, 2 L2 misses each costs about 12M cycles if done serially, which is several milliseconds. Reducing per-object scattered reads is the first lever. This is my estimate from Acton's numbers, not his figure.
- Almost all of these rules are language-neutral. DOD needs nothing from C++: Acton's deck itself strips C++ down to a near-C subset.

### Gaps
- Noel Llopis' "Data-Oriented Design (Or Why You Might Be Shooting Yourself in the Foot With OOP)" (Game Developer, 2009) was not fetched, so it is not quoted.
- Fabian's book chapters on existence-based processing, hot/cold ("Component Based Objects", "Existential Processing") were not fetched this session. Only the Searching chapter is cited.
- Acton's slide text does not give the exact cache-latency table numbers beyond about 200 cycles per L2 miss.

---

## 2. ECS designs: archetype (Unity DOTS, flecs, Bevy) vs sparse set (EnTT), and flecs as a C dependency

### Takeaway
Archetype (table) ECS groups entities with identical component sets into tables (components as columns, entities as rows):
- Queries and iteration are fast and need no per-entity tests.
- Adding or removing a component moves the entity, with all its components, to another table.
- Many component combinations fragment the data into many small tables.

Sparse-set ECS stores one packed array per component, keyed by entity through a sparse array:
- Adding or removing a component is cheap and touches one pool.
- Multi-component iteration needs tests or indirection unless you explicitly set up "groups" that co-sort pools.

flecs is an MIT, zero-dependency C99 archetype ECS and is the only mature option written in C.

### Cited Findings
- ECS definition: "Entities are unique identifiers, components are plain data types, and systems are functions matched to entities with a given component set." The FAQ contrasts this with EC (entity-component) frameworks, where components carry both data and behavior. — [Mertens, ECS FAQ](https://github.com/SanderMertens/ecs-faq)
- "An archetype ECS stores entities in tables, where components are columns and entities are rows." Archetype ECSes are "fast to query and iterate". Sparse-set ECSes "allow for fast add/remove operations". — [ECS FAQ](https://github.com/SanderMertens/ecs-faq)
- ECS weak spots: queries "that require highly specialized data structures, such as binary trees or spatial structures". Quadtrees and octrees "are usually not directly stored in an ECS". — [ECS FAQ](https://github.com/SanderMertens/ecs-faq)
- Hierarchy options in ECS:
  - a Parent component, a Children vector, or child/sibling linked lists. These work anywhere but rely "on component lookups, which can slow down systems that iterate a hierarchy";
  - depth sorting, which needs frequent sorting;
  - archetype subtree splitting, which "can create a lot of small tables, which can degrade performance".

  — [ECS FAQ](https://github.com/SanderMertens/ecs-faq)
- Relationships, a flecs feature: a pair `(Likes, bob)` can be added to an entity, and both relation and target are entities. — [ECS FAQ](https://github.com/SanderMertens/ecs-faq)
- EnTT sparse set structure:
  - A sparse array is indexed by entity, and a packed array holds dense entities.
  - Membership test: `packed[sparse[entity]] == entity`.
  - Component storage is a third array "ordered as the internal one", and iteration walks the packed array with no indirection.

  — [skypjack, ECS back and forth pt. 2](https://skypjack.github.io/2019-03-07-ecs-baf-part-2/)
- EnTT groups (the owning variant): entities that have all the grouped components are moved "at the top of the arrays". Iteration then needs "no test" and is "theoretically the best". But "only one order can be imposed within an array", so a component shared by several groups can be optimized for only one of them. Non-owning groups keep an extra sparse set and pay an indirection. — [skypjack pt. 2](https://skypjack.github.io/2019-03-07-ecs-baf-part-2/)
- skypjack on archetypes: "Every time a component is added or removed, an entity and all its components are moved from an archetype to another one", and "the number of archetypes could explode if you have a high number of possible combinations". Sparse sets are "not automatic: this time we need to explicitly decide what to optimize". Conclusion: they "play in the same league" and the choice "is a matter of taste". — [skypjack pt. 2](https://skypjack.github.io/2019-03-07-ecs-baf-part-2/)
- Unity Entities docs: entities with the same component set form one archetype, and "Removing the Renderer component from entity B moves it to archetype N." — [Unity Entities 0.8 ECS concepts](https://docs.unity3d.com/Packages/com.unity.entities@0.8/manual/ecs_core.html)
- flecs README:
  - "Fast and portable zero dependency C99 API" plus a C++17 API "that doesn't use STL containers"; MIT license.
  - "Cache friendly archetype/SoA storage that can process millions of entities every frame".
  - Native hierarchies and prefabs, a query language "with support for joins and inheritance", and a "lockless scheduler" for multithreading.
  - Reflection with a JSON serializer and a web-based Explorer UI.
  - "Verified on all major compilers and platforms with CI running more than 13000 tests", runs under emscripten, and the "code base … builds in less than 5 seconds".

  — [flecs GitHub](https://github.com/SanderMertens/flecs)
- The ECS FAQ lists flecs as "C/C++17" and luaecs (C/Lua, inactive) as the only other C implementation it lists. — [ECS FAQ](https://github.com/SanderMertens/ecs-faq)

### Inferences
- **Open-world fit.** Static world objects (buildings, props) almost never change component sets after spawn. That favors archetype or table storage. Their main cost is streaming churn: bulk insert and delete of whole cells. Both archetype tables and plain per-type arrays handle this well if spawns are batched.
- **Dynamic actors** (peds, vehicles) change state often: in car, ragdoll, dead. In an archetype ECS, a state toggled as a tag component causes table moves. Acton's "store each state separately" points the same way, but the moves are not free. Sparse-set or per-system arrays make these toggles cheap.
- **Using flecs from C17.** It is plausible: it is C99 with no dependencies and MIT. Costs to weigh:
  - Large API surface and macro-heavy registration (`ECS_COMPONENT` and similar, from memory; not verified this session).
  - Its own scheduler and pipeline may overlap with the engine's job system.
  - Debugging goes through a generic table layer instead of plain arrays.
  - Spatial queries must still live outside the ECS (per the FAQ).
- **Sparse-set ECS in C.** It is straightforward to hand-write: one sparse+dense pair per component type, with swap-and-pop removal. EnTT's template machinery (C++) is not needed, but you lose compile-time typed views. In C, use `void*` plus stride, or macro-generated per-type pools.

### Gaps
- Mertens' "Building an ECS #1/#2" (Medium) returned 403. Details of the flecs archetype graph and entity index are not quoted from the primary source.
- Bevy's hybrid storage (per-component choice of table vs sparse set) was not verified this session.
- Unity DOTS chunk size (16 KiB chunks, from memory) was not verified.
- No reliable comparative benchmarks were found. The ECS FAQ explicitly gives none.
- flecs' amalgamated `distr/flecs.c` + `flecs.h` distribution and its addon-disable defines (`FLECS_CUSTOM_BUILD`) were not confirmed. The README shows a `distr` folder but the page text did not describe it.
- swap-and-pop is not described in skypjack's pt. 2 text. It is standard sparse-set practice, but not cited here.

---

## 3. Critiques of ECS and alternatives (Bitsquid, Our Machinery, fat struct / megastruct, handles)

### Takeaway
The strongest critiques are not "ECS is slow". They say:
- generic ECS is a framework-level solution to a problem that per-system managers or a fat struct solve more simply;
- entity update is often a small part of frame time;
- generic component storage hides the specific data layout each system wants.

Bitsquid's approach is entity = integer ID, with each system owning its components in a bespoke layout and no generic component base. That is directly implementable in C and is arguably the best fit for a RAGE-like engine. floooh's handles article supplies the memory and lifetime model that goes with it.

### Cited Findings
- **Bitsquid per-system managers.**
  - "An entity is just an integer, a unique ID identifying a particular entity."
  - "The task of a ComponentManager is to associate entities with components." Each manager picks its own storage and cardinality: a debug-name manager allows one per entity, a mesh manager allows several.
  - "There is no such thing as an 'abstract' component." No entity keeps a list of its components.

  — [Bitsquid: Building a Data-Oriented Entity System (part 1)](https://bitsquid.blogspot.com/2014/08/building-data-oriented-entity-system.html)
- Bitsquid's critique of the common alternative, a per-entity array of component pointers: it brings "dynamic memory allocation, inheritance and virtual functions" plus casting from base to concrete types (author reply in the comments). — [Bitsquid part 1](https://bitsquid.blogspot.com/2014/08/building-data-oriented-entity-system.html)
- **floooh, "Handles are the better pointers" (2018).** Rules:
  1. Centralize memory management in systems; pointers are never "the 'owner'".
  2. Group items into arrays allocated at startup.
  3. Return only handles.
  4. Split handle bits into an index plus safety bits.
  5. Convert a handle to a pointer only when needed, never store the pointer, and don't hold it across function calls.

  — [floooh: Handles are the better pointers](https://floooh.github.io/2018/06/17/handles-vs-pointers.html)
- floooh's motivation came from codebases with many small heap objects linked by smart pointers. They were robust but slow from cache misses, and suffered fragmentation and "fake leaks" that tools cannot detect. — [floooh](https://floooh.github.io/2018/06/17/handles-vs-pointers.html)
- floooh's caveats:
  - Hard to retrofit into decentralized-lifetime OOP code.
  - Rendering needs deferred destruction because the GPU may still reference a resource.
  - A plain typedef handle has no type safety, so wrap it in a distinct struct.
  - Handles double as stable IDs for networking and save files.

  Production examples cited: sokol_gfx.h (C) and the Oryol modules. — [floooh](https://floooh.github.io/2018/06/17/handles-vs-pointers.html)
- **Megastruct / fat struct.** A secondary notes page lists Ryan Fleury ([video](https://www.youtube.com/watch?v=UolgW-Ff4bA)) and Jonathan Blow ([video](https://www.youtube.com/watch?v=VWC9RT5u8gQ)) as advocating a single "mega-struct" holding all possible entity data as an ECS alternative. Arguments attributed to them collectively:
  - ECS performance gains are small in practice because entity updates are a minor part of a frame;
  - the mega-struct is flexible;
  - prefer thinking in "streams of execution, instead of streams of data".

  The page's author counters that mega-structs create maintenance and operational errors. — [Caio Raphael, ECS critiques notes (secondary)](https://caioraphael1.github.io/studies/Design%20Patterns/Data%20Oriented%20Design%20-%20ECS/Data%20Oriented%20Design%20-%20ECS-critiques.html)
- **Godot's reasoning for not being ECS-based.** Physics, rendering and audio are separate "Servers" with their own data, and nodes are interfaces to that data. — via [Caio Raphael notes](https://caioraphael1.github.io/studies/Design%20Patterns/Data%20Oriented%20Design%20-%20ECS/Data%20Oriented%20Design%20-%20ECS-critiques.html), citing [Godot: Why isn't Godot an ECS-based engine](https://godotengine.org/article/why-isnt-godot-ecs-based-game-engine/)
- **GTA III is itself effectively a "fat entity".** `CEntity` packs about 40 one-bit flags into bitfields covering collision, visibility, damage-proofing, streaming and rendering, next to type, status and model index (details in section 4). — [plugin-sdk CEntity.h](https://github.com/DK22Pac/plugin-sdk/blob/master/plugin_III/game_III/CEntity.h)

### Inferences
- **Middle path.** The pattern most consistent with these sources and with RAGE heritage:
  - A thin "fat-ish" entity header: handle, type, flags bitfield, model/archetype index, cell index and transform index.
  - Subsystem-owned SoA pools for hot data, Bitsquid-style: render instances, physics bodies, ped AI and vehicle simulation, all referenced by handle.
  - No generic runtime component registry.

  This keeps C code explicit (Fleury/Blow) while each heavy system gets a dense layout (Acton/Bitsquid).
- A fat struct works for gameplay entities that number in the hundreds (peds, vehicles, pickups). It works badly for tens of thousands of static buildings and props. Those should not be "entities" with gameplay state at all, just instance records: archetype index + transform + bounds + flags, in per-cell arrays.
- Acton's bools critique applies directly to GTA-style flag bitfields. Bitfields are dense, but branching on them per object in every loop is the "last-minute decision making" he warns about. Partitioning arrays by state, for example a separate list of visible or active objects, avoids it.

### Gaps
- Our Machinery's entity-system blog posts (ourmachinery.com, offline since the company shut down) could not be located or fetched. Their content is not cited.
- Casey Muratori's specific position (Handmade Hero streams and "entity system" discussions) and Anton Mikhailov's "megastruct" Twitter threads were not found as primary text. The Fleury and Blow attributions come via a secondary page summarizing their videos and are not verified from the videos.
- Bitsquid parts 2+ (component manager SoA buffer layout, entity-to-instance lookup via hash map, and garbage collection of components by sampling random alive checks, as recalled) were not fetched. These details are unverified.

---

## 4. How big open-world engines model objects (RAGE/GTA, Insomniac, Decima, REDengine)

### Takeaway
GTA III, the most fully documented case through reverse engineering, uses:
- A shallow C++ class hierarchy (`CPlaceable` → `CEntity` → `CBuilding`/`CDummy`/`CPhysical` → `CPed`/`CVehicle`/`CObject`).
- Fixed-size per-type pools with generation-tagged handles.
- A separate, shared, flyweight **model info / archetype** table (`CBaseModelInfo` subclasses in fixed stores), indexed by a 16-bit model index.
- A uniform 2D grid of sectors holding per-type intrusive pointer lists.

Public detail on Spider-Man, Decima and REDengine object models is thin. Decima organizes static content into streaming-group-defined "StaticTiles".

### Cited Findings

**GTA III entities** (reverse-engineered headers, plugin-sdk, equivalent to re3's structures):
- Entity type enum: `ENTITY_TYPE_NOTHING=0, BUILDING=1, VEHICLE=2, PED=3, OBJECT=4, DUMMY=5, NOTINPOOLS=6`. — [plugin-sdk CEntity.h](https://github.com/DK22Pac/plugin-sdk/blob/master/plugin_III/game_III/CEntity.h)
- `CEntity` fields:
  - a union `RwObject*` / `RpAtomic*` / `RpClump*`, the render-engine instance;
  - `m_nType:3`, `m_nStatus:5`;
  - about 40 1-bit flags, among them `bUsesCollision`, `bIsStatic`, `bIsVisible`, `bIsBIGBuilding`, `bRenderDamaged`, `bStreamingDontDelete` ("dont let the streaming remove this"), `bRemoveFromWorld` ("remove this entity next time it should be processed"), `bImBeingRendered` ("don't delete me because I'm being rendered"), `bDistanceFade` and the damage-proof flags;
  - `unsigned short m_nScanCode`, `m_nRandomSeed`, `short m_nModelIndex`, `short m_nLevel` (−1 ignores level transitions);
  - `CReference *m_pFirstRef`, a list of external pointers to this entity that are nulled on deletion.

  The class has virtual functions (`VTABLE_DESC(CEntity, …, 17)`). — [plugin-sdk CEntity.h](https://github.com/DK22Pac/plugin-sdk/blob/master/plugin_III/game_III/CEntity.h)
- `CPlaceable`, the base of `CEntity`, holds a full `CMatrix m_matrix` as the transform. — [plugin-sdk CPlaceable.h](https://github.com/DK22Pac/plugin-sdk/blob/master/plugin_III/game_III/CPlaceable.h)
- The collision model comes from shared model info: `GetColModel()` returns `CModelInfo::GetModelInfo(m_nModelIndex)->m_pColModel`. Per-type data is shared flyweight data, not per instance. — [plugin-sdk CEntity.h](https://github.com/DK22Pac/plugin-sdk/blob/master/plugin_III/game_III/CEntity.h)
- `CBaseModelInfo`, the archetype: `char m_szName[24]`, `CColModel *m_pColModel`, `C2dEffect *m_p2dEffect` (lights, particles), `m_nObjectDataIndex`, `unsigned short m_nRefCount`, `short m_nTxdIndex` (texture dictionary), `eModelInfoType m_nType`, `m_nNum2dEffects`, and `AddRef`/`RemoveRef`/`CreateInstance`. — [plugin-sdk CBaseModelInfo.h](https://github.com/DK22Pac/plugin-sdk/blob/master/plugin_III/game_III/CBaseModelInfo.h)
- Model infos live in fixed typed stores reached through `ms_modelInfoPtrs` (a pointer array indexed by model ID):

  | Store | Capacity |
  |---|---|
  | `CStore<CSimpleModelInfo,5000>` | 5000 |
  | `CStore<CVehicleModelInfo,120>` | 120 |
  | `CStore<CPedModelInfo,90>` | 90 |
  | `CStore<CTimeModelInfo,30>` (time-of-day objects) | 30 |
  | `CStore<CClumpModelInfo,5>` | 5 |

  — [plugin-sdk CModelInfo.h](https://github.com/DK22Pac/plugin-sdk/blob/master/plugin_III/game_III/CModelInfo.h)
- `CSimpleModelInfo` holds up to 3 `RpAtomic*` LOD meshes and `float m_afLodDistances[3]`. `m_apAtomics[2]` "is often a pointer to the non-LOD modelinfo", so a LOD link is expressed at the archetype level. — [plugin-sdk CSimpleModelInfo.h](https://github.com/DK22Pac/plugin-sdk/blob/master/plugin_III/game_III/CSimpleModelInfo.h)
- Per-type pools: `CPool<CBuilding>`, `CPool<CTreadable>`, `CPool<CDummy>`, `CPool<CObject,CCutsceneObject>`, `CPool<CPed,CPlayerPed>`, `CPool<CVehicle,CAutomobile>`, plus `CPool<CPtrNode>` and `CPool<CEntryInfoNode>` for list nodes. The second template parameter is the largest subclass, which sets the slot size. — [plugin-sdk CPools.h](https://github.com/DK22Pac/plugin-sdk/blob/master/plugin_III/game_III/CPools.h)

**World grid (GTA III):**
- `SECTOR_SIZE_X/Y = 40.0f`, `NUMSECTORS_X/Y = 100`, so the world is 4000×4000 units. — [plugin-sdk CWorld.h](https://github.com/DK22Pac/plugin-sdk/blob/master/plugin_III/game_III/CWorld.h)
- Each `CSector` holds `CPtrList` lists for buildings, objects, vehicles, peds and dummies. Each type has a second "Overlap" list for entities that span several sectors. — [plugin-sdk CSector.h](https://github.com/DK22Pac/plugin-sdk/blob/master/plugin_III/game_III/CSector.h)
- A separate `ms_bigBuildingsList` holds big buildings, matching the `bIsBIGBuilding` flag, i.e. the far LOD city. `ms_nCurrentScanCode` is incremented once per query and wraps to 1. Comparing it with each entity's `m_nScanCode` deduplicates entities found in multiple sectors without a visited set. — [plugin-sdk CWorld.h](https://github.com/DK22Pac/plugin-sdk/blob/master/plugin_III/game_III/CWorld.h)

**Decima (Horizon Zero Dawn):**
- The visibility slides list the challenges: large world, huge content, content in small pieces, continuous streaming. A "StaticTile" structure splits the world into tiles defined by streaming groups, "not spatially" (some groups are true spatial tiles). — [Decima Engine: Visibility in Horizon Zero Dawn (slideshare)](https://www.slideshare.net/guerrillagames/decima-engine-visibility-in-horizon-zero-dawn) (search-snippet level only)
- "Streaming the World of Horizon Zero Dawn" (Jan-Jaap van Muijden) covers the "low-level and high level streaming systems", memory management and scheduling. The page has no structural detail; the slides are linked from it. — [Guerrilla](https://www.guerrilla-games.com/read/Streaming-the-World-of-Horizon-Zero-Dawn)

**Insomniac (Spider-Man):**
- Elan Ruskin's GDC 2019 "Marvel's Spider-Man: A Technical Postmortem" covers growing asset counts and adapting rendering, streaming and lighting to fit NYC "on a Blu-Ray". The public summary has no entity-model details. — [80.lv summary](https://80.lv/articles/marvels-spider-man-a-technical-postmortem); [GDC Vault](https://gdcvault.com/play/1026496)

### Inferences
- **Archetype vs instance is the most transferable RAGE idea.** Note that it is a different meaning of "archetype" from ECS archetypes. Tens of thousands of placed objects are cheap instance records (model index + matrix + flags + LOD link). All heavy shared data lives once in the archetype table: meshes, collision, 2D effects, LOD distances and texture dictionary. The archetype's refcount drives asset streaming.
- In C17 this maps cleanly:
  - `ModelInfo models[]`, with a tagged union or a separate array per model kind;
  - `uint16_t model_index` in each instance;
  - the C++ virtuals replaced by `switch (type)` or per-type arrays.
- **GTA III shows the costs of the OOP pool approach:**
  - pointer lists per sector, intrusive `CPtrNode` pools with pointer-chasing iteration;
  - virtual dispatch;
  - per-entity bitfield flags checked in every loop;
  - a fat 4×4 matrix per static building.

  A modern design would keep the sector or cell idea but store per-cell dense arrays (SoA bounds and transforms) instead of linked pointer lists.
- **Lifetime flags as safety hacks.** `bImBeingRendered`, `bStreamingDontDelete`, `bRemoveFromWorld` and `CReference` lists are 2001-era workarounds for unsafe pointer lifetime. Deferred deletion and generational handles (section 5) replace all of them systematically.

### Gaps
- GTA V/RAGE specifics are not verified here because the GTAMods wiki returned 404:
  - YMAP `CMapData` / `CEntityDef` fields: archetypeName hash, guid, position, quaternion rotation, `parentIndex`, `lodDist`, `childLodDist`, `lodLevel` HD/LOD/SLOD1–4 and `numChildren`;
  - YTYP `CBaseArchetypeDef`;
  - `fwEntity` / `CEntity` in RAGE's `fw` framework layer.

  They are well known in the modding community. Verify them from gtamods.com or CodeWalker source before relying on them.
- The original re3 repo (GTAmodding/re3) is no longer reachable on GitHub. Equivalent structure was taken from plugin-sdk. `CPhysical`, `CBuilding` and `CDummy` headers were downloaded but not analyzed in depth.
- Witcher 3 / REDengine: no public primary source on its entity model was found this session.
- Spider-Man: no public written primary source with tile sizes or entity layout was found. The GDC Vault video is members-only.

---

## 5. Generational handles, slot maps in C, entity ID schemes, and streaming and entity lifetime

### Takeaway
Use 32-bit (or 64-bit) handles made of an index plus a generation counter, into fixed-capacity per-system pools. Validate on every lookup and never store derived pointers. Bitsquid (22+8 bits), floooh (per-slot generation, disable slot on overflow) and GTA III itself (index<<8 | 7-bit id) all converge on this scheme. With streaming, ownership is per cell: a cell spawns and despawns its batch of instances, and handles held elsewhere simply fail validation after unload.

### Cited Findings
- **Bitsquid entity ID scheme:**
  - 30 usable bits (2 reserved to fit Lua light userdata in 32 bits), split into a **22-bit index** (about 4M entities) and an **8-bit generation**.
  - `EntityManager` keeps `Array<unsigned char> _generation` and `Deque<unsigned> _free_indices`.
  - `destroy` bumps the generation and pushes the index.
  - `create` reuses an index only when more than `MINIMUM_FREE_INDICES = 1024` are queued, so "you must create and destroy at least 256 * 1024 entities until an ID can reappear".
  - `alive(e)` compares generations.

  — [Bitsquid part 1](https://bitsquid.blogspot.com/2014/08/building-data-oriented-entity-system.html)
- **floooh handle validation:**
  - Range check, then compare the full handle stored in the slot.
  - A per-slot generation counter is bumped on release. On overflow the slot is disabled, and it can be re-enabled at safe points such as level transitions.
  - Size index bits to the maximum live count, use more generation bits for high-churn systems, and optionally reserve type bits.
  - Wrap handles in distinct structs for type safety.

  — [floooh](https://floooh.github.io/2018/06/17/handles-vs-pointers.html)
- **GTA III `CPool` handle scheme:**
  - The byte map holds `nId:7` plus `bEmpty:1` per slot.
  - `New()` scans forward from `m_nFirstFree` for an empty slot and increments `nId`.
  - `GetRef(obj) = (index << 8) + byteMap[index]`.
  - `GetAtRef(ref)` validates range and that `byteMap[ref>>8] == (ref & 0xFF)`, else returns null.

  Script (SCM) handles to peds, vehicles and objects are exactly these generational refs. — [plugin-sdk CPool.h](https://github.com/DK22Pac/plugin-sdk/blob/master/plugin_III/game_III/CPool.h)
- GTA III also uses `CReference` back-reference lists on entities (`m_pFirstRef`) so raw pointers to a deleted entity can be cleared, alongside deferred-deletion flags (`bRemoveFromWorld`, `bImBeingRendered`, `bStreamingDontDelete`). — [plugin-sdk CEntity.h](https://github.com/DK22Pac/plugin-sdk/blob/master/plugin_III/game_III/CEntity.h)
- Render resources need deferred destruction because the GPU may still be using them. — [floooh](https://floooh.github.io/2018/06/17/handles-vs-pointers.html)

### Inferences
- Recommended C17 shape:

  ```c
  typedef struct { uint32_t v; } EntityH;       // [index:20 | gen:12] or [index:24 | gen:8]
  typedef struct { uint32_t v; } RenderInstH;   // distinct struct per system = type safety (floooh)

  typedef struct {
      uint32_t  cap, count;
      uint8_t  *gen;        // or uint16_t; bump on free; disable slot on overflow
      uint32_t *free_list;  // FIFO with min-free threshold (Bitsquid) to delay reuse
      // SoA payload columns owned by the system, e.g. float *pos_x, *pos_y, ...
  } Pool;
  ```

  For dense iteration, add a sparse→dense indirection with swap-and-pop, so loops run over `0..count` with no holes. This is the classic slot map.
- **Streaming and lifetime:**
  - Each world cell, or each streamed map chunk like a GTA V YMAP, owns a contiguous range of static instances. Unloading the cell frees the range in one operation.
  - Static instances do not need generational handles if nothing long-lived references them. A `(cell_id, local_index)` pair plus a cell generation suffices.
  - Dynamic entities (peds, vehicles, pickups, mission entities) live in global generational pools, not owned by cells. Cells only index them spatially, the role of GTA III's sector lists.
  - The equivalent of "mission entity" or "streaming don't delete" is a pin flag or refcount on the pool slot that streaming respects.
- **Structural changes.** Spawn and despawn requests from streaming threads go into queues, applied at one sync point per frame. This is Fabian's "batch modifications then read". Destruction of GPU-side resources waits N frames, per floooh's caveat.
- Bit budget: 20 index bits allow about 1M live entities per pool, and 12 generation bits allow 4096 reuses per slot before disable. That is ample for tens of thousands of objects. A 64-bit handle (32 index + 32 gen) removes wrap concerns entirely and is the safer default for save files.

### Gaps
- Mertens' "Making the most of Entity Identifiers" (flecs ID layout: 32-bit index + generation in a 64-bit ID, with relationship pairs encoded in the upper bits) is linked from the FAQ but was not fetched. The flecs ID layout is therefore unverified here.
- No primary source found on how RAGE (GTA IV/V) ties entity lifetime to map-data streaming beyond community knowledge of YMAP/YTYP.

---

## 6. Spatial structures for open-world entities: grids, loose quadtrees, BVH

### Takeaway
GTA III used a flat uniform 2D grid of 40 m sectors with per-type entity lists, overlap lists for spanning entities, and a separate big-building list for far LODs. Loose quadtrees/octrees (Thatcher Ulrich) suit dynamic objects well: O(1)-style placement from radius and center, and no "small object stuck at root" hotspots. Ordinary trees, kd-trees and BVHs are recommended for static geometry. The ECS FAQ notes that spatial structures generally live outside the ECS.

### Cited Findings
- GTA III: a 100×100 grid of 40×40 sectors. Each `CSector` has per-type `CPtrList`s and per-type "Overlap" lists. `ms_bigBuildingsList` is kept separately. A query-wide scan code dedupes multi-sector hits. — [plugin-sdk CWorld.h](https://github.com/DK22Pac/plugin-sdk/blob/master/plugin_III/game_III/CWorld.h), [CSector.h](https://github.com/DK22Pac/plugin-sdk/blob/master/plugin_III/game_III/CSector.h)
- Loose octree/quadtree, Thatcher Ulrich:
  - Each node's bounds are doubled to 2N, overlapping its neighbors.
  - "An object's bounding radius completely determines its grid level", and the node is picked by the object's center.
  - "This scheme handles dynamic objects easily", with updates only when the center crosses a node boundary.
  - "There are no hotspots, like with a normal quadtree/octree, where even tiny objects would get put in huge squares."
  - Hierarchical culling still works, and empty-node flags skip empty cells.
  - Trade-offs: looser bounds mean more nodes to test, and the finest level is preallocated (N³ in 3D).
  - He recommends ordinary quadtrees, octrees or kd-trees for static geometry.

  — [Ulrich, Spatial partitioning / loose octrees](http://tulrich.com/geekstuff/partitioning.html)
- "Spatial structures like quadtrees and octrees are usually not directly stored in an ECS." — [ECS FAQ](https://github.com/SanderMertens/ecs-faq)
- Decima's StaticTile partitions static content by streaming group rather than purely spatially. — [Decima visibility slides (snippet)](https://www.slideshare.net/guerrillagames/decima-engine-visibility-in-horizon-zero-dawn)

### Inferences
- Suggested layering for the engine:
  1. **Streaming cells**, a coarse uniform 2D grid of e.g. 100–250 m cells or authored map chunks. Each owns its static instances as SoA arrays plus a cell-local static BVH, built offline, for culling and raycasts.
  2. **Dynamic entities** (peds, vehicles) in a global loose quadtree or a fine uniform hash grid, updated per frame only when they cross cells.
  3. **Far LOD / "big buildings"** in their own always-resident list or low-res cell layer, like GTA III's `ms_bigBuildingsList`.
- A uniform grid is the simplest C implementation and gives O(1) cell lookup. GTA's open world is mostly 2.5D, so a 2D grid with vertical extents in the bounds is usually enough. A loose quadtree is better when object sizes vary widely.
- Replace GTA III's pointer lists with per-cell index arrays of SoA bounds, and replace the scan-code trick with a per-query bitset, or keep scan codes; they are cheap.

### Gaps
- No primary source fetched on BVH use for open-world culling (for example, Frostbite or Decima BVH), on GTA V's spatial structure, or on modern GPU-driven culling. These need separate research.
- No benchmark data comparing grid, loose quadtree and BVH at tens of thousands of objects was found.
