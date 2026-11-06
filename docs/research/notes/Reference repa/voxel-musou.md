# Voxel Musou — rozbor kódu pro Wallhammer Zero

- **Zdroj:** https://github.com/mike007jd/voxel-musou (licence MIT), commit `aba5fb8` (2026-10-04)
- **Lokální klon (jen pro čtení, nic se nespouštělo):** `/private/tmp/claude-501/-Users-tomasgrasl-projects-game-engine/707c8224-15b2-44fc-a6b3-d1e2e8895f93/scratchpad/repos/musou/repo`
- **Odkazy na soubory:** cesty `soubor:řádek` jsou relativní k `src/`, pokud není uvedeno jinak.

---

## 1. Přehled

Voxel Musou je hack-and-slash ve stylu Dynasty Warriors v prohlížeči. Používá Three.js r186, který je vendorovaný. Z addonů bere jen `UnrealBloomPass`, `Pass`/`FullScreenQuad`, `CopyShader` a `LuminosityHighPass`.

**Obsah hry:**
- Sedm hratelných důstojníků: Liu Bei, Guan Yu, Zhang Fei, Zhao Yun, Zhuge Liang, Huang Zhong a Lü Bu.
- Čtyři mapy: Hulao, Changban, Chibi a Dingjun.
- Režimy story (svitková mapa), trials a free battle.
- Ve hře je 300 vojáků. Přes `?enemies=N` to jde až na 2000. K tomu je šest slotů pro důstojníky a 40 spojenců.

**Ověření tvrzení autora.** Autorovy poznámky v README a ve zprávách jsou zastaralé. Tabulka ukazuje, jak to je ve skutečnosti.

| Tvrzení | Skutečnost |
|---|---|
| „~9 300 řádků ve 32 souborech“ | **105 souborů v `src/`, 25 972 řádků JS.** Navíc `index.html` (954 řádků) a `checks/` (5 Node skriptů, 736 řádků). Řádky podle adresářů: chars 6819, world 4267, hero 2637, story 2147, vfx 2068, ui 1702, crowd 1625, musou 1087, audio 932, combat 768, actors 656, core 464, camera 321, post 334. |
| `core/voxel.js` 146 řádků | 124 řádků |
| `hero/model.js` 342 řádků | 358 řádků |
| „Nula textur“ | **Napůl pravda.** Ve hře nejsou žádné obrazové soubory. Za běhu se ale generují textury: canvas hlína 1024 px s dlaždicí 24 m (`world/terrain.js`), `DataTexture` trávy 256 px, 16px sprite trsu trávy, vlajky s kaligrafií vykreslenou systémovým fontem na canvas (`crowd/view.js:220-237`) a prapory v `world/dressing.js`. Přibalený je font `ui/brush.woff2`. |
| „Retro pixel look“ | **Nejde o snížení rozlišení.** Scéna se renderuje v plném rozlišení. Ve finálním průchodu se přidá Bayerův dither 4×4 na mřížce 2 px a kvantizace na 72 úrovní (`post/post.js:195-198`). |
| Skinnované postavy | **Nejsou skinnované.** Každý kloub riga má vlastní pevný voxelový mesh, takže jde o rigidní segmenty. |
| Deterministická simulace | Platí jen v rámci jednoho JS enginu. Simulace používá `Float64Array` a `Math.sin/cos/atan2/hypot`, jejichž výsledky se mezi platformami nezaručují. Audio používá `Math.random`. |
| Kaskádové stíny | **Nejsou.** Je tu jedna mapa stínů 2048² v boxu ±34 m, který jede s fokusem. |

**Co to je.** Jeden autor (s velkou pravděpodobností s pomocí LLM, viz komentáře typu „combo-system r4“ a „locomotion-dodge r3“) dotáhl web-tech hru k pozoruhodné úrovni *game feelu*. Komentáře v kódu jsou neobvykle dobré a vysvětlují *proč*. Většina hodnoty pro nás leží v animaci, combat feelu, davu a postprocesu. Samotný voxelový mesher za moc nestojí.

---

## 2. Architektura

### 2.1 Vrstvy

- **`core/`** — RNG, voxel builder a event bus.
  - **`rng.js`**: mulberry32 s dvěma proudy. `rng` slouží simulaci, `vrng` vizuálu. K tomu bezstavový `hash01(a,b,c)`.
  - **`events.js`**: synchronní bus `on/emit/collect`. Hlavička souboru je kompletní katalog událostí.
- **`world/map.js`** — mapa, dostupná simulaci i renderu. Neobsahuje THREE, je bezpečná pro simulaci a dá se spustit v Node.
- **Simulace (bez THREE):** `hero/hero.js` (část `h.step`), `combat/`, `crowd/crowd.js`, `actors/`, `musou/musou.js`, `story/`.
- **Pohledy (THREE):** `hero/model.js`, `rig.js`, `secondary.js`, `crowd/view.js`, `vfx/`, `world/*` kromě `map.js`, `post/`, `camera/`, `musou/view.js`.
- **Audio:** `audio/` (bank se peče offline, za běhu běží graf sběrnic).

### 2.2 Kontrakty, které stojí za převzetí

1. **Simulace emituje, render poslouchá a nesmí měnit stav simulace.** Celý vizuál (VFX, zvuk, třes kamery) visí na událostech (`hits`, `ko`, `enemy:land` …).
2. **`y` v simulaci je výška nad terénem.** Hodnota `ground(x,z)` se přičítá až v renderu, takže simulace nepotřebuje heightfield v plné kvalitě.
3. **Hitboxy jsou data, ne kosti.** Tabulka pohybů (`hero/moves.js`) určuje rozsah snímků, tvar (`arc`/`circle`/`line`), dosah, úhel, poškození, knockback a hitstop. Animace se na tyto snímky jen „napasuje“.
4. **Póza je čistá funkce stavu simulace** (`heroPose` v `hero/hero.js`). Render ji jen vyhodnotí.
5. **Dva RNG proudy.** Vizuál (`vrng`) nesmí posouvat simulační `rng`. Oba se resetují na začátku bitvy (`main.js:143`: `vrng.seed(7936); rng.seed(1)`).

### 2.3 Smyčka (`main.js:273-285`)

```js
const d = Math.min(0.1, Math.max(0, (now - last) / 1000));
acc += d * (game.timeScale ?? 1); last = now;                // story: victory slow-mo
...
while (acc >= 1 / 60 && n < 4 && state === 'battle') { step(); acc -= 1 / 60; n++; }
if (n === 4) acc = 0;
render();
```

- Simulace má pevný krok 60 Hz, nejvýš 4 kroky na snímek. Když se strop vyčerpá, akumulátor se zahodí a hra zpomalí místo spirály smrti.
- `timeScale` zajišťuje vítězné zpomalení.
- **Chybí interpolace renderu** (alpha). `render()` počítá `dt` jako `(frame − lastRenderFrame)/60`, tedy v *simulačním* čase.
- Třes kamery, částice i vyhlazení kamery se stárnou v simulačních snímcích. Díky tomu jsou záznamy deterministické, ale na 144Hz monitoru je pohyb 60Hz schodovitý.
- Pořadí kroků v `step()` (`main.js:97-108`): kamera → hrdina → combat → dav → aktéři → pickupy → musou → story → `frame++` → `vfx.afterStep`.

