# Návrhy rozhodnutí k potvrzení (2026-11-06)

Všechna otevřená rozhodnutí z analýzy na jednom místě, u každého s doporučením. Zdroje: šest rešeršních zpráv, [REVIZE.md](REVIZE.md) a nový požadavek na strategie (D23).

**Stav: potvrzeno 2026-11-06.** Vlastník přijal všech 48 návrhů najednou, kromě návrhu 12 (Xcode), který zamítl. Platné znění je v [DECISIONS.md](DECISIONS.md) jako D24–D71 (číslo rozhodnutí = číslo návrhu + 23). Tento soubor zůstává jako záznam možností a důvodů. Čísla milníků v něm odpovídají zprávě 5, platné číslování je v [ROADMAP.md](ROADMAP.md).

## Co mění požadavek na strategie (D23)

Engine má vedle města ve stylu GTA a planety ve stylu Light No Fire zvládnout i budovatelskou strategii (Cities: Skylines) a velkou strategii (Stellaris). Současný návrh na to není stavěný v šesti bodech:

| Co strategie potřebuje | Co má návrh dnes | Doplněk |
|---|---|---|
| Simulace běží v celém světě, i mimo kameru | simulace jen v buňkách kolem hráče (stav ACTIVE) | oddělit „co se simuluje“ od „co se kreslí“ (rozhodnutí 23) |
| Statisíce simulovaných entit (obyvatelé, auta, populace) | aktéři po stovkách až nízkých tisících, s fyzikou | třetí třída objektů: hromadné entity (21) |
| Svět staví hráč | svět vzniká ze seedu, hráč ho jen upravuje | zásah hráče je vstup generátoru, buňka se přegeneruje za běhu (16, 17) |
| Kamera shora, výběr myší, stavební nástroje | kamera třetí osoby a za autem | strategická kamera, výběr a umisťování v enginu (26) |
| Pauza a zrychlení času | pevný krok 60 Hz v reálném čase | hodiny simulace s rychlostí a pomalými tiky (24) |
| Rozsáhlé UI s tabulkami, seznamy, tooltipy | HUD a jednoduchá menu | plnohodnotná vrstva widgetů (34) |

Dvě věci z dosavadního návrhu strategiím naopak sedí přesně: simulace ve tvaru serveru s příkazy hráče (`player_cmd`) a „asset = program + parametry + seed“ (hráč nakreslí silnici, generátor z ní udělá mesh).

## A. Před M0 (bez nich nejde začít)

