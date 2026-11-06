# Documentation review: weak spots (2026-11-06)

I went through VISION, STATUS, DECISIONS and all six research reports. This file is a list of weak spots that need to be resolved before the documents become an implementation plan in Linear (D22).

**Conclusion:** the technical design is coherent, and no weak spot says "this will not work". The weak part is mainly **consolidation**: the plan is spread over six reports that contradict each other in details, and about 30 decisions are waiting for the owner. The second group is **unexplored areas** that the vision explicitly asks for (pedestrians, traffic). The third is **unverified assumptions** on which the milestone gates stand.

Severity: **A** = blocks setting up the plan or M0, **B** = must be resolved before the milestone it concerns, **C** = cleanup.

## 1. There is no single valid plan

| # | Sev. | Weak spot | Where | What to do |
|---|---|---|---|---|
| K1 | A | **Four roadmaps.** Report 1 has M0–M7, report 2 has M0–M8, report 4 modifies them and adds M9 Planet and M10 Voxels, report 5 replaces them with a unified M0–M9, and report 6 uses the old numbering again. The canonical `docs/ROADMAP.md` does not exist. | reports 1, 2, 4, 5, 6 | Write `ROADMAP.md` as the single source. Only then set up Linear from it. |
| K2 | A | **The unified plan does not include reports 4 and 6.** It lacks the cell state machine, tickets, two-layer collision, the domain manifest, `wh_cell_id` in M0 and optional voxel volumes (report 4). It lacks all of VFX and most of audio (report 6 wants effects from M2 and audio from M3; the unified plan has only "minimal audio" in M4). | report 5 vs. 4 and 6 | When writing ROADMAP, remap the content of reports 4 and 6 to the new numbering. |
| K3 | B | **Milestones M0, M3 and M4 are overloaded.** Report 5 criticizes the old M3 for overload, but the new M0 has 20+ deliverables (from CMake to the MCP transport), and M3 and M4 are similarly large. | report 5, milestone table | In Linear, split each milestone into phases with their own gate (for example M0a skeleton and CI, M0b determinism, M0c agent loop). |
| K4 | B | **Measurements are scattered.** 12 measurements in report 3, 5 more in report 4, 6 more in report 6. Only the first 12 are assigned to milestones. | reports 3, 4, 6 | One list of 23 measurements with a milestone for each. |
| K5 | B | **Type registry order.** Tools in M0 are to have JSON Schema "from the type registry", but the registry arrives only in M3–M4. | report 5 | In M0 write the schemas by hand, or move the type registry to M0–M1. |
| K6 | C | **No time estimate and no scope of "version 1".** Report 5 admits it itself. We also do not know the owner's review throughput (how many renders per hour). | all | Do not invent an estimate. In Linear, measure the real speed after M0 and M1 and estimate the rest from it. |

## 2. Reports contradict each other in details

The newer report always wins, but the older text is not marked as superseded. Whoever reads only one report gets a wrong answer.

| # | Sev. | Contradiction | Valid |
|---|---|---|---|
| R1 | B | **Cell ID.** Report 5: `(face, level, x, y)` with `face = 0` for a flat world. Report 4: a flat world is `face = 7`, format `[3\|5\|28\|28]`. | report 4 (it is more detailed); write into `CONVENTIONS.md` |
| R2 | B | **Position.** Report 1: `int32 cell + float`. Report 5: `cell_key + local float3`. Report 4: `double` on the CPU, float only relative to the cell or camera. | report 4 |
| R3 | B | **Stable object IDs.** Report 2: a hash of level, coordinates and local index. Report 4: a hash of anchor and rule name. | report 4 |
| R4 | A | **Deferred or forward+?** Reports 1 and 2 build a deferred G-buffer after GTA V. Report 3 says forward+ with MSAA fits Apple GPUs well. The unified plan does not state it in M2. The night lighting of the city (many local lights), transparency and anti-aliasing all depend on it. | undecided |
| R5 | B | **Audio mixer.** Unified plan: "SDL3 mixer". Report 6: SDL3 only for the device, miniaudio mixes. | report 6 |
| R6 | B | **DXC on the Mac.** Report 3: take ready binaries from unofficial repos. Report 5: build once from source and store in `.tools/`. | report 5 (unofficial binaries are a supply chain risk) |
| R7 | B | **Vulkan on the Mac.** Reports 1 and 3 (measurement 12, test table) count on KosmicKrisp on the development Mac. D20 cancels that. | D20 |
| R8 | C | **Repo structure.** Reports 1 and 2: `engine/src`, `game/`, `content/` in the root. Report 5: monorepo `engine/` + `projects/<game>/`. | report 5 (waiting for decision no. 16) |
| R9 | C | **Names.** Types have the prefix `eng_` (reports 1, 2, 5, 6) and `wh_` (report 4). Tools are called `wz`, `wzcli`, `wzmcp`, `wz_studio`, `engctl`, `gencli`, `genlint`. | unify in `CONVENTIONS.md` |
| R10 | C | **Upscale and anti-aliasing.** Report 2: `SDL_BlitGPUTexture`. Report 3: FSR1 or own TAAU, SMAA/FXAA or MSAA. | measurement 6 and R4 will decide |

