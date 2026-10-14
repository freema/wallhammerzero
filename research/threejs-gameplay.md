# Gameplay systems for Three.js games (2025-2026)

*Research date: 2026-10-14. Status: proposal only.*

Scope: physics, character and vehicle control, the third-person camera, input, game feel, ECS,
state, save/load and settings, game audio, NPC and traffic AI, and GTA-like open-world systems on
the web. The last section maps all of it onto New Hope (`packages/new-hope-play`, three 0.180,
about 2.9k lines in 14 files), Wallhammer and PixelDen.

Legend: **[S]** sourced (link inline, full list in Sources), **[O]** my opinion, **[U]**
unverified. "Measured" means I downloaded the npm tarball into a scratch folder and measured it
on 2026-10-14 (`gzip -9`); nothing was installed.

What this builds on: [multiplatform.md](multiplatform.md) already covers float determinism
(V8 trig drift, the Bounce issue), gamepad quirks in WKWebView and the wrappers.
[audio-from-code.md](audio-from-code.md) covers the synth, AudioWorklet and iOS audio lifecycle.
[ref-threejs-punk.md](ref-threejs-punk.md) covers rendering and perf profiles. This report does
not repeat those; it only corrects them where they are out of date (see 1.1 and 8.3).

---

## 0. Summary

1. **New Hope does not need a physics engine yet [O].** Its world is a voxel cell grid
   (`blocksPoint`, `floorAt`), and grid queries beat a general broadphase for walking, flying
   and the camera. Add **Rapier** only when we want rigid-body debris, ragdolls or car-vs-car
   impulses. **Jolt** is the second choice: a smaller wasm, but manual memory management, which
   agent-written code will leak. **cannon-es** has been dead since 2022.
2. **The first fix is the loop, not a library [O].** `main.ts` runs variable `dt` clamped to
   0.05 s. Moving to a **fixed 60 Hz step with interpolation** makes `__nh.advance()` reproducible
   in step count, cuts per-step travel at top speed from 3.1 m to 1.03 m (tunnelling margin), and
   makes AI and police tuning frame-rate independent.
3. **Camera:** the current single ray sampled every 0.25 m, which snaps instantly, should become a
   **probe** (centre plus 4 near-plane corner rays, as camera-controls does) with **asymmetric
   smoothing**: fast pull-in, slow ease-out. Add speed-based FOV kick and look-ahead in the car.
4. **Input:** add an **action map** (actions, not key codes) with keyboard, gamepad and touch
   back ends, as Bruno Simon's folio-2025 does. Gamepad is cheap via the standard mapping. **None
   of the 55 PixelDen game folders reads a gamepad** (grep, 2026-10-14) [refuted 2026-10-14:
   `app/games/` has 55 directories, one of which is `shared`, so 54 game folders; the gamepad
   count of 0 is confirmed], which matters for the desktop and TV wrappers.
