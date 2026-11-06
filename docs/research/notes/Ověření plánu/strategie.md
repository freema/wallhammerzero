# Ověření plánu: obstojí návrh enginu pro strategické hry?

Rešerše z 2026-11-06. Ověřuje rozhodnutí D23, D39, D41, D44–D50 a D57 a milník M6 proti veřejným zdrojům.

## Závěr

Návrh v jádru obstojí. Dvě vrstvy simulace, husté tabulky hromadných entit, příkazy hráče jako vstup a celočíselná logika odpovídají tomu, jak to dělají Cities: Skylines, Factorio i open-source Egregoria. Tři třídy objektů (aktéři vedle hromadných entit) mají přímý předobraz v Unreal Engine 5, kde vedle herních objektů běží Mass pro dopravu a davy ve městě. Cíl 100 000 entit při 60 fps je realistický, pokud se pohyb netiká 60× za sekundu pro každou entitu a cesty se počítají asynchronně.

Největší mezera je D45. Textové tabulky stačí na definice (budovy, technologie). Na hru typu Stellaris nestačí, protože její obsah je z velké části program: podmínky, efekty, rozsahy platnosti a modifikátory. Bez deklarativní vrstvy podmínek a efektů by každá událost byla ruční C kód a engine by neuměl vygenerovat tooltip ani bezpečně uložit odloženou událost.

Další mezery: v plánu chybí uspávání neaktivních entit, pravidlo pro deterministický paralelismus, služba pro hledání cest s invalidací po úpravě grafu, silniční síť jako globální model s křižovatkami a několik povinných částí UI (virtualizované tabulky, vnořené tooltipy, formátovaný text, mapové režimy). Nic z návrhu není vyloženě špatně.

Poučení z Cities: Skylines II: simulace na ECS fungovala, hru potopilo kreslení (stíny, chybějící LOD, žádný occlusion culling). U nás to znamená hlídat rozpočet kreslení 100 000 instancí stejně přísně jako rozpočet tiku.

## Jak číst zdroje

- **[P]** primární zdroj, který jsem četl přímo (blog vývojářů, oficiální dokumentace, wiki modderů, repo).
- **[S]** sekundární zdroj (tisk, komunitní diskuse).
- **[V]** stránku se nepodařilo otevřít, znám jen výňatek z výsledků vyhledávání. Brát s rezervou.

Fórum Paradoxu (forum.paradoxplaza.com) vrací automatům kontrolu prohlížeče. Vývojářské deníky Stellaris proto znám jen jako [V]. Seznam všeho neověřeného je na konci.

---

## 1. Cities: Skylines 1 a 2

### Co říkají zdroje

**Cities: Skylines 1**

- Silnice jsou uzly a segmenty. Segment má maximální délku, dlouhá silnice se dělí. Segment ukládá směr na začátku a na konci a převádí se na Bézierovu křivku se dvěma dopočítanými řídicími body. [P] https://www.gamedeveloper.com/design/game-design-deep-dive-traffic-systems-in-i-cities-skylines-i-
- Cílem bylo město až s milionem obyvatel. Počet obyvatel a aut, která jsou současně na ulici, má strop. Článek číslo neuvádí. [P] tamtéž
- Pohyb aut se simuluje asi 4× za sekundu. Kreslení interpoluje polohu, rotaci a rychlost mezi dvěma kroky simulace. Složitější rozhodnutí se počítají ještě méně často. Vývojáři píší, že klíč k výkonu je „rozložit výpočty co nejvíc“. [P] tamtéž
- Auto cestu nepřepočítává, dokud se na ní něco nezmění. Když cesta neexistuje nebo vznikne zácpa bez východiska, auto se teleportuje zpět. [P] tamtéž
- Simulace běží na vlastním vlákně odděleně od hlavního (kreslicího) vlákna. Tik běží 60× za sekundu i při pauze. Rychlosti jsou 1×, 2× a 4×. Hlavní vlákno čte stav přes interpolaci (`renderFrameOffset` 0..1). Práce se mezi vlákny předává frontami. [P] https://skylines.paradoxwikis.com/Modding_API
- Pevné limity podle výpisů modu, který je zobrazuje: obyvatelé 1 048 576, instance obyvatel (lidé právě venku) 65 536, aktivní vozidla 16 384, uzly sítě 32 768, budovy 49 152, pruhy 262 144. [S] https://steamcommunity.com/sharedfiles/filedetails/comments/531738447
- **Oprava zadání:** číslo 65 536 se netýká vozidel. Je to limit instancí obyvatel. Aktivních vozidel je 16 384. Instance se uvolní, když obyvatel vejde do budovy. [S] https://steamcommunity.com/workshop/filedetails/discussion/2025147082/2970649384352688278
- Vnitřek hledání cest (A*, počet vláken) se nepodařilo ověřit z primárního zdroje.

**Cities: Skylines 2**

- Hra nemá pevné limity agentů. Hledání cest počítá cenu ze čtyř složek: čas, pohodlí, peníze, chování. Agenti přeplánují při události na trase. Simulace a hledání cest využívají všechna jádra. [P] https://www.paradoxinteractive.com/games/cities-skylines-ii/features/traffic-ai
- Hra stojí na Unity ECS a Burst. Paradox uvádí zrychlení některých výpočtů „až 30–40×“, bez měření. [P] https://www.paradoxinteractive.com/games/cities-skylines-ii/modding/dev-diary-3-code-modding
- Rozbor Paava Huhtaly: v dekompilovaném kódu je asi 1 200 systémů. Na straně CPU označuje DOTS za úspěch. Problém je kreslení. [P] https://blog.paavo.me/cities-skylines-2-performance/
  - Zachycený snímek: 6 705 draw callů, z toho 4 828 (72 %) na stíny. Stíny zabraly asi 40 ms z 87,8 ms.
  - Přes všechny průchody 121 milionů vrcholů na vstupu.
  - Vlastní culling umí jen frustum, occlusion culling chybí.
  - Řadě rekvizit chybí LOD. Hromada klád má přes 100 000 vrcholů. Zuby postav mají 6 108 vrcholů a kreslí se vždy.
  - Hra bere každý objekt jako vrhače stínu.
  - Unity Entities Graphics nestačil. Colossal Order si napsal vlastní most mezi ECS a rendererem nad `BatchRendererGroup`, vlastní culling, vlastní virtuální texturování a vlastní skeletální animaci.
  - Simulace úzkým hrdlem není. Hra je omezená grafickou kartou.
  - UI je Coherent Gameface (HTML, CSS, JS, React), ne UI Unity.