| # | Rozhodnutí | Možnosti | Doporučení | Proč |
|---|---|---|---|---|
| 1 | Jazyk (D4) | C17 / „C-like C++20“ | **C17** se sanitizery (ASan, UBSan, TSan), `-Werror` a fuzzingem loaderů. C++ jen uvnitř adaptérů knihoven. | Celá analýza na něm stojí. Paměťové chyby, které AI v C dělá, chytí sanitizery v CI. |
| 2 | Grafická vrstva (D5) | SDL_GPU jediný backend / SDL_GPU + plánovaný nativní Metal / jiná vrstva | **SDL3 + SDL_GPU za vlastním RHI** ze tří přenosných pojmů. Nativní Metal 3 backend jen když ho vynutí měření ceny drawu v M1. | Žádná jiná vrstva volatelná z C není lepší ve všem. RHI nechává cestu ven otevřenou. |
| 3 | Překladač | MSVC na Windows / clang všude | **clang na všech třech OS** (na Windows clang-cl). | MSVC má C11 atomics jen experimentálně. Jedna rodina překladače zmenší rozdíly ve floatech. |
| 4 | Typ rendereru | deferred (G-buffer podle GTA V) / forward+ | **Forward+ s clusterovanými světly**, bez povinného depth prepassu. Potvrdit měřením 1 v M2. | GPU Apple je na forward stavěné, funguje MSAA, průhledné efekty se svítí stejně jako zbytek a stylizované rampové světlo je přirozeně forward. Mění to zprávy 1 a 2. |
| 5 | Determinismus | vše bitově shodné na 3 OS / dvě úrovně | **Dvě úrovně.** Generátory a logika simulace (celá čísla, fixed-point, `detmath`) bitově shodné na 3 OS. Fyzika a animace shodné jen na stejné platformě a buildu. | Deterministický Jolt napříč OS je neověřený a drahý. Logika strategií (ekonomika, populace) jde psát celočíselně, takže je shodná všude a připravená na síť. |
| 6 | Plán | přijmout M0–M9 ze zprávy 5 / upravit | **Přijmout**, ale sepsat nový `ROADMAP.md`: zapracovat zprávy 4 a 6, testovací scénu strategie a rozdělit M0, M3 a M4 na fáze. | Dnes existují čtyři roadmapy. Milníky zůstávají strojově ověřitelné (`milestones/*.json`). |
| 7 | Nástroje pro AI (D18) | jen MCP / jen CLI / jeden registr, dva transporty | **Jeden registr nástrojů, MCP i CLI** nad ním. Žádný nástroj „spusť libovolný kód“. | Kdyby se klienti od MCP odklonili, přechod nic nestojí. |
| 8 | Osa „nahoru“ | Y-up / Z-up | **Z nahoru, pravotočivý systém, X východ, Y sever, metry.** Lint zakáže natvrdo zadané „nahoru“. | Mapa je pak rovina XY, což sedí na buňky, silnice i strategickou mapu. Stejně to má GTA a Unreal. |
| 9 | Struktura repa | monorepo / oddělená repa | **Monorepo** `engine/` + `projects/<hra>/`, CI testuje všechny projekty. | Hlavní pojistka, že engine zůstane obecný (D15, D23). |
| 10 | Hosting a CI | — | **Privátní repo `freema/wallhammerzero`, nová větev `main`.** Linux a Windows v hostovaném CI při každém pushi. macOS testy lokálně jedním skriptem před merge, hostovaný macOS jen jako noční běh. | Hostované macOS runnery jsou drahé a nemají použitelné GPU. Mac je vývojový stroj, takže testy na něm běží tak jako tak. |
| 11 | Rytmus review | průběžně / sdružené brány | **Sdružené brány** s hodinovým rozpočtem v milníku. Propustnost měřit od M2. | Pozornost vlastníka je nejvzácnější zdroj projektu. |
| 12 | Výjimka z D6 (**zamítnuto, viz D35**) | bez výjimek / povolit Xcode | ~~Povolit Xcode~~ jako jedinou systémovou instalaci. Tracy a RenderDoc v `.tools/`. | Bez Xcode nejde ladit ani měřit GPU na Metalu, SDL_GPU nemá časové dotazy. |
| 13 | Konec analýzy (D11) | — | Analýza končí, když jsou potvrzená rozhodnutí 1–14, existuje `ROADMAP.md` a `CONVENTIONS.md` a v Linearu jsou úkoly pro M0 a M1. | D11 dnes nemá podmínku konce. Zbylé rešerše (48) M0 a M1 neovlivní. |
| 14 | Co engine nedělá | žádný seznam / krátký seznam | **Krátký seznam:** mobil a konzole, fotorealismus, VR, editor pro třetí strany, síťový kód (zatím). | Pomáhá uzavírat milníky. Žánry neomezuje. |

## B. Svět a simulace

