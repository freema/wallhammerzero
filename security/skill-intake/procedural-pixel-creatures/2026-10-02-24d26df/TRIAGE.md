# skillspector scan: idlerunner00/procedural-pixel-creatures (2026-10-02)

- **Target:** github.com/idlerunner00/procedural-pixel-creatures @
  `24d26df10e9f0d369f1caf5b6ba0e8e724ec0888` (2026-10-01 22:15 +0200, "Add Procedural Pixel
  Creatures source release"). Full clone, 2 commits, no submodules. Cloned into the session
  scratchpad as a quarantine; nothing from it was copied into this repo.
- **What it is:** a Godot 4.5 .NET (C#, .NET 8) creature generator. **It is not a skill:** there
  is no `SKILL.md`, no `.claude/`, no agent or prompt folders, no MCP config. The scanner itself
  reported "no sub-skills detected" and fell back to a single-target scan. Analysis:
  `research/ref-procedural-pixel-creatures.md`.
- **Licence:** MIT © 2026 idlerunner00 (`LICENSE`). `THIRD_PARTY_NOTICES.md` adds PCG32
  (Apache-2.0, in `Core/Math/Random.cs`) and fdlibm (Sun permissive notice, in `Core/Math/DMath.cs`).
- **Scanner:** NVIDIA SkillSpector **v2.12.0** (`c7958a3268d9498644b22edb75d0f051bbc8cbfc`),
  local image `skillspector:2.12.0` (Id `42ebb9e6084a`), the same image as the game-creator scan.
- **How it ran:** Docker, `--network none` (offline), `--no-llm` (static only, no keys, nothing
  sent anywhere), clone mounted read-only.
  ```
  docker run --rm --network none -v <clone>:/scan:ro -v <out>:/out skillspector:2.12.0 \
    scan /scan -r --no-llm --fail-on-incomplete -f json -o /out/root.json
  docker run --rm --network none -v <clone>:/scan:ro -v <out>:/out skillspector:2.12.0 \
    scan /scan -r --no-llm --fail-on-incomplete -f markdown -o /out/root.md
  ```
  The same two commands ran without `-r` (identical result) and for `/scan/scripts -r`
  (the shell and PowerShell scripts, scanned separately because they are the only executable part).
- **Raw reports in this folder:** `root.md`, `scripts.md`. The JSON files are not kept (same
  content; counts below).

## Scanner verdict

| Scope | Issues | CRITICAL | HIGH | MEDIUM | LOW | Score / severity / recommendation | Coverage | Exit |
|---|---|---|---|---|---|---|---|---|
| repo root (299 components) | 17 | 0 | 4 | 9 | 4 | **94, CRITICAL, `DO_NOT_INSTALL`** | 98.2 %, `partial` (275 of 280 fully inspected, 5 partially) | 1 |
| `scripts/` (14 files) | 1 | 0 | 0 | 1 | 0 | 6, LOW, `CAUTION` | 85.7 %, `partial` (12 full, 2 partial) | 1 |

Notes on the verdict:
- The root **severity label is CRITICAL, but no single issue is CRITICAL**; the label comes from
  the aggregate score (4 HIGH at 60–70 % confidence plus executable scripts present). After triage
  every HIGH is a false positive (below), so the label does not stand.
- Coverage gaps (ledger exceptions): `static_parse_limit` on `Core/Motion/PoseParams.cs`,
  `Core/Palettes/SurfaceSpec.cs`, `scripts/audit-source.ps1`, `scripts/source-files.ps1`;
  `runtime_limit` on `Core/Motion` (bytecode supply-chain check); `obfuscated_instruction_text` on
  `tests/Core/CoreTests.cs`. The last one is the high-entropy golden hash constants
  (`CoreTests.cs:47-52`, `:739-765`); the main session read all six files by hand: plain C# and
  PowerShell, nothing hidden.
- LLM analysers were disabled by configuration; several static analysers report `degraded`
  (279/286 files). This is a static-only verdict, like the game-creator scan.

## Triage of every HIGH finding (main session, reading the source)

| Rule | Where | Verdict | Why |
|---|---|---|---|
| PE3 Credential access | `.gitignore:44` | **FP** | The line is `.env` in an ignore list ("Local credentials and operating system metadata"). Excluding secrets from git; nothing reads them. |
| P2 Hidden instructions | `ProceduralPixelCreatures.csproj:2-23` | **FP** | Two ordinary XML comments describing the project and why Debug builds are optimised. No instructions to an agent. |
| P2 Hidden instructions | `ProceduralPixelCreatures.sln:1` | **FP** | The "hidden" content is a UTF-8 BOM (`EF BB BF`), standard for Visual Studio solution files. A byte scan of the whole repo found no bidi or zero-width characters; BOMs appear only in the `.sln`, `scripts/check.ps1` and `scripts/benchmark.ps1`. |
| TM1 Tool parameter abuse | `Core/Motion/Behaviors.cs:345` | **FP** | Pose parameters of the "roar" animation (`p.EarPitch -= 1.0 * roar` and similar). The rule matched maths, not a tool call. |

## MEDIUM and LOW, by rule

| Rule | Count | Where | Verdict |
|---|---|---|---|
| RA2 Session persistence | 6 | `Core/Rendering/CreatureRenderer.cs:92, 235 (×2), 327, 686, 708` | **FP**: every hit is the identifier `_groupList` (matched as "pList"), a scratch array of primitive indices. |
| EA4 Unbounded resource access | 1 | `Core/Export/GifEncoder.cs:76` | **FP**: the comment `// loop forever` above the GIF NETSCAPE2.0 loop block. |
| YR4 YARA `network_reconnaissance` | 1 | `Core/Families/QuadrupedFamily.cs:71` | **FP**: the word "fierce" in a gene description ("Heavy brow ridge for a fierce expression"); Fierce is also the name of a DNS recon tool. |
| E1 External transmission | 1 (+1 in the `scripts/` scan, same line) | `scripts/bootstrap.ps1:164` | **Expected, benign**: `https://api.nuget.org/v3/index.json` written into a generated `NuGet.Config`. See the network note below. |
| EA3 Scope creep (LOW) | 4 | `THIRD_PARTY_NOTICES.md:81, 86, 109, 214` | **FP**: "not limited to" in the Apache-2.0 licence text. |

## Manual security sweep (beyond the scanner)

- **Core (`addons/procedural_creatures/Core`) has no file, network or process I/O.** The only
  reflection is a scan of already-loaded assemblies for `[CreatureExtension]` attributes. No
  `unsafe`, no P/Invoke, no base64 blobs, no `Invoke-Expression`/`iex`, no telemetry.
- **The only network access is the Windows launcher** (`Start.cmd` → `Start.ps1` →
  `scripts/bootstrap.ps1:27`, `Invoke-WebRequest`). It downloads Godot from
  `github.com/godotengine/godot-builds` and the .NET SDK from `builds.dotnet.microsoft.com`,
  verifies a pinned SHA-512 before extracting (`bootstrap.ps1:28-31, 47`, hashes in
  `scripts/toolchain.json`), and extracts under `.tools/` in the repo. Environment changes are
  process-local; `-ExecutionPolicy Bypass` is process-scoped. Reasonable, but it is a downloader:
  **we never run `Start.cmd`, `Start.ps1` or `scripts/bootstrap.ps1`.**
- `project.godot` has no autoloads or editor plugins that run code on open. CI
  (`.github/workflows/check.yml`) has `permissions: contents: read`; actions are pinned by tag,
  not by SHA (hygiene only, irrelevant to us).
- The bundled PNG/GIF images have nothing after `IEND` / the GIF trailer.
- Non-ASCII text: UI glyphs and German umlauts in the bitmap font of `Core/Export/ImageCanvas.cs`;
  one German error message in `SpritesheetExporter.cs` ("Fps muss 60 teilen").

## What was run (after the scan, in Docker only)

The scan found no confirmed CRITICAL, so the engine-independent Core was built and run offline.
Nothing ran on the host; no Godot, no launcher, no scripts.

```
docker pull mcr.microsoft.com/dotnet/sdk:8.0
# digest sha256:78235e09001f52b6592c458ac010775ebac6725422e80cd0c1650590f67b2743 (linux/arm64)

docker run --rm --network none \
  -v <clone>:/src:ro -v <driver>:/driver:ro -v <out>:/out \
  -e DOTNET_CLI_TELEMETRY_OPTOUT=1 -e DOTNET_NOLOGO=1 -e DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1 \
  -e NUGET_PACKAGES=/tmp/nuget \
  mcr.microsoft.com/dotnet/sdk:8.0 bash -c '
    cp -r /driver /work && cd /work && dotnet build -c Release -o /work/bin && dotnet /work/bin/Driver.dll /out
    mkdir -p /work/up && cp -r /src/addons /src/tests /src/tools /work/up/ && cd /work/up
    dotnet build -c Release tools/core_harness
    dotnet tools/core_harness/bin/Release/net8.0/CoreHarness.dll test /out/harness all 10'
```

- **Driver:** our own console program
  (`research/scans/2026-10-02-procedural-pixel-creatures/samples/driver/`, about 250 lines) that
  compiles the upstream Core + Plantfolk sources from the read-only mount, the same way upstream's
  `tools/core_harness` does. It renders the 8 uncurated seeds of all 9 families, animation strips,
  8 facings and a small-size test, writes PNG contact sheets (upscaled by integers with upstream's
  nearest-neighbour `PngEncoder.Upscale`) and `stats.tsv`. No NuGet packages were needed; restore
  succeeded offline. There are no install scripts in this ecosystem to disable (no npm/pip).
- **Upstream harness:** `test … all 10` → **17/17 tests pass on linux-arm64**, including
  `render.deterministic_and_golden`, whose palette-index hashes were generated upstream on
  Linux x64. Determinism held across CPU architectures for the golden set. Windows was not tested.
- **Results:** all 72 uncurated creatures re-render byte-identically; 0 repairs, 0 validation
  warnings. Contact sheets and numbers are in
  `research/scans/2026-10-02-procedural-pixel-creatures/samples/` and discussed in the analysis
  doc §6.

## Conclusion (recommendation only: per D17 the owner decides)

- **Security: no real finding.** The scanner's CRITICAL/`DO_NOT_INSTALL` label rests on 4 HIGH
  findings that are all false positives; MEDIUM and LOW are false positives or the expected
  NuGet URL. Safe to read, and safe to build and run the Core offline in Docker as done here.
- **Never run the launcher** (`Start.cmd`, `Start.ps1`, `scripts/bootstrap.ps1`): it downloads a
  toolchain onto the host, which breaks D16 (everything in Docker) even though it is hash-pinned.
- **Nothing to install.** It is not a skill and not a library we would depend on (C#, Godot).
  Its value is ideas (D13). The code is MIT (+ Apache-2.0 PCG, fdlibm notice), so copying would be
  legally possible with attribution, but our stack is TypeScript with integer-only asset maths
  (D18, asset-kit-core), so the recommendation is **ideas only, clean-room re-implementation**.

## Re-scan with `tools/skill-intake` (2026-10-02)

The scan was repeated with the repo's own tooling (`tools/skill-intake/fetch.sh` and `scan.sh`,
image `whz-skillspector:2.12.0-c7958a3`, dependencies from upstream's `uv.lock`) on a fresh
quarantine clone of the same commit (tree hash `55d58daa41cd22c31fa314614d0cbb69cd1eceaa`).

- **Same findings:** repo root 17 (0 CRITICAL, 4 HIGH, 9 MEDIUM, 4 LOW), score 94, exit 1;
  `scripts/` 1 MEDIUM, score 6, exit 1. Every finding is at the same file and line.
- `scripts.md` came out identical except for the scan time. `root.md` differs only in coverage
  notes: the `.git` files of the new clone, and the `runtime_limit` gap landed on
  `Core/Genetics` instead of `Core/Rendering` (it depends on timing).
- With [`baseline.json`](baseline.json) all 17 findings are suppressed (0 active, score 0). The
  scan still exits 1, because the coverage stays "partial".