### 2.4 Testy (`checks/*.mjs`)

Jde o Node skripty s `node:assert`, které importují simulační moduly přes `registerHooks`, aby `three` přesměrovaly na vendor:

- **`trials-bot.mjs`** spouští skutečnou 60Hz simulaci (hrdina, combat, dav, aktéři, director) jen se vstupy bota. Na každý běh vypíše jeden JSON záznam se seedem, časovou osou událostí a statistikami. Slouží jako balanční sonda.
- **`shared-originality.mjs`** kontroluje konečnost geometrie a časování scriptovaného Musou.

Golden hashe obrázků ani stavu tu **nejsou**. Pro nás je ale vzor „headless bot nad čistou simulací → JSON“ přesně to, co chceme mít v `tools`.

---

## 3. Rendering pipeline

**Pořadí v jednom snímku** (`post/post.js:297-332`, render targety na `:210-215`):

1. **Scéna** → `sceneRT` v plném rozlišení, HalfFloat, MSAA 4×, s `DepthTexture`.
   - Před ní běží stínový průchod Three: jedna mapa 2048² (`world/world.js:55-61`) s biasem −0.0006 a normalBias 0.03.
2. **Atmos** (`post.js:52-80`) → `atmosRT` v plném rozlišení, filtr nearest.
   - Z hloubky rekonstruuje pozici v pohledu a přidá haze a inscatter, které reagují na slunce.
   - Barvu ořízne v HDR (clamp). Do alfy uloží vzdálenost, kterou pak čte DoF.
3. **DoF** (`post.js:85-105`) → `dofRT` v polovičním rozlišení.
   - Jednoprůchodový gather podle Gustafssona po zlatém úhlu se čtvercovým bokehem.
   - CoC podle `post.js:45-50`.
4. **Bloom** — `UnrealBloomPass` v polovičním rozlišení.
   - Vlastní high-pass s chladnějším biasem a tóny podle mipu.
5. **God rays** (`post.js:110-126`) → `raysRT` v polovičním rozlišení.
   - Radiální blur se 36 vzorky a jitterem. Když je slunce mimo obrazovku, průchod se přeskočí.
6. **Final** (`post.js:128-200`), postupně:
   - mix ostrého a rozmazaného obrazu, unsharp mask
   - chromatická aberace, horizontální streaky, přičtení god rays, řádkový šum
   - split-tone grade a saturace
   - **tónová křivka Lottes** s měkkým ramenem po kanálech
   - „hot desaturation“ podle luminance, lift
   - sRGB OETF, vinětace, tmavší spodní pruh, záblesk, grain
   - **Bayer + kvantizace** (retro)

**Adaptivní MSAA** (`post.js:274-282`). Když EMA času snímku přesáhne 20 ms po 120 snímků, MSAA klesne 4 → 2 → 0.

**Per-mapa look.** `setLook` (`post.js:250-258`) a `world.load()` mění **jen uniformy**, takže se při přepnutí mapy nic nerekompiluje. Před bitvou se shadery zahřejí přes `compileAsync`, schované za loading kartou (`post.compile`).

### Světla (`world/world.js:22, 53-75`)

- **Hemisférické světlo.**
- **Slunce:** directional se stínem.
  - Stínový box jede s fokusem a je přichycený na texely (`:131-135`).
  - Na okrajích boxu stín měkce mizí (patch shader chunku, `:28-34`). Hranice stínové mapy tak není vidět, i když kaskády chybí.
- **Rim directional světlo.**
- **Tři bodová „ohňová“ světla.** Rotují mezi nejbližšími místy se světlem na mapě a prolínají se (`:151-163`). Počet světel je pevný, takže shadery mají stálý počet světel a nerekompilují se.
- **Stage key a fill** pro výběrové obrazovky.
- **Hrdina má vlastní fill a Fresnelův rim** (`hero/model.js:276-290`, `heroLook`).
  - Vkládá se do `MeshStandardMaterial` přes `onBeforeCompile`.
  - Rim se tlumí tam, kde je povrch už světlý.
  - Výsledek: hrdina je v každé scéně čitelný proti davu.

### Mlha (`world/sky.js:110-139`)

Mlha nahrazuje fog chunky Three. Kroky:

1. Faktor mlhy `1 − exp(−((d − near)/far)^1.6)`. Exponent 1.6 dává měkčí nástup v blízkosti a rychlejší zahuštění dál.
2. Řídnutí s výškou: `1 − 0.4·smoothstep(6, 45, y)`.
3. **Aerial perspective jako posun chromy.** Luminance pixelu se zachová a mění se jen odstín, k chladnému nebo k teplému podle směru ke slunci. Rozsah 25–160 m, síla 0.42.
4. **Přízemní prach.** Broskvový v protisvětle a lila jinde, s exponenciálním poklesem s výškou.
5. Výsledek se smíchá s barvou haze (`dwHaze`) a vynásobí `FOG_K = 0.62`.

`hazeColor` je CPU dvojče GLSL funkce, takže CPU a GPU barvy sedí. Používá se pro mraky, siluety hor a UI.

### Obloha (`world/sky.js`, `createSky`)

Kopule o poloměru 900 m:
- gradient a horizontální pás
- **blokové mraky** přes `floor(uv·9)/9` ve fbm, aby ladily s voxelovým stylem
- disk slunce

---

## 4. Klíčové techniky do hloubky

### 4.1 Voxel builder (`core/voxel.js`, 124 ř.)

**Tři vstupy:**
- **`boxesGeometry(boxes)`**
  - Bere boxy `{s, p, c, r?, skip?}` s Eulerovou rotací.
  - **Žádný culling mezi boxy.** Skryté stěny se vynechají jen ručním `skip`.
  - Je to „polévka quadů“ z `makeBuilder()`. Každý roh má jas `k` (AO), diagonála quadu se dá otočit (`flip`).
- **`voxelGeometry(grid)`**
  - Vydává jen odkryté stěny.
  - **Bez greedy meshingu**, takže co voxel, to až 6 quadů.
- **`sculpt(boxes, v = 0.034, jitter = 0.09)`**
  - Rasterizuje AABB boxy do mřížky `Int32Array`.
  - Box může mít jednu z barev:
    - konstanta,
    - **funkce `(x,y,z) → barva`**,
    - `−1` vyřízne objem (carve),
    - `paint` jen přebarví už plné voxely.
  - Pak přidá jitter jasu po voxelech přes `hash01` a vymeshuje to.
  - Používá ho dav, VFX i svět.

**Cena:** O(objem mřížky) na CPU při startu. Za běhu nic, geometrie je statická.

