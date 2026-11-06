# Setting up a development machine

How to start working on a new machine. Work is shared between machines only through the GitHub repo [`freema/wallhammerzero`](https://github.com/freema/wallhammerzero) (public, D76) and Linear (D75). The collaboration rules are in [CONVENTIONS.md](CONVENTIONS.md), chapter 12.

The engine build does not exist yet. It will appear in M0a (NSO-581 to NSO-586). Until then a machine needs only Git, Claude Code and a clone of the repo. The build steps will be added here once the skeleton is ready.

## Windows PC (NVIDIA)

### 1. Programs

| Program | From | Note |
|---|---|---|
| Git for Windows | `winget install Git.Git` | Claude Code needs it. |
| GitHub CLI | `winget install GitHub.cli` | Sign in to GitHub without manual SSH keys. |
| Claude Code | in PowerShell `irm https://claude.ai/install.ps1 \| iex` | Sign in with the same account as on the Mac. Linear then connects by itself. |
| Visual Studio Build Tools | [visualstudio.microsoft.com/downloads](https://visualstudio.microsoft.com/downloads/), Tools section, "Build Tools for Visual Studio" | The only system-wide install (D75), see below. |

In the Visual Studio Installer select:
- the workload **Desktop development with C++**,
- the component **C++ Clang tools for Windows** (clang-cl, D26),
- the component **Windows 11 SDK** (the newest).

Full Visual Studio is not needed. cmake and ninja are not installed. A script downloads them into `.tools/` (D6).

### 2. Git configuration

```powershell
git config --global core.autocrlf false
git config --global core.longpaths true
git config --global user.name "Tomáš Grasl"
git config --global user.email "<same e-mail as on the Mac>"
gh auth login
```

Line endings are controlled by `.gitattributes` in the repo, so `autocrlf` stays off.

### 3. Cloning the repo

A short path because of the path length limit on Windows:

```powershell
mkdir C:\dev
cd C:\dev
gh repo clone freema/wallhammerzero
cd wallhammerzero
claude
```

After start, Claude Code reads `CLAUDE.md` and from it all the documentation. The Mac's memory is not on Windows. Everything needed is in the repo.

### 4. Machine details

Add the graphics card model, processor and memory to D75 in [DECISIONS.md](DECISIONS.md). You can find them in Task Manager on the Performance tab. Just tell Claude.

### 5. Check

In Claude Code type: "Read STATUS and tell me where we are." The answer should match what you see on the Mac.

## MacBook (M4 Pro)

- Command Line Tools (`xcode-select --install`). Xcode is not installed (D35).
- A clone of the repo and Claude Code. Nothing else is installed system-wide. Tools are downloaded into `.tools/` (D6).

## How to work on two machines

1. At the start of a session, `git pull`.
2. Pick a task in Linear and switch it to In Progress. Leave alone a task that is In Progress on the other machine.
3. Code is written on the task's branch (Linear suggests the branch name, for example `graslt/nso-581-…`).
4. Before merging into `main`, `scripts/check` must pass (it will appear in M0a).
5. At the end of a session, commit and push. Nothing stays on one machine only.
