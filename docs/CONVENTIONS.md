# Conventions

Binding rules for the engine's code, data and tools (D73). They settle the places where the research reports contradicted each other. Where a report differs from this file, this file wins.

Valid from 2026-11-06. Changing a convention is a decision and is recorded in [DECISIONS.md](DECISIONS.md).

## 1. Axes and units (D31)

| Item | Convention |
|---|---|
| Coordinate system | right-handed |
| World axes | **X east, Y north, Z up** |
| Map | the XY plane |
| Object local frame | +X right, +Y forward, +Z up |
| Units | meter, second, kilogram, radian |
| Angles | positive direction by the right-hand rule around the axis |
| Heading (yaw) | rotation around +Z, zero points north (+Y) |
| Rotation | quaternions, Euler angles only in human input |
| Matrices | column vectors, `M * v`, stored column-major |
| Front face of a triangle | counter-clockwise |
| Depth | D32F, reversed-Z, infinite far plane |
| UV | origin at the top left |
| Colors | computed linearly, color textures stored in sRGB |

**"Up" is never hard-coded.** The up direction and gravity come from the world shape port (`up_at`, `gravity_at`). On a flat world it is the constant +Z, on a planet it points away from the center. A lint in CI forbids the literal `(0, 0, 1)` meaning "up" outside the flat implementation of the port.

Report 4 wrote the world shape port for Y up. This adjustment applies: the cell frame has axes `east`, `north`, `up`, and a flat world returns `(x, y, 0)` as the noise domain.

## 2. Positions

- **On the CPU the authoritative position is a double** (`eng_dvec3`, meters). On a flat world in the world frame, on a planet in a frame centered on the planet.
- **Cell data** (vertices, instances) are floats relative to the origin of the cell frame.
- **The GPU** receives the matrix `(cell origin − camera)`, computed in double and only then converted to float. A large number never reaches the GPU.
- **Physics** runs in float in islands with their own origin. The origin shifts when the player moves a few kilometers away, and the shift preserves velocities.
- The model `int32 cell + float` from report 1 does not apply.

## 3. Cell ID

`eng_cell_id` is a 64-bit number `[face:3][level:5][x:28][y:28]`.

| Field | Meaning |
|---|---|
| `face` | 0–5 cube faces (planet), 7 flat world, 6 reserved |
| `level` | 0 is the root, a higher number is a finer level |
| `x`, `y` | index in the level's grid. A flat world adds an offset of 2²⁷ so negative coordinates work. |

A flat world with a root tile of 65,536 m:

| Level | Edge | Meaning |
|---|---|---|
| 4 | 4,096 m | region (L3) |
| 6 | 1,024 m | district (L2) |
| 8 | 256 m | streaming cell (L1) |

In the log and in tools, the ID is written as `face/level/x/y` with coordinates without the offset, for example `7/8/12/-3`.

The variant `face = 0` for a flat world from report 5 does not apply.

## 4. Stable object IDs

- **Generated objects:** `id = H64(world_seed, shape_hash, domain_id, rule_id, anchor_key)`.
  - The anchor is an integer key in the rule's grid. It does not depend on the cell size.
  - `rule_id` and `domain_id` are immutable IDs assigned once, separate from the display name, not an index in an array. A new rule therefore does not renumber old objects, and renaming a rule changes nothing. The domain manifest keeps a rename map (D79).
  - The anchor comes from input space (grid, curve parameter, authored point), never from the order in which a generator emits outputs.
- **Player objects:** `H64(player_namespace, counter in the save)`.
- **Mass entities:** own 64-bit IDs assigned by the table (D44).
- **Changes in the save** are keyed by the pair `(owner cell, id)`.
- **Runtime handles** (index and generation) are never stored or sent outside the process.
- **Recipes, presets and authored inputs** have a 64-bit `uid`. References are by uid; a path is only for display. A content hash is a cache key, never an identity (D79).

The local index variant from report 2 does not apply.

## 5. Determinism (D28)

