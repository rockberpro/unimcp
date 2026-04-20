import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Parser, Language } from "web-tree-sitter";
import type { LanguageDef } from "./languages.js";

let initPromise: Promise<void> | null = null;
const cache = new Map<string, Language>();

const HERE = dirname(fileURLToPath(import.meta.url));

function findWasmDir(): string {
  const candidates = [
    resolve(HERE, "../../../node_modules/tree-sitter-wasms/out"),
    resolve(HERE, "../../../../node_modules/tree-sitter-wasms/out"),
    resolve(process.cwd(), "node_modules/tree-sitter-wasms/out"),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error(
    "Could not locate tree-sitter-wasms. Install with: npm i tree-sitter-wasms web-tree-sitter",
  );
}

function findRuntimeWasm(): string {
  const dirs = [
    resolve(HERE, "../../../node_modules/web-tree-sitter"),
    resolve(HERE, "../../../../node_modules/web-tree-sitter"),
    resolve(process.cwd(), "node_modules/web-tree-sitter"),
  ];
  const names = ["tree-sitter.wasm", "web-tree-sitter.wasm"];
  for (const dir of dirs) {
    for (const name of names) {
      const p = join(dir, name);
      if (existsSync(p)) return p;
    }
  }
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
