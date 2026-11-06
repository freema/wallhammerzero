# Konvence

Závazná pravidla pro kód, data a nástroje enginu (D73). Řeší místa, kde si rešeršní zprávy odporovaly. Kde se zpráva s tímto souborem rozchází, platí tento soubor.

Platí od 2026-11-06. Změna konvence je rozhodnutí a zapisuje se do [DECISIONS.md](DECISIONS.md).

## 1. Osy a jednotky (D31)

| Věc | Konvence |
|---|---|
| Souřadný systém | pravotočivý |
| Osy světa | **X východ, Y sever, Z nahoru** |
| Mapa | rovina XY |
| Lokální rámec objektu | +X vpravo, +Y dopředu, +Z nahoru |
| Jednotky | metr, sekunda, kilogram, radián |
| Úhly | kladný směr podle pravidla pravé ruky kolem osy |
| Natočení (yaw) | otáčení kolem +Z, nula míří na sever (+Y) |
| Rotace | kvaterniony, Eulerovy úhly jen ve vstupu od člověka |
| Matice | sloupcové vektory, `M * v`, ukládání po sloupcích |
| Přední strana trojúhelníku | proti směru hodinových ručiček |
| Hloubka | D32F, reversed-Z, nekonečná far plane |
| UV | počátek vlevo nahoře |
| Barvy | výpočty lineárně, barevné textury uložené v sRGB |

**„Nahoru“ se nikdy nepíše natvrdo.** Směr nahoru a gravitaci vrací port tvaru světa (`up_at`, `gravity_at`). Na plochém světě je to konstanta +Z, na planetě směr od středu. Lint v CI zakazuje literál `(0, 0, 1)` ve významu „nahoru“ mimo plochou implementaci portu.

Zpráva 4 psala port tvaru světa pro Y nahoru. Platí tato úprava: rámec buňky má osy `east`, `north`, `up` a plochý svět vrací jako doménu šumu `(x, y, 0)`.

## 2. Pozice

- **Na CPU je autoritativní pozice v double** (`eng_dvec3`, metry). Na plochém světě ve světovém rámci, na planetě v rámci se středem v planetě.
- **Data buňky** (vrcholy, instance) jsou float relativně k počátku rámce buňky.
- **GPU** dostává matici `(počátek buňky − kamera)`, spočítanou v double a teprve pak převedenou na float. Velké číslo se na GPU nikdy nedostane.
- **Fyzika** běží ve floatu v ostrovech s vlastním počátkem. Počátek se posouvá, když se hráč vzdálí o několik kilometrů, a posun zachovává rychlosti.
- Model `int32 buňka + float` ze zprávy 1 neplatí.

## 3. ID buňky

`eng_cell_id` je 64bitové číslo `[face:3][level:5][x:28][y:28]`.

| Pole | Význam |
|---|---|
| `face` | 0–5 stěny krychle (planeta), 7 plochý svět, 6 rezerva |
| `level` | 0 je kořen, vyšší číslo je jemnější úroveň |
| `x`, `y` | index v mřížce úrovně. Plochý svět přičítá posun 2²⁷, aby šly záporné souřadnice. |

Plochý svět s kořenovou dlaždicí 65 536 m:

| Úroveň | Hrana | Význam |
|---|---|---|
| 4 | 4 096 m | region (L3) |
| 6 | 1 024 m | čtvrť (L2) |
| 8 | 256 m | streamovací buňka (L1) |

V logu a v nástrojích se ID píše jako `face/level/x/y` se souřadnicemi bez posunu, například `7/8/12/-3`.

Varianta `face = 0` pro plochý svět ze zprávy 5 neplatí.

## 4. Stabilní ID objektů

- **Generované objekty:** `id = H64(world_seed, shape_hash, domain_name_hash, rule_name_hash, anchor_key)`.
  - Kotva je celočíselný klíč v mřížce pravidla. Nezávisí na velikosti buňky.
  - Jméno pravidla je hash autorského řetězce, ne index v poli. Nové pravidlo tak nepřečísluje staré objekty.
- **Objekty hráče:** `H64(player_namespace, čítač v savu)`.
- **Hromadné entity:** vlastní 64bitová ID přidělovaná tabulkou (D44).
- **Změny v savu** se klíčují dvojicí `(buňka vlastníka, id)`.
- **Běhové handly** (index a generace) se nikdy neukládají ani neposílají mimo proces.

Varianta s lokálním indexem ze zprávy 2 neplatí.

## 5. Determinismus (D28)

