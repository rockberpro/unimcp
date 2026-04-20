import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { extractSymbols } from "../src/core/code/symbols";
import { languageById } from "../src/core/code/languages";

const PHP_SAMPLE = `<?php
namespace App\\Models;

class User {
  public function getName(): string { return $this->name; }
  public function setName(string $name): void { $this->name = $name; }
}

interface Greeter {
  public function greet(): string;
}

function helper(): int { return 1; }
`;

const TS_SAMPLE = `export class Foo {
  bar(): number { return 1; }
}

export interface Baz { x: string }

export function quux(): void {}
`;

async function tmpFile(name: string, contents: string): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "unimcp-sym-"));
  const file = join(dir, name);
  await writeFile(file, contents);
  return file;
}

describe("extractSymbols", () => {
  test("extracts PHP class, interface, methods, and function", async () => {
    const file = await tmpFile("sample.php", PHP_SAMPLE);
    const lang = languageById("php")!;
    const symbols = await extractSymbols(file, "sample.php", lang);
    const byKind = (k: string) => symbols.filter((s) => s.kind === k).map((s) => s.name).sort();
    expect(byKind("class")).toEqual(["User"]);
    expect(byKind("interface")).toEqual(["Greeter"]);
    expect(byKind("method").sort()).toEqual(["getName", "greet", "setName"]);
    expect(byKind("function")).toEqual(["helper"]);
  });

  test("filterKind narrows to one kind", async () => {
    const file = await tmpFile("sample.php", PHP_SAMPLE);
    const lang = languageById("php")!;
    const onlyClasses = await extractSymbols(file, "sample.php", lang, "class");
    expect(onlyClasses.map((s) => s.name)).toEqual(["User"]);
  });

  test("symbol lines are 1-based and match the source", async () => {
    const file = await tmpFile("sample.php", PHP_SAMPLE);
    const lang = languageById("php")!;
    const symbols = await extractSymbols(file, "sample.php", lang);
    const helperFn = symbols.find((s) => s.name === "helper");
    expect(helperFn?.line).toBe(13);
  });

  test("extracts TypeScript class, interface, method, function", async () => {
    const file = await tmpFile("sample.ts", TS_SAMPLE);
    const lang = languageById("typescript")!;
    const symbols = await extractSymbols(file, "sample.ts", lang);
    const names = symbols.map((s) => `${s.kind}:${s.name}`).sort();
    expect(names).toEqual(["class:Foo", "function:quux", "interface:Baz", "method:bar"]);
  });

  test("returns [] for an unreadable file", async () => {
    const lang = languageById("php")!;
    const result = await extractSymbols("/no/such/file.php", "no.php", lang);
    expect(result).toEqual([]);
  });
});
