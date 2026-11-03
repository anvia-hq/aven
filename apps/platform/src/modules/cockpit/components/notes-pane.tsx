import { Pin, Plus, Search } from "@mynaui/icons-react";
import { useState } from "react";

import { cn } from "cn";

import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { shortTimeAgo } from "@/lib/format";

import { useNotes } from "../hooks/use-notes";
import { plainTextOf } from "../rich-text";
import type { CockpitNote } from "../types";
import { PaneHeader } from "./split-view";

function NoteRow({
  note,
  selected,
  onSelect,
}: {
  note: CockpitNote;
  selected: boolean;
  onSelect: () => void;
}) {
  const preview = plainTextOf(note.body);
  return (
    <li>
      <Button
        variant="ghost"
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
        className={cn(
          "h-auto w-full flex-col items-stretch gap-0.5 rounded-none border-b px-3 py-2.5 text-left font-normal whitespace-normal",
          selected && "bg-accent",
        )}
      >
        <span className="flex items-center gap-1.5">
          {note.pinned && (
            <Pin role="img" aria-label="Pinned" className="size-3.5 shrink-0 text-primary" />
          )}
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{note.title}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {shortTimeAgo(note.updatedAt)}
          </span>
        </span>
        <span className="line-clamp-2 text-xs text-muted-foreground">{preview || "No text"}</span>
        {note.tags.length > 0 && (
          <span className="truncate text-xs text-muted-foreground/80">
            {note.tags.map((tag) => `#${tag}`).join(" ")}
          </span>
        )}
      </Button>
    </li>
  );
}

// The notes, as a notes app lists them (decision 0105): pinned first, then the latest changed, with
// a search through their titles and words and a button that starts one.
export function NotesPane({
  notes,
  tag,
  selected,
  onSelect,
}: {
  notes: CockpitNote[];
  tag?: string;
  selected?: string;
  onSelect: (id: string) => void;
}) {
  const { create } = useNotes();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const found = needle
    ? notes.filter((note) =>
        `${note.title} ${plainTextOf(note.body)}`.toLowerCase().includes(needle),
      )
    : notes;

  async function startNote() {
    const made = await create({ title: "Untitled", tags: tag ? [tag] : [] });
    if (made) onSelect(made.id);
  }

  return (
    <>
      <PaneHeader title="Notes">
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search notes"
              placeholder="Search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-8"
            />
          </div>
          <Button size="icon" aria-label="New note" onClick={() => void startNote()}>
            <Plus />
          </Button>
        </div>
      </PaneHeader>
      {found.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          {needle ? "No note matches." : "No notes yet. Start one with +."}
        </p>
      ) : (
        <ul aria-label="Notes" className="flex-1 overflow-y-auto">
          {found.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              selected={note.id === selected}
              onSelect={() => onSelect(note.id)}
            />
          ))}
        </ul>
      )}
    </>
  );
}
