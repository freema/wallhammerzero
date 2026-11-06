# Comparing our procedural pipeline and AI workflow with practice (state as of 2026-11-05)

Our documents under comparison: `docs/research/procedural-graphics.md` (hereafter "PG"), `docs/research/ai-capabilities-in-procedural-3d.md` (hereafter "AI"), `docs/DECISIONS.md` (D8 everything from code, D13 the GTA III/WoW bar, D14 textures from code or from a one-off AI image). Roles: owner = art director (specification, references, approval), Claude = programmer and technical artist.

A note on method: the scope of the research was ~25 searches/fetches. Some primary sources could not be fetched (Kate Compton's essay: 403/500; the UE PCG overview documentation returned an empty body; GDC talks are video). Such points are in Gaps or marked as secondary.

---

## 1. Industry procedural pipelines: what they do and we do not

### Takeaway
All documented production pipelines (Far Cry 5, Embark/The Finals, Horizon, UE PCG, Infinigen) share the same division: **a tech-art team builds the generators, artists and designers use them through parameters directly in the game editor and hand-polish the places that get their attention**. Our pipeline has a strong "tech-art" half (pure functions, Merkle cache, determinism, lints), but the "user" half for the owner (live parameters, curation, overrides, inspection of intermediate steps) is pushed back to "optional from M3". This is the biggest structural difference.

### Cited Findings
**Far Cry 5 (Ubisoft, 2018)**
- Ubisoft developed a set of procedural tools for generating biomes, terrain texturing, freshwater networks, cliffs and more. — [GDC Vault, Carrier](https://gdcvault.com/play/1025557/Procedural-World-Generation-of-Far); [80.lv, 2018](https://80.lv/articles/houdini-procedural-world-generation-of-far-cry-5/)
- The tools were built in Houdini by a team of procedural tech artists (fresh water, power lines, sands, cliffs, biomes, fog density map, world map) and were "fully integrated into the Ubisoft game editor, so that game artists could craft the world using the Houdini tools from within the editor they already used" — [SideFX, Far Cry 5](https://www.sidefx.com/community/far-cry-5/) (via a search snippet)
- Motivation: "Not every square meter of the world will receive the attention of a level artist or a level designer"; area ~100 km²; "creating natural-looking environments is a bigger challenge" than filling the area — [80.lv, 2018](https://80.lv/articles/houdini-procedural-world-generation-of-far-cry-5/)

**Embark Studios – The Finals / ARC Raiders (80.lv, 3 Mar 2026)**
- Building Creator = a modular set of cooperating HDAs ("Feature Nodes" for walls, floors, roofs, windows, doors); lesson: **a modular set of HDAs worked better than one all-embracing HDA** — [80.lv 2026](https://80.lv/articles/how-embark-studios-built-procedural-environments-for-the-finals-using-houdini)
- **A shared blockout mesh gives every Feature Node the same spatial context** — same source
- Iteration of "4–6 minutes per change" from blockout to fractured asset; collisions and occluders "fully automated and requiring no manual work" — same source
- Art direction was encoded into specialized nodes (Kyoto Roof Feature Node) and into a single rule for interiors in Monaco, because varied interiors confused players (readability > variability) — same source
- The same tools were reused in ARC Raiders (Buried City), but **only for base meshes** — same source
- GDC 2026: an Embark tech artist works with Houdini + USD, topic "where artistic control and procedural automation meet" — [SideFX Houdini HIVE GDC 2026](https://www.sidefx.com/houdini-hive/gdc-2026/) (snippet)
- Embark states on Steam that it "may use procedural- and AI-based tools to assist with content creation"; the claim about "a quarter of an AAA budget" is only from secondary sources — [PC Gamer](https://pcgamer.com/gaming-industry/arc-raiders-use-of-ai-highlights-the-tension-and-confusion-over-where-machine-learning-ends-and-generative-ai-begins); [finalboss.io](https://finalboss.io/embark-s-real-trick-wasn-t-ai-it)

**Unreal Engine 5 PCG (documentation 5.3–5.8)**
- Node settings marked as overridable in C++ can be driven by attributes; there are global and individual override pins; for Blueprint nodes every "instance editable" variable is overridable — [Epic PCG overview](https://dev.epicgames.com/documentation/en-us/unreal-engine/procedural-content-generation-overview) (snippet)
- Attribute sets can be created from data tables — [SideFX: Houdini PCG integration](https://www.sidefx.com/docs/houdini/unreal/pcg/overview.html) (snippet)
- The Biome Core plugin keeps the properties of biome assets in a local attribute table and offers per-asset overrides (cast shadow, collision); Epic marks it as experimental and recommends copying the plugin so that future versions do not break it — [Epic Biome Core](https://dev.epicgames.com/documentation/en-us/unreal-engine/procedural-content-generation-pcg-biome-core-and-sample-plugins-overview-guide-in-unreal-engine)
- **Hierarchical generation**: the Grid Size node sets the grid size for everything downstream; components are named by grid size (e.g. `PCGPartitionActor_12800_...`), "Unbounded" runs once without a grid. **Runtime generation**: components within the source radius are scheduled for generation, those outside radius × Cleanup Radius Multiplier are cleaned up; radii per grid size — [Epic: PCG generation modes](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-pcg-generation-modes-in-unreal-engine)
- The community treats "cross-partition coherent generation" in hierarchical runtime generation as an open problem — [UE forum](https://forums.unrealengine.com/t/cross-partition-coherent-generation-in-pcg-with-hierarchical-runtime-generation/2728364)

**Infinigen (Princeton, CVPR 2023)**
- 182 generators, 1,070 "interpretable degrees of freedom" (Creatures 39/315, Materials 50/271, Small Plants 30/258, Terrain 26/17); the authors admit that the count "could be an overestimate as not all parameters are fully independent" — [Infinigen paper](https://ar5iv.labs.arxiv.org/html/2306.09310)
- Generators are "probabilistic programs each specialized to produce one subclass of assets"; high-level parameters are sampled from **distributions "tuned to mirror the natural world"**, every parameter can be overridden through the Python API; for creatures the authors "modelled 30 example heads and bodies" to tune the distributions — same source
- 40,485 lines of code; the **Node Transpiler** converts Blender node graphs to Python so that "non-programmers" can contribute; distribution annotations in node names insert the RNG into the generated code — same source
- Validation: ground truth from geometry; **no human rating of realism**, real scenes only qualitatively; contains no human-made objects; a pair of 1080p frames takes 3.5 h — same source

**Others**
- Horizon Zero Dawn: placement "fully data-driven, deterministic and locally stable", rules in a graph editor — cited in PG from [Guerrilla GDC 2017](https://www.guerrilla-games.com/read/gpu-based-procedural-placement-in-horizon-zero-dawn)
- Ghost Recon Wildlands: World Machine "was not fully deterministic" — cited in PG from [80.lv](https://80.lv/articles/landscape-and-material-pipeline-of-ghost-recon-wildlands/)
- No Man's Sky: pipeline voxels → polygonization → texturing → population → simulation (McKendrick, GDC 2017); Murray: terrain "without artistic input, using mathematics" (secondary) — [GDC Vault 1024265](https://gdcvault.com/play/1024265/Continuous-World-Generation-in-No); [PCGamesN](https://www.pcgamesn.com/no-mans-sky/no-mans-sky-sean-murray-gdc-2017)
- An academic text on HDAs in Maya: showing all HDA parameters in the host application "overloads" the artist and slows them down — [core.ac.uk](https://core.ac.uk/download/232282292.pdf) (snippet); GDC 2022 "Procedural Primer for Artists" (Magee) covers how to set up tools "for artistic control" — [SideFX](https://www.sidefx.com/learn/talks/procedural-primer-for-artists/)

### Inferences
- **Validation of our architecture:** UE PCG hierarchical + runtime generation (grids of different sizes, a generation and cleanup radius) is a commercial counterpart of our L3–L0 hierarchy and streamed generation; HZD and Wildlands confirm the emphasis on determinism. At the architecture level we are not outside practice; our determinism across OSes is even stricter than UE PCG (which promises nothing about bit-exactness — gap).
- **Gap 1 – "editor integration" for the owner:** everywhere, tech art builds the tool and the artist drives it with parameters *in the game editor*. For us Claude = tech artist, owner = "artist", but the owner has only text key-value recipes and the cimgui panels "can run in parallel from M3" (PG, the milestones section). Without a live panel every aesthetic change is a round trip through the agent. Proposal: promote the parameter panel to a **mandatory part of M3**.
- **Gap 2 – curation and parameter distributions:** Infinigen does not sample from ranges but from tuned distributions (calibrated on 30 examples). Our recipes have parameters and a seed, but no *distribution* and no *curated whitelist*. Proposal: the parameter schema carries `dist` (uniform/normal/discrete with weights) and every family has `presets` approved by the owner; runtime generation (buildings in cells) samples only inside approved presets.
- **Gap 3 – overrides / hand-dressing:** UE PCG has per-asset overrides in tables, FC5 lets artists finish hero places by hand. We have a designed cell diff and "designer inputs" (stamps, masks), but no tool for the owner to create them. For an AD (not a modeler) the operations **pin / reroll / ban seed / parameter nudge / stamp** in the cell preview are enough, written as files in `content/world/overrides`.
- **Gap 4 – shared context:** Embark's "shared blockout mesh" corresponds to our requirement that kit parts read the semantics of the building. Proposal: an explicit "building context" data structure (mass, openings, floors, orientation) passed to all kit generators and written into vertex attributes — it codifies what PG describes for Tiny Glade.
- **Gap 5 – readability > variability:** Embark deliberately unified interiors for readability. Our lints measure variability (16 seeds), but nothing measures **too much** variability (chaos). It belongs in the style lints (see question 3).
- **Gap 6 – iteration speed:** Embark's 4–6 min/change is considered a success. Our "under a second" goal is an estimate (PG admits it); even 10× slower would be competitive. The risk is not speed but that the loop has to be driven by the agent.
- A modular set of generators instead of one (Embark, Tiny Glade in PG, Infinigen "one subclass per program") confirms our decision "one program per archetype".

### Gaps
- Spider-Man 2 / Insomniac and Cyberpunk 2077: I found no primary source on their procedural tools (only a dated quote from an Insomniac art director from 2013 that Houdini is a "massive time saver").
- Horizon Forbidden West, Tiny Glade (beyond what PG already cites), Townscaper: not fetched.
- Details of UE PCG (debug inspection of attributes, seed/determinism, custom HLSL nodes): the documentation page returned an empty body; I do not know whether PCG guarantees determinism across platforms.
- The content of the Carrier (GDC 2018) and Magee (GDC 2022) talks exists only as video, unverified.
- No Man's Sky "data-driven terrain settings" for artists: nothing concrete found.

---

## 2. A code library of operators instead of node graphs — right when AI writes the code and the owner is the AD?

### Takeaway
Yes for the *authoring format*: evidence shows that LLMs reliably write executable code, but material graphs written by an LLM are plausible only for shallow graphs, and even Infinigen has code as its canonical form (graphs are only transpiled). But a "read-only graph" is a weak substitute for what graphs give the *user*: a preview of each intermediate step, exposed parameters and direct manipulation. I recommend a hybrid: **code + a declared parameter schema → an auto-generated cimgui panel + a "recipe trace" with previews of intermediate steps**.

### Cited Findings
- Infinigen keeps generators as Python code; the Node Transpiler exists so that *non-programmers* can contribute through a graph, but the output is code — [Infinigen paper](https://ar5iv.labs.arxiv.org/html/2306.09310); [GitHub](https://github.com/princeton-vl/infinigen)
- Material graphs written by LLMs/VLMs reach only plausible approximations and fail on complex graphs (VLMaterial) — cited in AI from [VLMaterial](https://arxiv.org/html/2501.18623v2)
- 3DCodeBench: an error-driven loop raised executability 0.702 → 0.974; 85–90 % of failures were Blender API drift; visual self-critique +0.003 to +0.009 — cited in AI from [3DCodeBench](https://arxiv.org/html/2606.01057)
- LL3M (Lu et al., August 2025): code as an "editable representation", six agents (planner, retrieval, coding, critic, verification, user feedback) — [LL3M arXiv 2508.08228](https://arxiv.org/html/2508.08228v1)
- HDA parameters fully exposed overload artists — [core.ac.uk](https://core.ac.uk/download/232282292.pdf) (snippet); Houdini advantage: a "simple parameter UI" for non-technical users without exposing the internals (secondary search snippet)
- UE PCG: a designer changes behavior through overridable parameters and data tables, not by rewriting the graph — [Epic PCG overview](https://dev.epicgames.com/documentation/en-us/unreal-engine/procedural-content-generation-overview) (snippet)
- Embark: art direction encoded in named, specialized nodes (Kyoto Roof) — [80.lv 2026](https://80.lv/articles/how-embark-studios-built-procedural-environments-for-the-finals-using-houdini)

### Inferences
- **Why code wins for us:** the author is an LLM (code is its strong domain, graphs its weak one), diffability and grep (PG), golden hashes and code review work on text. Our own stable API removes the main class of errors (API drift). This is well supported.
- **What graphs give and we lose:** (a) per-node preview — in Substance Designer the artist sees a thumbnail of each node and so localizes where the look went wrong; (b) exposed parameters with ranges; (c) direct manipulation without a programmer. For the owner-AD, (b) and (c) are essential, (a) helps mainly Claude and the evaluator.
- **A concrete hybrid proposal:**
  1. **A parameter schema in C** (X-macro or static table) for every `gen_*`: `name, type, unit, min, max, default, dist, group, art_facing(bool), doc`. From the schema are generated: recipe validation, canonical serialization for the hash, the **cimgui panel**, markdown documentation for the agent and JSON for the evaluator. One source of truth, no hand-written UI code.
  2. **At most ~8–12 `art_facing` parameters per family** (the rest hidden) per the HDA overload lesson; "macro" parameters such as "age", "district wealth", "degree of stylization" that internally drive several low-level ones.
  3. **Recipe trace:** every operator (`op_noise`, `op_blur`, `op_split`…) in a dev build writes its name, parameters, output hash and a thumbnail into the trace. `gencli trace --asset X` renders a "graph from the run" (a DAG with thumbnails) — inspection as in Substance, without editing the graph. Cost: a logging hook in the operator library.
  4. **Variant sweep from the panel:** a slider → a 3×3 grid of parameter values side by side (what a wedge does in Houdini). The owner picks, and the choice is written into the recipe.
- The read-only "call graph visualizer" from PG is weaker than the trace: a call graph shows the structure of the code, not the data and intermediate results.
- Risk of the hybrid: the panel may tempt the owner into micro-tuning parameters instead of art direction; hence the `art_facing` subset and "presets" instead of hundreds of sliders.

### Gaps
- I found no empirical study "code vs node graphs" on productivity or quality of procedural content (neither for humans nor for LLMs). The arguments above are derived.
- I found no ready example of an automatically generated Dear ImGui panel from a schema for procedural generators (general reflection libraries exist, unverified).

---

## 3. Style consistency and "procedural sameness" across thousands of assets

### Takeaway
Practice solves sameness with **hand-authored building blocks assembled randomly** (Spelunky templates, Townscaper/Embark kit nodes, Infinigen distributions calibrated on examples) and **readability rules**, not with better noise. Our PG knows this in principle ("budget the variation into silhouette, color blocks and layout"), but it lacks a measurable check of the range of variability (expressive range) and an explicit "style bible" beyond numbers — shape language, what is forbidden, and examples.

### Cited Findings
- Spelunky: Derek Yu hand-designed room templates by role (drop-down, landing, corridor, off the critical path); the generator picks a template by position on the solution path and adds random decorations; an informal estimate of ~80 % of the layout by hand / 20 % random, traps and monsters 100 % procedural (secondary, Kazemi 2009) — [tinysubversions 2009](https://www.tinysubversions.com/2009/09/spelunkys-procedural-space/index.html); [GMTK transcript](https://amara.org/subtitles/p6MHlmreohsY/en-gb/1/download/How%20and%20Why%20Spelunky%20Makes%20its%20Own%20Levels%20%20Game%20Makers%20Toolkit.en-gb.txt)
- Yu himself admits in his book that the system does not make the most natural caves and that **players recognize repeating landmarks** (secondary citation) — same source (search results)
- The book *Procedural Generation in Game Design* (Short & Adams, 2017) has chapters "Managing Output: Boredom vs. Chaos" (Backus), "Aesthetics" (Welton), "Designing for Modularity" (Grinblat), "Understanding the Generated" (Gillian Smith), "Generative Art Toys" (Compton), "Content Tools Case Study" (Auwae) — [Routledge](https://www.routledge.com/Procedural-Generation-in-Game-Design/Short-Adams/p/book/9781498799195)
- "10,000 bowls of oatmeal" (Compton) — cited in PG from [Emily Short 2016](https://emshort.blog/2016/09/21/bowls-of-oatmeal-and-text-generation/) and [Rabii & Cook, FDG 2023](https://pyrofoux.github.io/why-oatmeal-is-cheap/why_oatmeal_is_cheap_fdg2023.pdf)
- Infinigen calibrated creature distributions on 30 hand-modeled examples of heads and bodies — [Infinigen paper](https://ar5iv.labs.arxiv.org/html/2306.09310)
- Embark: a consistent rule for interiors for readability; art direction in specialized nodes — [80.lv 2026](https://80.lv/articles/how-embark-studios-built-procedural-environments-for-the-finals-using-houdini)
- Aesthetic models lean toward a generally popular style — cited in AI from [AesBiasBench](https://arxiv.org/abs/2509.11620v1); Anthropic: the evaluator had to explicitly penalize generic "AI slop" patterns — [Anthropic, 24 Mar 2026](https://www.anthropic.com/engineering/harness-design-long-running-apps)

### Inferences
- **Our "style bible" is only numeric** (palettes, texels/m, bevel, floor height — PG "an art bible in the form of code"). It lacks: (a) a **shape language** in words and examples (e.g. "roofs overhang by ≥0.4 m, no flat roofs in district X", "window width to height ratio 1:1.6"), (b) **forbidden patterns** (a do-not list), (c) **approved sample renders** as visual anchors for every family. Proposal: `content/style/bible.md` + `content/style/refs/<family>/` + `style.cfg`; the evaluator reads all three.
- **The equivalent of Spelunky templates for us:** the owner does not model, but can approve **curated presets** (parameter sets) that play the role of hand-authored templates; randomness then only combines approved presets and adds "decorations". This directly copies the 80/20 model and gives the AD control over what appears in the city.
- **Expressive range analysis** (Gillian Smith; the chapter "Understanding the Generated" — I did not verify its content, I know the method from literature outside this research): for each family generate 500–1,000 seeds, compute 2–4 descriptors (height, silhouette aspect ratio, number of floors, dominant hue, outline complexity) and plot 2D histograms. The lint then guards *both* sides: too narrow a range (oatmeal) and too wide/outlier values (chaos, Backus "Boredom vs. Chaos"). This is a numeric oracle for a problem that PG so far handles only by eye on a 16-seed sheet.
- **Perceptual distinctness at district level:** PG rightly directs variation into the district palette and landmarks. Add a "district distinguishability" lint: from the top view and from the street, compute a histogram of colors and silhouettes and verify that the distance between districts > the distance within a district.
- **Repeating landmarks** (Yu): unique landmarks must really be unique (stamps at L2 from PG), and kit parts with a distinctive silhouette (towers, gables) need an occurrence quota per km², otherwise they become a recognizable repetition.

### Gaps
- Kate Compton's essay "So you want to build a generator" (2016) could not be fetched (403/500, archive.org blocked); I therefore do not cite its specific recommendations (inventory, constraints, generate-and-test).
- Talks on Hades (Supergiant) and Derek Yu's Spelunky lectures were not found in primary form.
- I did not have the content of the chapters of the Short & Adams book (e.g. Welton "Aesthetics"), only the table of contents.

---

## 4. AI-agent content workflow 2025–2026 vs our rules

### Takeaway
Our workflow (oracles → separate evaluator → owner; the 15 rules in AI) is in line with the best public practice and in some respects stricter. But four things that the strongest sources do explicitly are missing: **(1) an evaluator calibrated with few-shot examples with scores from the owner and with criterion weights**, **(2) an agreed "done contract" for every family**, **(3) a retrieval library of approved generators as examples**, **(4) a tool that captures every owner decision as data** (a pairwise A/B UI, a regression gallery).

### Cited Findings
**Anthropic – Harness design for long-running apps (24 Mar 2026)**
- Agents "reliably skew positive when grading their own work"; a separate evaluator was easier to tune toward skepticism, but even it was lenient toward LLM output — [Anthropic Engineering](https://www.anthropic.com/engineering/harness-design-long-running-apps)
- Frontend: four criteria (design quality, originality, craft, functionality); **design and originality weighted higher because the model handled craft and functionality on its own**; originality penalized generic "AI slop" patterns — same source
- The evaluator was calibrated with **few-shot examples with a detailed score breakdown**, to match the author's preferences and limit score drift — same source
- 5–15 iterations per generation, runs up to 4 h; at the 10th iteration the model discarded a polished page for a radically different concept — same source
- Before each sprint the generator and evaluator **negotiated a "done" contract** (sprint 3: 27 criteria); the evaluator clicked through the live app with Playwright; at first it found real bugs, but **"talked itself into approving them"** and tested superficially; the agents communicated through files — same source
- Every component of the harness encodes an assumption about what the model cannot do; after model upgrades (Opus 4.5/4.6) the sprints and context resets were removed, the planner stayed, the evaluator moved to a single pass at the end and pays off only where the task exceeds the model's reliable abilities — same source
- Costs: a solo run of 20 min / 9 USD with a broken main feature vs the full harness 6 h / 200 USD; a DAW 3 h 50 min / 124.70 USD — same source

**Godogen (htdt, 2026)**
- Visual QA captures screenshots from the running game and analyzes them with **Gemini Flash** (default), optionally Claude (`--native`) or both (`--both`); static mode = 1 reference + 1 screenshot, dynamic = multiple frames; the targets are z-fighting, missing textures, broken physics; the orchestrator: "don't trust code alone — verify on screenshots" — [skills.sh visual-qa](https://www.skills.sh/htdt/godogen/visual-qa); [GIGAZINE 2026-03-17](https://gigazine.net/gsc_news/en/20260317-godogen/)

**LL3M and BlenderRAG**
- LL3M: planner, retrieval, coding, critic, verification and user-feedback agents; BlenderRAG = a knowledge base from the Blender API documentation, queried for every subtask and also during repairs — [LL3M arXiv 2508.08228](https://arxiv.org/html/2508.08228v1)
- BlenderRAG (Rondelli et al., May 2026): 500 expert-validated examples (text, code, image) in 50 categories; retrieval of similar examples raised the compile success rate **40.8 % → 70.0 %** and the CLIP match **0.41 → 0.77** across four LLMs — [BlenderRAG](https://maxrondelli.github.io/BlenderRAG/); [gamedev.net](https://gamedev.net/news/3101-blenderrag-high-fidelity-3d-object-generation-via-retrieval-augmented-code/)

**Already in our documents (for comparison)**
- Pairwise judgments with a checklist correlate with humans (GPTEval3D, ArtifactsBench >90 %); BlenderGym verifier-human agreement 0.66 vs human-human 0.79; Asset Forge text representation next to PNG — cited in AI

### Inferences
Mapping onto our rules (AI, the table of 15 rules):
- **Rule 8 (separate evaluator) and measurement 8 (calibration with ~30–50 pairs):** we have them, but *how* to calibrate is missing. Proposal after Anthropic: a rubric per family with 4–5 criteria and **weights shifted toward what the model cannot do** (silhouette/proportions, style match with the reference, originality vs genericness; a smaller weight on technical cleanliness, which the lints guard) + a **few-shot set of 6–10 renders with a score and a justification from the owner** in the evaluator prompt. An explicit criterion "generic / stock look" against the tendency toward a popular style.
- **The evaluator talks itself into approval** (Anthropic): add a rule that the evaluator first lists the defects, then gives the score; approval only without a defect of class "blocker"; and periodically measure the false approval rate against the owner's verdicts.
- **A "done" contract per family (sprint contract):** our rule 4 (specification in numbers) is close, but it is written by the owner unilaterally. Proposal: before generation the agent produces `acceptance.md` from the specification (e.g. 15–30 checkable points: which lints, which views, which references, a minimum evaluator score), the owner approves it, and only then does generation happen. It also addresses aging of the specification (CityGrow in AI).
- **A different vendor as the evaluator:** Godogen uses Gemini for visual QA by default; our rule 8 mentions it only for "critical decisions". A cheap second evaluator (e.g. Flash-class) on every iteration + Claude at the finale is documented practice; disagreement between two evaluators = escalation to the owner.
- **Retrieval of approved generators (the BlenderRAG effect):** every generator the owner approves goes into `content/library/` as an example (code + recipe + renders + score). When writing a new generator the agent receives the 2–3 most similar. The effect in BlenderRAG is large (+29 pp compile, CLIP 0.41→0.77), for us it will be smaller (compilation is solved by our own API), but style match between families is exactly what retrieval anchors.
- **A pairwise A/B UI for the owner:** a local page (or an in-engine window) shows two variants + a reference, the owner clicks A/B/both bad + an optional comment; the choices are logged to `review/decisions.jsonl`. Advantages: (a) faster than verbal review, (b) data for evaluator calibration (measurement 8) and few-shot examples, (c) pairwise is the format in which both humans and VLMs are most consistent (cited in AI).
- **An automatic regression gallery:** rule 10 (golden hash diff) says *that* something changed; add that every hash change generates a before/after sheet of the affected families and both the evaluator and the owner see only what changed. It also addresses the 35.8 % of "fixes that changed unrelated content" (Code4Scene in AI).
- **Budget:** the Anthropic harness cost 124–200 USD per application; for dozens of asset families × iterations, costs must be counted and measured where the evaluator pays off ("only where the task exceeds the model's abilities"). Proposal: the evaluator is mandatory only for the risky categories from the table in AI (vehicles, vegetation, characters, painterly materials), for "strong" categories lints + the owner on a sheet are enough.
- **Test the removability of the harness:** on a model upgrade, try switching off individual parts (the evaluator, self-critique, retrieval) on a fixed set of families and measure the number of iterations to approval.

### Gaps
- Blender MCP: beyond MindStudio (cited in AI) I found no new primary experience report.
- SceneCraft: not fetched.
- The exact structure of the Godogen QA rubric (which checklist) is not verified from the primary README; the sources are the skill pages and GIGAZINE.
- The details of "sprint contracts" are from the original Anthropic article (fetched), but the 27 criteria concern a full-stack application, not graphics; transfer to assets is an inference.

---

## 5. AI texture generation in 2026: tileability, PBR from albedo, set consistency, licenses and provenance

### Takeaway
For D14 there are more mature tools than our pipeline counts on: models now directly generate **tileable PBR sets** (StableMaterials) and commercial tools (Substance 3D Sampler) do "image → tileable texture → parametric material" with automatic Content Credentials. Our plan "general image → code post-processing (tileable, palette, height from luminance)" is robust and deterministic, but (a) it underestimates the quality of derived maps, (b) it has no mechanism for *set* consistency before post-processing, (c) it has no license field and no plan for public disclosure of AI content (Steam since January 2026).

### Cited Findings
- **StableMaterials** (Vecchio, arXiv 2406.09293, revision January 2025): a diffusion generator of PBR from text or an image; output basecolor, roughness, metallic, height, normal; tileability through "features rolling"; a distilled latent consistency model, 4 steps; 512² + a patch-wise refiner; code and models public — [arXiv 2406.09293](https://arxiv.org/html/2406.09293v3)
- **MaterialFusion**: the decoder supports tileable generation by convolutions with circular padding; **MaterialMVP** (2025) generates PBR textures from a mesh and an image; **Material Palette** (April 2024) is an *extraction* of materials from a single image, not a generator — [StableMaterials similar works, deeppaper](https://arxiv.deeppaper.ai/papers/2406.09293v3/similar?locale=en) (snippet)
- **Adobe Substance 3D Sampler**: Text to Texture (Firefly, since 4.4, 2024), Image to Texture ("output is always a square, tileable texture", the reference need not be tileable), Text to Pattern (4 tileable patterns), **Image to Material** derives normal, height, roughness → a parametric material; Sampler automatically attaches **Content Credentials** to Firefly outputs — [80.lv Sampler 4.4](https://80.lv/articles/adobe-s-substance-3d-sampler-4-4-sources-texture-imagery-from-prompts); [CG Channel 2024](https://www.cgchannel.com/2024/05/adobe-releases-substance-3d-sampler-4-4); [Adobe blog 2024-03-18](https://blog.adobe.com/en/publish/2024/03/18/adobe-announces-firefly-powered-features-substance-3d-apps)
- Firefly is marketed by Adobe as "designed for safe commercial use" (a vendor claim, not independently verified) — same sources
- **Steam (January 2026)**: AI content that "ships with your game, and is consumed by players" must be disclosed (including the store page and marketing); internal efficiency tools (e.g. coding assistants) are explicitly exempt; for live-generated content, guardrails must be described; the developer bears full responsibility for the copyright of AI assets — [PC Gamer](https://www.pcgamer.com/software/ai/steam-updates-ai-disclosure-form-to-specify-that-its-focused-on-ai-generated-content-that-is-consumed-by-players-not-efficiency-tools-used-behind-the-scenes/); [Game Developer](https://gamedeveloper.com/business/valve-tweaks-and-clarifies-ai-disclosure-rules-for-steam); [GamingOnLinux 2026-01](https://gamingonlinux.com/2026/01/valve-tweak-steam-ai-disclosure-form-for-developers-to-clarify-its-for-content-consumed-by-players)
- Embark (ARC Raiders) faced a public controversy over AI disclosure, although it claims it did not use generative AI for visuals — [PC Gamer](https://pcgamer.com/gaming-industry/arc-raiders-use-of-ai-highlights-the-tension-and-confusion-over-where-machine-learning-ends-and-generative-ai-begins)

### Inferences
- **A strength of our D14:** "the AI image is an input, not an output" + a byte hash in the cache key + the same post-processing and lints is cleaner than industry practice (Sampler output is not reproducible from a recipe). Keep.
- **A weakness: height from luminance.** Both PG and AI admit that deriving height/normal from albedo is an approximation. For the painterly WoW look it matters less (light is baked into the albedo), but for stone/wood in close view the heuristic "light = high" is wrong for dark protrusions. Proposal: allow the AI source to be a **set of maps** (albedo + height, e.g. from a StableMaterials-class model) stored as one source with provenance; post-processing then only normalizes height. Verify in measurement 9 (the AI document) as a third variant: code / AI albedo / AI PBR set.
- **Tileability in the generator vs in post-processing:** models with circular padding/rolling generate seamless tiles natively; our "offset + seam blending" is a safety net, not the primary path. The seam lint (already proposed in AI) catches both.
- **Set consistency:** palette remap unifies colors, but not handwriting (brush stroke, detail scale, the amount of baked light). Proposal: (a) a **style reference board** — 3–6 approved "anchor" textures per family that are passed as an image reference into every generation (image-to-texture mode), (b) generate the whole family in one batch with the same model/version and the same reference, (c) a "detail scale" lint (spectral energy / size of dominant structures in texels) against the anchor textures, (d) the evaluator receives a grid of all textures of the family at once, not individually.
- **Extend provenance** from (model, prompt, seed, date) to: model/endpoint version, **license and a link to the ToS in the version at the generation date**, input references (hash), preserved **C2PA/Content Credentials** manifests, who approved, and a `player_facing` flag. The linter rejects an image without a license just as it does one without a prompt.
- **Steam disclosure:** AI textures in D14 are "pre-generated content consumed by players" → under the January 2026 rules they must be disclosed. Generators written by Claude are probably an "efficiency tool" (a coding assistant), but *their output* is not generative AI (it is a deterministic program) — this is my interpretation, not legal advice. Proposal: `gencli provenance-report` produces a list of all AI-sourced assets for the disclosure form and for a possible audit.
- **Reputation risk:** the Embark case shows that even unclear AI disclosure provokes controversy; "procedural, no generative AI" can be a marketing advantage for the engine, so having clean evidence of which materials are from AI is a value in itself.

### Gaps
- I found no independent comparison of the quality of StableMaterials / Sampler / other 2026 models for **stylized, hand-painted** materials (most work targets photorealistic PBR).
- I did not verify concrete tileable models from 2025–2026 beyond those above (e.g. commercial APIs with a native tile mode).
- The current (2026) state of features and licenses of Substance 3D Sampler: the results are from 2024.
- The legal status of copyright protection of AI images in the EU/Czech Republic and the terms of specific models were not covered by the research.
- Primary Steamworks documentation was not fetched; the rules come from news reports (PC Gamer, Game Developer).

---

## Summary of concrete proposals (for the report writer, ordered by impact)

1. **A parameter schema in every `gen_*` → an auto-generated cimgui panel, validation, documentation for the agent**; the panel is mandatory in M3, not optional. At most ~8–12 `art_facing` parameters per family. (q. 1, 2)
2. **Curated presets + parameter distributions** (Infinigen) — runtime generation samples only from approved presets; the owner adds/removes presets. (q. 1, 3)
3. **Override tools for the AD**: pin / reroll / ban seed / parameter nudge / stamp in the cell preview, written to `content/world/overrides`. (q. 1)
4. **A calibrated evaluator**: a rubric with weights toward the model's weaknesses, few-shot renders with the owner's score, a "genericness" criterion, the rule "defects first, then score", a second evaluator from a different vendor. (q. 4)
5. **`acceptance.md` per family** as a negotiated "done" contract before generation. (q. 4)
6. **A pairwise A/B review UI + a decision log** and an **automatic before/after regression gallery** when golden hashes change. (q. 4)
7. **Expressive range lints** (descriptor histograms on 500–1,000 seeds; guard against both boredom and chaos) and a district distinguishability lint. (q. 3)
8. **A recipe trace with thumbnails of intermediate steps** instead of a read-only call graph. (q. 2)
9. **A library of approved generators as retrieval examples** (the BlenderRAG effect). (q. 4)
10. **A style bible in words and images** (shape language, forbidden patterns, anchor renders), not only in numbers. (q. 3)
11. **Extend D14**: the AI source may be a PBR set; a style reference board and batch generation for consistency; provenance with license, ToS and C2PA; `provenance-report` for the Steam disclosure. (q. 5)
12. **A shared "building context"** for all kit generators (Embark shared blockout). (q. 1)
