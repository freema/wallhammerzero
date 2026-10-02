# Skill validation: NVIDIA SkillSpector, alternatives, and an intake proposal

Research date: 2026-10-02. Author: Claude Code research session (Claude Opus 5.5).
Scope: NVIDIA SkillSpector (in depth), a planned scan of `playableintelligence/game-creator`, other validators, and a proposed skill intake procedure for Wallhammer Zero. This is research only. Nothing here is a project decision.

**How to read this document.** Statements with a source tag such as `[S1]` are facts taken from that source (listed under **Sources** at the end). Statements labelled **Assessment** are my opinion. Anything I could not verify is marked **(unverified)**.

---

## Executive summary

1. **SkillSpector is a serious, very active NVIDIA project, but it is still young.** Apache-2.0, about 19k stars, 87 contributors, created 2026-03-21, latest release v2.12.0 (2026-09-23), last commit 2026-09-29. It is labelled "Development Status :: 3 - Alpha" and is **not on PyPI** [S1][S2][S4][S22].
2. **It works in two stages.** Stage 1 is deterministic static analysis: regex patterns, Python AST, taint tracking, YARA rules, and an OSV.dev CVE lookup. Stage 2 is an optional LLM semantic review. The README lists 71 patterns in 17 categories, the hosted docs say 68, and the source defines about 92 rule IDs, so the documentation lags the code [S1][S5].
3. **No API key is needed for the static mode (`--no-llm`).** The LLM stage needs a provider. Options include hosted APIs with keys, a local Ollama, or `claude_cli`, which reuses the local Claude Code login with no key [S1][S3][S7].
4. **Data-egress gotcha.** Without `--no-llm` the CLI tries LLM analysis by default. The credential waterfall falls back to `OPENAI_API_KEY` if that variable is set, so skill contents could go to OpenAI without anyone choosing that. Even with `--no-llm`, dependency names are sent to OSV.dev [S1].
5. **Blocker: SkillSpector requires Python >=3.12,<3.15.** This machine has only the system Python 3.9.6. It has no `uv`, `pyenv`, `python3.10`–`3.14`, conda, mise or asdf. Following the brief, I did not work around this, so **no SkillSpector scan was run**. Docker Desktop and Homebrew binaries do exist, but both fall outside "scratchpad-only, no global installs".
6. **What the owner needs to decide to unblock this:** approve one of
   - (A) a project-local `uv` binary plus a uv-managed CPython 3.12 kept inside a tools directory (no global changes)
   - (B) Docker, building from the repo's digest-pinned Dockerfile
   - (C) a global Python 3.12 (Homebrew or python.org)

   Exact commands are in the Scan results section.
7. **Static precision is moderate, and the LLM stage does not remove false positives.** The README claims "~87% precision" with LLM. Open issue #675 says the code keeps deterministic findings even when the LLM disputes them. Issues #37, #644, #297 and #639 document many false positives on prose, licence text, HTML comments, BOMs and test strings [S9][S10][S11]. **Assessment:** use SkillSpector as a gate that needs human (or Claude) triage, never as an auto-approver.
8. **game-creator, from a manual read-only look (not scanner output).** I found no `curl | sh`, no jailbreak phrasing, no encoded blobs and no `allowed-tools` grants. I did find:
   - opt-out telemetry in `use-template`
   - many third-party API-key integrations
   - `@latest` and `npm install -g` instructions
   - zero-width characters in a three.js reference dump
   - a root `settings.json` that sets `agent: game-creator` and declares a `UserPromptSubmit` hook. Per Claude Code docs, only `agent`/`subagentStatusLine` take effect from a plugin-root `settings.json` [S14][S15].
9. **game-creator licensing is unclear.** There is no LICENSE file and GitHub detects no licence. The README says MIT, `package.json` says ISC, and Strudel-based games are noted as needing AGPL-3.0. **Assessment:** this blocks copying skills verbatim until clarified. Taking ideas is fine.
10. **Alternatives.** Cisco AI Defense `skill-scanner` is the most comparable tool and is mature, with a reusable GitHub Actions workflow, but it also needs Python ≥3.11. Snyk `agent-scan` needs a Snyk token and uploads skill content to Snyk. Claude Code's own `claude plugin validate` and `claude plugin eval` check structure and behaviour, not security. Anthropic's official guidance is "use skills only from trusted sources; audit thoroughly" [S15][S16][S17][S18][S19].
11. **Proposed intake** (detailed in Recommendations): quarantine clone pinned to a SHA → licence gate → `claude plugin validate --strict` → `skillspector --no-llm --fail-on-incomplete` → triage of every finding → remediate the copy → owner approval → reports and a hash registry committed in-repo → re-scan on upstream change, scanner upgrade, monthly, and in CI.

---

## 1. SkillSpector analysis

### 1.1 Identity and maturity

| Attribute | Value | Source |
|---|---|---|
| Repo | `github.com/NVIDIA/SkillSpector` (lower-case URL redirects) | [S1] |
| Licence | Apache-2.0 | [S1][S2] |
| Created / last push | 2026-03-21 / 2026-09-30 (HEAD `2226747`, 2026-09-29) | GitHub API |
| Stars / forks / contributors | ~19,000 / ~1,660 / 87 | GitHub API |
| Releases | 17 GitHub releases from v2.5.0 (2026-07-27) to **v2.12.0 (2026-09-23, tag commit `c7958a3`)**, roughly weekly | [S4] |
| Activity | ≥100 commits since 2026-09-01. About 161 open issues+PRs, of which 89 are PRs | GitHub API |
| Packaging | Not on PyPI (`pypi.org/pypi/skillspector` returns 404). Install from git, a source checkout, or Docker. `uv.lock` is committed | [S1][S22] |
| Self-declared maturity | "Development Status :: 3 - Alpha" | [S2] |
| Context | Part of the "NVIDIA Verified Skills pipeline", which scans and signs skills for NVIDIA's own catalog | [S1] |
| Research basis | Liu et al. 2026, "Agent Skills in the Wild": 31,132 skills analysed, 26.1% with ≥1 vulnerability, 5.2% likely malicious, and skills with scripts 2.12× more likely to be vulnerable (as quoted in the README; I did not read the paper) | [S1] |
| Security disclosures | NVIDIA PSIRT, not GitHub issues | SECURITY.md |

