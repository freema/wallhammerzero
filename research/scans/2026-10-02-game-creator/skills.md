--- add-3d-assets ---

# SkillSpector Security Report

**Skill:** add-3d-assets  
**Source:** `/scan/skills/add-3d-assets`  
**Scanned:** 2026-10-02 08:42:10 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 26/100 |
| Severity | MEDIUM |
| Recommendation | CAUTION |

## Components (1)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `SKILL.md` | markdown | 191 | No |

## Issues (3)

### 🔴 HIGH: PE3

**Location:** `SKILL.md:31`  
**Confidence:** 60%  

**Message:** Credential Access

**Remediation:** Remove references to credential paths. Use environment variables or secrets managers. For docs, use placeholder paths (e.g., /path/to/config). Never load .env or token files in production code paths.

---

### 🔴 HIGH: PE3

**Location:** `SKILL.md:31`  
**Confidence:** 60%  

**Message:** Credential Access

**Remediation:** Remove references to credential paths. Use environment variables or secrets managers. For docs, use placeholder paths (e.g., /path/to/config). Never load .env or token files in production code paths.

---

### 🔴 HIGH: PE3

**Location:** `SKILL.md:42`  
**Confidence:** 60%  

**Message:** Credential Access

**Remediation:** Remove references to credential paths. Use environment variables or secrets managers. For docs, use placeholder paths (e.g., /path/to/config). Never load .env or token files in production code paths.

---

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | partial |
| Coverage | 100.0% |
| Fully inspected | 1 |
| Partially inspected | 0 |
| Entirely uninspected | 0 |

### Ledger Exceptions

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| reference_missing | `SKILL.md:48-48` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:49-49` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:51-51` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:117-117` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:120-120` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:121-121` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:127-127` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:129-129` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:132-132` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:141-141` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:161-161` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:173-173` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:186-186` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| completed | `` |  |
| completed | `` |  |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |

## Metadata

- **Executable Scripts:** No

*Generated by SkillSpector v2.12.0*

--- add-assets ---

# SkillSpector Security Report

**Skill:** add-assets  
**Source:** `/scan/skills/add-assets`  
**Scanned:** 2026-10-02 08:42:11 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 0/100 |
| Severity | LOW |
| Recommendation | CAUTION |

## Components (1)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `SKILL.md` | markdown | 114 | No |

## Issues (0)

No security issues detected.

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | partial |
| Coverage | 100.0% |
| Fully inspected | 1 |
| Partially inspected | 0 |
| Entirely uninspected | 0 |

### Ledger Exceptions

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| reference_missing | `SKILL.md:30-30` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:31-31` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:58-58` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:59-59` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:61-61` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:62-62` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:63-63` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:64-64` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:110-110` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:111-111` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:112-112` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| completed | `` |  |
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |

## Metadata

- **Executable Scripts:** No

*Generated by SkillSpector v2.12.0*

--- add-audio ---

# SkillSpector Security Report

**Skill:** add-audio  
**Source:** `/scan/skills/add-audio`  
**Scanned:** 2026-10-02 08:42:11 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 0/100 |
| Severity | LOW |
| Recommendation | CAUTION |

## Components (1)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `SKILL.md` | markdown | 92 | No |

## Issues (0)

No security issues detected.

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | partial |
| Coverage | 100.0% |
| Fully inspected | 1 |
| Partially inspected | 0 |
| Entirely uninspected | 0 |

### Ledger Exceptions

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| reference_missing | `SKILL.md:30-30` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:50-50` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:51-51` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:52-52` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:53-53` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:54-54` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:55-55` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:72-72` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| completed | `` |  |
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |

## Metadata

- **Executable Scripts:** No

*Generated by SkillSpector v2.12.0*

--- add-feature ---

# SkillSpector Security Report

**Skill:** add-feature  
**Source:** `/scan/skills/add-feature`  
**Scanned:** 2026-10-02 08:42:11 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 0/100 |
| Severity | LOW |
| Recommendation | CAUTION |

## Components (1)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `SKILL.md` | markdown | 104 | No |

## Issues (0)

No security issues detected.

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | partial |
| Coverage | 100.0% |
| Fully inspected | 1 |
| Partially inspected | 0 |
| Entirely uninspected | 0 |

### Ledger Exceptions

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| reference_missing | `SKILL.md:28-28` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:29-29` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:30-30` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:31-31` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:32-32` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:54-54` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:55-55` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:56-56` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:57-57` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:92-92` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| completed | `` |  |
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |

## Metadata

- **Executable Scripts:** No

*Generated by SkillSpector v2.12.0*

--- add-multiplayer ---

# SkillSpector Security Report

**Skill:** add-multiplayer  
**Source:** `/scan/skills/add-multiplayer`  
**Scanned:** 2026-10-02 08:42:16 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 33/100 |
| Severity | MEDIUM |
| Recommendation | CAUTION |

## Components (5)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `SKILL.md` | markdown | 308 | No |
| `architecture.md` | markdown | 320 | No |
| `client-integration.md` | markdown | 721 | No |
| `deploy.md` | markdown | 276 | No |
| `partykit-server.md` | markdown | 465 | No |

## Issues (26)

### 🔴 HIGH: PE3

**Location:** `deploy.md:125`  
**Confidence:** 60%  

**Message:** Credential Access

**Remediation:** Remove references to credential paths. Use environment variables or secrets managers. For docs, use placeholder paths (e.g., /path/to/config). Never load .env or token files in production code paths.

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:10`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx partykit'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:28`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx partykit'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:45`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx partykit'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:147`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx partykit'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:155`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx partykit'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:163`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx partykit'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:232`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx partykit'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:264`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx partykit'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:266`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx partykit'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `client-integration.md:544`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx partykit'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `deploy.md:18`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx partykit'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `deploy.md:56`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx partykit'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `deploy.md:73`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx partykit'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `deploy.md:75`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx partykit'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `deploy.md:80`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx partykit'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `deploy.md:191`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx partykit'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `deploy.md:207`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx partykit'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `deploy.md:210`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx partykit'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `deploy.md:231`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx partykit'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `partykit-server.md:444`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx partykit'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `partykit-server.md:462`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx partykit'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RA2

**Location:** `SKILL.md:81`  
**Confidence:** 60%  

**Message:** Session Persistence

**Remediation:** Remove any persistence mechanisms (cron jobs, startup scripts, state files). Skills should not maintain state across sessions without explicit user consent.

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:183`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx gh-pages'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `deploy.md:150`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx gh-pages'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `deploy.md:231`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx wrangler'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | partial |
| Coverage | 80.0% |
| Fully inspected | 4 |
| Partially inspected | 1 |
| Entirely uninspected | 0 |

### Ledger Exceptions

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| static_parse_limit | `SKILL.md` | A security-relevant expression exceeded a bounded static parser's span limit. |
| reference_missing | `SKILL.md:18-18` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:26-26` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:35-35` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:38-38` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:43-43` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:53-53` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:57-57` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:58-58` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:59-59` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:60-60` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:61-61` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:62-62` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:85-85` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:86-86` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:87-87` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:88-88` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:97-97` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:98-98` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:99-99` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:101-101` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:111-111` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:124-124` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:126-126` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:128-128` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:138-138` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:170-170` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:182-182` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:210-210` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:230-230` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:233-233` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:249-249` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:286-286` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:302-302` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:306-306` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| completed | `` |  |
| completed | `` |  |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| degraded | `` |  |
| completed | `` |  |

