# LLMs generating 3D content by writing code: state of the art 2023 to late 2026

Research date: 2026-11-05. Every finding is dated. Model names are given exactly as each paper names them. Items marked **[background, not re-fetched]** come from my prior knowledge of the literature. Their arXiv links are given, but I did not re-verify them this session, so treat them as lower confidence.

---

## 1. Code-based 3D generation systems and their results

### Takeaway
The field has moved from proof-of-concept agents (2023–24: 3D-GPT, SceneCraft, BlenderAlchemy) through benchmarks that exposed large gaps against humans (BlenderGym, CVPR 2025) to 2026 benchmarks with current frontier models (3DCodeBench, Code4Scene, WorldBench, Nova3D). In 2026 the best frontier models reach roughly 90% executability on single-shot Blender asset scripts and about 100% with error-feedback retries. Shape fidelity is moderate: assets are recognisable but simplified and sometimes have floating or disconnected parts. Code-native assets clearly win on structure: named parts, hierarchy, joints, editability and numeric constraints. Texture realism is their weak point.

### Cited Findings

**2026: the newest and most relevant**

- **3DCodeBench** (Google DeepMind / Google Research / USC, arXiv 2606.01057, 31 May 2026). Task: a VLM writes a Blender 5.0 Python script from text or reference images. Data comes from Infinigen procedural factories and covers 212 object categories, about 26K code samples and 12,963 instances. Reference scripts average 531 lines (median 387). Metrics: executability, SigLIP-2 and DINOv3 view similarity, Chamfer distance, Uni3D, plus a human-preference arena (3DCodeArena) with about 3,100 votes turned into Elo — [3DCodeBench](https://arxiv.org/html/2606.01057)
- 3DCodeBench per-model results (Table A.1, best thinking level, text and image tracks averaged; exec / SigLIP-2 / Chamfer↓ / Elo) — [3DCodeBench](https://arxiv.org/html/2606.01057):
  - GPT-5.5: 0.906 / 0.834 / 0.059 / **1163** (top Elo)
  - Gemini 3.1 Pro: 0.725 / 0.824 / 0.069 / 1147
  - Gemini 3.5 Flash: 0.464 / 0.824 / 0.068 / 1119
  - GPT-5.4: 0.866 / 0.817 / 0.064 / 1074
  - Gemini 3 Flash: 0.481 / 0.810 / 0.067 / 1039
  - Claude Sonnet 4.6: 0.804 / 0.813 / 0.068 / 1015
  - **Claude Opus 4.7: 0.910 (highest executability) / 0.814 / 0.067 / 1006**
  - Gemma 4 31B: 0.582 / 0.801 / 0.076 / 952; GPT-5.4 mini: 0.731 / 0.803 / 0.070 / 951
  - Gemini 3.1 Flash Lite: 877; Gemma 4 26B: 859; Claude Haiku 4.5: 0.502 / 0.761 / 0.095 / 799
  - Gemini 2.5 Pro and GPT-5.4 Nano were excluded for executability below 10%.
- 3DCodeBench: SigLIP-2 view similarity correlates with human Elo at Pearson r = 0.964, and DINOv3 at Spearman ρ = 0.972. Gemini 3.5 Flash comes within about 44 Elo of GPT-5.5 at roughly 1/8 of the cost — [3DCodeBench](https://arxiv.org/html/2606.01057)
- 3DCodeBench failure modes: (a) about 85–90% of execution failures are Blender 4.x→5.0 API drift, i.e. deprecated calls. The authors call these "localized and fixable once the traceback is visible". (b) Successful renders often have disconnected or floating components. **Claude Opus 4.7 tended toward "simplistic floating primitives"** and Gemini 3.1 Pro toward disconnected fragments. (c) Complex categories such as flying bird, crab and dragonfly need more than 400 lines of reference code. (d) Photorealistic image references push models toward more elaborate geometry, and Gemini 3 Flash's executability dropped 27 points on the image track — [3DCodeBench](https://arxiv.org/html/2606.01057)
- 3DCodeBench: higher thinking budgets mainly help small models (Gemini 3.1 Flash Lite gained about 19 executability points from minimal to high thinking). Pro-class models moved by fewer than 5 points — [3DCodeBench](https://arxiv.org/html/2606.01057)

- **Nova3D: Code-Native Generation of Programmable 3D Assets** (arXiv 2607.22738, 22 Jul 2026). Generates assets as executable Blender code, where "the program is the asset". Nova3D-Bench has 54 items in 6 domains and 3 difficulty levels, compared against 11 baselines (mesh-native, part-structured, code-native, CAD). Results: 54/54 executable and valid. Every asset has named parts in a parent-child tree, which no mesh/CAD/segmentation baseline produced. Numeric/count constraints met: 51/52 (best baseline 11/52). Blinded local edits: 14/18 passed, with locality preserved in 18/18. 59 joints across 12 assets at 98.3% geometric validity (baselines: 0 joints). It wins the structured domains in a pairwise shape tournament and ranks second overall, behind only the strongest mesh-native model. The authors concede texture realism to baked-PBR systems. The abstract page does not name the LLM used — [Nova3D](https://arxiv.org/abs/2607.22738)

- **Code4Scene** (UCSD / UC Berkeley, arXiv 2609.36777, 29 Sep 2026). 190 Unreal Engine cases: text→scene construction (30) and image→scene editing/repair (160). Public-set overall scores: GPT-6 Astra 0.619; Gemini 3.8 Flash 0.619; Claude Fable 5.1 0.606 (best at construction, 0.788); **Claude Opus 5 0.593 (construction 0.718, editing 0.468)**; GPT-5.6 Sol 0.550; Grok 4.6 0.376; Gemma 4 31B about 0.29; DeepSeek V4.1 Flash 0.227 — [Code4Scene](https://arxiv.org/html/2609.36777v1)
- Code4Scene: **Spatial Composition is the weakest requirement family for all 14 configurations**. The best spatial mean is only 0.543 (GPT-6 Astra). In 20.6% of spatial requirements, relations were wrong even though the right entities were present. 35.8% (76/212) of "complete recoveries" still changed unrelated content. Floating and intersecting objects were observed. Identity, content and attribute requirements are handled well — [Code4Scene](https://arxiv.org/html/2609.36777v1)
- Code4Scene's related-work table lists other 2026 code-for-3D benchmarks: SceneActBench, 4DBuildBench, CutsceneBench, WorldCoder-Bench (2,026 Three.js world tasks), AuthorBench and VWE-Bench — [Code4Scene](https://arxiv.org/html/2609.36777v1); [WorldCoder-Bench](https://arxiv.org/html/2606.01869v2)

- **WorldBench: Evaluating LLMs on Three.js Voxel World Generation** (single author K. Bakshi, arXiv 2610.10622, 7 Oct 2026). **Most relevant to a "3D pixel art / voxel" target.** One ~2,000-word prompt asks for a self-contained Three.js voxel floating island with 10 biomes, water, lava, weather, day/night and seasons, scored out of 280. Totals: Claude Fable 5.1 210.79; GPT-6 Astra 199.73; Kimi K3 191.36; Grok 4.7 187.78; Gemini 3.1 Pro 149.00. A single "claude-opus-5-5" world appears only as an extra world in one placement check and is not ranked — [WorldBench](https://arxiv.org/html/2610.10622v1)
- WorldBench: every model builds a recognisable voxel island (the basic test is near saturated). Models differ on content and motion: items with a motion requirement earned 47% of points versus 70% for look-only items. Grassland was easiest (about 11% of points lost) and jungle hardest (about 53% lost). Small life such as ground cover, ferns and pollinators was never implemented by any model. Lost points broke down as 48% unimplemented, 32.4% code exists but no frame shows it, and 8.9% shown but not attributable to code — [WorldBench](https://arxiv.org/html/2610.10622v1)
- **VoxelCodeBench** (arXiv 2604.02580, Apr 2026) benchmarks 3D world modelling through code generation. I could not read the PDF (over 10 MB), so I have no numbers — [VoxelCodeBench](https://arxiv.org/pdf/2604.02580)

**2025**

- **BlenderGym** (Stanford, Gu, Huang, Je, Yang, Guibas; CVPR 2025; arXiv 2504.01786, Apr 2025). 245 hand-crafted start→goal Blender scene pairs across 5 tasks: object placement, lighting, procedural material, blend shape and procedural geometry. The VLM must write or edit Blender Python to reach the goal render — [BlenderGym](https://arxiv.org/html/2504.01786)
- BlenderGym Table 1 (lower is better). **Humans beat every VLM on every task by a large margin.** Geometry photometric loss (×10⁻²): human 1.269, GPT-4o 6.747, Claude-3.5-Sonnet 10.81, Gemini-1.5-Flash 9.443. Blend-shape PL (×10⁻³): human 0.934 vs GPT-4o 9.140. Material PL (×10⁻²): human 0.629 vs GPT-4o 3.653 and Claude-3.5-Sonnet 5.769. Placement Chamfer: human 1.532 vs GPT-4o 11.22. Open models failed to produce executable code on more than 75% of geometry-editing instances — [BlenderGym](https://arxiv.org/html/2504.01786)
- BlenderGym failure modes: generators "fail to capture subtle visual differences" and hallucinate differences that are not there. Code often does not implement the identified difference, especially in scripts longer than about 80 lines. The metrics ignore physical plausibility — [BlenderGym](https://arxiv.org/html/2504.01786)
- **LL3M: Large Language 3D Modelers** (Lu, Chen, Dinh, Lang, Holtzman, Hanocka; arXiv 2508.08228, Aug 2025). A multi-agent system (planner, retrieval over Blender API documentation, coder, debugger, refiner) with shared code context, which writes Blender Python to create assets. Three phases: initial creation, automatic refinement with code and visual self-critique, and user-guided refinement. Showcase objects include a windmill, piano, drum kit, skateboard, lamp, knife with an edited blade material, a humanoid character, steampunk hats and multi-object scenes. The project page reports no quantitative results. Initial outputs sometimes had implausible configurations such as a disconnected chair backrest, or simplistic geometry, which the refinement phase fixed — [LL3M arXiv](https://arxiv.org/abs/2508.08228); [LL3M project page](https://threedle.github.io/ll3m/)
- **MeshCoder** (Dai et al., NeurIPS 2025; arXiv 2508.14879). Point cloud → editable, part-structured Blender Python. It uses a custom high-level Blender API for complex shapes beyond primitives, a large paired part-code dataset (one review cites 10M part samples across 5 main categories), and a fine-tuned small LLM (reported as Llama-3.2-1B + LoRA). Edits are made by changing function parameters, such as tabletop shape or mesh resolution — [MeshCoder NeurIPS](https://neurips.cc/virtual/2025/poster/117054); [themoonlight review](https://www.themoonlight.io/review/meshcoder-llm-powered-structured-mesh-code-generation-from-point-clouds)
- **CAD-Recode** (ICCV 2025; arXiv 2412.14042). Point cloud → CadQuery Python using a point projector and Qwen2-1.5B, trained on 1M procedurally generated CAD sequences. It samples multiple candidates and keeps the one with minimal Chamfer distance, and it can be paired with an off-the-shelf LLM for CAD editing and QA — [CAD-Recode ICCV PDF](https://orbilu.uni.lu/bitstream/10993/67036/1/CADRecode_ICCV_2025.pdf); [arXiv](https://arxiv.org/pdf/2412.14042.pdf)

**2023–2024 foundations**

- **SceneCraft** (Hu et al., ICML 2024; arXiv 2403.01248). An LLM agent turns text into Blender Python scenes with up to about 100 assets. It builds a scene graph as a "spatial blueprint", converts relations into numeric layout constraints, uses GPT-V to critique renders and refine, and uses library learning to save reusable functions. It reportedly beat earlier LLM agents on complex scenes — [SceneCraft PMLR](https://proceedings.mlr.press/v235/hu24g.html)
- **[background, not re-fetched]** Infinigen (Princeton, CVPR 2023, [arXiv 2306.09310](https://arxiv.org/abs/2306.09310)) and Infinigen Indoors (CVPR 2024, [arXiv 2406.11824](https://arxiv.org/abs/2406.11824)): fully procedural, human-written (not LLM) Blender generators for photoreal nature and indoor scenes. They are the upper bound of what hand-written procedural code reaches. 3DCodeBench's 212 categories come directly from Infinigen factories, which confirms that this code corpus is now the reference target for LLM procedural modelling — [3DCodeBench](https://arxiv.org/html/2606.01057)
- **[background, not re-fetched]** 3D-GPT ([arXiv 2310.12945](https://arxiv.org/abs/2310.12945), 2023): LLM agents fill parameters of Infinigen procedural functions rather than writing geometry from scratch. BlenderAlchemy ([arXiv 2404.17672](https://arxiv.org/abs/2404.17672), 2024): VLM edits Blender materials and programs through iterative render comparison. CADCodeVerify ([arXiv 2410.05340](https://arxiv.org/abs/2410.05340), 2024): VLM asks and answers verification questions about rendered CAD to refine CadQuery code. Text2CAD ([arXiv 2409.17106](https://arxiv.org/abs/2409.17106), NeurIPS 2024): text → parametric CAD sequences. LLaMA-Mesh ([arXiv 2411.09595](https://arxiv.org/abs/2411.09595), 2024): fine-tuned Llama writes OBJ vertex/face lists as plain text, producing low-poly meshes only. ShapeAssembly ([arXiv 2009.08026](https://arxiv.org/abs/2009.08026), 2020): a DSL of cuboid assemblies for furniture-like shapes. Ritchie et al., "Neurosymbolic Models for Computer Graphics" (Eurographics 2023 STAR, [arXiv 2304.11586](https://arxiv.org/abs/2304.11586)): survey of program-based shape and scene representations.

### Inferences
- For a C17 engine, the closest analogue is "LLM writes a procedural generator in a general-purpose language against a high-level geometry API". Every strong system (MeshCoder's custom API, LL3M's retrieved API docs, 3D-GPT's Infinigen functions, Nova3D's part/joint structure) gives the LLM a well-documented, higher-level API rather than raw vertices. **The developer should invest first in a stable, documented C mesh-building API** (primitives, extrude, lathe/revolve, sweep along spline, boolean or CSG-lite, bevel, mirror, array, noise displacement, part hierarchy with named parts and pivots). In 3DCodeBench about 90% of failures were API drift. A custom engine API that never changes, and that lives in the model's context, removes that whole failure class.
- 3DCodeBench reference scripts average about 530 lines per asset. Expect AI-written generators of a few hundred lines per asset family. That is feasible for Claude-class models, which top executability (Opus 4.7: 0.910).
- Claude models lead on executability and correctness but not on human-judged visual quality in 3DCodeBench (Opus 4.7 Elo 1006 vs GPT-5.5 1163). Its typical failure is "simplistic floating primitives". In practice the output will run but look blocky and under-detailed unless explicitly pushed toward detail, connectivity checks and refinement. For a stylised or low-res "3D pixel art" target, simplicity matters much less, which works in the developer's favour.
- WorldBench shows a frontier model can one-shot a recognisable stylised voxel world in Three.js with many biomes. Fine ecological detail and animated elements are where points are lost.

### Gaps
- 3DCodeBench gives no per-category breakdown (organic vs man-made) in the parts I read.
- Nova3D's abstract does not name its LLM or its six domains.
- I could not read VoxelCodeBench (PDF too large).
- I did not re-verify numbers for Infinigen, 3D-GPT, BlenderAlchemy, CADCodeVerify, Text2CAD, LLaMA-Mesh or ShapeAssembly this session.
- I found no published benchmark that evaluates Claude Opus 5.5 specifically. It appears only as one unranked world in WorldBench.

---

## 2. Which object categories LLM-written programs handle well vs poorly

### Takeaway
Programs handle hard-surface, structured, part-decomposable objects best: furniture, architecture and buildings, CAD/mechanical parts, instruments, props and vehicles-as-assemblies. Complex organic forms are harder: animals, insects, characters, faces and dense vegetation detail. They need far longer code and show more failures. Spatial composition (relations between objects) is a weak point even when individual objects are right.

### Cited Findings
- Nova3D wins the **structured domains** in a pairwise shape-quality tournament but ranks second overall behind a mesh-native generator, and concedes texture realism — [Nova3D](https://arxiv.org/abs/2607.22738)
- In 3DCodeBench, complex categories such as **flying bird, crab and dragonfly** need over 400 lines of reference code, and photorealistic references push models toward elaborate geometry with lower executability (−27 pts for Gemini 3 Flash) — [3DCodeBench](https://arxiv.org/html/2606.01057)
- MeshCoder, CAD-Recode, Text2CAD and ShapeAssembly all target man-made, part-structured shapes (furniture, CAD). MeshCoder's editing examples are tabletops — [MeshCoder](https://neurips.cc/virtual/2025/poster/117054); [CAD-Recode](https://arxiv.org/pdf/2412.14042.pdf)
- LL3M shows instruments (piano, drum kit), architecture (windmill), props (skateboard, lamp, knife), hats and one humanoid character, but gives no formal per-category evaluation — [LL3M](https://threedle.github.io/ll3m/)
- In WorldBench, simple biomes (grassland) are easiest and dense organic biomes (jungle, then desert, swamp, grove) hardest. Small life (ferns, ground cover, pollinators) was never implemented by any model, and animated or motion features scored 47% vs 70% for static ones — [WorldBench](https://arxiv.org/html/2610.10622v1)
- In BlenderGym, blend-shape (deformation, e.g. facial or organic shape keys) and geometry tasks show the largest relative human-vs-VLM gaps (blend-shape PL 0.934 human vs 9.140 GPT-4o, about 10×) — [BlenderGym](https://arxiv.org/html/2504.01786)
- In Code4Scene, spatial composition is the weakest family for every model. Identity and attribute requirements are handled well — [Code4Scene](https://arxiv.org/html/2609.36777v1)

### Inferences
- For an open-world city game: buildings, street furniture, props, modular architecture, road and city layout, rocks and terrain are in the strong zone. Stylised low-poly trees and vegetation are feasible with classic algorithms such as L-systems or space colonisation, which LLMs know well. Characters, animals and faces are the weak zone. A practical strategy is to build them from a parametric, hand-designed template (a body made of capsules or segments with an established rig) that the AI then varies, rather than asking for free-form organic modelling.
- A low-res "3D pixel art" render hides fine-geometry errors, so it shifts the effective quality ceiling toward what code reliably produces.

### Gaps
- I found no study with a clean organic-vs-man-made breakdown for current frontier models.
- I found no source on LLM-written skeletal animation or rigging quality, beyond Nova3D's joint validity of 98.3%.
- I found no source on LLM-written procedural texture quality, beyond BlenderGym's material task and Nova3D's concession on texture realism.

---

## 3. Does render → VLM critique → revise measurably help? Limits of VLM judges

### Takeaway
**Error-feedback loops (tracebacks) help a lot and reliably**: executability went from about 70% to about 97%. **Visual self-critique loops give small and inconsistent gains**: about +0.003 to +0.009 SigLIP-2 on text-to-3D, and mostly slightly negative on image-to-3D. VLM judges are unreliable at subtle differences, spatial relations, counting, depth and motion. Verifier scaling (more candidates plus more judging) does help, and agreement with humans is clearly better than chance but below inter-human agreement.

### Cited Findings
- 3DCodeBench: a multi-turn **error-feedback** retry (up to 2 retries) raised aggregate executability from 0.702 to 0.974 (+27.2 pp). Claude Opus 4.7, GPT-5.4 and GPT-5.5 reached 1.000. Coding-agent harnesses raised it from 0.747 to 0.973, but conditional shape quality on instances that already succeeded barely changed (SigLIP-2 −0.010) — [3DCodeBench](https://arxiv.org/html/2606.01057)
- 3DCodeBench **visual self-critique** (Table D.2, up to 2 iterations, tested on smaller and cheaper models only): text-to-3D ΔSigLIP-2 of about +0.003 to +0.009 with win/lose ratios of about 1.2–2.6. Image-to-3D was mostly negative (−0.006 to −0.009, with Gemini 3.5 Flash the exception at +0.0126). The authors blame the metric: SigLIP-2 favours global appearance, and "a fix that improves a leg's geometry can lower the global score". Revert-on-break guards only executability, so the loop is "not fully do-no-harm" for quality — [3DCodeBench](https://arxiv.org/html/2606.01057)
- BlenderGym: VLM-vs-human agreement as a verifier peaked at 0.66 (Claude-3.5-Sonnet), against 0.79 inter-human and 0.5 random. Qwen showed position bias, always favouring the second candidate. Scaling verifier compute helped strongly: a scaled InternVL2-8B outperformed unscaled GPT-4o and Claude 3.5 Sonnet. At low budgets more generation candidates pay off, and at high budgets more verification does — [BlenderGym](https://arxiv.org/html/2504.01786)
- WorldBench (Oct 2026): visual judges are unreliable on their own. One judge called season frames "identical" when measured chromaticity had shifted. Another reported falling rain when 0.0% of pixels changed. Snapshot-only judging missed close-up items. Code and frames disagreed on 32% of 365 required items. A code-only judge gave 5.44 of 7.11 points to features that had been deliberately removed — [WorldBench](https://arxiv.org/html/2610.10622v1)
- SceneCraft (2024) and LL3M (2025) both use VLM render critique as a core component and report that it fixes implausible layouts and disconnected parts qualitatively, with no ablation numbers on the pages I read — [SceneCraft](https://proceedings.mlr.press/v235/hu24g.html); [LL3M](https://threedle.github.io/ll3m/)
- Code4Scene: even with screenshots and scene measurements in the agent's tools, spatial composition stayed the weakest family (best 0.543) — [Code4Scene](https://arxiv.org/html/2609.36777v1)
- VLM spatial-reasoning benchmarks:
  - SpatiaLab (ICLR 2026): 1,400 VQA pairs. Models fall well short of humans, with the biggest weaknesses in depth, navigation and 3D geometry — [SpatiaLab](https://proceedings.iclr.cc/paper_files/paper/2026/hash/31ab8d228b704e86d9eb87f072d2f5dc-Abstract-Conference.html)
  - DynaSolidGeo (late 2025): GPT-5 scored best overall, but every model struggled with counting in 3D, which needs reconstruction and handling of occlusion — [DynaSolidGeo](https://arxiv.org/pdf/2510.22340)
  - MIRAGE (2025): counting combined with spatial relations is the hardest category, with about −20 points versus relation-only questions for 72B open models — [MIRAGE](https://arxiv.org/pdf/2505.10604)

### Inferences
- For the engine workflow: (1) make compile and runtime errors plus **programmatic checks** (connected components, floating parts, bounding boxes, ground contact, triangle counts, symmetry, overlap and intersection tests) the primary feedback loop, because they are cheap and reliable. (2) Use VLM render critique for coarse "does this read as X / is the silhouette or style right" judgements from multiple fixed views (front, side, top, 3/4), not for fine proportions or counts. (3) Rely on human review for final aesthetic acceptance. Numeric checks beat the VLM's eye for proportions and counts: have the generator emit dimensions or metadata and assert them in code.
- Generating several variants and picking the best (verifier scaling) is better supported by evidence than many sequential self-critique rounds.
- Animation and motion need video or multi-frame checks or numeric assertions. Single screenshots miss them (WorldBench).

### Gaps
- 3DCodeBench's visual self-critique ablation was run only on smaller models (Gemini Flash, Gemma), not on Claude Opus, GPT-5.5 or Gemini Pro. I found no ablation of render-critique with a frontier model on a geometric metric.
- I found no 2026 benchmark that tests frontier VLMs on judging proportions in 3D renders specifically.

---

## 4. Scaling with model generation

### Takeaway
There is a clear, large improvement from 2024–25 models to 2026 models. BlenderGym (2025: GPT-4o, Claude 3.5) showed roughly 5–10× worse error than humans and open models that mostly could not produce running code. 3DCodeBench (mid-2026: GPT-5.5, Opus 4.7) shows about 90% single-shot executability and about 100% with retries. Within 2026 generations, executability climbs fast (Haiku 4.5 0.50 → Sonnet 4.6 0.80 → Opus 4.7 0.91; GPT-5.4 mini 0.73 → GPT-5.4 0.87 → GPT-5.5 0.91), while visual and shape quality rises more slowly. Gemini 2.5 Pro scored below 10% executability on Blender 5.0, while Gemini 3.1 Pro scored 0.725.

### Cited Findings
- BlenderGym (Apr 2025; GPT-4o, Claude-3.5-Sonnet, Gemini-1.5-Flash): all far below humans on all 5 tasks, and open models fail to execute on more than 75% of geometry tasks — [BlenderGym](https://arxiv.org/html/2504.01786)
- 3DCodeBench (May 2026): executability 0.910 for Claude Opus 4.7, 0.906 for GPT-5.5 and 0.866 for GPT-5.4. Top Elo is GPT-5.5 at 1163. Gemini 2.5 Pro was excluded below 10% executability, mostly from Blender API drift — [3DCodeBench](https://arxiv.org/html/2606.01057)
- 3DCodeBench: shape-quality metrics are compressed across models (SigLIP-2 0.761–0.834, Chamfer 0.059–0.095). Model generation mostly buys reliability, with only incremental gains in fidelity — [3DCodeBench](https://arxiv.org/html/2606.01057)
- Code4Scene (Sep 2026) ranks GPT-6 Astra = Gemini 3.8 Flash (0.619) > Claude Fable 5.1 (0.606) > Claude Opus 5 (0.593) > GPT-5.6 Sol (0.550). This shows the late-2026 frontier is tightly bunched, with open models (Gemma 4 31B about 0.29, DeepSeek V4.1 Flash 0.227) far behind — [Code4Scene](https://arxiv.org/html/2609.36777v1)
- WorldBench (Oct 2026): Claude Fable 5.1 210.79/280 > GPT-6 Astra 199.73 > Kimi K3 191.36 > Grok 4.7 187.78 > Gemini 3.1 Pro 149.00 on one-shot Three.js voxel worlds — [WorldBench](https://arxiv.org/html/2610.10622v1)
- Thinking budget: large gains for small models (about +19 pp executability for Gemini 3.1 Flash Lite), and fewer than 5 pp for Pro-class models — [3DCodeBench](https://arxiv.org/html/2606.01057)

### Inferences
- Claude Opus 5.5, used by the developer, is newer than Opus 4.7 and Opus 5, which were benchmarked. Interpolating from the trend (not measured), it should sit at or near the top on code correctness and executability. Visual-aesthetic quality will likely still require iteration and human direction. In the only human-preference benchmark found (3DCodeBench), Claude models ranked mid-pack on visual appeal despite top executability.
- The remaining bottleneck is not "can it write working generator code" (largely solved in 2026) but visual fidelity, spatial composition and fine organic detail. Better tooling (a high-level API, programmatic validators, multi-view renders, human art direction and reference images) addresses that more than model upgrades do.

### Gaps
- I found no BlenderGym re-run with 2026 frontier models, so the 2025 human gap cannot be directly compared with 2026 numbers.
- I found no published numbers for Claude Opus 5.5 on any code-to-3D benchmark.
- Benchmarks use different metrics, so cross-benchmark comparison is only qualitative.
- Some 2026 model names in Code4Scene and WorldBench (e.g. "Claude Fable 5.1", "GPT-6 Astra", "Gemini 3.8 Flash") are reported as the papers state them. I did not independently verify those model releases.
- Neural mesh and Gaussian generators (contrast only): Nova3D reports a mesh-native model as best on overall shape quality, ahead of code-native. Neural generators still lead on organic shape and texture realism, but they yield opaque meshes without parts, joints or editability — [Nova3D](https://arxiv.org/abs/2607.22738)
