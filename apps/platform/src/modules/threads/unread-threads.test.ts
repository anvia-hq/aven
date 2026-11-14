import { expect, test } from "bun:test";

import { nextUnread } from "./unread-threads";

test("a thread that is gone is dropped", () => {
  expect(nextUnread(["a", "gone"], [], undefined, ["a"])).toEqual(["a"]);
});

test("nothing changing gives back the same list", () => {
  const unread = ["a"];
  expect(nextUnread(unread, [], "b", ["a", "b"])).toBe(unread);
});