### Limitations

- Analyzer static_patterns_tool_misuse status: degraded.

## Metadata

- **Executable Scripts:** No

*Generated by SkillSpector v2.12.0*

--- design-game ---

# SkillSpector Security Report

**Skill:** design-game  
**Source:** `/scan/skills/design-game`  
**Scanned:** 2026-10-02 08:42:16 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 0/100 |
| Severity | LOW |
| Recommendation | CAUTION |

## Components (1)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `SKILL.md` | markdown | 95 | No |

## Issues (0)

No security issues detected.

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | partial |
| Coverage | 100.0% |
| Fully inspected | 1 |
| Partially inspected | 0 |
| Entirely uninspected | 0 |

### Ledger Exceptions

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| reference_missing | `SKILL.md:30-30` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:31-31` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:34-34` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:58-58` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| completed | `` |  |
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |

## Metadata

- **Executable Scripts:** No

*Generated by SkillSpector v2.12.0*

--- fetch-tweet ---

# SkillSpector Security Report

**Skill:** fetch-tweet  
**Source:** `/scan/skills/fetch-tweet`  
**Scanned:** 2026-10-02 08:42:16 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 8/100 |
| Severity | LOW |
| Recommendation | CAUTION |

## Components (1)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `SKILL.md` | markdown | 91 | No |

## Issues (7)

### 🟡 MEDIUM: E1

**Location:** `SKILL.md:26`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary. Remove or replace with documented APIs. Ensure no secrets, tokens, or PII are transmitted.

---

### 🟡 MEDIUM: E1

**Location:** `SKILL.md:27`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary. Remove or replace with documented APIs. Ensure no secrets, tokens, or PII are transmitted.

---

### 🟡 MEDIUM: E1

**Location:** `SKILL.md:28`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary. Remove or replace with documented APIs. Ensure no secrets, tokens, or PII are transmitted.

---

### 🟡 MEDIUM: E1

**Location:** `SKILL.md:29`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary. Remove or replace with documented APIs. Ensure no secrets, tokens, or PII are transmitted.

---

### 🟡 MEDIUM: E1

**Location:** `SKILL.md:31`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary. Remove or replace with documented APIs. Ensure no secrets, tokens, or PII are transmitted.

---

### 🟡 MEDIUM: E1

**Location:** `SKILL.md:38`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary. Remove or replace with documented APIs. Ensure no secrets, tokens, or PII are transmitted.

---

### 🟡 MEDIUM: E1

**Location:** `SKILL.md:74`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary. Remove or replace with documented APIs. Ensure no secrets, tokens, or PII are transmitted.

---

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | partial |
| Coverage | 100.0% |
| Fully inspected | 1 |
| Partially inspected | 0 |
| Entirely uninspected | 0 |

### Ledger Exceptions

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| reference_missing | `SKILL.md:18-18` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| completed | `` |  |
| completed | `` |  |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |

## Metadata

- **Executable Scripts:** No

*Generated by SkillSpector v2.12.0*

--- game-3d-assets ---

# SkillSpector Security Report

**Skill:** game-3d-assets  
**Source:** `/scan/skills/game-3d-assets`  
**Scanned:** 2026-10-02 08:42:17 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 26/100 |
| Severity | MEDIUM |
| Recommendation | CAUTION |

## Components (1)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `SKILL.md` | markdown | 457 | No |

## Issues (6)

### 🔴 HIGH: PE3

**Location:** `SKILL.md:34`  
**Confidence:** 60%  

**Message:** Credential Access

**Remediation:** Remove references to credential paths. Use environment variables or secrets managers. For docs, use placeholder paths (e.g., /path/to/config). Never load .env or token files in production code paths.

---

### 🔴 HIGH: PE3

**Location:** `SKILL.md:34`  
**Confidence:** 60%  

**Message:** Credential Access

**Remediation:** Remove references to credential paths. Use environment variables or secrets managers. For docs, use placeholder paths (e.g., /path/to/config). Never load .env or token files in production code paths.

---

### 🔴 HIGH: PE3

**Location:** `SKILL.md:45`  
**Confidence:** 60%  

**Message:** Credential Access

**Remediation:** Remove references to credential paths. Use environment variables or secrets managers. For docs, use placeholder paths (e.g., /path/to/config). Never load .env or token files in production code paths.

---

### 🔴 HIGH: PE3

**Location:** `SKILL.md:150`  
**Confidence:** 60%  

**Message:** Credential Access

**Remediation:** Remove references to credential paths. Use environment variables or secrets managers. For docs, use placeholder paths (e.g., /path/to/config). Never load .env or token files in production code paths.

---

### 🔴 HIGH: PE3

**Location:** `SKILL.md:150`  
**Confidence:** 60%  

**Message:** Credential Access

**Remediation:** Remove references to credential paths. Use environment variables or secrets managers. For docs, use placeholder paths (e.g., /path/to/config). Never load .env or token files in production code paths.

---

### 🔴 HIGH: PE3

**Location:** `SKILL.md:161`  
**Confidence:** 60%  

**Message:** Credential Access

**Remediation:** Remove references to credential paths. Use environment variables or secrets managers. For docs, use placeholder paths (e.g., /path/to/config). Never load .env or token files in production code paths.

---

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | partial |
| Coverage | 0.0% |
| Fully inspected | 0 |
| Partially inspected | 1 |
| Entirely uninspected | 0 |

### Ledger Exceptions

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| static_parse_limit | `SKILL.md` | A security-relevant expression exceeded a bounded static parser's span limit. |
| reference_missing | `SKILL.md:49-49` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:91-91` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:98-98` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:116-116` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:123-123` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:132-132` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:134-134` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:136-136` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:163-163` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:167-167` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:170-170` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:171-171` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:172-172` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:177-177` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:181-181` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:182-182` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:183-183` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:235-235` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:253-253` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:329-329` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:343-343` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:355-355` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:368-368` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:374-374` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:381-381` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:386-386` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:396-396` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:401-401` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:406-406` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:407-407` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:421-421` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:429-429` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:437-437` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:448-448` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| completed | `` |  |
| completed | `` |  |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| degraded | `` |  |
| completed | `` |  |

### Limitations

- Analyzer static_patterns_tool_misuse status: degraded.

## Metadata

- **Executable Scripts:** No

*Generated by SkillSpector v2.12.0*

--- game-architecture ---

# SkillSpector Security Report

**Skill:** game-architecture  
**Source:** `/scan/skills/game-architecture`  
**Scanned:** 2026-10-02 08:42:18 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 0/100 |
| Severity | LOW |
| Recommendation | CAUTION |

## Components (2)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `SKILL.md` | markdown | 131 | No |
| `system-patterns.md` | markdown | 132 | No |