| Úroveň | Co tam patří | Záruka |
|---|---|---|
| **A** | generátory (`eng_gen_*`), logika simulace, převody souřadnic a ID | bitově shodné na macOS-ARM64, Linux-x64 a Windows-x64 |
| **B1** | fyzika (Jolt) | shodné na stejné platformě a buildu. Cílem je shoda na 3 OS, rozhodne měření 27. |
| **B2** | animace, mix zvuku | shodné na stejné platformě a buildu |

Jolt se od začátku staví s volbou `CROSS_PLATFORM_DETERMINISTIC`. Fyzika je mezi OS shodná jen tehdy, když jsou shodné i její vstupy. Co do fyziky posílá engine (síly, cílové pózy ragdollu), se proto počítá podle pravidel úrovně A.

Pravidla úrovně A, hlídaná linty a golden hashi v CI:
- Žádné `<math.h>`. Matematika jde přes `detmath`.
- Překlad s `-ffp-contract=off`, bez `-ffast-math`.
- Logika simulace počítá v celých číslech nebo ve fixed-pointu.
- Náhoda jen ze seedovaných proudů pojmenovaných řetězcem.
- Výsledek nesmí záviset na počtu vláken, na pořadí procházení hashovací tabulky, na čase ani na adrese v paměti.
- Řazení jen vlastní funkcí se stabilním pořadím, ne `qsort`.
- Převod floatu na celé číslo jen uvnitř rozsahu cílového typu. NaN se nesmí dostat do hashe.
- Stav FPU (zaokrouhlování, denormály) je stejný na všech vláknech.
- Verze clangu je připnutá. Na Windows se `-ffp-contract=off` zadává výslovně.

Target se k úrovni hlásí vlastností v CMake. Target úrovně A nesmí linkovat target úrovně B.

## 6. Jazyk a překlad

- **C17**, clang na všech třech OS, na Windows clang-cl (D24, D26).
- `-Wall -Wextra -Werror`. V CI běží ASan, UBSan a TSan.
- **C++ jen v adaptérech** knihoven (Jolt, Dear ImGui). Hlavičky adaptéru jsou čisté C.
- Rozšíření překladače jen za makrem z `eng_base`.
- Vlákna se berou z SDL3, ne z `<threads.h>`. Atomics přes `<stdatomic.h>`.
- Dokumentace je česky. Kód, identifikátory, komentáře a zprávy commitů anglicky.
- Komentář říká proč, ne co.

## 7. Jména

| Věc | Tvar | Příklad |
|---|---|---|
| Funkce a typy enginu | `eng_<modul>_<jméno>`, malá písmena s podtržítky | `eng_log_write`, `eng_cell_id` |
| Makra a konstanty | `ENG_<JMÉNO>` | `ENG_ASSERT` |
| CMake target | `eng_<modul>` | `eng_gen_tex` |
| Kód hry | vlastní prefix projektu | `sbx_` pro sandbox |
| Soubory | malá písmena s podtržítky | `world_shape_flat.c` |
| Nástroje v registru | `skupina_akce` | `golden_check`, `log_tail` |
| Metody ladicího serveru | `skupina.akce` | `sim.step` |

Prefix `wh_` ze zprávy 4 se nepoužívá: `wh_cell_id` je `eng_cell_id`, `wh_world_shape` je `eng_world_shape`.

## 8. Programy

| Program | K čemu |
|---|---|
| `wz` | běh enginu a hry, i bez okna (`--gpu=null`, `--agent`) |
| `wz_studio` | studio |
| `wzmcp` | transport MCP pro AI agenty |
| `wzctl` | příkazová řádka nad stejným registrem nástrojů |

Starší jména ze zpráv:

| Ve zprávách | Platí |
|---|---|
| `engctl`, `wzcli` | `wzctl` |
| `gencli` | `wzctl gen` |
| `genlint` | `wzctl lint` |
| `wz_review` | `wzctl review` |

## 9. Struktura repa (D32)

```
wallhammerzero/
├─ engine/
│  ├─ src/<modul>/      include/eng/, src/, tests/
│  ├─ shaders/
│  └─ tools/            wzctl, wzmcp, imgdiff
├─ studio/              wz_studio
├─ projects/<hra>/      herní DLL, data, generátory, style/, CLAUDE.md
├─ external/            knihovny jako git submoduly
├─ milestones/          M0.json … M10.json
├─ scripts/             bootstrap, check
├─ docs/
├─ .tools/              stažené nástroje (není v gitu)
├─ build/               výstup překladu (není v gitu)
└─ runs/                výstupy běhů (není v gitu)
```

