# Dev environment

Everything runs locally in Docker and nothing is installed on the host (D16). The host needs
Docker with Compose, git and a POSIX shell. Claude Code runs on the host and reaches Node, npm
and every tool through one wrapper, `./dev`.

## Commands

| Command | What it does |
|---|---|
| `./dev npm run check` | **The gate.** Runs every check in the repo; exit 0 means all passed. |
| `./dev <cmd> [args...]` | Runs any command in the dev container (`docker compose run --rm dev <cmd>`), e.g. `./dev node --version`, `./dev npm install <pkg> -w <workspace>`, `./dev bash`. |
| `./dev -p <port> <cmd> ...` | The same, with the container port published on `127.0.0.1:<port>`. For a short-lived server that the host browser must reach. |
| `./dev compose <args...>` | `docker compose <args...>` for this checkout, e.g. `./dev compose up studio`, `./dev compose down --volumes`. |
| `tools/dev-env/watch-probe.sh` | The file-watch probe (runs on the host; see below). |

`./dev` keeps the caller's folder: called from `tools/check`, the command runs in
`/work/tools/check`. Run the gate from the repo root; in a workspace folder, `npm run check` is
only that workspace's check.

Plain `docker compose ...` stops with an error on purpose. The wrapper sets the Compose project
name and the user ID; without them a command would use another `node_modules` volume and write
root-owned files.

### Exit codes

`./dev <cmd>` exits with the exit code of `<cmd>`. A wrapper usage error is 2, and a command
that does not exist is 127.

The gate's exit code is the verdict, so **never pipe the gate** (`| tail`, `| grep`): a pipe
returns the exit code of its last command and hides a failure. To commit only on green, chain
with `&&`:

```sh
./dev npm run check && git commit -m "..."
```

The wrapper keeps Compose quiet, so stdout holds only the command's output. Messages of the
wrapper and the entrypoint start with `[dev]` and go to stderr, as does the output of an
automatic `npm ci`. `COMPOSE_PROGRESS=auto ./dev ...` shows Compose's own progress (for example
an image pull).

## The container

Defined in [`compose.yaml`](../compose.yaml), service `dev`:

- **Image:** `node:24.21.0-bookworm-slim` (Node 24 LTS, npm 11), pinned by version and by the
  sha256 digest of the multi-arch index. The host's Node 22.21 is too old for the studio stack
  and is never used.
- **Repo:** bind-mounted at `/work`.
- **`node_modules`:** a named volume mounted at `/work/node_modules`, one per checkout. On the
  host, `node_modules/` is an empty folder.
- **npm cache:** the named volume `whz-npm-cache` at `/home/dev/.npm`, shared by all checkouts.
  npm's cache is content-addressed and verified on read, so sharing it is safe, and a second
  checkout installs without downloading.
- **User:** commands run as the host user's UID and GID, so files written to the repo are not
  root-owned. `HOME` is `/home/dev`.
- **Network:** Docker's default bridge: outbound access for npm, and no port is published. No
  Compose network is created per checkout.

Every Node service uses the entrypoint
[`tools/dev-env/entrypoint.sh`](../tools/dev-env/entrypoint.sh):

1. As root, it gives the roots of the named volumes to the host user (a new volume is
   root-owned).
2. It drops to the host UID/GID for good (`setpriv`), then runs everything else as that user.
3. **Dependency sync:** if `node_modules` is behind `package-lock.json`, it runs `npm ci` first.
   A fresh clone, a new worktree or a pulled lockfile change therefore needs no manual install:
   `./dev npm run check` is always enough. The comparison
   ([`deps-in-sync.mjs`](../tools/dev-env/deps-in-sync.mjs)) is between the lockfile and npm's own
   record of what is installed, so it costs milliseconds. Two commands started at the same time
   in one checkout install once (a file lock on the volume).
4. It `exec`s the command, so the command's exit code is the container's.

The sync is skipped for `npm install`, `npm ci` and the other npm commands that install by
themselves, and when `WHZ_SKIP_INSTALL=1` is set.

A later service (the studio) starts from the same base with `<<: *node-service` in
`compose.yaml` and adds its command and ports.

### Changing dependencies

Run npm in the container, and commit `package.json` and `package-lock.json` together:

```sh
./dev npm install <pkg> -w @whz/<workspace>      # add to one workspace
./dev npm install                                # after adding a new workspace folder
```

### Updating the Node image

