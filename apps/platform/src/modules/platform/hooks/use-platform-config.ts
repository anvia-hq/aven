import { useEffect, useState } from "react";

import { toast } from "@/components/toast";
import { api, postJson } from "@/lib/api";

import type { PlatformConfig } from "../types";

export function usePlatformConfig() {
  const [config, setConfig] = useState<PlatformConfig | null>(null);

  useEffect(() => {
    // If the config can't be loaded, assume open; the backend enforces registration anyway.
    api<PlatformConfig>("/platform/config")
      .then(setConfig)
      .catch(() => setConfig({ registrationEnabled: true, isOwner: false }));
  }, []);

  async function setRegistrationEnabled(registrationEnabled: boolean) {
    try {
      await postJson("/platform/settings", { registrationEnabled }, "PATCH");
    } catch {
      toast.add({ title: "Could not update registration", type: "error" });
      return;
    }
    setConfig((current) => current && { ...current, registrationEnabled });
    toast.add({
      title: registrationEnabled ? "Registration enabled" : "Registration disabled",
      type: "success",
    });
  }

  return { config, setRegistrationEnabled };
}
