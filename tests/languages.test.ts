import { describe, expect, test } from "bun:test";
import { LANGUAGES, languageById, languageForFile } from "../src/core/code/languages";

describe("languageForFile", () => {
  test.each([
    ["foo.php", "php"],
    ["foo.ts", "typescript"],
    ["foo.tsx", "tsx"],
    ["foo.js", "javascript"],
    ["foo.py", "python"],
    ["foo.go", "go"],
    ["foo.rb", "ruby"],
    ["foo.java", "java"],
    ["foo.rs", "rust"],
  ])("'%s' -> %s", (file, expectedId) => {
    expect(languageForFile(file)?.id).toBe(expectedId);
  });

  test("returns null for unknown extension", () => {
    expect(languageForFile("foo.unknown")).toBeNull();
  });

  test("returns null for files without an extension", () => {
    expect(languageForFile("Makefile")).toBeNull();
  });

  test("is case-insensitive on extensions", () => {
    expect(languageForFile("FOO.PHP")?.id).toBe("php");
  });
});

describe("languageById", () => {
  test("returns the matching language definition", () => {
    expect(languageById("php")?.id).toBe("php");
  });

  test("returns null for unknown id", () => {
    expect(languageById("brainfuck")).toBeNull();
  });
});

describe("LANGUAGES catalog", () => {
  test("every language has at least one query", () => {
    for (const lang of LANGUAGES) {
      const queries = Object.values(lang.queries).filter(Boolean);
      expect(queries.length).toBeGreaterThan(0);
    }
  });

  test("every language has at least one extension", () => {
    for (const lang of LANGUAGES) {
      expect(lang.exts.length).toBeGreaterThan(0);
    }
  });
});
