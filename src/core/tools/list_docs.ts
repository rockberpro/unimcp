import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { join } from "node:path";
import { existsSync, statSync } from "node:fs";
import type { ServerContext } from "../../mcp/context.js";
import { errorResult, textResult } from "../../mcp/errors.js";
import { walkFiles, globToRegex } from "./walk.js";

const README_GLOB = globToRegex("README*");
const MD_EXT = /\.(md|mdx|markdown|txt|rst)$/i;

export function registerListDocs(server: McpServer, ctx: ServerContext) {
  server.registerTool(
    "list_docs",
    {
      description: "List project documentation files (markdown/text) under configured docDirs plus root-level README files.",
      inputSchema: {},
    },
    async () => {
      try {
        const ignore = new Set(ctx.config.ignoreDirs);
        const found: string[] = [];

        for (const dir of ctx.config.docDirs) {
          const abs = join(ctx.jail.root, dir);
          if (!existsSync(abs)) continue;
          if (!statSync(abs).isDirectory()) continue;
          const files = await walkFiles(abs, {
            ignoreDirs: ignore,
            match: (rel) => MD_EXT.test(rel),
          });
          for (const f of files) found.push(ctx.jail.relative(f));
        }

        const rootFiles = await walkFiles(ctx.jail.root, {
          ignoreDirs: new Set([...ignore, ...ctx.config.docDirs]),
          match: (rel) => !rel.includes("/") && README_GLOB.test(rel.split(".")[0] ?? rel),
        });
        for (const f of rootFiles) found.push(ctx.jail.relative(f));

        if (found.length === 0) return textResult("No documentation files found.");
        return textResult(Array.from(new Set(found)).sort().join("\n"));
      } catch (err) {
        return errorResult("Error listing docs", err);
      }
    },
  );
}
