import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { listImports } from "../src/core/code/imports";
import { languageById } from "../src/core/code/languages";

async function tmpFile(name: string, contents: string): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "unimcp-imp-"));
  const file = join(dir, name);
  await writeFile(file, contents);
  return file;
}

describe("listImports (TypeScript)", () => {
  const TS = `
import { readFile } from "node:fs/promises";
import defaultFoo from "./foo";
import * as utils from "./utils";
import { Foo, Bar } from "./models";
import { Original as Alias } from "./other";
`.trimStart();

  test("named imports", async () => {
    const file = await tmpFile("a.ts", TS);
    const lang = languageById("typescript")!;
    const imports = await listImports(file, "a.ts", lang);
    const rows = imports.map((i) => `${i.name}  from ${i.from}`);
    expect(rows).toContain("readFile  from node:fs/promises");
    expect(rows).toContain("Foo  from ./models");
    expect(rows).toContain("Bar  from ./models");
  });

  test("default import", async () => {
    const file = await tmpFile("b.ts", TS);
    const lang = languageById("typescript")!;
    const imports = await listImports(file, "b.ts", lang);
    expect(imports.map((i) => i.name)).toContain("defaultFoo");
  });

  test("namespace import", async () => {
    const file = await tmpFile("c.ts", TS);
    const lang = languageById("typescript")!;
    const imports = await listImports(file, "c.ts", lang);
    expect(imports.map((i) => i.name)).toContain("utils");
  });

  test("aliased import captures the alias", async () => {
    const file = await tmpFile("d.ts", TS);
    const lang = languageById("typescript")!;
    const imports = await listImports(file, "d.ts", lang);
    expect(imports.map((i) => i.name)).toContain("Alias");
  });
});

describe("listImports (Python)", () => {
  const PY = `
from os.path import join, exists
from collections import OrderedDict as OD
import sys
`.trimStart();

  test("from-import", async () => {
    const file = await tmpFile("a.py", PY);
    const lang = languageById("python")!;
    const imports = await listImports(file, "a.py", lang);
    const rows = imports.map((i) => `${i.name}  from ${i.from}`);
    expect(rows).toContain("join  from os.path");
    expect(rows).toContain("exists  from os.path");
  });

  test("aliased from-import", async () => {
    const file = await tmpFile("b.py", PY);
    const lang = languageById("python")!;
    const imports = await listImports(file, "b.py", lang);
    expect(imports.map((i) => i.name)).toContain("OD");
  });

  test("bare import", async () => {
    const file = await tmpFile("c.py", PY);
    const lang = languageById("python")!;
    const imports = await listImports(file, "c.py", lang);
    expect(imports.map((i) => i.name)).toContain("sys");
  });
});

describe("listImports (PHP)", () => {
  const PHP = `<?php
use App\\Models\\User;
use App\\Http\\Controllers\\UserController as UC;
`;

  test("use declaration derives last segment as name", async () => {
    const file = await tmpFile("a.php", PHP);
    const lang = languageById("php")!;
    const imports = await listImports(file, "a.php", lang);
    const rows = imports.map((i) => `${i.name}  from ${i.from}`);
    expect(rows).toContain("User  from App\\Models\\User");
  });

  test("aliased use captures the alias", async () => {
    const file = await tmpFile("b.php", PHP);
    const lang = languageById("php")!;
    const imports = await listImports(file, "b.php", lang);
    expect(imports.map((i) => i.name)).toContain("UC");
  });
});

describe("listImports (Go)", () => {
  const GO = `package main

import (
	"fmt"
	"encoding/json"
	j "encoding/json"
)
`;

  test("derives package name from path", async () => {
    const file = await tmpFile("a.go", GO);
    const lang = languageById("go")!;
    const imports = await listImports(file, "a.go", lang);
    const names = imports.map((i) => i.name);
    expect(names).toContain("fmt");
    expect(names).toContain("json");
  });

  test("aliased import captures the alias", async () => {
    const file = await tmpFile("b.go", GO);
    const lang = languageById("go")!;
    const imports = await listImports(file, "b.go", lang);
    expect(imports.map((i) => i.name)).toContain("j");
  });
});

describe("listImports (Rust)", () => {
  const RUST = `
use std::collections::HashMap;
use std::io::Write;
`.trimStart();

  test("captures use paths", async () => {
    const file = await tmpFile("a.rs", RUST);
    const lang = languageById("rust")!;
    const imports = await listImports(file, "a.rs", lang);
    const froms = imports.map((i) => i.from);
    expect(froms.some((f) => f.includes("HashMap"))).toBe(true);
    expect(froms.some((f) => f.includes("Write"))).toBe(true);
  });
});

describe("listImports (edge cases)", () => {
  test("returns [] for unreadable file", async () => {
    const lang = languageById("typescript")!;
    const result = await listImports("/no/such/file.ts", "no.ts", lang);
    expect(result).toEqual([]);
  });

  test("returns [] for language without imports query", async () => {
    const lang = languageById("ruby")!;
    const file = await tmpFile("a.rb", "require 'json'\n");
    const result = await listImports(file, "a.rb", lang);
    expect(result).toEqual([]);
  });
});