- Studio po vydání řeklo, že problémy „nejsou hluboko v základech hry“. [S, jen titulek] https://www.pcgamer.com/cities-skylines-2-studio-promises-performance-issues-can-and-will-be-fixed-we-want-to-assure-you-that-the-issues-are-not-deeply-rooted-in-the-games-foundation/
- Šéfka studia Mariina Hallikainen v březnu 2026: „Úplně jsme přecenili schopnosti enginu“ a „naše chyba byla vsadit na něco, co nebylo ověřené“. [V] https://www.pcgamer.com/games/sim/cities-skylines-2-boss-says-they-completely-overestimated-the-unity-engines-capabilities
- Technický ředitel studia měl na Unite 2024 přednášku o ECS v CS2. Obsah jsem nezískal. [V] https://classcentral.com/course/youtube-tapping-the-entity-component-system-for-cities-skylines-ii-unite-2024-350122

### Verdikt

- **D46 (dvě vrstvy simulace): OBSTOJÍ.** CS1 i CS2 drží celý stav simulace v paměti a kreslení je oddělené.
- **D44 (hromadné entity v hustých tabulkách): OBSTOJÍ.** CS1 má pole pevné velikosti, CS2 ECS. Naše vlastní 64bitová ID nemají strop jako 16bitová ID v CS1.
- **D47 (hodiny, rychlosti, pomalé tiky): OBSTOJÍ.** Odpovídá to CS1: 60 tiků, rychlosti 1×/2×/4×, pohyb aut na 4 Hz, interpolace v kreslení.
- **MÁ MEZERU:** plán neříká, že simulace běží mimo kreslicí vlákno a že kreslení čte interpolovaný snímek stavu. D47 říká jen, že kreslení zůstává plynulé.
- **MÁ MEZERU:** M6 měří tik, ale ne cenu kreslení 100 000 instancí. Podle CS2 je to větší riziko než simulace. Chybí rozpočet stínů, LOD a cullingu pro pohled shora.
- **MÁ MEZERU:** chybí řešení zácpy bez východiska a entity bez cesty. CS1 to řeší teleportem.

---

## 2. Stellaris a engine Clausewitz/Jomini

### Co říkají zdroje

**Proč Stellaris zpomaluje**

- Podle Paradoxu je hlavní příčina počet popů v pozdní hře. Každý pop každých 7 dní přepočítává, jak se hodí na každou práci, a pak soutěží s ostatními na planetě. K tomu kontroly etiky, frakcí a spokojenosti. [S] https://www.gamingonlinux.com/2020/02/big-games-of-stellaris-are-going-to-run-a-lot-smoother-in-the-260-update/
- Verze 2.6 přinesla 15–30 % zrychlení v pozdní hře, měřeno na uložené hře s asi 20 000 popy. [S] tamtéž
- Deník 170 uvádí přerozdělení popů na práce každý den a možnost pustit ho vícevláknově, jedno vlákno na říši. [V] https://forum.paradoxplaza.com/forum/developer-diary/stellaris-dev-diary-170-performance-and-other-technical-issues.1335134/
- Před verzí 4.0 Paradox napsal, že mnoho výpočtů závisí na jiných, a proto musí běžet postupně, ne souběžně. [V] https://admin-forum.paradoxplaza.com/forum/developer-diary/stellaris-dev-diary-366-announcing-stellaris-4-0.1726042
- Přepočet modifikátorů je drahý. Wiki modderů radí použít čistě zobrazovací modifikátor tam, kde není skutečný efekt, „protože aktualizace modifikátorů je nákladná“. [P] https://stellaris.paradoxwikis.com/Modifier_modding

**Co změnila verze 4.0 (2025)**

- Popy se sloučily do skupin podle druhu, vrstvy a etiky. Skupiny vyrábějí „pracovní sílu“, ta plní práce a zdroje vyrábí planeta. Hra počítá jednou za planetu místo jednou za pop. [V] https://forum.paradoxplaza.com/forum/threads/stellaris-dev-diary-370-4-0-changes-part-4.1728047
- Aktuální wiki (verze 4.5) potvrzuje: jedna skupina popů na kombinaci druh, vrstva, etika. [P] https://stellaris.paradoxwikis.com/Population
- Výsledek je sporný. Hráči hlásí zlepšení i zhoršení. Paradox později řekl, že výkon je „nejvyšší priorita“, že to bude „dlouhá cesta“ a že silnější ekonomika 4.0 vede k většímu počtu lodí o sto let dřív. [S] https://www.pcgamesn.com/stellaris/performance-fixes-shadows-of-the-shroud
- Měření před a po od Paradoxu jsem nenašel.

**Jak je postavený engine**

