import { getDefaultStore, useAtomValue, type PrimitiveAtom } from "jotai";
import { useEffect } from "react";

import { api, attempt, postJson } from "@/lib/api";
import { createListStore } from "@/lib/list-store";

import { cockpitTagsAtom } from "../atoms/cockpit-atoms";
import type { CockpitTag } from "../types";

const tagsStore = createListStore<CockpitTag>({
  path: "/cockpit/tags",
  atom: cockpitTagsAtom,
  label: "tags",
});

/** The tags the person uses, most used first. */
export function useCockpitTags() {
  const tags = useAtomValue(cockpitTagsAtom);
  useEffect(() => {
    if (tags === null) void tagsStore.refresh();
  }, [tags]);
  return tags ?? [];
}

type Item = { id: string };

/**
 * One kind of the cockpit's records, kept in an atom: loaded on first use, and changed in place at
 * once so a dragged card or a ticked box does not wait for the server, then put back from it when
 * the change fails. Each change refreshes the tags, which it may have changed.
 */
export function createCollection<T extends Item, Create, Update>(options: {
  path: string;
  atom: PrimitiveAtom<T[] | null>;
  label: string;
  /** Where a new record goes in the list. */
  order?: (items: T[]) => T[];
}) {
  const { path, atom, label, order = (items) => items } = options;
  const store = getDefaultStore();
  const list = createListStore<T>({ path, atom, label });
  // A list not loaded, as after sign-out, is left for its next load: a late reply for the person
  // who signed out must not stand in for the next person's list.
  const set = (change: (items: T[]) => T[]) => {
    const items = store.get(atom);
    if (items !== null) store.set(atom, order(change(items)));
  };
  const refreshTags = () => void tagsStore.refresh();

  async function create(input: Create, failure: string) {
    const made = await attempt(failure, () => postJson<T>(path, input));
    if (made) {
      set((items) => [made, ...items]);
      refreshTags();
    }
    return made ?? null;
  }

  // A record's changes go to the server one after another, so a slow save cannot land after a later
  // one; `waiting` counts a record's changes not answered yet.
  const queues = new Map<string, Promise<unknown>>();
  const waiting = new Map<string, number>();
  // Records being deleted: a change of theirs still to be sent is not, since it would only fail.
  const removing = new Set<string>();

  function send(id: string, patch: Update, failure: string) {
    const turn = (queues.get(id) ?? Promise.resolve()).then(() =>
      removing.has(id)
        ? null
        : attempt(failure, () => postJson<T>(`${path}/${id}`, patch, "PATCH")),
    );
    queues.set(id, turn);
    void turn.then(() => {
      if (queues.get(id) === turn) queues.delete(id);
    });
    return turn;
  }

  async function update(item: T, patch: Update, failure: string) {
    const { id } = item;
    set((items) => items.map((each) => (each.id === id ? { ...each, ...patch } : each)));
    waiting.set(id, (waiting.get(id) ?? 0) + 1);
    const saved = await send(id, patch, failure);
    const left = (waiting.get(id) ?? 1) - 1;
    if (left > 0) waiting.set(id, left);
    else waiting.delete(id);
    if (saved) {
      // The server's record, once it has every change made here: until then it is older than
      // what is shown.
      if (left === 0) set((items) => items.map((each) => (each.id === id ? saved : each)));
      // Only a change of tags changes the tags' counts.
      if ((patch as { tags?: unknown }).tags !== undefined) refreshTags();
    } else if (!removing.has(id)) {
      await list.refresh();
    }
    return Boolean(saved);
  }

  // Deleted once the record's changes in flight are answered, so none of them lands on a record
  // that is gone (as leaving a title just edited, to open its menu, sends one).
  async function remove(item: T, failure: string) {
    const { id } = item;
    removing.add(id);
    set((items) => items.filter((each) => each.id !== id));
    try {
      await queues.get(id);
      const removed = await attempt(failure, async () => {
        await api<void>(`${path}/${id}`, { method: "DELETE" });
        return true;
      });
      if (removed) refreshTags();
      else await list.refresh();
      return Boolean(removed);
    } finally {
      removing.delete(id);
    }
  }

  function useItems() {
    const items = useAtomValue(atom);
    useEffect(() => {
      if (items === null) void list.refresh();
    }, [items]);
    return { items: items ?? [], loaded: items !== null };
  }

  // Fetched again when something else may have changed the records, a bot at work for one; a list
  // never loaded is left for its first load, and one with a change of the person's not yet saved is
  // left as it is, since the server's copy would undo it on screen.
  const refreshLoaded = () =>
    store.get(atom) !== null && waiting.size === 0 && removing.size === 0
      ? list.refresh()
      : undefined;

  return { create, update, remove, useItems, reset: list.reset, refreshLoaded };
}

export function resetCockpitTags() {
  tagsStore.reset();
}

export function refreshCockpitTags() {
  return tagsStore.refresh();
}
