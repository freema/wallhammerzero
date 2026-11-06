# Rozhodnutí

Co jsme se rozhodli, kdy a proč. Nové rozhodnutí se přidává na konec s datem; když se něco změní, staré se nemaže, ale označí jako nahrazené a odkáže na nové.

Stav: **D1–D73 zapsané.** D24–D71 jsou potvrzené návrhy z [NAVRHY-ROZHODNUTI.md](NAVRHY-ROZHODNUTI.md) (číslo rozhodnutí = číslo návrhu + 23). Jediná změna proti návrhům: D35 (Xcode se neinstaluje). Plán je v [ROADMAP.md](ROADMAP.md), konvence v [CONVENTIONS.md](CONVENTIONS.md).

---

## D1 — Nový začátek (2026-11-05)
Starý Wallhammer Zero (TypeScript/WebGL studio, Kairosoft simulace, New Hope, Tidewright) končí. Zůstává jen jako inspirace v privátním repu `freema/wallhammerzero`, větev `implementation`. Nový projekt začíná od nuly ve stejném jméně.

## D2 — Nativní engine, tři platformy (2026-11-05)
Vlastní engine s vlastním rendererem. Vyvíjí se na macOS (MacBook Pro M4 Pro, 12 jader 8P+4E, 16jádrové GPU, 24 GB, Metal 3), musí běžet i na Linuxu a Windows.

## D3 — Čistě 3D open world (2026-11-05)
Žádné 2D. Cílem je 3D open world. Inspirací jsou architektury RAGE a GTA (streaming světa, LOD, archetypy a instance), nekopírujeme konkrétní hru.

## D4 — Jazyk C17 (2026-11-05, navrženo)
Jádro enginu v C17. C++ knihovny (např. fyzika Jolt) se smí použít jen za C API v adaptéru a dál nepronikají.
*Stav: doporučeno, vlastník zatím výslovně nepotvrdil.*
*Potvrzeno 2026-11-06, viz D24.*

## D5 — SDL3 + SDL_GPU pod vlastním tenkým RHI (2026-11-05, navrženo)
Okna, vstup, audio, vlákna a async IO bere engine z SDL3. Render jde přes SDL_GPU (Metal / Vulkan / D3D12) schované za vlastní tenkou vrstvou s handly, aby šel později doplnit nativní backend.
Známé limity SDL_GPU: chybí bindless (zamítnuto 2026-06), multi-draw indirect je na Metalu CPU smyčka, nejsou timestamp queries.
*Potvrzeno 2026-11-06, viz D25.*

## D6 — Nezaneřádit systém (2026-11-05)
Všechno je soběstačné ve složce projektu: nástroje (cmake, ninja) se stahují do `.tools/`, knihovny jsou git submoduly v `external/`, build jde do `build/`. Do systému se nic neinstaluje. Používá se jen to, co macOS už má: Command Line Tools, git a curl.
*Potvrzeno bez výjimek 2026-11-06, viz D35: Xcode se neinstaluje.*

## D7 — Architektura (2026-11-05)
Vrstvy podle Gregoryho vynucené CMake targety, porty a adaptéry jen na hrubých švech, žádné generické ECS (archetypy, instance a handly), work-stealing job systém bez fiberů, streaming po buňkách 128–256 m.
Podrobně: [research/Architektura open world enginu.md](research/Architektura%20open%20world%20enginu.md).

## D8 — Všechna grafika z kódu (2026-11-05)
Žádný Blender ani jiný DCC nástroj. Textury, materiály, modely, animace i svět generuje kód. Asset = program + parametry + seed, výsledek se cachuje podle hashe. Procedurální generování je hlavní část enginu: buňka světa může přijít z předpečených souborů i z generátoru ve stejném formátu.

## D9 — Fotorealismus ne (2026-11-05)
Cílem je nejdosažitelnější dobře vypadající styl, ne fotorealismus. Ze zvažovaných kandidátů je hlavní 3D pixel art (render v nízkém rozlišení, omezená paleta), mimo jiné kvůli výkonu.

