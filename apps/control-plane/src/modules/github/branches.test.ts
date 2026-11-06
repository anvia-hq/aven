import { expect, test } from "bun:test";

import { mapLimit, pullsByBranch } from "./branches";

test("runs the calls a few at a time and answers in the order of the items", async () => {
  let running = 0;
  let most = 0;
  const results = await mapLimit([30, 5, 20, 1, 10], 2, async (ms, index) => {
    running++;
    most = Math.max(most, running);
    await new Promise((resolve) => setTimeout(resolve, ms));
    running--;
    return index;
  });
  expect(results).toEqual([0, 1, 2, 3, 4]);
  expect(most).toBe(2);
});

test("does nothing for nothing", async () => {
  expect(await mapLimit([], 3, async () => 1)).toEqual([]);
});

test("a branch has the open pull request from this repository, never one from a fork", () => {
  const found = pullsByBranch(
    [
      { number: 5, title: "From a fork", head: { ref: "main", repo: { full_name: "bob/web" } } },
      {
        number: 4,
        title: "Login",
        head: { ref: "feature/login", repo: { full_name: "acme/web" } },
      },
      {
        number: 3,
        title: "Older, same branch",
        head: { ref: "feature/login", repo: { full_name: "acme/web" } },
      },
      { number: 2, title: "Gone fork", head: { ref: "x", repo: null } },
    ],
    "acme/web",
  );
  expect([...found]).toEqual([["feature/login", { number: 4, title: "Login" }]]);
});
