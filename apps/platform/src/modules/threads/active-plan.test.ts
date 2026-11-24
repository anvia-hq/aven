import { describe, expect, test } from "bun:test";

import { activePlanOf } from "./active-plan";
import type { ChatMessage, ToolPart } from "./types";

const todo = (output: string, id = "td1"): ToolPart => ({
  id,
  name: "todo_write",
  target: "",
  status: "done",
  output,
});

const user = (text: string, id = "u1"): ChatMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
});

const assistant = (parts: ChatMessage["parts"], id = "a1"): ChatMessage => ({
  id,
  role: "assistant",
  parts,
});

describe("activePlanOf", () => {
  test("returns null when there is no plan in the latest turn", () => {
    expect(activePlanOf([], false)).toBeNull();
    expect(activePlanOf([user("hi"), assistant([{ type: "text", text: "hello" }])], false)).toBe(
      null,
    );
  });

  test("shows an active plan while running and hides it once finished with all tasks completed", () => {
    const doneMessages = [
      user("ship it"),
      assistant([
        {
          type: "tool",
          tool: todo("Task list (2/2 done):\n[x] Run tests\n[x] Push branch"),
        },
      ]),
    ];

    expect(activePlanOf(doneMessages, true)).toEqual([
      { status: "completed", content: "Run tests" },
      { status: "completed", content: "Push branch" },
    ]);
    expect(activePlanOf(doneMessages, false)).toBeNull();
  });

  test("keeps an incomplete plan visible when the run stops mid-plan", () => {
    const partialMessages = [
      user("ship it"),
      assistant([
        {
          type: "tool",
          tool: todo("Task list (1/2 done):\n[x] Run tests\n[~] Watch checks"),
        },
      ]),
    ];

    expect(activePlanOf(partialMessages, false)).toEqual([
      { status: "completed", content: "Run tests" },
      { status: "in_progress", content: "Watch checks" },
    ]);
  });

  test("hides the plan when cleared in a subsequent assistant message of the same turn", () => {
    const clearedMessages = [
      user("ship it"),
      assistant([{ type: "tool", tool: todo("Task list:\n[~] Run tests", "td1") }], "a1"),
      assistant([{ type: "tool", tool: todo("Task list cleared.", "td2") }], "a2"),
    ];

    expect(activePlanOf(clearedMessages, true)).toBeNull();
  });

  test("keeps the plan across background-process system notes in the same turn", () => {
    const messages = [
      user("ship it", "u1"),
      assistant(
        [{ type: "tool", tool: todo("Task list:\n[x] Push branch\n[~] Watch checks") }],
        "a1",
      ),
      user("[process] watcher exited with code 0", "sys1"),
      assistant([{ type: "text", text: "Checking result…" }], "a2"),
    ];

    expect(activePlanOf(messages, true)).toEqual([
      { status: "completed", content: "Push branch" },
      { status: "in_progress", content: "Watch checks" },
    ]);
  });

  test("drops an earlier turn's plan once a new user message or pending send starts a new turn", () => {
    const prevTurn = [
      user("first request", "u1"),
      assistant([{ type: "tool", tool: todo("Task list:\n[x] Step 1\n[~] Step 2") }], "a1"),
    ];

    expect(activePlanOf(prevTurn, false, true)).toBeNull();
    expect(
      activePlanOf([...prevTurn, user("new unrelated request", "u2"), assistant([], "a2")], true),
    ).toBeNull();
  });
});
