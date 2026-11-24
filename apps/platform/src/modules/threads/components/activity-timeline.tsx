import { projectTimeline } from "@aven/protocol/timeline";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@aven/ui/collapsible";
import { cn } from "cn";
import { useMemo, useState } from "react";

import { DiffStat } from "@/modules/diff/components/diff-stat";

import { groupFailureNotice } from "../tool-failure";
import type { TimelineItem, ToolGroupEntry, ToolNarration } from "../types";
import { ReasoningBlock } from "./reasoning-block";
import { TimelineIconGlyph } from "./timeline-icon";
import { ToolCall } from "./tool-call";

function labelToneClass(tone: TimelineItem["tone"]) {
  if (tone === "error") return "text-destructive";

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
      className={cn("min-w-0 text-sm", enteredLive && "timeline-in")}
      defaultOpen={false}
    >
      <CollapsibleTrigger
        disabled={!expandable}
        className="group flex w-fit max-w-full items-center gap-2.5 py-0.5 text-left transition-colors hover:text-foreground disabled:cursor-default"
      >
        <TimelineIconGlyph icon={item.icon} running={item.running} />
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
        <TimelineRow
          key={item.id}
          item={item}
          live={live && index === items.length - 1}
          turnLive={live}
        />
      ))}
    </div>
  );
}
