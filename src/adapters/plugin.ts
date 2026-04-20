import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../mcp/context.js";

export interface Plugin {
  id: string;
  detect(ctx: ServerContext): boolean | Promise<boolean>;
  register(server: McpServer, ctx: ServerContext): void | Promise<void>;
}
