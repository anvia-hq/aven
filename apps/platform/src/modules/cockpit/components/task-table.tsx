import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/select";
import { Button } from "@/components/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/table";
import { timeAgo } from "@/lib/format";

import { useTasks } from "../hooks/use-tasks";
import type { CockpitTask, TaskPriority, TaskStatus } from "../types";
import { DueDate, PriorityFlag, StatusDot } from "./task-badges";
import { PRIORITIES, PRIORITY_LABELS, STATUSES, STATUS_LABELS, taskKey } from "./task-fields";
import { TagList } from "./tag-list";

const statusOrder = (status: TaskStatus) => STATUSES.indexOf(status);

export function TaskTable({
  tasks,
  onOpen,
}: {
  tasks: CockpitTask[];
  onOpen: (task: CockpitTask) => void;
}) {
  const { update } = useTasks();
  const rows = [...tasks].sort(
    (a, b) => statusOrder(a.status) - statusOrder(b.status) || a.position - b.position,
  );
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        No tasks yet.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table aria-label="Tasks">
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">ID</TableHead>
            <TableHead>Title</TableHead>
            <TableHead className="w-40">Status</TableHead>
            <TableHead className="w-36">Priority</TableHead>
            <TableHead className="w-24">Due</TableHead>
            <TableHead className="w-28">Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((task) => (
            <TableRow key={task.id}>
              <TableCell className="text-xs text-muted-foreground">{taskKey(task)}</TableCell>
              <TableCell>
                <div className="flex min-w-48 flex-col gap-1">
                  <Button
                    variant="link"
                    className="h-auto justify-start p-0 text-left font-normal whitespace-normal text-foreground"
                    onClick={() => onOpen(task)}
                  >
                    {task.title}
                  </Button>
                  <TagList tags={task.tags} to="/cockpit/tasks" />
                </div>
              </TableCell>
              <TableCell>
                <Select
                  value={task.status}
                  onValueChange={(value) => void update(task, { status: value as TaskStatus })}
                >
                  <SelectTrigger
                    size="sm"
                    aria-label={`Status of ${taskKey(task)}`}
                    className="w-full"
                  >
                    <SelectValue>
                      {(value: TaskStatus) => (
                        <>
                          <StatusDot status={value} /> {STATUS_LABELS[value]}
                        </>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((each) => (
                      <SelectItem key={each} value={each}>
                        <StatusDot status={each} /> {STATUS_LABELS[each]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Select
                  value={task.priority}
                  onValueChange={(value) => void update(task, { priority: value as TaskPriority })}
                >
                  <SelectTrigger
                    size="sm"
                    aria-label={`Priority of ${taskKey(task)}`}
                    className="w-full"
                  >
                    <SelectValue>
                      {(value: TaskPriority) => (
                        <>
                          <PriorityFlag priority={value} /> {PRIORITY_LABELS[value]}
                        </>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((each) => (
                      <SelectItem key={each} value={each}>
                        <PriorityFlag priority={each} /> {PRIORITY_LABELS[each]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <DueDate task={task} />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {timeAgo(task.updatedAt, true)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
