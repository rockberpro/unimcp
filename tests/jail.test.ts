import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join, sep } from "node:path";
import { createJail } from "../src/mcp/jail";

const root = mkdtempSync(join(tmpdir(), "unimcp-jail-"));

describe("createJail", () => {
  const jail = createJail(root);

  test("accepts the root itself", () => {
    expect(jail.assertInside(root)).toBe(root);
  });

  test("accepts a relative path resolved against root", () => {
    expect(jail.assertInside("inside/file.txt")).toBe(join(root, "inside", "file.txt"));
  });

  test("accepts an absolute path inside root", () => {
    const abs = join(root, "sub", "x.ts");
    expect(jail.assertInside(abs)).toBe(abs);
  });

  test("rejects parent traversal", () => {
    expect(() => jail.assertInside("../escape.txt")).toThrow(/outside/);
  });

  test("rejects deeper traversal that resolves above root", () => {
    expect(() => jail.assertInside("a/../../b")).toThrow(/outside/);
  });

  test("rejects unrelated absolute path", () => {
    const elsewhere = sep === "\\" ? "C:\\Windows\\System32" : "/etc/passwd";
    expect(() => jail.assertInside(elsewhere)).toThrow(/outside/);
  });

  test("relative() converts absolute to forward-slash path", () => {
    const abs = join(root, "a", "b", "c.ts");
    expect(jail.relative(abs)).toBe("a/b/c.ts");
  });

  test("relative() returns '.' for root", () => {
    expect(jail.relative(root)).toBe(".");
  });
});
