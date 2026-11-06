# Pravidla pro sezení v tomto repu

Wallhammer Zero je vlastní 3D open-world engine v C17, ve kterém veškerou grafiku generuje kód. Začni čtením:
1. [docs/VISION.md](docs/VISION.md): co stavíme.
2. [docs/STATUS.md](docs/STATUS.md): kde jsme a co je otevřené.
3. [docs/DECISIONS.md](docs/DECISIONS.md): co je rozhodnuté a proč.
4. [docs/ROADMAP.md](docs/ROADMAP.md): jediný platný plán, milníky M0–M10.
5. [docs/CONVENTIONS.md](docs/CONVENTIONS.md): osy, jednotky, ID, jména.

## Zapisuj všechno, průběžně
Vlastník chce mít zapsané všechno, co chceme dělat, co jsme rozhodli a co už je vyřešené.
- **Každé rozhodnutí vlastníka** jde hned do `docs/DECISIONS.md` jako nové `Dn` s datem. Platí to i pro změnu názoru: staré rozhodnutí se nemaže, jen se označí jako nahrazené a odkáže na nové.
- **`docs/STATUS.md`** se aktualizuje po každém kroku: hotovo, rozpracováno, otevřené otázky, rizika a další krok.
- **`docs/VISION.md`** se mění jen tehdy, když se změní cíl.
- **Rešerše:** zprávy patří do `docs/research/`, poznámky k nim do `docs/research/notes/<název>/`.

## Fáze
Analýza je uzavřená (D36). Další je **implementace podle [docs/ROADMAP.md](docs/ROADMAP.md)**, první kód vznikne na pokyn vlastníka úkolem M0a. Práce se sleduje v Linearu (projekt Wallhammer Zero, tým Nsoft). Zahazovací prototypy nevznikají.

## Jazyk
Dokumentace je česky. Kód, identifikátory a komentáře v kódu jsou anglicky.

## Nástroje
Do systému se nic neinstaluje (D6). **Xcode se nepoužívá a nenavrhuje (D35).** Nástroje se stahují do `.tools/`.
