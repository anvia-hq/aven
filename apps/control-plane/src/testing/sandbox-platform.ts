import { setSandboxSettings } from "@aven/sandbox/settings";
import type { SandboxProviderName } from "@aven/sandbox/settings";

import { runtimesService } from "../modules/runtimes/service";

const SETTINGS = {
  boat: { provider: "boat", base: "", apiKey: "boat_test_key", runnerUrl: "" },
  spaces: {
    provider: "spaces",
    base: "http://spaces.test:8787/api/v1",
    apiKey: "sk_test_key",
    runnerUrl: "",
  },
} as const;

export async function useSandboxPlatform(provider: SandboxProviderName, apiKey?: string) {
  setSandboxSettings({ ...SETTINGS[provider], apiKey: apiKey ?? SETTINGS[provider].apiKey });
  await runtimesService.ensureCloud();
}

export const clearSandboxPlatform = () => setSandboxSettings(null);
