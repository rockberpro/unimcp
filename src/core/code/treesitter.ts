import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Parser, Language } from "web-tree-sitter";
import type { LanguageDef } from "./languages.js";

let initPromise: Promise<void> | null = null;
const cache = new Map<string, Language>();

const require = createRequire(import.meta.url);

function findWasmDir(): string {
  try {
    const pkgJson = require.resolve("tree-sitter-wasms/package.json");
    return join(dirname(pkgJson), "out");
  } catch {
    throw new Error(
      "Could not locate tree-sitter-wasms. Install with: npm i tree-sitter-wasms web-tree-sitter",
    );
  }
}

function findRuntimeWasm(): string {
  try {
    const pkgJson = require.resolve("web-tree-sitter/package.json");
    const pkgDir = dirname(pkgJson);
    for (const name of ["tree-sitter.wasm", "web-tree-sitter.wasm"]) {
      const p = join(pkgDir, name);
      if (existsSync(p)) return p;
    }
  } catch {}
  throw new Error("Could not locate web-tree-sitter runtime wasm");
}

export async function initParser(): Promise<void> {
  if (!initPromise) {
    const runtimeWasm = findRuntimeWasm();
    initPromise = Parser.init({
      locateFile: () => runtimeWasm,
    });
  }
  await initPromise;
}

export async function loadLanguage(def: LanguageDef): Promise<Language> {
  const cached = cache.get(def.id);
  if (cached) return cached;
  await initParser();
  const wasmPath = join(findWasmDir(), def.wasm);
  const bytes = await readFile(wasmPath);
  const lang = await Language.load(bytes);
  cache.set(def.id, lang);
  return lang;
}

export async function parserFor(def: LanguageDef): Promise<Parser> {
  const lang = await loadLanguage(def);
  const parser = new Parser();
  parser.setLanguage(lang);
  return parser;
}
