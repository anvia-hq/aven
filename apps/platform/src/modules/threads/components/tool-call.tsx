import {
  CheckCircle,
  ChevronRight,
  Edit,
  DangerCircle,
  Eye,
  Search,
  Spinner,
  Terminal,
} from "@mynaui/icons-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/collapsible";

import type { ToolPart } from "../types";
import { DiffBlock } from "./diff-block";

type Meta = { icon: typeof Eye; running: string; done: string };

const meta: Record<string, Meta> = {
  read: { icon: Eye, running: "Reading", done: "Read" },
  write: { icon: Edit, running: "Writing", done: "Wrote" },
  edit: { icon: Edit, running: "Editing", done: "Edited" },
  shell: { icon: Terminal, running: "Running", done: "Ran" },
  shell_output: { icon: Terminal, running: "Reading output of", done: "Read output of" },
  shell_kill: { icon: Terminal, running: "Stopping", done: "Stopped" },
  web_search: { icon: Search, running: "Searching", done: "Searched" },
};

const fallback = (name: string): Meta => ({
  icon: Terminal,
  running: `Running ${name}`,
  done: `Ran ${name}`,
});

export function ToolCall({ tool }: { tool: ToolPart }) {
  const { icon: Icon, running, done } = meta[tool.name] ?? fallback(tool.name);
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
        {tool.status === "running" && (
          <Spinner className="size-4 animate-spin text-muted-foreground" />
        )}
        {tool.status === "done" && <CheckCircle className="size-4 text-success" />}
        {tool.status === "error" && (
          <DangerCircle className="size-4 text-destructive" aria-label="Failed" />
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
