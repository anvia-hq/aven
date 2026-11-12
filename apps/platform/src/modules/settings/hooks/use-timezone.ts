import { useCallback, useEffect, useState } from "react";

import { toast } from "@/components/toast";
import { api, attempt, postJson } from "@/lib/api";

type Preferences = { timezone: string | null; defaultTimezone: string };

export const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export function useTimezone() {
  const [saved, setSaved] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let current = true;
    api<Preferences>("/preferences")
      .then((preferences) => current && setSaved(preferences.timezone))
      .catch(() => undefined);
    return () => void (current = false);
  }, []);

  const save = useCallback(async (timezone: string) => {
    const done = await attempt("Could not save the timezone", () =>
      postJson<{ timezone: string }>("/preferences/timezone", { timezone }, "PUT"),
    );

    if (!done) return false;

    setSaved(done.timezone);
    toast.add({ title: "Timezone saved", description: done.timezone, type: "success" });
    return true;
  }, []);

  return {
    timezone: saved ?? browserTimezone(),
    chosen: saved !== undefined && saved !== null,
    save,
  };
}

export function useDefaultTimezone() {
  useEffect(() => {
    postJson("/preferences/default-timezone", { timezone: browserTimezone() }).catch(() => {});
  }, []);
}