## D10 — Výtvarný styl (otevřené)
Konkrétní styl čeká na dokončení analýzy. Rámec už je daný v D12.
*Rozhodnuto 2026-11-06, viz D52.*

## D12 — Plné 3D s volnou kamerou (2026-11-05)
Žádná pevná izometrie ve stylu GTA 1/2 ani striktní ortografický 3D pixel art. Hra je plně 3D s volnou perspektivní kamerou (třetí osoba, kamera za autem, volná rotace). Fotorealismus stále ne (D9): styl bude stylizované 3D, které s volnou kamerou funguje. Tím se z D9 ruší 3D pixel art jako hlavní kandidát.

## D13 — Laťka kvality: aspoň GTA III / World of Warcraft (2026-11-05)
Izometrie a pixel art nestačí. Minimální vizuální úroveň je GTA III (2001) nebo World of Warcraft (2004): plné 3D v nativním rozlišení, otexturované povrchy s výrazným stylizovaným charakterem (WoW), husté město s budovami, auty a chodci (GTA III). Nižší vnitřní rozlišení zůstává jen jako volitelné nastavení výkonu, ne jako styl.

## D14 — Textury ze dvou zdrojů: kód i obrázkový AI model (2026-11-05)
Zpřesňuje D8. Každý materiál si vybere zdroj: **procedurální program**, nebo **obrázek vygenerovaný jednou AI modelem**. Obrázek se uloží do repa jako zdrojový asset a k němu původ (model, prompt, seed, datum). Vygenerované obrázky vždy projdou kódem: dlaždicovatelnost, přemapování na paletu a color grade, odvození normal, height a roughness map, procedurální opotřebení a variace. Oba zdroje mají stejné linty, review i schvalování. Geometrie, animace a svět zůstávají generované kódem.

## D15 — Obecný engine, ne engine pro jednu hru (2026-11-05)
Engine nestavíme pro konkrétní hru. Musí zvládnout různé typy 3D open worldů: husté město ve stylu GTA, velkou procedurální planetu ve stylu Light No Fire (biomy, vesnice, pevnosti, mounti, zakřivení viditelné z výšky) i jejich kombinace. Plán voxelové hry z Vellumu (`projects/grafika-reference/plan-voxel-hra.md`) je jedna z možných her nad enginem, ne jeho zadání.
Důsledky: tvar světa (plochá mřížka buněk, nebo cube-sphere s octree) musí být vyměnitelný za portem, ne natvrdo. Souřadnice, streaming, generátory terénu a gravitace/„nahoru“ s tím musí počítat. GTA město je referenční scénář pro první milníky.

## D11 — Nejdřív kompletní analýza, pak kód (2026-11-05)
Žádné prototypy ani pokusy, dokud není hotová analýza všech oblastí: architektura, procedurální grafika a to, co AI reálně zvládne.

## Role
- **Vlastník** je art director: píše specifikace, dodává reference a schvaluje.
- **Claude** je programátor a technical artist: píše generátory, linty a review rendery.

## D16 — Měřítko a proporce jsou součástí enginu od začátku (2026-11-05)
V minulém projektu byly postavy moc velké vůči příliš malému městu. Proto měřítko neřeší každý generátor po svém:
- **Jednotka:** 1 jednotka = 1 metr.
- **Tabulka měřítek:** rozměry jsou v jedné centrální tabulce (postava, dveře, patro, pruh, auto, blok…) a čtou je všechny generátory.
- **Kontrola:** linty hlídají poměry mezi třídami assetů a každý náhled ukazuje referenční figurínu.
- **Stylizace:** odchylka od reálných rozměrů (jako u WoW nebo GTA) se nastavuje vědomě, jedním místem.

Konkrétní čísla dodá rešerše 5 (téma měřítko a proporce).
*Doplněno (2026-11-06):* návrh je hotový ve zprávě [Srovnání enginu a návrhy zlepšení](research/Srovnání%20enginu%20a%20návrhy%20zlepšení.md), sekce o měřítku. Čísla tabulky čekají na schválení vlastníkem.

