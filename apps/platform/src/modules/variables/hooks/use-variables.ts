import { getDefaultStore, useAtom } from "jotai";
import { useEffect } from "react";

import { toast } from "@/components/toast";
import { api, attempt, errorMessage, postJson } from "@/lib/api";

import { variablesAtom } from "../atoms/variables-atom";
import type { Variable, VariableInput } from "../types";

const store = getDefaultStore();
// Bumped by `reset` so a response for the previous organization, resolving after the switch, can't
// fill the new one's list.
let generation = 0;
const inflight = new Map<string, Promise<Variable[]>>();

// Variables are scoped to the active organization's projects: drop them on a switch or sign-out.
export function resetVariables() {
  generation += 1;
  inflight.clear();
  store.set(variablesAtom, {});
}

const path = (projectId: string, name?: string) =>
  `/projects/${projectId}/variables${name ? `/${name}` : ""}`;

async function load(projectId: string) {
  const startedIn = generation;
  const known = store.get(variablesAtom)[projectId] !== undefined;
  let request = inflight.get(projectId);
  if (!request) {
    request = api<Variable[]>(path(projectId)).finally(() => inflight.delete(projectId));
    inflight.set(projectId, request);
  }
  try {
    const list = await request;
    if (startedIn === generation)
      store.set(variablesAtom, (all) => ({ ...all, [projectId]: list }));
  } catch (failure) {
    if (startedIn !== generation) return;
    // Only a failed first load is worth a toast; a failed refetch keeps the old list.
    if (!known) {
      toast.add({
        title: "Could not load variables",
        description: errorMessage(failure),
        type: "error",
      });
      store.set(variablesAtom, (all) => ({ ...all, [projectId]: [] }));
    }
  }
}

// A project's variables. Loads on first use; mutations refetch. Saving a name that exists
// replaces it, which is also how an unreadable value is entered again.
export function useVariables(projectId: string) {
  const [all] = useAtom(variablesAtom);
  const variables = all[projectId];

  useEffect(() => {
    if (variables === undefined) void load(projectId);
  }, [projectId, variables]);

  // Runs a request that changes a variable and reloads the list; false on failure (already toasted).
  async function change(failureTitle: string, request: () => Promise<unknown>) {
    const changed = await attempt(failureTitle, async () => {
      await request();
      return true;
    });
    if (!changed) return false;
    await load(projectId);
    return true;
  }

  async function save({ name, ...body }: VariableInput) {
    const saved = await change("Could not save variable", () =>
      postJson<Variable>(path(projectId, name), body, "PUT"),
    );
    if (saved) toast.add({ title: "Variable saved", description: name, type: "success" });
    return saved;
  }

  async function remove(variable: Variable) {
    const removed = await change("Could not remove variable", () =>
      api<void>(path(projectId, variable.name), { method: "DELETE" }),
    );
    if (removed) toast.add({ title: "Variable removed", description: variable.name });
  }

  return { variables: variables ?? [], loaded: variables !== undefined, save, remove };
}
