import { shipRequestOf } from "@aven/protocol/ship-request";
import { memo } from "react";

import { Markdown } from "@/components/markdown";

import { useSmoothParts } from "../hooks/use-smooth-parts";
import { markMentions } from "../mentions";
import type { ChatMessage, MessagePart, ToolImage, ToolPart } from "../types";
import { ImageBlock } from "./image-block";
import { mentionCode } from "./mention-code";
import { QuestionBlock } from "./question-block";
import { SentAttachments } from "./sent-attachments";
import { ShipRequestCard } from "./ship-request-card";
import { SubagentCard } from "./subagent-card";
import { ToolGroup, type ToolGroupEntry } from "./tool-group";

type Block =
  | { type: "text"; text: string }
  | { type: "question"; tool: ToolPart }
  | { type: "image"; image: ToolImage }
  | { type: "subagents"; tool: ToolPart }
  | { type: "tools"; entries: ToolGroupEntry[] };

// Consecutive tool calls become one block, so a burst of work reads as a single row; the reasoning
// between them goes to the same row (decision 0115). A question stands apart: the user has to see
// it, not find it inside a collapsed group. So does an image the agent showed, once it is done;
// while it is being kept it is a tool call like any other. So do the subagents it handed tasks to:
// their work is something to follow, one card each.
function blocks(parts: MessagePart[]) {
  const result: Block[] = [];
  const group = (entry: ToolGroupEntry) => {
    const last = result.at(-1);
    if (last?.type === "tools") last.entries.push(entry);
    else result.push({ type: "tools", entries: [entry] });
  };
  for (const part of parts) {
    if (part.type === "text") result.push(part);
    else if (part.type === "reasoning") group({ type: "reasoning", text: part.text });
    else if (part.tool.questions) result.push({ type: "question", tool: part.tool });
    else if (part.tool.image) result.push({ type: "image", image: part.tool.image });
    else if (part.tool.subagents) result.push({ type: "subagents", tool: part.tool });
    else group({ type: "tool", tool: part.tool });
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
  if (block.type === "subagents") {
    return (
      <div className="flex min-w-0 flex-col">
        {block.tool.subagents?.map((subagent) => (
          <SubagentCard key={subagent.index} subagent={subagent} />
        ))}
      </div>
    );
  }
  return <ToolGroup entries={block.entries} live={live} />;
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
    const isShipRequest =
      shipRequestOf(
        message.parts.map((part) => (part.type === "text" ? part.text : "")).join(""),
      ) !== null;
    if (isShipRequest) return <ShipRequestCard />;
    const text = message.parts.some((part) => part.type === "text" && part.text);
    return (
      <div className="my-12 ml-auto flex max-w-[80%] flex-col items-end gap-2" data-role="user">
        {message.attachments?.length ? (
          <SentAttachments
            artifactsPath={`/api/threads/${threadId}/artifacts`}
            attachments={message.attachments}
          />
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