- Clausewitz je obecný základ z roku 2007. Jomini je vrstva nad ním pro hry na mapě, poprvé v Imperator: Rome. Přidala nástroje pro moddery. [S] https://www.pcgamesn.com/imperator-rome/paradox-new-engine-jomini
- Skoro všechen obsah je v textových souborech: `common/` (definice), `events/`, `localisation/`, `interface/` (`.gui`, `.gfx`). Mod je složka se stejnou strukturou. [P] https://stellaris.paradoxwikis.com/Modding
- Skriptovací jazyk má: podmínky (triggers), efekty, rozsahy platnosti (scopes: země, planeta, flotila…), modifikátory, skriptované podmínky a efekty k opakovanému použití, proměnné, `on_actions` (háčky na herní události) a `defines` (globální konstanty). [P] tamtéž
- Efektů je řádově 350 a víc. Patří k nim řízení toku: `if`, `else_if`, `switch`, `random_list`. [P] https://stellaris.paradoxwikis.com/Effects
- Událost má: id, titulek, popis, podmínku, okamžité efekty, volby s vlastními podmínkami a efekty. Spouští se čtyřmi způsoby: dotazováním každý den (drahé), střední dobou do výskytu (ustupuje se od ní kvůli výkonu), z efektu se zpožděním (`days = 200 random = 100`) a přes `on_actions`. [P] https://stellaris.paradoxwikis.com/Event_modding
- Události si předávají kontext: `root`, `from`, `prev` a uložené cíle (`save_event_target_as`). [P] tamtéž
- Engine z efektů sám generuje tooltipy. [P] tamtéž
- Modifikátory se skládají vzorcem `((základ + součet add) × (1 + součet mult)) × (1 − reduction)`. Část modifikátorů engine generuje automaticky z dat (za každý zdroj, třídu lodi, kategorii technologie). Ekonomické kategorie mají rodiče a modifikátor rodiče platí i pro děti. [P] https://stellaris.paradoxwikis.com/Modifier_modding
- Počet událostí ve hře se nepodařilo ověřit. „Tisíce“ ze zadání je odhad.

### Stačí textové tabulky a pravidla v nativním kódu?

Na definice ano. Na události a podmínky ne. Co by chybělo:

1. **Podmínky a efekty jako data.** Ve Stellaris jsou podmínky stromy složené z pojmenovaných stavebních kamenů. Tabulka s pevnými sloupci to nevyjádří. Bez toho je každá událost funkce v C.
2. **Tooltip z podmínky.** Hráč chce vidět, proč tlačítko nejde stisknout a co volba udělá. Engine to umí jen tehdy, když podmínku a efekt vidí jako data. Funkci v C přečíst nedokáže.
3. **Fronta odložených událostí, kterou lze uložit.** Událost „za 200 dní“ musí přežít save. Ukazatel na funkci v DLL po hot reloadu neplatí. Potřeba jsou stabilní jména.
4. **Systém modifikátorů v enginu.** Skládání, zdroje, časové omezení, rozpis v tooltipu a přepočet jen při změně.
5. **Rozsahy platnosti a předávání kontextu** mezi událostmi.
6. **Háčky na herní události** (`on_actions`), aby obsah reagoval bez dotazování každý tik.
7. **Lokalizace s dosazováním hodnot** a s podmíněnými texty.
8. **Úpravy hry bez kompilátoru.** Hráči Paradox her modují v textu.
9. **Kontrola dat.** Odkazy na neexistující klíče musí chytit nástroj, ne hráč.

Řešení nemusí být obecný skriptovací jazyk. Paradox sám nepoužívá Lua. Jeho „skript“ je datový strom, kde každý uzel je podmínka nebo efekt zaregistrovaný v kódu enginu. U nás by herní DLL zaregistrovala podmínky a efekty do registru typů (D43) a textové soubory by je jen skládaly. Logika zůstane v C a celočíselná. Obsah zůstane data.

### Verdikt

- **D45 (žádný skript, textové tabulky): MÁ MEZERU.** Pro budovatelskou strategii stačí. Pro hru typu Stellaris chybí deklarativní vrstva podmínek a efektů, fronta událostí, modifikátory a háčky. Jestli tato vrstva porušuje D45, musí rozhodnout vlastník.
- **D44 (hromadné entity): OBSTOJÍ, s doplněním.** Poučení z 4.0: stejné jednotky slučovat do skupin a počítat za skupinu. Tabulky to umožňují, ale plán ten vzor nejmenuje.
- **D47 (skupiny tiků): MÁ MEZERU.** Paradox říká, že výpočty na sobě závisí a nejdou pustit souběžně. Skupiny tiků potřebují výslovné pořadí a závislosti.
- **D48 (více světů): OBSTOJÍ.** Mapa galaxie a pohled do soustavy.

---

## 3. Factorio

### Co říkají zdroje

- **Spánek entit.** Většina entit „usne“, když nemá co dělat, a ve spánku nestojí nic. [P] https://factorio.com/blog/post/fff-148
- **Pásy.** Původně se aktualizoval každý kus pásu zvlášť. Od 0.15 se ukládají mezery mezi předměty, ne polohy. Na volně tekoucí lince se mění jen dvě krajní mezery. Pohyb předmětů se zrychlil 50–100×, celkově se čekalo 5–10×. [P] https://factorio.com/blog/post/fff-176
- **Vícevláknovost naráží na paměť.** Souběžná aktualizace vlaků, elektřiny a pásů byla pomalejší než sériová. Vlákna si navzájem zneplatňovala cache, protože nezávislé objekty ležely na stejné stránce paměti. Čtení ve více vláknech škáluje dobře, zápis ne. [P] https://factorio.com/blog/post/fff-215
- **Deterministický paralelismus pásů.** Linky se rozdělí do skupin, které se navzájem neovlivňují. Každá skupina běží na svém vlákně. Buzení vkladačů se neprovádí hned, ale řadí se do fronty a hlavní vlákno ho provede v pevném pořadí. Čas pásů klesl ze 4 ms na 1,6 ms. [P] https://factorio.com/blog/post/fff-364
- **Verze 2.0.** [P] https://factorio.com/blog/post/fff-421
  - Roboporty se vypnou, když nemají práci: z 1 ms na 0,025 ms za tik.
  - Roboti ukládají záměr pohybu. Aktualizují se jen jednou za 20 tiků (v pohybu) nebo 60 tiků (stojící) a kreslení pohyb interpoluje. Zrychlení 10–25 % v uložených hrách s mnoha roboty.
  - Vícevláknová elektrická síť byla zamítnuta: čas klesl z 0,5 na 0,39 ms, ale zátěž CPU vzrostla z 0,5 % na 15 %. Výpočet čeká na paměť.
  - Čtení obvodů ve více vláknech: 14,9× v umělém testu, 9,5 % v reálné hře.
