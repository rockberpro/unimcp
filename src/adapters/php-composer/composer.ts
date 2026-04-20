import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface ComposerJson {
  name?: string;
  autoload?: ComposerAutoload;
  "autoload-dev"?: ComposerAutoload;
}

export interface ComposerAutoload {
  "psr-4"?: Record<string, string | string[]>;
  "psr-0"?: Record<string, string | string[]>;
  classmap?: string[];
  files?: string[];
}

export interface ComposerLockPackage {
  name: string;
  version: string;
}

export interface ComposerLock {
  packages?: ComposerLockPackage[];
  "packages-dev"?: ComposerLockPackage[];
}

export async function readComposerJson(root: string): Promise<ComposerJson | null> {
  const file = join(root, "composer.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(await readFile(file, "utf8")) as ComposerJson;
  } catch {
    return null;
  }
}

export async function readComposerLock(root: string): Promise<ComposerLock | null> {
  const file = join(root, "composer.lock");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(await readFile(file, "utf8")) as ComposerLock;
  } catch {
    return null;
  }
}

export interface Psr4Root {
  namespacePrefix: string;
  dir: string;
}

export function flattenPsr4(autoload: ComposerAutoload | undefined): Psr4Root[] {
  if (!autoload?.["psr-4"]) return [];
  const out: Psr4Root[] = [];
  for (const [prefix, dirs] of Object.entries(autoload["psr-4"])) {
    const list = Array.isArray(dirs) ? dirs : [dirs];
    for (const dir of list) {
      out.push({ namespacePrefix: prefix, dir: dir.replace(/[\\/]+$/, "") });
    }
  }
  return out;
}

export function fileToFqcn(relPath: string, root: Psr4Root): string | null {
  const dirNorm = root.dir === "" ? "" : root.dir.replace(/\\/g, "/") + "/";
  const relNorm = relPath.replace(/\\/g, "/");
  if (dirNorm && !relNorm.startsWith(dirNorm)) return null;
  const inside = dirNorm ? relNorm.slice(dirNorm.length) : relNorm;
  if (!inside.endsWith(".php")) return null;
  const noExt = inside.slice(0, -".php".length);
  const segments = noExt.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  const sub = segments.join("\\");
  const prefix = root.namespacePrefix.replace(/\\$/, "");
  return prefix === "" ? sub : `${prefix}\\${sub}`;
}

export function fqcnToRelativeFile(fqcn: string, root: Psr4Root): string | null {
  const prefix = root.namespacePrefix.replace(/\\$/, "");
  const fqcnNorm = fqcn.replace(/^\\/, "");
  if (prefix !== "" && !fqcnNorm.startsWith(prefix + "\\") && fqcnNorm !== prefix) return null;
  const remainder = prefix === "" ? fqcnNorm : fqcnNorm.slice(prefix.length + 1);
  if (!remainder) return null;
  const sub = remainder.replace(/\\/g, "/") + ".php";
  return root.dir === "" ? sub : `${root.dir}/${sub}`;
}
