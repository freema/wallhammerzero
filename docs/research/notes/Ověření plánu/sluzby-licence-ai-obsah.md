# Ověření plánu: služby, licence a AI obsah

Datum rešerše: 2026-11-06. Rešeršér: Claude (subagent). Všechny odkazy jsem četl dnes, pokud není uvedeno jinak.

Nejsem právník. Tohle je přehled zdrojů, ne právní rada. Před vydáním hry stojí za to nechat body 1, 2, 4 a 8 projít právníkem.

## Krátký závěr

Plán drží. Žádný z osmi předpokladů není vyvrácený, ale tři mají díru, kterou je potřeba zavřít.
Steam chce zveřejnit AI obsah, který hráč vidí a slyší (grafika, zvuk, text, lokalizace). O kódu formulář mlčí, takže u "grafiky z kódu, který napsala AI" není jasné, jestli se hlásit musí.
ElevenLabs zvukové efekty ve hrách výslovně dovoluje, komerčně jen na placeném tarifu. Verzi modelu jde zvolit, ale ne natrvalo: model v2 se vypíná 1. 3. 2027 a API nemá seed, takže výstup nejde zopakovat.
Opatrnost u AI hudby je stále namístě. Sony a UMG se se Suno dál soudí a rozsudek o fair use zatím nepadl.
Čistý výstup AI není autorsky chráněný v USA ani v Česku. Chráněný je jen lidský podíl (výběr, uspořádání, úpravy), a to případ od případu.
C2PA má smysl ukládat, nástroj `c2patool` existuje a je udržovaný. Nesmí to ale být podmínka, protože část modelů metadata nevkládá.
Z EU AI Act pro vydavatele hry s předem vygenerovaným stylizovaným obsahem žádná povinnost označování neplyne.
Všechny knihovny jsou použitelné v uzavřené komerční hře. Je jen potřeba přiložit texty licencí a jednu větu o FreeType.

## Tabulka bodů 1–8

