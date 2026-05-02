import { resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../mcp/context.js";
import type { Plugin } from "./plugin.js";
import { phpComposerPlugin } from "./php-composer/index.js";
import { nodePackagePlugin } from "./node-package/index.js";

const BUILTIN_PLUGINS: Plugin[] = [phpComposerPlugin, nodePackagePlugin];

export async function detectAndLoadPlugins(server: McpServer, ctx: ServerContext): Promise<string[]> {
  const loaded: string[] = [];

  const allPlugins: Plugin[] = [...BUILTIN_PLUGINS];

  for (const pluginPath of ctx.config.plugins) {
    try {
      const abs = resolve(ctx.jail.root, pluginPath);
      const mod = await import(abs);
      const plugin: Plugin = mod.default;
      if (!plugin?.id || typeof plugin.detect !== "function" || typeof plugin.register !== "function") {
        process.stderr.write(`unimcp: plugin at "${pluginPath}" missing required fields (id, detect, register)\n`);
        continue;
      }
      allPlugins.push(plugin);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`unimcp: failed to load plugin "${pluginPath}": ${msg}\n`);
    }
  }

  for (const plugin of allPlugins) {
    if (ctx.config.pluginsDisabled.includes(plugin.id)) continue;
    const match = await plugin.detect(ctx);
    if (!match) continue;
    await plugin.register(server, ctx);
    loaded.push(plugin.id);
  }

  return loaded;
}
