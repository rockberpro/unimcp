import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { ServerContext } from "../../mcp/context.js";
import { errorResult, textResult } from "../../mcp/errors.js";
import { DEFAULT_PAGE_SIZE, paginate, formatPageFooter } from "../../mcp/pagination.js";
import { walkFiles, globToRegex } from "../tools/walk.js";
import { LANGUAGES, languageForFile, languageById, type LanguageDef } from "./languages.js";
import type { Symbol, SymbolKind } from "./symbols.js";

const KIND_VALUES = ["class", "interface", "method", "function"] as const;

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
        kind: z.enum(KIND_VALUES).optional(),
        lang: z.string().optional().describe("Restrict to one language id (e.g. 'php', 'typescript')"),
        glob: z.string().optional().describe("Optional glob filter"),
      },
    },
    async ({ name, kind, lang, glob }) => {
      try {
        const langDef = lang ? languageById(lang) : null;
        if (lang && !langDef) {
          return errorResult("Unknown language", new Error(`'${lang}' — known: ${LANGUAGES.map((l) => l.id).join(", ")}`));
        }
        const matcher = glob ? globToRegex(glob) : null;
        const files = await walkFiles(ctx.jail.root, {
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
        const regex = new RegExp(`\\b${name}\\b`);
        const all: string[] = [];
        await Promise.all(files.map(async (file) => {
          const text = await readFile(file, "utf8").catch(() => null);
          if (text === null) return;
          const lines = text.split(/\r?\n/);
          const rel = ctx.jail.relative(file);
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) all.push(`${rel}:${i + 1}: ${lines[i].trim()}`);
          }
        }));
        if (all.length === 0) return textResult(`No references found for '${name}'.`);
        const page = paginate(all, offset, limit);
        return textResult(page.items.join("\n") + formatPageFooter(page));
      } catch (err) {
        return errorResult("Error finding references", err);
      }
    },
  );
}
