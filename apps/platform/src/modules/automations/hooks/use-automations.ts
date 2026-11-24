import { useAtom } from "jotai";
import { useCallback, useEffect } from "react";

import { toast } from "@aven/ui/toast";
import { api, attempt, postJson } from "@/lib/api";
import { createListStore } from "@/lib/list-store";

import { automationsAtom } from "../atoms/automations-atom";
import type { Automation, AutomationCreated, AutomationRun, CreateAutomationInput } from "../types";

const automationsStore = createListStore<Automation>({
  path: "/automations",
  atom: automationsAtom,
  label: "automations",
});

export function resetAutomations() {
  automationsStore.reset();
}

export function useAutomations() {
  const [automations] = useAtom(automationsAtom);
  const { refresh } = automationsStore;

  useEffect(() => {
    if (automations === null) void refresh();
  }, [automations, refresh]);

  const create = useCallback(
    async (input: CreateAutomationInput) => {
      const created = await attempt("Could not create the automation", () =>
        postJson<AutomationCreated>("/automations", input),
      );

      if (created) {
        await refresh();
        toast.add({ title: "Automation created", description: created.name, type: "success" });
      }

      return created;
    },
    [refresh],
  );

  const setEnabled = useCallback(
    async (automation: Automation, enabled: boolean) => {
      const changed = await attempt("Could not update the automation", () =>
        postJson<Automation>(`/automations/${automation.id}`, { enabled }, "PATCH"),
      );

      if (changed) await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (automation: Automation) => {
      const removed = await attempt("Could not remove the automation", async () => {
        await api<{ ok: true }>(`/automations/${automation.id}`, { method: "DELETE" });
        return true;
      });

      if (!removed) return;

      await refresh();
      toast.add({ title: "Automation removed", description: automation.name });
    },
    [refresh],
  );

  const triggerNow = useCallback(
    async (automation: Automation) => {
      const run = await attempt("Could not start the automation", () =>
        postJson<AutomationRun>(`/automations/${automation.id}/trigger`, {}),
      );

      if (run) {
        await refresh();

        if (run.status === "failed") {
          toast.add({
            title: "Automation failed to start",
            description: run.error ?? automation.name,
            type: "error",
          });
        } else {
          toast.add({
            title: "Automation started",
            description: automation.name,
            type: "success",
          });
        }
      }

      return run;
    },
    [refresh],
  );

  const fetchRuns = useCallback(async (automationId: string) => {
    const runs = await attempt("Could not load automation runs", () =>
      api<AutomationRun[]>(`/automations/${automationId}/runs`),
    );
    return runs ?? [];
  }, []);

  return {
    automations: automations ?? [],
    loaded: automations !== null,
    refresh,
    create,
    setEnabled,
    remove,
    triggerNow,
    fetchRuns,
  };
}
