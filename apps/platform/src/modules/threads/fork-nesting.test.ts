import { describe, expect, test } from "bun:test";

import { nestForks } from "./fork-nesting";
import type { Thread } from "./types";

const thread = (id: string, parentThreadId: string | null = null) =>
  ({ id, parentThreadId }) as Thread;
const order = (threads: Thread[]) =>
  nestForks(threads).map(({ thread: found, nested }) => `${nested ? "  " : ""}${found.id}`);

describe("nestForks", () => {
  test("puts each fork under its parent, which keeps its place", () => {
    expect(order([thread("a"), thread("a1", "a"), thread("b"), thread("a2", "a")])).toEqual([
      "a",
      "  a1",
      "  a2",
      "b",
    ]);
  });

  test("lets a fork whose parent is not listed stand on its own, where it was", () => {
    expect(order([thread("x", "gone"), thread("b")])).toEqual(["x", "b"]);
  });

  test("leaves threads with no forks as they were", () => {
    expect(order([thread("a"), thread("b")])).toEqual(["a", "b"]);
  });
});
