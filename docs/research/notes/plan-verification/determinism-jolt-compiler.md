# Plan verification: determinism, Jolt, joltc and the compiler

Research date: 2026-11-06. Concerns D26, D28, D42 and measurement 27 in the ROADMAP.

Source marking: **[P]** primary (documentation, source code, CI, the author's blog). **[S]** secondary (wiki, forum, a search result that I did not open directly).

## Conclusion

The claim "deterministic Jolt across OSes is unverified and expensive" **does not hold in the form in which D28 records it**. Jolt has an official option `CROSS_PLATFORM_DETERMINISTIC`. According to the documentation it costs about 8% of performance. Its CI verifies on every build the same simulation hash on macOS ARM64, Linux x64 and Windows x64, and it does so in a multithreaded run. Three things that concern us directly remain unverified: a build through clang-cl, vehicles and the path through joltc. None of them is in that CI. The joltc wrapper is alive (last commit 2026-10-15, Jolt 5.6.0, MIT) and covers vehicles, ragdoll with motors, characters and double precision. But it lacks saving and restoring the physics state (`StateRecorder`). The tier A rules (`-ffp-contract=off`, no libm, no fast-math) match what Box2D v3, Rapier and Jolt do. Several more bans need to be added to them. The reason for clang-cl (D26) stands: C11 atomics are still experimental in MSVC. I would not remove the two tiers, but I would split tier B and build the physics with the cross-platform option from the start.

## Table

| # | Item | Status | What exactly holds | Link |
|---|---|---|---|---|
| 1 | Jolt is deterministic across OSes, ARM64/x64 and compilers | **CONFIRMED** (which largely **REFUTES** the reason for tier B) | The option `CROSS_PLATFORM_DETERMINISTIC`, about −8% performance. CI compares the hash on 14 configurations including macOS ARM64, Linux x64, Windows x64. The author himself writes that it is "less tested than other features". | [P] https://jrouwe.github.io/JoltPhysics/index.html#deterministic-simulation |
| 1b | Does this also hold for clang-cl, vehicles and a build through joltc | **UNCERTAIN** | The determinism CI on Windows has only MSVC `cl`. The tested scenes are ConvexVsMesh, HighSpeed, Ragdoll, Pyramid, CharacterVirtual. A vehicle is not among them. | [P] https://github.com/jrouwe/JoltPhysics/blob/master/.github/workflows/determinism_check.yml |
| 2 | joltc is current and maintained | **CONFIRMED** | amerkoleci/joltc, MIT, 219 stars, last commit 2026-10-15, tracks Jolt v5.6.0 (released 2026-07-11). | [P] https://github.com/amerkoleci/joltc |
| 2b | joltc covers vehicles, ragdoll with motors, character, double, the determinism option | **CONFIRMED**, with one hole | Everything named is in the header. **`StateRecorder` / `SaveState` / `RestoreState` are missing.** | [P] https://github.com/amerkoleci/joltc/blob/main/include/joltc.h |
| 3 | `-ffp-contract=off` and avoiding libm are enough | **PARTLY CONFIRMED** | This is a necessary basis, not the whole list. Missing: the same FPU state on all threads, a ban on UB float→int conversions, NaN, own sorting and hashing. See below. | [P] https://box2d.org/posts/2024/08/determinism/ |
| 4a | `<stdatomic.h>` and `_Atomic` in clang-cl | **CONFIRMED at the source level**, a test on the machine is missing | Clang in C mode on MSVC deliberately uses its own `stdatomic.h`, not the MSVC header. | [P] https://github.com/llvm/llvm-project/blob/main/clang/lib/Headers/stdatomic.h |
| 4b | `<threads.h>` in clang-cl | **UNCERTAIN** | MSVC has it since VS 2022 17.8, the implementation is in `vcruntime140_threads.dll`. I found no source saying it works with clang-cl. | [P] https://devblogs.microsoft.com/cppblog/c11-threads-in-visual-studio-2022-version-17-8-preview-2/ |
| 4c | C11 atomics in MSVC are still experimental | **CONFIRMED** | The MSVC conformance page (updated 2026-10-16): "Atomic support `<stdatomic.h>`: experimental", only under `/experimental:c11atomics`. | [P] https://learn.microsoft.com/en-us/cpp/overview/visual-cpp-language-conformance |
| 4d | SDL3 and Jolt build with clang-cl | **CONFIRMED** for SDL3 and Jolt, **UNCERTAIN** for joltc | SDL has "Windows (MSVC, clang-cl x64/x86)" jobs in CI. Jolt has a "Visual Studio Clang" job with unit tests. joltc builds in its CI on Windows only with the Visual Studio generator. | [P] https://github.com/libsdl-org/SDL/blob/main/.github/workflows/create-test-plan.py |
| 5 | Strategy logic in integers and fixed-point is a reasonable choice | **CONFIRMED** as a reasonable choice | Factorio runs lockstep on floats with its own trigonometry and plays ARM against x86. Fixed-point is the more cautious path. I could not verify the internals of Paradox's engine from a primary source. | [P] https://www.factorio.com/blog/post/fff-370 |
| 6 | Bit-identical replay with physics is common practice, Jolt is deterministic even multithreaded | **CONFIRMED** | Jolt, Box2D v3 and Rapier declare and test it. Jolt's CI runs with `-t=max` (all threads of the machine) and expects the same hash. The order of callbacks from threads is not deterministic, though. | [P] https://github.com/jrouwe/JoltPhysics/blob/master/Docs/Architecture.md |

## Details on the items

### 1. Jolt and determinism across platforms

- Basic guarantee: the simulation is deterministic when the API is called in the same order and the same binary code runs. [P] https://jrouwe.github.io/JoltPhysics/index.html#deterministic-simulation
- With the option `CROSS_PLATFORM_DETERMINISTIC` the library is "about 8% slower". The result then does not depend on the compiler (tested MSVC 2022, clang, gcc, emscripten), the configuration (Debug, Release, Distribution), the OS (Windows, macOS, Linux), the architecture (x86, ARM, RISC-V, PowerPC, LoongArch) or on 32/64 bits. [P] same source
- Conditions: the same source code on all platforms and the same definitions. A build with `JPH_DOUBLE_PRECISION` cannot be mixed with one without. [P] same source
- The option turns off FMA. In the code: "FMA is not compatible with cross platform determinism". In CMake it adds `-ffp-contract=off`, and for MSVC `/fp:precise`. [P] https://github.com/jrouwe/JoltPhysics/blob/master/Jolt/Core/Core.h and https://github.com/jrouwe/JoltPhysics/blob/master/Build/CMakeLists.txt
- The "Determinism Check" CI runs on every push and PR. It runs `PerformanceTest -t=max -validate_hash=…` with the same expected hash on all machines. Jobs: Linux clang, Linux clang double, Linux clang AVX512, Linux gcc, Visual Studio CL 64 and 32 bit, macOS, macOS double, ARM clang 64 and 32 bit, ARM gcc, RISC-V, PowerPC, LoongArch, WASM32, WASM64. [P] https://github.com/jrouwe/JoltPhysics/blob/master/.github/workflows/determinism_check.yml
- Double precision has its own set of hashes and is tested on Linux and macOS. Windows double is **not** in the list of jobs. [P] same source
- The author admits the limitation: "It is quite difficult to verify cross platform determinism, so this feature is less tested than other features." [P] https://jrouwe.github.io/JoltPhysics/index.html#deterministic-simulation
- The history shows that it breaks and gets fixed: a fix for ARM64 vs x64 agreement in double precision, a `std::push_heap` difference on macOS, a `-Vec3::sZero()` difference between NEON and SSE. [P] https://github.com/jrouwe/JoltPhysics/blob/master/Docs/ReleaseNotes.md
- Known limitations even with the option on [P] (documentation, same source):
  - Broadphase queries are not deterministic.
  - Narrowphase queries return the same results, but in a different order.
  - Listeners (contacts, body activation, step) are called from multiple threads. The order of callbacks is not deterministic.
  - `PhysicsSystem::GetActiveBodies` returns bodies in a non-deterministic order.
- Requirements on our code around Jolt [P] (same source): precise float mode, contraction off, the same FPU state on all threads (round to nearest, identical DAZ and FTZ), no standard `sin`/`cos`, no `std::sort`, `std::push_heap`, `std::hash`.

**What is unverified for us:**
- **clang-cl.** The determinism CI on Windows has only MSVC. The "Visual Studio Clang" job exists only in the regular build CI, without the determinism option. [P] https://github.com/jrouwe/JoltPhysics/blob/master/.github/workflows/build.yml
- My reading of Jolt's CMake: in the clang-cl branch, with `CROSS_PLATFORM_DETERMINISTIC` neither `/fp:precise` nor `-ffp-contract=off` is added. But FMA is not enabled (`-mfma` is omitted), so contraction should not happen. This is a judgment from the source, not a test. [P] https://github.com/jrouwe/JoltPhysics/blob/master/Build/CMakeLists.txt and https://github.com/jrouwe/JoltPhysics/blob/master/Jolt/Jolt.cmake
- **Vehicles.** `WheeledVehicle` is not among the scenes that CI hashes. Gate M4 is exactly a replay of a drive.
- **The 8% cost** is a figure from the documentation. I found no independent measurement.

### 2. The joltc C wrapper

- amerkoleci/joltc: MIT license, 219 stars, not archived, last push 2026-10-15. Commit from 2026-07-13: "Update to official JoltPhysics v5.6.0". [P] https://github.com/amerkoleci/joltc and https://api.github.com/repos/amerkoleci/joltc/commits
- Jolt v5.6.0 came out on 2026-07-11, the wrapper caught up in two days. [P] https://github.com/jrouwe/JoltPhysics/releases
- The README warns that the author ties requests for new features to sponsorship. [P] https://github.com/amerkoleci/joltc/blob/main/README.md
- API coverage according to the header `include/joltc.h` (3166 lines) [P] https://github.com/amerkoleci/joltc/blob/main/include/joltc.h :
  - Vehicles: `JPH_VehicleConstraint_*`, `JPH_WheeledVehicleController_SetDriverInput`, engine, transmission, differentials, `JPH_VehicleCollisionTesterRay/CastSphere/CastCylinder`, tracked vehicles and motorcycles. **Present.**
  - Ragdoll: `JPH_RagdollSettings_*`, `JPH_Ragdoll_DriveToPoseUsingMotors`, `JPH_Ragdoll_DriveToPoseUsingKinematics`, skeleton, motors on SwingTwist. **Present.**
  - Character: `JPH_CharacterVirtual_*` including `ExtendedUpdate`, and `JPH_Character`. **Present.**
  - Double precision: `JPH_RVec3` and `JPH_RMat4` under `#if defined(JPH_DOUBLE_PRECISION)`. The CMake option `DOUBLE_PRECISION` builds the target `joltc_double`. joltc's CI builds it on Windows x64 and ARM64. **Present.**
  - Determinism option: CMake `option(CROSS_PLATFORM_DETERMINISTIC … OFF)`. **Present**, but joltc's CI does not test it. [P] https://github.com/amerkoleci/joltc/blob/main/CMakeLists.txt
  - Useful for determinism: `JPH_BodyInterface_CreateBodyWithID`, `JPH_Constraint_SetConstraintPriority`, a custom job system `JPH_JobSystemCallback_Create`. **Present.**
  - **Missing:** `StateRecorder`, `SaveState`, `RestoreState`. There is no occurrence in the header or in `joltc.cpp`. The PR "Add Rollback API" (#50) was closed without merging on 2025-09-17. [P] https://github.com/amerkoleci/joltc/pull/50
- Other C wrappers from Jolt's README [P] https://github.com/jrouwe/JoltPhysics/blob/master/README.md :
  - SecondHalfGames/JoltC: Apache-2.0, 80 stars, push 2026-10-21. It describes itself as "work in progress", it contains only what their game needed. [P] https://github.com/SecondHalfGames/JoltC
  - zig-gamedev/zphysics (JoltC inside): MIT, 89 stars, push 2026-10-24. Intended mainly for Zig. [P] https://github.com/zig-gamedev/zphysics
  - ostef/JoltC: MIT, 0 stars, generated. [P] https://github.com/ostef/JoltC
- Conclusion: the choice of joltc (D42) is right. I did not compare the coverage of the other wrappers in depth.

### 3. Bit-exact floats between ARM64 and x64

What those who actually do it say:

- **Box2D v3 (Erin Catto, 2024).** Tests x64 and ARM, MSVC, GCC and Clang. Turns FMA off through `-ffp-contract=off`. Fast-math: "My advice: never use this setting." `atan2f` gave different results across platforms, so he has his own `atan2`, `sin`, `cos`. He considers `sqrtf` safe. He rejected fixed-point as slower and with an overflow risk. He warns: "Determinism is a brittle feature… Compiler versions can break it." [P] https://box2d.org/posts/2024/08/determinism/
- **Rapier.** Cross-platform determinism only with the `enhanced-determinism` feature, on platforms that "strictly comply to the IEEE 754-2008", and with its own math instead of the system one. It does not go together with `simd8`. It works with `parallel`. [P] https://rapier.rs/docs/user_guides/rust/determinism/
- **Jolt.** The same list: precise mode, contraction off, identical FPU state, own trigonometry, own sorting and hashing. [P] https://jrouwe.github.io/JoltPhysics/index.html#deterministic-simulation
- **Factorio.** Its own trigonometry was enough: "We got away with implementing our own trigonometric functions." The first big desync was not from floats, but from `std::sort` on elements that compare equal. [P] https://www.factorio.com/blog/post/fff-52
- **Factorio on ARM.** The ARM vs x86 difference was caused by undefined behavior: converting a `double` to an integer out of range gives a different value on ARM than on x86. They looked for it by comparing the CRC of the state on every tick in 2,417 tests. [P] https://www.factorio.com/blog/post/fff-370
- **Gaffer On Games.** A collection of experience. Main points: x87 and 80-bit precision, the rounding mode, DLLs that change the FPU state and do not restore it, transcendental functions that differ between AMD and Intel, optimizations that change values. MotoGP: replays could not be shared between Xbox and PC, and a patch with a newer compiler broke old replays. [P] https://gafferongames.com/post/floating_point_determinism/

What follows for the tier A rules:

| Threat | State in our plan | Note and source |
|---|---|---|
| FMA / contraction | covered (`-ffp-contract=off`) | Clang's default is `on`. `-ffp-model=precise` leaves contraction on. It must be turned off explicitly. [P] https://clang.llvm.org/docs/UsersManual.html |
| clang-cl and `/fp:precise` | **add** | `/fp:precise` maps to `-ffp-model=precise`, so contraction `on`. On Windows, relying on the default `/fp` is not enough. [S] https://github.com/llvm/llvm-project/commit/3d89323d1896fde5dc69ecb8306917718c5e3aed |
| `-ffast-math` | covered | It also links `crtfastmath.o`, which switches DAZ/FTZ for the whole process. [P] https://clang.llvm.org/docs/UsersManual.html |
| libm | covered (`detmath`) | `sqrt` is safe according to Catto, because it is a single instruction. [P] https://box2d.org/posts/2024/08/determinism/ |
| x87 | does not concern us | On 64-bit targets the default evaluation is `source`. The problem exists only on 32-bit x86. [P] https://clang.llvm.org/docs/UsersManual.html |
| Denormals and the rounding mode | **add** | The FPU state must be the same on all threads, including those from libraries. [P] https://jrouwe.github.io/JoltPhysics/index.html#deterministic-simulation |
| Out-of-range float→int conversion, other UB | **add** | See Factorio above. Worth a lint and UBSan in CI. |
| NaN | **add** | The sign and payload of NaN are not portable. NaN bits must not get into a hash or into branching. [S] (Rust documentation, valid for the same hardware) https://doc.rust-lang.org/std/primitive.f32.html |
| Auto-vectorization | no action | Without fast-math LLVM does not reorder float reductions. [P] https://llvm.org/docs/Vectorizers.html |
| Sorting, heap, hash from the standard library | **add** | `qsort` and the like differ between libcs just like `std::sort`. We need our own stable sort. [P] https://www.factorio.com/blog/post/fff-52 |
| SIMD intrinsics | **add** | Even hand-written SIMD can differ (example `-Vec3::sZero()` NEON vs SSE). [P] https://github.com/jrouwe/JoltPhysics/blob/master/Docs/ReleaseNotes.md |
| Compiler version | **add** | Catto and Hargreaves: a new compiler version can break agreement. Pin the clang version on all three OSes. |

Order of expression evaluation: I found no specific source. Without fast-math the compiler must not reorder float expressions, so the risk is small.

### 4. clang-cl and C11/C17

- **Atomics in MSVC.** Introduced experimentally in VS 2022 17.5. The MSVC conformance page as of 2026-10-16 still lists them as "experimental" and "Partial… supported under `/experimental:c11atomics`". So the reason from D26 holds. [P] https://learn.microsoft.com/en-us/cpp/overview/visual-cpp-language-conformance and https://devblogs.microsoft.com/cppblog/c11-atomics-in-visual-studio-2022-version-17-5-preview-2/
- **Atomics in clang-cl.** Clang's `stdatomic.h` header has an explicit exception: in C mode on MSVC, Microsoft's header is not used, clang's built-in header is used instead. The comment in it justifies this by the fact that the MSVC header ends in `#error` in C mode. `_Atomic` is a language feature in clang. [P] https://github.com/llvm/llvm-project/blob/main/clang/lib/Headers/stdatomic.h
- Open: atomic types that are not lock-free need runtime support. I did not verify whether it is available with the MSVC runtime. Stick to types up to 8 bytes.
- **`<threads.h>`.** In MSVC since VS 2022 17.8. The implementation is in the satellite library `vcruntime140_threads.dll`, which must be distributed with the dynamic CRT. Mutexes behave differently from pthreads (a recursive lock calls `abort()`). The source says nothing about clang-cl. [P] https://devblogs.microsoft.com/cppblog/c11-threads-in-visual-studio-2022-version-17-8-preview-2/
- Recommendation: do not use `<threads.h>`. SDL3 has its own threads, mutexes and atomic operations and is already a dependency. That also removes the DLL dependency.
- **SDL3.** The SDL project's CI has the jobs "Windows (MSVC, clang-cl x64)" and "(clang-cl x86)" with `-DCMAKE_C_COMPILER=clang-cl`. [P] https://github.com/libsdl-org/SDL/blob/main/.github/workflows/create-test-plan.py
- **Jolt.** CI has the job "Visual Studio Clang": Debug, Release, Distribution, with and without double, including unit tests. The README states "Visual Studio 2022+, Clang 16+ or GCC 12+". [P] https://github.com/jrouwe/JoltPhysics/blob/master/.github/workflows/build.yml
- **joltc.** Its CI on Windows builds only with the generator "Visual Studio 18 2026", so MSVC. Nobody publicly tests a build through clang-cl. The risk is small (it is a thin C++ layer over Jolt), but it is our test. [P] https://github.com/amerkoleci/joltc/blob/main/.github/workflows/build.yml

### 5. Lockstep in strategy games

- **Age of Empires ("1500 Archers").** All machines run the same simulation and send each other only commands, scheduled two turns ahead. They hunted out-of-sync with checksums of the world, objects and pathfinding. The random generator is seeded and cosmetic randomness must not touch it. The article says nothing about floats or fixed-point. [P] https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond
- **Factorio.** Lockstep. A checksum of the state every tick, and on a mismatch the player disconnects and downloads the map again. [P] https://factorio.com/blog/post/fff-55
- Factorio uses floats, fixed-point only in a few places. [S] (a developer's forum post, not opened directly) https://forums.factorio.com/viewtopic.php?p=113800
- Factorio plays ARM against x86: Switch, Apple Silicon and since 2026 Linux ARM64. "We never experienced an ARM64 vs. x86 related desync" thanks to earlier work on the ports. [P] https://www.factorio.com/blog/post/fff-446
- **Paradox (Stellaris).** The Paradox forum blocks automatic reading, I did not open the developer diaries. What I have only second-hand:
  - Variables in HoI4 scripts are fixed-point: a 32-bit integer part and five decimal places. [S] https://hoi4.paradoxwikis.com/Data_structures
  - Desyncs are a long-standing problem in Stellaris. The developers asked players for logs with the `-randomlog` parameter. In diary 170, the technical lead links a desync with the caching of calculations that happens on machines at a different moment. [S] https://admin-forum.paradoxplaza.com/forum/developer-diary/stellaris-dev-diary-170-performance-and-other-technical-issues.1335134
  - The claim "Paradox games use fixed-point instead of floats" I have only from community discussions. **Unverified.**
- **Age of Empires II DE.** One of the fixed desyncs: the world's random generator was called during the loading screen. [S] https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-145651/
- **Photon Quantum.** A commercial deterministic engine. Clients send each other only inputs, it has its own `FP` type (fixed-point) and its own deterministic physics. [P] https://doc.photonengine.com/quantum/current/quantum-intro

Lesson: most desyncs do not come from floats. They come from order (sorting, hash tables, threads), from randomness called outside the simulation, from caches and from undefined behavior. Integers and fixed-point remove only one class of errors. The rules in CONVENTIONS §5 (order, seeded streams, independence from threads) are just as important.

### 6. Recording and bit-identical replay with physics

- **Jolt.** The sample app has the option "Check Determinism": before every step it saves the state through `StateRecorder`, restores the simulation and repeats the step. `SaveState`/`RestoreState` also serve for rollback in network games. [P] https://jrouwe.github.io/JoltPhysics/index.html#deterministic-simulation
- **Box2D v3.** Three levels: algorithmic, multithreaded and cross-platform determinism. The Falling Hinges test compares the number of steps until sleep and the hash of the transforms. Box2D does not offer rollback. [P] https://box2d.org/posts/2024/08/determinism/
- **Rapier.** Always locally deterministic. A parallel run gives the same results as a sequential one. [P] https://rapier.rs/docs/user_guides/rust/determinism/
- **Trackmania.** Replays contain inputs and can be simulated again. Physics runs 100 steps per second. [S] https://donadigo.com/tmx1
- **Supreme Commander.** Lockstep on IEEE 754 floats with a fixed FPU state. [P] (developers' quotes) https://gafferongames.com/post/floating_point_determinism/

What is needed for this:

1. **Fixed step.** All the examples above step with a fixed time.
2. **The same order of API calls** and **the same body IDs**. Jolt: create bodies through `CreateBodyWithID`. The order of adding A, B or B, A does not matter if the IDs match. For constraints set a unique priority. [P] https://jrouwe.github.io/JoltPhysics/index.html#sloppy-determinism
3. **The same build.** The same source and definitions. A replay is therefore tied to the engine version.
4. **Threads.** Jolt is deterministic even multithreaded. Proof: CI runs tests with `-t=max` and expects the same hash on different machines. The older option `mDeterministicSimulation` was removed, "The simulation is now always deterministic". Races that broke determinism are fixed as bugs. [P] https://github.com/jrouwe/JoltPhysics/blob/master/PerformanceTest/PerformanceTest.cpp and https://github.com/jrouwe/JoltPhysics/blob/master/Docs/ReleaseNotes.md
   - I did not find an explicit sentence "the result does not depend on the number of threads" in the documentation. I rely on CI.
5. **Sort everything that comes out of physics.** Contacts, body activations and query results arrive in a non-deterministic order. The adapter must sort them before handing them to game logic and audio.
6. **Do not add and remove bodies from multiple threads at once.** In such a test Jolt itself turns off the determinism check. [P] https://jrouwe.github.io/JoltPhysics/index.html#deterministic-simulation

## Impact on the plan

**D28 (two tiers): I would not remove it, but make it more precise.**
- The reason "deterministic Jolt across OSes is unverified and expensive" needs to be rewritten. The correct version: "Jolt can do it and tests it, it costs about 8%. What is unverified is our combination: clang-cl, vehicles, joltc and everything we feed into physics."
- Tier B today has three different things. Physics has a real chance of agreement across OSes. Animation and audio mix do not, no library promises such a thing there. I propose splitting tier B: **B1 physics** (goal: agreement on 3 OSes, not yet promised) and **B2 animation and audio** (agreement on the same platform).
- Catch: physics is identical across OSes only if its inputs are identical too. A ragdoll with motors gets its target pose from animation. If animation is tier B2, it breaks the physics agreement. Either the sampling of poses for physics is written under the tier A rules, or the cross-OS agreement is limited to scenes without an active ragdoll.

**Gate M4 (drive replay): keep the hard gate at "same platform", add cross-OS as a measurement.**
- Build Jolt from day one with `CROSS_PLATFORM_DETERMINISTIC=ON`. The cost is small and turning it on later invalidates all stored hashes.
- Extend measurement 27: "hash of the drive replay on macOS-ARM64, Linux-x64 and Windows-x64 (clang-cl)". If it passes, the gate is raised to "on all three OSes". If it fails, we know exactly where.
- I do not recommend raising the gate right away. Nobody publicly tests three links of the chain (clang-cl, vehicle, joltc).

**New tasks that follow from the research:**
- **joltc has no `StateRecorder`.** A replay from the start from inputs does not need it. But it is needed by a save with the "full simulation state" (D40), step-by-step determinism checks and possible rollback. Solution: a few extra functions in our C++ adapter, or a PR to joltc.
- **The physics adapter sorts events.** Sort contacts and activations by body ID before they go to the game and to impact audio.
- **Bodies through `CreateBodyWithID`**, the ID is assigned by the engine from stable IDs (D40).
- **Add to CONVENTIONS §5:** identical FPU state on all threads, a ban on out-of-range float→int conversion, NaN must not get into a hash, own sorting instead of `qsort`, a pinned clang version, UBSan in CI. On Windows explicitly `-ffp-contract=off` (the default `/fp:precise` is not enough).
- **`.wzr` carries a build fingerprint** (engine version, Jolt, compiler, definitions). A replay from another build is rejected or flagged.
- **Keep the item to verify "C11 atomics through clang-cl" (M0a).** Add: do not use `<threads.h>`, take threads from SDL3.
- **Item to verify "double precision in joltc" (M4b):** it is in the API and in joltc's CI. Jolt tests double cross-platform on Linux and macOS, not on Windows. Verify on our side.
- **One Jolt source.** joltc can take Jolt from a local folder. Pin a specific commit for all three OSes.

## Questions for the owner

1. **Split tier B into B1 (physics, goal 3 OSes) and B2 (animation, audio)?** Or keep one tier B and treat cross-OS physics only as a bonus?
2. **Turn on `CROSS_PLATFORM_DETERMINISTIC` from the start at a cost of about 8% of physics performance?** I recommend yes.
3. **Should a cross-OS drive replay be a goal of M4 (a measurement that can be promoted to a gate), or postponed past M4?**
4. **The missing `StateRecorder` in joltc:** write it in our own adapter, or send a PR to joltc and wait? The author ties new features to sponsorship.
5. **Should the pose for an active ragdoll fall under the tier A rules?** Without that, cross-OS agreement of physics with a ragdoll will not work.

## What could not be verified

- An explicit statement by Jolt's author that the result does not depend on the number of threads. I have only indirect proof from CI.
- Determinism of Jolt built through clang-cl. Determinism of vehicles across platforms. Both are missing from Jolt's CI.
- Whether `<threads.h>` works with clang-cl.
- Whether clang-cl with the MSVC runtime supports atomic types that are not lock-free.
- The internal determinism solution in Paradox's engine. The forum blocks automatic reading, the sources are only secondary.
- The numeric format of the simulation in Age of Empires. The original article does not state it.
- An independent measurement of the 8% cost.
- The state of the `/experimental:c11atomics` option directly in the VS 2026 release notes. I rely on the MSVC conformance page from 2026-10-16.
- I built and ran nothing. Everything is from documentation, sources and CI configuration.