## Issues (0)

No security issues detected.

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | partial |
| Coverage | 50.0% |
| Fully inspected | 1 |
| Partially inspected | 1 |
| Entirely uninspected | 0 |

### Ledger Exceptions

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| static_parse_limit | `SKILL.md` | A security-relevant expression exceeded a bounded static parser's span limit. |
| reference_missing | `SKILL.md:29-29` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:31-31` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| completed | `` |  |
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| degraded | `` |  |
| completed | `` |  |

### Limitations

- Analyzer static_patterns_tool_misuse status: degraded.

## Metadata

- **Executable Scripts:** No

*Generated by SkillSpector v2.12.0*

--- game-assets ---

# SkillSpector Security Report

**Skill:** game-assets  
**Source:** `/scan/skills/game-assets`  
**Scanned:** 2026-10-02 08:42:20 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 37/100 |
| Severity | MEDIUM |
| Recommendation | CAUTION |

## Components (5)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `SKILL.md` | markdown | 180 | No |
| `character-pipeline.md` | markdown | 286 | No |
| `integration-patterns.md` | markdown | 165 | No |
| `pixel-renderer.md` | markdown | 156 | No |
| `sprite-catalog.md` | markdown | 401 | No |

## Issues (2)

### 🔴 HIGH: AE1

**Location:** `SKILL.md:29`  
**Confidence:** 100%  

**Message:** Referenced artifact was not completely inspected

**Remediation:** Review the reported expression and analyzer's parsing limitation; correct the scanner if it misinterprets valid source, then rerun the scan. Keep required references; incomplete analysis is not proof of malicious evasion.

**Evidence:**
- **reasons:** `[{'reason_code': 'static_parse_limit', 'message': "A security-relevant expression exceeded a bounded static parser's span limit.", 'phase': 'static', 'analyzers': ['static_patterns_tool_misuse']}]`
- **target_disposition:** `partial`
- **target_path:** `integration-patterns.md`

---

### 🔴 HIGH: AE1

**Location:** `SKILL.md:64`  
**Confidence:** 100%  

**Message:** Referenced artifact was not completely inspected

**Remediation:** Review the reported expression and analyzer's parsing limitation; correct the scanner if it misinterprets valid source, then rerun the scan. Keep required references; incomplete analysis is not proof of malicious evasion.

**Evidence:**
- **reasons:** `[{'reason_code': 'static_parse_limit', 'message': "A security-relevant expression exceeded a bounded static parser's span limit.", 'phase': 'static', 'analyzers': ['static_patterns_tool_misuse']}]`
- **target_disposition:** `partial`
- **target_path:** `integration-patterns.md`

---

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | partial |
| Coverage | 80.0% |
| Fully inspected | 4 |
| Partially inspected | 1 |
| Entirely uninspected | 0 |

### Ledger Exceptions

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| reference_missing | `SKILL.md:114-114` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:124-124` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:125-125` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:147-147` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:148-148` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:150-150` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:167-167` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:168-168` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| static_parse_limit | `integration-patterns.md` | A security-relevant expression exceeded a bounded static parser's span limit. |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| completed | `` |  |
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| completed | `` |  |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| degraded | `` |  |
| completed | `` |  |

### Limitations

- Analyzer static_patterns_tool_misuse status: degraded.

## Metadata

- **Executable Scripts:** No

*Generated by SkillSpector v2.12.0*

--- game-audio ---

# SkillSpector Security Report

**Skill:** game-audio  
**Source:** `/scan/skills/game-audio`  
**Scanned:** 2026-10-02 08:42:22 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 0/100 |
| Severity | LOW |
| Recommendation | CAUTION |

## Components (7)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `SKILL.md` | markdown | 178 | No |
| `bgm-patterns.md` | markdown | 257 | No |
| `mixing-guide.md` | markdown | 41 | No |
| `mute-button.md` | markdown | 88 | No |
| `sequencer-pattern.md` | markdown | 126 | No |
| `sfx-engine.md` | markdown | 135 | No |
| `strudel-reference.md` | markdown | 110 | No |

## Issues (0)

No security issues detected.

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | partial |
| Coverage | 100.0% |
| Fully inspected | 7 |
| Partially inspected | 0 |
| Entirely uninspected | 0 |

### Ledger Exceptions

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| reference_missing | `SKILL.md:124-124` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:125-125` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:126-126` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:149-149` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:150-150` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:151-151` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:152-152` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:153-153` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| completed | `` |  |
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |

## Metadata

- **Executable Scripts:** No

*Generated by SkillSpector v2.12.0*

--- game-deploy ---

# SkillSpector Security Report

**Skill:** game-deploy  
**Source:** `/scan/skills/game-deploy`  
**Scanned:** 2026-10-02 08:42:22 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 76/100 |
| Severity | HIGH |
| Recommendation | DO NOT INSTALL |

## Components (1)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `SKILL.md` | markdown | 229 | No |

## Issues (14)

### 🔴 HIGH: PE3

**Location:** `SKILL.md:66`  
**Confidence:** 60%  

**Message:** Credential Access

**Remediation:** Remove references to credential paths. Use environment variables or secrets managers. For docs, use placeholder paths (e.g., /path/to/config). Never load .env or token files in production code paths.

---

### 🔴 HIGH: PE3

**Location:** `SKILL.md:66`  
**Confidence:** 60%  

**Message:** Credential Access

**Remediation:** Remove references to credential paths. Use environment variables or secrets managers. For docs, use placeholder paths (e.g., /path/to/config). Never load .env or token files in production code paths.

---

### 🔴 HIGH: PE3

**Location:** `SKILL.md:73`  
**Confidence:** 60%  

**Message:** Credential Access

**Remediation:** Remove references to credential paths. Use environment variables or secrets managers. For docs, use placeholder paths (e.g., /path/to/config). Never load .env or token files in production code paths.

---

### 🔴 HIGH: PE3

**Location:** `SKILL.md:74`  
**Confidence:** 60%  

**Message:** Credential Access

**Remediation:** Remove references to credential paths. Use environment variables or secrets managers. For docs, use placeholder paths (e.g., /path/to/config). Never load .env or token files in production code paths.

---

### 🔴 HIGH: TM1

**Location:** `SKILL.md:220`  
**Confidence:** 70%  

**Message:** Tool Parameter Abuse

**Remediation:** Validate all tool parameters against an allowlist. Reject dangerous parameter values (shell=True, --force, -rf /) and use safe defaults.

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:21`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx skills'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: E1

**Location:** `SKILL.md:71`  
**Confidence:** 60%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary. Remove or replace with documented APIs. Ensure no secrets, tokens, or PII are transmitted.

---

### 🟡 MEDIUM: PE2

**Location:** `SKILL.md:74`  
**Confidence:** 80%  

**Message:** Sudo/Root Execution

**Remediation:** Avoid sudo/root unless strictly required. Prefer least-privilege patterns. If elevation is needed, document the justification and scope.

---

### 🟡 MEDIUM: RA2

**Location:** `SKILL.md:74`  
**Confidence:** 60%  

**Message:** Session Persistence