## D17 — Ladicí nástroje, headless režim a logování jsou základ enginu (2026-11-05)
Vlastník je považuje za důležité téma. Kód píše hlavně AI, která engine nevidí na obrazovce, takže engine musí jít pozorovat a ovládat strojově. Požadavky:
- **Headless režim:** běh bez okna i bez GPU, deterministický krok času, „spusť N snímků a vypiš stav“.
- **Logování:** strukturované, po kanálech a úrovních, strojově čitelné (JSON lines) i pro člověka.
- **Konzole a proměnné:** konzole a CVars.
- **Ladicí server:** dotazy na stav, screenshoty na požádání, zastavení a krokování času.
- **Ladicí kreslení a inspektor:** debug draw a inspektor (ImGui).
- **Profilování:** profiler a rozpočty, které shodí CI.
- **Opakovatelnost a pády:** záznam a přehrání vstupu, zachycení pádů.

Patří do prvních milníků, ne až na konec. Konkrétní návrh dodá rešerše 5 (téma ladění, headless a logování).
*Doplněno (2026-11-06):* návrh je hotový ve stejné zprávě, sekce o ladění.

## D18 — Vestavěné studio, MCP nástroje, UI a projekty (2026-11-05)
Vlastník chce na enginu a hrách pracovat pomocí AI. Engine proto dostane:
- **Studio (editor):** postavené nad enginem. Má viewport, inspektor, panely parametrů generátorů a A/B review.
- **MCP server přímo v enginu nebo studiu:** AI agent (Claude Code a další) přes něj ovládá engine: dotazy na svět, spouštění generátorů, screenshoty, linty, krokování času, CVars, logy, build a hot reload. Staví na ladicím serveru z D17.
- **UI systém:** pro herní UI a HUD i pro samotné studio.
- **Systém projektů:** víc her nad jedním enginem (D15). Každý projekt má vlastní herní DLL, data, generátory, style bible a tabulku měřítek (D16) a kontext pro AI.

„Podpora projektylu“ chápeme jako projekty. Pokud šlo o projektily (střely), doplní se.
Konkrétní návrh dodá rešerše 5 (téma studio, MCP, UI a projekty).
*Doplněno (2026-11-06):* návrh je hotový ve stejné zprávě, sekce o registru nástrojů a studiu.

## D19 — D15 platí, varování z postmortemů se zamítá (2026-11-05)
Rešerše 5 upozornila, že obecné enginy bez vlajkové hry (The Machinery, Stingray, Hazel) skončily nebo stojí, a doporučila stavět engine pro jednu hru. Vlastník to zamítl: jdeme úplně jinou cestou než tyto enginy. Kód píše AI, obsah generuje kód a vlastník je art director.
Důsledky:
- D15 (obecný engine pro město i planetu) zůstává beze změny.
- Doporučení „engine pro jednu hru“ se znovu neotevírá.
- Referenční scény (městský blok, zárodek planety) v návrzích milníků slouží jen jako testovací scény enginu, ne jako zúžení na jednu hru.

## D20 — Testování platforem: Mac primárně, Windows později zvlášť, bez upgradu macOS (2026-11-05)
- **Vývojový Mac:** engine se vyvíjí a ladí na MacBooku M4 Pro (Metal). Pro vývoj ani jako primární platforma to podle analýzy problém není.
- **Windows a D3D12:** budou se testovat později a zvlášť, na Windows stroji.
- **macOS:** upgrade na macOS 26 se kvůli Vulkanu dělat nebude. Vulkan backend (KosmicKrisp) se proto na Macu netestuje.
- **Vulkan:** ověřuje se v Linux CI. Shadery se validují do SPIR-V a vykreslují softwarově přes lavapipe (headless a golden image testy). Na reálném GPU se ověří, až se bude testovat Linux.
- **Co tím ztrácíme:** chyby specifické pro Vulkan na reálném GPU se ukážou později. Metal 4 SDL_GPU stejně nepoužívá.
- **Doplněno (2026-11-05):** primární a jediný vývojový stroj je tento MacBook; Linux a Windows slouží jen k testům. Vlastník má testovací stroje s Linuxem i Windows, což stačí. Vulkan se tedy ověří i na reálném GPU (Linux) a D3D12 na Windows stroji. CI s lavapipe zůstává jako automatická pojistka.

