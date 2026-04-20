import { readdir } from "node:fs/promises";
import { join, sep } from "node:path";

export interface WalkOptions {
  ignoreDirs: Set<string>;
  match?: (relPath: string) => boolean;
}

export async function walkFiles(root: string, opts: WalkOptions): Promise<string[]> {
  const out: string[] = [];
  await walk(root, "", opts, out);
  return out;
}

async function walk(absDir: string, relDir: string, opts: WalkOptions, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  await Promise.all(entries.map(async (entry) => {
    if (entry.isDirectory()) {
      if (opts.ignoreDirs.has(entry.name)) return;
      await walk(join(absDir, entry.name), join(relDir, entry.name), opts, out);
    } else if (entry.isFile()) {
      const rel = relDir === "" ? entry.name : `${relDir}${sep}${entry.name}`;
      const normalized = rel.split(sep).join("/");
      if (!opts.match || opts.match(normalized)) {
        out.push(join(absDir, entry.name));
      }
    }
  }));
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
