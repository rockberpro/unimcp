import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../mcp/context.js";
import type { Plugin } from "./plugin.js";
import { phpComposerPlugin } from "./php-composer/index.js";
import { nodePackagePlugin } from "./node-package/index.js";

const ALL_PLUGINS: Plugin[] = [phpComposerPlugin, nodePackagePlugin];

export async function detectAndLoadPlugins(server: McpServer, ctx: ServerContext): Promise<string[]> {
  const loaded: string[] = [];
  for (const plugin of ALL_PLUGINS) {
    if (ctx.config.pluginsDisabled.includes(plugin.id)) continue;
    const match = await plugin.detect(ctx);
    if (!match) continue;
    await plugin.register(server, ctx);
    loaded.push(plugin.id);
  }
  return loaded;
}
