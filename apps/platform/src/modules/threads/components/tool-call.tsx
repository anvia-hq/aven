import { DangerCircle } from "@mynaui/icons-react";

import { cn } from "cn";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@aven/ui/collapsible";
import { DiffStat } from "@/modules/diff/components/diff-stat";

import { toolFailureNotice } from "../tool-failure";
import type { ToolPart } from "../types";
import { DiffBlock } from "./diff-block";

type Meta = { running: string; done: string };

const meta: Record<string, Meta> = {
  read_file: { running: "Reading", done: "Read" },
  write_file: { running: "Writing", done: "Wrote" },
  edit: { running: "Editing", done: "Edited" },
  list_files: { running: "Listing", done: "Listed" },
  exec_command: { running: "Running", done: "Ran" },
  start_process: { running: "Starting", done: "Started" },
  list_processes: { running: "Listing processes", done: "Listed processes" },
  wait_for_process: { running: "Waiting for", done: "Waited for" },
  read_process_logs: { running: "Reading logs of", done: "Read logs of" },
  stop_process: { running: "Stopping", done: "Stopped" },
  wait_for_forks: { running: "Waiting for forks", done: "Waited for forks" },
  wait_for_port: { running: "Waiting for port", done: "Port ready" },
  list_ports: { running: "Listing ports", done: "Listed ports" },
  web_search: { running: "Searching", done: "Searched" },
  show_artifact: { running: "Showing", done: "Showed" },
  show_image: { running: "Showing", done: "Showed" },
  git_fetch: { running: "Fetching", done: "Fetched" },
  computer_status: { running: "Checking the computer", done: "Checked the computer" },
  computer_wake: { running: "Waking the computer", done: "Woke the computer" },
};

const fallback = (name: string): Meta => ({
  running: `Running ${name}`,
  done: `Ran ${name}`,
});

export function ToolCall({ tool }: { tool: ToolPart }) {
  const { running, done } = meta[tool.name] ?? fallback(tool.name);
  const notice = tool.status === "error" ? toolFailureNotice(tool.output) : undefined;
  const additions = tool.diff?.filter((line) => line.type === "add").length ?? 0;
  const deletions = tool.diff?.filter((line) => line.type === "del").length ?? 0;
  const expandable = Boolean(tool.diff?.length || tool.output);

  return (
    <Collapsible className="min-w-0 text-sm" defaultOpen={false}>
      <CollapsibleTrigger
        disabled={!expandable}
        className="group flex w-fit max-w-full items-center gap-2 py-1 text-left disabled:cursor-default"
      >
        <span
          className={cn(
            notice ? "text-destructive" : "text-muted-foreground",
            tool.status === "running" && "shimmer",
          )}
        >
          {tool.status === "running" ? running : (notice ?? done)}
        </span>
        <span
          className={cn(
            "min-w-0 max-w-[36ch] truncate font-mono text-xs text-muted-foreground/60",
            tool.status === "running" && "shimmer",
          )}
        >
          {tool.target}
        </span>
        {tool.diff && (
          <span className="font-mono text-xs">
            <DiffStat additions={additions} deletions={deletions} />
          </span>
        )}
        {tool.status === "error" && (
          <DangerCircle className="size-4 text-destructive" aria-label="Failed" />
        )}
      </CollapsibleTrigger>
      {expandable && (
        <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 ease-out data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none">
          <div className="pt-1 pb-2">
            {tool.diff ? (
              <DiffBlock lines={tool.diff} />
            ) : (
              <pre
                className={cn(
                  "max-h-60 overflow-auto rounded-lg border bg-muted/30 px-3 py-2 font-mono text-xs leading-5",
                  tool.status === "error" && "border-destructive/30 text-destructive",
                )}
              >
                {tool.output}
              </pre>
            )}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}
