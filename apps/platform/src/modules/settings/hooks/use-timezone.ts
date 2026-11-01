import { useCallback, useEffect, useState } from "react";

import { toast } from "@/components/toast";
import { api, attempt, postJson } from "@/lib/api";

type Preferences = { timezone: string | null; defaultTimezone: string };

/** The timezone of this browser, which a person who has not chosen one is taken to be in. */
export const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

// The person's timezone, which what a bot schedules is on the clock of (decision 0067): the one they
// chose, or this browser's until they do.
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

// A person who has not chosen a timezone is put in this browser's, so that what their bots schedule
// is on their own clock without their having to say; changing it later is theirs (Settings).
export function useDefaultTimezone() {
  useEffect(() => {
    let current = true;
    void (async () => {
      try {
        const preferences = await api<Preferences>("/preferences");
        if (current && preferences.timezone === null) {
          await postJson("/preferences/timezone", { timezone: browserTimezone() }, "PUT");
        }
      } catch {
        // Not saved: the server's own timezone is used, and Settings can set it.
      }
    })();
    return () => void (current = false);
  }, []);
}
