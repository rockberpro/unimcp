#!/usr/bin/env node
import { startServer } from "./server.js";
import type { CliFlags } from "./config.js";

function parseArgs(argv: string[]): CliFlags & { help?: boolean } {
  const flags: CliFlags & { help?: boolean } = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") flags.help = true;
    else if (arg === "--allow-writes") flags.allowWrites = true;
    else if (arg === "--root") flags.root = argv[++i];
    else if (arg.startsWith("--root=")) flags.root = arg.slice("--root=".length);
    else if (arg === "--config") flags.configPath = argv[++i];
    else if (arg.startsWith("--config=")) flags.configPath = arg.slice("--config=".length);
  }
  return flags;
}

const HELP = `unimcp — generic codebase-awareness MCP server

Usage:
  unimcp [options]

Options:
  --root <path>       Project root the server is jailed to (default: $MCP_ROOT or cwd)
  --allow-writes      Enable write_file / delete_file / move_file / create_directory tools
  --config <path>     Path to unimcp.config.json (default: <root>/unimcp.config.json)
  -h, --help          Show this help

The server speaks MCP over stdio. Wire it into your agent's MCP config.`;

const flags = parseArgs(process.argv.slice(2));
if (flags.help) {
  process.stdout.write(HELP + "\n");
  process.exit(0);
}

await startServer(flags);
