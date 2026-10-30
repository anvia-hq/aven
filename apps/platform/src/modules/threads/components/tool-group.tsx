import { Spinner } from "@mynaui/icons-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/collapsible";

import type { ToolPart } from "../types";
import { ToolCall } from "./tool-call";

type Kind = { label: (count: number) => string };

// "a command", "2 commands".
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
const image: Kind = { label: (count) => `showed ${plural(count, "image")}` };
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
    case "show_image":
      return image;
    default:
      return name.startsWith("desktop_") ? desktop : other;
  }
}

// "Ran 2 commands, edited 2 files": one clause per kind of tool, in the order they first appear.
// Edits count distinct files, so two edits to one file read as one.
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

// A run of tool calls, even a run of one, as one row; the calls themselves open inside it, and a
// call that failed is marked there, not on the row: the agent often recovers from one.
export function ToolGroup({ tools }: { tools: ToolPart[] }) {
  const running = tools.some((tool) => tool.status === "running");

  return (
    <Collapsible className="min-w-0 text-sm" defaultOpen={false}>
      <CollapsibleTrigger className="group -mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 py-1 text-left text-muted-foreground hover:bg-muted/50">
        <span className="min-w-0 flex-1 truncate">{summarize(tools)}</span>
        {running && <Spinner className="size-4 animate-spin" />}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-1 flex flex-col border-l pl-3">
          {tools.map((tool) => (
            <ToolCall key={tool.id} tool={tool} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
