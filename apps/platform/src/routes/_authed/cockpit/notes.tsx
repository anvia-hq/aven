import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef } from "react";

import { withTag } from "@/modules/cockpit/components/cockpit-page";
import { NoteEditor } from "@/modules/cockpit/components/note-editor";
import { NotesPane } from "@/modules/cockpit/components/notes-pane";
import { NothingOpen, SplitView } from "@/modules/cockpit/components/split-view";
import { useNotes } from "@/modules/cockpit/hooks/use-notes";

type NotesSearch = { tag?: string; note?: string };

export const Route = createFileRoute("/_authed/cockpit/notes")({
  validateSearch: (search: Record<string, unknown>): NotesSearch => ({
    tag: typeof search.tag === "string" && search.tag !== "" ? search.tag : undefined,
    note: typeof search.note === "string" && search.note !== "" ? search.note : undefined,
  }),
  component: NotesPage,
});

function NotesPage() {
  const { tag, note: openId } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { notes, loaded } = useNotes();
  // The note just started here, whose title is ready to be typed over.
  const started = useRef<string | null>(null);
  const open = notes.find((note) => note.id === openId);
  const select = (id?: string) => void navigate({ search: (prev) => ({ ...prev, note: id }) });

  return (
    <SplitView
      open={Boolean(open)}
      list={
        loaded && (
          <NotesPane
            notes={withTag(notes, tag)}
            tag={tag}
            selected={openId}
            onSelect={(id) => {
              started.current = notes.some((note) => note.id === id) ? null : id;
              select(id);
            }}
          />
        )
      }
      detail={
        open ? (
          <NoteEditor
            key={open.id}
            note={open}
            fresh={started.current === open.id}
            onClose={() => select(undefined)}
          />
        ) : (
          <NothingOpen>Pick a note, or start one with +.</NothingOpen>
        )
      }
    />
  );
}
