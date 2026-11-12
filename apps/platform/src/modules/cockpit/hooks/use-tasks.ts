import { toast } from "@/components/toast";

import { tasksAtom } from "../atoms/cockpit-atoms";
import type { CockpitTask, TaskInput, TaskPatch } from "../types";
import { createCollection } from "./use-collection";

const byPosition = (tasks: CockpitTask[]) =>
  [...tasks].sort((a, b) => a.position - b.position || b.number - a.number);

const tasks = createCollection<CockpitTask, TaskInput, TaskPatch>({
  path: "/cockpit/tasks",
  atom: tasksAtom,
  label: "tasks",
  order: byPosition,
});

export const resetTasks = tasks.reset;
export const refreshTasks = tasks.refreshLoaded;

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
    update(task: CockpitTask, patch: TaskPatch) {
      const moving = patch.status !== undefined && patch.status !== task.status;

      if (moving && patch.position === undefined) {
        const column = items.filter((each) => each.status === patch.status);
        const top = Math.min(...column.map((each) => each.position));
        patch = { ...patch, position: column.length > 0 ? top - 1 : 0 };
      }

      return tasks.update(task, patch, "Could not save the task");
    },
    async remove(task: CockpitTask) {
      const removed = await tasks.remove(task, "Could not delete the task");

      if (removed) toast.add({ title: `Deleted T-${task.number}`, description: task.title });

      return removed;
    },
  };
}
