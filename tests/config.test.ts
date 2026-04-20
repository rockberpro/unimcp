import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "../src/mcp/config";

describe("loadConfig", () => {
  test("returns defaults when no config file is present", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-cfg-"));
    const cfg = await loadConfig({ root });
    expect(cfg.root).toBe(root);
    expect(cfg.allowWrites).toBe(false);
    expect(cfg.docDirs).toContain("docs");
    expect(cfg.ignoreDirs).toContain("node_modules");
    expect(cfg.pluginsDisabled).toEqual([]);
  });

  test("--allow-writes flips the flag", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-cfg-"));
    const cfg = await loadConfig({ root, allowWrites: true });
    expect(cfg.allowWrites).toBe(true);
  });

  test("merges values from unimcp.config.json", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-cfg-"));
    await writeFile(
      join(root, "unimcp.config.json"),
      JSON.stringify({ docDirs: ["wiki"], pluginsDisabled: ["php-composer"] }),
    );
    const cfg = await loadConfig({ root });
    expect(cfg.docDirs).toEqual(["wiki"]);
    expect(cfg.pluginsDisabled).toEqual(["php-composer"]);
    expect(cfg.ignoreDirs).toContain("node_modules");
  });

  test("throws a descriptive error on invalid JSON", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-cfg-"));
    await writeFile(join(root, "unimcp.config.json"), "{ not valid json");
    await expect(loadConfig({ root })).rejects.toThrow(/Failed to parse/);
  });

  test("honors a custom configPath", async () => {
    const root = mkdtempSync(join(tmpdir(), "unimcp-cfg-"));
    const customPath = join(root, "custom.json");
    await writeFile(customPath, JSON.stringify({ ignoreDirs: ["only-this"] }));
    const cfg = await loadConfig({ root, configPath: customPath });
    expect(cfg.ignoreDirs).toEqual(["only-this"]);
  });
});
