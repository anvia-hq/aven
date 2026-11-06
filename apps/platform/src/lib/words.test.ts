import { expect, test } from "bun:test";

import { hasWords } from "./words";

test("a text has the words when every one is in it, whatever the case", () => {
  expect(hasWords("Fix the Login flow", "login fix")).toBe(true);
  expect(hasWords("Fix the login flow", "logout")).toBe(false);
  expect(hasWords("anything", undefined)).toBe(true);
});