**Remediation:** Remove any persistence mechanisms (cron jobs, startup scripts, state files). Skills should not maintain state across sessions without explicit user consent.

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:119`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx gh-pages'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:144`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx gh-pages'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:158`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx gh-pages'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:181`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx vercel'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:208`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx here.now'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | partial |
| Coverage | 100.0% |
| Fully inspected | 1 |
| Partially inspected | 0 |
| Entirely uninspected | 0 |

### Ledger Exceptions

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| reference_missing | `SKILL.md:83-83` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:87-87` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:130-130` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:153-153` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:212-212` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:216-216` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:226-226` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:229-229` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| completed | `` |  |
| completed | `` |  |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |

## Metadata

- **Executable Scripts:** No

*Generated by SkillSpector v2.12.0*

--- game-designer ---

# SkillSpector Security Report

**Skill:** game-designer  
**Source:** `/scan/skills/game-designer`  
**Scanned:** 2026-10-02 08:42:23 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 0/100 |
| Severity | LOW |
| Recommendation | CAUTION |

## Components (2)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `SKILL.md` | markdown | 283 | No |
| `visual-catalog.md` | markdown | 219 | No |

## Issues (0)

No security issues detected.

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | partial |
| Coverage | 100.0% |
| Fully inspected | 2 |
| Partially inspected | 0 |
| Entirely uninspected | 0 |

### Ledger Exceptions

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| reference_missing | `SKILL.md:58-58` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:68-68` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:69-69` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:89-89` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:106-106` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:110-110` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:112-112` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:130-130` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:169-169` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:180-180` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:188-188` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:221-221` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:257-257` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| completed | `` |  |
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |

## Metadata

- **Executable Scripts:** No

*Generated by SkillSpector v2.12.0*

--- game-qa ---

# SkillSpector Security Report

**Skill:** game-qa  
**Source:** `/scan/skills/game-qa`  
**Scanned:** 2026-10-02 08:42:25 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 12/100 |
| Severity | LOW |
| Recommendation | CAUTION |

## Components (8)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `SKILL.md` | markdown | 230 | No |
| `clock-control.md` | markdown | 42 | No |
| `gameplay-invariants.md` | markdown | 226 | No |
| `iterate-client.md` | markdown | 75 | No |
| `mobile-tests.md` | markdown | 48 | No |
| `playwright-mcp.md` | markdown | 64 | No |
| `test-patterns.md` | markdown | 111 | No |
| `visual-regression.md` | markdown | 135 | No |

## Issues (7)

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:49`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx playwright'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:57`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx playwright'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:58`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx playwright'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:59`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx playwright'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:60`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx playwright'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:212`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx playwright'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `playwright-mcp.md:10`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx @playwright/mcp'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | partial |
| Coverage | 100.0% |
| Fully inspected | 8 |
| Partially inspected | 0 |
| Entirely uninspected | 0 |

### Ledger Exceptions

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| reference_missing | `SKILL.md:52-52` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:87-87` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:125-125` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:130-130` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:202-202` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:213-213` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:214-214` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:215-215` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:216-216` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:218-218` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:219-219` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:220-220` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| completed | `` |  |
| completed | `` |  |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |

## Metadata

- **Executable Scripts:** No

*Generated by SkillSpector v2.12.0*

--- improve-game ---

# SkillSpector Security Report

**Skill:** improve-game  
**Source:** `/scan/skills/improve-game`  
**Scanned:** 2026-10-02 08:42:25 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 0/100 |
| Severity | LOW |
| Recommendation | CAUTION |

## Components (1)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `SKILL.md` | markdown | 185 | No |

## Issues (0)

No security issues detected.

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | partial |
| Coverage | 100.0% |
| Fully inspected | 1 |
| Partially inspected | 0 |
| Entirely uninspected | 0 |

