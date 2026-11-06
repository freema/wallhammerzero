# Revize dokumentace: slabá místa (2026-11-06)

Prošel jsem VISION, STATUS, DECISIONS a všech šest rešeršních zpráv. Tento soubor je seznam slabých míst, která je potřeba vyřešit, než se z dokumentů stane implementační plán v Linearu (D22).

**Závěr:** technický návrh je soudržný a žádné slabé místo neříká „takhle to nepůjde“. Slabá je hlavně **konsolidace**: plán je rozložený v šesti zprávách, které si v detailech odporují, a zhruba 30 rozhodnutí čeká na vlastníka. Druhá skupina jsou **neprozkoumané oblasti**, které vize výslovně požaduje (chodci, doprava). Třetí jsou **neověřené předpoklady**, na kterých stojí brány milníků.

Závažnost: **A** = blokuje založení plánu nebo M0, **B** = musí být vyřešeno před milníkem, kterého se týká, **C** = úklid.

## 1. Neexistuje jeden platný plán

| # | Záv. | Slabé místo | Kde | Co s tím |
|---|---|---|---|---|
| K1 | A | **Čtyři roadmapy.** Zpráva 1 má M0–M7, zpráva 2 M0–M8, zpráva 4 je upravuje a přidává M9 Planeta a M10 Voxely, zpráva 5 je nahrazuje sjednoceným M0–M9, zpráva 6 zase používá staré číslování. Kanonický `docs/ROADMAP.md` neexistuje. | zprávy 1, 2, 4, 5, 6 | Sepsat `ROADMAP.md` jako jediný zdroj. Teprve z něj zakládat Linear. |
| K2 | A | **Sjednocený plán nezahrnuje zprávy 4 a 6.** Chybí v něm stavový automat buňky, tickety, dvouvrstvá kolize, manifest domén, `wh_cell_id` v M0 a volitelné voxelové objemy (zpráva 4). Chybí celé VFX a většina zvuku (zpráva 6 chce efekty od M2 a zvuk od M3; sjednocený plán má jen „minimální audio“ v M4). | zpráva 5 vs. 4 a 6 | Při psaní ROADMAP přemapovat obsah zpráv 4 a 6 na nové číslování. |
| K3 | B | **Milníky M0, M3 a M4 jsou přetížené.** Zpráva 5 kritizuje starý M3 za přetížení, ale nový M0 má 20+ dodávek (od CMake po MCP transport) a M3 a M4 jsou podobně velké. | zpráva 5, tabulka milníků | V Linearu rozdělit každý milník na fáze s vlastní bránou (např. M0a kostra a CI, M0b determinismus, M0c agentní smyčka). |
| K4 | B | **Měření jsou rozptýlená.** 12 měření ve zprávě 3, 5 dalších ve zprávě 4, 6 dalších ve zprávě 6. Do milníků je zařazených jen prvních 12. | zprávy 3, 4, 6 | Jeden seznam 23 měření s milníkem u každého. |
| K5 | B | **Pořadí registru typů.** Nástroje v M0 mají mít JSON Schema „z registru typů“, registr ale přichází až v M3–M4. | zpráva 5 | V M0 psát schémata ručně, nebo registr typů posunout do M0–M1. |
| K6 | C | **Žádný časový odhad ani rozsah „verze 1“.** Zpráva 5 to sama přiznává. Neznáme ani propustnost review vlastníka (kolik renderů za hodinu). | všechny | Odhad nevymýšlet. V Linearu měřit skutečnou rychlost po M0 a M1 a z ní odhadnout zbytek. |

## 2. Zprávy si odporují v detailech

Novější zpráva vždy platí, ale starší text není označený jako nahrazený. Kdo čte jen jednu zprávu, dostane špatnou odpověď.

| # | Záv. | Rozpor | Platí |
|---|---|---|---|
| R1 | B | **ID buňky.** Zpráva 5: `(face, level, x, y)` s `face = 0` pro plochý svět. Zpráva 4: plochý svět je `face = 7`, formát `[3\|5\|28\|28]`. | zpráva 4 (je podrobnější); zapsat do `CONVENTIONS.md` |
| R2 | B | **Pozice.** Zpráva 1: `int32 cell + float`. Zpráva 5: `cell_key + lokální float3`. Zpráva 4: `double` na CPU, float jen relativně k buňce nebo kameře. | zpráva 4 |
| R3 | B | **Stabilní ID objektů.** Zpráva 2: hash z úrovně, souřadnic a lokálního indexu. Zpráva 4: hash z kotvy a jména pravidla. | zpráva 4 |
| R4 | A | **Deferred, nebo forward+?** Zprávy 1 a 2 staví deferred G-buffer podle GTA V. Zpráva 3 říká, že na GPU Apple sedí dobře forward+ s MSAA. Sjednocený plán to v M2 neuvádí. Od toho se odvíjí noční osvětlení města (mnoho lokálních světel), průhlednosti i vyhlazování hran. | nerozhodnuto |
| R5 | B | **Zvukový mixer.** Sjednocený plán: „mixer SDL3“. Zpráva 6: SDL3 jen zařízení, mixuje miniaudio. | zpráva 6 |
| R6 | B | **DXC na Macu.** Zpráva 3: vzít hotové binárky z neoficiálních rep. Zpráva 5: postavit jednou ze zdrojů a uložit do `.tools/`. | zpráva 5 (neoficiální binárky jsou riziko dodavatelského řetězce) |
| R7 | B | **Vulkan na Macu.** Zpráva 1 a 3 (měření 12, tabulka testů) počítají s KosmicKrisp na vývojovém Macu. D20 to ruší. | D20 |
| R8 | C | **Struktura repa.** Zprávy 1 a 2: `engine/src`, `game/`, `content/` v kořeni. Zpráva 5: monorepo `engine/` + `projects/<hra>/`. | zpráva 5 (čeká na rozhodnutí č. 16) |
| R9 | C | **Jména.** Typy mají prefix `eng_` (zprávy 1, 2, 5, 6) i `wh_` (zpráva 4). Nástroje se jmenují `wz`, `wzcli`, `wzmcp`, `wz_studio`, `engctl`, `gencli`, `genlint`. | sjednotit v `CONVENTIONS.md` |
| R10 | C | **Upscale a vyhlazování.** Zpráva 2: `SDL_BlitGPUTexture`. Zpráva 3: FSR1 nebo vlastní TAAU, SMAA/FXAA nebo MSAA. | rozhodne měření 6 a R4 |

