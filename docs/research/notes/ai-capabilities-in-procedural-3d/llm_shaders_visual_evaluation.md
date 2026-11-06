# LLM capability in graphics code generation and VLM visual self-evaluation (2023 → Nov 2026)

Scope note: research done 2026-11-05. Each item is labelled **[MEASURED]** (a benchmark or controlled study with numbers), **[STUDY]** (a peer-reviewed or arXiv system paper with self-reported results), or **[ANECDOTE]** (an informal test, a blog post or a vendor or customer quote). Where only a secondary or aggregator source was found, it says so.

---

## 1. Shader generation (GLSL/HLSL/Shadertoy, SDF raymarching)

### Takeaway
No large public benchmark ranks frontier models (Claude 4.x/5.x, GPT-5.x, Gemini 3.x) on writing shaders, as of Nov 2026. The only dedicated benchmark found, ShaderEval/ShaderMatch (2024–2025, Shadertoy function completion, 467 functions), tested open-source code models, and its metric is "does the render match exactly". The rest of the evidence comes from system papers and user studies. They show that LLM shader pipelines work when wrapped in a compile-check, retry and render loop, and that geometric precision is still the weak spot in code-generated 3D scenes.

### Cited Findings
- **[MEASURED] ShaderMatch / ShaderEval (LLM4Code 2025 workshop, IEEE).** This is a zero-shot function-completion benchmark built from Shadertoy GLSL fragment shaders. The model gets a function header plus the user-written comments (467 functions) and must write the body. Scoring is a static code comparison followed by a comparison of rendered frames. It evaluated more than 20 open-source code-specific models. — [IEEE CSDL listing "Evaluating Language Models for Computer Graphics Code Completion"](https://www.computer.org/csdl/proceedings-article/llm4code/2025/261500a096/27ueqWQohVK) (abstract seen via search snippet only; the page body would not load)
- **[MEASURED] ShaderMatch metric design.** It renders the generated and reference shaders at 10 time samples and labels each result c0-clone (exact), c1/c2-clone (differs only in comments, whitespace or identifiers), c4-clone (number of the 10 renders that match), code_error (does not compile), single_color, or variation (renders differ). The README calls the metric "still under development" and marks its sample results outdated. — [HF Space Vipitis/shadermatch README](https://huggingface.co/spaces/Vipitis/shadermatch/blob/5ca11c56640714f4d66e827b7ce462d28b095f02/README.md); [Shadereval benchmark info page](https://huggingface.co/spaces/Vipitis/shadermatch/raw/main/information.html)
- **[STUDY] AI Co-Artist (arXiv 2512.08951, Dec 2025).** An LLM-driven evolutionary system for GLSL shader animation. Every generated shader goes through a syntax check and a WebGL compile; on failure the system retries up to a cap, then falls back to a base shader. In a 25-minute session, novice users made 4.2 shaders on average with the tool versus 0.6 in plain Shadertoy. — [arXiv 2512.08951](https://arxiv.org/html/2512.08951)
- **[ANECDOTE / tool] ShaderToy-MCP.** An MCP server that lets LLMs read, create and refine GLSL shaders directly on Shadertoy. It shows practitioners already use LLMs this way, but it is not an evaluation. — [FlowHunt ShaderToy-MCP](https://www.flowhunt.io/integrations/shadertoy/)
- **[ANECDOTE / tool] vibe-sdf (GitHub).** An LLM writes SDF scenes in a JavaScript DSL, which is transpiled to GLSL and raymarched instantly. It has no automated visual-feedback stage. — [maajor/vibe-sdf](https://github.com/maajor/vibe-sdf)
- **[STUDY] VIGA, Vision-as-Inverse-Graphics Agent (arXiv 2601.11109, Jan 2026).** Treats scene reconstruction as a loop between visual analysis and program generation (Blender programs). The verifier moves camera viewpoints, inspects the scene, finds "the dominant discrepancy" and feeds it back. This is the closest published analogue of the planned generate → render → look → revise loop. — [arXiv 2601.11109](https://arxiv.org/html/2601.11109)
- **[STUDY] Executable scene generation from a single image as editable Blender programs (arXiv 2606.02580, Jun 2026).** A staged generator–verifier loop driven entirely by a pretrained VLM. The authors state that "geometric precision and spatial consistency remain major limitations of current models." — [arXiv 2606.02580](https://arxiv.org/html/2606.02580)
- **[MEASURED, adjacent] GPU kernel benchmarks (CUDABench, KernelBench-Verified, 2026)** cover CUDA and Triton compute code, not graphics shaders. No GLSL/HLSL equivalent turned up. — [CUDABench arXiv 2603.02236](https://arxiv.org/pdf/2603.02236); [KernelBench-Verified arXiv 2607.16241](https://arxiv.org/pdf/2607.16241)
- **[MEASURED, adjacent] ArtifactsBench (arXiv 2507.04952, Jul 2025).** 1,825 visual and interactive code-generation tasks, including SVG and game development. Each artifact is rendered and screenshotted over time, then judged by a multimodal LLM against a per-task checklist. It reports 94.4% ranking consistency with WebDev Arena, over 90% pairwise agreement with human experts, more than 30 LLMs evaluated, and finds that "generalist models often outperform domain-specific ones." — [arXiv 2507.04952](https://arxiv.org/abs/2507.04952)

### Inferences
- The "compile → retry → render" scaffold used by AI Co-Artist, ShaderMatch and VIGA is the established pattern. Applied to HLSL, it means a DXC compile step plus a headless render with automatic retry, before any vision judgement happens.
- "Exact render match" metrics (ShaderMatch) are strict. For stylised art, nothing ground-truths "looks right", so a human or a VLM has to judge the look.
- Geometric precision (proportions, alignment, exact spatial relationships) is the documented weak point in both generation (arXiv 2606.02580) and VLM perception (section 4). The two weaknesses compound: the model that makes a proportion error is also bad at seeing it.
- No source tests HLSL specifically. HLSL is probably close to GLSL in training-data coverage, but that is an assumption.

### Gaps
- No published score tables found for frontier models (Claude Opus 4.x/5.x, GPT-5.x, Gemini 3.x) on any shader benchmark. ShaderMatch results for open models were not retrievable (the IEEE page did not load; the HF README results are marked outdated).
- No study found that measures LLM-written SDF raymarching scene quality, or compares LLM-written SDF scenes with human-written ones.
- No HLSL-specific or Shader Model 6.x / DXC-specific LLM evaluation found.

---

## 2. Procedural materials and textures generated by LLMs/VLMs

### Takeaway
The academic line runs from Adobe's 2023 node-graph generator, through BlenderAlchemy (2024, GPT-4V edits Blender material programs), VLMaterial (ICLR 2025, a fine-tuned VLM that writes Blender material Python), to a training-free LLM pipeline grounded in expert process traces (ECCV 2026). These systems reach plausible approximations of target materials. All report trouble when the target needs a complex graph structure. The evaluations rely on image-similarity metrics (CLIP and similar) and do not measure exact matches.

### Cited Findings
- **[STUDY] Adobe et al., "Generating Procedural Materials from Text or Image Prompts" (arXiv 2304.13172, 2023).** A multi-modal node-graph generation architecture for procedural material synthesis. It is a trained neural model, not an LLM. — [arXiv 2304.13172](https://arxiv.org/pdf/2304.13172)
- **[STUDY] BlenderAlchemy (arXiv 2404.17672, v3 Aug 2024; Huang, Yang, Guibas).** GPT-4V generates and edits Blender Python programs for procedural materials and lighting, with an iterative sample-and-refine search. If no viable edit is found in a cycle, it reverts to the best previous state. It grounds abstract text with "imagined" reference images from an image generator, and reports higher CLIP similarity than the BlenderGPT baseline for text-driven material editing. The authors call it a proof of concept. — [arXiv 2404.17672](https://arxiv.org/abs/2404.17672v3); [HF papers page](https://huggingface.co/papers/2404.17672)
- **[STUDY] VLMaterial (ICLR 2025, arXiv 2501.18623; MIT CSAIL, Columbia, ETH Zurich, Google Research).** Fine-tunes a pretrained VLM to output Blender procedural material graphs transpiled to Python. The open dataset of Blender procedural materials was expanded from 1.6K to 550K examples through LLM program-level augmentation. It reports beating earlier single-image procedural-material methods on synthetic and real images. Stated limitation: it "may struggle to predict the best material graph structure… when the target needs a complex graph." — [arXiv 2501.18623](https://arxiv.org/html/2501.18623v2); [ETH project page](https://eth-cdl.github.io/publications/2025/VLMaterial); [ICLR proceedings](https://proceedings.iclr.cc/paper_files/paper/2025/hash/5393eaf0b723278738788520ec54e4b4-Abstract-Conference.html)
- **[STUDY] "Reflecting Process Expertise in Procedural Material Generation" (arXiv 2607.13318, Jul 2026, ECCV 2026).** Training-free. An LLM "ProcessSynthesizer" writes a process trace aligned with the user's intent, and an LLM "Compiler" grounds it into an executable Blender material graph. Process knowledge comes from expert tutorial videos converted to text traces. The paper frames BlenderAlchemy (VLM evaluation of rendered outputs) and VLMaterial (a fine-tuned VLM) as the prior state of the art. — [arXiv 2607.13318](https://arxiv.org/abs/2607.13318)

### Inferences
- Every one of these systems targets an existing node vocabulary (Blender shader nodes, Substance-like graphs). For a custom C17/HLSL engine, the closest analogue is a small, documented material DSL or node set that the LLM composes, with node documentation and worked examples supplied in context. The 2026 ECCV paper's gain comes from that kind of "how an expert would build it" in-context knowledge rather than from fine-tuning.
- Complex graphs are the documented failure mode, so the material generator should favour shallow, composable layers (noise → ramp → palette quantise) over deep graphs.
- CLIP-style similarity is a coarse proxy. For a limited-palette "3D pixel art" look, exact palette conformance and readable texel patterns can be checked mechanically, by histogramming the output against the palette.

### Gaps
- No quantitative human-preference or expert-rating study of LLM-generated procedural materials found. Accuracy is reported only as image-similarity metrics relative to baselines, and exact numbers were not extracted.
- MatFormer (Guerrero et al., 2022, Adobe) was named in the brief, but no source for it surfaced in this research pass.
- No Substance Designer-specific (.sbs graph) LLM generation work found for 2025–2026.

---

## 3. 2D visual code generation as a proxy (SVG, pixel art by code)

### Takeaway
Formal SVG benchmarks (SVG-Bench/StarVector, CVPR 2025; SVGenius, Jun 2025; SGP-GenBench, Sep 2025; VectorGym and Graphic-Design-Bench, 2026) agree on three points: proprietary frontier models lead, quality tracks general coding ability, and performance drops sharply as complexity rises. Simon Willison's informal "pelican riding a bicycle" test shows clear improvement from 2024 to 2026 but stays noisy. Even in 2026, top models still draw wrong bicycle-frame geometry, and in April 2026 a local 35B open model beat Claude Opus 4.7. For pixel art, only community benchmarks exist (24×24 index grids). One practical finding: a judge given both the PNG and an ASCII grid of the sprite assesses spatial qualities much better.

### Cited Findings
**Formal benchmarks**
- **[MEASURED] StarVector / SVG-Bench (CVPR 2025).** 10 datasets and 3 tasks (image-to-SVG, text-to-SVG, diagrams). The authors argue that pixel metrics like MSE miss vector-specific qualities. Their README says the models excel at icons, logos, diagrams and charts, but not at natural images or illustrations (self-reported). — [CVPR 2025 paper](https://openaccess.thecvf.com/content/CVPR2025/html/Rodriguez_StarVector_Generating_Scalable_Vector_Graphics_Code_from_Images_and_Text_CVPR_2025_paper.html); [README](https://cdn.jsdelivr.net/gh/joanrod/star-vector@main/README.md)
- **[MEASURED] SVGenius (arXiv 2506.03139, Jun 2025).** 2,377 queries across understanding, editing and generation, with 22 models evaluated. Proprietary models lead, but all models degrade as complexity increases. Reasoning-enhanced training beats pure scaling, and style transfer is the hardest task for every model type. — [SVGenius project page](https://zju-real.github.io/SVGenius); [arXiv 2506.03139](https://arxiv.org/abs/2506.03139v1)
- **[MEASURED] SGP-GenBench (arXiv 2509.05208, Sep 2025).** Symbolic graphics programs (SVG from captions). Frontier proprietary models substantially beat open-source ones, and performance tracks general coding ability. — [emergentmind summary](https://www.emergentmind.com/papers/2509.05208); [hyper.ai](https://hyper.ai/en/papers/2509.05208) (secondary summaries)
- **[MEASURED] VGBench (2024).** LLMs are strong on vector-graphics understanding and generation overall but weaker on the low-level SVG format. — via [search summary listing VGBench](https://papers.cool/arxiv/2407.10972) (secondary)
- **[MEASURED] Graphic-Design-Bench (arXiv 2604.04192, Mar/Apr 2026).** 50 tasks including SVG and vector work, evaluating three frontier model families. Generation subsets are small (about 100 samples). Per-model scores were not extracted. — [arXiv 2604.04192](https://arxiv.org/html/2604.04192v1)

**Informal pelican test (Simon Willison, Oct 2024 → Oct 2026)**
- **[ANECDOTE] Format.** The prompt is "Generate an SVG of a pelican riding a bicycle". The tag page lists about 155 posts by late 2026, covering most frontier releases. — [simonwillison.net tag](https://simonwillison.net/tags/pelican-riding-a-bicycle/)
- **[ANECDOTE] 16 Apr 2026, "Qwen beats Opus".** Qwen3.6-35B-A3B (a 20.9 GB Q4 quant on a MacBook) produced a correct bicycle frame. Claude Opus 4.7 drew a frame that was "entirely the wrong shape", and with `thinking_level: max` it was still wrong "but in a different way". A backup test (a flamingo on a unicycle) also went to Qwen. Willison: the benchmark "has always been meant as a joke"; pelican quality had loosely tracked usefulness, but "Today, even that loose connection to utility has been broken." — [simonwillison.net 2026-04-16](https://simonwillison.net/2026/apr/16/qwen-beats-opus)
- **[ANECDOTE, via aggregator] Timeline.** GPT-5.1 rated "Poor" (Nov 2025). Gemini 3 Deep Think was "the best one I've seen so far" (12 Feb 2026). GPT-5.3-Codex-Spark drew a duck merged with a bicycle (Feb 2026). GLM-5.1 was the favourite open-weights result (Apr 2026). — [keenable timeline (third-party summary)](https://select.keenable.ai/r/the-pelican-on-a-bicycle-model-timeline/t60MmAZHsfyZXd1m4oACVw)
- **[MEASURED, small controlled study] "Are AI labs pelicanmaxxing?" (Dylan Castillo, linked 22 Jul 2026).** 8 animals × 6 vehicles = 48 prompts, 3 runs each, on 7 models (GPT-5.6 Terra, Claude Sonnet 5, Gemini 3.5 Flash, Grok 4.5, Qwen3.7-Max, GLM-5.2, DeepSeek V4 Pro), with LLM judges (GPT-5.6 Luna, Gemini 3.1 Flash-Lite). It found no evidence that labs train for the pelican: pelicans were not drawn better than other animals, nor bicycles better than other vehicles. — [simonwillison.net 2026-07-22](https://simonwillison.net/2026/Jul/22/are-ai-labs-pelicanmaxxing/)

**Pixel art by code**
- **[MEASURED, community] Pixel Art Bench.** LLMs output JSON with a small palette and a 24×24 index grid, which is rendered to an image. There are seven subjects (Mario, Saturn, "hope"…). The lite variant scores 0.4 × JSON validity + 0.3 × render success + 0.3 × pixel-art quality (judged by an LLM), and its authors note possible style bias in that judge. A May 2026 re-analysis found Llama and SmolLM families produced no successful renders. — [Pixel Art Bench (emergentmind)](https://emergentmind.com/pixel-art-bench); [HF blog](https://hface.pages.dev/blog/AINovice2005/pixel-art-bench); [HF dataset](https://huggingface.co/datasets/AINovice2005/pixel-art-bench-lite)
- **[ANECDOTE/practitioner] Asset Forge.** The model gets a fixed palette and canvas and composes a sprite from geometric primitives. A judge scores six dimensions on a 1–5 Likert scale, with rubrics calibrated against blind human scoring. Giving the judge both the rendered PNG and an ASCII text grid of the sprite "dramatically improved" its assessment of spatial qualities. — [Asset Forge](https://matthewdeaves.github.io/assetforge)
- **[STUDY] Autoregressive Mosaics (arXiv 2608.30751, Aug 2026).** Probes 2D spatial reasoning in text-only LMs through 24×24 pixel-art outputs scored by VLM judges. Findings were not extracted. — [arXiv 2608.30751](https://arxiv.org/pdf/2608.30751)
- **[STUDY] ASCII-art generation by LLMs/LVLMs (Tohoku Univ., NLP2025, Japan).** With human ratings, current models struggle. — [ANLP 2025 P5-6](https://anlp.jp/proceedings/annual_meeting/2025/pdf_dir/P5-6.pdf)

### Inferences
- Code-to-image quality has improved a lot since 2023, but it is not monotonic across vendors or versions. A specific frontier model (Opus 4.7) can regress on, or underperform at, a specific drawing task. Assume per-task variance and keep the human approval gate.
- Recurring failures in 2026 are structural and geometric (bicycle frame topology, part connectivity), not colour or style. This matches section 1 (geometric precision) and section 4 (VLM spatial blindness).
- For pixel art and low-res renders, the Asset Forge result points to an architectural choice: feed the judge model both the image and an exact machine-readable representation (a palette-index grid as text, or numeric stats). Do not rely on the picture alone.
- Rendering a description to a constrained grid with a fixed palette (Pixel Art Bench style) is well inside current capability for frontier models. The weak dimension is overall shape quality and composition, which the benchmarks judge by LLM, with acknowledged bias.

### Gaps
- No per-model score tables were retrieved from SVGenius, SGP-GenBench, VectorGym or Graphic-Design-Bench, so frontier models cannot be ranked numerically on SVG.
- No formal benchmark found that tracks the same SVG task across 2023 → 2026 model generations. The longitudinal evidence is Willison's informal series only.
- No study found on low-resolution "3D pixel art" rendering (a 3D scene downsampled and palette-quantised) generated by LLM-written code.

---

## 4. VLM as visual judge: limits, fixes and human alignment

### Takeaway
VLMs are reliable for coarse semantic judgements ("is there a red roof", "which of two renders better matches the prompt"). In pairwise comparisons they align well with human preference: GPTEval3D (2024) and ArtifactsBench (2025, over 90% pairwise agreement with experts). They are still unreliable at precise low-level geometry: overlap, intersections, counting closely spaced items, exact proportions. The bottleneck lies in decoding visual features into language, not in the vision encoder. Zoom and crop strategies and higher input resolution help. Claude Opus 4.7 (Apr 2026) tripled the maximum image resolution to 2,576 px on the long edge. Aesthetic judgement models exist, but they carry bias, and correlation with individual taste is not established.

### Cited Findings
**Perception limits**
- **[MEASURED] "Vision language models are blind" (BlindTest; arXiv 2407.06581; v1 Jul 2024, v6 27 Mar 2025).** 7 trivially simple tasks: do two circles overlap, how many times two lines intersect, which letter is circled, how many circles are in an Olympic-like logo, and so on. Four state-of-the-art VLMs averaged 58.07%; the best, Claude 3.5 Sonnet, reached 77.84%; humans score about 100%. VLMs get close to 100% when shapes are widely separated and fail when primitives overlap or sit close together. The 2025 revision adds that "slow-thinking" (reasoning) models also struggle, and linear probing shows "vision encoders contain sufficient visual information" but the language model fails to decode it. — [arXiv 2407.06581v6](https://arxiv.org/abs/2407.06581v6); [v3 abstract](https://arxiv.org/abs/2407.06581v3)
- **[STUDY, not opened] Follow-ups in the same line:** "Forgotten Polygons: Multimodal LLMs are Shape-Blind" (Feb 2025) and "Vision Language Models are Biased" (May 2025). Titles found in search listings only. — listed via [arXivLens / sotaverified search results](https://sotaverified.org/papers/vision-language-models-are-blind)
- **[MEASURED] "Human Cognitive Benchmarks Reveal Foundational Visual Gaps in MLLMs" (arXiv 2502.16435, 2025).** Surfaced in search; details not extracted. — [arXiv 2502.16435](https://arxiv.org/pdf/2502.16435)
- **[STUDY] Gameability of VLM judges for world-model video (NeurIPS 2026).** Specialised VLM judges (VideoPhy-2-AutoEval, PhyJudge-9B) "under-respond to physically meaningful temporal corruption while remaining sensitive to superficial visual cues." — [NeurIPS 2026 poster](https://neurips.cc/virtual/2026/165857)
- **[STUDY] JudgeFit.** Builds a per-VLM error taxonomy across 16 VLMs and shows "model-specific blind spots that overall rankings cannot anticipate." — [CatalyzeX listing](https://www.catalyzex.com/paper/each-judge-its-own-yardstick-discovering-per)

**Fixes: zoom, crop, resolution, extra representations**
- **[MEASURED] Zoom-Refine (training-free, arXiv 2506.01663, 2025).** Localised region zoom plus self-refinement. Reported 53.22% average on MME-RealWorld reasoning, +2.87 points over DC² and +2.92 over ZoomEye. — [alphaxiv summary (secondary)](https://alphaxiv.org/overview/2506.01663v2)
- **[STUDY] CropVLM (arXiv 2511.19820, Nov 2025).** A 256M-parameter RL-trained cropper that "learns to zoom". It can sit in front of open or proprietary VLMs without modifying them, and it is compared against ViCrop and ZoomEye-type heuristic cropping. — [arXiv 2511.19820](https://arxiv.org/abs/2511.19820)
- **[ANECDOTE/practitioner] Asset Forge.** Supplying an ASCII grid alongside the PNG greatly improved spatial judgements of sprites (see section 3). — [Asset Forge](https://matthewdeaves.github.io/assetforge)
- **[ANECDOTE, vendor] Claude Opus 4.7 (16 Apr 2026).** Accepts images up to 2,576 px on the long edge (about 3.75 MP), more than 3× earlier Claude models (1,568 px, about 1.15 MP). Use cases named: "computer-use agents reading dense screenshots… work that needs pixel-perfect references." Higher resolution costs more tokens. — [anthropic.com/news/claude-opus-4-7](https://www.anthropic.com/news/claude-opus-4-7)

**VLM-as-judge alignment with humans for 3D and graphics**
- **[MEASURED] GPTEval3D, "GPT-4V(ision) is a Human-Aligned Evaluator for Text-to-3D Generation" (CVPR 2024).** GPT-4V compares two 3D assets pairwise, using multi-view RGB plus surface-normal renders (the official code expects 120 renderings per prompt), against user-defined criteria (text–asset alignment, 3D plausibility, and so on). The comparisons are aggregated into Elo ratings, and the authors report that this "strongly aligns with human preference across different evaluation criteria." — [CVPR 2024 paper](https://openaccess.thecvf.com/content/CVPR2024/papers/Wu_GPT-4Vision_is_a_Human-Aligned_Evaluator_for_Text-to-3D_Generation_CVPR_2024_paper.pdf); [arXiv 2401.04092](https://arxiv.org/html/2401.04092v2)
- **[MEASURED] ArtifactsBench (Jul 2025).** An MLLM judge with per-task checklists over temporal screenshots plus code reaches 94.4% ranking consistency with WebDev Arena and over 90% pairwise agreement with human experts. — [arXiv 2507.04952](https://arxiv.org/abs/2507.04952)

**Aesthetics**
- **[MEASURED] UNIAA (arXiv 2404.09619, 2024).** A fine-tuned UNIAA-LLaVA beats GPT-4V on aesthetic perception and "approaches the junior-level human". — [arXiv 2404.09619](https://arxiv.org/html/2404.09619v1)
- **[MEASURED] AesBiasBench (EMNLP 2025).** For personalised aesthetic assessment, smaller MLLMs show stronger stereotype bias, while larger models align better with human preferences. — [Underline EMNLP 2025](https://underline.io/lecture/130138-aesbiasbench-evaluating-bias-and-alignment-in-multimodal-language-models-for-personalized-image-aesthetic-assessment); [arXiv 2509.11620](https://arxiv.org/abs/2509.11620v1)

### Inferences
- Use the VLM for **semantic and relative** checks: does the render contain X, is A better than B against a checklist, are there obvious artefacts (black screen, NaN pink, z-fighting stripes, missing objects). The evidence supports good human alignment in pairwise, checklist-driven setups (GPTEval3D, ArtifactsBench).
- Do not trust the VLM for **precise geometric or quantitative** checks: exact proportions, symmetry, counting nearby small objects, whether thin parts touch or overlap, whether a 1-pixel outline is continuous. Replace these with programmatic checks: palette histograms, silhouette and mask comparisons, symmetry by image diff, connected-component counts, bounding-box ratios computed from the depth or ID buffer.
- For low-res "3D pixel art", upscale renders with nearest-neighbour before showing them to the model (each texel becomes several screen pixels). Add zoomed crops of regions of interest and, where possible, a text dump (palette-index grid). This combines the zoom/crop evidence with the Asset Forge finding. Opus 4.7+'s larger input size makes multi-view contact sheets more viable.
- Multi-view plus normal-map renders (GPTEval3D) are a proven judge input for 3D assets. Render several canonical views and a normals or matcap pass, not only the beauty shot.
- Aesthetic "taste" judgements by a VLM are biased toward generic or popular styles (AesBiasBench, Pixel Art Bench's bias note). Final style approval for a specific target look should stay human. A VLM can pre-filter and rank candidates.

### Gaps
- No 2025–2026 BlindTest-style numbers for the newest frontier models (Claude 5.x, GPT-5.x, Gemini 3.x) were found. Whether the "blind" gap has closed for the current generation is unmeasured in the sources retrieved.
- BLINK benchmark scores for recent models were not retrieved.
- No study found on VLM judging of very low-resolution images (e.g. 160×90 to 320×180 renders) or of palette-limited art specifically.
- No correlation numbers (SRCC/PLCC) between VLM aesthetic scores and human ratings for stylised 3D renders.

---

## 5. Animation evaluation (frame strips, contact sheets, video)

### Takeaway
The 2025–2026 literature on VLMs judging motion is almost entirely about generated *video* (physics plausibility, trajectory following), not game animation. Frontier VLMs are used as pairwise judges with keyframes and checklists. A NeurIPS 2026 study shows these judges can miss temporally meaningful errors while reacting to superficial cues. No study was found that validates judging animation from contact sheets or frame strips against human animators.

### Cited Findings
- **[STUDY] MotiMotion (arXiv 2605.22818, May 2026).** Uses Gemini 3.1 Pro as an automated pairwise judge. Inputs are the initial frame, a visualisation of the ground-truth trajectory, and two candidate videos; the output is a winner plus a confidence for each metric. — [arXiv 2605.22818](https://arxiv.org/pdf/2605.22818)
- **[STUDY] VideoScience-Bench / VideoScience-Judge (arXiv 2512.02942, Dec 2025).** The judge first generates a prompt-specific checklist, then selects key frames to find "causally salient moments". — [arXiv 2512.02942](https://arxiv.org/html/2512.02942v1)
- **[MEASURED] Principia (arXiv 2609.04200, Sep 2026).** Tests whether VLMs can detect relational physics violations (gravity, friction, pendulum…) in video, scoring PASS/FAIL agreement against ground truth across 7 phenomena. Exact accuracies were not extracted. — [arXiv 2609.04200](https://arxiv.org/pdf/2609.04200)
- **[STUDY] PQSG (arXiv 2606.25306, Jun 2026).** A question-based physical-plausibility pipeline: the VLM generates verification questions and answers them. Validated on 195 video pairs (FinePhyEval). — [emergentmind 2606.25306](https://www.emergentmind.com/papers/2606.25306)
- **[MEASURED] Gameability of VLM judges (NeurIPS 2026).** VLM video judges under-respond to physically meaningful temporal corruption while staying sensitive to superficial visual cues. — [NeurIPS 2026](https://neurips.cc/virtual/2026/175831)
- **[ANECDOTE/industry] Character AI case study.** A committee of expert judges was distilled into a small fast VLM for video quality checks, including physics consistency. — [ZenML LLMOps database](https://www.zenml.io/llmops-database/distilling-video-quality-evaluation-from-committee-of-experts-into-fast-vlm)
- **[MEASURED, adjacent] ArtifactsBench** captures "dynamic behavior as temporal screenshots" for judging interactive artifacts and reaches over 90% agreement with experts. Its tasks are UI and interactive web work rather than character animation. — [arXiv 2507.04952](https://arxiv.org/abs/2507.04952)
- **[MEASURED, vendor-reported via aggregator] Video understanding.** Gemini 3 Pro scores 87.6% on Video-MMMU (vs GPT-5.1 80.4%, "Claude" 77.8% in the same third-party table). — [llm-stats.com Gemini 3 Pro](https://llm-stats.com/blog/research/gemini-3-pro-launch) (aggregator; not verified against DeepMind's page)

### Inferences
- Judging animation from a contact sheet is plausible for **gross** errors (wrong pose order, limbs missing in some frames, character drifting off its origin, loop discontinuity visible in first and last frames). It is unreliable for **timing and feel** (easing, weight, anticipation, jitter), which needs temporal perception the judges are shown to miss.
- Mechanical checks beat VLM judgement for motion: per-frame bounding box and centroid trajectories, a first-versus-last-frame diff for loop seams, frame-to-frame pixel-difference curves for pops and jitter, and onion-skin overlays rendered into a single image, which turns a temporal question into a spatial one.
- Checklist-plus-keyframe prompting (VideoScience-Judge) is the best-documented pattern to copy for VLM review of animation strips.

### Gaps
- No study found that evaluates VLMs on game sprite or character animation, or on contact sheets and frame strips specifically, against human animator judgement.
- No numeric accuracy figures for frontier VLMs detecting animation timing errors.

---

## 6. Vendor claims: Anthropic (Claude 4.x/5.x) and comparable claims for GPT-5.x / Gemini 3.x

### Takeaway
Anthropic's public claims about vision centre on Opus 4.7 (Apr 2026): 3× input resolution, "substantially better vision", better interface and design "taste", and self-verification of outputs. Vision-specific benchmark numbers for Claude Opus 5 (Jul 2026) and Opus 5.5 (Sep 2026) could not be extracted. The system cards exist but their vision sections were not retrievable in this pass. Google publishes the strongest multimodal numbers (Gemini 3 Pro: ScreenSpot-Pro 72.7%, Video-MMMU 87.6%), but those figures were seen only through aggregators.

### Cited Findings
- **[ANECDOTE, vendor] Claude Opus 4.7 (released 16 Apr 2026).** "Substantially better vision"; "it can see images in greater resolution"; up to 2,576 px on the long edge (about 3.75 MP); "more tasteful and creative… producing higher-quality interfaces, slides, and docs"; "devises ways to verify its own outputs before reporting back." A "Vision" chart is on the page, but its values were not in the text. — [anthropic.com/news/claude-opus-4-7](https://www.anthropic.com/news/claude-opus-4-7)
- **[MEASURED, customer-reported] XBOW visual-acuity benchmark.** Opus 4.7 scored 98.5% versus 54.5% for Opus 4.6, per a customer quote (Oege de Moor) on Anthropic's launch page. It is a proprietary benchmark with no published methodology. — [anthropic.com/news/claude-opus-4-7](https://www.anthropic.com/news/claude-opus-4-7)
- **[ANECDOTE, counterpoint] Opus 4.7 lost the SVG pelican test** to local Qwen3.6-35B-A3B on its release day (16 Apr 2026). — [simonwillison.net](https://simonwillison.net/2026/apr/16/qwen-beats-opus)
- **[Primary doc, contents not extracted] Claude Opus 5 System Card (24 Jul 2026)** and **Claude Opus 5.5 System Card (22 Sep 2026)** exist on Anthropic's CDN. The Opus 5.5 PDF exceeded the fetch size limit (>10 MB), so no vision numbers could be extracted. Search snippets of the Opus 5 card covered cyber and bio evaluations, not vision. — [Opus 5 System Card PDF](https://www-cdn.anthropic.com/c5fbac3f0b1280a933ebd26d3cb8bb9f5bdeaf48/Claude%20Opus%205%20System%20Card.pdf); [Opus 5.5 System Card PDF](https://assets.claude.com/fc1b44717c85dc068bc6ba5024219938094694bd.pdf)
- **[Aggregator] Opus 5.5 launch.** Reported release on 22 Sep 2026 as the first Claude 5.5-family model, at about Fable 5.1-level performance on most tasks and 40% lower cost than Opus 5. No vision details reported. — [technews.tw](https://technews.tw/2026/09/23/anthropic-upgrades-claude-with-new-opus-5-5-model/)
- **[Aggregator] Opus 5 "SWE Multimodal" score of 59.4%.** Attributed to the system card by BenchLM, and unverified. Aggregators conflict on Opus 5 SWE-bench entries. — [benchlm.ai Opus 5](https://benchlm.ai/models/claude-opus-5); conflicting [morphllm.com](https://www.morphllm.com/claude-benchmarks)
- **[Aggregator] Gemini 3 Pro (Nov 2025).** MMMU-Pro 81.0% (from 68.0% for Gemini 2.5 Pro), Video-MMMU 87.6%, ScreenSpot-Pro 72.7%. The same table lists a GPT-5.1 ScreenSpot-Pro of 3.5%, which looks anomalous and should be treated as suspect. Gemini 3.1 Pro is listed by BenchLM at MMMU-Pro 83.9% and ScreenSpot-Pro 84.4%. — [llm-stats.com](https://llm-stats.com/blog/research/gemini-3-pro-launch); [Roboflow Gemini 3 Pro](https://blog.roboflow.com/gemini-3-pro/); [benchlm Gemini 3.1 Pro](https://benchlm.ai/md/models/gemini-3-1-pro.md)
- **[ANECDOTE] Gemini 3 Deep Think** produced the "best" pelican Willison had seen as of 12 Feb 2026. — [keenable timeline (secondary)](https://select.keenable.ai/r/the-pelican-on-a-bicycle-model-timeline/t60MmAZHsfyZXd1m4oACVw)
- **[STUDY] Gemini 3.1 Pro used as the automated video judge** in MotiMotion (May 2026), a sign that the research community considers it a capable visual judge. — [arXiv 2605.22818](https://arxiv.org/pdf/2605.22818)

### Inferences
- The Opus 4.7 resolution jump matters for this workflow: a 2×2 or 3×3 contact sheet of nearest-neighbour-upscaled low-res renders now fits at useful fidelity in one image. Token cost scales with resolution.
- Vendor "taste" claims refer to UI, slides and documents, not 3D stylised art. Treat them as weak evidence for game-art judgement.
- Across vendors, Gemini models are the ones most often reported and used as visual and video judges in 2026 research. Cross-checking critical visual judgements with a second vendor's VLM is a cheap hedge against model-specific blind spots (JudgeFit, section 4).

### Gaps
- Vision benchmark numbers (MMMU, CharXiv, ScreenSpot, BLINK, etc.) for Claude Opus 5 / 5.5 were not obtained. The system card PDFs are the place to check (the Opus 5.5 PDF is >10 MB and would need a local download and text extraction).
- No OpenAI primary-source vision claims for GPT-5.x were retrieved. Only aggregator numbers for GPT-5.1 were seen, and one of them (ScreenSpot-Pro 3.5%) looks erroneous.
- No vendor publication found that specifically addresses shader, SVG or graphics-programming capability for Claude 5.x, GPT-5.x or Gemini 3.x.
