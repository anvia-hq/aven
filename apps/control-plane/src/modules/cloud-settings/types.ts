import type { SandboxProviderName } from "@aven/sandbox/settings";

export type CloudSettingsView = {
  provider: SandboxProviderName;
  base: string;
  runnerUrl: string;
  keyHint: string;
};

export type StoredCloudSettings = {
  provider: SandboxProviderName;
  base: string;
  runnerUrl: string;
  apiKeyEncrypted: string;
  keyHint: string;
};
