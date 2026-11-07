import { beforeEach, describe, expect, test } from "bun:test";

import { createEditTool, type EditableFiles } from "./edit";

let files: Map<string, string>;
let edit: ReturnType<typeof createEditTool>;

beforeEach(() => {
  files = new Map();
  const workspace: EditableFiles = {
    workdir: "/workspace",
    readTextFile: async ({ path }) => {
      const text = files.get(path);
      if (text === undefined) throw new Error(`File not found: ${path}`);
      return text;
    },
    writeTextFile: async ({ path, text }) => void files.set(path, text),
  };
  edit = createEditTool(workspace);
});

describe("edit", () => {
  test("replaces a unique string", async () => {
    files.set("a.txt", "one two three");
    expect(await edit.call({ path: "a.txt", oldString: "two", newString: "2" })).toBe(
      "Edited a.txt: 1 replacement(s)",
    );
    expect(files.get("a.txt")).toBe("one 2 three");
  });

  test("an absolute path inside the workspace names the same file", async () => {
    files.set("src/a.txt", "x");
    await edit.call({ path: "/workspace/src/a.txt", oldString: "x", newString: "y" });
    expect(files.get("src/a.txt")).toBe("y");
  });

  test("refuses a path that leaves the workspace", async () => {
    await expect(
      edit.call({ path: "../etc/passwd", oldString: "a", newString: "b" }),
    ).rejects.toThrow("inside the workspace");
    await expect(
      edit.call({ path: "/etc/passwd", oldString: "a", newString: "b" }),
    ).rejects.toThrow("inside the workspace");
  });

  test("refuses text that is missing, ambiguous or unchanged", async () => {
    files.set("a.txt", "x x");
    await expect(edit.call({ path: "a.txt", oldString: "y", newString: "z" })).rejects.toThrow(
      "not found",
    );
    await expect(edit.call({ path: "a.txt", oldString: "x", newString: "z" })).rejects.toThrow(
      "matches 2 places",
    );
    await expect(edit.call({ path: "a.txt", oldString: "x", newString: "x" })).rejects.toThrow(
      "identical",
    );
    await expect(edit.call({ path: "a.txt", oldString: "", newString: "z" })).rejects.toThrow(
      "must not be empty",
    );
    expect(files.get("a.txt")).toBe("x x");
  });

  test("replaceAll changes every occurrence, and `$` in the text is literal", async () => {
    files.set("a.txt", "x x");
    expect(
      await edit.call({ path: "a.txt", oldString: "x", newString: "$&", replaceAll: true }),
    ).toBe("Edited a.txt: 2 replacement(s)");
    expect(files.get("a.txt")).toBe("$& $&");
  });

  test("a file that does not exist is reported, not created", async () => {
    await expect(edit.call({ path: "nope.txt", oldString: "a", newString: "b" })).rejects.toThrow(
      "File not found",
    );
    expect(files.has("nope.txt")).toBe(false);
  });
});
