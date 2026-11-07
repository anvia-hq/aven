import {
  MEMORY_ROOT,
  MEMORY_SCOPES,
  MEMORY_WRITES,
  noteDescription,
  type MemoryCommand,
  type MemoryScope,
} from "@aven/protocol/memory";

import { UnprocessableError } from "../../errors";
import {
  checkName,
  memoryService,
  placesOf,
  type MemoryActor,
  type MemoryOwner,
  type MemoryPlace,
} from "./service";

export type MemoryCaller = { owner: MemoryOwner; actor: MemoryActor; writable: boolean };

type Path = { root: true } | { place: MemoryPlace; name?: string };

const SCOPE_NAMES = new Set<string>(MEMORY_SCOPES);

function parsePath(owner: MemoryOwner, path: string): Path {
  const parts = path.trim().replace(/\/+$/, "").split("/");
  if (parts[0] !== "" || `/${parts[1] ?? ""}` !== MEMORY_ROOT) {
    throw new UnprocessableError(`Memory paths start with ${MEMORY_ROOT}/`);
  }
  if (parts.length === 2) return { root: true };
  const scope = parts[2]!;
  const place = SCOPE_NAMES.has(scope)
    ? placesOf(owner).find((candidate) => candidate.scope === (scope as MemoryScope))
    : undefined;
  if (!place) {
    const folders = placesOf(owner).map((p) => `${MEMORY_ROOT}/${p.scope}`);
    throw new UnprocessableError(`There is no such folder. Yours are ${folders.join(", ")}.`);
  }
  if (parts.length === 3) return { place };
  if (parts.length > 4) throw new UnprocessableError("A folder holds notes, not other folders.");
  return { place, name: checkName(parts[3]!) };
}

function notePath(owner: MemoryOwner, path: string) {
  const parsed = parsePath(owner, path);
  if ("root" in parsed || !parsed.name) {
    throw new UnprocessableError(`${path} is a folder; name a note in it, as ${path}/name.md`);
  }
  return { place: parsed.place, name: parsed.name };
}

const pathOf = (place: MemoryPlace, name: string) => `${MEMORY_ROOT}/${place.scope}/${name}`;

const notFound = (path: string) => new UnprocessableError(`There is no note at ${path}.`);

function numbered(body: string, range?: [number, number]) {
  const lines = body.split("\n");
  const [from, to] = range ?? [1, lines.length];
  const end = to === -1 ? lines.length : Math.min(to, lines.length);
  return lines
    .slice(Math.max(from, 1) - 1, end)
    .map((line, index) => `${String(index + Math.max(from, 1)).padStart(6)}\t${line}`)
    .join("\n");
}

async function view(owner: MemoryOwner, path: string, range?: [number, number]) {
  const parsed = parsePath(owner, path);
  if ("root" in parsed) {
    const folders = await memoryService.folders(owner);
    return [
      `${MEMORY_ROOT}:`,
      ...folders.map(({ scope, notes }) => `- ${MEMORY_ROOT}/${scope}/ (${notes.length} notes)`),
    ].join("\n");
  }
  if (!parsed.name) {
    const notes = await memoryService.notes(parsed.place);
    const folder = `${MEMORY_ROOT}/${parsed.place.scope}`;
    if (notes.length === 0) return `${folder}: no notes yet.`;
    return [
      `${folder}:`,
      ...notes.map((row) => `- ${row.name}: ${noteDescription(row.body)}`),
    ].join("\n");
  }
  const row = await memoryService.read(parsed.place, parsed.name);
  if (!row) throw notFound(path);
  return numbered(row.body, range);
}

function replaceOnce(body: string, oldStr: string, newStr: string, path: string) {
  if (oldStr.length === 0) throw new UnprocessableError("old_str is empty.");
  const first = body.indexOf(oldStr);
  if (first === -1) throw new UnprocessableError(`old_str was not found in ${path}.`);
  if (body.indexOf(oldStr, first + oldStr.length) !== -1) {
    throw new UnprocessableError(
      `old_str is in ${path} more than once; include more of the text around it.`,
    );
  }
  return body.slice(0, first) + newStr + body.slice(first + oldStr.length);
}

function insertAt(body: string, line: number, text: string, path: string) {
  const lines = body.split("\n");
  if (!Number.isInteger(line) || line < 0 || line > lines.length) {
    throw new UnprocessableError(`insert_line must be from 0 to ${lines.length} for ${path}.`);
  }
  lines.splice(line, 0, ...text.replace(/\n$/, "").split("\n"));
  return lines.join("\n");
}

export async function runMemoryCommand(caller: MemoryCaller, command: MemoryCommand) {
  const { owner, actor, writable } = caller;
  if (!writable && (MEMORY_WRITES as readonly string[]).includes(command.command)) {
    throw new UnprocessableError(
      "Your memory can only be read now: this reply was not begun by the person. Tell them what you would keep, if it matters.",
    );
  }
  switch (command.command) {
    case "view":
      return view(owner, command.path, command.viewRange);
    case "create": {
      const { place, name } = notePath(owner, command.path);
      const { created } = await memoryService.write(place, name, command.fileText, actor);
      return created ? `Saved ${pathOf(place, name)}.` : `Replaced ${pathOf(place, name)}.`;
    }
    case "str_replace": {
      const { place, name } = notePath(owner, command.path);
      const path = pathOf(place, name);
      const edited = await memoryService.edit(
        place,
        name,
        (body) => replaceOnce(body, command.oldStr, command.newStr, path),
        actor,
      );
      if (!edited) throw notFound(path);
      return `Edited ${path}.`;
    }
    case "insert": {
      const { place, name } = notePath(owner, command.path);
      const path = pathOf(place, name);
      const edited = await memoryService.edit(
        place,
        name,
        (body) => insertAt(body, command.insertLine, command.insertText, path),
        actor,
      );
      if (!edited) throw notFound(path);
      return `Edited ${path}.`;
    }
    case "delete": {
      const { place, name } = notePath(owner, command.path);
      if (!(await memoryService.remove(place, name, actor))) throw notFound(pathOf(place, name));
      return `Deleted ${pathOf(place, name)}.`;
    }
    case "rename": {
      const from = notePath(owner, command.oldPath);
      const to = notePath(owner, command.newPath);
      if (!(await memoryService.rename(from, to, actor))) {
        throw notFound(pathOf(from.place, from.name));
      }
      return `Moved ${pathOf(from.place, from.name)} to ${pathOf(to.place, to.name)}.`;
    }
  }
}
