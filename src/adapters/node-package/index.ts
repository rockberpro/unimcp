import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "../plugin.js";
import { registerNodePackageTools } from "./tools.js";

export const nodePackagePlugin: Plugin = {
  id: "node-package",
  detect(ctx) {
    return existsSync(join(ctx.jail.root, "package.json"));
  },
  register(server, ctx) {
    registerNodePackageTools(server, ctx);
  },
};
