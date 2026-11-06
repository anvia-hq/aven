import { Check, DangerCircle } from "@mynaui/icons-react";
import { cn } from "cn";

import { Badge } from "@/components/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/collapsible";
import { Markdown } from "@/components/markdown";

import type { SubagentPart } from "../types";
import { ToolCall } from "./tool-call";

// The icon set has no robot, so this one is drawn in its style: 24px, 1.5 stroke, round ends.
function Robot({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 3v3" />
      <rect x="4" y="6" width="16" height="12" rx="4" />
      <path d="M2 11v2M22 11v2" />
      <path d="M9 11v1.5M15 11v1.5" />
      <path d="M9.5 15.5h5" />
      <path d="M8 21h8" />
    </svg>
  );
}

const toolCount = (count: number) => (count === 1 ? "1 tool call" : `${count} tool calls`);

// One subagent of a `spawn_agent` call (decision 0057): what it was asked, how it is going and,
// opened, the tools it called and what it sent back. While it works the row shows its latest tool.
export function SubagentCard({ subagent }: { subagent: SubagentPart }) {
  const { description, type, status, tools, output } = subagent;
  const latest = tools.at(-1);
  const expandable = tools.length > 0 || Boolean(output);

  return (
    <Collapsible className="min-w-0 text-sm" defaultOpen={false}>
      <CollapsibleTrigger
        disabled={!expandable}
        className="group -mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-muted/50 disabled:cursor-default disabled:hover:bg-transparent"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Robot className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cn("truncate font-medium", status === "running" && "shimmer")}>
            {description}
          </span>
          <span
            className={cn(
              "truncate font-mono text-xs text-muted-foreground",
              status === "running" && "shimmer",
            )}
          >
            {status === "running" && latest
              ? latest.target
              : tools.length > 0 && toolCount(tools.length)}
          </span>
        </span>
        <Badge variant="secondary">{type}</Badge>
        {status === "done" && <Check className="size-4 shrink-0 text-muted-foreground" />}
        {status === "error" && (
          <DangerCircle className="size-4 shrink-0 text-destructive" aria-label="Failed" />
        )}
      </CollapsibleTrigger>
      {expandable && (
        <CollapsibleContent>
          <div className="ml-1 flex flex-col gap-2 border-l pb-2 pl-3">
            {tools.length > 0 && (
              <div className="flex flex-col">
                {tools.map((tool) => (
                  <ToolCall key={tool.id} tool={tool} />
                ))}
              </div>
            )}
            {output &&
              (status === "error" ? (
                <p className="text-xs text-destructive">{output}</p>
              ) : (
                <Markdown>{output}</Markdown>
              ))}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}