### Ledger Exceptions

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| reference_missing | `SKILL.md:30-30` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:31-31` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:32-32` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:33-33` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:34-34` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:39-39` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:40-40` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:60-60` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:90-90` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:91-91` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:92-92` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:94-94` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:144-144` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:148-148` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| completed | `` |  |
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |

## Metadata

- **Executable Scripts:** No

*Generated by SkillSpector v2.12.0*

--- make-game ---

# SkillSpector Security Report

**Skill:** make-game  
**Source:** `/scan/skills/make-game`  
**Scanned:** 2026-10-02 08:42:32 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 24/100 |
| Severity | MEDIUM |
| Recommendation | CAUTION |

## Components (24)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `SKILL.md` | markdown | 259 | Yes |
| `phase-pipelines/development.md` | markdown | 161 | Yes |
| `phase-pipelines/idea.md` | markdown | 90 | Yes |
| `phase-pipelines/scaffold.md` | markdown | 114 | Yes |
| `sub-pipelines/README.md` | markdown | 39 | Yes |
| `sub-pipelines/agents-bootstrap.md` | markdown | 66 | No |
| `sub-pipelines/asset-pipeline.md` | markdown | 45 | Yes |
| `sub-pipelines/bug-fix.md` | markdown | 36 | Yes |
| `sub-pipelines/doc-drift-audit.md` | markdown | 47 | Yes |
| `sub-pipelines/live-iterate.md` | markdown | 59 | No |
| `sub-pipelines/milestone-planning.md` | markdown | 153 | No |
| `sub-pipelines/playtest-repro.md` | markdown | 36 | Yes |
| `sub-pipelines/scope-triage.md` | markdown | 118 | No |
| `sub-pipelines/session-start.md` | markdown | 41 | Yes |
| `sub-pipelines/state-machine.md` | markdown | 38 | Yes |
| `templates/README.md` | markdown | 24 | Yes |
| `templates/adr.md` | markdown | 36 | Yes |
| `templates/agents.md` | markdown | 107 | No |
| `templates/backlog.md` | markdown | 42 | No |
| `templates/gameplan.md` | markdown | 41 | Yes |
| `templates/milestone.md` | markdown | 42 | Yes |
| `templates/state.md` | markdown | 31 | Yes |
| `templates/tech.md` | markdown | 36 | Yes |
| `useful-skills.md` | markdown | 121 | No |

## Issues (5)

### 🟡 MEDIUM: RP1

**Location:** `phase-pipelines/scaffold.md:59`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx @phaserjs/create-game'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: EA2

**Location:** `sub-pipelines/asset-pipeline.md:44`  
**Confidence:** 75%  

**Message:** Autonomous Decision Making

**Remediation:** Add human-in-the-loop confirmation for destructive, irreversible, or high-impact operations. Never auto-execute commands that modify files, send data, or alter system state.

---

### 🟡 MEDIUM: RP1

**Location:** `templates/agents.md:27`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx skills'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `useful-skills.md:9`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx skills'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `useful-skills.md:12`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx skills'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | partial |
| Coverage | 100.0% |
| Fully inspected | 24 |
| Partially inspected | 0 |
| Entirely uninspected | 0 |

### Ledger Exceptions

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| reference_missing | `SKILL.md:6-6` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:21-21` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:28-28` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:42-42` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:43-43` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:49-49` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:50-50` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:53-53` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:54-54` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:55-55` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:56-56` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:64-64` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:65-65` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:83-83` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:84-84` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:85-85` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:102-102` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:153-153` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:165-165` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:195-195` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:214-214` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:226-226` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:228-228` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:234-234` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:241-241` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:243-243` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:247-247` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |

## Metadata

- **Executable Scripts:** Yes

*Generated by SkillSpector v2.12.0*

--- meshyai ---

# SkillSpector Security Report

**Skill:** meshyai  
**Source:** `/scan/skills/meshyai`  
**Scanned:** 2026-10-02 08:42:33 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 68/100 |
| Severity | HIGH |
| Recommendation | DO NOT INSTALL |

## Components (4)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `SKILL.md` | markdown | 305 | No |
| `api-reference.md` | markdown | 120 | No |
| `rigging-pipeline.md` | markdown | 75 | No |
| `verification-patterns.md` | markdown | 63 | No |

## Issues (6)

### 🔴 HIGH: AE1

**Location:** `SKILL.md:30`  
**Confidence:** 100%  

**Message:** Referenced artifact was not completely inspected

**Remediation:** Review the reported expression and analyzer's parsing limitation; correct the scanner if it misinterprets valid source, then rerun the scan. Keep required references; incomplete analysis is not proof of malicious evasion.

**Evidence:**
- **reasons:** `[{'reason_code': 'static_parse_limit', 'message': "A security-relevant expression exceeded a bounded static parser's span limit.", 'phase': 'static', 'analyzers': ['static_patterns_tool_misuse']}]`
- **target_disposition:** `partial`
- **target_path:** `verification-patterns.md`

---

### 🔴 HIGH: AE1

**Location:** `SKILL.md:238`  
**Confidence:** 100%  

**Message:** Referenced artifact was not completely inspected

**Remediation:** Review the reported expression and analyzer's parsing limitation; correct the scanner if it misinterprets valid source, then rerun the scan. Keep required references; incomplete analysis is not proof of malicious evasion.

**Evidence:**
- **reasons:** `[{'reason_code': 'static_parse_limit', 'message': "A security-relevant expression exceeded a bounded static parser's span limit.", 'phase': 'static', 'analyzers': ['static_patterns_tool_misuse']}]`
- **target_disposition:** `partial`
- **target_path:** `verification-patterns.md`

---

### 🔴 HIGH: PE3

**Location:** `SKILL.md:55`  
**Confidence:** 60%  

**Message:** Credential Access

**Remediation:** Remove references to credential paths. Use environment variables or secrets managers. For docs, use placeholder paths (e.g., /path/to/config). Never load .env or token files in production code paths.

---

### 🔴 HIGH: PE3

**Location:** `SKILL.md:55`  
**Confidence:** 60%  

**Message:** Credential Access

**Remediation:** Remove references to credential paths. Use environment variables or secrets managers. For docs, use placeholder paths (e.g., /path/to/config). Never load .env or token files in production code paths.

---

### 🔴 HIGH: PE3

**Location:** `SKILL.md:66`  
**Confidence:** 60%  

**Message:** Credential Access

**Remediation:** Remove references to credential paths. Use environment variables or secrets managers. For docs, use placeholder paths (e.g., /path/to/config). Never load .env or token files in production code paths.

---

### 🟡 MEDIUM: E1

**Location:** `api-reference.md:3`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary. Remove or replace with documented APIs. Ensure no secrets, tokens, or PII are transmitted.

---

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | partial |
| Coverage | 75.0% |
| Fully inspected | 3 |
| Partially inspected | 1 |
| Entirely uninspected | 0 |

### Ledger Exceptions

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| reference_missing | `SKILL.md:47-47` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:70-70` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:74-74` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:84-84` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:91-91` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:99-99` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:115-115` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:122-122` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:124-124` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:134-134` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:143-143` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:144-144` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:145-145` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:156-156` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:169-169` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:180-180` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:186-186` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:192-192` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:200-200` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:204-204` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:209-209` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:214-214` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:227-227` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:232-232` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:280-280` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:300-300` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:304-304` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| static_parse_limit | `verification-patterns.md` | A security-relevant expression exceeded a bounded static parser's span limit. |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| completed | `` |  |
| completed | `` |  |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| degraded | `` |  |
| completed | `` |  |

### Limitations

- Analyzer static_patterns_tool_misuse status: degraded.

## Metadata

- **Executable Scripts:** No

*Generated by SkillSpector v2.12.0*

--- monetize-game ---

# SkillSpector Security Report

**Skill:** monetize-game  
**Source:** `/scan/skills/monetize-game`  
**Scanned:** 2026-10-02 08:42:33 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 12/100 |
| Severity | LOW |
| Recommendation | CAUTION |

## Components (1)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `SKILL.md` | markdown | 351 | No |

## Issues (2)

### 🟡 MEDIUM: E1

**Location:** `SKILL.md:112`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary. Remove or replace with documented APIs. Ensure no secrets, tokens, or PII are transmitted.

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:285`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx gh-pages'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | partial |
| Coverage | 0.0% |
| Fully inspected | 0 |
| Partially inspected | 1 |
| Entirely uninspected | 0 |

### Ledger Exceptions

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| static_parse_limit | `SKILL.md` | A security-relevant expression exceeded a bounded static parser's span limit. |
| reference_missing | `SKILL.md:33-33` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:35-35` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:42-42` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:54-54` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:68-68` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:76-76` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:85-85` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:96-96` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:108-108` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:144-144` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:149-149` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:165-165` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:170-170` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:174-174` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:238-238` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:246-246` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:249-249` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:264-264` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:321-321` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:334-334` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:343-343` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:349-349` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| completed | `` |  |
| completed | `` |  |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| degraded | `` |  |
| completed | `` |  |

### Limitations

- Analyzer static_patterns_tool_misuse status: degraded.

## Metadata

- **Executable Scripts:** No

*Generated by SkillSpector v2.12.0*

--- phaser ---

# SkillSpector Security Report

**Skill:** phaser  
**Source:** `/scan/skills/phaser`  
**Scanned:** 2026-10-02 08:42:39 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 55/100 |
| Severity | HIGH |
| Recommendation | DO NOT INSTALL |

## Components (11)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `SKILL.md` | markdown | 325 | No |
| `assets-and-performance.md` | markdown | 168 | No |
| `conventions.md` | markdown | 222 | No |
| `examples/complex-game.md` | markdown | 519 | No |
| `examples/simple-game.md` | markdown | 208 | No |
| `game-objects.md` | markdown | 280 | No |
| `no-asset-design.md` | markdown | 729 | No |
| `patterns.md` | markdown | 259 | No |
| `physics-and-movement.md` | markdown | 235 | No |
| `project-setup.md` | markdown | 237 | No |
| `scenes-and-lifecycle.md` | markdown | 177 | No |

## Issues (4)

### 🔴 HIGH: AE1

**Location:** `SKILL.md:325`  
**Confidence:** 100%  

**Message:** Referenced artifact was not completely inspected

**Remediation:** Review the reported expression and analyzer's parsing limitation; correct the scanner if it misinterprets valid source, then rerun the scan. Keep required references; incomplete analysis is not proof of malicious evasion.

**Evidence:**
- **reasons:** `[{'reason_code': 'static_parse_limit', 'message': "A security-relevant expression exceeded a bounded static parser's span limit.", 'phase': 'static', 'analyzers': ['static_patterns_tool_misuse']}]`
- **target_disposition:** `partial`
- **target_path:** `no-asset-design.md`

---

### 🔴 HIGH: MP3

**Location:** `scenes-and-lifecycle.md:12`  
**Confidence:** 80%  

**Message:** Memory Manipulation

**Remediation:** Protect agent memory and state from modification by untrusted content. Use read-only memory for critical instructions and validate all state changes.

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:62`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx degit'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `project-setup.md:6`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx degit'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | partial |
| Coverage | 90.9% |
| Fully inspected | 10 |
| Partially inspected | 1 |
| Entirely uninspected | 0 |

