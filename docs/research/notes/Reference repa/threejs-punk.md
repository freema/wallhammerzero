# Threejs-Punk: analýza renderingu pro Wallhammer Zero

- **Zdroj:** https://github.com/ektogamat/threejs-conference (HEAD `8cc2059`, shallow clone 2026-11-05)
- **Licence:** kód MIT (Anderson Mancini a Sunag). Assety v `public/` (modely, textury, HDRI, videa, audio) **nejsou naše** a nepoužíváme je. Graf kapek v `src/tsl/surfaceRain.js` je adaptace z [rocksdanister/rain](https://github.com/rocksdanister/rain) (BigWings „Heartfelt“). Pokud ho portujeme, musíme zachovat kredit.
- **Metoda:** repo bylo pouze čteno, kód se nespouštěl. Tvrzení z README, `docs/techniques/` a poznámek vlastníka (2026-09-24) jsem ověřil proti kódu. Kde se liší, platí kód (viz „Opravy oproti poznámkám“).
- Odkazy `soubor:řádek` platí pro uvedený commit.

---

## Přehled

| Položka | Hodnota |
|---|---|
| Stack | Three.js `^0.185.1` (WebGPURenderer + TSL), Vite 6, `three-mesh-bvh` 0.9, GSAP 3 |
| JS | 73 souborů, 11 744 řádků (+ 2 453 řádků CSS) |
| Rozpad řádků | `ui/` 2 027, `debug/` 1 388, `world/` 2 991, `post/` 890, `tsl/` 750, `controls/` 799, `app/` 648, `clouds/` 577, `runtime/` 445, `platform/` 338, `audio/` 339, `bootstrap/` 178, `intro/` 80 |
| Vlastní rendering | přibližně 3 000 řádků: `world/weather`, `world/ground`, `world/car`, `tsl/`, `post/`, `clouds/`, `platform/`, `runtime/`. Zbytek tvoří UI, debug, audio a ovládání. |
| Assety | 5 GLB (město 4,7 MB s Draco a KTX2: 78 meshů, 78 materiálů, jen 18 textur, asi 588 k trojúhelníků), auto `quadra.glb`, letadlo, billboardy, collider. Dále 2 HDRI (jedno nepoužité), 6 MP4, wet-puddles albedo, roughness a normal, splash atlas, kouř a 2 šumové textury pro mraky. |
| Vstupní bod | `index.html` → `src/main.js` → `init()` (`main.js:56`) |

**Startovní sekvence** (`main.js:56-294`): device budgety (`applyDevicePerformanceDefaults`, `:58`) → kamera a scéna se sluncem (`:64-66`) → `createRenderer()` (`:71`) → `createWorld()` s paralelními GLTF loady (`:81`) → PMREM z HDRI (`:101`) → `createPostProcessing()` (`:113`) → look preset (`:125`) → adaptivní DPR (`:130`) → camera director, app shell a audio → `finalizeStartupLighting` (kritický compile, `:242`) → `compileDeferredStartup` (`:254`) → `renderLoop.startLoop()` (`:268`). Safari čeká na deferred compile před startem smyčky (`:264`).

**Frame loop** (`runtime/createRenderLoop.js:18-63`) běží přes `renderer.setAnimationLoop` (rAF) s `THREE.Timer` delta:

1. `cameraDirector.update(delta)` (orbit nebo walk s BVH) a HUD (`:22-23`)
2. `collisionHeight.update({camera, hideObjects})`: ortho render výškové mapy (`:25-28`)
3. `rain.update()`: dva compute dispatche, kapky a splashe (`:29`)
4. letadla, `sky.update` (kopule sleduje kameru), `ground.update` (čas ripplů), ripple amount (`:34-40`)
5. billboardy: CPU play/pause videí podle vzdálenosti (`:43`)
6. car surface rain: intenzita podle vzdálenosti a čas (`:45-52`)
7. `ground.updateReflection()`: planární mirror render (`:54-56`)
8. `pipeline.syncCameras`, DoF focus point, rain-glass intro (`:58-60`)
9. `post.render()`: celý TSL `RenderPipeline` (`:61`)
10. `sampleFps()` → adaptivní DPR (`:62`)

---

## Architektura

### Kompozice z továren
- Žádný engine ani ECS. Každý subsystém je funkce `createX({deps}) → { update, dispose, set*, uniforms, params }`. Vše propojuje `main.js` ručně a explicitními parametry.
- Řídicí tok je **ručně seřazený seznam volání** v `renderFrame`. Závislosti mezi passy (výška → compute → beauty) hlídá jen pořadí řádků a komentář v dokumentaci.
- Post-pipeline je **jeden TSL graf**. Přepnutí efektu (bloom, AO, DoF, SMAA, intro) zavolá `rebuildSteadyOutput()` (`post/postprocessing.js:241-267`), sestaví nový `outputNode` a nastaví `post.needsUpdate = true`, tedy rekompilaci. Funguje to jako mini render graph s deklarativní kompozicí uzlů. Three z grafu sám odvodí mezilehlé RT (`convertToTexture`).

### Feature flagy
- `world/features.js:17-31`: `FEATURES = {city, car, rain, smoke, planes, sky, ground, intro, chromeUi, walkUi, audio, inspector}`. Vypnutá feature vrátí `null` a smyčka i post používají optional chaining (`world.rain?.update`).
- `STRIP.md` popisuje pořadí odlupování vrstev. Minimální jádro tvoří `bootstrap + scene + city + ground + post + walk/orbit + render loop`.
- Výkonové páky jsou oddělené od feature flagů v **globálním mutable singletonu** `performanceProfile` (`platform/performanceProfile.js:11-54`). Za běhu ho mění dev API `window.__app.perf.set(key, value)` (`debug/createPerformanceDevTools.js:44-61`) a změna se propíše do pipeline.

### Vrstvy (layers) jako filtry passů
- `RAIN_LAYER = 2` (`createCollisionRain.js:25`) a `SMOKE_LAYER = 3` (`createSmoke.js:17`). Post klonuje kameru zvlášť pro AO pre-pass (bez deště a kouře) a pro beauty (s deštěm a kouřem) (`postprocessing.js:36-54`). Mirror kamera vypíná `RAIN_LAYER` (`createGround.js:226`).
- Výšková mapa naproti tomu filtruje **přepínáním `visible`** na objektech z hide listu (`collisionHideObjects.js`, `createCollisionHeight.js:109-131`). Mutuje tedy scénu uprostřed snímku.

### Co je pro nás dobré
- Explicitní lifecycle `create/update/dispose` a vrácené objekty s parametry odpovídají C modulům (`eng_x_create/update/destroy`).
- Feature flag vracející `NULL` a volající, který to snese, je levný způsob, jak mít „strip“ režim pro debug a profilování. Pro nás to znamená konfigurační struct plus `if (sys)`.
- Centrální tabulka budgetů (`performanceProfile`) s klíči jako `*ResolutionScale`, `*FrameSkip` a `*Count` je přesně to, co chceme mít jako `quality profile` struct, ze kterého čte render graph.
- Filtr passů přes bitmasku vrstev (rain/smoke mimo AO a mirror) se mapuje na `pass_mask` u draw itemů.

### Co je pro nás špatné
- Pořadí passů hlídá jen pořadí řádků v `renderFrame` a dokumentace. U nás musí pořadí vyplývat z deklarovaných reads/writes v render graphu.
- Hide list přes `visible = false/true` kolem renderu je křehký: každý nový průhledný systém je potřeba ručně přidat. U nás to řeší maska passu na úrovni draw itemu, ne mutace scény.
- Globální mutable `performanceProfile` ovlivňují i moduly, které ho čtou při vytvoření (např. `DEFAULT_COUNT`, `createCollisionRain.js:29`). Pozdější změna se proto neprojeví všude.
- Scéna se kreslí **4× za snímek**: height, mirror, AO pre-pass a beauty, k tomu shadow na vyžádání. Sdílený depth/normal prepass chybí, protože TSL `pass()` je per-kamera.

---

## Rendering pipeline

### Pořadí passů v jednom snímku (ustálený stav, desktop, výchozí profil)

| # | Pass | Kde | Typ | Výstup |
|---|---|---|---|---|
| 0 | Shadow map slunce (jen při `needsUpdate`: init, resize, změna světla) | `scene.js:24-39`, `createRenderer.js:44-46,69-81` | raster, depth | 4096² depth, PCFSoft, ortho box ±200 m |
| 1 | Collision height (ortho shora, override materiál `vec4(positionWorld,1)`) | `createCollisionHeight.js:85-133` | raster | RT 512², **RGBA16F**, nearest, bez mipů, s depth |
| 2 | Rain update | `createCollisionRain.js:139-184` | **compute** (5000 vláken) | storage `position`, `velocity` (vec3) |
| 3 | Splash update | `createCollisionRain.js:186-235` | **compute** (5000 vláken) | storage `splashPos` (vec3), `splashCycle` (uint) |
| 4 | Planární odraz (mirror kamera, oblique clip, bez ground meshe a bez rain layer) | `createGround.js:190-276` | raster, plná scéna | RT `drawingBuffer × 0.5`, **RGBA16F**, linear, s depth |
| 5 | AO pre-pass (scéna bez rain a smoke) | `postprocessing.js:99-111` | raster, plná scéna | `output` = `packNormalToRGB(normalView)` **RGBA8**, plus depth |
| 6 | Beauty scene pass s MRT (opaque, pak transparent: ground s fog alfou, déšť, splashe, kouř) | `postprocessing.js:113-126` | raster, plná scéna | `output` **RGBA8 (lineární!)**, `emissive` **RGBA8**, depth |
| 7 | GTAO | `postprocessing.js:128-137` | fullscreen frag | poloviční rozlišení, 6 vzorků, bez temporal filtru |
| 8 | Bloom (pouze z emissive MRT) | `postprocessing.js:147-148` | fullscreen, mip chain | poloviční rozlišení (Three `BloomNode`, 5 mipů) |
| 9 | Lens flare (vstupem je bloom) a gaussian blur | `postprocessing.js:150-163` | fullscreen | blur při 0,5 |
| 10 | DoF: separabilní box blur a mix podle hloubky (**ve výchozím stavu vypnutý**, `performanceProfile.js:26`) | `postprocessing.js:244-251`, `tsl/boxBlur.js:17-55` | 2× fullscreen | plné rozlišení |
| 11 | Kompozit: beauty × AO, fog, + bloom·(1−fog·0,75), grade | `cyberpunkLook.js:362-393` | fullscreen | mezilehlá RT (vynutí ji `convertToTexture` v CA) |
| 12 | Edge chromatic aberration, vignette | `cyberpunkLook.js:395-415`, `tsl/edgeChromaticAberration.js:49-93` | fullscreen | mezilehlá RT (vstup SMAA) |
| 13 | SMAA 1x (3 passy: edges, weights, blend) | `postprocessing.js:255` | fullscreen | plné rozlišení |
| 14 | Film grain → output transform (ACES a sRGB) → canvas | `postprocessing.js:256-257`, `createRenderer.js:47` | fullscreen | swapchain |

Poznámky k pořadí:
- Three provádí passy 5 až 14 v `post.render()` podle závislostí uzlů. Passy 1 až 4 renderují mimo TSL graf přes ruční `renderer.render` do vlastního RT. Pro mirror je to záměr (`createGround.js:33-38`): `reflector()` uvnitř `PassNode` by na WebGPU navázal stejnou texturu jako sampled i attachment.
- Rain pass (`rainPass`) v post existuje, ale nepoužívá se, protože `useDedicatedPass: false` (`createCollisionRain.js:470`). Déšť se kreslí uvnitř beauty passu.
- **Tone mapping:** `renderer.toneMapping = ACESFilmic` (`createRenderer.js:47`). `RenderPipeline` ho aplikuje až na úplném konci (output color transform). Mezitím vše běží lineárně, ale beauty i emissive RT jsou **8bitové** (`postprocessing.js:125-126`). HDR emisivita z GLB (`KHR_materials_emissive_strength` až 429×) se tak ořízne na 1,0. Bloom potom vidí spíš masku neonů než HDR jas. Banding v tmavých tónech maskuje dither ±0,004 v CA (`edgeChromaticAberration.js:38-47`) a film grain.
- Renderer si vyžádá `maxColorAttachmentBytesPerSample = 64` (`createRenderer.js:8-30`), aby se vešlo MRT.

### MRT layout beauty passu
```js
// postprocessing.js:115-126
const mrtNode = mrt({ output, emissive: vec4(emissive, output.a) });
mrtNode.setBlendMode("emissive", new BlendMode(NormalBlending));
scenePass.setMRT(mrtNode);
scenePass.getTexture("emissive").type = UnsignedByteType;
scenePass.getTexture("output").type = UnsignedByteType;
```
- `output` je lit barva materiálu včetně emisivity. `emissive` je jen emisivní složka materiálu (`emissiveNode`). Do emissive zapisují: neony v GLB, video billboardy (`billboardFace.js`, `emissiveNode = video × 0.2`) a **planární odraz země** (`createGround.js:131-139`). Odraz neonů v louži tak také bloomuje.
- Emissive má vlastní blend mode (normal), aby průhledné objekty (déšť, kouř) přes neon správně skládaly alfu.

### Co běží v compute
Pouze simulace deště a splashů (`renderer.compute(computeParticles)` a `computeSplash`, `createCollisionRain.js:374-375`) plus jednorázový init (`:254-255`). GTAO, bloom, blur i SMAA jsou fragmentové fullscreen passy z Three addonů.

### Render targety: shrnutí
| RT | Rozlišení | Formát | Filtr | Perzistence |
|---|---|---|---|---|
| Shadow | 4096² | depth | PCF soft | cachovaná, update on demand |
| Collision height | 512² (`collisionRainResolution`) | RGBA16F (stačí R16F) | nearest | každý snímek (`frameSkip` výchozí 1) |
| Ground reflection | 0,5 × drawing buffer | RGBA16F a depth | linear | každý snímek (`groundReflectionFrameSkip` výchozí 1) |
| AO pre-pass | 1,0 | RGBA8 normal a depth | – | per frame |
| Beauty MRT | 1,0 | 2× RGBA8 a depth | – | per frame |
| GTAO | 0,5 | 1 kanál | – | per frame |
| Bloom | 0,5 a mip chain | half-float (Three BloomNode) | linear | per frame |
| Flare blur | 0,5 | – | – | per frame |
| Kompozit, CA, SMAA (edges, weights) | 1,0 | – | – | per frame |

„Drawing buffer“ = okno × DPR, kde DPR = min(device, 1,5) a při adaptivním poklesu 0,85.

---

## Klíčové techniky do hloubky

### 1. Collision rain: výšková „hit“ textura a GPU compute

**Soubory:** `world/weather/createCollisionHeight.js`, `createCollisionRain.js`, `collisionHideObjects.js`, `docs/techniques/collision-rain.md`.

**Výšková mapa** (`createCollisionHeight.js:15-31, 85-133`):
- `OrthographicCamera(±50, ±50, near 0.1, far 80)`, pozice `(cam.x, 50, cam.z)` s pohledem kolmo dolů. Každý snímek se přecentruje na hráče.
- RT 512² HalfFloat, **nearest**, bez mipů. Lineární filtr by na hranách střech zprůměroval výšky a kapky by padaly „do vzduchu“.
- `scene.overrideMaterial` s `outputNode = vec4(positionWorld, 1)`. Depth test nechá nejvyšší povrch ve sloupci a simulace čte jen `.y`.
- Mapování (`:51-65`), které musí být stejné v passu i v compute:
  `u = (x − cx + W/2) / W`, `v = (z − cz + H/2) / H`.
- Rozlišení texelu je 100 m / 512 ≈ **0,195 m**.

**Simulace** (`createCollisionRain.js:139-182`):
```js
position.addAssign(velocity);                        // bez delta!
const wrappedDx = fract(dx.add(uRainHalfW).div(uRainAreaWidth))
  .mul(uRainAreaWidth).sub(uRainHalfW);              // toroidální wrap kolem kamery
const coords = collisionHeight.getUV(position);
const floorHeight = texture(collisionHeight.renderTarget.texture, coords).y;
If(position.y.lessThan(floorHeight.add(0.05)), () => {
  const seed = float(instanceIndex).add(time.mul(1000));
  position.y = hash(seed.add(77.7)).mul(15).add(20);  // respawn 20–35 m
  position.x = hash(seed.add(11.1)).mul(uRainAreaWidth).sub(uRainHalfW).add(centerPos.x);
  ...
});
```
- Objem deště je 60×60 m, posunutý 15 m před kameru v horizontálním směru pohledu (`centerPos = camPos + dirXZ·15`). Výšková mapa je větší (100×100), aby byly okraje pokryté.
- 5000 instancí, clamp na 500 až 5000 (`:66`), rychlost pádu 0,7 ± 0,035 jednotky **za snímek**.
- **Splashe** (`:186-233`) **nejsou navázané na dopady kapek**. Každá instance má vlastní fázi `floor(time·6 + hash·2π)`. Při novém cyklu dostane náhodné XZ v objemu a Y z výškové mapy plus 0,06. Při wrapu se Y přepočítá. Jde o statistickou iluzi: 5000 × 6 = 30 000 splashů za sekundu na 3600 m².
- **Kreslení:** jeden instancovaný `PlaneGeometry` 0,04 × 1,1 m pro proužky s cylindrickým billboardem (`horizontal: true`, `:271-275`). Proužek je čistě procedurální: `centerLine = (1 − |2u−1|)²`, `verticalFade = smoothstep(0,0.08,v)·smoothstep(0,0.15,1−v)` (`:260-265`). Barva je konstantní `#dcf4ff`, opacita 0,15 × 0,45 (velmi slabé). Splash je sférický billboard 0,13 m s 5snímkovým atlasem, crossfade mezi snímky, maska `.r` (asset nemá alfu), scale 0,1 → 1,4.
- `frustumCulled = false` a bounding sphere 1e5: instance žijí ve world space.

**Náklady:** dokumentace žádné ms neuvádí. Moje odhady: height pass je jeden ortho render celé scény (CPU draw calls jako další pohled), compute je triviální (5000 vláken, jeden texture fetch), overdraw tenkých proužků je malý.

**Omezení a chyby, které jsem v kódu našel:**
- **Integrace závisí na framerate** (`position += velocity` bez `dt`). Při 120 Hz padá déšť 2× rychleji.
- Respawn seed `float(instanceIndex) + time·1000` po hodinách ztrácí přesnost floatu. Lepší je uint hash (PCG) s frame counterem.
- Ortho kamera v y = 50 s far 80 pokryje jen y ∈ ⟨−30; 49,9⟩. Cokoli nad 50 m chybí, což u mrakodrapů způsobí déšť skrz střechy. Clear hodnota je `scene.background` (≈0,03), takže nepokrytý texel znamená podlahu v y ≈ 0.
- Proužky nemají délku podle rychlosti vůči kameře a neberou barvu okolních světel.
- Mapa drží jen nejvyšší povrch. Pod mostem nebo markýzou proto neprší a nejsou tam splashe, což je fyzikálně správně.

**Mapování na SDL_GPU:** bez problémů.
- Height pass: render pass do `R16_FLOAT` (nebo `R32_FLOAT`) s depth. Ještě levnější varianta je **depth-only** ortho render do `D32_FLOAT` s `SAMPLER` usage, kde výška = `camY − depth·range`. Color attachment pak vůbec není potřeba.
- Compute: 2 až 4 RW storage buffery (limit 8) a 1 sampled texture (`Load()` nebo `SampleLevel`, compute nemá derivace).
- Draw: vertex shader čte storage buffer přes `SV_InstanceID` a quad generuje z `SV_VertexID`. Vertex buffer není potřeba. Bindless ani indirect netřeba.

**Rozšíření pro nás (demo je nemá):**
1. Stejnou výškovou mapu použít jako **rain occlusion pro wetness**. Pokud je `surfaceY < heightMap(xz) − ε`, povrch je pod střechou a zůstává suchý. Zadarmo tak dostaneme suché pásy pod markýzami a mosty.
2. Počet kapek zvednout na 30 až 100 k (M4 Pro to zvládne) a proužky protáhnout podle rychlosti vůči kameře.
3. Kameru umístit nad max výšku budov v chunku a `far` nastavit podle výškového rozsahu.

### 2. Procedurální kapky na povrchu (auto a sklo)

**Soubory:** `tsl/surfaceRain.js`, `world/car/applyCarSurfaceRain.js`, `docs/techniques/car-surface-rain.md`.

**Jak to funguje:**
- `MovingDropLayer` (`surfaceRain.js:40-92`, BigWings/rocksdanister) rozdělí UV na mřížku `8×4` (`a = (4,2)`, `grid = a·2`). Sloupce dostanou náhodný y-offset `N(id.x)` a buňky hash `N13`. Kapka se pohybuje po pilové křivce `Saw(0.85, fract(t+n.z))` s vlněním x `sin(10y + sin(10y))`. Za ní vzniká stopa (trail) a „satelitní“ kapičky `fract(UV.y·10)`. Výstupem je `vec2(mask, edge)`.
- `CarDrops` (`:117-122`) sečte dvě vrstvy (`uv` a `uv·1.85`) bez statických kapek. Statické kapky na UV1 auta „blikaly“ (`:132-139`).
- Normála se počítá **konečnými diferencemi** (`computeCarDropNormalOffset`, `:169-189`): maska se vyhodnotí 3× (c, c+εx, c+εy, ε = 0,005) a `normalOffset = (cx−c, cy−c)`. Na pixel to dává **6 vyhodnocení `MovingDropLayer`**.
- Zapojení do materiálu (`applyCarSurfaceRain.js:146-215`):
  ```js
  const rain = evaluateCarSurfaceRain(uv(1), uniforms);     // UV1 = "rain UV"
  const rainAmount = rain.mask.mul(uniforms.uIntensity);
  material.roughnessNode = mix(baseRoughness, wetRoughness, rainAmount); // 0.1 lak, 0.05 sklo
  material.normalNode = normalMap(vec4(normalSample.xy.add(rain.normalOffset.mul(normalStrength)), normalSample.zw));
  // sklo: colorNode = mix(base, (0.55,0.6,0.65), rainAmount * 1.2)
  ```
- PBR mapy zůstávají na UV0 a déšť je na UV1 (druhá UV ručně upravená v Blenderu, aby se ostrovy nepřekrývaly).
- **Distance fade** na CPU (`:289-318`): `uIntensity = 1 − smoothstep((d−20)/(32−20))`. Shader ale běží dál, jen se výsledek přimíchá s nulovou vahou.
- Jeden blok uniformů sdílí všechny materiály auta (`createSurfaceRainUniforms`, `surfaceRain.js:191-205`): scale 20,5, dropSize 0,45, normalStrength 0,25 pro lak a 0,7 pro sklo, dropletMix 0,15.
- Sklo je neprůhledný `MeshPhysicalNodeMaterial` s clearcoat 1 (`GLASS_LOOK`, `applyCarSurfaceRain.js:28-54`). Vlhkost tedy čte jen přes odlesky.

**Náklady:** nejsou uvedené. Šest vrstev s hashi, `sin` a `pow` na pixel laku je znatelné, proto existuje fade od 20 do 32 m.

**Omezení:** vyžaduje čistou druhou UV. Kapky „tečou“ po UV ose v, ne po světové gravitaci. Uniform s nulovou intenzitou nešetří ALU.

**SDL_GPU:** čistá ALU v pixel shaderu bez nároků na binding. Pro nás:
- Místo `uIntensity = 0` použít **variantu pipeline bez deště** pro LOD a vzdálené objekty. Případně normálu počítat z `ddx/ddy` masky místo 2 extra vyhodnocení (je to levnější, ale méně stabilní).
- Procedurálně generovaná vozidla a okna mohou „rain UV“ dostat z generátoru, např. planární projekci v object space na boční plochy s osou v = −Y objektu. Kapky pak tečou dolů.
- Stejný graf aplikovaný na screen UV dává efekt **deště na skle obrazovky** (`tsl/rainGlass.js:147-207`): rozmazaná scéna (gaussian při 0,6 res), refrakční offset podle normály kapek a zvýraznění okrajů. Hodí se pro pohled z interiéru auta.

### 3. Ripples na zemi

**Soubor:** `tsl/rainRipples.js:20-75`. Volá se z `createGround.js:94,101`.

**Oprava:** kód prochází okolí **3×3** buněk (`MAX_RADIUS = 1`, `CELL_COUNT = 9`), ne 5×5. Dokumentace (`wet-ground.md`: „Fixed 5×5 neighborhood (MAX_RADIUS = 1, CELL_COUNT = 9)… 25 cells“) si protiřečí. Originál na Shadertoy (Huw Bowles „Rain ripples“) používá `MAX_RADIUS = 2`, tedy 5×5. Autoři to snížili kvůli výkonu.

```js
const p = pi.add(hash22(pi));                          // náhodný střed v buňce
const t = fract(float(0.3).mul(time).add(hash12(pi))); // fáze 0..1
const d = length(v).sub(float(MAX_RADIUS + 1).mul(t)); // vzdálenost od čela vlny
const p1 = sin(31*d1) * smoothstep(-0.6,-0.3,d1) * smoothstep(0,-0.3,d1);  // d1 = d - h
const derivative = (p2 - p1) / (2h) * (1-t)^2;         // centrální diference, h = 0.001
circles += normalize(v) * derivative * 0.5;
// po smyčce: circles /= 9; n = vec3(circles, sqrt(1 - dot(circles,circles)))
```
- Vzorkuje se ve **world XZ** (`positionWorld.xz · 4.83`), ne v UV. Kruhy tak nemají švy na opakování textury.
- Výstup `xy` se použije dvakrát: přičte se k normálové mapě (×0,015) a k UV odrazu (×0,08), takže louže deformují zrcadlo.
- Cena je pevná: 9 buněk × 2 `sin` × 2 hashe na pixel země, nezávisle na počtu kapek.

**SDL_GPU:** triviální port do HLSL. Lepší architektura pro nás: **jednou za snímek compute shaderem upéct ripple normálu do dlaždicové textury** (např. 256² nebo 512² `R8G8_SNORM`, tileable při periodickém hashi buněk). Všechny mokré povrchy (ulice, střechy, kapoty) pak jen samplují. Jeden pass nahradí N per-pixel smyček a ušetří ALU v hustém městě. Navíc zbude místo na 5×5 kvalitu.

### 4. Planární odraz (mokrá ulice bez SSR)

**Soubory:** `world/ground/createGround.js`, `docs/techniques/wet-ground.md`.

- Ground je jedna rovina 400×400 m v y = −5,4 s tiling PBR (albedo, roughness, normal, repeat 14,9). `transparent = true`, protože alfa = `1 − rangeFogFactor(0, 51)` a rovina tak vybledne do mlhy (`:121-130`).
- **Mirror kamera** (`:203-227`): pozice a cíl se zrcadlí přes rovinu, `up` se reflektuje a projekce se zkopíruje. `RAIN_LAYER` je vypnutá.
- **Oblique near plane** (Lengyel) (`:229-258`). Větev pro WebGPU (depth 0..1) je přesně to, co potřebujeme pro SDL_GPU:
  ```js
  _q.x = (sign(clip.x) + P[8]) / P[0];
  _q.y = (sign(clip.y) + P[9]) / P[5];
  _q.z = -1;  _q.w = (1 + P[10]) / P[14];
  clip *= 1 / dot(clip, _q);
  P[2] = clip.x; P[6] = clip.y;
  P[10] = (WebGPU) ? clip.z : clip.z + 1;   // 0..1 vs -1..1 depth
  P[14] = clip.w;
  ```
- Render: skrýt ground, `renderer.render(scene, mirror)` do RT 0,5× RGBA16F (`:260-275`).
- **Kompozice přes emissive** (`:113-119, 131-139`):
  ```js
  const reflectionUV = screenUV.flipX().add(normalOffset /*0.035*/).add(rippleReflectionOffset);
  emissiveNode = reflectionTex.rgb * (1 - roughness) * 0.08 * enabled * fogOpacity;
  ```
  Nejde o `envMap`. Odraz se přičte jako emise, takže obchází osvětlení, nemá Fresnel a jde do bloom MRT. Síla 0,08 dává „náznak neonu, ne chromovou podlahu“. Roughness = textura × 0,55.
- SSR bylo zkoušeno a odstraněno (commit `ea84fd7`) jako drahé a nestabilní. `AGENTS.md` ho zakazuje vracet.

**Náklady:** druhý render celé scény s plnými materiály v polovičním rozlišení. Frame skip existuje (`groundReflectionFrameSkip`), ale ve výchozím stavu je 1, tedy bez přeskakování. Mobil a Safari ho nevypínají, vypíná se jen ručně.

**Omezení:**
- Jen **jedna nekonečná rovina**. Chodníky, rampy, střechy a kaluže v jiné výšce se neodrážejí správně.
- Žádný Fresnel ani roughness blur (mipy nejsou, rozmazání nahrazuje normálový warp).
- Mirror kreslí plnou scénu bez LOD, takže v hustém městě se zdvojnásobí draw cally.

**SDL_GPU:** oblique projekce je jen matice a funguje všude. Alternativa `SV_ClipDistance` přes shadercross a Metal je nejistá (otevřená otázka). Pro nás:
- Mirror pass s **redukovaným draw listem** (LOD+1, kratší draw distance, bez průhledných objektů, bez AO, jednodušší osvětlení) a s frame skipem.
- Rovinu volit dynamicky jako dominantní výšku ulice pod kamerou (lze přečíst z collision height mapy).
- Přidat Schlick Fresnel `F0 = 0.02` a sílu podle wetness masky (puddle mask × rain occlusion).
- Dlouhodobě hybrid: SSR pro nerovinné plochy a fallback na planární odraz nebo sky probe.

### 5. GTAO

**Soubor:** `post/postprocessing.js:99-137`. Implementace je Three `GTAONode` (addon, není v repu).
- Vlastní **AO pre-pass**: celá scéna znovu s kamerou bez rain a smoke layer, MRT `output = packNormalToRGB(normalView)` v RGBA8 plus depth.
- `ao(depth, normal, aoCamera)`: `resolutionScale 0.5`, `samples 6`, radius 0,4, scale 1,7, thickness 1, distanceExponent 1, falloff 1, **`useTemporalFiltering = false`**, protože TRAA nepoužívají. Šum skrývá jen bilineární upsample.
- Aplikace (`:228-232`): `beauty = beauty * vec4(ao)`, tedy **post-multiply na finální barvu**, včetně přímého světla a emise. Fyzikálně je to špatně, ale ve tmavé noční scéně to působí jako kontaktní stíny.
- Na mobilu je AO vypnuté (`performanceProfile.js:73`).

**SDL_GPU:**
- Pass by měl být compute (half-res, 1 storage texture výstup a 2 sampled vstupy). Bindless netřeba.
- Pro nás lepší pořadí: **depth+normal prepass → AO (compute, half) → bilaterální upsample → forward pass AO sampluje a násobí jen ambient/indirect**. Jeden prepass tak nahradí jejich dva rendery (AO pre-pass a beauty) a dá early-Z.
- Bez TAA je vhodný 4×4 spatial denoise (blur s depth vahou).

### 6. Bloom přes emissive MRT

**Soubory:** `post/postprocessing.js:113-126, 147-148, 209-223`, `cyberpunkLook.js:316-324, 379-384`.
- `bloom(scenePassEmissive, 2.5, 0.45)` při 0,5 res. Threshold je 0, takže bloomuje **jen to, co materiál deklaruje jako emisi**: neony, video billboardy a odraz ve vodě. Žádný luminance threshold nad celou scénou neexistuje, a světlé nebe ani spekulár proto nekvetou.
- Three `BloomNode` je port UnrealBloom: 5 mipů, separabilní gauss s jádry 3/5/7/9/11 a váhy mipů interpolované přes `radius`.
- Preset řídí `strength = bloom.strength + bloomWide.strength·0.35` a `radius = max(bloom.radius, bloomWide.radius·0.55)`. „Wide“ bloom tedy není samostatný pass, jen se složí do parametrů.
- V kompozitu se bloom **tlumí mlhou**: `hazed += bloom · (1 − fogBlend·0.75)`, takže vzdálené neony v mlze nekvetou.

**SDL_GPU:**
- MRT funguje (2 color targety). Pro nás `RGBA16F` (HDR barva) a `R11G11B10_UFLOAT` (emise) místo jejich 8bit, aby HDR emise nebyla oříznutá. Podporu formátu jako render target je potřeba ověřit přes `SDL_GPUTextureSupportsFormat`.
- Bloom jako downsample a upsample chain (Jimenez COD:AW 13-tap down a tent up) v compute nebo fragmentu, s 5 až 6 mipy z half-res. Každý krok potřebuje 1 sampler a 1 storage texture, takže se limity vejdou.

### 7. Lens flare

**Soubor:** `post/postprocessing.js:150-163`. Implementace je Three `LensflareNode`, pseudo lens flare podle Chapmana.
- Vstupem je **výstup bloomu**, ne scéna. Generuje ghosty (spacing 0,22 až 0,27, attenuation 22 až 50) a halo nad thresholdem (0,09 výchozí, 0,9 v neonNoir), pak `gaussianBlur(flare, 4, 4, res 0.5)` a přičte se jako `bloom + flare·strength` (0,35 v neonNoir).
- Mobil ho vypíná a adaptivní DPR ho vypne při poklesu FPS (`main.js:136-142`).

**SDL_GPU:** jeden fullscreen pass a blur bez problémů. **Priorita nízká.** Pro estetiku GTA III jsou typičtější **korony** (billboardy záře u světel s okluzí). Bez occlusion queries v SDL_GPU se okluze řeší ve vertex shaderu korony vzorkováním depth bufferu v několika bodech kolem promítnutého středu světla.

### 8. DoF

**Soubory:** `post/postprocessing.js:167-179, 244-251`, `tsl/boxBlur.js:17-55`.
- **Ve výchozím stavu vypnutý všude** (`performanceProfile.dof = false`) a na Safari se nikdy nesestaví. Zapíná se jen v inspektoru.
- Separabilní box blur (size 3, separation 2 → 7 tapů po 2 px na osu) s premultiplied alfou: `mix(beauty, blurred, smoothstep(36, 75, |viewZ − focusZ|))`. Focus point se tweenuje přes GSAP (click-to-focus).
- Prakticky je to „distance blur“, ne skutečné bokeh DoF.

**SDL_GPU:** dva fullscreen passy. Priorita nízká (cutscény, foto režim).

### 9. Grade, fog a look presety (nejde o LUT)

**Soubor:** `post/look/cyberpunkLook.js`.
- Grade je **parametrický**, LUT se nepoužívá. `buildComposite` (`:362-418`):
  ```js
  distanceFog = smoothstep(fogNear, fogFar, viewDistance);         // viewZ ze scene passu
  skyFog      = smoothstep(0.68, 1.0, linearDepth);                // nebe (background nemá viewZ)
  fogFactor   = max(distanceFog, skyFog) * fogEnabled * fogAmount;
  hazed = mix(beauty.rgb, fogColor, fogFactor) + bloom * (1 - fogBlend*0.75);
  tinted = hazed * gradeTint + gradeOffset;
  g = vec3(r, mix(g, luma, greenSuppress), b);                     // potlačení zelené
  g = saturation(g, sat);  g = mix(vec3(luma), g, contrast).max(0);
  graded = mix(hazed, g, gradeMix);
  // + edge CA (r/b UV škálované o ±strength·0.015 · edgeMask), vignette smoothstep(sm,1,|uv-0.5|·1.6)
  ```
- Edge CA (`edgeChromaticAberration.js:49-93`): `edgeMask = 1 − 1/(1 + (dist·falloff)²)`, 4 tapy a dither.
- Film grain (Three `FilmNode`) se aplikuje **až po SMAA** (`postprocessing.js:255-257`), aby AA nerozmazalo zrno.
- **6 presetů** (`:104-265`): `neutral`, `neonNoir` (výchozí), `magentaRain`, `tealDusk`, `silentHill` (fog −20..30 m, saturace 0,42, kontrast 1,91), `sinCity` (saturace 0, kontrast 2, fialová mlha). Každý preset je struct asi 16 floatů (fog ×5, tint, offset, sat, contrast, greenSuppress, gradeMix, CA ×2, vignette ×2, grain) plus parametry bloomu a flare. Uložení v localStorage, přepnutí jen přepíše uniformy, bez rekompilace.
- Fog je čistě **post-process podle hloubky** s konstantní barvou. Průhledné objekty bez depth write (déšť, kouř) proto dostanou mlhu podle toho, co je za nimi.

**SDL_GPU a pro nás:**
- Look preset jako datový struct, mezi presety **lineární blend** (počasí, denní doba, zóna). Přesně tak funguje WoW s per-zónovými „light params“ (barva mlhy, nebe, ambient), mezi kterými interpoluje.
- Runtime buď parametricky (je to levné ALU), nebo **předpéct parametrický grade do 3D LUT** (32³ `RGBA8`, `eng_gen_tex` nebo tools) a v runtime jen 1 sample. LUT navíc umožní paletovou kvantizaci pro stylizaci, která je v našem plánu.
- Fog raději počítat **ve forward shaderu** (výška, vzdálenost a barva podle směru ke slunci). Post-fog z hloubky nefunguje pro průhledné objekty.

### 10. SMAA

**Soubor:** `post/postprocessing.js:255, 352-356`. Three `SMAANode`: SMAA 1x, 3 passy, area a search textury vložené v addonu. Volitelné podle profilu.
- Aplikuje se **před tone mappingem**, na lineární 8bit vstup ořezaný na [0,1]. Hrany neonů tedy fungují jen proto, že jsou oříznuté.
- **SDL_GPU:** standardní 3 fragmentové passy (1 až 2 samplery na pass). Area a search tabulky jsou v referenčním SMAA repu jako C hlavičky (`AreaTex.h`, `SearchTex.h`, MIT). Jsou to data, ne art, a odpovídají pravidlu „vše z kódu“. Případně je vygenerovat jejich generátorem v `tools/`.
- Pro nás SMAA na interním rozlišení (1080p nebo 1512×982) až po tone mappingu (na LDR, jak SMAA předpokládá). Pak teprve vlastní upscale a grain.

### 11. Výkonové páky

| Páka | Kód | Výchozí hodnota | Poznámka |
|---|---|---|---|
| Half-res passy | `performanceProfile.js:20-41` | AO 0,5, bloom 0,5, flare 0,5, mirror 0,5 | jediný skutečně aktivní „velký“ šetřič |
| Render layers | `postprocessing.js:36-54` | rain a smoke mimo AO pre-pass, rain mimo mirror | |
| Frame skip | `createCollisionHeight.js:90-97`, `createGround.js:195-199` | **1, tedy vypnuto** | perzistentní RT se reuse při přeskočení |
| Distance fade | `applyCarSurfaceRain.js:289-318` | 20 až 32 m | shader běží dál |
| Statické stíny | `createRenderer.js:46`, `scene.js:39` | `autoUpdate = false` | 4096² se renderuje jen na vyžádání (init, resize, změna světla). Pro statické město je to velká úspora. |
| Split compile | `runtime/warmup.js:75-144` | – | kritická cesta: déšť, kouř a letadla skryté, pak `compileAsync(scene, beautyCam)` a 1 post snímek. Deferred: zbytek během intra. Safari čeká, protože souběžný compile a resize ho zamrazí. |
| Adaptivní DPR | `platform/adaptiveDpr.js:11-88` | target 50 FPS, 2 okna po 1 s | **jednosměrné**: DPR spadne na 0,85 a nikdy se nevrátí. Současně vypne DoF, lens flare a video billboardy (`main.js:136-142`). Vzorkování se blokuje během intra (`main.js:148`, `createPerformanceDevTools.js:27`). |
| Device policy | `performanceProfile.js:63-80` | mobil: bez flare, billboardů a AO. Safari: bez adaptivního DPR, max DPR 1,25. | Komentář tvrdí „disable SMAA“, kód nastavuje `smaa = true` (nesoulad). |
| Video decode | `billboardFace.js` | play < 20 m, pause > 50 m (horizontální vzdálenost) | |

**Mapování na náš engine:**
- *Half-res* odpovídá deskriptoru transient textury s `scale` relativně k internímu rozlišení. Render graph alokuje z poolu.
- *Frame skip* znamená `update_every_n` u passu. Výstup ale musí být **perzistentní** (history resource mimo transient pool), jinak se přeskočený snímek čte z recyklované paměti.
- *Split compile*: HLSL kompilujeme offline, ale `SDL_CreateGPUGraphicsPipeline` stále stojí čas (na Metalu dokončení PSO, případně kompilace MSL ze zdroje). Proto **pre-warm všech pipeline na loading screenu** a pro streamované biomy deferred warm na pozadí.
- *Adaptivní DPR* odpovídá dynamickému internímu rozlišení s naším upscale shaderem. Bez timestamp queries se měří CPU frame time a prezentační interval. Na rozdíl od dema má být **obousměrné s hysterezí**.

### 12. Ostatní stojící za zmínku
- **Procedurální nebe** (`clouds/cloudsMaterial.js:48-173`): koule o poloměru 135 sleduje kameru (`BackSide`), vertex `position.z = position.w` ji posadí na far plane. Je to 2D šum na UV koule (3 vrstvy větru: distortion, sparse, fluff) z **2 šumových textur**, gradient `skyBottom → skyTop` a noční preset (`createCloudSky.js:37-51`, `createWorld.js:141-145`).
- **IBL:** HDRI `sunflowers_puresky_1k` → PMREM s intenzitou jen **0,08** (`main.js:89,101`). Ve scéně téměř nehraje roli, slouží jen pro odlesky laku a skla. Druhé HDRI (`white_home_studio`) a `rainDrop.png` se nepoužívají.
- **Osvětlení:** jedno stínující směrové slunce `#cfefff`, intenzita 10, plus jedno nestínující fill `#ffd6c8` 1,5 (`scene.js:24-48`). **Žádná bodová ani spot světla.** „Světlo“ neonů je jen emise, bloom a odraz v zemi.
- **Kouř:** `SpriteNodeMaterial` instancí (50 výfuk a 40 ambient), čas a range uzly bez simulace, textura `smoke.png`, `alphaTest 0.05`, layer 3.
- **Rain-on-glass intro:** viz bod 2. Po intru se z grafu odstraní (`disposeIntroRainGlass`, `postprocessing.js:281-292`).

---

## Které vstupy jsou assety a jak je nahradit kódem

| Asset | Použití | Náhrada kódem | Modul |
|---|---|---|---|
| `custom_noise.webp`, `custom_perlin.webp` | 2D šum mraků (`noiseTextures.js`) | tileable value, Perlin a Worley fBm (periodický gradient noise), 512² RGBA8, kanály = různé oktávy | `eng_gen_tex` |
| `textures/water-splash.webp` (5 snímků, grayscale bez alfy) | atlas splashů | buď generovat atlas (rozpínající se prstenec a „korunka“ z N kapiček s rozptylem po balistice, 5 až 8 snímků), nebo **analyticky v pixel shaderu** (ring `smoothstep` kolem `r(t)` a 4 až 6 kapiček podle hashe) úplně bez textury | `eng_gen_tex` / weather shader |
| `textures/rainDrop.png` | **nepoužito** (zbytek starého systému) | proužek kapky je už teď procedurální (`createCollisionRain.js:260-265`) | – |
| `textures/smoke.png` | sprite kouře | radiální falloff × fBm (2 až 3 oktávy) s měkkým okrajem, případně 4 varianty v atlasu pro rotaci | `eng_gen_tex` |
| `wet-puddles-albedo/roughness/normal.jpg` (~1 MB každý) | tiling země | asfalt: albedo z šumu a kamínků (Voronoi). **Maska louží jako samostatný nízkofrekvenční world-space fBm s thresholdem**, takže se neopakuje s tilingem 14,9. Roughness = mix(0.6 asfalt, 0.03 louže, mask·wetness). Normál ze Sobela výšky. Případně jednorázový AI generátor pro albedo a zbytek z kódu. | `eng_gen_tex` + material |
| HDRI `sunflowers_puresky_1k.hdr` | IBL (0,08) | render našeho procedurálního sky shaderu do malé cubemapy (64 až 128²) a GGX prefiltr mip chainu compute shaderem, nebo pro stylizaci jen **SH9 / hemisférický ambient gradient** z barev nebe | weather/sky + `eng_render` |
| HDRI `white_home_studio_1k.hdr` | **nepoužito** | – | – |
| `cyberpunk_compressed.glb` (město) | celé prostředí | procedurální generátor budov a ulic. Pozor: 68 ze 78 materiálů jsou **jen barevné faktory bez textur**, 24 materiálů jsou emisivní neony. Výborná zpráva pro náš přístup, look nestojí na texturách. | world gen |
| `quadra.glb`, `plane.glb`, `billboards.glb`, `colider.glb` | auto, letadla, plochy billboardů, hranice | procedurální vozidla s generovanou „rain UV“, collidery z generátoru | world gen |
| 6× MP4 (billboardy) | animovaná emise | procedurální animované cedule: SDF text a glyfy, scroll, flicker, jednoduché vzory nebo pixel-art animace v atlasu z kódu | `eng_gen_tex` + sign shader |
| SMAA area a search textury (v Three addonu) | AA lookup | C hlavičky z referenčního SMAA (MIT) nebo jejich generátor | `tools/` |
| GTAO noise (Three generuje „magic square“ noise sám) | AO jitter | blue noise nebo interleaved gradient noise z kódu | `eng_gen_tex` |

---

## Co převzít a kam

| Technika | Náš modul | Adaptace na HLSL + SDL_GPU | Priorita |
|---|---|---|---|
| Collision height RT (ortho shora, nejvyšší povrch, nearest) | weather + render graph pass `rain_occlusion` | depth-only ortho do `D32_FLOAT` (sampler usage) nebo `R16_FLOAT`. Kamera nad max výškou chunku. Mapování XZ↔UV sdílené v HLSL headeru. Perzistentní resource s `update_every_n`. Pass mask místo hide listu. | **P1** |
| GPU rain compute + instancované proužky | weather (`weather_rain.hlsl` compute a draw) | RW `StructuredBuffer` pos/vel (≤ 8 storage), `Load()` z height. **dt integrace**, PCG uint hash. VS čte storage buffer přes `SV_InstanceID` a quad z `SV_VertexID`. 30 až 100 k kapek, proužek protažený podle rychlosti. | **P1** |
| Statistické splashe snapnuté na výšku | weather | stejný compute, splash analyticky v PS bez atlasu, orientovaný podle normály povrchu (horizontální disk místo sférického billboardu) | **P1** |
| Rain occlusion → wetness maska (demo nemá) | `eng_render` material + weather | ve forward PS: `dry = surfY < height(xz) − ε`. Wetness = global_rain × (1 − dry) × puddle_mask. Řídí roughness, albedo darkening a reflexi. | **P1** |
| Ripple normály (world XZ, buňkový hash) | weather compute + `eng_gen_tex` | **upéct jednou za snímek** do tileable `R8G8_SNORM` 512² (compute, 5×5 kvalita) a samplovat na všech mokrých plochách. Ve formě per-pixel smyčky jen jako fallback. | **P1** |
| Emissive MRT → selektivní bloom | render graph `forward_opaque` a `bloom` | MRT `RGBA16F` a `R11G11B10_UFLOAT` (ne 8bit). Bloom chain 5 až 6 mipů z half-res (compute nebo frag). Bloom tlumený mlhou v kompozitu. | **P1** |
| Parametrický grade + look presety + blend | post `grade` + data presetů | struct ~16 floatů na preset, lerp mezi presety (počasí, zóna, čas). Bake do 3D LUT 32³ (tools nebo runtime compute při změně), v kompozitu 1 sample a paletová kvantizace. | **P1** |
| Statické cachované stíny (update on demand) | `eng_render` shadows | statické kaskády (nebo vzdálené kaskády) cachovat a re-render jen při pohybu slunce nebo změně chunku, dynamické objekty kreslit zvlášť | **P1** |
| Quality profile (`*ResolutionScale`, `*FrameSkip`, `*Count`) | core config + render graph | jeden struct čtený render graphem, presety podle zařízení, dev konzole pro A/B | **P1** |
| Pass mask (vrstvy) | render graph / draw list | bitmaska u draw itemu (`MAIN`, `MIRROR`, `SHADOW`, `HEIGHT`, `PREPASS`) místo klonů kamer a toggle `visible` | **P1** |
| Planární odraz s oblique projekcí | render graph pass `mirror` | větev 0..1 depth z `createGround.js:241-258`. Redukovaný draw list (LOD+1, bez průhledných), 0,5 res, frame skip. **Přidat Fresnel** a sílu × wetness. Rovina = výška ulice pod kamerou. | **P2** |
| Reflexe jako aditivní emise (do bloom MRT) | material | převzít myšlenku (odraz neonu kvete), ale s Fresnelem a jen na mokrých texelech | **P2** |
| GTAO half-res | render graph `ao` (compute) | ze sdíleného depth/normal prepassu, bilaterální upsample, aplikace **jen na ambient** ve forward passu | **P2** |
| SMAA 1x | post `aa` | 3 passy, LUT jako C hlavičky. Po tone mappingu na interním rozlišení, pak upscale. | **P2** |
| Dynamické rozlišení (adaptivní DPR) | core + upscale shader | CPU frame time a hysteréze, obousměrné, kroky 5 až 10 %. Při trvalém poklesu degradovat i drahé passy (mirror, AO). | **P2** |
| Pre-warm pipeline (split compile) | `eng_render` / loading | vytvořit všechny `SDL_GPUGraphicsPipeline` na loading screenu, deferred skupiny (počasí, efekty) na pozadí | **P2** |
| Kapky na karoserii a skle (`MovingDropLayer`) | material library (vozidla, okna) | port do HLSL s kreditem rocksdanister/BigWings. Rain UV z generátoru vozidla. Varianta pipeline bez deště pro LOD. Normála z `ddx/ddy` nebo 3 vzorků. | **P2** |
| Procedurální nebe s mraky (2D šum na kopuli) | weather/sky | z = w trik, šum z `eng_gen_tex`, presety den/večer/noc s lerpem. Výstup i do malé cubemapy pro ambient a odrazy. | **P2** |
| Rain-on-glass screen efekt | post (volitelně) | jen v pohledu z auta. Half-res blur a drop graph na screen UV. | **P3** |
| Lens flare (Chapman) | post | nízká priorita. Pro GTA III styl spíš **korony** s depth-sampled okluzí. | **P3** |
| Edge CA, vignette, film grain | post `grade` | volitelné, per preset. Dither/grain jen proti bandingu. | **P3** |
| DoF (separabilní box blur podle hloubky) | post | cutscény a foto režim | **P3** |

### Co nepřebírat
- **8bitové lineární beauty a emissive RT** s ořezem HDR emise. Používáme `RGBA16F` / `R11G11B10F`.
- **AO násobené na finální barvu** včetně emise a přímého světla.
- **Integrace deště bez `dt`** a float hash s `time·1000`.
- **Hide list přes `visible`** a 4× render celé scény bez sdíleného prepassu.
- **Fog jako post-process z hloubky** (rozbitý pro průhledné objekty a vázaný na hack `linearDepth > 0.68` pro nebe).
- Jednosměrný adaptivní DPR. Video billboardy (dekódování videa). HDRI a PMREM pipeline. GLB, Draco a KTX2 loadery. `three-mesh-bvh` (máme vlastní kolize). GSAP. Inspector a UI vrstva.
- **SSR jako první řešení mokrých ulic.** Shoda s autory: začít planárním odrazem a probe. SSR až jako doplněk.
- Hodnoty presetů 1:1 (cyberpunk neon noir není náš cílový look). Převzít mechanismus, ne čísla.

---

## Jak dosahuje kvality

1. **Kontrast tma a neon.** Pozadí `#080610`, IBL 0,08, chladné slunce jako „měsíc“. 24 emisivních materiálů s `emissive_strength` 2 až 429 v syté růžové, azurové a zelené. Většina geometrie jsou **ploché barvy bez textur** (68 ze 78 materiálů). Look tedy nestojí na texturách, ale na hodnotách, barvě a emisi.
2. **Selektivní bloom jen z emise.** Kvetou neony a jejich odrazy, nic jiného. Žádný „mlžný“ celoobrazový bloom. V mlze se bloom tlumí, takže hloubka zůstane čitelná.
3. **Mokrá ulice.** Planární odraz neonů v emisi × (1 − roughness), rozvlněný normálovou mapou a ripples ve world space. Roughness textura s loužemi rozhoduje, kde se odráží. Tohle je hlavní „money shot“ celého dema.
4. **Atmosféra ve vrstvách.** Mlha s modrofialovou barvou (0,34; 0,37; 0,47) od 0 do 50 m, sky fog, slabé proužky deště, splashe, kouř u výfuku, mraky na kopuli a letadla v pozadí. Každá vrstva je slabá, společně tvoří „vzduch“.
5. **Grade.** Potlačení zelené (typická cyberpunk paleta magenta a teal), jemný tint a offset, kontrast 1,1, vignette 0,8, edge CA a grain. Grain a dither navíc maskují banding 8bitových lineárních bufferů a šum half-res GTAO.
6. **Ukotvení objektů.** Statická 4096² mapa stínů a GTAO kontaktní ztmavení.
7. **Pohyb všude.** Ripples, stékající kapky na autě, mraky, kouř, letadla a video cedule. Scéna nikdy nestojí.
8. **Malý, vyladěný prostor.** Jedna ulička, ručně nastavené kamery (FOV 65, výška očí 1,55 m) a fog far 50 m skrývá okraj světa.

**Relevance pro náš cíl (GTA III / WoW stylizované):**
- Body 1, 2, 4 a 5 jsou **přímo přenositelné** a levné. Stylizovaný svět s plochými nebo jednoduše texturovanými materiály, sytou emisí, barevnou mlhou a gradem je přesně oblast, kde GTA III (noční město, korony, mokré silnice ve VC/SA) a WoW (per-zónové barvy mlhy a nebe s interpolací) působí nejvíc.
- Mokrá ulice (bod 3) je pro scénář „deštivé husté město“ zásadní. Pro open world ale potřebuje wetness masku (rain occlusion z výškové mapy) a Fresnel, ne jen jednu rovinu.
- Demo **nemá lokální světla**. V otevřeném městě (pouliční lampy, světla aut, okna) budeme potřebovat stovky dynamických nebo fake světel, např. clustered forward, nebo levnější „light cards“ s emisí plus koronami. Tohle demo nijak nepokrývá.
- Edge CA, lens flare a DoF jsou kinematografické prvky mimo estetiku GTA III a WoW. Ponechat je jen jako volitelné části presetu.

---

## Otevřené otázky

1. **Odrazy v hustém městě:** stačí jedna dynamicky volená planární rovina (ulice pod kamerou), nebo hned plánovat hybrid planární + SSR + sky probe? Jak to bude vypadat na víceúrovňových ulicích, mostech a střechách?
2. **Výšková mapa deště:** per-frame render kolem kamery (jako demo), nebo offline/při streamu upečená per chunk (statická geometrie) a jen dynamické objekty (auta) dorenderovat nebo splatovat? Jaké rozlišení na metr pro wetness occlusion pod markýzami (0,2 m nestačí na úzké stříšky)?
3. **SDL_GPU detaily:**
   - Je `R11G11B10_UFLOAT` color target s blendingem podporovaný na všech třech backendech?
   - Funguje `SV_ClipDistance` přes SDL_shadercross na Metalu (alternativa k oblique projekci)?
   - Lze `SDL_CreateGPUGraphicsPipeline` volat z vedlejšího vlákna kvůli deferred pre-warmu?
   - Dá se samplovat `D32_FLOAT` jako výška v compute?
4. **Lokální světla:** clustered forward vs. omezený počet per-object světel vs. pečená vertex light (GTA III styl)? Demo odpověď nedává.
5. **Rain UV pro procedurální vozidla a okna:** object-space projekce, nebo generovaná druhá UV? A jak ošetřit stékání „dolů“ na zakřivených plochách?
6. **Grade:** runtime parametrický, nebo bake do 3D LUT? A kde přesně v pipeline bude paletová kvantizace (před SMAA, nebo po něm)?
7. **AA a upscale:** SMAA na interním rozlišení a vlastní upscale, nebo lehké TAA (které by zároveň vyhladilo AO a ripples)? Bez timestamp queries je potřeba A/B měřit CPU frame časem.
8. **Měřítko deště:** kolik kapek a jak velký objem pro rychlou jízdu autem (100+ km/h), když objem kolem kamery wrapuje? Potřebujeme kompenzaci rychlosti kamery (proužky ve směru relativní rychlosti)?

---

## Opravy oproti poznámkám (2026-09-24)

- **Ripples nejsou 5×5, ale 3×3** (`rainRipples.js:20-23`, `MAX_RADIUS = 1`). Dokumentace v repu si sama protiřečí.
- **DoF je ve výchozím stavu vypnutý** na všech zařízeních (`performanceProfile.js:26`) a sestavuje se jen přes inspektor.
- **Frame skip** pro výškovou mapu i odraz existuje, ale výchozí hodnota je 1, takže se nepřeskakuje nic.
- **Grade nepoužívá LUT**, je to parametrická sekvence (tint, offset, green suppress, saturace, kontrast, mix).
- **Splashe nevznikají z dopadů kapek**. Jsou statisticky rozmístěné a jen snapnuté na výškovou mapu.
- Beauty a emissive RT jsou **8bitové** (HDR emise z GLB se ořízne). Tone mapping (ACES) je až na konci.
- Scéna se kreslí **4× za snímek** (height, mirror, AO pre-pass, beauty). AO je v samostatném pre-passu, ne v MRT beauty passu.
- Nepoužité assety: `rainDrop.png`, `white_home_studio_1k.hdr`. Nepoužitý kód: dedikovaný `rainPass`.
- Ve scéně nejsou žádná bodová ani spot světla, jen 2 směrová a IBL 0,08.
