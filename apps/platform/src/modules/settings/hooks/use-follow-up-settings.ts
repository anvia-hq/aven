import { useAtom } from "jotai";
import { useCallback, useEffect } from "react";

import { api, attempt, postJson } from "@/lib/api";

import { followUpsAtom } from "../atoms/follow-ups-atom";
import type { FollowUpSettings } from "../types";

export function useFollowUpSettings() {
  const [settings, setSettings] = useAtom(followUpsAtom);

  useEffect(() => {
    if (settings !== null) return;
    let current = true;
    api<{ followUps: FollowUpSettings }>("/preferences")
      .then((preferences) => current && setSettings(preferences.followUps))
      .catch(() => undefined);
    return () => void (current = false);
  }, [settings, setSettings]);

  const save = useCallback(
    async (next: FollowUpSettings) => {
      const done = await attempt("Could not save the small model settings", () =>
        postJson<FollowUpSettings>("/preferences/follow-ups", next, "PUT"),
      );
      if (done) setSettings(done);
      return Boolean(done);
    },
    [setSettings],
  );

  return { settings, save };
}
