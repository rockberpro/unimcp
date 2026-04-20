import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { writeFile, unlink, mkdir, rename } from "node:fs/promises";
import { z } from "zod";
import type { ServerContext } from "../../mcp/context.js";
import { errorResult, textResult } from "../../mcp/errors.js";

export function registerWriteTools(server: McpServer, ctx: ServerContext) {
  if (!ctx.config.allowWrites) return;

  server.registerTool(
    "write_file",
    {
      description: "Write (create or overwrite) a file. Jailed to project root.",
      inputSchema: {
        path: z.string(),
        content: z.string(),
      },
    },
    async ({ path, content }) => {
      try {
        const safe = ctx.jail.assertInside(path);
        await writeFile(safe, content, "utf8");
        return textResult(`Written: ${ctx.jail.relative(safe)}`);
      } catch (err) {
        return errorResult("Error writing file", err);
      }
    },
  );

  server.registerTool(
    "delete_file",
    {
      description: "Delete a file. Jailed to project root.",
      inputSchema: { path: z.string() },
    },
    async ({ path }) => {
      try {
        const safe = ctx.jail.assertInside(path);
        await unlink(safe);
        return textResult(`Deleted: ${ctx.jail.relative(safe)}`);
      } catch (err) {
        return errorResult("Error deleting file", err);
      }
    },
  );

  server.registerTool(
    "create_directory",
    {
      description: "Create a directory (with parents). Jailed to project root.",
      inputSchema: { path: z.string() },
    },
    async ({ path }) => {
      try {
        const safe = ctx.jail.assertInside(path);
        await mkdir(safe, { recursive: true });
        return textResult(`Created: ${ctx.jail.relative(safe)}`);
      } catch (err) {
        return errorResult("Error creating directory", err);
      }
    },
  );

  server.registerTool(
    "move_file",
    {
      description: "Move or rename a file/directory. Both source and destination must stay inside the jail.",
      inputSchema: { from: z.string(), to: z.string() },
    },
    async ({ from, to }) => {
      try {
        const safeFrom = ctx.jail.assertInside(from);
        const safeTo = ctx.jail.assertInside(to);
        await rename(safeFrom, safeTo);
        return textResult(`Moved: ${ctx.jail.relative(safeFrom)} → ${ctx.jail.relative(safeTo)}`);
      } catch (err) {
        return errorResult("Error moving file", err);
      }
    },
  );
}
