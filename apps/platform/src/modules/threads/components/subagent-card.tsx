import { CheckIcon, AltArrowRightIcon, LoaderIcon, CloseIcon } from "@solar-icons/react/linear";
import { cn } from "cn";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@aven/ui/collapsible";
import { Markdown } from "@/components/markdown";

import type { SubagentPart } from "../types";
import { ToolCall } from "./tool-call";

const toolCount = (count: number) => (count === 1 ? "1 tool call" : `${count} tool calls`);

function StatusNode({ status }: { status: SubagentPart["status"] }) {
  if (status === "error")
    return (
      <CloseIcon
        role="img"
        aria-label="Failed"
        strokeWidth={2.4}
        className="size-3.5 text-destructive"
      />
    );

  if (status === "running")
    return (
      <LoaderIcon aria-hidden strokeWidth={2.4} className="size-3.5 animate-spin text-meter" />
    );

  return <CheckIcon aria-hidden strokeWidth={2.4} className="size-3.5 text-success" />;
}

export function SubagentCard({ subagent }: { subagent: SubagentPart }) {
  const { description, type, status, tools, output } = subagent;
  const latest = tools.at(-1);
  const expandable = tools.length > 0 || Boolean(output);

  return (
    <Collapsible
      className="relative min-w-0 pb-3 pl-8.5 text-sm before:absolute before:top-6 before:bottom-0.5 before:left-2.25 before:w-px before:bg-border last:pb-0 last:before:hidden"
      defaultOpen={false}
    >
      <span className="absolute top-0 left-0 grid size-5 place-items-center rounded-full bg-background">
        <StatusNode status={status} />
      </span>
      <CollapsibleTrigger
        disabled={!expandable}
        className="group flex w-full min-w-0 flex-col items-start text-left disabled:cursor-default"
      >
        <span className="flex min-h-5 w-full min-w-0 items-center gap-2">
          <span className={cn("truncate leading-5 font-medium", status === "running" && "shimmer")}>
            {description}
          </span>
          {expandable && (
            <AltArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-panel-open:rotate-90 motion-reduce:transition-none" />
          )}
        </span>
        <span
          className={cn(
            "mt-0.5 w-full truncate font-mono text-xs text-muted-foreground",
            status === "running" && "shimmer",
          )}
        >
          {type}
          {status === "running" && latest
            ? ` · ${latest.target}`
            : tools.length > 0 && ` · ${toolCount(tools.length)}`}
        </span>
      </CollapsibleTrigger>
      {expandable && (
        <CollapsibleContent>
          <div className="mt-2 flex flex-col gap-2 rounded-xl bg-muted px-3 py-2.5">
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
