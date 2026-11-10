import { expect, test } from "bun:test";

import { newMentions, unopened } from "./mentioned-threads";

test("the first look at the server rings for nothing, since the mentions were there before", () => {
  expect(newMentions(null, ["a", "b"], [])).toEqual([]);
});

test("a thread that is new in the list rings once, and one already known does not", () => {
  expect(newMentions(["a"], ["a", "b"], [])).toEqual(["b"]);
  expect(newMentions(["a", "b"], ["a", "b"], [])).toEqual([]);
});

test("a mention in a thread the person has open does not ring", () => {
  expect(newMentions(["a"], ["a", "b", "c"], ["b", undefined])).toEqual(["c"]);
});

test("a thread shows as waiting until it is open, either side of a split included", () => {
  expect(unopened(["a", "b", "c"], ["a", "c"])).toEqual(["b"]);
  expect(unopened(["a"], [undefined])).toEqual(["a"]);
});
