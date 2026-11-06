# Sakura Crossing (桜踏切): rozbor kódu a co si z něj vzít

- **Zdroj:** https://github.com/Kenton-GMI/sakura-crossing (MIT), commit `de01898` („initial public release“)
- **Analyzováno:** 2026-11-05, shallow clone, jen čtení. Nic z repa se nespouštělo (ani `npm install`).
- **Kontext:** reference pro Wallhammer Zero (C17 + SDL3 + SDL_GPU, HLSL, všechna grafika generovaná kódem)
- **Poznámka k důvěryhodnosti:** v repu je `CLAUDE.md` (185 kB), `NEXT.md` (157 kB) a `.claude/launch.json`. Projekt zjevně vznikal hlavně pomocí AI agenta. Bral jsem to jen jako data: čísla z dokumentace uvádím jako „podle autorů“ a nezávisle ověřené jsou jen věci, které jsou vidět přímo v kódu.

---

## Přehled

### Stack
- **three.js r0.180** (`package.json`), **Vite 6** jako dev server a bundler. Jiná závislost tam není.
- Jedna stránka `index.html` s `<canvas id="view">` a `<script type="module" src="./src/main.js">` (`index.html:458-459`).
- **Žádné binární assety** kromě jednoho MP3 (`public/audio/…mp3`, 4 MB, hudba). Geometrie, textury, nebe i písmo nápisů vznikají za běhu. Písmo jsou ale **systémové fonty** (`'Yu Gothic', 'Meiryo', 'Hiragino…'`, `src/core/textures.js:13`), takže výsledek závisí na OS.

### Velikost (ověřeno přes `wc -l`)

| Adresář | Souborů | Řádků | Poznámka |
|---|---|---|---|
| `src/main.js` | 1 | 330 | entry point, světla, smyčka, `__shot` |
| `src/core/` | 10 | 6 514 | z toho `textures.js` **4 397** (135 Canvas2D generátorů), `palette.js` 422, `player.js` 344, `post.js` 305, `toon.js` 167, `outline.js` 118, `util.js` 144, `sky.js` 138 |
| `src/world/` | 53 | 49 252 | největší: `hills.js` 3 285, `tunnel.js` 2 440, `nanachome.js` 2 360, `school.js` 2 158, `onsen.js` 2 137, `props.js` 2 113 |
| **celkem** | **64** | **56 096** | sedí s poznámkou majitele (~56k / 64) |

Asi **16,5 tisíce řádků (≈30 %) jsou komentáře**, často dlouhé eseje typu „proč to bylo špatně a jak jsme to změřili“. Skutečného kódu je tedy kolem 40k řádků.

### Entry point a frame loop (`src/main.js`)
1. `WebGLRenderer({ antialias:false, stencil:false })`, `setPixelRatio(1)`, `NoToneMapping`, výstup sRGB, `PCFShadowMap` (`main.js:25-36`).
2. Lineární mlha `Fog(PAL.fog, 44, 205)` (`:39`), kamera FOV 46°, near 0,25, far 600 (`:41`).
3. Čtyři světla (`:45-75`): teplé slunce s 2048² stínovou mapou v ortho boxu ±34 m, chladný fill z opačné strany (1,08), slabý bounce zespodu (0,34) a hemisphere s fialovou zemí.
4. `buildSky()` a potom `buildWorld()`. **Celý svět se postaví synchronně při startu**: všechny builders, merge a nakonec ohnutí na planetu (`world/index.js:737`). Streaming ani LOD neexistují.
5. `frame()` (`main.js:207-253`) dělá:
   - `dt = min(clock.getDelta(), 1/20)`
   - `player.update`, `ebike.update`, `world.update` (sekvence přejezdu, vlak, closure „updaters“, CPU update okvětních lístků)
   - **přesune světla do lokálního tečného rámce planety pod hráčem** (`seatLight`, `:150-157`, `:233-238`). Autoři to sami nazývají „fyzikálně cheat“: ať hráč dojde kamkoli, osvětlení vypadá stejně.
   - pohybuje sky dome a mraky spolu s kamerou
   - dělá raycast pick interaktivních objektů a aktualizuje HUD
   - volá `pipeline.render()` a `requestAnimationFrame`
6. Klávesy: `O` a `G` vypínají ink a grade pass (`:203-204`), `P` přepíná orbitální pohled na planetu.

---

## Architektura

### Moduly
- **`core/`** je „engine“: materiály (`toon.js`), post pipeline (`post.js`), obrysy (`outline.js`), textury (`textures.js`), paleta (`palette.js`), pomocné funkce a merge (`util.js`), nebe (`sky.js`), hráč a kolize (`player.js`), HUD a audio.
- **`world/`** je obsah:
  - **knihovny generátorů:** `shops.js` (`makeShop`), `vehicles.js` (`makeVehicle`), `buildings.js` (`makeHouse`, ploty a zdi), `props.js` a `streetprops.js` (desítky `makeX()`), `trees.js` (sakury, háje, cedry, bambus, keře)
  - **terén:** `street.js` (výškový profil a terrain grid), `landform.js` (výkop kanálu), `hills.js` (lattice kopců), `lakeform.js` a `lake.js` (jezero), `planet.js` (koule a ohýbání)
  - **~25 „district“ modulů** (`ichome.js`, `nichome.js`, `onsen.js`, `school.js`, …). Každý **ručně** rozmisťuje objekty na konkrétní souřadnice.
  - **dva globální „sweepy“**: `district.js` (dovybavení domů) a `traffic.js` (rozmístění všech 18 aut v jedné tabulce, aby se dala hodnotit distribuce)

### Jak jsou organizované generátory
Všechny generátory mají stejný tvar:
```js
export function makeX(o) {          // o = plain object, všechno má default přes ??
  const m = mats();                 // lazy cache materiálů modulu
  const rng = rngKit(o.seed ?? N);  // deterministický PRNG per instance
  const parts = { wall:[], roof:[], trim:[], metal:[] /* …per materiál */ };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });
  // … stovky push(…) s BoxGeometry/Extrude/Cylinder + trs(…) …
  for (const k in parts) g.add(new THREE.Mesh(bake(parts[k]), matFor[k]));
  g.position.set(o.x, o.y, o.z); g.rotation.y = FACE_RY[o.face];
  ctx.add(g); ctx.collide(…AABB…); return g;
}
```
Princip je **„bucket per materiál, potom merge“**. Jeden obchod tak skončí jako zhruba 6 až 8 draw callů plus nemergované dekály (cedule, sklo, interiérová plocha).

### Datový tok a sestavení světa (`world/index.js`)
- `buildWorld` vytvoří **`ctx`** (`index.js:91-134`) s callbacky `add`, `collide(x0,z0,x1,z1,top,bottom)`, `platform`, `cut`, `groundAt(x,z)`, `interact` a `update`. Builders tedy nevracejí data, ale **zapisují do sdílených seznamů** (colliders, platforms, cuts, interactables, updaters).
- **Na pořadí záleží** (`index.js:249-327`, každý krok je okomentovaný). Kopce jdou před tunel, tunel před školu, jezero před břehy, rezidenční bloky před `buildDistrict`, auta až po všech plochách, protože se usazují přes `ctx.groundAt`.
- Districts vracejí **seznamy spotů pro vegetaci** (`sakura`, `grove`, `cedar`, `bamboo`, `petals`). Ty se sesbírají a **zasadí najednou** (`index.js:329-337`, `509`), aby celý svět měl jeden merged mesh kmenů a tři instanced koruny.
- Úplně na konci běží **`bakeToPlanet(root, { maxEdge: 4.0 })`** (`index.js:737`): rovinný svět se ohne na kouli.
- Výška země: `heightAt(x, z, fromY)` = analytický `streetHeight + reliefAt + hillAt`, potom `min` přes výkopy (cuts) a `max` přes platformy, jen ty v dosahu kroku od `fromY` (`index.js:773-793`). Díky tomu jde chodit po lávce i pod ní.

