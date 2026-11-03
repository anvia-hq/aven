import { Pin } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import { timeAgo } from "@/lib/format";

import type { CockpitNote } from "../types";
import { TagList } from "./tag-list";

// What a note's card shows of its body: the words, without the markdown's marks.
const plainText = (body: string) =>
  body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~[\]()-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// The notes as cards, pinned first, each opening its editor.
export function NoteGrid({
  notes,
  onOpen,
}: {
  notes: CockpitNote[];
  onOpen: (note: CockpitNote) => void;
}) {
  if (notes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        No notes yet.
      </p>
    );
  }
  return (
    <ul aria-label="Notes" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {notes.map((note) => (
        <li key={note.id} className="flex flex-col gap-2 rounded-xl border bg-card p-3">
          <Button
            variant="ghost"
            className="h-auto flex-col items-stretch gap-1.5 p-0 text-left font-normal whitespace-normal hover:bg-transparent"
            onClick={() => onOpen(note)}
          >
            <span className="flex items-start gap-1.5 text-sm font-medium">
              <span className="flex-1">{note.title}</span>
              {note.pinned && (
                <Pin role="img" aria-label="Pinned" className="size-3.5 shrink-0 text-primary" />
              )}
            </span>
            {note.body && (
              <span className="line-clamp-4 text-xs text-muted-foreground">
                {plainText(note.body)}
              </span>
            )}
          </Button>
          <div className="mt-auto flex flex-wrap items-center gap-2">
            <TagList tags={note.tags} to="/cockpit/notes" />
            <span className="ml-auto text-xs text-muted-foreground">
              {timeAgo(note.updatedAt, true)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
