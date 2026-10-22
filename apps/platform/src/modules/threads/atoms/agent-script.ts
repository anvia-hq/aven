import type { ReplyStep, ToolCall } from "../types";

export const newId = () => Math.random().toString(36).slice(2, 10);

const makeTool = (call: Omit<ToolCall, "id" | "status">): ToolCall => ({
  id: newId(),
  status: "running",
  ...call,
});

// Scripted fake agent: a plan, a few tool calls and a summary.
export function buildReply(prompt: string): ReplyStep[] {
  const short = prompt.length > 60 ? `${prompt.slice(0, 57)}...` : prompt;
  return [
    { type: "text", text: `Got it: "${short}". Let me look around the codebase first.` },
    {
      type: "tool",
      tool: makeTool({ name: "search", target: "relevant files" }),
      result: { output: "4 matches in 3 files" },
    },
    {
      type: "tool",
      tool: makeTool({ name: "read", target: "apps/control-plane/src/index.ts" }),
      result: {},
    },
    { type: "text", text: "I have enough context. Making the change now." },
    {
      type: "tool",
      tool: makeTool({ name: "edit", target: "apps/control-plane/src/index.ts" }),
      result: {
        diff: [
          { type: "ctx", text: "const app = new Elysia()" },
          { type: "del", text: '  .get("/health", () => ({ status: "ok" }))' },
          {
            type: "add",
            text: '  .get("/health", () => ({ status: "ok", uptime: process.uptime() }))',
          },
        ],
      },
    },
    {
      type: "tool",
      tool: makeTool({ name: "bash", target: "bun run typecheck" }),
      result: { output: "@aven/control-plane typecheck: Exited with code 0" },
    },
    { type: "text", text: "All done. This is a mock reply, so nothing was actually changed." },
  ];
}
