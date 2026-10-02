# SkillSpector Security Report

**Skill:** unknown  
**Source:** `/scan/scripts`  
**Scanned:** 2026-10-02 08:43:32 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 79/100 |
| Severity | HIGH |
| Recommendation | DO NOT INSTALL |

## Components (15)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `build-character.mjs` | other | 126 | Yes |
| `build-spritesheet.mjs` | other | 91 | Yes |
| `crop-head.mjs` | other | 233 | Yes |
| `example-actions.json` | json | 42 | No |
| `find-3d-asset.mjs` | other | 550 | Yes |
| `intercept-api-key.mjs` | other | 188 | Yes |
| `iterate-client.js` | javascript | 672 | Yes |
| `meshy-generate.mjs` | other | 712 | Yes |
| `optimize-glb.mjs` | other | 188 | Yes |
| `process-head.mjs` | other | 73 | Yes |
| `retrodiffusion-generate.mjs` | other | 369 | Yes |
| `validate-architecture-threejs.mjs` | other | 223 | Yes |
| `validate-architecture.mjs` | other | 241 | Yes |
| `verify-runtime.mjs` | other | 56 | Yes |
| `worldlabs-generate.mjs` | other | 710 | Yes |

## Issues (16)

### 🔴 HIGH: PE3

**Location:** `intercept-api-key.mjs:86`  
**Confidence:** 60%  

**Message:** Credential Access

**Remediation:** Remove references to credential paths. Use environment variables or secrets managers. For docs, use placeholder paths (e.g., /path/to/config). Never load .env or token files in production code paths.

---

### 🔴 HIGH: PE3

**Location:** `intercept-api-key.mjs:163`  
**Confidence:** 60%  

**Message:** Credential Access

**Remediation:** Remove references to credential paths. Use environment variables or secrets managers. For docs, use placeholder paths (e.g., /path/to/config). Never load .env or token files in production code paths.

---

### 🔴 HIGH: PE3

**Location:** `intercept-api-key.mjs:105`  
**Confidence:** 60%  

**Message:** Credential Access

**Remediation:** Remove references to credential paths. Use environment variables or secrets managers. For docs, use placeholder paths (e.g., /path/to/config). Never load .env or token files in production code paths.

---

### 🟡 MEDIUM: E1

**Location:** `find-3d-asset.mjs:148`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary. Remove or replace with documented APIs. Ensure no secrets, tokens, or PII are transmitted.

---

### 🟡 MEDIUM: E1

**Location:** `find-3d-asset.mjs:178`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary. Remove or replace with documented APIs. Ensure no secrets, tokens, or PII are transmitted.

---

### 🟡 MEDIUM: E1

**Location:** `find-3d-asset.mjs:208`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary. Remove or replace with documented APIs. Ensure no secrets, tokens, or PII are transmitted.

---

### 🟡 MEDIUM: E1

**Location:** `find-3d-asset.mjs:243`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary. Remove or replace with documented APIs. Ensure no secrets, tokens, or PII are transmitted.

---

### 🟡 MEDIUM: E1

**Location:** `find-3d-asset.mjs:326`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary. Remove or replace with documented APIs. Ensure no secrets, tokens, or PII are transmitted.

---

### 🟡 MEDIUM: E1

**Location:** `find-3d-asset.mjs:375`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary. Remove or replace with documented APIs. Ensure no secrets, tokens, or PII are transmitted.

---

### 🟡 MEDIUM: EA2

**Location:** `intercept-api-key.mjs:176`  
**Confidence:** 80%  

**Message:** Autonomous Decision Making

**Remediation:** Add human-in-the-loop confirmation for destructive, irreversible, or high-impact operations. Never auto-execute commands that modify files, send data, or alter system state.

---

### 🟡 MEDIUM: E1

**Location:** `meshy-generate.mjs:60`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary. Remove or replace with documented APIs. Ensure no secrets, tokens, or PII are transmitted.

---

### 🟡 MEDIUM: RP1

