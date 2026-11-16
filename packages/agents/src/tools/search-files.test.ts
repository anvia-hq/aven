import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { localFiles } from "../testing/local-files";
import { createFindTool } from "./find";
import { createGlobTool } from "./glob";
import { createGrepTool } from "./grep";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "search-files-"));
  mkdirSync(join(dir, "src/deep"), { recursive: true });
  mkdirSync(join(dir, "node_modules/pkg"), { recursive: true });
  mkdirSync(join(dir, ".git"));
  writeFileSync(join(dir, "src/app.ts"), "export const Alpha = 1;\nexport const beta = 2;\n");
  writeFileSync(join(dir, "src/app.test.ts"), "import { Alpha } from './app';\n");
  writeFileSync(join(dir, "src/deep/util.ts"), "export function alpha() {}\n");
  writeFileSync(join(dir, "README.md"), "Alpha is documented here.\n");
  writeFileSync(join(dir, "node_modules/pkg/index.ts"), "Alpha in a dependency\n");
  writeFileSync(join(dir, ".git/config"), "Alpha in git\n");
  writeFileSync(join(dir, "blob.bin"), Buffer.from([0, 1, 2, 65, 108, 112, 104, 97, 0]));
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const files = () => localFiles(dir);

describe("grep", () => {
  test("finds matching lines with path and line number, skipping dependencies, git and binaries", async () => {
    const output = await createGrepTool(files()).call({ pattern: "Alpha" });
    expect(output.split("\n").sort()).toEqual([
      "README.md:1:Alpha is documented here.",
      "src/app.test.ts:1:import { Alpha } from './app';",
      "src/app.ts:1:export const Alpha = 1;",
    ]);
  });

  test("ignoreCase, include and path narrow the search", async () => {
    const output = await createGrepTool(files()).call({
      pattern: "alpha",
      ignoreCase: true,
      include: "*.ts",
      path: "src/deep",
    });
    expect(output).toBe("src/deep/util.ts:1:export function alpha() {}");
  });

  test("a fixed pattern is plain text, so regex characters do not need escaping", async () => {
    writeFileSync(join(dir, "regex.txt"), "a(b)*c\n");
    expect(
      await createGrepTool(files()).call({ pattern: "(b)*", fixed: true, path: "regex.txt" }),
    ).toBe("regex.txt:1:a(b)*c");
  });

  test("a pattern that starts with a dash is a pattern, not an option", async () => {
    writeFileSync(join(dir, "dash.txt"), "run --force now\n");
    expect(await createGrepTool(files()).call({ pattern: "--force", path: "dash.txt" })).toBe(
      "dash.txt:1:run --force now",
    );
  });

  test("says so when nothing matches", async () => {
    expect(await createGrepTool(files()).call({ pattern: "zzzzqqq" })).toBe("No matches.");
  });

  test("an invalid regular expression is an error, not an empty result", async () => {
    await expect(createGrepTool(files()).call({ pattern: "(" })).rejects.toThrow();
  });

  test("stops at maxResults and says how many lines were left out", async () => {
    writeFileSync(join(dir, "many.txt"), Array.from({ length: 10 }, () => "needle").join("\n"));
    const output = await createGrepTool(files()).call({
      pattern: "needle",
      path: "many.txt",
      maxResults: 3,
    });
    const lines = output.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[3]).toContain("7 more lines not shown");
  });

  test("cuts a very long line", async () => {
    writeFileSync(join(dir, "long.txt"), `needle${"x".repeat(1000)}\n`);
    const output = await createGrepTool(files()).call({ pattern: "needle", path: "long.txt" });
    expect(output.length).toBeLessThan(400);
    expect(output).toContain("[line cut]");
  });

  test("an absolute path inside the workspace names the same folder", async () => {
    const output = await createGrepTool(files()).call({
      pattern: "alpha",
      path: join(dir, "src/deep"),
    });
    expect(output).toBe("src/deep/util.ts:1:export function alpha() {}");
  });
});

describe("find", () => {
  test("plain text matches anywhere in the name, ignoring case", async () => {
    expect(await createFindTool(files()).call({ name: "APP" })).toBe("src/app.test.ts\nsrc/app.ts");
  });

  test("wildcards match the whole name", async () => {
    expect(await createFindTool(files()).call({ name: "*.md" })).toBe("README.md");
    expect(await createFindTool(files()).call({ name: "app.te*" })).toBe("src/app.test.ts");
  });

  test("a name with a slash is matched against the path", async () => {
    expect(await createFindTool(files()).call({ name: "deep/util" })).toBe("src/deep/util.ts");
  });

  test("finds folders when asked and never lists dependencies or git", async () => {
    expect(await createFindTool(files()).call({ name: "deep", type: "directory" })).toBe(
      "src/deep",
    );
    expect(await createFindTool(files()).call({ name: "index" })).toBe("Nothing found.");
    expect(await createFindTool(files()).call({ name: "config" })).toBe("Nothing found.");
  });

  test("maxDepth keeps the search near the top", async () => {
    expect(await createFindTool(files()).call({ name: "ts", maxDepth: 1 })).toBe("Nothing found.");
    expect(await createFindTool(files()).call({ name: "util", maxDepth: 3 })).toBe(
      "src/deep/util.ts",
    );
  });

  test("a folder that does not exist is an error", async () => {
    await expect(createFindTool(files()).call({ name: "x", path: "nope" })).rejects.toThrow();
  });
});

describe("glob", () => {
  test("matches a path pattern", async () => {
    expect(await createGlobTool(files()).call({ pattern: "src/**/*.ts" })).toBe(
      "src/app.test.ts\nsrc/app.ts\nsrc/deep/util.ts",
    );
    expect(await createGlobTool(files()).call({ pattern: "**/*.test.ts" })).toBe("src/app.test.ts");
  });

  test("paths are relative to the folder searched", async () => {
    expect(await createGlobTool(files()).call({ pattern: "*.ts", path: "src" })).toBe(
      "app.test.ts\napp.ts",
    );
  });

  test("never matches inside node_modules", async () => {
    expect(await createGlobTool(files()).call({ pattern: "**/index.ts" })).toBe("No files match.");
  });

  test("limits and says how many were left out", async () => {
    const output = await createGlobTool(files()).call({ pattern: "**/*.ts", maxResults: 1 });
    expect(output.split("\n")).toEqual([
      "src/app.test.ts",
      "[2 more not shown; narrow the search]",
    ]);
  });
});