**Omezení:**
- Bez greedy meshingu je počet trojúhelníků velký: voják ~4,9k tri v blízké LOD.
- Pro statické modely je to v pořádku, pro terén ve velkém by to nešlo.

### 4.2 Hero model → mřížka → mesh s AO (`hero/model.js:32-75`)

Hrdina se popisuje jako seznam boxů v celočíselných voxelových souřadnicích. Velikost voxelu je `V = 0.025` m, u hlav a jemných dílů `HV = 0.0175`.

Mesher `vox()`:
- Kolem modelu nechá jednovoxelový prázdný okraj.
- Rasterizuje boxy. Funkční barvy umožňují vzory: lamely, švy, lemy.
- Pro každou odkrytou stěnu spočítá **klasické AO ze tří sousedů** na každý roh.
- Podle AO zvolí **diagonálu quadu**.

Jádro (zkráceno):

```js
const AO = [1 - ao, 1 - ao * 0.6, 1 - ao * 0.25, 1];   // ao = 0.42
...
const a = full(...s1), b = full(...s2);
lv[q] = a && b ? 0 : 3 - a - b - full(...cc);         // 0 = plně zastíněný roh
kq[q] = AO[lv[q]];
...
vb.quad(corners, f.n, r, g, b, kq, lv[0] + lv[2] < lv[1] + lv[3]);  // flip diagonály
```

**Další části:**
- **Barva voxelu:** `shade(c, 1 − jitter/2 + hash01(i,j,k)·jitter)`. Deterministický šum jasu ±2,5 % rozbije plochy, aniž by vypadal jako textura.
- **`lamellar()`** generuje řady lamelových plátů se švy, lemy a zastrčenými okraji. Z toho vznikají ty „pletené“ zbroje na výběrové obrazovce.
- **`B`, `P` (paint), `mirX`** — pomocníci pro stavbu, přebarvení a zrcadlení podle osy X.
- **`chars/parts.js`** používá jemný voxel `FV = 0.0125`. Ruce, rukavice, holé paže, chrániče předloktí a boty jsou parametrické funkce `(x,y,z)`.
- **`bodyParts(pal)`** použije totéž tělo s jinými paletami. Důstojníci se tak liší paletou a kitem, ne novou geometrií.
- **Materiál:** `MeshStandardMaterial` s `vertexColors`, `flatShading` a albedem ×0,8.
- **Každý kloub je samostatný `Mesh`** s `castShadow`. Nárameníky visí na pomocných kloubech.

**Cena:** pár ms na postavu při startu. Za běhu draw call na každý díl hrdiny (~15–25), což u jedné postavy nevadí.

**Omezení:**
- Rigidní díly znamenají, že se v kloubech „lámou“ silueta i AO. Voxelový styl to maskuje, u GTA III/WoW stylu by to bylo vidět.
- Pravé skinování chybí.

### 4.3 Rig a procedurální animace (`hero/rig.js`, `hero/anims/*`)

**Reprezentace pózy:**
- Póza je plochý `Float32Array` se 45 kanály (`POSE_SIZE`).
- Obsahuje pozici a úhly pánve, trupu, hlavy, cílů chodidel (pozice + pitch/yaw) a **samostatný kloub zbraně** pod rootem (pozice + yaw/elev/roll).
- `blendPose` lineárně interpoluje a úhly obtáčí nejkratší cestou.

**Weapon-first přístup:**
- Animátor (v kódu) klíčuje *kopí*, ne ruce.
- Ruce se na ratiště dosadí **analytickým dvoukostním IK** (`solve2`, `rig.js:218-234`) a mohou po ratišti klouzat (`reachOnShaft`).
- Volná ruka může přejít na FK (`lfree`/`rfree`).
- `spearElev` otáčí zbraň kolem úchopu, aby hrot nikdy nešel pod zem.

**Dvoukostní IK** (zákon kosinů s pólem):

```js
d = clamp(|target − S|, |lenA − lenB| + 1e-3, (lenA + lenB)·0.9995)
cosA = (lenA² + d² − lenB²) / (2·lenA·d)
E = S + D·lenA·cosA + pole⊥·lenA·sinA      // loket/koleno
aim(upper → E), aim(lower → target)
```

**Nohy:**
- Řeší se přes cíle chodidel a IK, pól kolena se bere z yaw chodidla.
- Když se chodidla nedají dosáhnout, `createRig().apply` **sníží boky** až o 12 cm. Postava se tak raději přikrčí, než aby měla nohy „nahoře ve vzduchu“.

**Autoring klipů** (`rig.js` `clip/sampleClip`, `anims/author.js`):
- **Interpolace kanálu:** Hermite po kanálech s tečnami Catmull-Rom nebo monotónními (Fritsch–Carlson, bez překmitů u úderů).
- **Easing po segmentech:** `lin/in/out/io/snap`.
- **Synchronizace s hitboxy:** klipy jsou klíčované přímo na snímky hitboxů z tabulky pohybů, takže animace a hitbox nemohou utéct.
- **Pečení chodidel** — `makeAuthor().clipF` **předpeče tabulky chodidel po snímcích**:
  - `plantFoot` (`author.js:29+`) drží chodidlo na místě, dokud se cíl neposune o víc než `HOLD = 3,5 cm` a zároveň je chodidlo pod `CONTACT = 0,12` m.
  - Jinak vygeneruje krok o délce 3–10 snímků se zdvihem 0,07–0,24 m.
  - Při došlapu přidá **propad pánve** `−0,04·v` po 4 snímky.
  - Koncová chodidla jednoho pohybu se řetězí do vstupu dalšího.
- **`blendStep` / `turnPose`:** během přechodových blendů chodidla *kráčí*. Pokud musí urazit víc než 4 cm, zvednou se. Při přechodu se tak nic neklouže.

**Běh je čistě procedurální** (`anims/locomotion.js:85-130`):

```js
const v = k * LOCO.runSpeed, T = 2 / cadence(v);
const s = 0.5 - 0.2 * k;            // stance podíl; s rychlostí vzniká fáze letu
const Ls = v * s * T;               // délka kroku = rychlost · doba stance → nulový skluz
if (p < s) { u = p/s;  z = zc + Ls*(0.5 - u); y = 0.08; pitch = -0.15 + 0.75*u*u; }
else       { e = smoothstep(u); z = zc + Ls*(e - 0.5) - 0.2*k*sin(πu)*(1-u);
             y = 0.08 + (0.08 + 0.34*k)*sin(π·u^0.75); }
bob = -cos(2π(q - s));               // nízko uprostřed stance, vysoko ve fázi letu
```

Ve fázi stance jede chodidlo dozadu **přesně rychlostí země**. Bez skluzu je to už z konstrukce, žádné foot-locking IK není potřeba. Dál pohyb obsahuje:
- houpání pánve nahoru a dolů,
- posun pánve nad stojnou nohu,
- protirotaci ramen,
- náklon v zatáčce (`lean`).