**Assessment:** the maintainer is credible and the cadence and engineering rigour are high (fail-closed resource bounds, a completeness ledger, a hardened subprocess for CLI providers). The flip side is very fast churn, Alpha status, and docs that lag the code. Pin a version and expect behaviour changes between releases.

### 1.2 How it works

The pipeline is a LangGraph workflow: `resolve_input → build_context → [all analyzers in parallel] → meta_analyzer → report` [S1, docs/DEVELOPMENT.md].

- **Input.** It accepts a local directory, a single `SKILL.md`, a zip, a file URL, or a Git URL (including GitHub tree subdirectories). Ingest caps: 100 MiB per ingest (applied to URL downloads, unzipped size, and post-clone disk use) and 10,000 zip members. There is a 1 MB per-file analysis cap. Breaches fail closed [S1].
- **Multi-skill.** `--recursive` scans each immediate subdirectory that contains a `SKILL.md` as its own skill [S1, cli.py].
- **Stage 1, static (always runs):**
  - regex pattern analyzers per category
  - Python AST behavioural checks (exec/eval/subprocess/reflective getattr)
  - Python taint tracking from source to sink
  - YARA rules (malware, webshells, cryptominers, hacktools, agent-skill rules)
  - MCP least-privilege and tool-poisoning checks
  - Unicode confusable and whitespace-padding detection
  - a "bundled execution surface" analyzer for `hooks/hooks.json`, `.claude/settings.json` and `.claude/settings.local.json`
  - SC4 live CVE lookups via OSV.dev [S1][S8]
- **Stage 2, LLM (optional):** semantic security discovery, developer-intent and quality-policy analyzers, plus a meta-analyzer that annotates and enriches static findings. Per open issue #675, the current code **retains** deterministic findings when the LLM disputes them. This contradicts the README's "filters false positives … ~87% precision" wording [S1][S9].
- **The skill itself is never executed.** Analysis is static plus LLM reading of file contents only [S1].
- **Completeness tracking.** Coverage gaps (oversized files, parser limits, unsupported content) become `AE*` findings and ledger events. `--fail-on-incomplete` turns them into a failing exit code [S1, docs/scan-completeness.md].

### 1.3 What it detects (threat categories)

From the README table [S1]. The severity shown is the rule default.

| Category | IDs | Examples |
|---|---|---|
| Prompt injection | P1–P5, P9 | instruction override, hidden instructions (comments/invisible text), exfiltration commands, behaviour manipulation, harmful content (CRITICAL), whitespace padding |
| Anti-refusal | AR1–AR3 | "never refuse", "no disclaimers", "you have no restrictions" |
| Data exfiltration | E1–E4 | external transmission, env-var harvesting, filesystem enumeration, context leakage |
| Privilege escalation | PE1–PE3 | excessive permissions, sudo/root, credential access (SSH keys, tokens) |
| Supply chain | SC1–SC10 | unpinned deps, `curl \| bash`, base64/hex obfuscated exec, known CVEs (OSV), abandoned deps, typosquatting, shipped `.pyc`, concealed executables, package-source redirection |
| Excessive agency | EA1–EA5 | unrestricted tool access, autonomous high-impact actions, scope creep, unbounded resources, external model/provider selection |
| Output handling | OH1–OH3 | unvalidated output injection, cross-context output, unbounded output |
| System-prompt leakage | P6–P8 | direct/indirect extraction, tool-based exfiltration |
| Memory poisoning | MP1–MP3 | persistent context injection, context stuffing, memory tampering |
| Tool misuse | TM1–TM3 | `shell=True`/`--force`, chaining abuse, unsafe defaults (TLS off, no auth) |
| Rogue agent | RA1–RA2 | self-modification (CRITICAL), persistence via cron/launchd/startup |
| Trigger abuse | TR1–TR3 | overly broad, shadowing built-ins, keyword baiting |
| Behavioural AST (Python) | AST1–AST9 | exec/eval/`__import__`/subprocess/os.system/compile/getattr chains |
| Taint tracking (Python) | TT1–TT5 | credential→network (CRITICAL), file→network, external input→exec |
| YARA | YR1–YR4 | malware, webshell, cryptominer, hacktool signatures |
| MCP least privilege | LP1–LP4 | under/over-declared and wildcard permissions |
| MCP tool poisoning | TP1–TP4 | hidden directives in metadata, Unicode deception, parameter injection, description/behaviour mismatch (LLM) |

The source also defines rule families the README does not list: SSRF1–3, DS1–4 (deserialization), BH1–4, AS1–3, E5, TM4, TT6, AST10, SC7, plus the AE completeness and SQP/SSD/SDI LLM families. **Assessment:** the documentation trails the code, so when triaging, use the rule ID in the report and not the README table.

