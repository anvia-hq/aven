import { Calendar, CircleDashed, Flag, Tag, Trash, X } from "@mynaui/icons-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/drawer";
import { DropdownMenuItem } from "@/components/dropdown-menu";
import { Input } from "@/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/select";
import { timeAgo } from "@/lib/format";

import { useAutosave } from "../hooks/use-autosave";
import { useTasks, type TaskInput } from "../hooks/use-tasks";
import type { CockpitTask, TaskPriority, TaskStatus } from "../types";
import {
  Crumb,
  CurrentCrumb,
  DocumentBody,
  DocumentPage,
  DocumentTitle,
  MoreMenu,
  Properties,
  Property,
} from "./document-page";
import { PriorityFlag, StatusDot } from "./task-badges";
import { PRIORITIES, PRIORITY_LABELS, STATUSES, STATUS_LABELS, taskKey } from "./task-fields";
import { TagInput } from "./tag-input";

/** What the drawer has open: a task being started, or one there is. */
export type TaskOpen = { kind: "new"; initial: Partial<TaskInput> } | { kind: "task"; id: string };

type Fields = {
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  tags: string[];
};

// A field of the properties, quiet until hovered, as Notion's are.
const QUIET =
  "h-8 w-auto border-0 bg-transparent px-1 shadow-none hover:bg-muted/60 dark:bg-transparent dark:hover:bg-muted/60";

