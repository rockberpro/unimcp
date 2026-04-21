import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SymbolCache } from "../src/core/code/cache";
import { createJail } from "../src/mcp/jail";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerNodePackageTools } from "../src/adapters/node-package/tools";
import { listPackages, resolveImport, workspaceGlobs, expandWorkspaceGlob } from "../src/adapters/node-package/package";
import type { ServerContext } from "../src/mcp/context";

function makeCtx(root: string): ServerContext {
  return {
    config: { root, ignoreDirs: [], allowWrites: false, honorGitignore: true },
    jail: createJail(root),
    symbolCache: new SymbolCache(),
  };
}

async function callTool(ctx: ServerContext, toolName: string, args: Record<string, unknown>) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerNodePackageTools(server, ctx);
  // @ts-ignore
  const handler = server._registeredTools[toolName]?.handler;
  if (!handler) throw new Error(`tool ${toolName} not registered`);
  return handler(args);
}

// ── listPackages ────────────────────────────────────────────────────────────

describe("listPackages", () => {
  test("returns deps and devDeps from package.json", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-npm-"));
    await writeFile(join(root, "package.json"), JSON.stringify({
      dependencies: { "zod": "^3.0.0" },
      devDependencies: { "typescript": "^5.0.0" },
    }));
    const pkgs = await listPackages(root);
    expect(pkgs.find((p) => p.name === "zod")?.dev).toBe(false);
    expect(pkgs.find((p) => p.name === "typescript")?.dev).toBe(true);
  });

  test("prefers resolved version from package-lock.json", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-npm-lock-"));
    await writeFile(join(root, "package.json"), JSON.stringify({
      dependencies: { "zod": "^3.0.0" },
    }));
    await writeFile(join(root, "package-lock.json"), JSON.stringify({
      packages: { "node_modules/zod": { version: "3.22.4" } },
    }));
    const pkgs = await listPackages(root);
    expect(pkgs.find((p) => p.name === "zod")?.version).toBe("3.22.4");
  });

  test("falls back to spec version when lock is absent", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-npm-nolock-"));
    await writeFile(join(root, "package.json"), JSON.stringify({
      dependencies: { "lodash": "^4.17.0" },
    }));
    const pkgs = await listPackages(root);
    expect(pkgs.find((p) => p.name === "lodash")?.version).toBe("^4.17.0");
  });

  test("returns empty array when package.json is absent", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-npm-none-"));
    expect(await listPackages(root)).toEqual([]);
  });
});

// ── workspaceGlobs / expandWorkspaceGlob ────────────────────────────────────

describe("workspaceGlobs", () => {
  test("returns array form directly", () => {
    expect(workspaceGlobs({ workspaces: ["packages/*", "apps/*"] })).toEqual(["packages/*", "apps/*"]);
  });

  test("extracts packages from object form", () => {
    expect(workspaceGlobs({ workspaces: { packages: ["packages/*"] } })).toEqual(["packages/*"]);
  });

  test("returns [] when workspaces absent", () => {
    expect(workspaceGlobs({})).toEqual([]);
  });
});

describe("expandWorkspaceGlob", () => {
  test("expands dir/* to direct subdirectories", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-ws-"));
    mkdirSync(join(root, "packages", "alpha"), { recursive: true });
    mkdirSync(join(root, "packages", "beta"), { recursive: true });
    const dirs = await expandWorkspaceGlob(root, "packages/*");
    const names = dirs.map((d) => d.split("/").pop());
    expect(names).toContain("alpha");
    expect(names).toContain("beta");
  });

  test("returns [] for missing parent directory", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-ws-miss-"));
    expect(await expandWorkspaceGlob(root, "nonexistent/*")).toEqual([]);
  });

  test("handles literal path (no wildcard)", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-ws-lit-"));
    mkdirSync(join(root, "shared"));
    const dirs = await expandWorkspaceGlob(root, "shared");
    expect(dirs).toHaveLength(1);
    expect(dirs[0]).toContain("shared");
  });
});

// ── resolveImport ────────────────────────────────────────────────────────────

