# Docs check

Docs written by agents drift from the repo within days
([research/README.md](../research/README.md#conclusions-that-repeat-across-reports), conclusion 4).
`tools/docs-check` compares the docs with the repo on every gate run, so a stale link, path,
queue row or id fails the gate instead of misleading the next session.

**If a doc and the code disagree, the code wins, and the doc is fixed in the same commit.**

## Running it

It is the workspace `@whz/docs-check`, so `./dev npm run check` runs it with every other check.
Node only, no dependencies.

```sh
./dev npm run check -- @whz/docs-check       # the check on this repo, then the tool's own tests
./dev node tools/docs-check/cli.mjs          # only the check on this repo
```

Each problem is one line, `<file>:<line>: <message> [<rule>]`, sorted by file and line:

```text
docs/dev-environment.md:104: `tools/check/main.mjs` does not exist [paths]
tasks/README.md:74: note without a queue row: tasks/2026-10-05-new-thing.md is not in the Queue table [queue]
```

The exit code is 0 without problems and 1 with any. The last line counts what was checked.

## Rules

"The docs" are `CLAUDE.md`, `README.md`, every Markdown file under `docs/` and `tasks/`, and
`research/README.md`. The long research reports are not checked: they are dated inputs, not a
description of the repo.

| Rule | Read in | What fails |
|---|---|---|
| `links` | the docs | A relative Markdown link (or image, or reference definition) whose file or folder does not exist, exists only with another case, is gitignored or lies outside the repo. A `#anchor` that is not a heading of the Markdown file it points into. External links (`https:`, `mailto:`) are not fetched. |
| `paths` | `CLAUDE.md`, `README.md`, `docs/` | A backticked repo path that does not exist. See the rule below. |
| `queue` | `tasks/` | A note without a row in the Queue table of `tasks/README.md`, or with two. A row without a note, without a link to a note, or with a `#` that is not a number or is used twice. A missing or second `queue:end` marker, or one that is not on the line right after the last row. A missing or second `queue:last-number` line, one without a number or not right after the end marker, or a row whose number is above it (the line holds the highest row number ever given, so the number of a finished note is never given to a new row). A note without the header line and the sections of the note format, or with a file name or title that is not dated. |
| `research-index` | `research/` | A report `research/*.md`, or a folder in `research/scans/`, that no table row of `research/README.md` links to. |
| `ids` | the docs | A decision id in `docs/DECISIONS.md` that is defined twice or is lower than one above it. A mention of a decision (`D` and a number) that is not a row there. A mention of an owner call (`OC-` and its code) that is neither in `docs/DECISIONS.md` nor in the owner-calls note. |
| `scripts` | `CLAUDE.md`, `README.md`, `docs/` | A `./dev npm run <script>` whose script is not in the root `package.json`, or not in the workspace the command names with `-w`. |
| `files` | the repo | One of the files the rules read by name is missing. |

Task notes are exempt from `paths` and `scripts`, because they name files and scripts that do
not exist yet.

### The note format has one source

The header labels (GATE, Priority, Size, Depends on) and the required sections are read from the
template under "Note format" in [tasks/README.md](../tasks/README.md#note-format). Changing the
format there changes what the check demands of every note. Required sections must be present
once and in the template's order; a note may have more sections (for example a REMAINING
block). The owner-calls note (file name ending in `-owner-calls.md`) lists calls, not a task: it
needs the header line and the first section only.

### What counts as a backticked repo path

The rule is strict on purpose, so that it never guesses. Inside a code span, each
whitespace-separated word is a repo path when it:

1. contains a `/`, and
2. starts with a top-level folder of the repo (today `docs/`, `research/`, `tasks/`, `tools/`;
   a new top-level folder joins by existing).

Before that test, a leading `./` or `/work/` (the checkout inside the dev container) is dropped,
and so is a trailing `:<line>`, `#anchor` or punctuation; of `--flag=<path>` only the path is
read. The path must then exist with the exact case. A trailing `/` demands a folder. A path with
`*` or `?` must match at least one file or folder.

Never read as repo paths:

- a bare name without a slash (a file name alone says nothing about where it is);
- a word with a placeholder or pattern character (`<`, `>`, `{`, `}`, `$`, `|`, `…`, three dots),
  a URL, or a word that starts with `~`, `/`, `@` or `-`;
- a gitignored path (a build output exists only after a build).

So when a doc must name a path that does not exist (a planned file, a file of another repo),
write it so that it is not mistaken for one of ours: give the other repo's full `~/…` path, use
a placeholder, or say it in prose.

### Ids in code are not ids

The `ids` rule reads prose only. A decision or owner-call id inside a code span or a fenced block
is not checked, and neither is one glued to another word (a hex colour, `3D`).

## Limits of the Markdown reader

The tool has its own small reader ([`markdown.mjs`](../tools/docs-check/lib/markdown.mjs)), not a
full parser:

- Headings are ATX headings (`#` to `######`). A setext heading (underlined with `===` or `---`)
  gets no anchor, so a link to it fails: write it with `#`.
- Anchors follow GitHub: lower case; everything but letters, digits, `_` and `-` removed; each
  space becomes a hyphen; a repeated heading gets `-1`, `-2`. An `id` or `name` attribute of an
  HTML tag is an anchor too.
- Code is a fenced block or a code span. A block made only by indenting four spaces is read as
  prose.
- Reference-style links are checked at their definition (`[label]: target`).

## Changing it

Each rule is one file in `tools/docs-check/lib/checks/`, a function from the shared context to a
list of problems, wired up in [`index.mjs`](../tools/docs-check/lib/index.mjs). The tests in
`tools/docs-check/test/` build a small repo that passes (`fixture.mjs`) and change one thing per
case; a new rule adds its cases there, including one that proves the rule had something to check.

Not covered yet: technique docs with machine-checked frontmatter (files, entry function,
constants). That part comes with the first page under a techniques folder in `docs/`.
