import { readFile } from "node:fs/promises";
import { Query } from "web-tree-sitter";
import type { LanguageDef } from "./languages.js";
import { loadLanguage, parserFor } from "./treesitter.js";

export interface Import {
  name: string;
  from: string;
  file: string;
  line: number;
}

export async function listImports(
  absFile: string,
  relFile: string,
  def: LanguageDef,
): Promise<Import[]> {
  const queryStr = def.queries.imports;
  if (!queryStr) return [];

  const source = await readFile(absFile, "utf8").catch(() => null);
  if (source === null) return [];

  const parser = await parserFor(def);
  const lang = await loadLanguage(def);
  const tree = parser.parse(source);
  if (!tree) {
    parser.delete();
    return [];
  }

  const out: Import[] = [];

  try {
    const query = new Query(lang, queryStr);
    try {
      for (const match of query.matches(tree.rootNode)) {
        const nameCap = match.captures.find((c) => c.name === "name");
        const sourceCap = match.captures.find((c) => c.name === "source");
        if (!nameCap && !sourceCap) continue;

        const rawFrom = sourceCap?.node.text ?? nameCap!.node.text;
        const from = rawFrom.replace(/^['"`]|['"`]$/g, "");
        const name = nameCap?.node.text ?? deriveNameFromSource(from, def.id);
        const line = (nameCap ?? sourceCap)!.node.startPosition.row + 1;

        out.push({ name, from, file: relFile, line });
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

function deriveNameFromSource(source: string, langId: string): string {
  if (langId === "php") return source.split("\\").at(-1) ?? source;
  return source.split(/[/:]/).at(-1) ?? source;
}
