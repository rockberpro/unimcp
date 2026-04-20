import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../mcp/context.js";
import { registerReadFile } from "./read_file.js";
import { registerListDirectory } from "./list_directory.js";
import { registerSearchFiles } from "./search_files.js";
import { registerListDocs } from "./list_docs.js";
import { registerWriteTools } from "./write_tools.js";

export function registerCoreTools(server: McpServer, ctx: ServerContext): void {
  registerReadFile(server, ctx);
  registerListDirectory(server, ctx);
  registerSearchFiles(server, ctx);
  registerListDocs(server, ctx);
  registerWriteTools(server, ctx);
}