### Ledger Exceptions

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| reference_missing | `SKILL.md:108-108` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:111-111` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:113-113` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:116-116` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:157-157` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:158-158` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:159-159` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:257-257` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:269-269` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:285-285` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:302-302` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| static_parse_limit | `no-asset-design.md` | A security-relevant expression exceeded a bounded static parser's span limit. |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| completed | `` |  |
| completed | `` |  |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| degraded | `` |  |
| completed | `` |  |

### Limitations

- Analyzer static_patterns_tool_misuse status: degraded.

## Metadata

- **Executable Scripts:** No

*Generated by SkillSpector v2.12.0*

--- promo-video ---

# SkillSpector Security Report

**Skill:** promo-video  
**Source:** `/scan/skills/promo-video`  
**Scanned:** 2026-10-02 08:42:40 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 10/100 |
| Severity | LOW |
| Recommendation | CAUTION |

## Components (2)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `SKILL.md` | markdown | 395 | No |
| `scripts/convert-highfps.sh` | shell | 40 | Yes |

## Issues (2)

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:36`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx playwright'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:43`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx playwright'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | partial |
| Coverage | 50.0% |
| Fully inspected | 1 |
| Partially inspected | 1 |
| Entirely uninspected | 0 |

### Ledger Exceptions

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| static_parse_limit | `SKILL.md` | A security-relevant expression exceeded a bounded static parser's span limit. |
| reference_missing | `SKILL.md:29-29` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:51-51` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:55-55` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:164-164` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:165-165` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:166-166` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:202-202` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:336-336` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:343-343` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| degraded | `` |  |
| completed | `` |  |

### Limitations

- Analyzer static_patterns_tool_misuse status: degraded.

## Metadata

- **Executable Scripts:** Yes

*Generated by SkillSpector v2.12.0*

--- qa-game ---

# SkillSpector Security Report

**Skill:** qa-game  
**Source:** `/scan/skills/qa-game`  
**Scanned:** 2026-10-02 08:42:40 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 12/100 |
| Severity | LOW |
| Recommendation | CAUTION |

## Components (1)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `SKILL.md` | markdown | 141 | No |

## Issues (3)

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:35`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx playwright'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:113`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx playwright'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:114`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx playwright'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | partial |
| Coverage | 100.0% |
| Fully inspected | 1 |
| Partially inspected | 0 |
| Entirely uninspected | 0 |

### Ledger Exceptions

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| reference_missing | `SKILL.md:24-24` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:25-25` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:26-26` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:27-27` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:28-28` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:29-29` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:31-31` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:36-36` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:37-37` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:68-68` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:70-70` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:85-85` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:98-98` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:99-99` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| completed | `` |  |
| completed | `` |  |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |

## Metadata

- **Executable Scripts:** No

*Generated by SkillSpector v2.12.0*

--- quick-game ---

# SkillSpector Security Report

**Skill:** quick-game  
**Source:** `/scan/skills/quick-game`  
**Scanned:** 2026-10-02 08:42:41 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 0/100 |
| Severity | LOW |
| Recommendation | CAUTION |

## Components (1)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `SKILL.md` | markdown | 146 | No |

## Issues (0)

No security issues detected.

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | partial |
| Coverage | 100.0% |
| Fully inspected | 1 |
| Partially inspected | 0 |
| Entirely uninspected | 0 |

### Ledger Exceptions

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| reference_missing | `SKILL.md:63-63` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:93-93` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:131-131` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| completed | `` |  |
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |

## Metadata

- **Executable Scripts:** No

*Generated by SkillSpector v2.12.0*

--- record-promo ---

# SkillSpector Security Report

**Skill:** record-promo  
**Source:** `/scan/skills/record-promo`  
**Scanned:** 2026-10-02 08:42:41 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 16/100 |
| Severity | LOW |
| Recommendation | CAUTION |

## Components (1)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `SKILL.md` | markdown | 80 | No |

## Issues (2)

### 🟡 MEDIUM: E1

**Location:** `SKILL.md:23`  
**Confidence:** 60%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary. Remove or replace with documented APIs. Ensure no secrets, tokens, or PII are transmitted.

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:24`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx playwright'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | partial |
| Coverage | 100.0% |
| Fully inspected | 1 |
| Partially inspected | 0 |
| Entirely uninspected | 0 |

### Ledger Exceptions

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| reference_missing | `SKILL.md:32-32` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:33-33` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:34-34` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:35-35` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:37-37` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:55-55` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:56-56` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:63-63` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:73-73` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:78-78` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| completed | `` |  |
| completed | `` |  |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |

## Metadata

- **Executable Scripts:** No

*Generated by SkillSpector v2.12.0*

--- retrodiffusion ---

# SkillSpector Security Report

**Skill:** retrodiffusion  
**Source:** `/scan/skills/retrodiffusion`  
**Scanned:** 2026-10-02 08:42:42 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 27/100 |
| Severity | MEDIUM |
| Recommendation | CAUTION |

## Components (2)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `SKILL.md` | markdown | 294 | No |
| `api-reference.md` | markdown | 214 | No |

## Issues (3)

### 🔴 HIGH: PE3

**Location:** `SKILL.md:40`  
**Confidence:** 60%  

**Message:** Credential Access

**Remediation:** Remove references to credential paths. Use environment variables or secrets managers. For docs, use placeholder paths (e.g., /path/to/config). Never load .env or token files in production code paths.

---

### 🔴 HIGH: PE3

**Location:** `SKILL.md:40`  
**Confidence:** 60%  

**Message:** Credential Access

**Remediation:** Remove references to credential paths. Use environment variables or secrets managers. For docs, use placeholder paths (e.g., /path/to/config). Never load .env or token files in production code paths.

---

### 🟡 MEDIUM: E1

**Location:** `api-reference.md:8`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary. Remove or replace with documented APIs. Ensure no secrets, tokens, or PII are transmitted.

---

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | partial |
| Coverage | 100.0% |
| Fully inspected | 2 |
| Partially inspected | 0 |
| Entirely uninspected | 0 |

### Ledger Exceptions

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| reference_missing | `SKILL.md:59-59` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:63-63` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:71-71` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:79-79` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:87-87` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:94-94` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:101-101` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:108-108` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:110-110` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:123-123` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:131-131` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:132-132` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:143-143` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:151-151` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:161-161` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:162-162` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:170-170` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:208-208` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:209-209` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:241-241` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:266-266` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:291-291` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| completed | `` |  |
| completed | `` |  |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |

