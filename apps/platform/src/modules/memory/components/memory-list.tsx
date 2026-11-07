import { Pencil, Trash } from "@mynaui/icons-react";
import { useState } from "react";

import { Button } from "@/components/button";
import { SettingsSection } from "@/components/settings-section";
import { timeAgo } from "@/lib/format";

import { useMemory } from "../hooks/use-memory";
import type { FolderSection, MemoryNote } from "../types";
import { EditNoteDialog } from "./memory-note-dialog";

function NoteRow({ note }: { note: MemoryNote }) {
  const { remove } = useMemory();
  const [editing, setEditing] = useState(false);

  return (
    <li className="flex items-start gap-3 border-b py-3 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate font-mono text-sm">{note.name}</span>
        {note.description && <p className="text-xs text-muted-foreground">{note.description}</p>}
        <p className="text-xs text-muted-foreground">Changed {timeAgo(note.updatedAt, true)}</p>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Edit ${note.name}`}
        onClick={() => setEditing(true)}
      >
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Delete ${note.name}`}
        onClick={() => void remove(note)}
      >
        <Trash />
      </Button>
      <EditNoteDialog note={note} open={editing} onOpenChange={setEditing} />
    </li>
  );
}

export function MemoryList({ sections }: { sections: FolderSection[] }) {
  const shown = sections.filter(
    (section) => section.key === "personal" || section.notes.length > 0,
  );
  return (
    <div className="flex flex-col">
      {shown.map((section) => (
        <SettingsSection key={section.key} title={section.label} description={section.description}>
          {section.notes.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No notes yet. Your agents keep them as they learn about you, or tell one to remember
              something.
            </p>
          ) : (
            <ul aria-label={`Notes: ${section.label}`} className="flex flex-col">
              {section.notes.map((note) => (
                <NoteRow key={note.id} note={note} />
              ))}
            </ul>
          )}
        </SettingsSection>
      ))}
    </div>
  );
}
