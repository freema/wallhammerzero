# Ověření plánu: determinismus, Jolt, joltc a překladač

Datum rešerše: 2026-11-06. Týká se D26, D28, D42 a měření 27 v ROADMAP.

Značení zdrojů: **[P]** primární (dokumentace, zdrojový kód, CI, blog autora). **[S]** sekundární (wiki, fórum, výsledek vyhledávání, který jsem neotevřel přímo).

## Závěr

Tvrzení „deterministický Jolt napříč OS je neověřený a drahý“ **neplatí v té podobě, jak je v D28 zapsané**. Jolt má oficiální volbu `CROSS_PLATFORM_DETERMINISTIC`. Stojí podle dokumentace asi 8 % výkonu. Jeho CI při každém buildu ověřuje stejný hash simulace na macOS ARM64, Linux x64 a Windows x64, a to ve vícevláknovém běhu. Neověřené zůstávají tři věci, které se týkají přímo nás: build přes clang-cl, vozidla a cesta přes joltc. Žádná z nich v tom CI není. Wrapper joltc je živý (poslední commit 2026-10-15, Jolt 5.6.0, MIT) a pokrývá vozidla, ragdoll s motory, charactery i dvojitou přesnost. Chybí mu ale uložení a obnova stavu fyziky (`StateRecorder`). Pravidla úrovně A (`-ffp-contract=off`, bez libm, bez fast-math) odpovídají tomu, co dělá Box2D v3, Rapier i Jolt. Je k nim potřeba přidat několik dalších zákazů. Důvod pro clang-cl (D26) trvá: C11 atomics jsou v MSVC pořád experimentální. Dvě úrovně bych nerušil, ale úroveň B bych rozdělil a fyziku bych od začátku stavěl s cross-platform volbou.

## Tabulka

| # | Bod | Stav | Co přesně platí | Odkaz |
|---|---|---|---|---|
| 1 | Jolt je deterministický napříč OS, ARM64/x64 a překladači | **POTVRZENO** (tím je důvod pro úroveň B z velké části **VYVRÁCEN**) | Volba `CROSS_PLATFORM_DETERMINISTIC`, asi −8 % výkonu. CI porovnává hash na 14 konfiguracích včetně macOS ARM64, Linux x64, Windows x64. Autor sám píše, že je to „méně testované než jiné funkce“. | [P] https://jrouwe.github.io/JoltPhysics/index.html#deterministic-simulation |
| 1b | Platí to i pro clang-cl, vozidla a build přes joltc | **NEJISTÉ** | V determinism CI je na Windows jen MSVC `cl`. Testované scény jsou ConvexVsMesh, HighSpeed, Ragdoll, Pyramid, CharacterVirtual. Vozidlo mezi nimi není. | [P] https://github.com/jrouwe/JoltPhysics/blob/master/.github/workflows/determinism_check.yml |
| 2 | joltc je aktuální a udržovaný | **POTVRZENO** | amerkoleci/joltc, MIT, 219 hvězd, poslední commit 2026-10-15, sleduje Jolt v5.6.0 (vydán 2026-07-11). | [P] https://github.com/amerkoleci/joltc |
| 2b | joltc pokrývá vozidla, ragdoll s motory, character, double, volbu determinismu | **POTVRZENO**, s jednou dírou | Vše jmenované v hlavičce je. **Chybí `StateRecorder` / `SaveState` / `RestoreState`.** | [P] https://github.com/amerkoleci/joltc/blob/main/include/joltc.h |
| 3 | Stačí `-ffp-contract=off` a vyhnout se libm | **POTVRZENO zčásti** | Je to nutný základ, ne celý seznam. Chybí: stejný stav FPU na všech vláknech, zákaz UB převodů float→int, NaN, vlastní řazení a hash. Viz níže. | [P] https://box2d.org/posts/2024/08/determinism/ |
| 4a | `<stdatomic.h>` a `_Atomic` v clang-cl | **POTVRZENO na úrovni zdrojáku**, test na stroji chybí | Clang v režimu C na MSVC záměrně použije vlastní `stdatomic.h`, ne hlavičku MSVC. | [P] https://github.com/llvm/llvm-project/blob/main/clang/lib/Headers/stdatomic.h |
| 4b | `<threads.h>` v clang-cl | **NEJISTÉ** | MSVC ji má od VS 2022 17.8, implementace je v `vcruntime140_threads.dll`. Zdroj, že to funguje s clang-cl, jsem nenašel. | [P] https://devblogs.microsoft.com/cppblog/c11-threads-in-visual-studio-2022-version-17-8-preview-2/ |
| 4c | C11 atomics v MSVC jsou stále experimentální | **POTVRZENO** | Stránka shody MSVC (aktualizace 2026-10-16): „Atomic support `<stdatomic.h>`: experimental“, jen pod `/experimental:c11atomics`. | [P] https://learn.microsoft.com/en-us/cpp/overview/visual-cpp-language-conformance |
| 4d | SDL3 a Jolt se staví s clang-cl | **POTVRZENO** pro SDL3 a Jolt, **NEJISTÉ** pro joltc | SDL má v CI úlohy „Windows (MSVC, clang-cl x64/x86)“. Jolt má úlohu „Visual Studio Clang“ s unit testy. joltc staví ve svém CI na Windows jen generátorem Visual Studio. | [P] https://github.com/libsdl-org/SDL/blob/main/.github/workflows/create-test-plan.py |
| 5 | Logika strategie v celých číslech a fixed-pointu je rozumná | **POTVRZENO** jako rozumná volba | Factorio jede lockstep na floatech s vlastní trigonometrií a hraje ARM proti x86. Fixed-point je opatrnější cesta. Vnitřek enginu Paradoxu se nepodařilo ověřit z primárního zdroje. | [P] https://www.factorio.com/blog/post/fff-370 |
| 6 | Bitově shodný replay s fyzikou je běžná praxe, Jolt je deterministický i vícevláknově | **POTVRZENO** | Jolt, Box2D v3 a Rapier to deklarují a testují. CI Joltu běží s `-t=max` (všechna vlákna stroje) a čeká stejný hash. Pořadí callbacků z vláken ale deterministické není. | [P] https://github.com/jrouwe/JoltPhysics/blob/master/Docs/Architecture.md |

