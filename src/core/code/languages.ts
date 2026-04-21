export interface LanguageDef {
  id: string;
  wasm: string;
  exts: string[];
  queries: {
    classes?: string;
    functions?: string;
    methods?: string;
    interfaces?: string;
    enums?: string;
    types?: string;
    structs?: string;
    traits?: string;
    modules?: string;
    constants?: string;
    imports?: string;
    refs?: string;
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
      enums: "(enum_declaration name: (name) @name) @def",
      traits: "(trait_declaration name: (name) @name) @def",
      constants: "(const_element (name) @name @def)",
      imports: [
        "(namespace_use_clause (qualified_name) @source (namespace_aliasing_clause (name) @name))",
        "(namespace_use_clause (qualified_name) @source)",
      ].join("\n"),
      refs: "(name) @ref",
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
      enums: "(enum_declaration name: (identifier) @name) @def",
      types: "(type_alias_declaration name: (type_identifier) @name) @def",
      constants: [
        "(program (lexical_declaration \"const\" (variable_declarator name: (identifier) @name) @def))",
        "(program (export_statement (lexical_declaration \"const\" (variable_declarator name: (identifier) @name) @def)))",
      ].join("\n"),
      imports: [
        "(import_statement (import_clause (named_imports (import_specifier name: (identifier) @name))) source: (string (string_fragment) @source))",
        "(import_statement (import_clause (named_imports (import_specifier alias: (identifier) @name))) source: (string (string_fragment) @source))",
        "(import_statement (import_clause (identifier) @name) source: (string (string_fragment) @source))",
        "(import_statement (import_clause (namespace_import (identifier) @name)) source: (string (string_fragment) @source))",
      ].join("\n"),
      refs: "[(identifier) (type_identifier) (property_identifier)] @ref",
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
      enums: "(enum_declaration name: (identifier) @name) @def",
      types: "(type_alias_declaration name: (type_identifier) @name) @def",
      constants: [
        "(program (lexical_declaration \"const\" (variable_declarator name: (identifier) @name) @def))",
        "(program (export_statement (lexical_declaration \"const\" (variable_declarator name: (identifier) @name) @def)))",
      ].join("\n"),
      imports: [
        "(import_statement (import_clause (named_imports (import_specifier name: (identifier) @name))) source: (string (string_fragment) @source))",
        "(import_statement (import_clause (named_imports (import_specifier alias: (identifier) @name))) source: (string (string_fragment) @source))",
        "(import_statement (import_clause (identifier) @name) source: (string (string_fragment) @source))",
        "(import_statement (import_clause (namespace_import (identifier) @name)) source: (string (string_fragment) @source))",
      ].join("\n"),
      refs: "[(identifier) (type_identifier) (property_identifier)] @ref",
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
      constants: [
        "(program (lexical_declaration \"const\" (variable_declarator name: (identifier) @name) @def))",
        "(program (export_statement (lexical_declaration \"const\" (variable_declarator name: (identifier) @name) @def)))",
      ].join("\n"),
      imports: [
        "(import_statement (import_clause (named_imports (import_specifier name: (identifier) @name))) source: (string (string_fragment) @source))",
        "(import_statement (import_clause (named_imports (import_specifier alias: (identifier) @name))) source: (string (string_fragment) @source))",
        "(import_statement (import_clause (identifier) @name) source: (string (string_fragment) @source))",
        "(import_statement (import_clause (namespace_import (identifier) @name)) source: (string (string_fragment) @source))",
      ].join("\n"),
      refs: "[(identifier) (property_identifier)] @ref",
    },
  },
  {
    id: "python",
    wasm: "tree-sitter-python.wasm",
    exts: [".py"],
    queries: {
      classes: "(class_definition name: (identifier) @name) @def",
      functions: "(function_definition name: (identifier) @name) @def",
      imports: [
        "(import_from_statement module_name: (dotted_name) @source name: (dotted_name) @name)",
        "(import_from_statement module_name: (dotted_name) @source (aliased_import alias: (identifier) @name))",
        "(import_statement name: (dotted_name) @name)",
      ].join("\n"),
      refs: "(identifier) @ref",
    },
  },
  {
    id: "go",
    wasm: "tree-sitter-go.wasm",
    exts: [".go"],
    queries: {
      functions: "(function_declaration name: (identifier) @name) @def",
      methods: "(method_declaration name: (field_identifier) @name) @def",
      structs: "(type_spec name: (type_identifier) @name type: (struct_type)) @def",
      constants: "(const_declaration (const_spec name: (identifier) @name) @def)",
      imports: [
        "(import_spec name: (package_identifier) @name path: (interpreted_string_literal) @source)",
        "(import_spec path: (interpreted_string_literal) @source)",
      ].join("\n"),
      refs: "[(identifier) (field_identifier) (type_identifier)] @ref",
    },
  },
  {
    id: "ruby",
    wasm: "tree-sitter-ruby.wasm",
    exts: [".rb"],
    queries: {
      classes: "(class name: (constant) @name) @def",
      methods: "(method name: (identifier) @name) @def",
      modules: "(module name: (constant) @name) @def",
      refs: "[(identifier) (constant)] @ref",
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
      enums: "(enum_declaration name: (identifier) @name) @def",
      refs: "(identifier) @ref",
    },
  },
  {
    id: "rust",
    wasm: "tree-sitter-rust.wasm",
    exts: [".rs"],
    queries: {
      functions: "(function_item name: (identifier) @name) @def",
      enums: "(enum_item name: (type_identifier) @name) @def",
      types: "(type_item name: (type_identifier) @name) @def",
      structs: "(struct_item name: (type_identifier) @name) @def",
      traits: "(trait_item name: (type_identifier) @name) @def",
      modules: "(mod_item name: (identifier) @name) @def",
      constants: "(const_item name: (identifier) @name) @def",
      imports: "(use_declaration argument: (_) @source)",
      refs: "[(identifier) (type_identifier)] @ref",
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
