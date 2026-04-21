import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface WalkOptions {
  ignoreDirs: Set<string>;
  match?: (relPath: string) => boolean;
  honorGitignore?: boolean; // default true
}

export async function walkFiles(root: string, opts: WalkOptions): Promise<string[]> {
  const out: string[] = [];
  await walk(root, "", opts, out, []);
  return out;
}

// ── gitignore support ────────────────────────────────────────────────────────

interface GitignoreRule {
  pattern: RegExp;
  negated: boolean;
  dirOnly: boolean;
}

interface GitignoreRuleSet {
  baseRelDir: string; // relative to the walk root, "" for root
  rules: GitignoreRule[];
}

function buildPatternRegex(pattern: string, anchored: boolean): RegExp {
  let re = "";
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === "*" && pattern[i + 1] === "*") {
      re += ".*";
      i += 2;
      if (pattern[i] === "/") i++;
    } else if (c === "*") {
      re += "[^/]*";
      i++;
    } else if (c === "?") {
      re += "[^/]";
      i++;
    } else if (".+^${}()|[]\\".includes(c)) {
      re += "\\" + c;
      i++;
    } else {
      re += c;
      i++;
    }
  }
  const body = anchored ? "^" + re : "(^|.*/)" + re;
  return new RegExp(body + "(/.*)?$");
}

export function parseGitignore(text: string): GitignoreRule[] {
  const rules: GitignoreRule[] = [];
  for (let rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trimEnd();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("\\#")) line = line.slice(1);

    const negated = line.startsWith("!");
    if (negated) line = line.slice(1);

    const dirOnly = line.endsWith("/");
    if (dirOnly) line = line.slice(0, -1);
    if (!line) continue;

    let anchored = false;
    if (line.startsWith("/")) {
      anchored = true;
      line = line.slice(1);
    } else if (line.startsWith("**/")) {
      line = line.slice(3); // **/ prefix = match at any depth
    } else if (line.includes("/")) {
      anchored = true;
    }
    if (!line) continue;

    try {
      rules.push({ pattern: buildPatternRegex(line, anchored), negated, dirOnly });
    } catch {
      // skip unparseable patterns
    }
  }
  return rules;
}

function isIgnoredByGitignore(sets: GitignoreRuleSet[], relPath: string, isDir: boolean): boolean {
  let ignored = false;
  for (const { baseRelDir, rules } of sets) {
    const relToBase =
      baseRelDir === ""
        ? relPath
        : relPath.startsWith(baseRelDir + "/")
          ? relPath.slice(baseRelDir.length + 1)
          : null;
    if (relToBase === null) continue;
    for (const rule of rules) {
      if (rule.dirOnly && !isDir) continue;
      if (rule.pattern.test(relToBase)) ignored = !rule.negated;
    }
  }
  return ignored;
}

async function loadGitignoreRules(absDir: string, relDir: string): Promise<GitignoreRuleSet | null> {
  const file = join(absDir, ".gitignore");
  if (!existsSync(file)) return null;
  try {
    const rules = parseGitignore(await readFile(file, "utf8"));
    return rules.length > 0 ? { baseRelDir: relDir, rules } : null;
  } catch {
    return null;
  }
}

// ── recursive walk ───────────────────────────────────────────────────────────

async function walk(
  absDir: string,
  relDir: string,
  opts: WalkOptions,
  out: string[],
  gitignoreSets: GitignoreRuleSet[],
): Promise<void> {
  const sets = [...gitignoreSets];
  if (opts.honorGitignore !== false) {
    const ruleSet = await loadGitignoreRules(absDir, relDir);
    if (ruleSet) sets.push(ruleSet);
  }

  let entries;
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch {
    return;
  }

  await Promise.all(
    entries.map(async (entry) => {
      const rel = relDir === "" ? entry.name : `${relDir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (opts.ignoreDirs.has(entry.name)) return;
        if (isIgnoredByGitignore(sets, rel, true)) return;
        await walk(join(absDir, entry.name), rel, opts, out, sets);
      } else if (entry.isFile()) {
        if (isIgnoredByGitignore(sets, rel, false)) return;
        if (!opts.match || opts.match(rel)) out.push(join(absDir, entry.name));
      }
    }),
  );
}

export function globToRegex(pattern: string): RegExp {
  let re = "";
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        re += ".*";
        i += 2;
        if (pattern[i] === "/") i++;
      } else {
        re += "[^/]*";
        i++;
      }
    } else if (c === "?") {
      re += "[^/]";
      i++;
    } else if (c === ".") {
      re += "\\.";
      i++;
    } else if ("+^$()|{}[]\\".includes(c)) {
      re += "\\" + c;
      i++;
    } else {
      re += c;
      i++;
    }
  }
  return new RegExp("^" + re + "$");
}
