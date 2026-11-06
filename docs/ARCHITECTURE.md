# Architektura enginu

Jedna mapa modulů a pravidel. Shrnuje rozhodnutí D7, D25, D28, D30, D43–D46 a rešerši [Architektura open world enginu](research/Architektura%20open%20world%20enginu.md). Kde se rešerše s tímto souborem rozchází, platí tento soubor. Přesná API (hlavičky) vznikají spolu s kódem.

Platí od 2026-11-06.

## Princip v jedné větě

Vrstvy podle Gregoryho, vynucené CMake targety s jednosměrnými závislostmi. Porty a adaptéry (hexagon) jen na hrubých švech: platforma, GPU, assety, fyzika, zvuk a herní kód. Uvnitř vrstev data-oriented design: husté pole, generační handly, žádné generické ECS.

## Vrstvy a moduly

Každý modul je jeden CMake target `eng_<modul>` se složkami `include/eng/` (veřejné) a `src/` (soukromé). Modul smí záviset jen na nižších vrstvách. Moduly stejné vrstvy se navzájem nelinkují; data mezi nimi přelévá `eng_runtime`.

| Vrstva | Moduly | Co dělají | Milník |
|---|---|---|---|
| **0 Základ** | `eng_base` | typy, assert, makra handlů, inline vektorová matematika, atomics | M0a |
| **1 Platforma** (šev) | `eng_platform` | jediné místo s SDL3: okno, vstup, čas, soubory a AsyncIO, vlákna, načítání DLL | M0a |
| **2 Jádro** | `eng_core` | arény, tagovaný heap, joby, kontejnery, SPSC fronty | M1a |
| | `eng_log` | JSONL log, kanály, `ENG_ASSERT`, `ENG_SCOPE`, crash handler | M0c |
| | `eng_cvar`, `eng_cmd` | nastavení a pojmenované příkazy (konzole, CLI, socket) | M0c |
| | `eng_types` | registr typů: jméno, verze, pole, serializace, JSON Schema (D43) | M0c, M1a |
| | `eng_prof` | Tracy, fázové časovače, čítače, `stats.json` | M1b |
| | `eng_gen_core` | **úroveň A:** `detmath`, RNG, šum, `eng_cell_id`, matematika tvarů světa | M0b |
| **3 Generátory** | `eng_gen_tex`, `eng_gen_mesh`, `eng_gen_arch`, `eng_gen_world`, `eng_gen_char`, `eng_gen_audio`, `eng_gen_vfx` | **úroveň A:** čisté funkce `(recept, seed) → data`. Jen CPU, žádné GPU ani soubory. | M3, M7–M9 |
| **4 Zdroje a GPU** (šev) | `eng_asset` | VFS, resource DB, refcountovaný graf, IO fronta, porty `asset_provider` a `gen_provider`, Merkleho cache | M3a |
| | `eng_gpu` | RHI ze tří přenosných pojmů (D25), backend SDL_GPU a null | M1c |
| **5 Subsystémy** | `eng_render` | render graph, forward+ s clustery (D27), passy, materiály | M2 |
| | `eng_world` | buňky, port tvaru světa, archetypy, instance, aktéři, prostorové dotazy, streaming, LOD | M4, M5, M7 |
| | `eng_sim` | hodiny simulace, `player_cmd`, hromadné entity, globální grafy (silnice) (D44, D46, D47) | M1b, M4, M6 |
| | `eng_phys` (šev) | port fyziky, adaptér Jolt (C++ jen uvnitř), null | M4b |
| | `eng_audio` (šev) | mixer nad miniaudio, hlasy, sběrnice | M3d |
| | `eng_anim` | kostry, klipy, IK, pružiny | M9 |
| | `eng_ui` | rozvržení Clay, vlastní kreslení, text, tabulky | M4c, M6 |
| | `eng_vfx` | částice a efekty | M4c |
| **6 Runtime** | `eng_runtime` | mediátor: pořadí init a shutdown, smyčka snímku, protokol extrakce, `eng_api` pro hru | M0c → M4 |
| **7 Nástroje** | `eng_tools`, `eng_debugsrv`, `eng_project` | registr nástrojů (D30), ladicí server, projekty | M0c, M1b |
| **Programy** | `wz`, `wz_studio`, `wzmcp`, `wzctl` | engine, studio (Dear ImGui), MCP, CLI | M0–M2 |
| **Hra** | `projects/<hra>/game` | herní DLL, vidí jen `eng_api.h` | M4 |

