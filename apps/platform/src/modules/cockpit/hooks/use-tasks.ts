import { toast } from "@/components/toast";

import { tasksAtom } from "../atoms/cockpit-atoms";
import type { CockpitTask, TaskPriority, TaskStatus } from "../types";
import { createCollection } from "./use-collection";

export type TaskInput = {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  tags?: string[];
};

export type TaskPatch = Partial<TaskInput> & { position?: number };

const byPosition = (tasks: CockpitTask[]) =>
  [...tasks].sort((a, b) => a.position - b.position || b.number - a.number);

const tasks = createCollection<CockpitTask, TaskInput, TaskPatch>({
  path: "/cockpit/tasks",
  atom: tasksAtom,
  label: "tasks",
  order: byPosition,
});

export const resetTasks = tasks.reset;

// The person's tasks, in their columns' order.
export function useTasks() {
  const { items, loaded } = tasks.useItems();
  return {
    tasks: items,
    loaded,
    async create(input: TaskInput) {
      const made = await tasks.create(input, "Could not create the task");
      if (made)
        toast.add({ title: `Created T-${made.number}`, description: made.title, type: "success" });
      return made;
    },
    update: (task: CockpitTask, patch: TaskPatch) =>
      tasks.update(task, patch, "Could not save the task"),
    async remove(task: CockpitTask) {
      if (await tasks.remove(task, "Could not delete the task")) {
        toast.add({ title: `Deleted T-${task.number}`, description: task.title });
      }
    },
  };
}