| # | Rozhodnutí | Možnosti | Doporučení | Proč |
|---|---|---|---|---|
| 15 | Typ světa | pevný ze seedu / pokaždé nový / nekonečný / stavěný hráčem | **Volí projekt:** svět ze seedu s ručními přepisy, nový svět na každou hru, nebo svět stavěný hráčem. Nekonečný svět není cíl. | Plochý svět 65 km nebo konečná planeta stačí všem čtyřem vzorovým hrám. |
| 16 | Proměnlivost světa | neměnný / úpravy hráče / plná destrukce | **Plně upravitelný příkazy hráče.** Zásah je vstup generátoru (silnice, zóna, budova) a dotčená buňka se přegeneruje za běhu. Voxelové kopání až jako volitelný milník. | Strategie to vyžadují. Stavový automat buňky s epochami na to stačí. |
| 17 | Perzistence | ukládat vygenerovaný výstup / jen změny | **Změny nad deterministickou regenerací**, stabilní ID z kotvy, verzovaný formát. K tomu plný stav simulace z registru typů. | Malé savy, vylepšení generátoru se propíšou. Strategie potřebují uložit i stav ekonomiky a entit. |
| 18 | Síť | nikdy / jen tvar / multiplayer | **Jen tvar:** příkazy hráče, simulace jako server. Žádný síťový kód. | Díky rozhodnutí 5 zůstane otevřená cesta k lockstep multiplayeru strategií. |
| 19 | Fyzika | Jolt / jiná | **Jolt přes joltc.** | Dává aktivní ragdoll a vozidla z čistého C API. Doporučují ho dvě zprávy. |
| 20 | Reflexe | žádná / registr typů na hranici | **Registr typů** (jméno, verze, pole) pro save, inspektor, MCP schémata. Zavést už v M0–M1. | Nástroje v M0 potřebují schémata a strategie mají velké savy. |
| 21 | Model entit | tlustí aktéři / komponenty / ECS | **Tři třídy:** statické instance po buňkách, aktéři s komponentami registrovanými hrou (tisíce, s fyzikou), hromadné entity (statisíce, husté tabulky, bez fyziky). V enginu žádné generické ECS, herní DLL si ho smí přinést. | Hromadné entity jsou nové kvůli strategiím. Handly s 20bitovým indexem pro ně nestačí, dostanou vlastní 64bitová ID. |
| 22 | Skriptování a herní data | Lua hned / žádný skript | **Žádný skriptovací jazyk.** Stabilní C ABI a herní data (budovy, technologie, události) jako textové tabulky přes registr typů. | Kód píše AI a herní DLL má hot reload, takže skript nepřináší rychlost. Tabulky pokryjí i datově řízený obsah ve stylu Stellaris. |
| 23 | Rozsah simulace | jen kolem hráče / celý svět | **Dvě vrstvy.** Globální data simulace (silniční graf, tabulky budov a entit) jsou vždy v paměti a tikají všude. Buňky se streamují jen pro kreslení a fyziku. | V GTA stačí simulovat okolí hráče, ve strategii běží celé město pořád. |
| 24 | Čas simulace | pevných 60 Hz / hodiny s rychlostí | **Hodiny simulace:** pauza a násobky rychlosti, skupiny tiků s různou frekvencí (fyzika 60 Hz, ekonomika pomalu), práce rozložená přes snímky. | Strategie se hrají na pauzu a zrychlení. Kreslení zůstává plynulé nezávisle na rychlosti. |
| 25 | Počet světů | jeden globální / více instancí | **Svět je objekt, ne globální proměnná.** Může jich existovat víc najednou. | Stellaris má mapu galaxie a pohled do soustavy. Dodatečně se to mění draho. |
| 26 | Strategické ovládání | jen ve hře / základ v enginu | **Základ v enginu:** strategická kamera (posun, otáčení, zoom od ulice po celou mapu), výběr myší a rámečkem, umisťování s přichytáváním. Pravidla hry v herní DLL. | Stejné nástroje potřebuje i studio (výběr a inspekce světa), takže se napíšou jednou. |
| 27 | Testovací scéna strategie | bez ní / přidat | **Přidat scénu C „strategický výřez“** jako vlastní milník po zárodku planety: kamera shora, 100 000 entit na silničním grafu, hráčem nakreslená silnice, zrychlení času, panel s tabulkou. | Obecnost se neprokáže deklarací, ale scénou v CI, stejně jako u města a planety. |
| 28 | Pořadí M7 a M8 | město první / postavy první | **Obsah města první.** Přehodnotit po bráně M4. | Město potřebují GTA i budovatelská strategie, postavy jen první z nich. |

## C. Vzhled a obsah

