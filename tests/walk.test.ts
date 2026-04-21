import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { globToRegex, walkFiles, parseGitignore } from "../src/core/tools/walk";

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

// ── parseGitignore ────────────────────────────────────────────────────────────

describe("parseGitignore", () => {
  test("skips blank lines and comments", () => {
    const rules = parseGitignore("# comment\n\nfoo.log\n");
    expect(rules).toHaveLength(1);
  });

  test("non-anchored pattern matches at any depth", () => {
    const [rule] = parseGitignore("*.log");
    expect(rule.pattern.test("foo.log")).toBe(true);
    expect(rule.pattern.test("src/foo.log")).toBe(true);
    expect(rule.pattern.test("a/b/foo.log")).toBe(true);
    expect(rule.pattern.test("foo.ts")).toBe(false);
  });

  test("leading-slash pattern is anchored to the gitignore directory", () => {
    const [rule] = parseGitignore("/dist");
    expect(rule.pattern.test("dist")).toBe(true);
    expect(rule.pattern.test("dist/index.js")).toBe(true);
    expect(rule.pattern.test("src/dist")).toBe(false);
  });

  test("pattern with mid-slash is anchored", () => {
    const [rule] = parseGitignore("src/generated");
    expect(rule.pattern.test("src/generated")).toBe(true);
    expect(rule.pattern.test("src/generated/foo.ts")).toBe(true);
    expect(rule.pattern.test("other/src/generated")).toBe(false);
  });

  test("trailing-slash marks dirOnly, matches at any depth", () => {
    const [rule] = parseGitignore("build/");
    expect(rule.dirOnly).toBe(true);
    expect(rule.pattern.test("build")).toBe(true);
    expect(rule.pattern.test("src/build")).toBe(true);
  });

  test("negated pattern sets negated flag", () => {
    const [rule] = parseGitignore("!important.log");
    expect(rule.negated).toBe(true);
    expect(rule.pattern.test("important.log")).toBe(true);
  });

  test("**/ prefix matches at any depth", () => {
    const [rule] = parseGitignore("**/node_modules");
    expect(rule.pattern.test("node_modules")).toBe(true);
    expect(rule.pattern.test("a/node_modules")).toBe(true);
    expect(rule.pattern.test("a/b/node_modules")).toBe(true);
  });
});

// ── walkFiles + .gitignore ────────────────────────────────────────────────────

describe("walkFiles honorGitignore", () => {
  async function setup() {
    const root = mkdtempSync(join(tmpdir(), "unimcp-gitignore-"));
    await mkdir(join(root, "dist"), { recursive: true });
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "src", "generated"), { recursive: true });
    await writeFile(join(root, "index.ts"), "");
    await writeFile(join(root, "dist", "bundle.js"), "");
    await writeFile(join(root, "src", "app.ts"), "");
    await writeFile(join(root, "src", "generated", "schema.ts"), "");
    return root;
  }

  test("excludes files and dirs matched by root .gitignore", async () => {
    const root = await setup();
    await writeFile(join(root, ".gitignore"), "dist/\nsrc/generated/\n");
    const found = await walkFiles(root, { ignoreDirs: new Set(), honorGitignore: true });
    const rels = found.map((f) => f.slice(root.length + 1)).sort();
    expect(rels).not.toContain("dist/bundle.js");
    expect(rels).not.toContain("src/generated/schema.ts");
    expect(rels).toContain("src/app.ts");
    expect(rels).toContain("index.ts");
  });

  test("nested .gitignore applies only to its subtree", async () => {
    const root = await setup();
    await writeFile(join(root, "src", ".gitignore"), "generated/\n");
    const found = await walkFiles(root, { ignoreDirs: new Set(), honorGitignore: true });
    const rels = found.map((f) => f.slice(root.length + 1)).sort();
    expect(rels).not.toContain("src/generated/schema.ts");
    expect(rels).toContain("dist/bundle.js"); // dist not ignored by nested gitignore
    expect(rels).toContain("src/app.ts");
  });

  test("honorGitignore: false disables .gitignore parsing", async () => {
    const root = await setup();
    await writeFile(join(root, ".gitignore"), "dist/\nsrc/generated/\n");
    const found = await walkFiles(root, { ignoreDirs: new Set(), honorGitignore: false });
    const rels = found.map((f) => f.slice(root.length + 1)).sort();
    expect(rels).toContain("dist/bundle.js");
    expect(rels).toContain("src/generated/schema.ts");
  });

  test("negation re-includes a previously ignored file", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-gitignore-neg-"));
    await writeFile(join(root, "foo.log"), "");
    await writeFile(join(root, "important.log"), "");
    await writeFile(join(root, ".gitignore"), "*.log\n!important.log\n");
    const found = await walkFiles(root, { ignoreDirs: new Set(), honorGitignore: true });
    const rels = found.map((f) => f.slice(root.length + 1)).sort();
    expect(rels).not.toContain("foo.log");
    expect(rels).toContain("important.log");
  });

  test("ignoreDirs still takes precedence regardless of honorGitignore", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-gitignore-idirs-"));
    await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
    await writeFile(join(root, "node_modules", "pkg", "index.js"), "");
    const found = await walkFiles(root, { ignoreDirs: new Set(["node_modules"]), honorGitignore: true });
    expect(found).toHaveLength(0);
  });
});
