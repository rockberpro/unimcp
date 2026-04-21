import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";

export interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[] | { packages: string[] };
}

interface PackageLock {
  packages?: Record<string, { version?: string }>;
}

export interface TsConfig {
  compilerOptions?: {
    baseUrl?: string;
    paths?: Record<string, string[]>;
  };
}

export interface NodePackage {
  name: string;
  version: string;
  dev: boolean;
}

export interface WorkspacePackage {
  name: string;
  version: string;
  path: string;
}

export async function readPackageJson(dir: string): Promise<PackageJson | null> {
  const file = join(dir, "package.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(await readFile(file, "utf8")) as PackageJson;
  } catch {
    return null;
  }
}

async function readPackageLock(root: string): Promise<PackageLock | null> {
  const file = join(root, "package-lock.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(await readFile(file, "utf8")) as PackageLock;
  } catch {
    return null;
  }
}

export async function readTsConfig(root: string): Promise<TsConfig | null> {
  for (const name of ["tsconfig.json", "tsconfig.base.json"]) {
    const file = join(root, name);
    if (!existsSync(file)) continue;
    try {
      return JSON.parse(await readFile(file, "utf8")) as TsConfig;
    } catch {
      return null;
    }
  }
  return null;
}

export async function listPackages(root: string): Promise<NodePackage[]> {
  const pkg = await readPackageJson(root);
  if (!pkg) return [];
  const lock = await readPackageLock(root);
  const lockPkgs = lock?.packages ?? {};

  const out: NodePackage[] = [];
  for (const [name, spec] of Object.entries(pkg.dependencies ?? {})) {
    const resolved = lockPkgs[`node_modules/${name}`]?.version ?? spec;
    out.push({ name, version: resolved, dev: false });
  }
  for (const [name, spec] of Object.entries(pkg.devDependencies ?? {})) {
    const resolved = lockPkgs[`node_modules/${name}`]?.version ?? spec;
    out.push({ name, version: resolved, dev: true });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"];

function tryResolveAbs(abs: string): string | null {
  if (existsSync(abs) && statSync(abs).isFile()) return abs;
  for (const ext of EXTENSIONS) {
    const full = abs + ext;
    if (existsSync(full)) return full;
  }
  return null;
}

function matchPathPattern(pattern: string, specifier: string): string | null {
  if (pattern === specifier) return "";
  if (pattern.endsWith("/*") && specifier.startsWith(pattern.slice(0, -1))) {
    return specifier.slice(pattern.length - 1);
  }
  return null;
}

export function resolveImport(
  specifier: string,
  root: string,
  tsconfig: TsConfig | null,
  from?: string,
): { file: string; relative: string } | { external: true } {
  const baseUrl = tsconfig?.compilerOptions?.baseUrl;
  const absBase = baseUrl ? resolve(root, baseUrl) : root;

  // Relative import — needs `from` for context
  if (specifier.startsWith(".")) {
    if (!from) return { external: true };
    const dir = dirname(resolve(root, from));
    const abs = resolve(dir, specifier);
    const file = tryResolveAbs(abs);
    if (file) {
      const rel = file.startsWith(root + "/") ? file.slice(root.length + 1) : file;
      return { file, relative: rel };
    }
    return { external: true };
  }

  // tsconfig paths
  for (const [pattern, targets] of Object.entries(tsconfig?.compilerOptions?.paths ?? {})) {
    const capture = matchPathPattern(pattern, specifier);
    if (capture === null) continue;
    for (const target of targets) {
      const candidate = capture ? target.replace(/\*$/, capture) : target;
      const file = tryResolveAbs(resolve(absBase, candidate));
      if (file) {
        const rel = file.startsWith(root + "/") ? file.slice(root.length + 1) : file;
        return { file, relative: rel };
      }
    }
  }

  // baseUrl bare-specifier resolution
  if (baseUrl) {
    const file = tryResolveAbs(resolve(absBase, specifier));
    if (file) {
      const rel = file.startsWith(root + "/") ? file.slice(root.length + 1) : file;
      return { file, relative: rel };
    }
  }

  return { external: true };
}

export function workspaceGlobs(pkg: PackageJson): string[] {
  if (!pkg.workspaces) return [];
  return Array.isArray(pkg.workspaces) ? pkg.workspaces : (pkg.workspaces.packages ?? []);
}

// Expand simple workspace glob patterns (e.g. "packages/*", "apps/*", "*")
// Handles the common single-star suffix; skips patterns it can't expand.
export async function expandWorkspaceGlob(root: string, pattern: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  if (!pattern.includes("*")) {
    const abs = join(root, pattern);
    if (existsSync(abs) && statSync(abs).isDirectory()) return [abs];
    return [];
  }
  if (!pattern.endsWith("/*") && pattern !== "*") return [];
  const parentRel = pattern === "*" ? "." : pattern.slice(0, -2);
  const parentAbs = join(root, parentRel);
  if (!existsSync(parentAbs)) return [];
  try {
    const entries = await readdir(parentAbs, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => join(parentAbs, e.name));
  } catch {
    return [];
  }
}
