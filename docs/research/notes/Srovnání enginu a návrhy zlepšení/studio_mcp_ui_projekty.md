# Studio, MCP server, UI a projekty pro Wallhammer Zero (D18)

Poznámky sepsány 2026-11-05. Rozsah: studio (editor), MCP jako hlavní rozhraní pro AI, UI pro studio i hru, systém projektů a konkrétní návrh (moduly, milníky, denní práce). Ladicí server, logování a headless režim (D17) řeší paralelní rešerše. Tady se s nimi počítá jen jako se závislostí.

Výchozí stav návrhu: `docs/research/Architektura open world enginu.md` (13 CMake targetů, `runtime` jako mediátor, `app` + herní DLL přes `eng_api`, nástroje „od M5“), `docs/research/Procedurální grafika pro engine.md` (asset = program + parametry + seed, recepty v `content/`, `gencli render` s kontaktními archy, `genlint`, golden hashe, cimgui panely „souběžně od M3“) a `docs/DECISIONS.md` D15–D18.

Omezení rešerše: v polovině práce došel sdílený limit webového vyhledávání (200 dotazů na session). Zbytek stojí na přímém čtení primárních stránek přes WebFetch. Nešlo proto dohledat: Unity CLI (nástupce Unity MCP), Nuklear, Noesis, MSDF a stb_truetype, Flax a Hazel ani přesný seznam nástrojů Epic MCP. Tyto položky jsou v sekcích Gaps.

---

## 1. Architektura studia: na enginu, jedna nebo dvě binárky, play-in-editor, undo a minimální studio pro art directora

### Takeaway
Doporučení: **studio je samostatná binárka `wz_studio`, ze stejných statických knihoven jako hra.** Navíc má jen modul `eng_editor`, na který nic pod ním nesmí záviset (pravidlo Godotu `editor/ → scene/ → servers/ → core/`). Editační režim (generátory, viewport, review) běží ve studiu. **„Play“ spouští hru jako podproces** připojený přes ladicí server z D17, po vzoru Fyroxu („editor nespadne, když spadne hra“). Datovým modelem nejsou objekty v paměti jako v The Truth, ale **textové recepty v gitu**. Undo je zásobník patchů receptů a sdílí ho panely, MCP i hlídač souborů. Minimální studio pro art directora tvoří viewport s referenční figurínou, prohlížeč receptů, panel parametrů generovaný ze schématu, kontaktní arch s A/B a schvalováním, stav lintů a golden hashů a poznámky připíchnuté do světa. Modelovací nástroje nepotřebuje.

