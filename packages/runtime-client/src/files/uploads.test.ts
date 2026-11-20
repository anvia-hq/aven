import { afterEach, describe, expect, test } from "bun:test";
import { readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { safeFileName, UploadStore } from "./uploads";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

function store() {
  const root = join(tmpdir(), `aven-uploads-test-${crypto.randomUUID()}`);
  roots.push(root);
  return new UploadStore(root);
}

describe("safeFileName", () => {
  test("keeps a plain name and makes the rest one shell-friendly path segment", () => {
    expect(safeFileName("report.pdf")).toBe("report.pdf");
    expect(safeFileName("Q3 report (final).xlsx")).toBe("Q3_report_final_.xlsx");
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("C:\\Users\\me\\deck.pptx")).toBe("deck.pptx");
    expect(safeFileName(".env")).toBe("env");
    expect(safeFileName("..")).toBe("file");
  });

  test("shortens a long name but keeps its extension", () => {
    const name = safeFileName(`${"a".repeat(300)}.docx`);
    expect(name.length).toBe(120);
    expect(name.endsWith(".docx")).toBe(true);
  });
});

describe("UploadStore", () => {
  test("writes a thread's files where the sandbox mounts them, numbering a name already taken", async () => {
    const uploads = store();
    const bytes = new TextEncoder().encode("one");
    expect(await uploads.save("t1", "notes.txt", bytes)).toBe("/uploads/notes.txt");
    expect(await uploads.save("t1", "notes.txt", new TextEncoder().encode("two"))).toBe(
      "/uploads/notes-2.txt",
    );
    expect(await uploads.save("t2", "notes.txt", bytes)).toBe("/uploads/notes.txt");

    const dir = await uploads.dir("t1");
    expect((await readdir(dir)).sort()).toEqual(["notes-2.txt", "notes.txt"]);
    expect(await Bun.file(join(dir, "notes.txt")).text()).toBe("one");
  });

  test("never takes a thread id as a path", async () => {
    await expect(store().dir("../t1")).rejects.toThrow("Invalid thread id");
  });
});

describe("UploadStore.put", () => {
  test("writes a file under the name it is given, and again when it is sent twice", async () => {
    const uploads = store();
    const first = await uploads.put("t1", "notes-1a2b.txt", new TextEncoder().encode("one"));
    const again = await uploads.put("t1", "notes-1a2b.txt", new TextEncoder().encode("one"));

    expect(again).toBe(first);
    expect(await readdir(await uploads.dir("t1"))).toEqual(["notes-1a2b.txt"]);
  });
});
