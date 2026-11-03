import { Plus, Trash } from "@mynaui/icons-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/dialog";
import { Field, FieldLabel } from "@/components/field";
import { Form } from "@/components/form";
import { Input } from "@/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/select";
import { Textarea } from "@/components/textarea";

import { useTasks, type TaskInput } from "../hooks/use-tasks";
import type { CockpitTask, TaskPriority, TaskStatus } from "../types";
import { PriorityFlag, StatusDot } from "./task-badges";
import { PRIORITIES, PRIORITY_LABELS, STATUSES, STATUS_LABELS, taskKey } from "./task-fields";
import { TagInput } from "./tag-input";

function TaskForm({
  task,
  initial,
  onDone,
}: {
  task?: CockpitTask;
  /** What a new task starts with, such as the column it was added from. */
  initial?: Partial<TaskInput>;
  onDone: () => void;
}) {
  const { create, update, remove } = useTasks();
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? initial?.status ?? "todo");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "none");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [tags, setTags] = useState<string[]>(task?.tags ?? initial?.tags ?? []);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = {
      title: title.trim(),
      description,
      status,
      priority,
      dueDate: dueDate || null,
      tags,
    };
    setBusy(true);
    try {
      const saved = task ? await update(task, input) : await create(input);
      if (saved) onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Form onSubmit={onSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{task ? `${taskKey(task)} · Edit task` : "New task"}</DialogTitle>
      </DialogHeader>
      <Field>
        <FieldLabel>Title</FieldLabel>
        <Input
          aria-label="Title"
          required
          maxLength={200}
          autoFocus
          value={title}
          placeholder="What needs doing?"
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel>Description</FieldLabel>
        <Textarea
          aria-label="Description"
          value={description}
          placeholder="Details, links, a checklist…"
          onChange={(event) => setDescription(event.target.value)}
          className="max-h-72 min-h-28"
        />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field>
          <FieldLabel>Status</FieldLabel>
          <Select value={status} onValueChange={(value) => setStatus(value as TaskStatus)}>
            <SelectTrigger aria-label="Status" className="w-full">
              <SelectValue>{(value: TaskStatus) => STATUS_LABELS[value]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((each) => (
                <SelectItem key={each} value={each}>
                  <StatusDot status={each} /> {STATUS_LABELS[each]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Priority</FieldLabel>
          <Select value={priority} onValueChange={(value) => setPriority(value as TaskPriority)}>
            <SelectTrigger aria-label="Priority" className="w-full">
              <SelectValue>{(value: TaskPriority) => PRIORITY_LABELS[value]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((each) => (
                <SelectItem key={each} value={each}>
                  <PriorityFlag priority={each} /> {PRIORITY_LABELS[each]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Due</FieldLabel>
          <Input
            aria-label="Due date"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </Field>
      </div>
      <Field>
        <FieldLabel>Tags</FieldLabel>
        <TagInput value={tags} onChange={setTags} />
      </Field>
      <DialogFooter className="sm:justify-between">
        {task ? (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            // Closed only once it is gone: a failure keeps the form, and says why.
            onClick={async () => {
              if (await remove(task)) onDone();
            }}
          >
            <Trash /> Delete
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={busy || !title.trim()}>
          {task ? "Save" : "Create task"}
        </Button>
      </DialogFooter>
    </Form>
  );
}

// The button that makes a task, and the form it opens.
export function NewTaskDialog({
  initial,
  trigger,
}: {
  initial?: Partial<TaskInput>;
  trigger?: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger ?? <Button size="sm" />}>
        <Plus />
        {!trigger && "New task"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        {open && <TaskForm initial={initial} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

// The same form for a task there already, opened from its card or row.
export function EditTaskDialog({
  task,
  onOpenChange,
}: {
  task: CockpitTask | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={task !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {task && <TaskForm task={task} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
