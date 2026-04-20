import { describe, expect, test } from "bun:test";
import { flattenPsr4, fileToFqcn, fqcnToRelativeFile } from "../src/adapters/php-composer/composer";

describe("flattenPsr4", () => {
  test("normalizes string-or-array dirs and trims trailing slashes", () => {
    const flat = flattenPsr4({
      "psr-4": {
        "App\\": "src/",
        "Tests\\": ["tests/", "tests-extra/"],
      },
    });
    expect(flat).toEqual([
      { namespacePrefix: "App\\", dir: "src" },
      { namespacePrefix: "Tests\\", dir: "tests" },
      { namespacePrefix: "Tests\\", dir: "tests-extra" },
    ]);
  });

  test("returns [] for missing autoload", () => {
    expect(flattenPsr4(undefined)).toEqual([]);
    expect(flattenPsr4({})).toEqual([]);
  });
});

describe("fileToFqcn", () => {
  test("maps PSR-4 file to fully-qualified class name", () => {
    const root = { namespacePrefix: "App\\", dir: "src" };
    expect(fileToFqcn("src/Models/User.php", root)).toBe("App\\Models\\User");
    expect(fileToFqcn("src/Foo.php", root)).toBe("App\\Foo");
  });

  test("returns null for files outside the PSR-4 root", () => {
    const root = { namespacePrefix: "App\\", dir: "src" };
    expect(fileToFqcn("other/Foo.php", root)).toBeNull();
  });

  test("returns null for non-php files", () => {
    const root = { namespacePrefix: "App\\", dir: "src" };
    expect(fileToFqcn("src/foo.txt", root)).toBeNull();
  });

  test("handles a root-level (empty-prefix) PSR-4 mapping", () => {
    const root = { namespacePrefix: "", dir: "lib" };
    expect(fileToFqcn("lib/Tools/Helper.php", root)).toBe("Tools\\Helper");
  });

  test("normalizes Windows-style paths", () => {
    const root = { namespacePrefix: "App\\", dir: "src" };
    expect(fileToFqcn("src\\Models\\User.php", root)).toBe("App\\Models\\User");
  });
});

describe("fqcnToRelativeFile", () => {
  test("inverts fileToFqcn for a typical PSR-4 root", () => {
    const root = { namespacePrefix: "App\\", dir: "src" };
    expect(fqcnToRelativeFile("App\\Models\\User", root)).toBe("src/Models/User.php");
  });

  test("returns null when fqcn does not start with the prefix", () => {
    const root = { namespacePrefix: "App\\", dir: "src" };
    expect(fqcnToRelativeFile("Other\\Thing", root)).toBeNull();
  });

  test("handles leading backslash on the fqcn", () => {
    const root = { namespacePrefix: "App\\", dir: "src" };
    expect(fqcnToRelativeFile("\\App\\Foo", root)).toBe("src/Foo.php");
  });
});
