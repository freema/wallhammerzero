# Examples: the design read as code

Illustrative sketches of the main concepts, so the plan can be read as code and data and not only as prose. Added 2026-11-09 at the owner's request.

**These are sketches.** Nothing here is compiled and nothing here is engine code. Names and signatures are settled when the module is written ([ARCHITECTURE.md](ARCHITECTURE.md)). Where a real choice is still open, the options are listed with a recommendation. When a sketch differs from DECISIONS, CONVENTIONS or ARCHITECTURE, those files win.

## 1. A headless run and its log (M0c, D17)

```
$ wz --gpu=null --frames 600 --fixed-dt --seed 42 --script drive.cmd --dump
run 2026-11-20_01: 600 frames, 0 errors, 0 warnings → runs/2026-11-20_01/
```

`runs/2026-11-20_01/log.jsonl`, one record per line:

```json
{"tick":0,"ch":"core","lvl":"info","msg":"start","seed":42,"build":"a41b9f2"}
{"tick":12,"ch":"gen","lvl":"info","msg":"cell built","cell":"7/8/12/-3","ms":38.2}
{"tick":599,"ch":"sim","lvl":"info","msg":"digest","hash":"9f2c11d07e55a3b0"}
```

## 2. A generator is a pure function of its context (D8, D28, D79)

```c
// eng_gen_tex, tier A. No cvars, no clock, no files, no <math.h>.
// Everything the generator may read is in this struct, and all of it enters the cache key.
typedef struct eng_gen_brick_ctx {
    uint64_t              seed;
    const eng_style      *style;    // palette and ramp
    const eng_scale      *scale;    // the brick size comes from the scale table
    eng_gen_brick_params  params;   // from the recipe
    eng_allocator        *scratch;
} eng_gen_brick_ctx;

eng_gen_status eng_gen_brick(const eng_gen_brick_ctx *ctx, eng_tex_out *out);
```

The same function serves the running engine, `wzctl gen`, the golden test and the bake. A cell that comes from a baked file has the same format as `eng_tex_out`.

## 3. A recipe: asset = program + parameters + seed (D8, D79)

```
recipe   uid=0x5b1e09c2a4f37d10  type=gen_brick  version=3
name     "Red brick, worn"
bond     running
brick_w  0.24            # meters
mortar   0.012
wear     0.35
palette  ref:0x19aa03f4c2b85e77
```

The `uid` is the identity. The file can be moved or renamed and nothing breaks. `palette` is a typed reference, so `wzctl rdeps 0x19aa03f4c2b85e77` lists every recipe that uses the palette.

**Options for the text syntax** (CONVENTIONS says only "text"):

| Option | For | Against |
|---|---|---|
| **A. Our own line format, as above (recommended)** | comments, clean diffs, one small parser shared with `scale.cfg`, no dependency | we write and fuzz the parser |
| B. JSON | every tool reads it, JSON Schema validates it directly | no comments, noisy diffs, awkward to write by hand |
| C. A TOML subset | familiar, has comments | a library or a larger parser, more syntax than we need |

## 4. The type registry (D43, D79)

```c
ENG_TYPE_BEGIN(sbx_building_def, 2)                 // name and version
    ENG_FIELD      (uint32_t,  floors)
    ENG_FIELD      (eng_fixed, height_m)
    ENG_FIELD_REF  (facade, gen_facade_recipe)      // uid + target type
    ENG_FIELD_SINCE(2, uint16_t, damage_states)     // added in version 2
ENG_TYPE_END()
```

From one description come the save and load, the JSON Schema for tools, the studio panel and the dependency graph.

**Options for how a type is described:**

| Option | For | Against |
|---|---|---|
| **A. Macros next to the struct (recommended)** | one place, no extra build step, the compiler checks the field names | macro error messages are poor |
| B. Hand-written field tables | no macros, easy to debug | the struct and the table drift apart |
| C. A schema file and a code generator | the schema is the source, other languages can read it | a build step and a tool to maintain |

## 5. The scale table (D16, D53)

```
# projects/sandbox/style/scale.cfg, the default profile
character_h   1.80     # meters
opening_mul   1.20
floor_mul     1.10
lane_mul      1.15
distance_mul  0.50
module        0.50
```

