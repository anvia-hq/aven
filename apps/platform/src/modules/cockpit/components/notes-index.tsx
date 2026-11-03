import { FileText, Pin, Plus, Search } from "@mynaui/icons-react";
import { useRef, useState } from "react";

import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { shortTimeAgo } from "@/lib/format";

import { useNotes } from "../hooks/use-notes";
import { plainTextOf } from "../rich-text";
import type { CockpitNote } from "../types";

function NoteRow({ note, onOpen }: { note: CockpitNote; onOpen: () => void }) {
  const preview = plainTextOf(note.body);
  return (
    <li>
      <Button
        variant="ghost"
        onClick={onOpen}
        className="h-auto w-full justify-start gap-3 rounded-md px-2 py-2 text-left font-normal whitespace-normal hover:bg-muted/60"
      >
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex min-w-0 flex-1 items-baseline gap-3">
          <span className="shrink-0 truncate text-sm font-medium sm:max-w-[50%]">{note.title}</span>
          <span className="hidden min-w-0 flex-1 truncate text-sm text-muted-foreground sm:block">
            {preview}
          </span>
        </span>
        {note.pinned && (
          <Pin role="img" aria-label="Pinned" className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="w-10 shrink-0 text-right text-xs text-muted-foreground/80">
          {shortTimeAgo(note.updatedAt)}
        </span>
      </Button>
    </li>
  );
}

// The notes as a page, as a Notion database lists its pages (decision 0106): a large title, a
// search and a button that starts one, then a quiet row a note, pinned first.
export function NotesIndex({
  notes,
  tag,
  onOpen,
}: {
  notes: CockpitNote[];
  tag?: string;
  onOpen: (id: string, started?: boolean) => void;
}) {
  const { create } = useNotes();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const found = needle
    ? notes.filter((note) =>
        `${note.title} ${plainTextOf(note.body)}`.toLowerCase().includes(needle),
      )
    : notes;

  // One note a press, however fast the presses come.
  const starting = useRef(false);
  async function startNote() {
    if (starting.current) return;
    starting.current = true;
    try {
      const made = await create({ title: "Untitled", tags: tag ? [tag] : [] });
      if (made) onOpen(made.id, true);
    } finally {
      starting.current = false;
    }
  }

  return (
    <div className="cockpit-doc mx-auto w-full max-w-[46rem] px-(--doc-gutter) pt-12 pb-24 md:pt-20">
      <h1 className="text-[2.5rem] leading-tight font-bold tracking-tight">Notes</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {notes.length === 1 ? "1 note" : `${notes.length} notes`}
        {tag && ` tagged ${tag}`}
      </p>
      <div className="mt-8 flex items-center gap-2 border-b border-border/60 pb-2">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <Input
          aria-label="Search notes"
          placeholder="Search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        <Button size="sm" onClick={() => void startNote()}>
          <Plus /> New note
        </Button>
      </div>
      {found.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {needle ? "No note matches." : "No notes yet. Start one with New note."}
        </p>
      ) : (
        <ul aria-label="Notes" className="-mx-2 mt-2 flex flex-col gap-px">
          {found.map((note) => (
            <NoteRow key={note.id} note={note} onOpen={() => onOpen(note.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}
