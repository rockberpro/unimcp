export interface LanguageDef {
  id: string;
  wasm: string;
  exts: string[];
  queries: {
    classes?: string;
    functions?: string;
    methods?: string;
    interfaces?: string;
  };
}

export const LANGUAGES: LanguageDef[] = [
  {
    id: "php",
    wasm: "tree-sitter-php.wasm",
    exts: [".php"],
    queries: {
      classes: "(class_declaration name: (name) @name) @def",
      interfaces: "(interface_declaration name: (name) @name) @def",
      methods: "(method_declaration name: (name) @name) @def",
      functions: "(function_definition name: (name) @name) @def",
    },
  },
  {
    id: "typescript",
    wasm: "tree-sitter-typescript.wasm",
    exts: [".ts", ".mts", ".cts"],
    queries: {
      classes: "(class_declaration name: (type_identifier) @name) @def",
      interfaces: "(interface_declaration name: (type_identifier) @name) @def",
      methods: "(method_definition name: (property_identifier) @name) @def",
      functions: "(function_declaration name: (identifier) @name) @def",
    },
  },
  {
    id: "tsx",
    wasm: "tree-sitter-tsx.wasm",
    exts: [".tsx"],
    queries: {
      classes: "(class_declaration name: (type_identifier) @name) @def",
      interfaces: "(interface_declaration name: (type_identifier) @name) @def",
      methods: "(method_definition name: (property_identifier) @name) @def",
      functions: "(function_declaration name: (identifier) @name) @def",
    },
  },
  {
    id: "javascript",
    wasm: "tree-sitter-javascript.wasm",
    exts: [".js", ".jsx", ".mjs", ".cjs"],
    queries: {
      classes: "(class_declaration name: (identifier) @name) @def",
      methods: "(method_definition name: (property_identifier) @name) @def",
      functions: "(function_declaration name: (identifier) @name) @def",
    },
  },
  {
    id: "python",
    wasm: "tree-sitter-python.wasm",
    exts: [".py"],
    queries: {
      classes: "(class_definition name: (identifier) @name) @def",
      functions: "(function_definition name: (identifier) @name) @def",
    },
  },
  {
    id: "go",
    wasm: "tree-sitter-go.wasm",
    exts: [".go"],
    queries: {
      functions: "(function_declaration name: (identifier) @name) @def",
      methods: "(method_declaration name: (field_identifier) @name) @def",
    },
  },
  {
    id: "ruby",
    wasm: "tree-sitter-ruby.wasm",
    exts: [".rb"],
    queries: {
      classes: "(class name: (constant) @name) @def",
      methods: "(method name: (identifier) @name) @def",
    },
  },
  {
    id: "java",
    wasm: "tree-sitter-java.wasm",
    exts: [".java"],
    queries: {
      classes: "(class_declaration name: (identifier) @name) @def",
      interfaces: "(interface_declaration name: (identifier) @name) @def",
      methods: "(method_declaration name: (identifier) @name) @def",
    },
  },
  {
    id: "rust",
    wasm: "tree-sitter-rust.wasm",
    exts: [".rs"],
    queries: {
      functions: "(function_item name: (identifier) @name) @def",
    },
  },
];

const EXT_MAP = new Map<string, LanguageDef>();
for (const lang of LANGUAGES) {
  for (const ext of lang.exts) EXT_MAP.set(ext, lang);
}

export function languageForFile(path: string): LanguageDef | null {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return null;
  return EXT_MAP.get(path.slice(dot).toLowerCase()) ?? null;
}

export function languageById(id: string): LanguageDef | null {
  return LANGUAGES.find((l) => l.id === id) ?? null;
}
