import { readFile } from "node:fs/promises";
import { Query } from "web-tree-sitter";
import type { LanguageDef } from "./languages.js";
import { loadLanguage, parserFor } from "./treesitter.js";

export type SymbolKind = "class" | "interface" | "method" | "function" | "enum" | "type" | "struct" | "trait" | "module" | "constant";

export interface Symbol {
  name: string;
  kind: SymbolKind;
  file: string;
  line: number;
  column: number;
  endLine: number;
}

const KIND_QUERIES: Array<[SymbolKind, keyof LanguageDef["queries"]]> = [
  ["class", "classes"],
  ["interface", "interfaces"],
  ["method", "methods"],
  ["function", "functions"],
  ["enum", "enums"],
  ["type", "types"],
  ["struct", "structs"],
  ["trait", "traits"],
  ["module", "modules"],
  ["constant", "constants"],
];

export async function extractSymbols(
  absFile: string,
  relFile: string,
  def: LanguageDef,
  filterKind?: SymbolKind,
): Promise<Symbol[]> {
  const source = await readFile(absFile, "utf8").catch(() => null);
  if (source === null) return [];

  const parser = await parserFor(def);
  const lang = await loadLanguage(def);
  const tree = parser.parse(source);
  if (!tree) {
    parser.delete();
    return [];
  }

  const out: Symbol[] = [];
  try {
    for (const [kind, queryKey] of KIND_QUERIES) {
      if (filterKind && filterKind !== kind) continue;
      const queryString = def.queries[queryKey];
      if (!queryString) continue;
      const query = new Query(lang, queryString);
      try {
        for (const match of query.matches(tree.rootNode)) {
          const nameCap = match.captures.find((c) => c.name === "name");
          const defCap = match.captures.find((c) => c.name === "def") ?? nameCap;
          if (!nameCap || !defCap) continue;
          out.push({
            name: nameCap.node.text,
            kind,
            file: relFile,
            line: defCap.node.startPosition.row + 1,
            column: defCap.node.startPosition.column + 1,
            endLine: defCap.node.endPosition.row + 1,
          });
        }
      } finally {
        query.delete();
      }
    }
  } finally {
    tree.delete();
    parser.delete();
  }

  return out;
}
