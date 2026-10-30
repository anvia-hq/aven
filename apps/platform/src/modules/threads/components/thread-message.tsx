import { Fragment } from "react";

import { Markdown } from "@/components/markdown";

import type { ChatMessage, MessagePart, ToolPart } from "../types";
import { ToolCall } from "./tool-call";
import { ToolGroup } from "./tool-group";

type Block = { type: "text"; text: string } | { type: "tools"; tools: ToolPart[] };

// Consecutive tool calls become one block, so a burst of work reads as a single row.
function blocks(parts: MessagePart[]) {
  const result: Block[] = [];
  for (const part of parts) {
    const last = result.at(-1);
    if (part.type === "text") result.push(part);
    else if (last?.type === "tools") last.tools.push(part.tool);
    else result.push({ type: "tools", tools: [part.tool] });
  }
  return result;
}

function AssistantBlock({ block }: { block: Block }) {
  if (block.type === "text") {
    return <Markdown>{block.text}</Markdown>;
  }
  const [only] = block.tools;
  if (block.tools.length === 1 && only) return <ToolCall tool={only} />;
  return <ToolGroup tools={block.tools} />;
}

export function ThreadMessage({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div
        className="ml-auto w-fit max-w-[80%] rounded-lg bg-accent px-3 py-2 text-sm leading-6 break-words whitespace-pre-wrap"
        data-role="user"
      >
        {message.parts.map((part, index) =>
          part.type === "text" ? <Fragment key={index}>{part.text}</Fragment> : null,
        )}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-2" data-role="assistant">
      {blocks(message.parts).map((block, index) => (
        <AssistantBlock key={index} block={block} />
      ))}
      {message.parts.length === 0 && <p className="text-sm text-muted-foreground">Thinking…</p>}
    </div>
  );
}