## 3. Rozhodnutí, která čekají na vlastníka

Celkem asi 30. Souhrn analýzy s jejich seznamem zatím není napsaný (STATUS, položka „Souhrn celé analýzy“).

| # | Záv. | Co chybí |
|---|---|---|
| V1 | A | **Sedm rozhodnutí označených „před M0“** ve zprávě 5: přijetí plánu M0–M9, D4 (C17), D5 (SDL_GPU a tvar RHI), transport nástrojů, osa „nahoru“, struktura repa, rytmus review. Bez nich nejde založit ani první úkol. |
| V2 | A | **D11 nemá podmínku konce.** Nikde není zapsáno, kdy analýza končí a co musí být hotové. Plán v Linearu znamená, že se konec blíží, ale rozhodnutí chybí. |
| V3 | B | **D10 výtvarný styl** je otevřený. Brány M2 a M3 ho potřebují, včetně referenčních záběrů GTA III a WoW, které má dodat vlastník. |
| V4 | B | **Typ světa, proměnlivost světa, síť, perzistence** (STATUS otázky 3 a 4, zpráva 5 č. 7 a 8). Nutné před M4 až M6. |
| V5 | B | **Jolt** je doporučený dvěma zprávami, ale potvrzený není. |
| V6 | B | **Zvuk a efekty:** A1–A8 a V1–V3 ze zprávy 6. |
| V7 | C | „Podpora projektylu“ v D18: projekty, nebo i projektily? Nepotvrzeno. |

## 4. Oblasti, které žádná zpráva neřeší

| # | Záv. | Oblast | Proč na tom záleží |
|---|---|---|---|
| M1 | B | **Chodci, doprava, AI postav a navigace** | VISION žádá „husté město s budovami, auty a chodci“. Plán má jen animaci 200 chodců (M8). Chybí navigace (navmesh se zmiňuje jen jako cena), chování, dopravní systém a spawnování okolní populace. Žádný milník to nemá. |
| M2 | B | **Fyzika jízdy** | Řiditelné auto je brána M4, ale model vozidla (kola, odpružení, ovládání, „feel“) nikdo nezkoumal. |
| M3 | B | **Světlo, obloha, denní doba** | Počasí řeší zpráva 6. Obloha, atmosféra, cyklus dne a noční světla města chybí. Planeta potřebuje atmosféru z orbity. Souvisí s R4. |
| M4 | B | **Voda a vegetace ve velkém** | Planeta má mít oceány a řeky. Voda je v plánech jen jako řádek v odhadu GPU času. |
| M5 | B | **Herní vrstva** | Uložení hry, mapování vstupu a gamepad, kamera třetí osoby (kolize kamery), mise a skripty, menu. Část je odložená až do M9. |
| M6 | B | **Sestavení a vydání hry** | Jak vzniká distribuční build pro tři OS (podpis a notarizace na macOS, instalátor, Steam) není v žádném dokumentu. |
| M7 | C | **Interiéry** | Jen zmínka „líné interiéry“ v M9. |

## 5. Neověřené předpoklady, na kterých stojí brány

