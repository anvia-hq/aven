import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { CockpitPage, withTag } from "@/modules/cockpit/components/cockpit-page";
import { EditNoteDialog, NewNoteDialog } from "@/modules/cockpit/components/note-dialog";
import { NoteGrid } from "@/modules/cockpit/components/note-grid";
import { useNotes } from "@/modules/cockpit/hooks/use-notes";

export const Route = createFileRoute("/_authed/cockpit/notes")({
  validateSearch: (search: Record<string, unknown>): { tag?: string } => ({
    tag: typeof search.tag === "string" && search.tag !== "" ? search.tag : undefined,
  }),
  component: NotesPage,
});

function NotesPage() {
  const { tag } = Route.useSearch();
  const { notes, loaded } = useNotes();
  const [editing, setEditing] = useState<string | null>(null);
  const open = notes.find((note) => note.id === editing) ?? null;

  return (
    <CockpitPage
      title="Notes"
      tag={tag}
      to="/cockpit/notes"
      wide
      actions={<NewNoteDialog tag={tag} />}
    >
      {loaded && <NoteGrid notes={withTag(notes, tag)} onOpen={(note) => setEditing(note.id)} />}
      <EditNoteDialog note={open} onOpenChange={(isOpen) => !isOpen && setEditing(null)} />
    </CockpitPage>
  );
}
