# Ověření plánu proti zdrojům na webu (2026-11-06)

Pět rešeršérů prověřilo místa, na kterých plán stojí, proti dokumentaci, zdrojovým kódům a článkům. Podrobné poznámky s odkazy jsou v [research/notes/Ověření plánu/](research/notes/Ověření%20plánu/).

**Závěr:** žádné rozhodnutí nepadlo. Jedno zdůvodnění bylo mylné (Jolt a determinismus), herní UI a strategie potřebují víc práce, než plán čekal, a kompilátor shaderů je první technické riziko. Opravy jsou zapracované v [ROADMAP.md](ROADMAP.md) a [CONVENTIONS.md](CONVENTIONS.md) a zapsané jako D74.

Nic se nestavělo ani neměřilo. „Potvrzeno“ znamená shodu s dokumentací a zdroji, ne s vlastním pokusem.

## Otázky pro vlastníka

Žádná z nich neblokuje M0. U každé je doporučení.

| # | Otázka | Doporučení | Proč |
|---|---|---|---|
| 1 | **macOS v hostovaném CI.** Noční běh na macOS by stál asi 18,60 USD měsíčně. Celý volný objem GitHubu je 12 USD. Platit, nebo ho vynechat? | **Vynechat.** Mac se testuje lokálně skriptem před každým merge, hostovaně běží jen Linux a Windows. | MacBook je vývojový stroj, takže testy na něm běží tak jako tak. Mění to D33. |
| 2 | **Podmínky a efekty zapsané v datech.** Hra typu Stellaris má tisíce událostí typu „když platí X, stane se Y“. Smí je herní data skládat z hotových dílů, které jsou naprogramované v C? | **Ano.** Není to skriptovací jazyk, logika zůstává v C. Engine z toho umí vyrobit tooltip a událost bezpečně uložit. | Bez toho by se každá událost psala ručně v C. Zpřesňuje to D45. |
| 3 | **Screenshoty GTA III a WoW a AI služby.** Smí se referenční záběry posílat AI modelům k porovnání? | **Neposílat jiným službám.** Zůstanou lokálně mimo repo, vedle renderu je posuzuješ ty. Druhý hodnotitel od jiného dodavatele dostane jen naše rendery. | Je to cizí chráněný obsah a poskytovatelé AI si berou práva ke vstupům. |

### Co rozhodneš později

| Kdy | Otázka |
|---|---|
| U brány M2 | Vyhlazování hran: ostrý obraz (MSAA a prostorový upscale) je výchozí. Měkčí varianta (TAAU) občas nechává duchy za pohybem. Uvidíš na obraze. |
| U brány M2 a M8 | Jestli stačí stovky skutečných světel v záběru a vzdálená jen jako svítící body. |
| Před M3d | Tarif ElevenLabs. Komerční licence začíná tarifem Starter (6 USD měsíčně). Nevíme, co se stane s právy po zrušení předplatného. |
| Při návrhu strategie | Nejvyšší rychlost času, věrnost dopravy z výšky a měřítko velké strategie. |
| Před prvním vydáním | Apple Developer Program (bez něj nejde hru pro Mac notarizovat). Text o AI obsahu pro Steam. |

## Co se potvrdilo

| Oblast | Zjištění |
|---|---|
| Mac bez Xcode (D35) | Stačí Command Line Tools. Mají SDK pro SDL3 a Metal, `lldb`, sanitizery, `notarytool` i `stapler`. SDL_GPU bere shadery jako text MSL a překládá je za běhu. |
| Měření bez Xcode | Validace Metalu a Metal HUD s logem času GPU po snímcích jsou součást systému. Tracy má hotovou binárku pro macOS arm64. |
| Clang na Windows (D26) | C11 atomics v MSVC jsou stále experimentální. SDL3 i Jolt se v jejich CI staví s clang-cl. |
| Pravidla determinismu (D28) | Stejná pravidla používá Box2D v3, Rapier i Jolt. |
| joltc (D42) | Udržovaný, licence MIT. Má vozidla, ragdoll s motory, dvojitou přesnost i volbu determinismu. |
| Forward+ (D27) | Odpovídá doporučení Applu pro jejich GPU. |
| Limity SDL_GPU (D5) | Platí i ve verzi 3.4.20: bez bindless, multi-draw na Metalu je smyčka, dotazy na čas chybí. |
| Studio (D57) | Dear ImGui má udržovaný backend pro SDL_GPU. |
| Strategie (D44, D46–D48) | Stejný recept má Cities: Skylines, Factorio i Unreal Engine 5 (Mass vedle herních objektů). 100 000 entit při 60 fps je reálných. |
| AI obsah na Steamu | Hlásí se obsah, který hráč vidí a slyší. Nástroje pro vývoj cílem nejsou. |
| ElevenLabs (D58, D59) | Podmínky výslovně dovolují použití ve hrách. |
| AI hudba (D58, D60) | Spory vydavatelů se Suno běží dál, opatrnost je namístě. |
| Licence knihoven | Všechny sedí, žádná není copyleft. |

