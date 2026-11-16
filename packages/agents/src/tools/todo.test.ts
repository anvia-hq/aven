import { describe, expect, test } from "bun:test";

import { createTodoTool } from "./todo";

describe("todo_write", () => {
  test("shows the list as a checklist with how far it is", async () => {
    const output = await createTodoTool().call({
      todos: [
        { content: "Read the code", status: "completed" },
        { content: "Write the fix", status: "in_progress" },
        { content: "Run the tests", status: "pending" },
      ],
    });
    expect(output).toBe(
      "Task list (1/3 done):\n[x] Read the code\n[~] Write the fix\n[ ] Run the tests",
    );
  });

  test("more than one step in progress is refused", async () => {
    await expect(
      createTodoTool().call({
        todos: [
          { content: "a", status: "in_progress" },
          { content: "b", status: "in_progress" },
        ],
      }),
    ).rejects.toThrow("2 steps are in_progress");
  });

  test("an empty list clears it", async () => {
    expect(await createTodoTool().call({ todos: [] })).toBe("Task list cleared.");
  });
});
