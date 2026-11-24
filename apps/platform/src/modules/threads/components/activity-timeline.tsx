import { projectTimeline } from "@aven/protocol/timeline";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@aven/ui/collapsible";
import { cn } from "cn";
import { useMemo } from "react";

import { DiffStat } from "@/modules/diff/components/diff-stat";

import { groupFailureNotice } from "../tool-failure";
import type { TimelineItem, ToolGroupEntry, ToolNarration } from "../types";
import { ReasoningBlock } from "./reasoning-block";
import { TimelineIconGlyph } from "./timeline-icon";
import { ToolCall } from "./tool-call";

function labelToneClass(tone: TimelineItem["tone"]) {
  if (tone === "error") return "text-destructive";

  if (tone === "warning") return "text-meter";

  if (tone === "success") return "text-foreground";

  return "text-muted-foreground";
}

function outcomeToneClass(tone: TimelineItem["tone"]) {
  if (tone === "error") return "text-destructive";

  if (tone === "warning") return "text-meter";

  if (tone === "success") return "text-foreground/85";

  return "text-muted-foreground";
}

function TimelineRow({ item, live }: { item: TimelineItem; live: boolean }) {
  const expandable = item.tools.length > 0 || item.reasoning.length > 0;
  const notice = groupFailureNotice(item.tools);
  const labelTone = labelToneClass(item.tone);

  return (
    <Collapsible className="min-w-0 text-sm" defaultOpen={false}>
      <div className="flex flex-col gap-0.5">
        <CollapsibleTrigger
          disabled={!expandable}
          className="group flex w-fit max-w-full items-center gap-2.5 py-0.5 text-left transition-colors hover:text-foreground disabled:cursor-default"
        >
          <TimelineIconGlyph icon={item.icon} tone={item.tone} running={item.running} />
          <span className={cn("min-w-0 truncate", labelTone, item.running && "shimmer")}>
            {notice && <span className="text-destructive">{notice} · </span>}
            {item.label}
          </span>
          {item.detail && (
            <span className="min-w-0 truncate font-mono text-xs text-muted-foreground/65">
              {item.detail}
            </span>
          )}
          {item.stat && (item.stat.additions > 0 || item.stat.deletions > 0) && (
            <span className="shrink-0 font-mono text-xs">
              <DiffStat additions={item.stat.additions} deletions={item.stat.deletions} />
            </span>
          )}
        </CollapsibleTrigger>
        {item.outcome && (
          <div className="flex items-center gap-2.5 py-0.5 pl-0">
            <TimelineIconGlyph icon={item.outcome.icon} tone={item.outcome.tone} />
            <span className={cn("min-w-0 truncate text-sm", outcomeToneClass(item.outcome.tone))}>
              {item.outcome.label}
            </span>
          </div>
        )}
      </div>
      {expandable && (
        <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 ease-out data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none">
          <div className="mt-1 ml-2 flex flex-col border-l border-border/70 pl-4">
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
}: {
  entries: ToolGroupEntry[];
  narrations?: Readonly<Record<string, ToolNarration>>;
  live?: boolean;
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

  return (
    <div className="flex min-w-0 flex-col gap-1" data-role="timeline">
      {items.map((item, index) => (
        <TimelineRow key={item.id} item={item} live={live && index === items.length - 1} />
      ))}
    </div>
  );
}
