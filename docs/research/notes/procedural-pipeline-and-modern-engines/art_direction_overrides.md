# Art direction, iteration and human overrides on procedural content (state 2025–2026)

Scope: how hand edits survive regeneration, how procedural output is art-directed and reviewed, what code-first ("asset as program") projects do, including AI-written generators, and iteration-speed tooling. Context: Wallhammer Zero (C17, AI-written generators, owner approves in a Dear ImGui studio, asset = program + params + seed cached by hash, pristine/edited layers, per-cell deltas keyed by (owner cell, stable id = hash(world seed, rule name hash, anchor key)), versioned generator domains, scale/style lints; see `wallhammerzero/docs/ARCHITECTURE.md` and ROADMAP M3).

Research budget: about 15 searches/fetches. Many sources are secondary (blogs, forum posts, search summaries). Primary Epic/SideFX docs on override persistence were not found. Items marked "(older)" predate 2024. Items marked "(not re-fetched)" are well-known primary URLs cited from prior knowledge and not opened in this session.

## 1. Persisting hand edits over regenerated procedural content

### Takeaway
No major engine has a fully solved, documented "edits survive regeneration" system. The common practice is still (a) bake and then freeze, (b) keep hand content in a separate layer or sub-level that the generator does not own, or (c) exclusion volumes and masks. UE 5.8 (June 2026) reportedly added PCG manual edits stored as deltas against generated output, but even its proponents say procedural instances "have no stable identity by default" and that a reseed or a big parameter change orphans the deltas. Games that changed generator logic under existing saves (Minecraft 1.18, No Man's Sky NEXT and Origins) either froze old chunks and blended seams, or broke player bases and had to restore planets to their old state.

### Cited Findings
**Unreal PCG**
- A StraySpark blog post (Jul 5, 2026) says UE 5.8 shipped on June 17, 2026 with PCG "manual artist edits", described as a "persistent delta recorded against the generated output" that is reapplied after regeneration instead of being discarded. The post names no API, saying specifics "may be renamed in a hotfix". It is a secondary source with no links to Epic docs, and I found no Epic page confirming the feature. — [StraySpark](https://www.strayspark.studio/blog/ue5-8-pcg-manual-artist-edits)
- The same post: "procedural instances have no stable identity by default"; "Any system must choose between dropping the delta, reattaching it heuristically, or leaving an orphan"; small parameter nudges are expected to keep edits, while "a wholesale reseed" or drastic density changes leave deltas pointing at instances that no longer exist. Edit persistence, undo and World Partition streaming interactions are listed as still being refined. — [StraySpark](https://www.strayspark.studio/blog/ue5-8-pcg-manual-artist-edits)
- UE 5.7 introduced a PCG Editor Mode (graph-driven tools for drawing splines, painting points and placing volumes) and an experimental Procedural Vegetation Editor. — [Epic docs: PCG Editor Mode](https://dev.epicgames.com/documentation/en-us/unreal-engine/pcg-editor-mode-in-unreal-engine); [80.lv: What's new in PCG 5.6/5.7](https://80.lv/articles/what-s-new-in-pcg-in-ue5-6-ue5-7)
- PCG Generation Modes and Hierarchical Generation ("Use Hierarchical Generation", HiGen grid sizes) control when and at what granularity a component regenerates. — [Epic docs: Using PCG generation modes (5.5)](https://dev.epicgames.com/documentation/ja-jp/unreal-engine/using-pcg-generation-modes-in-unreal-engine?application_version=5.5)
- Forum practice: turning off a PCG volume's "Regenerate" toggle stops automatic rebuilds on landscape edits, and generation then happens only on demand. This freezes output rather than protecting edits. — [UE forums](https://forums.unrealengine.com/t/how-to-stop-pause-pcg-generation-when-editing-landscape/1185254/10)
- Reported failure: a graph rebuild deleted a hand-placed tree. The suggested workaround is to snapshot overrides before the rebuild and restore them afterwards, or to mark "manual" areas with a volume that PCG skips. This is a blog workaround, not a documented feature. — [bugnet.io](https://bugnet.io/blog/fix-unreal-pcg-graph-rebuild-loses-author-overrides)
- Reported fragility: PCG content disappears at runtime or after reloading a level when GPU spawning is combined with hierarchical generation (5.6/5.7.4). — [UE forums](https://forums.unrealengine.com/t/pcg-5-6-disappearing-from-world-at-runtime/2587336)

**Houdini Engine (bake vs live)**
- Until they are baked, cooked PDG results are owned by the Houdini Asset Actor, so dirtying or changing the PDG asset can destroy or update them. SideFX recommends cooking, then baking, before using assets in production. — [SideFX docs: Houdini Engine for Unreal, PDG](https://www.sidefx.com/docs/houdini/unreal/pdg.html)
- A live HDA keeps a second copy of its data in a hidden Houdini scene so it can recook. In packaged builds the Houdini logic is stripped and assets become static. Bake to a plain mesh or Blueprint to free memory. (older, UE4-era forum) — [SideFX forum](https://www.sidefx.com/forum/topic/39272/)

**Runtime procedural that coexists with hand placement (older but canonical)**
- Horizon Zero Dawn (GDC 2017, older): the placement system's goals were to be art-directable, to blend with hand-placed art, and to be data-driven, deterministic and *locally stable*. Local stability let the art director move mountains, rivers and gameplay without redressing the world. Control came from painted world data plus artist-authored placement graphs. — [Guerrilla GDC 2017 slides](https://www.guerrilla-games.com/media/News/Files/GDC2017_VanMuijden_GPUBasedProceduralPlacementInHorizonZeroDawn.pdf); [Guerrilla article](https://www.guerrilla-games.com/read/gpu-based-procedural-placement-in-horizon-zero-dawn)
- Far Cry 5 (GDC 2018, older): procedural tools for biomes, terrain texturing, freshwater networks and cliff rocks, motivated by the fact that "not every square meter of the world will receive the attention of a level artist". I found no details on the override mechanism. — [GDC Vault](https://gdcvault.com/play/1025557/Procedural-World-Generation-of-Far)

**Generator changes under existing worlds**
- Minecraft 1.18 (2021, older): Mojang added "blending" so there are no harsh borders between old and new terrain. Surface height and biomes blend, caves may differ. — [Minecraft 1.18 Pre-release 1](https://www.minecraft.net/de-de/article/minecraft-1-18-pre-release-1)
- Mojang marked as "Works As Intended" that only biomes at the edge of already-generated terrain have their borders changed. A user reported shifted biome borders inside old terrain too. — [MC-244340](https://bugs.mojang.com/browse/MC-244340)
- Known gaps in the pre-release: no deepslate in new caves under old chunks, no bedrock in old chunks (MC-240481/240482). — [Pre-release notes](https://www.minecraft.net/de-de/article/minecraft-1-18-pre-release-1)
- Unofficial commentary says old chunks keep their old generation and new chunks blend at chunk boundaries, with visible seams and no new ores in old chunks. Unverified blog. — [Craftdex](https://craftdex.net/articles/1-18-rewrote-the-world)
- Bedrock bug: expanding an old world in 1.18 still produced 1.17-type chunks unless the world went through the "World Update" screen first, so the generator version is stored per world. — [MCPE-149436](https://bugs-legacy.mojang.com/browse/MCPE-149436)
- Luanti: the docs say the mapgen is chosen when the world is created. I found no documentation on switching mapgens or versions for an existing world. — [Luanti docs: Map generator](https://docs.luanti.org/for-creators/mapgen/); [Mapgen evolution](https://docs.luanti.org/about/history/mapgen-evolution/)
- No Man's Sky NEXT (2018, older): many players found their bases buried under the terrain after the update. — [PC Gamer](https://www.pcgamer.com/no-mans-sky-beyond-probably-wont-mess-up-your-bases-like-next-did)
- No Man's Sky Origins (2020, older): the planet surface moved unexpectedly, leaving bases buried or floating. Patch 3.01 restored affected planets and bases to their pre-Origins state. Patch 3.02 fixed buildings that had moved and missions that pointed to distant or buried buildings. — [PSFanatic on 3.01](https://www.psfanatic.com/no-mans-sky-origins-patch-3-01-fixes-buried-floating-bases/); [MP1st 3.01](https://mp1st.com/news/no-mans-sky-update-3-01-september-24-rolled-out-for-fixes)
- No Man's Sky Worlds Part I (2024): players reported that bases were intact but the planets themselves changed, "when algorithms change, so too does geography". — [VideoGamer](https://www.videogamer.com/?p=1083764)

### Inferences
- Our design (deltas keyed by stable id = hash(seed, rule, anchor)) is ahead of what UE documents. Its weak point is the same one UE 5.8 has: the anchor key must survive generator changes. If the anchor comes from the output of an upstream rule (for example "the 3rd window of facade X"), any upstream change re-keys everything downstream.
- The NMS lesson: persistent edits must anchor to something the generator cannot move. Store the absolute transform or terrain height with the edit and detect drift ("the anchor moved by more than ε"), rather than storing only relative ids.
- The Minecraft pattern (store the generator version per chunk, freeze old chunks, blend new against old) maps directly onto versioned domains. A cell generated under domain v3 stays v3 unless explicitly migrated, which requires per-cell generator version stamps and a blending policy at cell borders.
- Bake-and-freeze (Houdini, and PCG with Regenerate off) is the industry fallback. We should support it as an explicit per-cell or per-asset state, not only through the edited layer.

### Gaps
- No primary Epic documentation found for the 5.8 manual-edit feature, its storage format, or how it keys instances.
- No source found on World Partition Data Layers being used as an edit layer over PCG output.
- No source on Houdini "Labs" or partition-level overrides, and no SideFX documentation on stable point IDs across recooks (the `id` attribute convention was not verified this session).
- Luanti behaviour for changing mapgen on existing maps is not documented in the sources found.

## 2. Art-directable procedural: parameters, presets, browsing, constraints, review

### Takeaway
Shipped art-directable systems share three traits: artist-authored rules, painted or masked input data, and determinism plus local stability so that edits stay local. Research systems (Infinigen Indoors) separate *what* (declarative constraints) from *how* (solver), which is the cleanest way to encode a style bible. Tiny Glade shows a small team curating every rule by hand ("we curate exactly the experience"). Public material on how art directors review procedural output at scale (contact sheets, golden images, metrics) is thin. Most of what exists is in research benchmarks, not studio talks.

### Cited Findings
- Infinigen Indoors (CVPR 2024): arrangement uses a DSL accessed through a Python API plus a constraint solver that "searches for an arrangement that maximally satisfies a set of given constraints". The authors contrast this with original Infinigen, where users had to customize procedure rules in the implementation. The system is 100% procedural with no external assets, unlike ProcTHOR, which uses AI2-THOR and designer assets. — [arXiv 2406.11824](https://arxiv.org/abs/2406.11824)
- Secondary summaries say the solver uses simulated annealing in a hierarchy (floor plan, then large furniture, then small objects), with a 79.5% pairwise preference over ProcTHOR, ATISS and SceneFormer in an MTurk study. I did not verify these numbers in the paper. — [Emergent Mind summary](https://api.emergentmind.com/topics/infinigen-system)
- Horizon Zero Dawn: placement rules authored in a graph editor by artists, inputs from painted world data, deterministic and locally stable. (older) — [Guerrilla GDC 2017](https://www.guerrilla-games.com/media/News/Files/GDC2017_VanMuijden_GPUBasedProceduralPlacementInHorizonZeroDawn.pdf)
- "Building Blocks: Artist Driven Procedural Buildings" (GDC, older): the designer places very simple shapes to define the layout, then assigns rule sets written by a technical artist to decorate them. — [GDC Vault](https://gdcvault.com/play/1012219/Building-Blocks-Artist-Driven-Procedural)
- Tiny Glade (2024): Anastasia Opara says she writes every rule. "Everything was hand-crafted by Tom and me, and therefore, we curate exactly the experience you will get out of it." — [80.lv interview](https://80.lv/articles/exclusive-tiny-glade-developers-discuss-bevy-proceduralism-publishers-cozy-games/)
- Tiny Glade gives players freeform wall doodling with vertex editing, with randomness confined to small details. A manual colour tool controls the palette. Sources are a review and a fan wiki (the wiki is unreliable). — [PC Gamer](https://pcgamer.com/games/city-builder/tiny-glade-wont-stop-delighting-me-with-new-discoveries); [Shacknews](https://shacknews.com/article/141431/tiny-glade-review-score?amphtml=1)
- Procedural windows and tower roofs in Tiny Glade evolved through iteration on the rules themselves. — [80.lv windows](https://80.lv/articles/procedural-windows-in-pounce-light-s-tiny-glade-get-an-upgrade); [80.lv roofs](https://80.lv/articles/a-look-at-procedural-tower-roofs-in-tiny-glade/)
- Proc3D (arXiv, Jan 2026): an LLM emits a "Procedural Compact Graph" whose key parameters are exposed as sliders and checkboxes for manual adjustment, alongside text-prompt edits. The authors report a representation 4–10× more compact than code DSLs. — [arXiv 2601.12234](https://arxiv.org/html/2601.12234)

### Inferences
- A style bible in code works best as declarative constraints plus scored soft rules (Infinigen Indoors style) that both the lints and the generator read. This avoids encoding style twice, once in generator code and again in the lints.
- "Locally stable" (HZD) should be an explicit, tested property of our generators: changing a parameter or the input in region R must not change output outside R + margin. It is testable with golden diffs per cell.
- Exposed parameters are where the AD actually works (Proc3D sliders, Tiny Glade's colour tool). The schema→panel path in ROADMAP M3a matches this pattern.

### Gaps
- No 2024–2026 studio talk found on review at scale (contact sheets, golden images, perceptual metrics, review queues) for procedural art. Studio practice remains undocumented in these sources.
- No public material found on palette and "style bible as code" systems in shipped games beyond Tiny Glade anecdotes.

## 3. Code-first content ("asset as program") and AI-written generators

### Takeaway
The demoscene (.kkrieger/.werkkzeug) proved "store the creation history, not the pixels" twenty years ago. Dreams stored sculptures as CSG edit lists of SDF primitives. In 2024–2026 research moved to LLMs and VLMs writing the generator code (SceneCraft, 3D-GPT, LL3M, Proc3D, Procedura, MeshCoder, CAD-Coder) with a render-then-critique loop. The key finding from BlenderGym (CVPR 2025) is that state-of-the-art VLMs still struggle with edits that are easy for humans, especially subtle visual differences, and that they make irrelevant code changes. Verification budget matters as much as generation.

### Cited Findings
**Demoscene and edit-list precedents (older)**
- .kkrieger (96 KB) stores textures and meshes as the artist's creation steps (operation history) plus generator code in the executable. It is generated at load time and needs more than 300 MB of RAM. The developers estimate 200–300 MB if stored conventionally. The tool was .werkkzeug, whose werkkzeug3 source was released in 2014 (BSD/public domain). Audio came from the V2 synth fed with MIDI. — [Wikipedia: .kkrieger](https://www.wikipedia.com/wiki/.kkrieger); [GameDev.net: Book I Procedural Content](https://gamedev.net/blogs/entry/508015-book-i-procedural-content)
- Dreams (Media Molecule, SIGGRAPH 2015, older): each primitive is an "edit". The pipeline runs from a CSG edit list through an evaluator to voxels, meshing and a scene graph (40+ compute shaders). Results are cached hierarchically in bricks and rebuilt when the SDF changes. The talk's final design differs from the one that shipped. — [Evans SIGGRAPH 2015 slides](https://advances.realtimerendering.com/s2015/AlexEvans_SIGGRAPH-2015-sml.pdf); [Beyond3D thread](https://forum.beyond3d.com/threads/signed-distance-field-rendering-pros-and-cons-as-used-in-ps4-title-dreams-spawn.57006)
- Inigo Quilez's SDF primitive and operator articles are the de facto reference for code-first SDF modelling (not re-fetched). — [iquilezles.org distance functions](https://iquilezles.org/articles/distfunctions/)

**LLM/VLM-written procedural code (2023–2026)**
- 3D-GPT (2023, revised 2024): three agents (task dispatch, conceptualization, modelling) drive Infinigen procedural functions in Blender through parameters. — [arXiv 2310.12945](https://arxiv.org/abs/2310.12945)
- SceneCraft (ICML 2024 oral): text to Blender Python for scenes with up to about 100 assets. It builds a scene graph, has the LLM write code that turns relations into numeric layout constraints, and refines from renders with a VLM. "Library learning" collects frequently used functions into a reusable library so the system improves without fine-tuning. — [PMLR](https://proceedings.mlr.press/v235/hu24g.html); [ICML poster](https://icml.cc/virtual/2024/poster/33438)
- BlenderGym (CVPR 2025): 245 start/goal scene pairs over 5 tasks, including procedural material editing and procedural geometry editing. Top VLM systems struggle on tasks easy for human Blender users. Failures: subtle visual differences, non-executable code for complex tasks, irrelevant code changes. Splitting compute between generation and verification matters. — [arXiv 2504.01786](https://arxiv.org/pdf/2504.01786)
- LL3M (Aug 2025): a multi-agent system (plan, retrieve, code) writes modular Blender Python, with a RAG over version-specific Blender API docs (BlenderRAG) to cut execution errors. Tested on Blender 4.4. — [arXiv 2508.08228](https://arxiv.org/abs/2508.08228)
- UnrealLLM (ACL Findings 2025): a multi-agent bridge from natural language to Unreal's procedural content tools. — [ACL 2025 Findings PDF](https://preview.aclanthology.org/display_plenaries/2025.findings-acl.994.pdf)
- MeshCoder (Aug 2025): a multimodal LLM turns point clouds into part-structured Blender Python (IoU 86.75%, beating Shape2Prog and PLAD). This is reconstruction, not text-to-generator. — [arXiv 2508.14879](https://arxiv.org/abs/2508.14879)
- CAD-Coder (Doris et al., 2025): a VLM fine-tuned to emit editable CadQuery code from images, reporting a 100% valid-syntax rate. A different paper by Guan et al. uses the same name. — [arXiv 2505.14646](https://arxiv.org/abs/2505.14646)
- Proc3D (Jan 2026, Adobe/USF): an LLM writes a procedural op graph executed in Blender or Unity, with parameters exposed for slider editing. — [arXiv 2601.12234](https://arxiv.org/html/2601.12234)
- Procedura (arXiv 2608.26238, Aug 2026): an agent writes objects as parametric assemblies of named parts joined by typed mates. Each part must pass compile, mate and connectivity checks before admission. A separate vision critic then applies one fix at a time. The benchmark (MechBench-36) is the authors' own. — [papers.cool](https://papers.cool/arxiv/2608.26238); [Emergent Mind](https://www.emergentmind.com/papers/2608.26238)
- ProcFunc (arXiv 2604.26943, 2026) covers Python procedural generators that VLMs can edit. Seen only in search results, not opened. — [Emergent Mind](https://www.emergentmind.com/papers/2604.26943)
- Infinigen (2023, older) is the open procedural natural-world generator that 3D-GPT and others build on (not re-fetched). — [arXiv 2306.09310](https://arxiv.org/abs/2306.09310)

### Inferences
- The convergent 2025–2026 agent pattern is: structured plan → code against a reusable function library → hard validity gates (compile, connectivity, scale) → render → separate VLM critic → minimal one-fix edits. This matches our lints-then-AD-approval loop. Procedura's "one fix at a time" and BlenderGym's "irrelevant code changes" both argue for diff-scoped generator edits and golden diffs on unrelated assets.
- Library learning (SceneCraft) suggests the AI should grow a curated generator-op library over time rather than writing each generator from scratch. That library is itself versioned content.
- A version-specific API RAG (LL3M) is the equivalent of giving our AI an authoritative, generated reference for the engine's generator API, which can come from the `eng_types` schema.

### Gaps
- No source found on Substance Designer graphs vs code from a production 2024–2026 perspective.
- No source found on Shadertoy-to-game pipelines in shipped titles.
- No quantitative source on how often AI-written generators pass human art review (outside the benchmarks).

## 4. Iteration-speed tooling

### Takeaway
The surveyed sources mention tools for regeneration control (UE generation modes, hierarchical grids, the Regenerate toggle, Houdini live HDA recook vs bake) but give almost no numbers on hot-reload latency or incremental regeneration. Dreams' hierarchical cached edit evaluation is the clearest documented example of incremental rebuild.

### Cited Findings
- UE PCG regenerates per component or volume. Hierarchical generation partitions work by grid size so finer grids can be generated separately. — [Epic docs: generation modes](https://dev.epicgames.com/documentation/ja-jp/unreal-engine/using-pcg-generation-modes-in-unreal-engine?application_version=5.5)
- Artists switch off auto-regeneration during landscape edits because it is disruptive and only regenerate on demand, a sign that live regeneration at world scale is too slow or noisy. — [UE forums](https://forums.unrealengine.com/t/how-to-stop-pause-pcg-generation-when-editing-landscape/1185254/10); [Postpone PCG preparation](https://forums.unrealengine.com/t/postpone-pcg-preparation/2039962)
- A Houdini live HDA recooks on parameter change by keeping a hidden Houdini scene (memory cost). Baking ends live iteration. (older) — [SideFX forum](https://www.sidefx.com/forum/topic/39272/)
- Dreams evaluates edit lists hierarchically, caches bricks, and rebuilds only when the SDF changes. (older) — [Evans SIGGRAPH 2015](https://advances.realtimerendering.com/s2015/AlexEvans_SIGGRAPH-2015-sml.pdf)
- .kkrieger shows the cost side: full regeneration at load time with more than 300 MB of working memory. (older) — [Wikipedia](https://www.wikipedia.com/wiki/.kkrieger)

### Inferences
- A Merkle-keyed cache gives incremental regeneration for free only if the hash inputs are fine-grained (per op node, not per asset). A coarse key means any parameter tweak regenerates the whole asset.
- Preview LOD (generating cheaper versions while dragging sliders) is not documented in the sources found. It is worth designing explicitly: a "preview quality" parameter that is excluded from golden hashes.

### Gaps
- No 2024–2026 measurements of PCG or Houdini iteration latency.
- No source on hot reload of generator code (as opposed to parameters) in shipped engines.

## Gaps and risks in the Wallhammer Zero design (synthesis)

1. **Anchor key stability is the whole game.** stable id = hash(seed, rule name hash, anchor key) breaks whenever (a) a rule is renamed or split, (b) the anchor key comes from upstream output order (an index in a list), or (c) an upstream rule's change moves or removes the anchor. UE 5.8's own commentary admits deltas orphan on reseed or density change. You need: anchors from *input-space* features (cell coordinates, authored spline ids, semantic tags), never output indices; rule *ids* separate from rule *names*; a rename map in the domain manifest.
2. **No orphan policy yet.** You need to decide what happens to a delta whose target vanished: drop, heuristic reattach (nearest same-archetype within ε), or keep as a visible orphan for AD review. Recommendation from the sources: keep it visible and route it to the review queue, never drop silently.
3. **Drift detection.** Store the absolute world transform (and terrain height) with every delta. On regeneration, flag deltas whose anchor moved more than ε, so the NMS buried-base failure becomes a lint, not a player bug.
4. **Domain version migration.** Follow the Minecraft pattern: stamp each cell with the domain version, keep old cells on the old generator unless they are explicitly migrated, and define border blending between versions. This requires old generator versions to remain buildable (a cost for AI-written code that gets rewritten freely).
5. **Bake/freeze as a first-class state.** Houdini and PCG both fall back to baking. Add an explicit per-asset or per-cell "frozen" state (output stored, generator ignored) distinct from "edited".
6. **Exclusion/override volumes.** Deltas are per-instance. There is no region-level "generator, keep out" or "hand-authored zone" primitive. The industry workaround of volume-based skipping suggests you need one.
7. **Local stability as a tested property.** Without HZD-style local stability, one parameter tweak can invalidate deltas across the whole world. Add a golden test: perturb region R and assert the output hash is unchanged outside R + margin.
8. **AI edits leaking across assets.** BlenderGym shows that models make irrelevant code changes. A generator edit for asset A can silently change B, C and D. Golden hashes over the whole family should run on every generator commit, and unexpected diffs should block the change.
9. **Verifier capacity.** The 2025 literature says verification compute matters as much as generation. The owner is the only final verifier. Contact sheets, a second evaluator (D56) and lints must filter hard, or the AD becomes the bottleneck. There is no published studio practice to copy.
10. **Style encoded twice.** If style lives in both generator code and lints, they will drift apart. Consider a single declarative style or constraint spec (Infinigen Indoors model) read by both.
11. **Cache key granularity.** Per-asset hashes make every slider move a full regeneration. Per-op Merkle nodes plus a preview-LOD parameter excluded from golden hashes are needed for interactive feel.
12. **Undo across regeneration.** UE 5.8 lists undo with edit persistence as unresolved. Our "undo with author" (M3c) must define what undo means when the edit was made against pristine version N and pristine is now N+1.