| Tier | What belongs there | Guarantee |
|---|---|---|
| **A** | generators (`eng_gen_*`), simulation logic, coordinate and ID conversions | bit-identical on macOS-ARM64, Linux-x64 and Windows-x64 |
| **B1** | physics (Jolt) | identical on the same platform and build. The goal is identity on 3 OS, measurement 27 will decide. |
| **B2** | animation, audio mix | identical on the same platform and build |

Jolt is built with the option `CROSS_PLATFORM_DETERMINISTIC` from the start. Physics is identical across operating systems only when its inputs are identical too. What the engine sends into physics (forces, ragdoll target poses) is therefore computed by the tier A rules.

Tier A rules, guarded by lints and golden hashes in CI:
- No `<math.h>`. Math goes through `detmath`.
- Compile with `-ffp-contract=off`, without `-ffast-math`.
- Simulation logic computes in integers or in fixed-point.
- Randomness only from seeded streams named by a string.
- The result must not depend on the number of threads, on the traversal order of a hash table, on time or on a memory address.
- Sorting only with our own function with a stable order, not `qsort`.
- Converting a float to an integer only inside the range of the target type. NaN must not get into a hash.
- The FPU state (rounding, denormals) is the same on all threads.
- The clang version is pinned. On Windows `-ffp-contract=off` is given explicitly.

A target declares its tier with a CMake property. A tier A target must not link a tier B target.

## 6. Language and build

- Everything in the repository is in English: documentation, research, file and folder names, code, comments and commit messages (D78). Conversation with the owner may be in Czech.
- **C17**, clang on all three OS, clang-cl on Windows (D24, D26).
- `-Wall -Wextra -Werror`. ASan, UBSan and TSan run in CI.
- **C++ only in the adapters** of libraries (Jolt, Dear ImGui). Adapter headers are pure C.
- Compiler extensions only behind a macro from `eng_base`.
- Threads come from SDL3, not from `<threads.h>`. Atomics through `<stdatomic.h>`.
- A comment says why, not what.

## 7. Names

| Item | Form | Example |
|---|---|---|
| Engine functions and types | `eng_<module>_<name>`, lowercase with underscores | `eng_log_write`, `eng_cell_id` |
| Macros and constants | `ENG_<NAME>` | `ENG_ASSERT` |
| CMake target | `eng_<module>` | `eng_gen_tex` |
| Game code | the project's own prefix | `sbx_` for the sandbox |
| Files | lowercase with underscores | `world_shape_flat.c` |
| Tools in the registry | `group_action` | `golden_check`, `log_tail` |
| Debug server methods | `group.action` | `sim.step` |

The prefix `wh_` from report 4 is not used: `wh_cell_id` is `eng_cell_id`, `wh_world_shape` is `eng_world_shape`.

## 8. Programs

| Program | Purpose |
|---|---|
| `wz` | runs the engine and the game, also without a window (`--gpu=null`, `--agent`) |
| `wz_studio` | the studio |
| `wzmcp` | MCP transport for AI agents |
| `wzctl` | command line over the same tool registry |

Older names from the reports:

| In the reports | Valid |
|---|---|
| `engctl`, `wzcli` | `wzctl` |
| `gencli` | `wzctl gen` |
| `genlint` | `wzctl lint` |
| `wz_review` | `wzctl review` |

## 9. Repo structure (D32)

```
wallhammerzero/
├─ engine/
│  ├─ src/<module>/     include/eng/, src/, tests/
│  ├─ shaders/
│  └─ tools/            wzctl, wzmcp, imgdiff
├─ studio/              wz_studio
├─ projects/<game>/     game DLL, data, generators, style/, CLAUDE.md
├─ external/            libraries as git submodules
├─ milestones/          M0.json … M10.json
├─ scripts/             bootstrap, check
├─ docs/
├─ .tools/              downloaded tools (not in git)
├─ build/               build output (not in git)
└─ runs/                run outputs (not in git)
```

