import { SANDBOX_PROVIDERS } from "@aven/protocol/runtimes";
import type {
  LensCaptureMode,
  PlatformConfig,
  SandboxProviderName,
  SmallModelProvider,
} from "@aven/protocol/types";

export { SANDBOX_PROVIDERS };
export type { LensCaptureMode, PlatformConfig, SmallModelProvider };

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

export type SandboxProvider = SandboxProviderName;

export const SANDBOX_PROVIDER_LABELS: Record<SandboxProvider, string> = {
  spaces: "Spaces",
  boat: "boat.dev",
  lizard: "lizard.build",
  sprites: "Sprites",
};

export type CloudSettings = {
  provider: SandboxProvider;
  base: string;
  project: string;
  runnerUrl: string;
  keyHint: string;
};

export type CloudSettingsDraft = {
  provider: SandboxProvider;
  base: string;
  project: string;
  runnerUrl: string;
  apiKey: string;
};

export type CloudLifecycle = {
  agentIdleSeconds: number;
  userIdleSeconds: number;
  expireHours: number;
  maxAgeHours: number;
  maxRunning: number | null;
  startBurst: number | null;
  startEveryMinutes: number;
  monthlyBudgetCents: number | null;
  softBudgetPercent: number;
};

export type LensSettings = {
  baseUrl: string;
  publicKey: string;
  keyHint: string;
  captureMode: LensCaptureMode;
};

export type LensSettingsDraft = {
  baseUrl: string;
  publicKey: string;
  secretKey: string;
  captureMode: LensCaptureMode;
};

export const LENS_CAPTURE_MODE_LABELS: Record<LensCaptureMode, string> = {
  safe: "Safe: no prompts or responses",
  full: "Full: prompts and responses",
};
