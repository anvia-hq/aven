import { projectTimeline } from "@aven/protocol/timeline";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@aven/ui/collapsible";
import { cn } from "cn";
import { useMemo, useState } from "react";

import { DiffStat } from "@/modules/diff/components/diff-stat";

import { timelineWindow } from "../timeline-window";
import { groupFailureNotice } from "../tool-failure";
import type { TimelineItem, ToolGroupEntry, ToolNarration } from "../types";
import { ReasoningBlock } from "./reasoning-block";
import { TimelineIconGlyph } from "./timeline-icon";
import { ToolCall } from "./tool-call";

function labelToneClass(tone: TimelineItem["tone"]) {
  if (tone === "error") return "text-muted-foreground/50";

  return "text-muted-foreground";
}

function TimelineRow({
  item,
  live,
  turnLive,
}: {
  item: TimelineItem;
  live: boolean;
  turnLive: boolean;
}) {
  const expandable = item.tools.length > 0 || item.reasoning.length > 0;
  const notice = groupFailureNotice(item.tools);
  const labelTone = labelToneClass(item.tone);
  const [enteredLive] = useState(turnLive);
  const [labelState, setLabelState] = useState({ label: item.label, rev: 0 });

  if (labelState.label !== item.label) {
    setLabelState({ label: item.label, rev: labelState.rev + 1 });
  }

  return (
    <Collapsible
      className={cn("min-w-0 text-xs", enteredLive && "timeline-in")}
      defaultOpen={false}
    >
      <CollapsibleTrigger
        disabled={!expandable}
        className="group flex w-fit max-w-full items-center gap-2 py-0.5 text-left transition-colors hover:text-foreground disabled:cursor-default"
      >
        <TimelineIconGlyph icon={item.icon} running={item.running} className={labelTone} />
        <span
          key={labelState.rev}
          className={cn(
            "min-w-0 truncate",
            labelTone,
            item.running && "shimmer",
            labelState.rev > 0 && "narration-in",
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

export function ActivityTimeline({
  entries,
  narrations,
  live = false,
  windowed = live,
}: {
  entries: ToolGroupEntry[];
  narrations?: Readonly<Record<string, ToolNarration>>;
  live?: boolean;
  windowed?: boolean;
}) {
  const items = useMemo(() => projectTimeline(entries, narrations), [entries, narrations]);
  const hasTools = entries.some((entry) => entry.type === "tool");

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

  const { items: rendered, visibleFrom } = timelineWindow(items, windowed);

  return (
    <div className="flex min-w-0 flex-col" data-role="timeline">
      {rendered.map((item, index) => {
        const rolledOff = index < visibleFrom;
        return (
          <div
            key={item.id}
            inert={rolledOff || undefined}
            aria-hidden={rolledOff || undefined}
            className={cn(
              "grid transition-[grid-template-rows,opacity,transform] duration-250 ease-out motion-reduce:transition-none",
              rolledOff
                ? "pointer-events-none -translate-y-1.5 grid-rows-[0fr] opacity-0"
                : "translate-y-0 grid-rows-[1fr] opacity-100",
            )}
          >
            <div className="min-h-0 overflow-hidden">
              <div className={cn(index < rendered.length - 1 && "pb-1")}>
                <TimelineRow
                  item={item}
                  live={live && index === rendered.length - 1}
                  turnLive={live}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