- **Lockstep.** Každý hráč počítá celou simulaci. Po síti jdou jen vstupy hráčů. Jakákoli odchylka vede k rozpadu synchronizace. [P] https://factorio.com/blog/post/fff-76
- Rozpad synchronizace vzniká chybou v kódu, v modu nebo vadným hardwarem, ne sítí. Factorio má testovací režim, který hru každý tik uloží a načte. [P] https://wiki.factorio.com/Desynchronization

### Verdikt

- **D44, D28, D41 (tabulky, celočíselná logika, příkazy jako vstup): OBSTOJÍ.** Je to stejný recept jako ve Factoriu.
- **MÁ MEZERU: spánek entit.** „Práce rozložená přes snímky“ (D47) je časové krájení. Factorio získává nejvíc z toho, že nečinné entity neprocházejí vůbec a budí je událost.
- **MÁ MEZERU: pravidlo pro paralelní tik.** Bitová shoda na 3 OS vyžaduje, aby výsledek nezávisel na pořadí vláken. Vzor z FFF 364: nezávislé skupiny a odložené účinky provedené v pevném pořadí.
- **MÁ MEZERU: očekávání od 12 jader.** Hromadná simulace je omezená pamětí. Dvanáct jader nedá dvanáctinásobek. Rozhoduje hustota dat a to, co se vůbec nemusí počítat.
- **MÁ MEZERU: nástroje na hledání rozpadu synchronizace.** Hash po přehrání příkazů v plánu je. Chybí test uložit–načíst–pokračovat se shodným hashem.

---

## 4. Další hry s hromadnou simulací

### Co říkají zdroje

- **Supreme Commander 2 (flow field dlaždice).** Svět je rozdělený na sektory 10 × 10 polí spojené portály. Požadavek na cestu pustí A* jen po grafu portálů. Pro každý sektor se pak postaví pole směrů. Pole se ukládají do cache a sdílejí mezi požadavky. Změna světa označí sektor jako špinavý a přestavba běží z prioritní fronty v časových řezech po milisekundách. Integrace polí jde rozložit na vlákna. [P] https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter23_Crowd_Pathfinding_and_Steering_Using_Flow_Field_Tiles.pdf
- **A/B Street.** Opustil pevný časový krok a přešel na simulaci řízenou událostmi. Agent setrvá ve stavu a sám si naplánuje přechod. Auta jsou fronty na pruh. Přesná poloha se dopočítá, až když je potřeba kreslit. Důvod: krokování je „z principu pomalé“, protože agenti opakovaně kontrolují změny, které nenastaly. [P] https://a-b-street.github.io/docs/tech/trafficsim/discrete_event/index.html
- **Unreal Engine 5, City Sample.** Doprava a davy běží na MassEntity, datově orientovaném rámci pro tisíce agentů. Blízké postavy jsou plné animované modely, vzdálené jsou statické meshe s animací ve vrcholech. [P] https://dev.epicgames.com/documentation/en-us/unreal-engine/city-sample-project-unreal-engine-demonstration
- Demo The Matrix Awakens: 17 000 simulovaných aut v provozu, 35 000 simulovaných chodců, 45 073 zaparkovaných aut. [S] https://blog.playstation.com/2021/12/09/the-matrix-awakens-an-unreal-engine-5-experience-hits-ps5-today/
- **Anno 1800.** Vlastní engine stavěný na neustálé změny mapy, velké počty objektů a kameru shora. Ostatní regiony zůstávají v paměti, aby přepnutí bylo okamžité. Cenou je paměť. [P] https://www.anno-union.com/devblog-the-anno-engine/
- **They Are Billions.** Vlastní engine vyvinutý z enginu starší hry studia, uváděno asi 20 000 jednotek. Technika hledání cest není zveřejněná. [P, oznámení z 2017] https://numantiangames.com/News/2017-05-31-new-game-they-are-billions/
- **Songs of Syx.** Java, „desítky tisíc“ jednotlivě simulovaných obyvatel podle popisu na Steamu. Historie verzí uvádí nový pathfinder dvakrát rychlejší, testovaný na sídle s 28 000 obyvateli. Technický popis od autora jsem nenašel. [P/S] https://store.steampowered.com/app/1162750 a https://songsofsyx.com/wiki/index.php/Version_history
- **Dwarf Fortress.** Podle wiki zabírají většinu času tahy jednotek (přes 60 % ve velkých pevnostech) a hledání cest z toho tvoří méně než 10 %. Verze 50 přidala vícevláknový výpočet viditelnosti. [V] https://dwarffortresswiki.org/index.php/Lag
- **Manor Lords.** Unreal Engine 4, od srpna 2024 Unreal Engine 5. Hráči hlásí zpomalení při velké populaci. Techniku autor nepopsal. [S] https://www.gamesradar.com/games/city-builder/hit-city-builder-manor-lords-is-switching-to-unreal-engine-5-soon-but-its-dev-is-being-careful-about-enabling-performance-heavy-features-to-help-keep-things-running-as-smoothly-as-possible
- **Transport Fever 2.** Jen hráčské rozbory: zpomalení v pozdní hře roste s populací a velikostí silniční sítě. Vyjádření vývojářů k technice jsem nenašel. [S] https://steamcommunity.com/app/1066780/discussions/0/1657817111851997351
- **Workers & Resources.** Jen hráčské zprávy o zpomalení. Nic od vývojářů.

### Společné techniky

| Technika | Kde je doložená |
|---|---|
| Časové krájení (různé frekvence, práce přes snímky) | CS1 (auta 4 Hz), Factorio 2.0 (roboti po 20/60 ticích), SupCom2 (časové řezy) |
| Spánek a buzení událostí | Factorio, A/B Street |
| Slučování jednotek do skupin | Stellaris 4.0 (skupiny popů), Factorio (linky pásů) |
| Kreslení interpoluje řídkou simulaci | CS1, Factorio 2.0, A/B Street |
| Hierarchické hledání cest | SupCom2 (graf portálů a dlaždice) |
| Sdílené výsledky a cache cest | SupCom2 (cache polí), CS1 (cesta se nepřepočítává) |
| Špinavé značky a přestavba na pozadí | SupCom2 |
| Levnější zobrazení vzdálených agentů | UE5 City Sample |

