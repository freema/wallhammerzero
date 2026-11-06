# Multithreading, job systems and frame architecture for a C17 open-world engine (SDL3 + SDL_GPU; macOS M4 Pro / Linux / Windows)

## 1. Naughty Dog's fiber-based job system (Gyrling, GDC 2015) and fiber portability on macOS/ARM64

### Takeaway
Naughty Dog's design has three parts: fibers so that jobs can wait mid-function, atomic counters as the only sync primitive, and a "frame = piece of data" model (FrameParams plus a tagged 2 MiB block heap) that pipelines game, render and GPU stages. The frame-centric memory and pipelining ideas carry over to any job system. The fiber part is the hard bit to port: C17 has no fiber API, macOS has removed/deprecated ucontext, and the realistic options are a hand-written asm context switch or a library such as minicoro (C, ARM64 asm). Even with a working switch you inherit TLS-caching and OS-mutex hazards.

### Cited Findings
**Motivation and goals**
- The PS3 engine was single-threaded at 30 Hz, with SPUs as workers. PS3 jobs "always ran to completion without ever yielding", which made gameplay hard to move onto SPUs. Users had to manage job memory, and sync used marker indices in job arrays. — [Gyrling GDC 2015 slides](https://media.gdcvault.com/gdc2015/presentations/Gyrling_Christian_Parallelizing_The_Naughty.pdf)
- Design goals: jobify code that couldn't be moved to SPUs. Jobs can yield mid-execution, e.g. "Player update with kick and wait for ray casts". The API should be easy, with no memory management for the user and "one simple way to synchronize/chain jobs". "Performance was secondary to ease-of-use of the API." — [Gyrling slides](https://media.gdcvault.com/gdc2015/presentations/Gyrling_Christian_Parallelizing_The_Naughty.pdf)

**Job system design (PS4)**
- 6 worker threads, "each one is locked to a CPU core". "A thread is the execution unit, the fiber is the context." A job always executes inside a fiber. — [Gyrling slides](https://media.gdcvault.com/gdc2015/presentations/Gyrling_Christian_Parallelizing_The_Naughty.pdf)
- 160 fibers (128 × 64 KiB stacks and 32 × 512 KiB stacks), 3 job queues (Low/Normal/High), "No job stealing". — [Gyrling slides](https://media.gdcvault.com/gdc2015/presentations/Gyrling_Christian_Parallelizing_The_Naughty.pdf)
- Waiting mechanics: a waiting job is put in a wait list tied to the counter it waits on, and a new fiber from the pool takes the next job. When a job completes it decrements its counter and wakes waiters. On resume the current fiber is freed and the worker switches to the waiting fiber. — [Gyrling slides](https://media.gdcvault.com/gdc2015/presentations/Gyrling_Christian_Parallelizing_The_Naughty.pdf)
- `WaitForCounter(counter, 0)` is the "Only way of synchronizing jobs". The API is `JobDecl` arrays on the stack, `RunJobs(&decls, n, &pCounter)` and `WaitForCounterAndFree(pCounter, 0)`. — [Gyrling slides](https://media.gdcvault.com/gdc2015/presentations/Gyrling_Christian_Parallelizing_The_Naughty.pdf)
- About 800-1000 jobs per frame in The Last of Us Remastered. "Everything is a job" (game objects, animation and joint blending, ray casts, command buffer generation), except I/O threads (sockets, file I/O, syscalls). Those are system threads that work "like interrupt handlers (Read data, post new job)" and never do expensive processing. — [Gyrling slides](https://media.gdcvault.com/gdc2015/presentations/Gyrling_Christian_Parallelizing_The_Naughty.pdf)
- Fiber switch on PS4 is the system-supported `sceFiberSwitch()`, which only saves and restores PC, SP and registers, with no kernel context switch. — [Gyrling slides](https://media.gdcvault.com/gdc2015/presentations/Gyrling_Christian_Parallelizing_The_Naughty.pdf)
- Cons: "System synchronization primitives can no longer be used" (mutex, semaphore, condvar) because they are "Locked to a particular thread. Fibers migrate between threads". "Atomic spin locks are used almost everywhere", plus a special job mutex that puts the job to sleep for longer holds. — [Gyrling slides](https://media.gdcvault.com/gdc2015/presentations/Gyrling_Christian_Parallelizing_The_Naughty.pdf)
- TLS pitfall: the compiler may cache a TLS address for the whole function, so a fiber that resumes on another thread gets the wrong TLS pointer. The fiber-safe TLS option was "Currently not supported by Clang". Workaround: put TLS access in a separate .cpp file (no inlining). — [Gyrling slides](https://media.gdcvault.com/gdc2015/presentations/Gyrling_Christian_Parallelizing_The_Naughty.pdf)
- They use adaptive mutexes because jobs can be added from normal threads, where pure spin locks deadlock. The mutex spins first, then falls back to a syscall, which "Solves priority inversion deadlocks". — [Gyrling slides](https://media.gdcvault.com/gdc2015/presentations/Gyrling_Christian_Parallelizing_The_Naughty.pdf)
- Gyrling's critique of TBB-style systems: they make every job run to completion, unless you accept OS context switching or nested job execution while waiting, which "will prevent the first job from resuming until the second job has completed". — [Gyrling slides](https://media.gdcvault.com/gdc2015/presentations/Gyrling_Christian_Parallelizing_The_Naughty.pdf)

**Optimization timeline and frame pipelining**
- Frame time went from 132 ms (initial port) to 55 ms (game objects and command buffers jobified), then 36 ms (more jobs, fewer locks), then about 25 ms (diminishing returns, CPU critical path). There were "Lots of idle time on CPU cores". They had about 100 ms of CPU work, and 16.66 ms × 6 cores ≈ 100 ms. — [Gyrling slides](https://media.gdcvault.com/gdc2015/presentations/Gyrling_Christian_Parallelizing_The_Naughty.pdf)
- The fix was to run game logic and render logic at the same time on *different frames*: a feed-forward pipeline of Game Logic, then Render Logic, then GPU Exec, with each stage 16.66 ms. The result was 25 ms down to 15.5 ms ("Ship it!"). Each stage runs independently with "No synchronization required", and locks are used only within heavily jobified stages. — [Gyrling slides](https://media.gdcvault.com/gdc2015/presentations/Gyrling_Christian_Parallelizing_The_Naughty.pdf)

**Frame-centric memory**
- Their definition of a frame is "A piece of data that is processed and ultimately displayed on screen ... It is NOT a length of time." — [Gyrling slides](https://media.gdcvault.com/gdc2015/presentations/Gyrling_Christian_Parallelizing_The_Naughty.pdf)
- FrameParams holds one instance per displayed frame and is passed through all stages. It contains the frame number, delta time, camera, skinning matrices, mesh list and per-stage start/end timestamps (Game, Render, GPU, Flip). Each stage owns a unique instance, so no locks are needed. `HasFrameCompleted(frameNumber)` gates memory reuse. There are 16 FrameParams in rotation, so only the last 15 frames can be tracked. — [Gyrling slides](https://media.gdcvault.com/gdc2015/presentations/Gyrling_Christian_Parallelizing_The_Naughty.pdf)
- Memory lifetimes they defined: Single Game Logic stage (scratch), Double Game stage (low-priority ray casts), Game→Render (object instance arrays), Game→GPU (skinning matrices) and Render→GPU (command buffers). — [Gyrling slides](https://media.gdcvault.com/gdc2015/presentations/Gyrling_Christian_Parallelizing_The_Naughty.pdf)
- Worst-case-sized linear allocators wasted 100-200 MiB. The replacement is a tagged heap: 2 MiB blocks (one large page, one TLB entry on PS4), each owned by a `uint64_t` tag, with no `Free(ptr)`. You free all blocks of a tag at once. 99% of allocations are under 2 MiB, and larger ones get consecutive blocks. — [Gyrling slides](https://media.gdcvault.com/gdc2015/presentations/Gyrling_Christian_Parallelizing_The_Naughty.pdf)
- Each allocator keeps one 2 MiB block per worker thread, indexed by worker index, so "No locks required for 99.9% of memory allocations". A job that sleeps and wakes on another thread just continues allocating from that thread's block under the same tag. — [Gyrling slides](https://media.gdcvault.com/gdc2015/presentations/Gyrling_Christian_Parallelizing_The_Naughty.pdf)

**Our Machinery's port of the same idea**
- Tobias Persson's 2017 "Fiber based job system" was directly inspired by Gyrling's talk. Its API is `run_jobs(jobs, n, counter)`, `wait_for_counter(counter, value)` and `wait_for_counter_no_fiber`, with `tm_jobdecl_t {void (*task)(void*); void *data;}`. It uses four fixed ring buffers (job queue, sleeping fibers, free fibers, free counters), with "no memory allocated after boot" and under 300 lines in total. — [Our Machinery blog archive](https://ruby0x1.github.io/machinery_blog_archive/post/fiber-based-job-system)
- The lock-free FIFO "failed miserably", and they used a spin-lock version instead. Windows has native fibers; elsewhere they suggest `longjmp` or "explicit stack switching assembly". They deliberately left out priorities and variable stack sizes. — [Our Machinery blog archive](https://ruby0x1.github.io/machinery_blog_archive/post/fiber-based-job-system)

**Fiber portability (macOS/ARM64)**
- minicoro is a single-header pure-C stackful coroutine library. It uses assembly by default on ARM/ARM64 (incl. Mac OS X, iOS) and x86_64. Fallbacks are ucontext on Linux/macOS and Windows Fibers on Windows. The default stack is 56 KB (min 32 KB), and overflow is UB. An optional VMEM allocator reserves about 2 MB virtual per stack. — [minicoro GitHub](https://github.com/edubart/minicoro)
- minicoro switch cost (i7-8750H): asm about 9 cycles on Linux, ucontext about 352 cycles, Windows Fibers about 69 cycles per switch but about 10,564 cycles to init, Windows asm about 33 cycles. It is MIT-0 or public domain. "The mco_coro object is not thread safe". It warns against `thread_local` inside coroutine code, because the compiler may cache TLS pointers that become invalid after a thread switch. — [minicoro GitHub](https://github.com/edubart/minicoro)
- ucontext on macOS: an Apple DTS engineer says ucontext was marked obsolete in POSIX Issue 6 (2004) and "The ARM transition simply provided a convenient opportunity to complete their removal". This is a forum post, not formal documentation. — [Apple Developer Forums](https://developer.apple.com/forums/thread/823121)
- The gem5 fiber code notes that ucontext functions "have been marked as deprecated and are hidden in latest macOS releases" and need `_XOPEN_SOURCE` to compile. — [gem5 fiber.hh](https://gem5.googlesource.com/amd/gem5/+/master/src/base/fiber.hh)
- A Boost.Context commit notes that macOS `makecontext` (M1, Ventura 13.0.1) "is able to pass only 4-byte parameters to context function", which breaks pointer passing. — [Boost.Context commits mirror](https://gitmirror.hak8or.com/boost/context/commits/branch/p0876r13)

### Inferences
- In C17, fibers need: (a) a per-platform asm switch (AArch64 SysV/Apple, x86-64 SysV, x86-64 Win64), (b) Windows `ConvertThreadToFiber`/`SwitchToFiber` or asm, and (c) a ban on `_Thread_local` and OS mutexes inside jobs. minicoro covers (a) and (b) in C. Writing your own is about 30-60 lines of asm per ABI. Win64 additionally needs TIB fields (stack base, limit, deallocation stack) swapped or SEH and stack probes break. This is general knowledge, not from the sources above.
- Apple ARM64 also reserves x18, and AArch64 requires saving x19-x28, fp, lr, sp and d8-d15. This is a general ABI fact, not from the sources.
- The fiber TLS problem applies to SDL3 too. SDL TLS (`SDL_GetTLS`) and any `_Thread_local` read inside a job that waits can return the wrong thread's value. Pass the worker context explicitly, or re-query after each wait.
- Debuggers (LLDB, gdb, VS) don't know about custom fibers, so call stacks of sleeping jobs are invisible without tooling. Naughty Dog had first-party debugger support on PS4.
- Apple's guidance (section 6) to avoid spin locks conflicts with Gyrling's "atomic spin locks almost everywhere". On macOS, prefer spin-then-block (adaptive) primitives.

### Gaps
- No primary source found for Boost.Context fcontext's macOS arm64 support status (it is widely used there, but not confirmed in the sources fetched).
- No measured fiber-switch cost on Apple M-series was found; minicoro's numbers are x86 only.
- Gyrling's talk gives no per-job overhead numbers and doesn't cover how fiber stack overflow was detected.

## 2. Alternatives: dependency counters / task graphs (Destiny), work-stealing (Molecular Matters), Our Machinery, enkiTS, TBB, Wicked Engine

### Takeaway
There are three practical families: (1) simple shared-queue pools with a completion counter (Wicked), (2) per-thread work-stealing deques with parent/child counters and "help while waiting" (Molecular Matters, TBB-style, GCD's `dispatch_apply`), and (3) fiber plus counter systems (Naughty Dog, Our Machinery). For a C17 engine, a work-stealing system with counter-based dependencies and continuations, where waiting threads execute other jobs, gives most of the benefit with none of the fiber portability risk. enkiTS already provides this with a C API, but its core is C++11.

### Cited Findings
**Bungie / Destiny (GDC 2015, Barry Genova)**
- From the talk abstract: almost every engine system is organized as a job graph, with only limited thread-based pre-emption. The main game loop is split into chains of jobs called "job fibers" (job strings, not OS fibers). A runtime resource-tracking system validates that reads, writes, creates and destroys happen at safe points in the frame. The talk covers an entirely job-based frame structure with system-level pipelining and data parallelism. — [GDC Vault listing](https://gdcvault.com/play/1022164/Multithreading-the-Entire-Destiny); [destiny.bungie.org](https://destiny.bungie.org/n/1914)

**Molecular Matters "Job System 2.0" (Stefan Reinalter, 2015)**
- Job struct: function pointer, parent pointer, atomic `int32_t unfinishedJobs`, and padding so that each Job fills at least one cache line (avoids false sharing). Job data is copied into the padding, with a compile-time size check. — [Molecular Matters part 1](https://blog.molecular-matters.com/2015/08/24/job-system-2-0-lock-free-work-stealing-part-1-basics/)
- Each worker owns a deque. Push and Pop work on the private end (LIFO, cache-friendly) and Steal on the public end (FIFO, load-balancing). `CreateJobAsChild` atomically increments the parent's counter. `Wait(job)` runs other jobs until the job completes. Completion is signalled by `unfinishedJobs == -1`, and jobs are deleted only at the end of the frame. — [Molecular Matters part 1](https://blog.molecular-matters.com/2015/08/24/job-system-2-0-lock-free-work-stealing-part-1-basics/)
- Lock-free deque (Chase-Lev style with bottom and top): Push needs no CAS, Steal reads the job before CASing top, and Pop does a CAS only for the last element. Pop needs a full StoreLoad barrier even on x86 ("neither SFENCE nor LFENCE would suffice"). On ARM, Push needs a memory fence, not just a compiler barrier. — [Molecular Matters part 3](https://blog.molecular-matters.com/2015/09/25/job-system-2-0-lock-free-work-stealing-part-3-going-lock-free/)
- Ring buffer of 4096 jobs with `index & MASK` (power of two). The per-frame allocator cap prevents overflow. Counter wrap-around is handled by a per-frame reset or 64-bit counters. — [Molecular Matters part 3](https://blog.molecular-matters.com/2015/09/25/job-system-2-0-lock-free-work-stealing-part-3-going-lock-free/)
- Benchmarks (i7-2600K, 4C/8T, 65,000 jobs):

  | Version | Single jobs | parallel_for |
  |---|---|---|
  | Basic | 18.5 ms | 5.3 ms |
  | + thread-local allocator | 9.9 ms | 1.35 ms |
  | + lock-free deque | 2.93 ms | 0.76 ms |

  Overall about 6.3-7× from the first to the final version. — [Molecular Matters part 3](https://blog.molecular-matters.com/2015/09/25/job-system-2-0-lock-free-work-stealing-part-3-going-lock-free/)
- The series continues with an allocator (part 2), a lock-free deque (part 3), parallel_for (part 4) and dependencies (part 5). Parent/child grouping doesn't impose execution order; dependencies do. — [Molecular Matters part 1](https://blog.molecular-matters.com/2015/08/24/job-system-2-0-lock-free-work-stealing-part-1-basics/)

**Wicked Engine simple job system (Turánszki János, 2018)**
- API: `Initialize`, `Execute(job)`, `Dispatch(jobCount, groupSize, job)`, `IsBusy`, `Wait`. Queue is `ThreadSafeRingBuffer<std::function, 256>` guarded by a `std::mutex`; the author found a mutex faster than an atomic spinlock on Windows 10. Idle workers sleep on a condition variable, and `notify_one` is called per push. Completion: `IsBusy()` returns `finishedLabel (atomic u64) < currentLabel (u64)`. Thread count is `max(1, hardware_concurrency)`. — [Wicked blog](https://turanszkij.wordpress.com/2018/11/24/simple-job-system-using-standard-c/)
- In the posted code `Wait()` only does `notify_one` plus `yield`, and the main thread doesn't execute jobs. Helping was "not a clear win". The original version can't spawn jobs from jobs. The current `wiJobSystem` adds a context parameter for that and "can handle multiple workloads". — [Wicked blog](https://turanszkij.wordpress.com/2018/11/24/simple-job-system-using-standard-c/); [turanszkij/JobSystem GitHub](https://www.github.com/turanszkij/JobSystem)
- Numbers (2 cores / 4 threads): 1M-item Dispatch with groupSize 10000 took 15 ms vs a 28 ms serial loop. groupSize 1000 gave 31 ms vs 28 ms, showing that granularity matters. — [Wicked blog](https://turanszkij.wordpress.com/2018/11/24/simple-job-system-using-standard-c/)
- An unverified third-party page claims current Wicked has priorities (High/Low/Streaming) and HLSL-style dispatch args. This was not confirmed against source. — [openapps.pro](https://openapps.pro/apps/wicked-engine)

**enkiTS (Doug Binks)**
- A "permissively licensed C and C++ Task Scheduler" under zlib. It requires C++11 internally, and the C API is in `TaskScheduler_c.h`. To use it from C you compile `TaskScheduler.cpp` and `TaskScheduler_c.cpp`. — [enkiTS GitHub](https://github.com/dougbinks/enkiTS)
- Features: task sets with `ExecuteRange`, tasks spawned from tasks ("braided parallelism"), pinned tasks run on a specific thread, priorities (3 by default, up to 5 via `ENKITS_TASK_PRIORITIES_NUM`), dependencies (`SetDependency`), completion actions, external thread registration, custom allocators, "designed for zero allocations during scheduling", and `WaitForNewPinnedTasks` for IO threads. — [enkiTS GitHub](https://github.com/dougbinks/enkiTS)
- Platforms: Windows, Linux, Mac OS, Android; x64, x86 and ARM. Mac and ARM are "less frequently tested". macOS ARM64 isn't explicitly named. — [enkiTS GitHub](https://github.com/dougbinks/enkiTS)

**GCD / Apple guidance as a reference design**
- `dispatch_apply` (concurrentPerform) "uses a work-stealing algorithm". Apple recommends at least 3× as many iterations as cores. Custom pools should use work-stealing, because "If you use a static distribution, threads running on higher efficiency cores will finish much sooner than threads running on lower efficiency cores" [sic: Apple's wording appears to reverse P/E]. — [Apple: Tuning for Apple silicon](https://developer.apple.com/documentation/apple-silicon/tuning-your-code-s-performance-for-apple-silicon)

### Inferences
- Recommended baseline for C17:
  - per-worker Chase-Lev deques in `<stdatomic.h>`, with jobs pooled per thread per frame
  - an atomic counter per job group, plus continuations: a list of jobs to push when a counter hits 0
  - "wait = help" (pop or steal and execute) instead of blocking
  - a semaphore or futex to park idle workers

  This avoids fibers. The downside is that a waiting job holds its stack and nests other jobs (Gyrling's critique). Mitigate by structuring work as graphs with continuations rather than deep waits.
- Fibers mainly pay off for deep gameplay code that must wait mid-function (e.g. a raycast batch). For streaming, culling, animation, physics and command recording, data-parallel `parallel_for` plus graph dependencies suffice.
- enkiTS is the lowest-risk off-the-shelf option, but it adds a C++ translation unit (C++11 toolchain) to a C17 project. Whether that's acceptable is a project policy decision.
- Apple's P/E heterogeneity makes static partitioning (thread i takes slice i) actively bad on the M4 Pro. Work-stealing or fine-grained `parallel_for` chunks (≥ 3× core count) are needed.

### Gaps
- No Destiny slides or transcript were retrieved; only the abstract-level description is available. Details of its job-graph API and resource tracker are unknown.
- Intel TBB's design (work-stealing, task arenas, continuation passing) is not sourced here beyond Gyrling's critique.
- Molecular Matters parts 2, 4 and 5 (allocator, parallel_for, dependencies) were not fetched directly.
- Current wiJobSystem source (priorities, context struct) was not verified.

## 3. Frame pipelining: simulation vs render thread, fixed timestep

### Takeaway
Two main patterns exist: (a) Unreal-style dedicated threads (Game → Render → RHI), each typically one frame behind the previous, and (b) Naughty Dog-style stage pipelining executed entirely by the job system (Game N+2 ‖ Render N+1 ‖ GPU N), with per-frame data packets. Both rely on the simulation producing an immutable per-frame snapshot that the render stage consumes. Combine this with Fiedler's fixed-dt accumulator and interpolation for deterministic physics, at the cost of about one extra frame of latency.

### Cited Findings
- Unreal: the Render Thread is a frontend that "enqueues platform-agnostic graphical commands", and the RHI Thread "translates (executes) them via the appropriate graphics API on the backend". Work generated in parallel on the frontend is translated in parallel on the backend. — [Epic: Parallel Rendering Overview](https://dev.epicgames.com/documentation/en-us/unreal-engine/parallel-rendering-overview-for-unreal-engine)
- Unreal is normally a "single frame behind" renderer: the Render Thread works on frame N while the Game Thread works on N+1. The RHI thread can lag further, and sync uses `FFrameEndSync` and `RHIThreadFence`. GPU submission order is unchanged from a single-threaded renderer. — [Epic: Parallel Rendering Overview](https://dev.epicgames.com/documentation/en-us/unreal-engine/parallel-rendering-overview-for-unreal-engine)
- Naughty Dog: Game Logic, Render Logic and GPU Exec are pipelined on different frames, with stages run by the job system rather than fixed threads. This took the CPU frame from 25 ms to 15.5 ms. FrameParams (×16) carries per-frame state, and memory is freed when `HasFrameCompleted(X)`. — [Gyrling slides](https://media.gdcvault.com/gdc2015/presentations/Gyrling_Christian_Parallelizing_The_Naughty.pdf)
- Destiny used an "entirely job-based frame structure" with system-level pipelining. — [GDC Vault listing](https://gdcvault.com/play/1022164/Multithreading-the-Entire-Destiny)
- Fix Your Timestep: a variable dt makes "the behavior of your physics simulation depend on the delta time you pass in". The fixed-dt accumulator loop is `accumulator += frameTime; while (accumulator >= dt) { integrate(state, t, dt); accumulator -= dt; }`. Render interpolates with `alpha = accumulator / dt` (lerp, or slerp for rotations). Clamp `frameTime` to 0.25 s to avoid the "spiral of death", or cap steps per frame so the sim "will appear to slow down under heavy load". — [Gaffer On Games](https://gafferongames.com/post/fix_your_timestep/)
- SDL_GPU constraints for a render stage: a command buffer "may only be used on the thread it was acquired on" and "should be submitted on the thread it was acquired on". Multiple command buffers per thread are allowed. The suggested pattern is two per frame (render/compute plus copy). — [SDL3 wiki: SDL_AcquireGPUCommandBuffer](https://wiki.libsdl.org/SDL3/SDL_AcquireGPUCommandBuffer)
- SDL_GPU says complex scenes can use multiple command buffers "configured across multiple threads in parallel", but they must be submitted in the correct order. — [SDL3 wiki: CategoryGPU](https://wiki.libsdl.org/SDL3/CategoryGPU)
- `SDL_SubmitGPUCommandBufferAndAcquireFence` returns a fence "that the app can poll or wait on in a thread". Buffers, transfer buffers and textures "effectively function as ring buffers" via cycling. "Cycling will never undefine already bound data." — [SDL3 wiki: CategoryGPU](https://wiki.libsdl.org/SDL3/CategoryGPU)

### Inferences
- Under SDL_GPU, a command buffer is thread-affine: acquire, record and submit on one thread. Fiber migration is incompatible with that. Workable patterns:
  - Parallel jobs build *engine-side* command lists (sorted draw packets, POD), and one render thread translates them into SDL_GPU calls. This is like Unreal's Render→RHI split.
  - Each worker acquires its own command buffer and records it fully in one non-migrating job. Submission order is then coordinated, but the "submitted on the thread it was acquired on" rule means ordered submission happens from multiple threads. This needs care, and it is unclear whether SDL backends (Metal/Vulkan/D3D12) benefit.
- The first option is the safer default. SDL_GPU is a thin abstraction, and real parallel recording benefit in SDL_GPU is unverified.
- Suggested frame structure: main/OS thread (SDL events, window, swapchain acquire), simulation at fixed dt (jobified), producing a FrameParams snapshot. Then a render-prep stage (culling, LOD, animation pose finalize, draw-packet build, all jobified) on frame N-1, a GPU-submit thread, and the GPU on N-2. Memory is tagged by frame number and freed when the GPU fence for that frame signals.
- The physics fixed step (e.g. 60 Hz or 120 Hz) runs inside the sim stage. The render stage interpolates between the last two sim states using alpha stored in FrameParams.

### Gaps
- No primary source found for RAGE / GTA V update/render thread architecture. Only community speculation exists, so none is cited.
- No primary source retrieved on id Tech 6 / Doom 2016 job system or threading; the search returned only rendering frame analyses (e.g. [Courrèges Doom 2016 study](https://adriancourreges.com/blog/2016/09/09/doom-2016-graphics-study)), not CPU architecture.
- SDL wiki does not state whether `SDL_WaitAndAcquireGPUSwapchainTexture` must be called on the main/window thread.
- `SDL_SetGPUAllowedFramesInFlight` is listed but its semantics weren't retrieved.

## 4. Async IO for streaming: SDL3 SDL_AsyncIO, io_uring/IOCP/dispatch_io, IO threads

### Takeaway
SDL3 ships a cross-platform async file API (`SDL_AsyncIO`) with completion queues. It uses io_uring on Linux and IoRing on Windows 11 where available, and otherwise falls back to an internal thread pool. That fallback likely covers macOS; this is an inference, since the page lists no macOS-specific backend. It is a good default for streaming reads. Pair it with a dedicated "IO completion" thread that waits on the queue and posts decode/upload jobs, as Naughty Dog did.

### Cited Findings
- SDL_AsyncIO: "the functions that request I/O never block while the request is fulfilled". API: `SDL_AsyncIOFromFile`, `SDL_ReadAsyncIO`, `SDL_WriteAsyncIO`, `SDL_CloseAsyncIO(flush)`, `SDL_LoadFileAsync`, `SDL_CreateAsyncIOQueue`, `SDL_GetAsyncIOResult` (non-blocking), `SDL_WaitAsyncIOResult` (blocking, multiple threads allowed) and `SDL_SignalAsyncIOQueue` (wake waiters, e.g. at shutdown). — [SDL3 wiki: CategoryAsyncIO](https://wiki.libsdl.org/SDL3/CategoryAsyncIO)
- Results arrive "in order of completion, not in the order they were submitted". Don't create one queue per task. For max efficiency use one queue per thread to avoid contention. — [SDL3 wiki: CategoryAsyncIO](https://wiki.libsdl.org/SDL3/CategoryAsyncIO)
- Backends: Linux io_uring and Windows 11 IoRing where available, otherwise "SDL will offload the work to a thread pool". IOCP isn't mentioned. — [SDL3 wiki: CategoryAsyncIO](https://wiki.libsdl.org/SDL3/CategoryAsyncIO)
- Polling once per frame with `SDL_GetAsyncIOResult` is a supported simple pattern. Durability on close requires `flush=true`. — [SDL3 wiki: CategoryAsyncIO](https://wiki.libsdl.org/SDL3/CategoryAsyncIO)
- Naughty Dog kept I/O on system threads "Implemented like interrupt handlers (Read data, post new job)" that "never do expensive processing of the data". — [Gyrling slides](https://media.gdcvault.com/gdc2015/presentations/Gyrling_Christian_Parallelizing_The_Naughty.pdf)
- enkiTS provides `WaitForNewPinnedTasks` for IO threads that sleep until work arrives. — [enkiTS GitHub](https://github.com/dougbinks/enkiTS)

### Inferences
- Streaming design:
  1. The streamer decides what to load (priority by distance or visibility).
  2. It issues `SDL_ReadAsyncIO` into preallocated, pool-owned buffers.
  3. One IO thread blocks in `SDL_WaitAsyncIOResult`. On completion it pushes decompress/parse jobs (low priority) to the job system.
  4. The resulting GPU uploads are batched into the render thread's copy command buffer (SDL_GPU transfer buffers).
- On macOS, SDL's fallback is a thread pool doing synchronous reads (likely `pread`), not `dispatch_io`. This is acceptable given the fast NVMe SSD. Set the IO thread to a lower QoS than the game workers, without starving it (see section 6).
- Prefer large packed archive files (RPF-like) with few big reads over many small files. This reduces per-request overhead in all backends.

### Gaps
- The SDL wiki doesn't document the SDL version that introduced AsyncIO (it is in the SDL3 headers; likely 3.2.0, unverified), the thread pool size, or whether macOS has a native backend.
- No benchmarks found comparing SDL_AsyncIO backends.
- Raw io_uring, IOCP and `dispatch_io` APIs were not researched in depth. For direct use (bypassing SDL) consult each OS's docs; this is a gap.

## 5. Memory and primitives: frame arenas, thread-local scratch, C11 atomics and lock-free queues, C11 threads vs SDL threads vs pthreads, MSVC status

### Takeaway
Frame-tagged block allocators (Naughty Dog's tagged heap with per-worker blocks) plus per-thread scratch arenas are the proven pattern. `<stdatomic.h>` works on Clang and GCC. MSVC supports it only experimentally, since VS 2022 17.5, behind `/experimental:c11atomics` with `/std:c11`, and lock-free only (≤ 8 bytes, power-of-two sizes). C11 `<threads.h>` arrived in MSVC 17.8 as a separate runtime DLL. Use SDL3's thread, mutex, condvar and semaphore APIs (or thin native wrappers) for threads, and keep `<stdatomic.h>` behind a small macro layer with an `_Interlocked*` fallback for MSVC.

### Cited Findings
- Naughty Dog tagged heap with per-worker 2 MiB blocks: "No locks required for 99.9% of memory allocations". Free by tag, not by pointer. — [Gyrling slides](https://media.gdcvault.com/gdc2015/presentations/Gyrling_Christian_Parallelizing_The_Naughty.pdf)
- Plain PS3-style linear allocators ("Single/Double/Triple frame", rotate the block at frame start) "Works great when you process ONE frame at a time". Pipelining breaks that model. — [Gyrling slides](https://media.gdcvault.com/gdc2015/presentations/Gyrling_Christian_Parallelizing_The_Naughty.pdf)
- Molecular Matters: replacing `new` with a thread-local job allocator alone took 65k single jobs from 18.5 ms to 9.9 ms. Jobs are padded to a cache line to avoid false sharing. — [Molecular Matters part 3](https://blog.molecular-matters.com/2015/09/25/job-system-2-0-lock-free-work-stealing-part-3-going-lock-free/); [part 1](https://blog.molecular-matters.com/2015/08/24/job-system-2-0-lock-free-work-stealing-part-1-basics/)
- MSVC C11 atomics (VS 2022 17.5 Preview 2): "experimental implementation" enabled with `/experimental:c11atomics` in `/std:c11` or later. "At the moment only lock-free atomics are supported". These are "only lock-free for objects with sizes <= 8 and exactly equal to a power of two". `ATOMIC_VAR_INIT` is not provided. — [MSVC blog: C11 Atomics](https://devblogs.microsoft.com/cppblog/c11-atomics-in-visual-studio-2022-version-17-5-preview-2/)
- `__STDC_NO_ATOMICS__` stays defined even with the flag, so build systems that feature-test it need a special case (try compiling a TU that includes `stdatomic.h`). — [MSVC blog: C11 Atomics](https://devblogs.microsoft.com/cppblog/c11-atomics-in-visual-studio-2022-version-17-5-preview-2/) (as summarized via search of the same post)
- MSVC C11 threads (VS 2022 17.8 Preview 2): threads, mutexes, condition variables and thread-specific storage are implemented. They ship as a satellite DLL `vcruntime140_threads.dll`, with an ABI not shared with C++ threads. A commenter reported missing headers in the preview, and a fix was not confirmed. — [MSVC blog: C11 Threads](https://devblogs.microsoft.com/cppblog/c11-threads-in-visual-studio-2022-version-17-8-preview-2/)
- Lock-free work-stealing deque memory ordering: Pop requires a full barrier, Push needs a release fence on ARM, and Steal needs ordering between reading top and bottom. On "PowerPC, ARM, … you would need a memory fence instead" of compiler barriers. — [Molecular Matters part 3](https://blog.molecular-matters.com/2015/09/25/job-system-2-0-lock-free-work-stealing-part-3-going-lock-free/)
- Our Machinery's lock-free FIFO attempt "failed miserably", and they fell back to a spin-locked ring buffer. — [Our Machinery blog archive](https://ruby0x1.github.io/machinery_blog_archive/post/fiber-based-job-system)
- Wicked: a mutex-protected ring buffer beat an atomic spinlock on Windows 10. — [Wicked blog](https://turanszkij.wordpress.com/2018/11/24/simple-job-system-using-standard-c/)
- SDL3 thread priority: `SDL_SetCurrentThreadPriority` (since 3.2.0) with `SDL_THREAD_PRIORITY_LOW/NORMAL/HIGH/TIME_CRITICAL`. "Be prepared for this to fail". Some platforms require admin. Behaviour is controlled by `SDL_HINT_THREAD_PRIORITY_POLICY`. — [SDL3 wiki: SDL_SetCurrentThreadPriority](https://wiki.libsdl.org/SDL3/SDL_SetCurrentThreadPriority); [SDL3 wiki: SDL_ThreadPriority](https://wiki.libsdl.org/SDL3/SDL_ThreadPriority)
- macOS: unnamed POSIX semaphores (`sem_init`/`sem_wait`) are deprecated on macOS arm64, and cross-platform layers need a replacement. — [Apple Developer Forums thread](https://developer.apple.com/forums/thread/823121) (thread title and context; exact Apple wording not quoted)

### Inferences
- Atomics layer: write `atomics.h` with inline wrappers (`atomic_load_acq_u32`, `atomic_cas_u64`, `atomic_fence_seq_cst`, …).
  - Clang/GCC: map to `<stdatomic.h>` or `__atomic` builtins.
  - MSVC: either `/experimental:c11atomics` or `_InterlockedCompareExchange64` / `__iso_volatile_load64` plus `_ReadWriteBarrier`.

  Keep everything lock-free: ≤ 8 bytes, power-of-two sizes. Avoid 16-byte DCAS for ABA tagging, since it isn't portable through MSVC C11 atomics; use index+generation packed in 64 bits instead.
- Threads: SDL3 threads (`SDL_CreateThread`, `SDL_Mutex`, `SDL_Condition`, `SDL_Semaphore`, TLS) are the portable path, consistent with the rest of SDL. That avoids the `vcruntime140_threads.dll` redistributable and macOS's `sem_init` deprecation, because SDL wraps native primitives. Use raw pthreads or Win32 only where needed (e.g. `pthread_set_qos_class_self_np` on macOS, which SDL doesn't expose per the docs fetched).
- Memory architecture:
  - A global block heap (2 MiB blocks; on macOS 16 KiB pages, on x86 4 KiB pages or 2 MiB large pages).
  - Tag = (lifetime class, frame number).
  - Per-worker current block per tag.
  - Per-thread scratch arena (reset at job end or with a push/pop marker).
  - FrameParams ring.

  Free a tag when the corresponding GPU fence or stage completion has been observed.
- Prefer a mutex-guarded or simple MPMC ring for global queues, and Chase-Lev only for per-worker deques. Several of the sources found naive lock-free FIFOs not worth the complexity.

### Gaps
- No source confirmed whether MSVC C11 atomics left "experimental" status in VS 2022 17.8+ or VS 2026, or whether locking atomics were added. Check current MS docs.
- Not verified: whether `threads.h` headers ship correctly in released MSVC, or whether Apple's libc provides `<threads.h>` (historically it did not; unverified here).
- No benchmarks found for SDL3 mutex/condvar vs native on the three platforms.

## 6. Apple Silicon specifics: P vs E cores, QoS, no affinity

### Takeaway
On macOS you cannot pin threads to cores. You express intent with QoS classes (`pthread_set_qos_class_self_np`), and the scheduler decides P vs E placement. Apple explicitly warns against spin-waits and yield loops and recommends work-stealing over static partitioning because of heterogeneous cores. For the M4 Pro (8P + 4E per the brief), run game workers at User-Interactive/User-Initiated QoS, IO/streaming at Utility, and make the job system tolerate some workers being slower.

### Cited Findings
- QoS classes: User interactive (main-thread-like, "maximum performance and responsiveness"), User initiated, Utility ("balance between responsiveness, performance, and energy efficiency") and Background ("emphasizes energy efficiency"). — [Apple: Tuning for Apple silicon](https://developer.apple.com/documentation/apple-silicon/tuning-your-code-s-performance-for-apple-silicon)
- "On Apple silicon, a task's QoS class influences whether the system runs that task. For example, the system is more likely to run background tasks on lower performance cores." — [Apple: Tuning for Apple silicon](https://developer.apple.com/documentation/apple-silicon/tuning-your-code-s-performance-for-apple-silicon)
- "If you manually configure your thread's priority using pthread_setschedparam, setpriority, or thread_set_policy, transition to APIs that set QoS classes instead. For example, use the pthread_set_qos_class_self_np function". — [Apple: Tuning for Apple silicon](https://developer.apple.com/documentation/apple-silicon/tuning-your-code-s-performance-for-apple-silicon)
- Apple recommends GCD over custom pools for most apps, since GCD distributes across core types. For custom pools: "use your own work-stealing algorithm", and make the task count greater than the core count. `dispatch_apply` wants ≥ 3× core count iterations. — [Apple: Tuning for Apple silicon](https://developer.apple.com/documentation/apple-silicon/tuning-your-code-s-performance-for-apple-silicon)
- "eliminate spin locks and other spin-wait code that causes your thread to hold on to a core. Replace them with an [os_unfair_lock], a condition variable, or a standard mutex that lets your thread block." Spinning "exacerbates performance issues in producer-consumer algorithms when the consumer thread runs on a higher performance [core] and the producer runs on a lower performance" one. — [Apple: Tuning for Apple silicon](https://developer.apple.com/documentation/apple-silicon/tuning-your-code-s-performance-for-apple-silicon)
- "avoid pthread_yield_np and equivalent functions that yield the thread's time ... instead of blocking outright." — [Apple: Tuning for Apple silicon](https://developer.apple.com/documentation/apple-silicon/tuning-your-code-s-performance-for-apple-silicon)
- Naughty Dog's opposite approach (PS4, fixed hardware): workers locked to cores "Avoid context switches and unwanted core switching". — [Gyrling slides](https://media.gdcvault.com/gdc2015/presentations/Gyrling_Christian_Parallelizing_The_Naughty.pdf)
- SDL3 offers only coarse `SDL_SetCurrentThreadPriority`. No affinity or core-type API was found in the pages fetched. — [SDL3 wiki: SDL_SetCurrentThreadPriority](https://wiki.libsdl.org/SDL3/SDL_SetCurrentThreadPriority)

### Inferences
- Worker count on M4 Pro: about 11 workers (12 cores minus the main thread), all at `QOS_CLASS_USER_INTERACTIVE` or `USER_INITIATED`. The kernel will then mostly use the P cores and spill onto E cores. Alternatively, use about 7 high-QoS workers (P cores) plus a few Utility-QoS workers for streaming and decompression, which the kernel tends to place on E cores. Profile both in Instruments. Apple doesn't guarantee placement.
- Linux/Windows: affinity is available (`pthread_setaffinity_np`, `SetThreadAffinityMask`/`SetThreadGroupAffinity`), but Intel hybrid (P/E) CPUs on Windows have the same heterogeneity problem. Work-stealing is the portable answer. Hard pinning is optional, and the benefit is platform-dependent.
- Idle-worker parking: spin briefly (bounded, on the order of microseconds), then block on a semaphore, futex or condition variable. On macOS keep the spin phase very short or zero, per Apple's guidance. The "adaptive mutex" pattern from Naughty Dog fits all three OSes.
- Fiber-based systems that spin-wait on counters are especially at odds with Apple's guidance. Another reason to prefer work-stealing with help-while-waiting and block-when-empty on macOS.
- QoS also affects timer coalescing and frequency on macOS. Set the main thread and render thread to User Interactive explicitly if SDL doesn't (unverified whether SDL does).

### Gaps
- No Apple doc found stating exact P/E placement rules per QoS class, or behaviour under thermal pressure on M4 Pro.
- The M4 Pro core configuration (8P+4E vs 10P+4E variants) was not verified from an Apple source; taken from the brief.
- Not verified: whether SDL3's `SDL_SetCurrentThreadPriority` maps to QoS classes on macOS internally (the `SDL_HINT_THREAD_PRIORITY_POLICY` hint suggests some mapping exists).
- No sourced data on macOS `os_sync_wait_on_address` / `__ulock_wait` (futex equivalents) availability for C.
