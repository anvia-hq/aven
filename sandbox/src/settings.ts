export const SANDBOX_PROVIDERS = ["boat", "spaces", "lizard"] as const;

export type SandboxProviderName = (typeof SANDBOX_PROVIDERS)[number];

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