## D21 — Žádný Three.js ani JavaScript v enginu (2026-11-05)
Engine neobsahuje Three.js, JavaScript, WebGL ani webový runtime. Žádný jejich kód ani závislost. Referenční repa z Vellumu (Sakura Crossing, Voxel Musou, Threejs-Punk) jsou psaná v Three.js a slouží jen jako zdroj nápadů a technik. Ty se píšou znovu od nuly v C17 a HLSL nad SDL3 a SDL_GPU.

## D22 — Implementační plán povedeme v Linearu, postupně (2026-11-06)
Implementační plán enginu se bude zakládat postupně v Linearu. Podkladem jsou dokumenty v `docs/`.
- **Nejdřív revize:** před založením plánu prošla dokumentace revizí slabých míst, viz [REVIZE.md](REVIZE.md).
- **Dělba:** `docs/` zůstává zdrojem pravdy pro rozhodnutí, návrh a kritéria milníků. Linear sleduje práci (úkoly, stav, pořadí).
- **Postupně:** úkoly se rozepisují jen pro nejbližší milníky, vzdálenější až když se blíží.
- D11 platí dál: kód nevzniká, dokud vlastník analýzu neukončí.

## D23 — Engine musí podporovat i strategie (2026-11-06)
Rozšiřuje D15. Vedle města ve stylu GTA a planety ve stylu Light No Fire musí engine zvládnout strategické hry: budovatelskou strategii ve stylu Cities: Skylines a velkou strategii ve stylu Stellaris.
Důsledky pro návrh (jako návrhy k potvrzení jsou v [NAVRHY-ROZHODNUTI.md](NAVRHY-ROZHODNUTI.md), body 16, 21 a 23–27, 34):
- **Simulace celého světa:** běží i mimo kameru. Globální data simulace jsou oddělená od buněk, které se streamují pro kreslení.
- **Hromadné entity:** statisíce obyvatel, aut nebo populací v hustých tabulkách, bez fyziky.
- **Svět stavěný hráčem:** zásah hráče je vstup generátoru a buňka se přegeneruje za běhu.
- **Ovládání:** strategická kamera, výběr myší, umisťování s přichytáváním.
- **Čas:** pauza a zrychlení, pomalé tiky ekonomiky vedle rychlé fyziky.
- **UI:** tabulky, seznamy, tooltipy, okna.
- **Ověření:** třetí testovací scéna enginu „strategický výřez“.

---

# Potvrzení návrhů (2026-11-06)

Vlastník potvrdil všech 48 návrhů z [NAVRHY-ROZHODNUTI.md](NAVRHY-ROZHODNUTI.md) najednou („beru vše“). Jedinou výjimkou je návrh 12 (Xcode), který zamítl. Číslo rozhodnutí je číslo návrhu + 23. Čísla milníků v textu odpovídají [ROADMAP.md](ROADMAP.md) (M0–M10).

### Skupina A. Základy

## D24 — Jazyk C17 je potvrzený (2026-11-06)
Potvrzuje D4. Jádro je v C17 se sanitizery (ASan, UBSan, TSan), `-Werror` a fuzzingem loaderů. C++ je povolené jen uvnitř adaptérů knihoven.

## D25 — SDL3 + SDL_GPU za vlastním RHI je potvrzené (2026-11-06)
Potvrzuje D5. RHI stojí na třech přenosných pojmech: handly podobné adresám bufferů, materiálová tabulka textur a proud nepřímých drawů. Nativní Metal 3 backend vznikne jen tehdy, když ho vynutí měření ceny drawu v M1.

## D26 — Clang na všech třech OS (2026-11-06)
Na Windows se staví přes clang-cl, MSVC se nepoužívá. Důvod: MSVC má C11 atomics jen experimentálně a jedna rodina překladače zmenší rozdíly ve floatech.

## D27 — Renderer je forward+ s clusterovanými světly (2026-11-06)
Bez povinného depth prepassu. Nahrazuje deferred G-buffer ze zpráv 1 a 2. Potvrdí se měřením 1 v M2.

