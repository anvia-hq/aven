import { expect, test } from "bun:test";

import { finishedThreads } from "./finished-threads";
import type { Thread } from "./types";

const thread = (id: string, running: boolean) => ({ id, running }) as Thread;

test("one still running, one never running and one not seen before have not", () => {
  const before = new Map([
    ["a", true],
    ["b", false],
  ]);
  expect(
    finishedThreads(before, [thread("a", true), thread("b", false), thread("c", false)]),
  ).toEqual([]);
});