### Konfigurace a tabulky
- **`PAL`** (`core/palette.js`): přes 210 pojmenovaných barev v jednom souboru. Úzká paleta (teplé off-white, šedofialová silnice, zelené do tyrkysova, světlé růžové) a čtyři saturované akcenty vyhrazené pro fokální objekty.
- **Tabulky defů přímo v kódu**: `houseDefs` (`index.js:144-232`), `poleDefs`, `sakuraSpots`, `SPEC` aut, `traffic.js` (44 řádků `kind: '…'`), `PADS` a `KEEP` masky terénu. Žádné JSON nebo data soubory, všechno je JS literál.
- Determinismus zajišťuje `mulberry32` a `rngKit(seed)` (`util.js:17-39`) se seedem na každý objekt.

---

## Rendering pipeline

### Pořadí passů (`core/post.js:270-296`)

| # | Pass | Cíl | Formát | Poznámka |
|---|---|---|---|---|
| 0 | Shadow map (three.js interní) | 2048² depth | – | jedno directional světlo, ortho ±34 m, PCF, bias −0,0004, normalBias 0,035 (`main.js:47-56`) |
| 1 | Scene (forward) | `rtScene` | **RGBA16F** + `DepthTexture` UInt32, Nearest | všechny materiály, mlha, sky dome (`post.js:211-224`) |
| 2 | **Ink** (fullscreen) | `rtA` | RGBA16F | čtení barvy a hloubky, inkoust z druhé diference lineární hloubky (`post.js:22-98`) |
| 3 | **Grade** (fullscreen) | `rtB` | **RGBA8** | split-tone, warmth, lift, saturace, vinětace a ruční linear→sRGB (`post.js:100-144`) |
| 4 | **FXAA** (fullscreen) | backbuffer | – | zjednodušené FXAA (5 tapů luma a 2+2 vzorky podél směru, `post.js:146-190`) |

- Obrysy přes inverted hull se kreslí **v rámci passu 1** jako back-face shell s `renderOrder − 1` (`outline.js:72-105`).
- Barevný pass je **čistý forward** (MeshToonMaterial). Deferred, G-buffer ani normálový buffer tu nejsou.

### Rozlišení a AA (`post.js:243-268`)
- **Supersampling s pixel budgetem:** `scale = forceScale || (dpr < 1.5 ? 1.5 : min(dpr, 2))`. Když `w·h·scale² > 4,6 Mpx`, scale se sníží na `sqrt(budget / (w·h))`.
- Interní RT mají velikost `w·scale × h·scale`, ale **canvas běží v CSS pixelech** (`setPixelRatio(1)`). Na HiDPI displeji se tedy renderuje 2× interně, FXAA pass to bilineárně zmenší do 1× CSS a prohlížeč pak znovu upscaluje na fyzické pixely. Nativního rozlišení na retině se nedosáhne. Výsledkem je SSAA do CSS rozlišení.
- Tloušťka inkoustu se škáluje s rozlišením: `uThickness = 1.05 + 0.55·scale` (texely interního RT), takže čára má zhruba 2 výstupní pixely (`post.js:267`).
- AA je kombinace mírného SSAA (1,5–2×) a FXAA. MSAA vypnuté (`antialias:false`).

### Materiály (`core/toon.js`)
- **`cel(opts)`** (`toon.js:88-133`): `MeshToonMaterial` s `gradientMap(bands)`, defaultně `flatShading: true`, s patchnutým odstínem stínu. Cache podle **signatury parametrů** (`toon.js:108-112`). Materiály s mapou se necachují (`cache:false` je v kódu 307×).
- **`flat(opts)`** (`toon.js:138-161`): neosvětlený `MeshBasicMaterial` pro nebe, sklo, svítící panely, cedule, inkoust a interiéry za sklem.
- V kódu je **888 volání `cel({…})`** a **76 různých hodnot `tint`**. Každý tint je přes `customProgramCacheKey` (`toon.js:78`) **samostatný shader program**. Pro nás je to antipattern (viz níže).
- Prakticky **žádné povrchové textury.** Zdi, silnice, střechy i auta mají jednu plochou barvu. Textury jsou jen nápisy, dekály a „interiéry“.

### Model osvětlení
- **Toon BRDF** z three.js: `coord = dot(N, L) · 0.5 + 0.5` (half-Lambert), z toho lookup do 1D rampy s `NearestFilter`.
- **Patch** do `lights_toon_pars_fragment` (`toon.js:48-63`) obarví tmavá pásma do fialova, viz Klíčové techniky.
- Ambient tvoří hemisphere (`PAL.hemiSky` 0xdcecff, `PAL.hemiGround` 0xb6a6c6, intenzita 1,12) a k tomu dvě nestínící directional fill světla. Tím se zaručí, že „nic ve stínu nikdy nezčerná“.
- Stíny vrhá jen slunce. Vybrané objekty stíny záměrně nevrhají nebo nepřijímají:
  - planeta nevrhá, jinak by svět zastínila vlastní odvrácená polokoule (`planet.js:594-596`)
  - koruny sakur nepřijímají, aby nešedly (`trees.js:172-185`)
  - průhledné objekty nevrhají (`util.js:123-132`)
  - tenké římsy nevrhají, kvůli zubatým stínům (`CLAUDE.md`, sekce Traps)
- **Nesoulad komentáře a kódu:** hlavička `main.js:19-20` tvrdí, že stínová kamera „follows the player on a snapped grid“. V kódu (`main.js:234-235`) ale žádné přichytávání k mřížce texelů není, světlo se posouvá spojitě s hráčem. Při chůzi se proto dá čekat shimmering stínových hran.

### Post
- **Ink:** viz Klíčové techniky.
- **Grade** (`post.js:122-141`):
  ```glsl
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = smoothstep(0.02, 0.55, l);
  c *= mix(uShadowTint /*0xada8d0*/, uLightTint /*0xfff7e8*/, k);  // split-tone
  c += vec3(uWarmth, uWarmth*0.45, 0.0) * l * 0.35;               // teplý nádech
  c += uLift * (1.0 - k);                                          // nikdy černá
  c = mix(vec3(l), c, uSaturation /*1.12*/);
  c *= 1.0 - uVignette * pow(clamp(length(uv-0.5)*1.42,0,1), 2.6);
  ```
- **Sky** (`core/sky.js:12-56`): back-face koule, 3-stop gradient (haze, mid, top) a **jemná kvantizace** `t = mix(t, floor(t·26)/26, 0.35)`, která dá „airbrush“ pruhy. Mraky jsou 22 billboardových dvojic rovin (světlá přední a tmavší zadní posunutá) s Canvas2D texturou z elips se seříznutým spodkem (`textures.js:461-480`).
- **Mlha** lineárně 44–205 m. Ink fade běží 40–98 m, takže pozadí se rozplyne do oparu dřív, než by se zahustilo čarami.

---

## Klíčové techniky do hloubky

### 1. Toon rampa a hue-shifted stíny
- **Soubor:** `src/core/toon.js:15-80`
- **Jak to funguje:** rampy jsou 1D `DataTexture` s `NearestFilter`:
  ```js
  const RAMPS = { 2:[96,255], 3:[92,178,255], 4:[80,142,202,255], 5:[74,124,172,214,255],
                  soft:[180,255], soft3:[172,214,255] };   // soft = světlé masy (květy)
  ```
  Patch nahradí jeden řádek three.js shaderu:
  ```glsl
  // původně: vec3 irradiance = getGradientIrradiance(N, L) * directLight.color;
  vec3 celBand    = getGradientIrradiance( geometryNormal, directLight.direction );
  vec3 irradiance = celBand * mix( uShadowTint, vec3(1.0), celBand ) * directLight.color;
  ```
  Ve vzorci `E = b · lerp(tint, 1, b) · L_color` je `b` hodnota pásma rampy (0,36 / 0,70 / 1,0). Pro `b = 1` je výsledek čistá barva světla. Pro tmavé pásmo je `b²`-ish ztmavení **násobené fialovým tintem** (typicky `0x6f6790`, `0x5c5680`, `0x6a6288`). Stín tedy kromě ztmavení mění i odstín. Tint je per-materiál: květy mají růžové tinty (`0xe2c3d2`…), aby nešedly, rezavé věci teplejší.
