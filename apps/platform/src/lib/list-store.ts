import { getDefaultStore, type PrimitiveAtom } from "jotai";

import { toast } from "@aven/ui/toast";

import { errorMessage, api } from "./api";

type ListStoreOptions<T> = {
  path: string;
  atom: PrimitiveAtom<T[] | null>;
  label: string;
};

export function createListStore<T>({ path, atom, label }: ListStoreOptions<T>) {
  const store = getDefaultStore();
  let generation = 0;

  async function refresh() {
    generation += 1;
    const startedIn = generation;
    const hadData = store.get(atom) !== null;
    try {
      const result = await api<T[]>(path);

      if (startedIn === generation) store.set(atom, result);
    } catch (failure) {
      if (startedIn !== generation) return;

      if (!hadData) {
        toast.add({
          title: `Could not load ${label}`,
          description: errorMessage(failure),
          type: "error",
        });
      }

      store.set(atom, (current: T[] | null) => current ?? []);
    }
  }

  function reset() {
    generation += 1;
    store.set(atom, null);
  }

  return { refresh, reset };
}
