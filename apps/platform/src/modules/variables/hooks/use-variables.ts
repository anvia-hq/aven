import { getDefaultStore, useAtom } from "jotai";
import { useEffect } from "react";

import { toast } from "@/components/toast";
import { api, attempt, errorMessage, postJson } from "@/lib/api";

import { variablesAtom } from "../atoms/variables-atom";
import { variablesPath, type Variable, type VariableInput, type VariableScope } from "../types";

const store = getDefaultStore();
let generation = 0;
const inflight = new Map<string, Promise<Variable[]>>();

export function resetVariables() {
  generation += 1;
  inflight.clear();
  store.set(variablesAtom, {});
}

const path = (scope: VariableScope, name?: string) =>
  `${variablesPath(scope)}${name ? `/${name}` : ""}`;

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

export function useVariables(scope: VariableScope) {
  const [all] = useAtom(variablesAtom);
  const key = keyOf(scope);
  const variables = all[key];

  useEffect(() => {
    if (variables === undefined) void load(scope);
  }, [key, variables]);

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
