import { Kanban, List } from "@mynaui/icons-react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/toggle-group";
import { CockpitPage, withTag } from "@/modules/cockpit/components/cockpit-page";
import { TaskBoard } from "@/modules/cockpit/components/task-board";
import { EditTaskDialog, NewTaskDialog } from "@/modules/cockpit/components/task-dialog";
import { TaskTable } from "@/modules/cockpit/components/task-table";
import { useTasks } from "@/modules/cockpit/hooks/use-tasks";
import type { TaskView } from "@/modules/cockpit/types";

export const Route = createFileRoute("/_authed/cockpit/tasks")({
  validateSearch: (search: Record<string, unknown>): { tag?: string; view?: TaskView } => ({
    tag: typeof search.tag === "string" && search.tag !== "" ? search.tag : undefined,
    view: search.view === "list" ? "list" : undefined,
  }),
  component: TasksPage,
});

function TasksPage() {
  const { tag, view = "board" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { tasks, loaded } = useTasks();
  const [editing, setEditing] = useState<string | null>(null);
  const shown = withTag(tasks, tag);
  // The task as it is now, so the form opens on what the board last saved.
  const open = tasks.find((task) => task.id === editing) ?? null;

  return (
    <CockpitPage
      title="Tasks"
      tag={tag}
      to="/cockpit/tasks"
      wide
      actions={
        <>
          <ToggleGroup
            aria-label="View"
            value={[view]}
            onValueChange={(value: string[]) =>
              value[0] &&
              void navigate({
                search: (prev) => ({ ...prev, view: value[0] === "list" ? "list" : undefined }),
              })
            }
            variant="outline"
            size="sm"
            spacing={0}
          >
            <ToggleGroupItem value="board" aria-label="Board">
              <Kanban /> Board
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List">
              <List /> List
            </ToggleGroupItem>
          </ToggleGroup>
          <NewTaskDialog initial={{ tags: tag ? [tag] : [] }} />
        </>
      }
    >
      {loaded &&
        (view === "board" ? (
          <TaskBoard tasks={shown} tag={tag} onOpen={(task) => setEditing(task.id)} />
        ) : (
          <TaskTable tasks={shown} onOpen={(task) => setEditing(task.id)} />
        ))}
      <EditTaskDialog task={open} onOpenChange={(isOpen) => !isOpen && setEditing(null)} />
    </CockpitPage>
  );
}
