# Asset pipeline and module systems in current engines (2025–2026), compared with Wallhammer Zero

Scope: derived data / cook / import, asset identity, registry and dependency graph, invalidation, content-addressed caches, hot reload, editor vs runtime, modules. Researched 2026-11-06. Coverage is uneven: Godot, Bevy and Unity rest on fetched official pages. Parts of UE (DDC, Zen) were fetched; the rest of UE and all of O3DE rest on search snippets and forum posts. Wicked Engine, Insomniac/Bungie talks, UE Virtual Assets, Live Coding and the module system could not be verified, so they are listed under Gaps.

Reference point for Wallhammer Zero (from `wallhammerzero/docs/ARCHITECTURE.md`):
- Generators `eng_gen_*` are pure CPU functions `(recipe, seed) -> data`. They run at level A (deterministic) and do no GPU or file access.
- `eng_asset` holds the VFS, the resource DB, a refcounted graph, an IO queue, the `asset_provider` and `gen_provider` ports, and the Merkle cache.
- Hot reload covers only the game DLL and shaders.
- `eng_types` is the type registry (name, version, fields).

## Q1: Derived data, cook and import pipelines (UE 5.x, Godot 4.x, Unity 6, Bevy, O3DE)

### Takeaway
Every major engine separates *source* from *derived/imported* data and treats the derived side as a disposable, rebuildable cache. They differ in **when** derivation happens. Godot and Unity derive on import in the editor. UE derives lazily through the DDC and again at cook time. Bevy and O3DE use a separate processor (background daemon) that writes a parallel processed tree. Wallhammer's "generate, then cache by hash" is closest to UE's DDC: derived data is a pure function of its inputs, looked up by key, and generated on a miss.

