# STUDIO: GAME CONCEPT PAGES (2026-10-02)

**GATE:** none · **Priority:** P2 · **Size:** S · **Depends on:** studio-verdicts, studio-animation-player

## Origin
D5 and D6: the owner works on game concepts in the studio; a concept is just a page there, and
the concept work itself happens in Claude Code. D23 moves concept pages from "later" (D22) into
the queue.

## Read first
- `research/studio-stack.md` §8.4 (routes) and §8.5 (file ownership).
- `research/game-creator.md` §7.1 item 8 (the idea-phase checklist as the page template).

## Scope
1. `concepts/<slug>.md`, written by Claude: front matter (title, status, game id) and Markdown.
   A template `concepts/_template.md` with the checklist: core verbs, session shape, win / lose
   / progression, hook, anti-goals, perspective, art style and palette, audio direction, input,
   scope ceiling, reference games.
2. Routes `/concepts` (list with status) and `/concepts/:slug`: Markdown rendered safely (no
   raw HTML), with `asset:<id>` embeds shown as live preview cards from the player.
3. Live reload on `concepts/**` (topic `concepts`).
4. The owner **comments** on a page or on a heading. Comments go through the review service
   into `concepts/<slug>.review.json` (studio-only writer) and into `reviews/INBOX.md`.
5. CLAUDE.md gains two lines: where concept pages live, and that owner comments on them arrive
   in the INBOX.

## Out of scope
- Editing the concept text in the studio (D6: concept work happens in Claude Code).
- Audio embeds (added by `studio-audio`); a playable embed (added by
  `studio-play-and-builds`).

## Acceptance
- A new `concepts/x.md` appears in the list without a reload; its `asset:` embed animates.
- A comment on a heading writes the review file, shows in the INBOX with the heading text, and
  survives an edit of other parts of the page.
- Raw HTML and script tags in a concept page are not executed (test).
