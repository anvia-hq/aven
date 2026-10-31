import { shipRequestOf } from "@aven/protocol/ship-request";
import { memo } from "react";

import { Markdown } from "@/components/markdown";

import { useSmoothParts } from "../hooks/use-smooth-parts";
import type { ChatMessage, MessagePart, ToolImage, ToolPart } from "../types";
import { SentAttachments } from "./attachment-list";
import { ImageBlock } from "./image-block";
import { markMentions, mentionCode } from "./mention-chip";
import { QuestionBlock } from "./question-block";
import { ShipRequestCard } from "./ship-request-card";
import { ToolGroup } from "./tool-group";

type Block =
  | { type: "text"; text: string }
  | { type: "question"; tool: ToolPart }
  | { type: "image"; image: ToolImage }
  | { type: "tools"; tools: ToolPart[] };

// Consecutive tool calls become one block, so a burst of work reads as a single row. A question
// stands apart: the user has to see it, not find it inside a collapsed group. So does an image the
// agent showed, once it is done; while it is being kept it is a tool call like any other.
function blocks(parts: MessagePart[]) {
  const result: Block[] = [];
  for (const part of parts) {
    const last = result.at(-1);
    if (part.type === "text") result.push(part);
    else if (part.tool.questions) result.push({ type: "question", tool: part.tool });
    else if (part.tool.image) result.push({ type: "image", image: part.tool.image });
    else if (last?.type === "tools") last.tools.push(part.tool);
    else result.push({ type: "tools", tools: [part.tool] });
  }
  return result;
}

function AssistantBlock({
  block,
  live,
  threadId,
}: {
  block: Block;
  live: boolean;
  threadId: string;
}) {
  if (block.type === "text") {
    return <Markdown live={live}>{block.text}</Markdown>;
  }
  if (block.type === "question") return <QuestionBlock tool={block.tool} />;
  if (block.type === "image") return <ImageBlock threadId={threadId} image={block.image} />;
  return <ToolGroup tools={block.tools} />;
}

// Memoized: while the agent streams, only the last message changes (the reducer keeps the others
// as they were), and re-parsing every earlier message's Markdown on each delta would add up.
export const ThreadMessage = memo(function ThreadMessage({
  message,
  threadId,
  streaming = false,
}: {
  message: ChatMessage;
  threadId: string;
  /** The agent is still writing this message: its last block is the one growing. */
  streaming?: boolean;
}) {
  if (message.role === "user") {
    const shipRequest = shipRequestOf(
      message.parts.map((part) => (part.type === "text" ? part.text : "")).join(""),
    );
    if (shipRequest !== null) return <ShipRequestCard prompt={shipRequest} />;
    const text = message.parts.some((part) => part.type === "text" && part.text);
    return (
      <div className="ml-auto flex max-w-[80%] flex-col items-end gap-2" data-role="user">
        {message.attachments?.length ? (
          <SentAttachments threadId={threadId} attachments={message.attachments} />
        ) : null}
        {text && (
          <div className="w-fit max-w-full rounded-lg bg-accent px-3 py-2 [&_p]:whitespace-pre-line">
            {message.parts.map((part, index) =>
              part.type === "text" ? (
                <Markdown key={index} components={{ code: mentionCode }}>
                  {markMentions(part.text, message.mentions)}
                </Markdown>
              ) : null,
            )}
          </div>
        )}
      </div>
    );
  }

  return <AssistantMessage message={message} threadId={threadId} streaming={streaming} />;
});

function AssistantMessage({
  message,
  threadId,
  streaming,
}: {
  message: ChatMessage;
  threadId: string;
  streaming: boolean;
}) {
  const { parts, draining } = useSmoothParts(message, streaming);
  const live = streaming || draining;
  // Nothing written yet: the working indicator under the conversation says the agent is on it.
  if (parts.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2" data-role="assistant">
      {blocks(parts).map((block, index, all) => (
        <AssistantBlock
          key={index}
          block={block}
          live={live && index === all.length - 1}
          threadId={threadId}
        />
      ))}
    </div>
  );
}
