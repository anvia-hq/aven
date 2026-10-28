import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createEditTool } from "./edit";
import { createReadTool } from "./read";
import { createWriteTool } from "./write";

let root: string;
let outside: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aven-root-"));
  outside = await mkdtemp(join(tmpdir(), "aven-outside-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

// Tool calls may be sync or async; this keeps assertions uniform.
const run = async <T>(call: () => T | Promise<T>) => call();

describe("read", () => {
  test("numbers lines and reports the range", async () => {
    await writeFile(join(root, "a.txt"), "one\ntwo\nthree\n");
    const read = createReadTool({ root });
    expect(await read.call({ path: "a.txt" })).toBe(
      "Read file a.txt, lines 1-3 of 3\n1: one\n2: two\n3: three",
    );
  });

  test("pages with offset and limit and says where to continue", async () => {
    await writeFile(join(root, "a.txt"), "1\n2\n3\n4\n5\n");
    const read = createReadTool({ root });
    const out = await read.call({ path: "a.txt", offset: 2, limit: 2 });
    expect(out).toContain("lines 2-3 of 5");
    expect(out).toContain("2: 2\n3: 3");
    expect(out).toContain("Continue reading with offset: 4");
  });

  test("lists directories with trailing slashes on subdirectories", async () => {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "b.ts"), "");
    const read = createReadTool({ root });
    expect(await read.call({ path: "." })).toBe("Read directory ., entries 1-2 of 2\nb.ts\nsrc/");
  });

  test("rejects missing and binary files", async () => {
    await writeFile(join(root, "bin"), new Uint8Array([1, 0, 2]));
    const read = createReadTool({ root });
    await expect(run(() => read.call({ path: "nope.txt" }))).rejects.toThrow("File not found");
    await expect(run(() => read.call({ path: "bin" }))).rejects.toThrow("binary");
  });

  test("refuses paths outside the root, including through symlinks", async () => {
    await writeFile(join(outside, "secret.txt"), "secret");
    await symlink(outside, join(root, "link"));
    const read = createReadTool({ root });
    await expect(run(() => read.call({ path: "../secret.txt" }))).rejects.toThrow("outside");
    await expect(run(() => read.call({ path: join(outside, "secret.txt") }))).rejects.toThrow(
      "outside",
    );
    await expect(run(() => read.call({ path: "link/secret.txt" }))).rejects.toThrow("outside");
  });
});

describe("write", () => {
  test("creates parent directories, then reports overwrites", async () => {
    const write = createWriteTool({ root });
    expect(await write.call({ path: "deep/er/file.txt", content: "hi" })).toBe(
      "Created file successfully: deep/er/file.txt",
    );
    expect(await readFile(join(root, "deep/er/file.txt"), "utf8")).toBe("hi");
    expect(await write.call({ path: "deep/er/file.txt", content: "bye" })).toBe(
      "Wrote file successfully: deep/er/file.txt",
    );
    expect(await readFile(join(root, "deep/er/file.txt"), "utf8")).toBe("bye");
  });

  test("refuses to write outside the root", async () => {
    const write = createWriteTool({ root });
    await expect(run(() => write.call({ path: "../evil.txt", content: "x" }))).rejects.toThrow(
      "outside",
    );
  });
});

describe("edit", () => {
  const edit = () => createEditTool({ root });

  test("replaces a unique match", async () => {
    await writeFile(join(root, "f.ts"), "const a = 1;\nconst b = 2;\n");
    await edit().call({ path: "f.ts", oldString: "a = 1", newString: "a = 10" });
    expect(await readFile(join(root, "f.ts"), "utf8")).toBe("const a = 10;\nconst b = 2;\n");
  });

  test("fails on zero matches and on multiple matches without replaceAll", async () => {
    await writeFile(join(root, "f.txt"), "x x x");
    await expect(
      run(() => edit().call({ path: "f.txt", oldString: "y", newString: "z" })),
    ).rejects.toThrow("not found");
    await expect(
      run(() => edit().call({ path: "f.txt", oldString: "x", newString: "z" })),
    ).rejects.toThrow("matches 3 places");
    expect(await readFile(join(root, "f.txt"), "utf8")).toBe("x x x");
  });

  test("replaceAll replaces every occurrence", async () => {
    await writeFile(join(root, "f.txt"), "x x x");
    expect(
      await edit().call({ path: "f.txt", oldString: "x", newString: "y", replaceAll: true }),
    ).toBe("Edited f.txt: 3 replacement(s)");
    expect(await readFile(join(root, "f.txt"), "utf8")).toBe("y y y");
  });

  test("inserts $ sequences literally and rejects no-op edits", async () => {
    await writeFile(join(root, "f.txt"), "price: X");
    await edit().call({ path: "f.txt", oldString: "X", newString: "$&$1" });
    expect(await readFile(join(root, "f.txt"), "utf8")).toBe("price: $&$1");
    await expect(
      run(() => edit().call({ path: "f.txt", oldString: "a", newString: "a" })),
    ).rejects.toThrow("identical");
  });
});
