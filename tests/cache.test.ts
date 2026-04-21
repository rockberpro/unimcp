import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SymbolCache } from "../src/core/code/cache";
import { languageById } from "../src/core/code/languages";

const TS_SAMPLE = `export class Foo {
  bar(): number { return 1; }
}
export function quux(): void {}
`;

const TS_UPDATED = `export class Foo {
  bar(): number { return 1; }
  baz(): void {}
}
export function quux(): void {}
export function extra(): void {}
`;

async function tmpFile(name: string, contents: string): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "unimcp-cache-"));
  const file = join(dir, name);
  await writeFile(file, contents);
  return file;
}

describe("SymbolCache", () => {
  test("returns symbols on first call", async () => {
    const file = await tmpFile("a.ts", TS_SAMPLE);
    const lang = languageById("typescript")!;
    const cache = new SymbolCache();
    const symbols = await cache.get(file, "a.ts", lang);
    expect(symbols.map((s) => s.name).sort()).toEqual(["Foo", "bar", "quux"]);
  });

  test("serves cached result on repeated call without file change", async () => {
    const file = await tmpFile("b.ts", TS_SAMPLE);
    const lang = languageById("typescript")!;
    const cache = new SymbolCache();

    const first = await cache.get(file, "b.ts", lang);
    const second = await cache.get(file, "b.ts", lang);
    expect(second).toBe(first); // same array reference — no re-parse
  });

  test("invalidates when file is updated", async () => {
    const dir = mkdtempSync(join(tmpdir(), "unimcp-cache-"));
    const file = join(dir, "c.ts");
    await writeFile(file, TS_SAMPLE);
    const lang = languageById("typescript")!;
    const cache = new SymbolCache();

    const first = await cache.get(file, "c.ts", lang);
    expect(first.map((s) => s.name).sort()).toEqual(["Foo", "bar", "quux"]);

    // Overwrite the file (mtime will advance on most FS; bump explicitly via utimes)
    await writeFile(file, TS_UPDATED);
    const { utimes } = await import("node:fs/promises");
    const future = new Date(Date.now() + 2000);
    await utimes(file, future, future);

    const second = await cache.get(file, "c.ts", lang);
    expect(second.map((s) => s.name).sort()).toEqual(["Foo", "bar", "baz", "extra", "quux"].sort());
  });

  test("filterKind is applied on cached symbols", async () => {
    const file = await tmpFile("d.ts", TS_SAMPLE);
    const lang = languageById("typescript")!;
    const cache = new SymbolCache();

    // Warm the cache with no filter
    await cache.get(file, "d.ts", lang);

    // Filtered read should hit cache and filter
    const classes = await cache.get(file, "d.ts", lang, "class");
    expect(classes.map((s) => s.name)).toEqual(["Foo"]);
  });
});