- **Kombinace:** výsledek se sčítá přes tři directional světla (slunce, fill, bounce) plus hemisphere. Stín ze shadow mapy vynuluje `directLight.color` slunce, takže ve stínu zůstane fialový fill a hemi. Proto jsou vržené stíny modrofialové, ne šedé (dobře vidět na `docs/hero-1-crossing.jpg`).
- **Cena:** zanedbatelná ALU, jeden texture fetch na světlo. Skutečný náklad je v **počtu programů**: 76 tintů × další defines.
- **Omezení:**
  - Patch je string replace v three.js chunku (`src.includes(TOON_LINE)`), takže při upgradu three tiše přestane fungovat (`patchAvailable`).
  - Rampa je globální, ne per-světlo.
  - `flatShading: true` všude, takže tón se kvantuje per facet. U koule planety to dělalo schodovitý terminátor, proto tam autoři vynutili radiální normály (`planet.js:567-586`).

### 2. Ink lines z druhé diference lineární hloubky
- **Soubor:** `src/core/post.js:22-98`
- **Jak to funguje:**
  ```glsl
  float dc = linearDepth(uv);  if (dc > uSkyDepth /*420*/) return col;   // nebe bez čar
  float sx = (dl + dr - 2.0*dc) / dc;     // 2. diference, normalizovaná vzdáleností
  float sy = (du + dd - 2.0*dc) / dc;
  float convex  = max(0.0, sx) + max(0.0, sy);   // siluety, vypouklé hrany → silně
  float concave = max(0.0,-sx) + max(0.0,-sy);   // vnitřní kouty → slabě (×0.42)
  float edge = smoothstep(uSens*0.32, uSens /*0.0042*/, convex);
  edge = max(edge, smoothstep(uConcave /*0.026*/, uConcave*3.4, concave) * uConcaveAmount);
  edge *= 1.0 - smoothstep(40.0, 98.0, dc);          // fade do oparu
  vec3 line = mix(uInk /*0x39324f*/, col * 0.42, 0.22);  // inkoust si drží kus barvy
  ```
  První diference by na šikmých plochách, například na silnici pod ostrým úhlem, kreslila mazanici. **Druhá diference je na jakékoli rovině nulová** bez ohledu na úhel, takže reaguje jen na skutečné siluety a zlomy. Asymetrie mezi convex a concave napodobuje animátorské „kontaktní čáry“, které jsou slabší.
- **Cena:** 5 depth tapů a 1 color tap na pixel v (super-sampled) rozlišení. Levné.
- **Omezení:**
  - **Vidí jen hloubku.** Hranu mezi dvěma koplanárními plochami různé barvy nebo materiálu nenakreslí. Autoři to obcházejí geometrií („parapet, so a flat roof still has an edge to ink“, `shops.js:~107`) a záměrnými odskoky (shoulder line aut, `vehicles.js` komentář u `CW`). Hodně „detailu“ v geometrii existuje jen proto, aby měl inkoust co najít.
  - Tenké a průhledné věci (lístky, dráty) musí mít `depthWrite:false`, jinak z nich vznikají inkoustové tečky (`CLAUDE.md`, Traps).
  - Normalizace `/dc` a pevné prahy jsou laděné na near 0,25 a far 600.

### 3. Inverted hull obrysy (hero props)
- **Soubor:** `src/core/outline.js`
- **Jak to funguje:** k meshi se přidá back-face shell a jeho vrcholy se posunou **v clip space** podél vyhlazené normály, takže čára má konstantní šířku v pixelech:
  ```glsl
  vec4 clip  = projectionMatrix * mv;
  vec3 clipN = normalize((projectionMatrix * vec4(n, 0.0)).xyz);
  clip.xy += clipN.xy * vec2(res.y/res.x, 1.0) * uThickness * clip.w * 0.5;
  ```
  Normály jsou vyhlazené přes `mergeVertices(geo, 1e-4)` a `computeVertexNormals()`, s cache ve WeakMap (`:51-66`). Bez toho by se shell na hranách krabic roztrhl. Podporuje i InstancedMesh, kdy shell sdílí `instanceMatrix`.
- **Kde se používá:** vlak, závory, automaty, kei truck. **V `makeShop` ale i na všechny merged meshe `wall` a `roof`** (`shops.js:379`). Celkem 150+ volání (`school.js` 26, `props.js` 18, …).
- **Cena:** **+1 draw call na každý obrysovaný mesh** a stejný počet trojúhelníků navíc. Autoři to sami měřili a u aut hull vypnuli: „fifty extra shells is fifty extra draw calls in a scene that is measurably draw-call bound“ (`vehicles.js:63-70`). Podle `NEXT.md:1225` dělal hull na autech +100 až +184 draw callů na pohled.
- **Omezení:** posun v clip space se na konkávních tvarech láme, smooth normály vyžadují svařenou geometrii a shell nevrhá stín.

### 4. Procedurální Canvas2D textury
- **Soubor:** `src/core/textures.js` (4 397 řádků, **135 exportovaných generátorů**)
- **Jak to funguje:** `make(w, h, draw, {srgb, repeat, aniso})` vytvoří canvas, zavolá `draw(ctx2d)` a zabalí výsledek do `CanvasTexture` (`textures.js:16-32`). Výsledky se cachují podle klíče `cached('shopSign', …)`. K tomu pomocné funkce `fitText` (zmenšuje font, dokud se text nevejde), `centered` (s letter-spacingem) a `vertical` (svislé japonské psaní).
- **Druhy textur:**
  - **nápisy a štíty** (zhruba 70 %): fascie obchodů, svislé cedule, noreny, menu, jízdní řády, mapy, cenovky automatů, názvy ulic, SPZ
  - **„interiéry“ za sklem**: `shopInterior` (regály, chladicí vitríny, pulty), `litWindowTex`, `classroomTex`, `gymInterior`, `tatamiRoom`. Jsou to ploché 2D malby na rovině zapuštěné ve výklenku, ztmavené do fialova.
  - **masky a alfy**: `petalTex` (bezierový lístek), `cloudTex`, `chainLinkTex` (pletivo jako alfa mřížka; mipmapy ho v dálce rozmažou do „světlého závoje“ místo moaré)
  - **opakované vzory**: `tactileTex` (hmatová dlažba), `shutterTex` (žaluzie), `roadPaint` (止まれ, šipky, kosočtverec)
  - Nejčastější velikosti jsou 512×256, 384×512 a 512×384, maximum 1024×256.
- **Výslovné pravidlo:** „crisp shapes and type, **never photographic noise**“ (`textures.js:10`). Žádný šum, žádné povrchové materiály.
- **Cena:** CPU při startu, desítky MB textur bez komprese. Každá mapovaná textura je vlastní materiál, tedy vlastní draw call a bind, protože se nic neatlasuje.
- **Omezení:** závislost na systémových fontech (nedeterministické napříč OS), žádné atlasy, žádné povrchové detaily (cihly, omítka, asfalt).

### 5. Generátor obchodů a budov (`makeShop`, `makeHouse`)
- **Soubory:** `src/world/shops.js:64-395`, `src/world/buildings.js:51+`
- **Jak to funguje (`makeShop`):**
  - Parametry: `x, z, y, w, d, face ('z+'|'z-'|'x+'|'x-'), kind (nájemce), floors (1|2), h1, h2, roofKind ('gable'|other), recess, openW, awning, shutter (0..1), wall/roof (index do palety), fascia, signBox, interiorMap`.
  - **Autoruje se vždy čelem k +Z** a celá skupina se pak otočí podle `face`. Komentář to zdůvodňuje: „far less error-prone than branching on an axis inside every measurement“.
  - Hlavní objem je krabice, která **končí 0,9 m před uliční čarou**. Vzniklou díru rámují **pilíře a nadpraží**. Do výklenku přijde: interiérová plocha (`flat`, ztmavená `0x8b8598`), sklo s opacity 0,22, sloupky a jeden šikmý odlesk (`shops.js:118-176`). Autoři: „a glazed decal on a solid box reads as a sticker, every time“.
  - Střecha je buď gable (2 nakloněné desky, hřeben a extrudované štítové trojúhelníky), nebo plochá s atikou, aby měl inkoust hranu.
  - Volitelně poloviční roleta (`shutter≈0.35`, „back in ten minutes“), fascia nebo light box, markýza, lucerny, menu, květiny.
  - Geometrie se sbírá do `parts = {wall, trim, roof, metal, metalDark, tile}`, pak se volá `bake()` per klíč a hull na wall a roof (`shops.js:374-380`). Následuje AABB collider ve world osách (`:386-391`).