Výslovný popis „LOD simulace“ (vzdálený agent se simuluje hrubě) jsem v primárním zdroji u těchto her nenašel. Doložené je slučování do skupin a levnější zobrazení.

### Verdikt

- **D46, D47: OBSTOJÍ.** Časové krájení a oddělení simulace od kreslení jsou společné všem.
- **MÁ MEZERU:** plán nejmenuje spánek a buzení, plánování podle událostí ani slučování do skupin. To jsou tři techniky s největším doloženým přínosem.
- **D48 (více světů): OBSTOJÍ**, s poznámkou z Anno: víc světů v paměti stojí paměť. Na 24 GB je to potřeba změřit.

---

## 5. Hledání cest pro 100 000 agentů na silničním grafu

### Co říkají zdroje

- **A* na agenta, bez přepočtu.** CS1 počítá cestu jednou a přepočítá ji, jen když se na ní něco změní. [P] https://www.gamedeveloper.com/design/game-design-deep-dive-traffic-systems-in-i-cities-skylines-i-
- **Hledání podle ceny na všech jádrech.** CS2. [P] https://www.paradoxinteractive.com/games/cities-skylines-ii/features/traffic-ai
- **Contraction hierarchies (CH).** Předzpracování přidá zkratky a dotaz pak trvá mikrosekundy. [P] https://en.wikipedia.org/wiki/Contraction_hierarchies
  - Na síti západní Evropy (18 milionů uzlů) vychází předzpracování na desítky minut a dotaz na desetiny milisekundy. [V] http://arxiv.org/abs/1504.05140
  - A/B Street používá CH volitelně. Mapa se tam mezi úpravami nemění. [P] https://a-b-street.github.io/docs/tech/map/index.html
- **Customizable CH.** Změna vah (provoz) stojí na síti kontinentu asi 10 s na jednom vlákně a něco přes sekundu paralelně. Počítá se s tím, že se mění váhy, ne tvar grafu. [P] https://arxiv.org/pdf/2502.10519
- **Flow fields.** Hodí se pro mnoho agentů se společným cílem na mřížce. [P] kapitola Game AI Pro výše
- **Čtení ve více vláknech škáluje.** Hledání cest je čtení grafu, takže ho lze rozdat na jádra. [P] https://factorio.com/blog/post/fff-215

### Vlastní odhad (neměřeno, jen řádová úvaha)

- Městský graf hry má desítky tisíc uzlů, ne miliony. Jeden A* dotaz v C vychází řádově na desetiny milisekundy.
- 100 000 agentů, každý nová cesta jednou za pár minut, dává stovky dotazů za sekundu, tedy jednotky dotazů na snímek. To se vejde do jednoho jádra a lze to rozdat na víc.
- Dražší je pohyb. 100 000 entit × 60 Hz je 6 milionů aktualizací za sekundu. Prostý posun po hraně v husté tabulce to zvládne. Sledování auta před sebou a křižovatky to prodraží. CS1 proto tiká pohyb na 4 Hz.
- CH se pro graf, který hráč kreslí, nehodí. Každá nová silnice mění tvar grafu a předzpracování by se muselo opakovat. To je můj závěr z vlastností metody, ne citace.
- Grafová obdoba flow fieldu je strom nejkratších cest od cíle (jeden Dijkstra na cíl obslouží všechny, kdo tam míří). Vyplatí se, když je cílů málo. Také můj závěr, bez zdroje.

### Je 100 000 agentů při 60 fps na 12 jádrech realistické?

Ano, s podmínkami. Opora:
- CS1 z roku 2015 drží 16 384 aut a 65 536 lidí venku se simulací převážně na jednom vlákně.
- Demo Epicu z roku 2021 drží 17 000 aut a 35 000 chodců na konzoli.
- Factorio drží tovární megabáze na 60 ticích za sekundu díky spánku a slučování.

Podmínky: pohyb tikat řidčeji než kreslení a interpolovat, cesty počítat asynchronně s rozpočtem na snímek, nečinné entity uspat, kreslit instancovaně s LOD.

### Verdikt

- **D50 (100 000 entit na grafu): OBSTOJÍ.** Cíl je realistický.
- **MÁ MEZERU:** kritérium „tik drží rozpočet“ neříká, jak často se tiká pohyb, kolik cest se smí spočítat za snímek a co se stane s cestami po úpravě grafu.
- **MÁ MEZERU:** „nejvyšší rychlost“ nemá číslo. Při 4× stojí simulace čtyřikrát víc. Chybí pravidlo, co se stane, když simulace nestíhá (zpomalit čas, ne kreslení).
- **MÁ MEZERU:** v návrhu chybí služba hledání cest jako pojmenovaná část enginu (fronta požadavků, cache, invalidace, hierarchie).

---

## 6. Nástroje pro kreslení silnic a zón

### Co říkají zdroje

