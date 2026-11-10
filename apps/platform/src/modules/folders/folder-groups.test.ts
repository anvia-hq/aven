import { describe, expect, test } from "bun:test";

import type { Thread } from "../threads/types";
import { groupThreads, rootOf } from "./folder-groups";
import type { Folder } from "./types";

const thread = (id: string, parentThreadId: string | null = null) =>
  ({ id, parentThreadId }) as Thread;
const folder = (id: string, threadIds: string[]): Folder => ({
  id,
  name: id,
  open: true,
  threadIds,
});
const ids = (threads: Thread[]) => threads.map((each) => each.id);

describe("groupThreads", () => {
  test("files each thread in its folder and leaves the rest unfiled, in order", () => {
    const { groups, unfiled } = groupThreads(
      [thread("a"), thread("b"), thread("c")],
      [folder("f", ["c", "a"])],
    );
    expect(ids(groups[0]!.threads)).toEqual(["a", "c"]);
    expect(ids(unfiled)).toEqual(["b"]);
  });

  test("a fork follows its parent's folder", () => {
    const { groups, unfiled } = groupThreads(
      [thread("a"), thread("a1", "a"), thread("b")],
      [folder("f", ["a"])],
    );
    expect(ids(groups[0]!.threads)).toEqual(["a", "a1"]);
    expect(ids(unfiled)).toEqual(["b"]);
  });

  test("a fork whose parent is not listed is filed by itself", () => {
    const { groups } = groupThreads([thread("x", "gone")], [folder("f", ["x"])]);
    expect(ids(groups[0]!.threads)).toEqual(["x"]);
  });

  test("ignores filed threads that are not listed", () => {
    const { groups } = groupThreads([thread("a")], [folder("f", ["archived"])]);
    expect(groups[0]!.threads).toEqual([]);
  });
});

describe("rootOf", () => {
  test("walks up to the first ancestor", () => {
    const all = [thread("a"), thread("b", "a"), thread("c", "b")];
    expect(rootOf(all[2]!, all).id).toBe("a");
  });

  test("survives a loop", () => {
    const all = [thread("a", "b"), thread("b", "a")];
    expect(["a", "b"]).toContain(rootOf(all[0]!, all).id);
  });
});
