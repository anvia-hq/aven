import { Fragment, memo } from "react";

import { Markdown } from "@/components/markdown";

import { useSmoothParts } from "../hooks/use-smooth-parts";
import type { ChatMessage, MessagePart, ToolPart } from "../types";
import { QuestionBlock } from "./question-block";
import { ToolCall } from "./tool-call";
import { ToolGroup } from "./tool-group";

type Block =
  | { type: "text"; text: string }
  | { type: "question"; tool: ToolPart }
  | { type: "tools"; tools: ToolPart[] };

// Consecutive tool calls become one block, so a burst of work reads as a single row. A question
// stands apart: the user has to see it, not find it inside a collapsed group.
function blocks(parts: MessagePart[]) {
  const result: Block[] = [];
  for (const part of parts) {
    const last = result.at(-1);
    if (part.type === "text") result.push(part);
    else if (part.tool.questions) result.push({ type: "question", tool: part.tool });
    else if (last?.type === "tools") last.tools.push(part.tool);
    else result.push({ type: "tools", tools: [part.tool] });
  }
  return result;
}

function AssistantBlock({ block, live }: { block: Block; live: boolean }) {
  if (block.type === "text") {
    return <Markdown live={live}>{block.text}</Markdown>;
  }
  if (block.type === "question") return <QuestionBlock tool={block.tool} />;
  const [only] = block.tools;
  if (block.tools.length === 1 && only) return <ToolCall tool={only} />;
  return <ToolGroup tools={block.tools} />;
}

// Memoized: while the agent streams, only the last message changes (the reducer keeps the others
// as they were), and re-parsing every earlier message's Markdown on each delta would add up.
export const ThreadMessage = memo(function ThreadMessage({
  message,
  streaming = false,
}: {
  message: ChatMessage;
  /** The agent is still writing this message: its last block is the one growing. */
  streaming?: boolean;
}) {
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

  return <AssistantMessage message={message} streaming={streaming} />;
});

function AssistantMessage({ message, streaming }: { message: ChatMessage; streaming: boolean }) {
  const { parts, draining } = useSmoothParts(message, streaming);
  const live = streaming || draining;
  return (
    <div className="flex min-w-0 flex-col gap-2" data-role="assistant">
      {blocks(parts).map((block, index, all) => (
        <AssistantBlock key={index} block={block} live={live && index === all.length - 1} />
      ))}
      {message.parts.length === 0 && <p className="text-sm text-muted-foreground">Thinking…</p>}
    </div>
  );
}