- **CS1.** Hráč klade uzly. Dva uzly tvoří segment. Segment se převádí na Bézierovu křivku. Geometrie silnice je statický mesh s pevnou teselací, který deformuje vertex shader. UV podél délky se počítají z délky křivky. Křižovatky se dělají podobně. Segment ukládá spojení na sousedy a typ silnice. Typ určuje počet pruhů a posuny meshe. [P] https://www.gamedeveloper.com/design/game-design-deep-dive-traffic-systems-in-i-cities-skylines-i-
- **CS2.** Studio oddělilo silniční síť od nástroje, kterým se kreslí. Nástroj nabízí pomocné čáry pro sklon, úhly a křížení. Nejtěžší bylo generovat pruhy kruhového objezdu s libovolným počtem napojení. Rané verze měly „úplně explodující textury“ a díry ve světě. Všechny případy se do vydání vyřešit nepodařilo. [P] https://www.gamedeveloper.com/design/how-colossal-order-turned-roads-into-the-backbone-of-cities-skylines-ii
- **A/B Street.** Silnice je segment mezi právě dvěma křižovatkami. Dělí se na pruhy. Křižovatka má výslovný seznam odboček, každá spojuje zdrojový a cílový pruh. [P] https://a-b-street.github.io/docs/tech/map/index.html
- Geometrie v A/B Street: osa se rozšíří na polygon (spoje miter, při přestřelení bevel), překrývající se silnice se oříznou kolmo k ose a polygon křižovatky vznikne seřazením koncových bodů po směru hodin. Autor píše, že postup má „mnoho vad“. Selhává u krátkých segmentů, téměř rovnoběžných ramp a dělených silnic. Řazení bodů může dát překřížený polygon. [P] https://a-b-street.github.io/docs/tech/map/geometry/index.html
- **Egregoria** (Rust, GPL-3.0). Mapa jsou „jen surová data a operace“ (postav tady silnici). Změny stavu jdou přes příkazy `WorldCommand`. Simulace je čistá a deterministická a podporuje lockstep. Mesh silnice není v datech silnice. Drží ho renderer v cache podle ID silnice. Má i headless binárku. [P] https://github.com/Uriopass/Egregoria/blob/master/ARCHITECTURE.md
- **Citybound** (Rust, AGPL-3.0, rozpracované). Zaměřuje se na mikroskopickou simulaci a plánování. Architekturu popisuje Living Design Doc v Notionu, ten jsem nečetl. Tvrzení, že základní jednotkou geometrie je jednotlivý pruh, znám jen z README forku. [P/V] https://github.com/citybound/citybound a https://github.com/codiem/citybound
- Jak CS váže mřížku zón na silnici, jsem v primárním zdroji nenašel.

### Verdikt

- **D39 (příkaz hráče je vstup generátoru): OBSTOJÍ.** Egregoria dělá totéž: příkazy mění surová data mapy a renderer si mesh dopočítá a drží v cache.
- **MÁ MEZERU: „přegeneruje se dotčená buňka“ je moc hrubé.** Silniční síť je globální model (uzly, segmenty, pruhy, odbočky). Segment běžně protíná víc buněk po 256 m. Přegenerovat se má dotčený segment a jeho křižovatky. Buňka je jen koš pro kreslení.
- **MÁ MEZERU: geometrie křižovatek.** Podle A/B Street i CS2 je to nejtěžší část a rozbíjí se na okrajových případech. Plán pro ni nemá úkol ani sadu testů.
- **MÁ MEZERU: odvozená data.** Po úpravě se musí v jednom kroku přepočítat graf pruhů a odboček a zneplatnit cesty agentů přes změněné místo.
- **MÁ MEZERU: náhled při kreslení.** Hráč táhne myší a chce vidět silnici hned. Generátor musí běžet každý snímek pro jeden segment v rozpočtu.
- Licence: Citybound je AGPL, Egregoria GPL-3.0. Lze studovat postupy, kód nepřebírat. Licenci A/B Street jsem neověřil.

---

## 7. UI strategií

### Co říkají zdroje

**Paradox (Jomini GUI, podle wiki CK3)** [P] https://ck3.paradoxwikis.com/Interface

- UI je popsané v textových souborech `.gui`.
- Kontejnery: `window`, `hbox` a `vbox` s pravidly roztahování, `flowcontainer`, `scrollbox`.
- `fixedgridbox` je seznam se stejně velkými položkami pro dlouhé seznamy, kvůli výkonu. `dynamicgridbox` má položky různé velikosti.
- Šablony a typy pro opakované použití. Část instance lze přepsat přes `blockoverride`.
- Vazba na data: `datacontext` (jeden objekt), `datamodel` (seznam). Hodnoty se dosazují v hranatých závorkách s formátováním, třeba `[Character.GetName]` nebo `|1` pro jedno desetinné místo.
- Skriptovaná GUI: tlačítko má v datech efekt, podmínku viditelnosti a podmínku platnosti a z nich se staví tooltip.
- Hot reload: uložený `.gui` se načte sám. Inspektor ukáže soubor a řádek prvku.
- Animace přes pojmenované stavy (`_show`, `_hide`).

**Vnořené tooltipy.** CK3 má tooltipy v tooltipech. Najetí na herní pojem v otevřeném tooltipu otevře další. Pojmy se samy zapojují do encyklopedie, včetně obsahu z modů. [S] https://www.pcgamer.com/the-crusader-kings-3-team-is-working-hard-to-make-the-game-easier-to-learn

**Factorio.** Vlastní GUI. Všechno se měří v modulech po 4 pixelech. Měřítko jde po 25 % od 75 do 200 %, aby se rozložení nerozbilo. Styly a kód se sdílejí mezi okny. Každé okno prochází procesem: UX dokument, mockup, implementace, revize. GUI bylo hlavní brzdou vydání verze 0.17. [P] https://factorio.com/blog/post/fff-277

**Cities: Skylines II.** UI je webová technologie (Coherent Gameface, React). [P] https://blog.paavo.me/cities-skylines-2-performance/

### Co musí UI vrstva umět

Doložené zdroji výše:
- Tabulky a seznamy s tisíci řádků, kreslí se jen viditelné řádky.
- Vazba na data s formátováním čísel.
- Vnořené tooltipy a herní pojmy jako odkazy v textu.
- Tooltip složený z podmínek a efektů (souvisí s bodem 2).
- Šablony, hot reload, inspektor prvků.
- Pevná mřížka a měřítko UI.

Z praxe žánru, bez citace v této rešerši:
- Řazení a filtrování tabulek.
- Mapové režimy (obarvení mapy podle dat).
- Notifikace a výstrahy.
- Ledger a grafy v čase.
- Rozpis modifikátorů v tooltipu.
- Lokalizace s dosazováním hodnot a ikonami v textu.

### Verdikt

