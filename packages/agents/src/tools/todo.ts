import { createTool } from "@anvia/core";
import { z } from "zod";

export const TODO_TOOL_NAME = "todo_write";

export const MAX_TODOS = 50;

const todoSchema = z.object({
  content: z.string().min(1).max(300).describe("One step, in a short imperative sentence."),
  status: z.enum(["pending", "in_progress", "completed"]),
});

export const todoInput = z.object({
  todos: z
    .array(todoSchema)
    .max(MAX_TODOS)
    .describe("The whole list, in order. It replaces the last one."),
});

const MARKS = { pending: "[ ]", in_progress: "[~]", completed: "[x]" } as const;

export function todoSummary(todos: readonly { status: string }[]) {
  const done = todos.filter((todo) => todo.status === "completed").length;

  return `${done}/${todos.length} done`;
}

export function createTodoTool() {
  return createTool({
    name: TODO_TOOL_NAME,
    description:
      "Keep a short task list for work with three or more steps, so you and the person can see where it stands. Send the whole list each time; it replaces the last one. Keep exactly one step `in_progress` while you work, and mark a step `completed` as soon as it is done and checked. Skip it for a simple request. Send an empty list to clear it.",
    inputSchema: todoInput,
    async handler({ todos }) {
      const working = todos.filter((todo) => todo.status === "in_progress").length;

      if (working > 1) throw new Error(`${working} steps are in_progress; keep one at a time`);

      if (todos.length === 0) return "Task list cleared.";

      return [
        `Task list (${todoSummary(todos)}):`,
        ...todos.map((todo) => `${MARKS[todo.status]} ${todo.content}`),
      ].join("\n");
    },
  });
}
