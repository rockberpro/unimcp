import { resolve, relative, sep } from "node:path";

export interface Jail {
  root: string;
  assertInside: (path: string) => string;
  relative: (path: string) => string;
}

export function createJail(rootPath: string): Jail {
  const root = resolve(rootPath);
  return {
    root,
    assertInside(path: string): string {
      const target = resolve(root, path);
      const rel = relative(root, target);
      if (rel === "" ) return target;
      if (rel.startsWith("..") || (sep === "\\" ? /^[a-z]:/i.test(rel) : rel.startsWith("/"))) {
        throw new Error(`Path is outside the allowed root: ${root}`);
      }
      return target;
    },
    relative(path: string): string {
      const abs = resolve(path);
      const rel = relative(root, abs);
      return rel === "" ? "." : rel.split(sep).join("/");
    },
  };
}
