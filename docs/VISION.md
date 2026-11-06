# Vize: co chceme postavit

Popis cíle projektu. Tento soubor se mění jen tehdy, když se změní cíl. Detaily a jejich data jsou v [DECISIONS.md](DECISIONS.md).

## Jednou větou
Vlastní nativní **obecný 3D engine pro velké světy** inspirovaný architekturou RAGE a GTA. Veškerou grafiku v něm generuje kód, který píše AI.

## Co chceme
- **Obecný engine, ne engine pro jednu hru** (D15, D23). Musí zvládnout husté město ve stylu GTA, velkou procedurální planetu ve stylu Light No Fire, budovatelskou strategii ve stylu Cities: Skylines i velkou strategii ve stylu Stellaris.
- **Plné 3D open world** s volnou perspektivní kamerou: třetí osoba, kamera za autem, volná rotace (D3, D12).
- **Vizuální laťka aspoň GTA III / World of Warcraft:** nativní rozlišení, otexturované stylizované povrchy, husté město s budovami, auty a chodci (D13). Fotorealismus ne (D9).
- **Procedurální generování jako jádro enginu.** Svět, města, silnice, budovy, vegetace, props, auta a postavy vznikají z pravidel. Buňka světa může přijít z předpečených dat i přímo z generátoru (D8).
- **Žádný Blender ani ruční modelování.** Geometrie, animace a svět jsou kód. Textury jsou kód, nebo obrázek jednou vygenerovaný AI modelem a dál zpracovaný kódem (D8, D14).
- **Animace procedurálně:** IK, pružiny a fyzikální ragdoll (inspirace Euphoria a Overgrowth).
- **Tři platformy:** vývoj na macOS (M4 Pro), běh i na Linuxu a Windows (D2).
- **Práce přes AI:** vestavěné studio, MCP nástroje, headless režim a logy, aby engine šel ovládat a ladit strojově (D17, D18).
- **Jednotné měřítko:** rozměry řídí centrální tabulka a linty (D16).
- **Čistý systém:** všechno soběstačné ve složce projektu (D6).

## Jak spolupracujeme
- **Vlastník** je art director: píše specifikace, dodává reference a schvaluje výsledky.
- **Claude** je programátor a technical artist: píše generátory, linty, testy a review rendery.
- **Nejdřív analýza, pak kód** (D11).

## Čím se inspirujeme (ne co kopírujeme)
RAGE a GTA III–V (streaming, archetypy a instance, LOD), Horizon Zero Dawn (streaming, rozmisťování objektů), Our Machinery a Bitsquid (modularita v C), Naughty Dog (job systém), Substance Designer a Houdini (procedurální obsah), Tiny Glade a Townscaper (procedurální geometrie), Overgrowth a Euphoria (procedurální animace).