**Úskok:**
- Je to procedurální kotoul (`rollPose`, `applyRoll`) se squash & stretch.
- K tomu „duchové“ (`createDodgeGhosts`): hloubkový pre-pass a slupka s rimem z odvrácených stěn, aby se afterimage nepřekrývaly samy se sebou.

**Délky blendů** (`hero/hero.js`): 5, 3, 6 a 8 snímků podle typu přechodu. Účetnictví animace (`animDesc`/`updateAnim`) žije v simulaci, takže póza je deterministická.

**Sekundární pohyb** (`hero/secondary.js:19-170`):
- **Verlet řetězy** s gravitací, nárazy větru (součet dvou sinusů s fází podle řetězu), odporem a tuhým tažením ke klidovému směru.
- **Kuželový limit**, 2 iterace omezení, **kulové kolidery** na hlavě, hrudi, bocích, stehnech a kolenou.
- Sub-stepping 120 Hz, nejvýš 6 kroků na snímek. Kotva se uvnitř snímku interpoluje, aby rychlé švihy táhly řetěz hladce.
- **Jen v renderu**, simulace o řetězech neví.
- Segmenty jsou voxelové desky orientované po snímku (`matrixAutoUpdate = false`).
- Zhao Yun nese: plášť 6×0,17 m, zástěru (3), cop (8), 2 stuhy (5) a 5 pramenů střapce (3). `chainSet` navíc nárameníky rozhoupe napůl.

**Cena:** `solve2` je pár desítek flopů. Pečení chodidel probíhá při startu. Verlet stojí řádově stovky bodů × 6 substepů, což je zanedbatelné.

**Omezení:**
- Rigidní segmenty.
- IK neřeší kolize s terénem mimo výšku `ground()`.
- Řetězy nekolidují s prostředím, jen s tělem.

### 4.4 Davová instancovaná vrstva (`crowd/crowd.js`, `crowd/view.js`)

**Simulace** (`crowd.js`):
- SoA v `Float64Array`/`Int32Array`, stavový automat `ST`, `KIND`.
- **Squady a sloty na prstencích** kolem hrdiny.
- **Token systém útoků:** útočit smí najednou jen 3. K tomu fintování.
- `engaged` 84, vlny, duely.
- Prostorová mřížka `CELL = 1.2 m`, `GRID = 400`, nejvýš 64 squadů.
- Každý voják má vlastní hitstop `c.hs[i]` (max 3).

**Pohled** (`view.js`):
- **Jeden `InstancedMesh` na *díl těla* × LOD × armádu.** Díly jsou boky, trup, hlava, paže, stehno, holeň a zbraně.
- **Matice se skládají na CPU** po vojácích hierarchicky (`write()`, `view.js:655+`): pánev → trup → hlava/paže → zbraň a pánev → stehno → holeň. Výška pánve se dopočítá z úhlů nohou.
- **Póza vojáka má 26 kanálů** (`NCH`, `:241`). Blenduje se exponenciálně.
- Tři varianty `RECOIL` (reakce na zásah) se vybírají přes `hash01` a zrcadlí.

**Tři LOD** (`:459-461`, `MID_LOD = 8`, `FAR_LOD = 28`), všechny se stejnou pózou i maticemi:
1. **Blízko:** sculpt s `V = 0.042`, ~4,9k tri.
2. **Střed** (8–28 m): znovu zvoxelizováno na 2V, ~1,2k tri.
3. **Daleko** (> 28 m): plné boxy (`:196-202`), ~450 tri.

**Stínové proxy** (`:189-194`, `:427-428`):
- Nezvoxelizované boxy, které se kreslí jen ve stínovém průchodu.
- Hack: v `onBeforeRender` se nastaví `drawRange.count = 0`, takže v hlavním průchodu se nekreslí nic.
- Detailní mesh má `castShadow` vypnutý.

**Cull a replay:**
- Frustum test koulí (r = 2,5 m) pro každého vojáka (`:734`).
- **Idle replay** (`:738`, `:634-650`). Nečinní vojáci se přepočítají jen každý 4. snímek (`(frameNo + i) & 3`). Mezi tím se přehrají uložené matice. Cache má `REC = 16` instancí na vojáka.
- **Prázdné meshe se nekreslí** (`:744`: `m.visible = m.count > 0`). Instance se každý snímek pakují od nuly.

**Záblesk zásahu** (`patchHitMaterial`, `:337-371`):
- Atribut instance `aHit` (vec3).
- Hodnota > 1 znamená bílý „pop“ na jeden renderovaný snímek.
- Pak přijde zlatý, jantarový nebo červený nádech podle síly zásahu a k tomu emisivní rim `(1 − |N·V|)⁴`.

**`nearFade`** (`:297-324`):
- Ditherovaný dissolve vojáků u kamery.
- **Kužel výhledu** od kamery k hrdinovi (a k drakovi). Vojáci, kteří by hrdinu zakryli, se rozpustí přes Bayerův práh.
- Je to levné, nic se netřídí a nepotřebuje alfa blending.

**Další drobnosti:**
- Hue-mask emisivní záře podle armády (`uGlow`).
- Vlajky se vlní ve vertex shaderu s fází z `instanceMatrix`.
- Telegrafy úderů: „glint/flare“ jako pixelová hvězda nad davem.

**Cena:** Hlavní náklad je skládání matic na CPU, řádově 10–14 matic × 300–2000 vojáků za snímek. Proto přišly idle replay a LOD. Počet draw callů je zhruba díly × LOD × armády, tedy desítky, a nezávisí na počtu vojáků.

**Omezení:**
- Bez GPU skinování a bez VAT.
- Při 2000 vojácích je CPU úzké hrdlo. JS to dává jen díky replay a cullingu.

### 4.5 Debris a VFX (`vfx/vfx.js`, 1413 ř.)

**Částice** (`makePool`, `:508-598`):
- Instancované kostky s druhy: 0 jehla, 1 trosky, 2 prach, 3 uhlík, 4 střep, 5 plamen.
- **Trosky:** gravitace 22 m/s². Při dopadu rychlostí pod −1,5 m/s se odrazí koeficientem −0,32 a tlumí vodorovnou rychlost ×0,55. Pak se usadí a zůstanou ležet.
- Rotace je úměrná `0,16/size`: velké kameny se točí pomaleji, jako by měly hmotnost.
- **Stáří se počítá po snímcích přesně**, sub-stepping 1/30. Živé částice se pakují od slotu 0.
- Pool trosek má 2000 instancí, vrhá stíny a používá `lensClear` (2,8 m).

**`clumpGeometry()`:**
- Shluk 2×2×2 bez jedné kostky.
- Vnitřní stěny se vynechají (84 → 48 tri).
- Tvar „kamínku“ je tak víc organický než čistá kostka.