// A due day, typed or picked. What is typed passes through years such as 0002: the field shows
// it, and only a whole date, or none, is kept.
function DueInput({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const [typed, setTyped] = useState(value ?? "");
  return (
    <Input
      aria-label="Due date"
      type="date"
      value={typed}
      onChange={(event) => {
        const next = event.target.value;
        setTyped(next);
        if (next === "" || /^[1-9]\d{3}-\d{2}-\d{2}$/.test(next)) onChange(next || null);
      }}
      className={`${QUIET} text-sm md:text-sm`}
    />
  );
}

// A task's status, priority, due day and tags, label beside value.
function TaskProperties({
  value,
  onChange,
}: {
  value: Fields;
  onChange: (patch: Partial<Fields>) => void;
}) {
  return (
    <Properties>
      <Property icon={CircleDashed} label="Status">
        <Select
          value={value.status}
          onValueChange={(next) => onChange({ status: next as TaskStatus })}
        >
          <SelectTrigger aria-label="Status" className={QUIET}>
            <SelectValue>
              {(status: TaskStatus) => (
                <>
                  <StatusDot status={status} /> {STATUS_LABELS[status]}
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
      </Property>
      <Property icon={Flag} label="Priority">
        <Select
          value={value.priority}
          onValueChange={(next) => onChange({ priority: next as TaskPriority })}
        >
          <SelectTrigger aria-label="Priority" className={QUIET}>
            <SelectValue>
              {(priority: TaskPriority) => (
                <>
                  <PriorityFlag priority={priority} /> {PRIORITY_LABELS[priority]}
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
      </Property>
      <Property icon={Calendar} label="Due">
        <DueInput value={value.dueDate} onChange={(dueDate) => onChange({ dueDate })} />
      </Property>
      <Property icon={Tag} label="Tags">
        <TagInput bare value={value.tags} onChange={(tags) => onChange({ tags })} />
      </Property>
    </Properties>
  );
}

// A task there is, as a page: every change saved as it is made, as a note's are.
function TaskPage({ task, onClose }: { task: CockpitTask; onClose: () => void }) {
  const { update, remove } = useTasks();
  const [title, setTitle] = useState(task.title);
  const saveTitle = useAutosave((value: string) => {
    if (value.trim() && value.trim() !== task.title) void update(task, { title: value.trim() });
  });
  const saveBody = useAutosave((description: string) => void update(task, { description }));

  return (
    <DocumentPage
      label={`${taskKey(task)} ${task.title}`}
      onBack={onClose}
      backLabel="Back to the tasks"
      trail={
        <>
          <Crumb onClick={onClose}>Tasks</Crumb>
          <CurrentCrumb>{taskKey(task)}</CurrentCrumb>
        </>
      }
      actions={
        <>
          <span className="mr-2 hidden text-xs text-muted-foreground sm:inline">
            Edited {timeAgo(task.updatedAt, true)}
          </span>
          <MoreMenu>
            <DropdownMenuItem
              variant="destructive"
              onClick={async () => {
                saveTitle.cancel();
                saveBody.cancel();
                if (await remove(task)) onClose();
              }}
            >
              <Trash /> Delete task
            </DropdownMenuItem>
          </MoreMenu>
          <CloseButton />
        </>
      }
    >
      <DocumentTitle
        value={title}
        onChange={(value) => {
          setTitle(value);
          saveTitle.schedule(value);
        }}
        onCommit={() => {
          saveTitle.flush();
          if (!title.trim()) setTitle(task.title);
        }}
      />
      <TaskProperties value={task} onChange={(patch) => void update(task, patch)} />
      <DocumentBody
        key={task.id}
        label="Description"
        value={task.description}
        placeholder="Add a description, or press '/' for blocks"
        onChange={saveBody.schedule}
      />
    </DocumentPage>
  );
}

// A task being started: kept only when Create task (or ⌘/Ctrl+Enter) makes it, as an inbox item's
// draft is.
function NewTaskPage({
  initial,
  onDone,
  onWritten,
}: {
  initial: Partial<TaskInput>;
  onDone: () => void;
  /** Whether something is written in it, which a stray close must not throw away. */
  onWritten: (written: boolean) => void;
}) {
  const { create } = useTasks();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  useEffect(
    () => onWritten(title.trim() !== "" || description !== ""),
    [title, description, onWritten],
  );
  const [fields, setFields] = useState<Fields>({
    status: initial.status ?? "todo",
    priority: initial.priority ?? "none",
    dueDate: initial.dueDate ?? null,
    tags: initial.tags ?? [],
  });
  const [busy, setBusy] = useState(false);
  const ready = title.trim() !== "" && !busy;

  async function save() {
    if (!ready) return;
    setBusy(true);
    try {
      if (await create({ title: title.trim(), description, ...fields })) onDone();
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void save();
    }
  }

  return (
    <DocumentPage
      label="New task"
      onBack={onDone}
      backLabel="Back to the tasks"
      trail={
        <>
          <Crumb onClick={onDone}>Tasks</Crumb>
          <CurrentCrumb>New</CurrentCrumb>
        </>
      }
      actions={
        <>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onDone}>
            Cancel
          </Button>
          <Button size="sm" disabled={!ready} onClick={() => void save()}>
            Create task
          </Button>
        </>
      }
    >
      <div onKeyDown={onKeyDown}>
        <DocumentTitle value={title} autoFocus onChange={setTitle} onCommit={() => {}} />
        <TaskProperties
          value={fields}
          onChange={(patch) => setFields((before) => ({ ...before, ...patch }))}
        />
        <DocumentBody
          key="new"
          label="Description"
          value=""
          placeholder="Add a description, or press '/' for blocks"
          onChange={setDescription}
        />
      </div>
    </DocumentPage>
  );
}

const CloseButton = () => (
  <DrawerClose
    render={
      <Button variant="ghost" size="icon-sm" aria-label="Close" className="text-muted-foreground" />
    }
  >
    <X />
  </DrawerClose>
);

// A task opened from the board or the table, or started, in a drawer from the right
// (decision 0108), laid out as a cockpit page.
// The ways a drawer closes by accident rather than by its Cancel or Close: a tap outside, a swipe,
// Escape.
const STRAY = new Set(["outside-press", "swipe", "escape-key", "close-watcher", "focus-out"]);

export function TaskDrawer({ open, onClose }: { open: TaskOpen | null; onClose: () => void }) {
  const { tasks } = useTasks();
  const written = useRef(false);
  const onWritten = useCallback((value: boolean) => {
    written.current = value;
  }, []);
  // What was open stays drawn while the drawer slides away.
  const last = useRef(open);
  if (open) last.current = open;
  const shown = open ?? last.current;
  const task = shown?.kind === "task" ? tasks.find((each) => each.id === shown.id) : undefined;
  const isOpen = open !== null && (open.kind === "new" || task !== undefined);

  return (
    <Drawer
      open={isOpen}
      onOpenChange={(next, details) => {
        if (next) return;
        // A new task with something in it is not dropped by a stray close without asking.
        const draft = shown?.kind === "new" && written.current;
        if (draft && STRAY.has(details.reason) && !window.confirm("Discard this new task?")) {
          return details.cancel();
        }
        written.current = false;
        onClose();
      }}
      swipeDirection="right"
    >
      <DrawerContent className="[--doc-surface:var(--color-popover)] data-[swipe-axis=x]:[--drawer-content-width:100%] data-[swipe-axis=x]:sm:[--drawer-content-width:min(44rem,90vw)]">
        <DrawerTitle className="sr-only">{task ? taskKey(task) : "New task"}</DrawerTitle>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {shown?.kind === "new" && (
            <NewTaskPage initial={shown.initial} onDone={onClose} onWritten={onWritten} />
          )}
          {task && <TaskPage key={task.id} task={task} onClose={onClose} />}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
