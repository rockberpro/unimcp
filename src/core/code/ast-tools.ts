import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { ServerContext } from "../../mcp/context.js";
import { errorResult, textResult } from "../../mcp/errors.js";
import { walkFiles } from "../tools/walk.js";
import { languageForFile } from "./languages.js";

// Classify a source line containing the symbol by usage kind.
function classifyUsage(line: string, symbol: string): string {
  const t = line.trim();
  const esc = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  if (/^import\b/.test(t) || /}\s*from\s+['"`]/.test(t)) return "import";
  if (new RegExp(`\\b(?:export\\s+)?(?:abstract\\s+)?(?:async\\s+)?(?:declare\\s+)?(?:function\\*?\\s+|class\\s+|interface\\s+|type\\s+|enum\\s+|const\\s+|let\\s+|var\\s+)${esc}\\b`).test(t))
    return "declaration";
  if (new RegExp(`\\b${esc}\\s*[(<]`).test(t)) return "call";
  if (new RegExp(`[:<,\\s]${esc}(?:[\\s>,;\\[\\])]|$)`).test(t)) return "type";
  return "reference";
}

export function registerAstTools(server: McpServer, ctx: ServerContext): void {
  // ── find_symbol_usages ──────────────────────────────────────────────────────
  server.registerTool(
    "find_symbol_usages",
    {
      description:
        "Find all usages of a symbol (type, interface, function, class, variable, enum) across source files. " +
        "Classifies each hit as: import | declaration | call | type | reference. " +
        "Use scope to narrow the search to a subdirectory.",
      inputSchema: {
        symbol: z.string().describe("Symbol name to search (e.g. 'SafeUser', 'AuthService', 'login')"),
        kind: z
          .enum(["all", "import", "type", "call", "declaration", "reference"])
          .optional()
          .default("all")
          .describe("Filter by usage kind (default: all)"),
        scope: z
          .string()
          .optional()
          .describe("Restrict search to this path (relative to jail root, e.g. 'apps/api', 'libs')"),
      },
    },
    async ({ symbol, kind = "all", scope }) => {
      try {
        const searchRoot = scope ? ctx.jail.assertInside(scope) : ctx.jail.root;
        const esc = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const wordRe = new RegExp(`\\b${esc}\\b`);

        const files = await walkFiles(searchRoot, {
          ignoreDirs: new Set(ctx.config.ignoreDirs),
          honorGitignore: ctx.config.honorGitignore,
          match: (rel) => languageForFile(rel) !== null,
        });

        const fileBlocks: string[] = [];
        let totalUsages = 0;

        await Promise.all(
          files.map(async (abs) => {
            const source = await readFile(abs, "utf8").catch(() => null);
            if (!source) return;

            const lines = source.split(/\r?\n/);
            const hits: string[] = [];

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              if (!wordRe.test(line)) continue;
              const usageKind = classifyUsage(line, symbol);
              if (kind !== "all" && usageKind !== kind) continue;
              hits.push(`  L${i + 1} [${usageKind}]: ${line.trim()}`);
            }

            if (hits.length > 0) {
              totalUsages += hits.length;
              fileBlocks.push(`${ctx.jail.relative(abs)}:\n${hits.join("\n")}`);
            }
          }),
        );

        fileBlocks.sort();
        if (fileBlocks.length === 0) return textResult(`No usages found for symbol: "${symbol}"`);

        return textResult(
          `Found ${totalUsages} usage(s) of "${symbol}" across ${fileBlocks.length} file(s):\n\n${fileBlocks.join("\n\n")}`,
        );
      } catch (err) {
        return errorResult("find_symbol_usages", err);
      }
    },
  );

  // ── find_unused_exports ─────────────────────────────────────────────────────
  server.registerTool(
    "find_unused_exports",
    {
      description:
        "Detect TypeScript exports in a directory that are never imported anywhere else in the project. " +
        "Useful for finding dead code in shared libraries.",
      inputSchema: {
        path: z
          .string()
          .optional()
          .default("libs")
          .describe("Directory to audit for unused exports (relative to jail root, default: 'libs')"),
      },
    },
    async ({ path = "libs" }) => {
      try {
        const searchRoot = ctx.jail.assertInside(path);

        const libFiles = await walkFiles(searchRoot, {
          ignoreDirs: new Set(ctx.config.ignoreDirs),
          honorGitignore: ctx.config.honorGitignore,
          match: (rel) => rel.endsWith(".ts") && !rel.endsWith(".d.ts") && !rel.endsWith(".spec.ts"),
        });

        type ExportEntry = { file: string; kind: string };
        const exportMap = new Map<string, ExportEntry[]>();

        for (const abs of libFiles) {
          const source = await readFile(abs, "utf8").catch(() => null);
          if (!source) continue;
          const relFile = ctx.jail.relative(abs);

          // export function|class|interface|type|enum|const|let NAME
          for (const m of source.matchAll(
            /^\s*export\s+(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:declare\s+)?(?:function\*?\s+|class\s+|interface\s+|type\s+|enum\s+|const\s+|let\s+|var\s+)([A-Za-z_$][\w$]*)/gm,
          )) {
            const name = m[1];
            if (!exportMap.has(name)) exportMap.set(name, []);
            exportMap.get(name)!.push({ file: relFile, kind: "export" });
          }

          // export { name, name as alias }
          for (const m of source.matchAll(/^\s*export\s*\{([^}]+)\}/gm)) {
            for (const part of m[1].split(",")) {
              const name = part.trim().split(/\s+as\s+/)[0].trim();
              if (name && /^[A-Za-z_$][\w$]*$/.test(name)) {
                if (!exportMap.has(name)) exportMap.set(name, []);
                exportMap.get(name)!.push({ file: relFile, kind: "re-export" });
              }
            }
          }
        }

        if (exportMap.size === 0) return textResult(`No exports found in "${path}".`);

        // Collect imported names from files outside the target directory
        const allFiles = await walkFiles(ctx.jail.root, {
          ignoreDirs: new Set(ctx.config.ignoreDirs),
          honorGitignore: ctx.config.honorGitignore,
          match: (rel) =>
            (rel.endsWith(".ts") || rel.endsWith(".tsx") || rel.endsWith(".js") || rel.endsWith(".jsx")) &&
            !rel.endsWith(".d.ts"),
        });

        const importedNames = new Set<string>();

        for (const abs of allFiles) {
          if (abs.startsWith(searchRoot + "/") || abs === searchRoot) continue;
          const source = await readFile(abs, "utf8").catch(() => null);
          if (!source) continue;

          // import { A, B as C } from ...
          for (const m of source.matchAll(/import\s*\{([^}]+)\}\s*from/gm)) {
            for (const part of m[1].split(",")) {
              const trimmed = part.trim();
              const [original, alias] = trimmed.split(/\s+as\s+/);
              if (original?.trim()) importedNames.add(original.trim());
              if (alias?.trim()) importedNames.add(alias.trim());
            }
          }

          // import Default from ...
          for (const m of source.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from/gm)) {
            importedNames.add(m[1]);
          }

          // import * as NS from ...
          for (const m of source.matchAll(/import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s+from/gm)) {
            importedNames.add(m[1]);
          }
        }

        const unused: string[] = [];
        for (const [name, entries] of exportMap) {
          if (!importedNames.has(name)) {
            for (const e of entries) {
              unused.push(`  ${e.file}: ${e.kind} "${name}"`);
            }
          }
        }

        if (unused.length === 0) return textResult(`All exports in "${path}" are imported. No dead code found.`);

        return textResult(
          `Found ${unused.length} potentially unused export(s) in "${path}":\n\n${unused.join("\n")}`,
        );
      } catch (err) {
        return errorResult("find_unused_exports", err);
      }
    },
  );

  // ── get_file_dependencies ───────────────────────────────────────────────────
  server.registerTool(
    "get_file_dependencies",
    {
      description:
        "Show the import/export dependency graph for a file: what modules it imports and which other files import it. " +
        "Uses import specifier suffix matching for 'imported_by' — path aliases (e.g. @scope/pkg) are matched by package name.",
      inputSchema: {
        path: z.string().describe("File path (relative to jail root or absolute)"),
        direction: z
          .enum(["imports", "imported_by", "both"])
          .optional()
          .default("both")
          .describe("Which direction to trace (default: both)"),
      },
    },
    async ({ path, direction = "both" }) => {
      try {
        const abs = ctx.jail.assertInside(path);
        const relFile = ctx.jail.relative(abs);
        const source = await readFile(abs, "utf8").catch(() => null);
        if (!source) return errorResult("get_file_dependencies", new Error(`Cannot read: ${path}`));

        const lines: string[] = [`Dependency graph for: ${relFile}\n`];

        if (direction === "imports" || direction === "both") {
          lines.push("## Imports (what this file depends on):");
          const importLines: string[] = [];

          for (const m of source.matchAll(/^\s*import\s+(.+?)\s+from\s+['"`]([^'"`]+)['"`]/gm)) {
            importLines.push(`  import ${m[1].trim()} from "${m[2]}"`);
          }
          for (const m of source.matchAll(/^\s*import\s+['"`]([^'"`]+)['"`]/gm)) {
            importLines.push(`  import "${m[1]}" (side-effect)`);
          }

          lines.push(importLines.length > 0 ? importLines.join("\n") : "  (none)");
          lines.push("");
        }

        if (direction === "imported_by" || direction === "both") {
          lines.push("## Imported by (what depends on this file):");

          // Last path segment without extension — used to match import specifiers
          const baseTail = relFile.split("/").pop()!.replace(/\.[^.]*$/, "");

          const allFiles = await walkFiles(ctx.jail.root, {
            ignoreDirs: new Set(ctx.config.ignoreDirs),
            honorGitignore: ctx.config.honorGitignore,
            match: (rel) =>
              (rel.endsWith(".ts") || rel.endsWith(".tsx") || rel.endsWith(".js") || rel.endsWith(".jsx")) &&
              rel !== relFile,
          });

          const importers: string[] = [];

          await Promise.all(
            allFiles.map(async (otherAbs) => {
              const otherSrc = await readFile(otherAbs, "utf8").catch(() => null);
              if (!otherSrc) return;

              for (const m of otherSrc.matchAll(/from\s+['"`]([^'"`]+)['"`]/gm)) {
                const spec = m[1];
                const specTail = spec.split("/").pop()!.replace(/\.[^.]*$/, "");
                // Match by last path segment — handles relative and alias specifiers
                if (specTail === baseTail) {
                  importers.push(`  ${ctx.jail.relative(otherAbs)}`);
                  return;
                }
              }
            }),
          );

          importers.sort();
          lines.push(importers.length > 0 ? importers.join("\n") : "  (not imported by any file in scope)");
        }

        return textResult(lines.join("\n"));
      } catch (err) {
        return errorResult("get_file_dependencies", err);
      }
    },
  );
}