- **Rozsah použití:** 15 volání `makeShop` v 7 souborech („one generator, nine tenants“). `makeHouse` má 6 call-sites, ale ty předávají celé tabulky defů (`houseDefs` ~25 domů).
- **Cena:** zhruba 6–8 merged meshů, 2 hully a desítky malých nemergovaných meshů (cedule, sklo, lampiony, menu) na jednotku.
- **Omezení:** je to parametrická šablona, ne gramatika. Jeden typ hmoty (krabice, volitelně setback 2. patra), žádné obecné dělení fasády, žádná okna jako opakovaný modul. Rozmístění je **ruční**: každá jednotka má v district modulu zadané souřadnice.

### 6. Generátor vozidel (řízený tabulkou)
- **Soubor:** `src/world/vehicles.js` (822 řádků)
- **Jak to funguje:** typ auta je **řádek tabulky `SPEC`** (`:132-223`), ne funkce. Typů je devět: kei, keivan, hatch, sedan, wagon, minivan, van, boxtruck, minibus. Řádek popisuje jen to, co auto podle autorů „čte“:
  ```js
  kei: { L:3.40, W:1.475, R:0.275, axle:[1.16,-1.19],
         sill:0.38, waist:1.00, roof:1.70,            // spodek, beltline, střecha
         cab:[-1.60, 1.15], rakeF:0.42, rakeR:0.14,    // kde začíná prosklení + sklon
         seams:[0.12,-0.80], handles:[-0.60,-1.40] },
  van: { …, side:[0.70,1.62] /* prosklení jen nad kabinou = van vs. minivan */ },
  boxtruck: { …, box:{ x0:-2.40, x1:0.28, y0:1.06, y1:2.46 } },
  ```
  Všechno ostatní se **odvozuje**: podběhy, nárazníky, světla, SPZ, švy, kliky, zrcátka, stěrače, kola (pneu, disk 10 mm nad bokem, matice).
  - Klíčová primitiva je `panel(arr, ax, ay, bx, by, w, t)` (`:245-253`): **panel mezi dvěma body bočního profilu**. Úhel se počítá z koncových bodů, ne z „odhadnutého tiltu“, protože podle autorů byl tilt krabice „inverted half the time“.
  - Skla se kladou **na** klín a posunou se o 62 mm podél vnější normály („depth is built outward“). Jinak skončí uvnitř karoserie.
  - Kabina je o 0,14 m užší než karoserie. Vzniklý schod („shoulder line“) dá inkoustu horizontální čáru.
- **Výstup:** 7 merged meshů (body, deep, dark, brite, glass, lampF, lampR) plus SPZ. Hull jen při `o.hero`.
- **Paleta `CAR`** (`:82-104`) obsahuje reálné japonské barvy. Tmavé barvy jsou **schválně zesvětlené**, protože zadek auta je vždy odvrácený od slunce a spodní pásmo rampy by ho slilo s inkoustem.
- **Rozmístění** je v jedné tabulce v `traffic.js` (18 aut, 8 na vozovce) se šesti pravidly („nikdy dvě auta proti sobě přes vozovku“, „žádné dvě ve stejném záběru ve stejné vzdálenosti“).
- **Cena:** zhruba +100 až +184 draw callů na pohled pro celou flotilu (`NEXT.md:1356-1366`).

### 7. Terén: lattice kopců, slope limiter, jezero a kontrola úniku
- **Soubory:** `src/world/hills.js`, `src/world/lakeform.js`, `src/world/street.js`
- **Vrstvy terénu:**
  1. `street.js`: analytický profil `groundY(z)` (`street.js:75-77`, smoothstepy podle z) a terrain grid 2 m. Z gridu se vyřezávají trojúhelníky výkopu kanálu (`cutTrench`).
  2. `planet.js`: koule 65 mm pod gridem.
  3. `hills.js`: **třetí povrch nad oběma**, který se ukáže jen tam, kde je pole kladné. Hranicí je kontura `field = 0`, tedy čára, ne plocha, takže nemá s čím z-fightovat.
- **Lattice:** `CELL = 1.5 m` (`hills.js:168`), trojúhelníková mřížka s jitterovanou diagonálou (`flipped(i,j)`). Výška se počítá **jen v uzlech** (`nodeAt`) a `fieldAt` interpoluje lineárně přes stejné dva trojúhelníky, jaké má mesh (`:1796-1820`). **Chůzi i render tedy obsluhuje identický povrch, bit po bitu.** Plochý shading, takže každá hrana facetu je zlom, který ink pass nakreslí.
- **Tvar:**
  - vrcholy jsou kvartické hrboly `h·(1−d²)²` na elipsách, kombinované přes **screen blend** místo součtu (dva překryvy dají hřbet, ne dvojnásobnou výšku)
  - od nich se odečte 2,6 m podstavec `PED`, což určuje, kde svah začíná
  - keep-out maska nad zastavěnou plochou
- **Slope limiter** (`hills.js:1569-1640`): relaxace, která **jen snižuje**:
  ```js
  for (pass < 140) { worked = false;
    for each node k: cap = min over 4 sousedů ( NODES[n] + max(drop[k], drop[n]) );
                     if (cap < h) { NODES[k] = max(-SKIRT, cap); worked = true; }
    if (!worked) break; }
  // drop = slopeLimitAt(x,z)·CELL: 1.9 v železničním/kanálovém koridoru, jinak 0.52
  ```
  Protože jen snižuje, zůstanou zachované všechny záruky (keep-out zůstane 0). Konverguje k nejvyššímu povrchu pod navrženým, jehož gradient je všude v limitu.
  - **Past, kterou popisují:** limiter přišpendlený podél přímky vyrobí dokonale rovnou rampu jako násep. Řešením je mít v keep-out hranici schody, aby úpatí šlo diagonálně.
  - Po limiteru se přidají až **tři oktávy undulace**. Amplituda je úměrná výšce (`h/2.4`, `h/1.6`, `h/0.7`), clampnutá na ≥ 0, aby se prohlubně neinvertovaly.
- **Tónování bez textur** (`faceTone`, `hills.js:2052`): každý facet dostane jeden z pěti tónů podle sklonu, orientace ke slunci (`lit`), výšky, pole „cover“ a jitteru `tj`:
  - bare earth: sklon > 0,88 + …
  - ススキ / bracken: sušší pokryv
  - slunný trávník, střední a vlhký tmavý tón: podle `key = lit + (h−7)·0,022 + cover·0,55`

  Každý tón je **samostatný non-indexed mesh**, sousední facety sdílejí přesné pozice, takže švy nevzniknou. Autoři naměřili rozdělení 8/10/27/24/31 %.
- **Jezero** (`lakeform.js`): voda je **plochá rovina nad datem** (`LEVEL = 3.40 m`, `:119`) a skryje ji všude, kde je terén výš. **Břeh je kontura `field = LEVEL`**, takže je nepravidelný zadarmo. Hloubka `LEVEL − field` řídí rákosí, lekníny, tónové pásy a mola. Okraj nádrže se odvozuje z autorovaného polygonu břehu (`rimAt`) se sklonem ≤ 0,50, aby ho limiter nesnědl.
- **Kontrola úniku** `lakeLeakCheck` (`lakeform.js:740-779`): BFS flood fill oblasti `field < LEVEL` ze semínka uprostřed pánve na mřížce 1,5 m. Vrací, jak daleko za břeh fill došel (`escaped > 30 m` znamená průsak) a zaplavenou plochu (porovnává se s `lakeStats`). Dále je tu **`hillSafety(world)`** (`hills.js:1910`), který vzorkuje `hillAt` přes všechny collidery a platformy a hlásí nejhorší přesah kopce do zástavby. Obě funkce jsou exportované, ale **v `src/` se nevolají**: spouští se ručně z konzole nebo z Node.
- **Cena:** kopce mají ~45 000 uzlů, ~60k trojúhelníků po ohnutí a 6–8 draw callů (podle `hills.js:185-190`).
- **Omezení:** výškové pole nemá díry, takže tunely jsou samostatná geometrie se „zářezem“ v lattice (`inNotch`) a čepicemi. Tři povrchy s odstupy 15–65 mm byly zdrojem desítek bugů (zdokumentovaných v `planet.js:413-446` a `hills.js:1574-1590`).

