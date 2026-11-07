import { cn } from "cn";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/collapsible";

import type { ToolGroupEntry, ToolPart } from "../types";
import { ReasoningBlock } from "./reasoning-block";
import { ToolCall } from "./tool-call";

type Kind = { label: (count: number) => string };

const plural = (count: number, one: string, many = `${one}s`) =>
  count === 1 ? `a ${one}` : `${count} ${many}`;

const command: Kind = { label: (count) => `ran ${plural(count, "command")}` };
const processes: Kind = { label: () => "checked processes" };
const edit: Kind = { label: (count) => `edited ${plural(count, "file")}` };
const read: Kind = { label: (count) => `read ${plural(count, "file")}` };
const list: Kind = { label: (count) => `listed ${plural(count, "directory", "directories")}` };
const search: Kind = {
  label: (count) => (count === 1 ? "searched once" : `searched ${count} times`),
};
const desktop: Kind = { label: (count) => plural(count, "desktop action") };
const artifacts: Kind = { label: () => "showed files" };
const fetch: Kind = { label: () => "fetched from GitHub" };
const environment: Kind = { label: () => "saved the environment" };
const other: Kind = { label: (count) => `used ${plural(count, "tool")}` };

function kindOf(name: string): Kind {
  switch (name) {
    case "exec_command":
    case "start_process":
      return command;
    case "list_processes":
    case "read_process_logs":
    case "stop_process":
    case "wait_for_port":
    case "wait_for_process":
    case "list_ports":
      return processes;
    case "edit":
    case "write_file":
      return edit;
    case "read_file":
      return read;
    case "list_files":
      return list;
    case "web_search":
      return search;
    case "show_artifact":
    case "show_image":
      return artifacts;
    case "git_fetch":
      return fetch;
    case "save_environment":
      return environment;
    default:
      return name.startsWith("desktop_") ? desktop : other;
  }
}

function summarize(tools: ToolPart[]) {
  const counts = new Map<Kind, number>();
  const editedFiles = new Set<string>();
  for (const tool of tools) {
    const kind = kindOf(tool.name);
    if (kind === edit) {
      editedFiles.add(tool.target);
      counts.set(kind, editedFiles.size);
    } else {
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
  }
  const text = [...counts].map(([kind, count]) => kind.label(count)).join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function ToolGroup({
  entries,
  live = false,
}: {
  entries: ToolGroupEntry[];
  live?: boolean;
}) {
  const tools = entries.flatMap((entry) => (entry.type === "tool" ? [entry.tool] : []));
  const running = tools.some((tool) => tool.status === "running");
  const thinking = (index: number) => live && index === entries.length - 1;

  if (tools.length === 0) {
    return entries.map((entry, index) =>
      entry.type === "reasoning" ? (
        <ReasoningBlock key={index} text={entry.text} thinking={thinking(index)} />
      ) : null,
    );
  }

  return (
    <Collapsible className="min-w-0 text-sm" defaultOpen={false}>
      <CollapsibleTrigger className="group -mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 py-1 text-left text-muted-foreground hover:bg-muted/50">
        <span className={cn("min-w-0 flex-1 truncate font-medium", running && "shimmer")}>
          {summarize(tools)}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-1 flex flex-col border-l pl-3">
          {entries.map((entry, index) =>
            entry.type === "reasoning" ? (
              <ReasoningBlock key={index} text={entry.text} thinking={thinking(index)} />
            ) : (
              <ToolCall key={entry.tool.id} tool={entry.tool} />
            ),
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
