import { describe, expect, test } from "bun:test";

import { partnerOf, sideOf, splitWith, withoutPair, withPair } from "./split";

describe("dropping a thread next to the open one", () => {
  test("the half of the page it is dropped on is its side", () => {
    expect(sideOf(100, 0, 1000)).toBe("left");
    expect(sideOf(600, 0, 1000)).toBe("right");
    expect(sideOf(600, 300, 1000)).toBe("left");
  });

  test("on a single thread, the dropped one opens beside it on that side", () => {
    expect(splitWith("b", "right", "a", undefined)).toEqual({ threadId: "a", split: "b" });
    expect(splitWith("b", "left", "a", undefined)).toEqual({ threadId: "b", split: "a" });
  });

  test("the open thread dropped on its own page changes nothing", () => {
    expect(splitWith("a", "right", "a", undefined)).toBeUndefined();
    expect(splitWith("a", "left", "a", undefined)).toBeUndefined();
  });

  test("with two open, a drop replaces the pane on that side", () => {
    expect(splitWith("c", "right", "a", "b")).toEqual({ threadId: "a", split: "c" });
    expect(splitWith("c", "left", "a", "b")).toEqual({ threadId: "c", split: "b" });
  });

  test("a thread already open on the other side swaps the panes", () => {
    expect(splitWith("b", "left", "a", "b")).toEqual({ threadId: "b", split: "a" });
    expect(splitWith("a", "right", "a", "b")).toEqual({ threadId: "b", split: "a" });
  });
});

describe("the pairs of threads kept for the sidebar", () => {
  test("a thread is in one pair: a new one replaces any that holds either thread", () => {
    expect(withPair([["a", "b"]], "c", "d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(
      withPair(
        [
          ["a", "b"],
          ["c", "d"],
        ],
        "b",
        "c",
      ),
    ).toEqual([["b", "c"]]);
    expect(withPair([["a", "b"]], "a", "b")).toEqual([["a", "b"]]);
  });

  test("a pair is found from either thread and dissolved by either", () => {
    expect(partnerOf([["a", "b"]], "b")).toBe("a");
    expect(partnerOf([["a", "b"]], "c")).toBeUndefined();
    expect(
      withoutPair(
        [
          ["a", "b"],
          ["c", "d"],
        ],
        "b",
      ),
    ).toEqual([["c", "d"]]);
  });
});
