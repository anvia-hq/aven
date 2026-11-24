import type { Block, TimelineItem, ToolPart } from "./types";

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
const webPage: Kind = { label: (count) => `read ${plural(count, "web page")}` };
const image: Kind = {
  label: (count) => (count === 1 ? "inspected an image" : `inspected ${count} images`),
};
const browser: Kind = { label: () => "used the browser" };
const subagent: Kind = { label: (count) => `ran ${plural(count, "subagent")}` };
const tasks: Kind = { label: () => "updated the task list" };
const artifacts: Kind = { label: () => "showed files" };
const fetch: Kind = { label: () => "fetched from GitHub" };
const computer: Kind = {
  label: (count) => (count === 1 ? "used the computer" : `used the computer ${count} times`),
};
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
    case "apply_patch":
      return edit;
    case "read_file":
    case "read_project_file":
      return read;
    case "list_files":
      return list;
    case "web_search":
    case "grep":
    case "find":
    case "glob":
    case "search_files":
      return search;
    case "web_fetch":
      return webPage;
    case "view_image":
      return image;
    case "open_browser":
      return browser;
    case "spawn_agent":
    case "fork_thread":
    case "wait_for_forks":
      return subagent;
    case "todo_write":
      return tasks;
    case "show_artifact":
    case "show_image":
      return artifacts;
    case "git_fetch":
      return fetch;
    case "computer_status":
    case "computer_wake":
      return computer;
    default:
      return other;
  }
}

export function summarizeTools(tools: readonly ToolPart[]) {
  if (tools.length === 0) return "Thought";

  const counts = new Map<Kind, number>();
  const editedFiles = new Set<string>();
  for (const tool of tools) {
    const kind = kindOf(tool.name);

    if (kind === edit) {
      editedFiles.add(tool.target || tool.id);
      counts.set(kind, editedFiles.size);
    } else {
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
  }
  const text = [...counts].map(([kind, count]) => kind.label(count)).join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function summarizeTimelineItems(items: readonly TimelineItem[]) {
  return summarizeTools(items.flatMap((item) => item.tools));
}

export function summarizeBlocks(blocks: readonly Block[]) {
  const tools = blocks.flatMap((block) => {
    if (block.type === "tools") {
      return block.entries.flatMap((entry) => (entry.type === "tool" ? [entry.tool] : []));
    }

    if (block.type === "subagents") return [block.tool];

    return [];
  });
  return summarizeTools(tools);
}