**Location:** `optimize-glb.mjs:87`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx --yes @gltf-transform/cli'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `optimize-glb.mjs:131`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx --yes @gltf-transform/cli'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: AS3

**Location:** `retrodiffusion-generate.mjs:38`  
**Confidence:** 80%  

**Message:** Skill Enumeration

**Remediation:** Remove all code or instructions that list or read other skills' files or directories. Skills should operate independently; cross-skill access is a privilege escalation.

---

### 🟡 MEDIUM: E1

**Location:** `retrodiffusion-generate.mjs:44`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary. Remove or replace with documented APIs. Ensure no secrets, tokens, or PII are transmitted.

---

### 🟡 MEDIUM: E1

**Location:** `worldlabs-generate.mjs:55`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary. Remove or replace with documented APIs. Ensure no secrets, tokens, or PII are transmitted.

---

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | partial |
| Coverage | 26.7% |
| Fully inspected | 4 |
| Partially inspected | 11 |
| Entirely uninspected | 0 |

### Ledger Exceptions

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| static_parse_limit | `build-character.mjs` | A security-relevant expression exceeded a bounded static parser's span limit. |
| static_parse_limit | `crop-head.mjs` | A security-relevant expression exceeded a bounded static parser's span limit. |
| static_parse_limit | `find-3d-asset.mjs` | A security-relevant expression exceeded a bounded static parser's span limit. |
| static_parse_limit | `iterate-client.js` | A security-relevant expression exceeded a bounded static parser's span limit. |
| static_parse_limit | `meshy-generate.mjs` | A security-relevant expression exceeded a bounded static parser's span limit. |
| static_parse_limit | `optimize-glb.mjs` | A security-relevant expression exceeded a bounded static parser's span limit. |
| obfuscated_instruction_text | `retrodiffusion-generate.mjs` | Obfuscated instruction text could not be fully evaluated by the deterministic layer. |
| static_parse_limit | `retrodiffusion-generate.mjs` | A security-relevant expression exceeded a bounded static parser's span limit. |
| static_parse_limit | `validate-architecture-threejs.mjs` | A security-relevant expression exceeded a bounded static parser's span limit. |
| static_parse_limit | `validate-architecture.mjs` | A security-relevant expression exceeded a bounded static parser's span limit. |
| static_parse_limit | `verify-runtime.mjs` | A security-relevant expression exceeded a bounded static parser's span limit. |
| static_parse_limit | `worldlabs-generate.mjs` | A security-relevant expression exceeded a bounded static parser's span limit. |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| manifest_absent | `` | No compatible manifest was present for this analyzer. |
| completed | `` |  |
| manifest_absent | `` | No compatible manifest was present for this analyzer. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| degraded | `` |  |
| degraded | `` |  |
| completed | `` |  |
| degraded | `` |  |
| degraded | `` |  |
| degraded | `` |  |
| degraded | `` |  |
| completed | `` |  |
| degraded | `` |  |
| degraded | `` |  |
| degraded | `` |  |
| degraded | `` |  |
| degraded | `` |  |
| degraded | `` |  |
| degraded | `` |  |
| completed | `` |  |

### Limitations

- Analyzer static_patterns_agent_snooping status: degraded.
- Analyzer static_patterns_anti_refusal status: degraded.
- Analyzer static_patterns_deserialization status: degraded.
- Analyzer static_patterns_excessive_agency status: degraded.
- Analyzer static_patterns_harmful_content status: degraded.
- Analyzer static_patterns_memory_poisoning status: degraded.
- Analyzer static_patterns_privilege_escalation status: degraded.
- Analyzer static_patterns_prompt_injection status: degraded.
- Analyzer static_patterns_rogue_agent status: degraded.
- Analyzer static_patterns_ssrf status: degraded.
- Analyzer static_patterns_supply_chain status: degraded.
- Analyzer static_patterns_system_prompt_leakage status: degraded.
- Analyzer static_patterns_tool_misuse status: degraded.

## Metadata

- **Executable Scripts:** Yes

*Generated by SkillSpector v2.12.0*