## Podrobnosti k bodům

### 1. Jolt a determinismus napříč platformami

- Základní záruka: simulace je deterministická, když se API volá ve stejném pořadí a běží stejný binární kód. [P] https://jrouwe.github.io/JoltPhysics/index.html#deterministic-simulation
- S volbou `CROSS_PLATFORM_DETERMINISTIC` je knihovna „přibližně o 8 % pomalejší“. Výsledek pak nezávisí na překladači (testováno MSVC 2022, clang, gcc, emscripten), konfiguraci (Debug, Release, Distribution), OS (Windows, macOS, Linux), architektuře (x86, ARM, RISC-V, PowerPC, LoongArch) ani na 32/64 bitech. [P] tamtéž
- Podmínky: stejný zdrojový kód na všech platformách a stejné definice. Nejde míchat build s `JPH_DOUBLE_PRECISION` a bez. [P] tamtéž
- Volba vypíná FMA. V kódu: „FMA is not compatible with cross platform determinism“. V CMake přidá `-ffp-contract=off`, u MSVC `/fp:precise`. [P] https://github.com/jrouwe/JoltPhysics/blob/master/Jolt/Core/Core.h a https://github.com/jrouwe/JoltPhysics/blob/master/Build/CMakeLists.txt
- CI „Determinism Check“ běží při každém pushi a PR. Pouští `PerformanceTest -t=max -validate_hash=…` se stejným očekávaným hashem na všech strojích. Úlohy: Linux clang, Linux clang double, Linux clang AVX512, Linux gcc, Visual Studio CL 64 a 32 bit, macOS, macOS double, ARM clang 64 a 32 bit, ARM gcc, RISC-V, PowerPC, LoongArch, WASM32, WASM64. [P] https://github.com/jrouwe/JoltPhysics/blob/master/.github/workflows/determinism_check.yml
- Dvojitá přesnost má vlastní sadu hashů a testuje se na Linuxu a macOS. V seznamu úloh **není** Windows double. [P] tamtéž
- Autor přiznává omezení: „It is quite difficult to verify cross platform determinism, so this feature is less tested than other features.“ [P] https://jrouwe.github.io/JoltPhysics/index.html#deterministic-simulation
- Historie ukazuje, že se to rozbíjí a opravuje: oprava shody ARM64 vs x64 v double přesnosti, rozdíl `std::push_heap` na macOS, rozdíl `-Vec3::sZero()` mezi NEON a SSE. [P] https://github.com/jrouwe/JoltPhysics/blob/master/Docs/ReleaseNotes.md
- Známá omezení i se zapnutou volbou [P] (dokumentace, tamtéž):
  - Dotazy do broadphase nejsou deterministické.
  - Dotazy do narrowphase vrací stejné výsledky, ale v různém pořadí.
  - Listenery (kontakty, aktivace těles, krok) se volají z více vláken. Pořadí callbacků není deterministické.
  - `PhysicsSystem::GetActiveBodies` vrací tělesa v nedeterministickém pořadí.