## Metadata

- **Executable Scripts:** No

*Generated by SkillSpector v2.12.0*

--- review-game ---

# SkillSpector Security Report

**Skill:** review-game  
**Source:** `/scan/skills/review-game`  
**Scanned:** 2026-10-02 08:42:42 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 0/100 |
| Severity | LOW |
| Recommendation | CAUTION |

## Components (1)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `SKILL.md` | markdown | 102 | No |

## Issues (0)

No security issues detected.

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | partial |
| Coverage | 100.0% |
| Fully inspected | 1 |
| Partially inspected | 0 |
| Entirely uninspected | 0 |

### Ledger Exceptions

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| reference_missing | `SKILL.md:29-29` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| completed | `` |  |
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |

## Metadata

- **Executable Scripts:** No

*Generated by SkillSpector v2.12.0*

--- scaffold-gateables ---

# SkillSpector Security Report

**Skill:** scaffold-gateables  
**Source:** `/scan/skills/scaffold-gateables`  
**Scanned:** 2026-10-02 08:42:43 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 0/100 |
| Severity | LOW |
| Recommendation | CAUTION |

## Components (1)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `SKILL.md` | markdown | 202 | No |

## Issues (0)

No security issues detected.

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | partial |
| Coverage | 0.0% |
| Fully inspected | 0 |
| Partially inspected | 1 |
| Entirely uninspected | 0 |

### Ledger Exceptions

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| static_parse_limit | `SKILL.md` | A security-relevant expression exceeded a bounded static parser's span limit. |
| reference_missing | `SKILL.md:56-56` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:57-57` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:58-58` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:59-59` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:86-86` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:89-89` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:101-101` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:103-103` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:105-105` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:109-109` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:110-110` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:111-111` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:132-132` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:138-138` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:140-140` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:161-161` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:174-174` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:175-175` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:184-184` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:194-194` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:200-200` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:202-202` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| completed | `` |  |
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| degraded | `` |  |
| completed | `` |  |

### Limitations

- Analyzer static_patterns_tool_misuse status: degraded.

## Metadata

- **Executable Scripts:** No

*Generated by SkillSpector v2.12.0*

--- threejs-game ---

# SkillSpector Security Report

**Skill:** threejs-game  
**Source:** `/scan/skills/threejs-game`  
**Scanned:** 2026-10-02 08:42:55 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 16/100 |
| Severity | LOW |
| Recommendation | CAUTION |

## Components (6)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `SKILL.md` | markdown | 322 | No |
| `core-patterns.md` | markdown | 210 | No |
| `input-patterns.md` | markdown | 120 | No |
| `reference/llms-full.txt` | text | 2716 | No |
| `reference/llms.txt` | text | 158 | No |
| `tsl-guide.md` | markdown | 43 | No |

## Issues (2)

### 🟡 MEDIUM: AS3

**Location:** `SKILL.md:32`  
**Confidence:** 80%  

**Message:** Skill Enumeration

**Remediation:** Remove all code or instructions that list or read other skills' files or directories. Skills should operate independently; cross-skill access is a privilege escalation.

---

### 🟡 MEDIUM: MP2

**Location:** `SKILL.md:119`  
**Confidence:** 85%  

**Message:** Context Window Stuffing

**Remediation:** Implement context-window management that detects and rejects padding or stuffing attempts. Prioritize system instructions over user-injected content.

---

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | partial |
| Coverage | 100.0% |
| Fully inspected | 6 |
| Partially inspected | 0 |
| Entirely uninspected | 0 |

### Ledger Exceptions

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| reference_missing | `SKILL.md:32-32` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:52-52` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:65-65` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:84-84` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:85-85` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:94-94` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:101-101` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:144-144` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:148-148` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:152-152` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:156-156` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:264-264` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:299-299` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:300-300` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:301-301` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:302-302` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| completed | `` |  |
| completed | `` |  |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |

## Metadata

- **Executable Scripts:** No

*Generated by SkillSpector v2.12.0*

--- threejs-perf ---

# SkillSpector Security Report

**Skill:** threejs-perf  
**Source:** `/scan/skills/threejs-perf`  
**Scanned:** 2026-10-02 08:42:56 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 0/100 |
| Severity | LOW |
| Recommendation | SAFE |

## Components (7)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `SKILL.md` | markdown | 113 | No |
| `instancing-moving.md` | markdown | 154 | No |
| `instancing-static.md` | markdown | 111 | No |
| `templates/moving-entities-baseline.ts` | typescript | 10 | Yes |
| `templates/moving-entities-instanced.ts` | typescript | 16 | Yes |
| `templates/static-world-baseline.ts` | typescript | 13 | Yes |
| `templates/static-world-instanced.ts` | typescript | 20 | Yes |

## Issues (0)

No security issues detected.

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | complete |
| Coverage | 100.0% |
| Fully inspected | 7 |
| Partially inspected | 0 |
| Entirely uninspected | 0 |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |

## Metadata

- **Executable Scripts:** Yes

*Generated by SkillSpector v2.12.0*

--- use-template ---

# SkillSpector Security Report

**Skill:** use-template  
**Source:** `/scan/skills/use-template`  
**Scanned:** 2026-10-02 08:42:57 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 0/100 |
| Severity | LOW |
| Recommendation | CAUTION |

## Components (1)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `SKILL.md` | markdown | 162 | No |

## Issues (0)

No security issues detected.

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | partial |
| Coverage | 100.0% |
| Fully inspected | 1 |
| Partially inspected | 0 |
| Entirely uninspected | 0 |

### Ledger Exceptions

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| reference_missing | `SKILL.md:19-19` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:22-22` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:34-34` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:39-39` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:40-40` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:59-59` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:63-63` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:70-70` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:78-78` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:98-98` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:114-114` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:122-122` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:156-156` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:158-158` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:162-162` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| completed | `` |  |
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |

## Metadata

- **Executable Scripts:** No

*Generated by SkillSpector v2.12.0*

--- viral-game ---

# SkillSpector Security Report

**Skill:** viral-game  
**Source:** `/scan/skills/viral-game`  
**Scanned:** 2026-10-02 08:43:02 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 76/100 |
| Severity | HIGH |
| Recommendation | DO NOT INSTALL |

## Components (4)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `SKILL.md` | markdown | 652 | No |
| `step-details.md` | markdown | 876 | No |
| `tweet-pipeline.md` | markdown | 67 | No |
| `verification-protocol.md` | markdown | 121 | No |

## Issues (22)

### 🔴 HIGH: PE3

**Location:** `SKILL.md:111`  
**Confidence:** 60%  

**Message:** Credential Access

**Remediation:** Remove references to credential paths. Use environment variables or secrets managers. For docs, use placeholder paths (e.g., /path/to/config). Never load .env or token files in production code paths.

---

### 🔴 HIGH: PE3

