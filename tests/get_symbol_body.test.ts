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

const TS_SOURCE = `export class Greeter {
  greet(name: string): string {
    return \`Hello, \${name}\`;
  }
}

export function add(a: number, b: number): number {
  return a + b;
}

export class Logger {
  log(msg: string): void {
    console.log(msg);
  }
}
`;

function makeCtx(root: string): ServerContext {
  return {
    config: { root, ignoreDirs: [], allowWrites: false, honorGitignore: true },
    jail: createJail(root),
    symbolCache: new SymbolCache(),
  };
}

async function setup() {
  const root = mkdtempSync(join(tmpdir(), "unimcp-body-"));
  await writeFile(join(root, "sample.ts"), TS_SOURCE);
  return root;
}

async function callTool(ctx: ServerContext, args: Record<string, unknown>) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerCodeTools(server, ctx);
  // @ts-ignore — internal access for testing
  const handler = server._registeredTools["get_symbol_body"]?.handler;
  if (!handler) throw new Error("tool not registered");
  return handler(args);
}

describe("get_symbol_body", () => {
  test("returns body and header for a single match", async () => {
    const root = await setup();
    const result = await callTool(makeCtx(root), { name: "add" });
    const text = result.content[0].text as string;
    expect(text).toContain("sample.ts:7-9");
    expect(text).toContain("function add");
    expect(text).toContain("return a + b");
  });

  test("returns all matches when multiple symbols share a name across files", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-body-multi-"));
    await writeFile(join(root, "a.ts"), `export function helper(): void {}\n`);
    await writeFile(join(root, "b.ts"), `export function helper(): string { return "x"; }\n`);
    const result = await callTool(makeCtx(root), { name: "helper" });
    const text = result.content[0].text as string;
    expect(text).toContain("a.ts");
    expect(text).toContain("b.ts");
  });

  test("kind filter narrows results", async () => {
    const root = await setup();
    const result = await callTool(makeCtx(root), { name: "Greeter", kind: "class" });
    const text = result.content[0].text as string;
    expect(text).toContain("class Greeter");
  });

  test("returns not-found message when name has no match", async () => {
    const root = await setup();
    const result = await callTool(makeCtx(root), { name: "NoSuchSymbol" });
    expect(result.content[0].text).toContain("No symbol");
  });

  test("path scoping restricts to a subdirectory", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-body-scope-"));
    mkdirSync(join(root, "sub"));
    await writeFile(join(root, "root.ts"), `export function shared(): void {}\n`);
    await writeFile(join(root, "sub", "sub.ts"), `export function shared(): number { return 1; }\n`);
    const result = await callTool(makeCtx(root), { name: "shared", path: join(root, "sub") });
    const text = result.content[0].text as string;
    expect(text).toContain("sub");
    expect(text).not.toContain("root.ts");
  });
});