**KO** (`:989-1006`):
- 9 kusů trosek. U důstojníka 14, během Musou jen 4, protože na scéně je tisíc obětí.
- Množství se škáluje vzdáleností kamery.
- K tomu tělesné bloky (helma, trup, štít), které se odrazí, usadí a zůstanou ležet.
- Dál jehly, u důstojníka záblesk světla, prstenec, uhlíky a prach.

**Ostatní efekty:**
- **Stopa seku (slash ribbon):** vzorkuje se z *čisté funkce pózy* (`weaponWorld`/`spearWorld` v `rig.js`). Mezi snímky simulace se tak dá stopa hustě převzorkovat bez historie.
- Streaky bodnutí, kontaktní hvězdy a jehly, objemy finisherů.
- Decaly prasklin v zemi (vidět na screenshotech jako tmavé „žíly“).
- `makeQuadPool` dělá paprsky a hvězdy na quadech se shaderem.

**Stárnutí při hitstopu:** během hitstopu VFX stárnou polovičním tempem, takže jiskry „visí“ s úderem.

### 4.6 Combat feel (`combat/combat.js`, `camera/camera.js`, `hero/moves.js`)

**Hitstop je lokální pro hrdinu.**
- `game.hitstop` způsobí, že `hero.step` skončí hned na začátku (`hero.js:61`). Bufferovaný vstup zůstane.
- **Dav simuluje dál.** Oběti dostanou vlastní `c.hs[i]` a v renderu se třesou sinusem.
- Kombo se tak nezasekne, ale úder má váhu.

**Škálování hitstopu** (`combat.js:86-95`):

```js
if (hit.sweep) { if (key === sweepKey) return 0; sweepKey = key; }   // jedno zastavení na sweep
if (hit.heavy && key !== heavyKey) { heavyKey = key; return clamp(base, 6, 8); } // jednou za okno
return Math.min(COMBAT.stopMax, 1 + Math.floor((count - 1) / COMBAT.stopPer)); // 1 sf + 1 za každých 5 obětí, max 4
```

Zásah do 40 vojáků tak nezamrazí hru na 40 snímků. Pocit „tíhy“ roste s počtem obětí logaritmicky, ne lineárně.

**Ostatní pravidla zásahů:**
- **Tvary zásahu** (`inShapeAt`, `:48-59`): oblouk (dosah, úhel, směr), kruh a čára. Jde o čistou 2D geometrii v rovině XZ.
- **Strike** (`:101-120`) je **lineární průchod celým davem**. Pro 300 vojáků to stačí, pro 2000 už je to hraniční.
- **`every: ONCE`** a okna `f: [7, 10]`: každý zásah se v rámci okna vyhodnotí jednou (`lastHit[i] = key`).
- **Knockback typy:** `flinch / push / launch / blow / spin / armor`.
- **Vyhození do vzduchu** je fyzikální, s „apex float“ (u vrcholu se zpomalí).
- **Přistání naležato:** u rotujícího těla se rotace naplánuje tak, aby **dopadlo naplocho**. Rotace se dopočítá z doby letu.

**Kamera** (`camera/camera.js`):
- Parametry: vzdálenost 5,8, výška 1,35, pitch 17°, FOV 48.
- Kriticky tlumené sledování, dead-zone 0,35, look-ahead.
- Třístupňové oddálení podle hustoty davu.
- Výložník (boom) se zkracuje pochodem po SDF walk-fieldu (`occlusion.js`, žádné raycasty).
- **Mikro-kopance** řízené událostmi, stárnuté v simulačních snímcích:

```js
const a = k.px * Math.exp(-age * 3 / k.len) * Math.cos(age * Math.PI / 3);
// px omezeno na kickMaxPx = 6 px při 720p, převod na rotaci přes fov·DEG/720
```

  Jsou definované v *pixelech obrazovky*, takže při jakémkoli FOV a rozlišení vypadají stejně. Spouštějí je:
  - zásahy (těžký: `min(4,5·w, 2,2 + 0,15·count)`),
  - zranění,
  - tvrdý dopad,
  - Musou výbuch (6 px).
- **`lensClear`**: fragmenty blíž než `near` se zahodí, takže trosky ani vojáci nezaplácnou objektiv.

**Musou** (`musou/musou.js`, `view.js`):
- Časová osa ve snímcích: closeup 30, pullback 88, chase 100, contact 132, finisher 176, konec 200.
- Dráha draka je **sdílená křivka** (`dragonAt`) pro hity v simulaci i pro vizuál.
- Drak se skládá z instancovaných stínovaných boxů podél 46 segmentů.
- Gradace barev přes DOM/CSS overlay. Kaligrafický cut-in je v `overlay.js`.
- Aditivní celoobrazovkový trojúhelník s radiálními paprsky je posazený v hloubce tak, že ho těla vpředu ořežou.

### 4.7 Post efekty a „retro pixel look“ (`post/post.js`)

**Tónová křivka (Lottes 2016)**

$$
y = \frac{x^a}{(x^{a d})\, b + c}
$$

- Konstanty `b` a `c` se dopočítávají v `setLook` z `midIn`, `midOut` a `hdrMax`, takže mapa nastavuje „kde je střed“, ne surová čísla.
- Měkké rameno je zvlášť pro každý kanál.
- **Hot desaturation** se řídí *luminancí*, ne přetečením kanálu. Sytě oranžový plamen zůstane oranžový a jen bílé jádro vybělí (`post.js:186-189`).

**DoF:**
- Jeden průchod, gather po zlatém úhlu (Gustafsson 2018).
- Čte vzdálenost z alfy `atmosRT`.
- Polovina rozlišení, čtvercový bokeh.

**God rays:** 36 vzorků s jitterem, jen když je slunce na obrazovce.

**Retro krok** (`post.js:195-198`):

```glsl
c += (hash(gl_FragCoord.xy + fract(uTime * 7.31) * 97.0) - 0.5) * uGrain;   // jemné zrno
c += bayer4(floor(gl_FragCoord.xy * 0.5)) * uDither / uLevels;            // dither na 2px mřížce
c = floor(c * uLevels + 0.5) / uLevels;                                   // 72 úrovní na kanál
```

Geometrie zůstává v plném rozlišení. Retro dojem dělá jen 2px dither a posterizace (72 úrovní = ~6,2 bitu) a k tomu řádkový šum. Na screenshotech to v podstatě nepoznáte, s výjimkou gradientů oblohy.

### 4.8 Procedurální audio (`audio/bank.js`, `audio/audio.js`)

**Offline bank:** vše se peče při startu přes `OfflineAudioContext`.

- **Hlasy (`voice()`) — formantová syntéza:**
  - pila s obálkou f0, jitter šumem, vibrato
  - „growl“ AM
  - **4 pásmové propusti na formanty**
  - aspirace, dech, chrapot, frikativa
  - Z toho vznikají výkřiky „kiai“ (`LINES`), `grunt` a `cry` a pro každého hrdinu `bakeVoice`.
- **Dopady (`impact()`)** — vrstvy:
  - click, crack, padající „shk“
  - křupnutí zbroje
  - sinusový „thump“ přes waveshaper, thwack, punch, zrna
  - u těžkých úderů sub-drop