- Nothing is installed into the system (D6, D35). Xcode is not used. The only exception is Visual Studio Build Tools on the Windows development machine (D75).
- Module layers are enforced by CMake and a dependency lint. Modules of the same layer do not link to each other.
- The engine must not contain anything that belongs to one game. A game's rules are in `projects/<game>/`.

## 10. Files and formats

- **Configuration, recipes and game data** are text. Game data are tables loaded through the type registry (D45).
- **Every stored type** has a name and a version in the registry.
- **The log** is JSONL, one record per line.
- **A run** writes to `runs/<id>/`: `log.jsonl`, `stats.json`, and `crash.txt` on a crash.
- **A replay** has the extension `.wzr` and carries the hashes of subsystems per tick.
- **AI sources** (images, sounds) have a provenance file next to them (D14, D55, D58):
  - the model and its version, prompt, seed (if the service has one), date, the service's license and plan at the time of generation,
  - the human share: who chose the variant and what was edited by hand,
  - for images, the C2PA status (present, missing) and the output of `c2patool`.
- **A stored AI file is the source.** ElevenLabs sound cannot be regenerated identically, so it is never deleted as "derived".
- **Budgets** are kept in counts that the engine computes itself: draws, fragments, particles, voices.

## 11. Secret keys and third-party content

- API keys (for example ElevenLabs) are not put into git. They are read from environment variables or from a local `.env` that is in `.gitignore`. In CI they are secrets.
- Neither provenance nor the log ever contains a key.
- Reference shots from other people's games live in `reference/`, which is in `.gitignore`. They are not committed to the repo.
- Reference shots are not used in the game, in marketing or in a public comparison.
- **The repo is public (D76).** Nothing that must not be published belongs in it.
- ElevenLabs sounds must not be distributed as standalone files. They are therefore not committed to the public repo: they live in a separate private storage (to be decided before M3d), and the game ships them packed in an archive. Only the provenance file and the sound's hash stay in the repo.
- gitleaks guards keys before a commit and in CI, and GitHub also blocks a push with a recognized key.
- The game has a file with third-party library licenses and a screen showing them. FreeType is taken under the FTL license. Tracy is not compiled into the released version.

## 12. Git, CI and two development machines (D33, D75)

- The main branch is `main`.
- Before merging into `main`, `scripts/check` passes locally (on the Mac and on the Windows machine). Linux and Windows are additionally guarded by hosted CI.
- **Two development machines** (a MacBook and a Windows PC) share work only through GitHub and Linear:
  - Before starting work, `git pull`. At the end of a session everything is committed and pushed, nothing stays only local.
  - A task is switched to In Progress in Linear before work on it starts. Two machines do not work on one task at the same time.
  - Code is written on the task's branch (the branch name from Linear, for example `graslt/nso-581-…`). Documentation may go straight into `main` (D70).
  - When Claude Code runs on both machines at once, each takes a different task, preferably from a different phase or module.
  - Claude Code memory is stored on one machine only. Whatever must apply everywhere belongs in `CLAUDE.md` or in `docs/`.
- **Files for both systems:**
  - Line endings are controlled by `.gitattributes` (LF in the repo).
  - File names do not differ only by letter case. No symlinks. Paths shorter than 200 characters.
  - Scripts are CMake scripts (`cmake -P`), not bash or PowerShell.
- Hosted CI runs on Linux, Windows and macOS (D76). Runners are given with a version number (`macos-15`), not as `latest`.
- The `main` branch cannot be deleted or overwritten by a force push (the rule `protect-main`). Actions in CI only from GitHub and verified publishers, pinned to a commit.
- Golden files change only with the tool `golden_accept`, which requires the owner's confirmation. An approval on a review page counts as that confirmation (D86).
- A phase is closed only after its diff was reviewed by an OpenAI model (Codex CLI). The reviewer gets the diff and the docs, not Claude's conclusions. Findings are kept in `review/code/<phase>.md` and each one is fixed or answered (D83).
- Items in `milestones/*.json` are switched only by a successful command, and items with a gate only by the owner.
