# Camera rigs (D84), early look approval (D81), early character (D82) vs. real practice

Research date: 2026-11-09. Scope: check D81, D82 and D84 against documented engine and studio practice.

Reading rules for this note:

- Every claim has a source link. "Verified" means I read the linked primary page (official docs, source code, the speaker's own slides) during this research.
- **unverified** marks anything that comes from memory, from a press report, from a translation, or from a search-result snippet that I could not open.
- Two sources are unofficial and are used only to name techniques, never as code to copy: the reverse-engineered GTA III source (legally contested) and slide transcripts on a mirror site.

---

## A. How camera systems are actually built

### A1. The common architecture: one output camera, many behaviour descriptions

| System | What renders | What describes behaviour | Who picks the active one | Source |
|---|---|---|---|---|
| Unity Cinemachine 3 | Exactly one Unity Camera ("A Cinemachine setup must include only one Unity Camera") | CinemachineCameras: separate objects with no Camera component | Cinemachine Brain on the Unity Camera: highest Priority goes Live, ties go to the most recently activated | [essential elements](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/concept-essential-elements.html), [transitions](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/concept-camera-control-transitions.html) |
| Unreal (classic) | Final view = `FMinimalViewInfo` POV produced by PlayerCameraManager | View target actors with `CalcCamera`, camera components | PlayerCameraManager "is responsible for managing the camera for a particular player"; it can "blend between other objects or Actors that influence the camera" | [Cameras in Unreal Engine](https://dev.epicgames.com/documentation/unreal-engine/cameras-in-unreal-engine) |
| Unreal Gameplay Cameras plugin (Experimental, still marked so in the 5.9 docs) | Same final POV | Camera Asset containing Camera Rigs; a rig "defines the behavior of a camera by using a network of nodes" | Camera Director ("manages which Camera Rig is active at any given time"; Blueprint, Single or StateTree) plus enter/exit Transitions per rig | [overview](https://dev.epicgames.com/documentation/unreal-engine/gameplay-camera-system-overview), [quick start](https://dev.epicgames.com/documentation/unreal-engine/gameplay-camera-system-quick-start) |
| Godot Camera3D | One current camera per Viewport ("Only one camera can be active per viewport") | Nothing built in: no follow or orbit behaviour in the class | User script | [Camera3D](https://docs.godotengine.org/en/stable/classes/class_camera3d.html) |
| Godot Phantom Camera addon | The scene's Camera3D | PhantomCamera nodes hold position, rotation and tween data; the active one "takes over the scene's Camera node and applies its data to it" | PhantomCameraHost, by priority; "heavily inspired by ... Cinemachine" | [Phantom Camera docs](https://phantom-camera.dev/overview/what-is-this) |
| O3DE Camera Rig | Camera component on the same entity | A rig = three ordered lists: target acquirers, look-at behaviours, transform behaviours | Lists run in order each frame | [Camera Rig component](https://docs.o3de.org/docs/user-guide/components/reference/camera/camera-rig/) |
| Bevy 0.18 | Camera entity | First-party `FreeCamera` and `PanCamera` controllers, each with a separate state component (`FreeCameraState`, unverified detail from search snippet) | User code | [Bevy 0.18 notes](https://bevy.org/news/bevy-0-18/) |
| God of War 1–3 (Sony Santa Monica) | One final camera | About 50 cameras per level, submitted by zones, combat actions and scripts | Filter by priority and player state, then a blend tree rebuilt every frame | Phil Wilkins, GDC 2008 and the later GoW3 talk: slide transcripts [2008](https://api.sambuz.com/doc/an-ideal-virtual-camera-system-regardless-of-genre-is-ppt-presentation-1054644), [GoW3](https://sambuz.com/doc/iterating-on-a-dynamic-camera-system-ppt-presentation-854970) (mirror site, read in full except the last pages) |

Conclusion for D84: "one real camera, many rigs evaluated into it" is how every system above works. No surveyed engine builds a game type into the camera itself.

Bevy's own statement is relevant to the "editor uses the same rigs" part of D84. Bevy added controllers so users can "explore scenes during development (rather than gameplay)", says they are "unlikely to be useful for normal game logic", and that the right settings depend on scene scale ([Bevy 0.18 notes](https://bevy.org/news/bevy-0-18/)). So practice separates "dev fly camera" from "game camera tuning" more than D84 does; the mechanism can be shared, the parameter sets will not be.

### A2. What a rig is made of: a pipeline of behaviours, not a flat record

| System | Structure of one rig | Source |
|---|---|---|
| Cinemachine | Position Control behaviour + Rotation Control behaviour + Noise + any number of Extensions (Deoccluder, Decollider, Confiner, Follow Zoom, Group Framing, Third Person Aim, ...) | [procedural motion](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/concept-procedural-motion.html) |
| O3DE | Acquirers tried in order until one finds a target; look-at behaviours run in order to produce the target transform; transform behaviours run in order to produce the camera transform | [Camera Rig component](https://docs.o3de.org/docs/user-guide/components/reference/camera/camera-rig/) |
| Unreal Gameplay Cameras | Node tree per rig; documented nodes include Boom Arm, Dampen Position, Collision Push, Dolly Framing, Camera Shake (node names from the API index, **unverified** beyond names) | [API index](https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/GameplayCameras) |
| God of War dynamic camera | Target, dolly (fixed point or point on a rail), boom; constraints applied in fixed order: framing safe zone, dolly/boom placement, distance limits, orientation limits | [GoW3 slides](https://sambuz.com/doc/iterating-on-a-dynamic-camera-system-ppt-presentation-854970) |
| GTA III (reverse-engineered, unofficial) | Hard-coded camera modes in C++ (`Process_BehindCar`, `Process_Cam_On_A_String`, ...), each calling a chain of helper passes: distance clamp, height/pitch, auto-rotate behind car, occlusion fix, occlusion-by-vehicle fix | [re3 mirror, `src/core/Cam.cpp`](https://github.com/Yggge/re3) |
| SuperTuxKart | Hard-coded modes (`CM_NORMAL`, `CM_REVERSE`, `CM_CLOSEUP`, `CM_FALLING`, ...) in one class | [camera_normal.cpp](https://github.com/supertuxkart/stk-code/blob/master/src/graphics/camera/camera_normal.cpp) |

Two styles exist in shipped code. Tool-oriented engines compose a rig from ordered behaviour blocks (data). Game-specific code bases hard-code each mode in C/C++ and expose only numbers. Both are valid. A "parameter set" matches the second style, and then every rig type is engine code, not data. D84 should say which of the two it means.

### A3. What real rigs need that a flat parameter set does not give

**1. Persistent state per rig instance.**

- Cinemachine has explicit state management: `ResetCameraState()` ("notify all virtual cameras to forget state from the previous frame") and `OnTargetObjectWarped(target, delta)` to tell every camera that a tracked target jumped ([CinemachineCore API](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/api/Unity.Cinemachine.CinemachineCore.html)). Standby cameras keep following their targets and updating ([transitions](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/concept-camera-control-transitions.html)).
- Unreal's `UCameraModifier` is described as stateful and holds a current blend alpha (**unverified**, search snippet of [UCameraModifier](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/Engine/UCameraModifier)). The Spring Arm has camera lag, lag speed and a lag max distance (**unverified**, search snippet of [USpringArmComponent](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/Engine/USpringArmComponent)).
- SuperTuxKart keeps `m_camera_offset`, `m_kart_position`, `m_kart_rotation`, `m_last_smooth_mode` between frames ([camera_normal.cpp](https://github.com/supertuxkart/stk-code/blob/master/src/graphics/camera/camera_normal.cpp)).
- The GTA III car camera keeps angles and their speeds (`Alpha`, `AlphaSpeed`, `Beta`, `BetaSpeed`), distance before collision changes, distance speed, "last obscured" flags and several static height fixers ([re3 mirror](https://github.com/Yggge/re3), unofficial).
- God of War keeps the blend tree, dolly position along the rail, target damping state, jump-correction height and yaw vectors ([GoW3 slides](https://sambuz.com/doc/iterating-on-a-dynamic-camera-system-ppt-presentation-854970)).

The D84 signature `eng_camera_rig_eval(rig, world, dt)` has no place for this state unless `rig` is a mutable instance. No surveyed system is stateless.

**2. An arbiter with priorities and a blend stack.**

- Cinemachine: the Brain blends between cameras; during a blend both are live; a blend is not a fade, it animates position, rotation and lens while keeping the target in view and respecting Up; a cut is a zero-time blend; Timeline "overrides the Cinemachine Brain priority system" ([transitions](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/concept-camera-control-transitions.html)). The Brain has a default blend and a per-pair custom blend asset ([Brain](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineBrain.html)).
- Unreal Gameplay Cameras: four evaluation layers run one after another. Base (defaults such as FOV and clip planes), Main (the camera modes; a "transient isolated blend stack" where each rig runs alone and results are blended), Global ("post-blend stuff" such as collision and occlusion), Visual (purely visual effects such as shakes). Source: forum answer by user `ludovicchabant`, who appears to be the plugin's developer; the page does not label him as Epic staff ([thread](https://forums.unrealengine.com/t/gameplay-camera-system-clarification-on-base-global-and-visual-persistent-rigs/2668478)).
- Lyra: a camera mode stack blends modes by weight (**unverified**: Epic's source is not public on the web; only a forum mention that modes "stack and ease into each other", [thread](https://forums.unrealengine.com/t/lyra-cameramodestack-gameplay-tag/765924)).
- God of War: blend tree with crossfade and weighted-average nodes; weights come from eased timers or from the hero's position in a zone; submission list sorted by priority then age; "we never want NO camera", so the previous one is held ([2008 slides](https://api.sambuz.com/doc/an-ideal-virtual-camera-system-regardless-of-genre-is-ppt-presentation-1054644)).

**3. Blending is done on rig-level parameters, not by lerping two finished transforms.**

- God of War blends target position, target offset as azimuth/elevation/distance, Euler orientation, field of view. Yaw is stored as a 2D vector to avoid wrap-around. Euler angles were chosen because quaternion blends introduce unwanted roll. Positions are blended along an arc around the player because straight-line blending makes the view "bloom" ([GoW3 slides](https://sambuz.com/doc/iterating-on-a-dynamic-camera-system-ppt-presentation-854970), [2008 slides](https://api.sambuz.com/doc/an-ideal-virtual-camera-system-regardless-of-genre-is-ppt-presentation-1054644)).
- John Nesky (camera designer of Journey), GDC 2014, mistake 3: describing camera position and orientation with global coordinates and quaternions. Mistake 16: changing pitch, distance and field of view independently ([GDC Vault entry](https://gdcvault.com/play/1020460/50-Camera), [video](https://www.youtube.com/watch?v=C7307qRmlMI); the numbered list is taken from a written translation, [part 1](https://habr.com/en/articles/272401/) and [part 2](https://habr.com/ru/articles/272825/), so the wording is **unverified** against the video).

**4. Collision and occlusion avoidance, with its own timers.**

- Cinemachine Deoccluder: three strategies (pull forward, preserve height, preserve distance), separate damping for "when occluded" and for the return, a smoothing time ("minimum number of seconds to hold the camera at the nearest point"), and a minimum occlusion time before acting ([Deoccluder](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineDeoccluder.html)). Decollider adds terrain resolution by casting a ray down from above the camera ([Decollider](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineDecollider.html)).
- Unreal Spring Arm: sphere probe with a probe size and channel (**unverified**, search snippet of [USpringArmComponent](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/Engine/USpringArmComponent)). Lyra third person mode: penetration-avoidance "feelers" with separate pawn and world weights ([forum thread quoting the source](https://forums.unrealengine.com/t/feeler-weights-seem-to-be-ignored-in-third-person-camera-avoidance-lyra/1336679)).
- GTA III: line test target-to-camera against buildings, pull in to the hit, ease back out; a second pass raises the camera above other vehicles that block the view ([re3 mirror](https://github.com/Yggge/re3), unofficial).
- Counter-example: God of War deliberately has no automatic camera collision, because it "introduced pops, or it gets hung up on geometry"; designers constrain the camera instead ([2008 slides](https://api.sambuz.com/doc/an-ideal-virtual-camera-system-regardless-of-genre-is-ppt-presentation-1054644)). That only works with hand-built levels, not with a procedural world.
- Mark Haigh-Hutchinson (Retro Studios), "Real-Time Cameras": camera navigation is like AI navigation; ray casts are the common tool but costly, so amortise them over frames and reduce the tested data set ([excerpt](https://www.gamedeveloper.com/pc/feature-real-time-cameras---navigation-and-occlusion)). The rest of the book (camera hints, interpolation, scripting chapters) is **unverified**: I did not read it.
- Nesky mistakes 4–12 are all about occlusion (default distance that breaks line of sight, pushing the camera away while the player steers toward the obstacle, treating a hill as a wall, thin columns) ([part 1](https://habr.com/en/articles/272401/), translation).

So rig evaluation needs scene queries (ray, sphere sweep, terrain height). The `world` argument in D84 has to expose them.

**5. Look-ahead and framing.**

- Cinemachine has composer behaviours (Position Composer, Rotation Composer), Group Framing and Follow Zoom ([procedural motion](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/concept-procedural-motion.html)).
- God of War: a screen-space safe zone converted to angle ranges; prioritised framing of several targets with weights; a jump correction that ignores jump motion ([GoW3 slides](https://sambuz.com/doc/iterating-on-a-dynamic-camera-system-ppt-presentation-854970)).
- Nesky mistakes 21, 25, 26, 45: focusing only on the avatar, not tilting down at a cliff edge, fixed pitch on slopes, moving the camera sharply with every jump ([part 2](https://habr.com/ru/articles/272825/), translation).

Framing needs more than one target and needs the target's velocity and ground state as inputs.

**6. Shake and noise as a separate layer.**

- Cinemachine: "At each frame update, Cinemachine adds noise separately from the movement of the camera to follow a target", so noise does not affect the camera position in future frames and damping behaves as expected ([procedural motion](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/concept-procedural-motion.html)). Impulse: sources emit a signal from a point in space, listeners on cameras react ([Impulse](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineImpulse.html)).
- Unreal Gameplay Cameras: the Visual layer exists "to separate gameplay-affecting behavior from visual-only behavior" ([thread](https://forums.unrealengine.com/t/gameplay-camera-system-clarification-on-base-global-and-visual-persistent-rigs/2668478)).
- Nesky mistakes 43 and 44: shake without an intensity setting; shake while walking ([part 2](https://habr.com/ru/articles/272825/), translation).
- Squirrel Eiserloh, GDC 2016, "Juicing Your Cameras With Math" covers shake, smoothing, framing and split screen ([GDC Vault](https://gdcvault.com/play/1023146/Math-for-Game-Programmers-Juicing)). The "trauma" model (shake = trauma squared, rotational shake preferred in 3D so the camera cannot be pushed into a wall) is **unverified**: from memory, slides not opened.

**7. Input shaping.**

- Cinemachine Orbital Follow: axis ranges, wrap, and recentering with a wait time after the last input and a recenter duration ([Orbital Follow](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineOrbitalFollow.html)). The Brain can ignore time scale so cameras "respond in real time to user input and damping" ([Brain](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineBrain.html)).
- Nesky mistakes 34–39 and 47: taking control away abruptly, applying a hint right after the player rotated the camera, no invert option, reacting to accidental stick input, linear instead of S-curve response, constant-speed rotation into a hard limit ([part 2](https://habr.com/ru/articles/272825/), translation).

**8. Cinematic and scripted overrides.**

- Cinemachine: Timeline clips override priority ([transitions](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/concept-camera-control-transitions.html)); `SetCameraOverride` takes precedence over in-game priority (**unverified**, search snippet).
- God of War: the animated camera maps a hand-animated camera into the same blend parameters; scripts start and stop cameras ([GoW3 slides](https://sambuz.com/doc/iterating-on-a-dynamic-camera-system-ppt-presentation-854970)).
- Nesky mistake 29: relying only on procedural behaviour instead of scripted hints ([part 2](https://habr.com/ru/articles/272825/), translation).

**9. Multiple viewports.**

- Cinemachine: one Brain per Unity Camera; channels and a channel mask decide which cameras each Brain sees, "for example, when implementing Split-screen" ([Brain](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineBrain.html), [multiple cameras](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineMultipleCameras.html)).
- Unreal: one PlayerCameraManager "for a particular player" ([Cameras](https://dev.epicgames.com/documentation/unreal-engine/cameras-in-unreal-engine)). Godot: one active camera per Viewport ([Camera3D](https://docs.godotengine.org/en/stable/classes/class_camera3d.html)).

So "ONE camera" in D84 should read "one camera per view". An editor with several panes, a minimap or a picture-in-picture view each need their own arbiter and their own rig state.

**10. Update order and time.**

- The Cinemachine Brain has an Update Method ("when to update the position and rotation of the CinemachineCameras", Smart Update recommended) and a separate Blend Update Method ([Brain](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineBrain.html)). It also has time overrides for deterministic playback ([CinemachineCore API](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/api/Unity.Cinemachine.CinemachineCore.html)).
- Meaning for us: the camera must be evaluated after the target has its final position for the frame, and damping has to be frame-rate independent. The second half is a design inference, not a quoted statement.

**11. A warning against over-generalising.**

- Nesky mistake 50: trying to build one universal algorithm (a general constraint solver) that satisfies all camera constraints ([part 2](https://habr.com/ru/articles/272825/), translation; wording **unverified** against the [talk video](https://www.youtube.com/watch?v=C7307qRmlMI)).
- God of War: conflicting constraints oscillate; damping on the distance constraint caused circular oscillation and was removed ([GoW3 slides](https://sambuz.com/doc/iterating-on-a-dynamic-camera-system-ppt-presentation-854970)).

This supports D84's choice of a few concrete rig types over a universal solver.

### A4. Strategy camera and planet-orbit camera with double precision

| Pitfall | Evidence | Source |
|---|---|---|
| Zoom speed must scale with height above the surface, with a lower bound | CesiumJS: `zoomRate = zoomFactor * (distance - minHeight)`, clamped to a minimum rate of 20 so movement does not stall near the surface, and a maximum of the Sun-to-Pluto distance; comment: "When approaching the surface, the zoomRate slows and stops minimumZoomDistance above it" | [ScreenSpaceCameraController.js](https://github.com/CesiumGS/cesium/blob/main/packages/engine/Source/Scene/ScreenSpaceCameraController.js) |
| Navigation mode changes with altitude | Cesium has three thresholds: test terrain collision only below `minimumCollisionTerrainHeight` (15 km), pick terrain instead of the ellipsoid below 150 km, switch from trackball rotation to free look below 7500 km | [ScreenSpaceCameraController docs](https://cesium.com/learn/cesiumjs/ref-doc/ScreenSpaceCameraController.html) |
| Terrain following fights with streaming | Cesium only adjusts camera height when "the globe height has been fairly stable across several frames", "to avoid big jumps during tile loads" | [same source file](https://github.com/CesiumGS/cesium/blob/main/packages/engine/Source/Scene/ScreenSpaceCameraController.js) |
| Zoom toward the cursor needs a stable picked point | Cesium re-picks the start point when the zoom target is passed; in tracking mode it ignores picks that land behind the target "to prevent zoom snap" | [same source file](https://github.com/CesiumGS/cesium/blob/main/packages/engine/Source/Scene/ScreenSpaceCameraController.js) |
| Inertia is separate per motion type | `inertiaSpin` 0.9, `inertiaTranslate` 0.9, `inertiaZoom` 0.8; input is capped per frame by `maximumMovementRatio` | [docs](https://cesium.com/learn/cesiumjs/ref-doc/ScreenSpaceCameraController.html) |
| Moving between two far-apart views must not interpolate position and zoom linearly | MapLibre/Mapbox `flyTo` implements the "optimal path" of van Wijk and Nuij (2003): zoom out, travel, zoom in; speed is measured in "screenfuls" per second, which "does not correspond to a fixed physical distance, but varies by zoom level" | [camera.ts](https://github.com/maplibre/maplibre-gl-js/blob/main/src/ui/camera.ts), [paper](https://www.win.tue.nl/~vanwijk/zoompan.pdf) |
| RTS camera needs a target state and an actual state | `bevy_rts_camera`: user code writes `target_focus` and `target_zoom`, the camera eases toward them; height follows ground meshes by ray cast; mark only terrain as ground, not buildings or units | [bevy_rts_camera](https://docs.rs/bevy_rts_camera) |
| Pitch, distance and field of view must be tied together | Nesky mistakes 14–16 | [part 1](https://habr.com/en/articles/272401/) (translation) |
| A hill is not a wall | Nesky mistake 11: rise above hills instead of going around them | [part 1](https://habr.com/en/articles/272401/) (translation) |
| "Up" is not constant on a planet | The Cinemachine Brain has a World Up Override so camera math can use a non-global up vector | [Brain](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineBrain.html) |
| Camera state must survive an origin shift | Cinemachine needs `OnTargetObjectWarped` on every camera when a floating origin moves; with position damping above zero there is a logged bug where the camera loses its relative position | [API](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/api/Unity.Cinemachine.CinemachineCore.html), [forum thread](https://discussions.unity.com/t/floating-origin-with-cinemachine/737699), [issue tracker](https://issuetracker.unity3d.com/issues/cinemachine-camera-does-not-maintain-relative-position-to-the-target-when-using-cinemachinecore-dot-ontargetobjectwarped-and-cam-dot-forcecameraposition-with-positiondamping-values-greater-than-zero) |
| Double precision on the CPU, camera-relative single precision on the GPU | Unreal: convert to translated (camera-relative) world space "as soon as possible"; Godot: shaders stay single precision and double precision is emulated for rendering | [Unreal LWC rendering](https://dev.epicgames.com/documentation/unreal-engine/large-world-coordinates-rendering-in-unreal-engine-5), [Godot large world coordinates](https://docs.godotengine.org/en/stable/tutorials/physics/large_world_coordinates.html) |
| How far single precision lasts depends on the camera type | Godot's table: first person about 2–4 km from the origin, third person 4–8 km, top-down 16–32 km, anything past about 65 km needs double precision | [Godot large world coordinates](https://docs.godotengine.org/en/stable/tutorials/physics/large_world_coordinates.html) |

Notes that are my inference, not quoted from a source (**unverified**):

- With a double-precision camera position, the danger moves from the camera position into the rig's internal state. Damped offsets, previous-target positions and shake offsets should be stored relative to the target (yaw, pitch, distance in the target's local tangent frame), as Nesky mistake 3 and the God of War blend parameters suggest. Then the large numbers appear only in the final addition.
- On a planet the near and far planes have to change with altitude, so the rig output is not only a transform. D84's camera struct already has "projection"; the rig must be allowed to write it.
- Yaw defined around the local up vector is singular at the poles; an orbit rig over the pole needs the same "extra orientation transform" that God of War added for straight-up shots ([GoW3 slides](https://sambuz.com/doc/iterating-on-a-dynamic-camera-system-ppt-presentation-854970)).
- The standard reference for precision in globe renderers is Cozzi and Ring, "3D Engine Design for Virtual Globes", chapter 5 (relative-to-center and relative-to-eye rendering). Not read in this research.

---

## B. Is cancelling the chase camera research sensible?

### B1. What the sources say about difficulty

- Criterion (Burnout, Need for Speed), GDC 2018, Matthew Harris: there have been many talks about vehicle physics, "but not much about the rest, particularly how the camera moves"; the talk treats the camera as part of vehicle feel ([GDC Vault](https://gdcvault.com/play/1025295/Vehicle-Feel-Masterclass-Balancing-Arcade), [video](https://www.youtube.com/watch?v=n_A0RqeGado)). The camera section itself is **unverified**: video not transcribed.
- Rockstar has published nothing technical on the GTA car camera. Obbe Vermeij (former technical director, Rockstar North) described only the origin of the cinematic camera, in a 2025 thread reported by the press ([PCGamesN](https://www.pcgamesn.com/grand-theft-auto-iii/ex-rockstar-dev)); **unverified**, original posts not read.
- The reverse-engineered GTA III camera shows the real size of the problem: the "camera on a string" car mode is a chain of six helper passes, each with its own persistent state and tuned constants ([re3 mirror](https://github.com/Yggge/re3), unofficial).
- SuperTuxKart's whole chase camera is one file of a few hundred lines with five smoothed state variables and no collision at all ([camera_normal.cpp](https://github.com/supertuxkart/stk-code/blob/master/src/graphics/camera/camera_normal.cpp)).

Assessment: the written literature on driving cameras is thin. The useful sources are three or four code bases and one talk, a few hours of reading. A large dedicated study would mostly repeat this section. What makes a chase camera hard is tuning it against real vehicle handling in a real city with occluders, and research cannot replace that. So cancelling a separate research is defensible. Treating the chase camera as "just another parameter set" is not: it is the rig type with the most state, the most special cases and the heaviest use of scene queries. The condition for the cancellation is that the rig system gets the gaps listed in section A3 (state, queries, blend, layers) and that a tuning pass is planned for the milestone where a drivable vehicle exists.

### B2. Known techniques for a driving chase camera (10 lines)

1. **Anchor.** Follow a point above the car, not the chassis; ignore chassis pitch, roll and suspension bounce. iRacing's chase camera locks height to the track surface and follows "the car's direction of travel, not its chassis angle" ([iRacing camera tool](https://support.iracing.com/support/solutions/articles/31000157467)).
2. **Direction.** Sit behind the velocity direction or a blend of heading and velocity. Swing behind the car only when forward speed is above a threshold and the angle error exceeds a deadband (GTA III: start at 20 degrees, stop at 2 degrees; [re3 mirror](https://github.com/Yggge/re3), unofficial).
3. **Lag.** Spring-damper or rate-and-acceleration-limited smoothing, separate for position and rotation. iRacing's chopper camera "is dragged behind the car, using a spring/damper mechanism"; SuperTuxKart has separate smoothing times for position and rotation ([camera_normal.cpp](https://github.com/supertuxkart/stk-code/blob/master/src/graphics/camera/camera_normal.cpp)); Project Chrono models "chase" as a flexible cantilever with separate horizontal and vertical gains ([ChChaseCamera](https://api.projectchrono.org/classchrono_1_1utils_1_1_ch_chase_camera.html)).
4. **Speed coupling.** Distance and height grow with speed ratio (SuperTuxKart: distance = -2.8 - 5.6 x speed ratio). Wider field of view at speed is common in mods and community requests ([BeamNG forum request](https://beamng.com/posts/1822642), a user post, not a developer statement); its use in shipped AAA games is **unverified**.
5. **Drift.** Offset the camera sideways by a fraction of the skid angle so the player sees where the car is going (SuperTuxKart uses half the visual skid angle).
6. **Reverse.** Gate on the sign of forward speed. iRacing flips the camera to the other side on reverse gear; GTA III holds the current angle instead. Needs hysteresis either way.
7. **Height and pitch.** Pitch from a table per zoom level; vertical probes raise the camera for roofs, ground and slopes (GTA III `WorkOutCamHeight`; [re3 mirror](https://github.com/Yggge/re3), unofficial).
8. **Occlusion.** Line test from target to camera against buildings: pull in to the hit point, ease back out. Separate test against other vehicles: raise the camera above the blocker (GTA III `FixCamIfObscured`, `FixCamWhenObscuredByVehicle`; same source).
9. **Special states.** Airborne or falling (SuperTuxKart stops updating position so the camera does not dive), crash or explosion (stop moving, keep aiming), look-behind and side-look inputs that suppress auto-rotation, optional cinematic alternates.
10. **Player override and layers.** Manual orbit with recentering after a wait ([Cinemachine Orbital Follow](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineOrbitalFollow.html)); up-vector smoothing against shake (SuperTuxKart blends 4 % of the new up vector per frame); speed shake as a separate layer with a user intensity setting (Nesky mistake 43).

---

## C. Early look validation and early characters

### C1. Terms and when studios do it

| Term | Definition in the source | When | Source |
|---|---|---|---|
| Visual target | "Demonstrate an example of what the finished product will look like"; "cuts through the grey areas, rallies the project's efforts"; studios should go "beyond concepts to refined visual targeting" | After concepts, by the end of preproduction | Ben Cammarano, director of art, Microsoft Game Studios, 2008 ([Game Developer](https://gamedeveloper.com/game-platforms/microsoft-s-cammarano-games-need-visual-targets-not-just-concept-art)) |
| Beautiful corner | A very small, usually not playable area that shows team and publisher what the game will look like at launch; also tests whether artists can create and finalise in-game art | After test rooms and the graybox prototype, before the vertical slice | Tim Cain (Fallout, The Outer Worlds), 2023 ([video](https://youtu.be/IADSh_P05As), read through [this summary](https://gameworldobserver.com/?p=21895); video itself not transcribed) |
| Vertical slice | One section with nearly every feature and nearly all final art: "It'll look like this, it'll play like this" | After the beautiful corner | Same source |
| Publishable first playable | Two levels of publishable quality with "art direction in place"; if the team cannot produce it, the game is not worth publishing and "will not get better during production" | End of preproduction, as the go/no-go point | Mark Cerny, "Method", D.I.C.E. 2002 ([slide deck](https://www.slideshare.net/holtt/cerny-method), uploaded by a third party) |
| Style guide and visual targets | Style guide first ("a huge first step"), then visual targets made with engineers and animators, then tested in the engine "to see how the characters moved and acted" | Early, right after the core tenets | Arnold Tsang, Overwatch assistant art director, 2016 ([Vice](https://www.vice.com/en/article/heres-what-its-like-to-art-direct-overwatch)) |
| Visual target (platform guidance) | "Start with one small but important scene, character, or object built at near-final quality"; once final it guides asset production. The style guide is a living document | Preproduction, before asset production | [Meta, art preproduction](https://developers.meta.com/horizon/design/art-preproduction/) |
| Look development tooling | Unity's Look Dev viewer exists to "check and compare Assets to ensure they work well in various lighting conditions" | Continuous | [Unity HDRP Look Dev](https://docs.unity3d.com/Packages/hdrp/manual/Look-Dev) (**unverified**, search snippet) |

Greg Foertsch (Firaxis, later Bit Reactor) gave two GDC art direction talks on preproduction (2017 and 2024). The 2024 abstract promises "evaluation points" for moving into production and guidance on what an art bible contains and when to write it ([2024](https://www.gdcvault.com/play/1034593/Art-Direction-Summit-Pre-Production), [2017](https://gdcvault.com/play/1024312/)). Content **unverified**: abstracts only.

Two observations:

- No source describes approving an art style on untextured primitives. The graybox prototype is for how the game plays ("This is what the game will feel like to play, but it won't look like this", Cain). The look is approved on a separate, small, near-final artefact. D81 matches this split.
- The style is not locked in one step. The sequence in the sources is style guide, then visual target, then vertical slice, and the style guide stays a living document.

### C2. Evidence that lighting judged without real materials misleads

- Unreal has a dedicated "Lighting Only" view mode that "shows a neutral Material that is only affected by lighting", and "Detail Lighting", which exists to check whether a dark or noisy Base Color is hiding lighting problems ([viewport modes](https://dev.epicgames.com/documentation/unreal-engine/viewport-modes-in-unreal-engine)). So grey-material lighting is a diagnostic view in practice. It is not what gets approved as the look.
- In Valve's Team Fortress 2 the character lighting equation multiplies the albedo by a warped ramp of the half-Lambert term plus ambient; the final look is the product of the painted texture and the ramp. The slides define the final character as the "3D model with texture and basic shading" and show world texture maps side by side with in-game screenshots ([Mitchell, GDC 2008 slides](https://cdn.steamstatic.com/apps/valve/2008/GDC2008_StylizationWithAPurpose_TF2.pdf)).
- The same slides list painterly choices that live only in textures: warm-to-cool hue shift in shading, brush-width detail, "impressionistic textures". None of this is visible on an untextured primitive.
- For a WoW-like style where light is painted into the texture, artists report that scene lights must be kept subtle because the texture already carries light information ([80.lv breakdown](https://80.lv/articles/creating-world-of-warcraft-inspired-environment-for-blizzard-contest), **unverified**: search snippet, community source, not Blizzard).
- I found no talk or postmortem that states "we approved lighting on grey boxes and it was wrong". The conclusion is supported by how the tools and shading models work, not by a documented failure. Mark the strong form of the claim as **unverified**.

### C3. Characters: when studios prototype them, and what they test

- Overwatch: Tracer was the first hero and was used to test gameplay ([Wikipedia, citing GameSpot 2016](https://en.wikipedia.org/wiki/Development_of_Overwatch)). Torbjörn was the art baseline: his "appearance was used as a baseline in all other character and map designs for cohesion" (same page, citing Kotaku's report of the GDC 2017 talk by Bill Petras and Arnold Tsang; [talk video](https://www.youtube.com/watch?v=Ql4kIxGBBi0)). The quote that he was "our art visual target" and "the first one we modelled" comes from press snippets only: **unverified**.
- Team Fortress 2: the art direction was defined on characters first. Creation order: silhouette, interior shapes, model sheet, 3D model, skin, final character in game; the read hierarchy (team by colour, class by silhouette, weapon by contrast at chest level, gradient from dark feet to light chest) is a character rule set ([Mitchell, GDC 2008 slides](https://cdn.steamstatic.com/apps/valve/2008/GDC2008_StylizationWithAPurpose_TF2.pdf)).
- Blender Studio's production pipeline has a fixed "Animation Testing" stage right after the first rig version. It is a stress test that looks for weight-painting and deformation flaws and for "geometry problems that rigging can't fix, which may need modeling changes"; the loop with rigging and modelling repeats "as many times as needed" ([Blender Studio artist guide](https://studio.blender.org/tools/artist-guide/asset-creation/animation-testing)).
- Overwatch tested visual targets in the engine "to see how the characters moved and acted" ([Vice](https://www.vice.com/en/article/heres-what-its-like-to-art-direct-overwatch)).
- No Man's Sky: procedural creatures are generated from hand-made templates ("blueprints") built on a small number of skeleton types, not from nothing ([Grant Duncan, GDC 2015 talk entry](https://gdcvault.com/play/1021805/Art-Direction-Bootcamp-How-I)). Details **unverified**: press reports of the talk, not the talk itself.
- Cerny: preproduction exists to remove the unknowns before production; a team that cannot produce final-quality content at the end of it should stop ([slide deck](https://www.slideshare.net/holtt/cerny-method)).

Reading for D82: doing the riskiest content category early agrees with Cerny and with Overwatch. But in every source where a character is validated early, it is validated on a rig and in motion, or at least in poses. Topology, joint placement and proportions are decided by how the mesh must deform. A character generator that has only ever produced a static mesh has not yet met its main risk.

---

## What this means for D81, D82 and D84

### (a) Confirmed

1. **D84, one camera fed by rigs.** Cinemachine, Unreal (both camera systems), Phantom Camera, O3DE and God of War all produce one final camera per view from many behaviour descriptions. None builds a game type into the camera. (Section A1.)
2. **D84, rigs as data tuned by the game project.** O3DE rigs are ordered lists of behaviours with properties; Unreal Gameplay Camera rigs are assets; God of War exposes designer values per camera. Bevy states that the right settings depend on the scene and its scale. (A1, A2.)
3. **D84, no universal solver.** Nesky's mistake 50 and the God of War oscillation problems support a small set of concrete rig types. (A3.11.)
4. **D81, approve the look on real materials, early, on a small scene.** This is the "visual target" or "beautiful corner" of Cammarano, Cain, Meta and Blizzard. The graybox is for play feel, not for look approval. (C1, C2.)
5. **D82, riskiest content first.** Matches Cerny's Method and Overwatch's early hero. (C3.)
6. **Cancelling a separate chase camera research.** Defensible: the literature is thin and the difficulty is in tuning against real handling. (B1.) Conditions are in (b) 7.

### (b) Gaps we should add

1. **A rig needs persistent state, separate from its parameters.** Split "rig definition" (text data) from "rig instance" (state: smoothed angles and their speeds, damped offset, previous target, occlusion hold timers, recenter timer). The eval call should take both, for example `eng_camera_rig_eval(def, state, inputs, dt)`. Add `reset` and `target teleported / origin shifted by delta` calls, as Cinemachine has. (A3.1, A4.)
2. **A camera arbiter (director) with priorities and a blend stack.** Several rigs are live during a blend. Needs: priority, cut vs. blend, per-pair blend time and easing, "never no camera", cinematic override on top. (A3.2, A3.8.)
3. **Blend rig-level parameters, not finished transforms.** Blend target point plus yaw, pitch, distance and field of view; yaw as a 2D vector; move along an arc around the target; keep the target in view. (A3.3.)
4. **Post-blend layers.** Order used by Unreal: defaults, blended rigs, then collision and occlusion, then visual-only effects (shake, noise). Shake must not feed back into rig state and needs a user intensity setting. (A3.2, A3.6.)
5. **Scene queries in the eval inputs.** Ray cast, sphere sweep and terrain height, with amortisation. For streamed terrain, only correct height when the sampled height is stable across frames. (A3.4, A4.)
6. **Richer inputs than "world".** Target position, velocity, orientation, local up, ground state; more than one target for framing; shaped player input (response curve, deadzone, invert, recenter wait); hints from zones or scripts. (A3.5, A3.7.)
7. **Chase rig: plan a tuning pass, not a research.** Schedule it for the milestone where a drivable vehicle exists; use section B2 as the checklist. The chase rig is the acceptance test for gaps 1, 4 and 5. (B.)
8. **"One camera" means one per view.** Editor panes, split screen and inset views each need their own arbiter and rig state. (A3.9.)
9. **Rig state in target-relative form; local up; projection as rig output.** Needed for the planet and for double precision. Add altitude-proportional speed with a minimum rate, altitude-dependent mode switches, and van Wijk style transitions for long strategy and planet moves. (A4.)
10. **Decide and write down the rig model.** Either rig types are engine C code and data only holds numbers (GTA III, SuperTuxKart style), or a rig is a data-defined ordered list of behaviour blocks (O3DE, Cinemachine style). "Parameter set" implies the first; say so explicitly. (A2.)
11. **D81: add a composed shot, not only a zoo.** A zoo shows materials in isolation. A visual target shows what the game looks like from the game camera. Add one small composed corner to the M2 scene and review it at the camera distances of all four game types (street level, city builder, strategy, orbit). The review-at-four-distances part is my inference from the TF2 read-hierarchy rules; no source states it for a multi-genre engine. (C1, C3.)
12. **D81: call M2 a first approval, not a style lock.** In the sources a visual target normally includes a character, and the style guide stays a living document. Add a second approval when the M3 character stands in the same scene and lighting. Keep the approved images and parameters as the style reference. (C1, C3.)
13. **D82: build character v0 on a skeleton and pass pose tests.** Even with no animation system until M9, v0 should have joints, skin weights and five or six stress poses (crouch, arms up, twist, stride) rendered for review, plus the silhouette and value-gradient checks from TF2. (C3.)

### (c) Contradictions with the decisions

1. **D84 says a rig is a parameter set evaluated by a pure-looking function. Practice says no.** Every surveyed system is stateful and has an arbiter that blends several rigs. As written, `eng_camera_rig_eval(rig, world, dt)` cannot implement damping, occlusion hold times, recentering or blends unless `rig` secretly carries state. This is a wording and interface problem, not a problem with the "one camera plus rigs" idea.
2. **D84 says the editor uses the same rigs as the game.** The mechanism can be shared (Cinemachine and Unreal do this), but Bevy, the one engine that ships first-party controllers, says they are for development and "unlikely to be useful for normal game logic". Expect separate parameter sets, and expect the editor fly camera to ignore physics and geometry while game rigs must not.
3. **D82 defers all animation to M9. Practice tests deformation as soon as a character exists.** Blender Studio, Blizzard and Valve all validate characters on a rig or in motion before production. A static v0 leaves the largest character risk (topology and joint placement that deform badly) hidden for six milestones, and may force a rewrite of the generator at M9. This is a partial contradiction; gap 13 removes it.
4. **D81: no contradiction found.** One caveat: there is no documented case of a studio being misled by grey-box lighting; the support is indirect (how ramp shading and painted textures combine, and how engines treat grey lighting as a diagnostic view).
5. **Chase camera cancellation: no contradiction, one caveat.** The claim "the car camera is known to be hard" has only one explicit source (Criterion's talk abstract) and one implicit one (the size of the GTA III camera code). It is not a well-documented field; that is itself the reason a long study would return little.
