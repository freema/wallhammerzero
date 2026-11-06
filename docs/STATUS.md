# Stav projektu

Kde jsme, co je vyřešené, co je otevřené a co přijde dál. Aktualizuje se po každém sezení i po každém rozhodnutí.

**Poslední aktualizace:** 2026-11-06
**Fáze:** analýza je uzavřená (D36). Další je implementace milníku M0, první kód vznikne úkolem M0a na pokyn vlastníka.
**Plán:** [ROADMAP.md](ROADMAP.md), práce v Linearu: [Wallhammer Zero](https://linear.app/nsoft/project/wallhammer-zero-3576c061ad78).

## Hotovo
- [x] Starý projekt zálohovaný na GitHub (`freema/wallhammerzero`, větev `implementation`) a smazaný. Nová složka připravená, `git init`.
- [x] Prověřený vývojový stroj: MacBook Pro 14" M4 Pro, 12 jader (8P+4E), 16jádrové GPU, 24 GB, Metal 3, 160 GB volného místa. Chybí `cmake` a `ninja`; doinstalují se lokálně do projektu (D6).
- [x] **Rešerše 1: architektura enginu.** Viz [research/Architektura open world enginu.md](research/Architektura%20open%20world%20enginu.md).
  Závěr: Gregoryho vrstvy jako CMake targety, porty a adaptéry jen na švech, žádné generické ECS, work-stealing jobs bez fiberů, streaming po buňkách 128–256 m, tenké RHI nad SDL_GPU, milníky M0–M7.
- [x] Rešerše 2: procedurální grafika (textury, geometrie, svět a města, animace a postavy, styl, determinismus, nástroje). Všech pět poznámek je hotových.
- [x] Rešerše 3: co zvládne AI ve 3D (výzkum, shadery a vizuální hodnocení, praxe, náročnost na M4 Pro). Všechny čtyři poznámky jsou hotové.

## Hotovo: rešerše a konsolidace
- [x] Zpráva z rešerše 2: [research/Procedurální grafika pro engine.md](research/Procedurální%20grafika%20pro%20engine.md), včetně D12–D14.
  Závěr:
  - **Styl:** stylizované otexturované 3D, světlo zapečené do textur, ramp lighting, paleta a LUT.
  - **Generátory:** half-edge buildery a CGA gramatika pro budovy, SDF a surface nets pro skály, postavy z kapslí spojených smooth-min.
  - **Animace:** pružiny, IK a „Euphoria-lite“ ragdoll přes Jolt/joltc.
  - **Svět:** hierarchie L3–L0.
  - **Determinismus:** jen na CPU, bez `<math.h>` v generátorech.
  - **Architektura:** nový port `asset_provider`, targety `eng_gen_*`, milníky M0–M8.
- [x] Zpráva z rešerše 3: [research/Schopnosti AI v procedurální 3D grafice.md](research/Schopnosti%20AI%20v%20procedurální%203D%20grafice.md).
  Závěr:
  - **Co AI zvládne:** kód generátorů napíše spolehlivě. Silná je na město, silnice, terén, budovy, props a světlo; laťky GTA III dosáhne. S více iteracemi zvládne vozidla, vegetaci a vzhled ve stylu WoW. Rizikové jsou postavy, obličeje, zvířata a „feel“ animace.
  - **Vizuální úsudek:** AI se při hodnocení obrázků shoduje s lidmi jen v 0,66 případů, takže hlavní kontrolu dělají linty a oddělený hodnotitel.
  - **M4 Pro:** 60 fps při 1080p nebo 1512×982 s vlastním upscalem, engine se má vejít do ≤6 GB GPU a 2–3 GB CPU paměti.
  - **Před implementací:** 12 měření na začátek implementace, bez prototypu.
- [x] **Rešerše 4: No Man's Sky, generování a streaming.** Zpráva: [research/No Mans Sky generování a streaming.md](research/No%20Mans%20Sky%20generování%20a%20streaming.md).
  Závěr:
  - **Port tvaru světa:** 64bitové ID buňky ve stylu S2. Dvě implementace: plochá mřížka a cube-sphere s CDLOD. „Nahoru“ a gravitaci dává port.
  - **Souřadnice:** pozice v double na CPU, float relativně k buňce nebo kameře, reversed-Z. Ruší se `int32 cell + float` ze zprávy 1.
  - **Streaming:** šest stavů buňky, tickety včetně predikce pro 200 km/h a epochy pro rušení zastaralé práce.
  - **Delty a verze:** delty po buňkách bez globálního stropu, verzované domény generátoru.
  - **Milníky:** nové M9 Planeta a M10 Voxelové objemy (volitelné).
  - **Klíčové měření:** studená latence buňky 256 m na M4 Pro.
- [x] Hloubková analýza kódu referenčních rep, viz [research/notes/Reference repa/](research/notes/Reference%20repa/). TODO sekce ve Vellumu jsou doplněné, včetně oprav původních tvrzení, a všechny tři poznámky mají `status: done`.
  - **Sakura Crossing:** úzké hrdlo jsou draw cally, ne rozlišení. Polovina rozlišení nepomohla (19,3 → 19,1 ms). Slučovat geometrii proto musíme po buňkách a materiálech.
    Převezmeme: toon ramp s tónovaným stínem, ink linky z druhé diference hloubky, auta jako řádky tabulky, kontroly terénu jako linty.
  - **Voxel Musou:** převezmeme kontrakt mezi simulací a renderem (pevný 60Hz krok, headless bot s JSON časovou osou jako základ golden testů), procedurální animaci (zbraň jako vlastní kanál, IK), davy přes instancing se třemi LOD a mlhu, aerial perspective a tónovou křivku.
    Voxelový mesher nedosahuje laťky GTA III / WoW; poslouží jen pro LOD a placeholdery.
  - **Threejs-Punk:** převezmeme GPU déšť s výškovou mapou, ze které jdou i suchá místa pod střechami, bloom jen z emisivního bufferu, planární zrcadlo pro mokrou ulici, cachované statické stíny a vzhled jako ~16 čísel na preset.
    Nepřebírat: 8bit buffery. Noční osvětlení města (lokální světla) zůstává otevřené.
- [x] **Rešerše 5: srovnání s praxí a návrhy zlepšení cesty.** Zpráva: [research/Srovnání enginu a návrhy zlepšení.md](research/Srovnání%20enginu%20a%20návrhy%20zlepšení.md).
  Závěr:
  - **Jádro návrhu drží.** Pozorování a ovládání enginu (debug server, MCP, studio) ale přichází pozdě.
  - **Chybí tři vrstvy:** simulace tvarovaná jako server s `player_cmd`, registr typů s verzovanou serializací a explicitní extrakce do renderu.
  - **SDL_GPU zůstává.** RHI ze 3 přenositelných konceptů, nativní Metal až se spouštěčem. Měření ceny draw callů jde do M1.
  - **Pipeline:** je potřeba posílit stranu art directora: schémata parametrů, presety, kalibrovaný hodnotitel.
  - **Sjednocený plán M0–M9:**
    | Milník | Obsah |
    |---|---|
    | M2 | Zoo měřítek |
    | M4 | Test A: městský blok |
    | M5 | Test B: zárodek planety |
  - **Seznamy:** 24 vylepšení a 18 rozhodnutí vlastníka.
  - **Pozor:** číslování milníků nahrazuje to ze zpráv 1, 2 a 4 (tam je planeta M9).
- [x] **Rešerše 6: zvuk, hudba a vizuální efekty.** Zpráva: [research/Zvuk hudba a vizuální efekty.md](research/Zvuk%20hudba%20a%20vizuální%20efekty.md).
  Závěr:
  - **Zvuk:** SDL3 jen jako zařízení, miniaudio jako mixer a 3D, nad tím vlastní `eng_audio` (virtuální hlasy, okluze, dozvukové zóny, ducking).
  - **Hudba:** fragmenty ve stylu Pulse z NMS.
  - **Efekty:** jeden GPU pool částic, 5 bucketů, každý s jedním indirect draw. Bindless ani MDI na Metalu tedy nevadí. Efekty jsou data se schématem, pravidla Riotu jsou linty.
  - **Rozpočty:** v počtech (fragmenty, částice, hlasy).
  - **Čeká na vlastníka:** A1 AI zvuk (doporučeno jen efekty a ambience), A3 rádio, A5 zvukový styl, V1–V3.
  - **Pozor:** zpráva používá staré číslování milníků (planeta M9). Platí sjednocený plán ze zprávy 5.
- [x] Návrh portu pro tvar světa (D15): je ve zprávě 4, v sekci „Port tvaru světa“.
- [x] **Revize dokumentace (2026-11-06):** slabá místa jsou v [REVIZE.md](REVIZE.md).
  Závěr: návrh je soudržný, slabá je konsolidace (čtyři roadmapy, rozpory mezi zprávami, asi 30 nerozhodnutých bodů), neprozkoumané oblasti (chodci a doprava, fyzika jízdy, světlo a obloha) a několik neověřených předpokladů (hlavně bitově shodný replay simulace na 3 OS).
- [x] **Seznam rozhodnutí s doporučeními (2026-11-06):** [NAVRHY-ROZHODNUTI.md](NAVRHY-ROZHODNUTI.md), 48 bodů v pěti skupinách.
- [x] **D23 strategie:** dopad na návrh je v úvodu téhož souboru.
- [x] **Vlastník potvrdil všech 48 návrhů (2026-11-06)**, kromě návrhu 12: Xcode se neinstaluje (D35). Zapsáno jako D24–D71.
- [x] **[ROADMAP.md](ROADMAP.md):** jeden plán M0–M10 se zapracovanými zprávami 4 a 6, scénou strategie (M6), fázemi M0, M1, M3 a M4, seznamem 28 měření a tabulkou mezer.
- [x] **[CONVENTIONS.md](CONVENTIONS.md):** osy a jednotky, pozice, ID buňky, stabilní ID, determinismus, jména, programy, struktura repa, tajné klíče.
- [x] **Projekt v Linearu (D22):** [Wallhammer Zero](https://linear.app/nsoft/project/wallhammer-zero-3576c061ad78), tým Nsoft, milníky M0–M10, úkoly pro M0 a M1.
- [x] **Ověření plánu proti zdrojům na webu (2026-11-06):** poznámky v [research/notes/Ověření plánu/](research/notes/Ověření%20plánu/), závěry v [OVERENI.md](OVERENI.md).
  Závěr: žádné rozhodnutí nepadlo. Opraveno zdůvodnění determinismu fyziky (Jolt shodu mezi OS umí), rozsah herního UI a strategie v M6. Kompilátor shaderů je první technické riziko. Opravy jsou zapsané jako D74.

## Vyřešeno (krátce; podrobnosti v DECISIONS.md)
| Téma | Stav | Rozhodnutí |
|---|---|---|
| Nový začátek, starý kód jako inspirace | ✅ | D1 |
| Platformy macOS, Linux, Windows | ✅ | D2 |
| Čistě 3D open world | ✅ | D3 |
| Jazyk C17, clang na 3 OS | ✅ | D4, D24, D26 |
| SDL3 + SDL_GPU pod vlastním RHI | ✅ | D5, D25 |
| Nezaneřádit systém, bez Xcode | ✅ | D6, D35 |
| Architektura (vrstvy, porty na švech, bez ECS) | ✅ podle rešerše | D7 |
| Všechna grafika z kódu, bez Blenderu | ✅ | D8 |
| Bez fotorealismu | ✅ | D9 |
| Plné 3D, volná perspektivní kamera, bez izometrie a pixel artu | ✅ | D12 |
| Laťka kvality: GTA III / WoW | ✅ | D13 |
| Textury z kódu i z AI obrázkového modelu | ✅ | D14 |
| Nejdřív analýza, pak kód | ✅ | D11 |
| Obecný engine (město i planeta), ne pro jednu hru | ✅ | D15 |
| Měřítko a proporce řízené centrální tabulkou a linty | ✅ výchozí profil, zmrazí se v M2 | D16, D53 |
| Ladicí nástroje, headless režim, logování od prvních milníků | ✅ princip i návrh (zpráva 5) | D17 |
| Vestavěné studio, MCP server v enginu, UI, systém projektů | ✅ princip i návrh (zpráva 5) | D18 |
| D15 platí, varování „engine pro jednu hru“ zamítnuto | ✅ | D19 |
| Mac primárně, testovací stroje Linux a Windows, bez upgradu macOS | ✅ | D20 |
| Druhý vývojový stroj: Windows PC s NVIDIA, sdílení přes GitHub | ✅ | D75 |
| Veřejné repo se zabezpečením, CI na 3 OS zdarma | ✅ | D76 |
| Žádný Three.js ani JS v enginu, z referencí jen nápady | ✅ | D21 |
| Implementační plán v Linearu, postupně | ✅ | D22 |
| Engine podporuje i strategie (Cities: Skylines, Stellaris) | ✅ | D23, D44, D46–D50 |
| Forward+ s clusterovanými světly | ✅ potvrdí měření v M2 | D27 |
| Determinismus ve dvou úrovních | ✅ | D28 |
| Jeden plán M0–M10, konvence | ✅ | D29, D72, D73 |
| Nástroje pro AI: jeden registr, MCP i CLI | ✅ | D30 |
| Osa Z nahoru, monorepo, CI | ✅ | D31–D33 |
| Konec analýzy | ✅ podmínky splněné | D36 |
| Svět, perzistence, síť, fyzika, entity, čas simulace | ✅ | D38–D49 |
| Výtvarný styl: stylizované malované 3D | ✅ potvrdí brána M2 | D52 |
| Rozlišení, AI zdroje, hodnotitel, UI | ✅ | D54–D57 |
| Zvuk a efekty | ✅ | D58–D68 |

## Otevřené otázky
Tři otázky pro vlastníka z ověření plánu, podrobně v [OVERENI.md](OVERENI.md). Žádná neblokuje M0.
1. ~~Hostovaný macOS v CI~~: vyřešeno v D76, repo je veřejné a CI je zdarma.
4. Licence veřejného repa (D76). Zatím žádná, tedy „všechna práva vyhrazena“.
2. Smí herní data skládat podmínky a efekty z dílů naprogramovaných v C? Doporučení: ano.
3. Smí se referenční screenshoty GTA III a WoW posílat AI službám? Doporučení: ne, jen lokálně.

Ostatní rozhodne měření nebo brána milníku.

## Reference z Vellumu (`projects/grafika-reference/`)
Tři Three.js repa a jedna technická analýza, zapsané 2026-09-24. Hloubková analýza kódu je hotová, viz [research/notes/Reference repa/](research/notes/Reference%20repa/).
- **Sakura Crossing**: ~56k řádků JS, nula modelů i textur. Důkaz, že stylizovaná grafika z čistého kódu jde. Toon světlo s barevně posunutými stíny, ink linky z hloubky, generátory budov a aut jako řádky tabulky, merge podle materiálu kvůli draw callům.
- **Voxel Musou**: ~9,3k řádků, nula assetů. Voxelový builder postav, procedurální rig a animace, davy přes instancing, deterministický 60Hz tick.
- **Threejs-Punk**: render techniky (déšť s kolizí přes výškovou mapu na GPU, mokrý povrch, post pipeline, výkonové páky). Pozor, používá GLB modely a textury, přebírat jen techniky.
- **No Man's Sky / Light No Fire**: kaskáda seedů z polohy, ukládání jen delt, cube-sphere s octree, archetypy a parametry.

## Známá rizika
- SDL_GPU nemá bindless a multi-draw na Metalu je CPU smyčka. Plně GPU-driven renderer proto nepůjde a hrozí limit na draw cally.
- Malovaný vzhled ve stylu WoW čistě kódem zatím nikdo neukázal. Proto D14.
- Postavy, obličeje a přirozený pohyb jsou pro AI nejslabší kategorie.
- AI hodnotí obrázky spolehlivě jen v hrubých rysech. Jemnou geometrii musí hlídat linty v kódu, styl a pohyb schvaluje vlastník.
- Nekonzistentní měřítko mezi generátory (minulý projekt: obří postavy v malém městě) → D16.
- 14" šasi přiškrcuje výkon při současné zátěži CPU a GPU.
- Rešeršní zprávy používají starší číslování milníků. Platí jen `ROADMAP.md` a jeho převodní tabulka.
- Bez Xcode (D35) nejde na Macu rozpadnout čas GPU po passech. Rozpočty se vedou v počtech.
- Kompilátor shaderů: SDL_shadercross nemá vydání a DXC pro macOS se musí stavět ze zdrojů. Ověří první úkol M1c.
- Herní UI je víc práce, než se čekalo: Clay dává jen rozvržení.
- joltc neumí uložit stav fyziky, dopíše se ve vlastním adaptéru.
- Strategie (D23) přidávají dva velké subsystémy, se kterými plán dosud nepočítal: hromadnou simulaci entit a datově bohaté UI.

## Další krok
0. Na Windows PC: naklonovat repo, nainstalovat Visual Studio Build Tools a Claude Code, doplnit model grafiky do D75 (úkol NSO-620 v Linearu).
1. Vlastník odpoví na tři otázky výše.
2. Na pokyn vlastníka začne M0a (kostra a CI). Úkoly jsou v Linearu.
3. Souběžně čtyři rešerše mezer (D71). Světlo a obloha musí být hotové před M2.