5. **Game feel:** trauma-squared shake (Bevy's constants: decay 0.5/s, exponent 2, max roll 10°),
   hit stop of 50-100 ms, FOV kick and rumble. Run them all from one `juice` event sink, with a
   settings toggle for shake.
6. **ECS: not now [O].** Plain classes plus typed arrays for the crowd and traffic. If one is
   needed later: **koota** (pmndrs, ISC, active), not miniplex (last release 2023-07) and not
   bitECS for copied code (MPL-2.0 file-level copyleft).
7. **Police and crowd AI:** use Reynolds steering (pursuit with prediction, separation so units
   fan out, arrive), **GTA-style line of sight and a search area** instead of the current
   "within 90 m = in sight", and grid A* or flow fields on citygen cells. recast-navigation-js
   (MIT, 131 KB gz wasm) is good but solves a problem a voxel grid already solves.
8. **Shipped references exist and some were built by Claude:** depixeled-chris/gta7 (MIT, built
   in one session, with a pure sim core, Vitest and Playwright) and mattias800/minigta (MIT code,
   ODbL data, with police that leave the car to arrest) are the closest analogues to New Hope's
   police and radar.

---

## 1. Physics

### 1.1 The options (registry data 2026-10-14)

| Engine | Latest (date) | Licence | Size (measured) | Character | Vehicle | Notes |
|---|---|---|---|---|---|---|
| **Rapier 3D** (`@dimforge/rapier3d`) | 0.21.0 (2026-09-25) | Apache-2.0 | wasm 3.08 MB raw / **1.17 MB gz**; `-simd` 1.15 MB gz; `-deterministic` 1.17 MB gz | `KinematicCharacterController` | `DynamicRayCastVehicleController` | `takeSnapshot`/`restoreSnapshot` exist in the typings |
| **Jolt** (`jolt-physics`) | 1.1.0 (2026-07-11) | MIT | wasm 2.02 MB raw / **0.74 MB gz**; multithread 0.71 MB gz | `CharacterVirtual` + `ExtendedUpdate` | `WheeledVehicleController`, `TrackedVehicleController`, `MotorcycleController` | Manual `Jolt.destroy`, ref counting |
| **cannon-es** | 0.20.0 (**2022-08-12**) | MIT | 346 KB JS / 75 KB gz | none (DIY) | `RaycastVehicle` | Unmaintained |
| **Bounce** (`@perplexdotgg/bounce`) | 1.10.0 (2026-08-10) | MIT (npm) | 807 KB unpacked, pure TS | reference controller in a separate repo | [U] | "Fast and deterministic", no wasm |
| Own grid/AABB | n/a | ours | 0 | already in `actors.ts` | already in `actors.ts` | Works because the world is cells |

Sources: npm registry [S]([npm](https://registry.npmjs.org/@dimforge/rapier3d)); the typings were
grepped in the downloaded tarballs [S]; Jolt features [S]([JoltPhysics.js](https://github.com/jrouwe/JoltPhysics.js),
[Jolt docs](https://jrouwe.github.io/JoltPhysics/index.html#character-controllers)); Bounce
[S]([codeberg](https://codeberg.org/perplexdotgg/bounce)).

**Correction to common knowledge: Rapier's JS repo moved.** `dimforge/rapier.js` was archived on
2026-07-12 and the bindings now live in the Rapier monorepo (`typescript/`, later `bindings/`,
PR #1016, 2026-09-24) [S]([rapier.js](https://github.com/dimforge/rapier.js/),
[PR 1016](https://github.com/dimforge/rapier/pull/1016)). The npm package names did not change,
and 0.21.0 shipped after the move. Agent sessions and tutorials that link to the old repo's
CHANGELOG see 0.19.3 (2025-11-05) as "latest". That is stale [S]([CHANGELOG](https://github.com/dimforge/rapier.js/blob/master/CHANGELOG.md)).

Rapier 2025 changes that matter to us [S](CHANGELOG):
- 0.15.0 (2025-03-06): package variants `-simd`, `-compat`, `-deterministic`. **Plain
  `rapier3d` is built without enhanced determinism.** It also added a `PidController` for
  velocity-based dynamic character controllers.
- 0.16-0.17 (2025-04/05): voxel colliders (`ColliderDesc.voxels`, `setVoxel`), later sparse
  storage (0.19.1). That is directly relevant to a citygen voxel city, but still marked
  experimental at introduction.
- 0.17.2: `RAPIER.reserveMemory`. 0.18.0: `World.timing*` profiling. 0.18-0.19: broadphase
  rework and contact-heavy performance gains (maintainers' claims; I found no independent
  benchmark [U]).

**Jolt in JS** [S](README): 7 build flavours (`wasm`, `wasm-compat` with base64-inlined wasm,
`asm`, multithreaded variants that need SharedArrayBuffer, and therefore COOP/COEP headers [O]).
"Nothing is cleaned up automatically": every `new Jolt.X` needs `Jolt.destroy`, and bodies need
`BodyInterface.DestroyBody`. `-DCROSS_PLATFORM_DETERMINISTIC=ON` is a build option, not the npm
default. Jolt recommends `CharacterVirtual` for players and the cheaper rigid `Character` for AI
[S](Jolt docs). [O] A smaller download than Rapier, but C++-style memory rules in code written by
an agent are a leak generator, and Rapier's JS API is GC-friendlier.

**cannon-es**: no release since 2022-08-12 [S](npm). [O] Don't start new work on it.

**Bounce** is the interesting newcomer for D18-style determinism: pure TypeScript, "fast and
deterministic", influenced by Jolt, Rapier and Box2D, MIT on npm [S](codeberg, npm). Its own
issue #8 is the one multiplatform.md cites (trig drift between V8 versions, fixed with its own
fdlibm port). [U] Maturity, feature coverage and performance against Rapier are unmeasured; worth
a spike if Wallhammer's sims ever need 3D physics inside the digest.

### 1.2 When our own collision is enough [O]

New Hope already does this: `blocksPoint(world, x, y, z)` against citygen cells, per-axis moves,
and a bounce factor of -0.35. For a world of axis-aligned cells that is the right call:
- The cost per query is a hash lookup, with no BVH to build and no wasm to download.
- It is exact for the geometry we have (cells, slabs, ramps).
- It keeps the city digest independent of a float physics engine.

What it lacks, and how to fix it without an engine:
1. **Swept tests.** Hover cars run at up to 62 m/s. With `dt ≤ 0.05` that is 3.1 m a frame
   against 4 m tiles, near the tunnelling edge. A fixed 60 Hz step (1.03 m) plus a voxel DDA
   (Amanatides-Woo traversal) for the car's leading points removes the risk.
2. **Car vs car and car vs cruiser.** Today cars pass through each other. Sphere-sphere or
   OBB-OBB pairs with a spatial hash (minigta uses "a spatial hash of building walls and posts,
   with circle resolution, ray casts, and line-of-sight checks" [S]([minigta](https://github.com/mattias800/minigta)))
   are enough for ramming and for cruisers boxing Kylo in.
3. **Debris, ragdolls, crates.** This is the point where Rapier pays for itself. Use it as a
   *cosmetic* layer (no gameplay outcome depends on it), fed with a coarse static collider set
   built from nearby cells, possibly as Rapier voxels.

### 1.3 Character controllers

- **Kinematic is the norm for players.** Rapier's KCC [S]([Rapier docs](https://rapier.rs/docs/user_guides/javascript/character_controller/))
  uses `createCharacterController(0.01)`, `setMaxSlopeClimbAngle(45°)`,
  `setMinSlopeSlideAngle(30°)`, `enableAutostep(0.5, 0.2, true)`, `enableSnapToGround(0.5)`,
  and `computeColliderMovement` followed by `computedMovement()`. Gravity is the caller's job, and
  the controller is translation-only. Jolt's `CharacterVirtual` adds moving platforms, wall
  sliding and stair stepping through `ExtendedUpdate` [S](Jolt docs).
- **Floating capsule (dynamic)**: pmndrs/ecctrl (MIT, pushed 2026-09-06) floats the character on
  a spring-damper above a ShapeCast hit and follows moving platforms [S]([ecctrl](https://github.com/pmndrs/ecctrl))
  [unconfirmed: licence and push date verified via the GitHub API; the mechanism was not re-read].
  It is R3F-bound, so ideas only for us [O].
- **New Hope today:** Kylo is a 0.32 m radius, 12-point probe walker with ramps from `floorAt`
  and lifts as a scripted ride. [O] Keep it. Add three things: **coyote time** (about 0.1 s
  of jump grace after leaving a ledge), **jump buffering** (a press up to about 0.1 s before
  landing still counts), and **snap-down** on ramp crests (the same idea as Rapier's
  `enableSnapToGround`). These are 20 lines, not a library.

### 1.4 Vehicles and hover models

- **Wheeled raycast vehicles**: folio-2025 (Bruno Simon, MIT) uses Rapier's
  `world.createVehicleController(body)` with per-wheel `setWheelSuspensionStiffness` (25),
  `Compression` (10), `Relaxation` (2.7), `SideFrictionStiffness` (3) and
  `engineForceAmplitude` 300, all exposed in a Tweakpane debug panel [S]([folio-2025 PhysicsVehicle.js](https://github.com/brunosimon/folio-2025)).
- **Hover vehicles** in engines and forums converge on one recipe [S]([Torque3D HoverVehicleData](https://reference.torque3d.org/scripting/class/classhovervehicledata/),
  [Phaser hovercar suspension](https://phaser.io/tutorials/box2d-tutorials/hovercar-suspension),
  [GameDev.net](https://gamedev.net/forums/topic/648789-how-to-solve-oscillating-spring/)):
  rays down from the front and back (or 4 corners), thrust = `k·(h₀ − h) − c·v_y` (a PD
  controller, because a spring alone keeps bouncing), force only when a ray hits, and capped
  thrust so the craft falls over ledges.
- **New Hope's model** (`actors.ts`, `Hovercar.update`) is an arcade model: thrust and lift
  axes, exponential lateral grip (`exp(-3.2·dt)`), drag, a 62 m/s cap, a hard floor clamp at
  +0.35 m and visual-only bank and bob. [O] It is the right genre choice (GTA cars are arcade
  too). Two upgrades would make it feel like a hover car rather than a flying box:
  1. Replace the hard clamp `pos.y = floor + 0.35` with a **PD hover spring** on two probe
     points (nose and tail) toward a ride height of about 0.6-1.0 m. Pitch then follows ramps
     and roofs, landings compress, and the clamp stays only as a safety floor.
  2. Make bank and pitch come from **lateral and longitudinal acceleration** (the
     voxel-musou idea, see ref-voxel-musou.md section "Flying mounts"), not from `yawRate`
     and `vel.y`. Braking then dips the nose and carving rolls the body.

---

## 2. The loop: fixed timestep

The canonical pattern [S]([Gaffer On Games, 2004](https://gafferongames.com/post/fix_your_timestep/)):
accumulate frame time, clamp it (Gaffer uses 0.25 s), step the simulation in fixed `dt`
increments, and render `lerp(previous, current, accumulator/dt)`. recast-navigation's crowd
exposes the same choice: `crowd.update(dt, timeSinceLastFrame, maxSubSteps)` with
`agent.interpolatedPosition` [S]([recast-navigation-js](https://github.com/isaac-mason/recast-navigation-js)).
folio-2025, by contrast, uses a clamped variable delta (`maxDelta = 1/30`) [S](Ticker.js).

[O] For New Hope: `SIM_HZ = 60`, at most 4 substeps per frame, interpolate only the
`Object3D` transforms (Kylo, the driven car, cruisers), and leave the instanced traffic on
variable `dt` (it is cosmetic). `__nh.advance(seconds)` then becomes "run N fixed steps", which is
exactly what a scripted check wants.

---

## 3. Third-person camera

### 3.1 Patterns

- **Spring arm** (Unreal's term): a boom from a pivot at the target, a collision probe of radius
  r along it, the camera placed at the first hit minus r, plus separate position and rotation
  lag. [U] I could not fetch the property defaults from Epic's page; the concept is standard.
- **camera-controls** (yomotsu, MIT, 3.1.2 released 2025-11-17, peer `three >=0.126.1`, repo
  active 2026-10-12): `colliderMeshes` collision casts **4 rays from the near-plane corners**;
  `smoothTime` 0.25 s, `draggingSmoothTime` 0.125 s, and `setLookAt(..., true)` for animated
  transitions. It warns that colliders "may decrease performance" [S]([camera-controls](https://github.com/yomotsu/camera-controls)).
  folio-2025 uses it [S](package.json). [O] For us it is a reference, not a dependency: it
  raycasts meshes, while we can query the cell grid far more cheaply.
- **Trauma shake** goes on top of the final pose, rotation-first in 3D (section 5).
- **Cinematic moments** (arrest, job complete, body-pass): a scripted rail of `setLookAt`
  transitions with ease curves, with input locked [O].

### 3.2 New Hope today and what to change [O]

`placeCamera()` in `main.ts` samples `blocksPoint` every 0.25 m from the target to the
desired position and puts the camera at `(i − 2)/steps`, with no smoothing. Consequences:
- **Pops** every time a pillar crosses the ray, because the distance changes in one frame.
- **Near-plane clipping** at corners, because a single centre ray can't see the frustum edges.
- No look-ahead in the car, so at 60 m/s the car sits in the middle of the screen and the
  player sees little of what is ahead.

The fix (about 40 lines, no dependency):
1. Probe 5 rays: the centre and the 4 near-plane corners, as camera-controls does. Take the
   minimum free distance.
2. **Asymmetric smoothing:** `dist = hit < dist ? hit : damp(dist, wanted, 4/s)`. Snap inward
   immediately (never show the inside of a wall) and ease outward over about 0.3-0.5 s.
3. Car mode: offset the target by `vel · 0.25 s` (look-ahead), pitch down a little with
   altitude, and **FOV kick** from 62° to about 72° with speed (lerped, `updateProjectionMatrix`
   only when the change exceeds 0.1°).
4. Keep the existing auto-recentre (`input.idle > 1.2`), which is already a good GTA touch.

---

## 4. Input

### 4.1 Platform APIs (current MDN)

- **Pointer lock** [S]([MDN requestPointerLock](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestPointerLock)):
  `requestPointerLock({ unadjustedMovement: true })` gives raw mouse input without OS
  acceleration. It needs transient activation, and **it fails if called right after the user
  left lock with Esc**. If you also go fullscreen, request the lock first. A promise return is
  not yet universal, so listen for `pointerlockchange` and `pointerlockerror`. Limited
  availability, so feature-detect the option and fall back.
- **Gamepad** [S]([MDN Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API)):
  poll `navigator.getGamepads()` every frame and don't keep references. Use `mapping ===
  "standard"` indices: buttons 0-3 are the face buttons, 4/5 the bumpers, 6/7 the analog
  triggers (`.value`), 8/9 select/start, 12-15 the d-pad; axes 0/1 the left stick, 2/3 the right.
  Firefox exposes pads only after the user interacts with one [unconfirmed: the MDN gamepad
  page was not re-fetched]. Apply a radial deadzone (about 0.15) [O].
- **Rumble** [S]([MDN playEffect](https://developer.mozilla.org/en-US/docs/Web/API/GamepadHapticActuator/playEffect)):
  `gp.vibrationActuator.playEffect("dual-rumble", { duration, strongMagnitude,
  weakMagnitude })`. `"trigger-rumble"` adds `leftTrigger`/`rightTrigger`. A new effect preempts
  the old one, and it throws `InvalidStateError` when the document is hidden. Limited
  availability.
- WKWebView gamepad quirks (first-responder only) are in multiplatform.md and not repeated here.

### 4.2 Touch

- **nipplejs** 1.0.4 (2026-05-26, MIT): `dynamic` mode (a stick appears where the thumb lands;
  multitouch possible), `semi`, and `static`. The `move` event gives `vector`, `force` and
  `angle`; `threshold` defaults to 0.1 [S]([nipplejs](https://github.com/yoannmoinet/nipplejs)).
  folio-2025 wraps it as `Inputs/Nipple.js` [S]. [refuted 2026-10-14: folio-2025 does not
  depend on nipplejs (not in its `package.json`); its `sources/Game/Inputs/Nipple.js` is an
  own implementation drawn with three/TSL and gsap. The `dynamic`/`semi`/`static` modes and
  event fields above are nipplejs's own README and were not re-checked: [unconfirmed]]
- PixelDen already has its own `app/games/shared/touch-controls.ts` [S](local repo). [O] Prefer
  growing that into the shared touch layer over adding a dependency.
- Twin-stick on a phone for a 3D third-person game is the standard compromise: left stick
  to move, right half of the screen as a drag-look pad, plus 3-4 context buttons (enter car,
  jump/up, pass, boost) [O].

### 4.3 The action map (the part to build)

folio-2025's `Inputs` class is the cleanest reference I found [S]([Inputs.js](https://github.com/brunosimon/folio-2025)):
three modes (`MODE_MOUSEKEYBOARD`, `MODE_GAMEPAD`, `MODE_TOUCH`), every device emits
`start("Keyboard.KeyW")` / `start("Gamepad.<name>", value)`, actions are bound to lists of
those names, the active mode switches on the last device used, and the mode is mirrored as a
CSS class on `<html>` so the HUD can show the right glyphs. Code MIT; ideas only by choice [O].

[O] For New Hope, `input.ts` is 54 lines of raw key codes read directly by `actors.ts`
(`input.down("KeyW")`). Replace it with
`actions.value("move.forward")` / `actions.pressed("vehicle.enter")` and a data table
`{ action: ["Keyboard.KeyW", "Gamepad.axis1-", "Touch.left.y-"] }`. Rebinding (a settings page)
then becomes table edits, and `__nh.key(code)` becomes `__nh.act(action, value)`, which keeps
test scripts readable when bindings change.

---

## 5. Game feel ("juice")

| Effect | Recipe | Numbers |
|---|---|---|
| **Trauma shake** | `shake = trauma²`, offsets = noise(t·speed + k)·shake·max, trauma decays linearly | Bevy example: decay 0.5/s (full shake lasts 2 s), exponent 2, max roll 10°, max offset 20 px, noise speed 20, +0.4 trauma per hit [S]([Bevy](https://bevy.org/examples/camera/2d-screen-shake/)); from Eiserloh, GDC 2016 [S]([Game Developer](https://gamedeveloper.com/programming/video-sprucing-up-cameras-with-math)) |
| **3D shake** | rotate the camera (yaw, pitch, roll) rather than translate it; translation in 3D reads as movement and clips walls | advice attributed to the same talk [S]([Godot forum](https://forum.godotengine.org/t/how-to-use-perlin-noise-for-smooth-camera-shake/26455)); [O] max about 2-3° yaw/pitch, 4° roll |
| **Hit stop** | freeze the sim (not the render or UI) for a few frames on a heavy hit | 50-100 ms; shorter goes unnoticed, longer reads as lag [S]([eastondev 2026-05](https://eastondev.com/blog/en/posts/dev/20260521-game-feedback-feel/), [Wayline](https://www.wayline.io/learn/game-feel/1)) [unconfirmed: neither source re-fetched] |
| **FOV kick** | widen the FOV with speed or boost; snap wider on boost, ease back | [O] +8-12° at top speed, +4° extra burst on boost |
| **Rumble** | pair it with shake: `strongMagnitude = trauma` | MDN API above |
| **Time dilation** | slow-mo on body-passing or a near-miss | [O] 0.3× for 0.4 s, audio pitch follows |

Rules [O]:
- Juice is driven by **events** (`crash(impact)`, `busted`, `jobDone`, `pass`), never inline
  in physics code. One `Juice` module owns shake, hit stop, FOV, flash and rumble. New Hope
  already has the seeds (`flash`, `crash()` with impact), so this is a refactor, not new work.
- A **settings toggle and a 0-100 % slider for shake**. Big shake nauseates [S](search summary
  of game-feel sources), and it is a standard accessibility option.
- Hit stop must be implemented in the fixed-step loop (skip N sim steps), which is another
  reason to do section 2 first.

---

## 6. Architecture: ECS or classes, state, save, settings

### 6.1 ECS options (registry data 2026-10-14)

| Library | Latest (date) | Licence | Shape | Fit |
|---|---|---|---|---|
| **koota** (pmndrs) | 0.6.6 (2026-04-09) | ISC | Traits: schema traits are SoA, callback traits AoS ("best used for compatibility with third party libraries like Three"); queries with `updateEach`, `Added`/`Removed`/`Changed`; relations; actions; React hooks optional [S]([koota](https://github.com/pmndrs/koota)) | Best TS ergonomics; active |
| **bitECS** | 0.4.0 (2025-12-06) | **MPL-2.0** | Functional, `query(world, [A, B])`, plain or typed-array stores, relations, serialization, about 5 kB [S]([bitECS](https://github.com/NateTheGreatt/bitECS)) | Fastest raw iteration; copying or modifying its files triggers file-level copyleft |
| **miniplex** | 2.0.0 (**2023-07-16**) | MIT | Object entities, archetype buckets | Stale |
| **becsy** | 0.16.1 (2026-10-02) | MIT | Multithreaded, scheduled systems [S]([becsy](https://github.com/lastolivegames/becsy)) | Niche; threads need COOP/COEP |

**When does an ECS pay off?** The ECS FAQ lists more objects, easier extension, and composition
over inheritance, but also the learning curve, glue code to engine types, and weakness for
"specialized data structures" [S]([ECS FAQ](https://github.com/SanderMertens/ecs-faq)).
Threejs-Punk, sakura-crossing, gta7 and folio-2025 all ship without one (see the ref reports
and [S] above).

[O] Thresholds I would use for an agent-written game:
- **Not worth it** below about 10 entity kinds or while one person (or agent) holds the whole
  design in view. New Hope has Walker, Hovercar, a police Unit, Flyer (instanced), crowd
  Person, Job and Beacon. The big counts (320 flyers, the crowd) are already instanced arrays.
- **Worth it** when (a) many kinds share behaviour combinatorially (damageable + drivable +
  ownable + wanted-visible), (b) **save/load must serialize the whole world generically**, or
  (c) the studio wants an entity inspector. An ECS gives all three cheaply.
- If New Hope crosses that line, **koota** fits best (TS, SoA for hot data, AoS traits holding
  `Object3D`s). Keep render objects out of the "truth" traits so a Godot player stays possible.

### 6.2 State machines

Nystrom's guidance still holds [S]([Game Programming Patterns: State](https://gameprogrammingpatterns.com/state.html)):
enum + switch for small machines, enter/exit actions, **concurrent machines** instead of
n × m states, hierarchical states, and a **pushdown automaton** for temporary states. State
machines are too weak for complex AI; use behaviour trees or planners there.

[O] Concretely for New Hope:
- **Game mode stack** (pushdown): `play → pause`, `play → cutscene(busted) → play`,
  `play → map`, `play → settings`. Each mode owns input routing and the sim/time scale.
- **Kylo**: `onFoot | inLift | driving | passing` (today implicit in `driving != null` and
  `ride != null`).
- **Police unit**: `patrol → respond → pursue → search → return`, plus a concurrent "sees
  Kylo" flag. This is a small FSM; no behaviour tree is needed at this size.
- **Missions**: data, not code. A list of steps (`goto`, `pickup`, `deliver`, `evade(stars)`,
  `timer`) with a tiny interpreter. XState 5.33 (MIT, 2026-09-15) works but costs 2.3 MB
  unpacked and is overkill for linear jobs [S](npm), [O].

### 6.3 Save/load and settings

Browser limits [S]([MDN storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)):
`localStorage` is 5 MiB per origin and throws `QuotaExceededError`. IndexedDB allows up to 60 %
of disk in Chromium and Safari (15 % for embedded web content) and 10 % or 10 GiB best-effort in
Firefox. **Safari deletes script-written storage for an origin with no user interaction in 7
days of browser use** [refuted 2026-10-14, qualifier missing: MDN says this applies only when
cross-site tracking prevention is turned on, and server-set cookies are exempt]. `navigator.storage.persist()` asks for exemption (a prompt in Firefox,
heuristic elsewhere).

[O] Recommendation:
- **Save = versioned JSON**: `{ v, generator: { citygen version, seed }, kylo: { body, pos,
  psi, credits }, heat, jobs: { done, active }, ownedCars, time }`. Pin the generator version
  (ref-nms-procgen.md: a changed generator changes every world). The digest of the city doesn't
  belong in the save; the seed and version do.
- Small saves (a few KB) go to `localStorage` behind one wrapper. Move to IndexedDB via
  `idb-keyval` (6.3.0, 2026-07-08, **Apache-2.0**, 56 KB unpacked [S](npm)) only when saves grow.
- In wrappers (Electron, Capacitor) the same wrapper writes to a file or native storage, which
  sidesteps Safari eviction. That ties into multiplatform.md.
- **Settings** get a separate key: volume buses, shake %, FOV, invert-Y, mouse sensitivity,
  bindings, quality preset. PixelDen already has `shared/cloud-progress.ts` and `stats.ts`
  [S](local), so the portal pattern exists to copy.

---

## 7. Audio for games

New Hope already synthesizes everything with WebAudio (`audio.ts`: drone, pad, wind, rain,
engine, siren, cues). The synth and iOS lifecycle are covered in audio-from-code.md. New here:

- **three's `PositionalAudio` uses HRTF by default.** In r180 the constructor sets
  `panner.panningModel = 'HRTF'` (source line 59), and `AudioListener` ramps its position with
  `linearRampToValueAtTime` over the frame delta [S]([PositionalAudio.js r180](https://github.com/mrdoob/three.js/blob/r180/src/audio/PositionalAudio.js),
  [docs](https://threejs.org/docs/pages/PositionalAudio.html)). HRTF "uses significant memory
  … and requires a fair amount of processing", while equal-power is "much less intensive"
  (Chromium review, 2014) [S]([Chromium CR](https://codereview.chromium.org/652073003)).
  [O] Use HRTF for 1-3 important sources (the siren of the nearest cruiser, Kylo's own car)
  and `equalpower` for everything else. Distance models: `'inverse'` with `refDistance` about
  10 m for cars, `'linear'` with `maxDistance` for ambience zones.
- **Voice budget** [O]: cap at about 24-32 concurrent voices. Steal by priority × loudness. Six
  cruisers each with their own siren is the worst case: play the **2 nearest** sirens
  positionally and fold the rest into one non-positional "distant sirens" bed whose gain
  follows the star count.
- **Listener placement** [O]: on the camera, as three does by default, but for a third-person
  game mix part of the player position in (a listener between camera and player), so that a
  zoomed-out camera doesn't make Kylo's own car quiet.
- **Doppler**: [U] `PannerNode` Doppler was removed from the Web Audio spec. Fake it with
  `playbackRate` or oscillator detune from the closing speed. That is cheap and works for the
  synth engine and siren.
- **Buses**: master → {music, sfx, ambience, ui} gain nodes, plus a compressor on master. The
  settings sliders map to the bus gains. A duck on music when the wanted level rises is the GTA
  convention [O].
- **Howler** 2.2.4 (last release **2023-09-19**, MIT) [S](npm) is still used by folio-2025
  [S], but it adds nothing to a synth-everything game. Don't use it [O]. **ZzFX** 1.4.0
  (2026-10-01, MIT) is fine for one-shot SFX parameters, as audio-from-code.md proposed.
- Spatial audio guide (2026-07) suggests reusing PannerNodes across sources [S]([Abratabia](https://www.abratabia.com/web-game-audio/spatial-audio-games.php))
  [unconfirmed: not fetched], but a panner has one position, so this only works for co-located sources [O].

---

## 8. AI: police, traffic, crowd

### 8.1 Steering (Reynolds)

The 1999 GDC paper's set [S]([red3d](https://www.red3d.com/cwr/steer/)): seek/flee,
**pursue/evade** (aim at the target's predicted position assuming constant velocity, with the
prediction time capped), wander, **arrival** (slow inside a radius), obstacle avoidance,
containment, path and flow-field following, leader following, **unaligned collision avoidance**,
queuing, flocking (separation, alignment, cohesion).

gta7's police are "steering-behavior AI" that **lead or intercept** rather than chase, **fan out
instead of stacking**, and steer around buildings [S]([gta7](https://github.com/depixeled-chris/gta7)).

[O] New Hope's `police.ts` today: each unit lerps velocity toward a point orbiting 5 m around
Kylo (`sin(u.t·0.7)`), climbs when the look-ahead point is blocked, and spawns at 160 m with
`Math.random` angles. Upgrade path:
1. **Pursuit with prediction**: `aim = target + targetVel · clamp(dist / unitSpeed, 0, 2 s)`.
2. **Separation** between units (inverse-distance push within about 12 m), plus **offset
   pursuit** slots (left, right, above, ahead) so 4-6 cruisers box Kylo in instead of
   piling up.
3. **Obstacle avoidance** with 3 feelers (ahead, ahead-left, ahead-right) on `blocksPoint`,
   steering sideways first and climbing second. Climbing only is what makes them look dumb
   under overhangs.
4. Seeded RNG (`hash3` already exists in `world.ts`) instead of `Math.random`, so a scripted
   check sees the same chase.

### 8.2 Navigation

- **recast-navigation-js** (MIT, 0.43.1, 2026-04-07; wasm measured at **339 KB raw / 131 KB
  gz**): `generateSoloNavMesh` / `generateTiledNavMesh` from flat positions and indices, and a
  `TileCache` with box and cylinder obstacles (64-request queue, tile size 32-64). The `Crowd`
  takes `maxAgents` and `maxAgentRadius`. Agent defaults: radius 0.5, height 1, maxAcceleration
  20, maxSpeed 6, collisionQueryRange 2.5, separationWeight 0. Fixed-step update with
  interpolation is supported (verified 2026-10-14: `update(dt, timeSinceLastCalled?, maxSubSteps = 10)`;
  `interpolatedPosition` is refreshed only when the second argument is passed). No built-in worker, but navmesh data can be built in one and
  passed as a `Uint8Array` [S]([README](https://github.com/isaac-mason/recast-navigation-js),
  [crowd.ts](https://github.com/isaac-mason/recast-navigation-js/blob/main/packages/recast-navigation-core/src/crowd.ts)).
- **Yuka** (steering, FSM, navmesh, MIT) has had no release since **2022-09-17** [S](npm). Fine
  to read, risky to depend on [O].
- **three-pathfinding** 1.3.0 (2024-05, MIT) [S](npm) is simple navmesh A* only.
- [O] **For a citygen voxel city, use the grid.** Walkable cells (street, deck, walkway, pad,
  stairs, lift links) are already a graph. A* on cells for individual agents, and a **flow
  field** (one Dijkstra from a goal, all agents follow the gradient) for crowds fleeing a crash
  or converging on an event, cost about a millisecond on 48 × 48 × 20 = 46k cells [U, estimate].
  Recast would rebuild what citygen already knows, and needs a mesh export of every district.
  Revisit recast if New Hope gets free-form (non-cell) geometry.

### 8.3 Traffic and crowds [O]

- New Hope's flyers are **tracks + parametric t**, instanced (320 by default). That is the
  cheapest possible traffic and the right base. Missing are reactions: (a) **brake on obstacle
  ahead** (a 1D gap check along the track against Kylo and the cruisers), (b) **swerve and
  honk** when Kylo cuts in, (c) a "panic" lane change during a chase. gta7's traffic "slow and
  stop when you stand in the road" [S], and minigta's traffic uses "the same `Vehicle` class and
  vehicle controls as the player, driven by intent fields" [S] [refuted 2026-10-14, overstated:
  minigta's README says AI "brains" in general drive the same `Character`/`Vehicle` classes as
  the player via intent fields; it does not say this of traffic specifically]. That unification makes a
  stolen car and a traffic car behave alike, but costs per-car simulation. [O] Keep instanced
  tracks for far traffic and **promote** the nearest 8-16 flyers to full `Hovercar` objects (a
  LOD for simulation, not just for meshes).
- The crowd uses the same idea: an instanced or cheap far crowd, and a few dozen near "smart"
  pedestrians with flee/panic, separation and grid A*.

---

## 9. Open-world GTA-like systems on the web

### 9.1 Shipped and open examples (2026)

| Project | Date | Licence | What is worth reading |
|---|---|---|---|
| [depixeled-chris/gta7](https://github.com/depixeled-chris/gta7) | 2026-05-30 → 06-01 | MIT | **Built by Claude in one session**, with a `CLAUDE.md` (verified 2026-10-14: the README says "a single session, because a Reddit thread dared a new model to", thread titled "Let's check Opus 4.8"; commits list `claude` as co-author). Pure sim core separate from Three.js, Vitest for the core and Playwright for render/gameplay. Heat to 1-5 stars, +1 cop per star, intercepting and fanning-out police, synthesized engine with fake gearbox, touch joystick, radar [S] |
| [mattias800/minigta](https://github.com/mattias800/minigta) | 2026-09-28 | MIT code; `public/data` ODbL | Officers **leave cars to arrest at low stars and shoot at high stars**. Lose them by breaking line of sight for long enough. WASTED → hospital, BUSTED → police station. Spatial-hash collision, A* on the road graph, 250 m chunks, procedural radio. Folders `world/ ai/ game/ audio/ ui/` [S] |
| [donmutti/gta](https://github.com/donmutti/gta) | 2026-09/10 | **none** (all rights reserved) | Pursuit ends when you stay within 22 m of a cop below 15 km/h for 8 s [S, search summary]. **Ideas only, no code** |
| [aniruddhaadak80/neon-haven](https://github.com/aniruddhaadak80/neon-haven) | 2026-10 | MIT | 5-star wanted, minimap and an M fullscreen map, Kenney CC0 assets [S] |
| [brunosimon/folio-2025](https://github.com/brunosimon/folio-2025) | 2025-2026 | MIT (assets unclear) [verified 2026-10-14: `license.md` is MIT, but `package.json` says `"license": "ISC"`; the LICENSE file governs] | Rapier 0.17.3 vehicle, camera-controls, Howler, Inputs with keyboard, gamepad, pointer and its own nipple (not nipplejs), a staged loop (`Inputs → PhysicalVehicle:pre → Physics → post → View → Audio`) [S] |

[O] The pattern across these: GTA-likes on the web are now a **routine single-session Claude
output** (gta7 and probably the other 2026 repos). New Hope's edge is not having police and a
minimap, which everyone has. It is the **generated vertical city, flight, body-passing and the
studio loop**. Spend effort there and keep the GTA systems conventional.

### 9.2 The wanted system, done properly

What GTA V does, per Wikipedia: crimes raise stars, officers **search when you leave the wanted
vicinity**, and the meter "enters a cool-down mode and eventually recedes when players are
hidden from the officers' line of sight" [S]([Wikipedia](https://en.wikipedia.org/wiki/Grand_Theft_Auto_V)).
[U] The fandom wiki with per-star numbers returned HTTP 402, so per-star radii and timings are
not sourced here.

[O] Proposed New Hope model (replaces `inSight = d < 90`):
- **Perception**: a unit sees Kylo if `dist < R(stars)` **and** a voxel DDA from the unit to Kylo
  hits no blocking cell **and** Kylo is inside a 120° cone (or within 15 m, any angle). Guards
  on foot use the same test (it already matters for body-passing).
- **Last known position (LKP)**: on losing sight, the units fly to the LKP, then **search** in a
  circle of radius `S(stars)` around it. The HUD shows **flashing stars** in search mode. The
  cool-down timer (today a star every 10 s) only runs while no unit sees Kylo **and** Kylo is
  outside the search circle. This gives the "break line of sight, leave the area" loop. Lifts,
  interiors and the dense lower bands become natural hiding places.
- **Escalation table** as data: stars → {units, speed, spawn distance, behaviour}. For example
  1★: 1 unit, no lethal force, arrest on contact; 3★: 4 units, ramming, roadblock drones on
  lanes; 5★: interceptors plus a gunship on the sky band. Body-passing (−2★, or +1★ when seen)
  plugs into the perception test unchanged.
- **Arrest** stays as it is (3 s grip below 10 m/s), plus minigta's split: low stars, officers
  step out onto a deck; high stars, they disable the car.

### 9.3 Minimap and missions [O]

- New Hope's radar is a 2D canvas that rotates with the camera. That is the standard and
  cheapest approach. Add: (a) a **pre-rendered district map** (citygen cells → one canvas
  bitmap per vertical band, built once), (b) **band indicators** (target above or below,
  ▲/▼, which is crucial in a vertical city and which flat GTA maps never needed), (c) an
  M-key fullscreen map that reuses the same bitmap.
- Missions and jobs: keep `jobs.ts` fares, and move job definitions into data under
  `games/new-hope/` (the D-rule that games are pure data). Each step type is a small FSM node.
  Rewards and heat changes are data fields. This is also what lets the studio show "the game's
  jobs" as a list.

---

## 10. What this means for us

### New Hope (in priority order, each one tick-sized) [O]

1. **Fixed 60 Hz step + interpolation** in `main.ts`; `__nh.advance` counts steps. Unblocks
   hit stop, reproducible chases and swept collision.
2. **Camera probe + asymmetric smoothing + car look-ahead + FOV kick** (`placeCamera`).
3. **Action map** replacing raw codes in `input.ts`, with gamepad (standard mapping, deadzone,
   rumble on crash and arrest) and a touch layer. `__nh.act()` for scripts.
4. **Police v2**: perception (DDA line of sight + cone), last known position and search,
   flashing stars, an escalation table as data, pursuit with prediction, separation and
   offset slots, feelers, seeded RNG.
5. **Juice module**: trauma shake (rotation), hit stop on heavy crashes, FOV burst on boost,
   time dilation on passing; a shake slider in settings.
6. **Hover spring** (PD on nose and tail probes) and acceleration-driven bank and pitch for the
   car; car-vs-car sphere collisions with a spatial hash.
7. **Audio voice budget**: 2 positional sirens and a distant-siren bed, HRTF only for the
   nearest, music duck on heat.
8. **Traffic and crowd LOD promotion**: the nearest flyers and pedestrians become simulated
   agents; grid A* and a flow field for panic.
9. **Save/settings v1**: versioned JSON with the generator pin.
10. Only after these: decide on **Rapier** for cosmetic debris and wrecks (+1.17 MB gz wasm),
    and on **koota** if the entity kinds multiply.

### Wallhammer (engine and studio) [O]

- Our deterministic sims (`packages/sim`, D18) cannot use Rapier or Jolt inside the digest
  unless we pin the `-deterministic` build and accept wasm in the sim. For 2D Kairosoft sims,
  own integer collision stays the answer. **Bounce** is the one to spike if 3D physics ever has
  to be inside a digest.
- The studio could show a **feel panel**: the live tuning constants (hover gains, grip, shake),
  as folio-2025 does with Tweakpane, written back as data so verdicts can cover "feel" too.
- A shared **action-map + juice + save** kit is engine-level, not New Hope-level. It belongs
  next to `packages/runtime` once a second game needs it.

### PixelDen (Phaser 4) [O, with the local facts as S]

- **Gamepad: 0 of 55 game folders** reference it (grep of `app/games`, 2026-10-14). For
  desktop (Electron/Steam) and TV, an action-map layer in `app/games/shared/` (keyboard +
  pad + the existing `touch-controls.ts`) is the single biggest portability win, and the
  `/game-upgrade` command could add it game by game.
- **Juice is ad hoc**: 43 source files call `shake(`, and 5 files use hit stop or `timeScale`
  (grep). A shared `juice.ts` (trauma shake with Bevy's constants, hit stop, flash, rumble)
  would make the feel consistent and tunable from one place.
- Save is already centralized (`shared/cloud-progress.ts`). Add a `v` field and a migration
  step if it lacks them [U: not checked] [refuted 2026-10-14: `cloud-progress.ts` already has
  `version: 1` on its payload types and checks `v.version === 1` on read; no migration step for
  other versions exists].
- Phaser has its own Arcade/Matter physics, so the physics section doesn't apply. Steering,
  FSM and mission-as-data apply unchanged.

---

## Open questions (for the owner)

1. Is New Hope allowed a **wasm physics dependency** (Rapier, +1.17 MB gz) for cosmetic debris,
   or do we stay on our own grid collision for now?
2. **Gamepad and touch for New Hope now**, or keyboard and mouse only until the first wrapper
   build?
3. Police design: should high stars bring **lethal force** (minigta-style shooting), or does
   New Hope keep the non-lethal arrest and body-passing core?
4. Should **missions/jobs move to data** under `games/new-hope/` now (studio-visible), or stay in
   `jobs.ts` until the game loop settles?
5. Should PixelDen get a shared gamepad and juice layer via `/game-upgrade`, and should it be a
   separate task queue there?

---

## Sources

All accessed 2026-10-14. Dates are publication or release dates where known.

Physics
- npm registry metadata for `@dimforge/rapier3d(-compat|-simd|-deterministic)`, `jolt-physics`, `cannon-es`, `@perplexdotgg/bounce`, `bitecs`, `koota`, `miniplex`, `@lastolivegames/becsy`, `recast-navigation`, `@recast-navigation/core`, `@recast-navigation/wasm`, `yuka`, `three-pathfinding`, `howler`, `zzfx`, `tone`, `xstate`, `idb-keyval`, `nipplejs`, `camera-controls`, `three-mesh-bvh`, `postprocessing`, `@react-three/rapier`: https://registry.npmjs.org/ (queried 2026-10-14; tarballs measured locally)
- Rapier.js CHANGELOG (entries 2025-03 to 2025-11; repo archived 2026-07-12): https://github.com/dimforge/rapier.js/blob/master/CHANGELOG.md
- rapier.js repo (migration notice): https://github.com/dimforge/rapier.js/
- Rapier PR #1016, bindings reorganization (2026-09-24): https://github.com/dimforge/rapier/pull/1016
- Rapier JS character controller guide (0.21): https://rapier.rs/docs/user_guides/javascript/character_controller/
- JoltPhysics.js README (npm 1.1.0, 2026-07-11): https://github.com/jrouwe/JoltPhysics.js
- Jolt Physics docs, character controllers: https://jrouwe.github.io/JoltPhysics/index.html#character-controllers
- Bounce (v1.10.0, 2026-08-10): https://codeberg.org/perplexdotgg/bounce
- pmndrs/ecctrl (pushed 2026-09-06): https://github.com/pmndrs/ecctrl
- three-mesh-bvh (0.9.16, 2026-10-08): https://github.com/gkjohnson/three-mesh-bvh
- Torque3D HoverVehicleData: https://reference.torque3d.org/scripting/class/classhovervehicledata/
- Phaser Box2D tutorial, hovercar suspension: https://phaser.io/tutorials/box2d-tutorials/hovercar-suspension
- GameDev.net, oscillating hover spring: https://gamedev.net/forums/topic/648789-how-to-solve-oscillating-spring/

Loop, camera, input, feel
- Glenn Fiedler, Fix Your Timestep (2004): https://gafferongames.com/post/fix_your_timestep/
- yomotsu/camera-controls (3.1.2, 2025-11-17): https://github.com/yomotsu/camera-controls
- Unreal Engine, Spring Arm components (concept only; details not retrieved): https://dev.epicgames.com/documentation/en-us/unreal-engine/using-spring-arm-components-in-unreal-engine
- MDN, Using the Gamepad API (live doc): https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API
- MDN, GamepadHapticActuator.playEffect (live doc): https://developer.mozilla.org/en-US/docs/Web/API/GamepadHapticActuator/playEffect
- MDN, Element.requestPointerLock (live doc): https://developer.mozilla.org/en-US/docs/Web/API/Element/requestPointerLock
- nipplejs (1.0.4, 2026-05-26): https://github.com/yoannmoinet/nipplejs
- Bevy example, 2D screen shake (current): https://bevy.org/examples/camera/2d-screen-shake/
- Game Developer, Eiserloh, "Juicing your cameras with math" (GDC 2016): https://gamedeveloper.com/programming/video-sprucing-up-cameras-with-math
- Godot forum, Perlin camera shake: https://forum.godotengine.org/t/how-to-use-perlin-noise-for-smooth-camera-shake/26455
- eastondev, Where does game feel come from (2026-05-21): https://eastondev.com/blog/en/posts/dev/20260521-game-feedback-feel/
- Wayline, Game Feel & Juice lesson 2: https://www.wayline.io/learn/game-feel/1

Architecture
- pmndrs/koota (0.6.6, 2026-04-09): https://github.com/pmndrs/koota
- bitECS (0.4.0, 2025-12-06): https://github.com/NateTheGreatt/bitECS
- becsy (0.16.1, 2026-10-02): https://github.com/lastolivegames/becsy
- miniplex: https://github.com/jure/miniplex [refuted 2026-10-14: that is a fork (created
  2023-07-08); the canonical repo is https://github.com/hmans/miniplex (pushed 2026-04-05). The
  npm "last release 2023-07-16" claim stands.]
- Sander Mertens, ECS FAQ: https://github.com/SanderMertens/ecs-faq
- Robert Nystrom, Game Programming Patterns: State (2014): https://gameprogrammingpatterns.com/state.html
- MDN, Storage quotas and eviction criteria (live doc): https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria

Audio
- three.js PositionalAudio docs: https://threejs.org/docs/pages/PositionalAudio.html
- three.js r180 `src/audio/PositionalAudio.js`, `AudioListener.js`: https://github.com/mrdoob/three.js/blob/r180/src/audio/PositionalAudio.js
- Chromium code review 652073003, HRTF vs equal-power default (2014): https://codereview.chromium.org/652073003
- Abratabia, Spatial audio for web games (2026-07): https://www.abratabia.com/web-game-audio/spatial-audio-games.php

AI
- Craig Reynolds, Steering Behaviors for Autonomous Characters (GDC 1999; page 2004): https://www.red3d.com/cwr/steer/
- recast-navigation-js README (0.43.1, 2026-04-07): https://github.com/isaac-mason/recast-navigation-js
- recast-navigation-js `crowd.ts`: https://github.com/isaac-mason/recast-navigation-js/blob/main/packages/recast-navigation-core/src/crowd.ts

Open-world references
- depixeled-chris/gta7 (2026-05-30 to 06-01, MIT): https://github.com/depixeled-chris/gta7
- mattias800/minigta (2026-09-28, MIT code, ODbL data): https://github.com/mattias800/minigta
- donmutti/gta (2026-09/10, no licence): https://github.com/donmutti/gta
- aniruddhaadak80/neon-haven (2026-10, MIT): https://github.com/aniruddhaadak80/neon-haven
- brunosimon/folio-2025 (MIT, pushed 2026-04-07): https://github.com/brunosimon/folio-2025
- Wikipedia, Grand Theft Auto V (gameplay section): https://en.wikipedia.org/wiki/Grand_Theft_Auto_V

Local (read-only)
- `packages/new-hope-play/src/{main,input,actors,police,traffic,jobs}.ts` (branch `implementation`, commit `cd3edde`)
- `~/projects/nodejs/pixelden/app/games/` (grep for gamepad, `shake(`, `timeScale`, shared modules)

### Licence notes for borrowing
- Fine to reference or borrow (with notice): Rapier (Apache-2.0), Jolt.js, cannon-es, Bounce,
  recast-navigation-js, camera-controls, three-mesh-bvh, nipplejs, ecctrl, gta7, minigta code,
  folio-2025 code, koota (ISC), idb-keyval (Apache-2.0), ZzFX (MIT).
- **bitECS is MPL-2.0**: fine as an unmodified dependency; modified or copied files must stay
  MPL.
- **donmutti/gta has no licence**: ideas only.
- **minigta `public/data/`** is ODbL (OpenStreetMap): don't copy the data.
- folio-2025 **assets**: licence not stated separately; code only.

---

## Verification (2026-10-14)

Adversarial fact-check by a second agent. Method: npm registry queried with `curl`, tarballs of
`@dimforge/rapier3d` 0.21.0, `jolt-physics` 1.1.0 and `@recast-navigation/wasm` 0.43.1 downloaded
to a scratch folder and their `.wasm` files measured with `gzip -9`; GitHub repos checked via
`gh api` (licence, created/pushed dates) and raw files; MDN, Bevy, Rapier docs, Wikipedia fetched;
local claims checked against `packages/new-hope-play/src/*.ts` (commit `cd3edde`) and
`~/projects/nodejs/pixelden/app/games/`. 31 claims checked.

**Confirmed (24)**
- New Hope: `three ^0.180.0`; 2904 lines in 14 `src/*.ts` files; `main.ts` clamps `dt` to
  0.05 (`Math.min(0.05, …)`); `placeCamera` steps every 0.25 m and uses `(i - 2) / steps`, with
  auto-recentre at `input.idle > 1.2`; `input.ts` is 54 lines and `actors.ts` reads raw codes
  (`input.down("KeyE")`, `"KeyR"`, …); Hovercar: `Math.exp(-3.2 * dt)` grip, 62 m/s cap, bounce
  `-0.35`, hover clamp `0.35`, bank from `yawRate` and pitch from `vel.y`; Walker `RADIUS = 0.32`
  with 3 heights × 4 corners = 12 probe points; `police.ts`: orbit `sin(u.t * 0.7) * 5`, spawn at
  160 m, `Math.random`, `d < 90` = in sight, cool-down star every 10 s, arrest at `grip >= 3`
  below 10 m/s; traffic `count = 320`; `hash3` in `world.ts`.
- PixelDen: 0 files mention gamepad; 43 files call `shake(`; 5 files use `timeScale`/hit stop;
  `shared/touch-controls.ts`, `cloud-progress.ts`, `stats.ts` exist; `phaser ^4.0.0`;
  `.claude/commands/game-upgrade.md` exists.
- npm (latest, date, licence): rapier3d 0.21.0 / 2026-09-25 / Apache-2.0; jolt-physics 1.1.0 /
  2026-07-11 / MIT; cannon-es 0.20.0 / 2022-08-12; bounce 1.10.0 / 2026-08-10 / MIT;
  camera-controls 3.1.2 / 2025-11-17, peer `three >=0.126.1`; koota 0.6.6 / 2026-04-09 / ISC;
  bitecs 0.4.0 / 2025-12-06 / MPL-2.0; miniplex 2.0.0 / 2023-07-16; becsy 0.16.1 / 2026-10-02;
  @recast-navigation/core 0.43.1 / 2026-04-07; yuka 0.7.8 / 2022-09-17; three-pathfinding
  1.3.0 / 2024-05-17; howler 2.2.4 / 2023-09-19; zzfx 1.4.0 / 2026-10-01; xstate 5.33.2 /
  2026-09-15 (2.3 MB unpacked); idb-keyval 6.3.0 / 2026-07-08 / Apache-2.0 (56 KB);
  nipplejs 1.0.4 / 2026-05-26.
- Sizes re-measured: rapier3d wasm 3,082,103 B raw / 1,168,729 B gz; jolt wasm 2,021,569 /
  740,870 (multithread 2,482,284 / 709,797); recast wasm 338,824 / 130,803. All match.
- Rapier: `rapier.js` archived 2026-07-12 with a "merged into dimforge/rapier (`typescript`)"
  notice; PR #1016 "reorganize bindings directories + bring in bevy_rapier" merged 2026-09-24;
  CHANGELOG top entry 0.19.3 (2025-11-05); 0.15.0 (2025-03-06) variants + `PidController`;
  0.16.0 (2025-04-24) `ColliderDesc.voxels`/`setVoxel` "still experimental"; 0.17.2
  `reserveMemory`; 0.18.0 `World.timing*`; 0.19.1 sparse voxels. KCC guide API names and
  example values (0.01, 45°, 30°, `enableAutostep(0.5, 0.2, true)`, `enableSnapToGround(0.5)`,
  `computeColliderMovement`, `computedMovement()`), gravity caller-side, translation-only.
- Jolt README: 7 build flavours, "everything you newed with `new Jolt.XXX` needs to be destroyed
  by `Jolt.destroy(...)`", `CROSS_PLATFORM_DETERMINISTIC` build option, MIT. Jolt docs: rigid
  `Character` "cheap … recommended for e.g. simple AI characters", `CharacterVirtual`
  stair-stepping and stick-to-floor via `ExtendedUpdate`.
- camera-controls README: "4 raycasters from the camera since the near plane has 4 corners",
  `smoothTime` 0.25, `draggingSmoothTime` 0.125, "colliderMeshes may decrease performance";
  repo pushed 2026-10-12.
- three r180: `PositionalAudio.js` line 59 `this.panner.panningModel = 'HRTF'`; no Doppler;
  `AudioListener.updateMatrixWorld` ramps `positionX/Y/Z` with `linearRampToValueAtTime` to
  `currentTime + timeDelta` on the `positionX` branch.
- MDN: `localStorage` 5 MiB per origin, `QuotaExceededError`; Chromium 60 % of disk; Safari
  ~60 % (browser) / ~15 % (embedded WebView); Firefox min(10 % of disk, 10 GiB) best-effort;
  `persist()` prompts in Firefox, heuristic in Safari/Chromium. Pointer lock:
  `unadjustedMovement`, fails right after the default unlock gesture, call before
  `requestFullscreen()`, Promise not yet standard. `playEffect`: `dual-rumble`/`trigger-rumble`,
  the listed params, preemption, `InvalidStateError` when the document is hidden, limited
  availability.
- Bevy 2D screen shake constants: decay 0.5/s, exponent 2, max angle 10°, max translation 20,
  noise speed 20, 0.4 trauma per press.
- recast `crowd.ts` defaults (0.5, 1, 20, 6, 2.5, 0) and `update(dt, timeSinceLastCalled?,
  maxSubSteps = 10)` with `interpolatedPosition`.
- Repos: gta7 created 2026-05-30, pushed 2026-06-01, MIT, Vitest + Playwright, pure sim core,
  1-5 stars, +1 cop per star, steering police, gearbox, joystick, radar; commits co-authored by
  `claude`. minigta created and pushed 2026-09-28, README "Code is MIT", `public/data` ODbL,
  arrest/shoot split, line-of-sight, spatial hash, A*, 250 m chunks, radio. donmutti/gta: no
  licence file, "Eight seconds within 22 metres of a police car while under 15 km/h". neon-haven:
  MIT, 5 stars, minimap, M map, Kenney CC0. folio-2025: `license.md` MIT, pushed 2026-04-07,
  `@dimforge/rapier3d ^0.17.3`, `camera-controls ^3.1.2`, `howler ^2.2.4`, `tweakpane`,
  `PhysicsVehicle.js` constants 25 / 10 / 2.7 / 3 / 300, `Ticker.js` `maxDelta = 1/30`,
  `Inputs.js` `MODE_MOUSEKEYBOARD/GAMEPAD/TOUCH`, `Keyboard.<key>` events, `<html>` classes.
- Wikipedia GTA V: "Officers will search for players who leave the wanted vicinity" and the
  cool-down / line-of-sight sentence, verbatim.

**Refuted or corrected (6, marked inline)**
- "55 PixelDen game folders": 54 game folders plus `shared` (55 directories).
- folio-2025 "wraps nipplejs as `Inputs/Nipple.js`": nipplejs is not a dependency; `Nipple.js`
  is an own implementation.
- Safari 7-day eviction lacked the qualifier "only with cross-site tracking prevention on".
- minigta "traffic uses the same `Vehicle` class": the README says this of AI brains in
  general, not traffic.
- `shared/cloud-progress.ts` "[U: not checked]" for a version field: it has `version: 1` and
  checks it on read (no migration for other versions).
- miniplex source URL pointed at the fork `jure/miniplex`; canonical is `hmans/miniplex`.
  Also noted: folio-2025's `package.json` says ISC while its LICENSE file is MIT.

**Unconfirmed (not fetched; marked inline where load-bearing)**
- Hit-stop numbers from eastondev/Wayline; Abratabia panner-reuse advice; Firefox gamepad
  exposure rule; ecctrl's spring-damper mechanism; nipplejs mode/event details; Bounce issue
  #8 and its fdlibm fix; Chromium CR 652073003 wording; Torque3D/Phaser/GameDev.net hover
  recipes; Unreal spring-arm defaults (the report already marks these [U]); donmutti/gta and
  neon-haven dates (GitHub pages show no dates; `gh api` not run for them); becsy's
  COOP/COEP need; bitECS "about 5 kB" (npm unpacked is 1.75 MB; the 5 kB is presumably the
  minified core and was not measured).

**Gaps that matter for decisions**
- No independent benchmark of Rapier vs Jolt vs Bounce in the browser; all perf claims are
  the maintainers'. The report says so, but a decision on a physics dependency rests on
  download size alone.
- Rapier's `-deterministic` build is cross-platform deterministic for Rapier's own math; the
  report does not say whether the JS glue (f64 ↔ f32 conversion, `Math` in user code) keeps
  that property inside a D18 digest. Needs a spike before Wallhammer relies on it.
- The 1.03 m / 3.1 m tunnelling margin and the "about a millisecond" flow-field estimate are
  arithmetic and guesses, not measurements.
- Per-star GTA numbers (radii, timings) remain unsourced, so the proposed escalation table is
  design, not reference.