- Požadavky na náš kód kolem Joltu [P] (tamtéž): přesný režim floatů, vypnutá kontrakce, stejný stav FPU na všech vláknech (zaokrouhlení k nejbližšímu, shodné DAZ a FTZ), žádné standardní `sin`/`cos`, žádný `std::sort`, `std::push_heap`, `std::hash`.

**Co je pro nás neověřené:**
- **clang-cl.** V determinism CI na Windows je jen MSVC. Úloha „Visual Studio Clang“ existuje jen v běžném build CI, bez volby determinismu. [P] https://github.com/jrouwe/JoltPhysics/blob/master/.github/workflows/build.yml
- Moje čtení CMake Joltu: ve větvi pro clang-cl se při `CROSS_PLATFORM_DETERMINISTIC` nepřidává ani `/fp:precise`, ani `-ffp-contract=off`. FMA se ale nezapíná (`-mfma` se vynechá), takže ke kontrakci by dojít nemělo. Je to úsudek ze zdrojáku, ne test. [P] https://github.com/jrouwe/JoltPhysics/blob/master/Build/CMakeLists.txt a https://github.com/jrouwe/JoltPhysics/blob/master/Jolt/Jolt.cmake
- **Vozidla.** `WheeledVehicle` není mezi scénami, které CI hashuje. Brána M4 je právě replay jízdy.
- **Cena 8 %** je údaj z dokumentace. Nezávislé měření jsem nenašel.

### 2. C wrapper joltc

