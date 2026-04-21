import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SymbolCache } from "../src/core/code/cache";
import { createJail } from "../src/mcp/jail";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCodeTools } from "../src/core/code/tools";
import type { ServerContext } from "../src/mcp/context";

function makeCtx(root: string): ServerContext {
  return {
    config: { root, ignoreDirs: [], allowWrites: false },
    jail: createJail(root),
    symbolCache: new SymbolCache(),
  };
}

async function callTool(ctx: ServerContext, args: Record<string, unknown>) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerCodeTools(server, ctx);
  // @ts-ignore — internal access for testing
  const handler = server._registeredTools["find_definition"]?.handler;
  if (!handler) throw new Error("tool not registered");
  return handler(args);
}

describe("find_definition", () => {
  test("finds definition without path (full walk)", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-def-"));
    await writeFile(join(root, "a.ts"), `export function greet(): void {}\n`);
    const result = await callTool(makeCtx(root), { name: "greet" });
    expect(result.content[0].text).toContain("a.ts");
  });

  test("path scoping restricts walk to subtree", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-def-scope-"));
    mkdirSync(join(root, "sub"));
    await writeFile(join(root, "root.ts"), `export function shared(): void {}\n`);
    await writeFile(join(root, "sub", "sub.ts"), `export function shared(): number { return 1; }\n`);
    const result = await callTool(makeCtx(root), { name: "shared", path: join(root, "sub") });
    const text = result.content[0].text as string;
    expect(text).toContain("sub");
    expect(text).not.toContain("root.ts");
  });

  test("path scoping to a single file", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-def-file-"));
    await writeFile(join(root, "a.ts"), `export function target(): void {}\n`);
    await writeFile(join(root, "b.ts"), `export function target(): number { return 0; }\n`);
    const result = await callTool(makeCtx(root), { name: "target", path: join(root, "a.ts") });
    const text = result.content[0].text as string;
    expect(text).toContain("a.ts");
    expect(text).not.toContain("b.ts");
  });

  test("returns not-found when symbol is outside the scoped path", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-def-notfound-"));
    mkdirSync(join(root, "sub"));
    await writeFile(join(root, "root.ts"), `export function onlyInRoot(): void {}\n`);
    await writeFile(join(root, "sub", "sub.ts"), `export function other(): void {}\n`);
    const result = await callTool(makeCtx(root), { name: "onlyInRoot", path: join(root, "sub") });
    expect(result.content[0].text).toContain("No definition found");
  });

  test("rejects path outside jail", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-def-jail-"));
    const result = await callTool(makeCtx(root), { name: "anything", path: "/etc/passwd" });
    expect(result.isError).toBe(true);
  });
});
