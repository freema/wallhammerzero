# Our roadmap against real custom-engine projects: postmortems, success patterns and proposed changes

Scope note: this compares the Wallhammer Zero plan (DECISIONS D1–D15, STATUS 2026-11-05, milestones M0–M7 in "Architektura open world enginu", M0–M8 in "Procedurální grafika pro engine", the 12 measurements and 15 workflow rules in "Schopnosti AI v procedurální 3D grafice") with how other custom engines were actually built. Research budget: about 30 search/fetch calls. Primary sources were read where they were reachable (Anthropic engineering posts, Noel Berry, Josh Petrie, Mason Remaley, Game Developer interview with Gustafsson, 80.lv interview with Pounce Light, Media Molecule blog, Engadget on Blow, Molly Rocket page). Several items rest on press or encyclopedia summaries; this is flagged inline. Dates are publication dates of the source unless stated otherwise. "Inferences" are my engineering judgement, critical by design.

Short summary of our plan, for the reader: solo owner acting as art director, Claude Opus 5.5 writes all code. A general-purpose 3D open-world engine in C17 on SDL3 + SDL_GPU (D4, D5, D15). All graphics come from code, plus one-time AI images for some textures (D8, D14). The quality bar is GTA III / WoW (D13). It must handle a GTA-like city and a Light-No-Fire-like procedural planet (D15). No prototypes until the analysis is complete (D11). The plan: M0 skeleton + determinism, M1 core (jobs, allocators), M2 RHI + stylized lighting + reference scene, M3 assets as programs, M4 generated world/city, M5 game + vehicles + Jolt, M6 city content + open-world renderer, M7 characters/animation, M8 scaling + persistence. Audio and editor are "parallel from M3/M5 as needed". Networking is not mentioned anywhere.

---

## 1. Postmortems and lessons from specific custom-engine projects

### Takeaway
Shipped custom-engine successes (Teardown, Noita, Factorio, Tiny Glade, Godot's pre-history, Bitsquid with Fatshark, NMS, Blow's games) were each built for one concrete game, or with an in-house or anchor customer shipping games on it. Most of them took 3–10 years and found their final design or renderer only through discarded experiments. The engine-first projects without a flagship game (The Machinery, Stingray as a generic product, Hazel, Handmade Hero as a game) were shut down, retired, or stayed "early-stage" for years. The closest match to our D15 general-purpose ambition is the cohort that failed.

### Cited Findings

