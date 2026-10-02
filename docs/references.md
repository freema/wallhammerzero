# References

Where our ideas come from and how others do it. This page is the map. The depth (analysis,
numbers, every cited link) is in the research reports, each of which ends with its own
**Sources** section.

## How we get from an idea to a task

1. **Conversation with the owner** (Czech). Proposals go to the owner as options + a
   recommendation.
2. **Research** by sub-agents when a topic needs depth: [`research/`](../research/README.md),
   deep reports and security scans, with sources and fact/opinion labels.
3. **Owner decides.** The decision and the owner's own words go to
   [`docs/DECISIONS.md`](DECISIONS.md). Open questions wait in
   [`tasks/2026-10-02-owner-calls.md`](../tasks/2026-10-02-owner-calls.md).
4. **Task notes** in [`tasks/`](../tasks/README.md). Each note says what it comes from (Origin)
   and what to read first (research sections). The table "Which research feeds which notes"
   below is the reverse view.
5. **Implementation and verification** by a Claude Code session; the owner judges assets in the
   studio, and the verdicts go back into the repo.

## Which research feeds which notes

| Report | Task notes that build on it |
|---|---|
| [code-graphics.md](../research/code-graphics.md) | asset-kit-core, asset-render-cli, art-spike-2d, fx-emitters, studio-compare, studio-params-sliders |
| [studio-stack.md](../research/studio-stack.md) | every `studio-*` note, runtime-sprite-core, player-loop-test-protocol |
| [voxels.md](../research/voxels.md), [ref-voxel-musou.md](../research/ref-voxel-musou.md) | voxel-sprite-baker, art-spike-voxel, studio-voxel-inspector, sim-core (tick) |
| [ref-procedural-pixel-creatures.md](../research/ref-procedural-pixel-creatures.md) | voxel-sprite-baker, asset-kit-core, asset-render-cli, both art spikes |
| [multiplatform.md](../research/multiplatform.md) | sim-core, game-package-format, player-loop-test-protocol, player-saves, runtime-input, sim-conformance-quickjs, studio-play-and-builds, desktop-wrapper, mobile-wrapper |
| [audio-from-code.md](../research/audio-from-code.md) | audio-synth-core, runtime-audio, studio-audio |
| [game-creator.md](../research/game-creator.md) | player-loop-test-protocol (test protocol), game-package-format (reference integrity), studio-concept-pages (template) |
| [ref-sakura-crossing.md](../research/ref-sakura-crossing.md) | game-package-format (kinds as table rows), player-loop-test-protocol (`shot`), runtime-text-ui, runtime-tilemap-scene |
| [ref-threejs-punk.md](../research/ref-threejs-punk.md) | repo-docs-check (docs drift), fx-emitters |
| [ref-nms-procgen.md](../research/ref-nms-procgen.md) | player-saves (pin versions); the rest waits for the voxel game |
| [skill-validation.md](../research/skill-validation.md) | skill-intake-tooling (done: [security/skill-intake/](../security/skill-intake/README.md)) |
| The owner's `code-pixel-game` skill | asset-kit-core, asset-render-cli, art-spike-2d, runtime-text-ui, runtime-tilemap-scene, audio-synth-core |

## The owner's own sources

