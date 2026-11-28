import { cn } from "cn";

import { Tooltip, TooltipContent, TooltipTrigger } from "@aven/ui/tooltip";
import { compactNumber, formatDateTime, formatFullDateTime } from "@/lib/format";
import type { ContextUsage, TokenUsage } from "@aven/protocol/types";

function contextSummary(context: ContextUsage) {
  if (!context.contextWindow) return `${compactNumber(context.usedTokens)} context`;

  const percent = Math.min(100, (context.usedTokens / context.contextWindow) * 100);
  const label = percent < 1 ? "<1%" : `${Math.round(percent)}%`;
  return `${compactNumber(context.usedTokens)} / ${compactNumber(context.contextWindow)} (${label})`;
}

function usageTooltip(context: ContextUsage | undefined, usage: TokenUsage | undefined) {
  const lines: string[] = [];

  if (context) {
    if (context.contextWindow) {
      const percent = Math.min(100, (context.usedTokens / context.contextWindow) * 100);
      const label = percent < 1 ? "<1%" : `${Math.round(percent)}%`;
      lines.push(
        `Context: ${context.usedTokens.toLocaleString("en")} / ${context.contextWindow.toLocaleString("en")} tokens (${label})`,
      );
    } else {
      lines.push(`Context: ${context.usedTokens.toLocaleString("en")} tokens`);
    }
  }

  if (usage && usage.inputTokens + usage.outputTokens > 0) {
    const parts = [
      `Input ${usage.inputTokens.toLocaleString("en")}`,
      `Output ${usage.outputTokens.toLocaleString("en")}`,
    ];

    if (usage.cacheReadTokens > 0) {
      const hitRate =
        usage.inputTokens > 0 ? Math.round((usage.cacheReadTokens / usage.inputTokens) * 100) : 0;
      parts.push(`Cache read ${usage.cacheReadTokens.toLocaleString("en")} (${hitRate}%)`);
    }

    if (usage.cacheWriteTokens > 0) {
      parts.push(`Cache write ${usage.cacheWriteTokens.toLocaleString("en")}`);
    }

    lines.push(parts.join(" · "));
  }

  return lines.join("\n");
}

export function ResponseMeta({
  context,
  usage,
  finishedAt,
  animate = false,
}: {
  context?: ContextUsage;
  usage?: TokenUsage;
  finishedAt?: string;
  animate?: boolean;
}) {
  const hasUsage = Boolean(usage && usage.inputTokens + usage.outputTokens > 0);
  const dateLabel = finishedAt ? formatDateTime(finishedAt) : "";

  if (!context && !hasUsage && !dateLabel) return null;

  const contextLabel = context ? contextSummary(context) : "";
  const usageLabel =
    hasUsage && usage
      ? `${compactNumber(usage.inputTokens)} in / ${compactNumber(usage.outputTokens)} out`
      : "";
  const metrics = [contextLabel, usageLabel].filter(Boolean).join(" · ");
  const hint = usageTooltip(context, usage);

  return (
    <div
      data-role="response-meta"
      className={cn(
        "flex w-fit flex-wrap items-center gap-x-1 gap-y-0.5 text-[11px] text-muted-foreground/35 tabular-nums transition-colors duration-150 hover:text-foreground/80 focus-within:text-foreground/80 motion-reduce:transition-none",
        animate && "timeline-in",
      )}
    >
      {metrics &&
        (hint ? (
          <Tooltip>
            <TooltipTrigger render={<span tabIndex={0} className="cursor-default" />}>
              {metrics}
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start" className="max-w-80 whitespace-pre-line">
              {hint}
            </TooltipContent>
          </Tooltip>
        ) : (
          <span>{metrics}</span>
        ))}
      {metrics && dateLabel && <span aria-hidden>·</span>}
      {dateLabel && finishedAt && (
        <time dateTime={finishedAt} title={formatFullDateTime(finishedAt)}>
          {dateLabel}
        </time>
      )}
    </div>
  );
}
