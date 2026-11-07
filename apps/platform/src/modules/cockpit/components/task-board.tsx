import { Plus } from "@mynaui/icons-react";
import { Fragment, useState, type DragEvent } from "react";

import { cn } from "cn";

import { Button } from "@/components/button";

import { useTasks, type TaskInput } from "../hooks/use-tasks";
import type { CockpitTask, TaskStatus } from "../types";
import { DueDate, PriorityFlag, StatusDot } from "./task-badges";
import { STATUSES, STATUS_LABELS, taskKey } from "./task-fields";
import { TagList } from "./tag-list";

type DropAt = { status: TaskStatus; index: number };

function positionAt(column: CockpitTask[], index: number) {
  const before = column[index - 1];
  const after = column[index];
  if (before && after) return (before.position + after.position) / 2;
  if (after) return after.position - 1;
  if (before) return before.position + 1;
  return 0;
}

const DropLine = () => <li aria-hidden="true" className="h-0.5 rounded-full bg-primary" />;

function TaskCard({
  task,
  dragging,
  onOpen,
  onDragStart,
  onDragOver,
  onDragEnd,
}: {
  task: CockpitTask;
  dragging: boolean;
  onOpen: () => void;
  onDragStart: () => void;
  onDragOver: (below: boolean) => void;
  onDragEnd: () => void;
}) {
  return (
    <li
      draggable
      aria-label={`${taskKey(task)} ${task.title}`}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", task.id);
        onDragStart();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const box = event.currentTarget.getBoundingClientRect();
        onDragOver(event.clientY > box.top + box.height / 2);
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "cursor-grab rounded-lg border bg-card p-2.5 shadow-xs transition-opacity active:cursor-grabbing",
        dragging && "opacity-40",
      )}
    >
      <Button
        variant="ghost"
        className="h-auto w-full flex-col items-stretch gap-1.5 p-0 text-left font-normal whitespace-normal hover:bg-transparent"
        onClick={onOpen}
      >
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <PriorityFlag priority={task.priority} />
          {taskKey(task)}
        </span>
        <span className="text-sm leading-snug">{task.title}</span>
      </Button>
      {(task.tags.length > 0 || task.dueDate) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <DueDate task={task} />
          <TagList tags={task.tags} to="/cockpit/tasks" />
        </div>
      )}
    </li>
  );
}

export function TaskBoard({
  tasks,
  tag,
  onOpen,
  onNew,
}: {
  tasks: CockpitTask[];
  tag?: string;
  onOpen: (task: CockpitTask) => void;
  onNew: (initial: Partial<TaskInput>) => void;
}) {
  const { update } = useTasks();
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<DropAt | null>(null);

  const columnOf = (status: TaskStatus) =>
    tasks.filter((task) => task.status === status && task.id !== dragged);
  const placeOf = (task: CockpitTask) =>
    tasks.filter((each) => each.status === task.status).findIndex((each) => each.id === task.id);
  const endDrag = () => {
    setDragged(null);
    setDropAt(null);
  };

  function drop(event: DragEvent, status: TaskStatus) {
    event.preventDefault();
    const task = tasks.find((each) => each.id === dragged);
    const at = dropAt?.status === status ? dropAt.index : columnOf(status).length;
    setDragged(null);
    setDropAt(null);
    if (!task) return;
    if (task.status === status && at === placeOf(task)) return;
    void update(task, { status, position: positionAt(columnOf(status), at) });
  }

  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4" role="group" aria-label="Board">
      {STATUSES.map((status) => {
        const column = tasks.filter((task) => task.status === status);
        const shown = columnOf(status);
        return (
          <section
            key={status}
            aria-label={STATUS_LABELS[status]}
            className={cn(
              "flex w-72 shrink-0 flex-col gap-2 rounded-xl bg-muted/50 p-2",
              dropAt?.status === status && "ring-2 ring-ring/40",
            )}
            onDragOver={(event) => {
              event.preventDefault();
              if (dropAt?.status !== status) setDropAt({ status, index: shown.length });
            }}
            onDrop={(event) => drop(event, status)}
          >
            <header className="flex items-center gap-2 px-1">
              <StatusDot status={status} />
              <h2 className="text-sm font-medium">{STATUS_LABELS[status]}</h2>
              <span className="text-xs text-muted-foreground">{column.length}</span>
              <Button
                variant="ghost"
                size="icon-xs"
                className="ml-auto"
                aria-label={`New task in ${STATUS_LABELS[status]}`}
                onClick={() => onNew({ status, tags: tag ? [tag] : [] })}
              >
                <Plus />
              </Button>
            </header>
            <ul className="flex min-h-12 flex-col gap-2">
              {column.map((task) => {
                const index = shown.findIndex((each) => each.id === task.id);
                return (
                  <Fragment key={task.id}>
                    {dropAt?.status === status && dropAt.index === index && dragged && <DropLine />}
                    <TaskCard
                      task={task}
                      dragging={task.id === dragged}
                      onOpen={() => onOpen(task)}
                      onDragStart={() => setDragged(task.id)}
                      onDragOver={(below) => {
                        if (task.id === dragged) setDropAt({ status, index: placeOf(task) });
                        else setDropAt({ status, index: below ? index + 1 : index });
                      }}
                      onDragEnd={endDrag}
                    />
                  </Fragment>
                );
              })}
              {dropAt?.status === status && dropAt.index === shown.length && dragged && (
                <DropLine />
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
