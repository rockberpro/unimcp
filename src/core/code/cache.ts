import { stat } from "node:fs/promises";
import type { LanguageDef } from "./languages.js";
import { extractSymbols, type Symbol, type SymbolKind } from "./symbols.js";

interface CacheEntry {
  mtimeMs: number;
  size: number;
  symbols: Symbol[];
}

export class SymbolCache {
  private readonly entries = new Map<string, CacheEntry>();

  async get(
    absFile: string,
    relFile: string,
    def: LanguageDef,
    filterKind?: SymbolKind,
  ): Promise<Symbol[]> {
    const { mtimeMs, size } = await stat(absFile);
    const entry = this.entries.get(absFile);
    let symbols: Symbol[];

    if (entry && entry.mtimeMs === mtimeMs && entry.size === size) {
      symbols = entry.symbols;
    } else {
      symbols = await extractSymbols(absFile, relFile, def);
      this.entries.set(absFile, { mtimeMs, size, symbols });
    }

    return filterKind ? symbols.filter((s) => s.kind === filterKind) : symbols;
  }
}
