# Text formats, identity and reflection: our sketches vs. real practice

Research date: 2026-11-09. Scope: check three sketches (own line-based text format, 64-bit `uid` identity, macro type registry in C) against what shipped engines and tools do, and against 2024–2026 evidence on LLM authors.

Conventions used below:

- Every claim has a source link. A claim marked **unverified** was not confirmed from a primary source in this session (search-result summary, forum post, or page that could not be fetched).
- **Own measurement** / **own calculation** marks numbers produced for this note, not taken from a source.
- **Inference** marks a conclusion drawn by the author of this note from the cited facts.

---

## A. Text formats used by engines, and what they learned

### A.1 Summary table

| Engine / tool | On-disk format for authored data | Comments | Schema / validation | Versioning / migration | Notable lesson |
|---|---|---|---|---|---|
| Godot `.tscn` / `.tres` | Own text format: `[section key=value]` headings + property lines | `;` comments are allowed but **discarded when the editor saves** | Types come from ClassDB; no external schema file | `format=3` header (Godot 4.x), `format=2` (3.x) | Counters and positional ids cause diff noise; defaults are omitted |
| Unity scenes / prefabs / `.meta` | "Custom subset of YAML", one YAML document per object | Not documented | Class id in the document header (`!u!1`) | Renamed fields via `FormerlySerializedAs` | Needed its own semantic merge tool |
| Unreal | Binary `.uasset`; text only for `.ini` config and CSV/JSON import into DataTables | `;` in `.ini` | Row struct in C++ defines the DataTable columns | Engine version + per-system custom versions + Core Redirects | Text assets were tried and are still not supported |
| Bevy | RON world serialization; BSN (own Rust-like notation) is replacing scenes | Planned for BSN files | Reflect type registry; keys are Rust type paths | Not covered in docs | Moving **away** from a generic format to an own notation |
| O3DE | JSON for prefabs and most new data; JSON Patch for overrides | No (plain JSON) | SerializeContext reflection | Per-class `Version(n, converter)`, `NameChange`, `TypeChange` | Defaults omitted; unknown fields ignored with a warning |
| Paradox Clausewitz | Own `key = { ... }` script | `#` | None official; community-written rule files (CWTools) | Not documented | No spec, every object can bend the syntax; tooling had to be reverse-engineered |
| Factorio | Lua tables in a data stage | Lua comments | Engine validates on load; machine-readable JSON of all prototype types is published | JSON rename migrations + Lua migrations, applied once per save | Extra properties are silently ignored |
| Our Machinery | "The Truth": in-memory object/property model is authoritative, disk is a backup | n/a | Types define properties | Property model gives forward/backward compatibility | References by id; merge per property |

Sources for each row are in the sections below.

### A.2 Godot `.tscn` / `.tres`

