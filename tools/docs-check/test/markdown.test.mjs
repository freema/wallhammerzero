import assert from "node:assert/strict";
import { test } from "node:test";
import { headingText, parseMarkdown, slugify, tableCells } from "../lib/markdown.mjs";

const parse = (/** @type {string[]} */ ...lines) => parseMarkdown(lines.join("\n"));

test("slugs follow GitHub's anchors", () => {
  const cases = [
    ["Licence flags", "licence-flags"],
    ["7.5 Headless render endpoint shared by the studio and Claude Code", "75-headless-render-endpoint-shared-by-the-studio-and-claude-code"],
    ["Not in the queue (and why)", "not-in-the-queue-and-why"],
    ["A. Art and the first game", "a-art-and-the-first-game"],
    ["Several checkouts at once (git worktrees)", "several-checkouts-at-once-git-worktrees"],
    // Removed characters leave their spaces behind: "+" and "★★" become double and trailing hyphens.
    ["5.3 (iii) Generator workflow: the AGENTS.md + docs/techniques pattern ★★", "53-iii-generator-workflow-the-agentsmd--docstechniques-pattern-"],
    ["snake_case and kebab-case stay", "snake_case-and-kebab-case-stay"],
    ["Příliš žluťoučký kůň", "příliš-žluťoučký-kůň"],
  ];
  for (const [heading, slug] of cases) assert.equal(slugify(heading), slug);
});

test("a heading's anchor comes from the text a reader sees", () => {
  assert.equal(headingText("The `ctx` contract"), "The ctx contract");
  assert.equal(headingText("**Bold** and [a link](x.md) and _emphasis_ but snake_case"), "Bold and a link and emphasis but snake_case");
  const doc = parse("# Title", "## The `ctx` contract", "### Closed ###", "#not a heading", "    ");
  assert.deepEqual(
    doc.headings.map((heading) => [heading.line, heading.level, heading.slug]),
    [
      [1, 1, "title"],
      [2, 2, "the-ctx-contract"],
      [3, 3, "closed"],
    ],
  );
});

test("repeated headings get -1, -2, and HTML ids count as anchors", () => {
  const doc = parse("## Scope", "text", "## Scope", "## Scope", '<a id="custom"></a>', "<span name='named'>x</span>");
  assert.deepEqual([...doc.anchors], ["scope", "scope-1", "scope-2", "custom", "named"]);
});

test("finds inline links, images and reference definitions with their lines", () => {
  const doc = parse(
    "See [one](a.md) and ![img](b.png \"title\") here,",
    "then [a link whose text",
    "wraps](c.md#part) and [`code`](<d e.md>).",
    "",
    "[ref]: f.md",
    "[^note]: not a link",
    "A [nested [bracket] text](g.md) and [parens](h_(1).md).",
  );
  assert.deepEqual(
    doc.links.map((link) => [link.line, link.target]),
    [
      [1, "a.md"],
      [1, "b.png"],
      [3, "c.md#part"],
      [3, "d e.md"],
      [5, "f.md"],
      [7, "g.md"],
      [7, "h_(1).md"],
    ],
  );
});

test("links inside code and comments are not links", () => {
  const doc = parse(
    "Text `[in a span](nope1.md)` and ``[double `tick` span](nope2.md)``.",
    "```markdown",
    "[in a fence](nope3.md)",
    "## Not a heading",
    "```",
    "~~~",
    "``` still inside the tilde fence",
    "[in a tilde fence](nope4.md)",
    "~~~",
    "<!-- [in a comment](nope5.md)",
    "[still in it](nope6.md) --> [real](yes.md)",
  );
  assert.deepEqual(
    doc.links.map((link) => [link.line, link.target]),
    [[11, "yes.md"]],
  );
  assert.deepEqual(doc.headings, []);
});

test("code spans keep their line, may wrap in a paragraph, and never leave a table row", () => {
  const doc = parse(
    "Run `./dev npm install <pkg> -w",
    "@whz/<workspace>` and then `tools/x.mjs`.",
    "",
    "| a stray ` tick | `first` |",
    "| another ` one | `second` |",
    "",
    "An unmatched ` tick is text.",
  );
  assert.deepEqual(
    doc.spans.map((span) => [span.line, span.text]),
    [
      [1, "./dev npm install <pkg> -w @whz/<workspace>"],
      [2, "tools/x.mjs"],
      [4, "tick |"],
      [5, "one |"],
    ],
  );
  assert.equal(doc.prose[1].includes("tools/x.mjs"), false, "prose has code spans blanked out");
  assert.equal(doc.prose[1].length, doc.lines[1].length, "blanking keeps the columns");
});

test("splits table rows into cells", () => {
  assert.deepEqual(tableCells("| 1 | [Note](a.md) | none |"), ["1", "[Note](a.md)", "none"]);
  assert.deepEqual(tableCells("  |---|:--|"), ["---", ":--"]);
  assert.equal(tableCells("not a row | at all"), null);
});