### 8. Ohnutí světa na planetu
- **Soubor:** `src/world/planet.js`
- **Mapování:** equirectangular, `R = 160 m` (`:31`), střed `(0, −R, 0)`. `x` odpovídá zeměpisné délce (obvod 1005 m), `z` šířce. Železnice leží na rovníku (z = 0), takže je to hlavní kružnice, která se uzavře bez deformace.
  ```js
  normalAt(x,z) = ( sin(x/R)·cos(z/R), cos(x/R)·cos(z/R), sin(z/R) )
  positionAt(x,y,z) = CENTER + normalAt(x,z)·(R + y)
  basisAt: up = normal, east = (cos λ, −sin λ, 0), north = (−sin λ sin φ, −cos λ sin φ, cos φ)
  ```
- **`bakeToPlanet`** (`:269-366`) běží jednou na konci a builders o planetě nevědí:
  - **běžné meshe:** geometrie se převede do world prostoru, pak `subdivideLongEdges(maxEdge=4 m)` opakovaně (nejvýš 12 průchodů) půlí nejdelší hranu trojúhelníku, včetně **zachování material groups** (`:121-230`; jejich ztráta kdysi zneviditelnila 54 cedulí). Nakonec se každý vrchol přemapuje přes `positionAt` a normály se přepočítají. Mesh dostane identitu transformace a **exaktní frustum culling** (bounding sphere už je ve world prostoru).
  - **InstancedMesh:** každá instance se rigidně přesadí na povrch (rotace tečného rámce × původní rotace) a **nikdy se necullí**.
  - **`planetRigid`:** animované rigy (závory, kočka, kola vlaku) zůstávají v rovině a celá skupina se přesadí najednou, takže pivoty přežijí.
  - **Vlak** (`train.js:407-425`) se otáčí kolem osy planety `T(C)·Rz(−x/R)·T(−C)`.
- **Inverze `flatAt`:** gameplay (kolize, výšky, hráč) běží celý v plochých souřadnicích a jen kamera a render jsou na kouli.
- **Koule:** `IcosahedronGeometry(R, 30)`, 5,4 m facety s průhybem 30 mm, 19 220 trojúhelníků. Normály jsou **radiální, ne facetové**, aby terminátor nebyl schodovitý. Pod výkopem kanálu se z koule vyřežou trojúhelníky.
- **Efekt:** při výšce očí 1,62 m je horizont země `sqrt(2Rh) ≈ 23 m`. Malá planeta tak **sama ořezává dohled** a nahrazuje vzdálené město, kopce i tree line, které byly smazány (`index.js:339-341`).
- **Cena:** subdivize v JS při startu. Všechno je non-indexed (3 vrcholy na trojúhelník). Cokoli obíhá celou planetu, se necullí: železnice posílá ~900k trojúhelníků každý snímek, ať se kamera dívá kamkoli.
- **Omezení:** equirect se k pólům sbíhá (district |z| < 60 m má < 5 % komprese), světla jsou přišpendlená k lokálnímu rámci a měřítko je hračkové.

### 9. Bake, merge a instancing
- **`bake(parts)`** (`util.js:46-74`): naklonuje geometrie, aplikuje matice, srovná indexed a non-indexed (při míchání převede vše na non-indexed), ponechá jen společné atributy a zavolá `mergeGeometries`. Výsledek je **jeden draw call na materiál a objekt**.
- **Vegetace celého světa:** jeden merged mesh kmenů a větví plus **tři InstancedMesh korun** (tři tóny květu), jejichž instancemi jsou ikosaedry detail 1 (`trees.js:20-190`). Každý strom má 26–35 blobů a tón se volí podle výšky v koruně (nahoře světlý, dole tmavý, 22 % náhodný posun). Stejný vzor mají háje, cedry, bambus a keře.
- **Vzor „multi-part prop instancing“** (`makeBikeRack`, `props.js:844-880`): jedno kolo se upeče do **tří geometrií podle materiálu** (dark, frame, brite) a každá se instancuje přes celou řadu. Barva rámu se mění per instance. Autoři výslovně píšou, že `makePlanter` (11 meshů) a `makeBicycle` (14 meshů) tímhle stylem ještě převedené nejsou a že to je „~1000 draw callů“ úspory.
- **Okvětní lístky:** 980 instancí ve třech InstancedMesh s `DynamicDrawUsage`. **Update probíhá na CPU každý snímek** (`petals.js:80-110`): matice per lístek a upload celého bufferu. Průjezd vlaku je „rozfouká“ (`train.gust`).
- Cache materiálů podle signatury znamená, že sdílené materiály dovolí three.js třídit podle programu.

### 10. Postavy a animace
- **Postavy nejsou** a je to záměr: „no depictions of people anywhere“ (README). V kódu není SkinnedMesh, AnimationMixer ani kosti.
- Animace jsou čistě **procedurální transformace** v `ctx.update` closures:
  - kočka (`index.js:661-685`): sinusové dýchání a kroucení ocasem, „protažení“ při interakci přes exponenciální smoothing `stretch += (target − stretch)·(1 − exp(−dt·3.5))`
  - závory a světla přejezdu řízené **polohou vlaku na kružnici**, ne časovačem: jeden oběh je jeden cyklus (`index.js:699-732`)
  - kola vlaku, roleta, automat (padající plechovka)
  - e-bike s náklonem do zatáčky (`ebike.js`)
  - head bob hráče (`player.js:297-314`)
- **Hráč:** FPS s pointer-lock, oči 1,62 m, kruh R = 0,34 m. Kolize jsou push-out kruhu proti **lineárnímu seznamu AABB** s `top`/`bottom`. Krok 0,38 m (`player.js:18-20, 172`). Výška se bere z `world.heightAt(x, z, fromY)`.
- **Past:** jakmile bake „složí“ mesh do root prostoru, jeho `rotation` už ho neotáčí kolem vlastního pivotu (kola vlaku pak obíhala počátek světa). Animované části musí mít `planetRigid` hub (`CLAUDE.md:728`).

### 11. Dev tooling: `__shot` a ověřování
- **`POST /__shot`** (`vite.config.js:8-38`): dev-only middleware přijme JSON `{name, data: dataURL}` a zapíše JPG do `.shots/`.
- **`window.__shot(name, W, H, opts)`** (`main.js:265-329`):
  - `opts`: `pos`, `y`, `yaw`, `pitch`, `orbit/tilt/dist` (pohled na planetu), `ink`, `grade` (přepínače passů), `scale` (vynucený supersampling), `outW`, `quality`
  - funkce znovu synchronizuje kameru s hráčem, přeseedne světla, vyrenderuje jeden snímek v zadaném rozlišení, zmenší ho přes 2D canvas, pošle ho na server a vrátí cestu k souboru
- **Pracovní postup podle `CLAUDE.md` §„Verifying visual changes“:**
  - agent nemohl screenshotovat prohlížeč, protože se nekompozitoval a rAF neběžel, proto **krokuje svět ručně** (`for … world.update(1/60)`) a pak volá `__shot`
  - je tu seznam asi **60 pojmenovaných kamer** („establishing shot každého districtu“), které se snímkují před každou vizuální změnou a po ní, jako ruční golden images
  - **„Can this be seen?“ se řeší raycastem, ne screenshotem**: builders se importují v Node, `document` je stub, který všechna Canvas2D volání no-opuje, a paprskem z oka se zjistí, který mesh zakrývá cíl
  - numerické invarianty: `hillSafety` (přesah kopce do zástavby, cíl 0,00), `lakeLeakCheck` (únik vody), seznamy **FLOODFILL** v hlavičkách districtů (např. `nichome.js:106-120`: body, které musí být dostupné pěšky ze spawnu; samotný flood-fill nástroj v repu není)
  - měření draw callů na pevné sadě pohledů, s tabulkou v `NEXT.md` při každé změně
- Tabulka **„Traps that have already bitten“** (`CLAUDE.md:721+`) shrnuje desítky konkrétních bugů s příčinou a symptomem.

