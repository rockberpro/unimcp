import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { ServerContext } from "../../mcp/context.js";
import { errorResult, textResult } from "../../mcp/errors.js";
import { DEFAULT_PAGE_SIZE, paginate, formatPageFooter } from "../../mcp/pagination.js";

async function listOnce(absDir: string, ignore: Set<string>, recursive: boolean, prefix: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch (err) {
    throw err;
  }
  const visible = entries.filter((e) => !ignore.has(e.name));
  visible.sort((a, b) => a.name.localeCompare(b.name));
  const out: string[] = [];
  const subPromises: Promise<string[]>[] = [];
  for (const entry of visible) {
    out.push(prefix + (entry.isDirectory() ? `${entry.name}/` : entry.name));
    if (recursive && entry.isDirectory()) {
      subPromises.push(listOnce(join(absDir, entry.name), ignore, true, prefix + "  "));
    }
  }
  const subs = await Promise.all(subPromises);
  for (const s of subs) out.push(...s);
  return out;
}

export function registerListDirectory(server: McpServer, ctx: ServerContext) {
  server.registerTool(
    "list_directory",
    {
      description: "List files and subdirectories. Common build/VCS dirs are excluded. Recursive output is paginated.",
      inputSchema: {
        path: z.string().describe("Directory path inside the jail"),
        recursive: z.boolean().optional().describe("Recurse into subdirectories (default false)"),
        offset: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).optional().describe(`Max entries (default ${DEFAULT_PAGE_SIZE})`),
      },
    },
    async ({ path, recursive = false, offset = 0, limit = DEFAULT_PAGE_SIZE }) => {
      try {
        const safe = ctx.jail.assertInside(path);
        const ignore = new Set(ctx.config.ignoreDirs);
        const entries = await listOnce(safe, ignore, recursive, "");
        const page = paginate(entries, offset, limit);
        return textResult(page.items.join("\n") + formatPageFooter(page));
      } catch (err) {
        return errorResult("Error listing directory", err);
      }
    },
  );
}
