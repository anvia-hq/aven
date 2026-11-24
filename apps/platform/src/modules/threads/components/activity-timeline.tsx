import { projectTimeline } from "@aven/protocol/timeline";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@aven/ui/collapsible";
import { IconChevronRight } from "@tabler/icons-react";
import { cn } from "cn";
import { type AnimationEvent, type CSSProperties, useEffect, useMemo, useState } from "react";

import { DiffStat } from "@/modules/diff/components/diff-stat";

import { pushedTimelineItems, timelineWindow } from "../timeline-window";
import { groupFailureNotice } from "../tool-failure";
import { summarizeTimelineItems } from "../tool-summary";
import type { TimelineItem, ToolGroupEntry, ToolNarration } from "../types";
import { ReasoningBlock } from "./reasoning-block";
import { TimelineIconGlyph } from "./timeline-icon";
import { ToolCall } from "./tool-call";

const EMPTY_IDS: ReadonlySet<string> = new Set();

const PUSH_CLEANUP_MS = 280;

type PushState = {
  prevRecent: readonly TimelineItem[];
  exiting: readonly TimelineItem[];
  enteringIds: ReadonlySet<string>;
  seq: number;
};

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function labelToneClass(tone: TimelineItem["tone"]) {
  if (tone === "error") return "text-muted-foreground/50";

  return "text-muted-foreground";
}

function TimelineRowContent({ item, labelRev }: { item: TimelineItem; labelRev: number }) {
  const notice = groupFailureNotice(item.tools);
  const labelTone = labelToneClass(item.tone);

  return (
    <>
      <TimelineIconGlyph icon={item.icon} running={item.running} className={labelTone} />
      <span
        key={labelRev}
        className={cn(
          "min-w-0 truncate",
          labelTone,
          item.running && "shimmer",
          labelRev > 0 && "narration-in",
        )}
      >
        {notice && <span className="text-destructive">{notice} · </span>}
        {item.label}
      </span>
      {item.detail && (
        <span
          className={cn(
            "min-w-0 truncate font-mono text-xs",
            item.tone === "error" ? "text-muted-foreground/40" : "text-muted-foreground/65",
          )}
        >
          {item.detail}
        </span>
      )}
      {item.stat && (item.stat.additions > 0 || item.stat.deletions > 0) && (
        <span className="shrink-0 font-mono text-xs">
          <DiffStat additions={item.stat.additions} deletions={item.stat.deletions} />
        </span>
      )}
    </>
  );
}

function ExitingTimelineRow({ item }: { item: TimelineItem }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none flex h-6 w-fit max-w-full shrink-0 items-center gap-2 text-left text-xs timeline-push-out"
    >
      <TimelineRowContent item={item} labelRev={0} />
    </div>
  );
}

