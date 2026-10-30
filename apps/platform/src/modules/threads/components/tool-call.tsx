import {
  Edit,
  DangerCircle,
  Eye,
  Image as ImageIcon,
  Search,
  Spinner,
  Terminal,
} from "@mynaui/icons-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/collapsible";
import { DiffStat } from "@/modules/diff/components/diff-stat";

import type { ToolPart } from "../types";
import { DiffBlock } from "./diff-block";

type Meta = { icon: typeof Eye; running: string; done: string };

// The agent's tools: the sandbox's own (@anvia/sandbox), our edit, and web search.
const meta: Record<string, Meta> = {
  read_file: { icon: Eye, running: "Reading", done: "Read" },
  write_file: { icon: Edit, running: "Writing", done: "Wrote" },
  edit: { icon: Edit, running: "Editing", done: "Edited" },
  list_files: { icon: Eye, running: "Listing", done: "Listed" },
  exec_command: { icon: Terminal, running: "Running", done: "Ran" },
  start_process: { icon: Terminal, running: "Starting", done: "Started" },
  list_processes: { icon: Terminal, running: "Listing processes", done: "Listed processes" },
  read_process_logs: { icon: Terminal, running: "Reading logs of", done: "Read logs of" },
  stop_process: { icon: Terminal, running: "Stopping", done: "Stopped" },
  wait_for_port: { icon: Terminal, running: "Waiting for port", done: "Port ready" },
  list_ports: { icon: Terminal, running: "Listing ports", done: "Listed ports" },
  web_search: { icon: Search, running: "Searching", done: "Searched" },
  show_image: { icon: ImageIcon, running: "Showing", done: "Showed" },
};

// The desktop tools are `desktop_<action>`; anything else unknown is shown by its name.
const fallback = (name: string): Meta => {
  if (!name.startsWith("desktop_")) {
    return { icon: Terminal, running: `Running ${name}`, done: `Ran ${name}` };
  }
  const action = name.slice("desktop_".length).replaceAll("_", " ");
  return { icon: Eye, running: `Desktop: ${action}`, done: `Desktop: ${action}` };
};

export function ToolCall({ tool }: { tool: ToolPart }) {
  const { icon: Icon, running, done } = meta[tool.name] ?? fallback(tool.name);
  const additions = tool.diff?.filter((line) => line.type === "add").length ?? 0;
  const deletions = tool.diff?.filter((line) => line.type === "del").length ?? 0;
  const expandable = Boolean(tool.diff?.length || tool.output);

  return (
    <Collapsible className="min-w-0 text-sm" defaultOpen={false}>
      <CollapsibleTrigger
        disabled={!expandable}
        className="group -mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-muted/50 disabled:cursor-default disabled:hover:bg-transparent"
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-muted-foreground">{tool.status === "running" ? running : done}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{tool.target}</span>
        {tool.diff && (
          <span className="font-mono text-xs">
            <DiffStat additions={additions} deletions={deletions} />
          </span>
        )}
        {tool.status === "running" && (
          <Spinner className="size-4 animate-spin text-muted-foreground" />
        )}
        {tool.status === "error" && (
          <DangerCircle className="size-4 text-destructive" aria-label="Failed" />
        )}
      </CollapsibleTrigger>
      {expandable && (
        <CollapsibleContent>
          <div className="px-2 pb-2">
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