- **Hudba:** taiko, akordy, power-chord riff a `bakeLoop` s ekvivalentním výkonovým crossfadem.
- **Dozvuk:** IR z 1,5 s doznívajícího a tmavnoucího šumu (`makeIR`), konvoluce.

**Runtime** (`audio.js`):
- Graf sběrnic: sfx/vox/bed → 5pásmový EQ → kompresor (attack 25 ms) → soft-clip WaveShaper s tanh kolenem.
- **Sidechain ducking na každý tick zásahu.**
- **Zvuky švihu předbíhají hitbox o 7–12 snímků** (`LEAD` podle druhu švihu), takže zvuk dorazí s vizuálem, ne po něm.
- Strop 56 současně znějících hlasů.

### 4.9 Terén, hrad, dekorace a obloha

**`world/map.js`** (simulačně bezpečný):
- Pochozí plocha je **sjednocení autorských dílů**: obdélníky, elipsy a cesty s proměnnou šířkou.
- Rasterizuje se do **znaménkového distančního pole** na 2m mřížce s bilineárním vzorkováním. Výška se bere z dílu, kterému bod patří.
- `clampWalk` vytlačí bod po gradientu SDF zpět dovnitř.
- Pás vody s brody, `noise2` (value noise nad `hash01`).

**`world/terrain.js`:**
- **Země:**
  - Jedna `PlaneGeometry` na 2m mřížce s výškami z `ground()`.
  - **Vertex barvy** nesou prach, spáleniště, mokré břehy, vyjeté cesty, kontaktní AO u paty útesů a skálu.
  - Atributy `aGrass` a `aPave`.
- **`splatMaterial`** (`:149-205`):
  - Makro šum tónu.
  - Přechod do trávy s roztřepeným okrajem.
  - **Dlažba procedurálně v shaderu:**
    - řady kamenů, spáry, vyjeté koleje
    - zkosení nasvícené směrem ke key light
    - AA přes `fwidth`
    - náhrada na dálku
- **Útesy:** voxelové sloupy skály 2 m v kurzech po 1 m, jen odkryté stěny. Stíny přijímají, ale nevrhají.
- **`tufts()`:**
  - Trsy trávy jako zkřížené quady s 16px pixel-art texturou.
  - `alphaToCoverage` (funguje s MSAA, bez třídění), vlnění větrem ve vertex shaderu, zmenšování se vzdáleností.
  - **Normály přišpendlené nahoru** (tráva se nasvítí jako zem) a průsvit v protisvětle.
  - Až 9000 instancí v jednom `InstancedMesh`.
- Vnější rovina 2400 m, borovice, balvany a vrstvené zamlžené hory.

**`world/castle.js`:**
- Celý postavený z `boxesGeometry`.
- `stoneFace` klade **běhoun (running bond)** z bloků s tónem a hloubkovým jitterem po blocích.
- Cimbuří, pagoda (stupňovité desky střechy a zvednuté rohy), strážní věž, `paperLantern`.
- `figureGeometry` je vzdálený voják ze 7 boxů.
- Statická geometrie je sloučená, brány a posádka jsou instancované.

**`world/dressing.js`** (815 ř.; podrobně čteny jen signatury):
- `bannerTexture`, `cloth`/`animateCloth`
- `smokeMaterial`, `glowTexture`, `fireSystem`
- palisáda, stany, vozy, žárovnice, bubny, zásoby, stojany na štíty, velitelský stůl, signální věž, barikády

---

## 5. Výkon

**Rozpočet podle kódu** (měřit jsme nic nemohli, nic se nespouštělo):

| Oblast | Opatření v kódu | Poznámka |
|---|---|---|
| Draw cally davu | Instancování po dílech × 3 LOD × armáda, `visible = count > 0` | Desítky DC nezávisle na N |
| CPU matice davu | Frustum cull na vojáka, idle replay každý 4. snímek, LOD | Hlavní CPU náklad, roste lineárně s N |
| Stíny | 1× 2048², stínové proxy z hrubých boxů, útesy nevrhají | Detail stínů se obětuje kvůli počtu DC a trojúhelníků |
| Postproces | DoF, bloom a rays v ½ rozlišení, rays jen se sluncem na obrazovce, adaptivní MSAA 4→2→0 | Rozumné škálování |
| Částice | Pakované pooly, sub-step 1/30, počet trosek škálovaný vzdáleností a Musou | 2000 trosek se stíny |
| Shadery | `compileAsync` za loading kartou, mapy mění jen uniformy, pevný počet světel | Žádné hitche za běhu |
| Simulace | SoA `Float64Array`, mřížka 1,2 m pro separaci | `strike()` je přesto lineární přes celý dav |

**Kde by to škálovalo špatně:**
- CPU matice při 2000 vojácích.
- `strike()` jako O(N) na každý tick zásahu.
- Žádný greedy meshing (trojúhelníky).
- Jediná stínová mapa pro velký svět.

---

## 6. Co převzít a kam

### 6.1 Tabulka

