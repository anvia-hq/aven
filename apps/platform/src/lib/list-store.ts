import { getDefaultStore, type PrimitiveAtom } from "jotai";

import { toast } from "@/components/toast";

import { errorMessage, api } from "./api";

type ListStoreOptions<T> = {
  path: string;
  atom: PrimitiveAtom<T[] | null>;
  label: string;
};

export function createListStore<T>({ path, atom, label }: ListStoreOptions<T>) {
  const store = getDefaultStore();
  let inflight: Promise<T[]> | undefined;
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
