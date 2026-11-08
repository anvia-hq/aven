import { shipRequestOf } from "@aven/protocol/ship-request";
import { systemNoteOf } from "@aven/protocol/system-notes";
import { cn } from "cn";
import { memo } from "react";

import { Markdown } from "@/components/markdown";

import { useSmoothParts } from "../hooks/use-smooth-parts";
import { markMentions } from "../mentions";
import type { ChatMessage, MessagePart, ToolArtifact, ToolGroupEntry, ToolPart } from "../types";
import { ArtifactGrid } from "./artifact-grid";
import { mentionCode } from "./mention-code";
import { QuestionBlock } from "./question-block";
import { SentAttachments } from "./sent-attachments";
import { ShipRequestCard } from "./ship-request-card";
import { SubagentCard } from "./subagent-card";
import { ToolGroup } from "./tool-group";

type Block =
  | { type: "text"; text: string }
  | { type: "question"; tool: ToolPart }
  | { type: "artifacts"; artifacts: ToolArtifact[] }
  | { type: "subagents"; tool: ToolPart }
  | { type: "tools"; entries: ToolGroupEntry[] };

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
    else if (part.tool.artifacts)
      result.push({ type: "artifacts", artifacts: part.tool.artifacts });
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
  if (block.type === "artifacts") {
    return <ArtifactGrid threadId={threadId} artifacts={block.artifacts} />;
  }
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

export const ThreadMessage = memo(function ThreadMessage({
  message,
  threadId,
  streaming = false,
  sending = false,
}: {
  message: ChatMessage;
  threadId: string;
  streaming?: boolean;
  sending?: boolean;
}) {
  if (message.role === "user") {
    const isShipRequest =
      shipRequestOf(
        message.parts.map((part) => (part.type === "text" ? part.text : "")).join(""),
      ) !== null;
    if (isShipRequest) return <ShipRequestCard />;
    const note = systemNoteOf(
      message.parts.map((part) => (part.type === "text" ? part.text : "")).join(""),
    );
    if (note?.kind === "process") return null;
    if (note) {
      return (
        <p className="my-6 text-center text-sm text-muted-foreground" data-role="note">
          {note.line}
        </p>
      );
    }
    const text = message.parts.some((part) => part.type === "text" && part.text);
    return (
      <div
        className={cn(
          "my-12 ml-auto flex max-w-[80%] flex-col items-end gap-2",
          sending && "opacity-60",
        )}
        data-role="user"
        aria-busy={sending || undefined}
      >
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