## D28 — Determinismus ve dvou úrovních (2026-11-06)
- **Úroveň A (bitově shodné na 3 OS):** generátory a logika simulace. Píšou se nad celými čísly, fixed-pointem a `detmath`.
- **Úroveň B (shodné jen na stejné platformě a buildu):** fyzika, animace a mix zvuku.
Brána M4 se podle toho mění: replay jízdy je bitově shodný na stejné platformě, hash logické simulace na všech třech OS.

## D29 — Plán je přijatý, platí jen ROADMAP.md (2026-11-06)
Přijímá se sjednocený plán ze zprávy 5, doplněný o zprávy 4 a 6 a o testovací scénu strategie. Milníky M0, M3 a M4 jsou rozdělené na fáze. Podrobnosti číslování jsou v D72.

## D30 — Jeden registr nástrojů, dva transporty (2026-11-06)
Zpřesňuje D18. Nástroje pro AI se registrují jednou a volají se přes MCP i přes CLI. Nástroj „spusť libovolný kód“ neexistuje.

## D31 — Osa Z míří nahoru (2026-11-06)
Pravotočivý systém, X je východ, Y sever, Z nahoru, jednotkou je metr. Lint zakáže natvrdo zadané „nahoru“. Podrobnosti jsou v CONVENTIONS.

## D32 — Monorepo (2026-11-06)
Engine je v `engine/`, hry v `projects/<hra>/`. CI testuje všechny projekty, aby engine zůstal obecný (D15, D23).

## D33 — Hosting a CI (2026-11-06)
Privátní repo `freema/wallhammerzero`, větev `main`. Linux a Windows běží v hostovaném CI při každém pushi. Testy na macOS běží lokálně jedním skriptem před merge, hostovaný macOS jen jako noční běh.

## D34 — Review ve sdružených branách (2026-11-06)
Každý milník má hodinový rozpočet review vlastníka. Brány se sdružují do pevných termínů. Propustnost review se měří od M2.

## D35 — Xcode se neinstaluje, D6 platí bez výjimek (2026-11-06)
Návrh 12 (povolit Xcode jako jedinou systémovou instalaci) vlastník **zamítl**: nic podstatného nepřináší a na vývojový notebook se instalovat nebude. Téma se znovu neotevírá.
Důsledky:
- **Build:** stačí Command Line Tools. Shadery pro Metal se dodávají jako zdrojový text MSL a SDL_GPU je překládá za běhu. Offline překladač `metal` se nepoužívá.
- **Měření GPU na Macu:** vlastní čítače a časy snímků enginu, `powermetrics` a Metal HUD, které macOS už má. Tracy je v `.tools/`.
- **Ladění GPU:** RenderDoc na testovacích strojích s Linuxem a Windows, na Macu ladicí skupiny a vlastní výpisy.
- **Co tím ztrácíme:** rozpad času GPU po jednotlivých passech na Metalu. Rozpočty se proto vedou v počtech (drawy, fragmenty, částice), jak to už navrhuje zpráva 6.

## D36 — Konec analýzy (2026-11-06)
Doplňuje D11. Analýza končí, když jsou potvrzená rozhodnutí D24–D37, existuje `ROADMAP.md` a `CONVENTIONS.md` a v Linearu jsou úkoly pro M0 a M1. Zbylé rešerše (D71) běží vedle implementace.
*Stav 2026-11-06: všechny podmínky jsou splněné. Analýza je uzavřená, první kód vznikne úkolem M0a na pokyn vlastníka.*

## D37 — Co engine nedělá (2026-11-06)
Mobil a konzole, fotorealismus, VR, editor pro třetí strany a zatím ani síťový kód. Žánry seznam neomezuje.

### Skupina B. Svět a simulace

## D38 — Typ světa volí projekt (2026-11-06)
Svět ze seedu s ručními přepisy, nový svět na každou hru, nebo svět stavěný hráčem. Nekonečný svět není cíl.

## D39 — Svět je plně upravitelný příkazy hráče (2026-11-06)
Zásah hráče (silnice, zóna, budova) je vstup generátoru a dotčená buňka se přegeneruje za běhu. Voxelové kopání je volitelný pozdější milník.