**Notable gaps.** These are partly stated by the project and partly my assessment:
- Behavioural AST and taint analysis cover **Python only**. JavaScript/TypeScript (most of game-creator's scripts) get regex-level checks only [S1].
- No image/OCR analysis, weak non-English coverage, and no runtime behaviour [S1].
- Hooks are modelled only at `hooks/hooks.json` and `.claude/settings.json`/`.local.json` [S8]. Plugin manifests that declare hooks inline in `plugin.json` or a custom path may not get the dedicated analyzer **(unverified)**.

### 1.4 Install requirements

- **Python `>=3.12,<3.15`** (hard requirement in `pyproject.toml`) [S2].
- Heavy dependency tree: typer, rich, httpx, pydantic, openai, langgraph, langchain-anthropic/-aws/-core/-openai, boto3, langsmith, yara-python, regex, pyyaml [S2]. The install size is likely a few hundred MB **(unverified)**.
- Install routes [S1]:
  - `uv tool install git+https://github.com/NVIDIA/skillspector.git` (this writes to `~/.local`, so it is global)
  - a source checkout plus a venv plus `make install` (uses `uv sync` if uv is present, otherwise `pip install -e .`)
  - Docker built from the repo `Dockerfile`, which uses `python:3.12-slim-bookworm`, pinned by digest
- Optional extras: `[mcp]` to run SkillSpector as an MCP server, and `[dev]` [S2].

### 1.5 LLM stage, API keys, and data egress

- **Static mode needs no key.** `--no-llm` is fully local except for the SC4 OSV.dev query, which sends dependency names and versions and falls back to a bundled list when offline [S1].
- **LLM stage providers** are selected with `SKILLSPECTOR_PROVIDER` [S1][S3]:
  - Default is `nv_build`, which needs `NVIDIA_INFERENCE_KEY`.
  - Hosted options: `openai`, `anthropic`, `anthropic_proxy`, `bedrock`, `azure_openai`, `openai_compatible`.
  - Local: `ollama` (no key).
  - CLI providers that reuse local logins with no key: `claude_cli`, `codex_cli`, `gemini_cli`, `opencode_cli`.
- **`claude_cli` hardening** [S7]. SkillSpector runs `claude -p` with:
  - `--allowed-tools ""` (deny all)
  - `--permission-mode dontAsk`
  - `--strict-mcp-config` (zero MCP servers)
  - `--setting-sources=` (no user/project hooks)
  - `--disable-slash-commands`
  - the prompt sent on stdin only, a temp cwd, and a scrubbed environment

  **Assessment:** this is the most natural LLM option for us. The content goes to Anthropic, which we already use, and no new secret is needed. It would consume the owner's Claude plan usage.
- **Gotcha** [S1]. LLM analysis is requested by default. If no provider is available, the scan silently degrades to static and records `metadata.llm_error` and `filtering_mode: heuristic`. `OPENAI_API_KEY` is a "tier-2 fallback in the credential waterfall", so a stray `OPENAI_API_KEY` in the shell could send skill contents to OpenAI. **Assessment:** always pass `--no-llm` or set `SKILLSPECTOR_PROVIDER` explicitly.
- Optional LangSmith tracing exists through the `LANGCHAIN_*` variables (off by default) [S3].

### 1.6 CLI, output formats, configuration

```text
skillspector scan <path|url> [-f terminal|json|markdown|sarif] [-o FILE] [--no-llm]
     [-r/--recursive] [-b/--baseline FILE] [--show-suppressed] [--use-shipped-baseline]
     [--fail-on-findings] [--fail-on-incomplete] [--yara-rules-dir DIR]
     [--transitive --transitive-depth N --transitive-allow-prefix P --transitive-deny-prefix P]
     [--mcp-registry] [-V]
skillspector baseline <path> [-o FILE] [--no-llm] [--reason TEXT]
skillspector mcp [--transport stdio|http --host --port]      # needs [mcp] extra
```
(From `cli.py` at HEAD [S1].)

- **Risk score.** Each finding adds points: CRITICAL +50, HIGH +25, MEDIUM +10, LOW +5. Executable scripts apply a ×1.3 multiplier and the score is capped at 100. Score bands map to a recommendation: 0–20 LOW/SAFE, 21–50 MEDIUM/CAUTION, 51–80 HIGH/DO NOT INSTALL, 81–100 CRITICAL/DO NOT INSTALL [S1].
- **Exit codes** (documented as a stable contract) [S1]:
  - `0`: score ≤ 50 and no strict gate fired
  - `1`: score > 50, or `--fail-on-findings` / `--fail-on-incomplete` fired
  - `2`: error

  Note that by default **CAUTION exits 0**.
- **JSON** contains `skill`, `risk_assessment{score,severity,recommendation}`, `components[]`, `issues[]` (id, category, severity, confidence, location), and `metadata` (llm_requested/available, inference_usage, version). Only the documented fields are a stable contract [S1].
- **SARIF 2.1.0** output is suitable for GitHub code scanning [S1].
- **Baselines / false-positive suppression** [S6]:
  - YAML with glob `rules` (by rule id, path or message, with a mandatory `reason`) and exact `fingerprints`.
  - Fingerprints are evidence-bound. A change to the scanned source **or** the SkillSpector version re-activates the finding.
  - Suppressed findings are excluded from the score but stay in SARIF and JSON.
  - A baseline shipped *inside* a scanned skill is ignored unless you opt in with `--use-shipped-baseline`. This is a good default, because a skill author cannot silence your scan.
- **Configuration** is entirely through environment variables: provider, model, model registry, reasoning effort, temperature/seed, output language, workflow deadline (default 600 s), and per-artifact static deadline (default 300 s) [S3].
- **Integrations** [S1][S12]:
  - an MCP server (`scan_skill` tool) that agents can call before installing; its HTTP transport has no authentication
  - Pi and OpenCode extensions
  - a bundled `skill-inspector` Claude-style skill that orchestrates SkillSpector plus a manual review and gives an APPROVE/CAUTION/REJECT verdict
  - a contrib batch scanner

### 1.7 CI usage

- There is **no official GitHub Action** (no `action.yml` in the repo). CI use means installing the CLI in the job and gating on the exit code and/or uploading SARIF. **Assessment:** use `github/codeql-action/upload-sarif` for display and the exit code for gating.
- The project's own CI uses `astral-sh/setup-uv` (SHA-pinned), Python 3.12, `uv sync`, and a Docker smoke test [S1, .github/workflows/ci.yml]. That is a good template.
- Hosted NVIDIA guidance [S5]:
  - block on critical/high until resolved or formally accepted
  - remove hidden instructions and tool poisoning
  - fix under-declared capabilities
  - upgrade vulnerable dependencies or document why not
  - align descriptions with behaviour

### 1.8 Limitations and false-positive behaviour

**Self-declared** [S1]: non-English content, text inside images, encrypted or binary code, no runtime behaviour, a reduced SC4 when offline. "High recall … moderate precision (some false positives)" for static mode.

**Observed in the issue tracker** (open as of 2026-10-02):
- **#37**: on eight prose-only skills, three were rated DO_NOT_INSTALL. All HIGH/CRITICAL findings were pattern matches on README/LICENSE/template prose; one CRITICAL "Harmful Content" fired on ordinary README text [S11].
- **#644**, from v2.12.0 `--no-llm` triage of public skills [S10]:
  - P2 fires on a UTF-8 BOM and on HTML layout comments, with matches that can span hundreds of lines.
  - RA2 matches `plist` inside identifiers.
  - EA3 fires on the OFL licence text.
  - RP1 fires on `npx` strings in tests.
  - E2 fires on `os.environ.copy()` passed to a local subprocess.
  - AE1 parser-limit gaps are rated HIGH and repeated per referencing line. The reporter calls this "the single largest score driver (scores of 50 to 100, DO_NOT_INSTALL on skills with no real finding)".
- **#297**: P2 matches `GET` inside "tar**get**" (missing word boundary).
- **#639**: `npx` matched across line breaks.
- **#606**: Bitcoin funding docs match ransomware rules.
- **#675**: the README's precision claim is not tied to a benchmark, and the LLM does not drop disputed findings [S9].
- **False negatives too**, e.g. #592 (multi-line reverse shells missed by YARA) and #445 (YAML block-list wildcard grants not detected).

**Assessment:** for Claude Code skills, which are mostly Markdown, expect a noisy static report. Many HIGHs will be prose matches. A score > 50 is a "read this carefully" signal, not proof of malice, and a low score is not proof of safety. A committed, reasoned baseline per adopted skill is essential so that re-scans show only *new* findings.

---

## 2. Scan results for game-creator

### 2.1 Status: not run. Blocked on the Python version

Checks performed on this machine (2026-10-02):

| Check | Result |
|---|---|
| `python3 --version` | 3.9.6 (`/usr/bin/python3`, system) |
| `python3.10` … `python3.14` | not found |
| `uv`, `pyenv`, `pipx`, `conda`, `mise`, `asdf` | not found |
| Spotlight/`find` for `python3.1[2-4]` | nothing |
| Homebrew | `/opt/homebrew/bin/brew` exists, with no Python formula installed |
| Docker | `/usr/local/bin/docker` (Docker Desktop CLI) exists. I did not check whether the daemon is running |
| Claude Code | 2.1.287 (relevant for the `claude_cli` provider and `claude plugin validate`) |

SkillSpector requires Python ≥3.12 [S2]. Per the brief, I did not download `uv` or a Python build, use Docker, or install anything. **No SkillSpector findings exist yet.**

### 2.2 What the owner needs to approve (pick one)

All three options run static mode only (`--no-llm`), so no secrets are needed. The SkillSpector version is pinned to tag `v2.12.0` (commit `c7958a3268d9498644b22edb75d0f051bbc8cbfc`), using the committed `uv.lock` for reproducible dependencies.

**Option A: project-local uv and CPython 3.12. No global changes. Recommended.**

This downloads the official `uv` release binary for `aarch64-apple-darwin` from `github.com/astral-sh/uv/releases` and verifies it against the published SHA-256, instead of using `curl | sh`. All uv state is then confined to one directory:

```bash
TOOLS=<approved dir, e.g. scratchpad or a gitignored .tools/>
export UV_PYTHON_INSTALL_DIR=$TOOLS/python UV_CACHE_DIR=$TOOLS/uv-cache UV_TOOL_DIR=$TOOLS/uv-tools
git clone --depth 1 --branch v2.12.0 https://github.com/NVIDIA/skillspector.git $TOOLS/skillspector
cd $TOOLS/skillspector && $TOOLS/uv/uv sync --frozen --python 3.12   # downloads python-build-standalone 3.12
$TOOLS/skillspector/.venv/bin/skillspector --version
```

Downloads involved: the uv binary (about 15–20 MB), a standalone CPython 3.12 (about 20–40 MB), and the locked wheels (likely a few hundred MB). This is **(unverified)**; in particular I have not confirmed that a `yara-python` macOS arm64 cp312 wheel exists, and if it does not, the build needs Apple clang, which is present.

**Option B: Docker.** `docker build -t skillspector:2.12.0 .` from the tag checkout. Then:

```bash
docker run --rm --network none -v <clone>:/scan:ro skillspector:2.12.0 scan /scan/skills -r --no-llm -f json
```

`--network none` disables the OSV lookup, which then falls back to the bundled list. Writing the report needs a separate writable mount. This gives isolation, but needs Docker Desktop running and its licence terms accepted.

**Option C: a global Python 3.12.** `brew install python@3.12` or the python.org installer, then a venv. This is the simplest, but it is a global change.

**Optional LLM stage.** `SKILLSPECTOR_PROVIDER=claude_cli` uses the existing Claude Code login with no key. The owner must agree to skill contents going to Anthropic through their plan quota.

**Planned scan scope** (ready to run once unblocked):

```bash
G=.../scratchpad/repos/game-creator-scan          # shallow clone already present, HEAD 4e64b83 (2026-05-25)
skillspector scan $G/skills -r --no-llm --fail-on-incomplete -f json -o gc-skills.json
skillspector scan $G/skills -r --no-llm -f markdown -o gc-skills.md
skillspector scan $G/agents --no-llm -f json -o gc-agents.json
skillspector scan $G/scripts --no-llm -f json -o gc-scripts.json   # plus settings.json hook target
```

Do **not** scan the GitHub URL directly. The repo's blobs total about 208 MiB (388 MB on disk with `.git`), so SkillSpector's 100 MiB post-clone ingest cap would very likely fail closed (inference from [S1]).

The submodules `submodules/playdotfun` (→ `skills/playdotfun`), `submodules/unity-mcp` (→ `skills/unity-mcp`) and `skills/sub-games` are **empty** in the shallow clone. A scan of the clone would silently miss them. `sub-games` uses an SSH URL (`git@github.com:subdotgames/skills`), which needs GitHub SSH auth to fetch.

### 2.3 Interim manual read-only observations

**This is not SkillSpector output.** Below is a bounded `grep`/read pass over the clone at `4e64b83`, plus `claude plugin validate` (an Anthropic first-party structural validator that only parses manifests and frontmatter). No game-creator code was executed. The "Likely scanner reaction" column is my hypothesis, to be confirmed when the scan runs.

**Inventory:**
- 31 `SKILL.md` files; 106 files under `skills/` (99 `.md`, 4 `.ts`, 2 `.txt`, 1 `.sh`)
- 4 agents
- 15 files under `scripts/` (all JS/MJS, so outside SkillSpector's Python-only AST/taint coverage)
- `examples/` (811 files) and `assets/` (162 files, including large photos)

| # | Location | Observation | Likely scanner reaction | TP/FP (assessment) |
|---|---|---|---|---|
| 1 | `settings.json` (plugin root) | Sets `"agent": "game-creator"`, `env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, and a `UserPromptSubmit` hook `node scripts/intercept-api-key.mjs`. Per Claude Code docs, a plugin-root `settings.json` applies only `agent` and `subagentStatusLine`, and other keys are dropped [S15]. So installing the plugin **replaces the main-thread agent** with game-creator's, while the hook and env are likely inert unless someone copies them into `.claude/settings.json`. | Possibly none. The dedicated hook analyzer targets `hooks/hooks.json` and `.claude/settings*.json` [S8] **(unverified)** | The agent override is a real adoption concern but not malicious. |
| 2 | `scripts/intercept-api-key.mjs` | Reads every prompt, regex-matches API-key patterns, writes them to `<project>/.env` (chmod 600), appends `.env` to `.gitignore`, and blocks the prompt. No network calls. | E2/PE3-style credential handling; possibly OH/MP | TP for "credential handling", benign intent. It writes files on every prompt if enabled. |
| 3 | `skills/use-template/SKILL.md:133–142` | **Opt-out telemetry**: `https.get` to `gallery-telemetry.up.railway.app/t?event=clone&template=…` unless `DO_NOT_TRACK`/`DISABLE_TELEMETRY` is set. Disclosed in the skill text. | E1 External Transmission (MEDIUM) | **TP** (real egress, low sensitivity). Strip it if adopted. |
| 4 | Multiple skills | Third-party services and keys: `MESHY_API_KEY` (60 refs), `RETRODIFFUSION_API_KEY`, `WORLDLABS_API_KEY`/`WLT_API_KEY`, `SKETCHFAB_TOKEN`, `POLY_PIZZA_API_KEY`, `HERENOW_API_KEY`, `PLAYFUN_API_KEY`/`PLAYFUN_SECRET_KEY`. Endpoints include api.meshy.ai, api.retrodiffusion.ai, api.worldlabs.ai, api.sketchfab.com, api.play.fun, here.now and moltbook.com. | E1, E2, PE3 | Mostly TP-by-design. Each one is an egress and credential decision for the owner. |
| 5 | `skills/game-qa/playwright-mcp.md:10`, `skills/viral-game/verification-protocol.md:9` | Instructs the agent to run `claude mcp add playwright npx @playwright/mcp@latest`, which modifies the agent's own MCP config with an unpinned package. | SC1 / RA1-style self-modification / EA | **TP** (supply-chain and self-config hygiene). |
| 6 | `agents/game-deploy.md:121` and others | `npm install -g vercel`, `npm install -g @gltf-transform/cli`; `npx @phaserjs/create-game@latest`, `npm create vite@latest` | SC1 / RP-type unpinned installs | TP for hygiene. Conflicts with our no-global-install rule. |
| 7 | `skills/threejs-game/reference/llms-full.txt` (e.g. lines 456, 730, 1319) | 4 lines contain U+200B zero-width spaces mid-sentence ("languages​​th…") in a three.js docs dump (128 KB). | P2 Hidden Instructions / TP1 | **Likely FP** (copy-paste artefact), but strip it anyway. |
| 8 | `skills/fetch-tweet`, `viral-game/tweet-pipeline.md` | Pulls arbitrary tweet text from `api.fxtwitter.com` into context. | Possibly none statically | An indirect prompt-injection *exposure*, not an attack. Relevant only if adopted. |
| 9 | Whole repo | `grep` found no `curl\|wget … \| sh`, no "ignore previous instructions"/"never refuse"/"always comply", no HTML comments in `SKILL.md`, no base64-like blobs ≥120 chars, and no `allowed-tools` frontmatter in any skill. | n/a | Good signs (grep-level only, not exhaustive). |
| 10 | `claude plugin validate` (Claude Code 2.1.287) | Marketplace manifest: **passed**. `skills/`: **passed with 1 warning**: 2 entries are symlinks (the submodule links) and were not followed. | n/a | Structural only. |

**Non-security adoption risks** (assessment):
- No LICENSE file. README says MIT, `package.json` says ISC, and GitHub detects no licence.
- Strudel audio implies AGPL-3.0 for games using it.
- The assets include photos of real public figures (`assets/characters/…/jensen-huang`, `satya-nadella`, `sundar-pichai`, `elon-musk`), and there are example games named after politicians.
- No commits since 2026-05-25 (about 4 months) and 334 stars.

**Overall interim verdict (assessment):** I see no sign of malicious intent. If parts are adopted, they need remediation first: telemetry, global installs, `@latest`, the agent override and Unicode artefacts. Licence clarification is the real blocker for copying text verbatim.

---

## 3. Other validators and how they compare

| Tool | Maintainer / maturity | What it does | Requirements | Fit for us (assessment) |
|---|---|---|---|---|
| **NVIDIA SkillSpector** | NVIDIA, Apache-2.0, ~19k★, v2.12.0, Alpha | Static (regex/AST/taint/YARA/OSV) plus optional LLM; JSON/MD/SARIF; baselines; MCP server | Python ≥3.12; key-free static mode | Owner's named choice. Broadest rule set and best Claude Code awareness. Noisy. |
| **Cisco AI Defense `skill-scanner`** [S18] | Cisco AI Defense, ~2.6k★, v2.1.0 (2026-09-05), on PyPI as `cisco-ai-skill-scanner`. README says Apache-2.0; GitHub API reports "Other" **(unverified)** | YAML and YARA-X signatures, AST and dataflow, a CEL decision layer; optional LLM judge with consensus runs; meta-analyzer; VirusTotal and Cisco cloud (keys); SARIF/HTML; `--fail-on-severity`; **reusable GitHub Actions workflow** | CPython 3.11–3.14 (source builds also need Go ≥1.27.1); LLM, VirusTotal and cloud need keys | The most credible second opinion. Also blocked on Python 3.9 here. Its own README is candid that "false positives and false negatives can occur". |
| **Snyk `agent-scan`** (ex-Invariant `mcp-scan`) [S19] | Snyk, Apache-2.0, ~3.1k★, v0.6.8 (2026-09-29) | Auto-discovers agent configs, MCP servers and skills on the machine; prompt-injection/malware/credential checks via the Snyk API | `uvx`, **requires `SNYK_TOKEN`**; **sends skill content** (secrets redacted) to Snyk; CLI output declared experimental | Fails our "no secrets" constraint and adds cloud egress. Better as an optional periodic machine-wide audit if the owner wants one. |
| **`claude plugin validate [--strict] [--json]`** [S15][S16] | Anthropic, built into Claude Code ≥2.1.233 | Manifest and frontmatter schema, path containment (`..`), MCP entry checks, reserved names | Already installed (2.1.287) | **Structural only, not security.** Cheap; use it as a first gate. |
| **`claude plugin eval`** [S16] | Anthropic | Runs prompts with and without the plugin in isolated sessions, scores them with graders, exits non-zero below a threshold | Claude Code | Quality and behaviour regression, not security. Useful later for our own skills. |
| **`skills-ref validate`** [S20] | agentskills.io spec repo (Anthropic-authored), Apache-2.0 | Spec conformance of `SKILL.md` | Python ≥3.11 | "Demonstration only, not for production" per its README. Spec check only. |
| Claude Enterprise "Skill content scanning" [S17] | Anthropic | Scans custom skills uploaded to claude.ai and Cowork | Enterprise plan | Does **not** cover Claude Code filesystem skills. Not applicable. |
| Small/new tools: `FrancoisChastel/skill-scanner` (2★, created 2026-09-30), `XINMurat/skillvet` (0★), `cc-audit` (Rust crate), tessl `skill-safety-auditor`, `claudelint` [S21] | Individuals | Static checks, install gates, wrappers around the tools above | Varied | **Not recommended.** Unvetted and very new, and they would themselves need to pass our intake. |

**Anthropic's official position** [S17]: "Use Skills only from trusted sources: those you created yourself or obtained from Anthropic… If you must use a Skill from an untrusted or unknown source, exercise extreme caution and thoroughly audit it before use." The guidance lists what to audit: all bundled files, unexpected network calls, external URL fetching, tool misuse, and data exposure. Claude Code docs add: review `allowed-tools` grants, `` !`cmd` `` shell-injection blocks, and skill-scoped `hooks`. `disableSkillShellExecution: true` turns off shell injection for non-bundled skills [S16].

**Assessment:** no validator is sufficient on its own. The industry pattern, which SkillSpector's own `skill-inspector` skill also follows [S12], is a deterministic scan plus a source-aware human or agent review with an APPROVE/CAUTION/REJECT verdict.

---

## 4. Recommendations for Wallhammer Zero (proposal only)

### 4.1 Top recommendations

1. **Unblock SkillSpector with a confined toolchain** (Option A: a project-local `uv` plus uv-managed CPython 3.12 in a gitignored tools directory, or Option B: Docker). Pin **v2.12.0 / `c7958a3`** using `uv sync --frozen`, then run the planned game-creator scan. Record the scanner version in every report.
2. **Treat the scanner as a gate that requires triage, not an oracle.** Always run with `--no-llm` (or an explicit `SKILLSPECTOR_PROVIDER`) and with `--fail-on-incomplete`. Every HIGH/CRITICAL must be read in source and classified TP/FP with a written reason. Maintain *our own* baseline with reasons. Never use `--use-shipped-baseline`.
3. **Prefer "adopt by re-authoring" over installing third-party skills or plugins as-is.** Copy the ideas from game-creator (pipelines, QA/Playwright patterns, architecture validators) into first-party skills written for Wallhammer Zero's pixel-art management-sim scope. Where text is copied, it must pass the full intake and have a clear licence. This also avoids the `agent` override and the external-service sprawl.
4. Add `claude plugin validate --strict --json` as the cheap first gate, and consider `disableSkillShellExecution` and narrow permission rules for any third-party skill that is admitted.
5. Optional, if the owner agrees: enable the `claude_cli` LLM stage for skills that ship scripts or hooks. It uses no new secret, but the content goes to Anthropic.

### 4.2 Proposed skill intake procedure

**Roles**
- **Owner:** the sole approver. Signs the decision record.
- **Claude Code session:** the intake operator. Fetches, scans, triages, proposes a verdict and writes the reports. It never approves and never installs before approval.
- **CI:** enforces that only registered, hash-matching skills exist.

**Steps**
1. **Request.** Open an intake record with the source URL, exact commit SHA, upstream licence, the purpose for Wallhammer Zero, and the exact list of files to adopt (cherry-pick, not whole repos).
2. **Quarantine fetch.** Make a shallow clone pinned to the SHA into a quarantine directory outside `.claude/` (scratchpad or a gitignored `quarantine/`). Never use `/plugin install`, `npx skills add` or `claude mcp add` during intake. Fetch submodules explicitly and pin them. Execute nothing from the target.
3. **Licence gate.** There must be an SPDX licence that the owner deems compatible. If the licence is missing or contradictory, **block verbatim adoption**; "re-author inspired by" remains allowed.
4. **Structural gate.** `claude plugin validate --strict --json <dir>`. It must pass with no unexplained warnings, and symlinks must be resolved and scanned at their real paths.
5. **Security scan.** Run `skillspector scan <dir> [-r] --no-llm --fail-on-incomplete` with JSON, SARIF and Markdown output, using the pinned scanner version. Optionally run the `claude_cli` LLM stage as well.
6. **Triage.** Claude reads every finding in context. For every HIGH/CRITICAL, write a TP/FP verdict, a reason and the evidence lines. Then do a manual checklist even when the scan is clean:
   - hooks (all locations), `allowed-tools`, `` !`cmd` `` blocks, `bin/`, MCP/LSP servers, monitors, `settings.json` (`agent` override)
   - network endpoints and telemetry, credential and env access
   - `@latest`/unpinned installs, global installs, writes outside the project
   - hidden/zero-width/bidi characters, and instructions that modify agent config
7. **Remediate the copy.** Strip telemetry, pin versions, remove global installs, hooks and agent overrides, and remove zero-width artefacts. Re-scan the **modified** copy, because that is what gets installed. Create our baseline with `skillspector baseline … --reason` only for findings triaged as FP or accepted.
8. **Decision.** The owner decides APPROVE / CAUTION (approved with listed, accepted exceptions) / REJECT.
   - **Blocking by default:**
     - any unresolved CRITICAL/HIGH
     - risk score > 50 after baseline
     - incomplete analysis (AE/ledger gaps) on files being adopted
     - missing or incompatible licence
     - any hook, monitor, `bin/`, MCP server or agent override not individually approved
     - unexplained network egress or credential access
     - unexplained hidden or obfuscated content
     - an author-shipped baseline
   - **Non-blocking but recorded:** MEDIUM/LOW findings with a written triage.
9. **Store the evidence in the repo** (suggested layout, owner to confirm):
   ```text
   security/skill-intake/
     registry.yaml                      # skill → source URL, SHA, licence, adopted paths, sha256 tree hash,
                                        #         scanner+version, verdict, approver, date, next review
     <skill>/<YYYY-MM-DD>-<sha7>/
       skillspector.json  skillspector.sarif  skillspector.md
       claude-validate.json
       triage.md                        # every finding: rule, file:line, TP/FP, reason
       baseline.yaml                    # our suppressions, each with a reason
       decision.md                      # verdict, exceptions, approver, scanner version, source SHA
   ```
10. **Install.** Copy the approved files into `.claude/skills/<name>/` with a provenance note and commit them together with the intake record.
11. **Re-scan triggers:**
    - **Upstream update.** We never auto-update. A new upstream SHA means a new intake on the diff, and a full re-scan of the resulting copy.
    - **Scanner upgrade.** Re-scan all registered skills. Fingerprint baselines intentionally re-activate on a version change [S6].
    - **Periodic.** A monthly re-scan of `.claude/skills/**` with `--baseline`, so only new findings surface.
    - **CI on every PR** touching `.claude/**` or `security/skill-intake/**`: verify that each skill directory's tree hash matches `registry.yaml`, run `claude plugin validate --strict` and `skillspector --no-llm --baseline … --fail-on-incomplete`, upload SARIF, and fail on an exit code ≠ 0.
12. **First-party skills** (written by our Claude sessions). The same CI scan runs as a cheap regression check, with normal code review instead of the owner-approval gate (owner to confirm).

**Bootstrap note:** SkillSpector's own `skill-inspector` skill [S12] is a good model for an intake skill. Under the owner's rule it is itself a third-party skill, so it would need to pass intake first, or be re-authored in-house.

---

## 5. Open questions for the owner

1. **Toolchain:** which unblock option is acceptable? (A) project-local `uv` plus a downloaded CPython 3.12 confined to one directory, (B) Docker Desktop, or (C) a global Python 3.12 via Homebrew or python.org. Where should the tools directory live: scratchpad, a gitignored `.tools/` in the repo, or elsewhere?
2. **LLM stage:** may skill contents be sent to Anthropic through the `claude_cli` provider, which uses your Claude plan with no new key? Or should we stay static-only?
3. **OSV.dev egress:** is sending dependency names and versions to OSV.dev acceptable, or must scans run offline (`--network none`, reduced SC4)?
4. **Gate strictness:** should CAUTION (score 21–50) block adoption, or only require written triage? Should `--fail-on-findings` (any active finding) be the CI default once baselines exist?
5. **Second scanner:** do you want Cisco `skill-scanner` as a second opinion? It also needs Python ≥3.11, so its toolchain question is the same.
6. **game-creator:** is the goal inspiration only (re-author) or copying specific skills? If copying, will you contact the authors about the licence (no LICENSE file; README says MIT, `package.json` says ISC)?
7. **Evidence location:** is `security/skill-intake/` (committed) acceptable for scan reports and the registry?
8. **First-party skills:** should the skills Claude writes for Wallhammer Zero go through the same owner sign-off, or only CI scanning?
9. **Plugins vs skills:** does the third-party rule also cover plugins, MCP servers, hooks and agents? I recommend yes, since hooks and MCP servers execute code directly.
10. **Re-scan cadence:** is monthly acceptable, and who triggers re-intake when upstream changes?

---

## Sources

- [S1] NVIDIA SkillSpector repository and README (HEAD `2226747`, 2026-09-29): https://github.com/NVIDIA/SkillSpector
- [S2] `pyproject.toml` (Python `>=3.12,<3.15`, dependencies, Alpha classifier): https://github.com/NVIDIA/SkillSpector/blob/main/pyproject.toml
- [S3] `.env.example` (providers, credentials, deadlines): https://github.com/NVIDIA/SkillSpector/blob/main/.env.example
- [S4] Releases (v2.12.0, 2026-09-23): https://github.com/NVIDIA/SkillSpector/releases
- [S5] NVIDIA hosted guide "Scanning agent skills": https://docs.nvidia.com/skills/scanning-agent-skills
- [S6] Suppression / baseline docs: https://github.com/NVIDIA/SkillSpector/blob/main/docs/SUPPRESSION.md
- [S7] `claude_cli` provider hardening (`_build_claude_argv`): https://github.com/NVIDIA/SkillSpector/blob/main/src/skillspector/providers/_agent_cli.py
- [S8] Bundled execution surface analyzer (hook file paths): https://github.com/NVIDIA/SkillSpector/blob/main/src/skillspector/nodes/analyzers/bundled_execution_surface.py
- [S9] Issue #675, Stage 2 precision claim vs behaviour: https://github.com/NVIDIA/SkillSpector/issues/675
- [S10] Issue #644, static false positives on public skills: https://github.com/NVIDIA/SkillSpector/issues/644
- [S11] Issue #37, false positives on text-only skills: https://github.com/NVIDIA/SkillSpector/issues/37 (also #297, #639, #606, #592, #445 in the same tracker)
- [S12] Bundled `skill-inspector` skill: https://github.com/NVIDIA/SkillSpector/blob/main/skills/skill-inspector/SKILL.md
- [S13] Dockerfile (digest-pinned `python:3.12-slim-bookworm`): https://github.com/NVIDIA/SkillSpector/blob/main/Dockerfile
- [S14] playableintelligence/game-creator (HEAD `4e64b83`, 2026-05-25): https://github.com/playableintelligence/game-creator
- [S15] Claude Code plugin manifest reference (plugin-root `settings.json` scope, `claude plugin validate`): https://code.claude.com/docs/en/plugins-reference
- [S16] Claude Code skills docs (`allowed-tools`, shell injection, `disableSkillShellExecution`, `/skill-doctor`, `claude plugin eval`): https://code.claude.com/docs/en/skills
- [S17] Agent Skills overview, security considerations: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
- [S18] Cisco AI Defense skill-scanner: https://github.com/cisco-ai-defense/skill-scanner
- [S19] Snyk agent-scan: https://github.com/snyk/agent-scan
- [S20] Agent Skills spec and `skills-ref`: https://github.com/agentskills/agentskills
- [S21] Smaller tools: https://github.com/FrancoisChastel/skill-scanner, https://github.com/XINMurat/skillvet, https://lib.rs/crates/cc-audit, https://tessl.io/registry/mtthwmllr/skill-safety-auditor, https://claudepluginhub.com/skills/pdugan20-claudelint/validate-skills
- [S22] PyPI lookup (404 on 2026-10-02): https://pypi.org/project/skillspector/
- [S23] SkillSpector CHANGELOG: https://github.com/NVIDIA/SkillSpector/blob/main/CHANGELOG.md