Look up the digest of the new tag, then change the `image:` line in `compose.yaml` (version and
digest together):

```sh
docker buildx imagetools inspect node:<x.y.z>-bookworm-slim    # "Digest:" of the index
```

The gate fails if the running Node is not the version named in the pinned tag, or if an image
in `compose.yaml` is not pinned by version and digest.

## The gate

`./dev npm run check` runs [`tools/check/run.mjs`](../tools/check/run.mjs). The root script is an
aggregator: it discovers the checks, so **a new package adds its checks without editing the root
script.**

What it runs, in this order:

1. every root script named `check:<name>` in the root `package.json` (for checks that span the
   repo), sorted by name;
2. the `check` script of every workspace, in the order of the root `workspaces` list
   (`tools/*`, then `packages/*`), each group sorted by folder name.

Rules:

- **Every workspace must have a `check` script.** A workspace without one fails the gate, so no
  package is silently unchecked. A package's `check` chains everything that package needs
  (typecheck, lint, tests).
- All checks run even after one fails; the summary at the end lists each as `ok` or `FAIL`, and
  the exit code is non-zero if any failed. A repo with no checks at all also fails.
- A new workspace must be in `package-lock.json` (`./dev npm install`, then commit the
  lockfile); the gate fails with that instruction otherwise.
- Workspace package names are `@whz/<folder name>` (`tools/check` is `@whz/check`).
- The root `workspaces` list supports a folder or `<folder>/*`; any other pattern is an error.

While working on one package:

```sh
./dev npm run check -- @whz/check       # only this check (a package name or a folder)
./dev npm run check -- --list            # what the gate would run
./dev npm run check -- --bail            # stop at the first failure
```

A filtered run is for iterating. Only the full `./dev npm run check` is the gate.

The tools' checks are plain `node --test`:

- `@whz/check`: tests of the aggregator itself (a failing check fails the gate, and so on).
- `@whz/dev-env`: the smoke test of the environment (runs in the container, Node is the pinned
  24.x, runs as the host user, bind-mount files belong to the host user, `node_modules` and the
  npm cache are volumes, dependencies are in sync), the `compose.yaml` lint and the tests of the
  dependency sync.
- `@whz/task-queue`: the queue reader of the `implement-tasks` skill
  (`./dev node tools/task-queue/cli.mjs`: which note is next, which wait for the owner), plus
  checks that keep the skill's text tied to the repo (its links, the files and commands it names,
  the shape of `docs/progress.md`).
- `@whz/skill-intake`: the lints of the skill intake records (`security/skill-intake/`: registry,
  evidence, baselines), the pins of the scanner image, and tests of the scan command against a
  stand-in `docker`. The scanner itself runs on the host's Docker, not in the gate
  ([security/skill-intake/README.md](../security/skill-intake/README.md)).
- `@whz/lint`: proves the determinism lint fires (see below).

The TypeScript packages (`packages/*`) and the asset programs (`assets/`) are checked as
described in the next section.

## TypeScript packages

The toolchain is installed once, as `devDependencies` of the root `package.json`: TypeScript,
ESLint with typescript-eslint, and Vitest. A package's `check` script chains all three:

```json
"check": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.test.json && eslint . && vitest run"
```

- **No build step.** A package exports its TypeScript source (see the `exports` field of
  `packages/det/package.json`). Node 24 runs it directly, so does Vitest, and a bundler takes it
  as it is. For that to work the code uses only syntax Node can strip (the compiler option
  `erasableSyntaxOnly`: no `enum`, no parameter properties), writes the `.ts` extension in
  imports, and imports JSON `with { type: "json" }`.
- **[`tsconfig.base.json`](../tsconfig.base.json)** holds the compiler options (strict, no emit).
  Each package has two configs on top of it. `packages/det/tsconfig.json` covers the source with
  no ambient types (no Node types, no DOM library), so code that must run in Node and in the
  browser cannot reach for either. `packages/det/tsconfig.test.json` covers tests and scripts and
  adds the Node types.
- **[`eslint.config.js`](../eslint.config.js)** is the one ESLint config. A new package needs no
  change there unless it joins the determinism lint.
- **Tests** are the `*.test.ts` files in a package's `test` folder, run by Vitest with no config
  file.
- **Asset programs** are not a workspace. The root script `check:assets` typechecks `assets/`
  (`assets/tsconfig.json`) and lints it.

### The determinism lint

