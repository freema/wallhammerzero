# Plan verification: does the engine design hold up for strategy games?

Research from 2026-11-06. It checks decisions D23, D39, D41, D44–D50 and D57 and milestone M6 against public sources.

## Conclusion

The design holds up at its core. Two simulation layers, dense tables of mass entities, player commands as input and integer logic match how Cities: Skylines, Factorio and the open-source Egregoria do it. The three object classes (actors next to mass entities) have a direct precedent in Unreal Engine 5, where Mass runs traffic and crowds in the city next to game objects. The goal of 100,000 entities at 60 fps is realistic, provided movement is not ticked 60 times per second for every entity and paths are computed asynchronously.

The biggest gap is D45. Text tables are enough for definitions (buildings, technologies). They are not enough for a Stellaris-type game, because its content is largely a program: conditions, effects, scopes and modifiers. Without a declarative layer of conditions and effects, every event would be hand-written C code, and the engine could not generate a tooltip or safely save a deferred event.

Other gaps: the plan lacks sleeping of inactive entities, a rule for deterministic parallelism, a pathfinding service with invalidation after a graph edit, a road network as a global model with intersections, and several mandatory parts of the UI (virtualized tables, nested tooltips, formatted text, map modes). Nothing in the design is outright wrong.

Lesson from Cities: Skylines II: the simulation on ECS worked, the rendering sank the game (shadows, missing LOD, no occlusion culling). For us this means guarding the draw budget of 100,000 instances as strictly as the tick budget.

## How to read the sources

