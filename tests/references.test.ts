import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { findReferences } from "../src/core/code/references";
import { languageById } from "../src/core/code/languages";

async function tmpFile(name: string, contents: string): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "unimcp-refs-"));
  const file = join(dir, name);
  await writeFile(file, contents);
  return file;
}

describe("findReferences (TypeScript)", () => {
  const TS = `
import { Foo } from "./foo";
// Foo is a great class
const x: Foo = new Foo();
const label = "Foo is not a ref";
function useFoo(f: Foo): Foo { return f; }
`.trimStart();

  test("finds real identifier references", async () => {
    const file = await tmpFile("a.ts", TS);
    const lang = languageById("typescript")!;
    const refs = await findReferences(file, "a.ts", lang, "Foo");
    const lines = refs.map((r) => r.line);
    expect(lines).toContain(1); // import
    expect(lines).toContain(3); // const x: Foo = new Foo()
    expect(lines).toContain(5); // function useFoo
  });

  test("excludes hits inside string literals", async () => {
    const file = await tmpFile("b.ts", TS);
    const lang = languageById("typescript")!;
    const refs = await findReferences(file, "b.ts", lang, "Foo");
    // line 4 is the string "Foo is not a ref" — must not appear
    const lines = refs.map((r) => r.line);
    expect(lines).not.toContain(4);
  });

  test("excludes hits inside comments", async () => {
    const file = await tmpFile("c.ts", TS);
    const lang = languageById("typescript")!;
    const refs = await findReferences(file, "c.ts", lang, "Foo");
    // line 2 is the // comment — must not appear
    const lines = refs.map((r) => r.line);
    expect(lines).not.toContain(2);
  });

  test("deduplicates multiple hits on the same line", async () => {
    const src = `const x: Foo = new Foo();\n`;
    const file = await tmpFile("d.ts", src);
    const lang = languageById("typescript")!;
    const refs = await findReferences(file, "d.ts", lang, "Foo");
    expect(refs.filter((r) => r.line === 1)).toHaveLength(1);
  });
});

describe("findReferences (PHP)", () => {
  const PHP = `<?php
// User is a model
class UserFactory {
  public function create(): User {
    return new User();
  }
}
$label = "User is cool";
`;

  test("finds class name references", async () => {
    const file = await tmpFile("a.php", PHP);
    const lang = languageById("php")!;
    const refs = await findReferences(file, "a.php", lang, "User");
    const lines = refs.map((r) => r.line);
    expect(lines).toContain(4); // return type
    expect(lines).toContain(5); // new User()
  });

  test("excludes string literal and comment hits", async () => {
    const file = await tmpFile("b.php", PHP);
    const lang = languageById("php")!;
    const refs = await findReferences(file, "b.php", lang, "User");
    const lines = refs.map((r) => r.line);
    expect(lines).not.toContain(2); // comment
    expect(lines).not.toContain(8); // string
  });
});

describe("findReferences (Python)", () => {
  const PY = `
# MyClass usage
class MyClass:
    pass

# "MyClass" in string
label = "MyClass is here"
x = MyClass()
`.trimStart();

  test("finds identifier references, excludes string and comment", async () => {
    const file = await tmpFile("a.py", PY);
    const lang = languageById("python")!;
    const refs = await findReferences(file, "a.py", lang, "MyClass");
    const lines = refs.map((r) => r.line);
    expect(lines).toContain(2); // class definition
    expect(lines).toContain(7); // x = MyClass()
    expect(lines).not.toContain(1); // comment
    expect(lines).not.toContain(6); // string
  });
});

describe("findReferences (Go)", () => {
  const GO = `package main

// Handler is used here
import "fmt"

type Handler struct{}

func useHandler(h Handler) Handler {
	fmt.Println("Handler")
	return h
}
`;

  test("finds type references, excludes string and comment", async () => {
    const file = await tmpFile("a.go", GO);
    const lang = languageById("go")!;
    const refs = await findReferences(file, "a.go", lang, "Handler");
    const lines = refs.map((r) => r.line);
    expect(lines).toContain(6); // type Handler struct
    expect(lines).toContain(8); // func useHandler(h Handler) Handler
    expect(lines).not.toContain(3); // comment
    expect(lines).not.toContain(9); // string "Handler"
  });
});

describe("findReferences (fallback)", () => {
  test("returns [] for unreadable file", async () => {
    const lang = languageById("typescript")!;
    const refs = await findReferences("/no/such/file.ts", "no.ts", lang, "Foo");
    expect(refs).toEqual([]);
  });
});
