import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { ServerContext } from "../../mcp/context.js";
import { errorResult, textResult } from "../../mcp/errors.js";
import { DEFAULT_PAGE_SIZE } from "../../mcp/pagination.js";

export function registerReadFile(server: McpServer, ctx: ServerContext) {
  server.registerTool(
    "read_file",
    {
      description: "Read a text file. Returns lines [offset, offset+limit). Use next_offset to paginate large files.",
      inputSchema: {
        path: z.string().describe("File path relative to project root, or absolute (must stay inside the jail)"),
        offset: z.number().int().min(0).optional().describe("Zero-based line offset (default 0)"),
        limit: z.number().int().min(1).optional().describe(`Max lines to return (default ${DEFAULT_PAGE_SIZE})`),
      },
    },
    async ({ path, offset = 0, limit = DEFAULT_PAGE_SIZE }) => {
      try {
        const safe = ctx.jail.assertInside(path);
        const text = await readFile(safe, "utf8");
        const lines = text.split(/\r?\n/);
        const slice = lines.slice(offset, offset + limit);
        const next = offset + slice.length;
        const more = next < lines.length;
        const header = `# ${ctx.jail.relative(safe)} — lines ${offset + 1}-${offset + slice.length} of ${lines.length}\n`;
        const footer = more ? `\n[truncated — call again with offset=${next}]` : "";
        return textResult(header + slice.join("\n") + footer);
      } catch (err) {
        return errorResult("Error reading file", err);
      }
    },
  );
}
