import type { Block, MessagePart, ToolGroupEntry } from "./types";

export function messageBlocks(parts: MessagePart[]) {
  const result: Block[] = [];
  const group = (entry: ToolGroupEntry) => {
    const last = result.at(-1);
    if (last?.type === "tools") last.entries.push(entry);
    else result.push({ type: "tools", entries: [entry] });
  };
  for (const part of parts) {
    if (part.type === "text") {
      if (part.text.trim() !== "") result.push(part);
    } else if (part.type === "reasoning") group({ type: "reasoning", text: part.text });
    else if (part.tool.questions) result.push({ type: "question", tool: part.tool });
    else if (part.tool.artifacts)
      result.push({ type: "artifacts", artifacts: part.tool.artifacts });
    else if (part.tool.subagents) result.push({ type: "subagents", tool: part.tool });
    else group({ type: "tool", tool: part.tool });
  }
  return result;
}

export function foldedSteps(blocks: Block[]) {
  const answer = blocks.at(-1);
  if (blocks.length < 2 || answer?.type !== "text") return undefined;
  return { steps: blocks.slice(0, -1), answer };
}