| # | Záv. | Předpoklad | Riziko |
|---|---|---|---|
| P1 | A | **Bitově shodný replay simulace na 3 OS (brána M4).** Zákaz `<math.h>` a FP pravidla ale platí jen pro targety `gen_*`. Simulace (herní DLL, vozidla, animace, Jolt) je nemá. | Brána M4 je v současném znění nesplnitelná. Buď rozšířit FP pravidla na celou simulaci a ověřit deterministický build Joltu přes joltc, nebo bránu zmírnit na „shodné na stejné platformě“ (tak to má zvuk ve zprávě 6). |
| P2 | B | **Cena draw callu přes SDL_GPU na Metalu.** Celý renderer na ní stojí, měří se v M1. Záložní plán (nativní Metal backend) předpokládá, že SDL3 dovolí vytvořit Metal vrstvu vedle svého okna. To nikdo neověřil. | Ověřit obojí hned v M1, ne až v M7. |
| P3 | B | **Studená latence buňky 256 m.** Celý rozpočet ticketů pro 200 km/h stojí na neměřeném čísle (odhad 0,2–1 s, „jednotky ms na budovu“). | Měřit, jakmile existuje první generátor budov (M3). |
| P4 | B | **Shadery.** SDL_shadercross nemá žádné vydání, DXC se na Macu staví ze zdrojů (část LLVM, minuty až desítky minut). | Připnout commit, build zautomatizovat v M0–M1. Pilot Slangu jako záloha. |
| P5 | B | **Překladač na Windows.** MSVC má C11 atomics jen experimentálně. Nikde není rozhodnuto, jestli se na Windows staví MSVC, nebo clang-cl. | Doporučuji clang na všech třech OS: jedna rodina překladače zmenší rizika determinismu i atomics. |
| P6 | B | **CI.** Brána M0 vyžaduje CI na třech OS. Nové repo nemá remote a hostované macOS runnery se u privátních rep účtují násobně. | Rozhodnout hosting a rozpočet CI před M0. |
| P7 | B | **D6 proti nástrojům.** D6 říká „do systému se nic neinstaluje“. Plán ale počítá s Xcode (GPU capture, Instruments), profilerem Tracy a RenderDocem na testovacích strojích. | Zapsat výjimky z D6, nebo se bez Xcode obejít (pak chybí ladění GPU na Macu). |
| P8 | C | **Další drobné neověřené body:** WARP přes SDL_GPU, programový GPU capture na Metalu, renderer Clay pro SDL_GPU, režie Tracy na Apple Silicon, dvojitá přesnost v joltc, bitová shoda Manifoldu, hot reload „do sekundy“. | Každý je ve zprávách označený jako neověřený. Přiřadit je k milníkům jako úkoly „ověřit“. |
| P9 | C | **Referenční záběry GTA III a WoW** jsou cizí chráněný obsah. | Držet mimo veřejné repo. |
| P10 | C | **Tajné klíče** (ElevenLabs a další API) nemají určené místo. | Mimo git, pravidlo do `CONVENTIONS.md`. |

## 6. Zastaralé a chybějící údaje v řídicích dokumentech

| # | Záv. | Co | Stav |
|---|---|---|---|
| D1 | A | **Nic není commitnuté.** Celá analýza (asi 400 kB) existuje jen na disku tohoto Macu, bez commitu a bez zálohy. | čeká na pokyn vlastníka |
| D2 | C | STATUS: zastaralý „Další krok“, D16–D18 „čekají na rešerši“, „hloubková analýza chybí“, otázka 8 „žádná zpráva neřeší“. | opraveno 2026-11-06 |
| D3 | C | DECISIONS: D16–D18 slibují návrh z rešerše 5, která už je hotová. | doplněno 2026-11-06 |
| D4 | C | DECISIONS: D7 nezmiňuje doplňky ze zprávy 5 (registr typů, komponenty aktérů, protokol extrakce). Čekají na rozhodnutí č. 9 a 10. | otevřené |
| D5 | C | VISION neobsahovala obecný engine s planetou (D15), studio a MCP (D18), měřítko (D16). | doplněno 2026-11-06 spolu s D23 (strategie) |

## 7. Doporučené pořadí před založením plánu v Linearu

1. **Commit dokumentace** (D1).
2. **Souhrn rozhodnutí:** projít s vlastníkem sedm rozhodnutí „před M0“ (V1) a R4, P1, P5, P6.
3. **`docs/ROADMAP.md`:** jeden plán M0–M9 se zapracovanými zprávami 4 a 6, rozdělenými milníky a jedním seznamem měření (K1–K5).
4. **`docs/CONVENTIONS.md`:** osa „nahoru“, formát ID buňky, pozice, prefixy a jména nástrojů (R1–R3, R9).
5. **Linear:** projekt Wallhammer Zero, milníky M0–M9, úkoly nejdřív jen pro M0 a M1. Další milníky rozepisovat, až když se blíží.
6. **Rešerše mezer** M1–M3 (chodci a doprava, fyzika jízdy, světlo a obloha) může běžet souběžně s M0 a M1, protože ty na nich nezávisí.

**Doplněno 2026-11-06:** ke všem bodům skupin 2, 3 a 5 jsou doporučení v [NAVRHY-ROZHODNUTI.md](NAVRHY-ROZHODNUTI.md). Požadavek na strategie (D23) přidává k mezerám ve skupině 4 hromadnou simulaci entit a datově bohaté UI.

**Doplněno 2026-11-06 (večer):** vlastník návrhy potvrdil. Skupiny 1–3 a 5 řeší [ROADMAP.md](ROADMAP.md), [CONVENTIONS.md](CONVENTIONS.md) a D24–D73. K bodu P7: Xcode se neinstaluje (D35). Skupina 4 (neprozkoumané oblasti) je v ROADMAP jako tabulka mezer.