Generátory leží nízko a nevědí nic o GPU ani o souborech. Do světa se dostanou přes port `gen_provider` v `eng_asset`. Buňka tak může přijít z generátoru i z předpečeného souboru ve stejném formátu (D8).

## Pravidla, která drží strukturu

1. **Směr závislostí** hlídá CMake a lint v CI. Porušení je chyba buildu.
2. **Veřejné hlavičky** includují jen `eng/base/types.h` a standardní `<stdint.h>`, `<stdbool.h>`, `<stddef.h>`. Cizí typy se deklarují dopředu.
3. **SDL3** se linkuje jen do `eng_platform`, `eng_gpu` a programů. **C++** jen v adaptérech (Jolt, Dear ImGui) za čistě céčkovou hlavičkou.
4. **Handly místo ukazatelů:** 32bitový index a generace. Ukazatel nepřežije snímek, handle se nikdy neukládá do savu (CONVENTIONS, kapitola 4).
5. **Paměť:** platforma rezervuje arény, moduly dostávají alokátor v `init`. Nikdo nevolá `malloc` přímo.
6. **Každý systém má vlastní `save` a `load`** přes registr typů. Globální reflexe ani kořenová třída neexistují.
7. **Úrovně determinismu (D28):** target úrovně A (`eng_gen_*`, logika `eng_sim`) nesmí linkovat target úrovně B (`eng_phys`, `eng_anim`, `eng_audio`).
8. **Init** je ručně napsané pořadí v `eng_runtime`, shutdown v opačném pořadí.

## Tři třídy objektů (D44)

| Třída | Počet | Uložení | Příklad |
|---|---|---|---|
| Statické instance | desítky tisíc na buňku | SoA pole po buňkách, archetyp + transformace | budovy, lampy, stromy |
| Aktéři | tisíce | správci komponent s hustými poli, komponenty registruje hra | auto hráče, NPC, dveře |
| Hromadné entity | statisíce | husté tabulky, bez fyziky, vlastní 64bitová ID | auta a chodci ve strategii |

## Jeden snímek

```
platforma: události SDL ──► vstup ──► player_cmd (tick N)
                                          │
simulace (pevný krok, úroveň A):          ▼
  eng_sim tick ─► herní DLL game_fixed_update ─► eng_phys krok
                                          │
extrakce (eng_runtime):                   ▼
  změny transformací a instancí ─► render world (FrameParams)
                                          │
render:                                   ▼
  culling ─► render graph ─► eng_gpu (SDL_GPU / null) ─► obraz
```

- **Simulace** běží v pevném kroku a nezávisí na renderu, zvuku ani kameře. Headless běh (`--gpu=null`) je plnohodnotný režim, ne zkratka.
- **Vstup** do simulace jsou jen příkazy hráče (`player_cmd`). Stejný kanál používá replay, AI agent i budoucí síť.
- **Vlákna:** hlavní vlákno vlastní okno a odesílání na GPU. Joby (`jobs_run`, `jobs_wait`) dělají generování, streaming a dávky simulace. Zvuk má vlastní vlákno. Plný work-stealing a souběh simulace N+1 s renderem N přijde v M10.
- **Streaming:** buňky 256 m, šest stavů buňky, tickety podle vzdálenosti a rychlosti, zrušení zastaralé práce epochou. Rodičovský LOD je vidět, dokud nedorazí potomci.

## Šev pro hru

Herní DLL (`game.dylib`, `.so`, `.dll`) vidí jedinou hlavičku `eng_api.h`: tabulku funkcí s číslem verze (svět, vstup, zvuk, joby, ladění). Exportuje `game_load`, `game_fixed_update` a `game_unload`. Za vývoje se DLL načítá znovu bez restartu enginu (hot reload), ve vydané hře je linkovaná staticky. Skriptovací jazyk není (D45). Herní data jsou textové tabulky načtené přes registr typů.

## Co se záměrně nedělá

- Generické ECS v enginu (hra si ho smí přinést).
- Fibery (zatím, API jobů je tvarované tak, aby šly doplnit).
- Plně GPU-driven renderer s bindless (SDL_GPU ho nemá, D5).
- Port pro každý malý případ užití, DI kontejnery a mapování mezi „doménovým“ a „infrastrukturním“ modelem.
- Hot reload celého enginu (jen herní DLL a shadery).
