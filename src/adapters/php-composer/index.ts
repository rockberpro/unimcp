import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "../plugin.js";
import { registerPhpComposerTools } from "./tools.js";

export const phpComposerPlugin: Plugin = {
  id: "php-composer",
  detect(ctx) {
    return existsSync(join(ctx.jail.root, "composer.json"));
  },
  register(server, ctx) {
    registerPhpComposerTools(server, ctx);
  },
};
