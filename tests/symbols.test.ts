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

// ── New symbol kinds ──────────────────────────────────────────────────────────

const TS_NEW_KINDS = `
enum Direction { Up, Down }
type UserId = string;
const MAX_RETRIES = 3;
export const API_URL = "https://example.com";
`.trimStart();

describe("expanded symbol kinds (TypeScript)", () => {
  test("enum", async () => {
    const file = await tmpFile("kinds.ts", TS_NEW_KINDS);
    const lang = languageById("typescript")!;
    const syms = await extractSymbols(file, "kinds.ts", lang, "enum");
    expect(syms.map((s) => s.name)).toContain("Direction");
  });

  test("type alias", async () => {
    const file = await tmpFile("kinds.ts", TS_NEW_KINDS);
    const lang = languageById("typescript")!;
    const syms = await extractSymbols(file, "kinds.ts", lang, "type");
    expect(syms.map((s) => s.name)).toContain("UserId");
  });

  test("top-level const (plain and exported)", async () => {
    const file = await tmpFile("kinds.ts", TS_NEW_KINDS);
    const lang = languageById("typescript")!;
    const syms = await extractSymbols(file, "kinds.ts", lang, "constant");
    const names = syms.map((s) => s.name);
    expect(names).toContain("MAX_RETRIES");
    expect(names).toContain("API_URL");
  });
});

const PHP_NEW_KINDS = `<?php
enum Status { case Active; case Inactive; }
trait Loggable { public function log(): void {} }
const VERSION = "1.0";
`;

describe("expanded symbol kinds (PHP)", () => {
  test("enum", async () => {
    const file = await tmpFile("kinds.php", PHP_NEW_KINDS);
    const lang = languageById("php")!;
    const syms = await extractSymbols(file, "kinds.php", lang, "enum");
    expect(syms.map((s) => s.name)).toContain("Status");
  });

  test("trait", async () => {
    const file = await tmpFile("kinds.php", PHP_NEW_KINDS);
    const lang = languageById("php")!;
    const syms = await extractSymbols(file, "kinds.php", lang, "trait");
    expect(syms.map((s) => s.name)).toContain("Loggable");
  });

  test("constant", async () => {
    const file = await tmpFile("kinds.php", PHP_NEW_KINDS);
    const lang = languageById("php")!;
    const syms = await extractSymbols(file, "kinds.php", lang, "constant");
    expect(syms.map((s) => s.name)).toContain("VERSION");
  });
});

const GO_NEW_KINDS = `package main

type Point struct {
	X, Y float64
}

const MaxSize = 100
`;

describe("expanded symbol kinds (Go)", () => {
  test("struct", async () => {
    const file = await tmpFile("kinds.go", GO_NEW_KINDS);
    const lang = languageById("go")!;
    const syms = await extractSymbols(file, "kinds.go", lang, "struct");
    expect(syms.map((s) => s.name)).toContain("Point");
  });

  test("constant", async () => {
    const file = await tmpFile("kinds.go", GO_NEW_KINDS);
    const lang = languageById("go")!;
    const syms = await extractSymbols(file, "kinds.go", lang, "constant");
    expect(syms.map((s) => s.name)).toContain("MaxSize");
  });
});

const RUST_NEW_KINDS = `
enum Color { Red, Green, Blue }
type Meters = f64;
struct Point { x: f64, y: f64 }
trait Drawable { fn draw(&self); }
mod utils {}
const PI: f64 = 3.14159;
`.trimStart();

describe("expanded symbol kinds (Rust)", () => {
  test("enum", async () => {
    const file = await tmpFile("kinds.rs", RUST_NEW_KINDS);
    const lang = languageById("rust")!;
    const syms = await extractSymbols(file, "kinds.rs", lang, "enum");
    expect(syms.map((s) => s.name)).toContain("Color");
  });

  test("type alias", async () => {
    const file = await tmpFile("kinds.rs", RUST_NEW_KINDS);
    const lang = languageById("rust")!;
    const syms = await extractSymbols(file, "kinds.rs", lang, "type");
    expect(syms.map((s) => s.name)).toContain("Meters");
  });

  test("struct", async () => {
    const file = await tmpFile("kinds.rs", RUST_NEW_KINDS);
    const lang = languageById("rust")!;
    const syms = await extractSymbols(file, "kinds.rs", lang, "struct");
    expect(syms.map((s) => s.name)).toContain("Point");
  });

  test("trait", async () => {
    const file = await tmpFile("kinds.rs", RUST_NEW_KINDS);
    const lang = languageById("rust")!;
    const syms = await extractSymbols(file, "kinds.rs", lang, "trait");
    expect(syms.map((s) => s.name)).toContain("Drawable");
  });

  test("module", async () => {
    const file = await tmpFile("kinds.rs", RUST_NEW_KINDS);
    const lang = languageById("rust")!;
    const syms = await extractSymbols(file, "kinds.rs", lang, "module");
    expect(syms.map((s) => s.name)).toContain("utils");
  });

  test("constant", async () => {
    const file = await tmpFile("kinds.rs", RUST_NEW_KINDS);
    const lang = languageById("rust")!;
    const syms = await extractSymbols(file, "kinds.rs", lang, "constant");
    expect(syms.map((s) => s.name)).toContain("PI");
  });
});

const RUBY_MODULE = `
module Payments
  class Invoice; end
end
`.trimStart();

describe("expanded symbol kinds (Ruby)", () => {
  test("module", async () => {
    const file = await tmpFile("kinds.rb", RUBY_MODULE);
    const lang = languageById("ruby")!;
    const syms = await extractSymbols(file, "kinds.rb", lang, "module");
    expect(syms.map((s) => s.name)).toContain("Payments");
  });
});

const JAVA_ENUM = `
public enum Day { MON, TUE, WED }
`.trimStart();

describe("expanded symbol kinds (Java)", () => {
  test("enum", async () => {
    const file = await tmpFile("kinds.java", JAVA_ENUM);
    const lang = languageById("java")!;
    const syms = await extractSymbols(file, "kinds.java", lang, "enum");
    expect(syms.map((s) => s.name)).toContain("Day");
  });
});