| Technika (soubor) | Modul WZ | Adaptace C17 / HLSL / SDL_GPU | Priorita |
|---|---|---|---|
| Pevný krok 60 Hz, strop 4 kroky, zahození akumulátoru, `timeScale` (`main.js:273-285`) | `eng_world` | Totéž, **plus interpolace renderu** (alpha mezi dvěma snapshoty transformací), která tu chybí. FX a třes stárnout v sim. snímcích, render interpolovat jen transformace. | P1 |
| Dva RNG proudy + bezstavový `hash01` (`core/rng.js`) | `core` / `tools` | `uint32` hash (PCG/mulberry), `rng_sim` a `rng_vis` odděleně. Detail generování (jitter, varianty) jen z `hash(x,y,z,seed)`. Zaklad pro golden hashe. | P1 |
| Sim emituje, render poslouchá; `y` = výška nad zemí (`core/events.js`) | `eng_world` | Ring buffer událostí za tick (POD structy), render čte po kroku. Nic mutovat. | P1 |
| Hitboxy jako data + klipy klíčované na snímky hitboxů (`hero/moves.js`, `anims/author.js`) | gameplay nad `eng_world`, `eng_anim` | Tabulka pohybů v datovém souboru (frames, cancel, hits[f0,f1,shape,…]). Animace se retimuje na ni, ne naopak. | P1 |
| Lokální hitstop s log. škálováním a „jednou za okno“ (`combat.js:86-135`) | gameplay | Hitstop jako per-entity čítač v poolu. Svět běží dál, oběti mají vlastní `hs`. VFX stárnou ½ tempem. | P1 |
| Weapon-first póza + analytické 2-bone IK s pólem + snížení boků (`rig.js:218-234`, `apply`) | `eng_anim` | Přesně v plánu (two-bone IK). Přidat kloub „zbraň“ jako první-třídní kanál pózy a ruce na něj. | P1 |
| Pečení chodidel `plantFoot` + pelvis dip + řetězení koncových chodidel (`anims/author.js`) | `eng_anim` (offline/load-time) | Bake po snímcích při načtení klipu. Výstup = tabulka cílů chodidel pro IK. Ideální pro „málo póz“: z 3–5 klíčů vznikne pohyb bez skluzu. | P1 |
| `blendStep`: chodidla během blendu kráčí (`rig.js`) | `eng_anim` | Blend v prostoru cílů chodidel, ne úhlů. Zdvih při posunu > 4 cm. | P1 |
| Procedurální běh bez skluzu (`locomotion.js:85-130`) | `eng_anim` | Doslova přenositelné. Pro tvory s N nohami zobecnit fázi `off = i/N` a stance podíl podle rychlosti. Výborné pro mounty a tvory z `eng_gen_char`. | P1 |
| Verlet řetězy s kuželem, kulovými kolidery, větrem a sub-stepem 120 Hz (`secondary.js`) | `eng_anim` | Doplňují Holdenovy pružiny. Pro pláště, copy, ocasy tvorů a postroje mountů. Jen render, takže nemusí být deterministické. | P1 |
| Dav: instance po dílech, 3 LOD se stejnou pózou, stínové proxy, cull, idle replay, žádné prázdné DC (`crowd/view.js`) | `eng_render` + crowds | SDL_GPU: jeden storage buffer s instancemi (`float4x3` + barva + hit + LOD) a **`DrawIndexedPrimitives` per (mesh, LOD)** s `first_instance`. Stínové proxy jako samostatný seznam ve stínovém průchodu (bez hacku s `drawRange`). Matice skládat ve **compute shaderu** z pózy (26 kanálů) místo na CPU. | P1 |
| `aHit` per-instance záblesk + rim⁴ (`view.js:337-371`) | `eng_render` (crowd shader) | Pole `hit` v instančním structu, v HLSL `emissive += hit * pow(1 - abs(dot(N,V)), 4)`, > 1 = bílý pop. | P1 |
| Sight-cone dither dissolve + `lensClear` (`view.js:297-324`, `camera/occlusion.js`) | `eng_render` | `clip()` s Bayerovým prahem v PS podle vzdálenosti od úsečky kamera→hráč. Bez třídění a průhlednosti. Funguje i pro budovy v hustých městech. | P1 |
| Voxel/box mesher s AO a flipem diagonály podle AO, `sculpt` s funkčními barvami, generátory vzorů (`hero/model.js:32-75`, `core/voxel.js`) | `eng_gen_mesh` | Jako **blockout, placeholder, vzdálené LOD a stavebnice tvorů**. Přidat greedy meshing a export do half-edge, aby šlo dál vyhlazovat a subdividovat. AO flip je univerzální pravidlo i pro heightfield terén. | P1 |
| Vlastní mlha: `exp(−x^1.6)`, výškové řídnutí, **AP jako posun chromy se zachováním luminance**, přízemní prach, CPU dvojče (`world/sky.js:110-139`) | `eng_render` (post/forward) | HLSL funkce sdílená forward a post průchody. CPU dvojče pro mraky, UI a impostory. Pro planetu přepočítat výšku na radiální. | P1 |
| Tónová křivka Lottes s konstantami z midIn/midOut/hdrMax, hot-desat podle luminance, split-tone (`post.js:128-200`, `:250-258`) | `eng_render` post | Jednoduchý final PS. Look per biom a mapa jen přes uniformy (cbuffer). | P1 |
| Mikro-kopance kamery v px obrazovky, stárnuté v sim. snímcích (`camera.js`) | camera (gameplay) | Převod px → rotace přes FOV. Nezávislé na rozlišení a FOV. | P1 |
| Gather DoF v ½ rozl. (Gustafsson), god rays v ½ rozl., adaptivní MSAA | `eng_render` post | Volitelné. Adaptivní kvalita jako EMA času snímku → přepínání MSAA a rozlišení post efektů. | P2 |
| Shadow box přichycený na texely + měkké vyblednutí na okraji (`world/world.js:28-34, 131-135`) | `eng_render` | V CSM: texel snapping každé kaskády a fade do další kaskády a nakonec do žádného stínu. | P2 |
| Procedurální splat dlažba v PS s `fwidth` AA a náhradou na dálku (`terrain.js:149-205`) | `eng_render` terén | Ulice a náměstí ve městech bez textur: řady, spáry a koleje z `floor`/hash. Potřebuje LOD fallback, aby na dálku nešuměla. | P2 |
| Tráva: zkřížené quady, alpha-to-coverage, normály nahoru, průsvit, vítr ve VS (`terrain.js` `tufts`) | `eng_render` vegetace | SDL_GPU: `enable_alpha_to_coverage` v multisample state. Instancovaný buffer. | P2 |
| Pochozí SDF ze sjednocení primitiv + `clampWalk` + boom kamery po SDF (`world/map.js`, `occlusion.js`) | `eng_world` / navigace | Pro autorské arény a města. Na planetě nahradit lokálním SDF z dlaždic. | P2 |
| Formantový syntetizátor hlasů, vrstvené dopady, sidechain, swing cue s předstihem 7–12 snímků (`audio/*`) | audio (budoucí) | Offline bake do PCM při startu (C, žádné API). Runtime mix: EQ → kompresor → tanh soft-clip. | P2 |
| Stopa zbraně vzorkovaná z čisté funkce pózy (`vfx.js`, `rig.js` `weaponWorld`) | `eng_anim` + VFX | Póza jako čistá funkce `(clip, t)` dovolí převzorkovat stopu na 120+ Hz bez historie. | P2 |
| Debris pool: odraz −0,32, rotace ∝ 1/size, settle & persist, škálování počtu (`vfx.js:503-598`) | VFX / ragdoll | Levná náhrada Jolt pro drobné kusy. Velké kusy předat Jolt. | P2 |
| `heroLook`: fill + Fresnel rim jen na hrdinovi, tlumený na světlých plochách (`model.js:276-290`) | `eng_render` | Per-materiál „hero“ flag. Čitelnost postav v davu. | P2 |
| Headless bot nad čistou simulací → JSON timeline (`checks/trials-bot.mjs`) | `tools` | C binárka bez okna. Seed + skript vstupů → hash stavu po N tickách = golden hash. | P1 |

### 6.2 Co NEpřebírat

1. **Voxelový vzhled jako finální styl.** Na laťku GTA III / WoW nestačí. Silueta je schodovitá a plochy bez materiálové odezvy. Na dálku a v pohybu působí jako hračka. Voxel ale **pomáhá** v těchto rolích:
   - **vzdálené LOD a impostory** (středová LOD na 2V je přesně ten trik),
   - **placeholder a blockout** pro rychlé iterace tvarů,
   - **stavebnice tvorů** jako objemová maska → SDF → marching cubes nebo dual contouring → half-edge → vyhlazení. Rasterizace boxů s funkčními barvami a `carve` je dobrý *frontend* pro objemový popis.
   - **AO pravidla a jitter barvy** z `hash` použít na hladké meshe jako vertex AO.