| What | Where | Used for |
|---|---|---|
| Graphics reference list + voxel game plan | Vellum `projects/grafika-reference/index.md`, `plan-voxel-hra.md` | D14, `research/voxels.md` |
| Analyses 01–04 (sakura-crossing, Threejs-Punk, voxel-musou, NMS/LNF) | Vellum `projects/grafika-reference/analyzy/01–04` | `research/ref-*.md` (deep versions) |
| Task doctrine (one note = one task = one commit) | `~/projects/game/godot/alpha-frontier/tasks/README.md`, `.claude/commands/do-task.md` | D8, `tasks/README.md` |
| `implement-tasks` skill (tasks/-driven) | `~/projects/nodejs/pixelforge-mcp/.claude/skills/implement-tasks/` | task `implement-tasks-skill` |
| `implement-spec` skill (Linear-driven sibling) | `~/projects/nodejs/lustitel/.claude/skills/` | task `implement-tasks-skill` |
| `code-pixel-game` skill (graphics from code, built from Gloop's Escape + our research) | `~/.claude/skills/code-pixel-game/` | asset work; art spikes. Its WZ profile defers to our CLAUDE.md and `asset-kit` |

## Reference projects (analysed in depth)

| Project | What we take | Licence | Report |
|---|---|---|---|
| [Kenton-GMI/sakura-crossing](https://github.com/Kenton-GMI/sakura-crossing) | Canvas2D generators, building types as data, `__shot` render endpoint, numeric self-checks, how Claude Code keeps 56k lines alive (docs + recorded traps) | MIT (its MP3 is not covered) | [ref-sakura-crossing.md](../research/ref-sakura-crossing.md) |
| [ektogamat/threejs-conference](https://github.com/ektogamat/threejs-conference) (Threejs-Punk, [demo](https://threejspunk.vercel.app/)) | AGENTS.md + techniques docs (and how they drift), perf profiles, dev perf API | Rain shaders CC BY-NC-SA: **don't copy** | [ref-threejs-punk.md](../research/ref-threejs-punk.md) |
| [mike007jd/voxel-musou](https://github.com/mike007jd/voxel-musou) | Voxel `sculpt` box-list builder, rig + pose arrays + IK, strict sim/render split, game-feel tricks | MIT | [ref-voxel-musou.md](../research/ref-voxel-musou.md) |
| No Man's Sky / Light No Fire (technique, not a repo) | Positional seed cascade, store only deltas, pin the generator version, seed browser | n/a | [ref-nms-procgen.md](../research/ref-nms-procgen.md) |
| [idlerunner00/procedural-pixel-creatures](https://github.com/idlerunner00/procedural-pixel-creatures) | Pixel-art rules for a 3D → pixel baker (selective outline, depth-gap contours, ramp-step shadows, speck cleanup), faces as stamps, uncurated review seeds, animation lints | MIT (+ Apache-2.0 PCG32, fdlibm notice); ideas only by choice | [ref-procedural-pixel-creatures.md](../research/ref-procedural-pixel-creatures.md), [scan](../security/skill-intake/procedural-pixel-creatures/2026-10-02-24d26df/TRIAGE.md) |
| [PlayableIntelligence/game-creator](https://github.com/PlayableIntelligence/game-creator) | Test protocol in every game (state as text, time stepping, seeded action scripts, QA loop with attempt log) | Unclear (README MIT, package.json ISC, no LICENSE) | [game-creator.md](../research/game-creator.md), [scan](../security/skill-intake/game-creator/2026-10-02-4e64b83/TRIAGE.md) |

## Graphics from code (Opus 5.5)

- People and posts behind "graphics as code": Jake Eaton (Anthropic; paintings as ~7,500 lines of
  pixel-by-pixel Python), Voxyz_ai, MindGate_dev, developedbyed, victormustar, yugen_matuni. Links
  and what each shows: [code-graphics.md §1.1 and §9](../research/code-graphics.md).
- [anthropics/skills](https://github.com/anthropics/skills): `algorithmic-art` (seed navigator +
  params), `canvas-design`, `slack-gif-creator` (utilities + validators):
  [code-graphics.md §4](../research/code-graphics.md).
- [Claude vision docs](https://platform.claude.com/docs/en/build-with-claude/vision): small-image
  and GIF limits behind our "Looking at images" rules.
- [David Holland: 3D pixel art rendering](https://www.davidhol.land/articles/3d-pixel-art-rendering/),
  [Dead Cells 3D → 2D pipeline](https://www.gamedeveloper.com/production/art-design-deep-dive-using-a-3d-pipeline-for-2d-animation-in-i-dead-cells-i-).

## Voxels → pixel art

- Tiberian Sun / Red Alert 2 voxel units ([VXL format](https://modenc.renegadeprojects.com/VXL)),
  Ken Silverman's Build voxels ([advsys.net](http://advsys.net/ken/download.htm)).
- [0fps: meshing](https://0fps.net/2012/06/30/meshing-in-a-minecraft-game/) and
  [voxel AO](https://0fps.net/2013/07/03/ambient-occlusion-for-minecraft-like-worlds/).
- [MagicaVoxel .vox format](https://github.com/ephtracy/voxel-model/blob/master/MagicaVoxel-file-format-vox.txt),
  [vengi](https://github.com/vengi-voxel/vengi) (MIT, converter + Lua scripting).
- Planet scale (later): [Transvoxel](https://transvoxel.org/), [CDLOD](https://github.com/fstrugar/CDLOD),
  [Godot Voxel Tools](https://github.com/Zylann/godot_voxel),
  [GDC 2017: Continuous World Generation in No Man's Sky](https://www.gdcvault.com/play/1024265/Continuous-World-Generation-in-No).
- All of it: [voxels.md](../research/voxels.md) "Sources".

## Studio, runtime, determinism

- [React Router v8](https://remix.run/blog/react-router-v8),
  [node-custom-server template](https://github.com/remix-run/react-router-templates/blob/main/node-custom-server/server.js),
  [Remix 3 RC](https://remix.run/blog/remix-3-release-candidate) (why not Remix 3).
- One WebGL context, many views: [WebGL fundamentals](https://webglfundamentals.org/webgl/lessons/webgl-multiple-views.html),
  [three.js multiple scenes](https://threejs.org/manual/en/multiple-scenes.html).
- Determinism: [MDN Math precision](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math),
  [Gaffer on Games: Fix your timestep](https://gafferongames.com/post/fix_your_timestep/),
  [Factorio desyncs](https://wiki.factorio.com/Desynchronization),
  [1500 archers (Age of Empires)](https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond).
- All of it: [studio-stack.md](../research/studio-stack.md) "Sources".

## Audio from code

- [sfxr](https://drpetter.se/project_sfxr.html), [jsfxr](https://github.com/chr15m/jsfxr),
  [ZzFX](https://github.com/KilledByAPixel/ZzFX), [ZzFXM](https://github.com/keithclark/ZzFXM),
  [SoundBox](https://github.com/mbitsnbites/soundbox),
  [Web Audio API](https://webaudio.github.io/web-audio-api/).
- All of it: [audio-from-code.md](../research/audio-from-code.md) "Sources".

## Shipping everywhere

- Electron ([releases](https://releases.electronjs.org/)), Capacitor
  ([build](https://capacitorjs.com/docs/cli/commands/build)), Tauri on Linux
  ([graphics issues](https://v2.tauri.app/develop/debug/linux-graphics/)).
- Consoles: [W4 Consoles](https://www.w4games.com/w4consoles),
  [Godot console docs](https://docs.godotengine.org/en/4.5/tutorials/platform/consoles.html),
  [GodotJS](https://github.com/godotjs/GodotJS),
  [CrossCode console ports](https://www.siliconera.com/crosscode-interview-radical-fish-games-on-console-ports-and-whats-next/).
- All of it: [multiplatform.md](../research/multiplatform.md) "Sources".

## Security

- [NVIDIA SkillSpector](https://github.com/NVIDIA/skillspector) (Apache-2.0): how we run it is in
  [security/skill-intake/README.md](../security/skill-intake/README.md) (procedure, scan command,
  registry); the research behind it is [skill-validation.md](../research/skill-validation.md), and
  the first scan is
  [game-creator](../security/skill-intake/game-creator/2026-10-02-4e64b83/TRIAGE.md).

## Licences

Before copying anything, check [research/README.md → Licence flags](../research/README.md#licence-flags).
