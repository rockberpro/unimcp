import { readFile } from "node:fs/promises";
import { Query } from "web-tree-sitter";
import type { LanguageDef } from "./languages.js";
import { loadLanguage, parserFor } from "./treesitter.js";

export interface Reference {
  file: string;
  line: number;
  text: string;
}

export async function findReferences(
  absFile: string,
  relFile: string,
  def: LanguageDef,
  name: string,
): Promise<Reference[]> {
  const source = await readFile(absFile, "utf8").catch(() => null);
  if (source === null) return [];

  const refQuery = def.queries.refs;
  if (!refQuery) return regexReferences(source, relFile, name);

  const parser = await parserFor(def);
  const lang = await loadLanguage(def);
  const tree = parser.parse(source);
  if (!tree) {
    parser.delete();
    return regexReferences(source, relFile, name);
  }

  const lines = source.split(/\r?\n/);
  const out: Reference[] = [];

  try {
    const query = new Query(lang, refQuery);
    try {
      const seen = new Set<number>();
      for (const match of query.matches(tree.rootNode)) {
        const cap = match.captures.find((c) => c.name === "ref");
        if (!cap || cap.node.text !== name) continue;
        const row = cap.node.startPosition.row;
        if (seen.has(row)) continue;
        seen.add(row);
        out.push({ file: relFile, line: row + 1, text: lines[row].trim() });
      }
    } finally {
      query.delete();
    }
  } finally {
    tree.delete();
    parser.delete();
  }

  return out;
}

function regexReferences(source: string, relFile: string, name: string): Reference[] {
  const regex = new RegExp(`\\b${name}\\b`);
  const lines = source.split(/\r?\n/);
  const out: Reference[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) out.push({ file: relFile, line: i + 1, text: lines[i].trim() });
  }
  return out;
}
