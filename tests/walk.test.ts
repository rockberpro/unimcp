import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { globToRegex, walkFiles } from "../src/core/tools/walk";

describe("globToRegex", () => {
  test("'*.ts' matches files at one level only", () => {
    const re = globToRegex("*.ts");
    expect(re.test("foo.ts")).toBe(true);
    expect(re.test("foo.js")).toBe(false);
    expect(re.test("a/foo.ts")).toBe(false);
  });

  test("'**/*.ts' matches at any depth", () => {
    const re = globToRegex("**/*.ts");
    expect(re.test("foo.ts")).toBe(true);
    expect(re.test("a/foo.ts")).toBe(true);
    expect(re.test("a/b/c/foo.ts")).toBe(true);
    expect(re.test("foo.js")).toBe(false);
  });

  test("'?' matches a single non-slash character", () => {
    const re = globToRegex("?.ts");
    expect(re.test("a.ts")).toBe(true);
    expect(re.test("ab.ts")).toBe(false);
    expect(re.test("/.ts")).toBe(false);
  });

  test("escapes regex metacharacters", () => {
    const re = globToRegex("file.name");
    expect(re.test("file.name")).toBe(true);
    expect(re.test("fileXname")).toBe(false);
  });
});

describe("walkFiles", () => {
  test("walks files recursively, applies match, skips ignoreDirs", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-walk-"));
    await Promise.all([
      writeFile(join(root, "a.ts"), ""),
      writeFile(join(root, "b.txt"), ""),
      mkdir(join(root, "node_modules"), { recursive: true }).then(() =>
        writeFile(join(root, "node_modules", "skip.ts"), ""),
      ),
      mkdir(join(root, "src"), { recursive: true }).then(() =>
        writeFile(join(root, "src", "deep.ts"), ""),
      ),
    ]);

    const found = await walkFiles(root, {
      ignoreDirs: new Set(["node_modules"]),
      match: (rel) => rel.endsWith(".ts"),
    });

    const rels = found.map((f) => f.slice(root.length + 1).replace(/\\/g, "/")).sort();
    expect(rels).toEqual(["a.ts", "src/deep.ts"]);
  });

  test("returns [] for non-existent directory rather than throwing", async () => {
    const found = await walkFiles(join(tmpdir(), "unimcp-does-not-exist-xyz"), {
      ignoreDirs: new Set(),
    });
    expect(found).toEqual([]);
  });
});
