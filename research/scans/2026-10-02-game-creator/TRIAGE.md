# skillspector scan: PlayableIntelligence/game-creator (2026-10-02)

- **Target:** github.com/PlayableIntelligence/game-creator @ `4e64b83b5fe400b34ad3a484d9b4a6090b26d512` (2026-05-25), shallow clone, submodules empty.
- **Scanner:** NVIDIA SkillSpector **v2.12.0** (`c7958a3268d9498644b22edb75d0f051bbc8cbfc`), built from its digest-pinned Dockerfile.
- **How it ran:** Docker, `--network none` (offline, so OSV fell back to the bundled list), `--no-llm` (static only, no keys, nothing sent anywhere).
  ```
  docker run --rm --network none -v <clone>:/scan:ro -v <out>:/out skillspector:2.12.0 \
    scan /scan/skills -r --no-llm --fail-on-incomplete -f json -o /out/skills.json
  ```
  The same was run for `/scan/agents -r`, `/scan/scripts -r` and the repo root.
- **Raw reports:** `skills.md`, `agents.md` and `scripts.md` in this folder. The root-scan output (1.7 MB, mostly SC9 coverage notices) was not kept.

## Scanner verdict

| Scope | Findings | HIGH | MEDIUM | Exit | Notes |
|---|---|---|---|---|---|
| `skills/` (31 skills) | 121 | 31 | 90 | 1 | **risk HIGH, score 76, recommendation `DO_NOT_INSTALL`**. Coverage is `partial`: 1 file fully inspected, 30 partially, 3.2 % |
| `agents/` | 9 | 0 | 9 | 0 | |
| `scripts/` | 16 | 3 | 13 | 1 | |
| repo root | 620 | 596 | 24 | 1 | 592 of the HIGH findings are SC9 "excluded artefact inspection incomplete" (example games' JS, `.git`), i.e. coverage notices |

No CRITICAL findings anywhere.

## Triage of every HIGH finding (main session, reading the source)

| Rule | Where | Verdict | Why |
|---|---|---|---|
| PE3 Credential access (×24 in skills) | SKILL.md files for Meshy, RetroDiffusion, here.now and 3D asset keys | **TP (by design)** | Skills tell the agent to `grep` `.env` for API keys of paid services. Not malicious, but exactly what we don't want: paid generators plus agent-driven credential handling. |
| PE3 (×3 in scripts) | `scripts/intercept-api-key.mjs` | **TP (sensitive)** | A hook that intercepts API keys from prompts and writes them into `.env` and `.gitignore`. It touches secrets automatically. Never adopt. |
| TM1 Tool parameter abuse | troubleshooting `git push origin gh-pages --force` | **TP (hygiene)** | Destructive force-push advice in a skill. |
| AE1 Incomplete referenced artefact (×5) | references to `integration-patterns.md`, `verification-patterns.md`, `no-asset-design.md` | **Coverage gap** | The scanner could not fully analyse the referenced files. Read them manually before taking ideas. |
| MP3 Memory manipulation | Phaser docs "Reset state" in `init()` | **FP** | Game-state wording, not agent memory. |
| YR4 YARA MCP tool-poisoning | XMP metadata in `assets/characters/.../elon-musk/*.png` | **FP (content concern)** | Image metadata with zero-width characters. The real-person photo assets are excluded from adoption anyway. |
| SC9 (×592) | example games' JS, `.git` | **Coverage notice** | Not findings; the static mode skipped these files. |

MEDIUMs are mostly RP1 (68; unlabelled in the report), E1 external transmission (e.g. `api.fxtwitter.com`, here.now `curl`), RA2 session persistence (a PartyKit server scaffold), EA2 "without asking" and P4 "always prefer image input". Read in context, these fit the plugin's purpose and none is malicious, but several conflict with our rules (external services, autonomy).

## Conclusion (recommendation only: per D17 the owner decides)

- **Recommendation: don't install game-creator as-is** (scanner: DO_NOT_INSTALL; our triage agrees for the hook, the credential flows and the paid-service skills).
- **Taking ideas is fine** (D13), for example the test protocol and the QA loop described in `research/game-creator.md`. Copying even text still waits for a clear licence (none: README says MIT, `package.json` says ISC, no LICENSE file).
- Static mode reached only 3.2 % coverage of the skills. A fuller verdict would need the LLM stage, e.g. the `claude_cli` provider (owner call, see the skill-intake task).