- amerkoleci/joltc: licence MIT, 219 hvězd, není archivovaný, poslední push 2026-10-15. Commit z 2026-07-13: „Update to official JoltPhysics v5.6.0“. [P] https://github.com/amerkoleci/joltc a https://api.github.com/repos/amerkoleci/joltc/commits
- Jolt v5.6.0 vyšel 2026-07-11, wrapper ho dohnal za dva dny. [P] https://github.com/jrouwe/JoltPhysics/releases
- README varuje, že požadavky na nové funkce autor váže na sponzoring. [P] https://github.com/amerkoleci/joltc/blob/main/README.md
- Pokrytí API podle hlavičky `include/joltc.h` (3166 řádků) [P] https://github.com/amerkoleci/joltc/blob/main/include/joltc.h :
  - Vozidla: `JPH_VehicleConstraint_*`, `JPH_WheeledVehicleController_SetDriverInput`, motor, převodovka, diferenciály, `JPH_VehicleCollisionTesterRay/CastSphere/CastCylinder`, pásová vozidla i motorky. **Je.**
  - Ragdoll: `JPH_RagdollSettings_*`, `JPH_Ragdoll_DriveToPoseUsingMotors`, `JPH_Ragdoll_DriveToPoseUsingKinematics`, skeleton, motory na SwingTwist. **Je.**
  - Character: `JPH_CharacterVirtual_*` včetně `ExtendedUpdate`, i `JPH_Character`. **Je.**
  - Dvojitá přesnost: `JPH_RVec3` a `JPH_RMat4` pod `#if defined(JPH_DOUBLE_PRECISION)`. CMake volba `DOUBLE_PRECISION` staví cíl `joltc_double`. CI joltc ho staví na Windows x64 i ARM64. **Je.**
  - Volba determinismu: CMake `option(CROSS_PLATFORM_DETERMINISTIC … OFF)`. **Je**, ale CI joltc ji netestuje. [P] https://github.com/amerkoleci/joltc/blob/main/CMakeLists.txt
  - Pro determinismus užitečné: `JPH_BodyInterface_CreateBodyWithID`, `JPH_Constraint_SetConstraintPriority`, vlastní job systém `JPH_JobSystemCallback_Create`. **Je.**
  - **Chybí:** `StateRecorder`, `SaveState`, `RestoreState`. V hlavičce ani v `joltc.cpp` není žádný výskyt. PR „Add Rollback API“ (#50) byl 2025-09-17 zavřen bez sloučení. [P] https://github.com/amerkoleci/joltc/pull/50
- Jiné C wrappery z README Joltu [P] https://github.com/jrouwe/JoltPhysics/blob/master/README.md :
  - SecondHalfGames/JoltC: Apache-2.0, 80 hvězd, push 2026-10-21. Sám o sobě píše „work in progress“, obsahuje jen to, co potřebovala jejich hra. [P] https://github.com/SecondHalfGames/JoltC
  - zig-gamedev/zphysics (JoltC uvnitř): MIT, 89 hvězd, push 2026-10-24. Určený hlavně pro Zig. [P] https://github.com/zig-gamedev/zphysics
  - ostef/JoltC: MIT, 0 hvězd, generovaný. [P] https://github.com/ostef/JoltC
- Závěr: volba joltc (D42) je správná. Pokrytí ostatních wrapperů jsem do hloubky neporovnával.

### 3. Bitová shoda floatů mezi ARM64 a x64

Co říkají ti, kdo to opravdu dělají:

- **Box2D v3 (Erin Catto, 2024).** Testuje x64 i ARM, MSVC, GCC i Clang. FMA vypíná přes `-ffp-contract=off`. Fast-math: „My advice: never use this setting.“ `atan2f` dával na platformách různé výsledky, proto má vlastní `atan2`, `sin`, `cos`. `sqrtf` považuje za bezpečný. Fixed-point odmítl jako pomalejší a s rizikem přetečení. Varuje: „Determinism is a brittle feature… Compiler versions can break it.“ [P] https://box2d.org/posts/2024/08/determinism/
- **Rapier.** Cross-platform determinismus jen s funkcí `enhanced-determinism`, na platformách, které „strictly comply to the IEEE 754-2008“, a s vlastní matematikou místo systémové. Nejde dohromady se `simd8`. S `parallel` jde. [P] https://rapier.rs/docs/user_guides/rust/determinism/
- **Jolt.** Stejný seznam: přesný režim, kontrakce vypnutá, shodný stav FPU, vlastní trigonometrie, vlastní řazení a hash. [P] https://jrouwe.github.io/JoltPhysics/index.html#deterministic-simulation
- **Factorio.** Vlastní trigonometrie stačila: „We got away with implementing our own trigonometric functions.“ První velký desync nebyl z floatů, ale ze `std::sort` u prvků, které se rovnají. [P] https://www.factorio.com/blog/post/fff-52
- **Factorio na ARM.** Rozdíl ARM vs x86 způsobilo nedefinované chování: převod `double` na celé číslo mimo rozsah dá na ARM jinou hodnotu než na x86. Hledali to porovnáním CRC stavu v každém ticku ve 2 417 testech. [P] https://www.factorio.com/blog/post/fff-370
- **Gaffer On Games.** Sbírka zkušeností. Hlavní body: x87 a 80bitová přesnost, režim zaokrouhlení, DLL, které změní stav FPU a nevrátí ho, transcendentní funkce různé mezi AMD a Intelem, optimalizace měnící hodnoty. MotoGP: replaye nešly sdílet mezi Xboxem a PC a patch s novějším překladačem rozbil staré replaye. [P] https://gafferongames.com/post/floating_point_determinism/

Co z toho plyne pro pravidla úrovně A:

| Hrozba | Stav v našem plánu | Poznámka a zdroj |
|---|---|---|
| FMA / kontrakce | pokryto (`-ffp-contract=off`) | Výchozí stav clangu je `on`. `-ffp-model=precise` kontrakci nechává zapnutou. Vypnout se musí výslovně. [P] https://clang.llvm.org/docs/UsersManual.html |
| clang-cl a `/fp:precise` | **doplnit** | `/fp:precise` se mapuje na `-ffp-model=precise`, tedy kontrakce `on`. Na Windows nestačí spoléhat na výchozí `/fp`. [S] https://github.com/llvm/llvm-project/commit/3d89323d1896fde5dc69ecb8306917718c5e3aed |
| `-ffast-math` | pokryto | Navíc linkuje `crtfastmath.o`, které přepne DAZ/FTZ pro celý proces. [P] https://clang.llvm.org/docs/UsersManual.html |
| libm | pokryto (`detmath`) | `sqrt` je podle Catta bezpečný, protože je to jedna instrukce. [P] https://box2d.org/posts/2024/08/determinism/ |
| x87 | netýká se nás | Na 64bitových cílech je výchozí vyhodnocení `source`. Problém je jen na 32bit x86. [P] https://clang.llvm.org/docs/UsersManual.html |
| Denormály a režim zaokrouhlení | **doplnit** | Stav FPU musí být stejný na všech vláknech, i těch od knihoven. [P] https://jrouwe.github.io/JoltPhysics/index.html#deterministic-simulation |
| Převod float→int mimo rozsah, další UB | **doplnit** | Viz Factorio výše. Stojí za lint a za UBSan v CI. |
| NaN | **doplnit** | Znaménko a payload NaN nejsou přenosné. Bity NaN se nesmí dostat do hashe ani do větvení. [S] (dokumentace Rustu, platí pro stejný hardware) https://doc.rust-lang.org/std/primitive.f32.html |
| Autovektorizace | bez zásahu | Bez fast-math LLVM floatové redukce nepřeskládá. [P] https://llvm.org/docs/Vectorizers.html |
| Řazení, halda, hash ze standardní knihovny | **doplnit** | `qsort` a spol. se liší mezi libc stejně jako `std::sort`. Potřeba vlastní stabilní řazení. [P] https://www.factorio.com/blog/post/fff-52 |
| SIMD intrinsiky | **doplnit** | I ručně psané SIMD se může lišit (příklad `-Vec3::sZero()` NEON vs SSE). [P] https://github.com/jrouwe/JoltPhysics/blob/master/Docs/ReleaseNotes.md |
| Verze překladače | **doplnit** | Catto i Hargreaves: nová verze překladače umí shodu rozbít. Připnout verzi clangu na všech třech OS. |

Pořadí vyhodnocení výrazů: konkrétní zdroj jsem nenašel. Bez fast-math překladač floatové výrazy přeskládat nesmí, takže riziko je malé.

### 4. clang-cl a C11/C17

- **Atomics v MSVC.** Zavedeny experimentálně ve VS 2022 17.5. Stránka shody MSVC je ke dni 2026-10-16 stále vede jako „experimental“ a „Partial… supported under `/experimental:c11atomics`“. Důvod z D26 tedy platí. [P] https://learn.microsoft.com/en-us/cpp/overview/visual-cpp-language-conformance a https://devblogs.microsoft.com/cppblog/c11-atomics-in-visual-studio-2022-version-17-5-preview-2/
- **Atomics v clang-cl.** Hlavička `stdatomic.h` v clangu má výslovnou výjimku: v režimu C na MSVC se nepoužije hlavička od Microsoftu, ale vestavěná hlavička clangu. Komentář v ní to zdůvodňuje tím, že hlavička MSVC v režimu C končí na `#error`. `_Atomic` je v clangu vlastnost jazyka. [P] https://github.com/llvm/llvm-project/blob/main/clang/lib/Headers/stdatomic.h
- Otevřené: atomické typy, které nejsou lock-free, potřebují běhovou podporu. Zda je s runtime MSVC k dispozici, jsem neověřil. Držet se typů do 8 bajtů.
- **`<threads.h>`.** V MSVC od VS 2022 17.8. Implementace je v satelitní knihovně `vcruntime140_threads.dll`, kterou je při dynamickém CRT nutné distribuovat. Mutexy se chovají jinak než pthreads (rekurzivní zamknutí volá `abort()`). O clang-cl zdroj nemluví. [P] https://devblogs.microsoft.com/cppblog/c11-threads-in-visual-studio-2022-version-17-8-preview-2/
- Doporučení: `<threads.h>` nepoužívat. SDL3 má vlastní vlákna, mutexy i atomické operace a je už závislostí. Tím odpadá i závislost na DLL.
- **SDL3.** CI projektu SDL má úlohy „Windows (MSVC, clang-cl x64)“ a „(clang-cl x86)“ s `-DCMAKE_C_COMPILER=clang-cl`. [P] https://github.com/libsdl-org/SDL/blob/main/.github/workflows/create-test-plan.py
- **Jolt.** CI má úlohu „Visual Studio Clang“: Debug, Release, Distribution, s double i bez, včetně unit testů. README uvádí „Visual Studio 2022+, Clang 16+ or GCC 12+“. [P] https://github.com/jrouwe/JoltPhysics/blob/master/.github/workflows/build.yml
- **joltc.** Jeho CI na Windows staví jen generátorem „Visual Studio 18 2026“, tedy MSVC. Build přes clang-cl nikdo veřejně netestuje. Riziko je malé (je to tenká vrstva C++ nad Joltem), ale je to náš test. [P] https://github.com/amerkoleci/joltc/blob/main/.github/workflows/build.yml

### 5. Lockstep u strategií

- **Age of Empires („1500 Archers“).** Všechny stroje běží stejnou simulaci a posílají si jen příkazy, naplánované dva tahy dopředu. Out-of-sync hledali kontrolními součty světa, objektů a hledání cest. Generátor náhody je seedovaný a kosmetická náhoda do něj nesmí sáhnout. Článek neříká nic o floatech ani fixed-pointu. [P] https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond
- **Factorio.** Lockstep. Kontrolní součet stavu každý tick, při neshodě se hráč odpojí a stáhne mapu znovu. [P] https://factorio.com/blog/post/fff-55
- Factorio používá floaty, fixed-point jen na pár místech. [S] (příspěvek vývojáře na fóru, neotevřeno přímo) https://forums.factorio.com/viewtopic.php?p=113800
- Factorio hraje ARM proti x86: Switch, Apple Silicon a od 2026 Linux ARM64. „We never experienced an ARM64 vs. x86 related desync“ díky dřívější práci na portech. [P] https://www.factorio.com/blog/post/fff-446
- **Paradox (Stellaris).** Fórum Paradoxu blokuje automatické čtení, deníky vývojářů jsem neotevřel. Co mám jen z druhé ruky:
  - Proměnné ve skriptech HoI4 jsou fixed-point: 32bitová celá část a pět desetinných míst. [S] https://hoi4.paradoxwikis.com/Data_structures
  - Desyncy jsou u Stellaris dlouhodobý problém. Vývojáři žádali hráče o logy s parametrem `-randomlog`. Technický vedoucí v deníku 170 spojuje desync s cachováním výpočtů, které proběhne na strojích v jiný okamžik. [S] https://admin-forum.paradoxplaza.com/forum/developer-diary/stellaris-dev-diary-170-performance-and-other-technical-issues.1335134
  - Tvrzení „hry Paradoxu používají fixed-point místo floatů“ mám jen z komunitních diskusí. **Neověřeno.**
- **Age of Empires II DE.** Jeden z opravených desynců: generátor náhody světa se volal během načítací obrazovky. [S] https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-145651/
- **Photon Quantum.** Komerční deterministický engine. Klienti si posílají jen vstupy, má vlastní typ `FP` (fixed-point) a vlastní deterministickou fyziku. [P] https://doc.photonengine.com/quantum/current/quantum-intro

Poučení: většina desynců nevzniká z floatů. Vzniká z pořadí (řazení, hash tabulky, vlákna), z náhody volané mimo simulaci, z cache a z nedefinovaného chování. Celá čísla a fixed-point odstraní jen jednu třídu chyb. Pravidla v CONVENTIONS §5 (pořadí, seedované proudy, nezávislost na vláknech) jsou stejně důležitá.

### 6. Záznam a bitově shodné přehrání s fyzikou

- **Jolt.** Ukázková aplikace má volbu „Check Determinism“: před každým krokem uloží stav přes `StateRecorder`, vrátí simulaci a krok zopakuje. `SaveState`/`RestoreState` slouží i pro rollback v síťové hře. [P] https://jrouwe.github.io/JoltPhysics/index.html#deterministic-simulation
- **Box2D v3.** Tři úrovně: algoritmický, vícevláknový a cross-platform determinismus. Test Falling Hinges porovnává počet kroků do uspání a hash transformací. Rollback Box2D nenabízí. [P] https://box2d.org/posts/2024/08/determinism/
- **Rapier.** Lokálně deterministický vždy. Paralelní běh dává stejné výsledky jako sekvenční. [P] https://rapier.rs/docs/user_guides/rust/determinism/
- **Trackmania.** Replaye obsahují vstupy a dají se znovu odsimulovat. Fyzika běží 100 kroků za sekundu. [S] https://donadigo.com/tmx1
- **Supreme Commander.** Lockstep na floatech IEEE 754 s pevně nastaveným stavem FPU. [P] (citace vývojářů) https://gafferongames.com/post/floating_point_determinism/

Co je k tomu potřeba:

1. **Pevný krok.** Všechny příklady výše krokují pevným časem.
2. **Stejné pořadí volání API** a **stejná ID těles**. Jolt: tělesa vytvářet přes `CreateBodyWithID`. Pořadí přidání A, B nebo B, A nevadí, pokud sedí ID. U constraintů nastavit jedinečnou prioritu. [P] https://jrouwe.github.io/JoltPhysics/index.html#sloppy-determinism
3. **Stejný build.** Stejný zdroják a definice. Replay je tedy vázaný na verzi enginu.
4. **Vlákna.** Jolt je deterministický i vícevláknově. Důkaz: CI pouští testy s `-t=max` a na různých strojích čeká stejný hash. Starší volba `mDeterministicSimulation` byla odstraněna, „The simulation is now always deterministic“. Race, které determinismus rozbily, se opravují jako chyby. [P] https://github.com/jrouwe/JoltPhysics/blob/master/PerformanceTest/PerformanceTest.cpp a https://github.com/jrouwe/JoltPhysics/blob/master/Docs/ReleaseNotes.md
   - Výslovnou větu „výsledek nezávisí na počtu vláken“ jsem v dokumentaci nenašel. Opírám se o CI.
5. **Seřadit vše, co z fyziky leze ven.** Kontakty, aktivace těles a výsledky dotazů chodí v nedeterministickém pořadí. Adaptér je musí seřadit, než je předá logice hry a zvuku.
6. **Nepřidávat a neodebírat tělesa z více vláken naráz.** Jolt u takového testu kontrolu determinismu sám vypíná. [P] https://jrouwe.github.io/JoltPhysics/index.html#deterministic-simulation

## Dopady na plán

**D28 (dvě úrovně): neruším, ale zpřesnit.**
- Důvod „deterministický Jolt napříč OS je neověřený a drahý“ je potřeba přepsat. Správně je: „Jolt to umí a testuje, stojí to asi 8 %. Neověřená je naše kombinace: clang-cl, vozidla, joltc a vše, co do fyziky posíláme.“
- Úroveň B má dnes tři různé věci. Fyzika má reálnou šanci na shodu napříč OS. Animace a mix zvuku ne, tam nic takového knihovny neslibují. Navrhuji úroveň B rozdělit: **B1 fyzika** (cíl: shoda na 3 OS, zatím neslíbená) a **B2 animace a zvuk** (shoda na stejné platformě).
- Háček: fyzika je shodná napříč OS jen tehdy, když jsou shodné i její vstupy. Ragdoll s motory dostává cílovou pózu z animace. Pokud je animace úrovně B2, rozbije shodu fyziky. Buď se vzorkování póz pro fyziku napíše podle pravidel úrovně A, nebo se cross-OS shoda omezí na scény bez aktivního ragdollu.

**Brána M4 (replay jízdy): tvrdou bránu nechat na „stejná platforma“, cross-OS přidat jako měření.**
- Stavět Jolt od prvního dne s `CROSS_PLATFORM_DETERMINISTIC=ON`. Cena je malá a pozdější zapnutí zneplatní všechny uložené hashe.
- Měření 27 rozšířit: „hash replaye jízdy na macOS-ARM64, Linux-x64 a Windows-x64 (clang-cl)“. Když projde, brána se zvedne na „na všech třech OS“. Když neprojde, víme přesně kde.
- Hned zvednout bránu nedoporučuji. Tři články řetězu (clang-cl, vozidlo, joltc) nikdo veřejně netestuje.

**Nové úkoly, které z rešerše plynou:**
- **joltc nemá `StateRecorder`.** Replay od začátku ze vstupů ho nepotřebuje. Potřebuje ho ale save s „plným stavem simulace“ (D40), kontrola determinismu krok po kroku a případný rollback. Řešení: pár funkcí navíc v našem C++ adaptéru, nebo PR do joltc.
- **Adaptér fyziky řadí události.** Kontakty a aktivace seřadit podle ID těles, než jdou do hry a do zvuku nárazů.
- **Tělesa přes `CreateBodyWithID`**, ID přiděluje engine ze stabilních ID (D40).
- **CONVENTIONS §5 doplnit:** shodný stav FPU na všech vláknech, zákaz převodu float→int mimo rozsah, NaN nesmí do hashe, vlastní řazení místo `qsort`, připnutá verze clangu, UBSan v CI. Na Windows výslovně `-ffp-contract=off` (nestačí výchozí `/fp:precise`).
- **`.wzr` nese otisk buildu** (verze enginu, Joltu, překladače, definice). Replay z jiného buildu se odmítne nebo označí.
- **Bod k ověření „C11 atomics přes clang-cl“ (M0a)** nechat. Přidat: `<threads.h>` nepoužívat, vlákna brát z SDL3.
- **Bod k ověření „dvojitá přesnost v joltc“ (M4b):** v API i v CI joltc je. Jolt double cross-platform testuje na Linuxu a macOS, ne na Windows. Ověřit u nás.
- **Jeden zdroják Joltu.** joltc umí vzít Jolt z lokální složky. Připnout konkrétní commit pro všechny tři OS.

## Otázky pro vlastníka

1. **Rozdělit úroveň B na B1 (fyzika, cíl 3 OS) a B2 (animace, zvuk)?** Nebo nechat jednu úroveň B a cross-OS fyziku brát jen jako bonus?
2. **Zapnout `CROSS_PLATFORM_DETERMINISTIC` od začátku za cenu asi 8 % výkonu fyziky?** Doporučuji ano.
3. **Má být cross-OS replay jízdy cílem M4 (měření s možností povýšit na bránu), nebo ho odložit za M4?**
4. **Chybějící `StateRecorder` v joltc:** dopsat ve vlastním adaptéru, nebo poslat PR do joltc a čekat? Autor váže nové funkce na sponzoring.
5. **Má póza pro aktivní ragdoll spadat pod pravidla úrovně A?** Bez toho cross-OS shoda fyziky s ragdollem nepůjde.

## Co se nepodařilo ověřit

- Výslovné tvrzení autora Joltu, že výsledek nezávisí na počtu vláken. Mám jen nepřímý důkaz z CI.
- Determinismus Joltu postaveného přes clang-cl. Determinismus vozidel napříč platformami. Obojí chybí v CI Joltu.
- Zda `<threads.h>` funguje s clang-cl.
- Zda clang-cl s runtime MSVC podporuje atomické typy, které nejsou lock-free.
- Vnitřní řešení determinismu v enginu Paradoxu. Fórum blokuje automatické čtení, zdroje jsou jen sekundární.
- Číselný formát simulace v Age of Empires. Původní článek ho neuvádí.
- Nezávislé měření ceny 8 %.
- Stav volby `/experimental:c11atomics` přímo v poznámkách k vydání VS 2026. Opírám se o stránku shody MSVC z 2026-10-16.
- Nic jsem nestavěl ani nespouštěl. Vše je z dokumentace, zdrojáků a konfigurace CI.
