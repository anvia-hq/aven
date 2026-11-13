import type { CockpitCommand, CockpitKind, CockpitActivity } from "@aven/protocol/types";
import type { CockpitActor } from "./types";

const ONE: Record<CockpitKind, string> = {
  inbox: "an inbox item",
  tasks: "a task",
  notes: "a note",
};

const ALL: Record<CockpitKind, string> = {
  inbox: "your inbox",
  tasks: "your tasks",
  notes: "your notes",
};

const titled = (title: string | undefined) => (title ? ` "${title}"` : "");

export function cockpitActivityOf(actor: CockpitActor, command: CockpitCommand): CockpitActivity {
  const said = { actor: actor.kind, source: actor.name, at: new Date().toISOString() };

  switch (command.command) {
    case "list":
      return { ...said, summary: `looked at ${ALL[command.kind]}`, changed: false };
    case "get":
      return { ...said, summary: `read ${ONE[command.kind]}`, changed: false };
    case "tags":
      return { ...said, summary: "looked at your tags", changed: false };
    case "create":
      return {
        ...said,
        summary: `added ${ONE[command.kind]}${titled(command.fields.title)}`,
        changed: true,
      };
    case "update":
      return {
        ...said,
        summary: `changed ${ONE[command.kind]}${titled(command.fields.title)}`,
        changed: true,
      };
    case "delete":
      return { ...said, summary: `deleted ${ONE[command.kind]}`, changed: true };
    case "convert":
      return { ...said, summary: "turned an inbox item into a task", changed: true };
  }
}
