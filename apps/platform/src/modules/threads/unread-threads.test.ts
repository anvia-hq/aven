import { expect, test } from "bun:test";

import { nextUnread } from "./unread-threads";

test("a thread that finished while another was open becomes unread", () => {
  expect(nextUnread([], ["a"], "b", ["a", "b"])).toEqual(["a"]);
});

test("the open thread is never unread, and opening one clears it", () => {
  expect(nextUnread([], ["a"], "a", ["a"])).toEqual([]);
  expect(nextUnread(["a", "b"], [], "a", ["a", "b"])).toEqual(["b"]);
});

test("a thread that is gone is dropped", () => {
  expect(nextUnread(["a", "gone"], [], undefined, ["a"])).toEqual(["a"]);
});

test("nothing changing gives back the same list", () => {
  const unread = ["a"];
  expect(nextUnread(unread, [], "b", ["a", "b"])).toBe(unread);
});