Code that must give the same result on every engine and in a later port may not use clocks,
unseeded randomness or floating-point `Math`: `Math.random`, `Date`, `performance`,
`Math.sin/cos/tan/exp/log/pow`, `Math.round`, `Math.sqrt` and every other `Math` member except
the exact integer helpers, `**`, `parseFloat`, timers, `globalThis` and `node:` imports. The
replacements are in [`@whz/det`](../packages/det/README.md). The rules and their messages are in
[`tools/lint/determinism.js`](../tools/lint/determinism.js) (ESLint core rules only), and the
list of files under them is `DETERMINISTIC` in `eslint.config.js`: today everything in
`assets/`, `packages/det/src/` and `packages/asset-kit/src/`. Tests and build scripts are exempt.
A later package (the sim, the synth) joins by adding its source glob to that list.

## Several checkouts at once (git worktrees)

Each checkout directory is its own Compose project. `./dev` names it
`whz-<folder name>-<checksum of the absolute path>`, so two checkouts never share a
`node_modules` volume, even when their folders have the same name. Gates can run in several
worktrees at the same time. Only the npm download cache is shared.

Volumes do not go away when a checkout is deleted. To remove them:

```sh
# before deleting a checkout: remove its node_modules volume
./dev compose down --volumes

# list all node_modules volumes with the checkout each belongs to
docker volume ls --filter label=whz.checkout --format '{{.Name}}\t{{.Label "whz.checkout"}}'

# remove the volumes of checkouts that no longer exist
docker volume ls --filter label=whz.checkout --format '{{.Name}}\t{{.Label "whz.checkout"}}' |
  while IFS="$(printf '\t')" read -r name checkout; do
    [ -d "$checkout" ] || docker volume rm "$name"
  done

# remove the shared npm download cache (it is rebuilt on the next install)
docker volume rm whz-npm-cache
```

## Ports

Every published port is bound to **`127.0.0.1` only**, has a fixed default, and can be
overridden with an environment variable named `WHZ_<SERVICE>_PORT`:

```yaml
ports:
  - "127.0.0.1:${WHZ_STUDIO_PORT:-4100}:4100"
```

[`tools/dev-env/compose-lint.mjs`](../tools/dev-env/compose-lint.mjs) enforces this form in the
gate for every port in `compose.yaml`, and rejects `network_mode: host`, duplicate default
ports and duplicate variables. Inside the container a server must listen on `0.0.0.0`; the
loopback binding is on the host side.

| Port | Variable | Use |
|---|---|---|
| 4100 | `WHZ_STUDIO_PORT` | The studio (reserved; the service comes with the studio skeleton note). |
| 4101 | none | Short-lived servers for a check, started with `./dev -p 4101 <cmd>`. Stop them afterwards. |

Two checkouts that run the same service at the same time need different ports, e.g.
`WHZ_STUDIO_PORT=4110 ./dev compose up studio`.

## No GPU in containers

