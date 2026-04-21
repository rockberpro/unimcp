import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { ServerContext } from "../../mcp/context.js";
import { errorResult, textResult } from "../../mcp/errors.js";
import { DEFAULT_PAGE_SIZE, paginate, formatPageFooter } from "../../mcp/pagination.js";
import { walkFiles, globToRegex } from "../tools/walk.js";
import { LANGUAGES, languageForFile, languageById, type LanguageDef } from "./languages.js";
import type { Symbol, SymbolKind } from "./symbols.js";
import { findReferences } from "./references.js";
import { listImports } from "./imports.js";

const KIND_VALUES = ["class", "interface", "method", "function", "enum", "type", "struct", "trait", "module", "constant"] as const;

async function symbolsForPath(
  ctx: ServerContext,
  inputPath: string,
  kind: SymbolKind | undefined,
  glob: string | undefined,
): Promise<Symbol[]> {
  const safe = ctx.jail.assertInside(inputPath);
  const stat = await import("node:fs/promises").then((m) => m.stat(safe));
  const matcher = glob ? globToRegex(glob) : null;
  const files: { abs: string; rel: string; lang: LanguageDef }[] = [];

  if (stat.isFile()) {
    const lang = languageForFile(safe);
    if (lang) files.push({ abs: safe, rel: ctx.jail.relative(safe), lang });
  } else {
    const all = await walkFiles(safe, {
      ignoreDirs: new Set(ctx.config.ignoreDirs),
      match: (rel) => (matcher ? matcher.test(rel) : true),
    });
    for (const abs of all) {
      const lang = languageForFile(abs);
      if (lang) files.push({ abs, rel: ctx.jail.relative(abs), lang });
    }
  }

  const perFile = await Promise.all(
    files.map(({ abs, rel, lang }) => ctx.symbolCache.get(abs, rel, lang, kind)),
  );
  return perFile.flat();
}

function formatSymbol(s: Symbol): string {
  return `${s.kind.padEnd(9)} ${s.name.padEnd(40)} ${s.file}:${s.line}`;
}

