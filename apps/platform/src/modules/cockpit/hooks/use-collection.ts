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
  const set = (change: (items: T[]) => T[]) =>
    store.set(atom, order(change(store.get(atom) ?? [])));
  const refreshTags = () => void tagsStore.refresh();

  async function create(input: Create, failure: string) {
    const made = await attempt(failure, () => postJson<T>(path, input));
    if (made) {
      set((items) => [made, ...items]);
      refreshTags();
    }
    return made ?? null;
  }

  async function update(item: T, patch: Update, failure: string) {
    set((items) => items.map((each) => (each.id === item.id ? { ...each, ...patch } : each)));
    const saved = await attempt(failure, () => postJson<T>(`${path}/${item.id}`, patch, "PATCH"));
    if (saved) {
      set((items) => items.map((each) => (each.id === item.id ? saved : each)));
      refreshTags();
    } else {
      await list.refresh();
    }
    return Boolean(saved);
  }

  async function remove(item: T, failure: string) {
    set((items) => items.filter((each) => each.id !== item.id));
    const removed = await attempt(failure, async () => {
      await api<void>(`${path}/${item.id}`, { method: "DELETE" });
      return true;
    });
    if (removed) refreshTags();
    else await list.refresh();
    return Boolean(removed);
  }

  function useItems() {
    const items = useAtomValue(atom);
    useEffect(() => {
      if (items === null) void list.refresh();
    }, [items]);
    return { items: items ?? [], loaded: items !== null };
  }

  return { create, update, remove, useItems, reset: list.reset };
}

export function resetCockpitTags() {
  tagsStore.reset();
}
