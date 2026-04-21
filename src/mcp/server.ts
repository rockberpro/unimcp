import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, type CliFlags } from "./config.js";
import { createJail } from "./jail.js";
import { registerCoreTools } from "../core/tools/index.js";
import { registerCodeTools } from "../core/code/tools.js";
import { detectAndLoadPlugins } from "../adapters/detect.js";
import { SymbolCache } from "../core/code/cache.js";
import type { ServerContext } from "./context.js";

export async function startServer(flags: CliFlags): Promise<void> {
  const config = await loadConfig(flags);
  const jail = createJail(config.root);

  const server = new McpServer(
    { name: "unimcp", version: "0.1.0" },
    {
      capabilities: { tools: {} },
      instructions: [
        "Generic codebase-awareness MCP server.",
        `Jailed to project root: ${jail.root}.`,
        "Use list_directory and search_files to explore.",
        "Use list_symbols / find_definition / find_references for AST-aware code queries.",
        "Use list_docs to enumerate project documentation.",
        config.allowWrites
          ? "Write tools (write_file, delete_file, move_file, create_directory) are enabled and jailed to the project root."
          : "Write tools are disabled — start with --allow-writes to enable them.",
      ].join(" "),
    },
  );

  const ctx: ServerContext = { config, jail, symbolCache: new SymbolCache() };

  registerCoreTools(server, ctx);
  registerCodeTools(server, ctx);
  await detectAndLoadPlugins(server, ctx);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