- Do systému se nic neinstaluje (D6, D35). Xcode se nepoužívá. Jediná výjimka je Visual Studio Build Tools na Windows vývojovém stroji (D75).
- Vrstvy modulů hlídá CMake a lint závislostí. Moduly stejné vrstvy se navzájem nelinkují.
- Engine nesmí obsahovat nic, co patří jedné hře. Pravidla hry jsou v `projects/<hra>/`.

## 10. Soubory a formáty

- **Konfigurace, recepty a herní data** jsou text. Herní data jsou tabulky načítané přes registr typů (D45).
- **Každý ukládaný typ** má v registru jméno a verzi.
- **Log** je JSONL, jeden záznam na řádek.
- **Běh** zapisuje do `runs/<id>/`: `log.jsonl`, `stats.json`, při pádu `crash.txt`.
- **Replay** má příponu `.wzr` a nese hashe subsystémů po ticích.
- **AI zdroje** (obrázky, zvuky) mají vedle sebe soubor s provenancí (D14, D55, D58):
  - model a jeho verze, prompt, seed (pokud ho služba má), datum, licence a tarif služby v době generování,
  - lidský podíl: kdo vybral variantu a co se ručně upravilo,
  - u obrázků stav C2PA (přítomno, chybí) a výpis z `c2patool`.
- **Uložený AI soubor je zdroj.** Zvuk z ElevenLabs nejde vygenerovat znovu stejně, proto se nikdy nemaže jako „odvozený“.
- **Rozpočty** se vedou v počtech, které engine sám spočítá: drawy, fragmenty, částice, hlasy.

## 11. Tajné klíče a cizí obsah

- Klíče k API (například ElevenLabs) se do gitu nedávají. Čtou se z proměnných prostředí nebo z lokálního `.env`, který je v `.gitignore`. V CI jsou jako secrets.
- Provenance ani log klíč nikdy neobsahují.
- Referenční záběry z cizích her leží v `reference/`, které je v `.gitignore`. Do repa se necommitují.
- Referenční záběry se nepoužijí ve hře, v marketingu ani ve veřejném srovnání.
- **Repo je veřejné (D76).** Nic, co se nesmí zveřejnit, do něj nepatří.
- Zvuky z ElevenLabs se nesmí šířit jako samostatné soubory. Do veřejného repa se proto necommitují: leží v odděleném privátním úložišti (rozhodne se před M3d) a hra je dodává zabalené v archivu. V repu zůstává jen soubor s provenancí a hash zvuku.
- gitleaks hlídá klíče před commitem i v CI, GitHub navíc blokuje push s rozpoznaným klíčem.
- Hra má soubor s licencemi knihoven třetích stran a obrazovku s nimi. FreeType se bere pod licencí FTL. Tracy se do vydané verze nepřekládá.

## 12. Git, CI a dva vývojové stroje (D33, D75)

- Hlavní větev je `main`.
- Před merge do `main` projde lokálně `scripts/check` (na Macu i na Windows stroji). Linux a Windows navíc hlídá hostované CI.
- **Dva vývojové stroje** (MacBook a Windows PC) sdílejí práci jen přes GitHub a Linear:
  - Před začátkem práce `git pull`. Na konci sezení se všechno commitne a pushne, nic nezůstává jen lokálně.
  - Úkol se v Linearu přepne na In Progress dřív, než se na něm začne. Jeden úkol nedělají dva stroje současně.
  - Kód vzniká na větvi úkolu (jméno větve z Linearu, například `graslt/nso-581-…`). Dokumentace smí jít přímo do `main` (D70).
  - Když běží Claude Code na obou strojích současně, každý bere jiný úkol, nejlépe z jiné fáze nebo modulu.
  - Paměť Claude Code je uložená jen na jednom stroji. Co má platit všude, patří do `CLAUDE.md` nebo do `docs/`.
- **Soubory pro oba systémy:**
  - Konce řádků řídí `.gitattributes` (v repu LF).
  - Jména souborů se neliší jen velikostí písmen. Žádné symlinky. Cesty kratší než 200 znaků.
  - Skripty jsou CMake skripty (`cmake -P`), ne bash ani PowerShell.
- Hostované CI běží na Linuxu, Windows a macOS (D76). Runnery se zadávají s číslem verze (`macos-15`), ne jako `latest`.
- Větev `main` nejde smazat ani přepsat force pushem (pravidlo `protect-main`). Akce v CI jen od GitHubu a ověřených vydavatelů, připnuté na commit.
- Golden soubory se mění jen nástrojem `golden_accept`, který vyžaduje potvrzení vlastníka.
- Položky v `milestones/*.json` přepíná jen úspěšný příkaz, položky s bránou jen vlastník.