2. **Rigidní mesh na kloub místo skinování.** Náš `eng_gen_char` dělá skinning už z konstrukce (smooth-min kapsle), a to je lepší. Převzít jen *rig a pózy*, ne rendering dílů.
3. **Jedinou stínovou mapu.** Pro města a planetu potřebujeme CSM. Fade na okraji ale převzít.
4. **DOM/CSS overlaye na gradaci a cut-iny.** U nás jsou součástí post průchodu.
5. **Styl `onBeforeCompile` a patchování shader chunků.** Je to daň za Three.js. My píšeme HLSL přímo s explicitními variantami.
6. **Magické konstanty v kódu.** Desítky čísel (`0.42`, `0.62`, `[25,160,0.42]` …) jsou rozeseté po kódu. U nás patří do datových tabulek s hot-reloadem.
7. **Bayer + kvantizaci na 72 úrovní jako výchozí.** Jde proti čistotě nativního rozlišení. Nanejvýš jako volitelný look (nebo jen dither proti bandingu na 8bit výstupu, bez kvantizace).
8. **Lineární `strike()` přes celý dav.** U nás dotazy do prostorové mřížky nebo BVH.
9. **CPU skládání matic davu.** U nás compute nebo VS z pózového bufferu.

---

## 7. Jak to dosahuje kvality — upřímné hodnocení

Prohlédli jsme screenshoty v `media/`: `title.jpg`, `trials.jpg`, `select.jpg`, `zhaoyun.jpg`, `lubu.jpg`, `guanyu.jpg`, `zhugeliang.jpg` a `story.jpg`.

**Co funguje:**

- **Světlo a atmosféra dělají 70 % dojmu.**
  - Title a trials: nízké zlaté slunce, teplé protisvětlo, prachový závoj a kouřové sloupy.
  - Díky AP a prachu v mlze má scéna hloubku i s velmi jednoduchou geometrií.
  - Konzistentní grade (Lottes + split-tone) dává filmový tón, který voxel sám nemá.
- **Čitelnost hrdiny.** Rim a fill na hrdinovi a dissolve vojáků v kuželu výhledu: i ve `zhaoyun.jpg`, kde je na obrazovce chaos (drak, desítky vojáků, trosky), je hrdina k nalezení.
- **Hustota feedbacku.**
  - Trosky naležato, praskliny v zemi, prach a jiskry.
  - Combo čítač, kaligrafický cut-in.
  - Každý zásah zanechá stopu. Tak vzniká žánrový pocit „mlátím tisíc lidí“.
- **Detail na modelech hrdinů.** `select.jpg` a `title.jpg`: lamelová zbroj z `lamellar()` s plátky, švy a lemy, střapce a stuhy z řetězů. Na voxel je to velmi bohaté. AO z meshe dává plátům plasticitu.
- **UI a 2D art** (story svitek, výběr, title) jsou řemeslně nadprůměrné. S UI enginu to ale přímo nesouvisí.

**Co nefunguje (vzhledem k naší laťce):**

- **Bloom a aditivní efekty přepalují.**
  - `zhugeliang.jpg` a `guanyu.jpg`: Musou vlny zaplní třetinu až polovinu obrazovky bílo-žlutou nebo zelenou mlhou a scéna zmizí.
  - Hot-desat se tomu snaží bránit, ale celkový budget přepalu chybí.
  - Pro nás z toho plyne pravidlo: rozpočet jasu a krytí obrazovky pro VFX.
- **Prostředí je řídké.**
  - `lubu.jpg`: útesy jsou kvádrové schody, stromy kostičkové kužely, terén plochý s vertex barvami.
  - Na dálku drží scénu mlha, zblízka působí holá.
  - Hustá města by takhle nefungovala.
- **Voxelový vojáci v hromadě splývají v šum.** Na snímcích jsou dav i trosky na pomezí čitelnosti.
- **Rigidní díly.** Zblízka (`select.jpg`) jsou vidět mezery a schody v kloubech.
- **Bez interpolace renderu** bude pohyb na monitorech s vyšší frekvencí trhaný. Ze screenshotů to vidět není, plyne to z kódu.

**Shrnutí:** Kvalitu dělá *pipeline světla, gradu a feedbacku*, ne geometrie. To je pro Wallhammer Zero dobrá zpráva. Mlhu s AP, Lottes grade, rim hrdiny, debris a kopance kamery můžeme převzít skoro beze změny a dát je pod hladké generované meshe, se kterými se dostaneme výš.

---

## 8. Otevřené otázky

1. **Determinismus napříč platformami.**
   - Repo spoléhá na `Math.sin/cos/atan2` v simulaci.
   - U nás: zakázat libm v simulaci a používat vlastní polynomy a fixní zaokrouhlování? Jinak golden hashe nevydrží Metal/Vulkan/D3D12 build na různých CPU (x64 vs ARM, FMA kontrakce).
   - Rozhodnout `-ffp-contract=off` a vlastní trigonometrii.
2. **Dav: CPU vs GPU skládání póz.**
   - Při 26 kanálech × 2000 vojáků je compute shader triviální.
   - Pro budoucí skinnované vojáky ale potřebujeme rozhodnout mezi **VAT** (vertex animation textures) a **GPU skinováním s pózovým bufferem**. Obojí v SDL_GPU jde přes storage buffery.
3. **Rigidní vs skinnovaný dav na střední a velké vzdálenosti.** Rigidní díly jsou levné a dobře se instancují. Nebylo by dobré mít rigidní LOD i pro naše skinnované postavy na dálku, se stejnou pózou jako tady?
4. **Škálování `strike()` a separace.** Jaký prostorový index pro tisíce aktérů na planetě? Hashovaná mřížka po dlaždicích nebo BVH?
5. **Interpolace vs determinismus FX.** Repo kvůli determinismu stárne FX v sim. snímcích a interpolaci vynechává. Jak skloubit interpolaci transformací s deterministickými capture pro golden screenshoty? Návrh: headless capture vždy s alpha = 0.
6. **Voxel jako frontend `eng_gen_char`/`eng_gen_mesh`.** Má smysl popisovat tvory přes boxy, funkční barvy a carve a výsledek převádět na SDF → hladký mesh? Nebo zůstat čistě u smooth-min kapslí? Rozumný může být hybrid: kapsle pro tělo, boxový sculpt pro zbroj a doplňky.
7. **Jak přeložit vizuální laťku.** Přenesená pipeline světla stačí na GTA III. WoW navíc vyžaduje ručně působící textury. Ty máme z jednorázového AI generátoru. Ověřit, že grade (Lottes + split-tone + AP) nerozbije jejich malířský charakter.
8. **Rozpočet jasu VFX.** Repo to neřeší a Musou přepaluje. Potřebujeme metriku (podíl pixelů nad prahem luminance) v headless contact sheetech jako test.
