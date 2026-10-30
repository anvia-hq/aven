import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { listDirectory, readWorkspaceFile } from "./workspace-files";

const dirs: string[] = [];

async function workspace() {
  const base = await mkdtemp(join(tmpdir(), "aven-files-"));
  dirs.push(base);
  const root = join(base, "work");
  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, ".git"));
  await writeFile(join(root, ".git", "config"), "[core]\n");
  await writeFile(join(root, "src", "a.ts"), "export const a = 1;\n");
  await writeFile(join(root, "README.md"), "# hi\n");
  await writeFile(join(base, "outside.txt"), "secret\n");
  return { base, root };
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("browsing a workspace", () => {
  test("lists folders first, and never the repository's own folder", async () => {
    const { root } = await workspace();
    expect(await listDirectory(root, "")).toEqual([
      { name: "src", type: "directory" },
      { name: "README.md", type: "file" },
    ]);
    expect(await listDirectory(root, "src")).toEqual([{ name: "a.ts", type: "file" }]);
  });

  test("reads text, and says so for a missing file or a folder", async () => {
    const { root } = await workspace();
    expect(await readWorkspaceFile(root, "src/a.ts")).toEqual({
      kind: "text",
      text: "export const a = 1;\n",
      size: 20,
      truncated: false,
    });
    expect(await readWorkspaceFile(root, "nope.txt")).toEqual({ kind: "missing" });
    expect(await readWorkspaceFile(root, "src")).toEqual({ kind: "missing" });
  });

  test("does not follow paths or links out of the workspace, or into .git", async () => {
    const { base, root } = await workspace();
    await symlink(join(base, "outside.txt"), join(root, "link.txt"));
    await symlink(base, join(root, "up"));
    expect(await readWorkspaceFile(root, "../outside.txt")).toEqual({ kind: "missing" });
    expect(await readWorkspaceFile(root, join(base, "outside.txt"))).toEqual({ kind: "missing" });
    expect(await readWorkspaceFile(root, "link.txt")).toEqual({ kind: "missing" });
    expect(await readWorkspaceFile(root, "up/outside.txt")).toEqual({ kind: "missing" });
    expect(await listDirectory(root, "up")).toEqual([]);
    expect(await listDirectory(root, "..")).toEqual([]);
    expect(await readWorkspaceFile(root, ".git/config")).toEqual({ kind: "missing" });
    expect(await listDirectory(root, ".git")).toEqual([]);
  });

  test("calls binary files binary, and cuts a large text file", async () => {
    const { root } = await workspace();
    await writeFile(join(root, "logo.bin"), new Uint8Array([1, 0, 2]));
    expect(await readWorkspaceFile(root, "logo.bin")).toEqual({ kind: "binary", size: 3 });
    await writeFile(join(root, "big.txt"), "x".repeat(600 * 1024));
    const big = await readWorkspaceFile(root, "big.txt");
    expect(big).toMatchObject({ kind: "text", truncated: true, size: 600 * 1024 });
    expect(big.kind === "text" && big.text.length).toBe(512 * 1024);
  });
});
