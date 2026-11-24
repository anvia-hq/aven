import { parseDriverPrompt } from "@aven/protocol/drivers";
import { shipRequestOf } from "@aven/protocol/ship-request";
import { systemNoteOf } from "@aven/protocol/system-notes";
import { latestPlanOf, proofOf } from "@aven/protocol/timeline";
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
import { PlanCard } from "./plan-card";
import { ProofStrip } from "./proof-strip";
import { QuestionBlock } from "./question-block";
import { SentAttachments } from "./sent-attachments";
import { ShipRequestCard } from "./ship-request-card";
import { SubagentCard } from "./subagent-card";
import { BrowserOffer } from "./browser-offer";

function AssistantBlock({
  block,
  live,
  threadId,
  runtimeId,
  narrations,
}: {
  block: Block;
  live: boolean;
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

  return <ActivityTimeline entries={block.entries} narrations={narrations} live={live} />;
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
          <div className="w-fit max-w-full rounded-2xl border border-foreground/10 bg-clip-padding bg-linear-to-r from-[color-mix(in_oklch,var(--accent),var(--background)_15%)] to-[color-mix(in_oklch,var(--accent),oklch(0.45_0.06_55)_28%)] px-4 py-2.5 [&_p]:whitespace-pre-line">
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
  const folded = useMemo(() => (live ? undefined : foldedSteps(shown)), [live, shown]);
  const plan = useMemo(() => latestPlanOf(parts), [parts]);
  const proof = useMemo(() => proofOf(parts), [parts]);

  if (parts.length === 0) return null;

  if (folded) {
    return (
      <div className="flex min-w-0 flex-col gap-2.5" data-role="assistant">
        {plan && <PlanCard tasks={plan} live={false} />}
        <Collapsible className="min-w-0 text-sm" defaultOpen>
          <div className={cn(seenLive && "worked-in")}>
            <CollapsibleTrigger
              className="group flex items-center gap-1 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
              data-role="worked"
            >
              <IconChevronRight
                aria-hidden
                className="size-3.5 transition-transform group-data-[panel-open]:rotate-90"
              />
              <span className="font-medium">
                {message.workedMs === undefined
                  ? "Activity"
                  : `Worked for ${elapsed(message.workedMs)}`}
              </span>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 ease-out data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none">
            <div className="flex min-w-0 flex-col gap-2 pt-1.5">
              {folded.steps.map((block, index) => (
                <AssistantBlock
                  key={index}
                  block={block}
                  live={false}
                  threadId={threadId}
                  runtimeId={runtimeId}
                  narrations={narrations}
                />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
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
          live={false}
          threadId={threadId}
          runtimeId={runtimeId}
          narrations={narrations}
        />
        <ProofStrip
          proof={proof}
          prChecks={prChecks}
          onOpenChanges={onOpenChanges}
          animate={seenLive}
        />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-2.5" data-role="assistant">
      {plan && <PlanCard tasks={plan} live={live} />}
      {shown.map((block, index, all) => (
        <AssistantBlock
          key={index}
          block={block}
          live={live && index === all.length - 1}
          threadId={threadId}
          runtimeId={runtimeId}
          narrations={narrations}
        />
      ))}
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
