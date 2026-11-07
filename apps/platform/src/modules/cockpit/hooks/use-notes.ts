import { toast } from "@/components/toast";

import { notesAtom } from "../atoms/cockpit-atoms";
import type { CockpitNote, NoteInput } from "../types";
import { createCollection } from "./use-collection";

const pinnedFirst = (notes: CockpitNote[]) =>
  [...notes].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt),
  );

const notes = createCollection<CockpitNote, NoteInput, Partial<NoteInput>>({
  path: "/cockpit/notes",
  atom: notesAtom,
  label: "notes",
  order: pinnedFirst,
});

export const resetNotes = notes.reset;
export const refreshNotes = notes.refreshLoaded;

export function useNotes() {
  const { items, loaded } = notes.useItems();
  return {
    notes: items,
    loaded,
    create: (input: NoteInput) => notes.create(input, "Could not save the note"),
    update: (note: CockpitNote, patch: Partial<NoteInput>) =>
      notes.update(note, patch, "Could not save the note"),
    async remove(note: CockpitNote) {
      const removed = await notes.remove(note, "Could not delete the note");
      if (removed) toast.add({ title: "Note deleted", description: note.title });
      return removed;
    },
  };
}
