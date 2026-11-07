import { Kanban, List, Plus } from "@mynaui/icons-react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/tabs";
import { CockpitPage, withTag } from "@/modules/cockpit/components/cockpit-page";
import { TaskBoard } from "@/modules/cockpit/components/task-board";
import { TaskDrawer } from "@/modules/cockpit/components/task-drawer";
import { TaskTable } from "@/modules/cockpit/components/task-table";
import { useTasks } from "@/modules/cockpit/hooks/use-tasks";
import type { TaskOpen, TaskView } from "@/modules/cockpit/types";

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
  const [open, setOpen] = useState<TaskOpen | null>(null);
  const shown = withTag(tasks, tag);
  const openTask = (task: { id: string }) => setOpen({ kind: "task", id: task.id });

  return (
    <CockpitPage
      title="Tasks"
      tag={tag}
      to="/cockpit/tasks"
      wide
      actions={
        <>
          <Tabs
            value={view}
            onValueChange={(value) =>
              void navigate({
                search: (prev) => ({ ...prev, view: value === "list" ? "list" : undefined }),
              })
            }
          >
            <TabsList aria-label="View">
              <TabsTrigger value="board">
                <Kanban /> Board
              </TabsTrigger>
              <TabsTrigger value="list">
                <List /> List
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            size="sm"
            onClick={() => setOpen({ kind: "new", initial: { tags: tag ? [tag] : [] } })}
          >
            <Plus /> New task
          </Button>
        </>
      }
    >
      {loaded &&
        (view === "board" ? (
          <TaskBoard
            tasks={shown}
            tag={tag}
            onOpen={openTask}
            onNew={(initial) => setOpen({ kind: "new", initial })}
          />
        ) : (
          <TaskTable tasks={shown} onOpen={openTask} />
        ))}
      <TaskDrawer open={open} onClose={() => setOpen(null)} />
    </CockpitPage>
  );
}
