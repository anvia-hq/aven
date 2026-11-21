import { SANDBOX_PROVIDERS } from "@aven/protocol/runtimes";
import type { SandboxProviderName } from "@aven/protocol/types";

export { SANDBOX_PROVIDERS };
export type { SandboxProviderName };

export type SandboxSettings = {
  provider: SandboxProviderName;
  base: string;
  apiKey: string;
  runnerUrl: string;
  project?: string;
};

let saved: SandboxSettings | null = null;

export const setSandboxSettings = (settings: SandboxSettings | null) => {
  saved = settings;
};

export const sandboxSettingsOf = (provider: SandboxProviderName) =>
  saved?.provider === provider ? saved : null;
