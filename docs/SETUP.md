# Příprava vývojového stroje

Jak rozběhnout práci na novém stroji. Práce se mezi stroji sdílí jen přes GitHub repo [`freema/wallhammerzero`](https://github.com/freema/wallhammerzero) (privátní) a Linear (D75). Pravidla spolupráce jsou v [CONVENTIONS.md](CONVENTIONS.md), kapitola 12.

Build enginu zatím neexistuje. Vznikne v M0a (NSO-581 až NSO-586). Do té doby stačí na stroji Git, Claude Code a klon repa. Kroky k buildu se sem doplní, jakmile bude hotová kostra.

## Windows PC (NVIDIA)

### 1. Programy

| Program | Odkud | Poznámka |
|---|---|---|
| Git for Windows | `winget install Git.Git` | Claude Code ho potřebuje. |
| GitHub CLI | `winget install GitHub.cli` | Přihlášení ke GitHubu bez ručních SSH klíčů. |
| Claude Code | v PowerShellu `irm https://claude.ai/install.ps1 \| iex` | Přihlásit se stejným účtem jako na Macu. Linear se pak připojí sám. |
| Visual Studio Build Tools | [visualstudio.microsoft.com/downloads](https://visualstudio.microsoft.com/downloads/), sekce Tools, „Build Tools for Visual Studio“ | Jediná systémová instalace (D75), viz níže. |

Ve Visual Studio Installeru vyber:
- workload **Desktop development with C++**,
- komponentu **C++ Clang tools for Windows** (clang-cl, D26),
- komponentu **Windows 11 SDK** (nejnovější).

Celé Visual Studio není potřeba. cmake a ninja se neinstalují, stáhne je skript do `.tools/` (D6).

### 2. Nastavení Gitu

```powershell
git config --global core.autocrlf false
git config --global core.longpaths true
git config --global user.name "Tomáš Grasl"
git config --global user.email "<stejný e-mail jako na Macu>"
gh auth login
```

Konce řádků hlídá `.gitattributes` v repu, proto `autocrlf` zůstává vypnuté.

### 3. Klon repa

Krátká cesta kvůli limitu délky cest na Windows:

```powershell
mkdir C:\dev
cd C:\dev
gh repo clone freema/wallhammerzero
cd wallhammerzero
claude
```

Claude Code si po startu přečte `CLAUDE.md` a z něj celou dokumentaci. Paměť z Macu na Windows není, všechno potřebné je v repu.

### 4. Údaje o stroji

Do D75 v [DECISIONS.md](DECISIONS.md) doplň model grafiky, procesor a paměť. Najdeš je ve Správci úloh na záložce Výkon. Stačí je napsat Claudovi.

### 5. Kontrola

V Claude Code napiš: „Přečti STATUS a řekni, na čem jsme.“ Odpověď má sedět s tím, co vidíš na Macu.

## MacBook (M4 Pro)

- Command Line Tools (`xcode-select --install`). Xcode se neinstaluje (D35).
- Klon repa a Claude Code. Do systému se nic dalšího neinstaluje, nástroje se stahují do `.tools/` (D6).

## Jak se pracuje na dvou strojích

1. Na začátku sezení `git pull`.
2. Vyber úkol v Linearu a přepni ho na In Progress. Úkol, který je In Progress na druhém stroji, nech být.
3. Kód vzniká na větvi úkolu (jméno větve nabízí Linear, například `graslt/nso-581-…`).
4. Před merge do `main` projde `scripts/check` (vznikne v M0a).
5. Na konci sezení commit a push. Nic nezůstává jen na jednom stroji.
