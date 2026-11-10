import { parseDriverPrompt } from "@aven/protocol/drivers";
import { shipRequestOf } from "@aven/protocol/ship-request";
import { systemNoteOf } from "@aven/protocol/system-notes";
import { cn } from "cn";
import { memo } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/collapsible";
import { Markdown } from "@/components/markdown";
import { elapsed } from "@/lib/format";

import { authorOf } from "../message-author";
import { useSmoothParts } from "../hooks/use-smooth-parts";
import { markMentions } from "../mentions";
import { foldedSteps, messageBlocks } from "../message-blocks";
import type { Block, ChatMessage, Viewer } from "../types";
import { ArtifactGrid } from "./artifact-grid";
import { AuthorLabel } from "./author-label";
import { mentionCode } from "./mention-code";
import { QuestionBlock } from "./question-block";
import { SentAttachments } from "./sent-attachments";
import { ShipRequestCard } from "./ship-request-card";
import { SubagentCard } from "./subagent-card";
import { ToolGroup } from "./tool-group";

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
  viewer,
  streaming = false,
  sending = false,
  showAuthor = true,
}: {
  message: ChatMessage;
  threadId: string;
  viewer: Viewer;
  streaming?: boolean;
  sending?: boolean;
  showAuthor?: boolean;
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
    const author = authorOf(
      message.parts.map((part) => (part.type === "text" ? part.text : "")).join(""),
      viewer,
      message.senderId,
    );
    const mine = sending || author.mine;
    return (
      <div
        className={cn(
          "flex max-w-[80%] flex-col gap-2",
          mine ? "ml-auto items-end" : "mr-auto items-start",
          sending && "opacity-60",
        )}
        data-role="user"
        data-author={mine ? "mine" : "other"}
        aria-busy={sending || undefined}
      >
        {!mine && showAuthor && <AuthorLabel name={author.name} />}
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
                  {markMentions(parseDriverPrompt(part.text).text, message.mentions)}
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
  const shown = messageBlocks(parts);
  const folded = live ? undefined : foldedSteps(shown);
  if (folded) {
    return (
      <div className="flex min-w-0 flex-col gap-2" data-role="assistant">
        <Collapsible className="min-w-0 text-sm" defaultOpen={false}>
          <CollapsibleTrigger
            className="group flex w-full items-center gap-3 py-1 text-muted-foreground hover:text-foreground"
            data-role="worked"
          >
            <span className="h-px flex-1 bg-border" />
            <span className="shrink-0 font-medium">
              {message.workedMs === undefined
                ? "Worked"
                : `Worked for ${elapsed(message.workedMs)}`}
            </span>
            <span className="h-px flex-1 bg-border" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="flex min-w-0 flex-col gap-2 pt-2">
              {folded.steps.map((block, index) => (
                <AssistantBlock key={index} block={block} live={false} threadId={threadId} />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
        {folded.kept.map((block, index) => (
          <AssistantBlock key={index} block={block} live={false} threadId={threadId} />
        ))}
        <AssistantBlock block={folded.answer} live={false} threadId={threadId} />
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-2" data-role="assistant">
      {shown.map((block, index, all) => (
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
