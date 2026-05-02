import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SymbolCache } from "../src/core/code/cache";
import { createJail } from "../src/mcp/jail";
import { registerAstTools } from "../src/core/code/ast-tools";
import type { ServerContext } from "../src/mcp/context";

function makeCtx(root: string): ServerContext {
  return {
    config: { root, ignoreDirs: ["node_modules", ".git"], allowWrites: false, docDirs: ["docs"], pluginsDisabled: [], honorGitignore: false },
    jail: createJail(root),
    symbolCache: new SymbolCache(),
  };
}

async function callTool(ctx: ServerContext, toolName: string, args: Record<string, unknown>) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerAstTools(server, ctx);
  // @ts-ignore — internal access for testing
  const handler = server._registeredTools[toolName]?.handler;
  if (!handler) throw new Error(`tool not registered: ${toolName}`);
  return handler(args);
}

// ── find_symbol_usages ────────────────────────────────────────────────────────

describe("find_symbol_usages", () => {
  test("finds import usage", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-fsu-"));
    await writeFile(join(root, "a.ts"), `import { MyType } from './types';\n`);
    const result = await callTool(makeCtx(root), "find_symbol_usages", { symbol: "MyType" });
    expect(result.content[0].text).toContain("[import]");
  });

  test("finds declaration usage", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-fsu-"));
    await writeFile(join(root, "a.ts"), `export interface MyType { id: string; }\n`);
    const result = await callTool(makeCtx(root), "find_symbol_usages", { symbol: "MyType" });
    expect(result.content[0].text).toContain("[declaration]");
  });

  test("finds call usage", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-fsu-"));
    await writeFile(join(root, "a.ts"), `const x = doSomething();\n`);
    const result = await callTool(makeCtx(root), "find_symbol_usages", { symbol: "doSomething" });
    expect(result.content[0].text).toContain("[call]");
  });

  test("kind filter restricts results", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-fsu-"));
    await writeFile(
      join(root, "a.ts"),
      `import { Foo } from './x';\nexport interface Foo { id: string; }\n`,
    );
    const result = await callTool(makeCtx(root), "find_symbol_usages", { symbol: "Foo", kind: "import" });
    const text = result.content[0].text as string;
    expect(text).toContain("[import]");
    expect(text).not.toContain("[declaration]");
  });

  test("scope restricts search to subdirectory", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-fsu-"));
    mkdirSync(join(root, "sub"));
    await writeFile(join(root, "root.ts"), `const x = MyFunc();\n`);
    await writeFile(join(root, "sub", "inner.ts"), `const y = MyFunc();\n`);
    const result = await callTool(makeCtx(root), "find_symbol_usages", {
      symbol: "MyFunc",
      scope: join(root, "sub"),
    });
    const text = result.content[0].text as string;
    expect(text).toContain("inner.ts");
    expect(text).not.toContain("root.ts");
  });

  test("returns not-found message when symbol absent", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-fsu-"));
    await writeFile(join(root, "a.ts"), `const x = 1;\n`);
    const result = await callTool(makeCtx(root), "find_symbol_usages", { symbol: "GhostSymbol" });
    expect(result.content[0].text).toContain("No usages found");
  });

  test("rejects scope outside jail", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-fsu-"));
    const result = await callTool(makeCtx(root), "find_symbol_usages", {
      symbol: "anything",
      scope: "/etc",
    });
    expect(result.isError).toBe(true);
  });
});

// ── find_unused_exports ───────────────────────────────────────────────────────

describe("find_unused_exports", () => {
  test("reports unused export", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-fue-"));
    mkdirSync(join(root, "libs"));
    await writeFile(join(root, "libs", "a.ts"), `export function deadCode() {}\n`);
    await writeFile(join(root, "app.ts"), `const x = 1;\n`);
    const result = await callTool(makeCtx(root), "find_unused_exports", { path: join(root, "libs") });
    expect(result.content[0].text).toContain("deadCode");
  });

  test("no unused when export is imported", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-fue-"));
    mkdirSync(join(root, "libs"));
    await writeFile(join(root, "libs", "utils.ts"), `export function helper() {}\n`);
    await writeFile(join(root, "app.ts"), `import { helper } from './libs/utils';\n`);
    const result = await callTool(makeCtx(root), "find_unused_exports", { path: join(root, "libs") });
    expect(result.content[0].text).toContain("No dead code");
  });

  test("detects re-exports in braces", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-fue-"));
    mkdirSync(join(root, "libs"));
    await writeFile(join(root, "libs", "index.ts"), `export { MyClass } from './inner';\n`);
    const result = await callTool(makeCtx(root), "find_unused_exports", { path: join(root, "libs") });
    expect(result.content[0].text).toContain("MyClass");
  });

  test("reports no exports when directory is empty of TS", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-fue-"));
    mkdirSync(join(root, "libs"));
    await writeFile(join(root, "libs", "README.md"), "# hello\n");
    const result = await callTool(makeCtx(root), "find_unused_exports", { path: join(root, "libs") });
    expect(result.content[0].text).toContain("No exports found");
  });
});

// ── get_file_dependencies ─────────────────────────────────────────────────────

describe("get_file_dependencies", () => {
  test("lists imports of a file", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-gfd-"));
    await writeFile(
      join(root, "a.ts"),
      `import { Foo } from './foo';\nimport Bar from './bar';\n`,
    );
    const result = await callTool(makeCtx(root), "get_file_dependencies", {
      path: join(root, "a.ts"),
      direction: "imports",
    });
    const text = result.content[0].text as string;
    expect(text).toContain("./foo");
    expect(text).toContain("./bar");
  });

  test("lists who imports a file", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-gfd-"));
    await writeFile(join(root, "utils.ts"), `export function helper() {}\n`);
    await writeFile(join(root, "app.ts"), `import { helper } from './utils';\n`);
    const result = await callTool(makeCtx(root), "get_file_dependencies", {
      path: join(root, "utils.ts"),
      direction: "imported_by",
    });
    expect(result.content[0].text).toContain("app.ts");
  });

  test("both direction returns imports and imported_by sections", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-gfd-"));
    await writeFile(join(root, "mid.ts"), `import { x } from './base';\nexport function mid() {}\n`);
    await writeFile(join(root, "base.ts"), `export const x = 1;\n`);
    await writeFile(join(root, "top.ts"), `import { mid } from './mid';\n`);
    const result = await callTool(makeCtx(root), "get_file_dependencies", {
      path: join(root, "mid.ts"),
      direction: "both",
    });
    const text = result.content[0].text as string;
    expect(text).toContain("## Imports");
    expect(text).toContain("## Imported by");
    expect(text).toContain("./base");
    expect(text).toContain("top.ts");
  });

  test("side-effect import shown", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-gfd-"));
    await writeFile(join(root, "a.ts"), `import './polyfill';\n`);
    const result = await callTool(makeCtx(root), "get_file_dependencies", {
      path: join(root, "a.ts"),
      direction: "imports",
    });
    expect(result.content[0].text).toContain("side-effect");
  });

  test("rejects path outside jail", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-gfd-"));
    const result = await callTool(makeCtx(root), "get_file_dependencies", {
      path: "/etc/passwd",
    });
    expect(result.isError).toBe(true);
  });
});
