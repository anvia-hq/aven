import { getDefaultStore, useAtom } from "jotai";
import { useEffect } from "react";

import { toast } from "@aven/ui/toast";
import { api, postJson } from "@/lib/api";

import { platformConfigAtom } from "../atoms/platform-config-atom";
import type { PlatformConfig } from "../types";

const FALLBACK: PlatformConfig = {
  registrationEnabled: true,
  githubLogin: false,
  emailLogin: true,
  isOwner: false,
};

let inflight: Promise<PlatformConfig> | undefined;

function loadConfig() {
  inflight ??= api<PlatformConfig>("/platform/config")
    .catch(() => FALLBACK)
    .finally(() => {
      inflight = undefined;
    });
  return inflight;
}

export function resetPlatformConfig() {
  inflight = undefined;
  getDefaultStore().set(platformConfigAtom, null);
}

export function usePlatformConfig() {
  const [config, setConfig] = useAtom(platformConfigAtom);

  useEffect(() => {
    if (config === null) void loadConfig().then(setConfig);
  }, [config, setConfig]);

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
