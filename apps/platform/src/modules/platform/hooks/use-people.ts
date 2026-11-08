import { useState } from "react";

import { toast } from "@/components/toast";
import { api, attempt } from "@/lib/api";
import { useRequest } from "@/hooks/use-request";

import type { PlatformPerson } from "../types";

export function usePeople() {
  const [refreshKey, setRefreshKey] = useState(0);
  const answer = useRequest<PlatformPerson[]>("/platform/users", { refreshKey });

  async function remove(person: PlatformPerson) {
    const removed = await attempt("Could not remove the account", () =>
      api<{ removed: true }>(`/platform/users/${person.id}`, { method: "DELETE" }),
    );
    if (!removed) return;
    toast.add({ title: "Account removed", description: person.email, type: "success" });
    setRefreshKey((key) => key + 1);
  }

  return { people: answer?.data ?? null, error: answer?.error ?? null, remove };
}