| # | Rozhodnutí | Možnosti | Doporučení | Proč |
|---|---|---|---|---|
| 29 | Výtvarný styl (D10) | — | **Stylizované malované 3D:** textury se zapečeným světlem ve stylu WoW, rampové světlo s tónovaným stínem, jedna globální paleta a LUT, mlha a vzdušná perspektiva, hustota města jako GTA III. Obrysy vypnuté, jen jako volitelný parametr. Potvrdit na scéně v M2 vedle referencí. | Je to styl, ve kterém generátory soutěží siluetou a barvou, ne detailem. |
| 30 | Měřítko (D16) | navržený profil / vlastní | **Navržený profil jako start:** postava 1,80 m, otvory ×1,20, podlaží ×1,10, pruhy ×1,15, vzdálenosti ×0,5, modul 0,5 m. Zmrazit v M2 vedle referencí. Každý projekt má vlastní tabulku. | Čísla jsou návrh, ne měření z GTA III. Strategie bude mít jiný profil než město z ulice. |
| 31 | Rozlišení | nativní / nižší + upscale | **Interně 1080p, vlastní upscale, UI nativně.** Potvrdit měřením 1 a 6. | Nativní Retina na M4 Pro podle odhadu 60 fps nedá. |
| 32 | Rozšíření D14 | beze změny / rozšířit | **Rozšířit:** AI zdrojem smí být celá sada map, provenance s licencí a C2PA, report pro Steam. | Výška odvozená z jasu je chybná. Steam vyžaduje přiznání AI obsahu. |
| 33 | Druhý hodnotitel | jen Claude / model jiného dodavatele | **Povolit** levný model jiného dodavatele, povinně jen u rizikových kategorií (postavy, auta, malované textury). | Model své práci nadržuje. Znamená to posílat rendery další službě. |
| 34 | UI | Clay / RmlUi / vlastní | **Studio: Dear ImGui. Hra: vlastní `eng_ui`** nad Clay a SDL_ttf s widgety (tabulky, seznamy, tooltipy, okna), vazbou na data a popisem UI v textových souborech. RmlUi vyhodnotit jako zálohu. | Strategie jsou z poloviny UI. Samotné Clay je jen rozvržení, bez widgetů. |

## D. Zvuk a efekty

| # | Rozhodnutí | Doporučení | Proč |
|---|---|---|---|
| 35 | AI zvuk (A1) | **Jen efekty a ambience**, s provenancí jako D14. Hudba ne. | Kroky, sklo a dav kód nezvládne. Právní riziko je u hudby. |
| 36 | Model pro zvuky (A2) | **ElevenLabs** s připnutou verzí modelu. Před prvním použitím přečíst podmínky. | Vyšší kvalita a žádný těžký lokální stack. Podmínky nejsou ověřené z primárního zdroje. |
| 37 | Hudba rádia (A3) | **Odložit.** Engine postavit nezávisle na zdroji hudby. | Soudní spory kolem AI hudby jsou otevřené. |
| 38 | Hudba planety a strategie (A4) | **Fragmenty z kódu** skládané podle místa a situace, vlastník kurátoruje. | Generativní ambient je v dosahu kódu. |
| 39 | Zvukový styl (A5) | **Stylizovaná zvuková paleta** sladěná s obrazem. | Sedí ke stylu z rozhodnutí 29 a méně závisí na AI vzorcích. |
| 40 | Prostorový zvuk (A6) | **Stylizovaná okluze a dozvukové zóny.** Steam Audio později za portem. | Steam Audio nesedí na streamované buňky. |
| 41 | Hlasitost (A7) | **−23 LUFS**, špičky do −1 dBTP, plus hlasitější profil pro reproduktory notebooku. | Víc dynamiky, notebook řeší profil. |
| 42 | Zvukové zařízení (A8) | **SDL3 zařízení + miniaudio jako mixer.** | Drží D5 a zvuk jde testovat bez zvukové karty. |
| 43 | Pravidla efektů (V1) | **Převzít pravidla Riotu jako linty**, čísla schválit ve style bible. | Stropy jasu a pokrytí drží čitelnost. |
| 44 | AI obrázky pro efekty (V2) | **Výchozí kód**, malý AI arch tahů štětcem povolit pod D14. | Malovaný vzhled se kódem dělá hůř. |
| 45 | Rozsah počasí (V3) | **Déšť, mlha a blesky s městem. Sníh, písek a vítr s planetou.** | Každý jev je modul a rozpočet navíc. |

## E. Organizace

| # | Rozhodnutí | Doporučení | Proč |
|---|---|---|---|
| 46 | „Projektylu“ v D18 | **Projekty ano. Projektily patří do herní DLL**, engine dává fyzikální dotazy a efekty. | Engine zůstává obecný. |
| 47 | Commit dokumentace | **Commitnout hned** do privátního repa. | Analýza je jen na jednom disku. |
| 48 | Další rešerše | **Čtyři témata souběžně s M0 a M1:** (1) doprava, chodci a hromadná simulace entit pro GTA i budovatelskou strategii, (2) fyzika jízdy, (3) světlo, obloha a denní doba, (4) strategie: datově bohaté UI a datově řízený obsah. | M0 a M1 na nich nezávisí, pozdější milníky ano. |
