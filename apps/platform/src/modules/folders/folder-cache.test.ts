import { describe, expect, test } from "bun:test";

import {
  isTempId,
  newTempId,
  withFolder,
  withMove,
  withOpen,
  withoutFolder,
  withRename,
} from "./folder-cache";
import type { Folder } from "./types";

const folder = (id: string, threadIds: string[] = [], open = true): Folder => ({
  id,
  name: id,
  open,
  threadIds,
});

describe("folder cache patches", () => {
  test("a new folder goes first, open, and takes its thread from the old folder", () => {
    const tempId = newTempId();
    const next = withFolder([folder("a", ["t"])], { tempId, name: "New", threadId: "t" });
    expect(next.map((each) => each.id)).toEqual([tempId, "a"]);
    expect(next[0]).toMatchObject({ name: "New", open: true, threadIds: ["t"] });
    expect(next[1]!.threadIds).toEqual([]);
    expect(isTempId(tempId)).toBe(true);
    expect(isTempId("a")).toBe(false);
  });

  test("renames, opens and deletes one folder", () => {
    const start = [folder("a"), folder("b")];
    expect(withRename(start, { id: "a", name: "X" })[0]!.name).toBe("X");
    expect(withOpen(start, { id: "b", open: false })[1]!.open).toBe(false);
    expect(withoutFolder(start, "a").map((each) => each.id)).toEqual(["b"]);
  });

  test("moves a thread into one folder only, or out of all", () => {
    const start = [folder("a", ["t"]), folder("b")];
    const moved = withMove(start, { threadId: "t", folderId: "b" });
    expect(moved.map((each) => each.threadIds)).toEqual([[], ["t"]]);
    const out = withMove(moved, { threadId: "t", folderId: null });
    expect(out.map((each) => each.threadIds)).toEqual([[], []]);
  });
});