## D40 — Ukládají se změny nad regenerací a stav simulace (2026-11-06)
Save obsahuje změny nad deterministicky regenerovaným světem, stabilní ID z kotvy a plný stav simulace z registru typů. Formát je verzovaný.

## D41 — Síť: jen tvar (2026-11-06)
Simulace má tvar serveru a vstupem jsou příkazy hráče. Síťový kód nevzniká. Díky D28 zůstává otevřená cesta k lockstep multiplayeru strategií.

## D42 — Fyzika je Jolt přes joltc (2026-11-06)
Dává aktivní ragdoll a vozidla z čistého C API. C++ zůstává uvnitř adaptéru.

## D43 — Registr typů od M0 (2026-11-06)
Registr (jméno, verze, pole) slouží savu, inspektoru a schématům nástrojů. Verze v0 vzniká v M0, verzovaná serializace v M1.

## D44 — Tři třídy objektů (2026-11-06)
Zpřesňuje D7.
- **Statické instance** po buňkách.
- **Aktéři** s komponentami registrovanými hrou (tisíce, s fyzikou).
- **Hromadné entity** (statisíce, husté tabulky, bez fyziky, vlastní 64bitová ID).
V enginu není generické ECS. Herní DLL si ho smí přinést.

## D45 — Žádný skriptovací jazyk (2026-11-06)
Hra se píše proti stabilnímu C ABI. Herní data (budovy, technologie, události) jsou textové tabulky načítané přes registr typů.

## D46 — Simulace má dvě vrstvy (2026-11-06)
Globální data simulace (silniční graf, tabulky budov a entit) jsou vždy v paměti a tikají v celém světě. Buňky se streamují jen pro kreslení a fyziku.

## D47 — Hodiny simulace (2026-11-06)
Pauza a násobky rychlosti. Skupiny tiků mají různou frekvenci (fyzika 60 Hz, ekonomika pomalu) a práce se rozkládá přes snímky. Kreslení zůstává plynulé nezávisle na rychlosti.

## D48 — Svět je objekt (2026-11-06)
Svět není globální proměnná a může jich existovat víc najednou (mapa galaxie a pohled do soustavy).

## D49 — Základ strategického ovládání je v enginu (2026-11-06)
Strategická kamera, výběr myší a rámečkem a umisťování s přichytáváním. Pravidla hry zůstávají v herní DLL. Stejné nástroje používá studio.

## D50 — Testovací scéna C „strategický výřez“ (2026-11-06)
Vlastní milník M6 po zárodku planety: kamera shora, 100 000 entit na silničním grafu, hráčem nakreslená silnice, zrychlení času a panel s tabulkou.

## D51 — Obsah města před postavami (2026-11-06)
M8 (obsah města) jde před M9 (postavy). Pořadí se přehodnotí po bráně M4.

### Skupina C. Vzhled a obsah

## D52 — Výtvarný styl: stylizované malované 3D (2026-11-06)
Uzavírá D10. Textury se zapečeným světlem ve stylu WoW, rampové světlo s tónovaným stínem, jedna globální paleta a LUT, mlha a vzdušná perspektiva, hustota města jako GTA III. Obrysy jsou vypnuté a zůstávají jako volitelný parametr. Potvrdí se na scéně v M2 vedle referencí.

## D53 — Výchozí profil měřítka (2026-11-06)
Zpřesňuje D16. Postava 1,80 m, otvory ×1,20, podlaží ×1,10, pruhy ×1,15, vzdálenosti ×0,5, modul 0,5 m. Profil se zmrazí v M2 vedle referencí. Každý projekt má vlastní tabulku.

## D54 — Interně 1080p a vlastní upscale (2026-11-06)
UI se kreslí v nativním rozlišení. Potvrdí se měřeními 1 a 6.

## D55 — Rozšíření D14 (2026-11-06)
AI zdrojem smí být celá sada map. K provenanci přibývá licence a C2PA a z provenance se generuje report pro Steam.

## D56 — Druhý hodnotitel od jiného dodavatele (2026-11-06)
Povolený je levný model jiného dodavatele. Povinný je jen u rizikových kategorií (postavy, auta, malované textury). Rendery se tím posílají další službě.