## 3. Decisions waiting for the owner

About 30 in total. The analysis summary with their list is not written yet (STATUS, item "Summary of the whole analysis").

| # | Sev. | What is missing |
|---|---|---|
| V1 | A | **Seven decisions marked "before M0"** in report 5: acceptance of the M0–M9 plan, D4 (C17), D5 (SDL_GPU and the shape of the RHI), tool transport, the "up" axis, repo structure, review rhythm. Without them not even the first task can be set up. |
| V2 | A | **D11 has no end condition.** Nowhere is it written when the analysis ends and what must be done. A plan in Linear means the end is approaching, but the decision is missing. |
| V3 | B | **D10 art style** is open. Gates M2 and M3 need it, including the GTA III and WoW reference shots that the owner is to supply. |
| V4 | B | **World type, world mutability, network, persistence** (STATUS questions 3 and 4, report 5 nos. 7 and 8). Needed before M4 to M6. |
| V5 | B | **Jolt** is recommended by two reports, but not confirmed. |
| V6 | B | **Audio and effects:** A1–A8 and V1–V3 from report 6. |
| V7 | C | "Project support" in D18: projects, or projectiles too? Unconfirmed. |

## 4. Areas that no report addresses

| # | Sev. | Area | Why it matters |
|---|---|---|---|
| M1 | B | **Pedestrians, traffic, character AI and navigation** | VISION asks for "a dense city with buildings, cars and pedestrians". The plan has only the animation of 200 pedestrians (M8). Navigation is missing (navmesh is mentioned only as a cost), as are behavior, a traffic system and spawning of the surrounding population. No milestone has it. |
| M2 | B | **Driving physics** | A drivable car is gate M4, but nobody has researched the vehicle model (wheels, suspension, controls, "feel"). |
| M3 | B | **Light, sky, time of day** | Weather is covered by report 6. Sky, atmosphere, the day cycle and the city's night lights are missing. A planet needs an atmosphere seen from orbit. Related to R4. |
| M4 | B | **Water and vegetation at scale** | The planet is to have oceans and rivers. Water is in the plans only as a line in the GPU time estimate. |
| M5 | B | **Game layer** | Game saving, input mapping and gamepad, third-person camera (camera collision), missions and scripts, menus. Part of it is postponed until M9. |
| M6 | B | **Building and releasing the game** | How a distribution build for three OS is made (signing and notarization on macOS, installer, Steam) is in no document. |
| M7 | C | **Interiors** | Only the mention "lazy interiors" in M9. |

## 5. Unverified assumptions on which the gates stand