Containers on macOS have no GPU: Docker Desktop runs them in a Linux VM without GPU
passthrough, and the dev container has no GPU device (`/dev/dri` does not exist). Chrome 139
removed the automatic software WebGL fallback, so creating a WebGL context in a headless
browser in a container fails instead of falling back
([research/studio-stack.md §7.5](../research/studio-stack.md#75-headless-render-endpoint-shared-by-the-studio-and-claude-code)).
**Headless WebGL in a container is not a way to check graphics here.**

Visual checks use one of two routes:

- **CPU renderers in Node, in the container.** Asset generators and the CPU reference renderer
  produce pixels without a GPU; checks compare numbers and hashes.
- **The host browser through the Chrome DevTools MCP tools.** A page served from a container on
  a `127.0.0.1` port is opened in the host's Chrome, which has the real GPU.

## File-watch probe

The studio runs in a container and watches the bind-mounted repo while a process on the host
(Claude Code, an editor) writes files. The probe measures whether those writes arrive as watch
events, how late, and whether a burst loses any.

```sh
tools/dev-env/watch-probe.sh           # on the host; about a minute; --json for raw numbers
```

**Method.** The container half ([`watch-probe.mjs`](../tools/dev-env/watch-probe.mjs)) watches a
gitignored scratch folder in the repo with `fs.watch(dir, {recursive: true})` (inotify; this is
what chokidar 5 uses). It asks for each write by renaming a command file into place; the host half
([`watch-probe.sh`](../tools/dev-env/watch-probe.sh), plain `sh`) spins on that file and writes
at once. Latency is the time from the rename returning to the event arriving, measured on the
container's clock only, so no two clocks are compared. It includes the host's reaction time and,
in a burst, the time the host needs to write the files: the numbers are upper bounds. An event
counts as received when it names the written file. The exit code is 3 when any event was
missed.

**Result of 2026-10-02** (macOS 15 host, Docker Desktop 29.4.1, Node 24.21.0 in the container;
latency in ms as min / median / p95 / max):

| Host write | Seen | Missed | Latency |
|---|---|---|---|
| Create a file, 20 single writes | 20/20 | 0 | 6.4 / 14 / 15.1 / 15.1 |
| Append to a file, 20 single writes | 20/20 | 0 | 12.2 / 14.7 / 19.4 / 19.4 |
| Replace a file (write temp + rename), 20 single writes | 20/20 | 0 | 13.9 / 15.8 / 20.3 / 20.3 |
| New folder with a file in it, 20 times | 20/20 | 0 | 13.2 / 15.4 / 17.7 / 17.7 |
| **Burst: create 100 files** (3 runs) | 100/100 each | **0** | worst run 12.3 / 25.8 / 30.6 / 30.8 |
| **Burst: append to 100 files** (3 runs) | 100/100 each | **0** | worst run 10.2 / 90.7 / 152.3 / 158 |
| **Burst: replace 100 files** (3 runs) | 100, 80, 86 of 100 | **0, 20, 14** | worst run 12.8 / 327.8 / 573.4 / 593.7 |
| Burst: 100 new folders with a file in each (3 runs) | 100/100 each | 0 | worst run 12.1 / 144.4 / 295.5 / 301.1 |
| Polling: `stat` sees an appended file, 20 writes | 20/20 | 0 | 10.5 / 16.7 / 19.8 / 19.8 |
| Polling: `stat` sees a replaced file, 20 writes | 20/20 | 0 | 12.1 / 21.2 / 29.6 / 29.6 |

A polling scan (`readdir` + `stat`) of 960 entries on the bind mount took 38 ms (0.04 ms per
entry).

Two earlier runs on the same day, while the machine was busy with other containers, had the same
pattern with higher latencies: single writes up to 273 ms, a 100-file create burst up to
219 ms, an append burst up to 700 ms and a scan at 0.11 ms per entry. Replace bursts lost the
event for 1 to 40 of 100 files there, and in one run a single replace out of 20 was missed.

**What this means:**

- **Native events are reliable for created and modified files and for new folders:** no event
  was lost in any run, bursts included, and the events arrive well inside the studio's 2 s
  budget.
- **A replaced file (write a temp file, then rename it over the target) can lose its event.**
  In a burst, up to 40 of 100 files got no event under their own name. In the runs that
  recorded it (all but the first), every such file did get an event under the *temporary* name,
  in the same folder. Many tools write this way.
- So a watcher must treat an event as "this folder changed", not as "this file changed": on
  any event, re-`stat` the files of that folder and compare mtime, size and hash (the pipeline
  of research/studio-stack.md §2.2 already stats and hashes after the debounce). It must not
  drop events whose file name it does not know before that rescan.
- **Polling fallback.** A `stat` from the container saw every host write, replaced files
  included. If native events turn out unreliable on another machine or Docker version, the
  studio switches its watcher to polling at a **500 ms interval** (chokidar:
  `usePolling: true, interval: 500`). At 0.04–0.11 ms per entry, a sweep over 2,000 watched
  files costs about 0.1–0.2 s of one core, and the worst-case delay stays under the 2 s budget.
  Re-run the probe after a Docker Desktop upgrade.

## Known limits

- **Nested `node_modules`.** Only the root `node_modules` is a volume. When two workspaces need
  different versions of one dependency, npm puts the second copy in a `node_modules` folder
  inside that workspace, which is on the bind mount (gitignored, works, but slower).
  Prefer one version of a dependency across workspaces.
- **Host editors see an empty `node_modules`,** so they cannot resolve types of dependencies.
  Typecheck through the gate.
- **The image is slim:** no git, no compiler, no Python. A tool that needs one of them needs its
  own image (a Dockerfile pinned by digest), not a host install.
- **`./dev` attaches stdin.** Inside a shell loop that reads stdin, call it as
  `./dev ... </dev/null`.
- **Checks that test the environment only pass in the container.** `npm run check` on the host
  fails the smoke test and says to use `./dev`.