**The Machinery / Our Machinery (2016?–2022): engine-first, general-purpose, small expert team, shut down**
- Our Machinery was co-founded by Niklas Gray and Tobias Persson, who had earlier built Bitsquid/Stingray together. It sold The Machinery to paying early-access customers — [GameFromScratch, 2022-08-01](https://gamefromscratch.com/the-machinery-game-engine-appears-to-have-shut-down/); [Game World Observer, 2022-08-01](https://gameworldobserver.com/2022/08/01/our-machinery-terminates-machinery-game-engine-changes-eula)
- The shutdown notice gave only: "Unfortunately, we've reached a point where it's no longer possible for us to continue in the current direction." Licenses terminated 14 days after the notice, and users were asked to delete copies — [GameFromScratch, 2022-08-01](https://gamefromscratch.com/the-machinery-game-engine-appears-to-have-shut-down/)
- No public reason was given. Their social accounts had been silent since April 2022. The EULA was changed in late July 2022 to require users to "destroy any copies" on termination — [Game World Observer, 2022-08-01](https://gameworldobserver.com/2022/08/01/our-machinery-terminates-machinery-game-engine-changes-eula); [PC Gamer](https://pcgamer.com/alternative-game-engine-the-machinery-has-been-cancelled-with-devs-told-to-delete-all-trace-of-it)
- GameFromScratch called it "the single most effective advertisement that open source game engines could ever ask for." Studios lost a year or more of invested work — [GameFromScratch, 2022-08-01](https://gamefromscratch.com/the-machinery-game-engine-appears-to-have-shut-down/)
- Technical lessons already in our docs: their DLL hot reload was painful in practice, because objects with their own function pointers had to be tracked and patched, and signature changes silently broke old DLLs, which led to API versioning — [Our Machinery archive: DLL Hot Reloading in Theory and Practice](https://ruby0x1.github.io/machinery_blog_archive/post/dll-hot-reloading-in-theory-and-practice/); [API Versioning](https://ruby0x1.github.io/machinery_blog_archive/post/api-versioning/)

**Bitsquid → Autodesk Stingray (2009–2018): succeeded while anchored to game studios, failed as a generic product**
- Bitsquid was formed in Stockholm in 2009 by ex-Grin engineers together with Fatshark's owners. Its first shipped title was Hamilton's Great Adventure (2011). Most users were Fatshark and Arrowhead (Vermintide, War of the Roses, Helldivers) — [Wikipedia: Bitsquid](https://en.wikipedia.org/wiki/Bitsquid); [80.lv Vermintide interview](https://80.lv/articles/warhammer-vermintide-stingray-interview/)
- Autodesk bought it in June 2014 and rebranded it Stingray. Sales and development as a standalone product ended effective 2018-01-07. Autodesk's December 2017 FAQ said customers were "increasingly standardizing on Unity and Unreal Engine" — [Geo Week News, 2017-12-18](https://www.geoweeknews.com/news/autodesk-shutters-game-engine-development-cites-popularity-engines); [80.lv: End of the road for Stingray](https://80.lv/articles/end-of-the-road-for-stingray)
- Helldivers 2 (2024) still runs on the Bitsquid/Stingray lineage inside Arrowhead — [80.lv](https://80.lv/articles/helldivers-ii-was-built-on-an-archaic-engine-that-you-can-t-access-anymore/)

**Handmade Hero (2014–retired): building everything from scratch, on stream**
- The official page now says only: "Handmade Hero has been retired." The source archives can still be bought — [Molly Rocket / handmadehero.org](https://mollyrocket.com/handmade)
- A "Handmade Hero after two years" thread dates from December 2016. Forum posts mention ~350 episodes at one point and the series still running after four years — [gamedev.net, 2016-12](https://gamedev.net/forums/topic/684721-handmade-hero-after-two-years); [Handmade Network forum](https://hero.handmade.network/forums/game-discussion/t/1389/p/7812)

**Jonathan Blow: Jai + custom engine, ~10 years, one concrete game**
- Order of the Sinking Star launched 2026-10-08 on PC, PS5 and Switch 2 — [Game Informer, 2026-08-18](https://gameinformer.com/2026/08/18/order-of-the-sinking-star-launches-in-october); [Gematsu](https://gematsu.com/2026/08/order-of-the-sinking-star-launches-october-8). The Japanese report dates the PC version to Oct 9; the dates differ by a day — [Automaton, 2026-10-16](https://automaton-media.com/articles/newsjp/20261016-473889/)
- Blow had worked on it "fairly openly since releasing The Witness in 2016". It was originally meant to be "a much smaller game that took around 10 or 20 hours to play," but "it just blew up." The team is about 10 people full-time plus about 10 part-time contractors. "Blow and his team use custom game engines for their projects" — [Engadget, 2025-12-11](https://www.engadget.com/gaming/ten-years-after-the-witness-jonathan-blows-next-massive-puzzle-game-is-almost-ready-for-primetime-015727378.html)

**Teardown (Dennis Gustafsson): novel tech first, but for one game; design took a long time to find**
- "It started as a technology experiment with a fully destructible voxel world." "The destruction came first, and the setting was more or less retrofitted to suit the technology." — [Game Developer, 2021-07-21](https://gamedeveloper.com/design/combining-bombastic-heists-with-a-fully-destructible-voxel-world-in-i-teardown-i-)
- About 3 years of voxel experiments. Six months of concept work with Emil Bengtsson "eventually gave up", then another six months alone before he arrived at the Teardown design. "Designing a game that actually works in a fully destructible environment was a lot harder than we anticipated." — same source
- "The engine and tool pipeline are created from scratch in C++ for this game specifically," and the novel tech made an off-the-shelf engine impractical — same source
- Before settling on heists, the game was a driving game, a survival sim and a stealth game — [Rock Paper Shotgun (mirror)](https://wwwrockpapers.pages.dev/posts/how-teardown-made-a-great-game-from-destruction)
- Gustafsson started the tech in 2017 after winding down Mediocre. He had a physics-middleware background (Meqon/AGEIA 2001–2007) — [Wikipedia: Teardown](https://en.wikipedia.org/wiki/Teardown_(video_game)); [voxagon.se](https://voxagon.se/)

**Noita (Nolla Games, Falling Everything engine)**
- Petri Purho's GDC 2019 talk covered scaling the falling-sand simulation to large continuous worlds and adding destructible rigid bodies — [GDC Vault](https://gdcvault.com/play/1025695/Exploring-the-Tech-and-Design)
- The engine is C++ but uses middleware: Box2D (rigid bodies), Sean Barrett's herringbone Wang tiles (procgen) and FMOD (audio). Early access opened 2019-09-24 — [80.lv](https://80.lv/articles/noita-a-game-based-on-falling-sand-simulation/); [Wikipedia: Noita](https://en.wikipedia.org/wiki/Noita_(video_game)). I did not find the engine's start date.

**Factorio (Wube): custom engine, 8.5 years to 1.0, justified by performance and determinism**
- Development started in 2012, Indiegogo ran in 2013, Early Access in 2016, and 1.0 shipped 2020-08-14 — [Kotaku, 2020](https://kotaku.com/factorio-reaches-1-0-after-eight-years-of-development-1844744187); [Gigazine, 2020-08-17](https://www.gigazine.net/gsc_news/en/20200817-factorio-ver-1-0)
- In the 2020 developer AMA, Rseding91 said that with Unreal, Unity or Godot they would not approach Factorio's performance, and that those engines are too restrictive for game logic. This is a reddit AMA via a mirror, so the attribution is secondary — [r/factorio AMA mirror, 2020-09-05](https://redlib.ssps.io/r/factorio/comments/in5d3i/developer_technicaloriented_ama/g45dtcz/?context=3)

**Tiny Glade (Pounce Light, 2 people): modified Bevy, custom renderer only where it differentiates**
- It began as "a hobby weekend project to test rendering" / a procedural wall generator in Bevy. The team is "still using a modified version of Bevy to this day" (its ECS), while rendering moved to their own Vulkan work for compute shaders and Linux support. They designed from "the target experience" rather than from engine limits. Features went through "five or six iterations", and bridges were not in the original plan — [80.lv interview, 2024-05-30](https://80.lv/articles/exclusive-tiny-glade-developers-discuss-bevy-proceduralism-publishers-cozy-games/)
- Released 2024-09-23 — [Wikipedia: Tiny Glade](https://en.wikipedia.org/wiki/Tiny_Glade). The renderer talk "Rendering Tiny Glade With Entirely Too Much Ray Marching" was given at the Graphics Programming Conference 2024 (Breda, 12–14 Nov 2024). I verified the talk only via social posts and the Khronos event page — [Khronos event](https://www.khronos.org/events/graphics-programming-conference)
- The claim that the renderer was built first as a skills exercise comes from reddit hearsay and is unverified — [r/rust mirror](https://pol1.lr.ggtyler.dev/r/rust/comments/1frfc6q/the_release_of_tiny_glade_a_game_built_in_rust)

**Dreams (Media Molecule): years of renderer R&D, most of it thrown away**
- Alex Evans' SIGGRAPH 2015 / Umbra Ignite talk is titled "Learning from Failure: a Survey of Promising, Unconventional and Mostly Abandoned Renderers for 'Dreams PS4'". It covers the journey "including the failures" of "finding" the engine — [Media Molecule blog](https://www.mediamolecule.com/blog/article/alex_at_umbra_ignite_2015_learning_from_failure_video); [slides](https://advances.realtimerendering.com/s2015/AlexEvans_SIGGRAPH-2015-sml.pdf)
- The slides say stored SDF fields could not ship in UGC downloads, so a fast evaluator was needed. A texture-based approach was "great for incremental edits but terrible for loading and animation". Per a Beyond3D thread, Sebastian Aaltonen said the renderer in the 2015 talk is not the one that shipped — [Beyond3D thread](https://forum.beyond3d.com/threads/signed-distance-field-rendering-pros-and-cons-as-used-in-ps4-title-dreams-spawn.57006) (secondary)
- Development ran from about 2012/2013 to the PS4 release in February 2020 — [Wikipedia: Dreams](https://Www.wikipedia.org/wiki/Dreams_(video_game)); [VGC interview](https://www.videogameschronicle.com/features/interviews/interview-media-molecules-grand-ambitions-for-dreams)

**No Man's Sky (Hello Games): procedural universe, small team**
- Sean Murray: average team size over development was 6, and the final team at launch was 15 — [GamesRadar](https://gamesradar.com/no-mans-sky-how-the-biggest-game-ever-made-almost-never-happened); [GamesBeat 10-year retrospective](https://gamesbeat.com/hello-games-sean-murray-waxes-about-10-years-of-no-mans-sky/)
- One summary gives about three years of development. I found no primary source on how the custom engine was built — [Wikipedia: No Man's Sky](https://en.wikipedia.org/wiki/No_Man%27s_Sky)

**Godot: was an in-house engine shipping titles before going general**
- Juan Linietsky and Ariel Manzur developed it for several years as an internal engine and shipped several work-for-hire titles with it before open-sourcing it in February 2014. The source is the Godot README text, seen via GitHub mirrors — [Godot README mirror](https://github.com/Yinimi/godot)

**Wicked Engine (János Turánszki): solo, 10+ years, a rendering showcase rather than a shipped game**
- The GitHub repo dates from June 2015 and the blog from November 2016. The engine is primarily maintained by one developer. It later gained Xbox Series and PS5 support (~2023). The games on his itch page are small: Wicked Shooter and Grass Zen — [wickedengine.net 2016](https://wickedengine.net/2016/11/welcome-brave-developer); [80.lv](https://80.lv/articles/the-code-oriented-and-lightweight-wicked-engine-now-supports-ssgi/); [itch.io](https://itch.io/profile/turanszkij). The "solo" framing comes partly from a third-party site — [render-scope](https://render-scope.web.app/renderer/wicked-engine/)

**Flax Engine: about 8 years from first code to 1.0**
- First code was written in 2012. A year of closed alpha and a year of closed beta followed, and 1.0 shipped in December 2020 with full source public — [Flax 1.0 announcement](https://flaxengine.com/blog/flax-1-0-released/); [GameFromScratch](https://gamefromscratch.com/?p=24265)

**Hazel (TheCherno): engine as a teaching series**
- Started in 2018 as a YouTube "Game Engine" series. The public README calls it "primarily an early-stage interactive application and rendering engine for Windows". Development is "rather slow, since everything has to be taught and implemented on-camera". The advanced version lives in a private Patreon repo. Cherno later joined Lucky Robots, which bases its engine on Hazel. Dates are partly unclear — [GameFromScratch: RIP Hazel?](https://gamefromscratch.com/rip-hazel-engine/); [Hazel README mirror](https://github.com/sametaylak/Hazel/blob/master/README.md); [GameDev.net Oct 2025 devlog](https://gamedev.net/news/456-where-hazel-is-at-and-what-weve-been-up-to-october-2025-hazel-dev-log/)

**Veloren (Rust voxel RPG, volunteers)**
- Development began 2018-05-28, with an engine rewrite at the start of 2019. In 2020 it was still alpha (v0.7) with about 20 active developers and about 20 artists, writers and composers, on roughly 3-month milestone releases — [GamingOnLinux interview, 2020-06](https://www.gamingonlinux.com/2020/06/interviewed-veloren-an-upcoming-foss-multiplayer-voxel-rpg/page=1/); [Veloren wiki](https://wiki.veloren.net/wiki/Main_Page?oldid=1457)

**Noel Berry, "Making Video Games in 2025 (without an engine)" (2025-05-18)**
- He uses C# with `dotnet watch` hot reload, SDL3 (including its GPU API), his own thin Foster layer, FMOD for audio, and Dear ImGui plus reflection for custom editors tied to game data. "I am not making a 'do everything' game and I do not need 90% of the features these engines provide." For features or cutting-edge tech he says use Godot or Unreal. His work is mostly 2D; Celeste 64 took under two weeks — [noelberry.ca](https://noelberry.ca/posts/making_games_in_2025/)

**Counter-arguments: "write games, not engines"**
- Josh Petrie (2007-08-30): engines built before games become "unfocused tech demos". "A game is much easier to identify requirements for, much narrower in focus." "The notion that you must have an engine to build a non-trivial game is a fallacy." The engine should be harvested from finished games by refactoring shared code into a base library and re-testing against the shipped game — [Write Games, Not Engines (mirror)](https://geometrian.com/projects/blog/write_games_not_engines.html)
- Mason Remaley (2023-09-13, custom engine for Way of Rhea): "If you decide to build an engine, don't try to build Unity. Build an engine for you." "Don't start there [commercial product]… Make it work for you first." "Your tools are what help you iterate, iteration is what makes your game fun." "Don't overengineer, but don't underinvest in your tools either." — [gamesbymason.com](https://gamesbymason.com/blog/2023/make-your-own-game-engine/)

### Inferences
- Timeline realism. Comparable tech efforts took 3 years of tech for Teardown, 8.5 years for Factorio, about 8 for Flax, about 7 for Dreams, about 10 for Blow's game, and about 3 for NMS (with an average of 6 people). Our documents contain no time estimates at all. Even with AI-written code, the bottleneck our own report 3 names (visual verification by one human) does not shrink with model speed. The roadmap should carry explicit time and owner-review budgets per milestone.
- The one directly comparable story (The Machinery) is people with the exact pedigree we borrow from (Bitsquid, then a modular C engine with a plugin registry) building a general engine without a shipped first-party game. They stopped after a few years with no stated reason. We cite their blog as design authority (STATUS, research 1), but their product outcome is the cautionary half of the lesson. The reason for the shutdown is unknown, so we cannot claim it was the lack of a game. What we can say is that their general engine had no flagship game proving it.
- Novel-tech projects (Teardown, Dreams, Tiny Glade, Noita) found their final tech by discarding experiments. Dreams abandoned several renderers. Teardown went through driving, survival and stealth before heists. This conflicts with D11's premise that analysis can settle the design before code. Analysis can settle architecture, but not aesthetic or feel risk (the WoW-painted look, cars from code, faces). Those can only be retired by building things.
- Successful projects bought middleware for the parts that did not differentiate them: Box2D and FMOD in Noita, FMOD and SDL3 for Berry, Bevy ECS for Tiny Glade. Our plan already does this (SDL3, Jolt, meshoptimizer). It should apply the same rule to the job system (enkiTS was rejected in favour of writing our own) and to profiling (Tracy-style tooling). Every "write our own" in M1 is time spent off the differentiating path.

### Gaps
- No primary statement from Gray or Persson on why The Machinery ended. I found only press summaries. A GDC or blog postmortem by them may exist and was not found.
- The founding year of Our Machinery (2016?) and whether they ever shipped or seriously dogfooded a game are unverified.
- Handmade Hero's final episode count, its retirement date, and whether the game reached a complete state are not given on the official page.
- I found no primary source on how No Man's Sky's engine was built (only team size).
- Veloren's 2025/2026 status was not found.
- The Tiny Glade GPC 2024 talk content was not read (video only).

---

## 2. What made custom engines succeed

### Takeaway
The pattern behind the successes is game-driven development. Each team built the minimum engine for one concrete slice of one game, invested early in iteration tools (hot reload, in-game editors, ImGui panels), used middleware for everything non-differentiating, and generalized only after shipping. Godot and Bitsquid became general engines after a game, or with an anchor game studio, not before.

### Cited Findings
- Teardown: "created from scratch in C++ for this game specifically" — [Game Developer, 2021](https://gamedeveloper.com/design/combining-bombastic-heists-with-a-fully-destructible-voxel-world-in-i-teardown-i-)
- Tiny Glade: designed from "the target experience" and iterated features five or six times through playtests — [80.lv, 2024](https://80.lv/articles/exclusive-tiny-glade-developers-discuss-bevy-proceduralism-publishers-cozy-games/)
- Godot was an in-house engine shipping work-for-hire titles for years before going general in 2014 — [Godot README mirror](https://github.com/Yinimi/godot)
- Bitsquid had Fatshark as co-founder and customer, and its first game shipped in 2011, two years after founding — [Wikipedia: Bitsquid](https://en.wikipedia.org/wiki/Bitsquid)
- Factorio's custom engine was justified by a specific need (simulation performance and determinism) that general engines don't meet — [r/factorio AMA mirror, 2020](https://redlib.ssps.io/r/factorio/comments/in5d3i/developer_technicaloriented_ama/g45dtcz/?context=3)
- Tooling as the success factor: "your tools are what help you iterate" — [Remaley, 2023](https://gamesbymason.com/blog/2023/make-your-own-game-engine/). Berry builds custom level editors with ImGui and reflection directly over game data, plus hot reload — [Berry, 2025](https://noelberry.ca/posts/making_games_in_2025/)
- Engines grow out of games: refactor shared code from finished games into a library — [Petrie, 2007](https://geometrian.com/projects/blog/write_games_not_engines.html)
- Scope creep is real even for veterans. Blow's game was meant to be 10–20 hours and "it just blew up" — [Engadget, 2025](https://www.engadget.com/gaming/ten-years-after-the-witness-jonathan-blows-next-massive-puzzle-game-is-almost-ready-for-primetime-015727378.html)
- Engines that served something other than a game, such as education (Hazel) or a general product (Stingray), progressed slowly or lost to Unity/Unreal — [Hazel README mirror](https://github.com/sametaylak/Hazel/blob/master/README.md); [Geo Week News, 2017](https://www.geoweeknews.com/news/autodesk-shutters-game-engine-development-cites-popularity-engines)

### Inferences
- What our plan already does well: real exit criteria per milestone, determinism and golden hashes from M0, a headless capture harness, a game DLL with hot reload, shader hot reload, generator hot reload in M3, middleware for physics, and treating "assets as programs" as the core content tool.
- Tooling is under-weighted, though. Under D8 there is no DCC tool, so the engine's own in-engine tools (parameter panels, live recipe editing, a debug camera, an entity/cell inspector, a contact-sheet viewer) are the only art pipeline the owner, as art director, will ever touch. The plan defers the cimgui editor to "parallel from M3" and editors and inspectors to "as needed from M5". By the precedent above (Berry, Remaley, Tiny Glade's iteration loop), the owner-facing review and tweak UI belongs in M2, alongside the first reference scene.
- "Game-driven" can be honoured without violating D15 by choosing reference slices that act as the anchor customer (see section 4).

### Gaps
- I found no quantitative data on how much engine time successful teams spent on tools versus runtime. The evidence is qualitative.

---

## 3. How our milestones compare: front-loading, missing pieces, proposed order

### Takeaway
Our M0–M8 front-loads infrastructure (job system, allocators, cooker/VFS/resource DB, streaming) before the owner can walk around in anything resembling the target. The first owner-judged visual checkpoint is M2, but the first playable thing is M5 and the first street-level judgement against GTA III is M6. Several systems every shipped game needed are missing or deferred without a slot: in-engine UI/inspector, profiler, save/persistence (only M8), audio, text/HUD, input mapping, an explicit networking decision, crash logging and asset browsing. Most importantly, the planet half of D15 has no milestone at all. I propose an order that keeps every permanent-code rule but puts a playable, owner-reviewable reference slice at roughly M3 and a planet-shape test early.

### Cited Findings
- Precedent for finding the target by building: Teardown's design came after a year of failed concepts on top of working tech — [Game Developer, 2021](https://gamedeveloper.com/design/combining-bombastic-heists-with-a-fully-destructible-voxel-world-in-i-teardown-i-); Dreams abandoned most of its candidate renderers — [MM blog](https://www.mediamolecule.com/blog/article/alex_at_umbra_ignite_2015_learning_from_failure_video)
- Carlini added CI late, "after new features kept breaking existing functionality". Regressions were the dominant failure mode — [Anthropic, 2026-02-05](https://www.anthropic.com/engineering/building-c-compiler). Our plan puts CI in M0, which matches the lesson.
- An incremental, verifiable-feature workflow beat one-shotting: "do too much at once" left half-built, undocumented states — [Anthropic, 2025-11-26](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- Hot reload of whole-engine modules was painful at Our Machinery, which supports our plan's choice to limit hot reload to the game DLL, shaders and generators — [Our Machinery archive](https://ruby0x1.github.io/machinery_blog_archive/post/dll-hot-reloading-in-theory-and-practice/)
- Berry's minimal stack for shipped games: SDL3, his own thin layer, FMOD, ImGui editors and hot reload. It is a small foundation plus tools, with no allocator, job or streaming frameworks up front — [Berry, 2025](https://noelberry.ca/posts/making_games_in_2025/)

### Inferences (critical review of our plan)
1. **Two roadmaps coexist.** The architecture report has M0–M7 and the procgen report has M0–M8, and they differ in content (e.g. "synthetic city" vs "generated city" in M4, renderer in M6, characters in M7). STATUS does not say which is canonical. One roadmap file is needed before implementation (proposed: `docs/ROADMAP.md`).
2. **M1 (job system, allocators, QoS, a TSan-stress-tested Chase-Lev deque) has no consumer.** Its exit criterion ("parallel_for over 1M elements scales on P and E cores") is a micro-benchmark, not a user need. Per Petrie and Remaley, build it when the first generator needs it. Proposal: M1 keeps only a minimal `jobs_run/jobs_wait` API with a trivial thread-pool implementation (same API, as research 1 already designs). Chase-Lev, parking and QoS tuning move to the scaling milestone, triggered by a profiler showing a need.
3. **M3 bundles too much.** It contains a cooker, VFS, resource DB, Merkle cache, generator DLL hot reload, gencli, genlint, the full texture operator set with the AI-image import pipeline, BC compression, half-edge ops and the meshoptimizer chain. That is the largest milestone, and it sits before anything playable. Split it into M3a (generator-as-provider, cache, hot reload, review sheet; enough for the reference slice) and a later part (cooker/packs/BC, done with scaling).
4. **The first time the owner can drive is M5, and the first GTA III street-level verdict is M6.** The aesthetic risks named in our own reports (WoW-painted look, cars from code, "oatmeal" sameness, faces) are retired last. They are the risks most likely to change direction, so they should be retired first. Dreams and Teardown show such discoveries can invalidate earlier tech.
5. **The planet half of D15 has no milestone.** The world-shape port (flat grid vs cube-sphere) is an open item in STATUS, and every exit criterion is city/flat. A port designed with only one implementation is speculative. A second implementation must exist early (even crude) to prove the abstraction, or it will be wrong in exactly the places (coordinates, "up", streaming keys, LOD) that are expensive to change later.
6. **Missing or unslotted systems** (each present in the shipped-engine stacks above):
   - Owner-facing debug UI and inspector (cimgui), free/debug camera, live parameter panels: needed in M2 (see section 2).
   - CPU/GPU profiler: SDL_GPU has no timestamp queries (D5). M1 lists "profiler hooks", but there is no plan for GPU timing (Instruments/Metal System Trace, or a native backdoor). Measurements #1–#2 depend on this.
   - Save/persistence: only in M8, yet STATUS open questions 3–4 (fixed world vs new world, how much it changes) decide whether deltas, stable IDs and diff persistence shape the world format from M4. Decide the persistence model before M4 and test save/load from M4.
   - Audio: never scheduled. SDL3 audio is a port in the architecture, and a minimal mixer plus procedural engine/footstep sounds should appear by the first drivable slice, since "feel" (STATUS risk) is partly audio.
   - Text rendering, HUD and menus: not mentioned. Needed for any playable slice and for debug overlays.
   - Input mapping and gamepad support: implicitly in `platform`, but not stated.
   - Networking: never mentioned. It must be decided explicitly, even as "never" or "maybe later lockstep", because it constrains determinism scope (currently only generators are deterministic, with a deterministic headless replay in M5), entity ID schemes and simulation tick architecture. Factorio's custom engine was justified partly by determinism — [AMA mirror](https://redlib.ssps.io/r/factorio/comments/in5d3i/developer_technicaloriented_ama/g45dtcz/?context=3).
   - Crash reporting and log capture for agent sessions: part of the agent harness (section 5).
7. **3-OS CI from M0 is right for build and headless tests, but GPU validation on Windows/D3D12 is impossible locally** (STATUS Q7). Don't let "verifiable on all three OS" in every milestone block progress. Make GPU exit criteria macOS-only until a Windows GPU machine exists, and run build plus headless golden hashes on all three.

**Proposed order** (all permanent code, no throwaway prototypes, so compatible with D11 once analysis closes):
- **M0 Skeleton + harness.** CMake targets, platform, `gpu` clear, `gen_core` detmath/RNG golden hash on 3 OS (unchanged). Add the agent harness from day 1: a JSON feature/acceptance list per milestone, a progress file, `--capture` headless PNG + JSON report, and one-line greppable test output (section 5).
- **M1 Minimal core + RHI + debug UI.** Arenas, log, thin job API on a simple pool. RHI with handles, shader pipeline + hot reload, cimgui overlay, free camera, CPU profiler zones, and GPU timing via Instruments captures. Measurements #2 (CPU cost per draw on Metal), #4 and #11 happen here.
- **M2 Reference slice A, "one city block" (≈256 m, one cell, no streaming).** Stylized lighting pipeline, ~10 materials (both sources, D14), a building generator v0, a road/sidewalk generator, props, one car generator v0, Jolt, a drivable car, minimal audio, HUD text, and the review contact sheet. The owner judges it against GTA III references. Measurements #1, #8, #9 and #10 happen here. This is the "game-driven" anchor: everything built is engine code, but scoped by what this slice needs.
- **M3 Reference slice B, "planet stub".** A cube-sphere world-shape implementation behind the world-shape port, with coarse terrain from the same `gen_world` interfaces, camera-relative coordinates at planet scale, gravity "up" per position, and flying from orbit to ground over one biome. It proves the D15 port with two implementations before streaming hardens around the flat grid.
- **M4 Assets as programs (full) + streaming.** Cooker/packs, resource DB, cell streaming for both world shapes, LOD tree, the persistence model decided and tested (save/load across OS).
- **M5 City at scale.** The 4×4 km generated city, CGA facades, district palettes, 30k+ instances, GPU culling within SDL_GPU limits. Measurement #3 (thermal) runs here.
- **M6 Characters and animation** (or swap with M5 if the owner wants face/character risk earlier, as research 2 already allows).
- **M7 Scaling.** Full work-stealing jobs, sim/render pipelining, budgets/LRU, predictive streaming, the 200 km/h test.
- **Continuous from M1:** tools, profiler, the audio port. Networking is a written decision (D-number) before M2.
- The trade-off: this delays the "proper" job system and cooker, so M2 and M3 run single-cell and partly single-threaded. That is acceptable because their purpose is to retire aesthetic and port-design risk, and the API shapes stay as designed. The risk is that hasty slice code ossifies; mitigate by requiring every slice feature to live in its final module, with tests.

### Gaps
- No source quantifies the cost of retrofitting a job system or streaming into a codebase that started single-threaded. Teams like Our Machinery and Wicked wrote theirs early, but neither published retrofit data. The judgement that the API-first, implementation-later split is safe rests on our research 1's API design, not on external evidence.
- I found no evidence of any engine that kept a world-shape abstraction (flat and planet) working from the start. NMS and Light No Fire are planet-only as far as public info goes. The value of an early planet stub is my inference.

---

## 4. Risks of a general-purpose engine without a concrete game (D15), and how others handled it

### Takeaway
Every general engine I found that thrived had a concrete game or anchor customer driving priorities: Godot (work-for-hire titles), Bitsquid (Fatshark/Arrowhead), Unreal-style first-party games, and Blow's engine (his game). The general products without that anchor (The Machinery, Stingray post-acquisition, Hazel's public version) stalled or ended. D15 is legitimate as an architectural constraint, but as a scope statement it removes the main prioritisation signal. It needs replacing with explicit reference slices that act as the "customer".

### Cited Findings
- Engines built before games become "unfocused tech demos". Games give clear, narrow requirements — [Petrie, 2007](https://geometrian.com/projects/blog/write_games_not_engines.html)
- "Don't try to build Unity. Build an engine for you." Unity "attempts to be an engine for every genre, and every team" — [Remaley, 2023](https://gamesbymason.com/blog/2023/make-your-own-game-engine/)
- "I am not making a 'do everything' game and I do not need 90% of the features these engines provide." — [Berry, 2025](https://noelberry.ca/posts/making_games_in_2025/)
- Stingray as a standalone general product lost to Unity/Unreal standardization — [Geo Week News, 2017](https://www.geoweeknews.com/news/autodesk-shutters-game-engine-development-cites-popularity-engines); the same codebase lived on inside a game studio — [80.lv](https://80.lv/articles/helldivers-ii-was-built-on-an-archaic-engine-that-you-can-t-access-anymore/)
- The Machinery had no publicly known flagship game and ended in 2022 without a stated reason — [GameFromScratch, 2022](https://gamefromscratch.com/the-machinery-game-engine-appears-to-have-shut-down/)
- Godot's generality came after years of shipping in-house titles — [Godot README mirror](https://github.com/Yinimi/godot)

### Inferences
- Specific D15 risks for us:
  (a) **Port speculation.** The world-shape, coordinate and streaming abstractions get designed for both city and planet, but only one gets built. The abstraction then fits neither.
  (b) **No "done" criterion.** Without a game, every subsystem can always be extended. Our milestones have exit criteria, but no list of what the engine will NOT do.
  (c) **Feature priority by interest** rather than by need. This is the Hazel/Wicked pattern: impressive rendering features, small games.
  (d) **The owner's art-director role lacks a target.** The style bible, references and the "oatmeal" variability priorities (research 3) are all per-game decisions. A general engine cannot have one style bible, but D10 expects one.
  (e) **Motivation risk.** Long projects (Factorio 8.5 years, Blow ~10 years) were sustained by a game people could play. Handmade Hero, built from scratch without a shipped game, was retired.
- Mitigations, mirroring what successful general engines did:
  1. Name two or three **reference slices as standing "customers"**: (A) a GTA-III-like downtown block with a drivable car and pedestrians, (B) a planet flyover landing at a village or fortress with a mount, and optionally (C) the voxel game from Vellum as a later customer. Each is a living demo kept green in CI, like an anchor studio's game.
  2. Write a **non-goals list** (e.g. no multiplayer before X, no editor for third parties, no mobile, no photoreal, no general scripting language) as a D-entry.
  3. Treat "general" as **two implementations behind each port** that D15 names (world shape, gravity/up, coordinates), and nowhere else. YAGNI (build only what is needed now) applies everywhere else.
  4. Give **each slice its own style bible**, which resolves D10 per slice rather than for "the engine".
  5. Revisit D15 after slice A. If the city slice consumes the expected budget, decide consciously whether the planet stays in scope (cf. Blow's 10–20 h game that "blew up").

### Gaps
- I found no published case of a general-purpose engine built by a solo developer (with or without AI) that reached shipped commercial games. The closest are Wicked (solo, long-running, small demo games) and Flax (originally one developer, 8 years to 1.0, no famous flagship game found). This absence is itself evidence, but weak.

---

## 5. AI-assisted large codebases: lessons for structuring milestones as machine-verifiable increments

### Takeaway
Anthropic's own long-horizon experiments show that agents deliver large codebases when (1) the verifier is near-perfect and existed before the work, (2) work is split into many independent, individually testable failures, (3) state lives in files (feature lists, progress logs, git) rather than in context, and (4) test output is compact and sampled. Agents fail on monolithic goals, false "done" claims and regressions. The compiler had a crisp spec and decades of test suites. Our engine's hardest parts (look, feel) have no such oracle, so the human gate is the bottleneck and must be designed as one.

### Cited Findings
- **C compiler (Carlini, 2026-02-05):** 16 parallel Opus 4.6 agents over ~2 weeks, ~2,000 sessions, under $20k, 2B input / 140M output tokens, ~100k lines of Rust. It builds Linux 6.9 on x86/ARM/RISC-V and ~99% of GCC torture tests pass. However, its optimized output is worse than GCC -O0, the assembler and linker are still buggy, it uses GCC for 16-bit real mode, and its code quality is "well short of an expert" — [Anthropic](https://www.anthropic.com/engineering/building-c-compiler)
- The harness: a `while true` loop restarting fresh containers, task locks as files in `current_tasks/`, git as the only coordination, no orchestrator, READMEs and progress files kept current, and a running document of failed approaches — same source
- Verification: "Make verifiers near-perfect", since the agent solves whatever the tests define. Output limited to a few lines, with details in logs and greppable ERROR markers. A `--fast` 1%/10% deterministic per-agent sample. CI added late after regressions. "It is easy to see tests pass and assume the job is done, when this is rarely the case." — same source
- Parallelism: sixteen agents did not help on the Linux kernel ("one large task"). The fix was GCC as a known-good oracle plus delta debugging. Specialist agents (dedup, performance, code quality, docs) helped — same source
- Capability trajectory: Opus 4 barely built a functional compiler, 4.5 passed suites but not real projects, 4.6 hit the experiment's ambitions — same source
- **Long-running harness (Anthropic, 2025-11-26):** an initializer agent writes `init.sh`, a progress log and a JSON feature list (200+ features, all initially failing). Agents may only flip `passes`, and "It is unacceptable to remove or edit tests". JSON is used because models overwrite it less than Markdown. One feature per session, an end-to-end test at session start, git commits per feature. The observed failure modes were one-shotting, premature victory, marking features done without end-to-end checks, and leaving undocumented states — [Anthropic](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

### Inferences (implications for our roadmap)
- Our research 3 already adopts part of this: rule 13 (short output, `--fast`, progress files), separate evaluator, golden hashes, and lints-before-render. What is missing is a **roadmap expressed as a machine-checkable artifact**. Each milestone should come with `milestones/Mx.json`: a list of acceptance items, each with an id, a command, an expected result and `passes:false`. Agents may only flip `passes`. Human-gate items are marked `owner_gate:true` and can only be flipped by the owner.
- **Oracles per engine area**, the analog of GCC as known-good. These turn "one giant task" into many independent failures, which is where agents and parallelism help:
  - detmath against libm within a stated ulp (units in the last place) tolerance, plus cross-OS golden hashes (already M0)
  - job system against a single-threaded reference giving the identical result hash
  - RHI null backend against the Metal backend command stream
  - streaming against "load everything" producing the identical visible instance set
  - LOD/HLOD against full detail within a screen-space error metric
  - physics replay against recorded golden trajectories
  - generator lints (connectivity, floating parts, palette histogram) against the family spec
- **Avoid monolithic goals.** "Make the city look like GTA III" is the Linux-kernel case. Decompose into asset families, each with a numeric spec and lints, and run parallel agents only across families (rule 14, already present).
- **Regression protection from M0**, not later: CI plus golden-hash diffs of untouched families (rule 10) on every change. Carlini's late CI is the negative example.
- **Expect performance and code-quality gaps.** The compiler's codegen was poor and its code below expert level. For an engine whose budgets are tight (M4 Pro 60 fps, draw-call CPU limits on SDL_GPU Metal), add specialist passes (a performance agent working from profiler data, a code-quality/dedup agent) as recurring roadmap items, and keep perf budgets as CI-checked numbers (frame time in the headless benchmark scene, draw count, memory).
- **The owner is the scarce resource.** At human gates the plan should batch reviews (contact sheets of N variants, pairwise A/B choices), schedule them at fixed points per milestone, and keep calibrating the separate evaluator (measurement #8) so that more gates can be delegated. Otherwise agent throughput simply queues at the owner, which our research 3 already calls the main problem ("problém s ověřováním").
- **Model trajectory.** The capability jump from Opus 4 to 4.6 in one experiment suggests designing the harness to outlive the model (research 3 says this too). It does not justify scheduling hard parts later in the hope that a better model will solve them, since visual judgement did not show the same trend in our research 3 sources.

### Gaps
- I found no public long-horizon agentic project that built a real-time 3D engine or renderer with verifiable outcomes comparable to the C compiler case. The transfer of Carlini's lessons to graphics, where oracles are weaker, is inference.
- No data on human-review throughput (renders per hour an art director can reliably judge) was found. It would be needed to budget the owner gates.
