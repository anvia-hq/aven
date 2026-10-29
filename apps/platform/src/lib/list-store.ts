import { getDefaultStore, type PrimitiveAtom } from "jotai";

import { toast } from "@/components/toast";

import { errorMessage, api } from "./api";

type ListStoreOptions<T> = {
  path: string;
  // The atom holding the list: null until the first load, so readers can tell "empty" from "unknown".
  atom: PrimitiveAtom<T[] | null>;
  // Names the list in the error toast: "Could not load <label>".
  label: string;
};

// A list fetched from one endpoint and cached in an atom. Every caller of `refresh` shares one
// in-flight request, and `reset` drops the cache and any request still running.
export function createListStore<T>({ path, atom, label }: ListStoreOptions<T>) {
  const store = getDefaultStore();
  let inflight: Promise<T[]> | undefined;
  // Bumped by `reset` so a response for the previous organization or user, resolving after the
  // switch, can't overwrite the new one's data.
  let generation = 0;

  async function refresh() {
    const startedIn = generation;
    const hadData = store.get(atom) !== null;
    inflight ??= api<T[]>(path).finally(() => {
      inflight = undefined;
    });
    try {
      const result = await inflight;
      if (startedIn === generation) store.set(atom, result);
    } catch (failure) {
      if (startedIn !== generation) return;
      // Only a failed first load is worth a toast; a failed poll or refetch keeps the old list.
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
    inflight = undefined;
    generation += 1;
    store.set(atom, null);
  }

  return { refresh, reset };
}
