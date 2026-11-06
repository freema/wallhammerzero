# Procedural worlds and assets in production: studio case studies

Researched 2026-11-06 for Wallhammer Zero (native C17, all graphics from code, hierarchical cells L3–L0, deterministic generators, per-cell deltas, versioned generator domains, owner as art director in a built-in studio).

Source-quality legend used below:
- **[primary]**: studio's own slides, blog or talk abstract.
- **[interview]**: claims made by developers in press or interviews. These are developer statements, not independently verified.
- **[secondary]**: press summary, community analysis or forum post.

Limits of this research: GDC Vault recordings are login- or paywall-gated, and the Guerrilla slide PDF was too large to fetch (over 10 MB). Several cases therefore rest on talk abstracts plus 80.lv or studio-blog summaries. Detail that could not be confirmed is listed under Gaps, not stated as fact.

---

## 1. Guerrilla Decima: Horizon Zero Dawn / Forbidden West GPU procedural placement

### Takeaway
Horizon generates all vegetation and much of the ambient world content at runtime on the GPU, around the player, from artist-authored rule graphs evaluated over painted and derived world data maps. The design goals were explicitly "data driven, deterministic, locally stable", which is the same contract Wallhammer Zero needs for cell regeneration.

### Cited Findings
- GDC 2017 talk "GPU-Based Run-Time Procedural Placement in Horizon: Zero Dawn" by Jaap van Muijden, senior tech programmer at Guerrilla. [primary] — [GDC Vault](https://www.gdcvault.com/play/1024120/GPU-Based-Run-Time-Procedural); [Guerrilla summary](https://www.guerrilla-games.com/read/gpu-based-procedural-placement-in-horizon-zero-dawn)
- The system "dynamically creates the world around the player" while they walk through it. It places rocks and trees and also sounds, effects, wildlife and gameplay elements. [primary] — [Guerrilla summary](https://www.guerrilla-games.com/read/gpu-based-procedural-placement-in-horizon-zero-dawn)
- The pipeline runs from a graph editor, where artists author placement rules, to GPU placement algorithms. The talk says artists can "paint in a tree line, redirect roads, move mountains, convert a desert into a tropical swamp" and the content follows. [primary] — [Guerrilla summary](https://www.guerrilla-games.com/read/gpu-based-procedural-placement-in-horizon-zero-dawn)
- Slide figures, from a search summary of the slide deck (not read in full): 500+ asset types, 100,000+ objects in scene, about 250 µs average GPU busy load, and procedural placement used for **all** vegetation. The listed design goals are fully data driven, **deterministic** and **locally stable**. The team moved from a CPU approach to a GPU one. [primary, via search summary] — [Slides PDF](https://www.guerrilla-games.com/media/News/Files/GDC2017_VanMuijden_GPUBasedProceduralPlacementInHorizonZeroDawn.pdf)
- 80.lv reports the move "from traditional CPU-based placement system to real-time" and describes artists working with "production logic graphs". 80.lv dates the talk to GDC 2020, while GDC Vault and Guerrilla's slide file name say GDC 2017. Treat 2017 as correct. [secondary] — [80.lv](https://80.lv/articles/real-time-procedural-placement-in-horizon-zero-dawn)

### Inferences
- "Locally stable" means that changing the input in one area must not reshuffle placements elsewhere. That is the property per-cell deltas depend on: a delta keyed to a generated object ID survives only if neighbouring regeneration does not renumber or move that object. Wallhammer Zero should make local stability a written generator contract, alongside determinism.
- Horizon's split (artists paint low-frequency maps, the GPU derives high-frequency placement at runtime) maps onto L3/L2 authored or generated fields feeding L1/L0 runtime placement.
- 250 µs of GPU time for the whole placement load shows that runtime placement is affordable when it runs only over newly streamed tiles.

### Gaps
- Details of footprint/exclusion handling, dithering, tile sizes and how hand-placed objects suppress procedural ones were not confirmed (the slide PDF was too large to fetch). The full slides are the place to look.
- No public Forbidden West (2022) update to the placement system was found in this pass.

---

## 2. Ubisoft: Far Cry 5 (Dunia), Ghost Recon Wildlands (AnvilNext), Snowdrop (Avatar: Frontiers of Pandora)

### Takeaway
Ubisoft's pattern is **offline, Houdini-authored generators baked on a farm**, driven by designer inputs (waypoints, rules, presets), with re-cooks measured in minutes. Snowdrop's newer scatter system for Avatar moved to **in-editor node graphs with live preview in seconds**, where procedural output is a first pass and artists hand-edit afterwards.

### Cited Findings
**Far Cry 5 (2018)**
- Étienne Carrier (Ubisoft technical artist) presented "Procedural World Generation of Far Cry 5" at GDC 2018 and at Houdini HIVE Utrecht 2018. The framing was how to "fill up 100 square km of wilderness with a terrain changing every day". [primary abstract] — [GDC Vault](https://gdcvault.com/play/1025557/Procedural-World-Generation-of-Far); [Vimeo HIVE talk](https://vimeo.com/273986776)
- Houdini tools covered biomes, terrain texturing, freshwater networks, cliff rocks, power lines, sand, fog density map and the world map. [secondary] — [80.lv](https://80.lv/articles/houdini-procedural-world-generation-of-far-cry-5/); [PlayStation Blog](https://blog.playstation.com/2018/03/22/the-procedural-world-generation-of-far-cry-5/)
- Vegetation placement restricts each species to suitable environments, and grass orientation follows a wind vector map. [interview/blog] — [PlayStation Blog](https://blog.playstation.com/2018/03/22/the-procedural-world-generation-of-far-cry-5/)
- Stated rationale: not every square metre gets artist attention, so procedural systems fill the empty areas. Filling space is easy, but making it look natural is the hard part. [secondary] — [80.lv](https://80.lv/articles/houdini-procedural-world-generation-of-far-cry-5/)

**Ghost Recon Wildlands (2017)**
- GDC 2017 talk "Ghost Recon Wildlands: Terrain Tools and Technology" by Guillaume Werlé and Benoit Martinez. [primary abstract] — [GDC Vault](https://gdcvault.com/play/1024029/-Ghost-Recon-Wildlands-Terrain)
- **Roads:** a customized terrain-following pathfinder adds roads one at a time to the existing network. Designers give waypoints and a road type, plus parameters for curviness, areas to avoid and how strongly new roads snap to existing ones. Steep slopes and tight turns raise cost, and existing roads are cheap, so new roads branch off existing ones and wind up mountainsides. [interview] — [80.lv](https://80.lv/articles/procedural-world-building-in-ghost-recon-wildlands/)
- A terraforming tool turns the road network into heightmaps, materials and mask textures. It runs **only on the render farm**, and results come back within minutes of submission. [interview] — [80.lv](https://80.lv/articles/procedural-world-building-in-ghost-recon-wildlands/)
- Railroads use shallower, sweeping paths with tunnels and bridges. Rivers flow only downhill to the nearest water body. [interview] — [80.lv](https://80.lv/articles/procedural-world-building-in-ghost-recon-wildlands/)
- **Towns:** version 1 made rural villages, and version 2 added grid roads, sidewalks and building rows. A packing algorithm fills road-bounded areas outward from the town centre by priority or ratio. There are 70+ per-building rules (distance to centre, water or rail, slope, district, neighbours). For example, a church blocks other religious buildings within about 150 m. [interview] — [80.lv](https://80.lv/articles/procedural-world-building-in-ghost-recon-wildlands/)
- Cook time grows exponentially with settlement area, up to 20 minutes for the largest towns. Mitigations were disk caching and computing in clusters. A "settlement instancer" places the finished town and allows final tweaks **without a full re-cook**. The large town Barvechos was rebuilt more than five times. Presets live in a UI, so a town changes by editing rules and re-exporting. [interview] — [80.lv](https://80.lv/articles/procedural-world-building-in-ghost-recon-wildlands/)
- An academic group (LIRIS, Galin et al.) says its road-network and village generation methods were adapted and implemented by Ubisoft for Wildlands. [primary academic claim] — [LIRIS page](https://perso.liris.cnrs.fr/egalin/2014-2010.html)
- A lead artist says Houdini terrain tools were extended to terraform, carve roads, add detail and preserve UVs. A forum post says Houdini Engine was used for buildings, roads, railroads and bridges. [interview / forum, secondary] — [80.lv landscape pipeline](https://80.lv/articles/landscape-and-material-pipeline-of-ghost-recon-wildlands/); [World Machine forum](https://forum.world-machine.com/t/wm-used-in-ghost-recon-wildlands/4435)

**Snowdrop: Avatar: Frontiers of Pandora (2023)**
- Massive describes the Snowdrop scattering system as "a procedural placement tool" built on a node system and written from scratch for Avatar. It has since become a general Snowdrop feature. [primary, studio blog, about January 2024] — [Massive](https://www.massive.se/?p=18290)
- Rules are **parent-child seeding by radius**: a tree seeds nearby plants, and a river seeds pebbles on its banks, which seed flowers. Objects go into layers (riverbed, water surface, cliffs, floating islands). Scattering started on terrain only and was later extended to scatter on props and assets. [primary] — [Massive](https://www.massive.se/?p=18290)
- Graph changes show up in the running game "within seconds". Artists can build a map from rules, assets and hierarchies without code. [primary] — [Massive](https://www.massive.se/?p=18290)
- Scattering is the **first pass**. Artists then add, remove and move objects. Gameplay-critical areas can be handcrafted without scattering first. Gameplay coordination includes crafting materials that appear only on trees with specific bark. [primary] — [Massive](https://www.massive.se/?p=18290)
- GDC 2024: "Upgrading the Snowdrop Engine for the Massive World of Avatar: Frontiers of Pandora" by Joshua Simmons. Only the abstract was available. [primary abstract] — [GDC Vault](https://gdcvault.com/play/1034412/Upgrading-the-Snowdrop-Engine-for)

### Inferences
- Wildlands' settlement instancer, which allows tweaks without a re-cook, is effectively a **delta layer over a baked generator output**. That is the same idea as Wallhammer Zero's per-cell deltas, achieved at Ubisoft through a tool rather than a formal data model.
- Exponential cook time for large towns argues for bounded generator work per cell. Wallhammer Zero's hierarchical cells already cap this if a town is decomposed into L2 layout plus L1/L0 lot fill, instead of one monolithic solve.
- A road builder based on a cost-field pathfinder with discounted existing roads is a well-proven, art-directable approach (designer waypoints, avoid areas, curviness). It fits an L3/L2 road-graph generator.
- Snowdrop's parent-child radius seeding is a compact rule model that suits a code-first engine. Each archetype declares what it seeds, at what radius and on which layer.

### Gaps
- None of the sources explains how Ubisoft protects manual edits when an offline Houdini generator re-runs (for example layer locking or merge rules). Far Cry 5 talk content beyond the abstract was not available.
- For Snowdrop, it is not stated whether scatter output is baked or evaluated at runtime.
- No public source on Assassin's Creed procedural tools was found in this pass.

---

## 3. Insomniac: Marvel's Spider-Man (2018), Miles Morales, Spider-Man 2 (2023)

### Takeaway
Insomniac used Houdini-driven procedural systems to author most of the city's ground, buildings, traffic, vignettes, props and impostors. By 2024 the team presented this as a ten-year practice with lessons on how to build procedural systems "from inception". Distant city LODs were automated by mesh analysis.

### Cited Findings
- GDC 2019 "Marvel's Spider-Man: Procedurally Crafting Manhattan" by David Santiago (principal technical artist): Houdini helped author "the ground, buildings, traffic, vignettes and crimes, props, and impostors, audio, lighting and more". [primary abstract] — [Game Developer](https://gamedeveloper.com/programming/video-procedurally-creating-manhattan-for-i-marvel-s-spider-man-i-); [Vimeo](https://vimeo.com/326448655)
- GDC 2019 technical postmortem by Elan Ruskin: the goal was to "build a New York City that fits on a Blu-Ray". It covers procedural tools for **marking up** Manhattan, how the city-building approach changed over time, asset-count growth, streaming, the drawbacks of pre-baked lightmaps, and building the wrong vertical slice. [primary abstract via 80.lv] — [80.lv](https://80.lv/articles/marvels-spider-man-a-technical-postmortem); [GDC Vault](https://www.gdcvault.com/play/1026496/)
- GDC 2021 (sponsored by SideFX): procedural systems for Miles Morales and Ratchet & Clank: Rift Apart, by Santiago and Xray Halperin. [primary abstract] — [GDC Vault](https://gdcvault.com/play/1027521/Procedural-Systems-for-Marvel-s)
- GDC 2024: "Marvel's Spider-Man 2: 10 Years of Procedural Content Creation", the Technical Artist Summit talk "Procedural Tool Development for Marvel's Spider-Man 2" (Santiago), drawing on "successful and less successful examples", and "Applied Mesh Analysis: Automating Distant City LODs in Marvel's Spider-Man 2". [primary abstracts] — [GDC schedule 900288](https://schedule.gdconf.com/session/marvels-spider-man-2-10-years-of-procedural-content-creation/900288); [GDC schedule 902350](https://schedule.gdconf.com/session/technical-artist-summit-procedural-tool-development-for-marvels-spider-man-2/902350); [GDC schedule 899260](https://schedule.gdconf.com/session/applied-mesh-analysis-automating-distant-city-lods-in-marvels-spider-man-2/899260)
- The sequel added Queens and Brooklyn, nearly doubling the map area, and brownstone and row-house geometry posed new challenges. [press] — [ArtDaily / NYT syndication](https://artdaily.com/news/162146/Spider-Man-2-s-New-York-is-a-web-of-skyscrapers-and-brownstones)
- Xray Halperin's EPC 2024 talk "Ten Years of Tech Art for Marvel's Spider-Man". [primary video] — [Vimeo](https://vimeo.com/982767414)

### Inferences
- "Marking up" the city suggests a workflow where designers annotate a layout (zones, lots, road types) and generators fill it. This is the GTA-like city counterpart of Horizon's painted maps.
- Insomniac made distant city LODs their own automated pipeline (mesh analysis). For a code-generated city, Wallhammer Zero can do better by emitting LOD and impostor representations from the generator itself rather than reducing meshes afterwards.

### Gaps
- No source here confirms how Insomniac keeps hand edits when a Houdini generator re-runs, or how many building variants or tile sizes were used. Those details are only in the gated talk recordings.

---

## 4. Rockstar RAGE (GTA V, GTA VI)

### Takeaway
Rockstar publicly positions GTA V's world as hand-crafted, with no terrain padding by procedural generation. There is almost no first-party technical material on RAGE map-building tools or HLOD. GTA VI material online is speculative.

### Cited Findings
- Art director Aaron Garbut (2013, BuzzFeed interview via fan site): Rockstar did not copy buildings around the map or procedurally generate terrain to "pad it out", and every light placed in the world is stored, streamed and drawn into the distance. [interview] — [TheGTAPlace](https://www.thegtaplace.com/news/28189/rockstar-norths-aaron-garbut-interviewed-by-buzzfeed/); [GameSpot "every tree"](https://www.gamespot.com/articles/rockstar-on-gtav-weve-considered-the-placement-of-every-tree/1100-6412953)
- GTA V streams models and textures continuously as the player moves. Adrian Courrèges' reverse-engineered graphics study (2015) describes the render pipeline and LOD behaviour. [secondary, reverse engineering] — [Courrèges part 2](https://adriancourreges.com/blog/2015/11/02/gta-v-graphics-study-part-2)
- Earlier lineage, according to Adam Fowler (technical director, Rockstar North): GTA III streamed geometry and textures from disc while world descriptions, collisions and animations stayed in memory. [interview] — [MCV "Inside Rockstar North part 3"](https://www.mcvuk.com/inside-rockstar-north-part-3-the-tech/)
- Pages such as "rockstar-files.pages.dev" describing GTA VI LOD systems are speculative and should not be used. [source warning] — [example](https://rockstar-files.pages.dev/reports/04_technical/0320_LOD_Systems.html)

### Inferences
- The relevant lesson from Rockstar is the quality bar, not the method: GTA's density comes from manual authoring by hundreds of artists. A one-owner engine cannot copy that, so it must reach comparable density through generators plus art-director deltas.

### Gaps
- There are no public RAGE talks on procedural tools, the HD/LOD/SLOD hierarchy or map editors. Community modding documentation exists but was not reviewed as it is not primary.

---

## 5. Frostbite (EA) terrain, and Embark Studios (The Finals, Arc Raiders)

### Takeaway
Frostbite evolved from runtime procedural terrain meshing with a procedural virtual texture (Battlefield 3, 2012) to a **non-destructive, layered overlay system** in which hundreds of interdependent procedural overlays per level compose live in the editor (Battlefield 2042, PGA Tour). Embark uses **modular Houdini toolsets** (Building Creator) with minute-scale iteration and offline pre-fracturing. Embark denies using generative AI for Arc Raiders content.

### Cited Findings
**Frostbite**
- GDC 2012 "Terrain in Battlefield 3: A Modern, Complete and Scalable System" (Mattias Widmark): heightfield terrain with the mesh generated procedurally at runtime, quadtree hierarchies, real-time in-editor sculpting and masking, and a procedural virtual texture that caches intermediate results to offload the GPU. [primary slides] — [EA slides PDF](https://media.contentapi.ea.com/content/dam/eacom/frostbite/files/gdc12-terrain-in-battlefield3.pdf)
- GDC 2023 "From Battlefields to Fairways" (Julien Keable): the Frostbite Terrain Procedural Framework is a "non-destructive GPU-based layer compositing system with data-driven behaviors that let game entities affect terrain". [primary abstract] — [GDC Vault](https://gdcvault.com/play/1029086/From-Battlegrounds-to-Fairways-Terrain)
- EA (2023-05-15): the tools are used in seven EA titles and are "non-destructive". When artists place or move stones or trees, the terrain adjusts around them live. "Overlays" are raster layers driven by heightfield data that switch masks (for example snow to stone). Each Battlefield 2042 level has **hundreds of interdependent overlays** (dunes, roads, scrub). Changing bunker depth used to require an external export and re-import round trip and is now done live in the editor ("a couple moments" instead of weeks). Work on the system began about five years earlier. PGA Tour imported LiDAR scans of 28 courses as heightfields and masks. [primary] — [EA Frostbite](https://www.ea.com/frostbite/news/procedural-terrain-in-ea-sports-pga-tour)

**Embark Studios**
- 80.lv (2026-03-03), from a breakdown by Adrian Björkerud (technical artist): the **Building Creator** is a set of interoperable Houdini HDAs ("Feature Nodes") rather than one monolithic HDA. Each node generates one element (walls, floors, roofs, windows, doors, a dedicated Kyoto roof). Every building starts from a **blockout mesh** that gives all Feature Nodes a shared spatial context. [interview/breakdown] — [80.lv](https://80.lv/articles/how-embark-studios-built-procedural-environments-for-the-finals-using-houdini)
- Same source: for Monaco, a fixed interior ruleset covers 30+ buildings (1–5 floors plus attic). All destructible assets are **pre-fractured in Houdini** because "real-time fracturing is too costly and unpredictable for fast-paced multiplayer". Blockout to fractured asset takes about 4–6 minutes per change, and collision and occluders are fully automated. The tools produced 100+ unique buildings across The Finals and Arc Raiders. For Arc Raiders' Buried City they produced only base meshes. [interview] — [80.lv](https://80.lv/articles/how-embark-studios-built-procedural-environments-for-the-finals-using-houdini)
- AI stance (2025): the Steam disclosure says "we may use procedural and AI-based tools to assist with content creation". Design director Virgil Watkins said generative AI is not used for Arc Raiders content, and that the disclosure relates to text-to-speech voice lines, also used in The Finals. Press notes confusion over where ML ends and generative AI begins. [interview, conflicting framing] — [PC Gamer](https://pcgamer.com/gaming-industry/arc-raiders-use-of-ai-highlights-the-tension-and-confusion-over-where-machine-learning-ends-and-generative-ai-begins); [VideoGamer](https://www.videogamer.com/news/arc-raiders-generative-ai); [GamesRadar](https://www.gamesradar.com/games/third-person-shooter/arc-raiders-lead-says-games-cant-be-built-by-an-ai-and-i-hope-they-never-can-but-also-i-want-us-to-build-content-a-hundred-times-faster-and-ai-might-help-with-that-part)
- SideFX GDC 2026 sessions include Embark material on combining Houdini with USD to replace repetitive manual work. [primary listing] — [SideFX GDC 2026](https://www.sidefx.com/community/gdc-2026/)

### Inferences
- The Frostbite overlay stack is the closest public analogue to Wallhammer Zero's "generator plus deltas" model. Each overlay is a non-destructive, ordered layer, and game entities can push data into terrain (objects flatten their footprint). Making deltas ordered layers that re-apply after regeneration, rather than baked overwrites, matches proven practice.
- "Hundreds of interdependent overlays per level" signals that dependency tracking between layers matters. That supports the Merkle-cache and dependency-graph approach in `eng_asset`.
- Embark's blockout-first, feature-node approach is a good template for `eng_gen_arch`. The art director edits a coarse massing (blockout), and small single-purpose generators decorate it. Their 4–6 minute loop is the benchmark a code-only engine should beat by producing results in seconds.

### Gaps
- How Embark keeps manual edits when Building Creator re-runs is not described.
- No details were found on Frostbite overlay data formats or on conflict resolution between hand sculpt and procedural layers.

---

## 6. Cities: Skylines II (Unity DOTS), Townscaper, Tiny Glade, Dwarf Fortress

### Takeaway
Cities: Skylines II shows what happens when content at strategy-game scale ships without LODs or aggressive culling. Stålberg's games (Townscaper, Bad North) and Pounce Light's Tiny Glade show **real-time procedural meshing driven by player edits**, built on small hand-designed module sets or hand-authored rules. Dwarf Fortress is the reference for history simulated at world generation.

### Cited Findings
**Cities: Skylines II (launched October 2023)**
- Community analysis by Paavo Huhtala (2023-11-05): Unity 2022.3.7 with DOTS, ECS and Burst, about 1,200 systems, good multicore CPU use. Rendering does **not** use Entities Graphics. Colossal Order wrote its own bridge via `BatchRendererGroup`, plus its own culling, skinning and virtual texturing. [secondary, RenderDoc analysis] — [Paavo's blog](https://blog.paavo.me/cities-skylines-2-performance/)
- Same analysis: many props lack LODs (gas tank pallet over 17K vertices, clotheslines 25–30K+, parking booth over 40K merged into its building so it cannot be culled separately, log pile over 100K seen only in shadows). Characters are about 56K vertices with no LODs, and the teeth mesh has 6,108 vertices. Only frustum culling is used, with no occlusion culling. Shadows take about 40 ms of an 87.8 ms frame and 72% of 6,705 draw calls. About 121 million input vertices per frame. Building instance data is about 50 floats per instance, roads need more, and a roughly 60 MB instance buffer is updated every frame. [secondary] — [Paavo's blog](https://blog.paavo.me/cities-skylines-2-performance/)
- Colossal Order said the teeth are "not affecting performance in any way we would call significant", but acknowledged LOD as an issue being addressed. [primary statement via press] — [PC Gamer](https://www.pcgamer.com/cities-skyline-2-dev-says-yes-our-characters-have-teeth-no-the-characters-teeth-are-not-affecting-performance)
- No official Colossal Order postmortem was found. [gap noted] — [Tom's Hardware summary](https://www.tomshardware.com/pc-components/gpus/cities-skylines-2-performance-autopsy-highlights-massive-optimization-failures)

**Townscaper (Oskar Stålberg, 2020)**
- The grid starts as a hexagonal grid, which is split into quads, split again, and has points moved (relaxed) into an irregular quad grid. [secondary, Game Developer] — [Game Developer](https://www.gamedeveloper.com/game-platforms/how-townscaper-works-a-story-four-games-in-the-making)
- Placement is marching-cubes-like: tiles are **corner segments** that fit each irregular cell, not whole building chunks. WFC chooses modules valid for each cell given the surrounding shape, in real time. Structure and decoration (windows, chimneys, props) are separate passes. Modules have priorities, and garden "recipes" appear only in enclosed areas, which makes them predictable. Windows are cut with a stencil buffer. [secondary] — [Game Developer](https://www.gamedeveloper.com/game-platforms/how-townscaper-works-a-story-four-games-in-the-making)
- Failure handling: Bad North restarts a failed WFC solve, while Townscaper lets failures pass silently, most often on long thin structures. Bad North used 300+ tiles, and a Townscaper re-skin would need around 500. Each player edit forces the connected structure to re-evaluate, so latency grows with build size. [secondary] — [Game Developer](https://www.gamedeveloper.com/game-platforms/how-townscaper-works-a-story-four-games-in-the-making)

**Tiny Glade (Pounce Light, released September 2024)**
- 80.lv interview (2024-05-30) with Anastasia Opara and Tomasz Stachowiak: the game began as a procedural wall generator. Walls, windows, roofs, doors, stairs, machicolations, lanterns and pillars each have their own generator. Bridges and building elevation were added after player requests. Generation runs on both CPU and GPU, in real time ("rather than offline"), with each element's pipeline designed for "creation, assembly, morphing, or deforming". [interview] — [80.lv](https://80.lv/articles/exclusive-tiny-glade-developers-discuss-bevy-proceduralism-publishers-cozy-games/)
- Bevy: the prototype used Bevy for everything. The team kept Bevy's ECS but outgrew its renderer, uses a modified Bevy, and moved from OpenGL to Vulkan, partly because Bevy lacked compute shaders at the time. [interview] — [80.lv](https://80.lv/articles/exclusive-tiny-glade-developers-discuss-bevy-proceduralism-publishers-cozy-games/)
- Art direction: "procedural art is very intimate because I create every single rule that goes into the system" (Opara). Features went through five or six playtest iterations. Opara explicitly contrasts this with generative AI, "where you just press a button and a huge neural network spits something out". [interview] — [80.lv](https://80.lv/articles/exclusive-tiny-glade-developers-discuss-bevy-proceduralism-publishers-cozy-games/)
- The claim that Tiny Glade uses a WFC variant comes only from a forum comment and is unverified. [secondary, weak] — (search result summary; no reliable source)

**Dwarf Fortress**
- World generation produces elevation, rainfall, minerals, drainage and temperature, then simulates history. Parameters include size, savagery, mineral occurrence and history length. One world supports one game at a time. [secondary, encyclopedic] — [Wikipedia](https://en.wikipedia.org/wiki/Dwarf_Fortress)
- Tarn Adams calls world generation "probably the most striking" aspect of the game. A "creation myth generation" system was added to underpin generated worlds. [interview] — [Killscreen](https://www.killscreen.com/road-two5six-tarn-and-zach-adams/); [PC Gamer](https://pcgamer.com/dwarf-fortress-creator-on-how-hes-42-towards-simulating-existence)

### Inferences
- The Cities: Skylines II failure mode (no LODs, merged props that cannot be culled, everything casting shadows) is precisely what a code-generated pipeline can prevent structurally. If every generator must emit LOD chains, an impostor and a shadow-caster flag as part of its output contract, CS2's problem cannot arise. Wallhammer Zero's CI could reject any archetype without them.
- Townscaper and Tiny Glade show that a single author can reach a high art bar with **few hand-designed rules and modules** and real-time regeneration on edit. This matches the "owner as art director" model. The lesson is that edits trigger **local** re-solves, and cost grows with the connected region, so solves need bounding (cells).
- Townscaper's priority modules and "recipes only in enclosed areas" are a way to make procedural output predictable for the author, which is directly useful for art-director approval.

### Gaps
- Cities: Skylines II procedural road-mesh generation and building-levelling internals are not publicly documented by Colossal Order.
- No primary Stålberg talk transcript was fetched. His irregular-grid and WFC talks (for example EPC 2018, SGC 2021) are the primary sources to consult.
- Dwarf Fortress erosion and history algorithms were not detailed in the sources found.

---

## 7. No Man's Sky / Light No Fire 2025–2026, and recent GDC talks on procedural cities

### Takeaway
No reliable new technical disclosure on Light No Fire's planet generation from 2025–2026 was found. Recent GDC content on art-directable procedural work comes mostly from Insomniac (2024), Frostbite (2023), Massive (2024) and Embark/SideFX (2026), rather than dedicated city-generation talks.

### Cited Findings
- Light No Fire was announced December 2023 as an Earth-sized procedural planet built on ten years of No Man's Sky technology. [primary-adjacent press] — [PC Gamer](https://www.pcgamer.com/hello-games-grand-follow-up-to-no-mans-sky-light-no-fire-is-an-open-world-the-size-of-the-actual-earth)
- Press speculates that the No Man's Sky Worlds/Voyagers-era updates (new solar systems, gas giants, deeper oceans) carry Light No Fire tech. This is press inference, not a Hello Games statement. [secondary] — [GamesRadar](https://www.gamesradar.com/games/adventure/it-sounds-like-all-the-tech-behind-planet-spanning-survival-game-light-no-fire-is-hiding-within-no-mans-skys-massive-new-update); [GamesRadar gas giants](https://www.gamesradar.com/games/open-world/massive-no-mans-sky-update-adds-new-solar-systems-revamped-tech-deeper-sea-exploration-and-gas-giants-ten-times-bigger-than-our-biggest-planet)
- On the 10th anniversary (August 2026), Sean Murray made only a passing comment on Light No Fire. [press] — [Push Square](https://www.pushsquare.com/news/2026/08/as-no-mans-sky-turns-10-dev-keeps-on-cooking-new-game-light-no-fire)
- An AI-driven city-generation demo by Tencent (roads, facades, interiors from user-supplied arterials and coastline) is reported in press. The exact GDC session and year were not confirmed. [secondary] — [besthub article](https://besthub.dev/articles/how-ai-can-build-a-25-km-virtual-city-in-weeks-tencent-s-3d-scene-generation-breakthrough-5659dbfe0593)

### Inferences
- The main 2024–2026 trend in production talks is not new algorithms. It is **tooling ergonomics**: non-destructive layers (Frostbite), live in-engine graphs (Snowdrop), modular single-purpose generators (Embark) and lessons on when procedural systems fail (Insomniac 2024).

### Gaps
- Light No Fire technical details (planet representation, streaming, LOD) remain unpublished. The 2025 No Man's Sky "Worlds Part II" engine changes were not covered by a primary Hello Games technical source in this pass.
- No GDC 2025 or 2026 talk dedicated to procedural road networks or building generation was confirmed.

---

## 8. Cross-cutting lessons for Wallhammer Zero

### Takeaway
Production studios converge on four rules. Hand-author low-frequency intent and generate high-frequency detail. Treat procedural output as a first pass under non-destructive edit layers. Require determinism plus local stability. Optimise for iteration latency (seconds in-engine beats minutes on a farm). Wallhammer Zero's architecture already embodies most of this. The open risks are delta survival across generator version bumps, and LOD discipline.

### Cited Findings
- Determinism and local stability as explicit goals: Horizon. — [Guerrilla slides](https://www.guerrilla-games.com/media/News/Files/GDC2017_VanMuijden_GPUBasedProceduralPlacementInHorizonZeroDawn.pdf)
- Non-destructive layered overlays, live, with hundreds per level: Frostbite. — [EA Frostbite](https://www.ea.com/frostbite/news/procedural-terrain-in-ea-sports-pga-tour)
- Procedural output as a first pass with manual add, remove and move afterwards, and handcrafted gameplay areas: Snowdrop. — [Massive](https://www.massive.se/?p=18290)
- Tweaks without a re-cook via an instancer, presets edited and re-exported, and towns rebuilt 5+ times: Wildlands. — [80.lv](https://80.lv/articles/procedural-world-building-in-ghost-recon-wildlands/)
- Blockout-driven modular generators with a 4–6 minute loop: Embark. — [80.lv](https://80.lv/articles/how-embark-studios-built-procedural-environments-for-the-finals-using-houdini)
- Missing LODs and culling as the performance killer in a large simulated city: Cities: Skylines II. — [Paavo's blog](https://blog.paavo.me/cities-skylines-2-performance/)
- Small hand-made rule and module sets with real-time local re-solve on edit: Townscaper, Tiny Glade. — [Game Developer](https://www.gamedeveloper.com/game-platforms/how-townscaper-works-a-story-four-games-in-the-making); [80.lv](https://80.lv/articles/exclusive-tiny-glade-developers-discuss-bevy-proceduralism-publishers-cozy-games/)

### Inferences (recommendations, not sourced facts)
1. **Make local stability part of the generator contract**, next to determinism. Seed each object from `(domain, version, cell_id, local slot)`, never from a global counter or iteration order, so an edit in cell A cannot renumber objects in cell B. Add a CI test: perturb one cell's input and assert that byte-identical output elsewhere is unchanged.
2. **Deltas as ordered, non-destructive layers** (the Frostbite model). Each delta targets a stable generated ID or a spatial region and re-applies after regeneration. A delta whose target vanished after a version bump becomes an orphan that is surfaced in the studio for the art director, never silently dropped.
3. **Generator version bumps need a diff view.** No studio source describes this, which is the gap Wallhammer Zero must solve itself. On a domain version change, regenerate in the studio, show before/after per cell, list orphaned deltas, and require art-director approval before the new version becomes default. Old versions stay runnable so saves remain reproducible.
4. **Painted or authored low-frequency fields drive generation** (Horizon maps, Insomniac markup, Wildlands waypoints). At L3/L2 the owner edits intent (district type, density, road waypoints, biome masks), and L1/L0 detail is derived.
5. **Cost-field pathfinding for roads**, with existing roads discounted, slope and turn penalties and designer avoid-zones (Wildlands). Run it at L3/L2 as a global graph in `eng_sim`, then terraform per cell.
6. **Rule model for scatter: parent-child seeding by radius, by layer** (Snowdrop), plus species-environment suitability (Far Cry 5). It is compact, readable and deterministic if evaluated in a fixed order per cell.
7. **Buildings from blockout plus feature generators** (Embark), with structure before decoration (Townscaper). The art director edits massing, and generators decorate it.
8. **The output contract enforces LODs, impostors, shadow flags and separable props** (the Cities: Skylines II lesson). CI rejects any archetype without them. Merged props must stay individually cullable.
9. **Bound solve size per cell.** Wildlands town cooks grew exponentially, and Townscaper's latency grows with structure size. Hierarchical decomposition (L2 layout, L1 lot fill) keeps every solve bounded.
10. **Iteration target in seconds, in-engine** (Snowdrop and Frostbite beat Ubisoft's farm-minute loop and Embark's 4–6 minutes). A code-only engine without a DCC round trip can reach this, and it is the main advantage over Houdini pipelines.

### Gaps
- No public source describes how any AAA studio migrates hand edits across a **generator version change**. This is an open design problem for Wallhammer Zero, not a solved industry pattern.
