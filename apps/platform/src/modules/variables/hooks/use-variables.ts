import { getDefaultStore, useAtom } from "jotai";
import { useEffect } from "react";

import { toast } from "@aven/ui/toast";
import { api, attempt, errorMessage, postJson } from "@/lib/api";

import { variablesAtom } from "../atoms/variables-atom";
import { variablesPath, type Variable, type VariableInput, type VariableScope } from "../types";

const store = getDefaultStore();
let generation = 0;
const inflight = new Map<string, Promise<Variable[]>>();
const scopeGenerations = new Map<string, number>();

export function resetVariables() {
  generation += 1;
  inflight.clear();
  scopeGenerations.clear();
  store.set(variablesAtom, {});
}

const path = (scope: VariableScope, name?: string) =>
  `${variablesPath(scope)}${name ? `/${name}` : ""}`;

const keyOf = (scope: VariableScope) => (scope.kind === "project" ? scope.projectId : scope.kind);

const scopeGeneration = (key: string) => scopeGenerations.get(key) ?? 0;

function invalidate(key: string) {
  inflight.delete(key);
  scopeGenerations.set(key, scopeGeneration(key) + 1);
}

async function load(scope: VariableScope) {
  const key = keyOf(scope);
  const startedIn = generation;
  const startedAt = scopeGeneration(key);
  const known = store.get(variablesAtom)[key] !== undefined;
  let request = inflight.get(key);

  if (!request) {
    const started = api<Variable[]>(path(scope)).finally(() => {
      if (inflight.get(key) === started) inflight.delete(key);
    });
    inflight.set(key, started);
    request = started;
  }

  try {
    const list = await request;

    if (startedIn !== generation || startedAt !== scopeGeneration(key)) return;

    store.set(variablesAtom, (all) => ({ ...all, [key]: list }));
  } catch (failure) {
    if (startedIn !== generation || startedAt !== scopeGeneration(key)) return;

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

    invalidate(keyOf(scope));
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

  async function saveMany(entries: { name: string; value: string }[], secret: boolean) {
    const saved = await change("Could not save variables", async () => {
      for (const { name, value } of entries) {
        await postJson<Variable>(path(scope, name), { value, secret }, "PUT");
      }
    });

    if (saved) {
      toast.add({
        title: entries.length === 1 ? "Variable saved" : `${entries.length} variables saved`,
        description: entries.map((entry) => entry.name).join(", "),
        type: "success",
      });
    }

    return saved;
  }

  async function remove(variable: Variable) {
    const removed = await change("Could not remove variable", () =>
      api<void>(path(scope, variable.name), { method: "DELETE" }),
    );

    if (removed) toast.add({ title: "Variable removed", description: variable.name });
  }

  return { variables: variables ?? [], loaded: variables !== undefined, save, saveMany, remove };
}