---

## Výkon

### Co dělají proti draw callům
1. **Merge per materiál per objekt** (`bake`) ve všech generátorech. `bake(` se volá 30× jen v `nanachome.js`.
2. **Instancing** opakovaných prvků: pražce, plotové tyče, květové bloby, cedrové přesleny, lístky, kola v racích, ema destičky, rákosí, břečťan. Vegetace se sbírá globálně do jedné sady instancí.
3. **Exaktní frustum culling** baked meshů. Podle autorů jeho vypnutí stálo **~8 ms** při ~5000 meších.
4. **Bez hullu tam, kde to nejde vidět** (auta, kromě hero kei trucku).
5. **Ohraničené rozsahy** dlouhé geometrie: kanál byl zkrácen na 204 m, aby se dal cullovat, což ušetřilo 134k trojúhelníků.
6. Sdílené materiály přes signaturovou cache, jeden materiál SPZ pro všechna auta.

### Naměřená čísla (podle dokumentace autorů; HW neuvedený)

| Metrika | Hodnota | Zdroj |
|---|---|---|
| Celkem trojúhelníků / meshů | **~1,74 M / ~19 000** (dříve 859k / 6 664) | `README.md:839-840` |
| S jezerem | 18 751 wrapped meshů, 1 876 610 trojúhelníků | `CLAUDE.md:1000` |
| Draw cally, color pass | přejezd **2 506**, lávka 4 361, rezidenční ulička 345, knihovna 307 | `NEXT.md:2100-2106` |
| Draw cally, všechny passy (shadow + color + hull) při 1000×560 | přejezd **9 491**, lávka 10 382 | `NEXT.md:1356-1366` |
| Novější měření | 通学路 **9 277** (nejdražší pohled), přejezd 3 614 | `NEXT.md:969-980` |
| Čas snímku (starší stav, 585k tris, ~5000 meshů) | přejezd **~20 ms** (~3050 callů), shotengai ~11 ms (~1400 callů) | `CLAUDE.md:694-699` |
| Citlivost | poloviční interní rozlišení: 19,3 → 19,1 ms (bez efektu); menší kaskáda stínů ±34 → ±22 m: 19,7 → 18,4 ms | tamtéž |
| Podlaha | ~900k trojúhelníků (železnice obíhá planetu, necullí se) | `README.md:846-855` |
| Šum měření | wall-clock kolísá 33–42 ms mezi běhy, proto „judge a change by draw calls“ | `NEXT.md:2127` |

**Závěr autorů:** scéna je **jednoznačně draw-call bound**, ne fill bound. Rozhodující otázka u nové geometrie je „kolik draw callů“, ne „kolik trojúhelníků“. To přesně odpovídá našemu omezení na SDL_GPU (bez bindless, MDI na Metalu jako CPU smyčka).

### Paměť
- Autoři ji neměří. Odhad z kódu: všechno je **non-indexed** (`subdivideLongEdges` volá `toNonIndexed`, hill meshe jsou non-indexed záměrně). 1,74M trojúhelníků je tedy ~5,2M vrcholů × (pozice + normála + často UV) ≈ 24–32 B, celkem **~125–170 MB vertex dat** (můj odhad, ne měření).
- K tomu desítky až stovky Canvas textur bez komprese (RGBA8, 512×256 ≈ 0,5 MB, s mipmapami ~0,7 MB).

---

## Co převzít a kam

