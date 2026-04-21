import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../../mcp/context.js";
import { errorResult, textResult } from "../../mcp/errors.js";
import { DEFAULT_PAGE_SIZE, paginate, formatPageFooter } from "../../mcp/pagination.js";
import {
  listPackages,
  readPackageJson,
  readTsConfig,
  resolveImport,
  workspaceGlobs,
  expandWorkspaceGlob,
} from "./package.js";

export function registerNodePackageTools(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "list_node_packages",
    {
      description:
        "List npm/node packages declared in package.json. Versions are resolved from package-lock.json when present. Each row: name  version  [dev].",
      inputSchema: {
        includeDev: z.boolean().optional().describe("Include devDependencies (default true)"),
        offset: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).optional().describe(`Max packages (default ${DEFAULT_PAGE_SIZE})`),
      },
    },
    async ({ includeDev = true, offset = 0, limit = DEFAULT_PAGE_SIZE }) => {
      try {
        const pkgs = await listPackages(ctx.jail.root);
        const filtered = includeDev ? pkgs : pkgs.filter((p) => !p.dev);
        if (filtered.length === 0) return textResult("No packages found.");
        const lines = filtered.map(
          (p) => `${p.name.padEnd(50)} ${p.version.padEnd(20)}${p.dev ? " [dev]" : ""}`,
        );
        const page = paginate(lines, offset, limit);
        return textResult(page.items.join("\n") + formatPageFooter(page));
      } catch (err) {
        return errorResult("Error listing node packages", err);
      }
    },
  );

  server.registerTool(
    "resolve_import",
    {
      description:
        "Resolve an import specifier to a project file using tsconfig.json paths/baseUrl. Returns the file path or reports the import as external. Supports @-aliases, baseUrl-relative specifiers, and relative imports.",
      inputSchema: {
        specifier: z.string().describe("Import specifier, e.g. '@/utils/foo', 'lodash', './helpers'"),
        from: z.string().optional().describe("Relative path of the file doing the import (required for relative specifiers like './foo')"),
      },
    },
    async ({ specifier, from }) => {
      try {
        const tsconfig = await readTsConfig(ctx.jail.root);
        const result = resolveImport(specifier, ctx.jail.root, tsconfig, from);
        if ("external" in result) return textResult(`${specifier} → external`);
        ctx.jail.assertInside(result.file);
        return textResult(`${specifier} → ${result.relative}`);
      } catch (err) {
        return errorResult("Error resolving import", err);
      }
    },
  );

  server.registerTool(
    "list_workspace_packages",
    {
      description:
        "List packages in a monorepo workspace. Reads the workspaces field from package.json (npm/yarn/bun) or pnpm-workspace.yaml. Each row: name  version  path.",
      inputSchema: {},
    },
    async () => {
      try {
        const root = await readPackageJson(ctx.jail.root);
        const globs = root ? workspaceGlobs(root) : [];

        // pnpm-workspace.yaml fallback
        const pnpmGlobs = globs.length === 0 ? await readPnpmWorkspaceGlobs(ctx.jail.root) : [];
        const allGlobs = [...globs, ...pnpmGlobs];

        if (allGlobs.length === 0) return textResult("No workspace configuration found.");

        const dirs: string[] = [];
        for (const glob of allGlobs) {
          const expanded = await expandWorkspaceGlob(ctx.jail.root, glob);
          dirs.push(...expanded);
        }

        const packages = await Promise.all(
          dirs.map(async (abs) => {
            const pkg = await readPackageJson(abs);
            if (!pkg?.name) return null;
            const rel = ctx.jail.relative(abs);
            return { name: pkg.name, version: pkg.version ?? "unknown", path: rel };
          }),
        );

        const found = packages.filter((p): p is NonNullable<typeof p> => p !== null);
        if (found.length === 0) return textResult("No workspace packages found.");
        found.sort((a, b) => a.name.localeCompare(b.name));
        const lines = found.map((p) => `${p.name.padEnd(50)} ${p.version.padEnd(20)} ${p.path}`);
        return textResult(lines.join("\n"));
      } catch (err) {
        return errorResult("Error listing workspace packages", err);
      }
    },
  );
}

async function readPnpmWorkspaceGlobs(root: string): Promise<string[]> {
  const { existsSync } = await import("node:fs");
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const file = join(root, "pnpm-workspace.yaml");
  if (!existsSync(file)) return [];
  try {
    const text = await readFile(file, "utf8");
    const globs: string[] = [];
    let inPackages = false;
    for (const line of text.split("\n")) {
      if (/^packages\s*:/.test(line)) { inPackages = true; continue; }
      if (inPackages) {
        if (/^\s+-/.test(line)) {
          const m = line.match(/^\s+-\s+['"]?(.+?)['"]?\s*$/);
          if (m) globs.push(m[1]);
        } else if (/^\S/.test(line)) {
          break;
        }
      }
    }
    return globs;
  } catch {
    return [];
  }
}
