# Plán: milníky M0–M10

**Jediný platný plán enginu.** Nahrazuje roadmapy ve všech šesti rešeršních zprávách (D29, D72). Kde se tento soubor se zprávou rozchází, platí tento soubor.

**Stav:** platí od 2026-11-06. Analýza je uzavřená (D36), první kód vznikne úkolem M0a.
**Práce se sleduje v Linearu:** projekt [Wallhammer Zero](https://linear.app/nsoft/project/wallhammer-zero-3576c061ad78), tým Nsoft. Rozepsané jsou M0 a M1 (D22).

## Jak plán funguje

- **Trvalý kód.** Každý milník staví kód ve finálním modulu s testy. Zahazovací prototypy nevznikají.
- **Strojová kontrola.** Každý milník má soubor `milestones/Mx.json`. Položku smí agent přepnout na `passes: true` jen po úspěšném příkazu, který je u ní zapsaný.
- **Brána vlastníka.** Položky s `owner_gate: true` přepíná jen vlastník. Brány se sdružují a každý milník má rozpočet hodin review (D34).
- **Fáze.** Velké milníky se dělí na fáze (M0a, M0b…) s vlastní kontrolou. Fáze dalších milníků se určí, až se budou rozepisovat úkoly.
- **Tři testovací scény.** Městský blok (M4), zárodek planety (M5) a strategický výřez (M6) běží v CI po celou dobu. Hlídají, že engine zůstává obecný (D15, D19, D23). Nejsou to hry.

```json
{ "milestone": "M2", "owner_review_budget_h": 6,
  "items": [
    { "id": "M2.lavapipe_golden", "desc": "referenční scéna projde FLIP na lavapipe",
      "cmd": "ctest -L gpu -R zoo_lavapipe", "expect": "exit 0", "passes": false },
    { "id": "M2.scale_freeze", "desc": "vlastník schválil tabulku měřítek na zoo vedle referencí",
      "cmd": "wzctl review status scale_bible", "expect": "approved", "owner_gate": true, "passes": false } ] }
```

## Přehled

| Milník | Název | Co po něm existuje |
|---|---|---|
| **M0** | Kostra, determinismus a agentní smyčka | build a testy na 3 OS, deterministické jádro generátorů, logy, nástroje pro AI |
| **M1** | Jádro, profiler, ladicí server a cena drawu | paměť a joby, krokování času, RHI a změřený strop drawů |
| **M2** | Stylové osvětlení, studio v0 a zoo měřítek | první obraz ve stylu, studio s viewportem, zmrazená tabulka měřítek |
| **M3** | Assety jako programy a studio pro art directora | generátory textur, budov a silnic, schvalování ve studiu, základ zvuku |
| **M4** | Testovací scéna A: městský blok | hratelný blok s řiditelným autem, herní DLL, replay |
| **M5** | Testovací scéna B: zárodek planety | port tvaru světa se dvěma implementacemi, průlet z orbity |
| **M6** | Testovací scéna C: strategický výřez | 100 000 entit, svět stavěný hráčem, zrychlení času, UI s tabulkou |
| **M7** | Generovaný svět, streaming a perzistence | město 4×4 km i planeta bez děr, ukládání změn |
| **M8** | Obsah města a open-world renderer | husté město s počasím, 30 000+ instancí |
| **M9** | Postavy a animace | 200 chodců, ragdoll |
| **M10** | Škálování | stabilní snímek při 200 km/h přes celou mapu |

Pořadí M8 a M9 se přehodnotí po bráně M4 (D51).

## Převod starého číslování

| Tento plán | Zpráva 5 | Zpráva 4 (a 2) | Zpráva 6 |
|---|---|---|---|
| M0–M3 | M0–M3 | M0–M3 | M0–M3 |
| M4 městský blok | M4 | část M4, M5 (vozidla) | M5 |
| M5 zárodek planety | M5 | část M9 Planeta | — |
| M6 strategický výřez | — | — | — |
| M7 svět a streaming | M6 | M4, část M5 a M8 | M4 |
| M8 obsah města | M7 | M6 | M6 |
| M9 postavy | M8 | M7 | M7 |
| M10 škálování | M9 | M8 | M8 |
| později: obsah planety | — | zbytek M9 | M9 |
| později: voxelové objemy | — | M10 | M10 |

## M0 Kostra, determinismus a agentní smyčka

**M0a Kostra a CI**
- Monorepo: `engine/`, `projects/sandbox/`, `external/`, `scripts/` (D32).
- Skript, který stáhne cmake a ninja do `.tools/` (D6). Do systému se nic neinstaluje.
- CMake targety po vrstvách: `eng_base`, `eng_platform`, `eng_gpu`. Lint závislostí mezi vrstvami.
- SDL3 jako submodul. `wz` otevře okno a vyčistí ho barvou.
- Clang na 3 OS, `-Werror`, ASan, UBSan a TSan (D24, D26).
- Testy: utest a štítky CTest.
- CI: Linux a Windows hostovaně při každém pushi, macOS lokálně skriptem `scripts/check`, hostovaný macOS jako noční běh (D33).
- Vendorované knihovny pro zvuk: miniaudio a libebur128.
- Hotovo, když: build a unit testy jsou zelené na 3 OS a `wz` na Macu otevře okno.

**M0b Determinismus**
- `eng_gen_core`: `detmath`, RNG a šum.
- FP pravidla a lint proti `<math.h>` pro targety úrovně A (D28).
- `eng_cell_id` a matematika obou tvarů světa včetně `det_tan` a `det_atan`.
- Golden hashe v CI.
- Měření 7 a 16.
- Hotovo, když: hash 10 000 vzorků šumu a RNG je shodný na macOS-ARM64, Linux-x64 a Windows-x64. Hash 10⁵ převodů pozice → buňka → pozice je shodný na 3 OS pro plochý svět i kouli.

**M0c Agentní smyčka**
- `eng_log` (JSONL, kanály, kruhový buffer), `ENG_ASSERT`, `ENG_SCOPE` a crash handler.
- `eng_cvar` a `eng_cmd`.
- Běhové režimy `--gpu=null --frames --fixed-dt --seed --script --dump`, výstup do `runs/<id>/`.
- `eng_project` a projekt `projects/sandbox`.
- Registr typů v0: jméno, verze, pole a export JSON Schema (D43).
- `eng_tools`: registr nástrojů a dva transporty, `wzmcp` (MCP) a `wzctl` (CLI). První tři nástroje: `wz_status`, `golden_check` a `log_tail` (D30).
- Lint proti natvrdo zadanému „nahoru“ (D31).
- `milestones/*.json` a soubor s postupem.
- Hotovo, když: `wz --gpu=null --frames 600 --dump` má 0 chyb v `log.jsonl` na 3 OS. Úmyslný assert vytvoří `crash.txt` se zásobníkem scope. Claude Code přečte výsledek `golden_check` jako strukturovaný JSON přes `wzmcp` i `wzctl`.

**Brána vlastníka:** schválí formát milníků a tento plán.

## M1 Jádro, profiler, ladicí server a cena drawu

**M1a Jádro**
- Arény a tagovaný heap.
- Joby: `jobs_run` a `jobs_wait` nad jednoduchým poolem, generátor jako job.
- SPSC fronty.
- Registr typů v1: verzovaná serializace.
- Hotovo, když: paralelní generování 10 000 dlaždic dává stejný hash s 1 i 12 workery.

**M1b Pozorování a ovládání**
- `eng_prof`: obal nad Tracy, fázové časovače, čítače a `stats.json`.
- `eng_debugsrv`: unix socket nebo pipe s tokenem. Metody `sim.pause`, `sim.step`, `sim.step_until`, `state.digest`, `log.tail`, `cvar.*` a `cmd.exec`.
- Hodiny simulace v0: pauza, krok a rychlost (D47).
- Nástroje `time_control`, `cvar_*`, `profile_snapshot`, `console_exec` a `project_build`.
- Hotovo, když: Claude spustí `wz --agent`, odkrokuje 300 ticků a přečte digest menší než 2 kB.

**M1c RHI a cena drawu**
- RHI v0 ze tří přenosných pojmů (D25). Backend SDL_GPU a null backend, který počítá volání.
- Shadery: připnutý commit SDL_shadercross, DXC postavený jednou ze zdrojů do `.tools/`, hot reload a pilot Slangu. Pro Metal se dodává zdrojový text MSL (D35).
- Trvalá měřicí scéna ceny drawu.
- Měření 2, 4, 11 a 26.
- Hotovo, když: výsledky jsou uložené v repu jako baseline a v sekci „Strop drawů“ níže je zapsaný strop a spouštěč nativního Metal backendu.

**Brána vlastníka:** žádná, je to technický milník.

## M2 Stylové osvětlení, studio v0 a zoo měřítek

- **Renderer:** render graph se sloty pro passy modulů. Forward+ s clusterovanými světly (D27). Cluster culling a kompakce indexů v návrhu.
- **Světlo ve stylu (D52):** rampy, hemisférický ambient, kaskádové stíny, mlha, paleta a LUT, volitelné obrysy.
- **Souřadnice:** pozice v double, matice relativní ke kameře, hloubka D32F s reversed-Z a nekonečnou far plane.
- **Rozlišení:** interně 1080p, vlastní upscale, UI nativně (D54).
- **Průhlednosti:** pass s premultiplied blendem, měkké částice, emisní MRT a bloom tlumený mlhou, ladicí pass overdraw. Pochodeň a neon z instancovaných spritů.
- **Obraz pro stroje:** `--gpu=offscreen` a readback, nástroj `shot` (cesta a statistiky), `imgdiff` (FLIP), ladicí skupiny GPU, čas GPU z fence, textový overlay. Lavapipe job v Linux CI.
- **Studio v0:** `wz_studio` na Dear ImGui, viewport, konzole, CVars, log a profiler.
- **Měřítko (D53):** `style/scale.cfg`, `scale_derive()`, scale rig, lint měřítek v0 a lint literálů.
- **Testovací scéna:** zoo měřítek (scale rig a jedna ulice z primitiv).
- **Měření:** 1, 6, 12, 20 a 28.
- **Hotovo, když:** obrazový golden zoo projde FLIP na lavapipe v CI i na Metalu lokálně. Linty měřítek na zoo projdou. `wzctl shot` vrací cestu a statistiky. Objekt 10 000 km od počátku se kreslí bez chvění. Scéna s ohněm a neonem projde headless do PNG a histogramem overdraw.
- **Brána vlastníka:** stylové osvětlení vedle referencí GTA III a WoW. Zmrazení tabulky měřítek. Referenční záběry dodá vlastník.

## M3 Assety jako programy a studio pro art directora

**M3a Assety a cache**
- Port `asset_provider` a `gen_provider` s Merkleho cache. V klíči je styl, měřítko, tvar světa a verze domény. Vrstvy pristine a edited.
- Hot reload DLL generátorů.
- `wzctl gen` (archy), `wzctl lint`, golden testy a výpis mezistupňů v JSON.
- Schéma parametrů: z něj vzniká panel, validace, dokumentace a JSON Schema. Presety s rozděleními a recipe trace.

**M3b Textury, geometrie a první generátory**
- `eng_gen_tex`: operátory, dlaždicovost, paleta a odvozené mapy. Import AI zdrojů s rozšířenou provenancí (D14, D55).
- Half-edge operace a meshoptimizer.
- Generátory: budova v0, silnice a chodník, props. Všechny nad tabulkou měřítek.
- Měření 5, 9, 10 a první odečet 13.

**M3c Studio pro art directora**
- Dokument receptů, undo s autorem, prohlížeč, A/B, Schválit a Zamítnout (zápis do `review/` a golden), poznámky ve viewportu a panel lintů.
- Nástroje `gen_*`, `recipe_*`, `lint_run`, `golden_accept`, `review_*` a `project_reload`.
- `review/decisions.jsonl` a `acceptance.md` pro rodiny assetů.
- Druhý hodnotitel od jiného dodavatele pro rizikové kategorie (D56).
- Šablony projektů `city`, `planet`, `strategy` a `empty`, příkaz `wzctl new`.
- Měření 8.

**M3d Základ zvuku a zdroje efektů**
- `eng_audio`: výstup přes `platform`, mixer miniaudio, sběrnice, pool a virtuální hlasy, 3D s Dopplerem a offline render (D65).
- `eng_gen_audio`: zvuky UI, modální dopady a impulsní odezvy. Řetěz importu AI zvuků s provenancí (D58, D59).
- Linty zvuku včetně hlasitosti (D64), spektrogramy a stránka A/B.
- `eng_gen_vfx`: SDF tvary, šumy, rampy a první flipbooky. Kontaktní archy a pravidla efektů v lintech (D66).
- Měření 18.

**Hotovo, když:** změna receptu i kódu generátoru se projeví v běžícím studiu bez restartu. 10–20 materiálů z obou zdrojů projde linty. Golden hashe sedí na 3 OS. Výpis LAYOUT buňky je shodný na 3 OS. `decisions.jsonl` má aspoň 30 rozhodnutí a shoda hodnotitele je změřená. 20 generovaných zvuků projde linty se shodnými hashi na 3 OS.
**Brána vlastníka:** schválení materiálů a presetů, rubriky hodnotitele a flipbooků ohně a kouře.

## M4 Testovací scéna A: městský blok

Jedna buňka o hraně asi 256 m, bez streamingu.

**M4a Simulace a herní DLL**
- Svět jako objekt (D48). Hodiny simulace se skupinami tiků (D47). Pevný krok a `FrameParams`.
- Vstupem simulace jsou příkazy hráče `player_cmd` (D41).
- Herní DLL s hot reloadem a stabilním C ABI `eng_api` (D45).
- Aktéři s komponentami registrovanými hrou (D44).
- Protokol extrakce do renderu ve třech kanálech.
- Replay `.wzr` s hashi subsystémů, bug bundle a `--repro`.
- Pravidla úrovně A pro logiku simulace (D28).

**M4b Fyzika a auto**
- Jolt přes joltc (D42).
- Generátor auta v0 a řiditelné auto.
- Zvuk auta: smyčky podle otáček a zátěže, Doppler a nárazy z kontaktů.
- Měření 19 a 27.
- Před touto fází má být hotová rešerše fyziky jízdy (D71).

**M4c UI, efekty a Play**
- `eng_ui` nad Clay a SDL_ttf: HUD v0 a `ui_tree` (D57).
- Play jako podproces, nástroje `play_*` a `game_state`.
- `eng_vfx`: pool částic na GPU, buckety, nepřímé kreslení. Kouř pneumatik, stopy smyku, jiskry a decaly.
- První kontrola D3D12 na testovacím Windows stroji.
- Měření 21.

**Hotovo, když:** pětiminutová jízda se přehraje bitově shodně na stejné platformě a buildu, na každém ze 3 OS. Hash logické simulace je shodný na všech 3 OS. První rozdílný tick se hlásí podle subsystému. Golden obrázek HUD prochází. Rozpočty čítačů bloku drží v CI. Scénář „auto 80 km/h kolem posluchače“ projde číselnými kontrolami zvuku.
**Brána vlastníka:** pohled z ulice a auto vedle referencí GTA III.

## M5 Testovací scéna B: zárodek planety

- Port tvaru světa se dvěma implementacemi: plochá mřížka a cube-sphere.
- „Nahoru“ a gravitace podle polohy v ovladačích, vozidlech a kameře.
- Reversed-Z a matice relativní ke kameře v planetárním měřítku.
- Hrubý terén přes stejná rozhraní `gen_world`. Dlaždice výšek s CDLOD a horizon culling.
- Průlet z orbity k zemi nad jedním biomem.
- Projekt `planet` ze šablony.
- Měření 15.
- **Hotovo, když:** městský blok z M4 běží beze změny na ploché implementaci. Scéna planety prochází golden hashe na 3 OS. Digest průletu nehlásí skoky přesnosti. Oba projekty jsou v CI.
- **Brána vlastníka:** čitelnost zakřivení a měřítka při průletu.

## M6 Testovací scéna C: strategický výřez

Nový milník kvůli strategiím (D23, D50).

- **Simulace celého světa (D46):** globální data (silniční graf, tabulky budov a entit) jsou v paměti a tikají všude. Buňky slouží jen kreslení.
- **Hromadné entity (D44):** husté tabulky, vlastní 64bitová ID, bez fyziky. Kreslí se instancovaně s LOD.
- **Čas (D47):** pauza, násobky rychlosti, pomalé tiky ekonomiky a práce rozložená přes snímky.
- **Svět stavěný hráčem (D39):** příkaz hráče (silnice, zóna, budova) je vstup generátoru. Dotčená buňka se přegeneruje za běhu.
- **Ovládání (D49):** strategická kamera se zoomem od ulice po celou mapu, výběr myší a rámečkem, umisťování s přichytáváním.
- **UI (D57):** widgety (tabulky, seznamy, tooltipy, okna), vazba na data a popis UI v textových souborech.
- **Herní data (D45):** textové tabulky načítané přes registr typů.
- **Více světů (D48):** dvě instance světa najednou, přehledová mapa a detail.
- **Projekt** `strategy` ze šablony.
- **Testovací scéna:** kamera shora, 100 000 entit na silničním grafu, hráčem nakreslená silnice, zrychlení času a panel s tabulkou.
- **Měření:** 24 a 25.
- **Hotovo, když:** tik 100 000 entit drží rozpočet při rychlosti 1× i při nejvyšší rychlosti (rozpočet určí měření 24). Hash logické simulace po přehrání příkazů hráče je shodný na 3 OS. Buňka se po zásahu hráče přegeneruje bez zaseknutí snímku. Golden obrázek panelu s tabulkou prochází a `ui_tree` tabulku vrací. Městský blok a zárodek planety běží beze změny. Všechny tři projekty jsou v CI.
- **Brána vlastníka:** čitelnost pohledu shora a panelu, pocit z kamery a kreslení silnice.
- Před milníkem mají být hotové rešerše hromadné simulace a UI pro strategie (D71).

## M7 Generovaný svět, streaming a perzistence

- **Svět:** `gen_world` v úrovních L3–L0.
- **Streaming:** šest stavů buňky, tickety, epochy pro rušení zastaralé práce a fronty s limity. Refcountovaný graf zdrojů, SDL_AsyncIO a LOD strom se zálohou.
- **Kolize ve dvou vrstvách:** hrubá ze stavu LAYOUT, detailní ze stavu MESHED.
- **Ladění:** debug draw a jeho výpis, vizualizace buněk, stavů a ticketů, headless výpis stavů v JSON lines. Nástroje `world_query`, `world_inspect` a `world_pick`.
- **Perzistence (D40):** změny nad regenerací, stabilní ID z kotvy, plný stav simulace z registru typů, regionové soubory změn, manifest světa, třídy domén a migrační report.
- **Zvuk:** akustická metadata buněk, bodové emitory z `gen_world`, ambience podle zón a banky streamované s buňkami.
- **Cooker a packy** jen v potřebném rozsahu.
- **Měření:** 13, 14 a 17.
- **Hotovo, když:**
  - průlet městem 4×4 km i planetou je bez děr a blokujících loadů,
  - buňky generované v libovolném pořadí mají stejné hashe na 3 OS,
  - replay se zpožděným I/O dává shodné hashe simulace,
  - save z jednoho OS se načte na jiném se stejnými ID,
  - při headless průjezdu 8 km rychlostí 200 km/h žádný snímek nečeká na generování,
  - auto projede buňkou ve stavu LAYOUT a nepropadne,
  - zvýšení verze volné domény nerozbije save a migrace zmrazené domény nic nesmaže.
- **Brána vlastníka:** mapa čtvrtí a biomu z pohledu shora.

## M8 Obsah města a open-world renderer

- **Obsah:** fasády z CGA gramatiky s kit díly a WFC, palety čtvrtí, mobiliář, stromy s impostory a SDF skály.
- **Renderer:** GPU culling s cluster cullingem, HLOD, dither přechody a texture arrays. Vyhodnocení spouštěče nativního Metal backendu.
- **Linty:** expressive range, rozlišitelnost čtvrtí a kvóty dominant.
- **Počasí (D68):** déšť, mlha a blesk se zpožděným hromem, mokrý povrch.
- **Efekty:** kouř v polovičním rozlišení, neony a ambientní efekty města. Volba mezi tříděním a WBOIT podle měření.
- **Zvuk (D63):** okluze, dozvukové zóny, ducking a snapshoty, rozpočet hlasů provozu, hudební hodiny.
- **Doprava a chodci:** rozsah určí rešerše (D71).
- **Měření:** 3, 22 a 23.
- **Hotovo, když:** scéna má 30 000+ instancí. Počet drawů roste s buckety, ne s objekty. Rozpočty čítačů drží. Linty rozsahu projdou. 200 aut a déšť drží rozpočet hlasů a fragmentů.
- **Brána vlastníka:** pohled z ulice vedle GTA III, rozlišitelnost čtvrtí a ulice v dešti.

## M9 Postavy a animace

- `eng_gen_char`: kostra, tělo ze smooth-min, oblečení a malovaný obličej.
- Chůze, IK, pružiny, inertializace, nástup do auta, GPU skinning, LOD davu a aktivní ragdoll.
- Zvuk: kroky podle povrchu, nárazy těl a hlasové projevy.
- Efekty: zásahy, prach od kroků a stopy zbraní.
- **Testovací scéna:** 200 chodců na svazích a schodech.
- **Hotovo, když:** metriky klouzání nohou a švu smyčky jsou pod prahem. Náraz auta vyvolá zavrávorání nebo pád shodně v replayi.
- **Brána vlastníka:** arch 20 obličejů a postav vedle referencí WoW, pocit z pohybu při hraní.

## M10 Škálování

- Plný work-stealing podle dat z profileru.
- Souběh simulace N+1 a přípravy renderu N zapnutím protokolu extrakce.
- Packy s BC kompresí, rozpočty a LRU s hysterezí, prediktivní ticket po silničním grafu a režim „jen LOD“.
- Razítka dominant a líné interiéry.
- Volitelně nativní Metal 3 backend, pokud se aktivoval spouštěč.
- Minidumpy, lokalizace, navigace gamepadem a menu.
- Profily kvality efektů, balíky zvukových bank a rozpočty zvuku v CI.
- **Testovací scéna:** 200 km/h přes celou mapu.
- **Hotovo, když:** snímek je stabilní při 200 km/h s plnou zátěží zvuku a efektů. Paměť drží rozpočet. Profilace proběhla na Linuxu i Windows.
- **Brána vlastníka:** finální průjezd.

## Později (bez čísla)

| Práce | Poznámka |
|---|---|
| Obsah planety | biomy, vesnice, tvorové a jejich hlasy, sníh, písek a vítr (D68), hudba z fragmentů (D61) |
| Voxelové objemy | volitelné, kopání a jeskyně (D39) |
| Velká strategie v prostoru | mapa galaxie nad více světy (D48), rozsah určí rešerše |
| Hudba rádia | odloženo (D60) |
| Steam Audio za portem | až podle potřeby (D63) |
| Síťový kód | neplánuje se (D41) |

## Měření

Každé měření vzniká jako trvalý test nebo měřicí scéna v repu. Výsledek se zapisuje do repa jako baseline.

| # | Co se měří | Milník | Co rozhodne |
|---|---|---|---|
| 1 | cena GPU pro syntetickou městskou buňku ve čtyřech rozlišeních | M2 | interní rozlišení, počet kaskád, potvrzení forward+ |
| 2 | cena CPU za draw v SDL_GPU na Metalu | M1 | strop drawů, nativní backend |
| 3 | tepelná zátěž, 30 minut | M8 | strop workerů generování |
| 4 | `recommendedMaxWorkingSetSize` na 24 GB | M1 | strop paměti GPU |
| 5 | propustnost BC7 a ASTC enkodéru | M3 | kódovat při streamingu, nebo při cooku |
| 6 | cena upscaleru | M2 | kvalita obrazu na Retině |
| 7 | determinismus generátorů na 3 OS | M0 | zda lze spoléhat na regeneraci |
| 8 | kalibrace hodnotitele proti verdiktům vlastníka | M3 | váha hodnotitele |
| 9 | materiály z kódu proti materiálům z AI | M3 | výchozí zdroj podle kategorie |
| 10 | schopnost modelu podle kategorie assetu | M3 | harmonogram, šablony |
| 11 | pipeline shaderů a hot reload | M1 | počet variant |
| 12 | Vulkan na testovacím Linux stroji a lavapipe v CI | M2 | pokrytí Vulkanu |
| 13 | studená latence buňky 256 m (p50, p95) | M3, znovu M7 | předstih streamingu |
| 14 | cena detailní kolize a navmeshe proti generování | M7 | co stavět jen na vyžádání |
| 15 | cena kreslení dlaždic CDLOD na Metalu | M5 | hustota terénu planety |
| 16 | cena `det_tan` a `det_atan` na vrchol | M0 | použití na cube-sphere |
| 17 | doba přehrání změn silně upravené buňky | M7 | formát změn |
| 18 | CPU zvukového vlákna s 96 hlasy | M3 | počet skutečných hlasů |
| 19 | cena živého modelu motoru | M4 | zvuk aut |
| 20 | cena milionu průhledných fragmentů při 1080p | M2 | rozpočet fragmentů |
| 21 | propustnost append a třídění částic přes SDL_GPU | M4 | velikost poolu |
| 22 | 100 000 kapek deště s kolizí | M8 | rozsah deště |
| 23 | cena kompozice v polovičním rozlišení a WBOIT | M8 | třídění, nebo WBOIT |
| 24 | cena tiku 100 000 hromadných entit | M6 | rozpočet simulace strategií |
| 25 | latence přegenerování buňky po zásahu hráče | M6 | plynulost stavění |
| 26 | lze vytvořit nativní Metal vrstvu vedle okna SDL3 | M1 | zda je záložní backend proveditelný |
| 27 | shoda replaye Joltu na stejné platformě, dvojitá přesnost v joltc | M4 | brána M4, fyzika na planetě |
| 28 | propustnost review vlastníka (rendery za hodinu) | od M2 | rozpočty bran |

Měření 1–12 jsou ze zprávy 3 (původní č. 12 nahrazuje D20), 13–17 ze zprávy 4, 18–23 ze zprávy 6. Měření 24–28 přibyla při revizi.

Na Macu se měří bez Xcode (D35): vlastní čítače a časy snímků, `powermetrics`, Metal HUD a Tracy.

## Body k ověření

Předpoklady, které zprávy označily jako neověřené. Každý dostane úkol „ověřit“ ve svém milníku.

| Předpoklad | Milník |
|---|---|
| C11 atomics přes clang-cl na Windows | M0a |
| Build DXC ze zdrojů na Macu a připnutý SDL_shadercross | M1c |
| Režie Tracy na Apple Silicon | M1b |
| WARP přes SDL_GPU pro goldeny D3D12 | M2 |
| Programové zachycení snímku GPU na Metalu bez Xcode | M2 |
| Hot reload do sekundy | M3a, M4a |
| Bitová shoda Manifoldu, pokud se použije | M3b |
| Dvojitá přesnost v joltc | M4b |
| Renderer Clay pro SDL_GPU | M4c |

## Mezery, které čekají na rešerši

| Oblast | Kdy musí být jasno | Zdroj |
|---|---|---|
| Světlo, obloha a denní doba | před M2 | rešerše D71 |
| Fyzika jízdy | před M4b | rešerše D71 |
| Hromadná simulace entit, doprava a chodci | před M6 a M8 | rešerše D71 |
| UI pro strategie a datově řízený obsah | před M6 | rešerše D71 |
| Voda a vegetace ve velkém | před M8 | zatím bez rešerše |
| Herní vrstva: mapování vstupu, kamera třetí osoby, menu | M4, M10 | zatím bez rešerše |
| Sestavení a vydání hry pro 3 OS | před první vydanou hrou | zatím bez rešerše |
| Interiéry | M10 | zatím bez rešerše |

## Ověřování platforem

- **Hostované CI (Linux, Windows):** od M0 při každém pushi build, unit testy, null GPU, replay, golden hashe a kompilace shaderů do všech formátů.
- **Lavapipe v Linux CI:** od M2 obrazové goldeny Vulkanu.
- **MacBook M4 Pro:** skript `scripts/check` před každým merge. Metal goldeny, časové rozpočty a rendery pro review.
- **Testovací Linux stroj:** reálný Vulkan na konci M2, M7 a M10.
- **Testovací Windows stroj:** D3D12 poprvé na konci M4, pak na konci každého dalšího milníku.

## Strop drawů a spouštěč nativního Metal backendu

Doplní se po měřeních 2 a 26 v M1c.

## Časový odhad

Žádný není a nevymýšlí se. Po M0 a M1 se z Linearu odečte skutečná rychlost a z ní se odhadne zbytek.