```c
float door_h = scale_derive(scale, ENG_SCALE_DOOR_HEIGHT);   // never a literal 2.1f
```

A lint over an archetype, with the reference character in every preview:

```c
ENG_LINT(scale_door_vs_character, "a door is 1.10 to 1.30 character heights")
{
    float r = arch->door_h / scale->character_h;
    if (r < 1.10f || r > 1.30f)
        ENG_LINT_FAIL(arch->uid, "door / character = %.2f", r);
}
```

## 6. One tool, two transports (D30)

```c
static eng_tool_result tool_golden_check(const eng_tool_args *args, eng_json_writer *out);

ENG_TOOL(golden_check, "Compare the golden hashes of a domain with the manifest",
         ENG_ARG_OPT(string, domain));
```

```
$ wzctl golden_check --domain tex
{"ok":false,"changed":[{"id":"tex/brick_red","expected":"9f2c11d0","got":"a41b77e3","domain_version":3,"version_bumped":false}]}
```

An agent calls the same tool through `wzmcp` under the name `golden_check` and gets the same JSON.

## 7. A milestone item and the code review item (D83)

```json
{ "milestone": "M0", "items": [
    { "id": "M0b.noise_hash", "desc": "10,000 noise and RNG samples hash identically on 3 OS",
      "cmd": "ctest -L golden -R gen_core", "expect": "exit 0", "passes": false },
    { "id": "M0b.code_review", "desc": "an OpenAI model reviewed the phase diff and every finding is closed",
      "cmd": "wzctl review code --phase M0b --status", "expect": "closed", "passes": false } ] }
```

## 8. The game DLL (D41, D45)

```c
#include "eng_api.h"            // the only engine header the game sees

ENG_EXPORT void game_fixed_update(const eng_api *eng, eng_world *world,
                                  const eng_player_cmd *cmds, uint32_t count, eng_tick tick)
{
    for (uint32_t i = 0; i < count; ++i)
        if (cmds[i].kind == SBX_CMD_THROTTLE)
            sbx_car_set_throttle(eng, world, cmds[i].actor, cmds[i].value_fx);
}
```

The keyboard, a replay file and an AI agent all reach the game through the same `eng_player_cmd` stream.

## 9. The camera: one free camera, rigs as parameters (D84)

```
rig   uid=0x77c0a15e02d94b31  type=camera_follow
target         player_vehicle
distance       6.5      # meters behind
height         2.2
lag            0.18     # seconds
fov_deg        60
fov_speed_add  12       # at top speed
```

```c
eng_camera cam = eng_camera_rig_eval(rig, world, dt);   // every rig ends as the same free camera
```

A strategy game ships a `camera_strategy` rig, a flight over the planet a `camera_orbit` rig. The renderer knows only `eng_camera`.

## 10. A change on top of a generated world (D40, D79, D80)

```
edit  layer=player   cell=7/8/12/-3  kind=place     uid=0x8c41d2e09a6f5b13  archetype=ref:0x2f0e…  at=(41.5, 12.0, 0.0)
edit  layer=destruct cell=7/8/12/-3  kind=state     uid=0x13aa90c4e7d1f620  state=fractured  impact=(3.2, 0.4, 1.1)  seed=0x51
```

A save holds lines like these and the simulation state, never geometry. The world is regenerated and the edits are applied on top.

## 11. A review page and a verdict (D86)

```
$ wzctl review export --set m2_style --out runs/2026-11-20_01/review.html
$ wzctl review import decisions.json
imported 14 verdicts: 11 approved, 3 rejected → review/decisions.jsonl
```

```json
{"item":"tex/brick_red@9f2c11d0","verdict":"reject","note":"mortar too bright","by":"owner","via":"page","at":"2026-11-20T18:04:11Z"}
{"item":"tex/plaster_warm@77e3a41b","verdict":"approve","by":"owner","via":"studio","at":"2026-11-20T18:05:40Z"}
```

**Options for how the page reaches the owner** (all three use the same export and import):

| Option | For | Against |
|---|---|---|
| A. A file opened from disk | nothing leaves the machine | only on the machine that made it |
| **B. A Claude Artifact published by the agent (recommended for now)** | works on a phone and on the second machine, the agent reads the verdicts back | the renders leave the machine |
| C. Any static host | independent of one AI vendor | hosting to set up, verdicts come back as a file |
