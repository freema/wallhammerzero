# Srovnání naší procedurální pipeline a AI workflow s praxí (stav k 2026-11-05)

Porovnávané naše dokumenty: `docs/research/Procedurální grafika pro engine.md` (dále „PG“), `docs/research/Schopnosti AI v procedurální 3D grafice.md` (dále „AI“), `docs/DECISIONS.md` (D8 vše z kódu, D13 laťka GTA III/WoW, D14 textury z kódu nebo z jednorázového AI obrázku). Role: vlastník = art director (specifikace, reference, schválení), Claude = programátor a technical artist.

Poznámka k metodě: rozsah rešerše byl ~25 vyhledání/stažení. Některé primární zdroje se nepodařilo stáhnout (esej Kate Compton: 403/500; dokumentace UE PCG overview vrátila prázdné tělo; GDC talky jsou video). Takové body jsou v Gaps nebo jsou označené jako sekundární.

---

## 1. Průmyslové procedurální pipeline: co dělají a my ne

### Takeaway
Všechny doložené produkční pipeline (Far Cry 5, Embark/The Finals, Horizon, UE PCG, Infinigen) mají stejné dělení: **tech-art tým staví generátory, umělci a designéři je používají přes parametry přímo v editoru hry a ručně dolaďují místa, kterým věnují pozornost**. Naše pipeline má silnou „tech-art“ polovinu (čisté funkce, Merkle cache, determinismus, linty), ale „uživatelská“ polovina pro vlastníka (živé parametry, kurátorství, overrides, inspekce mezikroků) je odsunutá na „volitelně od M3“. To je největší strukturální rozdíl.