## Co bylo jinak a jak je to opravené

| # | Zjištění | Oprava v plánu |
|---|---|---|
| 1 | **Jolt umí bitově shodnou simulaci mezi OS.** Stojí to asi 8 % výkonu a Jolt si to hlídá ve vlastním CI na macOS, Linuxu i Windows. Zdůvodnění D28 bylo mylné. Neověřená je jen naše kombinace: clang-cl, vozidla a joltc. | Jolt se od začátku staví s touto volbou. Úroveň B se dělí na B1 (fyzika, cíl 3 OS) a B2 (animace, zvuk). Brána M4 zůstává „stejná platforma“ a měření 27 rozhodne, jestli se zvedne. |
| 2 | **joltc neumí uložit a obnovit stav fyziky.** Save se stavem simulace (D40) to potřebuje. | Uložení stavu dopíšeme ve vlastním adaptéru (M4b). |
| 3 | **Kompilátor shaderů je první riziko.** SDL_shadercross nemá žádné vydání, Microsoft nevydává DXC pro macOS a build ze zdrojů jen s Command Line Tools nikdo nepotvrdil. Slang na Macu neumí DXIL. | První úkol fáze M1c. DXIL smí vznikat v CI místo na Macu. |
| 4 | **Na Macu nepůjde čas GPU po jednotlivých passech** a nepůjde prohlížet zachycený snímek. SDL_GPU dotazy nemá, mají přijít ve verzi 3.6. | Vlastní ladicí pohledy v enginu (M2), rozpočty v počtech, čas celého snímku z Metal HUD. |
| 5 | **Clay je jen rozvržení.** Nemá kreslení přes SDL_GPU, textový vstup ani tabulky. Jeho vývoj od května 2026 stojí. | `eng_ui` má v rozsahu vlastní kreslení, textový vstup a tabulku (M4c, M6). Clay a SDL_ttf jsou připnuté na commit. |
| 6 | **„Bez depth prepassu“ platí jen na GPU Apple.** | Na Vulkanu a D3D12 je prepass volitelný přepínač (M2). |
| 7 | **Enginy mají strop 256–512 skutečných světel v záběru.** | Rozpočet stovek světel, vzdálená jako svítící body (M2). |
| 8 | **Na hru typu Stellaris nestačí tabulky dat.** Chybí podmínky a efekty, fronta událostí a modifikátory. | Otázka 2 výše. Zbytek prověří rešerše UI a datově řízeného obsahu (D71). |
| 9 | **Strategie potřebuje víc než „přegenerovat buňku“.** Silniční síť je globální model, nejtěžší jsou křižovatky. Chybělo uspávání entit, služba hledání cest a pravidlo pro paralelní tiky. | Doplněno do M6 včetně přísnější testovací scény. |
| 10 | **Cities: Skylines II potopilo kreslení, ne simulace.** | Scéna C hlídá i strop drawů při pohledu na celou mapu. |
| 11 | **Zvuk z ElevenLabs nejde vygenerovat znovu stejně** (API nemá seed) a model v2 končí 1. 3. 2027. Zvuky se nesmí šířit jako samostatné soubory. | Uložený soubor je jediný zdroj, generuje se modelem v3, repo zůstává privátní (CONVENTIONS). |
| 12 | **GitHub účtuje v dolarech, ne v násobcích minut.** `macos-latest` už znamená macOS 26. | Otázka 1 výše. V CI se píše `macos-15`. |
| 13 | **Autorské právo chrání jen lidský podíl,** ne čistý výstup AI. | Provenance zapisuje i lidský podíl: výběr a ruční úpravy. |

## Co se nepodařilo ověřit

- Build SDL_shadercross s DXC jen s Command Line Tools a jeho čas. Ověří úkol M1c.
- Cena drawu na Metalu, cena MSAA 4× a počet světel na Apple Silicon. Žádné veřejné měření neexistuje, rozhodnou měření 1 a 2.
- Determinismus Joltu přes clang-cl, u vozidel a přes joltc. Rozhodne měření 27.
- D3D12 přes WARP na hostovaném Windows runneru.
- Vnitřek enginu Paradoxu: jejich fórum blokuje automatické čtení, zdroje jsou jen druhotné.
- Jestli Steam chce hlásit i grafiku, kterou kreslí kód napsaný AI. Formulář o kódu mlčí.
- Práva ke zvukům z ElevenLabs po zrušení předplatného.