- **D57 (vlastní `eng_ui`, popis v textu, vazba na data): OBSTOJÍ.** Je to stejný směr jako Jomini.
- **MÁ MEZERU: formátovaný text.** Vnořené tooltipy potřebují text s odkazy, barvami a ikonami uvnitř řádku. Clay řeší rozložení a SDL_ttf sází prostý text. Tohle bude vlastní práce.
- **MÁ MEZERU: virtualizace seznamů.** Tabulka se 100 000 řádky nesmí stavět 100 000 prvků.
- **MÁ MEZERU: mapové režimy.** Nejsou UI, ale funkce rendereru: obarvit segmenty, budovy nebo území podle sloupce v tabulce simulace. V plánu chybí.
- **MÁ MEZERU: rozsah.** Zkušenost Factoria říká, že UI je hlavní brzda vydání. M6 s jedním panelem ověří základ, ne šíři.

---

## 8. Obecné enginy a strategie

### Co říkají zdroje

- **Proč vlastní engine (Anno).** Malá studia staví engine kolem svých mechanik. Engine Anno je dělaný na neustálé změny mapy, mnoho objektů a kameru shora. Podle vývojářů se nehodí na závodní hry ani RPG, protože nemá systém vybavení postav ani fyziku vozidel. [P] https://www.anno-union.com/devblog-the-anno-engine/
- **Paradox.** Obecný základ (Clausewitz) a nad ním vrstva pro hry na mapě (Jomini). [S] https://www.pcgamesn.com/imperator-rome/paradox-new-engine-jomini
- **Obecný engine a budovatelská strategie.** CS1 i CS2 běží na Unity. U CS2 studio muselo dopsat most mezi ECS a rendererem, culling, virtuální textury a animace. [P] https://blog.paavo.me/cities-skylines-2-performance/
- Poučení šéfky studia: nesázet na neověřenou technologii. [V] https://www.pcgamer.com/games/sim/cities-skylines-2-boss-says-they-completely-overestimated-the-unity-engines-capabilities
- **Obecný engine, který dělá město ve stylu GTA i hromadnou simulaci.** Unreal Engine 5: herní objekty (Actors) a vedle nich MassEntity pro dopravu a davy. Je to stejné dělení jako naše aktéři a hromadné entity. [P] https://dev.epicgames.com/documentation/en-us/unreal-engine/city-sample-project-unreal-engine-demonstration
- Omezení Mass: podle odpovědi na fóru Epicu není MassTraffic oficiálně podporovaný mimo City Sample a Mass má jen minimální podporu multiplayeru. [S] https://forums.unrealengine.com/t/tutorial-your-first-60-minutes-with-mass/794314
- **Strategie na obecném enginu existují.** Manor Lords běží na Unreal Engine. [S] https://www.gamesradar.com/games/city-builder/hit-city-builder-manor-lords-is-switching-to-unreal-engine-5-soon-but-its-dev-is-being-careful-about-enabling-performance-heavy-features-to-help-keep-things-running-as-smoothly-as-possible
- Cities: Skylines 1 i 2 běží na Unity. [V] https://unity3d.com/case-study/cities-skylines a [P] https://blog.paavo.me/cities-skylines-2-performance/
- Příklad velké strategie typu Stellaris na obecném enginu jsem v této rešerši neověřil.

### Co z toho plyne

- Strategie nepotřebuje jiný renderer. Potřebuje jinou herní vrstvu: data, události, modifikátory, čas, UI. To je většina toho, co dělá Jomini nad Clausewitzem.
- Dělení aktéři a hromadné entity má předobraz u Epicu a funguje ve městě ve stylu GTA.
- Renderer musí zvládnout pohled z ulice i z výšky. CS2 ukazuje, že selhává pohled z výšky: příliš geometrie, stíny ze všeho, žádný occlusion culling.
- Neustálé změny mapy jsou u strategie základní požadavek. U nás je kryje D39.
- Obecné enginy narážejí na strategii tam, kde jejich hotové části nepočítají s masou (Unity u CS2). U vlastního enginu tohle riziko není, ale všechno je vlastní práce.

### Verdikt

- **D15, D23 (obecný engine i pro strategie): OBSTOJÍ.** Existuje obecný engine, který dělá obojí, a naše dělení objektů odpovídá jeho řešení.
- **MÁ MEZERU:** plán nepopisuje strategickou herní vrstvu jako celek. Jsou v něm kusy (hodiny, tabulky, UI), ale ne události, modifikátory a mapové režimy.

---

## Dopady na plán

### Přidat do návrhu

1. **Deklarativní podmínky a efekty v datech** (čeká na rozhodnutí vlastníka, otázka 1). Herní DLL registruje podmínky a efekty do registru typů. Textové soubory je skládají do stromů. Engine z nich umí vyhodnocení, tooltip a kontrolu odkazů.
2. **Fronta událostí v enginu.** Odložené události se stabilními jmény, uložitelné do savu, a háčky na herní události.
3. **Systém modifikátorů v enginu.** Skládání add/mult, zdroj, trvání, přepočet jen při změně, rozpis pro tooltip.
4. **Spánek a buzení hromadných entit.** Seznam aktivních entit. Nečinné se neprocházejí. Budí je událost nebo čas.
5. **Plánovač podle času probuzení** jako doplněk skupin tiků. Entita řekne, kdy má být znovu zpracována.
6. **Pravidlo deterministického paralelismu.** Paralelně jen nezávislé skupiny. Účinky přes hranici skupin se odkládají a provedou v pevném pořadí. Pořadí a závislosti skupin tiků jsou výslovné.
7. **Simulace mimo kreslicí vlákno.** Kreslení čte interpolovaný snímek stavu. Zapsat do D47.
8. **Služba hledání cest.** Fronta požadavků, rozpočet na snímek, výpočet na více jádrech, cache, invalidace po úpravě grafu, hierarchie. Výchozí metoda je A*. Contraction hierarchies ne, protože graf mění hráč.
9. **Silniční síť jako globální model.** Uzly, segmenty, pruhy, odbočky. Přegenerování po špinavých segmentech a křižovatkách, ne po buňkách. Upřesnit D39.
10. **Úkol na geometrii křižovatek** se sadou zlých případů: ostrý úhel, krátký segment, mnoho ramen, sklon, kruhový objezd.
11. **Slučování do skupin** jako doporučený vzor pro populace (podle Stellaris 4.0).
12. **UI:** formátovaný text s odkazy a ikonami, vnořené tooltipy, virtualizované seznamy, řazení, grafy, notifikace, pevná mřížka a měřítko.
13. **Mapové režimy** jako funkce rendereru: obarvení podle sloupce simulace.
14. **Pravidlo pro nestíhající simulaci:** zpomalí se herní čas, kreslení drží snímky. Nejvyšší rychlost dostane číslo.
15. **Řešení entity bez cesty a zácpy** (návrat, zrušení, hlášení hráči).

