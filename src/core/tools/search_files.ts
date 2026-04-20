import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { ServerContext } from "../../mcp/context.js";
import { errorResult, textResult } from "../../mcp/errors.js";
import { DEFAULT_PAGE_SIZE, paginate, formatPageFooter } from "../../mcp/pagination.js";
import { walkFiles, globToRegex } from "./walk.js";

export function registerSearchFiles(server: McpServer, ctx: ServerContext) {
  server.registerTool(
    "search_files",
    {
      description: "Regex search across files. Returns 'path:line: text' rows. Restrict scope with `glob` (e.g. '**/*.php').",
      inputSchema: {
        path: z.string().describe("Directory inside the jail to search under"),
        pattern: z.string().describe("Regular expression (JS syntax)"),
        glob: z.string().optional().describe("Optional glob filter, e.g. '**/*.ts'"),
        offset: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).optional().describe(`Max matches (default ${DEFAULT_PAGE_SIZE})`),
      },
    },
    async ({ path, pattern, glob, offset = 0, limit = DEFAULT_PAGE_SIZE }) => {
      try {
        const safe = ctx.jail.assertInside(path);
        const regex = new RegExp(pattern);
        const matcher = glob ? globToRegex(glob) : null;
        const files = await walkFiles(safe, {
          ignoreDirs: new Set(ctx.config.ignoreDirs),
          match: matcher ? (rel) => matcher.test(rel) : undefined,
        });
        const all: string[] = [];
        await Promise.all(files.map(async (file) => {
          const text = await readFile(file, "utf8").catch(() => null);
          if (text === null) return;
          const lines = text.split(/\r?\n/);
          const rel = ctx.jail.relative(file);
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) all.push(`${rel}:${i + 1}: ${lines[i]}`);
          }
        }));
        if (all.length === 0) return textResult("No matches found.");
        const page = paginate(all, offset, limit);
        return textResult(page.items.join("\n") + formatPageFooter(page));
      } catch (err) {
        return errorResult("Error searching files", err);
      }
    },
  );
}
