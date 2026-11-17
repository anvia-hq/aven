export type PlatformConfig = {
  registrationEnabled: boolean;
  githubLogin: boolean;
  emailLogin: boolean;
  claudeBackend: boolean;
  codexBackend: boolean;
  isOwner: boolean;
};

export type PlatformPerson = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  createdAt: string;
  lastActiveAt: string | null;
  owner: boolean;
  workspaces: { id: string; name: string; role: string }[];
};

export type ServerModelSource = "env" | "platform";

export type ServerModel = {
  kind: string;
  modelId: string;
  keyHint: string;
  source: ServerModelSource;
};

export type ServerModels = {
  decision: ServerModel | null;
  small: ServerModel | null;
};

export type ServerModelDraft = { kind: string; modelId: string; apiKey: string };

export type ServerModelOption = {
  id: string;
  label: string;
  defaultModel: string;
  keyLabel: string;
};

export const SANDBOX_PROVIDERS = ["spaces", "boat"] as const;

export type SandboxProvider = (typeof SANDBOX_PROVIDERS)[number];

export const SANDBOX_PROVIDER_LABELS: Record<SandboxProvider, string> = {
  spaces: "Spaces",
  boat: "boat.dev",
};

export type CloudSettings = {
  provider: SandboxProvider;
  base: string;
  runnerUrl: string;
  keyHint: string;
};

export type CloudSettingsDraft = {
  provider: SandboxProvider;
  base: string;
  runnerUrl: string;
  apiKey: string;
};
