import type { AnyTool } from "@anvia/core";
import { errorMessage } from "@aven/agents/values";

export function withPlacedUploads(
  tools: readonly AnyTool[],
  note: () => string | undefined,
): AnyTool[] {
  return tools.map((tool) => ({
    name: tool.name,
    requiresApproval: tool.requiresApproval,
    definition: (prompt) => tool.definition(prompt),
    parseInput: tool.parseInput && ((args) => tool.parseInput!(args)),
    call: async (args, context) => {
      try {
        const result = await tool.call(args, context);
        return told(result, note());
      } catch (error) {
        const extra = note();
        if (!extra) throw error;
        throw new Error(`${errorMessage(error)}\n${extra}`);
      }
    },
  }));
}

const RICH_TOOL_OUTPUT = Symbol.for("anvia.tool-output.content");

function told<T>(result: T, extra: string | undefined): T {
  if (!extra) return result;
  if (typeof result === "string") return `${result}\n${extra}` as T;
  if (typeof result === "object" && result !== null) {
    const content = richContent(result);
    if (content) {
      return { ...result, content: [...content, { type: "text", text: extra }] } as T;
    }
    if (!Array.isArray(result)) return { ...result, uploads: extra };
  }
  const shown = typeof result === "object" ? JSON.stringify(result) : String(result);
  return `${shown}\n${extra}` as T;
}

function richContent(result: object): readonly unknown[] | undefined {
  if (Object.getOwnPropertyDescriptor(result, RICH_TOOL_OUTPUT)?.value !== true) return;
  if (!("content" in result) || !Array.isArray(result.content)) return;
  return result.content;
}