**Location:** `SKILL.md:115`  
**Confidence:** 60%  

**Message:** Credential Access

**Remediation:** Remove references to credential paths. Use environment variables or secrets managers. For docs, use placeholder paths (e.g., /path/to/config). Never load .env or token files in production code paths.

---

### 🟡 MEDIUM: TR2

**Location:** `SKILL.md:2`  
**Confidence:** 70%  

**Message:** Shadow Command Trigger: description clause 'se when the user wants to design and build a real game project with milestones, ADRs, or multi-session iteration — use `/make-game` for that' conflicts with built-in command 'build'

**Remediation:** Choose triggers that do not conflict with built-in commands or other skills. Prefix with a unique namespace if necessary.

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:54`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx skills'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:266`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx skills'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:270`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx skills'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:406`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx skills'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:638`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx skills'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RA2

**Location:** `SKILL.md:67`  
**Confidence:** 60%  

**Message:** Session Persistence

**Remediation:** Remove any persistence mechanisms (cron jobs, startup scripts, state files). Skills should not maintain state across sessions without explicit user consent.

---

### 🟡 MEDIUM: E1

**Location:** `SKILL.md:320`  
**Confidence:** 60%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary. Remove or replace with documented APIs. Ensure no secrets, tokens, or PII are transmitted.

---

### 🟡 MEDIUM: PE2

**Location:** `SKILL.md:325`  
**Confidence:** 80%  

**Message:** Sudo/Root Execution

**Remediation:** Avoid sudo/root unless strictly required. Prefer least-privilege patterns. If elevation is needed, document the justification and scope.

---

### 🟡 MEDIUM: E1

**Location:** `SKILL.md:452`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary. Remove or replace with documented APIs. Ensure no secrets, tokens, or PII are transmitted.

---

### 🟡 MEDIUM: RP1

**Location:** `SKILL.md:556`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx gh-pages'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `step-details.md:21`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx playwright'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `step-details.md:24`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx playwright'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `step-details.md:820`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx playwright'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `step-details.md:844`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx playwright'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: RP1

**Location:** `step-details.md:845`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx playwright'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

### 🟡 MEDIUM: EA2

**Location:** `step-details.md:240`  
**Confidence:** 80%  

**Message:** Autonomous Decision Making

**Remediation:** Add human-in-the-loop confirmation for destructive, irreversible, or high-impact operations. Never auto-execute commands that modify files, send data, or alter system state.

---

### 🟡 MEDIUM: RA2

**Location:** `step-details.md:244`  
**Confidence:** 60%  

**Message:** Session Persistence

**Remediation:** Remove any persistence mechanisms (cron jobs, startup scripts, state files). Skills should not maintain state across sessions without explicit user consent.

---

### 🟡 MEDIUM: E1

**Location:** `tweet-pipeline.md:11`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary. Remove or replace with documented APIs. Ensure no secrets, tokens, or PII are transmitted.

---

### 🟡 MEDIUM: RP1

**Location:** `verification-protocol.md:9`  
**Confidence:** 70%  

**Message:** MCP server referenced without pinned version: 'npx @playwright/mcp'.

**Remediation:** Pin the version: npx @scope/server@1.2.3

---

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | partial |
| Coverage | 75.0% |
| Fully inspected | 3 |
| Partially inspected | 1 |
| Entirely uninspected | 0 |

### Ledger Exceptions

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| static_parse_limit | `SKILL.md` | A security-relevant expression exceeded a bounded static parser's span limit. |
| reference_missing | `SKILL.md:8-8` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:159-159` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:278-278` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:282-282` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:342-342` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:404-404` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:422-422` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:430-430` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:450-450` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:480-480` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:487-487` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:496-496` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:499-499` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:500-500` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:542-542` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:545-545` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:607-607` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:625-625` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| completed | `` |  |
| completed | `` |  |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| degraded | `` |  |
| completed | `` |  |

### Limitations

- Analyzer static_patterns_tool_misuse status: degraded.

## Metadata

- **Executable Scripts:** No

*Generated by SkillSpector v2.12.0*

--- worldlabs ---

# SkillSpector Security Report

**Skill:** worldlabs  
**Source:** `/scan/skills/worldlabs`  
**Scanned:** 2026-10-02 08:43:03 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 38/100 |
| Severity | MEDIUM |
| Recommendation | CAUTION |

## Components (1)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `SKILL.md` | markdown | 385 | No |

## Issues (5)

### 🔴 HIGH: PE3

**Location:** `SKILL.md:52`  
**Confidence:** 60%  

**Message:** Credential Access

**Remediation:** Remove references to credential paths. Use environment variables or secrets managers. For docs, use placeholder paths (e.g., /path/to/config). Never load .env or token files in production code paths.

---

### 🔴 HIGH: PE3

**Location:** `SKILL.md:52`  
**Confidence:** 60%  

**Message:** Credential Access

**Remediation:** Remove references to credential paths. Use environment variables or secrets managers. For docs, use placeholder paths (e.g., /path/to/config). Never load .env or token files in production code paths.

---

### 🔴 HIGH: PE3

**Location:** `SKILL.md:63`  
**Confidence:** 60%  

**Message:** Credential Access

**Remediation:** Remove references to credential paths. Use environment variables or secrets managers. For docs, use placeholder paths (e.g., /path/to/config). Never load .env or token files in production code paths.

---

### 🟡 MEDIUM: P4

**Location:** `SKILL.md:25`  
**Confidence:** 70%  

**Message:** Behavior Manipulation

**Remediation:** Review content for implicit steering or bias. Ensure instructions are explicit and align with the skill's stated purpose.

---

### 🟡 MEDIUM: E1

**Location:** `SKILL.md:41`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary. Remove or replace with documented APIs. Ensure no secrets, tokens, or PII are transmitted.

---

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | partial |
| Coverage | 100.0% |
| Fully inspected | 1 |
| Partially inspected | 0 |
| Entirely uninspected | 0 |

### Ledger Exceptions

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| reference_missing | `SKILL.md:47-47` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:71-71` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:76-76` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:77-77` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:81-81` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:85-85` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:89-89` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:116-116` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:139-139` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:140-140` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:141-141` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:153-153` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:175-175` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:239-239` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:278-278` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:279-279` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:281-281` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:283-283` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:338-338` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:343-343` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:351-351` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:359-359` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:373-373` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:377-377` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:380-380` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |
| reference_missing | `SKILL.md:381-381` | A local path-like reference does not match any bundled artifact, such as a file the skill writes at runtime. |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `` |  |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| no_applicable_files | `` | No files matched this analyzer's applicability contract. |
| completed | `` |  |
| completed | `` |  |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| disabled_by_configuration | `` | Analyzer was disabled by the requested configuration. |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |
| completed | `` |  |

## Metadata

- **Executable Scripts:** No

*Generated by SkillSpector v2.12.0*

--- Recursive Risk Assessment ---

Maximum score: 76/100

Severity: HIGH

Recommendation: DO NOT INSTALL

--- Recursive Inspection Completeness ---

Status: partial

- One or more recursive skill scans were incomplete.