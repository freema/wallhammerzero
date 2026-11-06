# Srovnání architektury Wallhammer Zero s reálnými enginy a návrhy zlepšení

Poznámky sepsány 2026-11-05. Srovnávaný návrh: `docs/research/Architektura open world enginu.md` (vrstvy jako CMake targety, porty jen na 5 švech + herní port, mediátor `runtime`, archetypy/instance/handly místo ECS, work-stealing joby bez fiberů, buňky 128–256 m, tenké RHI nad SDL_GPU, lehký render graph, hra jako hot-reload C DLL), `docs/research/Procedurální grafika pro engine.md` (port `asset_provider`, targety `eng_gen_*`, generátor jako zdroj buněk, determinismus jen na CPU) a `docs/DECISIONS.md` (D15: obecný engine, město i planeta, tvar světa za portem).

Data u zdrojů: kde zdroj uvádí datum, je u něj. Dokumentace Godotu byla čtena ve verzi 4.7 (stable, 11/2026). Bevy cheatbook je pro Bevy 0.9 a sám se označuje za zastaralý.

---

## 1. Engine po enginu: co dělají jinak a co z toho převzít

### Takeaway
Náš návrh je nejblíž Godotu (izolované „servery“ adresované neprůhlednými handly) a Wicked Engine (jednoduché typové správce komponent bez generického scheduleru). Od všech srovnávaných *obecných* enginů se ale liší tím, že **nad „servery“ nemá žádný obecný herní objektový model, žádný datový model pro editor ani rozšiřovací mechanismus pro pluginy** a že simulace není od začátku oddělená od klienta jako ve Veloren, Luanti a Minecraftu od verze 1.3. Pro hru jednoho týmu je to v pořádku. Pro D15 („obecný engine“) jsou to tři největší díry.

### Cited Findings