| Technika | Modul | Adaptace na C17 + HLSL + SDL_GPU | Priorita |
|---|---|---|---|
| **Toon rampa + hue-shifted stín** `E = b·lerp(tint,1,b)·L` | `eng_render` | Žádné programy per tint. `tint`, `rampId`, `bands` patří do **material tabulky** (StructuredBuffer per materiál, index v per-draw/instance datech nebo v G-bufferu jako `matId` R16). Rampy jako `Texture2DArray` N×1 s point samplingem, případně analytické schody z cbufferu. V deferredu se ramp aplikuje v light passu per světlo. Parametr rampy (half-Lambert `N·L·0.5+0.5`) nechat konfigurovatelný per styl (WoW-like vs anime). | **vysoká** |
| **Ink z 2. diference lineární hloubky**, convex/concave asymetrie, distance fade, „inkoust drží 22 % barvy“ | `eng_render` (post) | Fullscreen pass nebo compute nad depth (reversed-Z: linearizace `near/d`). **Rozšířit o normálové hrany a hrany material-ID z G-bufferu**, které Sakura nemá a musí obcházet geometrií. Prahy normalizovat na rozlišení (`1.05 + 0.55·scale`). Volitelné per styl, pro „GTA III look“ slabší nebo vypnuté. | **vysoká** (jako volitelný styl) |
| **Split-tone grade** (shadow tint / light tint podle luminance, lift, warmth, saturace, vinětace) | `eng_render` (post) | Triviální HLSL, parametry v „look“ struktuře. Lepší je LUT 32³ generovaná z těchto parametrů v `gencli`, protože pak jde snadno porovnávat přes golden hash. | **vysoká** |
| **Pixel budget pro resolution scale** (SSAA 1,5–2× do limitu Mpx) | `eng_render` | Dynamický `render_scale` s budgetem. Pro nativní rozlišení raději 1,0 + SMAA/TAA. Ink pass ale potřebuje buď SS, nebo AA až po inku. Downsample děláme vlastním filtrem, ne bilineárem. | střední |
| **Bucket per materiál → merge** (`parts{…}` + `bake`) | `eng_gen_mesh`, `eng_gen_arch` | Každý builder emituje do `MeshBuilder[mat_id]` (indexed, u16/u32). Merge se dělá **per buňka světa** (cell), ne per objekt a ne přes celou planetu. Výstup: 1 draw na (cell, materiál), s AABB pro culling. | **vysoká** |
| **Multi-part prop instancing** (`makeBikeRack`: prop upéct do K geometrií podle materiálu, každou instancovat) | `eng_gen_arch`, `eng_render` | Archetyp = K sub-meshů podle materiálu. Instance buffer (StorageBuffer s transformací + per-instance barvou/variantou) je sdílený všemi K draw cally. **CPU culling instancí po buňkách** do kompaktního bufferu (Sakura instancované meshe vůbec necullí). | **vysoká** |
| **Exaktní culling díky world-space bake** | `eng_render`, `eng_gen_world` | Statická geometrie baked ve world/cell prostoru má AABB zadarmo. Lekce: **nic, co se merguje, nesmí mít „planetární“ extent** (železnice za 900k trojúhelníků každý snímek). Dlouhé liniové stavby (koleje, silnice) segmentovat po buňkách. | **vysoká** |
| **Materiálová cache podle signatury** | `eng_render` | Hash struktury materiálu → `mat_id`. Pipeline objekty jen podle stavu (blend, cull, alpha test), ne podle barvy. | střední |
| **Tabulkový generátor aut** (`SPEC` řádek → odvozené části, `panel(a,b)` mezi dvěma body profilu, kabina užší než karoserie, sklo posunuté ven) | `eng_gen_arch` | `typedef struct { float L,W,R, axle[2], sill,waist,roof, cab[2], rakeF,rakeR, side[2]; … } VehicleSpec;` a statické pole. Builder: lower body → bonnet a boot panely → cabin core → klíny skel → glazing posunutý podél normály → kola. Pro GTA III bar přidat podběhy jako booleovské výřezy nebo bevel, UV pro AI textury (mřížka, logo, špína) a LOD0/1/2 ze stejné specifikace. | **vysoká** |
| **Šablona obchodu: zapuštěný výklenek + interiér za sklem + „depth built outward“** | `eng_gen_arch`, `eng_gen_mesh` (CGA) | V CGA gramatice terminál `ShopFront(recess=0.9)` → pilíře, nadpraží, rovina interiéru (textura z `eng_gen_tex`, ztmavená), sklo, sloupky, odlesk. Pro okna obecně: interior mapping (parallax cubemap / atlas) místo ploché roviny. | **vysoká** |
| **Autorovat čelem k +Z, otočit podle `face`** | `eng_gen_arch` | Konvence pro všechny archetypy: lokální rámec plus `face` enum. Collider se počítá z otočeného footprintu. | střední |
| **Canvas2D signage** (fitText, svislé psaní, cedule, menu, SPZ, fascie) | `eng_gen_tex` | Vlastní 2D rasterizér (stb_truetype + vektorové primitivy, nebo SDF fonty), **vložený font** kvůli determinismu a golden hashům. Výstup do **atlasů / Texture2DArray**, aby cedule šly mergovat se zbytkem buňky a nestál každý nápis draw call. Generátor textů (fiktivní názvy obchodů) seedovaný. Hustota nápisů je velká část „čitelnosti“ scény. | **vysoká** |
| **„Interiéry za sklem“ jako 2D malby** | `eng_gen_tex` | Generátor vrstev (strop, podlaha, regály, chladicí boxy, pult) do atlasu. Pro GTA III/WoW stačí, později interior mapping. | střední |
| **Alfa vzory místo geometrie** (pletivo, mřížky) s mipmapami | `eng_gen_tex` | Operátor „line lattice“ v grafu, premultiplied alfa a alpha-to-coverage, aby to šlo bez sortování. | střední |
| **Lattice terén: výška jen v uzlech, render i fyzika přes stejnou triangulaci** | `eng_gen_world` | `float height_at(cell, x, z)` interpoluje přes stejnou diagonálu jako mesh. Flat-shaded facety jsou volba stylu (WoW má smooth + textury, takže per-styl). Jitter diagonály přes hash. | **vysoká** |
| **Slope limiter (lower-only relaxace)** a **přidat detail až po limiteru** | `eng_gen_world` | Iterace nad `float*` gridem v buňce, s halo okolními buňkami kvůli švům, nebo varianta jako distance transform (2 sweepy). Pozor na „přišpendlenou rovnou hranu = násep“. Limit per zóna (zářezy 1,9, svahy 0,52). | **vysoká** |
| **Keep-out maska + numerická kontrola (`hillSafety`)** | `eng_gen_world`, `tools` | Generátor terénu dostane rasterizované footprinty zástavby a silnic jako masku. Lint v `gencli`: „max výška terénu nad built plochou == 0“ s reportem souřadnic. | **vysoká** |
| **Tónování facetů podle sklonu, orientace, výšky a cover pole** (5 tónů, jeden mesh na tón) | `eng_gen_world`, `eng_gen_tex` | U nás to bude **splat váha nebo material ID per vrchol/facet** (ne mesh per tón, protože každý tón = draw call). Stejná funkce `faceTone` se dá použít pro výběr textury z AI atlasu (tráva, suchá tráva, hlína). | střední |
| **Jezero jako kontura pole nad datem** (`depth = LEVEL − field`) a **flood-fill leak check** | `eng_gen_world`, `tools` | Vodní plocha = rovina v buňce, viditelná tam, kde je terén níž. Hloubka se pak dá použít pro scatter (rákosí, lekníny) a shading (pásy). Lint: BFS `field < LEVEL` ze seedu, report `escaped`. Obecně „hydrology lint“ pro všechny vodní plochy. | střední |
| **Reachability flood-fill** (FLOODFILL seznamy: body, které musí být pěšky dosažitelné) | `tools` | `gencli lint reach --cell X`: navmesh nebo grid z colliderů a výšek, BFS ze spawnu s limitem kroku, seznam assert bodů z generátoru districtu. | **vysoká** |
| **Author flat → bend at bake** s dělením dlouhých hran a zachováním material groups | `eng_gen_world` | Pro velkou planetu ne equirect, ale **cube-sphere s lokálními tečnými rámci per buňka**. Generátory pracují v plochém rámci buňky a při bake: subdivize hran > maxEdge, potom projekce na kouli (u velkého R stačí pár cm korekce). Instance se přesadí rigidně (rámec v místě instance). | střední |
| **Rigid vs. bent rozlišení** (`planetRigid` pro animované rigy, rotace vlaku kolem osy planety) | `eng_gen_world`, `eng_anim` | Flag v archetypu: `BAKE_BEND` / `BAKE_RIGID` / `DYNAMIC`. Pivoty animovaných částí se nikdy nesmí mergovat do statiky. | střední |
| **Vegetace: merged dřevo + N instancovaných blob tónů podle výšky v koruně** | `eng_gen_arch`, `eng_gen_world` | Pro stylizovaný look (WoW) dobrý start: kmen jako sweep, koruna jako instance ikosaedrů s tónem podle výšky. **Koruny nepřijímají stín** (přijímá kmen a zem). Pro vyšší bar přidat alfa karty s AI texturou listí. | střední |
| **Selektivní stíny** (planeta nevrhá, tenké římsy nevrhají, průhledné nevrhají, květy nepřijímají) | `eng_render`, `eng_gen_arch` | Per-materiál flagy `CAST`/`RECEIVE`. Lint: „tenké přesahy < 2 texely kaskády nevrhají“. | střední |
| **Sky dome se soft kvantizací + ploché cel mraky** | `eng_render` | Fullscreen sky v HLSL: `t = lerp(t, floor(t·N)/N, 0.35)`. Mraky jako billboardy s maskou z `eng_gen_tex`. | nízká |
| **Lineární mlha + fade inkoustu dřív než mlha** | `eng_render` | Atmosférická hloubka jako stylový parametr; ink fade < fog end. | střední |
| **Jediná paleta (`PAL`) s úzkým rozsahem + 4 akcenty pro fokální objekty**, tmavé barvy zesvětlené kvůli rampě | `eng_gen_tex`, `eng_gen_arch` | `palette.h` / data soubor se jmény, archetypy berou barvy jen odtud. Lint: „luminance po rampě v nejtmavším pásmu > ink + δ“. | **vysoká** |
| **Deterministický PRNG per objekt** (`rngKit(seed)`) | všude | Máme (PCG / splitmix). Potvrzuje, že seed patří **každé entitě**, ne globálnímu streamu. | – |
| **`__shot`: pojmenované kamery, přepínače passů, render v pevném rozlišení do souboru** | `tools` (`gencli`) | `gencli shot --cam <name> --w 1600 --h 900 --pass ink=0` headless a contact sheet ze všech pojmenovaných kamer. Golden hash se počítá per kamera. Krokování simulace fixním dt před snímkem (`--steps N`). | **vysoká** |
| **„Can this be seen?“ raycastem bez rendereru** | `tools` | `gencli raycast --from eye --to obj` vrátí první zakrývající mesh a ID generátoru. Rychlejší než screenshot a deterministické. | střední |
| **Kultura „Traps“ tabulky a měření draw callů na pevné sadě pohledů** | `tools`, docs | CI: `gencli perf --views std.txt` → draw calls / trojúhelníky per pohled, regrese nad prahem shodí build. | **vysoká** |
| **Exponenciální smoothing `x += (t−x)(1−e^{−k·dt})`**, sekvence řízené stavem (poloha vlaku), ne časovačem | `eng_anim` | Utility `damp(x, t, k, dt)` jako základ pružin. Gameplay sekvence odvozovat ze stavu simulace. | nízká |