### Cited Findings
**Godot (editor = aplikace nad vlastním enginem)**
- Editor Godotu se kreslí vlastním rendererem a UI systémem enginu („does *not* rely on a toolkit such as GTK or Qt“). Je celý v C++ a jeho kód leží v `editor/`. Některé editorové moduly jsou zapnuté „only in editor builds to decrease the binary size of export templates“. Závislosti smí téct jen jedním směrem: `editor/ → scene/ → servers/ → core/`. Nové include z `editor/` se nesmí přidávat jinam, a to ani pod `#ifdef TOOLS_ENABLED` — [Godot docs: Introduction to editor development](https://docs.godotengine.org/en/latest/engine_details/editor/introduction_to_editor_development.html)
- Godot editor umí za běhu hry ukázat a měnit uzly („Remote“ ve Scene docku), replikovat změny scény i skriptů do běžícího projektu („Synchronize Scene Changes / Script Changes“) a nechat ladicí server otevřený pro sezení spuštěná mimo editor („Keep Debug Server Open“). Stránka výslovně neříká, že hra běží jako samostatný proces. Plyne to ale z popisu nasazení, kde se spustitelný soubor připojuje k editoru po síti — [Godot docs: Overview of debugging tools](https://docs.godotengine.org/en/stable/tutorials/scripting/debug/overview_of_debugging_tools.html)

**Fyrox (hra jako podproces)**
- FyroxEd „calls `cargo` commands to build and run your game in a separate process“, aby „the editor won't crash if your game does“. Play mode funguje jen u projektů ze šablony `fyrox-template`. Během hraní je UI editoru zamčené — [Fyrox book: Editor overview](https://fyrox-book.github.io/beginning/editor_overview.html)

**Bevy (editor jako normální aplikace enginu, stav 2026)**
- Bevy 0.19 (06/2026) přineslo scénový systém BSN a widgety Feathers na něm. Bevy 0.20 (8. 10. 2026) přidalo do Feathers („the opinionated editor-centric UI toolkit“) Color Input, Scrollable List View, Dropdown a Lazy Menu — [Bevy 0.20](https://bevy.org/news/bevy-0-20/), [Bevy 0.19](https://bevy.org/news/bevy-0-19/) (údaje z výsledků vyhledávání, stránky jsem celé nečetl)
- Šesté narozeniny Bevy (08/2026): „The Bevy Editor … will be a normal Bevy app built on top of Bevy UI + BSN“. Bude vytvářet soubory `.bsn` a skládat je ve vizuálním editoru scén. Základy už existují: „the scene system, the UI system, the editor widget library, the asset system, the remote protocol, the design language and mockups, a proven dynamic plugin loading model, and an extremely functional prototype“. Komunitní prototyp Jackdaw má BSN editor scén, ECS inspektor, undo/redo, dynamické pluginy, materiály, terén a **project manager / creator**. Oficiální editor ale k 11/2026 vydaný není („You probably shouldn't trust me when I say it is close now“). Příspěvek o editoru vůbec nezmiňuje AI ani MCP — [Bevy's Sixth Birthday](https://bevy.org/news/bevys-sixth-birthday/)

**Wicked Engine (oddělená aplikace nad knihovnou)**
- Editor Wicked Engine je samostatný projekt nad knihovnou enginu (`Editor/Editor.xcodeproj`, `Editor_Windows`). Má konzoli Lua (klávesa Home) a `startup.lua`. Importuje OBJ/FBX/glTF a ukládá do WISCENE, „then any Wicked Engine application can open them“ — [WickedEngine README](https://github.com/turanszkij/WickedEngine)

**The Machinery (datový model a dokument)**
- The Truth ukládá data jako „objects with properties“ (bool, int, float, string, buffer, reference, podobjekt, množiny). **Autoritou jsou data v paměti** za thread-safe API, disk slouží jen jako záloha. Změny se zaznamenávají jednotně jako (objekt, vlastnost, stará hodnota, nová hodnota), takže undo, copy/paste i real-time spolupráce jsou „built into the model“. Změny se samy šíří mezi okny editoru i pluginy. Reference jdou přes unikátní ID, ne cesty. Mezi otevřenými otázkami autor uvádí **git-friendly diskový formát** a částečné načítání velkých projektů — [The Story behind The Truth](https://ruby0x1.github.io/machinery_blog_archive/post/the-story-behind-the-truth-designing-a-data-model/index.html)
- O modelu dokumentu: jediný zásobník undo pro celý projekt drží konzistentní stav a umožní vrátit hromadné operace (find-and-replace, přejmenování), jen může vrátit změnu v už zavřeném dokumentu. Při spolupráci se zásobníky znovu dělí podle uživatele. Konfigurovatelné workflow autor zavrhuje: „Applications should be opinionated!“ — [The Document Model and The Machinery](https://ruby0x1.github.io/machinery_blog_archive/post/the-document-model-and-the-machinery/index.html)
- Hot reload DLL: stav pluginu žije v jedné struktuře, která se při reloadu zkopíruje přes `memcpy`. API jsou struktury ukazatelů na funkce v registry, „to patch an API we just replace all the function pointers“. Rozbije ho změna layoutu objektů, inlinované funkce a breakpointy se nepřenesou. Na Windows zamyká Visual Studio soubory `.pdb`. Kód cest, které běží jen při reloadu, skrývá chyby, proto ho autor doporučuje zařadit do testů — [DLL Hot Reloading in Theory and Practice](https://ruby0x1.github.io/machinery_blog_archive/post/dll-hot-reloading-in-theory-and-practice/index.html)
- Archiv The Machinery obsahuje sérii o vlastním IMGUI pro editor („One Draw Call UI“, „UI rendering using Primitive Buffers“, „DPI-aware IMGUI“, „Keyboard Focus and Event Trickling in Immediate Mode GUIs“, „Implementing drag-and-drop in an IMGUI“) a sérii „Borderland between Rendering and Editor“ (picking, zvýraznění výběru) — [Machinery blog archive](https://ruby0x1.github.io/machinery_blog_archive/)

**Unreal (undo u AI nástrojů)**
- Podle zdroje od prodejce konkurenčního pluginu je každé volání nástroje oficiálního Epic MCP „typically one operation with one undo entry“. Chybí transakční vícekrokové provádění a čtení Blueprint grafů je omezené — [StraySpark (prodejce, zaujatý)](https://www.strayspark.studio/blog/epic-official-mcp-plugin-ue5-8-vs-third-party)

### Inferences
- **Jedna, nebo dvě binárky.** Godot i Wicked oddělují editorový kód od runtime (build flag, nebo samostatný projekt). Bevy staví editor jako „normal app“ nad stejnými knihovnami. Pro nás z toho plyne `wz_run` (hra, bez editorového kódu) a `wz_studio` (stejné statické knihovny + `eng_editor` + `eng_mcp` + ImGui). Herní DLL je pro obě binárky stejná. Studio ji nahraje stejným loaderem jako `app`, takže hot reload z M5 funguje i ve studiu.
- **Play-in-editor.** Doporučuji dva režimy. (a) **Edit/Preview v procesu studia**: svět, generátory a kamera bez herní logiky. Na tom stojí 90 % práce art directora: posuvníky, kontaktní archy, průlet. (b) **Play jako podproces** `wz_run --project P --debug-server <socket>`, připojený přes ladicí server z D17. Studio pak ukazuje vzdálený stav (jako Remote v Godotu) a MCP nástroje se přes studio přepošlou do hry. Důvody: pád herní DLL neshodí studio (Fyrox), headless CI používá stejnou cestu jako Play a determinismus replaye nezávisí na stavu editoru. In-process „Simulate“ po vzoru Unreal PIE lze doplnit později. Vyžaduje ale, aby herní stav žil v `game_memory` (pravidlo Handmade Hero, které návrh už má).
- **Datový model.** The Truth má paměť jako autoritu, a proto řeší git-friendly formát až dodatečně. My máme recepty v textu v gitu (D8, Procedurální grafika). Proto doporučuji **opačný směr: autoritou jsou soubory receptů a v paměti je jen jejich parsovaný stín.** Každá změna, ať z panelu, z MCP, nebo z editoru textu, jde přes jedno API `recipe_patch(doc, path, old, new)`. Záznam má stejný tvar (objekt, vlastnost, stará, nová) jako v The Truth, takže z něj dostaneme undo, popisky v historii i diff pro review. Undo zásobník je jeden pro celý projekt, jak doporučuje Machinery, a **každý záznam nese autora (owner / ai:claude / file-watch)**. Vlastník tak vidí a jedním klikem vrátí, co změnil agent.
- **Co art director reálně potřebuje** (D8, D11: žádné modelování, vlastník specifikuje a schvaluje):
  1. **Viewport** s volnou kamerou, presety kamer z review (zepředu, 3/4, za autem, z ulice), referenční figurínou a mřížkou 1 m podle D16 a ladicími pohledy (albedo, normály, buňky, LOD, hustota texelů).
  2. **Prohlížeč receptů a assetů**: materiály, archetypy, buňky. Náhledem je poslední kontaktní arch z cache.
  3. **Panel parametrů generovaný ze schématu** generátoru (posuvníky, enumy, seed, výběr z palety), který zapisuje recept. Procedurální rešerše to už předpokládá („panely jen zapisují recepty“).
  4. **Kontaktní arch a A/B review**: 16 seedů, varianta A proti B, asset vedle reference vlastníka ve stejném měřítku a světle. Tlačítka **Schválit / Zamítnout / Poznámka** zapisují do `review/` a schválení posune golden hash.
  5. **Stav kvality**: linty, golden hashe, čas generování buňky.
  6. **Poznámky ve světě**: klik do viewportu připíchne poznámku s pozicí, kamerou a screenshotem („tahle střecha je moc plochá“). Je to hlavní kanál od vlastníka k Claudovi a MCP ji vystaví jako resource.
  7. **Konzole, log, CVars** (z D17).
  Gizmo pro ruční umisťování objektů, editace křivek a node graf přijdou až s potřebou ručních přepisů (razítka a masky v `content/world/`).

### Gaps
- Architekturu editorů Flax a Hazel jsem kvůli vyčerpanému vyhledávání neověřil.
- Jestli Godot 4.4+ vkládá okno běžící hry do editoru („Game“ view), přičemž hra zůstává samostatným procesem, stránka o ladění nepopisuje.
- Proč skončilo Our Machinery a jak autoři The Truth hodnotili zpětně, jsem nezjistil (stránka o ukončení vrátila 404). Článek o The Truth píše, že na post-mortem je „still a bit too early“.

---

## 2. MCP v enginech 2025–2026 a návrh MCP serveru pro náš engine

### Takeaway
K listopadu 2026 mají vestavěný MCP server tři velké editory: **Roblox Studio** (stdio spouštěč, asi 25 nástrojů), **Unreal 5.8** (experimentální, HTTP na `127.0.0.1:8000/mcp`, bez autentizace, nástroje hledané přes meta-nástroje) a **Unity** (stdio relay a socket do editoru, ovšem dokumentace 2.19 ho už vede jako deprecated ve prospěch Unity CLI). Godot a Blender mají jen komunitní mosty (addon v editoru, TCP nebo UDP na localhostu a samostatný MCP proces). Oficiální C/C++ SDK neexistuje, ale JSON-RPC nad stdio je pro C17 s yyjson malá práce. Doporučený tvar: **malý stdio spouštěč `wzmcp`**, který Claude Code startuje z `.mcp.json` projektu. Spouštěč najde běžící studio (unix socket nebo named pipe ladicího serveru z D17), nebo spustí headless engine. **Nástroje registruje engine, asi 30 nástrojů v 8 sadách.** Vracejí strojové digesty a cesty k obrázkům, ne obrázky inline. Dlouhé operace běží jako úlohy (tasks) a každá mutace je jeden záznam undo.

### Cited Findings
**Roblox Studio (vestavěný, nejúplnější vzor pro hru)**
- Nástroje oficiálního serveru: skripty (`script_read`, `multi_edit`, `script_search` max. 10, `script_grep` max. 50 shod), generování (`generate_mesh`, `generate_material`, `generate_procedural_model`, `wait_job_finished`), assety (`search_asset`, `insert_asset`, `upload_image`, `store_image`), datový model (`search_game_tree` jako plochý JSON s filtry, `inspect_instance`), `execute_luau`, playtest (`get_studio_state`, `start_stop_play`, `get_console_output`, `screen_capture` s volitelnou pozicí a cílem kamery), simulace vstupu (`character_navigation`, `user_keyboard_input` volitelně mířený na UI instanci, `user_mouse_input`), dokumentace (`http_get` jen na povolené URL dokumentace Roblox, `skill`), `subagent` (typy `explore`/`playtest`) a `list_roblox_studios` — [Roblox docs: Studio MCP](https://create.roblox.com/docs/en-us/studio/mcp.md) (stránka aktualizovaná 2026-11-05)
- Transport je stdio přes lokální spouštěč (`/Applications/RobloxStudio.app/Contents/MacOS/StudioMCP`, na Windows `%LOCALAPPDATA%\Roblox\mcp.bat`). Quick connect funguje pro Claude Code, Codex CLI, Cursor, Gemini CLI, VS Code a další. **Každé volání nese `studio_id`**, takže cíl je explicitní, ne vázaný na session. `multi_edit` a `execute_luau` vyžadují `datamodel_type` Edit, Client nebo Server. Bezpečnostní model se omezuje na varování „connect only trusted clients“, schvalování jednotlivých akcí nemá — [tamtéž](https://create.roblox.com/docs/en-us/studio/mcp.md)
- Dřívější samostatný server v Rustu (`start_stop_play`, `get_studio_mode`, `insert_model`, `run_code`) se už „no longer being actively developed in favor of the built-in server“ — [Roblox/studio-rust-mcp-server](https://github.com/Roblox/studio-rust-mcp-server)

**Unreal Engine 5.8 (Epic, experimentální, 06/2026)**
- Server v editoru podporuje jen HTTP a SSE („The `stdio` and WebSocket transports are not supported“). Výchozí endpoint je `http://127.0.0.1:8000/mcp`. **Loopback a odmítání ne-loopback `Origin`, žádná autentizace**, „not safe to expose beyond the local machine“ — [Epic docs: Unreal MCP in Unreal Editor](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-mcp-in-unreal-editor)
- Nástroje se definují jako toolsety: C++ `UToolsetDefinition` s `UFUNCTION(meta=(AICallable))` (nová funkce vyžaduje restart editoru, Live Coding je nepropaguje), nebo Python `unreal.ToolsetDefinition` s dekorátorem `@toolset_registry.tool_call`, kde JSON Schema vzniká z type hintů a docstringů. Mezi vestavěné patří `SceneTools`, `ActorTools`, `MaterialInstanceTools` a `ObjectTools` — [tamtéž](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-mcp-in-unreal-editor)
- **Tool search je zapnutý ve výchozím stavu**: `tools/list` vrací tři meta-nástroje `list_toolsets`, `describe_toolset` a `call_tool`. Resources ani Prompts zatím nevystavuje žádný toolset. **Volání běží sériově na game threadu** („clients should not issue overlapping calls“). Konzolový příkaz `GenerateClientConfig` zapíše `.mcp.json` do kořene projektu pro Claude Code — [tamtéž](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-mcp-in-unreal-editor)
- Komunitní a komerční servery jdou do šířky: StraySpark uvádí 455 nástrojů v 64 kategoriích, „catalog mode“, transakční skripty, bearer autentizaci se scope a obranu proti DNS rebindingu (zdroj je prodejce) — [StraySpark](https://www.strayspark.studio/blog/epic-official-mcp-plugin-ue5-8-vs-third-party). Podle reportáže ze State of Unreal 2026 má UE6 (early access koncem 2027) postavit „open MCP foundation“ jako základní infrastrukturu — [Unreal Engine news](https://www.unrealengine.com/news/state-of-unreal-2026-top-news-from-the-show) (převzato ze souhrnu vyhledávání, stránku jsem nečetl)

**Unity**
- Architektura: AI klient spustí přes stdio relay (`~/.unity/relay/`, příznak `--mcp`). Relay se připojí k MCP bridge v editoru přes lokální IPC (pipes na Windows, unix sockety na macOS a Linuxu). Bridge směruje volání do `McpToolRegistry`. Vlastní nástroje se registrují atributy, rozhraními nebo za běhu, každý s názvem, popisem, vstupy a volitelným output schema. Přímí klienti potřebují **schválení v Project Settings** (zapamatuje se), spojení přes „AI gateway“ se schvalují automaticky. **Dokumentace 2.19 uvádí: „Unity MCP server is deprecated. Use the Unity command-line interface (CLI) instead.“** — [Unity AI Assistant 2.19: Unity MCP overview](https://docs.unity3d.com/Packages/com.unity.ai.assistant@2.19/manual/integration/unity-mcp-overview.html)

**Godot a Blender (komunitní mosty)**
- Godot MCP Pro (placený) inzeruje 175 nástrojů a oddělené `get_editor_screenshot` a `get_game_screenshot` — [youichi-uda/godot-mcp-pro](https://github.com/youichi-uda/godot-mcp-pro). Godot MCP Runtime při `run_project` vloží do projektu autoload `McpBridge` s UDP kanálem na portu 9900 (jen localhost) a umí `background: true` — [godot-mcp-runtime](https://chat.mcp.so/server/godot-mcp-runtime/Erodenn?tab=tools). Server Coding-Solo nabízí `launch_editor`, `run_project`, `stop_project` a `capture_screenshot`, přičemž screenshot je podle README „experimental“ — [mcp.directory: godot-mcp](https://mcp.directory/servers/godot-mcp). IvanMurzak/Godot-MCP rozlišuje screenshot viewportu, kamery a izolovaného uzlu — [Godot-MCP wiki](https://github.com/IvanMurzak/Godot-MCP/wiki)
- Blender MCP: addon spustí v Blenderu socket server (výchozí `localhost:9876`, „Plain UTF-8 JSON over TCP — no length prefix“, `{"type":..., "params":...}`). Nástroj `execute_blender_code` posílá libovolný Python a projekt sám varuje, že je to „potentially dangerous“. Server se musí zapnout ručně v panelu addonu při každém sezení — [Glama: execute_blender_code](https://glama.ai/mcp/servers/ahujasid/blender-mcp/tools/execute_blender_code), [Hermes docs: Blender MCP](https://hermes-agent.nousresearch.com/docs/user-guide/skills/optional/creative/creative-blender-mcp)

**Zkušenosti vlastníka z godot-mcp (lokální skill, primární zdroj praxe)**
- „Driving a game through an agent is not like driving it by hand: tens of seconds of model latency can pass between two tool calls“. Řešením je `freeze`/`step`/`step_until(predicate)`/`thaw` a timeline vstupů *uvnitř* krokovaného okna. Události vstříknuté během zmrazení by jinak minuly hranu „just pressed“. Stav se nastavuje přes `godot_exec`. Ověřuje se **z digestu stavu, ne z pixelů**: entity se tagují do skupiny `mcp_watch` a `_mcp_state()` vrací živé hodnoty i statický kontext (~1 KB). `watch_start`/`watch_collect` shrnují pole v čase (min, max, průměr, sklon) a každou ztrátu dat hlásí. **Jeden snímek 1280×720 stojí ~1 200 tokenů a zůstává v kontextu po celou session**, proto se vizuální kontroly delegují na subagenty. Chyby editoru a chyby běžící hry jsou dva oddělené kanály — `~/.claude/skills/godot-game-testing/SKILL.md` (lokální soubor vlastníka)

**Specifikace MCP (verze a co z nich použít)**
- 2025-06-18: odstraněno JSON-RPC batching, přibyly **structured tool output**, **elicitation**, **resource links** ve výsledcích nástrojů, hlavička `MCP-Protocol-Version` pro HTTP, pole `title` vedle programového `name` a `_meta` u dalších typů — [MCP changelog 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/changelog)
- 2025-11-25: ikony nástrojů a resources, guidance k názvům nástrojů, URL elicitation, nástroje v samplingu, **experimentální tasks** (polling a odložený výsledek), servery smí na stdio logovat do stderr, **neplatný `Origin` musí dostat HTTP 403**, chyby validace vstupu se vracejí jako Tool Execution Error, aby se model mohl opravit, a výchozím dialektem je JSON Schema 2020-12 — [MCP changelog 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/changelog)
- **2026-07-28 (aktuální):** odstraněny protokolové sessions a `Mcp-Session-Id`. MCP je bezstavový, handshake `initialize` zmizel a verze s capabilities jdou v `_meta` každého požadavku. Povinné je `server/discover`, které klient smí použít i jako „backward-compatibility probe on STDIO“. Přibylo `subscriptions/listen`. Tasks se přesunuly do rozšíření `io.modelcontextprotocol/tasks` (polling `tasks/get`, `tasks/update`). Server-initiated requesty nahradil vzor Multi Round-Trip Requests (`resultType: "input_required"`). Odstraněna je resumovatelnost SSE. **Servery „SHOULD return tools from `tools/list` in a deterministic order“ kvůli prompt cache.** Seznamy mají `ttlMs` a `cacheScope`. Jako deprecated jsou vedené Roots, Sampling a Logging („log to stderr … or use OpenTelemetry“) i HTTP+SSE transport. Stav napříč voláními se má předávat „explicit, server-minted handles passed as ordinary tool arguments“ — [MCP changelog 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- Oficiální SDK pro 2026-07-28 jsou TypeScript, Python, C#, Go, Rust, Ruby (Tier 1), Java (Tier 2), Swift, PHP a Kotlin (Tier 3). **C ani C++ SDK mezi nimi není** — [MCP SDKs](https://modelcontextprotocol.io/docs/2026-07-28/sdk.md)

**Claude Code jako hlavní klient (limity, které určují návrh nástrojů)**
- Transporty: stdio, HTTP (`streamable-http`), WebSocket (jen v `.mcp.json`). SSE je deprecated. Projektový `.mcp.json` se commituje a interaktivní sezení se před použitím zeptá. Stdio server dostane v prostředí `CLAUDE_PROJECT_DIR`. Timeout lze nastavit pro každý server (`"timeout"`) — [Claude Code docs: MCP](https://code.claude.com/docs/en/mcp)
- Výstup: varování nad **10 000 tokenů**, výchozí limit **25 000 tokenů** (`MAX_MCP_OUTPUT_TOKENS`). Textový výsledek nad **50 000 znaků** se uloží do souboru, pokud nástroj nedeklaruje `_meta["anthropic/maxResultSizeChars"]` (strop 500 000). Obrázky PNG, JPEG, GIF a WebP vidí Claude inline (případně zmenšené) a originál se uloží do `tool-results` — [tamtéž](https://code.claude.com/docs/en/mcp)
- Čas: idle timeout bez odpovědi nebo progress notifikace je **5 min u HTTP a 30 min u stdio**. Volání delší než **2 min** přejde na úlohu na pozadí. **MCP tasks (veřejná beta, Claude Code v2.1.304+)**: server může na `tools/call` odpovědět objektem úlohy (`taskId`, `status` working, input_required, completed, failed nebo cancelled, `pollIntervalMs` 250–30 000), pokud požadavek nese rozšíření `io.modelcontextprotocol/tasks` — [tamtéž](https://code.claude.com/docs/en/mcp)
- **Tool search je výchozí**: na začátku sezení se načtou jen názvy nástrojů a server instructions. Server instructions a popisy upfront nástrojů se uříznou na **4 096 znaků**, popisy nástrojů načtených přes tool search na **16 384 znaků**, a „put the words Claude would search for near the start“. `_meta["anthropic/alwaysLoad"]` načte nástroj hned. `_meta["anthropic/requiresUserInteraction"]: true` vynutí potvrzení člověkem při každém volání, a to i v režimech auto a bypass. Resources jdou zmínit přes `@server:proto://cesta` a Claude Code k nim sám přidá list/read nástroje. `list_changed` vede k novému načtení seznamu bez reconnectu. V2 runtime používá revizi 2026-07-28, stdio channel servery lze držet na starém handshaku přes `MCP_PROTOCOL_NEGOTIATION=legacy`. Elicitation funguje jen v interaktivním terminálu — [tamtéž](https://code.claude.com/docs/en/mcp)

**JSON v C**
- yyjson: ANSI C89, jeden pár `.h`/`.c`, licence MIT, parsování a serializace v řádu GB/s (benchmark 2020). Imutabilní dokumenty doplňuje mutabilní API pro stavbu. README uvádí JSON Pointer, JSON Patch a Merge Patch mezi funkcemi, ale v TODO pro 1.0 má JSON Pointer neodškrtnutý, takže si stránka odporuje. Podporuje vlastní alokátor — [ibireme/yyjson](https://github.com/ibireme/yyjson)

### Inferences
**Transport a proces.** Roblox (stdio spouštěč) i Unity (stdio relay → socket) volí stejný vzor: Claude Code startuje malý stdio proces a ten mluví s dlouho žijícím editorem přes lokální IPC. Epic volí HTTP v editoru, za cenu nutnosti hlídat port, `Origin` a autentizaci. Pro nás doporučuji:
- **`wzmcp`** jako malé C17 EXE (stdio JSON-RPC). (1) Najde běžící `wz_studio` daného projektu přes `.wz/session.json` (cesta k unix socketu nebo named pipe ladicího serveru z D17, náhodný token). (2) Když studio neběží, spustí headless `wz_run --headless --project P` nebo `gencli serve`, takže stejné nástroje fungují v CI i bez okna. (3) Přeposílá rámce. Logika nástrojů žije v enginu, ne ve `wzmcp`.
- Unix socket s právy 0600 v `.wz/` dává lokální přístup bez otevřeného portu. Tím odpadá třída útoků přes Origin a DNS rebinding, kterou Epic řeší jen loopbackem. Streamable HTTP na `127.0.0.1` s tokenem a kontrolou `Origin` (403 podle 2025-11-25) přidat jen kvůli klientům, kteří stdio neumí.
- Protokol: primárně 2025-11-25 (stdio `initialize`) a k tomu **`server/discover` a čtení `_meta` podle 2026-07-28**. Bezstavový návrh se nám hodí, protože stav (kamera, úloha, A/B porovnání) se stejně předává jako explicitní handle v argumentech. Roblox totéž dělá se `studio_id`.
- **Interní protokol ladicího serveru z D17 má mít tvar volání MCP nástroje** (`{"tool": name, "args": {...}}` → `{content, structuredContent, isError}`). Jedna registry nástrojů pak obslouží MCP, konzoli studia i skripty v CI.

**Registry nástrojů v C** (tvar API po vzoru The Machinery):
```c
typedef struct eng_tool_desc {
    const char *name;          /* "gen_contact_sheet" – klíčová slova na začátek popisu */
    const char *title;
    const char *description;   /* ≤ ~1 500 znaků; první věta = kdy nástroj použít */
    const char *input_schema;  /* JSON Schema 2020-12, generované z tabulky parametrů */
    const char *output_schema; /* pro structuredContent */
    uint32_t    flags;         /* TOOL_READ_ONLY | TOOL_MUTATES (=undo záznam) | TOOL_LONG (=task)
                                  | TOOL_MAIN_THREAD | TOOL_NEEDS_OWNER (=requiresUserInteraction)
                                  | TOOL_PLAY_ONLY | TOOL_EDIT_ONLY */
    eng_tool_result (*call)(const struct eng_tool_args *a, struct eng_tool_ctx *ctx);
} eng_tool_desc;
void eng_tools_register(const eng_tool_desc *d);  /* volá runtime/editor/hra (composition root) */
```
- Volání se řadí do fronty a hlavní vlákno je provede **mezi snímky**. Epic je také serializuje na game threadu. Read-only dotazy smí běžet nad snímkem stavu z FrameParams.
- Herní DLL smí registrovat vlastní nástroje přes `eng_api->debug` (např. `game_state` jako náš `_mcp_state()`). Po hot reloadu se registrace obnoví a server pošle `list_changed`. Epic tohle neumí, protože nové `UFUNCTION` vyžadují restart.
- Seznam nástrojů vracet v deterministickém pořadí (2026-07-28, prompt cache).

**Navržená sada nástrojů (asi 30, 8 toolsetů).** Názvy jsou ploché, tool search Clauda je najde. Meta-nástroje à la Epic (`list_toolsets`/`call_tool`) mají smysl až nad zhruba 80 nástroji.

| Toolset | Nástroj | Vstup → výstup (structuredContent) | Pozn. |
|---|---|---|---|
| session | `wz_status` | – → projekt, verze enginu a API, režim edit/play, snímek, pauza, fronta jobů, počty chyb a varování od posledního volání, otevřené review poznámky | „digest“, volat první; `alwaysLoad` |
| project | `project_build` | target(s) → chyby kompilátoru strukturovaně (soubor, řádek, zpráva) | TOOL_LONG (task), progress |
| | `project_reload` | {game, gen, shaders} → co se přenačetlo, zneplatněné hashe | hot reload z M3/M5 |
| gen | `gen_list` | filtr → generátory, verze, schéma parametrů (odkaz na resource) | |
| | `gen_run` | asset, patch parametrů, seeds → hashe výstupů, časy, počty tri/texelů, linty | bez obrázků |
| | `gen_contact_sheet` | asset, seeds, views, debug views, `ref` → **cesta k PNG + resource link**, volitelně miniatura ≤512 px | obrázek inline jen na požádání |
| | `gen_compare` | A, B (parametry nebo commit) → arch A/B + rozdíly metrik | A/B review |
| recipe | `recipe_get` / `recipe_patch` | cesta, JSON patch → nový hash, undo id, diff | TOOL_MUTATES |
| quality | `lint_run` | scope → seznam porušení (pravidlo, asset, hodnota, mez) | |
| | `golden_check` | sada → shody a neshody (CPU hash, GPU obraz s tolerancí) | |
| | `golden_accept` | asset, hash → zapíše golden | **TOOL_NEEDS_OWNER** |
| world | `world_query` | bbox nebo buňky, filtr archetypů → počty, ID, LOD stav, časy generování buněk | stránkování |
| | `world_inspect` | handle nebo ID → archetyp, recept, transformace, materiály, původ (pack/cache/gen) | |
| | `world_pick` | pixel nebo paprsek → hit (handle, buňka, vzdálenost) | spojuje screenshot s daty |
| view | `camera_set` | pozice/cíl/fov nebo preset → handle kamery | |
| | `screenshot` | kamera, velikost (výchozí 768 px), debug pohled, overlay (mřížka, figurína) → cesta + volitelně inline | |
| time | `time_control` | freeze / step N / step_until(výraz nad cvars nebo stavem) / thaw, timeline vstupů → stav na konci | vzor z godot-mcp |
| debug (D17) | `cvar_get` / `cvar_set` | jméno, hodnota → stará a nová hodnota | |
| | `log_tail` | kanál, úroveň, kurzor → záznamy + nový kurzor | dva kanály: studio a hra |
| | `profile_snapshot` | N snímků → top zóny, rozpočty, překročení | |
| | `console_exec` | příkaz konzole → výstup | žádné libovolné C |
| play | `play_start` / `play_stop` | spawn bod, seed, replay soubor → handle hry | podproces |
| | `game_state` | select → digest herních entit (`_mcp_state` ekvivalent) | registruje herní DLL |
| ui | `ui_tree` | obrazovka → strom prvků (ID, box, text, fokus) | viz otázka 3 |
| review | `review_list` / `review_reply` | stav → poznámky vlastníka (pozice, kamera, cesta ke screenshotu, text) | |
| | `review_request` | arch, otázka → úloha čeká na rozhodnutí vlastníka ve studiu | TOOL_LONG |

- **Resources:** `wz://project/manifest`, `wz://project/style` (style bible), `wz://project/scale` (tabulka měřítek D16), `wz://gen/{id}/schema`, `wz://docs/engine/{topic}` (krátké stránky o API a konvencích), `wz://review/open`, `wz://sheet/{hash}.png`. Vlastník je může zmínit přes `@wz:` v promptu.
- **Prompts:** `review_asset` (vyrenderuj arch, porovnej s referencí, vyjmenuj odchylky), `new_generator` (kostra modulu `gen_*` + schéma + lint + golden), `fix_lint`, `scale_audit`. Unreal Prompts zatím nemá vůbec, takže jde o vlastní rozšíření.
- **Úspora tokenů:** výchozí výstup je text nebo JSON a obrázky jdou jako cesta nebo resource link. Inline obrázek až na explicitní `inline: true`. Vizuální posouzení dělá subagent (zkušenost vlastníka: ~1 200 tokenů na snímek natrvalo). Velké výpisy se stránkují kurzorem a nikdy nepřekročí 25k tokenů.
- **Bezpečnost a důvěra:** žádný nástroj typu `execute_code`, jaký mají Roblox `execute_luau` a Blender `execute_blender_code`. Únikovou cestou je, že Claude upraví zdroják a zavolá `project_build` + `project_reload`. Změna je pak v gitu a dá se zrevidovat. Zápisy jdou přes undo s autorem `ai:` a nevratné kroky (`golden_accept`, mazání) mají `requiresUserInteraction`.
- **Elicitation vs. studio:** elicitation funguje jen v interaktivním terminálu a 2026-07-28 ji přestavuje. Rozhodnutí vlastníka proto patří do UI studia (`review_request` jako task, který se dokončí kliknutím). To je přirozenější pro art directora, který sedí u studia, ne u terminálu.

### Gaps
- Přesný seznam vestavěných nástrojů Epic MCP a jeho chování k undo dokumentace neuvádí. Údaj „jeden nástroj = jeden undo záznam“ pochází od konkurenčního prodejce.
- Co je „Unity CLI“, které nahrazuje Unity MCP, a proč Unity od MCP ustoupilo, jsem kvůli vyčerpanému vyhledávání nedohledal. Je to důležitý signál (CLI místo MCP?) a stojí za ověření.
- Neověřil jsem komunitní C/C++ implementace MCP serverů. Oficiální SDK pro C/C++ chybí (ověřeno).
- Zda Claude Code u stdio serveru, který umí jen handshake 2025-11-25, sám přepne na legacy vyjednávání, dokumentace výslovně neříká. Ví se jen, že `server/discover` slouží jako probe a existuje `MCP_PROTOCOL_NEGOTIATION=legacy`. Při implementaci ověřit testem.
- Tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`) jsem v changelozích, které jsem četl, nenašel. Pravděpodobně jsou starší (2025-03-26), ale ověřené to není.

---

## 3. UI: studio a herní UI v C nad SDL_GPU, text, lokalizace, gamepad

### Takeaway
**Studio: Dear ImGui (docking) přes dear_bindings (`dcimgui`) a oficiální backendy `imgui_impl_sdl3` + `imgui_impl_sdlgpu3`.** C++ zůstane za C hlavičkou v adaptéru (D4), stejně jako u Joltu. **Hra: vlastní tenká vrstva `eng_ui` nad Clay** (C, zlib, layout ve stylu flexboxu, renderer-agnostické render commands, žádný malloc), vlastní renderer přes SDL_GPU a text přes **SDL_ttf 3 (FreeType + HarfBuzz, GPU text engine)**, nebo kb_text_shape. RmlUi (HTML/CSS) je silná záloha pro menu s velkým množstvím textu, ale přináší C++ API bez C rozhraní a jeho SDL GPU backend nemá filtry ani clip masky. Herní UI musí být od začátku **introspektovatelné strojově** (`ui_tree`) a renderovatelné headless, jinak ho AI nedokáže ověřit.

### Cited Findings
**Studio UI**
- dear_bindings generuje z `imgui.h` soubory `dcimgui.h` (C API), `dcimgui.cpp` (most do C++) a `dcimgui.json` (metadata). Podporuje větev `docking` (v0.12 přidává docking PlatformIO callbacky) a je zamýšlené jako možná náhrada cimgui (cimgui je z roku 2015, dear_bindings z roku 2021 a „may be less battle-tested“). Převod backendů je experimentální. Mezi testovanými jsou SDL2/3, příklad `example_sdl3_sdlgpu3` existuje, Metal/OSX backend vyloučen — [dearimgui/dear_bindings](https://github.com/dearimgui/dear_bindings)
- Oficiální backend `imgui_impl_sdlgpu3` umí `SDL_GPUTexture*` jako `ImTextureID` (od 2025-08-08), meshe přes 64k vrcholů s 16bitovými indexy a dynamický font atlas (`RendererHasTextures`). Volání `ImGui_ImplSDLGPU3_PrepareDrawData` **musí proběhnout před** začátkem render passu. Pole `SwapchainComposition` a `PresentMode` slouží pro multi-viewport režim — [imgui_impl_sdlgpu3.h](https://github.com/ocornut/imgui/blob/master/backends/imgui_impl_sdlgpu3.h)
- Dear ImGui Test Engine vstřikuje vstup myši, klávesnice a gamepadu, adresuje widgety cestou (`ctx->ItemClick("My Button")`), dělá screenshoty, videa a GIFy a běží headless v CI. Licence je **free pro jednotlivce, vzdělávání, open source a malé firmy**, větší firmy platí. API je jen C++ — [ocornut/imgui_test_engine](https://github.com/ocornut/imgui_test_engine)
- microui: zhruba 1 100 řádků ANSI C, MIT, pevná paměť bez alokací, okna, panely, tlačítka, posuvníky a textbox, kreslí cokoli, co umí obdélníky a text. Nové funkce autor nepřijímá („pull requests adding additional features will likely not be merged“) — [rxi/microui](https://github.com/rxi/microui)
- The Machinery si pro editor postavila vlastní IMGUI („One Draw Call UI“, DPI, fokus klávesnice, drag-and-drop) — [Machinery blog archive](https://ruby0x1.github.io/machinery_blog_archive/). Bevy staví editor na vlastním UI a widgetech Feathers — [Bevy's Sixth Birthday](https://bevy.org/news/bevys-sixth-birthday/)

**Herní UI**
- Clay: C (C99, C++20), zlib, jeden header `clay.h` o zhruba 4,8k řádcích bez závislostí. Layout ve stylu flexboxu (FIT, GROW, FIXED, PERCENT), zalamování textu, scroll kontejnery, plovoucí prvky (tooltipy, kontextová menu), aspect ratio, přechody a vestavěný debug inspektor. Výstupem je seřazené `Clay_RenderCommandArray` (obdélníky, text, obrázky, rámečky, custom, scissor). Text se měří callbackem `Clay_SetMeasureTextFunction` s cache. Slibuje „microsecond layout performance“, statickou arénu (asi 3,5 MB na 8 192 prvků) a více instancí. Omezení: renderování instancí z více vláken nepodporuje, hover používá boxy z předchozího snímku a duplicitní ID způsobí chyby — [nicbarker/clay](https://github.com/nicbarker/clay). Renderery jsou mimo jiné SDL2, SDL3, raylib, sokol, web a win32_gdi. SDL_GPU renderer v seznamu není potvrzený — [clay/renderers](https://github.com/nicbarker/clay/tree/main/renderers)
- RmlUi: C++17, MIT, závisí na FreeType (vyměnitelný font engine). RML/RCSS, datové vazby (MVC), animace, transformace, flexbox, media queries, dekorátory, **lokalizace, šablony, prostorová navigace pro ovladače** a Lua plugin. Backendy OpenGL 2/3, Vulkan, **SDL GPU (bez filtrů, clip masek a shaderů)** a DirectX 11/12. C API dokumentace nezmiňuje — [mikke89/RmlUi](https://github.com/mikke89/RmlUi)

**Text**
- SDL_ttf 3.0 závisí na FreeType, **HarfBuzz**, PlutoSVG a PlutoVG a sám má licenci zlib — [libsdl-org/SDL_ttf](https://github.com/libsdl-org/SDL_ttf). `TTF_CreateGPUTextEngine(SDL_GPUDevice*)` vytvoří text engine pro kreslení přes SDL GPU (od SDL_ttf 3.0.0, volat na vlákně, které vytvořilo device) a data pro kreslení vrací `TTF_GetGPUTextDrawData` — [SDL3_ttf wiki](https://wiki.libsdl.org/SDL3_ttf/TTF_CreateGPUTextEngine)
- kb_text_shape: jeden header, zlib. Umí segmentaci Unicode (směr, řádek, písmo, slovo, grafém, srovnáváno s ICU), OpenType shaping „Harfbuzz-like“ (arabština, hindština, khmerština a další) a kontrolu pokrytí fontem. **Nerasterizuje** a nedělá layout odstavců, výsledkem je jeden nekonečný řádek — [JimmyLefevre/kb](https://github.com/JimmyLefevre/kb)

**UI ověřitelné agentem (precedenty)**
- Roblox MCP umí mířit `user_keyboard_input` a `user_mouse_input` na konkrétní UI instanci — [Roblox docs](https://create.roblox.com/docs/en-us/studio/mcp.md). Epic toolsety umějí „inspecting Slate widgets“ — [Epic docs](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-mcp-in-unreal-editor). ImGui Test Engine adresuje widgety cestou — [imgui_test_engine](https://github.com/ocornut/imgui_test_engine)

### Inferences
- **(a) Studio = Dear ImGui.** Má hotový docking, tabulky, color pickery a plotting, existuje oficiální SDL_GPU backend a dear_bindings poskytuje C API. Velkou výhodou je, že ImGui kód je v trénovacích datech LLM velmi hojný, takže ho Claude píše spolehlivě (úsudek, neměřeno). Vlastní IMGUI à la Machinery by znamenal měsíce práce bez výtvarného přínosu. microui je na studio s dockingem a tabulkami příliš malé, ale hodí se jako nouzové overlay UI v `wz_run` bez C++. Test Engine je licenčně v pořádku pro jednotlivce nebo malou firmu. Jeho API je C++, takže by běžel v adaptéru, a pro MCP stačí `ui_tree` nad ImGui ID.
- **(b) Hra = Clay + vlastní `eng_ui`.** HUD ve stylu GTA III a WoW (rámečky z 9-slice textur, minimapa, ikony akcí, nameplaty nad postavami) potřebuje stylovatelné texturované prvky, animace a ovládání gamepadem. To ImGui nedává. Clay dává layout v C bez alokací a render commands, které umíme kreslit vlastním SDL_GPU passem. Texturové a paletové styly přijdou ze style bible, takže UI generuje kód stejně jako zbytek grafiky (D8). Nad Clay doplníme: fokus a gamepadovou navigaci (graf sousedů z boxů), tabulky lokalizačních řetězců s ID, prvky ukotvené ve světě (projekce 3D bodu, ořez), DPI a safe area a **`ui_tree` dump pro MCP** (ID, box, text, fokus, viditelnost) jako UI ekvivalent digestu stavu.
- **Kdy RmlUi:** pokud hra dostane hodně menu s formuláři, inventářem a dialogy a vlastník chce markup podobný HTML a CSS. Ten AI generuje dobře a umí ho číst i člověk. Cenou je C++ API za adaptérem, FreeType a backend SDL GPU bez clip masek. Rozhodnutí odložit na M5 a nejdřív postavit HUD v Clay.
- **Text:** SDL_ttf 3 je nejkratší cesta (shaping přes HarfBuzz, GPU text engine, stejný ekosystém jako SDL3). Studio používá vlastní font atlas ImGui. Pro herní UI, kde jsou potřeba ostré titulky při libovolném měřítku, zvážit MSDF atlas (neověřeno). kb_text_shape je alternativa bez FreeType a HarfBuzz (zlib, jeden header), ale rasterizaci musí dodat někdo jiný.
- **Determinismus UI:** layout Clay je čistá funkce vstupů, takže headless snímek HUD do PNG s golden obrázkem funguje stejně jako u assetů.

### Gaps
- Nuklear, Noesis, msdf-atlas-gen ani stb_truetype jsem kvůli vyčerpanému vyhledávání neověřil, takže zde nejsou fakta o jejich licencích a funkcích.
- Nevím, jestli existuje hotový renderer Clay pro SDL_GPU. Adresář `SDL3` existuje, ale nečetl jsem ho.
- Výkon SDL_ttf GPU text engine (velikost atlasu, SDF) ani podporu BiDi jsem neověřil.

---

## 4. Systém projektů: struktura, šablony, pinování verze enginu, vstup nastavení do enginu, kontext pro AI

### Takeaway
Převzít od Godotu **jediný kořenový manifest a souborový systém „tak, jak je“** bez databáze assetů, od Unrealu **oddělení `Config/` přepisujícího výchozí hodnoty enginu a smazatelných `Saved/` a `Intermediate/`**, od Fyroxu a Bevy (Jackdaw) **šablonu a „project creator“**, na které závisí Play. Projekt Wallhammer Zero je složka s `wz.project` (manifest: verze `eng_api`, tvar světa D15, herní DLL, gen-packy, výchozí CVars), `style/` (style bible a tabulka měřítek D16, které vstupují do Merkleho klíče), `content/`, `game/`, `review/`, `CLAUDE.md` a `.mcp.json`. Kontext pro AI dodávají tři vrstvy: `CLAUDE.md` (pravidla), MCP resources (živá data: style, scale, schémata, review) a server instructions (jak nástroje používat, do 4 096 znaků).

### Cited Findings
- Godot: `project.godot` v kořeni projektu. „Godot is scene-based in nature, and uses the filesystem as-is, without metadata or an asset database.“ Doporučuje snake_case kvůli citlivosti na velikost písmen při exportu na Linux, třetí strany do `addons/` a prázdný `.gdignore`, kterým složku vyřadí z importu — [Godot docs: Project organization](https://docs.godotengine.org/en/stable/tutorials/best_practices/project_organization.html)
- Unreal: `Config/` (výchozí nastavení hry, „override the engine's Config“), `Content/`, `Source/` (modul na adresář), `Plugins/` (vlastní zdroje, binárky a `.uplugin`, smějí obsahovat assety), `Saved/` a `Intermediate/` („can be deleted and rebuilt“) a `DerivedDataCache/`. `Default.uprojectdirs` hledá projekty v podadresářích — [Epic docs: Directory structure](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-directory-structure)
- Fyrox: Play mode funguje jen pro projekty z `fyrox-template` nebo s podobnou strukturou — [Fyrox book](https://fyrox-book.github.io/beginning/editor_overview.html). Bevy Jackdaw obsahuje „a project manager / creator“ — [Bevy's Sixth Birthday](https://bevy.org/news/bevys-sixth-birthday/). Godot má Project Manager (`project_manager.cpp`) jako součást editoru — [Godot editor dev](https://docs.godotengine.org/en/latest/engine_details/editor/introduction_to_editor_development.html)
- Verzování API: The Machinery a návrh `eng_api` (`uint32_t version`) verzují API struktury ukazatelů na funkce. Hot reload rozbije změna layoutu dat — [Machinery: DLL hot reloading](https://ruby0x1.github.io/machinery_blog_archive/post/dll-hot-reloading-in-theory-and-practice/index.html)
- Kontext pro AI: Unreal generuje `.mcp.json` do kořene projektu (`GenerateClientConfig`) — [Epic docs](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-mcp-in-unreal-editor). Claude Code čte projektový `.mcp.json` (commitovaný, schvaluje se), stdio serveru předá `CLAUDE_PROJECT_DIR` a resources lze zmínit přes `@` — [Claude Code docs: MCP](https://code.claude.com/docs/en/mcp). Roblox má nástroj `skill`, který vrací best practices, a `http_get` omezený na dokumentaci — [Roblox docs](https://create.roblox.com/docs/en-us/studio/mcp.md)
- Spec 2026-07-28 vede Roots jako deprecated a doporučuje „pass directories or files via tool parameters, resource URIs, or server configuration instead“ — [MCP changelog 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/changelog)

### Inferences
**Navržená struktura** (monorepo v rané fázi, D6 soběstačnost):
```
wallhammerzero/
├─ engine/                     # src/, tools/, external/, tests/ (z architektury)
│  └─ templates/{city,planet,empty}/   # šablony projektů pro `wz new`
└─ projects/<hra>/
   ├─ wz.project               # manifest (stejný KV formát jako recepty)
   ├─ CLAUDE.md                # pravidla pro AI v této hře: odkazy na style/scale, zakázané věci, workflow
   ├─ .mcp.json                # { "wz": { "command": "../../engine/build/bin/wzmcp", "args": ["--project","."] } }
   ├─ style/style.cfg          # style bible jako kód (palety, rampy, zkosení, zapečené světlo)
   ├─ style/scale.cfg          # tabulka měřítek D16 + odchylky stylizace
   ├─ style/references/        # reference vlastníka (obrázky + popis, co se z nich bere)
   ├─ content/                 # recepty: materials/, archetypes/, world/{stamps,masks,overrides}
   ├─ source_images/           # AI obrázky D14 + .provenance
   ├─ gen/                     # volitelné generátory specifické pro hru (gen-pack DLL)
   ├─ game/                    # herní DLL (vidí jen engine_api.h)
   ├─ ui/                      # HUD a menu (C + datové layouty)
   ├─ config/                  # výchozí CVars (přepisují výchozí hodnoty enginu, jako Unreal Config/)
   ├─ review/                  # schválení, poznámky vlastníka, rozhodnutí A/B (v gitu)
   ├─ tests/golden/            # hashe a obrázky pro tuto hru
   ├─ cache/  (gitignore)      # Merkle cache
   └─ .wz/    (gitignore)      # session.json (socket, token, PID), logy, crash dumpy – smazatelné jako Saved/
```
- **`wz.project`** obsahuje: `name`, `id`, `engine_api = 3` (hlavní verze `eng_api` a formátu blobů; engine odmítne nekompatibilní projekt srozumitelnou chybou), `engine_rev` (git SHA, pro reprodukovatelnost golden hashů), `world_shape = flat_grid | cube_sphere` (D15 port), `cell_size`, `game_module = game`, `gen_packs = [...]`, `startup_world`, `default_camera`, `platforms`.
- **Jak nastavení teče do enginu:** `runtime_init(project)` načte manifest → připojí VFS kořeny `wz://engine/` a `wz://project/` → načte `style.cfg` a `scale.cfg` do konstantních bloků `gen_core`. Jejich hashe jsou ve vstupu Merkleho klíče, takže změna měřítka zneplatní přesně to, co na něm závisí. → zaregistruje gen-packy v `gen_provider` → nahraje herní DLL → aplikuje `config/` CVars → registruje nástroje (engine, editor, hra).
- **Pinování verze:** v monorepu stačí `engine_api` a CI, které staví a testuje všechny projekty (golden hashe každé hry) při každé změně enginu. To je jediná ochrana obecného enginu (D15) před ohnutím pro jednu hru. Až budou projekty v samostatných repech, přejít na engine jako git submodul s pevným SHA. Vlastní launcher s mapou verzí není potřeba.
- **Druhý projekt hned:** šablony `city` a `planet` (D15) vytvořit už v M3 nebo M4, i jako prázdné. Testují, že nic z města neprosáklo do enginu, a ověří `wz new`.
- **Kontext pro AI ve třech vrstvách:** (1) `CLAUDE.md` v projektu, krátký: odkazy, pravidla, jak spustit review. (2) MCP resources `wz://project/style`, `wz://project/scale`, `wz://gen/{id}/schema`, `wz://review/open` jsou živá data, která se mění s projektem. Claude je čte nástrojem a vlastník je může zmínit přes `@`. (3) Server instructions (do 4 096 znaků) popisují pořadí práce: `wz_status` jako první, obrázky přes subagenta, mutace přes `recipe_patch`. Engine-wide `CLAUDE.md` v `engine/` popisuje vrstvy a pravidla závislostí.

### Gaps
- Obsah `.uproject` (EngineAssociation, seznam modulů a pluginů) stránka Epicu nepopisuje. Srovnání pinování verze s Unrealem proto zůstává neověřené.
- Strukturu projektu v Bevy a Cargo ani interní formát projektu Jackdaw jsem nečetl.

---

## 5. Návrh: moduly, umístění do milníků a denní workflow vlastníka a Clauda

### Takeaway
Přidat čtyři moduly (`eng_project`, `eng_tools` + `eng_mcp`, `eng_ui` + `eng_text`, `eng_editor`) a tři binárky (`wz_studio`, `wzmcp`, `wz new` v `gencli`). **MCP nepatří až k editoru od M5, ale do M0–M1** jako tenká vrstva nad ladicím serverem z D17. Claude je hlavní vývojář a bez očí je slepý. Minimální studio (viewport, konzole, CVars) přijde v M2. **Hlavní studio pro art directora (parametry, kontaktní archy, A/B, schvalování, poznámky) je cílem M3**, spolu s „assety jako programy“. Herní UI (Clay) přijde v M5 s hrou.

### Cited Findings
- Současný plán řadí „nástroje (editor, inspektory)“ souběžně „od M5“ — [Architektura open world enginu.md, lokální](../../wallhammerzero/docs/research/Architektura%20open%20world%20enginu.md) — a editor s panely parametrů (cimgui) „souběžně od M3“. M2 v něm už obsahuje „headless offscreen render do PNG“ a M3 `gencli`, review archy, `genlint`, golden testy a hot reload `gen_*` DLL — [Procedurální grafika pro engine.md, lokální](../../wallhammerzero/docs/research/Procedurální%20grafika%20pro%20engine.md)
- D17 požaduje ladicí nástroje, headless režim a logování „do prvních milníků, ne až na konec“. D18 staví MCP „na ladicím serveru z D17“ — `wallhammerzero/docs/DECISIONS.md`
- Epic, Roblox i Unity integrují MCP přímo do editoru a Unreal generuje konfiguraci klienta do projektu — [Epic docs](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-mcp-in-unreal-editor), [Roblox docs](https://create.roblox.com/docs/en-us/studio/mcp.md), [Unity docs](https://docs.unity3d.com/Packages/com.unity.ai.assistant@2.19/manual/integration/unity-mcp-overview.html)
- Godot vynucuje jednosměrné závislosti, kde editor je nahoře a nic pod ním na něm nezávisí — [Godot editor dev](https://docs.godotengine.org/en/latest/engine_details/editor/introduction_to_editor_development.html)

### Inferences
**Moduly (doplnění 13 targetů):**

| Target | Typ | Smí záviset na | Role |
|---|---|---|---|
| `eng_project` | STATIC | core, asset | parsování `wz.project`, VFS kořeny, verze API, načtení style a scale (předá runtime do gen_core) |
| `eng_tools` | STATIC | core, yyjson | registry nástrojů (`eng_tool_desc`), JSON Schema, fronta volání do hlavního vlákna, úlohy (tasks), kurzory. Neví o světě. Nástroje registruje runtime, editor a hra |
| `eng_mcp` | STATIC | tools | JSON-RPC 2.0, MCP lifecycle (2025-11-25 + `server/discover`), stdio rámce, volitelně Streamable HTTP na loopbacku. Používá ho `wzmcp` i studio |
| `eng_debugsrv` | STATIC | tools, platform | (D17, druhá rešerše) socket/pipe, token, posílá volání nástrojů. Studio a `wz_run` ho mají, `wzmcp` je jeho klient |
| `eng_text` | STATIC | core, SDL_ttf (PRIVATE) | fonty, shaping, atlas, měření pro Clay |
| `eng_ui` | STATIC | text, render | Clay layout, styly ze style bible, fokus a gamepad, lokalizace, render pass, `ui_tree` |
| `eng_editor` | STATIC (jen studio) | runtime, ui?, imgui adaptér | dokument receptů, undo (autor owner/ai), panely, review, poznámky, viewport nástroje. **Nic pod ním na něm nezávisí** |
| `imgui_c` | STATIC (C++ uvnitř) | SDL3 | dcimgui + backendy sdl3/sdlgpu3 za C hlavičkou (D4) |
| `wz_run` | EXE | runtime, project, debugsrv, ui | hra, headless režim |
| `wz_studio` | EXE | `wz_run` knihovny + editor + mcp + imgui_c | studio, Play spouští `wz_run` jako podproces |
| `wzmcp` | EXE | mcp, platform | stdio spouštěč: najde nebo spustí studio či headless a přeposílá |
| `gencli` | EXE | gen_*, gpu, render, tools | navíc `gencli serve` (headless MCP backend) a `gencli new <šablona>` |

**Umístění do milníků (podle 9 milníků procedurální rešerše):**
- **M0 Kostra:** `eng_project` (manifest, `projects/sandbox/`), `eng_tools` + `eng_mcp` + `wzmcp` se 3 nástroji: `wz_status`, `golden_check` (hash šumu na 3 OS) a `log_tail`. `.mcp.json` a `CLAUDE.md` v sandbox projektu. *Hotovo, když* Claude Code přes `wzmcp` spustí headless engine a přečte výsledek golden testu jako strukturovaný JSON.
- **M1 Jádro:** JSON lines log (D17), `cvar_get`/`cvar_set`, `profile_snapshot`, `console_exec`, fronta volání na hlavní vlákno a úlohy (tasks + progress) pro dlouhé běhy. `project_build` vrací strukturované chyby kompilátoru.
- **M2 RHI a stylové osvětlení:** `camera_set`, `screenshot` (headless i z okna, debug pohledy, figurína), `time_control`. **Studio v0**: `wz_studio` s ImGui dockingem, viewportem, konzolí, CVars, logem a profilerem. Je to v podstatě inspektor z D17 v samostatném okně. Vlastník v něm v M2 schvaluje stylové osvětlení vedle referencí (což M2 už vyžaduje).
- **M3 Assety jako programy = studio MVP pro art directora:** dokument receptů a undo s autorem, panely parametrů generované ze schémat, prohlížeč receptů, kontaktní arch, A/B, Schválit/Zamítnout → `review/` a golden, poznámky ve viewportu, panel lintů. MCP: `gen_*`, `recipe_*`, `lint_run`, `golden_accept` (vyžaduje vlastníka), `review_*` a `project_reload` pro gen DLL a shadery. Resources `wz://project/style`, `wz://project/scale`, `wz://gen/{id}/schema`. Šablony projektů a `gencli new`.
- **M4 Generovaný svět:** `world_query`, `world_inspect`, `world_pick`, mapový panel buněk a vrstev (silnice, parcely, ID, časy generování), druhý projekt `planet` jako test D15.
- **M5 Hra a vozidla:** Play jako podproces, `play_start`/`play_stop`, `game_state` registrovaný herní DLL, timeline vstupů v `time_control`, replay soubory. `eng_ui` a Clay s HUD v0 (rychloměr, minimapa), `ui_tree`, golden obrázky HUD.
- **M6–M8:** lokalizace, gamepadová navigace a menu (případně RmlUi, pokud Clay nestačí), gizma pro ruční přepisy (razítka, masky), více oken studia a Streamable HTTP pro další klienty.

**Denní workflow (cíl po M3):**
1. Vlastník otevře studio na projektu (`wz_studio projects/city`). Studio zapíše `.wz/session.json`.
2. V Claude Code ve složce projektu napíše např. „střechy činžáků v čtvrti Docks jsou moc ploché, víc jako WoW Stormwind, viz reference X“ a připíchne poznámku ve viewportu.
3. Claude zavolá `wz_status` (vidí otevřenou poznámku), `review_list` (pozice, kamera, cesta ke screenshotu) a `@wz://project/style`. Upraví `gen_arch/roof.c` nebo recept, pak `project_build` a `project_reload`. `gen_compare` vytvoří A/B arch 16 seedů vedle reference. Vizuální posouzení dělá subagent, který vrátí textový verdikt. Claude spustí `lint_run` a `golden_check`.
4. Claude zavolá `review_request` s A/B archem. Ve studiu vyskočí karta. Vlastník porovná, případně posune dva posuvníky (změna se zapíše do receptu s autorem owner) a klikne Schválit. Úloha se dokončí, golden se aktualizuje a Claude commitne diff receptu, kódu a `review/`.
5. Kdykoli vlastník otevře historii undo, vidí kroky „[ai] recipe_patch roof.pitch 18→32“ a může je vrátit. Git má stejnou historii.
6. Když vlastník u studia nesedí (noc nebo CI), běží stejné nástroje headless přes `gencli serve`. Výsledky čekají v `review/` jako neschválené archy.

**Hlavní rizika:**
- Rozbujelá sada nástrojů (175–455 nástrojů u komunitních serverů) zhorší výběr nástrojů i spotřebu kontextu. Proto 30 nástrojů a nové jen podle reálné potřeby.
- Screenshoty v hlavním kontextu, řešením je subagent.
- Spec MCP se mění rychle (bezstavová revize 2026-07-28, Unity ustupuje k CLI). Proto má být transportní vrstva tenká a logika v registry nástrojů, kterou umí volat i CLI (`gencli tool <name> <json>`). Kdyby se klienti přesunuli od MCP k CLI, přechod pak nic nestojí.

### Gaps
- Odhady pracnosti (minimální MCP server v C, studio MVP) jsem neměřil ani nenašel v literatuře.
- Jak dobře Claude generuje UI v Clay ve srovnání s ImGui nebo RML, nikdo nezměřil. Tvrzení o „známosti v trénovacích datech“ jsou úsudek.
- Proč Unity přechází z MCP na CLI a zda jde o širší trend, jsem neověřil (vyhledávání vyčerpáno). To může ovlivnit, kolik investovat do MCP specifik oproti obecnému CLI nad stejnou registry nástrojů.