### Cited Findings
**Unreal Engine 5.x: DDC and Zen**
- DDC content is data UE needs before an asset can be used (e.g. compiled shaders for a material). It is kept out of source control and is "disposable", rebuildable from `.uasset` — [Epic: Using DDC](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-derived-data-cache-in-unreal-engine)
- Lookup is hierarchical. UE checks the fastest cache first, then slower ones. A hit is copied into the fastest local cache. A miss generates the data and writes it asynchronously to the caches — [Epic: Using DDC](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-derived-data-cache-in-unreal-engine)
- Cache backends: Zen Storage Server (default; read/write; HTTP, unauthenticated, for local or trusted networks; server-side GC), PAK `.ddp` (read-only archive), S3 (read-only, "no longer recommended"), Unreal Cloud DDC (authenticated, server does replication and cleanup), and Filesystem (local or network share) — [Epic: Using DDC](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-derived-data-cache-in-unreal-engine)
- Version change: UE ≤5.3 used a Filesystem local DDC. **UE 5.4+ uses a local Zen store** (`AppSettingsDir/Zen/Data`). The old Filesystem cache is delete-only with an 8-day cleanup — [Epic: Using DDC](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-derived-data-cache-in-unreal-engine)
- The cache graph is configured in `[DerivedDataBackendGraph]` (DefaultEngine.ini / BaseEngine.ini). A shared cache can switch itself off above a latency threshold (`DeactivateAt=40` ms). `-run=DerivedDataCache -fill` pre-fills the cache and `-DDC=CreatePak` builds a distributable `.ddp` — [Epic: Using DDC](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-derived-data-cache-in-unreal-engine)
- Epic advises against copying whole DDCs over the internet. It recommends a DDC Pak for distributing prebuilt data — [Epic: Using DDC](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-derived-data-cache-in-unreal-engine)
- ZenServer runs outside the editor and starts and stops with it, though it can be left running. Its executables are copied to `ProgramData/Epic/Zen/Install` before they run, and the newest version among workspaces wins — [Epic: Using DDC](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-derived-data-cache-in-unreal-engine)
- Zen also serves as the **Cooked Output Store**. It supports "Cooked Data Snapshots" (export cooked output and import it elsewhere) and streaming to a target device on trusted networks in non-shipping configs. The page is titled UE 5.8 docs — [Epic: Zen Storage Server](https://dev.epicgames.com/documentation/en-us/unreal-engine/zen-storage-server-for-unreal-engine)

**Godot 4.x: import**
- Importing creates `<file>.import` next to the source (import configuration). Imported products go to the hidden `res://.godot/imported/` (e.g. `.ctex` plus a `.md5` file) — [Godot docs 4.7: Import process](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/import_process.html)
- Commit `.import` files. Don't commit `.godot/`. Load assets through ResourceLoader: FileAccess on the source "will break in the exported project" — [Godot docs: Import process](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/import_process.html)

**Unity 6: Asset Database v2**
- Terminology: the source asset is the original file and the imported result is the *artifact*. Each artifact file is named by a GUID with no extension. Sources are tracked in SourceAssetDB and import results in ArtifactDB, both under `Library/` (not versioned). Metadata includes mtime, a content hash and GUIDs — [Unity 6.x manual: Asset database contents](https://docs.unity3d.com/kr/current/Manual/asset-database-contents.html), [Unity 6.2](https://docs.unity.cn/Manual/asset-database-contents.html)
- Refresh pipeline order: detect changes in `Assets`/`Packages` → compile code (.cs, .asmdef…) → domain reload → postprocess → import non-code assets → hot reload. Native importers run before C# ScriptedImporters — [Unity 6.0: Refreshing the Asset Database](https://docs.unity.com/en-us/engine/6000.0/manual/assets-and-media/asset-database/refreshing)
- A refresh restarts when an import fails, when a file the importer read changes on disk, when an importer creates a file mid-import (e.g. FBX extracting textures), or when a timestamp changes during import (VCS pull) — [Unity 6.0: Refreshing](https://docs.unity.com/en-us/engine/6000.0/manual/assets-and-media/asset-database/refreshing)

**Bevy 0.12+: Assets V2 and the asset processor**
- The asset processor is an "asset compiler" (GPU-friendly formats, compression, type conversion). `AssetMode::Processed` reads `assets/` and writes `imported_assets/`. It runs alongside the app via the `asset_processor` cargo feature — [Bevy 0.12 release notes](https://bevy.org/news/bevy-0-12/)
- When 0.12 shipped, Bevy did not yet recommend processing for most apps: only `CompressedImageSaver` existed, there were no asset migrations, and API churn was expected — [Bevy 0.12](https://bevy.org/news/bevy-0-12/)
- Processing API: `AssetLoader`, `AssetSaver` and `Process` (recommended: `LoadAndSave`). Later versions add the higher-level `LoadTransformAndSave` + `AssetTransformer` — [Bevy 0.12](https://bevy.org/news/bevy-0-12/), [bevy_asset processor source mirror](https://doc.qu1x.dev/bevy_trackball/bevy/asset/processor/index.html)
- **Crash safety:** the processor keeps a write-ahead log and replays only incomplete transactions after a crash or forced exit. A load of an asset that is being processed waits until both the product and its meta are written, so they always match — [Bevy 0.12](https://bevy.org/news/bevy-0-12/)
- Multiple named asset sources (`remote://`, `embedded://`) all get hot reload, meta files and processing — [Bevy 0.12](https://bevy.org/news/bevy-0-12/)

**O3DE**
- Asset Builders declare a **fingerprint** in code, and it is recorded with each job. When the builder changes its fingerprint, the stored jobs no longer match and their sources are reprocessed — [O3DE: Source assets](https://docs.o3de.org/docs/user-guide/assets/pipeline/source-assets/), [O3DE: Create jobs](https://docs.o3de.org/docs/user-guide/assets/builder/create-jobs) (via search snippet)
- The O3DE docs list Asset Processor, Asset Cache Server Mode, Intermediate Assets, Python Asset Builder and Asset Bundler — [O3DE: Asset pipeline nav](https://docs.o3de.org/docs/user-guide/assets/pipeline/)

### Inferences
- Wallhammer's model (recipe + seed + style/scale/world-shape + generator domain version → Merkle hash → cached blob) is in effect a DDC with **no import step**: the "source" is the recipe, which is tiny and versioned in git. That removes the whole `.import` / `.meta` / Library layer of Godot and Unity.
- Bevy's and O3DE's separate processor process and UE's ZenServer both put the derived store in a **long-lived process separate from the game/editor**. Wallhammer runs everything in one process. That's fine for one developer, but a second machine (D75: Mac + Windows) can't share cached results unless the cache is a plain directory or server.

### Gaps
- The O3DE asset pipeline pages rendered only as navigation through the fetch tool. Details come from search snippets.

## Q2: Asset identity (GUIDs/UIDs vs paths)

### Takeaway
The industry has converged on **stable random IDs stored in a sidecar file next to the source**, with the path kept for display and fallback: Unity `.meta` GUID, Godot `.uid` (4.4), O3DE source UUID + product subID. The Machinery stored IDs on objects in an in-memory model. Content hashes are used for *caching* but explicitly **not** for *identity*.

### Cited Findings
- Godot UIDs: partial in 4.0, stored in `.import` files and in scene/resource headers, referenced as `uid://` with `res://` kept for display and fallback — [Godot: UID changes coming to 4.4](https://godotengine.org/article/uid-changes-coming-to-godot-4-4/)
- Godot 4.4 adds `foo.gd.uid` sidecar files for scripts and shaders, which are text formats with nowhere to embed an ID. Commit them, and move them together with the file — [Godot 4.4 UID article](https://godotengine.org/article/uid-changes-coming-to-godot-4-4/)
- Godot's design rationale: **not checksums**, "because identical files still need distinct references". **Not a central UID database**, because it would sit far from the files, cause merge conflicts and break add-ons. **Not embedded comments**, because they disrupt users and are hard for every tool to handle — [Godot 4.4 UID article](https://godotengine.org/article/uid-changes-coming-to-godot-4-4/)
- The problem it solves: path references break when files move outside the editor or through version control, and editor-driven path rewriting was slow and unreliable in large projects — [Godot 4.4 UID article](https://godotengine.org/article/uid-changes-coming-to-godot-4-4/)
- Unity: asset database metadata includes GUIDs, and artifacts are named by GUID — [Unity 6 manual: asset database contents](https://docs.unity3d.com/kr/current/Manual/asset-database-contents.html)
- O3DE (2022.05 docs, older): a product asset ID = source asset UUID + a sub ID based on the fingerprint of the builder that produced it — [O3DE 22.05: Asset dependencies and identifiers](https://version-2205--o3deorg.netlify.app/docs/user-guide/assets/pipeline/asset-dependencies-and-identifiers)
- Bevy 0.12: handles hold a single `Arc`, use generational `AssetIndex` dense storage and carry their `AssetPath`. Identity is path-based (plus the optional `.meta`) — [Bevy 0.12](https://bevy.org/news/bevy-0-12/)
- The Machinery "The Truth": every object has a unique ID, and references are a **distinct property type**, so dependencies are trivially enumerable. IDs were chosen over paths so references don't break, with paths kept for loose dynamic cases. Sub-objects are owned and cloned with their parent, plain references are not — [Niklas Gray, "The Story behind The Truth" (2018, older)](https://gamedeveloper.com/programming/the-story-behind-the-truth-designing-a-data-model)

### Inferences
- In Wallhammer most assets have no source file: the identity of a generated asset *is* its recipe hash. That's correct for cache keys. But authored entities (an edited building, a named NPC, a quest item) need a **stable ID that survives recipe edits**. Godot's argument ("identical content still needs distinct references") applies directly to the "edited" layer. CONVENTIONS ch. 4 already forbids saving handles. Check that every saveable/editable object gets a stable 64-bit ID that is separate from its content hash.
- The Machinery's "reference is its own field type" fits `eng_types` directly. If the type registry marks reference fields as a separate kind, the dependency graph can be derived generically.

### Gaps
- UE asset identity (package paths, `FSoftObjectPath`, redirectors, Asset Registry) was not fetched.

## Q3: Invalidation, dependency graph and incremental rebuild

### Takeaway
All engines key derived data on **(source content hash + importer/builder version + settings + platform + discovered dependencies)**. The recurring weak point is *dynamic, discovered dependencies* and *global state read by importers*: missing ones cause stale data, and over-broad ones cause needless rebuilds. Version bumps are manual everywhere: a GUID string in UE, an `int` in Unity, a fingerprint in O3DE.

### Cited Findings
- UE DDC key: `FCacheKey` = bucket + `FIoHash` — [Epic API: FCacheKey](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Developer/DerivedDataCache/FCacheKey)
- The UE plugin interface `GetVersionString()` "is used as part of the cache key. This is supposed to be a guid string" — [Epic API: FDerivedDataPluginInterface::GetVersionString (5.5)](https://dev.epicgames.com/documentation/unreal-engine/API/Developer/DerivedDataCache/FDerivedDataPluginInterface/GetVersionString?application_version=5.5)
- UE (4.27 docs, older): `InvalidateDeriveDataCacheGUID` forces a new GUID so the key changes. "Every big data should not be in the ddc key… because its slow to create a key with big data" — [UE 4.27 API](https://docs.unrealengine.com/4.27/en-US/API/Runtime/Engine/Engine/USkeletalMesh/InvalidateDeriveDataCacheGUID/index.html)
- In a UE 5.5 forum report, bumping `TEXTURE_DERIVEDDATA_VER` / the GUID did not invalidate cached textures for one team (anecdotal). The same thread reports cross-platform float differences in lightmaps — [UE forum, 5.5](https://forums.unrealengine.com/t/lightmap-artifacts-caused-by-float-precision-difference-between-platforms-in-ue-5-5/2651652)
- Unity **static dependencies** (known before import): asset name, importer ID, importer version, build target platform. **Dynamic dependencies** are discovered during import (shader includes, prefab refs) and recorded in `AssetImportContext`. Importers may also read global state (platform, color space, graphics API, texture compression) — [Unity 6.0: Refreshing](https://docs.unity.com/en-us/engine/6000.0/manual/assets-and-media/asset-database/refreshing)
- Unity's ScriptedImporter carries `version:` in its attribute, and `ctx.DependsOnSourceAsset(...)` declares dynamic dependencies — [Unity 6.0: Refreshing](https://docs.unity.com/en-us/engine/6000.0/manual/assets-and-media/asset-database/refreshing) (the attribute example was paraphrased by the fetch tool, not quoted from the page)
- Unity: the platform is part of the hash for built-in importer results — [Unity 6.0 (JA) asset database contents](https://docs.unity3d.com/ja/current/Manual/asset-database-contents.html)
- Godot reimports when the source's **MD5** changes, or when files under `.godot/imported` are deleted — [Godot docs: Import process](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/import_process.html)
- Bevy: the processor stores a hash of each source and of its process dependencies (`processed_info`: `hash`, `full_hash`, `process_dependencies`) and reprocesses dependents when a dependency changes — [Bevy 0.12](https://bevy.org/news/bevy-0-12/)
- O3DE job dependencies come in two kinds, **fingerprint-based** (rerun when the upstream fingerprint changes) or **order-based** (only run after). A sub-ID job dependency reprocesses on every change to that product. Wildcard source dependencies were reported as not retriggering (bug #17876) — [O3DE: Create jobs](https://docs.o3de.org/docs/user-guide/assets/custom-assets/builder/create-jobs/), [GitHub o3de#17876](https://www.Github.com/o3de/o3de/issues/17876)
- **UE incremental cook (5.6/5.7):** Epic staff said 5.6 Incremental Cook is "much more robust than LegacyIterative", with many fixes in 5.7. In 5.6, incremental cooking of packages that use *project-defined types* is off by default. They reported fixing 95% (5.6) and 99% (5.7) of engine-type problems — [UE forum: Zen incremental cook](https://forums.unrealengine.com/t/zen-incremental-cook-has-almost-as-long-a-runtime-as-a-clean-cook/2667839), [UE forum: re-cooked every time](https://forums.unrealengine.com/t/content-being-re-cooked-every-time-using-latest-modified-dependencies-incremental-cooking-what-is-best-practice-here/2704868)
- UE 5.6.1: an incremental cook missed about 30 items in a World Partition cell (OFPA transitive deps). A full cook fixed it, and transitive-dependency fixes are believed to be in 5.7 — [UE forum: WP incremental cook misses OFPA deps](https://forums.unrealengine.com/t/incremental-cook-of-world-partition-world-misses-ofpa-file-dependencies/2834447)
- One UE incremental cook skipped 45k of 57k packages but still took 24 of 28 minutes (fixed per-invocation overhead). Mixing versioned and unversioned cooks forces a full cook — [UE forum](https://forums.unrealengine.com/t/zen-incremental-cook-has-almost-as-long-a-runtime-as-a-clean-cook/2667839)
- A Zen snapshot must contain `CookedSettings.txt` and `DevelopmentAssetRegistry.bin` for an incremental cook to work on top of it. Older zenservers had bugs that lost files — [UE forum: Zen snapshot import](https://forums.unrealengine.com/t/zen-snapshot-import-missing-files-for-incremental-cooking/2731846)

### Inferences
- Wallhammer's Merkle key already includes the "static dependencies" (style, scale, world shape, generator domain version). The Unity/UE lesson is that the **risky part is the implicit inputs**: global cvars, platform float behaviour, a library version (e.g. a noise function change inside `eng_gen_core`), the RNG algorithm. Each must be in the key or provably absent. Level A determinism (`detmath`) plus the CMake rule that A cannot link B is a stronger guarantee than any engine above offers.
- Manual version bumps fail in practice (the UE texture GUID anecdote). Consider deriving the generator domain version **automatically**, at least in debug or CI, e.g. from a golden-output hash test: run each generator on N fixed recipes, hash the outputs, and fail CI if the hash changed without a version bump. This turns "forgot to bump" into a build error.
- UE's incremental-cook bugs are all about *transitive* dependencies discovered at cook time. A Merkle tree where a parent hash includes child hashes is inherently transitive. That's a real advantage, provided that every input a generator reads goes through the recipe and none comes from side channels.

### Gaps
- UE `FBuildDefinition` / DDC build functions (UE5 "Derived Data Build") and how the Asset Registry stores dependencies were not verified from primary docs.

## Q4: Content-addressed and shared caches

### Takeaway
Shared caches are standard: UE Zen / Cloud DDC, Unity Accelerator, O3DE Asset Cache Server mode. Each vendor warns that **a shared cache is only as trustworthy as the determinism of its producers**: a non-deterministic producer behind a stable key silently serves wrong data.

### Cited Findings
- Unity Accelerator is an external asset cache holding copies of a team's imported assets. Import-result caching stores serialized data, metadata, Asset Database entries and dependency info, and **it is disabled by default in new projects in Unity 6.5** — [Unity 6.5: Accelerator caching](https://docs.unity3d.com/Manual/accelerator-caching.html) (via search snippet)
- Unity warns that import result caching may be non-deterministic (unregistered dependencies, custom AssetPostprocessor code). A cache hit can return a result produced by a different Editor version, machine or platform — [Unity 6.5: Accelerator caching](https://docs.unity3d.com/Manual/accelerator-caching.html) (via search snippet)
- Unity Addressables: builds are deterministic only with identical environment and inputs. A non-deterministic build can keep the same cache identifier with different bytes, so stale cached bundles get reused. UnityDataTools and the build layout report are recommended for diffing — [Unity 6.4: Deterministic AssetBundles/Addressables](https://docs.unity3d.com/Manual/build-deterministic-assetbundles-addressables.html)
- UE shared DDC: one person's build benefits everyone. It can be a Zen server on a LAN (`zenserver.exe –install`) — [Epic: Using DDC](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-derived-data-cache-in-unreal-engine)
- O3DE has an "Asset Cache Server Mode" in the Asset Processor — [O3DE nav](https://docs.o3de.org/docs/user-guide/assets/pipeline/)
- An open-source example, the `concinnity-cook` Rust crate: the cache key is built from the asset's inputs, and the binary's identity is recorded once per segment rather than hashed per asset. Identical assets for different backends share one entry, and import expansions are keyed on source contents and import options — [docs.rs concinnity-cook key.rs](https://docs.rs/crate/concinnity-cook/latest/source/src/cache/key.rs)

### Inferences
- Wallhammer's cache is content-addressed by input hash. To share between the Mac and Windows PC (D75), the key must either include the **platform/compiler** or the generators must be proven bit-identical across arm64/clang and x64/MSVC. `detmath` is aimed at the second option. Add a cross-platform golden-hash test (same recipe → same output hash on both machines) as the gate before any cache sharing.
- UE's tiered lookup (fast local → shared → generate, with backfill on hit) is a cheap pattern to copy if `eng_asset` later gets a second cache tier.

### Gaps
- No GDC/Insomniac/Bungie talk on content-addressed builds was found within the search budget. Unverified leads, not checked: Insomniac's asset pipeline talks, Bungie's Tiger engine content system, and Frostbite's "FrostEd/Asset pipeline" talks.

## Q5: Hot reload of assets and code

### Takeaway
Asset hot reload is universal and file-watcher driven (Bevy `file_watcher`, Unity refresh on focus, Godot reimport on MD5). Code hot reload is either DLL swapping with heavy caveats (Godot GDExtension `reloadable=true` since 4.2, UE Live Coding) or a managed-domain reload (Unity). Wallhammer's choice (game DLL and shaders only) matches the native-engine norm.

### Cited Findings
- Bevy: the `file_watcher` feature turns on watching. It is omitted in release builds without code changes, and `embedded_watcher` covers embedded assets — [Bevy 0.12](https://bevy.org/news/bevy-0-12/)
- Bevy later: enabling any watcher feature (`file_watcher`, `rust_source_watcher`) enables watching automatically. `AssetPath` can address folders — [bevy commit 35073cf](https://github.com/bevyengine/bevy/commit/35073cf7aa9eaf748e167c103921a6764fcedfb1) (release version not confirmed)
- Bevy: the `AssetEvent::LoadedWithDependencies` event fires once the whole recursive dependency set is loaded — [Bevy 0.12](https://bevy.org/news/bevy-0-12/)
- Unity hot reload: serializable fields are saved, scripts reloaded and values restored, and non-serializable data is lost — [Unity 6.0: Refreshing](https://docs.unity.com/en-us/engine/6000.0/manual/assets-and-media/asset-database/refreshing)
- Godot 4.2 added in-editor GDExtension hot reload, opt-in via `reloadable = true` in `.gdextension` `[configuration]`. If a class doesn't support reloading, the engine prints a warning and disables reloading. Users report crashes on repeated reloads (4.2.1, godot-rust) — [godot-rust/gdext#582](https://github.com/godot-rust/gdext/issues/582), [Godot forum](https://forum.godotengine.org/t/hot-reload-in-godot-instantly-see-changes-without-reloading-a-game/66089), [Godot commit mirror](https://remotebranch.eu/Stowage/godot/commit/2733a6f762fc04956361a1eb49f1dffaa3d80489)
- The Truth: the in-memory model is authoritative and changes propagate across editor windows, so plugins get undo, copy/paste and live updates for free — [The Story behind The Truth](https://gamedeveloper.com/programming/the-story-behind-the-truth-designing-a-data-model)

### Inferences
- Wallhammer excludes asset hot reload, but for generated content "asset reload" means **recipe edit → new hash → regenerate → swap handle**. The refcounted graph plus generational handles in `eng_asset` already allow this. Cheap win: when a recipe file or the game's data tables change, re-run the affected generator and swap the result. This is not engine hot reload and does not conflict with ARCHITECTURE "What is deliberately not done".
- Godot's GDExtension experience (crashes on repeated reload, per-class opt-out) shows the main DLL-reload failure modes: stale function pointers and registered types. `eng_types` should support **re-registration with version check** on game DLL reload, or forbid the game DLL from registering types that persist across reloads.

### Gaps
- UE Live Coding (Live++-based) and the UE module/plugin system (`.uplugin`, `.Build.cs`, module loading phases) were not fetched. Facts known from training are omitted because they are unverified here.

## Q6: Editor vs runtime split, packaging and module/plugin structure

### Takeaway
The engines split editor-only importers and derived-data producers from runtime loaders, and ship a packed runtime format: UE IoStore `.utoc`/`.ucas`, Unity AssetBundles/Addressables, O3DE Asset Bundler. Wallhammer's `gen_provider` vs `asset_provider` duality (D8: a cell can come from a generator or from a prebaked file of the same format) is the same split, with the difference that generators also ship at runtime.

### Cited Findings
- UE IoStore: `.utoc` is the table of contents (paths/IDs, offsets, compressed sizes) and `.ucas` holds the cooked compressed assets, used with the Zen Loader for load performance — [fileinfo.com .utoc](https://fileinfo.com/de/extension/utoc), [fileinfo.com .ucas](https://fileinfo.com/extension/ucas) (secondary source; Epic docs not fetched)
- Godot: imported data lives in `.godot/imported` and export uses the imported versions, never the raw sources — [Godot docs: Import process](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/import_process.html)
- Bevy: processed output metadata is read-only and config belongs on the source asset. `AssetMode::Unprocessed` vs `Processed` selects source or processed loading — [Bevy 0.12](https://bevy.org/news/bevy-0-12/)
- O3DE packaging through the Asset Bundler (concepts page) — [O3DE Asset Bundler concepts](https://docs.o3de.org/docs/user-guide/packaging/asset-bundler/concepts/)
- The Machinery separated **buffers** (opaque blobs: textures, meshes) from **objects** (property-level data). Its open questions were runtime formats, partial loading for large projects, and a git-friendly on-disk representation — [The Story behind The Truth](https://gamedeveloper.com/programming/the-story-behind-the-truth-designing-a-data-model)
- The Bitsquid/Stingray lesson: with JSON-on-disk as authoritative, undo and copy/paste had to be written per tool, tools couldn't see each other's unsaved edits, and reference strings were indistinguishable from other strings — [The Story behind The Truth](https://gamedeveloper.com/programming/the-story-behind-the-truth-designing-a-data-model)

### Inferences
- Wallhammer has no separate "cook" stage. That is fine while everything regenerates fast enough. For shipping, a **pre-generate ("bake") command** that fills the Merkle cache for a world region and packs it (cf. UE `-run=DerivedDataCache -fill` + `CreatePak`) would cover slow generators and give stable load times.
- The Stingray lesson favours an authoritative in-memory model for the "edited" layer. Wallhammer's studio (`wz_studio`) should edit through `eng_types`-described data in memory with a uniform change record (object, field, old, new), not by tools writing files directly.

### Gaps
- Wicked Engine's asset handling (it imports glTF/OBJ into its own `.wiscene` format) could not be verified this round.
- UE module/plugin structure, UE Virtual Assets (payloads stored outside packages in a content-addressed backend) and O3DE Gems are not covered by fetched sources.

## Summary: what the engines do that Wallhammer's design lacks or does differently

Each point is grounded in the findings above. Verification status is noted where relevant.
1. **Stable identity separate from content hash** (Godot `.uid`, Unity GUID, The Machinery object IDs). Wallhammer uses the hash for cache identity. It needs explicit stable IDs for edited/authored objects. Godot explicitly rejected checksums as identity.
2. **Explicit dynamic-dependency recording** (Unity `AssetImportContext`, Bevy `process_dependencies`, O3DE job dependencies). Wallhammer relies on the Merkle key being complete. The generator API should make side-channel inputs impossible (e.g. generators receive only recipe + seed + explicit context struct, with no global cvar access). Level A rules make this enforceable.
3. **Version bumping is a known failure point** (UE GUID strings, Unity importer `version`, O3DE fingerprint, UE 5.5 anecdote). Proposal: CI golden-output hashes per generator that fail when outputs change without a domain-version bump.
4. **Tiered and shared cache with backfill** (UE DDC/Zen, Unity Accelerator). Wallhammer has a single local cache. Sharing between Mac and Windows requires cross-platform bit-identical generators, or a platform field in the key.
5. **Crash-safe cache writes** (Bevy write-ahead log, product+meta atomicity). The Merkle cache should write atomically (temp file + rename) and never expose a blob without its manifest.
6. **"Fill/bake" and "pak" commands** (UE `-fill`, `CreatePak`; O3DE Asset Bundler; UE Cooked Data Snapshots). Wallhammer has no defined bake/pack step for shipping or for pre-warming a region.
7. **Load-with-dependencies completion event** (Bevy `LoadedWithDependencies`). Useful for cell streaming: a cell is "ready" only when its whole Merkle subtree is resident.
8. **Data-driven reload of recipes** (all engines reload assets on file change). Wallhammer excludes engine hot reload, but recipe/table change → regenerate → handle swap is cheap and doesn't conflict with the design.
9. **References as a distinct field kind in the type system** (The Truth). This would let `eng_types` derive the dependency graph and save-reference validation generically.
10. **Garbage collection of the cache** (Zen server-side GC, UE 8-day cleanup of the legacy local DDC). Wallhammer's docs don't say how stale hashes are evicted after a domain-version bump.
