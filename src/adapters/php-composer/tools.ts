import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { ServerContext } from "../../mcp/context.js";
import { errorResult, textResult } from "../../mcp/errors.js";
import { DEFAULT_PAGE_SIZE, paginate, formatPageFooter } from "../../mcp/pagination.js";
import { walkFiles } from "../../core/tools/walk.js";
import {
  readComposerJson,
  readComposerLock,
  flattenPsr4,
  fileToFqcn,
  fqcnToRelativeFile,
  type Psr4Root,
} from "./composer.js";

interface IndexedClass {
  fqcn: string;
  file: string;
}

async function buildPsr4Index(ctx: ServerContext): Promise<{ roots: Psr4Root[]; classes: IndexedClass[] }> {
  const composer = await readComposerJson(ctx.jail.root);
  if (!composer) return { roots: [], classes: [] };
  const roots = [...flattenPsr4(composer.autoload), ...flattenPsr4(composer["autoload-dev"])];
  const classes: IndexedClass[] = [];
  for (const root of roots) {
    const absDir = join(ctx.jail.root, root.dir);
    if (!existsSync(absDir)) continue;
    const files = await walkFiles(absDir, {
      ignoreDirs: new Set(ctx.config.ignoreDirs),
      match: (rel) => rel.endsWith(".php"),
    });
    for (const abs of files) {
      const rel = ctx.jail.relative(abs);
      const fqcn = fileToFqcn(rel, root);
      if (fqcn) classes.push({ fqcn, file: rel });
    }
  }
  classes.sort((a, b) => a.fqcn.localeCompare(b.fqcn));
  return { roots, classes };
}

export function registerPhpComposerTools(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "list_php_classes",
    {
      description:
        "List PHP classes discoverable via Composer's PSR-4 autoload. Each row is 'FQCN  file'. Optionally filter by namespace prefix.",
      inputSchema: {
        namespace: z.string().optional().describe("Restrict to classes whose FQCN starts with this prefix (e.g. 'App\\\\Models')"),
        offset: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).optional().describe(`Max classes (default ${DEFAULT_PAGE_SIZE})`),
      },
    },
    async ({ namespace, offset = 0, limit = DEFAULT_PAGE_SIZE }) => {
      try {
        const { classes } = await buildPsr4Index(ctx);
        const filtered = namespace
          ? classes.filter((c) => c.fqcn === namespace || c.fqcn.startsWith(namespace + "\\"))
          : classes;
        if (filtered.length === 0) return textResult("No PHP classes found.");
        const lines = filtered.map((c) => `${c.fqcn.padEnd(60)} ${c.file}`);
        const page = paginate(lines, offset, limit);
        return textResult(page.items.join("\n") + formatPageFooter(page));
      } catch (err) {
        return errorResult("Error listing PHP classes", err);
      }
    },
  );

  server.registerTool(
    "find_php_class",
    {
      description: "Resolve a fully-qualified class name to its source file via Composer PSR-4 autoload.",
      inputSchema: {
        fqcn: z.string().describe("Fully-qualified class name, e.g. 'App\\\\Models\\\\User'"),
      },
    },
    async ({ fqcn }) => {
      try {
        const composer = await readComposerJson(ctx.jail.root);
        if (!composer) throw new Error("composer.json not found");
        const roots = [...flattenPsr4(composer.autoload), ...flattenPsr4(composer["autoload-dev"])];
        for (const root of roots) {
          const rel = fqcnToRelativeFile(fqcn, root);
          if (!rel) continue;
          const abs = join(ctx.jail.root, rel);
          if (existsSync(abs)) return textResult(`${fqcn} -> ${rel}`);
        }
        return textResult(`No file found for '${fqcn}'.`);
      } catch (err) {
        return errorResult("Error resolving PHP class", err);
      }
    },
  );

  server.registerTool(
    "list_composer_packages",
    {
      description: "List installed Composer packages (name + version) from composer.lock.",
      inputSchema: {
        includeDev: z.boolean().optional().describe("Include packages-dev (default true)"),
      },
    },
    async ({ includeDev = true }) => {
      try {
        const lock = await readComposerLock(ctx.jail.root);
        if (!lock) throw new Error("composer.lock not found");
        const all = [
          ...(lock.packages ?? []),
          ...(includeDev ? lock["packages-dev"] ?? [] : []),
        ];
        if (all.length === 0) return textResult("No packages installed.");
        all.sort((a, b) => a.name.localeCompare(b.name));
        return textResult(all.map((p) => `${p.name.padEnd(50)} ${p.version}`).join("\n"));
      } catch (err) {
        return errorResult("Error listing composer packages", err);
      }
    },
  );
}