**Godot 4 (servery, RID, scéna nahoře)**
- Servery jsou „low-level APIs to control rendering, physics, sound, etc.“ Scénový systém je postavený nad nimi a „it can be completely bypassed“, ale nejde vykompilovat. — [Godot docs 4.7: Using Servers](https://docs.godotengine.org/en/stable/tutorials/performance/using_servers.html)
- RID jsou „opaque handles to the server implementation. They are allocated and freed manually“. Na refcount zdroje se nepočítají, takže se zdroj může uvolnit pod RID, pokud si na něj nedržíte referenci zvlášť. — [Godot docs: Using Servers](https://docs.godotengine.org/en/stable/tutorials/performance/using_servers.html)
- Servery „will often run asynchronously for performance“. Volání, které vrací hodnotu, vynutí synchronizaci, a pokud se volá každý snímek, zabíjí výkon. — [Godot docs: Using Servers](https://docs.godotengine.org/en/stable/tutorials/performance/using_servers.html)
- Juan Linietsky (26. 2. 2021): Godot není ECS, „Godot does composition at a higher level than in a traditional ECS“. Nody jsou „just interfaces to the actual data being processed inside servers“. Pro hry, které cache-friendly zpracování potřebují (city buildery, sandboxy, velké strategie), doporučuje zpracovávat méně za snímek, volat servery přímo, GPU compute, nebo ECS třetí strany (Godex). — [Godot blog: Why isn't Godot an ECS-based game engine?](https://godotengine.org/article/why-isnt-godot-ecs-based-game-engine/)
- Pod servery leží RenderingDevice s drivery pro Vulkan, D3D12 a Metal (citováno už v naší první zprávě). — [Godot internal rendering architecture](https://docs.godotengine.org/en/latest/engine_details/architecture/internal_rendering_architecture.html)

**Wicked Engine (jeden vývojář, C++)**
- `Entity` je `uint64_t`, 0 je neplatná, ID se rozdávají z globálního atomického čítače. Hlavička varuje, že hodnoty se mezi běhy mění a pro perzistenci se musí serializovat přes `SerializeEntity()`. — [wiECS.h (master, čteno 11/2026)](https://raw.githubusercontent.com/turanszkij/WickedEngine/master/WickedEngine/wiECS.h)
- `ComponentManager<T>` je `final` šablona se dvěma paralelními hustými poli `components` a `entities` a lookup tabulkou entity → index (bucket hash po 64 entitách). `Remove()` je swap-with-last, `Remove_KeepSorted()` posouvá, `MoveItem()` přeřazuje (kvůli hierarchiím). — [wiECS.h](https://raw.githubusercontent.com/turanszkij/WickedEngine/master/WickedEngine/wiECS.h)
- `ComponentLibrary::Register<T>(name, version)` drží jméno a verzi každého typu. Serializace píše záznamy `has_next, name, jump offset, version, data`. Při čtení se nejdřív sesbírají verze a neregistrované typy se **přeskočí podle offsetu**. Entity se při načtení přemapují (`EntitySerializer::remap`). — [wiECS.h](https://raw.githubusercontent.com/turanszkij/WickedEngine/master/WickedEngine/wiECS.h)
- Autor v blogu (září 2019) popisuje ECS používané rok. Nikdy nechtěl víc než jednu komponentu stejného druhu na entitu. — [Wicked Engine: Entity-component system](https://wickedengine.net/2019/09/entity-component-system) (stránka při fetchi 11/2026 vrátila 404, obsah jen ze snippetu vyhledávače)

**The Machinery (Our Machinery, C, ukončeno 2022)**
- „The Truth“ (7. 11. 2018): data jsou **objekty s typovanými vlastnostmi** (bool, int, float, string, buffer, reference, sub-objekt, množiny). Paměťová reprezentace je autoritativní a disk je jen záloha („the in-memory representation of the data is considered authoritative“). Velká binární data jsou neprůhledné buffery. — [Gray: The Story behind The Truth](https://ruby0x1.github.io/machinery_blog_archive/post/the-story-behind-the-truth-designing-a-data-model/)
- Z modelu plyne undo/redo i copy/paste („can be defined in terms of the data model“), real-time kolaborace serializací změn přes síť, dopředná i zpětná kompatibilita bez kódu pro jednotlivé verze a reference přes unikátní ID. Sub-objekty se klonují, reference ne. — [The Truth](https://ruby0x1.github.io/machinery_blog_archive/post/the-story-behind-the-truth-designing-a-data-model/)
- Scény v The Machinery **stojí na ECS a i samotné ECS je plugin**. Editor je postavený kolem něj. Renderer nezná meshe ani světla, komponentní pluginy implementují `tm_ci_shader_i` (světla, sondy, decaly) a `tm_ci_render_i` (renderovatelné objekty) a do render graphu vkládají vlastní moduly. Cílem je „hundreds of thousands of them each frame“. — [Our Machinery: ECS and Rendering (23. 10. 2018)](https://ruby0x1.github.io/machinery_blog_archive/post/ecs-and-rendering/)
- Archiv obsahuje i „Syncing a data-oriented ECS with a stateful external system“ (8. 6. 2019), „Multi-Threading The Truth“ (16. 10. 2017) a třídílný „One-Click Save Game System“ (2021). — [archiv blogu](https://ruby0x1.github.io/machinery_blog_archive/)

**Bevy (Rust, ECS + pluginy)**
- Renderer „operates independently from all the normal app logic“ a má vlastní ECS World a schedule. Se hlavním Worldem se synchronizuje ve fázi **Extract**, která kopíruje potřebná data do Render Worldu. Renderer pak „can only use data that is stored there“. — [Bevy cheatbook: Render architecture (Bevy 0.9, zastaralé)](https://bevy-cheatbook.github.io/gpu/intro.html)
- Každý snímek se **všechny entity v Render Worldu smažou, resources zůstanou**. Data trvající přes snímky patří do resources. Architektura vznikla v Bevy 0.6 a pipelined rendering (render snímku N‖update N+1) byl v době psaní stránky jen plánovaný. — [Bevy cheatbook](https://bevy-cheatbook.github.io/gpu/intro.html)

**Unreal Engine (game/render thread, proxy)**
- Renderer běží ve vlastním vlákně „a frame or two behind the game thread“. Herní vlákno na konci `Tick()` blokuje, dokud není render v tomto okně. — [Epic: Rendering thread](https://dev.epicgames.com/documentation/en-us/unreal-engine/threaded-rendering-in-unreal-engine)
- „The rendering thread can never touch the memory of UPrimitiveComponent directly.“ Komponenta má render-side `FPrimitiveSceneProxy` vytvořený při registraci. Změny jdou zprávou a herní kód musí volat `MarkRenderStateDirty()`. Dynamická data, například kosti, se kopírují do heap alokace, kterou vlastní a uvolní render vlákno. — [Epic: Rendering thread](https://dev.epicgames.com/documentation/en-us/unreal-engine/threaded-rendering-in-unreal-engine); [FPrimitiveSceneProxy API](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/Engine/FPrimitiveSceneProxy?lang=en-US)
- Komunikace probíhá přes frontu render příkazů (`ENQUEUE_RENDER_COMMAND`), `FRenderCommandFence` a `FlushRenderingCommands`, který se smí jen v editoru. Pravidla: UObject se na render vlákně nedereferencuje, protože ho „the game thread may delete … while the rendering thread is processing a command that references it“. Mazání se odkládá přes fence. — [Epic: Rendering thread](https://dev.epicgames.com/documentation/en-us/unreal-engine/threaded-rendering-in-unreal-engine)
- `GetDynamicMeshElements` „should not modify the proxy but simply collect a description of things to render“. — [FPrimitiveSceneProxy::GetDynamicMeshElements](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/Engine/FPrimitiveSceneProxy/GetDynamicMeshElements)

**idTech 7 / Doom Eternal**
- Axel Gneiting (id Software, tweet 21. 3. 2020): Doom Eternal **nemá main thread ani render thread**, „everything is implemented as jobs“, jeden worker na jádro. Podle zprávy o vyhledávání odhadl řádově ~100 jobů za snímek a zmínil joby spouštějící joby a **předem sestavené grafy jobů**. — [Wikipedia: id Tech 7 → tweet](https://en.wikipedia.org/wiki/Id_Tech_7), [tweet](https://twitter.com/axelgneiting/status/1241487918046347264) (tweet sám nebyl ověřen fetchem, údaj o ~100 jobech a job grafech pochází ze shrnutí vyhledávače)
- Job systém byl pro id Tech 7 přepsán tak, aby žádné jádro nemuselo být vyhrazené na plánování. — [Wikipedia: id Tech 7](https://en.wikipedia.org/wiki/Id_Tech_7) s odkazem na [IGN video, 28. 2. 2020](https://www.youtube.com/watch?v=9S5ABf53rDo)

**O3DE (Gems, Atom, frame graph)**
- Atom RPI definuje scény, passy, render pipeline jako **strom passů** a CPU simulaci. GPU práce se nahrává v passech. — [O3DE: RPI system](https://docs.o3de.org/docs/atom-guide/dev-guide/rpi/rpi-system/)
- RHI frame scheduler staví frame graph předem kvůli hazard trackingu, aliasingu paměti a synchronizaci mezi frontami. Systémy dodávají „scopes“ přes `ScopeProducer` se třemi kroky: deklarace závislostí, kompilace zdrojů a stavba command listu. — [O3DE frame scheduler (prerelease docs)](https://development--o3deorg.netlify.app/docs/atom-guide/dev-guide/rhi/frame-scheduler); [ScopeProducer API](https://docs.o3de.org/docs/api/gems/atom/class_a_z_1_1_r_h_i_1_1_scope_producer)
- **Gemy vkládají vlastní passy do výchozí pipeline** přes mapování pass templates načítané z assetů, například LyShine (UI), AtomHair a Terrain. — [O3DE wiki: Work With Passes In Gems](https://github.com/o3de/o3de/wiki/%5BAtom%5D-Work-With-Passes-In-Gems) (wiki může být zastaralá)

**Flax Engine**
- Podporuje C#, C++ a vizuální skriptování. Engine je v C++, editor v C#. Hot reload C# i C++ v editoru, vizuální skripty jsou binární asset s grafem a reloadují se bez kompilace. Build engine i hry řídí vlastní nástroj Flax.Build. — [Flax docs: Scripting](https://docs.flaxengine.com/manual/scripting/index.html); [C++ Scripting](https://docs.flaxengine.com/manual/scripting/cpp/index.html); [Visual Scripting](https://docs.flaxengine.com/manual/scripting/visual/index.html)

**Veloren (Rust, voxelový open world)**
- Projekt je rozdělený na crates: frontendy `voxygen` (3D klient) a `server-cli`, backendy `server`, `client` a `world`, utility `common` a `network` a pluginy `plugin-rt`, `plugin-api` a `plugin-derive`. Frontendy jsou „first-class abstraction“. — [Veloren book: Codebase structure](https://book.veloren.net/contributors/developers/codebase-structure.html)
- Crate `world` je „the core world generation implementation“ a je navržený tak, aby šlo svět generovat a simulovat **bez klienta i serveru**. — [Veloren book](https://book.veloren.net/contributors/developers/codebase-structure.html)
- Singleplayer spouští lokální server na pozadí a klient se k němu připojí. Sdílené komponenty ECS (specs) jsou v `common`. — sekundární zdroje: [rustutils](https://rustutils.com/tools/veloren/), [DeepWiki](https://deepwiki.com/veloren/veloren) (oficiální kapitolu o ECS jsem nečetl)

**Luanti (Minetest, C++ + Lua)**
- Singleplayer spouští na pozadí server omezený na jednoho hráče a klient se k němu připojí, takže hra je klient i server zároveň. Engine má architekturu klient-server pro single- i multiplayer. — [Luanti wiki: Terminology](https://wiki.luanti.org/Terminology); [Luanti docs glossary](https://docs.luanti.org/about/glossary/)
- Mody jsou v Lua a „run solely on the server side“. Definice a média se klientům posílají automaticky. Klientské Lua API je experimentální. — [Luanti Lua API](https://api.luanti.org)

**Minecraft Java (retrofit)**
- Mojang ve verzi 1.3 (2012) „kicked out single-player, and made it a shell on top of multi-player“. Snapshot 12w18a byl první, ve kterém singleplayer běžel na lokálním serveru, „because server and client logic were separated“. — [Minecraft Wiki: 1.3.1 development versions](https://minecraft.wiki/w/Java_Edition_1.3.1/Development_versions); [Tom's Hardware](https://www.tomshardware.com/uk/news/Minecraft-Mojang-PC-Gaming-Block-Building-Notch,16214.html)

**Vintage Story (C#)**
- Code mody jsou C# proti `VintagestoryAPI.dll`. Wiki pokrývá bloky, itemy, block entities, přístup ke světu, síť, příkazy, GUI, generování světa a monkey-patching přes Harmony. Hot reload ve Visual Studiu funguje jen pro „compiled“ mody. — [VS wiki: Code Mods](https://wiki.vintagestory.at/index.php/Modding:Code_Mods); [Mod Types](https://wiki.vintagestory.at/index.php/Modding:Mod_Types)
- Guide radí nedržet statické reference na herní objekty, protože mohou držet v paměti celý svět. — [VS wiki: Modding Efficiently](https://wiki.vintagestory.at/index.php/Modding_Efficiently)

### Inferences
- **Godot potvrzuje náš základ.** Izolované subsystémy s neprůhlednými handly, nad kterými lze jít přímo, jsou totéž jako naše `render`/`phys`/`audio` s handly. Godot k tomu ale přidává **scénový strom jako obecnou kompozici pro uživatele hry**. My máme jen `eng_api` s `world.spawn/despawn`. Pro D15 chybí vrstva „jak si hra skládá objekty“, a tu by jinak každá hra psala znovu.
- **Wicked je nejlepší vzor „ECS-light“ pro C engine jednoho autora.** Typový správce s hustými poli, entita jako číslo, žádný generický scheduler ani dotazy přes archetypy a k tomu **verzovaná, přeskakovatelná serializace podle jména typu**. Je to v podstatě Bitsquidův správce dat vlastněný systémem, který už doporučujeme, plus registr typů. Ten registr je přesně to, co náš návrh zakazuje („globální reflexe se nestaví“) a co je přitom potřeba pro save, editor i síť.
- **Unreal proxy a Bevy extrakce řeší totéž co naše FrameParams + `render_world_add_instances()`**, ale každý definuje explicitní životní cyklus. U Unrealu jde o perzistentní proxy, dirty flag a zprávy. U Bevy je to perzistentní resource a per-frame entity, které se každý snímek zahodí. Náš návrh má oba kanály (perzistentní instance buňky přes runtime a dynamické transformace přes FrameParams), ale **nepopisuje pravidla**: kdo smí co číst, jak se šíří změny materiálu nebo viditelnosti statické instance a kdy se smí uvolnit paměť, na kterou render-prep ukazuje. Bez toho se pipelining v M7 rozbije.
- **Doom Eternal ukazuje, že „žádný main thread“ je dosažitelný konec.** U nás to brzdí SDL (swapchain na vlákně okna, command buffer vázaný na vlákno), takže jedno submit vlákno je vynucené. Převzít lze „předem sestavený graf jobů snímku“: stejný seznam jobů každý snímek je laditelný a profilovatelný líp než ad hoc spawny.
- **O3DE a The Machinery dovolují modulům a pluginům vkládat passy do render graphu.** Pro D15 to je podstatné. Planeta potřebuje atmosféru, vzdušný rozptyl a vzdálený terén, město potřebuje jiné passy. Náš render graph je navržený jako interní věc `render`, chybí mu extension point.
- **Veloren je nejbližší analogie celého našeho stacku**: open world s proceduralním generováním, `world` crate nezávislý na klientovi i serveru (= naše čisté `gen_*`), oddělený klient a server od začátku, pluginové API. Liší se v tom, že má od začátku síťovou hranici.

### Gaps
- Wicked Engine graphics device abstrakci (`wiGraphicsDevice.h`) a job systém (`wiJobSystem`) jsem v tomto sezení nečetl. Jejich srovnání s naším RHI a job systémem není ověřené. Job systém Wicked cituje naše první zpráva (blog 2018).
- Godot RenderingDevice a vlákno rendering serveru (`RenderingServerDefault`, command queue) jsem detailně neověřil.
- Unreal World Partition je popsaný v naší první zprávě. Nové zdroje k němu jsem nečetl.
- GDC 2019 „First Light – Bringing DOOM to Stadia“ ani žádnou primární prezentaci o job systému idTech 7 jsem nenašel. Údaj o ~100 jobech pochází z tweetu zprostředkovaného vyhledávačem.
- Oficiální kapitolu Veloren o ECS a o singleplayeru jsem nečetl. Údaj o lokálním serveru je ze sekundárních zdrojů.
- Gregoryho Game Engine Architecture (kapitola o runtime object modelu a world chunks) jsem v tomto sezení znovu nečetl, cituje ji jen první zpráva přes výtah.

---

## 2. Konkrétní díry v našem návrhu (editor, skriptování, data, save, síť, audio, UI, hot reload, profilace, crash reporting, extrakce)

### Takeaway
Nejvážnější díry pro „obecný engine“ jsou tři. (1) **Chybí oddělení simulace od prezentace jako klient/server**, přestože Minecraft ukazuje, že dodatečné doplnění znamená přepsat herní smyčku. (2) **Chybí datový model se schématem a verzemi** pro recepty, diffy buněk a save, ze kterého by vycházel inspektor, undo i migrace. (3) **Chybí rozšiřovací mechanismus** (pluginy nebo Gems) pro features a passy. Skriptování (Lua a spol.) a editor jsou méně urgentní, pokud se `eng_api` od začátku navrhne jako stabilní C ABI.

### Cited Findings
- **Síť / server-authoritative:** Minecraft v roce 2012 udělal ze singleplayeru „a shell on top of multi-player“, což vyžadovalo oddělit logiku serveru a klienta. Tom's Hardware uvádí cenu: hra i v sólu simuluje a zároveň emuluje svět. — [Minecraft Wiki](https://minecraft.wiki/w/Java_Edition_1.3.1/Development_versions); [Tom's Hardware](https://www.tomshardware.com/uk/news/Minecraft-Mojang-PC-Gaming-Block-Building-Notch,16214.html)
- Luanti i Veloren běží v singleplayeru jako lokální server od začátku. Luanti mody žijí jen na serveru. — [Luanti wiki](https://wiki.luanti.org/Terminology); [Luanti API](https://api.luanti.org); [Veloren book](https://book.veloren.net/contributors/developers/codebase-structure.html)
- The Machinery bere multiplayer jako „bonus“ požadavek save systému. Sledování změn po jednotlivých členech znamená, že „only the actual member that changed will be sent across the network (instead of the full struct)“. — [Our Machinery: One-Click Save Game System pt.1 (21. 6. 2021)](https://ruby0x1.github.io/machinery_blog_archive/post/save-game-system-part-1/)
- **Save systém:** V The Machinery stav Gamestate zrcadlí živý stav aplikace a zaznamenává změny perzistentních objektů. Save je serializace těchto změn. Každý perzistentní objekt potřebuje unikátní ID a reference jdou přes perzistentní ID. Hra rozhoduje, kdy změny pushne, a stačí, když jsou pushnuté v okamžiku uložení. Část 1 neřeší verzování formátu. — [Save Game pt.1](https://ruby0x1.github.io/machinery_blog_archive/post/save-game-system-part-1/)
- Wicked řeší verze per typ komponenty (`ComponentLibrary`, `GetVersion()`) a neznámé typy přeskakuje podle jump offsetu. — [wiECS.h](https://raw.githubusercontent.com/turanszkij/WickedEngine/master/WickedEngine/wiECS.h)
- **Datový model / editor:** The Truth dává undo, copy/paste, kolaboraci a kompatibilitu verzí „z datového modelu“. Uvádí ale i otevřené problémy: runtime generování dat, částečné načítání velkých projektů a git-friendly reprezentaci na disku. — [The Truth](https://ruby0x1.github.io/machinery_blog_archive/post/the-story-behind-the-truth-designing-a-data-model/)
- **Skriptování a modding:** Luanti používá Lua jen na serveru. Vintage Story používá C# code mody plus Harmony patching a podle wiki i JSON content mody (typy modů). Flax má C#, C++ a vizuální skripty s hot reloadem. Godot GDScript je první jazyk (všeobecně známé, zde neověřeno). — [Luanti API](https://api.luanti.org); [VS Mod Types](https://wiki.vintagestory.at/index.php/Modding:Mod_Types); [Flax Scripting](https://docs.flaxengine.com/manual/scripting/index.html)
- Veloren má vlastní pluginové API (`plugin-api`, `plugin-rt`) oddělené od enginu. — [Veloren book](https://book.veloren.net/contributors/developers/codebase-structure.html)
- **Hot reload DLL je bolestivý:** naše první zpráva cituje Machinery (patchování ukazatelů na funkce, tichý pád při změně signatury, později verzování API). Vintage Story má hot reload jen pro jeden typ modů. — [Machinery: DLL Hot Reloading](https://ruby0x1.github.io/machinery_blog_archive/post/dll-hot-reloading-in-theory-and-practice/); [VS Code Mods](https://wiki.vintagestory.at/index.php/Modding:Code_Mods)
- **Render extrakce:** Bevy maže render entity každý snímek a perzistentní data drží v resources. Unreal drží perzistentní proxy, změny šíří přes `MarkRenderStateDirty()` a dynamická data kopíruje do alokací vlastněných render vláknem. Mazání čeká na fence. — [Bevy cheatbook](https://bevy-cheatbook.github.io/gpu/intro.html); [Epic: Rendering thread](https://dev.epicgames.com/documentation/en-us/unreal-engine/threaded-rendering-in-unreal-engine)
- **UI v enginu:** O3DE dodává herní UI (LyShine) jako Gem, který vkládá vlastní passy. — [O3DE wiki](https://github.com/o3de/o3de/wiki/%5BAtom%5D-Work-With-Passes-In-Gems)

### Inferences
Hodnocení každé díry (stav v našem návrhu → doporučení):

1. **Klient/server split (síť).** Stav: nic. `game_fixed_update(mem, input, dt)` je jednohráčová smyčka a vstup jde přímo do hry. Doporučení: síťový kód **ne** od prvního dne, ale **tvar ano**. (a) Herní stav a simulace (`world` + hra) nesmí záviset na `render`, `audio` ani kameře. To už částečně platí díky pravidlu „sousedé se nelinkují“. (b) Vstup do simulace jsou **příkazy hráče** (`player_cmd` s ID hráče a tickem), ne surový vstup ze SDL. Stejný kanál pak slouží pro replay, síť i AI. (c) Headless target `server` (null GPU + null audio) je díky plánovaným null adaptérům skoro zadarmo, stačí ho od M5 držet v CI. (d) Streaming strategie počítají s **více streaming sources** (víc hráčů). UE World Partition to má, náš návrh zmiňuje jen druhý prediktivní source. Minecraft ukazuje, že dodatečné oddělení je drahé. Veloren a Luanti ukazují, že open world s generátorem v tomto tvaru jde postavit od začátku. Pro D15 (planeta à la Light No Fire, kde se multiplayer dá čekat) je to nejlevnější pojistka.
2. **Datový model + schéma + verze.** Stav: recepty jsou „jednoduchý klíč-hodnota formát“, diffy buněk jsou volně popsané, save je `save()/load()` po systémech podle Bitsquidu bez zmínky o verzích. Doporučení: **malý registr typů** (jméno, verze, seznam polí s typy a offsety), ne plná The Truth. Z něj se odvodí: (a) chunkový save a formát diffů ve stylu Wicked `[name, version, size, data]` s přeskakováním neznámých chunků, (b) migrace receptů při změně verze generátoru, (c) automatický inspektor v debug UI, (d) budoucí replikace po polích jako v Machinery. Bitsquidovo „žádná globální reflexe“ dává smysl pro vnitřní data systémů, ne pro **perzistentní a editovatelná data na hranici enginu**. Tam reflexi potřebuje každý srovnávaný obecný engine (Godot, Unreal, O3DE, Flax, Machinery).
3. **Rozšiřovací mechanismus (pluginy/Gems).** Stav: mediátor `runtime` je ručně psaný composition root se statickou registry, dynamická registry je odložená. Riziko pro D15: každá nová feature (planeta, atmosféra, vegetace, voda, UI) bude přidávat řádky do `runtime/init.c` a `frame.c`, a mediátor se změní v god-object. Doporučení: **deklarativní popis modulu** (`eng_module_desc`: jméno, závislosti, `init/shutdown`, hooky do pojmenovaných fází snímku, registrace passů do render graphu a asset handlerů a providerů), linkovaný staticky. Mediátor pak prochází tabulku. Je to Machinery „load_xxx(reg)“ bez DLL a O3DE Gem bez Gem tooling. Render graph dostane extension point „modul registruje pass do pojmenovaného slotu pipeline“ podle vzoru O3DE a Machinery.
4. **Skriptování a modding.** Stav: hra je C DLL s hot reloadem. Hodnocení: pro náš workflow (kód píše Claude, vlastník je art director) je C DLL lepší než Lua. Je rychlejší, typovaný, laditelný a sdílí determinismus. Pro *obecný* engine s modding komunitou je ale nativní DLL nesandboxovatelná a ABI-křehká, jak ukazují Machinery i Harmony patching ve VS. Doporučení: **nepřidávat skriptovací jazyk teď**. `eng_api` ale navrhnout jako stabilní, verzované C ABI s POD typy a bez callbacků do interních struktur, aby šel později přidat Lua nebo Wren adaptér jako další driving port, podobně jako Luanti (jen serverová strana). Datové mody (recepty v `content/`) jsou už teď modding povrch srovnatelný s JSON mody ve VS a stojí za to je zdokumentovat jako takové.
5. **Editor / inspektor / runtime debug.** Stav: `eng_debug_api` je zmíněné, editor „paralelně od M5“, jinak nic. Doporučení: v M1–M2 přidat **immediate-mode debug UI** (inspektor nad registrem typů z bodu 2, vizualizace buněk, stav streamingu, frame graph dump, job timeline). Plný editor není potřeba, protože obsah vzniká z receptů a generátorů a „editor“ je hlavně review render a živá úprava receptu. Z návrhu Machinery stojí za převzetí jen myšlenka, že undo a hot reload receptu jsou operace nad daty, ne nad soubory.
6. **Render extrakce vs FrameParams.** Stav: koncept máme (FrameParams podle Gyrlinga, `render_world_add_instances()` při aktivaci buňky, POD pakety). Chybí ale explicitní protokol. Doporučení: zapsat tři kanály podle Unreal a Bevy. (a) **Perzistentní render instance** (statika buňky) vznikají a zanikají příkazem přes runtime a uvolňují se až po GPU fence. (b) **Dirty updates** pro změnu stavu perzistentní instance (materiál, viditelnost, rozbití) jsou fronta příkazů, ne přímý zápis. (c) **Per-frame extract** pro dynamické aktéry (transformace, pózy) do arény tagované číslem snímku, která se zahodí celá jako v Bevy. Plus Unreal pravidlo: render-prep nikdy nedereferencuje handle simulace, jen kopii. Tím se pipelining sim N+1 ‖ render-prep N v M7 stane zapnutím, ne refaktorem.
7. **Audio a UI.** Audio má port (`eng_audio`), ale nemá definovaný model (voices, bus, 3D emitory, streaming hudby). Herní UI (HUD, menu, text, lokalizace, fonty) v návrhu **vůbec není**, přitom O3DE ho dodává jako samostatný Gem s vlastními passy. Pro obecný engine je to povinná položka a patří do plánu milníků.
8. **Profilace a crash reporting.** Stav: `profile.h` hooky v `core`, `gpu_timer` no-op. Doporučení: hooky navrhnout tak, aby šly napojit na externí profiler (zóny, pojmenování vláken a jobů, alokace). Crash reporting (minidump/symbolizace na 3 OS) v návrhu chybí. Pro sólo vývoj se ale vyplatí aspoň handler, který zapíše log, seed, verzi buildu a posledních N snímků replay vstupu. Deterministický replay je náš největší ladicí trumf a crash dump by na něj měl odkazovat.
9. **Asset hot reload.** Shadery, gen DLL a recepty mají hot reload naplánovaný. Hot reload *cooknutých* assetů jde automaticky přes refcount graf a zneplatnění cache. V pořádku.

### Gaps
- Pro Tracy, Superluminal, Sentry nebo Crashpad jsem v tomto sezení nesbíral zdroje. Konkrétní volbu profileru a crash reporteru je třeba ověřit (C API, licence, macOS ARM64).
- Díly 2 a 3 o save systému Machinery (verzování, ECS integrace) jsem nečetl.
- Nenašel jsem zdroj, který kvantifikuje cenu retrofitu klient/server v Minecraftu (počet měsíců, regresní chyby). Je doložen jen fakt a kvalitativní dopad.
- Zda Light No Fire bude multiplayer, zde neověřeno.

---

## 3. „Bez ECS“ vs ECS pro obecný engine (D15)

### Takeaway
Odmítnutí *generického ECS frameworku s vlastním schedulerem* v jádře je obhajitelné. Godot je obecný engine bez ECS a doporučuje pro hromadné zpracování jít přímo na servery, tedy přesně náš model. Problém je jinde: **nad archetypy, instancemi a handly nemáme žádný obecný model kompozice herních objektů**, a ten má každý srovnávaný obecný engine (Godot nody, Unreal aktory a komponenty, O3DE a Machinery a Bevy a Veloren ECS, Wicked ComponentManager). Bez něj budou budoucí hry stavět vlastní objektový model nad `eng_api` a každá jinak.

### Cited Findings
- Godot: „Godot does composition at a higher level than in a traditional ECS.“ Kompozice přes hierarchii nodů. Pro výkonné případy doporučuje servery přímo nebo ECS třetí strany. — [Godot blog, 26. 2. 2021](https://godotengine.org/article/why-isnt-godot-ecs-based-game-engine/)
- Wicked: per-type `ComponentManager<T>` s hustými poli a entitou `uint64`, bez generických dotazů přes víc komponent. Systémy iterují pole jednoho manageru a dohledávají jiné komponenty přes lookup. — [wiECS.h](https://raw.githubusercontent.com/turanszkij/WickedEngine/master/WickedEngine/wiECS.h)
- The Machinery: ECS jako plugin, editor postavený kolem ECS a renderer, který čte data komponent přes rozhraní pluginů. — [Machinery: ECS and Rendering](https://ruby0x1.github.io/machinery_blog_archive/post/ecs-and-rendering/)
- Bevy: ECS je i v rendereru (Render World), extrakce kopíruje mezi dvěma ECS světy. — [Bevy cheatbook](https://bevy-cheatbook.github.io/gpu/intro.html)
- Veloren: ECS komponenty sdílené klientem a serverem v `common` (sekundární zdroj). — [rustutils](https://rustutils.com/tools/veloren/); [Veloren book](https://book.veloren.net/contributors/developers/codebase-structure.html)
- Naše vlastní argumenty proti ECS (první zpráva): vlastní scheduler flecs se překrývá s naším job systémem a prostorové struktury v ECS nežijí, jak uvádí i ECS FAQ. — [ECS FAQ](https://github.com/SanderMertens/ecs-faq); [flecs](https://github.com/SanderMertens/flecs)

### Inferences
- **Kde máme pravdu:** statické instance (desítky tisíc na buňku, uvolňované najednou) nemají být entity v žádném enginu. I Unreal je drží jako instancovaná data a Godot doporučuje servery. Spatial a streaming musí vlastnit `world`. To platí beze změny.
- **Kde to dělá budoucí hry těžšími:** (1) Gameplay objekty jako NPC, mount, pevnost nebo questový předmět chtějí kompozici vlastností (zdraví, inventář, AI, interakce). Dnes je to „pool aktérů s tlustou hlavičkou + pole stavů“, ale přidání nového typu stavu znamená změnu enginu, ne hry. (2) Save, síť a inspektor potřebují uniformně procházet komponenty objektu, což vyžaduje registr typů (viz sekce 2). (3) Modding potřebuje přidávat nové komponenty bez rekompilace enginu.
- **Doporučení (střední cesta, ne flecs):** pro **dynamické aktéry** zavést Wicked-style vrstvu: `eng_entity` (generační handle, který už máme), **registr typů komponent** (jméno, verze, velikost, popis polí, save/load/replicate callbacky) a **správce komponent jednoho typu s hustým polem** podle Bitsquidu, které vlastní systém nebo hra. Hra (DLL) smí registrovat vlastní typy komponent. Nepřidávat generické multi-komponentní dotazy ani vlastní scheduler, systémy jsou obyčejné joby. Statické instance zůstávají SoA v buňkách. Výsledek se podobá Wicked a Bitsquidu, ne Bevy, a zachová všechny naše argumenty proti ECS. Zároveň odstraní největší nevýhodu „bez ECS“ pro obecný engine.
- Varianta „flecs až v `game`“ (první zpráva ji připouští) je horší. Save, síť a inspektor by pak žily v herní DLL a každá hra by je řešila znovu, což jde proti D15.

### Gaps
- Nenašel jsem primární zdroj s kvantitativním srovnáním produktivity ECS vs. ne-ECS pro tým jednoho vývojáře. Argumenty na obou stranách jsou kvalitativní (Godot blog, ECS FAQ).
- Konkrétní řešení vztahů rodič-dítě (hierarchie transformací) ve Wicked (`MoveItem` kvůli řazení) jsem viděl jen v API, ne v popisu použití.

---

## 4. Abstrakce tvaru světa (plochá mřížka vs cube-sphere), stručně

### Takeaway
Žádný ze srovnávaných obecných enginů (Godot, Unreal World Partition, O3DE, Bevy, Flax) **nemá tvar světa jako vyměnitelný port**. World Partition je 2D mřížka a Veloren i Luanti mají ploché světy. Port pro tvar světa podle D15 je tedy vlastní inovace bez vzoru v open-source enginu a měl by být co nejužší.

### Cited Findings
- UE5 World Partition používá 2D runtime mřížku buněk a více streaming sources (citováno v naší první zprávě). — [UE World Partition](https://dev.epicgames.com/documentation/en-us/unreal-engine/world-partition-in-unreal-engine)
- Veloren `world` crate generuje a simuluje svět odděleně od klienta i serveru. Je to vzor pro oddělení generátoru od topologie. — [Veloren book](https://book.veloren.net/contributors/developers/codebase-structure.html)

### Inferences
- Port by měl abstrahovat jen **klíč buňky a jeho sousedy, převod klíč ↔ lokální rámec (počátek, báze „nahoru“) a výběr buněk pro streaming source**. Plochá mřížka má klíč `(x, y, lod)`, cube-sphere `(face, x, y, lod)` nebo quadtree uzel. Ostatní moduly (`gen_world`, strategie, souřadnice cell+float, fyzikální gravitace) pracují v lokálním rámci buňky. Náš souřadnicový návrh `int32 cell_x, cell_y + float offset` je přitom specifický pro plochou mřížku a musí se zobecnit na `cell_key + lokální float3 v rámci buňky`. **To je třeba rozhodnout před M4**, protože to prosákne do formátu `cell_blob`, do ID generovaných entit `hash(úroveň, souřadnice, …)` a do save souborů.
- Detail (cube-sphere, octree, gravitace) pokrývá jiný výzkumník.

### Gaps
- V tomto sezení jsem nesbíral zdroje k tomu, jak planetární enginy (Outerra, Space Engineers, Kerbal, No Man's Sky) abstrahují topologii. Pokrývá to jiný výzkumník.

---

## Souhrn návrhů (pro report writera, seřazeno podle priority)

1. **Tvar simulace jako server od začátku** (příkazy hráče místo surového vstupu, headless server target v CI, více streaming sources). Levné teď, drahé později (Minecraft 1.3).
2. **Registr typů + verzované chunkové serializace** (Wicked `ComponentLibrary`) jako základ pro save, diffy buněk, migrace receptů, inspektor a budoucí replikaci. Revidovat pravidlo „žádná globální reflexe“: platí uvnitř systémů, ne na perzistentní hranici.
3. **Komponenty pro dynamické aktéry ve stylu Wicked/Bitsquid**, které smí registrovat i hra. Žádný flecs a žádný scheduler.
4. **Explicitní protokol extrakce** (perzistentní render instance + dirty fronta + per-frame aréna, mazání po fence), převzatý z Unreal proxy a Bevy extrakce, sepsaný před M5, aby pipelining v M7 byl jen zapnutím.
5. **Deklarativní popis modulů a extension point v render graphu** (O3DE Gems a passy, Machinery pluginy), aby mediátor `runtime` nerostl s každou feature pro D15.
6. **Stabilní, verzované C ABI `eng_api`**, aby šel později přidat skriptovací adaptér (Lua jako Luanti, jen serverová strana). Skriptovací jazyk teď ne.
7. **Do milníků doplnit herní UI, debug UI a inspektor, crash handler navázaný na replay a profiler hooky** kompatibilní s externím profilerem.
8. **Předem sestavený graf jobů snímku** (Doom Eternal) místo ad hoc spawnů, kvůli ladění a profilaci.
9. **Zobecnit souřadnice `cell_x, cell_y + float` na `cell_key + lokální rámec`** a rozhodnout to před M4 (D15).