| # | Sev. | Assumption | Risk |
|---|---|---|---|
| P1 | A | **Bit-identical simulation replay on 3 OS (gate M4).** The ban on `<math.h>` and the FP rules, however, apply only to `gen_*` targets. The simulation (game DLL, vehicles, animation, Jolt) does not have them. | Gate M4 is unachievable as worded. Either extend the FP rules to the whole simulation and verify the deterministic build of Jolt through joltc, or soften the gate to "identical on the same platform" (this is how audio is handled in report 6). |
| P2 | B | **Cost of a draw call through SDL_GPU on Metal.** The whole renderer stands on it, and it is measured in M1. The fallback plan (a native Metal backend) assumes that SDL3 allows creating a Metal layer next to its window. Nobody has verified that. | Verify both right in M1, not only in M7. |
| P3 | B | **Cold latency of a 256 m cell.** The whole ticket budget for 200 km/h stands on an unmeasured number (estimate 0.2–1 s, "units of ms per building"). | Measure as soon as the first building generator exists (M3). |
| P4 | B | **Shaders.** SDL_shadercross has no release, and DXC is built from source on the Mac (part of LLVM, minutes to tens of minutes). | Pin a commit, automate the build in M0–M1. A Slang pilot as a fallback. |
| P5 | B | **Compiler on Windows.** MSVC has C11 atomics only experimentally. It is nowhere decided whether Windows is built with MSVC or clang-cl. | I recommend clang on all three OS: one compiler family reduces the determinism and atomics risks. |
| P6 | B | **CI.** Gate M0 requires CI on three OS. The new repo has no remote, and hosted macOS runners are billed at multiples for private repos. | Decide hosting and the CI budget before M0. |
| P7 | B | **D6 versus tools.** D6 says "nothing is installed into the system". The plan, however, counts on Xcode (GPU capture, Instruments), the Tracy profiler and RenderDoc on test machines. | Record exceptions to D6, or do without Xcode (then GPU debugging on the Mac is missing). |
| P8 | C | **Other minor unverified points:** WARP through SDL_GPU, programmatic GPU capture on Metal, the Clay renderer for SDL_GPU, Tracy overhead on Apple Silicon, double precision in joltc, bit identity of Manifold, hot reload "within a second". | Each is marked as unverified in the reports. Assign them to milestones as "verify" tasks. |
| P9 | C | **GTA III and WoW reference shots** are someone else's protected content. | Keep them out of the public repo. |
| P10 | C | **Secret keys** (ElevenLabs and other APIs) have no designated place. | Outside git, a rule in `CONVENTIONS.md`. |

## 6. Outdated and missing information in the control documents

| # | Sev. | What | State |
|---|---|---|---|
| D1 | A | **Nothing is committed.** The whole analysis (about 400 kB) exists only on this Mac's disk, with no commit and no backup. | waiting for the owner's go |
| D2 | C | STATUS: outdated "Next step", D16–D18 "waiting for research", "deep analysis missing", question 8 "no report addresses it". | fixed 2026-11-06 |
| D3 | C | DECISIONS: D16–D18 promise a proposal from research 5, which is already done. | added 2026-11-06 |
| D4 | C | DECISIONS: D7 does not mention the additions from report 5 (type registry, actor components, extraction protocol). They wait for decisions no. 9 and 10. | open |
| D5 | C | VISION did not contain the general-purpose engine with a planet (D15), the studio and MCP (D18), scale (D16). | added 2026-11-06 together with D23 (strategy games) |

## 7. Recommended order before setting up the plan in Linear

1. **Commit the documentation** (D1).
2. **Decision summary:** go through the seven "before M0" decisions (V1) and R4, P1, P5, P6 with the owner.
3. **`docs/ROADMAP.md`:** one M0–M9 plan with reports 4 and 6 worked in, split milestones and one list of measurements (K1–K5).
4. **`docs/CONVENTIONS.md`:** the "up" axis, cell ID format, positions, prefixes and tool names (R1–R3, R9).
5. **Linear:** project Wallhammer Zero, milestones M0–M9, tasks at first only for M0 and M1. Break down further milestones only as they approach.
6. **Research on the gaps** M1–M3 (pedestrians and traffic, driving physics, light and sky) can run in parallel with M0 and M1, because those do not depend on it.

**Added 2026-11-06:** recommendations for all items in groups 2, 3 and 5 are in [DECISION-PROPOSALS.md](DECISION-PROPOSALS.md). The requirement for strategy games (D23) adds mass entity simulation and data-rich UI to the gaps in group 4.

**Added 2026-11-06 (evening):** the owner confirmed the proposals. Groups 1–3 and 5 are resolved by [ROADMAP.md](ROADMAP.md), [CONVENTIONS.md](CONVENTIONS.md) and D24–D73. On item P7: Xcode is not installed (D35). Group 4 (unexplored areas) is in ROADMAP as a table of gaps.
