# Checking the plan against web sources (2026-11-06)

Five researchers checked the places the plan stands on against documentation, source code and articles. Detailed notes with links are in [research/notes/plan-verification/](research/notes/plan-verification/).

**Conclusion:** no decision fell. One justification was wrong (Jolt and determinism), the game UI and strategy games need more work than the plan expected, and the shader compiler is the first technical risk. The fixes are worked into [ROADMAP.md](ROADMAP.md) and [CONVENTIONS.md](CONVENTIONS.md) and recorded as D74.

Nothing was built or measured. "Confirmed" means agreement with documentation and sources, not with our own experiment.

## Questions for the owner

None of them blocks M0. Each has a recommendation.

| # | Question | Recommendation | Why |
|---|---|---|---|
| 1 | **macOS in hosted CI.** A nightly macOS run would cost about 18.60 USD a month. GitHub's whole free allowance is 12 USD. Pay, or leave it out? | ~~Leave it out.~~ **Resolved in D76:** the repo is public, hosted runners are free and macOS runs on every push. | It changes D33. |
| 2 | **Conditions and effects written in data.** A Stellaris-style game has thousands of events of the form "when X holds, Y happens". May the game data assemble them from ready-made parts that are programmed in C? | **Yes.** It is not a scripting language, and the logic stays in C. The engine can produce a tooltip from it and store the event safely. | Without it, every event would be written by hand in C. It refines D45. |
| 3 | **GTA III and WoW screenshots and AI services.** May reference shots be sent to AI models for comparison? | **Do not send them to other services.** They stay local, outside the repo, and you judge them next to the render. A second judge from another vendor gets only our renders. | It is someone else's protected content, and AI providers claim rights to inputs. |

### What you decide later

| When | Question |
|---|---|
| At gate M2 | Anti-aliasing: a sharp image (MSAA and spatial upscale) is the default. A softer variant (TAAU) sometimes leaves ghosts behind motion. You will see it in the image. |
| At gates M2 and M8 | Whether hundreds of real lights in view are enough, with distant ones as glowing points. |
| Before M3d | The ElevenLabs plan. A commercial license starts with the Starter plan (6 USD a month). We do not know what happens to the rights after the subscription is cancelled. |
| When designing the strategy game | The top time speed, the fidelity of traffic seen from above, and the scale of the grand strategy game. |
| Before the first release | The Apple Developer Program (without it a Mac game cannot be notarized). The text about AI content for Steam. |

## What was confirmed

| Area | Finding |
|---|---|
| Mac without Xcode (D35) | Command Line Tools are enough. They have the SDK for SDL3 and Metal, `lldb`, sanitizers, `notarytool` and `stapler`. SDL_GPU takes shaders as MSL text and translates them at run time. |
| Measuring without Xcode | Metal validation and the Metal HUD with a GPU time log per frame are part of the system. Tracy has a ready binary for macOS arm64. |
| Clang on Windows (D26) | C11 atomics in MSVC are still experimental. SDL3 and Jolt are both built with clang-cl in their CI. |
| Determinism rules (D28) | Box2D v3, Rapier and Jolt use the same rules. |
| joltc (D42) | Maintained, MIT license. It has vehicles, ragdoll with motors, double precision and a determinism option. |
| Forward+ (D27) | Matches Apple's recommendation for their GPUs. |
| SDL_GPU limits (D5) | They hold in version 3.4.20 too: no bindless, multi-draw on Metal is a loop, timing queries are missing. |
| Studio (D57) | Dear ImGui has a maintained backend for SDL_GPU. |
| Strategy games (D44, D46–D48) | Cities: Skylines, Factorio and Unreal Engine 5 (Mass next to game objects) use the same recipe. 100,000 entities at 60 fps is realistic. |
| AI content on Steam | Content the player sees and hears is declared. Development tools are not the target. |
| ElevenLabs (D58, D59) | The terms explicitly allow use in games. |
| AI music (D58, D60) | The publishers' disputes with Suno continue, so caution is in order. |
| Library licenses | All fit, none is copyleft. |

## What was different and how it is fixed

| # | Finding | Fix in the plan |
|---|---|---|
| 1 | **Jolt can run a bit-identical simulation across operating systems.** It costs about 8 % of performance, and Jolt checks it in its own CI on macOS, Linux and Windows. The justification of D28 was wrong. Only our combination is unverified: clang-cl, vehicles and joltc. | Jolt is built with this option from the start. Tier B is split into B1 (physics, target 3 OS) and B2 (animation, audio). Gate M4 stays "same platform" and measurement 27 decides whether it is raised. |
| 2 | **joltc cannot save and restore physics state.** A save with simulation state (D40) needs it. | We write state saving in our own adapter (M4b). |
| 3 | **The shader compiler is the first risk.** SDL_shadercross has no release, Microsoft does not ship DXC for macOS, and nobody confirmed a build from source with only Command Line Tools. Slang cannot produce DXIL on a Mac. | The first task of phase M1c. DXIL may be produced in CI instead of on the Mac. |
| 4 | **On a Mac, GPU time per pass will not work** and a captured frame cannot be inspected. SDL_GPU has no queries, and they are due in version 3.6. | Our own debug views in the engine (M2), budgets in counts, whole-frame time from the Metal HUD. |
| 5 | **Clay is layout only.** It has no drawing through SDL_GPU, no text input and no tables. Its development has stood still since May 2026. | `eng_ui` includes own drawing, text input and a table in its scope (M4c, M6). Clay and SDL_ttf are pinned to a commit. |
| 6 | **"No depth prepass" holds only on Apple GPUs.** | On Vulkan and D3D12 the prepass is an optional switch (M2). |
| 7 | **Engines cap at 256–512 real lights in view.** | A budget of hundreds of lights, distant ones as glowing points (M2). |
| 8 | **Data tables are not enough for a Stellaris-style game.** Conditions and effects, an event queue and modifiers are missing. | Question 2 above. The rest will be checked by the research on UI and data-driven content (D71). |
| 9 | **A strategy game needs more than "regenerate a cell".** The road network is a global model, and intersections are the hardest part. Entity sleeping, a pathfinding service and a rule for parallel ticks were missing. | Added to M6, including a stricter test scene. |
| 10 | **Cities: Skylines II was sunk by drawing, not by simulation.** | Scene C also guards the draw cap when looking at the whole map. |
| 11 | **ElevenLabs sound cannot be regenerated identically** (the API has no seed) and the v2 model ends on 1 March 2027. Sounds must not be distributed as standalone files. | The stored file is the only source, generation uses the v3 model, and AI sounds stay outside the public repo (CONVENTIONS, D76). |
| 12 | **GitHub bills in dollars, not in minute multipliers.** `macos-latest` already means macOS 26. | Question 1 above. CI says `macos-15`. |
| 13 | **Copyright protects only the human share,** not pure AI output. | Provenance also records the human share: selection and manual edits. |

## What could not be verified

- Building SDL_shadercross with DXC using only Command Line Tools, and how long it takes. Task M1c will verify it.
- The cost of a draw on Metal, the cost of 4× MSAA and the number of lights on Apple Silicon. No public measurement exists, and measurements 1 and 2 will decide.
- Jolt determinism through clang-cl, for vehicles and through joltc. Measurement 27 will decide.
- D3D12 through WARP on a hosted Windows runner.
- The inside of the Paradox engine: their forum blocks automated reading, and the sources are only secondary.
- Whether Steam wants graphics drawn by code written by AI to be declared too. The form is silent about code.
- Rights to ElevenLabs sounds after the subscription is cancelled.
