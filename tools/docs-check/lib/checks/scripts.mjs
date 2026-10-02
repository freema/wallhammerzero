// Every `./dev npm run <script>` named in CLAUDE.md, README.md and docs/** is a real npm
// script: of the root package.json, or of the workspace the command names with -w.
// Commands are read everywhere in the file, code blocks included. Task notes are not
// checked, because they name scripts that do not exist yet.

import { expandWorkspaces } from "../../../check/discover.mjs";

const COMMAND = /\.\/dev\s+(?:-p\s+\d+\s+)*npm\s+((?:(?:-w|--workspace)(?:=|\s+)\S+\s+)?)run\s+([^`\n]*)/g;
const WORKSPACE = /(?:^|\s)(?:-w|--workspace)(?:=|\s+)([^\s`]+)/;
const ALL_WORKSPACES = /(?:^|\s)(?:-ws|--workspaces)(?:\s|$)/;

/**
 * @param {import("../index.mjs").Context} ctx
 * @param {string} dir
 * @returns {{name: string, dir: string, scripts: Record<string, string>, workspaces: string[]} | null}
 */
function readPackage(ctx, dir) {
  const text = ctx.repo.read(dir === "" ? "package.json" : `${dir}/package.json`);
  if (text === null) return null;
  try {
    const json = JSON.parse(text);
    return { name: json.name ?? "", dir, scripts: json.scripts ?? {}, workspaces: json.workspaces ?? [] };
  } catch {
    return null;
  }
}

/**
 * @param {import("../index.mjs").Context} ctx
 * @returns {import("../index.mjs").Problem[]}
 */
export function checkScripts(ctx) {
  /** @type {import("../index.mjs").Problem[]} */
  const problems = [];
  const root = readPackage(ctx, "");
  if (root === null) return problems; // reported as a missing file
  let workspaces = [];
  try {
    workspaces = expandWorkspaces(ctx.repo.root, root.workspaces).flatMap((dir) => readPackage(ctx, dir) ?? []);
  } catch {
    workspaces = []; // an unsupported workspaces pattern is the gate's own error (tools/check)
  }

  for (const file of ctx.codeDocs) {
    const doc = ctx.markdown(file);
    if (doc === null) continue;
    doc.lines.forEach((line, index) => {
      for (const match of line.matchAll(COMMAND)) {
        const script = /^[A-Za-z0-9_:.-]+/.exec(match[2])?.[0].replace(/\.+$/, "");
        if (script === undefined || script === "") continue; // a placeholder such as <script>
        ctx.stats.scripts += 1;
        const flags = `${match[1]} ${match[2].slice(script.length).split(/\s--(?:\s|$)|&&|\|\||;|#/)[0]}`;
        const named = WORKSPACE.exec(flags)?.[1].replace(/[.,;:)]+$/, "");
        let where = "the root package.json";
        let found = false;
        if (named !== undefined) {
          const workspace = workspaces.find((entry) => entry.name === named || entry.dir === named.replace(/^\.\//, "").replace(/\/$/, ""));
          if (workspace === undefined) {
            if (/[<>$]/.test(named)) continue; // -w <workspace>: a placeholder
            problems.push({ file, line: index + 1, rule: "scripts", message: `\`./dev npm run ${script}\` names the workspace ${named}, which does not exist` });
            continue;
          }
          where = `${workspace.dir}/package.json`;
          found = Object.hasOwn(workspace.scripts, script);
        } else if (ALL_WORKSPACES.test(flags)) {
          where = "any workspace";
          found = workspaces.some((entry) => Object.hasOwn(entry.scripts, script));
        } else found = Object.hasOwn(root.scripts, script);
        if (!found) {
          problems.push({ file, line: index + 1, rule: "scripts", message: `\`./dev npm run ${script}\`: there is no npm script "${script}" in ${where}` });
        }
      }
    });
  }
  return problems;
}
