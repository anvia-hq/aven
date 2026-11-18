import { useState } from "react";

import { toast } from "@aven/ui/toast";
import { useRequest } from "@/hooks/use-request";
import { api, attempt, postJson } from "@/lib/api";

import type { CloudLifecycle } from "../types";

export function useCloudLifecycle() {
  const [saved, setSaved] = useState<CloudLifecycle | null>(null);
  const answer = useRequest<CloudLifecycle>("/platform/cloud/lifecycle");
  const current = saved ?? answer?.data ?? null;

  async function save(settings: CloudLifecycle) {
    const next = await attempt("Could not save the computer settings", () =>
      postJson<CloudLifecycle>("/platform/cloud/lifecycle", settings, "PUT"),
    );

    if (!next) return false;

    toast.add({ title: "Computer settings saved", type: "success" });
    setSaved(next);
    return true;
  }

  async function reset() {
    const next = await attempt("Could not reset the computer settings", () =>
      api<CloudLifecycle>("/platform/cloud/lifecycle", { method: "DELETE" }),
    );

    if (!next) return false;

    toast.add({ title: "Computer settings reset to the defaults", type: "success" });
    setSaved(next);
    return true;
  }

  return { settings: current, failed: answer?.error ?? null, save, reset };
}