- Structure: a file descriptor, then `ext_resource`, `sub_resource`, `node`, `connection` sections, "These sections should appear in order." Headings look like `[ext_resource type="Material" uid="uid://c4cp0al3ljsjv" path="res://material.tres" id="1_7bt6s"]`. ([TSCN file format](https://docs.godotengine.org/en/stable/engine_details/file_formats/tscn.html))
- Comments: "A TSCN file may contain single-line comments starting with a semicolon (`;`). However, comments will be discarded when saving the file using the Godot editor." (same page)
- Defaults: "properties equal to the default value are not stored in scene/resource files. It is possible to write them manually, but they will be discarded when saving the file." (same page)
- Format version: files saved by 4.x have `format=3`, 3.x used `format=2`. The `load_steps` counter in the header "is now deprecated and should be ignored if present" (written only before Godot 4.6). (same page) Inference: a derived counter in a header is pure diff and merge noise, and Godot removed it.
- Reference ids inside a file are strings such as `1_7bt6s` or `SphereShape3D_tj6p1`. (same page) The 2021 commit that introduced them reportedly says "Generates pseudo unique IDs, to minimize conflicts when merging, but still user readable (so, not UUID)". **Unverified**: seen only on a [third-party mirror of the commit](https://git.objectionable.solutions/Sara/behaviour-tree-test/src/commit/75755beeee44c6e3807854d7dbb6a192f7183898), not on the official repository.
- Every external reference stores **both** uid and path; the path is kept "for displaying in the editor UI (and as a fallback if the UID reference becomes invalid)". ([UID changes coming to Godot 4.4](https://godotengine.org/article/uid-changes-coming-to-godot-4-4/))

### A.3 Unity (YAML + `.meta`)

- "Unity's Scene format uses a custom subset of the YAML data serialization language." Each object is its own YAML document, with a header such as `--- !u!1 &6`: the number after `!u!` is the class, the number after `&` is "an object ID number unique within the file". References inside a file look like `{fileID: 6}`; `{fileID: 0}` means none. ([Format description](https://docs.unity.com/en-us/engine/current/manual/working-with-scenes/text-scene-format/format-description))
- Floats may be written as decimal or as hexadecimal IEEE 754 (`0x3F800000`); when both are present only the hex value is parsed. (same page) Inference: Unity found decimal float text insufficient for exact round trips.
- Text merge was not enough. Unity ships `UnityYAMLMerge` "to merge scene and prefab files in a semantically correct way". By default it handles only `.unity`, `.prefab` and `.meta`; other YAML assets (`.asset`, `.mat`, `.controller`) are not merged unless forced. It needs rule files that say which arrays are sets keyed by `fileID` and which float differences to ignore. ([Smart merge](https://docs.unity.com/en-us/engine/current/manual/get-started/project-configuration/version-control/smart-merge))
- Unity's own advice still pairs the merge tool with file locking, because more elaborate parallel changes can end in unresolvable conflicts. **Unverified** (search summary of [Unity blog: author scenes and prefabs with version control](https://unity.com/blog/author-scenes-and-prefabs-with-verson-control), not fetched).

### A.4 Unreal

- Assets are binary. An Epic staff member wrote on 2025-04-24 about text-based assets: "It is not supported yet and it will not be supported in upcoming UE 5.6 either." and "We have many JIRA for text based assets, but they all backlogged." ([Epic forum thread](https://forums.unrealengine.com/t/how-get-text-based-asset-feature/2525684)) Earlier experimental text asset code (`utxt`, `WITH_TEXT_ARCHIVE_SUPPORT`) is **unverified** (forum posts only).
- Data-heavy game data goes through DataTables imported from CSV or JSON. The row struct "must inherit from `FTableRowBase` to be recognized by the importer"; the first column "is expected to be named Name and contains the names by which each row is accessed". Import options "Ignore Extra fields" / "Ignore Missing Fields" control warnings. ([Data Driven Gameplay Elements](https://dev.epicgames.com/documentation/unreal-engine/data-driven-gameplay-elements-in-unreal-engine)) Rows are identified by a **name key**, not by a GUID.
- Config is a line-based `.ini` dialect with layering ("key-value assignments in latter files override those from files earlier in the hierarchy"), `;` comments, class sections `[/Script/ModuleName.ClassName]`, and line prefixes for arrays: `+` append if absent, `-` remove exact match, `.` append always, `!` clear. ([Configuration files](https://dev.epicgames.com/documentation/unreal-engine/configuration-files-in-unreal-engine)) This is a shipped example of a small own line format bound to reflected properties (`UPROPERTY(Config)`).

### A.5 Bevy (RON, BSN)

- Bevy 0.19 (2026) introduced BSN: "BSN is an ergonomic Rust-like scene syntax which can be defined in Rust code via the `bsn!` macro." File loading is not there yet: "while Bevy 0.19 technically supports scene assets, we aren't yet shipping a first-party `.bsn` asset loader." ([Bevy 0.19 release notes](https://bevy.org/news/bevy-0-19/))
- Design goals of BSN: scenes "defined in files (as assets) and in code (as macros), all using the same syntax", inheritance with values "patched on top", and "BSN Assets require version numbers in their imports". Comments in files: "The file format doesn't currently support those, but it can / should / will." ([BSN proposal, discussion #14437](https://github.com/bevyengine/bevy/discussions/14437))
- The older RON output of the reflection serializer is "a map, where the key is the type path and the value is the serialized data". ([bevy_reflect docs](https://docs.rs/bevy_reflect/latest/bevy_reflect/)) Inference: a renamed Rust type changes the key in every saved file; the docs describe no migration mechanism.
- Inference: Bevy is an engine that started with a generic format (RON) and is investing in its own notation because inheritance and patches are format features, not library features.

### A.6 O3DE (JSON, JSON Patch)

- "Prefab files use JSON format." A nested prefab instance stores only its `Source` path and `Patches`; patches have `op`, `path`, `value` fields "to match the JSON patch standards". Entities and components are keyed by ids such as `Entity_[1245636963768]`. Defaults are stripped on save and re-added on load. ([Prefab system architecture](https://www.docs.o3de.org/docs/engine-dev/architecture/prefabs/))
- JSON serialization is minimal: "Default values and information that can be retrieved at runtime aren't stored." The loader "can proceed with serialization and deserialization, even if it finds missing data"; unsupported fields are ignored. ([JSON serialization intro](https://github.com/o3de/o3de.org/blob/main/content/docs/user-guide/programming/serialization/json-intro.md))

### A.7 Paradox Clausewitz script

- "This format is undocumented." Quirks listed by the author of the main open-source parser: duplicate keys turn a value into a list; operators beyond `=` (`>=`, `<`, `!=`, `?=`); `#` comments; "it is valid for files to have a missing bracket"; "An object can be both an array and an object at the same time"; `{}` "could mean an empty array or empty object depending on the context"; "One should delay assigning a type to a scalar as it may be ambiguous if `yes` should be treated as a string or a boolean"; "Clausewitz is recklessly flexible: allowing each game object to potentially define its own unique syntax." ([A Tour of PDS Clausewitz Syntax](https://pdx.tools/blog/a-tour-of-pds-clausewitz-syntax))
- Validation tooling was built by the community, not shipped with the format: CWTools is a language server driven by separately maintained `.cwt` rule files per game. **Unverified** (search summary of [CWTools](https://github.com/cwtools/cwtools) and the Paradox forum thread, not fetched).
- Lesson (inference): an own format is viable for very large data-driven games, but only the absence of a written grammar and of a single strict parser made it painful. Each per-type syntax exception multiplies the cost.

### A.8 Factorio (Lua data)

- Prototypes are Lua tables written into a global `data` table in three ordered passes (`data.lua`, `data-updates.lua`, `data-final-fixes.lua`). Validation at load: "Missing properties will either fall back to a default value or give an error that indicates what is missing." and "Extra properties that the game isn't looking for are ignored." ([Data lifecycle](https://lua-api.factorio.com/latest/auxiliary/data-lifecycle.html))
- Renames are handled by data, not code: JSON migrations "allow changing one prototype into another, typically when renaming them"; all JSON migrations run before Lua migrations, and each save records which migrations were applied. ([Migrations](https://lua-api.factorio.com/latest/auxiliary/migrations.html))
- The full prototype schema is published as machine-readable JSON (types, properties with `optional` and `default`), which "allows for the creation of developer tools that provide code completion and related functionality"; the schema format has its own `api_version`. ([Prototype JSON format](https://lua-api.factorio.com/latest/auxiliary/json-docs-prototype.html))

### A.9 Our Machinery ("The Truth")

- "Each object has a type and the type defines what properties the object has." "Each object has a unique ID and we reference other objects by their IDs", so that "references didn't break". Changes are recorded as "(object, property, old-value, new-value)", which gives undo and collaboration. The previous engine (Bitsquid) had "the JSON files on disk were authoritative", which blocked in-memory undo and live collaboration. Disk formats may differ by use: "a git-friendly representation for collaborative work vs single binary for solo projects". ([The Story behind The Truth, Game Developer cross-post, 2018](https://gamedeveloper.com/programming/the-story-behind-the-truth-designing-a-data-model))
- The concrete on-disk text syntax of The Machinery is **unverified** (the original blog is offline; not found in this session).

### A.10 What the cases say about the three options

| Question | Evidence |
|---|---|
| Do engines ship their own text formats? | Yes: Godot, Paradox, Unreal `.ini`, and Bevy is moving to one (A.2, A.4, A.5, A.7). |
| Does a standard format remove tooling work? | No. Unity uses YAML and still needed a custom merge tool with rule files (A.3). O3DE uses JSON and still needed its own patch, default-stripping and versioning layers (A.6). |
| What makes text diff and merge well? | One property per line, stable ordering, no derived counters, pseudo-random per-object ids, defaults handled consistently (A.2, A.3). These are properties of the writer, not of the syntax family. Inference. |
| What goes wrong with an own format? | No written grammar and per-object syntax exceptions (A.7); comments lost when a tool rewrites the file (A.2). |
| Is silent tolerance common? | Yes: Factorio, O3DE and Quake III (D.2) ignore unknown keys. Inference: this is acceptable for human modders and risky for an LLM author, whose typos would be silently dropped. |

---

## B. Formats and LLM authors (2024–2026 evidence)

### B.1 Generation accuracy by format

StructEval (TMLR 01/2026) measured text-to-format generation; score = 0.2 x syntax validity + 0.8 x expected keys/values present. ([StructEval, arXiv 2505.20139v3](https://arxiv.org/html/2505.20139v3))

| Model | JSON | CSV | TOML | XML | YAML |
|---|---|---|---|---|---|
| GPT-4o | 99.36 | 100.00 | 90.22 | 70.32 | 97.68 |
| GPT-4.1-mini | 99.26 | 99.92 | 91.34 | 77.06 | 95.26 |
| GPT-4o-mini | 97.88 | 99.90 | 29.56 | 75.10 | 96.84 |
| Gemini-1.5-pro | 94.06 | 100.00 | 75.38 | 73.32 | 97.58 |
| o1-mini | 92.56 | 99.24 | 89.40 | 71.12 | 88.28 |
| Qwen-3-4B (open) | 90.96 | 76.44 | 7.44 | 71.16 | 78.74 |
| Llama-3.1-8B (open) | 78.82 | 81.68 | 6.76 | 59.38 | 74.44 |

- JSON and CSV are the most reliable outputs. TOML is the weakest standard format: about 90 for the best models and close to zero for small open models. The paper gives no mechanism for the TOML gap. (same source)
- Limits: no Claude model and no 2026 model was tested; the tasks are one-shot generation, not edits of existing files. No benchmark of JSONC, JSON5 or of a custom line-based format was found in this session.

### B.2 Reading comprehension and token cost

- Nested data lookup, 1,000 questions per format, small models: YAML was best for two of three models (GPT-5 Nano: YAML 62.1%, Markdown 54.3%, JSON 50.3%, XML 44.4%), JSON best for the third (Llama 3.2 3B: 52.7%). Token counts for the same data: Markdown < YAML < JSON < XML (GPT-5 Nano: 38,357 / 42,477 / 57,933 / 68,804). The author warns the data size was chosen "intentionally to stress the models" and "Accuracy is close to 100% with much smaller amounts of data." ([improvingagents.com](https://www.improvingagents.com/blog/best-nested-data-format))
- TOON benchmark, 244 retrieval questions, four 2025–2026 models: overall accuracy TOON 72.2%, JSON 71.4%, XML 70.7%, YAML 70.1%, compact JSON 69.0%, each ±2.8–2.9, so the intervals overlap. Tokens on mixed data: compact JSON 260,451, TOON 264,734, YAML 314,140, pretty JSON 393,637, XML 447,936. For deeply nested configuration "compact JSON often wins outright". ([toon-format/toon README](https://github.com/toon-format/toon))
- Reading: for current models the format changes comprehension by a few points at most; the stable effect is token cost, where less punctuation is cheaper. Inference.

**Own measurement** (tiktoken `o200k_base`, an OpenAI tokenizer; Claude's tokenizer differs, so only the ratios are meaningful). The same recipe (11 scalar fields, one reference, a 5-row table):

| Encoding | Characters | Tokens | vs. option A |
|---|---|---|---|
| Option A, line-based, with `#` comments | 440 | 208 | baseline |
| TOML, with `#` comments | 469 | 224 | +8% |
| JSON, rows as arrays, no comments possible | 476 | 244 | +17% |
| JSONC, rows as arrays, with `//` comments | 551 | 261 | +25% |
| JSON, rows as objects | 601 | 294 | +41% |

A single reference `0x5b1e09c2a4f37d10` costs 15 tokens in every encoding (the decimal form costs 7, a Godot-style `uid://c4cp0al3ljsjv` costs 12). The uid text, not the surrounding syntax, is the expensive and error-prone part.

### B.3 Constrained output and JSON Schema

- Claude structured outputs "guarantee schema-compliant responses through constrained decoding". Not supported in the schema: recursive schemas, numerical constraints (`minimum`, `maximum`, `multipleOf`), string length constraints, `additionalProperties` other than `false`. SDK helpers move unsupported constraints into the field description and validate afterwards. ([Claude structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs))
- OpenAI Structured Outputs enforce a supplied JSON Schema. ([OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)) OpenAI also offers custom tools whose plain-text output is constrained by a Lark or regex grammar, with the advice "Keep grammars simple" and the warning that the API "may return an error if the grammar is too complex". ([OpenAI function calling, custom tools](https://developers.openai.com/api/docs/guides/function-calling))
- JSONSchemaBench (10K real schemas, six constrained-decoding frameworks) found real coverage gaps between frameworks. ([arXiv 2501.10868](https://arxiv.org/abs/2501.10868))
- Consequences (inference):
  - Hard guarantees exist only for JSON (all vendors) and for grammars (OpenAI only). A custom format gets no decoder-level guarantee with Claude.
  - That guarantee applies to API responses and tool arguments. A coding agent that writes a file through a write or edit tool produces free text inside a tool argument, so the file body is not constrained whatever its format. The check that matters is the engine's own validator run after the edit.
  - Ranges are not enforced by the decoder even for JSON; the validator must enforce them, and the range should also be in the description text.

### B.4 Cost of structure and of unfamiliar syntax

- "Let Me Speak Freely?" reports "a significant decline in LLMs reasoning abilities under format restrictions" and that "stricter format constraints generally lead to greater performance degradation in reasoning tasks." ([arXiv 2408.02442](https://arxiv.org/abs/2408.02442)) Specific numbers quoted elsewhere for this paper are **unverified** (not read from the paper).
- Aider measured that "LLMs produce lower quality code if they're asked to return it as part of a structured JSON response"; "The use of OpenAI's new strict mode offered no improvement"; one model made no syntax errors and still scored lower. ([Aider, 2024-08](https://aider.chat/2024/08/14/code-in-json.html)) This concerns code wrapped in JSON strings (escaping), not data files.
- Anthropic's guidance for formats a model must write: "Keep the format close to what the model has seen naturally occurring in text on the internet" and avoid formatting overhead; JSON-wrapped code "requires extra escaping of newlines and quotes". ([Building effective agents, appendix 2](https://www.anthropic.com/engineering/building-effective-agents))
- A survey of 111 studies found that code generation quality "significantly deteriorates" for low-resource and domain-specific languages. ([arXiv 2410.03981](https://arxiv.org/abs/2410.03981)) It covers programming languages with semantics; no study of a trivially simple key-value data notation was found. Whether a small own line format costs an LLM author anything measurable is therefore **unverified**.
- The edit mechanism matters more than is usually assumed: one 2026 comparison of edit formats across 16 models reports +15 points average for a line-addressed edit format over a patch format, and one model going from 6.7% to 68.3%. ([The Harness Problem](https://stencil.so/blog/the-harness-problem)) Single author, own benchmark; treat the exact numbers with caution. Aider documents the same effect per model family. ([Aider edit formats](https://aider.chat/docs/more/edit-formats.html))
- Inference: a format where every line is self-contained (key and value on one line, no closing brackets, no separator comma that belongs to the previous line) suits line-based and search-and-replace edit tools. JSON needs a comma on the previous line when a last element is added, and its closing brackets are not unique search targets.

### B.5 Middle grounds

| Candidate | Facts | Assessment (inference) |
|---|---|---|
| JSONC / JSON5 | yyjson (C89, one `.h` + one `.c`) has read flags for comments and trailing commas and "offers options to enable individual JSON5 features"; errors carry code, message and position. ([yyjson](https://github.com/ibireme/yyjson)) Whether comments survive a write is not documented. | Cheapest parser. Most tokens. 64-bit ids must be strings. Comments are lost on any tool rewrite unless we write our own writer. |
| TOML 1.1 subset | TOML 1.1.0 allows newlines and a trailing comma in inline tables. ([TOML v1.1.0](https://toml.io/en/v1.1.0); release date December 2025 is **unverified**, from search results) Integers: "at least 64-bit signed integers (from −2^63 to 2^63−1)". `tomlc17` "Fully implements TOML v1.1 and passes the standard `toml-test` validation suite"; it is a parser, no writer is documented. ([tomlc17](https://github.com/cktan/tomlc17)) | Spec and test suite exist. A full `u64` uid does not fit a TOML integer, so uids become strings or 63-bit. Rows need `[[table]]` blocks or nested arrays. Weakest LLM generation scores of the standard formats (B.1). A writer that keeps comments still has to be written. |
| KDL 2.0 | Node name, positional arguments, `key=value` properties, children blocks; line, block and slash-dash comments; type annotations such as `(u8)10`; a schema language "loosely based on JSON Schema"; C implementation `ckdl`. ([kdl.dev](https://kdl.dev/)) | Syntactically the closest existing spec to option A. LLM familiarity with KDL is **unverified** and probably low. Worth reading as a reference grammar even if not adopted. |

---

## C. Identity

### C.1 How each system identifies an asset

| System | Identity | Generated how | Stored where | Reference form |
|---|---|---|---|---|
| Godot | 63-bit integer shown as `uid://…` | Crypto random, top bit cleared, re-rolled if already known | In the file header for own formats; in `.import` for imported files; in a `.uid` sidecar for scripts and shaders (since 4.4) | uid **and** path |
| Unity | "unique ID" per asset (GUID) + `fileID` per object in the file | Assigned by the editor on first sight of the file | `.meta` sidecar for every file and folder | `{fileID, guid, type}` (**guid/type fields unverified**, not on the fetched page) |
| Unreal | Package path + object name | Derived from location | Nowhere (the path is the identity) | Path string; redirector objects left at old paths |
| O3DE (default) | Source UUID + product sub ID | UUID "generated based on the file name and scan directory relative path" | Nowhere (derived) | Asset id + readable hint |
| O3DE (metadata relocation, experimental) | Random UUID | Random; checked against existing | `.meta` sidecar, with `legacyUuids` and `originalPath` | Asset id + readable hint |
| Cap'n Proto (schema files and types) | 64-bit id | "Use `capnp id` to generate a new ID randomly." | In the file | By id |
| Our Machinery | Object id | Not documented | In the data model | By id |

Sources: Godot [resource_uid.cpp](https://github.com/godotengine/godot/blob/master/core/io/resource_uid.cpp) and [UID article](https://godotengine.org/article/uid-changes-coming-to-godot-4-4/); Unity [asset metadata](https://docs.unity.com/en-us/engine/current/manual/assets-and-media/import-assets/asset-metadata) and [format description](https://docs.unity.com/en-us/engine/current/manual/working-with-scenes/text-scene-format/format-description); Unreal [asset redirectors](https://dev.epicgames.com/documentation/unreal-engine/asset-redirectors-in-unreal-engine) and [referencing assets](https://dev.epicgames.com/documentation/unreal-engine/referencing-assets-in-unreal-engine); O3DE [asset identifiers](https://github.com/o3de/o3de.org/blob/main/content/docs/user-guide/assets/pipeline/asset-dependencies-and-identifiers.md), [metadata relocation](https://github.com/o3de/o3de.org/blob/main/content/docs/user-guide/assets/pipeline/metadata.md), [RFC 77](https://github.com/o3de/sig-content/blob/main/rfcs/rfc-77-metadata-asset-relocation.md); [Cap'n Proto language](https://capnproto.org/language.html); Our Machinery (A.9).

### C.2 Godot details

- Generation in `ResourceUID::create_id()`: `CryptoCore::generate_random` fills 8 bytes, then `id &= 0x7FFFFFFFFFFFFFFF`, repeated until the id is not in the known set. Text form is base 34 (`a`–`y`, `0`–`8`); a source comment notes `z` and `9` are never used and this cannot be fixed without breaking compatibility. ([resource_uid.cpp](https://github.com/godotengine/godot/blob/master/core/io/resource_uid.cpp))
- Alternatives Godot rejected, with reasons: checksums, because identical files must stay separately referenced; a central UID database, because it breaks on moves outside the editor and causes frequent merge conflicts; uids embedded in script comments, because of pushback and cross-language tooling problems. ([UID article](https://godotengine.org/article/uid-changes-coming-to-godot-4-4/))
- Sidecar cost: if `.uid` files are not committed, "as soon as you clone the project on another device, the UID references will break"; the path fallback then prints a warning per resource and is unsafe because two resources can be swapped so that old paths still match. A file moved outside the editor must be moved together with its `.uid` file. (same article) Users complain about "file system pollution" and that they "must remember to move two files to be consistent". ([Godot forum](https://forum.godotengine.org/t/proposal-for-a-better-uid-support-in-godot-4-4/102122), user opinion)
- Duplicate on copy: files copied outside the editor keep the uid of the original. A user reported that duplicate uids made Godot load the wrong scene at random, costing hours. ([proposal discussion #8949](https://github.com/godotengine/godot-proposals/discussions/8949)) A warning was added only in 2024 ([PR #92972](https://github.com/godotengine/godot/pull/92972), milestone 4.4). Current code has two paths ([editor_file_system.cpp](https://github.com/godotengine/godot/blob/master/editor/file_system/editor_file_system.cpp)):
  - A new file appears while the editor runs and its uid belongs to another existing file: a new uid is assigned and the editor prints "Duplicate UID detected for Resource at … The new file UID was changed automatically."
  - Duplicates found on the first scan: only "UID duplicate detected between %s and %s." is printed and the later file takes over the mapping.
- A renamed resource restored from version control can also bring an old uid back. (discussion #8949)

### C.3 Unity details

- "If you move or rename an asset outside of Unity, you must move or rename the .meta file to match." "If an asset loses its .meta file, any reference to that asset is broken in your project. In this situation, Unity generates a new .meta file for the moved or renamed asset as if it's a brand new asset". ([Asset metadata](https://docs.unity.com/en-us/engine/current/manual/assets-and-media/import-assets/asset-metadata))
- Duplicate GUIDs after copying files with their `.meta`: Unity reassigns a new GUID to one of the copies in writable folders, and references to the reassigned file can silently break; in immutable package folders the asset is ignored instead. **Unverified** (forum posts and issue tracker summaries; the issue page "multiple assets with identical GUIDs are not assigned new ones if they are added at the same time" returned 404).

### C.4 Unreal details

- A moved or renamed asset "leaves a Redirector in the asset's old location". Fix-up "will resave all packages that point to the redirector" and deletes it only if all referencers could be resaved. Documented failure cases: creating a new asset with the old name fails because "a Redirector and a resource cannot have the same name"; rename A to B then delete B fails because B "could not be deleted because it is in use". ([Asset redirectors](https://dev.epicgames.com/documentation/unreal-engine/asset-redirectors-in-unreal-engine))
- Soft references are "stored as a string" path. ([Referencing assets](https://dev.epicgames.com/documentation/unreal-engine/referencing-assets-in-unreal-engine))
- Inference: path-as-identity turns every rename into a write to every referencing file plus leftover indirection objects. This is the model our sketch avoids.

### C.5 O3DE details

- The path-derived UUID breaks on rename; the only supported fix was a find-and-replace tool that "Users aren't aware" of and that may miss references in binary files. ([RFC 77](https://github.com/o3de/sig-content/blob/main/rfcs/rfc-77-metadata-asset-relocation.md))
- RFC 77 chooses **random** UUIDs over deterministic ones because deterministic schemes collide when different users create files independently, and it keeps a legacy path-based UUID so old references still resolve. (same RFC)
- Duplicates introduced externally: "the AP should refuse to process the files with the duplicated UUID and provide an error so the user can resolve the duplicate appropriately." (same RFC)
- Rejected storage alternatives: one central database file (more merge conflicts), one file per folder, a hidden mirrored directory (easy to forget to commit), breadcrumbs. (same RFC)
- References keep a readable hint next to the id; after a rename "the data will change because the asset hint has changed". ([Metadata relocation](https://github.com/o3de/o3de.org/blob/main/content/docs/user-guide/assets/pipeline/metadata.md))

### C.6 Collision odds for a random 64-bit uid

**Own calculation**, birthday bound p ≈ 1 − exp(−n(n−1) / 2^(b+1)):

| Number of uids | 64 bits | 63 bits (Godot) |
|---|---|---|
| 10^5 | 2.7 x 10^-10 | 5.4 x 10^-10 |
| 10^6 | 2.7 x 10^-8 | 5.4 x 10^-8 |
| 10^7 | 2.7 x 10^-6 | 5.4 x 10^-6 |
| 10^8 | 2.7 x 10^-4 | 5.4 x 10^-4 |
| 10^9 | 2.7 x 10^-2 | 5.3 x 10^-2 |

- These odds hold only for a good random source. Godot uses a cryptographic generator and still checks the known set. (C.2)
- LLMs are poor random sources: recent papers report near-deterministic or strongly biased outputs when models are asked for random numbers. ([arXiv 2502.19965](https://arxiv.org/abs/2502.19965), [arXiv 2601.05414](https://arxiv.org/html/2601.05414)) **Unverified** beyond abstracts and search summaries. Inference: a uid typed by the model is not a random uid; real collisions will come from copies and from model-invented ids, not from the birthday bound.

### C.7 Failure modes seen in practice

| Failure | Seen in | Guard |
|---|---|---|
| File copied with its id (copy-paste, "save as", template) | Godot (C.2), Unity (C.3), O3DE RFC (C.5) | Hard error naming both files; a tool command that duplicates and mints a new uid |
| Silent auto-fix picks the wrong copy and breaks references | Unity (C.3, unverified) | Do not auto-reassign; make the author or tool decide |
| Sidecar not moved or not committed | Godot (C.2), Unity (C.3), O3DE (C.5) | Keep the uid inside the file wherever the format is ours |
| Central id database | Rejected by Godot and O3DE for merge conflicts (C.2, C.5) | Any uid-to-path index is a derived cache, never committed |
| Old id returns from version control | Godot (C.2) | Same duplicate check; never reuse a retired uid |
| Path fallback hides a wrong reference | Godot (C.2) | A reference that fails by uid is an error, not a silent path lookup |
| Unreadable references in review | Godot and O3DE both store a path or hint next to the id (A.2, C.5) | Optional readable hint next to the uid, checked by lint |
| Derived ids collide or change on rename | O3DE default scheme (C.5) | Random ids assigned once |

---

## D. Reflection and type registration

### D.1 Approaches that ship

| Codebase | Language | Approach | Single source of truth? |
|---|---|---|---|
| Quake III | C | Hand-written table `{"origin", FOFS(s.origin), F_VECTOR}` (name, `offsetof`, type, flags); a generic parser writes into the struct by offset | No, struct and table are separate |
| Flecs | C | Runtime descriptors (`ecs_member_t`: name, type, count, offset, unit, range, warning range, error range); or `ECS_STRUCT(name, {...})`, which both typedefs the struct and stringifies its body for a runtime parser | Yes with `ECS_STRUCT` |
| Blender DNA | C headers | Own tool `makesdna` parses restricted C struct headers at build time and emits a binary struct description (SDNA) that is stored in every `.blend` | Yes (the header) |
| PostgreSQL | C | Script `gen_node_support.pl` parses node struct headers; fields are annotated with `pg_node_attr()`; generates copy/equal/out/read functions | Yes (the header) |
| Unreal | C++ | Macros (`UCLASS`, `UPROPERTY`) plus an external parser and code generator (Unreal Header Tool) run before the compiler | Yes (the header) |
| Godot | C++ | Hand-written registration calls in `_bind_methods()` (`ClassDB::bind_method`, `ADD_PROPERTY(PropertyInfo(...))`); the registry can be dumped as `extension_api.json` | No, class and bindings are separate |
| O3DE | C++ | Hand-written builder calls (`Class<T>()->Version(n, conv)->Field("name", &T::m)`) | No |
| Bevy | Rust | `#[derive(Reflect)]` + runtime `TypeRegistry` | Yes |
| Protobuf / FlatBuffers / Cap'n Proto | schema file | External schema + code generator, numeric field ids | Yes (the schema) |

Sources: [Quake III g_spawn.c](https://github.com/id-Software/Quake-III-Arena/blob/master/code/game/g_spawn.c); Flecs [meta.h](https://github.com/SanderMertens/flecs/blob/master/include/flecs/addons/meta.h) and [meta_c.h](https://github.com/SanderMertens/flecs/blob/master/include/flecs/addons/meta_c.h); [Blender DNA docs](https://developer.blender.org/docs/features/core/dna/); [PostgreSQL nodes README](https://github.com/postgres/postgres/blob/master/src/backend/nodes/README); [Unreal Header Tool](https://dev.epicgames.com/documentation/unreal-engine/unreal-header-tool-for-unreal-engine); [Godot Object class](https://docs.godotengine.org/en/stable/engine_details/architecture/object_class.html); [O3DE versioning](https://github.com/o3de/o3de.org/blob/main/content/docs/user-guide/programming/components/reflection/serialization-context/versioning.md); [bevy_reflect](https://docs.rs/bevy_reflect/latest/bevy_reflect/); [FlatBuffers evolution](https://flatbuffers.dev/evolution/), [protobuf proto3 guide](https://protobuf.dev/programming-guides/proto3/), [Cap'n Proto language](https://capnproto.org/language.html).

Answer to "what do C codebases actually ship with": all three forms exist. Offset tables written by hand or by macros (Quake III, Flecs), a macro that defines struct and metadata from one token list (Flecs `ECS_STRUCT`), and build-time parsing of restricted C headers (Blender, PostgreSQL). No C engine was found that uses Cap'n Proto or FlatBuffers schemas as its editor-facing type registry; this absence is **unverified** (not searched exhaustively).

### D.2 Details worth copying

- Quake III: keys not in the table are silently ignored by `G_ParseField`. ([g_spawn.c](https://github.com/id-Software/Quake-III-Arena/blob/master/code/game/g_spawn.c))
- Flecs member metadata includes a unit and three ranges: `range` ("may be used by UI elements such as a progress bar or slider. The value of a member should not exceed this range"), `warning_range` and `error_range`. ([meta.h](https://github.com/SanderMertens/flecs/blob/master/include/flecs/addons/meta.h)) No versioning or migration support was found in these headers.
- Godot property metadata: `PropertyInfo(Variant::INT, "amount", PROPERTY_HINT_RANGE, "0,49,1", PROPERTY_USAGE_EDITOR)`; usage flags separate "stored" from "shown in the editor" (defaults are `PROPERTY_USAGE_STORAGE` and `PROPERTY_USAGE_EDITOR`). ([Object class](https://docs.godotengine.org/en/stable/engine_details/architecture/object_class.html))
- Godot API drift check: the registry is dumped with `--dump-extension-api` and a branch is checked with `--validate-extension-api` against the previous release's JSON; a "Hash changed" error means a compatibility binding is missing; accepted breaks are recorded in a per-change file. ([Handling compatibility breakages](https://docs.godotengine.org/en/stable/engine_details/development/handling_compatibility_breakages.html)) How Godot handles renamed *properties* is not covered there (**unverified**).
- Unreal property metadata: `ClampMin` / `ClampMax` ("Specifies the minimum value N that may be entered for the property"), `DisplayName`, `EditCondition`; "Metadata only exists in the editor; do not write game logic that accesses metadata." Specifiers `Transient` ("will not be saved or loaded"), `SaveGame`, `Config`. ([UProperties](https://dev.epicgames.com/documentation/unreal-engine/unreal-engine-uproperties), [metadata specifiers](https://dev.epicgames.com/documentation/unreal-engine/metadata-specifiers-in-unreal-engine)) `UIMin` / `UIMax` (slider range separate from the hard clamp) and `Units` are **unverified** (not on the fetched pages).
- Unreal Header Tool is "a custom parsing and code generation tool"; compilation has two phases; Epic warns that "Adding new engine types, property types, or keywords should be approached cautiously." ([UHT](https://dev.epicgames.com/documentation/unreal-engine/unreal-header-tool-for-unreal-engine))
- PostgreSQL: after adding a node struct, "Add attributes as necessary to control the outcome"; changing a node type that is stored on disk needs a catalog version bump. ([nodes README](https://github.com/postgres/postgres/blob/master/src/backend/nodes/README))

### D.3 Versioning and migration mechanisms

| Mechanism | Who | How |
|---|---|---|
| Tolerant load by field name | Unreal, O3DE JSON, Blender | Removed fields are ignored, added fields take defaults ([Unreal versioning](https://dev.epicgames.com/documentation/unreal-engine/versioning-of-assets-and-packages-in-unreal-engine); O3DE A.6; [Blender DNA](https://developer.blender.org/docs/features/core/dna/)) |
| Rename tables | Unreal Core Redirects, Blender, Unity, O3DE, Factorio | `+PropertyRedirects=(OldName="MyActor.OldFloatProperty",NewName="NewFloatProperty")`; `DNA_STRUCT_RENAME_MEMBER(Mesh, totvert, verts_num)`; `[FormerlySerializedAs]`; `->NameChange(4, 5, "MyData", "Data")`; JSON migrations ([Core Redirects](https://dev.epicgames.com/documentation/unreal-engine/core-redirects-in-unreal-engine); [dna_rename_defs.h](https://github.com/blender/blender/blob/main/source/blender/makesdna/intern/dna_rename_defs.h); [FormerlySerializedAs](https://docs.unity.com/en-us/engine/current/script-reference/unityengine/serialization/formerlyserializedasattribute); O3DE versioning; Factorio A.8) |
| Type change with a conversion function | O3DE | `->TypeChange<int, float>("MyData", 4, 5, [](int in)->float { return (float)in; })`; "Type changes take priority over name changes." |
| Free-form converter per version | O3DE, Blender, Factorio | `->Version(2, &SerializationConverter)`: "Version converters operate directly on the serialized data." |
| Removed type | O3DE, Unreal | `ClassDeprecate(...)`: "any instances of the class are silently discarded during load"; `PackageRedirects` with `Removed=true` |
| Enum value rename | Unreal | `+EnumRedirects=(OldName="ENumbers",NewName="ELetters",ValueChanges=(("NumberTwo","LetterB")))` |
| Several independent version axes | Unreal | Engine object version, licensee version, and per-system custom versions keyed by GUID, because "It is impossible to update the version enumeration in multiple places" for teams working in parallel |
| File newer than the program | Unreal | The engine refuses to load a package whose version is higher than its own |
| Numeric field ids, names are free | Protobuf, FlatBuffers, Cap'n Proto | "Field numbers should never be reused"; a deleted field's number must be reserved; Cap'n Proto "cannot change a field, method, or enumerant's number" |
| Clean-up after migration | Unreal | Resave affected assets, check them in with the code change, then delete the redirect; `MatchSubstring` "is intended to be used temporarily" |

Rules from the schema languages that carry over to a text format:

- In text encodings the field **name** is the wire identity. Protobuf: "You should also reserve the field name to allow JSON and TextFormat encodings of your message to continue to parse", and reusing an old name "is generally safe, except when using TextProto or JSON encodings". ([proto3 guide](https://protobuf.dev/programming-guides/proto3/))
- Defaults are part of the contract. FlatBuffers on changing a default: "This is NOT OK." Cap'n Proto: "You cannot change a field or method parameter's type or default value." ([FlatBuffers evolution](https://flatbuffers.dev/evolution/), [Cap'n Proto language](https://capnproto.org/language.html))
- Removed fields are kept as tombstones: FlatBuffers "You MUST not remove a field from the schema, even if you don't use it anymore", mark it `deprecated`. (same page)
- Blender warns that the old names in the rename table "aren't sanity checked" and that "typos in the old names will break both backwards & forwards compatibility". ([dna_rename_defs.h](https://github.com/blender/blender/blob/main/source/blender/makesdna/intern/dna_rename_defs.h))
- O3DE: "We recommend that you increase the version number of serialized data anytime there is a change to the reflected fields", and "We strongly recommend against skipping versions with the `NameChange` builder." (O3DE versioning)

---

## What this means for the sketches

### (a) Confirmed

1. **A persistent id assigned once, references by id, path only for display.** This is what Godot, Unity, Our Machinery and Cap'n Proto do, and what O3DE is migrating to. Unreal's path identity and O3DE's path-derived UUIDs are the documented counterexamples (C.4, C.5).
2. **Random id, not derived.** O3DE's RFC chooses random over deterministic ids explicitly; Godot and Cap'n Proto generate randomly (C.1, C.2, C.5).
3. **Content hash is a cache key, never identity.** Godot rejected checksums for identity because identical files must stay separately referenced (C.2).
4. **64 bits are enough.** Collision odds are 2.7 x 10^-8 at one million ids (C.6). Godot ships 63 bits; Cap'n Proto ships 64.
5. **Uid inside the file for formats we own.** Godot does this for its own formats and uses sidecars only for files it cannot write into; every sidecar system reports the same "second file was not moved or not committed" problem (C.2, C.3, C.5).
6. **An own text format is normal engine practice**, not an oddity: Godot, Paradox, Unreal config, and now Bevy (A.10). Standard formats did not save Unity or O3DE from writing their own merge, patch and versioning layers.
7. **A macro-built field table in C is a shipped pattern** (Quake III, Flecs), and it can feed save/load, editor ranges and a dumped JSON description, as Godot's registry and `extension_api.json` do (D.1, D.2).
8. **Typed references** match Unity's reference triple and O3DE's typed asset references in spirit (C.1; the Unity field list is unverified).

### (b) Gaps we should add

Format:

1. **A written grammar, a conformance corpus and one strict parser.** The Paradox format shows what happens without them (A.7). The sketch already mixes three micro-syntaxes (`key=value` pairs on the header line, `key value` body lines, a `ref:` prefix); each should be one rule in the grammar with no per-type exceptions.
2. **Unknown key = error, with a nearest-name suggestion.** Factorio, O3DE and Quake III ignore unknown keys (A.6, A.8, D.2); for an LLM author that hides typos.
3. **Comments must survive tool rewrites.** Godot drops them on save (A.2). The formatter, the migration tool and any editor panel must write through a comment-preserving path.
4. **One canonical writer**: fixed key order, one item per line, no derived counters in the file (Godot removed `load_steps`), and a defined float text form that round-trips exactly (Unity resorted to hex floats) (A.2, A.3).
5. **A lossless JSON view of every file** (`export`/`import`). JSON Schema, structured outputs and MCP-style tools only speak JSON (B.3). The schema emitted by the registry should describe this JSON view; the validator, not the decoder, enforces ranges.
6. **Separate version numbers**: file syntax version (Godot `format=3`), type schema version, and generator code version. The sketch's single `version=3` does not say which one it is. A generator can change its output with no schema change, and Unreal needed independent version axes for parallel work (D.3). Also define behavior for a file newer than the engine (Unreal refuses to load).

Identity:

7. **Duplicate uid is a hard error that names both files**, with no silent auto-reassign, plus a `duplicate` command that mints a new uid. This is the most frequent real failure in Godot, Unity and O3DE (C.7).
8. **Uids are minted by a tool, never typed by the model.** LLMs are poor random sources (C.6, unverified beyond abstracts) and a hex uid costs about 15 tokens to copy (B.2). Follow `capnp id`.
9. **A readable hint next to each reference** (`ref:0x19aa… "palette/red_clay"` or similar), checked by lint as a warning. Godot stores the path and O3DE stores a hint for the same reason (A.2, C.5). Without it neither a reviewer nor the model can read a diff.
10. **A dangling reference is an error**, never a silent path fallback (Godot's fallback can resolve to the wrong file) (C.2).
11. **Retired uids are never reused**, and the uid-to-path index is a derived cache outside version control (C.2, C.5, C.7). Reserve `0` as "none" (Unity uses `fileID: 0`).
12. **Decide the identity of table rows.** Unreal DataTables, Factorio prototypes and Paradox data key rows by readable name and handle renames with migration maps (A.4, A.8). A 64-bit uid per row is not what data-heavy games do; name keys plus a rename table may fit scale tables and game data better. Also decide where the uid lives for authored inputs that are not our text files (sidecar is then unavoidable).

Registry:

13. **Renamed-field aliases** (`was "old_name"`), as in Unreal, Blender, Unity, O3DE, Factorio (D.3). `ENG_FIELD_SINCE` covers additions only.
14. **Removed-field tombstones** (name, version removed), so an old file loads cleanly and the name is not reused with a new meaning (protobuf, FlatBuffers) (D.3).
15. **Type-change converters and a free-form per-version converter hook** (O3DE `TypeChange`, `Version(n, converter)`) (D.3).
16. **Default values in the registry, and a rule for changing them.** A changed default silently changes every file that omitted the field (FlatBuffers: "This is NOT OK"). For assets defined as program + parameters + seed this changes generated output. Either the canonical writer writes every field explicitly, or a default change requires a version bump with a migration that writes the old value. Inference from D.3.
17. **Range (hard), UI range (soft), warning range, unit, step, description text, enum value names** per field (Flecs, Godot, Unreal) (D.2). The description and unit feed JSON Schema `description`, which is where constraints must go when the decoder ignores `minimum`/`maximum` (B.3).
18. **Usage flags**: stored / editor-only / derived, and "affects generated output" for the cache key and dependency graph (Godot usage flags, Unreal `Transient`) (D.2). The last flag is an inference.
19. **Schema drift check in CI**: dump the registry to JSON, commit it, and fail the build on an incompatible change that has no version bump or migration, as Godot does with `extension_api.json` (D.2).
20. **Guard against struct and macro list drifting apart**: either one macro defines both (Flecs `ECS_STRUCT`), or a static size check per type. Blender warns that its rename table is unchecked (D.1, D.3).
21. **Migration is run across the repository and committed**, so old-version load paths can be deleted after a window (Unreal's redirect workflow) (D.3).

### (c) Where the recommendation should change

1. **Format: neither B (JSON) nor C (TOML subset) clearly beats A on the evidence, but A alone is not enough.**
   - For A: lowest token cost (A 208, TOML 224, JSON 244–294 tokens for the same recipe, own measurement); comments; native `u64` and `ref` values; one row per line for tables; self-contained lines suit search-and-replace edit tools; engine practice supports own formats (A.10, B.2, B.4).
   - Against B as the on-disk format: no comments, the most tokens, uids as strings, and JSON's one hard advantage (constrained decoding) does not apply to files an agent writes through an edit tool (B.3).
   - Against C: TOML has the weakest LLM generation scores of the standard formats (about 90 for the best models, near zero for small ones), cannot hold a full `u64` as an integer, is awkward for row tables, and a comment-preserving writer must still be written, so the saved work is only the reader (B.1, B.5).
   - Change: keep A as the surface syntax **and** make the JSON view (gap 5) part of the decision, so that machine-to-machine paths use JSON and JSON Schema while files stay line-based. JSON wins for tool input/output; it does not win for files.
   - Honest limit: no benchmark was found for LLM accuracy on a small custom line format, on JSONC or on JSON5. The case for A rests on token counts, engine practice and inference, not on a measured LLM error rate. A cheap test would settle it: have the agent write and edit 50 recipes in A and in JSONC and count validator failures.
   - Fallback: if the grammar, conformance corpus and formatter (gaps 1, 3, 4) are not going to be written, choose C (TOML 1.1 via an existing parser and test suite) rather than an unspecified A. An own format without a spec is the Paradox outcome.
2. **Identity: change "references go by uid" to "references go by uid plus a checked readable hint", and change "uid assigned once" to "uid minted by a tool and linted for duplicates".** Also reconsider uids for table rows (gap 12).
3. **Registry: keep macros next to the struct, but the sketched macro set is too small.** Add alias, tombstone, converter, default, range/unit/description and usage metadata before the first type is written (gaps 13–18); retrofitting these means touching every type. The alternatives are not better supported by evidence: header-parsing code generators work in C (Blender, PostgreSQL) but add a build tool, and external schema languages bring field ids that a text format does not need while lacking editor metadata. If struct/macro drift becomes a recurring bug, the next step is the Flecs-style single macro or a Blender-style header parser, not an external schema.
