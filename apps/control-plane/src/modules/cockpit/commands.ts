import {
  COCKPIT_KINDS,
  COCKPIT_WRITES,
  normalizeTag,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "@aven/protocol/cockpit";
import { cockpitMarkdown } from "@aven/protocol/cockpit-markdown";
import { z } from "zod";

import { UnprocessableError } from "@aven/server-kit/errors";
import {
  createInboxBody,
  createNoteBody,
  createTaskBody,
  updateInboxBody,
  updateNoteBody,
  updateTaskBody,
  type UpdateTaskBody,
} from "./schema";
import { cockpitService } from "./service";
import type { CockpitCaller } from "./types";
import type {
  CockpitCommand,
  CockpitKind,
  CockpitNote,
  CockpitTask,
  InboxItem,
} from "@aven/protocol/types";

export const threadCockpit = (userId: string): CockpitCaller => ({
  userId,
  access: "read",
  onPersonsWord: false,
});

const kind = z.enum(COCKPIT_KINDS);
const fields = z
  .object({
    title: z.string(),
    body: z.string(),
    tags: z.array(z.string()),
    status: z.enum(TASK_STATUSES),
    priority: z.enum(TASK_PRIORITIES),
    dueDate: z.string().nullable(),
    done: z.boolean(),
    pinned: z.boolean(),
  })
  .partial()
  .strict();

const command = z.discriminatedUnion("command", [
  z.object({
    command: z.literal("list"),
    kind,
    tag: z.string().optional(),
    query: z.string().optional(),
    status: z.enum(TASK_STATUSES).optional(),
    done: z.boolean().optional(),
  }),
  z.object({ command: z.literal("get"), kind, id: z.string() }),
  z.object({ command: z.literal("tags") }),
  z.object({ command: z.literal("create"), kind, fields: fields.extend({ title: z.string() }) }),
  z.object({ command: z.literal("update"), kind, id: z.string(), fields }),
  z.object({ command: z.literal("delete"), kind, id: z.string() }),
  z.object({ command: z.literal("convert"), id: z.string(), fields: fields.optional() }),
]) satisfies z.ZodType<CockpitCommand>;

const KIND_FIELDS: Record<CockpitKind, readonly string[]> = {
  inbox: ["title", "body", "tags", "done"],
  tasks: ["title", "body", "tags", "status", "priority", "dueDate"],
  notes: ["title", "body", "tags", "pinned"],
};

const LISTED_MAX = 50;
const PREVIEW = 100;
const SHOWN_MAX = 40_000;

type CockpitFields = z.infer<typeof fields>;
type CockpitRecord = InboxItem | CockpitTask | CockpitNote;

const bodyOf = (kind: CockpitKind, record: CockpitRecord) =>
  kind === "tasks" ? (record as CockpitTask).description : (record as InboxItem).body;

const label = (kind: CockpitKind, record: CockpitRecord) =>
  kind === "tasks" ? `T-${(record as CockpitTask).number} ${record.title}` : record.title;

function preview(body: string) {
  const text = cockpitMarkdown(body)
    .replace(/[#>*_`~[\]|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > PREVIEW ? `${text.slice(0, PREVIEW - 1)}…` : text;
}

function invalid(error: z.ZodError) {
  return new UnprocessableError(error.issues.map((issue) => issue.message).join("; "));
}

function checkFields(kind: CockpitKind, given: CockpitFields) {
  const wrong = Object.keys(given).filter((key) => !KIND_FIELDS[kind].includes(key));

  if (wrong.length > 0) {
    throw new UnprocessableError(
      `${kind} has no ${wrong.join(", ")}; its fields are ${KIND_FIELDS[kind].join(", ")}`,
    );
  }
}

function shape(kind: CockpitKind, given: CockpitFields) {
  checkFields(kind, given);
  const { body, ...rest } = given;
  const shaped = kind === "tasks" ? { ...rest, description: body } : { ...rest, body };
  return Object.fromEntries(Object.entries(shaped).filter(([, value]) => value !== undefined));
}

function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value);

  if (!parsed.success) throw invalid(parsed.error);

  return parsed.data;
}

function list(kind: CockpitKind, userId: string): Promise<CockpitRecord[]> {
  return cockpitService[kind].list(userId);
}

async function find(kind: CockpitKind, userId: string, id: string) {
  const records = await list(kind, userId);
  const key = /^t-(\d+)$/i.exec(id.trim());
  const found = key
    ? records.find(
        (record) => kind === "tasks" && (record as CockpitTask).number === Number(key[1]),
      )
    : records.find((record) => record.id === id.trim());

  if (!found) throw new UnprocessableError(`There is no ${kind} record ${id}.`);

  return found;
}

function line(kind: CockpitKind, record: CockpitRecord) {
  const parts = [
    kind === "tasks" ? `T-${(record as CockpitTask).number}` : record.id,
    record.title,
  ];

  if (kind === "tasks") {
    const task = record as CockpitTask;
    parts.push(task.status, `priority ${task.priority}`);

    if (task.dueDate) parts.push(`due ${task.dueDate}`);
  }

  if (kind === "inbox" && (record as InboxItem).done) parts.push("done");

  if (kind === "notes" && (record as CockpitNote).pinned) parts.push("pinned");

  if (record.tags.length > 0) parts.push(`tags ${record.tags.join(", ")}`);

  const text = preview(bodyOf(kind, record));
  return `- ${parts.join(" · ")}${text ? `\n  ${text}` : ""}`;
}

async function listing(userId: string, cmd: Extract<CockpitCommand, { command: "list" }>) {
  if (cmd.status && cmd.kind !== "tasks") throw new UnprocessableError("Only tasks have a status.");

  if (cmd.done !== undefined && cmd.kind !== "inbox") {
    throw new UnprocessableError("Only inbox items are done or open.");
  }

  const tag = cmd.tag === undefined ? undefined : normalizeTag(cmd.tag);
  const needle = cmd.query?.trim().toLowerCase();
  const shown = (await list(cmd.kind, userId)).filter((record) => {
    if (tag && !record.tags.includes(tag)) return false;

    if (cmd.status && (record as CockpitTask).status !== cmd.status) return false;

    if (cmd.done !== undefined && (record as InboxItem).done !== cmd.done) return false;

    if (!needle) return true;

    return `${record.title}\n${cockpitMarkdown(bodyOf(cmd.kind, record))}`
      .toLowerCase()
      .includes(needle);
  });

  if (shown.length === 0) return `No ${cmd.kind} records match.`;

  const lines = [
    `${shown.length} ${cmd.kind} record${shown.length === 1 ? "" : "s"}:`,
    ...shown.slice(0, LISTED_MAX).map((record) => line(cmd.kind, record)),
  ];
  const more = shown.length - LISTED_MAX;

  if (more > 0) lines.push(`…and ${more} more; narrow it with tag, status or query.`);

  return lines.join("\n");
}

function shown(kind: CockpitKind, record: CockpitRecord) {
  const facts = [`id: ${record.id}`, `title: ${record.title}`];

  if (kind === "tasks") {
    const task = record as CockpitTask;
    facts.unshift(`key: T-${task.number}`);
    facts.push(`status: ${task.status}`, `priority: ${task.priority}`);
    facts.push(`due: ${task.dueDate ?? "none"}`);
  }

  if (kind === "inbox") facts.push(`done: ${(record as InboxItem).done}`);

  if (kind === "notes") facts.push(`pinned: ${(record as CockpitNote).pinned}`);

  facts.push(`tags: ${record.tags.join(", ") || "none"}`, `updated: ${record.updatedAt}`);
  const whole = cockpitMarkdown(bodyOf(kind, record)).trim();
  const body =
    whole.length > SHOWN_MAX
      ? `${whole.slice(0, SHOWN_MAX)}\n\n[cut: the body is ${whole.length} characters; this is the first ${SHOWN_MAX}]`
      : whole;
  return `${facts.join("\n")}\n\n${body || "(no body)"}`;
}

async function placed(userId: string, task: CockpitTask, changes: UpdateTaskBody) {
  if (!changes.status || changes.status === task.status) return changes;

  const column = (await cockpitService.tasks.list(userId)).filter(
    (each) => each.status === changes.status,
  );
  const top = Math.min(...column.map((each) => each.position));
  return { ...changes, position: column.length > 0 ? top - 1 : 0 };
}

async function create(userId: string, kind: CockpitKind, given: CockpitFields) {
  const values = shape(kind, given);

  if (kind === "tasks") return cockpitService.tasks.create(userId, parse(createTaskBody, values));

  if (kind === "notes") return cockpitService.notes.create(userId, parse(createNoteBody, values));

  const { done, ...rest } = values;
  const made = await cockpitService.inbox.create(userId, parse(createInboxBody, rest));
  return done === true ? cockpitService.inbox.update(userId, made.id, { done: true }) : made;
}

async function update(
  userId: string,
  kind: CockpitKind,
  record: CockpitRecord,
  given: CockpitFields,
) {
  const values = shape(kind, given);

  if (kind === "tasks") {
    const changes = await placed(userId, record as CockpitTask, parse(updateTaskBody, values));
    return cockpitService.tasks.update(userId, record.id, changes);
  }

  if (kind === "notes") {
    return cockpitService.notes.update(userId, record.id, parse(updateNoteBody, values));
  }

  return cockpitService.inbox.update(userId, record.id, parse(updateInboxBody, values));
}

async function convert(userId: string, id: string, given: CockpitFields = {}) {
  const item = (await find("inbox", userId, id)) as InboxItem;

  if (item.done) {
    throw new UnprocessableError(
      `${label("inbox", item)} is already done, so it was probably converted; look for its task, or set it to not done first.`,
    );
  }

  const values = shape("tasks", {
    ...given,
    title: given.title ?? item.title,
    body: given.body ?? item.body,
    tags: given.tags ?? item.tags,
  });
  const task = await cockpitService.tasks.create(userId, parse(createTaskBody, values));
  await cockpitService.inbox.update(userId, item.id, { done: true });
  return `Converted ${label("inbox", item)} into ${label("tasks", task)} (id ${task.id}); the inbox item is marked done.`;
}

export async function runCockpitCommand(caller: CockpitCaller, raw: unknown) {
  const parsed = command.safeParse(raw);

  if (!parsed.success) throw invalid(parsed.error);

  const cmd = parsed.data;
  const { userId } = caller;

  if (caller.access === "read" && (COCKPIT_WRITES as readonly string[]).includes(cmd.command)) {
    throw new UnprocessableError(
      "You can only read the person's cockpit here; tell them what to add or change.",
    );
  }

  switch (cmd.command) {
    case "list":
      return listing(userId, cmd);
    case "get":
      return shown(cmd.kind, await find(cmd.kind, userId, cmd.id));
    case "tags": {
      const tags = await cockpitService.tags(userId);

      if (tags.length === 0) return "The person has no tags yet.";

      return tags
        .map((tag) => `- ${tag.name}: ${tag.inbox} inbox, ${tag.tasks} tasks, ${tag.notes} notes`)
        .join("\n");
    }
    case "create": {
      const made = await create(userId, cmd.kind, cmd.fields);
      return `Created ${label(cmd.kind, made)} (id ${made.id}).`;
    }
    case "update": {
      const record = await find(cmd.kind, userId, cmd.id);
      const changed = await update(userId, cmd.kind, record, cmd.fields);
      return `Updated ${label(cmd.kind, changed)}.`;
    }
    case "convert":
      return convert(userId, cmd.id, cmd.fields);
    case "delete": {
      if (!caller.onPersonsWord) {
        throw new UnprocessableError(
          "Delete from the cockpit only when the person asks you to in their own message.",
        );
      }

      const record = await find(cmd.kind, userId, cmd.id);
      await cockpitService[cmd.kind].remove(userId, record.id);
      return `Deleted ${label(cmd.kind, record)}.`;
    }
  }
}
