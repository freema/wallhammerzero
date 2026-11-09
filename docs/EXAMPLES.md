# Examples: the design read as code

Illustrative sketches of the main concepts, so the plan can be read as code and data and not only as prose. Added 2026-11-09 at the owner's request.

**These are sketches.** Nothing here is compiled and nothing here is engine code. Names and signatures are settled when the module is written ([ARCHITECTURE.md](ARCHITECTURE.md)). Where a choice was open, the options are listed with what was chosen. Research 9 corrected several sketches on 2026-11-09 (D88–D90). When a sketch differs from DECISIONS, CONVENTIONS or ARCHITECTURE, those files win.

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

## 3. A recipe: asset = program + parameters + seed (D8, D79, D90)

```
wz 1                                                   # file syntax version
recipe   uid=0x5b1e09c2a4f37d10  type=gen_brick  schema=3
name     "Red brick, worn"
bond     running
brick_w  0.24            # meters
mortar   0.012
wear     0.35
palette  ref:0x19aa03f4c2b85e77 "palette/city_warm"
```

The `uid` is the identity. The file can be moved or renamed and nothing breaks. `palette` is a typed reference: the uid decides, the text after it is a hint for readers that a lint keeps fresh. `wzctl rdeps 0x19aa03f4c2b85e77` lists every recipe that uses the palette.

Nobody types a uid, neither a person nor an agent:

```
$ wzctl uid new
0x5b1e09c2a4f37d10
$ wzctl duplicate recipes/brick_red.wz recipes/brick_yellow.wz     # a copy with a new uid
$ wzctl show recipes/brick_red.wz --json                           # the lossless JSON view for tools
{"syntax":1,"kind":"recipe","uid":"0x5b1e09c2a4f37d10","type":"gen_brick","schema":3,
 "name":"Red brick, worn","bond":"running","brick_w":0.24,"mortar":0.012,"wear":0.35,
 "palette":{"ref":"0x19aa03f4c2b85e77","hint":"palette/city_warm"}}
```

A file with an unknown key, a dangling reference or a uid that another file already has does not load:

```
recipes/brick_yellow.wz:1: error: uid 0x5b1e09c2a4f37d10 is already used by recipes/brick_red.wz
recipes/brick_red.wz:6: error: unknown key "morter" in gen_brick (did you mean "mortar"?)
```

**The text syntax** (decided in D90 after research 9):

| Option | For | Against |
|---|---|---|
| **A. Our own line format plus a JSON view (chosen)** | comments, clean diffs, the fewest tokens for an agent, full 64-bit uids, one row per line for tables | we write the grammar, a conformance corpus, the parser and the writer |
| B. JSON on disk | every tool reads it, JSON Schema validates it directly | no comments, 17 to 41 % more tokens, uids as strings |
| C. A TOML subset (the fallback) | an existing parser and test suite | the weakest generation scores of the standard formats, no full 64-bit integer, awkward tables |

Measurement 38 checks how reliably the agent writes format A. Without a written grammar and a conformance corpus the fallback is C, never an unspecified own format.

## 4. The type registry (D43, D79, D90)

```c
ENG_TYPE_BEGIN(sbx_building_def, 3)                       // name and schema version
    ENG_FIELD      (uint32_t,  floors,   .def = 4, .min = 1, .max = 60, .doc = "number of floors")
    ENG_FIELD      (eng_fixed, height_m, .unit = "m", .doc = "height of one floor")
    ENG_FIELD_REF  (facade, gen_facade_recipe, .affects_output = true)     // uid + target type
    ENG_FIELD_SINCE(2, uint16_t, damage_states, .def = 3)                  // added in version 2
    ENG_FIELD_WAS  (floors, "storeys")                    // renamed in version 3, old files still load
    ENG_FIELD_GONE (2, "roof_kind")                       // removed in version 2, the name is never reused
ENG_TYPE_END()
```

From one description come the save and load, the JSON Schema for tools (with units and descriptions), the studio panel, the dependency graph and the migration of old files. The dump of the whole registry is committed, and CI fails when it changes without a version bump. A changed default is a version bump too, because it would silently change generated output.

**How a type is described** (decided in D90):

| Option | For | Against |
|---|---|---|
| **A. Macros next to the struct (chosen)** | one place, no extra build step, shipped in C engines (Quake III, Flecs) | macro error messages are poor; the struct and the list can drift, so a size check guards each type |
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
    { "id": "M0b.code_review", "desc": "an OpenAI model reviewed the phase and every finding is closed",
      "cmd": "wzctl review code --phase M0b --status", "expect": "closed", "passes": false },
    { "id": "M0b.sphere_roundtrip", "desc": "10^5 position → cell → position conversions hash identically on 3 OS",
      "cmd": "ctest -L golden -R cell_id_sphere", "expect": "exit 0", "passes": false,
      "blocked": "example of a reason: det_atan differs in the last bit on Windows" } ] }
