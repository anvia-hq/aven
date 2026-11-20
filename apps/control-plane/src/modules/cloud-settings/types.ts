import type { SandboxProviderName } from "@aven/sandbox/settings";

export type CloudSettingsView = {
  provider: SandboxProviderName;
  base: string;
  project: string;
  runnerUrl: string;
  keyHint: string;
};

export type StoredCloudSettings = {
  provider: SandboxProviderName;
  base: string;
  project: string;
  runnerUrl: string;
  apiKeyEncrypted: string;
  keyHint: string;
};