export function registerCodeTools(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "list_symbols",
    {
      description:
        "List code symbols (classes, interfaces, methods, functions) for a file or directory. Uses tree-sitter parsing — supports " +
        LANGUAGES.map((l) => l.id).join(", ") + ".",
      inputSchema: {
        path: z.string().describe("File or directory inside the jail"),
        kind: z.enum(KIND_VALUES).optional().describe("Optional filter: class | interface | method | function"),
        glob: z.string().optional().describe("Glob filter when path is a directory, e.g. '**/*.php'"),
        offset: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).optional().describe(`Max symbols (default ${DEFAULT_PAGE_SIZE})`),
      },
    },
    async ({ path, kind, glob, offset = 0, limit = DEFAULT_PAGE_SIZE }) => {
      try {
        const symbols = await symbolsForPath(ctx, path, kind, glob);
        if (symbols.length === 0) return textResult("No symbols found.");
        symbols.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
        const lines = symbols.map(formatSymbol);
        const page = paginate(lines, offset, limit);
        return textResult(page.items.join("\n") + formatPageFooter(page));
      } catch (err) {
        return errorResult("Error listing symbols", err);
      }
    },
  );

  server.registerTool(
    "find_definition",
    {
      description:
        "Find where a symbol (class/interface/method/function) is defined. Walks the project, parses with tree-sitter, returns matching definitions.",
      inputSchema: {
        name: z.string().describe("Symbol name to find (exact match)"),
        path: z.string().optional().describe("Restrict search to this file or directory subtree (defaults to jail root)"),
        kind: z.enum(KIND_VALUES).optional(),
        lang: z.string().optional().describe("Restrict to one language id (e.g. 'php', 'typescript')"),
        glob: z.string().optional().describe("Optional glob filter"),
      },
    },
    async ({ name, path: inputPath, kind, lang, glob }) => {
      try {
        const langDef = lang ? languageById(lang) : null;
        if (lang && !langDef) {
          return errorResult("Unknown language", new Error(`'${lang}' — known: ${LANGUAGES.map((l) => l.id).join(", ")}`));
        }
        const searchRoot = inputPath ? ctx.jail.assertInside(inputPath) : ctx.jail.root;
        const matcher = glob ? globToRegex(glob) : null;
        const rootStat = await import("node:fs/promises").then((m) => m.stat(searchRoot));
        const files = rootStat.isFile()
          ? [searchRoot]
          : await walkFiles(searchRoot, {
              ignoreDirs: new Set(ctx.config.ignoreDirs),
              match: (rel) => (matcher ? matcher.test(rel) : true),
            });
        const targets = files
          .map((abs) => {
            const detected = languageForFile(abs);
            if (!detected) return null;
            if (langDef && detected.id !== langDef.id) return null;
            return { abs, lang: detected };
          })
          .filter((x): x is { abs: string; lang: LanguageDef } => x !== null);

        const perFile = await Promise.all(
          targets.map(({ abs, lang }) => ctx.symbolCache.get(abs, ctx.jail.relative(abs), lang, kind)),
        );
        const matches = perFile.flat().filter((s) => s.name === name);
        if (matches.length === 0) return textResult(`No definition found for '${name}'.`);
        return textResult(matches.map(formatSymbol).join("\n"));
      } catch (err) {
        return errorResult("Error finding definition", err);
      }
    },
  );

  server.registerTool(
    "find_references",
    {
      description:
        "Find references to a symbol by identifier text. Word-boundary regex search across source files of supported languages. Use find_definition for the canonical site.",
      inputSchema: {
        name: z.string().describe("Identifier to search for (exact word)"),
        glob: z.string().optional().describe("Optional glob filter"),
        offset: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).optional().describe(`Max hits (default ${DEFAULT_PAGE_SIZE})`),
      },
    },
    async ({ name, glob, offset = 0, limit = DEFAULT_PAGE_SIZE }) => {
      try {
        if (!/^[A-Za-z_][\w]*$/.test(name)) {
          throw new Error("`name` must be a valid identifier (letters, digits, underscore)");
        }
        const matcher = glob ? globToRegex(glob) : null;
        const files = await walkFiles(ctx.jail.root, {
          ignoreDirs: new Set(ctx.config.ignoreDirs),
          match: (rel) => {
            if (matcher && !matcher.test(rel)) return false;
            return languageForFile(rel) !== null;
          },
        });
        const all: string[] = [];
        await Promise.all(files.map(async (abs) => {
          const lang = languageForFile(abs);
          if (!lang) return;
          const refs = await findReferences(abs, ctx.jail.relative(abs), lang, name);
          for (const r of refs) all.push(`${r.file}:${r.line}: ${r.text}`);
        }));
        if (all.length === 0) return textResult(`No references found for '${name}'.`);
        const page = paginate(all, offset, limit);
        return textResult(page.items.join("\n") + formatPageFooter(page));
      } catch (err) {
        return errorResult("Error finding references", err);
      }
    },
  );

  server.registerTool(
    "get_symbol_body",
    {
      description:
        "Return the full source body of a named symbol. Uses the symbol index to locate the definition, then returns its source slice with a file:startLine-endLine header. If multiple symbols match, all are returned.",
      inputSchema: {
        name: z.string().describe("Symbol name (exact match)"),
        path: z.string().optional().describe("File or directory to search (defaults to jail root)"),
        kind: z.enum(KIND_VALUES).optional(),
        lang: z.string().optional().describe("Restrict to one language id (e.g. 'typescript')"),
      },
    },
    async ({ name, path: inputPath, kind, lang }) => {
      try {
        const langDef = lang ? languageById(lang) : null;
        if (lang && !langDef) {
          return errorResult("Unknown language", new Error(`'${lang}' — known: ${LANGUAGES.map((l) => l.id).join(", ")}`));
        }
        const searchRoot = inputPath ?? ctx.jail.root;
        const symbols = await symbolsForPath(ctx, searchRoot, kind, undefined);
        const matches = symbols.filter(
          (s) => s.name === name && (!langDef || languageForFile(s.file)?.id === langDef.id),
        );
        if (matches.length === 0) return textResult(`No symbol '${name}' found.`);

        const parts = await Promise.all(
          matches.map(async (s) => {
            const abs = ctx.jail.assertInside(s.file);
            const source = await readFile(abs, "utf8").catch(() => null);
            if (!source) return null;
            const lines = source.split(/\r?\n/);
            const body = lines.slice(s.line - 1, s.endLine).join("\n");
            return `${s.file}:${s.line}-${s.endLine}\n${body}`;
          }),
        );

        return textResult(parts.filter((p): p is string => p !== null).join("\n\n"));
      } catch (err) {
        return errorResult("Error getting symbol body", err);
      }
    },
  );

  server.registerTool(
    "list_imports",
    {
      description:
        "List imports/dependencies for a file or all files in a directory. Uses tree-sitter to parse import/use statements — supports " +
        LANGUAGES.filter((l) => l.queries.imports).map((l) => l.id).join(", ") + ".",
      inputSchema: {
        path: z.string().describe("File or directory inside the jail"),
        glob: z.string().optional().describe("Glob filter when path is a directory, e.g. '**/*.ts'"),
        offset: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).optional().describe(`Max rows (default ${DEFAULT_PAGE_SIZE})`),
      },
    },
    async ({ path, glob, offset = 0, limit = DEFAULT_PAGE_SIZE }) => {
      try {
        const safe = ctx.jail.assertInside(path);
        const stat = await import("node:fs/promises").then((m) => m.stat(safe));
        const matcher = glob ? globToRegex(glob) : null;
        const files: { abs: string; rel: string; lang: ReturnType<typeof languageForFile> }[] = [];

        if (stat.isFile()) {
          const lang = languageForFile(safe);
          if (lang?.queries.imports) files.push({ abs: safe, rel: ctx.jail.relative(safe), lang });
        } else {
          const all = await walkFiles(safe, {
            ignoreDirs: new Set(ctx.config.ignoreDirs),
            match: (rel) => (matcher ? matcher.test(rel) : true),
          });
          for (const abs of all) {
            const lang = languageForFile(abs);
            if (lang?.queries.imports) files.push({ abs, rel: ctx.jail.relative(abs), lang });
          }
        }

        const perFile = await Promise.all(
          files.map(({ abs, rel, lang }) => listImports(abs, rel, lang!)),
        );
        const rows = perFile.flat().map((i) => `${i.file}: ${i.name}  from ${i.from}`);

        if (rows.length === 0) return textResult("No imports found.");
        const page = paginate(rows, offset, limit);
        return textResult(page.items.join("\n") + formatPageFooter(page));
      } catch (err) {
        return errorResult("Error listing imports", err);
      }
    },
  );
}
