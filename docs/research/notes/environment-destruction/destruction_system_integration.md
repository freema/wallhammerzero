# Destruction and the rest of an open-world engine: persistence, streaming, simulation, AI, networking, testing

Scope note: this covers the system-level consequences of destruction for Wallhammer Zero (WZ). It is read against ARCHITECTURE.md, ROADMAP.md (M4, M6, M7, M8) and DECISIONS.md (D39, D40, D44, D79). WZ facts used in the inferences: 256 m cells regenerated rather than stored; player edits are deltas over regeneration with input-space anchors, edit layers, an orphan queue and frozen cells (D40, D79); a "bounded re-solve per player edit" rule; mass entities on a lane graph (D44); strategy commands as generator inputs (D39); `player_cmd` replays with subsystem hashes; determinism tiers (D28: tier A generators and sim logic, tier B Jolt physics, animation and audio, plus a cosmetic GPU-scatter tier with no IDs and no hashes); a future network mode kept in "server shape" with lockstep left open (D41).

Source quality warning, applies to the whole note: the research budget was about 20 tool calls. Primary technical sources on destruction *integration* are scarce. Studios publish talks about fracture and VFX, not about save formats, nav rebuilds or debris networking. Many points below rest on developer blogs (strong), official studio articles (medium: marketing tone, few numbers), or player forums (weak, flagged each time). Several questions remain open and are listed under Gaps.

---

## 1. Persistence: keeping destroyed state when a region streams out and back

### Takeaway
Shipped games use three patterns. (a) Store the full world state in the save: Teardown, about 80 MB per large level with RLE. (b) Store a capped set of deltas and let the procedural base reassert itself when the cap is exceeded: No Man's Sky. Players experience this as a bug. (c) Deliberately reset or respawn destroyed content on a timer or as a design choice: Bethesda cell reset, Just Cause 3 bridges, Cities: Skylines rubble cleared and rebuilt. For a regenerate-not-store engine, the lesson is that destruction must be stored as a small *semantic* delta (a damage state per stable ID), not as geometry, and that the size cap and its overflow policy are design decisions, not afterthoughts.

