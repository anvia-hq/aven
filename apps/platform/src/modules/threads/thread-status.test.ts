import { describe, expect, test } from "bun:test";

import { statusOfPair, threadStatus } from "./thread-status";

const nothing = { mentioned: new Set<string>(), unread: new Set<string>() };

describe("threadStatus", () => {
  test("asks for attention when the agent waits on an answer", () => {
    expect(threadStatus({ id: "a", awaitingAnswer: true }, nothing)).toBe("attention");
  });

  test("asks for attention when someone mentioned the person", () => {
    expect(threadStatus({ id: "a" }, { ...nothing, mentioned: new Set(["a"]) })).toBe("attention");
  });

  test("asks for attention when its last run failed", () => {
    expect(threadStatus({ id: "a", awaitingAnswer: false, lastError: "401 boom" }, nothing)).toBe(
      "attention",
    );
  });

  test("a cleared error and no other signal stays quiet", () => {
    expect(threadStatus({ id: "a", awaitingAnswer: false, lastError: null }, nothing)).toBeNull();
  });

  test("is finished when it ran and was not opened", () => {
    expect(
      threadStatus({ id: "a", awaitingAnswer: false }, { ...nothing, unread: new Set(["a"]) }),
    ).toBe("finished");
  });

  test("attention wins over finished", () => {
    const signals = { mentioned: new Set(["a"]), unread: new Set(["a"]) };
    expect(threadStatus({ id: "a", awaitingAnswer: false }, signals)).toBe("attention");
  });

  test("a failed run that was not open is still attention, not finished", () => {
    const signals = { mentioned: new Set<string>(), unread: new Set(["a"]) };
    expect(threadStatus({ id: "a", awaitingAnswer: false, lastError: "boom" }, signals)).toBe(
      "attention",
    );
  });

  test("is quiet for an idle thread nobody mentioned", () => {
    expect(threadStatus({ id: "a", awaitingAnswer: false }, nothing)).toBeNull();
  });
});

describe("statusOfPair", () => {
  test("the other side's attention marks the row", () => {
    expect(statusOfPair("finished", "attention")).toBe("attention");
  });

  test("either side finishing marks the row", () => {
    expect(statusOfPair(null, "finished")).toBe("finished");
  });

  test("a pair with nothing to say stays quiet", () => {
    expect(statusOfPair(null, null)).toBeNull();
  });
});
