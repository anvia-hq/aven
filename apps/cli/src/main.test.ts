import { describe, expect, test } from "bun:test";

import { folders, logSliceFrom } from "./commands/runner";
import { runCli } from "./main";
import { version } from "./version";

describe("runCli", () => {
  test("prints version for --version, -v, and version", async () => {
    for (const argv of [["--version"], ["-v"], ["version"]]) {
      const lines: string[] = [];
      await runCli(argv, (line) => lines.push(line));
      expect(lines).toEqual([version]);
    }
  });

  test("prints usage for --help, -h, help, and no arguments", async () => {
    for (const argv of [["--help"], ["-h"], ["help"], []]) {
      const lines: string[] = [];
      await runCli(argv, (line) => lines.push(line));
      expect(lines[0]).toContain("Usage: aven <command>");
    }
  });
});

describe("runner helpers", () => {
  test("folders rejects relative paths instead of silently resolving them", () => {
    expect(() => folders("relative/path")).toThrow("--dir needs absolute folders");
    expect(folders("/tmp/a:/tmp/b")).toEqual(["/tmp/a", "/tmp/b"]);
  });

  test("logSliceFrom slices by byte offset even with multi-byte UTF-8 prefixes", () => {
    const prefix = Buffer.from("🚀 started\n", "utf8");
    const suffix = Buffer.from("runtime connected to http://localhost:8000\n", "utf8");
    const combined = Buffer.concat([prefix, suffix]);
    expect(logSliceFrom(combined, prefix.length)).toBe(
      "runtime connected to http://localhost:8000\n",
    );
  });
});
