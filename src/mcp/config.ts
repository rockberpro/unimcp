import { join } from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

export interface UnimcpConfig {
  root: string;
  allowWrites: boolean;
  docDirs: string[];
  ignoreDirs: string[];
  pluginsDisabled: string[];
}

export interface UnimcpConfigFile {
  docDirs?: string[];
  ignoreDirs?: string[];
  pluginsDisabled?: string[];
}

const DEFAULT_DOC_DIRS = ["docs", ".claude/rules", ".cursor/rules"];
const DEFAULT_IGNORE_DIRS = ["node_modules", ".git", "vendor", "__pycache__", ".venv", "dist", "build"];

export interface CliFlags {
  root?: string;
  allowWrites?: boolean;
  configPath?: string;
}

export async function loadConfig(flags: CliFlags): Promise<UnimcpConfig> {
  const root = flags.root ?? process.env.MCP_ROOT ?? process.cwd();
  const configPath = flags.configPath ?? join(root, "unimcp.config.json");

  let file: UnimcpConfigFile = {};
  if (existsSync(configPath)) {
    try {
      file = JSON.parse(await readFile(configPath, "utf8")) as UnimcpConfigFile;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse ${configPath}: ${msg}`);
    }
  }

  return {
    root,
    allowWrites: flags.allowWrites ?? false,
    docDirs: file.docDirs ?? DEFAULT_DOC_DIRS,
    ignoreDirs: file.ignoreDirs ?? DEFAULT_IGNORE_DIRS,
    pluginsDisabled: file.pluginsDisabled ?? [],
  };
}
