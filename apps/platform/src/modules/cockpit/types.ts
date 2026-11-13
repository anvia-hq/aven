import type { TaskPriority, TaskStatus } from "@aven/protocol/types";

export type {
  CockpitActivity,
  CockpitNote,
  CockpitTag,
  CockpitTask,
  InboxItem,
  TaskPriority,
  TaskStatus,
} from "@aven/protocol/types";

export type TaskView = "board" | "list";

export type InboxShown = "open" | "done";

export type TaskOpen = { kind: "new"; initial: Partial<TaskInput> } | { kind: "task"; id: string };

export type NoteInput = { title: string; body?: string; tags?: string[]; pinned?: boolean };

export type TaskInput = {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  tags?: string[];
};

export type TaskPatch = Partial<TaskInput> & { position?: number };