describe("resolveImport", () => {
  test("resolves @-alias via tsconfig paths", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-resolve-"));
    mkdirSync(join(root, "src", "utils"), { recursive: true });
    await writeFile(join(root, "src", "utils", "helpers.ts"), "export {}");
    const tsconfig = { compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } } };
    const result = resolveImport("@/utils/helpers", root, tsconfig);
    expect("file" in result).toBe(true);
    if ("file" in result) expect(result.relative).toBe("src/utils/helpers.ts");
  });

  test("resolves bare specifier via baseUrl", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-resolve-base-"));
    mkdirSync(join(root, "src", "components"), { recursive: true });
    await writeFile(join(root, "src", "components", "Button.tsx"), "export {}");
    const tsconfig = { compilerOptions: { baseUrl: "src" } };
    const result = resolveImport("components/Button", root, tsconfig);
    expect("file" in result).toBe(true);
    if ("file" in result) expect(result.relative).toBe("src/components/Button.tsx");
  });

  test("resolves relative import when from is provided", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-resolve-rel-"));
    mkdirSync(join(root, "src"));
    await writeFile(join(root, "src", "utils.ts"), "export {}");
    await writeFile(join(root, "src", "main.ts"), "");
    const result = resolveImport("./utils", root, null, "src/main.ts");
    expect("file" in result).toBe(true);
    if ("file" in result) expect(result.relative).toBe("src/utils.ts");
  });

  test("returns external for node_modules package", () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-resolve-ext-"));
    const result = resolveImport("lodash", root, null);
    expect("external" in result).toBe(true);
  });

  test("returns external for relative import without from", () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-resolve-noform-"));
    const result = resolveImport("./foo", root, null);
    expect("external" in result).toBe(true);
  });
});

// ── MCP tool: list_node_packages ─────────────────────────────────────────────

describe("list_node_packages tool", () => {
  test("lists packages sorted by name", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-tool-npm-"));
    await writeFile(join(root, "package.json"), JSON.stringify({
      dependencies: { "zod": "^3.0.0", "express": "^4.0.0" },
    }));
    const result = await callTool(makeCtx(root), "list_node_packages", {});
    const text = result.content[0].text as string;
    expect(text).toContain("express");
    expect(text).toContain("zod");
    expect(text.indexOf("express")).toBeLessThan(text.indexOf("zod"));
  });

  test("excludes devDeps when includeDev is false", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-tool-nodev-"));
    await writeFile(join(root, "package.json"), JSON.stringify({
      dependencies: { "zod": "^3.0.0" },
      devDependencies: { "typescript": "^5.0.0" },
    }));
    const result = await callTool(makeCtx(root), "list_node_packages", { includeDev: false });
    const text = result.content[0].text as string;
    expect(text).toContain("zod");
    expect(text).not.toContain("typescript");
  });
});

// ── MCP tool: resolve_import ─────────────────────────────────────────────────

describe("resolve_import tool", () => {
  test("resolves alias to project file", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-tool-resolve-"));
    mkdirSync(join(root, "src", "lib"), { recursive: true });
    await writeFile(join(root, "src", "lib", "db.ts"), "export {}");
    await writeFile(join(root, "tsconfig.json"), JSON.stringify({
      compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } },
    }));
    const result = await callTool(makeCtx(root), "resolve_import", { specifier: "@/lib/db" });
    expect(result.content[0].text).toContain("src/lib/db.ts");
  });

  test("reports external package", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-tool-ext-"));
    await writeFile(join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: {} }));
    const result = await callTool(makeCtx(root), "resolve_import", { specifier: "react" });
    expect(result.content[0].text).toContain("external");
  });
});

// ── MCP tool: list_workspace_packages ────────────────────────────────────────

describe("list_workspace_packages tool", () => {
  test("lists packages in a monorepo", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-tool-ws-"));
    mkdirSync(join(root, "packages", "core"), { recursive: true });
    mkdirSync(join(root, "packages", "utils"), { recursive: true });
    await writeFile(join(root, "package.json"), JSON.stringify({ workspaces: ["packages/*"] }));
    await writeFile(join(root, "packages", "core", "package.json"), JSON.stringify({ name: "@acme/core", version: "1.0.0" }));
    await writeFile(join(root, "packages", "utils", "package.json"), JSON.stringify({ name: "@acme/utils", version: "0.1.0" }));
    const result = await callTool(makeCtx(root), "list_workspace_packages", {});
    const text = result.content[0].text as string;
    expect(text).toContain("@acme/core");
    expect(text).toContain("@acme/utils");
  });

  test("reports no workspace configuration when absent", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-tool-nows-"));
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "simple-app" }));
    const result = await callTool(makeCtx(root), "list_workspace_packages", {});
    expect(result.content[0].text).toContain("No workspace");
  });
});