### Cited Findings
- **Teardown (full-state saves):** Dennis Gustafsson considered diffs but chose full saves: "for robustness purposes I wanted to save the entire state of world for each save." Large levels hold "roughly half a billion voxels". Run-length encoding was picked for "almost zero cost" and gets data "down to 15-20% of original size, making quicksave files on the larger levels around 80 Mb in size." Shipped missions are an initial quicksave snapshot, zlib-compressed at bake to "about 20 Mb per mission." — [Voxagon blog, Teardown quicksave (primary)](https://blog.voxagon.se/2020/11/18/teardown-quicksave.html)
- **Teardown (derived state is not saved):** The voxel physics representation "is 100% reproducible from the main voxel data" and is regenerated at load. The same holds for acceleration structures for "physics, culling, rendering and lighting". Each object chooses what to save "and might leave out cached state". Lua script state is saved by serializing the globals table. — [Voxagon blog (primary)](https://blog.voxagon.se/2020/11/18/teardown-quicksave.html)
- **Teardown (uncompressed size):** a German hardware site, citing the same blog, says uncompressed saves would exceed half a gigabyte. — [PCGH tech test (secondary)](https://www.pcgameshardware.de/Teardown-Spiel-73677/Specials/PC-Game-Test-Benchmark-Voxel-Dynamic-Destruction-1394545/2/)
- **No Man's Sky (capped terrain deltas over a procedural planet):** Players describe a save-wide budget for terrain edits around bases. One reply says that once the limit is hit, "the terrain starts regenerating and covers your bases". Another reports that regeneration sometimes happens earlier, as a bug. Edits inside a base's build area count toward a per-save maximum. Players also report that visiting heavily edited bases of other players may overrun buffers. The community workaround is a third-party save editor that clears terrain edits. **WEAK SOURCES: player forums and a guide site, no official Hello Games documentation found.** — [Steam discussion](https://steamcommunity.com/app/275850/discussions/0/3826424998948955516); [Steam discussion](https://steamcommunity.com/app/275850/discussions/0/1762482479185377839); [GamePretty guide](https://gamepretty.com/no-mans-sky-how-to-clear-all-terrain-edits-using-the-save-editor/)
- **Bethesda Creation Engine (cell reset):** Interior cells reset when the player re-enters after the "Cell Reset Hours" have expired. Exterior cells reset when the game is saved after expiry. The timer is `iHoursToRespawnCell`. Sources disagree on the default: 72 hours is cited, while UESP also mentions 10 days, and the value varies by game and difficulty. An Encounter Zone flagged "Never Resets" blocks resets. A scripted `Reset()` forces one. One mod page says the timer counts from the *first* visit, while UESP says it counts from when the player last left. **MIXED: UESP wikis (community, but long-standing CK reference) plus Nexus forums (weak). The ck.uesp.net page returned 403 to fetch, so the wording comes from search snippets.** — [UESP CS wiki: iHoursToRespawnCell](https://cs.uesp.net/wiki/IHoursToRespawnCell); [UESP CS wiki: Cell Reset](https://cs.uesp.net/wiki/Cell_Reset); [UESP CK wiki: Cell Reset](https://ck.uesp.net/wiki/Cell_Reset); [Nexus Fallout 4 article](https://www.nexusmods.com/fallout4/articles/370); [Nexus Fallout 3 mod](https://www.nexusmods.com/fallout3/mods/22312)
- **Just Cause 3 (deliberate respawn of set-piece destruction):** The large white bridges "respawn after you've blown them up". Liberated bases persist as fast-travel points. I found no source on whether destroyed base structures themselves stay destroyed. A Mexican outlet's headline says destruction lets you "eradicate buildings permanently", which I could not verify further. — [PC Gamer](https://pcgamer.com/wreaking-havoc-in-just-cause-3s-playground-of-explosions-do-not-publish/2); [PCWorld review](https://www.pcworld.com/article/418562/just-cause-3-review-blow-up-the-outside-world.html); [Xataka (unverified headline)](https://www.xataka.com.mx/videojuegos/la-destruccion-en-just-cause-3-nos-permite-erradicar-edificios-de-forma-permanente)
- **Cities: Skylines Natural Disasters (rubble as a sim state that gets cleaned and rebuilt):** Earthquakes and sinkholes collapse buildings. Disaster-response services search ruins for survivors and clear rubble back to buildable land. A player forum reply says collapsed zoned buildings can be bulldozed or left and "will be replaced with a new building over time" (**weak: forum**). Fire spreads easily between buildings, according to the dev diary. — [PC Gamer](https://pcgamer.com/natural-disasters-lets-you-destroy-your-cities-skylines-cities-but-also-save-them); [TheSixthAxis review](https://www.thesixthaxis.com/2016/11/29/cities-skylines-natural-disasters-review/); [Paradox dev diary 1](https://forum.paradoxplaza.com/forum/threads/cities-skylines-natural-disasters-dev-diary-1-meteors-and-helicopters.968880/); [Steam forum (weak)](https://steamcommunity.com/app/255710/discussions/0/152390648096219613)
- **Battlefield 6 (lasting ruins in a session):** "We wanted the result of destruction to stay." Vehicle wrecks and destruction remain in the world for the match. Level-designed debris piles are meant to reshape the play space. — [EA / Frostbite: How Battlefield 6 redefined destruction (official, marketing tone)](https://www.ea.com/ea-play/news/how-battlefield-6-redefined-destruction)
- **Red Faction: Guerrilla:** Geo-Mod 2.0 used pre-broken meshes that react to stress and impact (fan wiki). A Volition developer quoted in Retro Gamer calls it "precomputed destruction". Terrain is not destructible; buildings and cover are. **No source found on how RFG persists destroyed buildings across streaming or saves.** — [Red Faction Wiki: GeoMod 2.0 (fan wiki, weak)](https://www.redfactionwiki.com/wiki/GeoMod_2.0); [Retro Gamer via PressReader](https://pressreader.com/uk/retro-gamer/20220512/282973928614782)

### Inferences
- Teardown shows the cost of storing geometry: tens of MB per level, even compressed. In WZ, a cell is regenerated, so the destroyed state must be expressed as a delta keyed by the D79 stable ID, for example `(cell, uid/anchor, damage_stage or broken_part_mask, collapse_seed)`. That is bytes per building, not megabytes. The rubble is then *regenerated* from `(building recipe, damage state, seed)`, exactly as Teardown regenerates physics data from voxels. This makes "destroyed" just another edit layer in D79, subject to orphan handling when a generator version changes and the building's anchor disappears.
- Fully simulated end positions of physical debris cannot be regenerated deterministically across machines or builds, because Jolt is tier B. So the persistent record should store a *settled-rubble* result chosen by a tier-A rule (a rubble archetype or heap shape derived from the seed), not the physics outcome. The physics outcome is cosmetic and transient.
- No Man's Sky is the cautionary example for D79's "orphan queue, never silently away" rule. A silent regeneration when the edit budget overflows is exactly what players report as a bug. If WZ caps destruction deltas per cell or per save, the overflow policy must be visible: merge into a coarser "district ruined" state, convert to a designed ruin archetype, or refuse.
- Reset and regrowth are legitimate design tools (Bethesda timers, JC3 bridges, Cities: Skylines rebuild). They map well onto WZ. A cell-level policy flag such as `persist | reset_after(t) | rebuild_by_sim` lets the GTA-like mode, the strategy mode and the planet mode choose differently.

### Gaps
- No sourced number for "bytes per destroyed building" in any shipped game. RFG, Just Cause 3/4 and Battlefield save formats are undocumented publicly.
- Minecraft region/chunk storage (stores modified chunks in full) was not researched within budget. Teardown is the only sourced full-state example.
- No official Hello Games statement on terrain-edit limits was found.
- Just Cause 4 was not covered.

---

## 2. Simulation and AI: navmesh, lane graph, cover, crowds

### Takeaway
Navmesh rebuild after destruction is a known pain point even in Unreal. Recast's own author recommends tile-cache obstacles only for simple props and full tile rebuilds for structural change, with tile size tuned to keep rebuilds short. No public source documents traffic rerouting after destruction in a shipped open-world game. Battlefield 6 explicitly treats collapsed structures as new cover, but its article says nothing about AI.

### Cited Findings
- **Recast tile cache vs. full tile rebuild:** Mikko Mononen (Recast author) on the mailing list: "Tile cache is best for simple obstacles like crates and barrels which can move or are added and removed. If your house has multiple floors, then you should use the regular Recast process to rebuild a tile." And: "The important thing for you to test is to find a good tile size so that the rebuild times are not too long." (2013) — [recastnavigation Google Group (primary, author)](https://groups.google.com/g/recastnavigation/c/F9mRO_eimEI)
- **Tile cache batching:** Babylon.js docs (wrapping Recast) describe TileCache as updating the navmesh "in smaller regions (tiles) instead of rebuilding the whole mesh". For many obstacle changes at once, they recommend deferring updates and waiting once at the end of the batch. — [Babylon.js TileCache docs](https://doc.babylonjs.com/features/featuresDeepDive/crowdNavigation/v2Intro/v2WhatsNew/v2TileCache)
- **Unreal (Recast-based) and Chaos destruction:** Users report that partially destroying large Geometry Collections did not update a dynamic navmesh correctly, leaving gaps that blocked AI. In 4.25, Geometry Collections did not affect the navmesh at all, even with dynamic generation. Users also report AI getting stuck, not repathing, or walking through debris, and that "Dynamic navmesh + nav invoker" still caused performance issues. **Weak: forum posts, but consistent across threads.** — [UE forum: GeometryCollection updating NavMesh](https://forums.unrealengine.com/t/geometrycollection-updating-the-navmesh/884232); [UE forum: Does NavMesh work with Chaos](https://forums.unrealengine.com/t/does-navmesh-work-with-chaos-physics/475129); [UE forum: dynamic obstacles](https://forums.unrealengine.com/t/how-can-i-improve-ai-pathfinding-around-dynamic-obstacles-in-unreal-engine-5/2508273)
- **Rebuild-side overhead in UE:** Auto-generated nav links after tile rebuilds can make rebuilds very slow; disabling asymmetric border sizes reportedly halved generation time. **Weak: forum, Unreal-specific.** — [UE forum: Recast Rasterization](https://forums.unrealengine.com/t/recast-rasterization/2707881)
- **Cover changes as gameplay:** In Battlefield 6, players use collapsing structures as cover, debris piles reshape space, and damage reaches players under destroyed buildings. The article does not mention AI or navigation. — [EA / Frostbite](https://www.ea.com/ea-play/news/how-battlefield-6-redefined-destruction)
- **Cities: Skylines:** disasters damage roads, which matters for emergency services reaching sites. No technical detail was found on how the pathfinder is invalidated. — [Paradox dev diary 1](https://forum.paradoxplaza.com/forum/threads/cities-skylines-natural-disasters-dev-diary-1-meteors-and-helicopters.968880/); [PC Gamer](https://pcgamer.com/natural-disasters-lets-you-destroy-your-cities-skylines-cities-but-also-save-them)

### Inferences
- In WZ, the lane graph comes from the road generator (D79), and M6 already specifies "after a graph edit, the affected paths are invalidated". Destruction that blocks a road should be a *graph edit*: a lane-segment flag `blocked/capacity_reduced` driven by a tier-A rule (rubble footprint intersecting a lane). It should not come from physics debris. That keeps 100,000 mass entities deterministic and hashable, and reuses the path-invalidation machinery planned for M6.
- Tier B physics debris must never feed tier A navigation directly. If it did, replays and golden hashes would depend on Jolt. Debris that matters for movement should be quantized into the settled-rubble state (section 1), and nav/lane updates should be computed from that.
- Mononen's advice maps to WZ: use the tile-cache style for small transient blockers (wrecked car, fallen lamp), and a full Recast tile rebuild for building collapse. Recast tiles should align with or nest inside 256 m cells, so one collapse touches a bounded number of tiles. That matches D79's "bounded re-solve per player edit".
- Cover points for actor AI are best regenerated per cell from the same damage state (cover is derived data, like Teardown's acceleration structures), not patched incrementally.

### Gaps
- No primary per-tile Recast rebuild timings were found. They have to be measured (candidate for a WZ measurement item).
- No public talk was found on traffic or pedestrian rerouting after destruction in GTA-like games, or on crowd reactions (panic or flee fields) tied to destruction.
- No Volition/RFG or Avalanche source on AI handling of collapsed buildings was found.

---

## 3. Networking: what is synced and how

### Takeaway
Three shipped models exist. **Server-authoritative physics** (The Finals: "a single truth for physics, for all players at the same time"). **Event or command replication with prioritization and culling of debris** (Battlefield 6). **A hybrid of deterministic replay of destruction commands plus state sync of physics bodies** (Teardown multiplayer). Teardown explicitly does not send voxel data ("simply too much data"). Its join-in-progress replays a capped event queue and is disabled when the queue grows too large.

### Cited Findings
- **Teardown multiplayer:** Destruction is synced through determinism. The server sends destruction commands that each client applies in the same order. "Parts of the network synchronization rely on determinism." Voxel data is not sent: "it's simply too much data." Physics bodies use conventional state synchronization. Late joiners receive the queued destruction events. The queue is capped, and when too many changes have accumulated, join-in-progress is disabled because "it would take forever to join." No bandwidth numbers are given. — [80.lv interview with Dennis Gustafsson (interview, near-primary)](https://80.lv/articles/teardown-developer-breaks-down-multiplayer-and-voxel-destruction-tech)
- **The Finals (Embark):** Movement, physics and destruction run server-side. Destruction happens on Embark's servers, not on player hardware, and "will look the same for all players in a match". Embark calls server-side movement and destruction "a holy grail". A later update (described as from October 20) added deformation, dynamic bending and debris "held together by dynamic connections". Embark declined to explain the tech pre-release. **No Embark technical talk or blog post with numbers was found; sources are press previews quoting Embark.** — [Digital Trends](https://www.digitaltrends.com/gaming/the-finals-preview-destruction-will-make-developers-panic/); [GamesRadar](https://www.gamesradar.com/the-finals-preview-hands-on-march-2023/); [NVIDIA](https://www.nvidia.com/en-us/geforce/news/the-finals-closed-beta-dlss-reflex-ray-tracing/); [Playfront (secondary)](https://playfront.de/en/the-finals-zerstoerungs-update-neue-physik-ebene-ab-20-oktober/)
- **Battlefield 6 (Frostbite):** The teams "overhauled how destruction events are networked", with "prioritization and culling of part destruction and debris spawning", so that 64-player matches stay synchronized. The article shows a "Prioritized Destruction Networking" before/after image but gives no bandwidth figures. Part-based destruction and a reworked "health transition system" let game code hook into state changes. — [EA / Frostbite](https://www.ea.com/ea-play/news/how-battlefield-6-redefined-destruction)
- **Rainbow Six Siege (RealBlast):** Ubisoft calls RealBlast "a procedurally generated destruction system". Explosions do a shape query against physics, then resolve damage by raycasts. A 2016 GDC talk by Julien L'Heureux covers integrating RealBlast as a core feature. **No source on Siege's destruction networking was found.** — [Ubisoft dev blog](https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/1QkezaGoRkDWqcQ6duGvtk); [GDC Vault: The Art of Destruction in Rainbow Six: Siege](https://gdcvault.com/play/1023003/The-Art-of-Destruction-in); [Game Developer video post](https://gamedeveloper.com/design/video-why-real-time-destruction-is-the-core-of-i-rainbow-six-siege-i-)
- **Server cost and dependency:** Press notes that The Finals' destruction quality depends on server performance under load, and that the game exists only as long as Embark runs servers. — [Playfront](https://playfront.de/en/the-finals-zerstoerungs-update-neue-physik-ebene-ab-20-oktober/); [Digital Trends](https://www.digitaltrends.com/gaming/the-finals-preview-destruction-will-make-developers-panic/)

### Inferences
- WZ's D41 ("server shape, `player_cmd` input, lockstep open for strategy") fits the Teardown hybrid well. Gameplay-relevant destruction is a tier-A *event* (`destroy(stable_id, stage, seed)`) that is replicated or locksteped like any `player_cmd` consequence. Debris physics is either cosmetic and local (never synced) or, for the few large pieces that block or damage, state-synced by the server.
- Teardown's capped join queue is the network twin of the persistence question. WZ does not need a join queue, because the destroyed-state delta *is* the edit layer. A late joiner receives cell deltas exactly as a save load would. This argues for making the save delta and the network snapshot the same format.
- In strategy (lockstep) mode, only tier-A outcomes may affect anything other than visuals. Physics debris in lockstep would require cross-platform deterministic Jolt, which is out of reach across macOS/Windows and compilers (cf. D28).

### Gaps
- No bandwidth figures for debris or destruction were found for any title.
- No primary DICE talk on Bad Company 2 destruction networking was found.
- No public Embark technical talk on The Finals server destruction was found in this pass. It may exist on GDC Vault or Embark's blog and is worth a targeted follow-up.

---

## 4. Replays and determinism

### Takeaway
The pattern that works: replay the *cause* (command or destruction event) deterministically and regenerate everything derived. Treat debris physics as either regenerable-from-state or cosmetic. Teardown regenerates its physics representation from voxel data, and its multiplayer replays destruction commands in order.

### Cited Findings
- Teardown's physics representation "is 100% reproducible from the main voxel data" and is generated at load. Acceleration structures likewise. — [Voxagon blog](https://blog.voxagon.se/2020/11/18/teardown-quicksave.html)
- Teardown multiplayer applies server destruction commands to each client's scene in the same order, and relies on determinism for parts of sync. — [80.lv](https://80.lv/articles/teardown-developer-breaks-down-multiplayer-and-voxel-destruction-tech)
- Unreal Chaos Geometry Collections expose a "remove on max sleep" option. A particle asleep past a threshold is removed from simulation and its rendered geometry dissolves over a "removal duration". This is a mechanism for treating settled debris as disposable. — [UE Python API: GeometryCollection](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/GeometryCollection)

### Inferences
- For WZ replays (`.wzr` with subsystem hashes, M4a): hash the tier-A destruction state (damage stages per stable ID, lane blocks, settled-rubble selections) in the sim hash. Exclude physics debris transforms, or give them a separate tier-B hash that is reported but not gated. This mirrors the D79 cosmetic-scatter rule ("switching it off changes no tier A hash"). A useful CI assertion: running with debris physics disabled produces identical tier-A hashes.
- Damage evaluation (which part breaks) must also be tier A if it affects gameplay. Siege-style raycast damage resolution against physics geometry would pull Jolt into tier A. A WZ design should resolve structural damage against generator-side proxy data (part graph from `eng_gen_arch`), not against Jolt collision.

### Gaps
- No public description was found of how Battlefield, The Finals or Siege record destruction in killcams or replays.

---

## 5. Performance budgets: debris counts, step costs, memory, cleanup

### Takeaway
Concrete published caps are rare. The public evidence is mechanisms (sleep-based removal, culling and prioritization, full-state memory costs), not numbers. Teardown's half a billion voxels per large level and about 80 MB of saved state is the main hard data point.

### Cited Findings
- Chaos: `remove_on_max_sleep` with a "maximum sleep time" before removal, a "removal duration", optional crumbling of partial clusters on removal, and `max_cluster_level` to cap break depth. No performance guidance is given. — [UE Python API: GeometryCollection](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/GeometryCollection)
- Battlefield 6 relies on "culling and prioritization" to keep destruction smooth "across all platforms". No numbers. — [EA / Frostbite](https://www.ea.com/ea-play/news/how-battlefield-6-redefined-destruction)
- Teardown: about 0.5 billion voxels in large levels, RLE to 15–20%, about 80 MB quicksaves. — [Voxagon blog](https://blog.voxagon.se/2020/11/18/teardown-quicksave.html)
- RFG PC fan project: a community RFG project split work to avoid "RAM exhaustion" from huge debris piles. **Weak: fan project, not developer.** — [Red Faction Wiki / search summary](https://www.redfactionwiki.com/wiki/GeoMod_2.0)
- RFG's own developers called the Xbox 360 maxed out by Geo-Mod 2.0. **Press interview, no numbers.** — [GameWatcher interview](https://www.gamewatcher.com/interviews/red-faction-guerrilla-interview/11408)

### Inferences
- WZ should set its own budgets as counters (M1b `eng_prof`), with numbers to be measured rather than copied. Starting points:
  - max simultaneously awake debris bodies per frame, globally and per cell;
  - max debris lifetime before conversion to static rubble or removal (Chaos remove-on-sleep pattern);
  - max destruction events per tick processed (overflow deferred, not dropped, because they are tier A);
  - max nav tiles rebuilt per frame (Recast tile rebuild budget, Mononen's tile-size advice).
- "Debris converts to static rubble when asleep" is the key bridge between tier B (physics) and persistence. The settled result is replaced by the tier-A rubble archetype, so memory does not accumulate and the save stays small.

### Gaps
- No sourced numeric debris caps or cleanup timers for any console or PC title (RFG, JC, BF, The Finals). This is the largest gap. GDC Vault talks (RFG 2009, Siege 2016) are likely sources but were not accessible in this pass.
- No physics step cost figures were found.

---

## 6. Testing and tooling

### Takeaway
Public material is thin. Frostbite mentions new debugging tools and editor improvements for tuning destructible materials. Bethesda's "Never Resets" flag is an example of per-area designer control. No source describes automated destruction tests or stress-scene metrics.

### Cited Findings
- Battlefield 6: "new debugging tools" sped iteration; editor enhancements simplified tuning destructible materials. VFX and audio for seams and surfaces are driven by the same material parameters. — [EA / Frostbite](https://www.ea.com/ea-play/news/how-battlefield-6-redefined-destruction)
- Bethesda: Encounter Zone "Never Resets" flag; scripted `Reset()`. — [UESP CS wiki: Cell Reset](https://cs.uesp.net/wiki/Cell_Reset)
- RFG multiplayer: a GDC session on multiplayer level design covers how to use the destructible environment and avoid players abusing it. **Contents not read; title only.** — [GDC Vault: Multiplayer Level Design in Red Faction Guerrilla](https://gdcvault.com/play/1012330/contactUs)
- Siege: GDC 2016 talk on integrating RealBlast as a core gameplay feature and the technical hurdles involved. **Contents not read.** — [GDC Vault](https://gdcvault.com/play/1023003/The-Art-of-Destruction-in)

### Inferences
- WZ's existing machinery covers most of what studios had to build by hand:
  - **Headless stress scenes with golden hashes:** destroy N buildings in a cell via scripted `player_cmd`, then assert tier-A hash, nav tile count, lane blocks and counter budgets.
  - **Local-stability test** (ARCHITECTURE rule 7) extended to destruction: destroying a building changes no output outside its cell and margin, except the declared neighbourhood.
  - **Indestructible / keep-out zones as authored inputs:** D79 already has keep-out zones. An `indestructible` flag and a per-area destruction budget can be the same mechanism.
  - **Version-bump report** must list destruction deltas that became orphans, for example a destroyed building whose anchor vanished after a generator change.

### Gaps
- No primary source was found on automated destruction testing at DICE, Embark, Ubisoft, Volition or Avalanche.

---

## 7. Gameplay design: fully destructible vs. scripted, and genre expectations

### Takeaway
Shipped designs stay "systemic and controlled". Battlefield's own wording is that destruction should tell a story without becoming chaos. Most games limit what can break: RFG buildings yes, terrain no; JC3 resets set pieces; NMS caps edits. Strategy games treat destruction as a sim state with a cleanup and rebuild loop, not as physics.

### Cited Findings
- Battlefield 6: destruction is "systemic and controlled". It enables "opportunistic gameplay". Collapsing structures become cover; designed debris piles reshape the play space. — [EA / Frostbite](https://www.ea.com/ea-play/news/how-battlefield-6-redefined-destruction)
- Battlefield lineage: Destruction 1.0 (Bad Company, Frostbite 1.0) and Destruction 2.0 (Bad Company 2). **Fan wiki.** — [Battlefield Wiki: Destruction](https://battlefield.fandom.com/wiki/Destruction); [Shacknews](https://www.shacknews.com/article/57920/battlefield-bad-company-2-first)
- RFG: buildings and cover destructible, terrain not (Wikipedia mirror, weak). Structures collapse when enough supports are knocked out. — [Wikipedia: Red Faction: Guerrilla](https://www.wikipedia.org/wiki/Red_Faction_Guerilla); [GameWatcher](https://www.gamewatcher.com/2009-24-03-volition-five-to-ten-years-ahead-of-everyone-with-red-faction)
- Just Cause 3: destruction is chainable (Avalanche: a whole base destroyed by one tether pull). Set-piece bridges respawn so players can repeat the spectacle. — [GamesRadar: Avalanche on destruction](https://www.gamesradar.com/why-just-cause-3-all-about-destruction-explained-avalanche); [PC Gamer](https://pcgamer.com/wreaking-havoc-in-just-cause-3s-playground-of-explosions-do-not-publish/2)
- Cities: Skylines: disasters are a management challenge (warning, evacuation, rescue, rubble clearing, rebuild), not a physics showcase. — [PC Gamer](https://pcgamer.com/natural-disasters-lets-you-destroy-your-cities-skylines-cities-but-also-save-them)

### Inferences
- For WZ, expectations differ by mode:
  - **GTA-like city:** players expect visual destruction of props and vehicles, and a world that "heals" (D79 reset policy). Full building collapse is rare and spectacular, and it is the case that stresses persistence and navigation.
  - **Strategy mode:** destruction is a sim state (damaged, ruined, cleared, rebuilt) that is a generator input exactly like D39 player commands. Physics debris is purely cosmetic.
  - **Planet exploration:** terrain edits need a budget and a visible overflow policy (the No Man's Sky lesson).
- Designing destruction as discrete, generator-understood damage stages per building part (RFG's pre-broken meshes and BF's part-based health transitions point the same way) fits WZ's regenerate-from-recipe model far better than free-form fracture. Free-form fracture (Teardown voxels) forces full-state storage.

### Gaps
- No primary source on the Levolution (Battlefield 4) design rationale was gathered in this pass.
- No player-research data on destruction expectations by genre was found.
