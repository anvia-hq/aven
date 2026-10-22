import {
  CheckCircle,
  ChevronRight,
  Edit,
  Eye,
  Search,
  Spinner,
  Terminal,
} from "@mynaui/icons-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/collapsible";

import type { ToolCall as ToolCallType, ToolName } from "../types";
import { DiffBlock } from "./diff-block";

const meta: Record<ToolName, { icon: typeof Eye; running: string; done: string }> = {
  read: { icon: Eye, running: "Reading", done: "Read" },
  edit: { icon: Edit, running: "Editing", done: "Edited" },
  bash: { icon: Terminal, running: "Running", done: "Ran" },
  search: { icon: Search, running: "Searching", done: "Searched" },
};

export function ToolCall({ tool }: { tool: ToolCallType }) {
  const { icon: Icon, running, done } = meta[tool.name];
  const additions = tool.diff?.filter((line) => line.type === "add").length ?? 0;
  const deletions = tool.diff?.filter((line) => line.type === "del").length ?? 0;
  const expandable = Boolean(tool.diff?.length || tool.output);

  return (
    <Collapsible className="rounded-lg border bg-card/50 text-sm" defaultOpen={false}>
      <CollapsibleTrigger
        disabled={!expandable}
        className="group flex w-full items-center gap-2 px-3 py-2 text-left disabled:cursor-default"
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-muted-foreground">{tool.status === "running" ? running : done}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{tool.target}</span>
        {tool.diff && (
          <span className="font-mono text-xs">
            <span className="text-success">+{additions}</span>{" "}
            <span className="text-destructive">-{deletions}</span>
          </span>
        )}
        {tool.status === "running" ? (
          <Spinner className="size-4 animate-spin text-muted-foreground" />
        ) : (
          <CheckCircle className="size-4 text-success" />
        )}
        {expandable && (
          <ChevronRight className="size-4 text-muted-foreground transition-transform group-data-panel-open:rotate-90" />
        )}
      </CollapsibleTrigger>
      {expandable && (
        <CollapsibleContent>
          <div className="px-3 pb-3">
            {tool.diff ? (
              <DiffBlock lines={tool.diff} />
            ) : (
              <pre className="overflow-x-auto rounded-md border bg-background/60 px-3 py-2 font-mono text-xs">
                {tool.output}
              </pre>
            )}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}
