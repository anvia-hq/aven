import { getDefaultStore, useAtom } from "jotai";
import { useEffect } from "react";

import { toast } from "@/components/toast";
import { api, attempt, errorMessage, postJson } from "@/lib/api";

import { variablesAtom } from "../atoms/variables-atom";
import { variablesPath, type Variable, type VariableInput, type VariableScope } from "../types";

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

const path = (scope: VariableScope, name?: string) =>
  `${variablesPath(scope)}${name ? `/${name}` : ""}`;

// What a scope's list is kept under: the atom and the requests in flight are by it.
const keyOf = (scope: VariableScope) => (scope.kind === "project" ? scope.projectId : scope.kind);

async function load(scope: VariableScope) {
  const key = keyOf(scope);
  const startedIn = generation;
  const known = store.get(variablesAtom)[key] !== undefined;
  let request = inflight.get(key);
  if (!request) {
    request = api<Variable[]>(path(scope)).finally(() => inflight.delete(key));
    inflight.set(key, request);
  }
  try {
    const list = await request;
    if (startedIn === generation) store.set(variablesAtom, (all) => ({ ...all, [key]: list }));
  } catch (failure) {
    if (startedIn !== generation) return;
    // Only a failed first load is worth a toast; a failed refetch keeps the old list.
    if (!known) {
      toast.add({
        title: "Could not load variables",
        description: errorMessage(failure),
        type: "error",
      });
      store.set(variablesAtom, (all) => ({ ...all, [key]: [] }));
    }
  }
}

// A scope's variables. Loads on first use; mutations refetch. Saving a name that exists replaces
// it, which is also how an unreadable value is entered again.
export function useVariables(scope: VariableScope) {
  const [all] = useAtom(variablesAtom);
  const key = keyOf(scope);
  const variables = all[key];

  useEffect(() => {
    if (variables === undefined) void load(scope);
  }, [key, variables]);

  // Runs a request that changes a variable and reloads the list; false on failure (already toasted).
  async function change(failureTitle: string, request: () => Promise<unknown>) {
    const changed = await attempt(failureTitle, async () => {
      await request();
      return true;
    });
    if (!changed) return false;
    await load(scope);
    return true;
  }

  async function save({ name, ...body }: VariableInput) {
    const saved = await change("Could not save variable", () =>
      postJson<Variable>(path(scope, name), body, "PUT"),
    );
    if (saved) toast.add({ title: "Variable saved", description: name, type: "success" });
    return saved;
  }

  async function remove(variable: Variable) {
    const removed = await change("Could not remove variable", () =>
      api<void>(path(scope, variable.name), { method: "DELETE" }),
    );
    if (removed) toast.add({ title: "Variable removed", description: variable.name });
  }

  return { variables: variables ?? [], loaded: variables !== undefined, save, remove };
}
