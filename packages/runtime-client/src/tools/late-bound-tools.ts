import type { AnyTool } from "@anvia/core";

import { boundResult } from "./bounded-result";
import { wrapTools } from "./wrap-tools";

export function lateBoundTools(
  tools: readonly AnyTool[],
  current: () => readonly AnyTool[] | undefined,
  unavailable: (name: string) => string = (name) =>
    `The thread's sandbox is not running, so ${name} is unavailable`,
): AnyTool[] {
  return wrapTools(tools, async (tool, args, context) => {
    const live = current()?.find((candidate) => candidate.name === tool.name);

    if (!live) throw new Error(unavailable(tool.name));

    return boundResult(await live.call(args, context));
  });
}

export const boundedTools = (tools: readonly AnyTool[]) => lateBoundTools(tools, () => tools);

export function wakingTools(tools: readonly AnyTool[], wake: () => Promise<unknown>): AnyTool[] {
  return wrapTools(tools, async (tool, args, context) => {
    await wake();
    return tool.call(args, context);
  });
}