### Cited Findings
**Far Cry 5 (Ubisoft, 2018)**
- Ubisoft vyvinul sadu procedurálních nástrojů pro generování biomů, texturování terénu, sítě sladké vody, útesy aj. — [GDC Vault, Carrier](https://gdcvault.com/play/1025557/Procedural-World-Generation-of-Far); [80.lv, 2018](https://80.lv/articles/houdini-procedural-world-generation-of-far-cry-5/)
- Nástroje vznikly v Houdini týmem procedurálních tech-artistů (fresh water, power lines, sands, cliffs, biomes, fog density map, world map) a byly „fully integrated into the Ubisoft game editor, so that game artists could craft the world using the Houdini tools from within the editor they already used“ — [SideFX, Far Cry 5](https://www.sidefx.com/community/far-cry-5/) (via vyhledávací snippet)
- Motivace: „Not every square meter of the world will receive the attention of a level artist or a level designer“; plocha ~100 km²; „creating natural-looking environments is a bigger challenge“ než plochu vyplnit — [80.lv, 2018](https://80.lv/articles/houdini-procedural-world-generation-of-far-cry-5/)

**Embark Studios – The Finals / ARC Raiders (80.lv, 3. 3. 2026)**
- Building Creator = modulární sada spolupracujících HDA („Feature Nodes“ pro zdi, podlahy, střechy, okna, dveře); poučení: **modulární sada HDA fungovala lépe než jeden všeobjímající HDA** — [80.lv 2026](https://80.lv/articles/how-embark-studios-built-procedural-environments-for-the-finals-using-houdini)
- **Sdílený blockout mesh dává každému Feature Node stejný prostorový kontext** — tamtéž
- Iterace „4–6 minutes per change“ od blockoutu po fraktovaný asset; kolize a occludery „fully automated and requiring no manual work“ — tamtéž
- Art direction se kódovala do specializovaných uzlů (Kyoto Roof Feature Node) a do jednotného pravidla interiérů v Monaku, protože různorodé interiéry hráče mátly (čitelnost > variabilita) — tamtéž
- Tytéž nástroje se znovu použily v ARC Raiders (Buried City), ale **jen pro base meshe** — tamtéž
- GDC 2026: tech artist Embarku pracuje s Houdini + USD, téma „where artistic control and procedural automation meet“ — [SideFX Houdini HIVE GDC 2026](https://www.sidefx.com/houdini-hive/gdc-2026/) (snippet)
- Embark uvádí na Steamu, že „may use procedural- and AI-based tools to assist with content creation“; tvrzení o „čtvrtině AAA rozpočtu“ je jen ze sekundárních zdrojů — [PC Gamer](https://pcgamer.com/gaming-industry/arc-raiders-use-of-ai-highlights-the-tension-and-confusion-over-where-machine-learning-ends-and-generative-ai-begins); [finalboss.io](https://finalboss.io/embark-s-real-trick-wasn-t-ai-it)

**Unreal Engine 5 PCG (dokumentace 5.3–5.8)**
- Nastavení uzlů označená v C++ jako overridable lze řídit atributy; existují globální a jednotlivé override piny; u Blueprint uzlů je overridable každá „instance editable“ proměnná — [Epic PCG overview](https://dev.epicgames.com/documentation/en-us/unreal-engine/procedural-content-generation-overview) (snippet)
- Attribute sets lze vytvářet z data tables — [SideFX: Houdini PCG integrace](https://www.sidefx.com/docs/houdini/unreal/pcg/overview.html) (snippet)
- Biome Core plugin drží vlastnosti assetů biomu v lokální tabulce atributů a nabízí per-asset overrides (cast shadow, kolize); Epic ho značí jako experimentální a doporučuje plugin zkopírovat, aby ho budoucí verze nerozbily — [Epic Biome Core](https://dev.epicgames.com/documentation/en-us/unreal-engine/procedural-content-generation-pcg-biome-core-and-sample-plugins-overview-guide-in-unreal-engine)
- **Hierarchical generation**: uzel Grid Size nastavuje velikost mřížky pro vše downstream; komponenty jsou pojmenované podle velikosti mřížky (např. `PCGPartitionActor_12800_...`), „Unbounded“ běží jednou bez mřížky. **Runtime generation**: komponenty v poloměru zdroje se plánují ke generování, mimo poloměr × Cleanup Radius Multiplier se uklízejí; poloměry per velikost mřížky — [Epic: PCG generation modes](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-pcg-generation-modes-in-unreal-engine)
- Komunita řeší „cross-partition coherent generation“ v hierarchické runtime generaci jako otevřený problém — [UE forum](https://forums.unrealengine.com/t/cross-partition-coherent-generation-in-pcg-with-hierarchical-runtime-generation/2728364)

**Infinigen (Princeton, CVPR 2023)**
- 182 generátorů, 1 070 „interpretable degrees of freedom“ (Creatures 39/315, Materials 50/271, Small Plants 30/258, Terrain 26/17); autoři přiznávají, že počet „could be an overestimate as not all parameters are fully independent“ — [Infinigen paper](https://ar5iv.labs.arxiv.org/html/2306.09310)
- Generátory jsou „probabilistic programs each specialized to produce one subclass of assets“; vysokoúrovňové parametry se vzorkují z **rozdělení „tuned to mirror the natural world“**, každý parametr lze přepsat přes Python API; pro tvorstvo autoři „modelled 30 example heads and bodies“, aby rozdělení vyladili — tamtéž
- 40 485 řádků kódu; **Node Transpiler** převádí Blender node grafy na Python, aby „non-programmers“ mohli přispívat; anotace rozdělení v názvech uzlů vkládají RNG do vygenerovaného kódu — tamtéž
- Validace: ground truth z geometrie; **žádné lidské hodnocení realismu**, reálné scény jen kvalitativně; neobsahuje žádné člověkem vyrobené objekty; dvojice 1080p snímků trvá 3,5 h — tamtéž

**Ostatní**
- Horizon Zero Dawn: rozmisťování „plně datově řízené, deterministické a lokálně stabilní“, pravidla v grafovém editoru — citováno v PG z [Guerrilla GDC 2017](https://www.guerrilla-games.com/read/gpu-based-procedural-placement-in-horizon-zero-dawn)
- Ghost Recon Wildlands: World Machine „nebylo plně deterministické“ — citováno v PG z [80.lv](https://80.lv/articles/landscape-and-material-pipeline-of-ghost-recon-wildlands/)
- No Man's Sky: pipeline voxely → polygonizace → texturování → populace → simulace (McKendrick, GDC 2017); Murray: terén „without artistic input, using mathematics“ (sekundární) — [GDC Vault 1024265](https://gdcvault.com/play/1024265/Continuous-World-Generation-in-No); [PCGamesN](https://www.pcgamesn.com/no-mans-sky/no-mans-sky-sean-murray-gdc-2017)
- Akademický text o HDA v Maya: zobrazení všech parametrů HDA v hostitelské aplikaci umělce „overloaduje“ a zpomaluje — [core.ac.uk](https://core.ac.uk/download/232282292.pdf) (snippet); GDC 2022 „Procedural Primer for Artists“ (Magee) řeší, jak nástroje nastavit „for artistic control“ — [SideFX](https://www.sidefx.com/learn/talks/procedural-primer-for-artists/)

### Inferences
- **Validace naší architektury:** UE PCG hierarchical + runtime generation (mřížky různých velikostí, poloměr generace a úklidu) je komerční obdoba naší hierarchie L3–L0 a streamovaného generování; HZD a Wildlands potvrzují důraz na determinismus. Na úrovni architektury nejsme mimo praxi; náš determinismus napříč OS je dokonce přísnější než u UE PCG (které o bitové shodě nic neslibuje — gap).
- **Mezera 1 – „editor integration“ pro vlastníka:** všude tech-art buduje nástroj a umělec ho ovládá parametry *v editoru hry*. U nás Claude = tech artist, vlastník = „umělec“, ale vlastník má jen textové key-value recepty a panely cimgui jsou „mohou běžet souběžně od M3“ (PG, sekce milníků). Bez živého panelu je každá estetická změna round-trip přes agenta. Návrh: povýšit panel parametrů na **povinnou součást M3**.
- **Mezera 2 – kurátorství a rozdělení parametrů:** Infinigen nevzorkuje z rozsahů, ale z vyladěných rozdělení (kalibrovaných na 30 příkladech). Naše recepty mají parametry a seed, ale ne *rozdělení* ani *kurátorovaný whitelist*. Návrh: schéma parametrů nese `dist` (uniform/normal/discrete s vahami) a každá rodina má `presets` schválené vlastníkem; runtime generace (budovy v buňkách) vzorkuje jen uvnitř schválených presetů.
- **Mezera 3 – overrides / hand-dressing:** UE PCG má per-asset overrides v tabulkách, FC5 nechává umělce dotvářet hero místa. My máme navržený diff buňky a „vstupy designéra“ (razítka, masky), ale žádný nástroj, jak je vlastník vytvoří. Pro AD (ne modeláře) stačí operace **pin / reroll / ban seed / posun parametru / razítko** v náhledu buňky, zapisované jako soubory v `content/world/overrides`.
- **Mezera 4 – sdílený kontext:** Embarkův „shared blockout mesh“ odpovídá našemu požadavku, aby kit díly četly sémantiku budovy. Návrh: explicitní datová struktura „building context“ (hmota, otvory, patra, orientace) předávaná všem kit generátorům a zapsaná do vertexových atributů — kodifikuje to, co PG popisuje u Tiny Glade.
- **Mezera 5 – čitelnost > variabilita:** Embark úmyslně sjednotil interiéry kvůli čitelnosti. Naše linty měří variabilitu (16 seedů), ale nic neměří **příliš velkou** variabilitu (chaos). Patří do style lintů (viz otázka 3).
- **Mezera 6 – rychlost iterace:** Embark 4–6 min/změnu je považováno za úspěch. Náš cíl „do sekundy“ je odhad (PG to přiznává); i 10× pomalejší by byl konkurenceschopný. Rizikem není rychlost, ale to, že smyčku musí řídit agent.
- Modulární sada generátorů místo jednoho (Embark, Tiny Glade v PG, Infinigen „one subclass per program“) potvrzuje naše rozhodnutí „program na archetyp“.

### Gaps
- Spider-Man 2 / Insomniac a Cyberpunk 2077: nenašel jsem primární zdroj o jejich procedurálních nástrojích (jen dataovaný citát art directorky Insomniacu z roku 2013, že Houdini je „massive time saver“).
- Horizon Forbidden West, Tiny Glade (nad rámec toho, co už cituje PG), Townscaper: nestahováno.
- Detaily UE PCG (debug inspekce atributů, seed/determinismus, custom HLSL uzly): stránka dokumentace vrátila prázdné tělo; nevím, zda PCG garantuje determinismus napříč platformami.
- Obsah talku Carrier (GDC 2018) a Magee (GDC 2022) je jen ve videu, neověřeno.
- No Man's Sky „data-driven terrain settings“ pro umělce: nic konkrétního nenalezeno.

---

## 2. Kódová knihovna operátorů místo node grafů — správně, když kód píše AI a vlastník je AD?

### Takeaway
Ano pro *autorský formát*: evidence ukazuje, že LLM spolehlivě píší spustitelný kód, ale materiálové grafy psané LLM jsou věrohodné jen u mělkých grafů, a i Infinigen má jako kanonickou formu kód (grafy jen transpiluje). Ale „graf jen pro čtení“ je slabá náhrada za to, co grafy dávají *uživateli*: náhled každého mezikroku, exponované parametry a přímou manipulaci. Doporučuji hybrid: **kód + deklarované schéma parametrů → automaticky generovaný cimgui panel + „recipe trace“ s náhledy mezikroků**.

### Cited Findings
- Infinigen drží generátory jako Python kód; Node Transpiler existuje proto, aby *nepřogramátoři* mohli přispívat grafem, výstupem je ale kód — [Infinigen paper](https://ar5iv.labs.arxiv.org/html/2306.09310); [GitHub](https://github.com/princeton-vl/infinigen)
- LLM/VLM psané materiálové grafy dosahují jen věrohodných přiblížení a selhávají u složitých grafů (VLMaterial) — citováno v AI z [VLMaterial](https://arxiv.org/html/2501.18623v2)
- 3DCodeBench: smyčka nad chybami zvedla spustitelnost 0,702 → 0,974; 85–90 % selhání byl drift Blender API; vizuální sebekritika +0,003 až +0,009 — citováno v AI z [3DCodeBench](https://arxiv.org/html/2606.01057)
- LL3M (Lu a kol., srpen 2025): kód jako „editable representation“, šest agentů (planner, retrieval, coding, critic, verification, user feedback) — [LL3M arXiv 2508.08228](https://arxiv.org/html/2508.08228v1)
- HDA parametry exponované naplno umělce přetěžují — [core.ac.uk](https://core.ac.uk/download/232282292.pdf) (snippet); Houdini výhoda: „simple parameter UI“ pro netechnické uživatele bez odhalení vnitřku (sekundární snippet z vyhledávání)
- UE PCG: designér mění chování přes overridable parametry a data tables, ne přepisováním grafu — [Epic PCG overview](https://dev.epicgames.com/documentation/en-us/unreal-engine/procedural-content-generation-overview) (snippet)
- Embark: art direction zakódovaná do jmenovitých, specializovaných uzlů (Kyoto Roof) — [80.lv 2026](https://80.lv/articles/how-embark-studios-built-procedural-environments-for-the-finals-using-houdini)

### Inferences
- **Proč kód vyhrává pro nás:** autor je LLM (kód je jeho silná doména, grafy slabá), diffovatelnost a grep (PG), golden hashe a code review fungují nad textem. Vlastní stabilní API odstraní hlavní třídu chyb (API drift). To je dobře podložené.
- **Co grafy dávají a my ztrácíme:** (a) per-node náhled — v Substance Designer vidí umělec miniaturu každého uzlu, a tím lokalizuje, kde se vzhled pokazil; (b) exponované parametry s rozsahy; (c) přímá manipulace bez programátora. Pro vlastníka-AD jsou (b) a (c) zásadní, (a) pomáhá hlavně Claudovi a hodnotiteli.
- **Konkrétní návrh hybridu:**
  1. **Schéma parametrů v C** (X-makro nebo statická tabulka) u každého `gen_*`: `name, type, unit, min, max, default, dist, group, art_facing(bool), doc`. Ze schématu se generuje: validace receptu, kanonická serializace pro hash, **cimgui panel**, markdown dokumentace pro agenta a JSON pro hodnotitele. Jeden zdroj pravdy, žádný ručně psaný UI kód.
  2. **Max ~8–12 `art_facing` parametrů na rodinu** (zbytek skrytý) podle lekce o přetížení HDA; „makro“ parametry typu „stáří“, „bohatství čtvrti“, „míra stylizace“, které interně řídí více nízkoúrovňových.
  3. **Recipe trace:** každý operátor (`op_noise`, `op_blur`, `op_split`…) v dev buildu zapíše do trasy svůj název, parametry, hash výstupu a miniaturu. `gencli trace --asset X` vyrenderuje „graf z běhu“ (DAG s miniaturami) — inspekce jako v Substance, bez editace grafu. Náklad: logovací hook v operátorové knihovně.
  4. **Variant sweep z panelu:** posuvník → grid 3×3 hodnot parametru vedle sebe (to, co v Houdini dělá wedge). Vlastník volí, volba se zapíše do receptu.
- Read-only „vizualizér grafu volání“ z PG je slabší než trace: graf volání ukazuje strukturu kódu, ne data a mezivýsledky.
- Riziko hybridu: panel může svádět vlastníka k mikroladění parametrů místo k art direction; proto `art_facing` subset a „presety“ místo stovek posuvníků.

### Gaps
- Nenašel jsem empirickou studii „kód vs node grafy“ pro produktivitu nebo kvalitu procedurálního obsahu (ani pro lidi, ani pro LLM). Argumenty výše jsou odvozené.
- Nenašel jsem hotový příklad automaticky generovaného Dear ImGui panelu ze schématu pro procedurální generátory (existují obecné reflexní knihovny, neověřeno).

---

## 3. Stylová konzistence a „procedurální stejnost“ napříč tisíci assetů

### Takeaway
Praxe řeší stejnost **ručně autorovanými stavebními bloky skládanými náhodně** (Spelunky šablony, Townscaper/Embark kit uzly, Infinigen distribuce kalibrované na příkladech) a **pravidly čitelnosti**, ne lepším šumem. Naše PG to v principu ví („rozpočet variace do siluety, barevných bloků a rozložení“), ale chybí měřitelná kontrola rozsahu variability (expressive range) a explicitní „style bible“ mimo čísla — tvarový jazyk, co je zakázané, a příklady.

### Cited Findings
- Spelunky: Derek Yu ručně navrhl šablony místností podle role (drop-down, landing, corridor, mimo kritickou cestu); generátor volí šablonu podle pozice na cestě řešení a přidává náhodné ozdoby; neformální odhad ~80 % layoutu ručně / 20 % náhodně, pasti a monstra 100 % procedurálně (sekundární, Kazemi 2009) — [tinysubversions 2009](https://www.tinysubversions.com/2009/09/spelunkys-procedural-space/index.html); [GMTK přepis](https://amara.org/subtitles/p6MHlmreohsY/en-gb/1/download/How%20and%20Why%20Spelunky%20Makes%20its%20Own%20Levels%20%20Game%20Makers%20Toolkit.en-gb.txt)
- Yu sám v knize přiznává, že systém nedělá nejpřirozenější jeskyně a **hráči rozpoznají opakující se landmarky** (sekundární citace) — tamtéž (výsledky vyhledávání)
- Kniha *Procedural Generation in Game Design* (Short & Adams, 2017) má kapitoly „Managing Output: Boredom vs. Chaos“ (Backus), „Aesthetics“ (Welton), „Designing for Modularity“ (Grinblat), „Understanding the Generated“ (Gillian Smith), „Generative Art Toys“ (Compton), „Content Tools Case Study“ (Auwae) — [Routledge](https://www.routledge.com/Procedural-Generation-in-Game-Design/Short-Adams/p/book/9781498799195)
- „10 000 misek ovesné kaše“ (Compton) — citováno v PG z [Emily Short 2016](https://emshort.blog/2016/09/21/bowls-of-oatmeal-and-text-generation/) a [Rabii & Cook, FDG 2023](https://pyrofoux.github.io/why-oatmeal-is-cheap/why_oatmeal_is_cheap_fdg2023.pdf)
- Infinigen kalibroval distribuce tvorů na 30 ručně modelovaných příkladech hlav a těl — [Infinigen paper](https://ar5iv.labs.arxiv.org/html/2306.09310)
- Embark: konzistentní pravidlo interiérů kvůli čitelnosti; art direction ve specializovaných uzlech — [80.lv 2026](https://80.lv/articles/how-embark-studios-built-procedural-environments-for-the-finals-using-houdini)
- Estetické modely tíhnou k obecně populárnímu stylu — citováno v AI z [AesBiasBench](https://arxiv.org/abs/2509.11620v1); Anthropic: hodnotitel musel explicitně penalizovat generické „AI slop“ vzory — [Anthropic, 24. 3. 2026](https://www.anthropic.com/engineering/harness-design-long-running-apps)

### Inferences
- **Naše „style bible“ je jen numerická** (palety, texely/m, zkosení, výška patra — PG „výtvarná bible ve formě kódu“). Chybí jí: (a) **tvarový jazyk** slovy a příklady (např. „střechy přesahují o ≥0,4 m, žádné ploché střechy v čtvrti X“, „poměr šířky okna k výšce 1:1,6“), (b) **zakázané vzory** (do-not list), (c) **schválené vzorové rendery** jako vizuální kotvy pro každou rodinu. Návrh: `content/style/bible.md` + `content/style/refs/<rodina>/` + `style.cfg`; hodnotitel čte všechny tři.
- **Ekvivalent Spelunky šablon pro nás:** vlastník nemodeluje, ale může schvalovat **kurátorované presety** (parametrové sady), které hrají roli ručně autorovaných šablon; náhodnost pak jen kombinuje schválené presety a přidává „ozdoby“. To přímo kopíruje 80/20 model a dá AD kontrolu nad tím, co se ve městě vyskytne.
- **Expressive range analýza** (Gillian Smith; kapitola „Understanding the Generated“ — obsah jsem neověřil, metodu znám z literatury mimo tuto rešerši): pro každou rodinu vygenerovat 500–1 000 seedů, spočítat 2–4 deskriptory (výška, poměr stran siluety, počet pater, dominantní odstín, složitost obrysu) a vykreslit 2D histogramy. Lint pak hlídá *obě* strany: příliš úzký rozsah (oatmeal) i příliš široký/odlehlé hodnoty (chaos, Backus „Boredom vs. Chaos“). To je číselné orákulum pro problém, který PG zatím řeší jen okem na archu 16 seedů.
- **Perceptuální odlišnost na úrovni čtvrtí:** PG správně směřuje variaci do palety čtvrti a dominant. Doplnit lint „rozlišitelnosti čtvrtí“: z pohledu shora a z ulice spočítat histogram barev a siluet a ověřit, že vzdálenost mezi čtvrtěmi > vzdálenost uvnitř čtvrti.
- **Opakované landmarky** (Yu): unikátní dominanty musí být skutečně unikátní (razítka na L2 z PG), a kit díly s výraznou siluetou (věže, štíty) potřebují kvótu výskytu na km², jinak se stanou rozpoznatelným opakováním.

### Gaps
- Esej Kate Compton „So you want to build a generator“ (2016) se nepodařilo stáhnout (403/500, archive.org blokováno); konkrétní doporučení (inventory, constraints, generate-and-test) proto necituji.
- Talky o Hades (Supergiant) a Spelunky přednášky Dereka Yu nebyly dohledány v primárním znění.
- Obsah kapitol knihy Short & Adams (např. Welton „Aesthetics“) jsem neměl k dispozici, jen obsah knihy.

---

## 4. AI-agentní obsahové workflow 2025–2026 vs naše pravidla

### Takeaway
Naše workflow (orákula → oddělený hodnotitel → vlastník; 15 pravidel v AI) je v souladu s nejlepší veřejnou praxí a v něčem přísnější. Chybí ale čtyři věci, které nejsilnější zdroje dělají explicitně: **(1) hodnotitel kalibrovaný few-shot příklady se skóre od vlastníka a s vahami kritérií**, **(2) předem dohodnutý „kontrakt hotovo“ pro každou rodinu**, **(3) retrieval knihovna schválených generátorů jako příkladů**, **(4) nástroj, který zachytí každé rozhodnutí vlastníka jako data** (párové A/B UI, regresní galerie).

### Cited Findings
**Anthropic – Harness design for long-running apps (24. 3. 2026)**
- Agenti „reliably skew positive when grading their own work“; samostatného hodnotitele bylo snazší naladit na skepsi, i ten byl ale k LLM výstupu shovívavý — [Anthropic Engineering](https://www.anthropic.com/engineering/harness-design-long-running-apps)
- Frontend: čtyři kritéria (design quality, originality, craft, functionality); **design a originalita s vyšší vahou, protože craft a funkčnost model zvládal sám**; originalita penalizovala generické „AI slop“ vzory — tamtéž
- Hodnotitel kalibrován **few-shot příklady s podrobným rozpisem skóre**, aby odpovídal preferencím autora a omezil drift skóre — tamtéž
- 5–15 iterací na generaci, běhy do 4 h; v 10. iteraci model zahodil vyleštěnou stránku pro radikálně jiný koncept — tamtéž
- Před každým sprintem generator a evaluator **vyjednali kontrakt „done“** (sprint 3: 27 kritérií); hodnotitel přes Playwright klikal v živé aplikaci; zpočátku našel skutečné chyby, ale **„talked itself into approving them“** a testoval povrchně; agenti komunikovali přes soubory — tamtéž
- Každá komponenta harnessu kóduje předpoklad o tom, co model neumí; po upgradu modelů (Opus 4.5/4.6) se sprinty a resety kontextu odstranily, planner zůstal, evaluator přešel na jeden průchod na konci a vyplatí se jen tam, kde úloha přesahuje spolehlivé schopnosti modelu — tamtéž
- Náklady: sólo běh 20 min / 9 USD s nefunkční hlavní funkcí vs plný harness 6 h / 200 USD; DAW 3 h 50 min / 124,70 USD — tamtéž

**Godogen (htdt, 2026)**
- Visual QA zachytává screenshoty z běžící hry a analyzuje je **Gemini Flash** (výchozí), volitelně Claude (`--native`) nebo oba (`--both`); statický režim = 1 reference + 1 screenshot, dynamický = více snímků; cílem jsou z-fighting, chybějící textury, rozbitá fyzika; orchestrátor: „don't trust code alone — verify on screenshots“ — [skills.sh visual-qa](https://www.skills.sh/htdt/godogen/visual-qa); [GIGAZINE 2026-03-17](https://gigazine.net/gsc_news/en/20260317-godogen/)

**LL3M a BlenderRAG**
- LL3M: planner, retrieval, coding, critic, verification, user-feedback agent; BlenderRAG = znalostní báze z dokumentace Blender API, dotazovaná pro každý podúkol i při opravách — [LL3M arXiv 2508.08228](https://arxiv.org/html/2508.08228v1)
- BlenderRAG (Rondelli a kol., květen 2026): 500 expertně validovaných příkladů (text, kód, obrázek) v 50 kategoriích; retrieval podobných příkladů zvedl úspěšnost kompilace **40,8 % → 70,0 %** a CLIP shodu **0,41 → 0,77** napříč čtyřmi LLM — [BlenderRAG](https://maxrondelli.github.io/BlenderRAG/); [gamedev.net](https://gamedev.net/news/3101-blenderrag-high-fidelity-3d-object-generation-via-retrieval-augmented-code/)

**Již v našich dokumentech (pro srovnání)**
- Párové soudy s checklistem korelují s lidmi (GPTEval3D, ArtifactsBench >90 %); BlenderGym verifier-human shoda 0,66 vs human-human 0,79; Asset Forge textová reprezentace vedle PNG — citováno v AI

### Inferences
Mapování na naše pravidla (AI, tabulka 15 pravidel):
- **Pravidlo 8 (oddělený hodnotitel) a měření 8 (kalibrace ~30–50 párů):** máme, ale chybí *jak* kalibrovat. Návrh podle Anthropicu: rubrika per rodina s 4–5 kritérii a **vahami posunutými k tomu, co model neumí** (silueta/proporce, stylová shoda s referencí, originalita vs generičnost; menší váha na technickou čistotu, kterou hlídají linty) + **few-shot sada 6–10 renderů se skóre a zdůvodněním od vlastníka** v promptu hodnotitele. Explicitní kritérium „generický / stock look“ proti tendenci k populárnímu stylu.
- **Hodnotitel se přemlouvá ke schválení** (Anthropic): doplnit pravidlo, že hodnotitel nejdřív vypíše vady, pak skóre; schválení jen bez vady třídy „blocker“; a periodicky měřit míru falešných schválení proti verdiktům vlastníka.
- **Kontrakt „hotovo“ per rodina (sprint contract):** naše pravidlo 4 (specifikace v číslech) je blízko, ale je psaná vlastníkem jednostranně. Návrh: před generací agent z specifikace vyrobí `acceptance.md` (např. 15–30 kontrolovatelných bodů: které linty, které pohledy, které reference, minimální skóre hodnotitele), vlastník ho schválí, a teprve pak se generuje. Řeší i stárnutí specifikace (CityGrow v AI).
- **Jiný dodavatel jako hodnotitel:** Godogen standardně používá Gemini pro vizuální QA; naše pravidlo 8 to zmiňuje jen pro „kritická rozhodnutí“. Levný druhý hodnotitel (např. Flash-třída) na každou iteraci + Claude na finále je doložená praxe; neshoda dvou hodnotitelů = eskalace na vlastníka.
- **Retrieval schválených generátorů (BlenderRAG efekt):** každý generátor, který vlastník schválí, jde do `content/library/` jako příklad (kód + recept + rendery + skóre). Agent při psaní nového generátoru dostane 2–3 nejpodobnější. Efekt v BlenderRAG je velký (+29 p. b. kompilace, CLIP 0,41→0,77), u nás bude menší (kompilace řeší vlastní API), ale stylová shoda mezi rodinami je přesně to, co retrieval kotví.
- **Párové A/B UI pro vlastníka:** lokální stránka (nebo okno v enginu) ukazuje dvě varianty + referenci, vlastník klikne A/B/obě špatně + volitelný komentář; volby se logují do `review/decisions.jsonl`. Výhody: (a) rychlejší než slovní review, (b) data pro kalibraci hodnotitele (měření 8) a few-shot příklady, (c) pairwise je formát, kde jsou lidé i VLM nejkonzistentnější (citováno v AI).
- **Automatická regresní galerie:** pravidlo 10 (diff golden hashů) říká *že* se něco změnilo; doplnit, že každá změna hashe vygeneruje before/after arch dotčených rodin a hodnotitel i vlastník vidí jen to, co se změnilo. Řeší i 35,8 % „oprav, které změnily nesouvisející obsah“ (Code4Scene v AI).
- **Rozpočet:** Anthropic harness stál 124–200 USD za aplikaci; pro desítky rodin assetů × iterace je třeba počítat s náklady a měřit, kde se evaluator vyplatí („jen tam, kde úloha přesahuje schopnosti modelu“). Návrh: hodnotitel povinně jen pro rizikové kategorie z tabulky v AI (vozidla, vegetace, postavy, malířské materiály), pro „silné“ kategorie stačí linty + vlastník na archu.
- **Testovat odstranitelnost harnessu:** při upgradu modelu zkusit vypnout jednotlivé části (hodnotitele, sebekritiku, retrieval) na stálé sadě rodin a měřit počet iterací do schválení.

### Gaps
- Blender MCP: nad rámec MindStudio (citováno v AI) jsem nenašel novou primární zkušenostní zprávu.
- SceneCraft: nestahováno.
- Přesná struktura Godogen QA rubriky (jaký checklist) z primárního README neověřena; zdrojem jsou skill stránky a GIGAZINE.
- Detaily „sprint contracts“ jsou z původního článku Anthropic (stažen), ale 27 kritérií se týká full-stack aplikace, ne grafiky; přenos na assety je inference.

---

## 5. AI generování textur v roce 2026: dlaždicovost, PBR z albeda, konzistence sady, licence a provenance

### Takeaway
Pro D14 existují zralejší nástroje, než s jakými naše pipeline počítá: modely dnes přímo generují **dlaždicové PBR sady** (StableMaterials) a komerční nástroje (Substance 3D Sampler) dělají „image → tileable texture → parametrický materiál“ s automatickými Content Credentials. Náš plán „obecný obrázek → kódový post-processing (tileable, paleta, výška z jasu)“ je robustní a deterministický, ale (a) podceňuje kvalitu odvozených map, (b) nemá mechanismus konzistence *sady* před post-processingem, (c) nemá licenční pole a plán veřejného přiznání AI obsahu (Steam od ledna 2026).

### Cited Findings
- **StableMaterials** (Vecchio, arXiv 2406.09293, revize leden 2025): difuzní generátor PBR z textu nebo obrázku; výstup basecolor, roughness, metallic, height, normal; dlaždicovost přes „features rolling“; destilovaný latent consistency model, 4 kroky; 512² + refiner po patchích; kód i modely veřejné — [arXiv 2406.09293](https://arxiv.org/html/2406.09293v3)
- **MaterialFusion**: decoder podporuje dlaždicové generování konvolucí s kruhovým paddingem; **MaterialMVP** (2025) generuje PBR textury z meshe a obrázku; **Material Palette** (duben 2024) je *extrakce* materiálů z jednoho obrázku, ne generátor — [StableMaterials podobné práce, deeppaper](https://arxiv.deeppaper.ai/papers/2406.09293v3/similar?locale=en) (snippet)
- **Adobe Substance 3D Sampler**: Text to Texture (Firefly, od 4.4, 2024), Image to Texture („output is always a square, tileable texture“, reference nemusí být tileable), Text to Pattern (4 dlaždicové vzory), **Image to Material** odvodí normal, height, roughness → parametrický materiál; Sampler automaticky připojuje **Content Credentials** k výstupům Firefly — [80.lv Sampler 4.4](https://80.lv/articles/adobe-s-substance-3d-sampler-4-4-sources-texture-imagery-from-prompts); [CG Channel 2024](https://www.cgchannel.com/2024/05/adobe-releases-substance-3d-sampler-4-4); [Adobe blog 2024-03-18](https://blog.adobe.com/en/publish/2024/03/18/adobe-announces-firefly-powered-features-substance-3d-apps)
- Firefly je Adobem marketován jako „designed for safe commercial use“ (tvrzení výrobce, nezávisle neověřeno) — tamtéž
- **Steam (leden 2026)**: zveřejnit se musí AI obsah, který „ships with your game, and is consumed by players“ (vč. store page a marketingu); interní efektivitní nástroje (např. kódovací asistenti) jsou výslovně vyjmuty; u živě generovaného obsahu je nutné popsat guardrails; vývojář nese plnou odpovědnost za copyright AI assetů — [PC Gamer](https://www.pcgamer.com/software/ai/steam-updates-ai-disclosure-form-to-specify-that-its-focused-on-ai-generated-content-that-is-consumed-by-players-not-efficiency-tools-used-behind-the-scenes/); [Game Developer](https://gamedeveloper.com/business/valve-tweaks-and-clarifies-ai-disclosure-rules-for-steam); [GamingOnLinux 2026-01](https://gamingonlinux.com/2026/01/valve-tweak-steam-ai-disclosure-form-for-developers-to-clarify-its-for-content-consumed-by-players)
- Embark (ARC Raiders) čelil veřejné kontroverzi kvůli AI disclosure, přestože tvrdí, že na vizuály generativní AI nepoužil — [PC Gamer](https://pcgamer.com/gaming-industry/arc-raiders-use-of-ai-highlights-the-tension-and-confusion-over-where-machine-learning-ends-and-generative-ai-begins)

### Inferences
- **Silná stránka našeho D14:** „AI obrázek je vstup, ne výstup“ + hash bajtů v cache klíči + stejný post-processing a linty je čistší než průmyslová praxe (Sampler výstup není reprodukovatelný z receptu). Ponechat.
- **Slabina: výška z jasu.** PG i AI přiznávají, že odvození height/normal z albeda je aproximace. Pro malířský look WoW to vadí méně (světlo je zapečené v albedu), ale u kamene/dřeva v blízkém pohledu je heuristika „světlé = vysoké“ chybná u tmavých výstupků. Návrh: povolit, aby AI zdroj byl **sada map** (albedo + height, např. ze StableMaterials-třídy modelu) uložená jako jeden zdroj s provenancí; post-processing pak height jen normalizuje. Ověřit v měření 9 (AI dokument) jako třetí variantu: kód / AI albedo / AI PBR sada.
- **Dlaždicovost v generátoru vs v post-processingu:** modely s kruhovým paddingem/rolling generují bezešvé dlaždice nativně; náš „offset + prolnutí švů“ je záchranná síť, ne primární cesta. Lint švu (už navržený v AI) zachytí obojí.
- **Konzistence sady:** palette remap sjednotí barvy, ale ne rukopis (tah štětce, měřítko detailu, míru zapečeného světla). Návrh: (a) **style reference board** — 3–6 schválených „kotevních“ textur na rodinu, které se předávají jako obrazová reference do každé generace (image-to-texture režim), (b) generovat celou rodinu v jedné dávce se stejným modelem/verzí a stejnou referencí, (c) lint „měřítko detailu“ (spektrální energie / velikost dominantních struktur v texelech) proti kotevním texturám, (d) hodnotitel dostává mřížku všech textur rodiny najednou, ne jednotlivě.
- **Provenance rozšířit** z (model, prompt, seed, datum) na: verze modelu/endpointu, **licence a odkaz na ToS ve verzi k datu generace**, vstupní reference (hash), zachované **C2PA/Content Credentials** manifesty, kdo schválil, a příznak `player_facing`. Linter odmítne obrázek bez licence stejně jako bez promptu.
- **Steam disclosure:** AI textury v D14 jsou „pre-generated content consumed by players“ → podle pravidel z ledna 2026 je nutné je přiznat. Generátory napsané Claudem jsou pravděpodobně „efektivitní nástroj“ (kódovací asistent), ale *jejich výstup* není generativní AI (je to deterministický program) — to je moje interpretace, ne právní posudek. Návrh: `gencli provenance-report` vyrobí seznam všech AI-sourced assetů pro disclosure formulář a pro případný audit.
- **Reputační riziko:** případ Embarku ukazuje, že i nejasné AI disclosure vyvolá kontroverzi; „procedural, no generative AI“ může být pro engine marketingová výhoda, takže mít čistou evidenci, které materiály jsou z AI, je hodnota sama o sobě.

### Gaps
- Nenašel jsem nezávislé srovnání kvality StableMaterials / Sampler / jiných 2026 modelů pro **stylizované, ručně malované** materiály (většina prací cílí na fotorealistické PBR).
- Konkrétní tileable modely z let 2025–2026 kromě výše uvedených (např. komerční API s nativním tile režimem) jsem neověřoval.
- Aktuální (2026) stav funkcí a licencí Substance 3D Sampler: výsledky jsou z roku 2024.
- Právní stav autorskoprávní ochrany AI obrázků v EU/ČR a podmínky konkrétních modelů rešerše neřešila.
- Primární Steamworks dokumentace nebyla stažena; pravidla jsou z novinových zpráv (PC Gamer, Game Developer).

---

## Souhrn konkrétních návrhů (pro report writera, seřazeno podle dopadu)

1. **Schéma parametrů v každém `gen_*` → auto-generovaný cimgui panel, validace, dokumentace pro agenta**; panel povinně v M3, ne volitelně. Max ~8–12 `art_facing` parametrů na rodinu. (ot. 1, 2)
2. **Kurátorované presety + rozdělení parametrů** (Infinigen) — runtime generace vzorkuje jen ze schválených presetů; vlastník přidává/ruší presety. (ot. 1, 3)
3. **Override nástroje pro AD**: pin / reroll / ban seed / posun parametru / razítko v náhledu buňky, zapisované do `content/world/overrides`. (ot. 1)
4. **Kalibrovaný hodnotitel**: rubrika s vahami k slabinám modelu, few-shot renderů se skóre vlastníka, kritérium „generičnost“, pravidlo „nejdřív vady, pak skóre“, druhý hodnotitel jiného dodavatele. (ot. 4)
5. **`acceptance.md` per rodina** jako vyjednaný kontrakt „hotovo“ před generováním. (ot. 4)
6. **Párové A/B review UI + log rozhodnutí** a **automatická before/after regresní galerie** při změně golden hashů. (ot. 4)
7. **Expressive range linty** (histogramy deskriptorů na 500–1 000 seedech; hlídat nudu i chaos) a lint rozlišitelnosti čtvrtí. (ot. 3)
8. **Recipe trace s miniaturami mezikroků** místo read-only grafu volání. (ot. 2)
9. **Knihovna schválených generátorů jako retrieval příkladů** (BlenderRAG efekt). (ot. 4)
10. **Style bible i slovem a obrazem** (tvarový jazyk, zakázané vzory, kotevní rendery), nejen čísly. (ot. 3)
11. **D14 rozšířit**: AI zdroj smí být PBR sada; style reference board a dávkové generování pro konzistenci; provenance s licencí, ToS a C2PA; `provenance-report` pro Steam disclosure. (ot. 5)
12. **Sdílený „building context“** pro všechny kit generátory (Embark shared blockout). (ot. 1)
