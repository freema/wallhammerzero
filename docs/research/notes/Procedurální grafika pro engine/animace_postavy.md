# Procedural animation and procedural characters (no keyframes, no mocap) for a C17 open-world engine

Scope: how a small team gets convincing human and animal motion, and character bodies, from code plus parameters plus seed. Target engine: C17, SDL3 + SDL_GPU, job system, physics probably Jolt via the C wrapper joltc. Reference point: GTA IV / RAGE with NaturalMotion Euphoria.

Note on sourcing: claims under "Cited Findings" come from pages fetched or search results reviewed in this session (Nov 2026). Under "Inferences", lines marked **[eng]** are standard engineering or math knowledge that was not re-verified against a fetched source in this session. They are included because the report needs concrete algorithms, but the writer should treat them as the researcher's own engineering notes, not as cited facts.

---

## 1. Procedural locomotion (Overgrowth, Rain World, Spore, gait and foot placement)

### Takeaway
Shipped indie precedent shows that a very small set of key poses, interpolated with springs and corrected by IK and physics, is enough for fluid humanoid motion (Overgrowth). Bodies made of a few physics points with cosmetic limbs placed procedurally are enough for creatures (Rain World). Spore is the only shipped AAA system that retargets authored "semantic" motion to arbitrary morphologies. For a no-keyframe engine, the realistic route is Overgrowth-style: hand-coded poses as data (joint angles in code or tiny tables), then springs, procedural gait, foot IK and a physics layer.