function TimelineRow({
  item,
  live,
  animateEntry,
  rowClassName,
  onOpenChange,
}: {
  item: TimelineItem;
  live: boolean;
  animateEntry: boolean;
  rowClassName?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const expandable = item.tools.length > 0 || item.reasoning.length > 0;
  const [enteredLive] = useState(animateEntry);
  const [labelState, setLabelState] = useState({ label: item.label, rev: 0 });

  if (labelState.label !== item.label) {
    setLabelState({ label: item.label, rev: labelState.rev + 1 });
  }

  return (
    <Collapsible
      className={cn("min-w-0 text-xs", enteredLive && "timeline-in", rowClassName)}
      defaultOpen={false}
      onOpenChange={onOpenChange}
      data-role="timeline-row"
    >
      <CollapsibleTrigger
        disabled={!expandable}
        className="group flex h-6 w-fit max-w-full items-center gap-2 text-left transition-colors hover:text-foreground disabled:cursor-default"
      >
        <TimelineRowContent item={item} labelRev={labelState.rev} />
      </CollapsibleTrigger>
      {expandable && (
        <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 ease-out data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none">
          <div className="mt-1 ml-1.75 flex flex-col border-l border-border/70 pl-3.5">
            {item.reasoning.map((text, index) => (
              <ReasoningBlock
                key={`r-${index}`}
                text={text}
                thinking={live && item.tools.length === 0 && index === item.reasoning.length - 1}
              />
            ))}
            {item.tools.map((tool) => (
              <ToolCall key={tool.id} tool={tool} />
            ))}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

function TimelineParentGroup({
  items,
  animateEntry = false,
}: {
  items: readonly TimelineItem[];
  animateEntry?: boolean;
}) {
  const tools = items.flatMap((item) => item.tools);
  const notice = groupFailureNotice(tools);
  const summary = summarizeTimelineItems(items);
  const [enteredLive] = useState(animateEntry);

  return (
    <Collapsible className="min-w-0 text-xs" defaultOpen={false} data-role="timeline-parent">
      <CollapsibleTrigger
        className={cn(
          "group flex h-6 w-fit max-w-full items-center gap-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none",
          enteredLive && "timeline-in",
        )}
      >
        <IconChevronRight
          aria-hidden
          className="size-3.5 shrink-0 transition-transform duration-150 ease-out group-data-[panel-open]:rotate-90 motion-reduce:transition-none"
        />
        <span className="min-w-0 truncate font-medium tabular-nums">
          {notice && <span className="font-normal text-destructive">{notice} · </span>}
          {summary}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 ease-out data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none">
        <div className="mt-1 ml-1.75 flex flex-col gap-1 border-l border-border/70 pl-3.5">
          {items.map((item) => (
            <TimelineRow key={item.id} item={item} live={false} animateEntry={false} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ActivityTimeline({
  entries,
  narrations,
  live = false,
  windowed = live,
  collapsed = false,
}: {
  entries: ToolGroupEntry[];
  narrations?: Readonly<Record<string, ToolNarration>>;
  live?: boolean;
  windowed?: boolean;
  collapsed?: boolean;
}) {
  const items = useMemo(() => projectTimeline(entries, narrations), [entries, narrations]);
  const hasTools = entries.some((entry) => entry.type === "tool");
  const { older, recent } = timelineWindow(items, windowed);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(EMPTY_IDS);
  const hasExpandedRecent = recent.some((item) => expandedIds.has(item.id));
  const [push, setPush] = useState<PushState>(() => ({
    prevRecent: recent,
    exiting: [],
    enteringIds: EMPTY_IDS,
    seq: 0,
  }));

  const idsChanged =
    recent.length !== push.prevRecent.length ||
    recent.some((item, index) => item.id !== push.prevRecent[index]?.id);
  const canPush = windowed && older.length > 0 && !collapsed && !hasExpandedRecent;

  if (idsChanged) {
    if (canPush && !prefersReducedMotion()) {
      const { exiting, enteringIds } = pushedTimelineItems(push.prevRecent, recent);
      setPush({
        prevRecent: recent,
        exiting,
        enteringIds: exiting.length > 0 ? enteringIds : EMPTY_IDS,
        seq: exiting.length > 0 ? push.seq + 1 : push.seq,
      });
    } else {
      setPush({
        prevRecent: recent,
        exiting: [],
        enteringIds: EMPTY_IDS,
        seq: push.seq,
      });
    }
  } else if (push.exiting.length > 0 && !canPush) {
    setPush({
      prevRecent: recent,
      exiting: [],
      enteringIds: EMPTY_IDS,
      seq: push.seq,
    });
  }

  useEffect(() => {
    if (push.exiting.length === 0) return;

    const timer = setTimeout(() => {
      setPush((current) =>
        current.exiting.length === 0
          ? current
          : { ...current, exiting: [], enteringIds: EMPTY_IDS },
      );
    }, PUSH_CLEANUP_MS);
    return () => clearTimeout(timer);
  }, [push.seq, push.exiting.length]);

  const handleRowOpenChange = (id: string, open: boolean) => {
    setExpandedIds((current) => {
      const next = new Set(current);

      if (open) next.add(id);
      else next.delete(id);

      return next;
    });
  };

  const handleTrackAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;

    setPush((current) =>
      current.exiting.length === 0 ? current : { ...current, exiting: [], enteringIds: EMPTY_IDS },
    );
  };

  if (!hasTools) {
    return entries.map((entry, index) =>
      entry.type === "reasoning" ? (
        <ReasoningBlock
          key={index}
          text={entry.text}
          thinking={live && index === entries.length - 1}
        />
      ) : null,
    );
  }

  if (collapsed) {
    return (
      <div className="flex min-w-0 flex-col gap-1" data-role="timeline">
        <TimelineParentGroup items={items} />
      </div>
    );
  }

  if (older.length === 0) {
    return (
      <div className="flex min-w-0 flex-col gap-1" data-role="timeline">
        {recent.map((item, index) => (
          <TimelineRow
            key={item.id}
            item={item}
            live={live && index === recent.length - 1}
            animateEntry={live}
          />
        ))}
      </div>
    );
  }

  const pushing = push.exiting.length > 0;
  const pushClass = push.seq % 2 === 1 ? "timeline-push-a" : "timeline-push-b";
  const pushStyle = pushing
    ? ({ "--timeline-push": `${push.exiting.length * -1.75}rem` } as CSSProperties)
    : undefined;

  return (
    <div className="flex min-w-0 flex-col gap-1" data-role="timeline">
      <TimelineParentGroup items={older} animateEntry={live} />
      <div
        data-role="timeline-viewport"
        className={cn("min-w-0", hasExpandedRecent ? "overflow-visible" : "h-20 overflow-hidden")}
      >
        <div
          className={cn("flex min-w-0 flex-col gap-1", pushing && pushClass)}
          style={pushStyle}
          onAnimationEnd={pushing ? handleTrackAnimationEnd : undefined}
        >
          {push.exiting.map((item) => (
            <ExitingTimelineRow key={`exit-${item.id}`} item={item} />
          ))}
          {recent.map((item, index) => (
            <TimelineRow
              key={item.id}
              item={item}
              live={live && index === recent.length - 1}
              animateEntry={false}
              rowClassName={push.enteringIds.has(item.id) ? "timeline-push-in" : undefined}
              onOpenChange={(open) => handleRowOpenChange(item.id, open)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
