import { Check, Code, DangerCircle, Search, Spinner } from "@mynaui/icons-react";

import { Badge } from "@/components/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/collapsible";
import { Markdown } from "@/components/markdown";

import type { SubagentPart } from "../types";
import { ToolCall } from "./tool-call";

// An explorer looks, a general subagent works; a kind this client does not know is shown as the latter.
const icons: Record<string, typeof Search> = { explore: Search };

const toolCount = (count: number) => (count === 1 ? "1 tool call" : `${count} tool calls`);

// One subagent of a `spawn_agent` call (decision 0057): what it was asked, how it is going and,
// opened, the tools it called and what it sent back. While it works the row shows its latest tool.
export function SubagentCard({ subagent }: { subagent: SubagentPart }) {
  const { description, type, status, tools, output } = subagent;
  const Icon = icons[type] ?? Code;
  const latest = tools.at(-1);
  const expandable = tools.length > 0 || Boolean(output);

  return (
    <Collapsible className="min-w-0 text-sm" defaultOpen={false}>
      <CollapsibleTrigger
        disabled={!expandable}
        className="group -mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-muted/50 disabled:cursor-default disabled:hover:bg-transparent"
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate font-medium">{description}</span>
        <Badge variant="secondary">{type}</Badge>
        <span className="min-w-0 flex-1 truncate text-right font-mono text-xs text-muted-foreground">
          {status === "running" && latest
            ? latest.target
            : tools.length > 0 && toolCount(tools.length)}
        </span>
        {status === "running" && (
          <Spinner className="size-4 shrink-0 animate-spin text-muted-foreground" />
        )}
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