## D57 — UI: studio na Dear ImGui, hra na vlastním eng_ui (2026-11-06)
`eng_ui` stojí nad Clay a SDL_ttf a má widgety (tabulky, seznamy, tooltipy, okna), vazbu na data a popis UI v textových souborech. RmlUi se vyhodnotí jako záloha.

### Skupina D. Zvuk a efekty

## D58 — AI zvuk jen pro efekty a ambience (2026-11-06)
S provenancí jako u D14. Hudba z AI ne.

## D59 — Model pro zvuky: ElevenLabs (2026-11-06)
S připnutou verzí modelu. Před prvním použitím je potřeba přečíst podmínky služby, z primárního zdroje ověřené nejsou.

## D60 — Hudba rádia se odkládá (2026-11-06)
Engine se staví nezávisle na zdroji hudby.

## D61 — Hudba planety a strategie z kódu (2026-11-06)
Fragmenty skládané podle místa a situace, kurátorem je vlastník.

## D62 — Stylizovaná zvuková paleta (2026-11-06)
Sladěná s obrazem (D52).

## D63 — Prostorový zvuk (2026-11-06)
Stylizovaná okluze a dozvukové zóny. Steam Audio až později za portem.

## D64 — Hlasitost (2026-11-06)
Cíl −23 LUFS, špičky do −1 dBTP a hlasitější profil pro reproduktory notebooku.

## D65 — Zvukové zařízení a mixer (2026-11-06)
SDL3 dodává zařízení, mixuje miniaudio. Nahrazuje „mixer SDL3“ ze zprávy 5.

## D66 — Pravidla efektů jako linty (2026-11-06)
Přebírají se pravidla Riotu. Konkrétní čísla schvaluje vlastník ve style bible.

## D67 — Efekty z kódu, malý AI arch tahů štětcem povolen (2026-11-06)
AI obrázky pro efekty podléhají D14 a D55.

## D68 — Rozsah počasí (2026-11-06)
Déšť, mlha a blesky přicházejí s městem. Sníh, písek a vítr s planetou.

### Skupina E. Organizace

## D69 — „Projektylu“ v D18 znamená projekty (2026-11-06)
Projektily (střely) patří do herní DLL. Engine dává fyzikální dotazy a efekty.

## D70 — Dokumentace se commituje hned (2026-11-06)
Do privátního repa `freema/wallhammerzero`, větev `main`.

## D71 — Čtyři rešerše souběžně s M0 a M1 (2026-11-06)
1. Doprava, chodci a hromadná simulace entit.
2. Fyzika jízdy.
3. Světlo, obloha a denní doba.
4. Strategie: datově bohaté UI a datově řízený obsah.

### Skupina F. Konsolidace

Tato dvě rozhodnutí sepsal Claude při slučování zpráv do jednoho plánu, na základě D29 a D31. Vlastník je může změnit.

## D72 — Číslování milníků M0–M10 (2026-11-06)
Scéna strategie (D50) je vložená jako M6. Milníky M6–M9 ze zprávy 5 se tím posouvají na M7–M10. Zprávy 1, 2, 4 a 6 používají starší číslování. Převodní tabulka je v ROADMAP. Voxelové objemy a obsah planety zůstávají bez čísla jako pozdější práce.

## D73 — Závazné konvence (2026-11-06)
[CONVENTIONS.md](CONVENTIONS.md) řeší rozpory mezi zprávami:
- **ID buňky:** 64 bitů `[face:3][level:5][x:28][y:28]`, plochý svět má `face = 7` (zpráva 4).
- **Pozice:** double na CPU, float jen relativně k buňce nebo kameře (zpráva 4).
- **Stabilní ID:** z kotvy a jména pravidla (zpráva 4).
- **Prefix:** identifikátory enginu začínají `eng_`. Prefix `wh_` ze zprávy 4 se nepoužívá.
- **Nástroje:** `wz` (engine), `wz_studio`, `wzmcp` (MCP) a `wzctl` (CLI). Jména `engctl`, `wzcli`, `gencli` a `genlint` se nahrazují příkazy `wzctl`.