### Cited Findings
- **David Rosen, "Animation Bootcamp: An Indie Approach to Procedural Animation", GDC 2014 (Wolfire Games, Visual Arts track).** The video is free on GDC Vault. — [GDC Vault](https://gdcvault.com/play/1020049/Animation-Bootcamp-An-Indie-Approach)
- The talk covers "simple procedural techniques" for "interactive and fluid animations using very few keyframes", with examples from Overgrowth, Receiver and Black Shades. Rosen's thesis: "We really need animation and code to work more closely together." The session is about 30 minutes. — [Game Developer](https://www.gamedeveloper.com/design/video-an-indie-approach-to-procedural-animation)
- Secondhand forum reports (not primary; verify against the video): Overgrowth character animation uses about **13 keyframes in total**, and a run cycle uses about 3 keys, with the rest computed in engine. Interpolation between poses is described as **spring-like rather than linear**. Rosen reportedly says the leg IK needs no "complex inverse kinematic computation… that's just trigonometry". One commenter says Wolfire programmed the physics "responsiveness" first and then layered animation on top. — [Unity Discussions thread](https://discussions.unity.com/t/an-indie-approach-to-procedural-animation-gdc-video-talk/538228); [Handmade Network thread "Coding Animations using Very Few Keyframes"](https://hero.handmade.network/forums/code-discussion/t/2522/p/12898); [Urho3D port discussion](https://discourse-urho3d.github.io/t/implementing-wolfires-procedural-animation-in-urho/2077)
- **Rain World, GDC 2016 Animation Bootcamp: Joar Jakobsson and James Therrien.** The talk is a "detailed breakdown" of the procedural animation process, covering what is "great (and tough)" about it. It is free on the GDC YouTube channel. — [Game Developer](https://www.gamedeveloper.com/art/video-animating-i-rain-world-i-and-its-many-squishy-stretchy-creatures)
- **Rain World slugcat:** the body is **two spherical physics chunks held at a fixed distance**, which lets it tumble and rotate. **Limbs and tail are cosmetic**, drawn on top of the chunks and procedurally animated from player inputs. Joar: "I never really set out to do procedural animation… since code is how you make things move in a computer game, that's what I did." He started with a mix of classical and procedural animation and moved mostly to procedural. — [Unity blog: Exploring procedural design in Rain World: The Watcher](https://unity.com/blog/exploring-procedural-design-rain-world)
- **Rain World creatures are "created almost entirely from scripts, except for sprites"**. Morphologies differ widely (stubby legs, spider legs, fins, jet propulsion, tentacles, wings), so most creatures need unique body-formation and movement code. A few shared base scripts handle collision, health, held items and save/load. AI is modular (PreyTracker, ThreatTracker, FriendTracker, ItemTracker, DenFinder, DiscomfortTracker). — [Unity blog](https://unity.com/blog/exploring-procedural-design-rain-world)
- Secondary descriptions (not primary): each Rain World creature is a collection of physics points, for example a Lizard's body, head, legs and tail, or a Daddy Longlegs' core and tentacles, driven by the creature's own motion, body constraints and terrain physics. Tentacles use simple "stick and bead" physics with grab/release decisions for climbing. — [Hand and Machine course note](https://handandmachine.org/classes/computational_fabrication/2024/08/26/introduction-logan-sullivan/); [80.lv summary of the Curious Archive video](https://80.lv/articles/a-look-at-complex-ecosystem-of-rain-world/)
- **Spore: Hecker, Raabe, Enslow, DeWeese, Maynard, van Prooijen, "Real-time Motion Retargeting to Highly Varied User-Created Morphologies", SIGGRAPH 2008, ACM TOG 27(3), DOI 10.1145/1360612.1360626.** Animators author motion against meta-level descriptions of body parts rather than a fixed skeleton. Motion is stored in a morphology-independent form that preserves structural relationships and style. At runtime the generalized motion produces pose goals for each specific creature, and a robust, tunable IK solver (with preconditioners for natural poses) resolves them. — [chrishecker.com paper page (site was down at fetch time)](https://chrishecker.com/Real-time_Motion_Retargeting_to_Highly_Varied_User-Created_Morphologies); [Chalmers-hosted PDF](https://www.cse.chalmers.se/edu/year/2011/course/TDA361/Advanced%20Computer%20Graphics/027-hecker%20copy.pdf); [SIGGRAPH history](https://history.siggraph.org/?p=112832); [dblp](https://dblp.dagstuhl.de/rec/journals/tog/HeckerREDMP08.html)

### Inferences
- The Overgrowth recipe maps directly onto "programs + parameters + seed". Store a handful of poses (idle, crouch, about 2 to 4 run or walk extremes, jump up and down, a few combat poses) as joint-angle tables generated by code. Blend them by a gait phase. Drive the result through critically damped springs (section 4), then foot and hand IK (section 3), then an optional physics layer (section 2). This is the cheapest path to "good enough" humans with no artists.
- Spore's core idea (author motion against semantic markers such as "foot", "hand", "spine end", then solve with IK per morphology) is the right abstraction for procedural animals and creatures. Write gaits once per locomotion class (biped, quadruped, hexapod), parameterized by limb count, limb lengths and phase offsets, rather than per species.
- **[eng] Procedural gait core (standard technique, widely used in indie procedural creatures):**
  1. A global gait phase φ ∈ [0,1) advances at a rate set by speed and stride length (stride ≈ k · leg length · f(speed)).
  2. Each leg has a phase offset (biped 0 / 0.5; quadruped walk about 0, 0.5, 0.25, 0.75; trot uses diagonal pairs in sync; hexapod uses an alternating tripod) and a duty factor (share of the cycle in stance, about 0.6 to 0.7 for walk and under 0.5 for run).
  3. In stance the foot is locked at its world contact point. In swing the foot travels from liftoff to a predicted landing point: body position + velocity · (remaining swing time + half stance time) + the leg's rest offset. Ground height comes from a raycast down from that point. The swing arc is a parabola or sine bump, with height scaled by speed and obstacle height.
  4. Hips and pelvis bob vertically at 2× gait frequency, sway laterally at 1× frequency (biped), lean into acceleration, and bank on turns. Each of these is a spring on a procedural target.
  5. Leg IK (two-bone) then solves hip → foot. Knee pole vector = body forward (biped) or per-leg configuration (insects and spiders).
  6. Alternative for creatures with many legs: "step when too far". Each foot stays planted until its distance from its ideal rest position exceeds a threshold, and the opposite or adjacent leg group may not step at the same time. This is the common "procedural spider" approach. It is robust on uneven terrain and needs no phase clock.
- **[eng]** Rain World's lesson for a 3D game is to separate the **physical body** (a few chunks or capsules that collide and are steered by AI) from the **visual body** (limbs, tail and head solved procedurally to look plausible). Cheap NPCs and animals at distance can then be 2 to 3 physics points plus a cosmetic skeleton.

### Gaps
- No transcript or slides of the Rosen GDC 2014 talk were fetched. The "13 keyframes", "spring interpolation" and "just trigonometry IK" details are secondhand forum claims. Watch the GDC Vault video to verify.
- The Rain World GDC 2016 talk content (beyond the Unity blog interview) was not transcribed. Technical specifics such as the limb IK method and the tentacle constraint solver are unconfirmed.
- I could not confirm whether Spore's IK solver is "particle-based". The paper's full text (Chalmers PDF) should be read to settle the solver details.
- The Wolfire blog's 2008 procedural animation posts were referenced in forum threads but not retrieved.

---

## 2. Physics-based animation (Euphoria, active ragdolls, PD control, SIMBICON, DeepMimic)

### Takeaway
Euphoria is proprietary, has been out of licensing since 2017 and has no public internals. What is publicly known is that it simulates body, muscles and a "motor nervous system" in real time. Its public, reproducible core consists of PD-driven joint motors tracking a target pose, plus balance and reaction behaviours. With Jolt, a small team can build an "active ragdoll" layer: ragdoll bodies with motorized swing-twist joints that drive to the animation pose, with stiffness blended down on impact. That is the realistic path (Uncharted 4 used a similar "physics on top of animation" layer). Fully physics-driven locomotion (SIMBICON) is research-proven but fragile. Learned controllers (DeepMimic) need reference motion and an RL training pipeline, so they are not feasible without data.

### Cited Findings
- **Euphoria** (NaturalMotion) is built on "Dynamic Motion Synthesis", "based on a full simulation of the 3D character, including body, muscles and motor nervous system". It synthesizes actions and reactions in real time instead of playing predefined animations. It was claimed to be compatible with all commercial physics engines. — [Wikipedia: Euphoria (software)](https://en.wikipedia.org/wiki/Euphoria_(software))
- Rockstar and NaturalMotion announced a partnership in **February 2007**. GTA IV was Rockstar's first Euphoria game, and Red Dead Redemption was the second. Euphoria is **integrated into the RAGE source code** and is used in GTA V, RDR2 and Max Payne 3. Other users were Star Wars: The Force Unleashed I and II and Backbreaker (real-time tackles instead of animations). — [Wikipedia](https://en.wikipedia.org/wiki/Euphoria_(software))
- **In 2017 NaturalMotion ended licensing of Euphoria** and its other technology to focus on mobile games. — [Wikipedia](https://en.wikipedia.org/wiki/Euphoria_(software))
- GTA IV example: NaturalMotion CEO Torsten Reil said the drunk character in the drinking minigame "stumbles around" and that "all of that is fully simulated", synthesized on the CPU rather than played back. — [bit-tech](https://bit-tech.net/news/gaming/gta_iv_drinking_mini-game_detailed/1)
- Wikipedia does not describe how Euphoria behaviours work internally. — [Wikipedia](https://en.wikipedia.org/wiki/Euphoria_(software))
- **Naughty Dog, "Physics Animation in Uncharted 4: A Thief's End", GDC 2017, Michal Mach.** They added a physics simulation layer on top of gameplay animation for fluidity and momentum. The talk explains "how to drive physics objects with animation more predictably, with minimal distortions and almost absolute artistic control". — [GDC Vault](https://gdcvault.com/play/1024087/Physics-Animation-in-Uncharted-4); [80.lv](https://80.lv/articles/gdc-physics-animation-in-uncharted/); [gdconf news](https://www.gdconf.com/news/see-naughty-dog-deconstruct-uncharted-4s-physics-animation-gdc-2017)
- **SIMBICON: Yin, Loken, van de Panne, ACM TOG 26(3) art. 105, SIGGRAPH 2007.** It produces many gaits and styles in real time (walking in all directions, running, skipping, hopping). It uses a finite state machine / pose control graph: each state is a target pose, and joints track it with PD control. Balance feedback continuously adapts using the **position and velocity of the centre of mass**, and the **hip midpoint is a simple, effective COM proxy**. **Swing-foot placement is the main balance lever.** The authors note bipeds are "unstable, underactuated, high-dimensional dynamical systems". — [UBC project page](https://cs.ubc.ca/~van/papers/Simbicon.htm); [paper PDF](https://www.cs.ubc.ca/~van/papers/2007-siggraph-simbicon.pdf); [SIGGRAPH history](https://history.siggraph.org/?p=115414)
- **DeepMimic: Peng, Abbeel, Levine, van de Panne, SIGGRAPH 2018 (ACM TOG), arXiv 1804.02717.** Deep RL learns policies that imitate example clips (mocap, keyframed or retargeted) while achieving task goals, learning recoveries and adapting to morphology changes. Characters included a human, Atlas robot, T-rex and dragon. **It requires reference motion clips.** The paper emphasizes that incorporating the reference data into a phase-aware policy is central to natural behaviour. — [arXiv](https://arxiv.org/abs/1804.02717v2); [project page](https://xbpeng.github.io/projects/DeepMimic)
- **Jolt Physics** (C++): constraints support motors through `MotorSettings`, with states `Off`, `Velocity`, `Position` and `PositionAndVelocity`. Spring behaviour is set via `MotorSettings::mSpringSettings` (stiffness/damping or frequency/damping modes). `SwingTwistConstraint` "approximates the shoulder joint of a human". Ragdolls own their constraints, and `GroupFilterTable` suppresses collisions between linked ragdoll parts. `CharacterVirtual` is the advanced character controller (`ExtendedUpdate` handles stair stepping and ground sticking). — [Jolt Physics docs](https://jrouwe.github.io/JoltPhysics/)
- **joltc (C wrapper)** is a sound C wrapper around current Jolt with opaque handles, not part of a larger binding project. It exposes ragdoll APIs, including `JPH_Ragdoll_DriveToPoseUsingMotors`, which drives only swing-twist and hinge parts and requires `JPH_RagdollSettings_CalculateBodyIndexToConstraintIndex` to have run, and `JPH_Ragdoll_RemoveFromPhysicsSystem`. (Info from the Rust crate oxijolt-sys, which binds joltc for Jolt 5.6.0.) — [JoltC GitHub](https://github.com/SecondHalfGames/JoltC); [oxijolt-sys docs](https://docs.rs/oxijolt-sys/latest/oxijolt_sys/)
- Human: Fall Flat (No Brakes Games) and Gang Beasts (Boneloaf) are described as "procedural animation and ragdoll physics" games, but **no developer technical breakdown was found**. One indie dev describes their own active ragdoll as "a mix of techniques from a talk about Overgrowth and research into IK & PID controllers but applied to fully physics based ragdoll". — [itch.io post](https://itch.io/post/11835); [Double Fine Gang Beasts page](https://www.doublefine.com/news/double-fine-presents-gang-beasts)

### Inferences
- **Recommended architecture ("Euphoria-lite"), in three tiers:**
  1. **Kinematic procedural pose** (section 1) is the default for all NPCs. It is cheap and deterministic.
  2. **Powered ragdoll overlay** for hits, stumbles, pushes and vehicle impacts. The ragdoll follows the kinematic pose through joint motors (Jolt `DriveToPoseUsingMotors`, or kinematic drive for the root). On impact, lower motor stiffness per region (for example the hit arm goes limp for 0.3 s), then ramp it back while a balance check decides between "recover" (blend back to kinematic) and "fall" (full ragdoll, then get-up).
  3. **Balance behaviours** (a "stagger" step generator). When the projected COM leaves the support polygon, trigger a procedural step toward the capture point (see the [eng] note below), which reuses the gait foot planner. This is essentially SIMBICON's swing-foot-placement idea applied to a kinematically stepped character with physics only in the upper body.
- Keep the root and locomotion **kinematic** (CharacterVirtual capsule) and use physics only for reactions. Fully physics-driven locomotion (Toribash or QWOP style) is fun as a gameplay mechanic but is the wrong default for a GTA-like open world. Uncharted 4 and GTA both layer physics on top of animation rather than replacing it.
- **[eng] PD joint control:** τ = kp · (θ_target − θ) − kd · ω. In practice use quaternion error axis-angle for 3D joints, and scale gains by the effective inertia of the subtree below the joint, or use Jolt's frequency/damping spring mode, which is mass-normalized and avoids tuning kp/kd per limb. "Stable PD" (Tan, Liu and Turk, 2011, not fetched) allows high gains at large timesteps. Jolt's constraint-solver motors are implicit, so they are already stable.
- **[eng] Capture point** (linear inverted pendulum): x_cp = x_com + v_com · sqrt(h / g). Stepping onto or just beyond the capture point stops the fall. This is a cheap, stable rule for procedural stagger steps and pairs with SIMBICON's d and v feedback (swing hip target += c_d · d + c_v · v).
- **DeepMimic without mocap:** it can technically imitate *keyframed* or procedurally generated reference motion (the paper lists keyframed clips). In principle the procedural gait from section 1 could serve as the reference, and RL would then add physical plausibility and recoveries. But this requires a Python RL training stack (PyTorch etc.), GPU hours, and runtime neural-network inference in C (small MLPs are trivial to run in C17). This is high risk and high reward, and not recommended for a v1.
- Physics library: Jolt is C++17. joltc gives C17 access, including ragdoll motor drive, so active ragdolls are feasible from C with no C++ in the engine's own code.

### Gaps
- No public technical description of Euphoria internals (behaviour tree, controller types, solver) was found. Any claim beyond "real-time body/muscle/nervous-system simulation" is speculation.
- The Uncharted 4 talk's actual method (for example per-joint motor strengths, or how "distortions" are avoided) was not retrievable without the video.
- No sourced technical write-ups for Human: Fall Flat, Gang Beasts, Toribash or Exile were found.
- Ubisoft "character physics" GDC talks were not located in this session.
- Stable PD (Tan et al. 2011) and capture-point literature were not fetched.

---

## 3. IK solvers (two-bone, CCD, FABRIK, full-body, look-at, spine)

### Takeaway
Analytic two-bone IK (legs and arms) plus FABRIK for longer chains (spines, tails, tentacles, necks) plus a simple look-at rotation chain covers almost every need of a procedural character. All three are small, dependency-free routines that are easy to write in C17. Full-body IK can be approximated by solving limbs first and then adjusting the pelvis and spine, or with a FABRIK multi-end-effector pass.

### Cited Findings
- **FABRIK: Aristidou and Lasenby, "FABRIK: A fast, iterative solver for the Inverse Kinematics problem", Graphical Models 73(5):243–260, 2011, DOI 10.1016/j.gmod.2011.05.003.** It avoids rotation angles and matrices and finds each joint position by locating a point on a line. It is claimed to need less processing time and fewer iterations than popular alternatives, to produce smooth postures without oscillation, and to support constraints and **multiple chains with multiple end effectors**. — [Author page](https://www.andreasaristidou.com/FABRIK); [PDF (LIRIS teaching copy)](https://perso.liris.cnrs.fr/alexandre.meyer/teaching/master_charanim/M2_3_video_IK_Procedurale/FABRIK.pdf)
- FABRIK has two phases: a backward pass (snap the end effector to the target and propagate toward the root, keeping bone lengths) and a forward pass (re-anchor the root and propagate outward). — [Vulkan docs tutorial: FABRIK](https://docs.vulkan.org/tutorial/latest/Advanced_glTF/Procedural_Animation_IK/03_fabrik.html)
- Daniel Holden's "Simple Two Joint IK" article gives a two-bone IK explanation with a C-style implementation and is widely used as a reference by Godot and Roblox developers. — [theorangeduck.com/page/simple-two-joint](https://theorangeduck.com/page/simple-two-joint) (referenced via [Godot write-up](https://hashnode-hub.vercel.app/posts/676455e3d15c46bd6b364661) and [Roblox devforum](https://devforum.roblox.com/t/2-joint-2-limb-inverse-kinematics/252399))
- Rosen (secondhand): Overgrowth leg IK was "just trigonometry", that is, analytic two-bone. — [Unity Discussions](https://discussions.unity.com/t/an-indie-approach-to-procedural-animation-gdc-video-talk/538228)
- Spore relied on a custom robust IK solver with preconditioners for natural poses across arbitrary morphologies. — [Chalmers PDF](https://www.cse.chalmers.se/edu/year/2011/course/TDA361/Advanced%20Computer%20Graphics/027-hecker%20copy.pdf); [paperdecoder summary](https://paperdecoder.blogspot.com/2008/07/real-time-motion-retargeting-to-highly.html)

### Inferences
- **[eng] Two-bone analytic IK** (bones a = |hip→knee| and b = |knee→ankle|, c = clamp(|hip→target|, ε, a+b−ε)):
  - Knee interior angle from the law of cosines: cosK = (a² + b² − c²) / (2ab). Hip offset angle: cosH = (a² + c² − b²) / (2ac).
  - Rotate the hip so the chain plane contains the pole vector (knee hint), rotate the hip toward the target by H, then set the knee to π − K. Clamp c slightly under a+b to avoid knee "snap" when straight. Optionally soften the reach near full extension.
  - Finish by matching the foot orientation to the ground normal and blending the result with the FK pose by an IK weight (spring-smoothed).
- **[eng] CCD** iterates from the end effector to the root, rotating each joint so the effector points toward the target. It is simple, but it tends to curl the distal joints first, which looks unnatural for spines. It is fine for tails or tentacles with per-joint angle limits and damping.
- **[eng] FABRIK** works on positions, so apply it to spines, necks, tails, tentacles and spider legs with many segments. Afterwards, convert positions back to rotations (each bone's rotation = shortest arc from the rest direction to the new direction, plus twist carried from the parent). Joint limits are applied as cone projections per step. Multi-effector FABRIK (for example both hands plus the head target on one spine) handles "hands on steering wheel plus look at the road" cases.
- **[eng] Look-at:** distribute the required yaw and pitch across spine2, spine3, neck and head with weights (for example 0.1 / 0.15 / 0.25 / 0.5), clamp each, and smooth the target with a critically damped spring so the gaze settles naturally. Saccades: snap eyes instantly, then the head follows with a spring (halflife about 0.15 s).
- **[eng] Hand placement** (door handles, steering wheels, weapons, ledges): two-bone IK on the arm with the elbow pole placed down and out, plus a spine lean adjustment when the target is beyond reach.
- **[eng] Pelvis adjustment for foot IK on slopes:** lower the pelvis by max(0, the larger per-foot height deficit), so the lower foot can reach without hyper-extension, and smooth it with a spring. This is the standard trick that makes stairs and slopes look right.
- **[eng] Full-body IK:** for a no-artist engine, a staged solver (pelvis → feet → spine look-at → hands) is far simpler than a Jacobian or optimization FBIK and is what most shipped games use. C++-only options (for example Unity's or Unreal's FBIK) are not usable, so writing these in C is low-effort.

### Gaps
- The Holden two-joint article itself was not fetched (it is referenced by multiple secondary sources). The full text of the FABRIK paper was not fetched.
- No shipped-game GDC talk on full-body IK was retrieved in this session.

---

## 4. Secondary motion (springs, verlet chains, jiggle, cloth-lite)

### Takeaway
Use exact, unconditionally stable critically damped springs (parametrized by **halflife**) for everything that "follows" a target: pose blending, IK weights, look-at, root smoothing, inertialization offsets. Use verlet / position-based chains for tails, hair, cloth strips, antennae and loose gear. Holden's "Spring-It-On" article gives drop-in formulas that translate trivially to C.

### Cited Findings
- **Holden, "Spring-It-On: The Game Developer's Spring-Roll-Call"** gives exact closed-form spring-damper updates that stay stable at large dt and stiffness, unlike explicit Euler. — [theorangeduck.com/page/spring-roll-call](https://theorangeduck.com/page/spring-roll-call)
  - Halflife parametrization: `damping = (4 · ln2) / (halflife + eps)`, where `4·0.69314718056 / (halflife + 1e-5)`.
  - Critically damped spring with a zero-velocity goal (`simple_spring_damper_exact`): `y = damping/2; j0 = x − x_goal; j1 = v + j0·y; e = exp(−y·dt); x = e·(j0 + j1·dt) + x_goal; v = e·(v − j1·y·dt)`.
  - The variant with goal velocity q: `c = g + d·q / (d²/4)`, then the same with `j0 = x − c`.
  - Decay spring for inertialization: `j1 = v + x·y; x = e·(x + j1·dt); v = e·(v − j1·y·dt)`. This needs no stored transition time. It is the "fastest, branchless" variant and suits per-bone offsets when all bones share the same halflife and dt.
  - Uses: smoothing and filtering noisy signals, **character controllers** (spring on desired velocity, which also predicts the future trajectory by evaluating at later dt), **inertialization** (record the source-to-destination offset at the transition and decay it), velocity springs with lag compensation `halflife / ln2`, timed springs, and spline-like interpolation.
  - Performance: replace `expf` with a rational `fast_negexp` approximation, and precompute `y` and `e` when many springs share halflife and dt.
- A critically damped spring "converges as fast as possible towards its state of equilibrium without overshooting and/or oscillating" (Unreal's `FCriticalDamper` is an engine example). — [Unreal Engine API docs](https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/GameplayCameras/FCriticalDamper)
- Rain World tentacles use simple stick-and-bead physics (a verlet-like chain) (secondary source). — [80.lv / Curious Archive summary](https://80.lv/articles/a-look-at-complex-ecosystem-of-rain-world/)

### Inferences
- **[eng] Verlet chain** (tails, ponytails, straps, cloth strips): positions p and previous positions p_prev. Integrate `p' = p + (p − p_prev)·damping + a·dt²`. Then iterate a few constraint passes: distance constraints between neighbours, an optional "stiffness to rest pose" constraint that pulls each particle toward its animated position with weight w, and collision against capsules of the body (thighs, torso). Pin particle 0 to the animated bone. This is cheap, so thousands of chains can be batched as SoA jobs.
- **[eng] Jiggle bones** (belly, cheeks, breasts, backpacks, antennae): one critically damped or under-damped spring per bone on the *world-space* position of a virtual tip, then re-aim the bone at the tip. Under-damped springs (Holden's article also covers the general damped spring) give a wobble. Clamp the displacement.
- **[eng] Cloth-lite:** a coarse particle grid (for example 4×8 for a skirt or coat tail) with distance constraints and capsule collision, skinned to a high-res mesh by barycentric or bone-like weights. Full cloth simulation is not needed for an open-world NPC crowd. Use LOD to turn it off at distance.
- Overgrowth-style "spring interpolation" between key poses is exactly the critically damped spring applied per joint (on quaternion log or axis-angle offsets). This is what makes few-pose animation feel fluid and responsive.

### Gaps
- No talks on secondary motion from shipped AAA games (for example hair or cloth-lite in GTA or RDR) were retrieved in this session.

---

## 5. Daniel Holden / Ubisoft La Forge (motion matching, learned motion matching): what applies without mocap

### Takeaway
Motion matching and Learned Motion Matching (LMM) fundamentally require a large motion-capture database, so they do not apply directly. The **surrounding tooling** transfers completely: spring-based character controllers and trajectory prediction, inertialization, critically damped smoothing, two-bone IK, and data-oriented pose representation. One path that uses no captured data: procedurally *generate* a motion database from your own procedural animator and then motion-match over it, though this adds little over directly evaluating the procedural generator.

### Cited Findings
- **Holden, Kanoun, Perepichka, Popa, "Learned Motion Matching", SIGGRAPH 2020, ACM TOG, DOI 10.1145/3386569.3392440.** Holden and Kanoun were at Ubisoft La Forge, the others at Concordia University. It decomposes motion matching into its steps and replaces each with a learned, scalable alternative. The final model does not need to store animation data. — [PDF on theorangeduck.com](https://www.theorangeduck.com/media/uploads/other_stuff/Learned_Motion_Matching.pdf); [Ubisoft La Forge blog](https://www.ubisoft.com/en-us/studio/laforge/news/3NWqwcMU9lMfumgfPAEfka/learned-motion-matching); [SIGGRAPH history](https://history.siggraph.org/?p=78733)
- A later paper notes that LMM reduced memory requirements but increased performance cost. — [Search summary of SIGGRAPH/ACM listing](https://unpaywall.org/10.1145%2F3623264.3624442)
- Holden is now Principal Animation Programmer at Epic Games, and his research focus is machine learning and character animation. — [theorangeduck.com/page/about](https://theorangeduck.com/page/about)
- The Spring-It-On article's **controller** section (spring on desired velocity, with future trajectory prediction by evaluating the spring at future times) and **inertialization** section work independently of mocap. — [Spring-Roll-Call](https://theorangeduck.com/page/spring-roll-call)

### Inferences
- **Reusable without mocap:**
  - The spring-damper character controller (smooth acceleration, turning, and predicted trajectory for foot-placement planning and pelvis leaning).
  - Inertialization (decay spring) for all procedural state switches, for example walk → stagger → ragdoll recovery → get-up. It removes the need to evaluate two poses during a crossfade, which halves blend cost.
  - The data-oriented idea that a pose is a flat array of local transforms (SoA), and that features are small vectors.
- **Not reusable:** the motion matching search and the LMM networks (they need captured or keyframed databases).
- If a learned approach is ever desired, the only no-mocap option is to train on the procedural generator's own output. That gains little realism, because the network can only learn what the generator already does.

### Gaps
- The LMM paper's component names (compressor, stepper, projector, decompressor) and memory figures were not verified from fetched text in this session (the Ubisoft blog mentions a "Decompressor").
- Holden's "Code vs Data Driven Displacement", "Dead Blending" and other articles were not found or fetched.

---

## 6. Procedural character bodies (parametric meshes, skeletons from parameters, auto-skinning, SDF characters, faces)

### Takeaway
Three viable strategies, in increasing order of procedural purity:
- **(A)** A parametric base mesh with additive morph targets (MakeHuman-style). Highest quality, but you need one base mesh and targets. MakeHuman's exports are CC0, but its targets are AGPL, so you must author your own targets procedurally.
- **(B)** A skeleton generated first from parameters, then a body mesh generated around it (swept or metaball/SDF limbs, polygonized), skinned automatically with heat-diffusion (Pinocchio) or geodesic voxel binding (Dionne and de Lasa). The binding is trivial because you know which primitive came from which bone.
- **(C)** SDF bodies rendered or meshed at runtime, each primitive attached to a bone.

For "programs + parameters + seed", **(B)** is the best fit. Generate skeleton → mesh, and the skinning weights fall out of construction.

### Cited Findings
- **MakeHuman:** the software and database are **AGPL**. Models exported from an official version are **CC0** (an exception). All targets in the base distribution are AGPL, and any target derived from them must be AGPL unless the author grants permission. A target stores vertex offsets from the base model (`base.obj`) for a feature, in a `.target` file. The base mesh is quads-only and subdivision-friendly, by Manuel Bastioni (2013). — [MakeHuman docs: targets](https://static.makehumancommunity.org/assets/creatingassets/maketarget/targets.html); [MakeHuman old docs dump](https://static.makehumancommunity.org/oldsite/documentation/big_dump_from_drupal.html); [Wikipedia: MakeHuman](https://en.wikipedia.com/wiki/Makehuman)
- **Pinocchio: Baran and Popović, "Automatic Rigging and Animation of 3D Characters", SIGGRAPH 2007.** Given a static mesh and a generic skeleton, it fits the skeleton (discrete plus continuous optimization, with learned penalty weights) and computes skinning weights from bone proximity **smoothed by a diffusion equilibrium (heat) equation over the surface**, for linear blend skinning. It typically rigs a character in under a minute. It correctly auto-rigged 13 of 16 unseen bipeds, and the other 3 needed one joint hint. — [Paper PDF](https://people.csail.mit.edu/ibaran/papers/2007-SIGGRAPH-Pinocchio.pdf); [CSAIL abstract](https://publications.csail.mit.edu/abstracts/abstracts07/ibaran/ibaran.html)
- **Dionne and de Lasa, "Geodesic Voxel Binding for Production Character Meshes", SCA 2013, pp. 173–180.** It is fully automatic weight computation for LBS-style skinning. It handles non-manifold, non-watertight, self-intersecting and multi-component meshes. It voxelizes the mesh, then computes weights from **geodesic distance between bone voxels and all non-exterior voxels**. It runs at interactive rates with no iteration parameters or costly optimization. The 2014 IEEE TVCG version uses **sparse voxelization**. — [Eurographics DL](https://diglib.eg.org/handle/10.2312/15001); [video](https://vimeo.com/69268846)
- RigNet (2020) cites Pinocchio as the earliest automatic rigging approach and outperforms purely geometric methods (it is a learned method). — [RigNet arXiv](https://arxiv.org/pdf/2005.00559v1)
- Spore (shipped): user-created arbitrary morphologies were animated in real time from generalized motion, which shows that procedural bodies plus procedural or semantic animation can ship at scale. — [Chalmers PDF](https://www.cse.chalmers.se/edu/year/2011/course/TDA361/Advanced%20Computer%20Graphics/027-hecker%20copy.pdf)

### Inferences
- **[eng] Skeleton from parameters:** the input is a parameter vector (height, limb ratios, shoulder width, hip width, mass, age, sex dimorphism weights, plus seed for small asymmetries), and the output is joint rest positions. Use anthropometric proportions (for example a total of about 7.5 head heights for adults, legs about 0.47–0.5 of height) as defaults. Animal templates (quadruped, bird, insect) use the same pipeline with different templates. Everything downstream (gait stride, IK chain lengths, ragdoll capsule sizes, mass per segment) is derived from the same parameters, so animation automatically fits the body.
- **[eng] Body mesh from skeleton:** options include
  - swept generalized cylinders per bone, with radii from parameter curves (cross-section profiles for thigh, calf, torso), joined at joints by blending;
  - an implicit/SDF union of capsules and ellipsoids with smooth-min (k controls "fleshiness"), polygonized via dual contouring or marching cubes at load time, then decimated;
  - morph-target deformation of a single procedural base mesh.

  Skinning weights for SDF or metaball bodies can come from the smooth-min blend factors themselves: each primitive belongs to a bone, so the normalized contribution of each primitive at a vertex is the weight. This is an alternative to Pinocchio or geodesic binding that requires no solver.
- If arbitrary or imported meshes are ever needed, geodesic voxel binding is simpler to implement in C than Pinocchio's surface heat diffusion (which needs a sparse Laplacian solve), and it is robust to messy geometry.
- **SDF characters rendered directly** (raymarching per skinned primitive): feasible for a stylized look, but expensive for an open-world crowd. Meshing at load time is the safer choice.
- **[eng] Faces:** a stylized face can be a small set of procedural blendshapes (jaw open, smile L/R, brow raise L/R, blink L/R, a few visemes) generated as vertex displacement fields over the face region (for example radial falloff around landmark points). Drive them with procedural expressions: emotion = weighted blend, plus Perlin-noise micro-motion, blinks every 2–6 s with randomization, eye saccades, and lip flaps from audio amplitude or text-driven visemes.
- MakeHuman's AGPL targets cannot be used in a closed engine. Its CC0 *exports* (fixed meshes) could be used as reference or base meshes, but the parametric morph system would have to be re-authored.

### Gaps
- No sourced talks were found on shipped games that generate humanoid bodies fully procedurally (beyond Spore's creature editor, which is user-authored rather than seeded).
- Sources on procedural facial expression systems in shipped games (for example FACS-based procedural rigs) were not retrieved.
- SDF-to-skinned-mesh pipelines (for example Media Molecule's Dreams) were not researched in this session.

---

## 7. Runtime architecture (animation jobs, pose blending, data layout, GPU skinning on SDL_GPU)

### Takeaway
Treat animation as a per-character pipeline of pure functions over flat SoA pose arrays: generate local pose → blend/springs → IK → physics sync → local-to-model → skinning palette. Each character is an independent job, and IK/physics sync are the sync points. ozz-animation is the reference data-oriented design, but it is C++ (MIT), so take its design and write the code in C. Upload bone matrices per frame into a GPU storage buffer and skin in the vertex shader.

### Cited Findings
- **ozz-animation** is an MIT-licensed **C++** runtime for skeletal animation (loading, sampling, blending). It is renderer- and engine-agnostic, tagged data-oriented / SoA / SIMD, and its runtime depends only on the C/C++ standard libraries (C++11 in newer versions). Offline tools import glTF/FBX/Collada. — [ozz-animation GitHub](https://github.com/guillaumeblanc/ozz-animation)
- Holden's spring article recommends branchless decay springs and shared precomputation when all bones share halflife and dt, which fits batch SoA processing. — [Spring-Roll-Call](https://theorangeduck.com/page/spring-roll-call)
- joltc exposes Jolt (C++) through a C API with opaque handles, including ragdoll pose drive, so the physics sync stage can stay in C. — [JoltC GitHub](https://github.com/SecondHalfGames/JoltC); [oxijolt-sys docs](https://docs.rs/oxijolt-sys/latest/oxijolt_sys/)

### Inferences
- **[eng] Data layout:**
  - Skeleton: `uint16_t parent[N]` (topologically sorted, so parents come before children) plus rest local transforms.
  - Pose: SoA arrays `float tx[N], ty[N], tz[N], qx[N], qy[N], qz[N], qw[N], s[N]`, or AoSoA in blocks of 4/8 for SIMD.
  - Local-to-model is a single forward loop thanks to the sort.
  - Store per-character procedural state (gait phase, foot locks, spring states, verlet particles) in separate flat arrays indexed by character, for cache-friendly batch jobs.
- **[eng] Job graph per frame:**
  1. AI/locomotion intent (velocity goal) → spring controller.
  2. Procedural pose generation per character (parallel).
  3. Ground raycasts for foot placement (batched physics queries).
  4. IK and look-at (parallel).
  5. Write ragdoll motor targets → physics step (Jolt's internal job system, or adapt it to the engine's job system via joltc's job system hooks if exposed — **verify**).
  6. Read back ragdoll body transforms → blend with the kinematic pose.
  7. Secondary motion (verlet, jiggle).
  8. Model-space → skinning matrices (or dual quaternions) → upload.
- **LOD is essential for open-world crowds:** full procedural plus IK plus physics only near the camera. At mid distance use a gait-only update (no IK, no secondary motion) at reduced rate. At far distance use phase-only updates or impostors. Reuse the spring/inertialization machinery to hide LOD transitions.
- **[eng] GPU skinning on SDL_GPU:** SDL3's GPU API supports storage buffers readable from vertex shaders (`SDL_BindGPUVertexStorageBuffers`, buffers created with `SDL_GPU_BUFFERUSAGE_GRAPHICS_STORAGE_READ`), uploaded through transfer buffers (`SDL_UploadToGPUBuffer` in a copy pass). The typical pattern:
  - One large per-frame storage buffer holding all characters' 3×4 bone matrices (48 B per bone).
  - A per-draw base offset passed via push/uniform data (`SDL_PushGPUVertexUniformData`) or instance data.
  - A vertex shader that reads 4 bone indices and weights and skins position and normal.
  - Cycle transfer buffers per frame in flight (SDL_GPU's `cycle` flag) to avoid stalls.
  - Instancing many characters per draw is possible when they share a mesh, by indexing the palette with instance_id × bone_count.

  (These SDL3 API names are from the researcher's knowledge of the SDL3 headers and were not re-fetched in this session. Verify against the SDL3 wiki.)
- **[eng] Alternative:** a compute-shader skinning pre-pass writing skinned vertices to a buffer, so they can be reused across shadow and main passes. This is better when each character is drawn into several shadow cascades.
- **C/C++ library summary:**
  - C++ only: ozz-animation, Jolt core (but joltc is C), NaturalMotion Euphoria/Morpheme (proprietary, licensing ended 2017).
  - Plain-C, easy to write yourself: springs, two-bone IK, FABRIK, CCD, verlet, PD-motor targets, capture-point stepping, geodesic voxel binding, SoA pose pipeline.

### Gaps
- SDL_GPU storage-buffer API specifics were not verified against the SDL3 wiki in this session.
- Whether joltc exposes a custom job-system hook (to share the engine's job system) was not verified.
- No GDC talk on data-oriented animation runtime architecture (for example Bungie's, or Guerrilla's Decima) was retrieved.
