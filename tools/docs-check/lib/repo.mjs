// A read-only view of a checkout. Paths are repo-relative with forward slashes ("" is the
// root). Lookups are case-sensitive even on a case-insensitive file system (macOS, and the
// Docker bind mount of it), because a link that only works there is broken on GitHub.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, posix } from "node:path";

/**
 * Turns a glob into the source of a regular expression. `*` and `?` stay inside one path
 * segment, a double star followed by a slash matches any number of folders.
 * @param {string} glob
 */
export function globSource(glob) {
  let out = "";
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === "*" && glob[i + 1] === "*") {
      i += 1;
      if (glob[i + 1] === "/") {
        i += 1;
        out += "(?:[^/]+/)*";
      } else out += ".*";
    } else if (char === "*") out += "[^/]*";
    else if (char === "?") out += "[^/]";
    else out += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return out;
}

/**
 * Parses the part of .gitignore this repo uses: plain names, globs and anchored paths.
 * Negated patterns (`!x`) are skipped, so a re-included path still counts as ignored.
 * @param {string} text
 * @returns {{anchored: boolean, regex: RegExp}[]}
 */
function parseIgnore(text) {
  const rules = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#") || line.startsWith("!")) continue;
    const pattern = line.replace(/^\//, "").replace(/\/$/, "");
    if (pattern === "") continue;
    const anchored = line.startsWith("/") || pattern.includes("/");
    rules.push({ anchored, regex: new RegExp(`^${globSource(pattern)}${anchored ? "(?:/|$)" : "$"}`) });
  }
  return rules;
}

/**
 * @param {string} path
 * @returns {string | null} the normalised path, or null when it leaves the repo
 */
export function normalize(path) {
  const clean = posix.normalize(path.replaceAll("\\", "/")).replace(/\/+$/, "");
  if (clean === ".." || clean.startsWith("../") || clean.startsWith("/")) return null;
  return clean === "." ? "" : clean;
}

/** @param {string} root absolute path of the checkout */
export function openRepo(root) {
  /** @type {Map<string, Map<string, "dir" | "file"> | null>} */
  const listings = new Map();
  /** @type {Map<string, string | null>} */
  const texts = new Map();
  /** @type {Map<string, {anchored: boolean, regex: RegExp}[]>} */
  const ignores = new Map();

  /**
   * @param {string} dir
   * @returns {Map<string, "dir" | "file"> | null} the entries of a folder, or null
   */
  function list(dir) {
    if (!listings.has(dir)) {
      let entries = null;
      try {
        entries = new Map();
        for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
          let isDir = entry.isDirectory();
          if (entry.isSymbolicLink()) {
            try {
              isDir = statSync(join(root, dir, entry.name)).isDirectory();
            } catch {
              continue; // a dangling symlink names nothing
            }
          }
          entries.set(entry.name, isDir ? "dir" : "file");
        }
      } catch {
        entries = null;
      }
      listings.set(dir, entries);
    }
    return listings.get(dir) ?? null;
  }

  /**
   * @param {string} path
   * @returns {"dir" | "file" | null} what the path names, with the exact spelling required
   */
  function kind(path) {
    const clean = normalize(path);
    if (clean === null) return null;
    let dir = "";
    /** @type {"dir" | "file" | null} */
    let found = "dir";
    for (const segment of clean === "" ? [] : clean.split("/")) {
      if (found !== "dir") return null;
      found = list(dir)?.get(segment) ?? null;
      if (found === null) return null;
      dir = dir === "" ? segment : `${dir}/${segment}`;
    }
    return found;
  }

  /**
   * @param {string} path a path that does not exist
   * @returns {string | null} the existing path that differs from it only by case
   */
  function differsByCase(path) {
    const clean = normalize(path);
    if (clean === null || clean === "") return null;
    let dir = "";
    for (const segment of clean.split("/")) {
      const names = [...(list(dir)?.keys() ?? [])];
      const match = names.find((name) => name === segment) ?? names.find((name) => name.toLowerCase() === segment.toLowerCase());
      if (match === undefined) return null;
      dir = dir === "" ? match : `${dir}/${match}`;
    }
    return dir === clean ? null : dir;
  }

  /**
   * @param {string} path
   * @returns {string | null} the text of a file, or null when it is not a file
   */
  function read(path) {
    if (!texts.has(path)) {
      texts.set(path, kind(path) === "file" ? readFileSync(join(root, path), "utf8") : null);
    }
    return texts.get(path) ?? null;
  }

  /** @param {string} dir */
  function ignoreRules(dir) {
    if (!ignores.has(dir)) {
      const text = read(dir === "" ? ".gitignore" : `${dir}/.gitignore`);
      ignores.set(dir, text === null ? [] : parseIgnore(text));
    }
    return ignores.get(dir) ?? [];
  }

  /**
   * True for .git and for a path a .gitignore of the repo covers (the root one or one in a
   * folder above the path). Works for paths that do not exist.
   * @param {string} path
   */
  function isIgnored(path) {
    const clean = normalize(path);
    if (clean === null || clean === "") return false;
    const segments = clean.split("/");
    if (segments[0] === ".git") return true;
    for (let depth = 0; depth < segments.length; depth += 1) {
      const rest = segments.slice(depth);
      for (const rule of ignoreRules(segments.slice(0, depth).join("/"))) {
        if (rule.anchored ? rule.regex.test(rest.join("/")) : rest.some((segment) => rule.regex.test(segment))) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * @param {string} dir
   * @returns {string[]} the names in a folder that git would track, sorted
   */
  function tracked(dir) {
    return [...(list(dir)?.keys() ?? [])].filter((name) => !isIgnored(dir === "" ? name : `${dir}/${name}`)).sort();
  }

  /**
   * @param {string} dir
   * @returns {string[]} every Markdown file under a folder, sorted
   */
  function markdownFiles(dir) {
    const found = [];
    for (const name of tracked(dir)) {
      const path = dir === "" ? name : `${dir}/${name}`;
      if (list(dir)?.get(name) === "dir") found.push(...markdownFiles(path));
      else if (name.endsWith(".md")) found.push(path);
    }
    return found;
  }

  /**
   * @param {string} glob a path with `*`, `?` or double-star segments
   * @returns {boolean} whether at least one tracked file or folder matches
   */
  function globMatches(glob) {
    const clean = normalize(glob);
    if (clean === null) return false;
    const segments = clean.split("/");
    /** @type {(dir: string, index: number) => boolean} */
    const match = (dir, index) => {
      if (index === segments.length) return true;
      const segment = segments[index];
      const below = (/** @type {string} */ name) => (dir === "" ? name : `${dir}/${name}`);
      if (segment === "**") {
        if (match(dir, index + 1)) return true;
        return tracked(dir).some((name) => list(dir)?.get(name) === "dir" && match(below(name), index));
      }
      const regex = new RegExp(`^${globSource(segment)}$`);
      return tracked(dir).some((name) => {
        if (!regex.test(name)) return false;
        if (index === segments.length - 1) return true;
        return list(dir)?.get(name) === "dir" && match(below(name), index + 1);
      });
    };
    return match("", 0);
  }

  return { root, list, kind, differsByCase, read, isIgnored, tracked, markdownFiles, globMatches };
}

/** @typedef {ReturnType<typeof openRepo>} Repo */
