# No Man's Sky: how the procedural generation pipeline works, plus what is known about Light No Fire

Research date: 2026-11-05. Prepared for Wallhammer Zero (C17 + SDL3/SDL_GPU, seeded CPU generation, job system).

**How reliable the sources are.** The strongest primary sources here are the two GDC 2017 talks. I pulled their full YouTube auto-captions (`youtube_transcript_api`, video IDs `C9RyEiEzMiU` and `sCRzxEEcO2Y`) and read them end to end. Auto-captions mishear words: for example "polygons eyes" means "polygonise", "Lodge/logs/lods" means "LODs", and "you ified" means "unified". So treat the quotes below as close paraphrases, not exact wording. Speaker attribution can be checked from inside the talks: McKendrick says "Sean Murray is giving a talk tomorrow at half five", and Murray says "Innes did a good talk earlier".

The second strong source is the community reverse-engineered struct definitions in **MBINCompiler** (monkeyman192, `development` branch, latest release v7.10.0-pre1 dated 2026-10-28). These are field names and layouts taken from the shipping game binary. They are data, but the *semantics* of the fields are community inference.

Each finding below is tagged:
- **[VERIFIED]**: a talk transcript, official patch notes, an official store page, or binary struct layouts.
- **[SECONDARY]**: press or wiki reporting of developer statements.
- **[COMMUNITY]**: reconstruction by modders, or a fan claim.

---

## 1. The seed cascade, what is stored and what is regenerated, determinism, and what updates did to existing worlds

### Takeaway
Generation is strictly top-down. A positional seed for the solar system produces system data. That data plus the planet's own positional seed produces planet parameters. The planet parameters select a terrain preset and biome data, and those drive a terrain generator that is stateless per voxel. Every stage's output is a serialisable data struct (XML/MBIN) that can be dumped and reloaded. Seeds are 64-bit (`GcSeed { u64 Seed; bool UseSeedValue; }`).

Nothing about the world is stored except player edits, bases and discoveries. Hello Games has "rebuilt the universe" several times (Foundation 2016, Atlas Rises 2017, NEXT 2018, Worlds Part I 2024). Since Origins (2020) they protect existing worlds by adding new generation content behind *new* seed space instead: new planets in existing systems, and later a new purple star class. Existing terrain is left untouched.

### Cited findings