### Co NEpřebírat a proč
1. **R = 160 m equirect planeta a světla přišpendlená k lokálnímu rámci.** Funguje jen jako hračka: horizont 23 m, póly se sbíhají, slunce „cestuje s hráčem“. Pro velkou procedurální planetu potřebujeme cube-sphere, reálné slunce a cascaded shadows.
2. **Synchronní build celého světa při startu, bez streamingu a bez LOD.** Pro GTA-like město nepoužitelné. U nás hierarchie region → district → cell se streamováním.
3. **Ručně zadané souřadnice v kódu** (`houseDefs`, stovky `{x, z, …}` s komentářovými esejemi). 49k řádků `world/` je převážně ruční kompozice a „generátory“ jsou tenké šablony. Neškáluje. My generujeme (tensor-field ulice, CGA) a ručně jen kurátorujeme.
4. **Non-indexed geometrie všude** (3× víc vrcholů). Flat shading uděláme jinak: `nointerpolation` normála s provoking vertexem, nebo normála z `ddx/ddy(worldPos)` v pixel shaderu, a indexed buffery zůstanou.
5. **String-patching shaderů (`onBeforeCompile`) a program per tint.** U nás tint jako data.
6. **Inverted hull na všechny zdi a střechy obchodů.** Každý hull je draw call. U nás jen screen-space linky (depth, normála, ID) a hull maximálně pro pár hero objektů, nejlépe ve stejném instanced draw s druhou pipeline.
7. **Instanced meshe bez cullingu a CPU update lístků přes celý buffer každý snímek.** U nás culling per buňka a částice v compute shaderu.
8. **Tři vrstvené zemské povrchy s mikro-odstupy 15–65 mm** proti z-fightingu. Zdroj desítek bugů (koule prolézá silnicí, plochy v kanálu). U nás jeden heightfield per buňka s explicitními „holes“ (tunely, výkopy) jako mesh patche a s jednou výškovou funkcí pro render i fyziku.
9. **Systémové fonty** (výsledek se liší podle OS) a **nekomprimované, neatlasované textury s materiálem per nápis.**
10. **Lineární seznam AABB colliderů** (783 boxů + ~600 stromů procházených každý snímek). U nás prostorový hash per cell.
11. **Zjednodušené FXAA na bilineárně zmenšeném SS bufferu.** Pro nativní rozlišení potřebujeme SMAA/TAA.
12. **Dokumentace jako 30 % komentářů v kódu.** Lekce „zapiš proč, s čísly“ je dobrá, ale patří do `docs/` a do lintů, ne do 50řádkových esejí nad konstantou.

---

## Jak to dosahuje kvality

### Co je vidět na screenshotech (`docs/hero-1…4.jpg`, 1600×900)
- **hero-1 (přejezd):** vlak, závory, automaty, 止まれ na silnici, sakury. Silná kompozice a čitelné vrstvy (popředí, střed, pozadí). Fialové stíny stromů na asfaltu, jasné černofialové obrysy, lístky ve vzduchu.
- **hero-2 (shotengai):** perspektiva uličky, markýzy, noren „そば“, lampiony na drátech, van, kola v racku, sakura na konci jako fokální bod. Hodně nápisů.
- **hero-3 (onsen ulice):** dřevěné fasády, svislé cedule „こけし堂“, lampiony, kokeshi na stole, kamenná lucerna jako fokální bod.
- **hero-4 (svatyně):** torii, schody, kamenné lucerny, bambus, shimenawa.

### Proč to vypadá dobře
1. **Koherentní styl místo realismu.** Úzká paleta, barevné (ne šedé) stíny, inkoustové linky a split-tone grade sjednotí jinak velmi jednoduchou geometrii (krabice, válce, ikosaedry) do „malovaného pozadí“. Hue-shift ve stínu je podle autorů „most of what separates anime cel from low-poly 3D“ a screenshoty jim dávají za pravdu.
2. **Nápisy nesou detail.** Japonské typografické cedule na každé fasádě nahrazují texturní detail. Oko čte text a značky, ne povrch.
3. **Kompozice a ruční umístění.** Každá věc stojí tam, kde dělá práci v záběru („the pole that carries the eye up out of frame“, `index.js:65-73`). To je síla screenshotů a zároveň slabina pro škálu.
4. **Hloubka místo nálepek.** Výklenky obchodů, sklo před interiérem, kabina užší než karoserie, atiky na plochých střechách. Geometrie je postavená tak, aby inkoust a stín měly co kreslit.
5. **Čisté stíny.** 2048² mapa na ±34 m ≈ 3,3 cm/texel. Ostré vržené stíny stromů jsou jedním z nejsilnějších prvků obrazu.
6. **Atmosféra:** mlha, ink fade, mírně kvantovaný sky gradient a ploché mraky. Pozadí se rozplývá „malířsky“.

### Upřímné srovnání s naší laťkou (GTA III / World of Warcraft)
- **Kde je Sakura nad GTA III:** čitelnost, koherence palety, „appeal“ statického záběru. Jako stylizovaný obraz působí dospěleji než syrový GTA III.
- **Kde je pod laťkou:**
  - **Povrchy bez textur.** WoW stojí na ručně malovaných texturách (omítka, kámen, dřevo, tráva) a GTA III na fototexturách. Sakura má na zdech, silnicích a střechách jednu barvu. V pohybu a zblízka (hero-3 vlevo: velké šedé plochy) je to prázdné. **Pro nás klíčové: AI textury + kódový post-processing jsou nutné. Tento styl je jen poloviční řešení.**
  - **Vegetace jako „balónky“.** Shluky facetovaných ikosaedrů dobře fungují v anime look, ale WoW stromy (alfa karty s malovaným listím) jsou o třídu bohatší.
  - **Žádné postavy, NPC ani provoz v pohybu.** GTA III je o lidech a autech v pohybu. Tady stojí 18 zaparkovaných aut a celá oblast lidí nemá ani jednoho.
  - **Měřítko.** Obvod planety 1 km, district ~120 m napříč, horizont 23 m. Velikostí blíž dioramě než městu. I tak měřili **2,5–10k draw callů na pohled** a ~20 ms na přejezdu. Při hustotě GTA města (stovky budov v záběru, dohled 300+ m) by tento přístup (merge per objekt, ne per cell) **neprošel**.
  - **AA a rozlišení:** SSAA + zjednodušené FXAA do CSS pixelů. Nativní rozlišení na HiDPI se nedosahuje. Stínová kamera se nepřichytává k texelům, takže lze čekat shimmering.
- **Pro nás to znamená:** převzít **stylovou vrstvu** (ramp + tint, ink, grade, paleta, signage, „depth built outward“) a **ověřovací kulturu**. Nepřebírat **architekturu světa** (ruční kompozice, bake celé planety, planet-scale merged meshe). Laťku GTA III/WoW splníme jen s texturami a se streamovanou, buňkově mergovanou geometrií.

---

## Otevřené otázky
1. **Na jakém HW autoři měřili** ~20 ms při 3050 callech a 33–42 ms v novějším stavu? Bez toho nejde odhadnout, kolik draw callů unese SDL_GPU/Metal na našem cílovém HW. Musíme si udělat vlastní microbenchmark: draws/frame při 1, 2, 4 uniform pushích na draw.
2. **Ink v deferredu:** stačí depth 2. diference + normály + material-ID, nebo budeme chtít i „crease“ hrany z geometrie (feature edges baked do vertexů)? Jak se ink chová při TAA (jitter vs tenké čáry)?
3. **Toon ramp vs. WoW look:** chceme rampu jako globální styl, nebo per-materiál „band count“ s možností plynulého Lambertu? Jak se tint kombinuje s AI texturou (násobit albedo, nebo jen přímé světlo)?
4. **Text a fonty:** vložíme jeden open-licence CJK/latin font (SDF atlas), nebo budeme generovat vlastní „písmo“ kódem kvůli zásadě „vše kódem“? Jak velký atlas cedulí na buňku?
5. **Slope limiter přes hranice buněk:** stačí halo 1 buňky, nebo potřebujeme globální pre-pass na úrovni regionu (limiter je nelokální, propaguje se až na vzdálenost h/(slope·CELL))?
6. **Vodní plochy na velké planetě:** „kontura nad datem“ je elegantní pro jezera v kopcích. Jak ji kombinovat s mořem a řekami, a kde poběží leak lint (per region)?
7. **Bake bend vs. nativní generování na kouli:** při R v kilometrech je zakřivení na buňce v řádu cm. Stačí generovat v tečné rovině buňky a ignorovat ho (s „skirt“ na švech), nebo ohýbat jako Sakura?
8. **Reachability flood-fill** autoři v repu nemají, jen seznamy bodů. Jaký formát assert bodů chceme z generátorů districtů a jaký navigační model (kruh R = 0,34, krok 0,38 m jako oni)?
9. **Shimmering stínů:** tvrzení o „snapped grid“ v `main.js` kód nesplňuje. Potvrdit v našem prototypu, že snapping kaskád k texelům je nutný i pro stylizovaný look (nejspíš ano).
10. **Kolik z „kvality“ je kompozice?** Screenshoty jsou z ručně zvolených kamer v ručně komponovaných scénách. U procedurálního města budeme potřebovat metriky záběru (fokální objekt, vrstvení, hustota nápisů) a contact sheets z náhodných kamer, ne jen z hero kamer.
