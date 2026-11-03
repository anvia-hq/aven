import { getDefaultStore, useAtom } from "jotai";
import { useEffect } from "react";

import { toast } from "@/components/toast";
import { api, attempt, postJson } from "@/lib/api";
import { createListStore } from "@/lib/list-store";

import { memoryNotesAtom } from "../atoms/memory-atom";
import type { MemoryFolder, MemoryNote } from "../types";

const memoryStore = createListStore<MemoryNote>({
  path: "/memory",
  atom: memoryNotesAtom,
  label: "memory",
});

// Notes belong to the signed-in user, so drop them on sign-out; the next user refetches.
export function resetMemory() {
  memoryStore.reset();
}

// An agent may have kept or changed a note while the list was open (decision 0102): load it again
// if it was ever loaded.
export function refreshMemory() {
  if (getDefaultStore().get(memoryNotesAtom) !== null) void memoryStore.refresh();
}

// The user's memory notes. Loads on first use; changes refetch. `fresh` loads them again when the
// caller mounts, for a page that shows them: a thread's agent may have changed them since.
export function useMemory({ fresh = false } = {}) {
  const [notes] = useAtom(memoryNotesAtom);
  const { refresh } = memoryStore;

  useEffect(() => {
    if (notes === null) void refresh();
  }, [notes, refresh]);

  useEffect(() => {
    if (fresh && getDefaultStore().get(memoryNotesAtom) !== null) void refresh();
  }, [fresh, refresh]);

  async function change(failureTitle: string, request: () => Promise<unknown>) {
    const changed = await attempt(failureTitle, async () => {
      await request();
      return true;
    });
    if (!changed) return false;
    await refresh();
    return true;
  }

  async function create(folder: MemoryFolder, input: { name: string; body: string }) {
    const created = await change("Could not save the note", () =>
      postJson<MemoryNote>("/memory", { ...folder, ...input }),
    );
    if (created) toast.add({ title: "Note saved", description: input.name, type: "success" });
    return created;
  }

  async function update(note: MemoryNote, input: { name: string; body: string }) {
    const saved = await change("Could not save the note", () =>
      postJson<MemoryNote>(`/memory/${note.id}`, input, "PATCH"),
    );
    if (saved) toast.add({ title: "Note saved", description: input.name, type: "success" });
    return saved;
  }

  async function remove(note: MemoryNote) {
    const removed = await change("Could not delete the note", () =>
      api<void>(`/memory/${note.id}`, { method: "DELETE" }),
    );
    if (removed) toast.add({ title: "Note deleted", description: note.name });
  }

  return { notes: notes ?? [], loaded: notes !== null, create, update, remove };
}