- **[P]** a primary source that I read directly (developer blog, official documentation, modders' wiki, repo).
- **[S]** a secondary source (press, community discussion).
- **[V]** the page could not be opened, I know only an excerpt from search results. Treat with reserve.

The Paradox forum (forum.paradoxplaza.com) returns a browser check to automated clients. I therefore know the Stellaris developer diaries only as [V]. The list of everything unverified is at the end.

---

## 1. Cities: Skylines 1 and 2

### What the sources say

**Cities: Skylines 1**

- Roads are nodes and segments. A segment has a maximum length, a long road is split. A segment stores the direction at its start and end and is converted to a Bézier curve with two computed control points. [P] https://www.gamedeveloper.com/design/game-design-deep-dive-traffic-systems-in-i-cities-skylines-i-
- The goal was a city of up to a million inhabitants. The number of inhabitants and cars on the street at the same time has a cap. The article gives no number. [P] same source
- Car movement is simulated about 4 times per second. Rendering interpolates position, rotation and speed between two simulation steps. More complex decisions are computed even less often. The developers write that the key to performance is to "spread the calculations out as much as possible". [P] same source
- A car does not recompute its path until something on it changes. When the path does not exist or a dead-end jam forms, the car teleports back. [P] same source
- The simulation runs on its own thread separate from the main (rendering) thread. The tick runs 60 times per second even during pause. The speeds are 1×, 2× and 4×. The main thread reads the state through interpolation (`renderFrameOffset` 0..1). Work is passed between threads through queues. [P] https://skylines.paradoxwikis.com/Modding_API
- Hard limits according to the printouts of a mod that displays them: citizens 1,048,576, citizen instances (people currently outside) 65,536, active vehicles 16,384, network nodes 32,768, buildings 49,152, lanes 262,144. [S] https://steamcommunity.com/sharedfiles/filedetails/comments/531738447
- **Correction of the brief:** the number 65,536 does not concern vehicles. It is the limit of citizen instances. Active vehicles are 16,384. An instance is released when a citizen enters a building. [S] https://steamcommunity.com/workshop/filedetails/discussion/2025147082/2970649384352688278
- The internals of pathfinding (A*, thread count) could not be verified from a primary source.

**Cities: Skylines 2**

- The game has no fixed agent limits. Pathfinding computes cost from four components: time, comfort, money, behavior. Agents replan on an event on the route. The simulation and pathfinding use all cores. [P] https://www.paradoxinteractive.com/games/cities-skylines-ii/features/traffic-ai
- The game is built on Unity ECS and Burst. Paradox states a speedup of some calculations of "up to 30–40×", without measurements. [P] https://www.paradoxinteractive.com/games/cities-skylines-ii/modding/dev-diary-3-code-modding
- Analysis by Paavo Huhtala: the decompiled code has about 1,200 systems. On the CPU side he calls DOTS a success. The problem is rendering. [P] https://blog.paavo.me/cities-skylines-2-performance/
  - A captured frame: 6,705 draw calls, of which 4,828 (72%) for shadows. Shadows took about 40 ms of 87.8 ms.
  - Across all passes, 121 million vertices on input.
  - Its own culling does only frustum, occlusion culling is missing.
  - Many props lack LOD. A pile of logs has over 100,000 vertices. Characters' teeth have 6,108 vertices and are always drawn.
  - The game treats every object as a shadow caster.
  - Unity Entities Graphics was not enough. Colossal Order wrote its own bridge between ECS and the renderer on top of `BatchRendererGroup`, its own culling, its own virtual texturing and its own skeletal animation.
  - The simulation is not the bottleneck. The game is limited by the graphics card.
  - The UI is Coherent Gameface (HTML, CSS, JS, React), not Unity UI.
- After release the studio said that the problems "are not deeply rooted in the game's foundation". [S, headline only] https://www.pcgamer.com/cities-skylines-2-studio-promises-performance-issues-can-and-will-be-fixed-we-want-to-assure-you-that-the-issues-are-not-deeply-rooted-in-the-games-foundation/
- The studio head Mariina Hallikainen in March 2026: "We completely overestimated the capabilities of the engine" and "our mistake was betting on something that was not proven". [V] https://www.pcgamer.com/games/sim/cities-skylines-2-boss-says-they-completely-overestimated-the-unity-engines-capabilities
- The studio's technical director gave a talk about ECS in CS2 at Unite 2024. I did not get its content. [V] https://classcentral.com/course/youtube-tapping-the-entity-component-system-for-cities-skylines-ii-unite-2024-350122

### Verdict

- **D46 (two simulation layers): HOLDS.** Both CS1 and CS2 keep the whole simulation state in memory and rendering is separate.
- **D44 (mass entities in dense tables): HOLDS.** CS1 has fixed-size arrays, CS2 ECS. Our own 64-bit IDs have no cap like the 16-bit IDs in CS1.
- **D47 (clock, speeds, slow ticks): HOLDS.** It matches CS1: 60 ticks, speeds 1×/2×/4×, car movement at 4 Hz, interpolation in rendering.
- **HAS A GAP:** the plan does not say that the simulation runs off the rendering thread and that rendering reads an interpolated snapshot of the state. D47 says only that rendering stays smooth.
- **HAS A GAP:** M6 measures the tick, but not the cost of drawing 100,000 instances. According to CS2 this is a bigger risk than the simulation. A budget for shadows, LOD and culling for the top-down view is missing.
- **HAS A GAP:** a solution for a dead-end jam and for an entity without a path is missing. CS1 solves it with teleporting.

---

## 2. Stellaris and the Clausewitz/Jomini engine

### What the sources say

**Why Stellaris slows down**

- According to Paradox the main cause is the number of pops in the late game. Every pop recomputes every 7 days how suitable it is for each job, and then competes with others on the planet. On top of that come checks of ethics, factions and happiness. [S] https://www.gamingonlinux.com/2020/02/big-games-of-stellaris-are-going-to-run-a-lot-smoother-in-the-260-update/
- Version 2.6 brought a 15–30% speedup in the late game, measured on a saved game with about 20,000 pops. [S] same source
- Diary 170 mentions redistributing pops to jobs every day and the possibility of running it multithreaded, one thread per empire. [V] https://forum.paradoxplaza.com/forum/developer-diary/stellaris-dev-diary-170-performance-and-other-technical-issues.1335134/
- Before version 4.0 Paradox wrote that many calculations depend on others and therefore must run in sequence, not in parallel. [V] https://admin-forum.paradoxplaza.com/forum/developer-diary/stellaris-dev-diary-366-announcing-stellaris-4-0.1726042
- Recomputing modifiers is expensive. The modders' wiki advises using a display-only modifier where there is no real effect, "because updating modifiers is costly". [P] https://stellaris.paradoxwikis.com/Modifier_modding

**What version 4.0 (2025) changed**

- Pops were merged into groups by species, stratum and ethics. The groups produce "workforce", it fills jobs and the planet produces resources. The game computes once per planet instead of once per pop. [V] https://forum.paradoxplaza.com/forum/threads/stellaris-dev-diary-370-4-0-changes-part-4.1728047
- The current wiki (version 4.5) confirms: one pop group per combination of species, stratum, ethics. [P] https://stellaris.paradoxwikis.com/Population
- The result is disputed. Players report both improvement and worsening. Paradox later said that performance is the "highest priority", that it will be a "long road" and that the stronger 4.0 economy leads to more ships a hundred years earlier. [S] https://www.pcgamesn.com/stellaris/performance-fixes-shadows-of-the-shroud
- I found no before-and-after measurements from Paradox.

**How the engine is built**

- Clausewitz is a general foundation from 2007. Jomini is a layer on top of it for games on a map, first in Imperator: Rome. It added tools for modders. [S] https://www.pcgamesn.com/imperator-rome/paradox-new-engine-jomini
- Almost all content is in text files: `common/` (definitions), `events/`, `localisation/`, `interface/` (`.gui`, `.gfx`). A mod is a folder with the same structure. [P] https://stellaris.paradoxwikis.com/Modding
- The scripting language has: conditions (triggers), effects, scopes (country, planet, fleet…), modifiers, scripted conditions and effects for reuse, variables, `on_actions` (hooks on game events) and `defines` (global constants). [P] same source
- There are on the order of 350 effects and more. They include flow control: `if`, `else_if`, `switch`, `random_list`. [P] https://stellaris.paradoxwikis.com/Effects
- An event has: an id, a title, a description, a condition, immediate effects, options with their own conditions and effects. It is fired in four ways: by polling every day (expensive), by mean time to happen (being moved away from for performance), from an effect with a delay (`days = 200 random = 100`) and through `on_actions`. [P] https://stellaris.paradoxwikis.com/Event_modding
- Events pass context to each other: `root`, `from`, `prev` and saved targets (`save_event_target_as`). [P] same source
- The engine generates tooltips from effects by itself. [P] same source
- Modifiers combine by the formula `((base + sum of add) × (1 + sum of mult)) × (1 − reduction)`. Part of the modifiers is generated automatically by the engine from data (for every resource, ship class, technology category). Economic categories have parents and the parent's modifier applies to the children too. [P] https://stellaris.paradoxwikis.com/Modifier_modding
- The number of events in the game could not be verified. The "thousands" from the brief is an estimate.

### Are text tables and rules in native code enough?

For definitions yes. For events and conditions no. What would be missing:

1. **Conditions and effects as data.** In Stellaris, conditions are trees composed of named building blocks. A table with fixed columns cannot express that. Without it, every event is a function in C.
2. **A tooltip from a condition.** The player wants to see why a button cannot be pressed and what a choice will do. The engine can do that only if it sees the condition and the effect as data. It cannot read a function in C.
3. **A queue of deferred events that can be saved.** An event "in 200 days" must survive a save. A function pointer into a DLL is not valid after a hot reload. Stable names are needed.
4. **A modifier system in the engine.** Composition, sources, time limits, a breakdown in the tooltip and recomputation only on change.
5. **Scopes and passing of context** between events.
6. **Hooks on game events** (`on_actions`), so content reacts without polling every tick.
7. **Localization with value substitution** and with conditional texts.
8. **Game modding without a compiler.** Players of Paradox games mod in text.
9. **Data validation.** References to nonexistent keys must be caught by a tool, not by the player.

The solution does not have to be a general scripting language. Paradox itself does not use Lua. Its "script" is a data tree where each node is a condition or effect registered in the engine's code. For us the game DLL would register conditions and effects in the type registry (D43) and text files would only compose them. The logic stays in C and in integers. The content stays data.

### Verdict

- **D45 (no script, text tables): HAS A GAP.** For a builder strategy it is enough. For a Stellaris-type game the declarative layer of conditions and effects, the event queue, modifiers and hooks are missing. Whether this layer violates D45 must be decided by the owner.
- **D44 (mass entities): HOLDS, with an addition.** Lesson from 4.0: merge the same units into groups and compute per group. Tables allow it, but the plan does not name that pattern.
- **D47 (tick groups): HAS A GAP.** Paradox says calculations depend on each other and cannot be run concurrently. Tick groups need explicit order and dependencies.
- **D48 (multiple worlds): HOLDS.** A galaxy map and a view into a system.

---

## 3. Factorio

### What the sources say

- **Entity sleep.** Most entities "fall asleep" when they have nothing to do, and cost nothing while asleep. [P] https://factorio.com/blog/post/fff-148
- **Belts.** Originally every belt piece was updated separately. Since 0.15 the gaps between items are stored, not positions. On a freely flowing line only the two end gaps change. Item movement became 50–100× faster, overall 5–10× was expected. [P] https://factorio.com/blog/post/fff-176
- **Multithreading runs into memory.** Concurrent updating of trains, electricity and belts was slower than serial. Threads invalidated each other's caches, because independent objects lay on the same memory page. Reading in multiple threads scales well, writing does not. [P] https://factorio.com/blog/post/fff-215
- **Deterministic parallelism of belts.** Lines are split into groups that do not affect each other. Each group runs on its own thread. Waking inserters is not done immediately, but queued and the main thread performs it in a fixed order. Belt time dropped from 4 ms to 1.6 ms. [P] https://factorio.com/blog/post/fff-364
- **Version 2.0.** [P] https://factorio.com/blog/post/fff-421
  - Roboports switch off when they have no work: from 1 ms to 0.025 ms per tick.
  - Robots store movement intent. They update only once per 20 ticks (moving) or 60 ticks (standing) and rendering interpolates the movement. A 10–25% speedup in saved games with many robots.
  - A multithreaded electric network was rejected: time dropped from 0.5 to 0.39 ms, but CPU load grew from 0.5% to 15%. The computation waits for memory.
  - Reading circuits in multiple threads: 14.9× in an artificial test, 9.5% in a real game.
- **Lockstep.** Every player computes the whole simulation. Only player inputs go over the network. Any deviation leads to desynchronization. [P] https://factorio.com/blog/post/fff-76
- Desynchronization comes from a bug in code, in a mod or from faulty hardware, not from the network. Factorio has a test mode that saves and loads the game every tick. [P] https://wiki.factorio.com/Desynchronization

### Verdict

- **D44, D28, D41 (tables, integer logic, commands as input): HOLD.** It is the same recipe as in Factorio.
- **HAS A GAP: entity sleep.** "Work spread across frames" (D47) is time slicing. Factorio gains the most from idle entities not being processed at all and being woken by an event.
- **HAS A GAP: a rule for a parallel tick.** Bit-exact agreement on 3 OSes requires that the result does not depend on thread order. The pattern from FFF 364: independent groups and deferred effects executed in a fixed order.
- **HAS A GAP: expectations from 12 cores.** Mass simulation is memory-bound. Twelve cores will not give twelve times. What decides is data density and what does not have to be computed at all.
- **HAS A GAP: tools for hunting desynchronization.** A hash after replaying commands is in the plan. A save–load–continue test with a matching hash is missing.

---

## 4. Other games with mass simulation

### What the sources say

- **Supreme Commander 2 (flow field tiles).** The world is divided into sectors of 10 × 10 cells connected by portals. A path request runs A* only over the portal graph. Then a direction field is built for each sector. The fields are cached and shared between requests. A change of the world marks a sector dirty and the rebuild runs from a priority queue in time slices of milliseconds. Field integration can be spread over threads. [P] https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter23_Crowd_Pathfinding_and_Steering_Using_Flow_Field_Tiles.pdf
- **A/B Street.** It abandoned a fixed time step and moved to an event-driven simulation. An agent stays in a state and schedules its own transition. Cars are queues per lane. The exact position is computed only when it needs to be drawn. Reason: stepping is "slow by nature", because agents repeatedly check for changes that did not happen. [P] https://a-b-street.github.io/docs/tech/trafficsim/discrete_event/index.html
- **Unreal Engine 5, City Sample.** Traffic and crowds run on MassEntity, a data-oriented framework for thousands of agents. Nearby characters are fully animated models, distant ones are static meshes with vertex animation. [P] https://dev.epicgames.com/documentation/en-us/unreal-engine/city-sample-project-unreal-engine-demonstration
- The demo The Matrix Awakens: 17,000 simulated cars in traffic, 35,000 simulated pedestrians, 45,073 parked cars. [S] https://blog.playstation.com/2021/12/09/the-matrix-awakens-an-unreal-engine-5-experience-hits-ps5-today/
- **Anno 1800.** Its own engine built for constant map changes, large numbers of objects and a top-down camera. Other regions stay in memory so switching is instant. The cost is memory. [P] https://www.anno-union.com/devblog-the-anno-engine/
- **They Are Billions.** Its own engine developed from the studio's older game engine, about 20,000 units reported. The pathfinding technique is not published. [P, announcement from 2017] https://numantiangames.com/News/2017-05-31-new-game-they-are-billions/
- **Songs of Syx.** Java, "tens of thousands" of individually simulated inhabitants according to the Steam description. The version history states a new pathfinder twice as fast, tested on a settlement with 28,000 inhabitants. I found no technical description from the author. [P/S] https://store.steampowered.com/app/1162750 and https://songsofsyx.com/wiki/index.php/Version_history
- **Dwarf Fortress.** According to the wiki, most of the time goes to unit turns (over 60% in large fortresses) and pathfinding makes up less than 10% of that. Version 50 added multithreaded visibility computation. [V] https://dwarffortresswiki.org/index.php/Lag
- **Manor Lords.** Unreal Engine 4, since August 2024 Unreal Engine 5. Players report slowdown at large population. The author did not describe the technique. [S] https://www.gamesradar.com/games/city-builder/hit-city-builder-manor-lords-is-switching-to-unreal-engine-5-soon-but-its-dev-is-being-careful-about-enabling-performance-heavy-features-to-help-keep-things-running-as-smoothly-as-possible
- **Transport Fever 2.** Only player analyses: late-game slowdown grows with population and road network size. I found no developer statements on the technique. [S] https://steamcommunity.com/app/1066780/discussions/0/1657817111851997351
- **Workers & Resources.** Only player reports of slowdown. Nothing from the developers.

### Common techniques

| Technique | Where it is documented |
|---|---|
| Time slicing (different frequencies, work across frames) | CS1 (cars 4 Hz), Factorio 2.0 (robots every 20/60 ticks), SupCom2 (time slices) |
| Sleep and wake by events | Factorio, A/B Street |
| Merging units into groups | Stellaris 4.0 (pop groups), Factorio (belt lines) |
| Rendering interpolates a sparse simulation | CS1, Factorio 2.0, A/B Street |
| Hierarchical pathfinding | SupCom2 (portal graph and tiles) |
| Shared results and path caches | SupCom2 (field cache), CS1 (path is not recomputed) |
| Dirty marks and background rebuild | SupCom2 |
| Cheaper display of distant agents | UE5 City Sample |

I found no explicit description of "simulation LOD" (a distant agent is simulated coarsely) in a primary source for these games. What is documented is merging into groups and cheaper display.

### Verdict

- **D46, D47: HOLD.** Time slicing and separating simulation from rendering are common to all.
- **HAS A GAP:** the plan does not name sleep and wake, event-driven scheduling or merging into groups. These are the three techniques with the largest documented benefit.
- **D48 (multiple worlds): HOLDS**, with a note from Anno: multiple worlds in memory cost memory. On 24 GB this needs to be measured.

---

## 5. Pathfinding for 100,000 agents on a road graph

### What the sources say

- **A* per agent, no recomputation.** CS1 computes a path once and recomputes it only when something on it changes. [P] https://www.gamedeveloper.com/design/game-design-deep-dive-traffic-systems-in-i-cities-skylines-i-
- **Cost-based search on all cores.** CS2. [P] https://www.paradoxinteractive.com/games/cities-skylines-ii/features/traffic-ai
- **Contraction hierarchies (CH).** Preprocessing adds shortcuts and a query then takes microseconds. [P] https://en.wikipedia.org/wiki/Contraction_hierarchies
  - On a Western Europe network (18 million nodes) preprocessing comes to tens of minutes and a query to tenths of a millisecond. [V] http://arxiv.org/abs/1504.05140
  - A/B Street uses CH optionally. The map does not change between edits there. [P] https://a-b-street.github.io/docs/tech/map/index.html
- **Customizable CH.** Changing weights (traffic) costs about 10 s on a single thread on a continent network and a little over a second in parallel. It assumes that weights change, not the shape of the graph. [P] https://arxiv.org/pdf/2502.10519
- **Flow fields.** Suitable for many agents with a common goal on a grid. [P] the Game AI Pro chapter above
- **Reading in multiple threads scales.** Pathfinding is reading a graph, so it can be distributed to cores. [P] https://factorio.com/blog/post/fff-215

### My own estimate (not measured, only an order-of-magnitude argument)

- A city graph in the game has tens of thousands of nodes, not millions. One A* query in C comes to the order of tenths of a millisecond.
- 100,000 agents, each a new path once every few minutes, gives hundreds of queries per second, so a few queries per frame. That fits on one core and can be distributed over more.
- Movement is more expensive. 100,000 entities × 60 Hz is 6 million updates per second. A plain move along an edge in a dense table can handle that. Following the car ahead and intersections make it more expensive. That is why CS1 ticks movement at 4 Hz.
- CH does not suit a graph that the player draws. Every new road changes the shape of the graph and the preprocessing would have to be repeated. This is my conclusion from the properties of the method, not a citation.
- The graph analogue of a flow field is a shortest-path tree from the goal (one Dijkstra per goal serves everyone heading there). It pays off when there are few goals. Also my conclusion, without a source.

### Is 100,000 agents at 60 fps on 12 cores realistic?

Yes, with conditions. Support:
- CS1 from 2015 holds 16,384 cars and 65,536 people outside with the simulation mostly on one thread.
- Epic's demo from 2021 holds 17,000 cars and 35,000 pedestrians on a console.
- Factorio holds factory megabases at 60 ticks per second thanks to sleep and merging.

Conditions: tick movement less often than rendering and interpolate, compute paths asynchronously with a per-frame budget, put idle entities to sleep, draw instanced with LOD.

### Verdict

- **D50 (100,000 entities on a graph): HOLDS.** The goal is realistic.
- **HAS A GAP:** the criterion "tick holds its budget" does not say how often movement ticks, how many paths may be computed per frame and what happens to paths after a graph edit.
- **HAS A GAP:** "maximum speed" has no number. At 4× the simulation costs four times as much. A rule is missing for what happens when the simulation cannot keep up (slow down time, not rendering).
- **HAS A GAP:** the design lacks a pathfinding service as a named part of the engine (request queue, cache, invalidation, hierarchy).

---

## 6. Tools for drawing roads and zones

### What the sources say

- **CS1.** The player places nodes. Two nodes form a segment. A segment is converted to a Bézier curve. The road geometry is a static mesh with fixed tessellation that a vertex shader deforms. UVs along the length are computed from the curve length. Intersections are done similarly. A segment stores connections to its neighbors and the road type. The type determines the number of lanes and mesh offsets. [P] https://www.gamedeveloper.com/design/game-design-deep-dive-traffic-systems-in-i-cities-skylines-i-
- **CS2.** The studio separated the road network from the tool used to draw it. The tool offers guide lines for slope, angles and crossings. The hardest part was generating roundabout lanes with an arbitrary number of connections. Early versions had "completely exploding textures" and holes in the world. Not all cases were solved by release. [P] https://www.gamedeveloper.com/design/how-colossal-order-turned-roads-into-the-backbone-of-cities-skylines-ii
- **A/B Street.** A road is a segment between exactly two intersections. It is split into lanes. An intersection has an explicit list of turns, each connecting a source and a destination lane. [P] https://a-b-street.github.io/docs/tech/map/index.html
- Geometry in A/B Street: the centerline is widened into a polygon (miter joins, bevel on overshoot), overlapping roads are cut perpendicular to the centerline and the intersection polygon is created by sorting the end points clockwise. The author writes that the procedure has "many flaws". It fails on short segments, nearly parallel ramps and divided roads. The point sorting can give a self-crossing polygon. [P] https://a-b-street.github.io/docs/tech/map/geometry/index.html
- **Egregoria** (Rust, GPL-3.0). The map is "just raw data and operations" (build a road here). State changes go through `WorldCommand` commands. The simulation is pure and deterministic and supports lockstep. The road mesh is not in the road data. The renderer holds it in a cache by road ID. It also has a headless binary. [P] https://github.com/Uriopass/Egregoria/blob/master/ARCHITECTURE.md
- **Citybound** (Rust, AGPL-3.0, in progress). It focuses on microscopic simulation and planning. The architecture is described by a Living Design Doc in Notion, which I did not read. The claim that the basic unit of geometry is a single lane I know only from a fork's README. [P/V] https://github.com/citybound/citybound and https://github.com/codiem/citybound
- How CS ties the zone grid to the road, I did not find in a primary source.

### Verdict

- **D39 (a player command is the generator's input): HOLDS.** Egregoria does the same: commands change the raw map data and the renderer computes the mesh and keeps it in a cache.
- **HAS A GAP: "the affected cell is regenerated" is too coarse.** The road network is a global model (nodes, segments, lanes, turns). A segment commonly crosses multiple cells of 256 m. The affected segment and its intersections should be regenerated. A cell is just a bucket for rendering.
- **HAS A GAP: intersection geometry.** According to both A/B Street and CS2 it is the hardest part and breaks on edge cases. The plan has no task or test set for it.
- **HAS A GAP: derived data.** After an edit, the graph of lanes and turns must be recomputed in one step and the agents' paths through the changed place invalidated.
- **HAS A GAP: preview while drawing.** The player drags the mouse and wants to see the road at once. The generator must run every frame for one segment within the budget.
- Licenses: Citybound is AGPL, Egregoria GPL-3.0. We can study the methods, but not take the code. I did not verify the A/B Street license.

---

## 7. UI of strategy games

### What the sources say

**Paradox (Jomini GUI, according to the CK3 wiki)** [P] https://ck3.paradoxwikis.com/Interface

- The UI is described in text `.gui` files.
- Containers: `window`, `hbox` and `vbox` with expansion rules, `flowcontainer`, `scrollbox`.
- `fixedgridbox` is a list with equally sized items for long lists, for performance. `dynamicgridbox` has items of different sizes.
- Templates and types for reuse. Part of an instance can be overridden through `blockoverride`.
- Data binding: `datacontext` (one object), `datamodel` (a list). Values are substituted in square brackets with formatting, for example `[Character.GetName]` or `|1` for one decimal place.
- Scripted GUIs: a button has in its data an effect, a visibility condition and a validity condition, and a tooltip is built from them.
- Hot reload: a saved `.gui` is loaded automatically. An inspector shows the file and line of an element.
- Animation through named states (`_show`, `_hide`).

**Nested tooltips.** CK3 has tooltips within tooltips. Hovering over a game term in an open tooltip opens another. Terms hook into the encyclopedia by themselves, including content from mods. [S] https://www.pcgamer.com/the-crusader-kings-3-team-is-working-hard-to-make-the-game-easier-to-learn

**Factorio.** Its own GUI. Everything is measured in modules of 4 pixels. Scale goes in steps of 25% from 75 to 200%, so the layout does not break. Styles and code are shared between windows. Every window goes through a process: UX document, mockup, implementation, revision. The GUI was the main brake on the release of version 0.17. [P] https://factorio.com/blog/post/fff-277

**Cities: Skylines II.** The UI is web technology (Coherent Gameface, React). [P] https://blog.paavo.me/cities-skylines-2-performance/

### What the UI layer must be able to do

Documented by the sources above:
- Tables and lists with thousands of rows, only visible rows are drawn.
- Data binding with number formatting.
- Nested tooltips and game terms as links in text.
- A tooltip composed of conditions and effects (related to item 2).
- Templates, hot reload, an element inspector.
- A fixed grid and UI scale.

From the practice of the genre, without a citation in this research:
- Sorting and filtering of tables.
- Map modes (coloring the map by data).
- Notifications and alerts.
- A ledger and graphs over time.
- A modifier breakdown in the tooltip.
- Localization with value substitution and icons in text.

### Verdict

- **D57 (own `eng_ui`, description in text, data binding): HOLDS.** It is the same direction as Jomini.
- **HAS A GAP: formatted text.** Nested tooltips need text with links, colors and icons inside a line. Clay handles layout and SDL_ttf lays out plain text. This will be our own work.
- **HAS A GAP: list virtualization.** A table with 100,000 rows must not build 100,000 elements.
- **HAS A GAP: map modes.** They are not UI, but a renderer feature: color segments, buildings or territory by a column of the simulation table. Missing from the plan.
- **HAS A GAP: scope.** Factorio's experience says UI is the main release brake. M6 with one panel verifies the basis, not the breadth.

---

## 8. General engines and strategy games

### What the sources say

- **Why an own engine (Anno).** Small studios build the engine around their mechanics. The Anno engine is made for constant map changes, many objects and a top-down camera. According to the developers it does not suit racing games or RPGs, because it lacks a character equipment system and vehicle physics. [P] https://www.anno-union.com/devblog-the-anno-engine/
- **Paradox.** A general foundation (Clausewitz) and on top of it a layer for games on a map (Jomini). [S] https://www.pcgamesn.com/imperator-rome/paradox-new-engine-jomini
- **A general engine and a city-builder strategy.** Both CS1 and CS2 run on Unity. For CS2 the studio had to write a bridge between ECS and the renderer, culling, virtual textures and animation. [P] https://blog.paavo.me/cities-skylines-2-performance/
- Lesson from the studio head: do not bet on unproven technology. [V] https://www.pcgamer.com/games/sim/cities-skylines-2-boss-says-they-completely-overestimated-the-unity-engines-capabilities
- **A general engine that does a GTA-style city and mass simulation.** Unreal Engine 5: game objects (Actors) and next to them MassEntity for traffic and crowds. It is the same split as our actors and mass entities. [P] https://dev.epicgames.com/documentation/en-us/unreal-engine/city-sample-project-unreal-engine-demonstration
- Mass limitations: according to an answer on the Epic forum MassTraffic is not officially supported outside City Sample and Mass has only minimal multiplayer support. [S] https://forums.unrealengine.com/t/tutorial-your-first-60-minutes-with-mass/794314
- **Strategy games on a general engine exist.** Manor Lords runs on Unreal Engine. [S] https://www.gamesradar.com/games/city-builder/hit-city-builder-manor-lords-is-switching-to-unreal-engine-5-soon-but-its-dev-is-being-careful-about-enabling-performance-heavy-features-to-help-keep-things-running-as-smoothly-as-possible
- Cities: Skylines 1 and 2 run on Unity. [V] https://unity3d.com/case-study/cities-skylines and [P] https://blog.paavo.me/cities-skylines-2-performance/
- An example of a large Stellaris-type strategy on a general engine I did not verify in this research.

### What follows

- A strategy game does not need a different renderer. It needs a different game layer: data, events, modifiers, time, UI. That is most of what Jomini does on top of Clausewitz.
- The split into actors and mass entities has a precedent at Epic and works in a GTA-style city.
- The renderer must handle both a street view and a view from above. CS2 shows that the view from above fails: too much geometry, shadows from everything, no occlusion culling.
- Constant map changes are a basic requirement for a strategy game. For us D39 covers them.
- General engines run into strategy games where their ready parts do not expect mass (Unity in CS2). With our own engine this risk does not exist, but everything is our own work.

### Verdict

- **D15, D23 (a general engine for strategy games too): HOLD.** A general engine that does both exists, and our object split matches its solution.
- **HAS A GAP:** the plan does not describe the strategy game layer as a whole. It has pieces (clock, tables, UI), but not events, modifiers and map modes.

---

## Impact on the plan

### Add to the design

1. **Declarative conditions and effects in data** (waiting for the owner's decision, question 1). The game DLL registers conditions and effects in the type registry. Text files compose them into trees. From them the engine can do evaluation, a tooltip and a reference check.
2. **An event queue in the engine.** Deferred events with stable names, saveable into a save, and hooks on game events.
3. **A modifier system in the engine.** Add/mult composition, source, duration, recomputation only on change, a breakdown for the tooltip.
4. **Sleep and wake of mass entities.** A list of active entities. Idle ones are not iterated. An event or time wakes them.
5. **A scheduler by wake time** as a complement to tick groups. An entity says when it should be processed again.
6. **A rule for deterministic parallelism.** In parallel only independent groups. Effects across group boundaries are deferred and executed in a fixed order. The order and dependencies of tick groups are explicit.
7. **Simulation off the rendering thread.** Rendering reads an interpolated snapshot of the state. Write into D47.
8. **A pathfinding service.** A request queue, a per-frame budget, computation on multiple cores, a cache, invalidation after a graph edit, a hierarchy. The default method is A*. Not contraction hierarchies, because the player changes the graph.
9. **The road network as a global model.** Nodes, segments, lanes, turns. Regeneration by dirty segments and intersections, not by cells. Make D39 more precise.
10. **A task for intersection geometry** with a set of bad cases: a sharp angle, a short segment, many arms, a slope, a roundabout.
11. **Merging into groups** as a recommended pattern for populations (per Stellaris 4.0).
12. **UI:** formatted text with links and icons, nested tooltips, virtualized lists, sorting, graphs, notifications, a fixed grid and scale.
13. **Map modes** as a renderer feature: coloring by a simulation column.
14. **A rule for a simulation that cannot keep up:** game time slows down, rendering holds its frames. The maximum speed gets a number.
15. **A solution for an entity without a path and for jams** (return, cancel, report to the player).

### Change in test scene C (M6)

- Measure three cases separately: all 100,000 entities moving, 20% moving and the rest asleep, and the maximum time speed.
- Set the movement tick frequency (for example 10 Hz with interpolation) and the path budget per frame. Write into measurement 24.
- The player draws a road **during traffic**. Paths through the changed place are invalidated and recomputed without a frame hitch.
- The scene contains at least one intersection with four arms and one with a sharp angle.
- The road preview while dragging the mouse holds the frame budget.
- Extend the determinism test: save in the middle of a run, load, continue. The hash must match a run without saving. The same hash at 1 and at 12 threads.
- Measure the draw cost when looking at the whole map: draw calls, triangles, shadow time. Set a cap.
- A panel with a table has at least 10,000 rows, can be sorted and has a nested tooltip.
- One event from data: condition, delay, effect, a tooltip generated from data. It survives a save. (Only if the owner approves item 1.)
- One map mode (for example traffic density per segment).
- The second world must tick at the same time as the first, not just exist. Measure the memory of both.

### What does not change

- D44 (three object classes, no generic ECS), D46, D48, D28 and D41. The sources support them.
- The engine stays general. No source says it cannot be done.

---

## Questions for the owner

1. **May the data contain a declarative tree of conditions and effects?** It is not a general scripting language. The logic stays in C in the game DLL, the data only compose it. Without it a Stellaris-type game is written event by event in C and the engine cannot do tooltips from conditions. Is this in line with D45, or an exception?
2. **Should players be able to modify the game without a compiler?** If yes, item 1 is a necessity. If no, it can all be done in C.
3. **How faithful should traffic be from above?** Every car visible and individually simulated across the whole city (like Cities: Skylines), or may distant parts be simulated coarsely and merged?
4. **What is the maximum time speed?** 4× like Cities: Skylines, or "whatever the machine can do" like big strategy games? It determines the tick budget.
5. **Is lockstep multiplayer a real goal, or just an open door?** If a goal, it pays to pay for deterministic parallelism and tools for hunting desynchronization already in M6. If just a door, a hash on one thread is enough.
6. **What scale should the large strategy game have?** The number of planets, populations and fleets decides whether groups are enough or individuals must be simulated.
7. **How much UI belongs in M6?** Only a table and a tooltip, or also nested tooltips, a map mode and a graph? According to Factorio, UI is the main brake.

---

## What could not be verified

- **Stellaris developer diaries** (170, 366, 370, 385): the Paradox forum blocks automatic reading. I know the content only from search engine excerpts and secondary articles.
- **Measured benefit of Stellaris 4.0:** I found no official before and after numbers. Player reports contradict each other.
- **The number of events in Stellaris:** not determined.
- **The internals of pathfinding in CS1** (algorithm, thread count): no primary source.
- **CS1 limits:** only from printouts of a community mod, not from the developers. The limit of parked cars and segments is not confirmed.
- **The Colossal Order talk at Unite 2024** and **the interview with Mariina Hallikainen (PC Gamer, 2026):** content only from excerpts.
- **The reason CS2 moved to DOTS** in the studio's own words: not found. One secondary article states that the goal was to remove the CPU bottleneck of the first game and enlarge the scope of the simulation. [V] https://tdp-frontend.pages.dev/article/2026-03-18-colossal-order-admits-unity-gamble-that-sank-cities-skylines-2-4ee6a7e7
- **Techniques in Songs of Syx, They Are Billions, Transport Fever 2, Workers & Resources and Manor Lords:** the developers did not describe them publicly, or I did not find a description.
- **Dwarf Fortress wiki:** the page returned error 429. Data only from an excerpt.
- **Numbers for contraction hierarchies on the European network:** from an excerpt of an overview article, I did not read the table.
- **Counts from The Matrix Awakens demo:** from the press and the PlayStation blog. Epic's page returned 403.
- **Citybound:** I did not read the Living Design Doc.
- **Linking zones to roads in Cities: Skylines:** no primary source.
- **A/B Street license:** not verified.
- **GDC talks** on the topic: I found and opened no relevant one. The Game AI Pro chapter is a book source, not GDC.
- **Estimates in item 5** (A* cost, queries per second) are my order-of-magnitude reasoning. Measurement 24 will decide.
