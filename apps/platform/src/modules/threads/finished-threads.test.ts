import { expect, test } from "bun:test";

import { finishedThreads } from "./finished-threads";
import type { Thread } from "./types";

const thread = (id: string, running: boolean) => ({ id, running }) as Thread;

test("a thread that was running and is not any more has finished", () => {
  const before = new Map([["a", true]]);
  expect(finishedThreads(before, [thread("a", false)]).map(({ id }) => id)).toEqual(["a"]);
});

test("one still running, one never running and one not seen before have not", () => {
  const before = new Map([
    ["a", true],
    ["b", false],
  ]);
  expect(
    finishedThreads(before, [thread("a", true), thread("b", false), thread("c", false)]),
  ).toEqual([]);
});
