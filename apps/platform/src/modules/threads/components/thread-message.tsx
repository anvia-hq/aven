import { parseDriverPrompt } from "@aven/protocol/drivers";
import { shipRequestOf } from "@aven/protocol/ship-request";
import { systemNoteOf } from "@aven/protocol/system-notes";
import { proofOf } from "@aven/protocol/timeline";
import { IconChevronRight } from "@tabler/icons-react";
import { cn } from "cn";
import { memo, useMemo, useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@aven/ui/collapsible";
import { Markdown } from "@/components/markdown";
import { elapsed } from "@/lib/format";

import { authorOf } from "../message-author";
import { useSmoothParts } from "../hooks/use-smooth-parts";
import { markMentions } from "../mentions";
import { foldedSteps, messageBlocks } from "../message-blocks";
import { summarizeBlocks } from "../tool-summary";
import type {
  Block,
  ChatMessage,
  MessageAttachment,
  ThreadPullRequestCheck,
  ToolNarration,
  Viewer,
} from "../types";
import { ActivityTimeline } from "./activity-timeline";
import { ArtifactGrid } from "./artifact-grid";
import { ForkCard } from "./fork-card";
import { AuthorLabel } from "./author-label";
import { CompactionDivider } from "./compaction-divider";
import { mentionCode } from "./mention-code";
import { ProofStrip } from "./proof-strip";
import { QuestionBlock } from "./question-block";
import { SentAttachments } from "./sent-attachments";
import { ShipRequestCard } from "./ship-request-card";
import { UserMessageBubble } from "./user-message-bubble";
import { SubagentCard } from "./subagent-card";
import { BrowserOffer } from "./browser-offer";

function AssistantBlock({
  block,
  live,
  windowed = live,
  collapsed = false,
  threadId,
  runtimeId,
  narrations,
}: {
  block: Block;
  live: boolean;
  windowed?: boolean;
  collapsed?: boolean;
  threadId: string;
  runtimeId: string;
  narrations?: Readonly<Record<string, ToolNarration>>;
}) {
  if (block.type === "text") {
    return <Markdown live={live}>{block.text}</Markdown>;
  }

  if (block.type === "question") return <QuestionBlock tool={block.tool} />;

  if (block.type === "artifacts") {
    return <ArtifactGrid threadId={threadId} artifacts={block.artifacts} />;
  }

  if (block.type === "browser") {
    return <BrowserOffer tool={block.tool} threadId={threadId} runtimeId={runtimeId} />;
  }

  if (block.type === "fork") return <ForkCard tool={block.tool} forkId={block.forkId} />;

  if (block.type === "subagents") {
    return (
      <div className="flex min-w-0 flex-col">
        {block.tool.status === "error" && block.tool.output && (
          <p className="mb-1 text-xs text-destructive">{block.tool.output}</p>
        )}
        {block.tool.subagents?.map((subagent) => (
          <SubagentCard key={subagent.index} subagent={subagent} />
        ))}
      </div>
    );
  }

  return (
    <ActivityTimeline
      entries={block.entries}
      narrations={narrations}
      live={live}
      windowed={windowed}
      collapsed={collapsed}
    />
  );
}

function WorkedSteps({
  steps,
  workedMs,
  live,
  seenLive,
  threadId,
  runtimeId,
  narrations,
}: {
  steps: Block[];
  workedMs?: number;
  live: boolean;
  seenLive: boolean;
  threadId: string;
  runtimeId: string;
  narrations?: Readonly<Record<string, ToolNarration>>;
}) {
  const [open, setOpen] = useState(false);
  const label =
    !live && workedMs !== undefined ? `Worked for ${elapsed(workedMs)}` : summarizeBlocks(steps);

  return (
    <Collapsible className="min-w-0 text-sm" open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          "group flex h-6 items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none",
          seenLive && "timeline-in",
        )}
        data-role="worked"
      >
        <IconChevronRight
          aria-hidden
          className="size-3.5 shrink-0 transition-transform duration-150 ease-out group-data-[panel-open]:rotate-90 motion-reduce:transition-none"
        />
        <span className="min-w-0 truncate font-medium tabular-nums">{label}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 ease-out data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none">
        <div className="flex min-w-0 flex-col gap-2 pt-1.5">
          {steps.map((block, index) => (
            <AssistantBlock
              key={index}
              block={block}
              live={false}
              windowed={false}
              threadId={threadId}
              runtimeId={runtimeId}
              narrations={narrations}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export const ThreadMessage = memo(function ThreadMessage({
  message,
  threadId,
  runtimeId,
  viewer,
  streaming = false,
  sending = false,
  previews,
  showAuthor = true,
  narrations,
  prChecks,
  onOpenChanges,
}: {
  message: ChatMessage;
  threadId: string;
  runtimeId: string;
  viewer: Viewer;
  streaming?: boolean;
  sending?: boolean;
  previews?: MessageAttachment[];
  showAuthor?: boolean;
  narrations?: Readonly<Record<string, ToolNarration>>;
  prChecks?: readonly ThreadPullRequestCheck[];
  onOpenChanges?: () => void;
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

    if (note?.kind === "process" || note?.kind === "fork") return null;

    if (note?.kind === "compaction") return <CompactionDivider label={note.line} />;

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
            previews={previews}
          />
        ) : null}
        {text && (
          <UserMessageBubble>
            {message.parts.map((part, index) =>
              part.type === "text" ? (
                <Markdown key={index} components={{ code: mentionCode }}>
                  {markMentions(parseDriverPrompt(part.text).text, message.mentions)}
                </Markdown>
              ) : null,
            )}
          </UserMessageBubble>
        )}
      </div>
    );
  }

  return (
    <AssistantMessage
      message={message}
      threadId={threadId}
      runtimeId={runtimeId}
      streaming={streaming}
      narrations={narrations}
      prChecks={prChecks}
      onOpenChanges={onOpenChanges}
    />
  );
});

function AssistantMessage({
  message,
  threadId,
  runtimeId,
  streaming,
  narrations,
  prChecks,
  onOpenChanges,
}: {
  message: ChatMessage;
  threadId: string;
  runtimeId: string;
  streaming: boolean;
  narrations?: Readonly<Record<string, ToolNarration>>;
  prChecks?: readonly ThreadPullRequestCheck[];
  onOpenChanges?: () => void;
}) {
  const { parts, draining } = useSmoothParts(message, streaming);
  const live = streaming || draining;
  const [seenLive, setSeenLive] = useState(live);

  if (live && !seenLive) setSeenLive(true);

  const shown = useMemo(() => messageBlocks(parts), [parts]);
  const folded = useMemo(() => foldedSteps(shown), [shown]);
  const proof = useMemo(() => proofOf(parts), [parts]);

  if (parts.length === 0) return null;

  if (folded) {
    return (
      <div className="flex min-w-0 flex-col gap-2.5" data-role="assistant">
        <WorkedSteps
          steps={folded.steps}
          workedMs={message.workedMs}
          live={live}
          seenLive={seenLive}
          threadId={threadId}
          runtimeId={runtimeId}
          narrations={narrations}
        />
        {folded.kept.map((block, index) => (
          <AssistantBlock
            key={index}
            block={block}
            live={false}
            threadId={threadId}
            runtimeId={runtimeId}
            narrations={narrations}
          />
        ))}
        <AssistantBlock
          block={folded.answer}
          live={live}
          threadId={threadId}
          runtimeId={runtimeId}
          narrations={narrations}
        />
        {!live && (
          <ProofStrip
            proof={proof}
            prChecks={prChecks}
            onOpenChanges={onOpenChanges}
            animate={seenLive}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-2.5" data-role="assistant">
      {shown.map((block, index, all) => {
        const active = live && index === all.length - 1;
        return (
          <AssistantBlock
            key={index}
            block={block}
            live={active}
            windowed={active}
            collapsed={block.type === "tools" && !active}
            threadId={threadId}
            runtimeId={runtimeId}
            narrations={narrations}
          />
        );
      })}
      {!live && (
        <ProofStrip
          proof={proof}
          prChecks={prChecks}
          onOpenChanges={onOpenChanges}
          animate={seenLive}
        />
      )}
    </div>
  );
}