| # | Bod | Stav | Co přesně platí | Odkaz |
|---|-----|------|-----------------|-------|
| 1a | Steam: povinnost zveřejnit AI obsah | POTVRZENO | Content Survey má sekci o AI. Dělí obsah na Pre-Generated (vzniklý při vývoji) a Live-Generated (vzniká za běhu hry). Je potřeba popsat, jak hra AI používá. U Live-Generated navíc popsat pojistky proti nelegálnímu obsahu. Valve hodnotí AI obsah stejně jako jiný obsah. | [Steamworks: Content Survey](https://partner.steamgames.com/doc/gettingstarted/contentsurvey) (primární) |
| 1b | Steam: změna 2025–2026 | POTVRZENO | V lednu 2026 Valve upravilo text. Nově píše, že nástroje pro efektivitu vývoje "nejsou předmětem této sekce". Jde o obsah, který je součástí hry a hráč ho konzumuje: "artwork, sound, narrative, localization, etc." Povinnost nezmizela, jen se zúžila. | [Steamworks: Content Survey](https://partner.steamgames.com/doc/gettingstarted/contentsurvey) (primární), [GamingOnLinux 17. 1. 2026](https://gamingonlinux.com/2026/01/valve-tweak-steam-ai-disclosure-form-for-developers-to-clarify-its-for-content-consumed-by-players) (sekundární) |
| 1c | Steam: platí to i pro kód psaný AI? | NEJISTÉ | Stránka kód vůbec nezmiňuje. Pomocníci v editoru podle textu cílem nejsou. Náš případ je ale jiný: AI napsala kód, který kreslí grafiku, kterou hráč vidí. To se dá číst jako "AI použitá při tvorbě artworku". Valve to nikde neřeší. | [Steamworks: Content Survey](https://partner.steamgames.com/doc/gettingstarted/contentsurvey) (primární) |
| 2a | ElevenLabs SFX: komerční použití ve hře | POTVRZENO | Podmínky výslovně dovolují vložit výstup do "films, trailers, advertising, video, games, applications". Komerčně jen tam, kde to tarif dovoluje. Free tarif je podle Terms of Use jen nekomerční. Komerční licence začíná tarifem Starter (6 USD/měs.). Výstup zůstává uživateli ("you retain all rights in and to your Output"). | [ElevenCreative Terms, Exhibit 4](https://elevenlabs.io/sound-effects-terms), [Terms of Use §1(c), §4(c)](https://elevenlabs.io/terms-of-use) (oba primární, verze z 9. 10. 2026), [ceník](https://elevenlabs.io/pricing) |
| 2b | ElevenLabs SFX: omezení | POTVRZENO | Zvuk se smí šířit jen spojený s jiným materiálem. Nesmí se prodávat ani šířit samostatně, jako izolované soubory nebo jako knihovna zvuků. ElevenLabs nedává záruku, že výstup neporušuje cizí práva, a neodškodňuje. Podobný výstup může dostat i jiný uživatel. Výstupy smí ElevenLabs použít k tréninku, jde to vypnout v účtu. | [ElevenCreative Terms, Exhibit 4 §2](https://elevenlabs.io/sound-effects-terms), [Terms of Use §4(d), §4(i), §9, §10](https://elevenlabs.io/terms-of-use) |
| 2c | ElevenLabs: připnutí verze modelu | ČÁSTEČNĚ | API má parametr `model_id` s hodnotami `eleven_text_to_sound_v2` (výchozí) a `eleven_text_to_sound_v3`. Model v2 je označený jako zastaralý a bude odstraněn 1. 3. 2027. Parametr seed neexistuje. Stejný prompt tedy nedá stejný zvuk. | [API reference](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert), [přehled modelů](https://elevenlabs.io/docs/overview/models), [SFX dokumentace](https://elevenlabs.io/docs/overview/capabilities/sound-effects) (primární) |
| 3 | AI hudba: je opatrnost namístě? | POTVRZENO | UMG se dohodlo s Udio (29. 10. 2025), Warner s Udio (19. 11. 2025) a se Suno (25. 11. 2025). Sony se nedohodlo s nikým. UMG a Sony dál žalují Suno a 18. 9. 2026 podaly druhou žalobu. Rozsudek o fair use nepadl. Mnichovský soud rozhodl 31. 7. 2026 proti Suno ve sporu s GEMA. | [AI Lawsuit Tracker](https://ailawsuittracker.com/cases/umg-v-suno/), [Wikipedia: Suno](https://en.wikipedia.org/wiki/Suno_(platform)) (oba sekundární) |
| 4a | Autorské právo USA | POTVRZENO | Copyright Office, leden 2025: čistě AI materiál chráněný není. Samotné prompty nestačí. Chráněné je lidské vyjádření, které je ve výstupu vidět, dále tvůrčí výběr a uspořádání a tvůrčí úpravy. Použití AI jako pomůcky ochraně nevadí. Posuzuje se případ od případu. Nejvyšší soud 2. 3. 2026 odmítl případ Thaler, požadavek lidského autora platí dál. | [Zpráva Part 2, s. iii](https://www.copyright.gov/ai/Copyright-and-Artificial-Intelligence-Part-2-Copyrightability-Report.pdf) (primární), [Mayer Brown o Thaler](https://www.mayerbrown.com/en/insights/publications/2026/03/supreme%20court%20denies%20review%20in%20ai%20authorship%20case) (sekundární) |
| 4b | Autorské právo EU a ČR | POTVRZENO, bez jednotného pravidla | EU nemá zvláštní předpis o AI výstupech. Platí obecné měřítko "vlastní duševní výtvor autora", tedy člověka. Studie pro Evropský parlament (7/2025): plně strojový výstup chráněný není, dílo s AI jako pomůckou může být. Městský soud v Praze (10 C 13/2023): obrázek od AI není autorské dílo, prompt je jen námět. | [Studie EP PE 774.095](https://www.europarl.europa.eu/RegData/etudes/STUD/2025/774095/IUST_STU(2025)774095_EN.pdf), [rozsudek 10 C 13/2023](https://msp.gov.cz/documents/14569/1865919/10C_13_2023_10) (oba primární) |
| 5a | C2PA: které modely ho vkládají | ČÁSTEČNĚ POTVRZENO | Black Forest Labs (FLUX): ano, přes API i playground, ne u vlastního hostování. Google: C2PA u Nano Banana Pro v aplikaci Gemini, Vertex AI a Google Ads. Dokumentace Gemini API mluví jen o vodoznaku SynthID. OpenAI: podle nápovědy mají obrázky z ChatGPT i z API C2PA a SynthID (stránku jsem nenačetl, znám jen úryvek z vyhledávání). Adobe Firefly: ano, ale jen ze sekundárních zdrojů. Midjourney: ne, jen ze sekundárních zdrojů. | [BFL nápověda](https://help.bfl.ai/articles/3705384267-c2pa-in-flux-generated-images), [Google blog 20. 11. 2025](https://blog.google/technology/ai/ai-image-verification-gemini-app/), [Gemini API docs](https://aistudio.google.com/docs/image-generation) (primární), [OpenAI nápověda](https://help.openai.com/en/articles/8912793-c2pa-in-chatgpt-images) (nenačteno), [c2paviewer](https://c2paviewer.com/articles/ai-tools-c2pa-support) (sekundární) |
| 5b | C2PA: nástroj na čtení | POTVRZENO | `c2patool` je CLI od Content Authenticity Initiative. Poslední verze v0.28.4 vyšla 26. 10. 2026. Instalace: hotové binárky pro macOS, Windows a Linux ze stránky Releases (jdou stáhnout do `.tools/`, což sedí s D6), případně Homebrew. `c2patool soubor` vypíše manifest jako JSON. Licence MIT / Apache 2.0. Existuje i C API (`c2pa_c_ffi` v c2pa-rs) a vazba c2pa-c, obojí nad knihovnou v Rustu. | [c2patool](https://github.com/contentauth/c2patool), [usage.md](https://github.com/contentauth/c2patool/blob/main/docs/usage.md), [c2pa-rs](https://github.com/contentauth/c2pa-rs), [c2pa-c](https://github.com/contentauth/c2pa-c) (primární) |
| 6 | EU AI Act, čl. 50 | POTVRZENO: žádná přímá povinnost pro náš případ | Čl. 50 platí od 2. 8. 2026. Odst. 2 (strojově čitelné značení) míří na poskytovatele generativních systémů, tedy na OpenAI, ElevenLabs a podobné. Starší systémy mají čas do 2. 12. 2026. Odst. 4 ukládá nasazovateli označit jen deepfaky a texty o věcech veřejného zájmu. Pokyny Komise výslovně říkají, že "AI-generated fictitious environments (e.g. fictitious forests and castles) in video games" deepfake nejsou. Zdrojový kód je mimo rozsah odst. 2. | [Pokyny Komise k čl. 50](https://digital-strategy.ec.europa.eu/en/library/guidelines-transparency-obligations-providers-and-deployers-ai-systems) ([PDF EN](https://ec.europa.eu/newsroom/dae/redirection/document/131215), body 68, 88, 153 a příklady u bodu 116), [čl. 50](https://artificialintelligenceact.eu/article/50/) |
| 7 | Licence knihoven | POTVRZENO | Všechny licence sedí s plánem. Nic není copyleft. Podrobně v tabulce níže. Povinnosti: přiložit texty licencí MIT, BSD, Apache a HarfBuzz a uvést větu o FreeType. | Soubory LICENSE v repozitářích, odkazy níže |
| 8 | Screenshoty cizích her jako interní reference | NEJISTÉ | Je to běžná praxe, ale žádný primární zdroj ji výslovně nedovoluje. Pravidla Rockstaru a Blizzardu řeší jen veřejné nekomerční fanouškovské použití, ne interní použití jiným studiem. Poskytovatelé AI chtějí, aby měl zákazník práva ke vstupům. | [Rockstar policy](https://support.rockstargames.com/articles/200153756/Policy-on-posting-copyrighted-Rockstar-Games-material), [Blizzard Video Policy](https://www.blizzard.com/en-us/legal/dd76b654-f2c4-4aaa-ba49-ca3122de2376/blizzard-video-policy) (obojí jen z úryvků vyhledávání), [Anthropic Commercial Terms, L.1](https://www.anthropic.com/legal/commercial-terms) (primární) |

## Podrobnosti k bodům

### 1. Steam

- Přesná věta ze Steamworks: "We are aware that many modern game development environments have AI powered tools built into them. Efficiency gains through the use of these tools is not the focus of this section." Zdroj: [Content Survey](https://partner.steamgames.com/doc/gettingstarted/contentsurvey).
- Pre-Generated je obsah, který "ships with your game and is consumed by players". Live-Generated je obsah vytvořený "while the game is running". Zdroj tamtéž.
- Valve nechce Live-Generated sexuální obsah jen pro dospělé. Nás se to netýká. Zdroj tamtéž.
- Ze sekundárních zdrojů: popis použití AI se ukazuje zákazníkům na stránce hry a formulář se má týkat i marketingových materiálů v obchodě. U Live-Generated mohou hráči hlásit obsah přes overlay. Zdroj: [GamingOnLinux](https://gamingonlinux.com/2026/01/valve-tweak-steam-ai-disclosure-form-for-developers-to-clarify-its-for-content-consumed-by-players). Na stránce Steamworks to dnes výslovně není.
- Původní oznámení Valve z ledna 2024 má název "AI Content on Steam". Text se mi nepodařilo strojově načíst, potvrdil jsem jen název. Odkaz: [Steam News](https://store.steampowered.com/news/group/4145017/view/3862463747997849618).

### 2. ElevenLabs

- Terms of Use, §1(c): free uživatelé smějí službu používat jen nekomerčně. Stránka [Commercial Sound Effects](https://elevenlabs.io/sound-effects/commercial) ale říká: "For commercial sound effects, our free plan requires attribution to elevenlabs.io." Ty dva texty si odporují. Bezpečné je generovat jen na placeném tarifu.
- Pokud hra přestane splňovat podmínky nebo předplatné skončí: podmínky neříkají, co se stane s právy ke zvukům vygenerovaným během předplatného. Stránku nápovědy, která to řeší, jsem nenačetl (HTTP 403): [help.elevenlabs.io](https://help.elevenlabs.io/hc/en-us/articles/13313564601361-Can-I-publish-the-content-I-generate-on-the-platform).
- Délka zvuku je nejvýš 30 sekund. WAV 48 kHz je jen pro nesmyčkové efekty. Cena je 40 kreditů za sekundu při zadané délce. Zdroj: [SFX dokumentace](https://elevenlabs.io/docs/overview/capabilities/sound-effects).
- Dokumentace doporučuje nastavit `model_id` výslovně a oba modely si vyzkoušet na vlastních promptech. Zdroj: [přehled modelů](https://elevenlabs.io/docs/overview/models).

### 3. AI hudba

- Tiskové zprávy UMG a Warner jsem nenačetl (weby nejdou stáhnout). Data dohod mám jen ze sekundárních zdrojů.
- Suno v září 2026 přiznalo, že k tréninku stahovalo zvuk z YouTube nástrojem yt-dlp, a hájí se fair use. Zdroj: [Wikipedia: Suno](https://en.wikipedia.org/wiki/Suno_(platform)) (sekundární).
- Suno od 3. 9. 2026 omezuje počet stažení skladeb za měsíc. Zdroj tamtéž.
- Nový poznatek: ElevenLabs má vlastní hudební službu s podmínkami pro hry. "Indie Games" (tržby hry pod 500 000 USD a tržby vývojáře pod 1 mil. USD ročně) jsou z výluky pro "Studio Games" vyňaté. Po překročení hranice je 60 dní na přechod na vyšší tarif. Zdroj: [Eleven Music Terms](https://elevenlabs.io/music-terms) (primární, verze z 9. 10. 2026). Podmínky neříkají, na čem byl model trénovaný.
- K tomu platí bod 4: čistě AI hudba by nebyla autorsky chráněná.

### 4. Autorské právo

- Zpráva Copyright Office doslova: "Copyright does not extend to purely AI-generated material, or material where there is insufficient human control over the expressive elements." A dále: "prompts do not alone provide sufficient control." Zdroj: [Part 2, s. iii](https://www.copyright.gov/ai/Copyright-and-Artificial-Intelligence-Part-2-Copyrightability-Report.pdf).
- Pražský rozsudek, bod 12: obrázek vytvořený AI "nepředstavuje autorské dílo podle § 2 AZ", protože nejde o "jedinečný výsledek tvůrčí činnosti fyzické osoby". Zadání je "námět díla či eventuálně myšlenka". Zdroj: [10 C 13/2023-16](https://msp.gov.cz/documents/14569/1865919/10C_13_2023_10). Pozor: soud žalobu zamítl hlavně proto, že žalobce neprokázal, že obrázek vznikl z jeho zadání. Věta o autorském díle je řečena "nad rámec".
- Co to znamená pro nás, je můj úsudek, ne ověřený fakt. Kód napsaný AI i grafika z něj mají nejistou ochranu. Chráněný může být lidský podíl: návrh, výběr z variant, ladění parametrů, uspořádání celku a ruční úpravy. Případ "člověk kurátoruje parametry generátoru, který napsala AI" žádný úřad ani soud výslovně neřešil.
- Slabá ochrana nebrání hru prodávat. Znamená jen, že by bylo těžší zakázat jiným, aby jednotlivé textury nebo zvuky převzali.
- Americký úřad chce při registraci díla uvést AI materiál, pokud je víc než nepatrný. Zdroj: [pokyny z března 2023](https://www.copyright.gov/ai/ai_policy_guidance.pdf) (dnes jsem je znovu nečetl).

### 5. C2PA

- Manifest FLUX obsahuje: označení "AI generative", podpis BFL, čas vzniku, název a verzi modelu a hash obrazových dat. Neobsahuje prompt ani seed. Zdroj: [BFL nápověda](https://help.bfl.ai/articles/3705384267-c2pa-in-flux-generated-images).
- C2PA tedy nenahradí naši vlastní provenanci. Prompt, seed a licenci si musíme zapsat sami.
- Metadata se ztratí při převodu formátu, ořezu nebo novém uložení. Proto je potřeba uchovat původní soubor beze změny.
- `c2patool` bez dalších voleb vypíše JSON manifest na standardní výstup. Volba `-d` dá podrobný výpis, `--info` krátký. Zdroj: [usage.md](https://github.com/contentauth/c2patool/blob/main/docs/usage.md).

### 6. EU AI Act

- Pokyny, bod 153: čl. 50 platí od 2. 8. 2026. Novela ("AI Omnibus") dává poskytovatelům starších generativních systémů čas do 2. 12. 2026, a to jen pro značení podle odst. 2. Zdroj: [PDF pokynů](https://ec.europa.eu/newsroom/dae/redirection/document/131215).
- Pokyny, bod 154: obsah vygenerovaný před 2. 8. 2026 se zpětně značit nemusí.
- Pokyny, bod 88: obsah generovaný v reálném čase ve hrách může mít výjimku ze značení, pokud hráč ví, že jde o AI. To by bylo důležité, jen kdyby hra volala AI za běhu.
- Příklady, které deepfake nejsou: AI hlas pro smyšlené postavy ve hrách a smyšlená prostředí ve hrách. Deepfake by byla realistická podoba skutečné osoby nebo místa, která vypadá pravě.
- Soubor, který jsem dnes stáhl, má datum 5. 11. 2026 a značku C(2026) 7702 final. Stránka Komise uvádí přijetí 20. 7. 2026 a aktualizaci 5. 11. 2026. Právní kanceláře citují verzi C(2026) 5054 z července. Co se mezi verzemi změnilo, jsem neporovnával.
- Text novely (nařízení (EU) 2026/1744) jsem na EUR-Lex nenačetl. Číslo nařízení mám jen ze sekundárních zdrojů.

### 7. Licence knihoven

| Knihovna | Licence (ověřeno v repu) | Povinnost při šíření binárky | Odkaz |
|----------|--------------------------|------------------------------|-------|
| SDL3 | zlib | Žádná. Poděkování je dobrovolné. | [LICENSE.txt](https://github.com/libsdl-org/SDL/blob/main/LICENSE.txt) |
| SDL_ttf | zlib | Žádná za SDL_ttf. Táhne s sebou FreeType, HarfBuzz, PlutoSVG a PlutoVG. | [LICENSE.txt](https://github.com/libsdl-org/SDL_ttf/blob/main/LICENSE.txt), [README](https://github.com/libsdl-org/SDL_ttf/blob/main/README.md) |
| FreeType | FTL nebo GPLv2, volí se jedna | Zvolit FTL. V dokumentaci hry musí být věta, že software je zčásti založen na práci FreeType Team. Jméno FreeType se nesmí použít v reklamě bez svolení. | [LICENSE.TXT](https://github.com/freetype/freetype/blob/master/LICENSE.TXT), [FTL.TXT](https://github.com/freetype/freetype/blob/master/docs/FTL.TXT) |
| HarfBuzz | "Old MIT" | Copyright a text licence ve všech kopiích. Prakticky: přiložit text. | [COPYING](https://github.com/harfbuzz/harfbuzz/blob/main/COPYING) |
| PlutoSVG, PlutoVG | MIT | Přiložit text licence. Jde to vypnout volbou `SDLTTF_PLUTOSVG`. | [LICENSE](https://github.com/sammycage/plutosvg/blob/master/LICENSE) |
| Jolt Physics | MIT | Přiložit text licence. | [LICENSE](https://github.com/jrouwe/JoltPhysics/blob/master/LICENSE) |
| miniaudio | Public domain nebo MIT No Attribution | Žádná. | [LICENSE](https://github.com/mackron/miniaudio/blob/master/LICENSE) |
| Dear ImGui | MIT | Přiložit text licence, pokud je v dodané hře. | [LICENSE.txt](https://github.com/ocornut/imgui/blob/master/LICENSE.txt) |
| Clay | zlib | Žádná. | [LICENSE.md](https://github.com/nicbarker/clay/blob/main/LICENSE.md) |
| meshoptimizer | MIT | Přiložit text licence. | [LICENSE.md](https://github.com/zeux/meshoptimizer/blob/master/LICENSE.md) |
| Tracy | BSD 3-Clause | Pokud je klient v dodané binárce: text licence v dokumentaci a zákaz používat jméno k propagaci. | [LICENSE](https://github.com/wolfpld/tracy/blob/master/LICENSE) |
| libebur128 | MIT | Přiložit text licence. | [COPYING](https://github.com/jiixyj/libebur128/blob/master/COPYING) |
| FSR1 | MIT (AMD) | Přiložit text licence. | [license.txt](https://github.com/GPUOpen-Effects/FidelityFX-FSR/blob/master/license.txt) |
| Manifold | Apache 2.0 | Přiložit text licence a případný soubor NOTICE, označit vlastní úpravy. Platí jen, když se knihovna šíří s hrou. | [LICENSE](https://github.com/elalish/manifold/blob/master/LICENSE) |

Poznámky:

- Pro uzavřenou komerční hru není nic z toho problém. Jediná past je FreeType: nesmí se zvolit varianta GPLv2.
- Jolt, Dear ImGui, Tracy a Manifold jsou v C++. Engine v C17 potřebuje C obálky. Obálky třetích stran mají vlastní licence, například [JoltC](https://github.com/amerkoleci/joltc/blob/main/LICENSE) a [cimgui](https://github.com/cimgui/cimgui/blob/docking_inter/LICENSE) jsou MIT.
- Tracy v sobě nese další kód (libbacktrace). Nejjednodušší je klienta do vydané verze vůbec nepřekládat.
- Fonty mají vlastní licence. Ty jsem neověřoval, protože plán žádný konkrétní font neuvádí.

### 8. Screenshoty cizích her

- Že je to běžné, tvrdí jen fóra a blogy (sekundární): například [gamedev.net](https://gamedev.net/forums/topic/679269-mock-ups-and-copyright/?page=2). Shoda komunity: inspirace je v pořádku, překreslení skoro pixel po pixelu je riziko.
- Rockstar dovoluje fanouškům sdílet záběry nekomerčně a vyhrazuje si právo obsah kdykoli stáhnout. O interním použití jiným studiem ani o AI pravidla nemluví. Totéž Blizzard. Obě stránky se mi nepodařilo načíst celé.
- Rizika, jak je vidím:
  - Uložení screenshotu je kopie cizího díla. Dokud zůstane interní, je riziko malé, ale výslovné svolení nemáme.
  - Repozitář, i privátní, se může časem otevřít nebo sdílet. Pak by šlo o šíření.
  - Poslat obrázek AI službě znamená předat ho třetí straně. Anthropic chce záruku, že zákazník má "all rights and permissions required to submit Inputs". U jiných dodavatelů jsem podmínky nečetl.
  - Hlavní riziko není reference sama, ale výsledek. Styl chráněný není. Konkrétní postavy, loga, mapy a rozpoznatelné modely ano.
  - Když hodnotitel tlačí vzhled k "vypadá to jako GTA III", roste šance, že výsledek bude originálu příliš podobný.

## Dopady na plán

1. **Report pro Steam.** Provenance musí pokrýt všechno, co hráč vidí a slyší: textury z AI obrázků a zvuky z ElevenLabs. Vše spadá pod Pre-Generated. Live-Generated se nás netýká, dokud hra nevolá AI za běhu. Do reportu je dobré zahrnout i grafiku pro stránku v obchodě.
2. **Kód psaný AI v reportu.** Formulář to nevyžaduje jasně, ale ani nevylučuje. Doporučuji mít připravenou jednu poctivou větu o tom, že grafiku kreslí kód napsaný s pomocí AI. Rozhodnutí je na vlastníkovi (otázka 1).
3. **ElevenLabs: placený tarif při generování.** Do provenance přidat: tarif, datum, `model_id`, prompt, délku, `prompt_influence`, verzi podmínek (9. 10. 2026). Pole "seed" u zvuku nedává smysl, API ho nemá.
4. **ElevenLabs: zvuk je jednorázový artefakt.** Výstup nejde zopakovat a model v2 končí 1. 3. 2027. Vygenerovaný soubor v repu je tedy jediný zdroj pravdy. Nové zvuky generovat rovnou modelem v3, nebo počítat s tím, že pozdější zvuky budou znít jinak.
5. **ElevenLabs: zvuky nesmí být dostupné samostatně.** Podmínky zakazují šířit výstup jako izolované soubory. Můj úsudek: ve hře je bezpečnější mít zvuky zabalené v archivu než jako volné WAV soubory. A nesmí skončit ve veřejném repozitáři.
6. **Hudba.** Rozhodnutí "hudba z AI ne" zůstává. Nic ho nevyvrací.
7. **Autorské právo.** Provenance by měla zapisovat i lidský podíl: kdo vybral variantu, co se ručně upravilo, jaké parametry člověk ladil. To je jediná část, kterou lze chránit. Na ochranu syrových výstupů AI nespoléhat.
8. **C2PA.** Při uložení AI obrázku: nechat původní soubor beze změny, spočítat hash, spustit `c2patool` a JSON uložit vedle. Pole v provenanci: "C2PA přítomno / chybí / stav ověření". Chybějící C2PA nesmí být chyba. Vlastní parser v C nepsat, CLI stačí. Kvůli D6 binárku `c2patool` stáhnout do `.tools/`, neinstalovat do systému.
9. **EU AI Act.** Teď žádná práce. Znovu ověřit, pokud hra začne generovat obsah za běhu nebo zobrazí realisticky skutečné osoby či místa.
10. **Licence.** Založit soubor s texty licencí třetích stran a obrazovku "Credits / Licenses" ve hře. Přidat větu o FreeType. Při sestavení zvolit FTL. Tracy do vydané verze nepřekládat.
11. **Referenční screenshoty.** Držet mimo repozitář. Nikdy je nedávat do hry, do marketingu ani do veřejných srovnání. Porovnávat obecné vlastnosti (paleta, hustota detailu, čitelnost siluet), ne konkrétní objekty. Nezadávat AI úkol "udělej to stejné".
12. **Druhý hodnotitel od jiného dodavatele.** Vlastní rendery jsou náš obsah, právní překážku jsem nenašel. Podmínky konkrétního levného dodavatele jsem ale neověřoval, protože plán žádného nejmenuje. Před výběrem zkontrolovat, jestli dodavatel trénuje na vstupech. Pokud by se hodnotiteli posílaly i cizí screenshoty, platí bod 11.

## Otázky pro vlastníka

1. **Uvedeme na Steamu i to, že grafiku kreslí kód napsaný AI?** Formulář to jasně nevyžaduje. Otevřené přiznání je bezpečnější vůči Valve i hráčům, ale hra dostane štítek "AI" i za procedurální grafiku.
2. **Který tarif ElevenLabs a jak dlouho ho držet?** Nevíme, co se stane s právy po zrušení předplatného. Možnosti: držet předplatné aktivní aspoň do vydání, nebo si nechat od ElevenLabs písemně potvrdit, že práva zůstávají.
3. **Model v3 hned, nebo ještě v2?** Model v2 končí 1. 3. 2027. Pokud má sada zvuků znít jednotně, je lepší začít rovnou na v3.
4. **Bude repozitář enginu někdy veřejný?** Pokud ano, zvuky z ElevenLabs v něm být nesmí a musí žít jinde.
5. **Smí se cizí screenshoty posílat AI službám třetích stran?** Bezpečnější varianta je porovnávat je jen lokálně, nebo posílat jen vlastní rendery a referenci popsat slovy a čísly.
6. **Vadí slabá autorská ochrana AI assetů?** Pokud ano, je potřeba zvýšit lidský podíl (ruční úpravy, vlastní výběr a uspořádání) a zapisovat ho. Pokud ne, plán se nemění.

## Co se nepodařilo ověřit

- Text oznámení Valve "AI Content on Steam" z roku 2024 (stránka se načte bez obsahu). Potvrzen jen název.
- Jestli se popis AI ukazuje na stránce hry a jestli se formulář týká i marketingu. Mám to jen ze sekundárních zdrojů.
- Nápověda OpenAI k C2PA a nápověda Adobe k Content Credentials (HTTP 403). Průvodce OpenAI ke generování obrázků o C2PA mlčí: [developers.openai.com](https://developers.openai.com/api/docs/guides/image-generation).
- Jestli Gemini API vrací C2PA, nebo jen SynthID.
- Tiskové zprávy UMG a Warner k dohodám se Suno a Udio.
- Nařízení (EU) 2026/1744 na EUR-Lex (stránka se načte prázdná).
- Plné texty pravidel Rockstaru a Blizzardu (časový limit).
- Na čem ElevenLabs trénoval model pro zvukové efekty. Dokumentace ani podmínky to neuvádějí.
- Podmínky "levného modelu jiného dodavatele" pro druhého hodnotitele. Plán žádného nejmenuje.