### Změnit v testovací scéně C (M6)

- Měřit zvlášť tři případy: všech 100 000 entit v pohybu, 20 % v pohybu a zbytek spí, a nejvyšší rychlost času.
- Stanovit frekvenci tiku pohybu (například 10 Hz s interpolací) a rozpočet cest na snímek. Zapsat do měření 24.
- Hráč nakreslí silnici **během provozu**. Cesty přes změněné místo se zneplatní a přepočítají bez zaseknutí snímku.
- Scéna obsahuje aspoň jednu křižovatku se čtyřmi rameny a jednu s ostrým úhlem.
- Náhled silnice při tažení myší drží rozpočet snímku.
- Test determinismu rozšířit: uložit uprostřed běhu, načíst, pokračovat. Hash se musí shodnout s během bez uložení. Stejný hash při 1 a při 12 vláknech.
- Měřit cenu kreslení při pohledu na celou mapu: draw cally, trojúhelníky, čas stínů. Stanovit strop.
- Panel s tabulkou má aspoň 10 000 řádků, jde řadit a má vnořený tooltip.
- Jedna událost z dat: podmínka, zpoždění, efekt, tooltip vygenerovaný z dat. Přežije save. (Jen pokud vlastník schválí bod 1.)
- Jeden mapový režim (například hustota provozu po segmentech).
- Druhý svět má tikat současně s prvním, ne jen existovat. Měřit paměť obou.

### Co se nemění

- D44 (tři třídy objektů, bez generického ECS), D46, D48, D28 a D41. Zdroje je podporují.
- Engine zůstává obecný. Žádný zdroj neříká, že to nejde.

---

## Otázky pro vlastníka

1. **Smí být v datech deklarativní strom podmínek a efektů?** Není to obecný skriptovací jazyk. Logika zůstane v C v herní DLL, data ji jen skládají. Bez toho se hra typu Stellaris píše událost po události v C a engine neumí tooltipy z podmínek. Je to v souladu s D45, nebo výjimka?
2. **Mají hráči umět hru upravovat bez kompilátoru?** Pokud ano, bod 1 je nutnost. Pokud ne, jde to celé v C.
3. **Jak věrná má být doprava z výšky?** Každé auto viditelné a jednotlivě simulované v celém městě (jako Cities: Skylines), nebo smí být vzdálené části simulované hrubě a slučované?
4. **Jaká je nejvyšší rychlost času?** 4× jako Cities: Skylines, nebo „co stroj stihne“ jako velké strategie? Určuje rozpočet tiku.
5. **Je lockstep multiplayer skutečný cíl, nebo jen otevřené dveře?** Pokud cíl, vyplatí se platit za deterministický paralelismus a nástroje na hledání rozpadu synchronizace už v M6. Pokud jen dveře, stačí hash na jednom vlákně.
6. **Jaké měřítko má mít velká strategie?** Počet planet, populací a flotil určí, jestli stačí skupiny, nebo je potřeba simulovat jednotlivce.
7. **Kolik UI patří do M6?** Jen tabulka a tooltip, nebo i vnořené tooltipy, mapový režim a graf? Podle Factoria je UI hlavní brzda.

---

## Co se nepodařilo ověřit

- **Vývojářské deníky Stellaris** (170, 366, 370, 385): fórum Paradoxu blokuje automatické čtení. Obsah znám jen z výňatků vyhledávače a ze sekundárních článků.
- **Měřený přínos Stellaris 4.0:** oficiální čísla před a po jsem nenašel. Hráčské zprávy si odporují.
- **Počet událostí ve Stellaris:** nezjištěn.
- **Vnitřek hledání cest v CS1** (algoritmus, počet vláken): bez primárního zdroje.
- **Limity CS1:** jen z výpisů komunitního modu, ne od vývojářů. Limit zaparkovaných aut a segmentů nepotvrzen.
- **Přednáška Colossal Order na Unite 2024** a **rozhovor s Mariinou Hallikainen (PC Gamer, 2026):** obsah jen z výňatků.
- **Důvod přechodu CS2 na DOTS** vlastními slovy studia: nenalezen. Jeden sekundární článek uvádí, že cílem bylo odstranit úzké hrdlo CPU z prvního dílu a zvětšit rozsah simulace. [V] https://tdp-frontend.pages.dev/article/2026-03-18-colossal-order-admits-unity-gamble-that-sank-cities-skylines-2-4ee6a7e7
- **Techniky v Songs of Syx, They Are Billions, Transport Fever 2, Workers & Resources a Manor Lords:** vývojáři je veřejně nepopsali, nebo jsem popis nenašel.
- **Dwarf Fortress wiki:** stránka vracela chybu 429. Údaje jen z výňatku.
- **Čísla pro contraction hierarchies na síti Evropy:** z výňatku přehledového článku, tabulku jsem nečetl.
- **Počty z dema The Matrix Awakens:** z tisku a blogu PlayStation. Stránka Epicu vracela 403.
- **Citybound:** Living Design Doc jsem nečetl.
- **Napojení zón na silnice v Cities: Skylines:** bez primárního zdroje.
- **Licence A/B Street:** neověřena.
- **GDC přednášky** k tématu: žádnou relevantní jsem nenašel ani neotevřel. Kapitola Game AI Pro je knižní zdroj, ne GDC.
- **Odhady v bodě 5** (cena A*, počet dotazů za sekundu) jsou moje řádová úvaha. Rozhodne měření 24.