```

CI runs every `cmd` and fails when the stored `passes` differs from the result (D87). `blocked` is the honest exit: the item cannot pass yet and the owner sees why (D88). The file is a guard path, so a changed `cmd` or `expect` shows up in the guard-change report:

```
Guard changes in this pull request
  tightened  lint scale_door_vs_character: range 1.10–1.30 → 1.15–1.30        passes by itself
  LOOSENED   budget zoo.draws: 1200 → 1500   reason given: "M2 materials"      waits for the owner
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

## 9. The camera: one free camera per view, rigs with state, a director (D84, D89)

A rig definition is data. The project tunes it:

```
wz 1
rig   uid=0x77c0a15e02d94b31  type=camera_follow  schema=1
distance       6.5      # meters behind the target
height         2.2
lag            0.18     # seconds
fov_deg        60
fov_speed_add  12       # at top speed
occlusion_hold 0.25     # seconds before the camera moves back out
```

A rig instance holds what must survive between frames, and a director blends the live rigs:

```c
eng_camera_rig_state chase;                              // damped angles, occlusion timers, recenter timer
eng_camera_rig_reset(&chase, chase_def, &inputs);        // also after a teleport or an origin shift

eng_camera_director_push(director, chase_def, &chase, /* priority */ 10, /* blend seconds */ 0.6f);

// every frame, per view:
eng_camera cam = eng_camera_director_eval(director, &inputs, dt);
//   1. each live rig → target-relative pose (yaw, pitch, distance, fov)
//   2. blend the poses by priority
//   3. collision and occlusion
//   4. shake, scaled by the player's setting; never fed back into rig state
```

`inputs` carries the target (position, velocity, local up, ground state), the shaped player input and the scene queries. A strategy game pushes a `camera_strategy` rig, a flight over the planet a `camera_orbit` rig. The renderer knows only `eng_camera`.

## 10. A change on top of a generated world (D40, D79, D80)

```
edit  layer=player   cell=7/8/12/-3  kind=place     uid=0x8c41d2e09a6f5b13  archetype=ref:0x2f0e…  at=(41.5, 12.0, 0.0)
edit  layer=destruct cell=7/8/12/-3  kind=state     uid=0x13aa90c4e7d1f620  state=fractured  impact=(3.2, 0.4, 1.1)  seed=0x51
```

A save holds lines like these and the simulation state, never geometry. The world is regenerated and the edits are applied on top.

## 11. A review page and a verdict (D86, D88)

```
$ wzctl review export --set m2_style --out runs/2026-11-20_01/review.html
exported 14 items, set m2_style#7c1e
$ wzctl review import verdicts_m2_style_7c1e.json
imported 13 verdicts: 10 approved, 2 changes requested, 1 rejected, 1 untriaged
refused 1: tex/asphalt_city was approved at hash c08d3e52, the current render is 5e21b0aa
```

```json
{"item":"tex/brick_red","hash":"9f2c11d0","verdict":"changes_requested","note":"mortar too bright","pin":[0.42,0.31,0.10,0.08],
 "actor":"owner","via":"page","identity":"listed_back","set":"m2_style#7c1e","at":"2026-11-20T18:04:11Z"}
{"item":"tex/plaster_warm","hash":"77e3a41b","verdict":"approved",
 "actor":"owner","via":"studio","identity":"local_session","set":"m2_style#7c1e","at":"2026-11-20T18:05:40Z"}
{"item":"tex/plaster_warm","hash":"d410c9fe","verdict":"approved","platform":"linux-vulkan","flip":0.012,
 "actor":"auto","rule":"within_flip_threshold","follows":"77e3a41b","at":"2026-11-20T18:09:02Z"}
```

A verdict belongs to the item and to the hash of the exact render, so an approval never carries over to a changed picture. `pin` is a rectangle on the image in normalised coordinates. `identity` says whether the transport proved who acted; `listed_back` means the verdict is shown to the owner again in the next report.

**Options for how the page reaches the owner** (all three use the same export and import):

| Option | For | Against |
|---|---|---|
| A. A file opened from disk | nothing leaves the machine | only on the machine that made it |
| **B. A Claude Artifact published by the agent (recommended for now)** | works on a phone and on the second machine, the agent reads the verdicts back | the renders leave the machine; the agent carries the verdicts, so they are listed back to the owner |
| C. Any static host | independent of one AI vendor | hosting to set up, verdicts come back as a file |