**Hierarchy and how seeds flow**
- [VERIFIED, GDC 2017-03-01] McKendrick: "we see generation as this top-down approach always — you're always feeding data through one generator, coming up with some more data, feeding that into the next generator". For terrain: "we're starting by knowing which solar system we're in and we know that by a **positional seed**". That feeds generation of solar-system info: "how close the planets are to the Sun, what kind of sky it has, what the atmosphere is like". The system data plus "the planet's position-based seed" then produces planet info: "whether it should be rocky or [cliffy] or have mountains or oceans". That in turn feeds "our terrain generator which will then come out with the voxel data". — [McKendrick, "Continuous World Generation in No Man's Sky", GDC 2017, YouTube](https://www.youtube.com/watch?v=sCRzxEEcO2Y); [GDC Vault listing](https://www.gdcvault.com/play/1024265/Continuous_World_Generation_in__No_Man_s_Sky_)
- [VERIFIED, GDC 2017] McKendrick: "at any point in between those generators we have a piece of data — we actually have it mostly as **XML data that we can write out and store**". This lets them "step into this generator at as many different levels as possible", "load up future data", and "store past planets and load them again to check for performance degradation". The terrain generator is described as one of several independent generators, alongside the texture generator and the model generator. — [McKendrick GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- [SECONDARY, New Yorker 2015-05-18 via Wikipedia] The universe generator plots star positions and stellar classes from a founding seed, which was "the phone number of one of the Hello Games' developers". Each star's position yields the pseudorandom numbers that define its planetary system, and each planet's position then seeds its features. — [Wikipedia: Development of No Man's Sky](https://en.wikipedia.org/wiki/Development_of_No_Man%27s_Sky), citing Khatchadourian, *The New Yorker*, "World Without End", 18 May 2015 (newyorker.com could not be fetched)
- [SECONDARY, 2014] Hello Games originally planned a **32-bit seed** (about 4.3 billion planets). They switched to **64-bit**, giving about 1.8×10^19 ("18 quintillion") planets, to show scalability and partly in response to forum doubts. — [Wikipedia: Development of NMS](https://en.wikipedia.org/wiki/Development_of_No_Man%27s_Sky), citing Polygon (Owen Good, 2014-08-19) and IGN (2014-08-15)

**Seed and planet-input structs in the shipping data** ([VERIFIED binary layouts, MBINCompiler `development`, 2026-10/11](https://github.com/monkeyman192/MBINCompiler))
- `GcSeed` (size 0x10): `ulong Seed; bool UseSeedValue;`. It is a 64-bit seed with a flag saying whether to use the fixed value or let the game derive one. — [GcSeed.cs](https://github.com/monkeyman192/MBINCompiler/blob/development/libMBIN/Source/NMS/BaseTypes/GcSeed.cs)
- `GcPlanetGenerationInputData` holds: `CommonSubstance`, `RareSubstance`, `GcSeed Seed`, `Biome`, `BiomeSubType`, `Class` (Default/Initial/InInitialSystem), `PlanetIndex`, `PlanetSize`, `RealityIndex` (probably the galaxy index), `Star` (Yellow/Green/Blue/Red/Purple), and bools `ForceContinents, HasRings, InAbandonedSystem, InEmptySystem, InGasGiantSystem, InPirateSystem, Prime`. — [GcPlanetGenerationInputData.cs](https://github.com/monkeyman192/MBINCompiler/blob/development/libMBIN/Source/NMS/GameComponents/GcPlanetGenerationInputData.cs)
- `GcPlanetGenerationIntermediateData` holds: `CreatureRoles` (a role table), `CreatureAirFile/CaveFile/ExtraWaterFile/LandFile/RobotFile/WaterFile`, `ExternalObjectLists` with indices, `GcSeed Seed`, `TerrainFile`, `GcTerrainControls Terrain`, `Biome`, `BiomeSubType`, `Class`, `Size`, `StarType`, `int TerrainSettingIndex`, and `Prime`. This is the "intermediate data" stage McKendrick describes, sitting between the planet seed and terrain generation. — [GcPlanetGenerationIntermediateData.cs](https://github.com/monkeyman192/MBINCompiler/blob/development/libMBIN/Source/NMS/GameComponents/GcPlanetGenerationIntermediateData.cs)
- Many leaf data objects carry their own `GcSeed`, including `GcObjectSpawnData.Seed`, `GcCreatureRoleData.Seed` and `TkVoxelGeneratorData.BaseSeed`. Seeds are therefore sub-derived per object type and per layer, not only per planet. — [MBINCompiler GameComponents](https://github.com/monkeyman192/MBINCompiler/tree/development/libMBIN/Source/NMS/GameComponents)
- Star types enum: `Yellow, Green, Blue, Red, Purple`. Biome enum: `Lush, Toxic, Scorched, Radioactive, Frozen, Barren, Dead, Weird, Red, Green, Blue, Test, Swamp, Lava, Waterworld, GasGiant, All`, which is 17 entries. There are 32 biome subtypes: `None, Standard, HighQuality, Structure, Beam, Hexagon, FractCube, Bubble, Shards, Contour, Shell, BoneSpire, WireCell, HydroGarden, HugePlant, HugeLush, HugeRing, HugeRock, HugeScorch, HugeToxic, Variant_A..D, Infested, Swamp, Lava, Worlds, Remix_A..D`. — [GcBiomeType.cs](https://github.com/monkeyman192/MBINCompiler/blob/development/libMBIN/Source/NMS/GameComponents/GcBiomeType.cs), [GcBiomeSubType.cs](https://github.com/monkeyman192/MBINCompiler/blob/development/libMBIN/Source/NMS/GameComponents/GcBiomeSubType.cs)

**Universe addressing** ([COMMUNITY wiki, derived from in-game coordinate displays](https://nomanssky.miraheze.org/wiki/Galactic_Coordinates))
- A signal-booster address has the form `ScannerID:X:Y:Z:SSI`, for example `HUKYA:046A:0081:0D6D:0038`. X is 0..FFF (3 hex digits), Y is 0..FF (2 hex digits), Z is 0..FFF (3 hex digits), and the solar system index (SSI) is 1..2FF, so up to 767 systems per region. Special SSIs: 0x79 is a black hole and 0x7A is an Atlas station.
- A portal address is 12 hex digits in the order Planet(1) SSI(3) Y(2) Z(3) X(3), recentred so the galactic core is at 0,0,0 (X +0x801, Y −0x7F, Z −0x7FF with wraparound). That puts the region grid at 4096 × 256 × 4096 per galaxy. — [NMS Wiki (Miraheze): Galactic Coordinates](https://nomanssky.miraheze.org/wiki/Galactic_Coordinates)
- [SECONDARY, 2016-10-18] Players found that galaxies begin repeating after the 256th. — [Kotaku, H. Alexandra, 2016-10-18](https://kotaku.com/a-look-at-how-no-mans-skys-procedural-generation-works-1787928446) (credits a video by Ryan Zea)

**What is stored and what is generated**
- [SECONDARY, 2015] Almost everything is generated: systems, planets, weather, flora, fauna, behaviour and buildings. Generating on demand avoids storing planets on a server, yet players who revisit or share a location see the same features. — [Wikipedia: Development of NMS](https://en.wikipedia.org/wiki/Development_of_No_Man%27s_Sky) (citing the New Yorker)
- [VERIFIED, GDC 2017-03-02] Murray: the 2 GB Steam download was "mostly audio", plus "200 megs of prebaked UI". Everything visible in screenshots "was generated in about **300 megs**". At PC launch, "we had like **half a billion discoveries uploaded**", with networking handled by "like one guy". — [Murray, "Building Worlds in No Man's Sky Using Math(s)", GDC 2017](https://www.youtube.com/watch?v=C9RyEiEzMiU)
- [VERIFIED, GDC 2017] McKendrick: once generated, voxel data for nearby regions is **kept in memory uncompressed**, at about 6 bytes per voxel. This is "to let us do really quick terrain edits", and because they run height tests and other queries against the voxels. Discarding and regenerating it, or lossless compression, would be possible but they had not done it. — [McKendrick GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- [VERIFIED, NEXT patch notes 2018-07-24] "Base terrain editing now stops when you hit the limit rather than overwriting old edits", and "Fix for edited terrain regions repeatedly regenerating themselves unnecessarily". So terrain edits are stored as a bounded list of deltas applied over regenerated regions. — [NEXT 1.5 patch notes via TheSixthAxis, 2018-07-24](https://www.thesixthaxis.com/2018/07/24/here-are-the-no-mans-sky-next-1-5-patch-notes-out-now/)
- [SECONDARY, PCGamesN 2021-10-27 via Wikipedia] Expeditions and community goals run server-side on Microsoft Azure, not in the client. — [Wikipedia: Development of NMS](https://en.wikipedia.org/wiki/Development_of_No_Man%27s_Sky)

**Precision and coordinate spaces**
- [VERIFIED, GDC 2017-03-02] Murray: "you were **never within floating point accuracy**… your Y is no longer up". To place a marker on a distant building "you're going to have to **move between multiple different spaces**". Finding "the nearest building of this type" requires generating building locations, which is "really expensive so now you've got to multi-thread it… run it over a longer period", with heuristics, plus validity checks such as underwater or too steep a slope. — [Murray GDC 2017](https://www.youtube.com/watch?v=C9RyEiEzMiU)
- [VERIFIED, GDC 2017] McKendrick: the simulation runs in "this 3D continuous coordinate system" per solar system. They have "one [octree] for the whole solar system" and swap it between planets. — [McKendrick GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)

**Updates that changed generation, and whether existing worlds changed** (each item dated)
- **Foundation 1.1 (Nov 2016)** [VERIFIED, Murray GDC 2017]: "we **rebuilt the universe** which meant just doing it all over again… resetting all the players". Players had to be relocated: "we've got to take you and place you somewhere safe… even though the entire universe has changed". After it, players said "the game feels a little bit more epic… and that is the terrain". Also "most people don't update their game and have every level change entirely". — [Murray GDC 2017](https://www.youtube.com/watch?v=C9RyEiEzMiU)
- **Atlas Rises 1.3 (Aug 2017)** [VERIFIED patch notes]: "Regenerated galaxy to remove differences between survival, normal and creative game modes" and "**Repositioned player bases to accommodate generation changes**". Also: "Prevented trees spawning on sheer cliffs", "Improved object placement on slopes", "Improved building distribution", "Improved generation of beaches along shorelines". — [nomanssky.com Atlas Rises](https://www.nomanssky.com/atlas-rises-update/)
- **NEXT 1.5 (2018-07-24)** [VERIFIED patch notes]: "**New terrain generation system** for improved navigability and more varied earth-like and alien landscapes", "Added support for larger bodies of water", "New colour mapping system", "Improved terrain lods… when flying in from space", "Tightened triplanar texture blend areas", "Improved matching of creature body parts to their role", "Herd behaviour". The notes do not explicitly say whether existing planets changed. A Gematsu summary lists "regenerated universe" among the changes since launch. — [TheSixthAxis NEXT notes](https://www.thesixthaxis.com/2018/07/24/here-are-the-no-mans-sky-next-1-5-patch-notes-out-now/); [Gematsu 2018-07](https://gematsu.com/2018/07/no-mans-sky-11-things-that-have-changed-since-launch-trailer)
- **Origins 3.0 (Sep 2020)** [VERIFIED patch notes]: "New planets have been created in most star systems", with "mountains **four times larger** than anything previously possible". "**Terrain generation for existing planets has not been affected, and player bases have not been reset.**" Flora, colour and lighting diversity was regenerated "in such a way that **no existing planet will have its fundamental type or hazard changed**". "**Creature generation has been reset**", and previous creature discoveries are now listed as "Extinct". Cloud coverage is now procedurally generated and varies over time. — [nomanssky.com Origins](https://www.nomanssky.com/origins-update/)
- **Worlds Part I 5.0 (2024-07)** [VERIFIED, Murray byline on Xbox Wire, 2024-07-22]: "a **complete universe refresh**", with "existing biomes have been completely refreshed", new water and clouds, and new creatures, plants, trees and terrain that "have never been seen before, not even by the development team". Bases are not mentioned. [COMMUNITY] Steam players gave conflicting reports on whether known planets changed. — [Xbox Wire 2024-07-22](https://news.xbox.com/en-us/2024/07/22/a-complete-universe-refresh-awaits-no-mans-sky-players-in-worlds-part-i/)
- **Worlds Part II 5.5 (2025-01-29)** [VERIFIED patch notes]: "The terrain generation algorithm has been evolved and refined to generate more diverse planetary shapes… reduce repeating patterns… generate significantly deeper oceans". "**These new terrain settings have been applied to all planets found within purple star systems.** **Terrain in existing systems has not been regenerated, and bases have not been reset.**" The purple-class systems "are additional stars, allowing the universe to expand… without regenerating existing planets or resetting the exploration and construction efforts of the community". Gas giants are "ten times bigger than our biggest planet", and oceans can be "several kilometers deep". New jungle, desert and relic biomes were "added to both existing systems and the new purple-class star systems". — [nomanssky.com Worlds Part II patch notes](https://www.nomanssky.com/worlds-part-ii-update/); [Worlds Part II announcement, Murray](https://www.nomanssky.com/2025/01/no-mans-sky-worlds-part-ii). Note that Shacknews' summary claims existing worlds got a terrain overhaul, which contradicts the official notes. — [Shacknews](https://www.shacknews.com/article/142889/no-mans-sky-update-55-patch-notes)
- [VERIFIED data] Purple has its own branch in the data: `GcGalaxyStarTypes.Purple`, `GcCreatureGenerationData.PurpleSystemSpecific`, and biome subtypes `Worlds` and `Remix_A..D`. — [MBINCompiler](https://github.com/monkeyman192/MBINCompiler)

**Cross-platform determinism**
- [VERIFIED, GDC 2017] McKendrick: "on PC all these jobs are handled on the CPU but on PS4 we do some of them in **compute shaders**". Object placement is named as one: "something that we do in compute shaders on PS4". They "worked simultaneously on both platforms throughout development". — [McKendrick GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)

### Inferences
- The seed cascade is "hash of position at each level". The galaxy index, region XYZ, the SSI and the planet index together form the identity. The 12-hex-digit portal address has 48 bits (4 + 12 + 8 + 12 + 12), so a 64-bit seed per planet can be derived from (galaxy, region, system, planet) with room to spare. This is my inference from the address layout. The exact hash function has not been published.
- Hello Games' practical answer to "patches change generation" has been, in order: (a) regenerate everything and relocate players or bases (2016–2018). (b) Freeze old generation and gate new generators behind new seed-space keys: new planets in existing systems (Origins), and a new star class (Worlds II). (c) Version only the *visual layer* (colours, flora, water, clouds), but never the fundamental type, hazard or terrain of old planets (Origins, Worlds I). For Wallhammer Zero this suggests: put a **generator version** in every seed domain and keep old terrain generators callable. Treat terrain as frozen per version, and treat cosmetics and population as freely updatable.
- Running placement on PS4 GPU compute while PC used the CPU, in a game with shared discoveries, implies that *placement* determinism across devices only had to be "close enough": objects are re-derived locally and are not networked by ID. Terrain shape determinism matters more, because bases and portal addresses depend on it. This is an inference. No Hello Games statement on IEEE-float or cross-platform bit-exactness was found.

### Gaps
- No public source gives the exact seed-derivation or hash function (for example, how `GcSeed` is mixed from region and system coordinates). Reverse-engineering posts exist, but I found none that were reliable.
- No developer statement on floating-point determinism across PC, PS4, Xbox, Switch or macOS builds. The New Yorker original (2015) could not be fetched, so I have only Wikipedia's paraphrase of it.

---

## 2. Terrain mathematics: Sean Murray, GDC 2017 "Building Worlds in No Man's Sky Using Math(s)" (given 2017-03-02)

### Takeaway
Murray calls his terrain function "**Uber Noise**", a "unified method of noise generation". It is fBm whose per-octave behaviour (billow vs ridge sharpness, slope erosion, altitude damping, domain warp, feature amplification, octave emphasis) is itself driven by further noise. It returns an **analytical derivative** so its output can feed further uber-noise layers. It was reached after three to four years of failed approaches: a Minecraft clone, raw high-density Perlin, and DEM-trained noise. It runs in 2D and 3D mixed into a voxel density field to get overhangs and caves. The core constraint is that **a voxel can never query its neighbours**. Derivatives are the substitute for context.

### Cited findings (all [VERIFIED] from the talk transcript unless marked — [YouTube, GDC](https://www.youtube.com/watch?v=C9RyEiEzMiU))
- **Pipeline (gross simplification):** "we generate a whole bunch of noise which is like the terrain and a bunch of other stuff, clouds and populations of stuff… that all goes into some voxels, then we polygonize it, then that goes to render, physics, population."
- **Design problem:** worlds should "surprise me" over hundreds of hours yet "remain playable and… predictable… I needed to know how much memory they were going to take and what kind of performance they would have".
- **Attempt 1, Minecraft method (about five years before the talk, so about 2012):** "trilinear filtered low density Perlin noise fields stacked on top of each other… I got Minecraft and I disassembled it". The terrain is interesting in blocks, but polygonised and "realistic" it becomes "like draping a cloth over that… just a load of mounds and pyramids". There are no crevices and no erosion.
- **Attempt 2, high-density raw Perlin** ("what Space Engine uses"): the features are "extremely repetitive" and "the slope… is reasonably constant", which is unlike the real world with its sharp cliffs. It was used in early trailers with image-processing tricks.
- **Attempt 3, DEM training:** they parsed digital elevation data (Utah), measured the "distribution of shape change", and fed that back into noise. This followed Parberry's paper: "noise in the real world is **exponentially distributed**". The result looked realistic, but "the real world is super boring… you walk for ages and nothing happens". (Parberry's work is "Designer Worlds: Procedural Generation of Infinite Terrain from Real-World Elevation Data", JCGT 2014. Murray refers to it only as "Parberry's paper", so this identification is mine.)
- **Building blocks reviewed:** "Perlin, Simplex, Billow, Ridge, Worley, analytical derivatives, domain warping". Billow = `abs(noise)`, giving rolling hills. Ridge = `1 − abs(noise)`, giving sharp ridges that are "genuinely like Alpine mountains" in 3D with enough octaves.
- **The no-neighbour constraint:** "we have this massive array of voxels, like billions of them… pick an XYZ position… fill in this voxel… you can **never query the voxel round about you**… it cascades… it's an intractable problem". That makes erosion, caves and rivers hard because "one feature needs to flow into another and it needs context". "But what you can get is the **derivative**… you know you're on a slope or on a flat… trending upwards or downwards." That lets slope-dependent detail be smooth in a desert and craggy in the Alps.
- **Derivative output:** "from this Uber noise function we need the analytical derivative returned… even after it's calculated all this billow and ridge… so that we can feed it in further to other things". He credits **Inigo Quilez (IQ)**'s sites for the technique and the images.
- **Many layers:** "in No Man's Sky we generate so many layers of noise, like layers upon layers, and each one feeds into the next into the next".
- **Domain warping:** "distorting the domain of the noise… with another function and often feeding noise into itself in successive octaves". It is used for "our **coastlines, our rivers**", and to make shapes "flow into one another".
- **What uber noise must provide:** "domain warping, erosion on our slopes, control over altitude erosion, ridges, plateaus, terraces, rolling hills, non-repeating features, and an analytical derivative returned at the end". Each control is "a little individual control" and is itself varied by "yet more noise over the top… vary the warp over time or the sharpness or the amplification of features".
  - **Sharpness:** blend between ridge and billow, continuously rather than as a binary choice.
  - **Slope erosion:** control detail on slopes by derivative.
  - **Altitude damping:** "a basin that flattens out", mimicking "tectonic erosion or glacial erosion… varying the amplitude based on the derivative".
  - **Perturb:** domain warp for river-like flows.
  - **Amplify features / octave emphasis:** "have different emphasis on different octaves… really nice trick is to have your **first octave not actually be that prominent** because that's what's giving you these really repetitive sequences of mountains". He wishes they had used DEM statistics to set the emphasis per octave.
- **2D plus 3D mixed:** "we mix 2D and 3D a lot, so that's why you get these kind of overhangs… you go from having to generate millions of voxels to… billions of voxels but it's worth it to get caves and overhangs". Shots show "kilometre, 2 km high mountains sometimes, each with little caves inside them". A single uber-noise layer alone produces warped valleys, cliffs, round edges and changing mountain character.
- **Caves:** "caves is super difficult problem… you need to know when you generate the cave how are you going to break through… [without knowing] the voxels around it".
- **Topics he left out:** "creating SDFs, maintaining that… caves, features, terraces, erosion flowing into rivers, and… noise is very unpredictable and non-evenly distributed".
- **Testing:** "testing the untestable… every player is going to boot up into a different star system and have different memory requirements". The answer was "flying little drones out… a smoke test… after every check-in" that returns performance.
- **Scale and launch numbers:** team "about six people working on the game on average". About 250,000 concurrent on PC at launch. About 1% of PC players sent crash dumps, mostly below minimum spec. About 1 million players on the day Foundation released.
- [SECONDARY, Wikipedia citing the New Yorker 2015] Planet terrain generation is "**about 1,400 lines of code**". Total game code was about 600,000 lines by February 2016 (The Atlantic). Rivers use a brute-force method, not fluid simulation. — [Wikipedia: Development of NMS](https://en.wikipedia.org/wiki/Development_of_No_Man%27s_Sky)

**The likely mathematical lineage: Giliam de Carpentier's derivative-driven turbulence** ([decarpentier.nl, "Scape: Procedural extensions", 2012-01-07](https://www.decarpentier.nl/scape-procedural-extensions), [VERIFIED as de Carpentier's algorithm, not as NMS code])
- `perlinNoiseDeriv` returns `n.x` (the value) and `n.yz` (the analytic gradient).
- **Swiss turbulence** is ridged (`1-|n|`) with gradient-steered warping. Its key lines are `dsum += amp * n.yz * -n.x;`, sampling at `(p + warp*dsum)*freq`, and `amp *= gain * saturate(sum)`, which suppresses detail in valleys and keeps it on peaks. Defaults: lacunarity 2.0, gain 0.5 (about 0.6 with valley smoothing), warp 0.15.
- **Jordan turbulence** uses squared noise (billowy). A gradient accumulator `dsum_damp` damps finer octaves where coarse slopes are flat (thermal-erosion-like), via `damped_amp = amp*(1-damp_scale/(1+dot(dsum_damp,dsum_damp)))`. A second accumulator `dsum_warp` warps toward gullies (fluvial-like). The first octave is computed separately so it can be tuned independently. Defaults: lacunarity 2.0, gain1 0.8, gain 0.5, warp0 0.4, warp 0.35, damp0 1.0, damp 0.8, damp_scale 1.0.
- The page does not mention NMS or Hello Games. [COMMUNITY] The NoMansTerrain README asserts that NMS's uber noise was "co-developed by Giliam de Carpentier (who worked with Hello Games)". I could not verify that from any Hello Games source. The Murray transcript credits IQ's sites ("these sites… IQ"), and slides may have credited more. — [gistya/NoMansTerrain README](https://github.com/gistya/NoMansTerrain)
- [COMMUNITY, contradicted] A 2026-05-26 blog claims Murray described a "uniform" noise. The transcript says "unified method of noise generation", so the claim is a mishearing. — [guhhammer.dev blog](https://guhhammer.dev/blog/post/no-man-s-sky-the-infinite-simulation-7fc39cc4)

### Inferences
- The shipped `TkNoiseUberData` fields (§4) map one-to-one onto Murray's list: `Octaves/Lacunarity/Gain` (fBm), `SharpToRoundFeatures` (ridge↔billow blend), `SlopeErosion/SlopeGain/SlopeBias` (derivative-based detail control), `AltitudeErosion` (altitude damping), `PerturbFeatures` (domain warp), `AmplifyFeatures` (octave emphasis), `RidgeErosion`, and `Remap*`. This strongly confirms that the talk describes the shipping function.
- For a C17 implementation, every noise primitive should return `(value, dvalue/dx, dvalue/dy[, dz])`. Carry `dsum` across octaves in the de Carpentier and IQ style. Treat each "control" as a scalar that can itself be a low-frequency noise sample.

### Gaps
- The slides (with formulas) are not freely accessible. The GDC Vault may hold them behind a login. The exact uber-noise formula and how its terms combine was never published.
- How the "SDF" work Murray mentions is maintained (SDF primitives for grid shapes or features) is unpublished.

---

## 3. The continuous generation pipeline: Innes McKendrick, GDC 2017 "Continuous World Generation in No Man's Sky" (given 2017-03-01)

### Takeaway
Planets are simulated on a true sphere, but voxel data is stored on a cube map inside one octree per solar system. A 2D elevation offset of about 600 m to 1 km is applied in the sphere↔cube transform, with a band about 128 m thick of 1 m voxels on top. Regions are 32³ m and are polygonised as 36³ voxels with overlap, at 6 LODs each twice the size of the last, using **Dual Contouring** (they started with Marching Cubes).

Each region goes through: generate → polygonise → spherify → physics mesh → navmesh → populate. These run as jobs off the main thread, ordered visually: low LOD first, then high LOD in front of the camera, spreading outward.

### Cited findings (all [VERIFIED] from the transcript — [YouTube](https://www.youtube.com/watch?v=sCRzxEEcO2Y), [GDC Vault](https://www.gdcvault.com/play/1024265/Continuous_World_Generation_in__No_Man_s_Sky_))

**Team and engine (2017)**
- Hello Games started with 4 people (3 programmers and 1 artist), and by 2017 had about 20 (about 10 programmers and 5 artists).
- The engine is their own C++ engine. Reason: in about 2013 there were no visible voxel-based projects in Unreal or Unity, and they wanted source access.
- "Our engine is really agnostic to procedural content… a texture is a texture."
- Philosophy: procgen augments artists rather than replacing them, and artists must be able to control it.

**Geometry of the world**
- *Approach 1 (rejected):* infinite flat plane while on the planet, wrapped onto a sphere in a shader with the poles placed far from the player. Problems: pinching, swimming coordinates, points that cannot be mapped consistently (which breaks shared locations), and precision.
- *Approach 2 (rejected):* map projections. They were too expensive or hard to invert, or Earth-specific.
- *Approach 3 (shipped):* simulate on the sphere in 3D continuous coordinates. Up is the normalised position minus the planet centre, and gravity points to the centre.
  - The hairy ball theorem means no continuous tangent field exists. They work around it with triplanar or single-plane projection, or local tangent frames carried from the landing point ("not deterministic but continuous").
- *Storage on a cube:* data is stored on a cube. The sphere→cube transform is "calculating our height offset above the planet, projecting that down onto the sphere just by normalizing that direction and multiplying it by radius, and we can calculate which cube face we're on just by taking the absolute value of the largest direction". It is cheap, so they do it everywhere.
  - Distortion only changes voxel density, so some mountains get slightly fewer voxels.
  - They did not simulate on the cube because "literal edge cases in your world seem like a nightmare".
- *Height band:* cube distortion grows with distance from the surface, so the voxel band is limited to about **128 m**. To get high mountains and deep oceans they add an **elevation noise inside the transform**: the sphere radius varies by **about 600 m to 1 km**, with the 128 m voxel band sitting on top. "Really all we're doing is calculating a single point of noise every time we call this transform." It is cached locally.

**Voxels and regions**
- At the nearest LOD, voxels are **1 m³**.
- Regions are **32×32×32 m**. Polygonising needs one extra row (because vertices sit between 8 voxels), plus overlap to hide seams from precision problems, so they "end up polygonizing an area that's about **36×36×36 voxels**".
- Each voxel is about **6 bytes**: 2 bytes of density, 2 bytes of material IDs (two materials per voxel, such as grass, rock, mountain or sand), and 2 bytes for the blend between the two materials.
- Voxels are kept uncompressed in memory for fast edits and queries. Compression would be "less effective than… Minecraft where your voxels are binary" and would need to be lossless.
- **LOD:** "6 LODs, each one being twice the size of the last", with overlap at the edges and "we tend not to get holes between LODs".
  - Lower LODs also reduce density inside the region, "in the height a lot more than in the X and Z".
  - The 128 m band means near LOD has about 4 regions stacked vertically ("two stacked on top of each other at 32 m" was mentioned for the near case). Far LODs get very cheap quickly.
- **Octree:** regions are kept in an octree around the cube surface. There is "one for the whole solar system", swapped between planets, creating and cancelling regions as you move. The octree makes it "really quick to find lots of regions" or look one up.
- **Whole-planet proxy:** even the lowest LOD cannot cover a large planet, so on entering a system they create "low density voxel spheres… just **two voxels high**", with "six separate polygonised cube faces that map onto our sphere". This gives a cheap planet visible from anywhere in the system.

**Generation, polygonisation and population pipeline per region**
- Hierarchy of when to generate: offline if possible (not possible here). At load time: procedural textures, vertex data for models. Continuously: terrain, alongside texture streaming.
- **Stages:** (1) Generate, filling voxel density from noise. (2) Polygonise. (3) **Spherify**, mapping vertex data onto the sphere. (4) Build physics mesh. (5) Build creature navmesh. (6) Populate with plants, creatures, buildings and gameplay objects.
- **Threading:** "a main update thread and a main graphics thread, and we have a sync point each frame". Terrain work runs on a **job system** and touches the world only at specific points: getting a vertex buffer, adding physics to the world, adding creatures and models. PS4 runs some jobs (including object placement) as compute shaders.
- **Job ordering is driven by what the player sees:** a low LOD fills in quickly, then detail. It is "point based… the stuff in front of us generates first and then the stuff round about us, spreading out from the camera". Physics and navmesh "take up a way more significant chunk of our time than actually generating or polygonizing".

**Terrain generator requirements**
- It must be "**direct and consistent**" (a designer can predict results from parameters; "in the case of the terrain it's largely Sean… that set up the parameters").
- It must be real-time, varied (a large output space, "not have holes in them"), real-world and abstract, adaptable and modular.
- It must be "**data local**": "a single voxel can't know anything about any of the other voxels round about it — it is stateless". Therefore "you don't model erosion as the process of eroding, you model it as the end state".

**2D then 3D**
- *2D pass:* "block out some shapes in 2D", producing per-column values ("the extent to which this voxel is a mountain or is smooth or is a river"). These are kept only briefly. The elevation noise is "really smooth noise… cheap and we store that at this point into a **2D array**". Then 2D features follow, giving essentially a heightmap with no overhangs.
- *3D pass:* "layering Perlin or Simplex noise or… Voronoi or cellular noise… in 3D… with some **turbulence** on positions". Raw 3D noise gives "blob data… floating islands". The cure is "**reducing the density by height** as you move away from the surface". Noise is evaluated in sphere space and written into cube storage, which avoids distortion.
- *Shapes:* "Perlin worms… Perlin noise that was thresholded". **Grid noise**: "consider a grid over the surface… pick some of those points to put some shapes in — cubes or more distorted, natural-looking shapes" are used for mineable terrain resources, with "real control over how often they show up".
- *Subtractive:* caves come from subtracting worms, with "the mouths of caves to be big open spheres".

**Polygonisation**
- "We use **dual contouring**. We started out with marching cubes… marching cubes will only create polygons that lie on the edges… really bad for creating corners… so that's why we moved to using dual contouring."
- They had to handle vertices that land outside their cell ("corners that lie way outside of our cube… consider mass points"), which means clamping to the mass point, as in the standard DC fix.
- A second, **cube-based polygoniser** (Minecraft-like, vertex-heavy but cheap) makes resource-deposit indicator geometry, and only in near LODs.
- A third, flat-plane polygoniser makes the **water surface**. Because of the elevation offset, water planes can lie far above the voxel data, so this polygoniser runs across the planet. They expected to move water to an implicit shader later.

**Vertex data**
- Two normals are stored, **octahedron-encoded**: a smooth normal for texturing and a face normal for lighting (a slightly low-poly look). Two materials plus a blend value are also stored per vertex.

**Fading and streaming visuals**
- Objects and terrain are faded in with a **dither** driven by a per-object value from 0 to 1. The fade is time-based when a region becomes ready.
- Grass thins out by distance. McKendrick wanted more of the fading to be distance-based.
- Trees placed on a low-LOD surface are **re-snapped to the higher-LOD surface** by interpolation, while impostors crossfade to real models.

**Tools**
- "Simon's smoke test tool" captures performance on fixed planets on every build. Fixed planets are needed because performance varies hugely between planets.

- [SECONDARY, nucl.ai 2015 talk summary, 2016-06-22] An earlier McKendrick talk ("Building a Galaxy") gave the same structure: "voxel regions on the planets are stored as **octrees on cubes**, but projected onto spheres, but the voxels are stored as **flat arrays**". It also covered "modular generators" and "triplanar textures to entire planets". — [Isaac Karth, procedural-generation blog, 2016-06-22](https://procedural-generation.isaackarth.com/2016/06/22/building-a-galaxy-procedural-generation-in-no.html)
- [SECONDARY, Eurogamer/Digital Foundry 2016-08-10 via Wikipedia] Planets use voxels with procedural textures, while flora, fauna and surface features use polygons. The target is 30 fps, and Havok handles physics. — [Wikipedia: Development of NMS](https://en.wikipedia.org/wiki/Development_of_No_Man%27s_Sky)

### Inferences
- This architecture maps directly onto a C17 work-stealing job graph. Each region×LOD is a task chain gen→DC→spherify→physics→nav→populate. Only buffer upload and world insertion happen on the main thread. Priority = LOD coarseness first, then view-frustum and distance.
- The "flat arrays inside octree nodes" plus "1 m voxels, 32 m regions, 6 LODs ×2" gives a coverage of 32·2⁵ = 1024 m per region at LOD5. My inference: this is why a separate 2-voxel-high whole-planet proxy is needed.
- 6 bytes/voxel × 36³ ≈ 280 KB per region before compression. That is why HG mention memory pressure.

### Gaps
- The exact DC variant (QEF solver, octree-simplified DC or plain uniform-grid DC) and how LOD seams are stitched are not described beyond "polygonise a bit over and overlap".
- How 2 bytes are split between two material IDs (likely 1 byte each) is my reading of the auto-caption. It is not certain.

---

## 4. Data-driven terrain and biome settings (MBIN/EXML; NoMansTerrain; modding docs)

### Takeaway
Planet terrain is entirely **data presets**. `METADATA/SIMULATION/SOLARSYSTEM/VOXELGENERATORSETTINGS.MBIN` holds an array of `TkVoxelGeneratorSettingsElement`, each with a **Min and Max `TkVoxelGeneratorData`**. A planet picks a preset (`TerrainSettingIndex`) and interpolates every numeric field between Min and Max by its seed. Per-biome `GcTerrainControls` hold float weights per noise layer, grid layer, feature and cave. The array held 10 presets in 2021 and 31 in 2026, and noise layers grew from 7 to 8 (adding `Continent`). That shows HG extend generation by adding data, not code.

### Cited findings
- [VERIFIED binary layout, 2026] `TkVoxelGeneratorData`:
  - `TkNoiseGridData GridLayers[9]` and `GcSeed BaseSeed`.
  - `TkNoiseUberLayerData NoiseLayers[8]`, `TkNoiseFeatureData Features[7]`, `TkNoiseCaveData Caves[1]`.
  - Scalars: `BeachHeight, BuildingSmoothingHeight, BuildingSmoothingRadius, BuildingTextureRadius, BuildingVoxelType, CaveRoofSmoothingDist, MaximumSeaLevelCaveDepth, MinimumCaveDepth, NoSeaBaseLevel, ResourceVoxelType, SeaLevel, WaterFadeInDistance`.
  - Struct size is about 0x1150 bytes.
  - — [TkVoxelGeneratorData.cs](https://github.com/monkeyman192/MBINCompiler/blob/development/libMBIN/Source/NMS/Toolkit/TkVoxelGeneratorData.cs)
- [VERIFIED binary layout] `TkNoiseUberData` holds the uber-noise parameters:
  - `AltitudeErosion, AmplifyFeatures, DebugNoiseType {Plane, Check, Sine, Uber}, Gain, Lacunarity, int Octaves, PerturbFeatures, RemapFromMax/Min, RemapToMax/Min, RidgeErosion, SharpToRoundFeatures, SlopeBias, SlopeErosion, SlopeGain`.
  - — [TkNoiseUberData.cs](https://github.com/monkeyman192/MBINCompiler/blob/development/libMBIN/Source/NMS/Toolkit/TkNoiseUberData.cs)
- [VERIFIED binary layout] `GcTerrainControls` (inside each biome file): `float GridLayers[9], NoiseLayers[8], Features[7], Caves[1]`, `HighWaterActiveFrequency, RockTileFrequency, SubstanceTileFrequency, WaterActiveFrequency`, `bool ForceContinentalNoise`. These are per-biome weights over the layers of the chosen voxel preset. — [GcTerrainControls.cs](https://github.com/monkeyman192/MBINCompiler/blob/development/libMBIN/Source/NMS/GameComponents/GcTerrainControls.cs)
- [VERIFIED binary layout] Terrain tile and material types are given by the `GcTerrainTileType` enum: `Air, Base, Rock, Mountain, Underwater, Cave, Dirt, Liquid, Substance`. Creatures, spawn data and objects reference these tile types. — [GcTerrainTileType.cs](https://github.com/monkeyman192/MBINCompiler/blob/development/libMBIN/Source/NMS/GameComponents/GcTerrainTileType.cs)
- [COMMUNITY, Step Mods, rev. 2021-07-29] VoxelGeneratorSettings was then "an array of **10** TkVoxelGeneratorSettingsElement… each has two children, a Min and Max TkVoxelGeneratorData". If Min equals Max, that aspect is fixed.
  - The 7 noise layers were Base, Hill, Mountain, Rock, UnderWater, Texture, Elevation.
  - The 9 grid layers were Small, Large (pillars or floating islands depending on `HeightOffset` and whether the turbulence layer is active), and Resources_Heridium/Iridium/Copper/Nickel/Aluminium/Gold/Emeril. Each grid has its own single-layer `TurbulenceNoiseLayer`.
  - The 7 features were River, Crater, Arches, ArchesSmall, Blobs, BlobsSmall, Substance. Caves were one `Underground` entry with `Mouth` and `Tunnel`.
  - The 7 uber layers line up with `GcTerrainControls` in biome files.
  - Live values sit in memory near offset +0x1830 to +0x1890 of the planet struct.
  - — [Step Mods: NMS Terrain Generation tutorial](https://stepmodifications.org/wiki/NoMansSky:Tutorials/Terrain_Generation)
- [COMMUNITY, NoMansTerrain README, commits 2026-06 to 2026-08-24] Now **31 preset slots** and **8 noise layers** (adding `Continent`, "lowest-frequency layer: defines continents vs. oceans").
  - Observed ranges across the 31 bundled files: Octaves 0–10, Lacunarity about 2, Gain about 0.5, SlopeErosion 0/1, AltitudeErosion 0–0.25, RidgeErosion 0/1, SlopeGain −0.3 to 0.9, SlopeBias −0.2 to 0.5, SharpToRoundFeatures −1/0/1, AmplifyFeatures 0–0.5, PerturbFeatures −0.1 to 0.21.
  - Layer wrapper fields: `Active, MaximumLOD (1–4), Subtract, VoxelType, Height (1.27–128.27), Width (0–9999), RegionRatio (0.2–1), RegionScale (1–5), RegionGain (1–3), SmoothRadius (0–20), HeightOffset (−128..128), Offset {Base, All, Zero, SeaLevel}, WaterFade {None, Above, Below}, PlateauStratas (0–2.49), PlateauSharpness (1–4), PlateauRegionSize (0/100/1000), SeedOffset (0–3), TileBlendMeters (0–48)`.
  - Grid primitives (`NoiseGridType`): Sphere, Cube, Cone, Torus, Cylinder, Capsule, Corridor, Pipe, Puck, **SuperFormula** (two Gielis superformulas, `Form_m, n1, n2, n3`), **SuperPrimitive** (rounded box: Width/Height/Depth/Thickness/CornerRadiusXY/Z/BottomRadiusOffset), and File.
  - Grids also have orientation and jitter fields, `RandomPrimitive`, and `SwapZY/Hemisphere`.
  - Feature fields: `FeatureType {Tube, Blob}, Trench, Width (1–128), Height (1–100), RegionSize (10–4000), Ratio, HeightVarianceAmplitude/Frequency`.
  - Voxel material enum: `Base, Rock, Mountain, Sand, Cave, Substance_1/2/3, RandomRock, RandomRockOrSubstance`.
  - All bundled files use `BuildingSmoothingRadius = 150`.
  - Its density formula, "Σ NoiseLayers + Σ GridLayers + Σ Features + Caves (subtracted) ± sea-level/building adjustments", is the community's reconstruction, tagged ✅/🔶/❓ by confidence.
  - — [gistya/NoMansTerrain README](https://github.com/gistya/NoMansTerrain)
- [COMMUNITY] The README warns that "terrain mods make your base locations possibly inaccessible". This confirms bases are stored as positions or edits layered over a terrain that is regenerated each time. — [NoMansTerrain](https://github.com/gistya/NoMansTerrain)
- [COMMUNITY, Step Mods] The planet struct "is written to memory by a function nested within a function that generates the solar system data". That function "writes terrain data, minable materials, weather and various other properties". — [Step Mods GcPlanetData-RE (search snippet)](https://stepmodifications.org/wiki/NMS:Reference_Guides/GcPlanetData-RE)

### Inferences
- The scheme is three-level data indirection: **seed → preset index plus per-field lerp(Min, Max, rand) → per-biome layer weights → uber-noise evaluation**. That explains how about 1,400 lines of terrain code yields "families" of planets. A planet "type" is a Min/Max box in parameter space, and the seed is a point inside it.
- `MaximumLOD` per layer means fine layers are simply not evaluated at coarse LODs. This is a cost cut, and it is a known source of popping (NoMansTerrain offers a "lock LOD to max").

### Gaps
- How a preset index is chosen from the biome, planet size or seed (the weighting tables) is not documented. The exact lerp (per-field independent random or shared t) is also unknown.

---

## 5. Flora, fauna, buildings and object placement

### Takeaway
Population uses noise with thresholds plus density masks for natural scatter, and **jittered/offset grids** wherever gameplay needs spacing guarantees or global queries (resources, buildings). Buildings use a grid so that "nearest building from any point" can be computed analytically, even from space.

Creatures are assembled from **descriptor part pools** on shared skeletons, under data-driven archetype, role, density and rarity tables per biome. Creature paths are pre-generated, and creatures are instantiated only near the player.

### Cited findings

**Placement** ([VERIFIED, McKendrick GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y))
- Placement is "really similar to the noise that we're using for generating the [terrain]". Objects are placed "with **cutoff at the highest point**" of a simplex-like field, and "an additional layer of noise that just cuts down on the density" controls spacing.
- Artistic rule (credited to Kate Compton): recursive scale layering, "a tree with some bushes with some small plants with some pebbles at the bottom".
- An **offset grid** is used "so that we can place gameplay objects when we really need control over how far apart those are: split our terrain into grid cells and choose how many of those should be active".
- Objects are placed **per LOD**: big objects go on low-LOD terrain, and grass only appears up close. When higher-LOD terrain arrives, trees are interpolated to the new surface and impostors crossfade to models.
- **Buildings:** "the one thing that we need to see from space… we need a technique where we can take any point on the sphere and determine the nearest building, so we use an **offset grid** technique: split our terrain down into regions and consider each of these points as offset from the center of that, and we can quickly recalculate that from any position".
- **Creatures:** "we generate these paths for them to follow but we don't actually add the creatures till you get in really close". Coming back later finds "those creatures remain in their same positions".

**Spawn data schema** ([VERIFIED binary layouts, MBINCompiler 2026](https://github.com/monkeyman192/MBINCompiler/tree/development/libMBIN/Source/NMS/GameComponents))
- `GcEnvironmentSpawnData`: `Creatures, DetailObjects, DistantObjects, Landmarks, Objects, SelectableObjects`. These are four object tiers by distance and importance.
- `GcObjectSpawnData` fields:
  - Identity and source: `Seed (GcSeed)`, `Placement` (a named placement rule), `Resource`/`AltResources`, `QualityVariants`, `Type {Instanced, Single}`, `Order`.
  - Slope, height and transform: `MinAngle/MaxAngle` (slope), `MinHeight/MaxHeight`, `MaxRaise/MaxLower`, `Min/MaxScale`, `Min/MaxScaleY`, `MaxXZRotation`, `MaxYRotation`, `AlignToNormal`, `SlopeScaling`, `PatchEdgeScaling`, `ShearWindStrength`.
  - Placement interaction: `LargeObjectCoverage {DoNotPlace, DoNotPlaceIgnoreFootprint, DoNotPlaceClose, DoNotPlaceAnywhereNear, OnlyPlaceAround, OnlyPlaceAroundIgnoreFootprint, AlwaysPlace}`, `OverlapStyle {None, SameSeed, All}`, `PlacementPriority`, `ExtraTileTypes`, `RelativeToSeaLevel`, `IsFloatingIsland`.
  - Colour: `GroundColourIndex {Auto, Main, Patch}`, `MatchGroundColour`.
  - Collision and destruction: `DestroyedByTerrainEdit`, `CreaturesCanEat`, collision flags.
  - Impostors: `ImposterType/Activation`.
- `GcObjectSpawnDataVariant`: `LodDistances[]`, `Coverage`, `FlatDensity`, `SlopeDensity`, `SlopeMultiplier`, `MaxRegionRadius`, `MaxImposterRadius`, `FadeOutStart/End/OffsetDistance`. Density is specified separately for flat ground and for slopes, and LOD and fade distances are per object.
- `GcCreatureGenerationData`:
  - `BiomeSpecific[17]`, `SubBiomeSpecific[32]`, `AbandonedSystemSpecific`, `EmptySystemSpecific`, `PurpleSystemSpecific`, and `Generic` weighted lists.
  - `AirArchetypesForEmptyGround`, `SandwormPresenceChance[biome]`.
  - Per-density `Ground/Air/Water/CaveGroupsPerKm[4]`, `DensityModifiers`, `LifeChance[4]`, `LifeLevelDensityModifiers`, `RarityFrequencyModifiers`, `RoleFrequencyModifiers`, `HerdCreaturePenalty`.
- `GcCreatureGenerationArchetypes`: `Air/Cave/Ground/WaterArchetypes` domain tables.
- `GcCreatureSpawnData`: `CreatureID, CreatureRole, CreatureType, Rarity, TileType, HemiSphere, CreatureGroupsPerSquareKm, Min/MaxGroupSize, Min/MaxScale, ActiveInDay/NightChance, Spawn/DespawnDistance, Herd, AllowFur`, plus colour-swap flags.
- `GcCreatureRoleData`: `CreatureId, Seed, Diet, GroupsPerSquareKm, HemiSphere, TileType, Type, Filter`.

**Model composition from parts**
- [VERIFIED binary layout] `TkModelDescriptorList` is a list of `TkResourceDescriptorList { TypeId; Descriptors[] }`. Each `TkResourceDescriptorData` has `{ Id, Name, ReferencePaths[], Chance, Children[] }`. This is a nested tree of mutually exclusive part options, each with a selection chance. — [MBINCompiler Toolkit](https://github.com/monkeyman192/MBINCompiler/tree/development/libMBIN/Source/NMS/Toolkit)
- [SECONDARY, 3DGameDev code analysis via Kotaku, 2016-10-18] "Each geometrical object has a name that points to a descriptor". The descriptors classify regions such as the head, and the generator takes "bits and pieces from descriptor pools until they create a valid critter". Many creatures come from **one base model**, and ships are generated the same way. — [Kotaku 2016-10-18](https://kotaku.com/a-look-at-how-no-mans-skys-procedural-generation-works-1787928446) (original 3dgamedevblog.com was unreachable)
- [SECONDARY, 2014–2016] Creatures are built on a limited set of skeleton "blueprints". Art director Grant Duncan noted that real animals share few skeleton types. The animation system adapts template animations to creature size (Game Informer, 2014-12-24). Creatures come from a part library with skeletons adjusted for plausibility. Objects are tagged, and creatures have affinity levels that drive behaviour (The Atlantic, 2016-02-18). — [Game Informer 2014](https://gameinformer.com/b/features/archive/2014/12/24/a-look-at-no-mans-skys-creature-features); [Wikipedia: Development of NMS](https://en.wikipedia.org/wiki/Development_of_No_Man%27s_Sky)
- [SECONDARY] Flora uses parametric and L-system-style generation, and **SpeedTree** was used for flora variety (SpeedTree, 2016-08-09). — [Wikipedia: Development of NMS](https://en.wikipedia.org/wiki/Development_of_No_Man%27s_Sky)
- [SECONDARY, The Verge 2014-07-01] The target distribution was about 90% of planets uninhabitable, and most of the life-bearing 10% have mundane life. — [Wikipedia: Development of NMS](https://en.wikipedia.org/wiki/Development_of_No_Man%27s_Sky)
- [VERIFIED patch notes] NEXT (2018) "Improved matching of creature body parts to their role" and added herd behaviour. Origins (2020) reset creature generation. — see §1 sources.

### Inferences
- Wallhammer Zero needs two placement primitives: (1) **noise-threshold scatter** with flat and slope densities, evaluated per region and LOD. (2) A **jittered-grid "cell → 0/1 instance at hash(cell) offset"**, for anything that must be globally queryable (POIs, buildings, city blocks, resource nodes). The second is O(1) for "nearest X" from anywhere. That matters for city generation too.

### Gaps
- No primary Hello Games talk on creature generation or procedural animation was found. The GDC 2015 art talk by Grant Duncan ("Learning to love procedural art") was located only as a listing. — [Game Developer](https://gamedeveloper.com/production/video-learning-to-love-procedural-art-while-making-i-no-man-s-sky-i-)
- Settlement and building layout generation (NMS settlements since Frontiers 2021) is not covered by any technical source I found.

---

## 6. Texturing procedural terrain

### Takeaway
Each vertex carries two voxel materials plus a blend weight, and a smooth normal for texturing. The shader does **planet-space triplanar** mapping over a texture atlas of artist-made materials, blended by height maps and recoloured in-game per planet palette. Textures are applied at **two scales that continuously rescale with distance**.

### Cited findings
- [VERIFIED, McKendrick GDC 2017] "It would be really nice if we could afford to store a whole array of different materials… in the vertex data… but it just wouldn't be performant. So instead we have **two materials and the blend value between them**."
- [VERIFIED, McKendrick GDC 2017] "We use that to **triplanar texture**… we are in fact **projecting across the whole sphere**, not on an axis local to a bit of terrain". They expected ugly region-wide blend zones, but "because of how our terrain is shaped we tend to distribute those blend zones across the whole planet".
- [VERIFIED, McKendrick GDC 2017] Texture selection works like this: "we have an **atlas** of textures that relate to those different materials and we… blend between them based on a **height texture**". These are artist-created textures that are "recolored in game". Artist-made textures "really outweighed trying to synthesize these textures".
- [VERIFIED, McKendrick GDC 2017] "We apply these textures at **two different scales**… continuously replace those as you fly… far from the planet you'll see the same texture at a much larger scale… continuously replace and halve those sizes".
- [VERIFIED, McKendrick GDC 2017] Two octahedron-encoded normals: smooth for texturing, face for lighting.
- [VERIFIED binary layout] Procedural textures for models: `TkProceduralTextureLayer { Group, LinkedLayer, Name, Textures[], Probability, SelectToMatchBase }` and `TkProceduralTexture { Name, TextureName, Palette (TkPaletteTexture), AverageColour, Probability, Multiply, TextureGameplayUse }`. These are layered texture stacks with a per-layer probabilistic choice and palette recolouring. — [MBINCompiler Toolkit](https://github.com/monkeyman192/MBINCompiler/tree/development/libMBIN/Source/NMS/Toolkit)
- [VERIFIED patch notes] NEXT (2018): "Tightened triplanar texture blend areas", "New colour mapping system". Atlas Rises (2017): "Replaced all terrain textures with higher detail", "Improved colour palettes". Origins (2020): "Planetary colour diversity has been significantly increased". — sources in §1.

### Gaps
- Palette-selection data per planet (`GcPlanetColourData` exists in MBINCompiler but was not inspected) and the exact atlas layout are not documented here.

---

## 7. Light No Fire (announced at The Game Awards, 2023-12-07)

### Takeaway
Light No Fire is a multiplayer fantasy survival and building RPG on a **single shared, procedurally generated planet the size of Earth**. You ride beasts, fly dragons, sail oceans and rivers, and build persistent communities. It runs on the NMS engine, and NMS updates since 2024 (Worlds I/II, Voyagers) have served as public test beds for its tech.

As of November 2026 there is **no release date** and no technical talk. Murray says the game is "quite far along" (Aug 2026) and that he is deliberately not showing it until close to release.

### Cited findings
- [VERIFIED, official Steam page, fetched 2026-11-05] "Light No Fire is a game about adventure, building, survival and exploration together." "Set on a fantasy planet **the size of Earth**." "A truly open world, with no boundaries at a scale never attempted before." "Construct **persistent buildings and communities**." "**ride wild beasts**", "**fly dragons** over undiscovered landscapes", "**Set sail across vast oceans and rivers**". Tags include Multiplayer, Online Co-op and Procedural Generation. Release date "To be announced", minimum OS "To be confirmed". Developer and publisher: Hello Games. App ID 2719590. — [Steam: Light No Fire](https://store.steampowered.com/app/2719590/Light_No_Fire/)
- [VERIFIED, official site] "a fantasy planet the size of Earth… the depth of a role playing game… the freedom of a survival sandbox". — [lightnofire.com](https://www.lightnofire.com/)
- [SECONDARY, The Verge 2023-12-08 via Wikipedia] Development began in **2018**. — [Wikipedia: Light No Fire](https://en.wikipedia.org/wiki/Light_No_Fire)
- [SECONDARY, TGA 2023 stage interview] Murray promised mountains "miles high, **taller than Everest**", from which you look out over rivers, canyons and continents. — [GamesRadar](https://www.gamesradar.com/no-mans-sky-lead-says-light-no-fire-will-let-you-climb-mountains-that-are-miles-high-taller-than-everest) (body truncated when fetched; headline and search snippet only)
- [SECONDARY, Wikipedia] It "uses the same internal engine as No Man's Sky". Some developments made for it were added to NMS updates. The engine optimisation is linked to an NMS iOS port by October 2026 (citing Polygon). — [Wikipedia: Light No Fire](https://en.wikipedia.org/wiki/Light_No_Fire)
- [VERIFIED, Hello Games post, 2025-08-27, NMS Voyagers 6.0] Much of the Voyagers technology (walkable custom multiplayer-crewed ships, the "Corvettes") is "shared with our next game, Light No Fire… a truly open world, a **shared Earth-sized planet, with real oceans to traverse, needing large boats and crews**". — [nomanssky.com Voyagers](https://www.nomanssky.com/2025/08/voyagers/); [OpenCritic/TheGamer 2025-08-27](https://opencritic.com/news/20532/sean-murray-reveals-that-light-no-fire-s-oceans-will-require-large-boats-and-crews-to-cross)
- [SECONDARY, opinion, TheGamer 2024-09-24 via Wikipedia] Worlds Part I was a "proof of concept" for LNF's "fantasy-themed Super-Earth", based on its storm and water tech. — [Wikipedia: Light No Fire](https://en.wikipedia.org/wiki/Light_No_Fire)
- [VERIFIED, Murray, Worlds Part II post, 2025-01] "I've been working on a **new terrain system** for a little while now". It gives "huge mountains and these massive features", "oceans that can be several kilometers deep", and gas giants "ten times bigger than our biggest planet". Treat the link to LNF terrain as an inference, but timing and authorship match. — [nomanssky.com Worlds Part II](https://www.nomanssky.com/2025/01/no-mans-sky-worlds-part-ii)
- [SECONDARY, Kotaku 2026-08-10, NMS 10th anniversary] Murray: "I don't think people realize just how ambitious it is and how crazy it is". "I thought we would have chatted about it more by now". "I had actually intended that we were going to show it six months later". "Why do any marketing?" "I'm very happy right now just working on it in my own little cave". He plays it "most days". — [Kotaku 2026-08-10](https://kotaku.com/fans-were-originally-supposed-to-have-seen-much-more-of-light-no-fire-by-now-but-sean-murray-is-just-having-too-much-fun-working-on-it-i-dont-think-people-realize-just-how-ambitious-and-crazy-it-2000722957)
- [SECONDARY, Eurogamer 2026-08-10 via Wikipedia] The game is "**quite far along**". Murray "learned a very important lesson" about speaking too early and will wait until close to release. — [Wikipedia: Light No Fire](https://en.wikipedia.org/wiki/Light_No_Fire) (eurogamer.net unfetchable). [SECONDARY, MassivelyOP 2026-08-11] He called a build he played "way beyond what any normal studio would have and not have shown". — [MassivelyOP 2026-08-11](https://massivelyop.com/2026/08/11/sean-murray-says-hello-games-is-holding-back-light-no-fire-reveals-until-absolutely-necessary/)
- [SECONDARY, 2025–2026] The team is described as "another tiny team… continuing at pace" (Murray's Steam post), and confirmed small (PC Gamer 2026-03-25). Murray skipped TGA 2025 and Summer Game Fest 2025. In January 2026 he said "I am really pleased with the progress we are making" (PCGamesN 2026-01-08). — [Wikipedia: Light No Fire](https://en.wikipedia.org/wiki/Light_No_Fire); [GamesRadar](https://www.gamesradar.com/games/survival/well-darn-hello-games-sean-murray-says-the-team-working-on-no-mans-sky-follow-up-light-no-fire-is-tiny-and-working-in-the-background)
- [COMMUNITY/speculation] Fans speculated about an August 2026 release (the NMS 10th anniversary). It did not happen. As of September to November 2026 outlets list release as TBA, with guesses of late 2026 or 2027. — [PCGamesN guide](https://www.pcgamesn.com/light-no-fire/guide); [lightnofirewiki (fan site)](https://lightnofirewiki.wiki/en/release-info/light-no-fire-release-date/)

### Inferences
- An Earth-sized world (radius about 6,371 km) is roughly 10 to 30 times the radius of typical NMS planets. Under McKendrick's scheme, a 1 km elevation offset and a 128 m voxel band would be inadequate for "miles high" mountains and km-deep oceans. The Worlds Part II "new terrain system" (km-deep oceans, "colossal" non-gas-giant worlds, an 8th `Continent` noise layer, `ForceContinentalNoise`) is the most likely public glimpse of LNF terrain tech. This is speculative but consistent.
- A shared persistent planet means LNF needs authoritative server storage of edits and buildings at planet scale, unlike NMS's local edit lists. Nothing is published on how they do this.

### Gaps
- There are no LNF technical talks, papers or job-posting tech details. Nothing public on LNF's terrain representation (voxel band size, LOD count), server architecture, player cap or precision scheme (for example 64-bit positions). No release date as of 2026-11-05.

---

## 8. Lessons Hello Games has stated

### Takeaway
The recurring lessons are:
- Real-world realism is boring, so exaggerate scale and vary noise character across space.
- Locality (stateless voxels) forces "end-state" modelling with derivatives.
- Artists must stay in control through data.
- Mass-evaluation tooling (smoke tests on fixed planets, browsing many generated outputs) is essential.
- Variety in noise parameters matters more than parameter count.

The "oatmeal" criticism was answered over the years by adding generator *content* (new biomes, subtypes, terrain presets, star class) rather than new math.

### Cited findings
- [VERIFIED, Murray GDC 2017] DEM-realistic terrain "looks real… but… walking in the real world is super boring". "These are the kinds of shapes that we want… you just want it at a different scale." — [Murray GDC 2017](https://www.youtube.com/watch?v=C9RyEiEzMiU)
- [VERIFIED, Murray GDC 2017] People who have played 100 hours still land on planets that look "like something I hadn't seen before". He attributes the long playtimes to "the diversity of the worlds". After Foundation's terrain changes the game "feels a little bit more epic". — [Murray GDC 2017](https://www.youtube.com/watch?v=C9RyEiEzMiU)
- [VERIFIED, Murray GDC 2017] The engine dictates design, and "every new genre… was created in a new engine". Unique engine constraints create "a cascade of problems" that is part of the appeal. — [Murray GDC 2017](https://www.youtube.com/watch?v=C9RyEiEzMiU)
- [VERIFIED, McKendrick GDC 2017] Evaluation: artists must "see vast quantities [of] all the assets that come from that model", and "really quickly go through loads of planets". Smoke tests on the same planets every build are "really fundamental". If you do procgen, "focusing on these tools is a really significant thing to do". Procgen is "a way to augment [artists]". — [McKendrick GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- [VERIFIED, McKendrick GDC 2017] Every technical decision had to be "really pragmatic" for a team of about 20. They chose the sphere over the cube to avoid "literal edge cases in your world". — [McKendrick GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- [SECONDARY, New Yorker 2015 via Wikipedia] Terrain generator is about 1,400 lines. — [Wikipedia: Development of NMS](https://en.wikipedia.org/wiki/Development_of_No_Man%27s_Sky)
- [VERIFIED patch notes 2017–2025] The variety fixes over time were all additions of content and data:
  - Atlas Rises: no trees on cliffs, better slope placement and building distribution.
  - NEXT: a new terrain system "for improved navigability", larger water bodies, a colour mapping system.
  - Origins: 4× mountains, "over doubling the available diversity" of plants and rocks, swamp, volcanic and infested variants, giant sandworms, procedurally generated clouds.
  - Worlds I: biomes refreshed.
  - Worlds II: "reduce repeating patterns on individual planets", deep oceans, gas giants, jungle, desert and relic worlds.
  - — sources in §1.
- [COMMUNITY / not fetched] "10,000 bowls of oatmeal" is Kate Compton's phrase, from her blog post "So you want to build a generator" (2016). It distinguishes *mathematically* unique outputs from *perceptually* unique ones and is commonly applied to NMS. I could not fetch the original (HTTP 403), so the wording is unverified. — [galaxykate0.tumblr.com (403 when fetched)](https://galaxykate0.tumblr.com/post/139774965871/so-you-want-to-build-a-generator). McKendrick cites Compton's layering advice in his talk.

### Inferences
- For Wallhammer Zero, the stated lessons suggest:
  - **Gameplay-scale exaggeration** beats realism.
  - **Spatially varying noise character** (the controls themselves are noise) beats more octaves.
  - **Data presets with Min/Max ranges** make variety tunable by non-programmers.
  - **Fixed-seed regression captures** (screenshots plus performance) on every build are required from day one.
  - Generator versions need to be part of the seed domain, so content can grow without breaking saved worlds.

### Gaps
- No Hello Games post-mortem directly addresses the "oatmeal" criticism. The connection is drawn from patch notes and press. No source for "tuning for traversability" beyond NEXT's "improved navigability" note and Atlas Rises' slope and cliff placement fixes.
