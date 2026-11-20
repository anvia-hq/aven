import type { CloudSandboxProvider, SandboxClock, SandboxRecord, SandboxRunner } from "../types";
import type { LizardClient } from "./client";

export type LizardMachineType = "small" | "default" | "large" | "xlarge";

export type LizardSize = "nano" | "mini" | "small" | "medium" | "large" | "big";

export type LizardSandbox = {
  id: string;
  state: string;
  pauseError: string | null;
  region: string | null;
  size: string | null;
  pricePerHour: number | null;
};

export type LizardSavedSnapshot = {
  name: string;
  status: "saving" | "ready" | "failed";
  error: string | null;
};

export type LizardExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type LizardProvider<T extends SandboxRunner = SandboxRunner> = CloudSandboxProvider<T> & {
  destroy(sandboxId: string): Promise<void>;
};

export type LizardWake = {
  record: SandboxRecord;
  client: LizardClient;
  runnerUrl: string;
  project?: string;
  region?: string;
  template?: string;
  release?: string;
  saveSandboxId: (sandboxId: string) => Promise<void>;
  connected: () => boolean;
  forget?: () => void;
  clock?: SandboxClock;
  readyTimeoutMs?: number;
  settleMs?: number;
  connectTimeoutMs?: number;
};

export type LizardProviderDeps<T extends SandboxRunner> = {
  hub: {
    get(runtimeId: string): T | undefined;
    disconnect?(runtimeId: string, reason: string): void;
  };
  record(input: { runtimeId: string; revoked?: boolean }): Promise<SandboxRecord | null>;
  saveSandboxId(runtimeId: string, sandboxId: string): Promise<void>;
  clock?: SandboxClock;
  apiKey?: () => string | null;
  client?: () => LizardClient;
  runnerUrl?: () => string;
  project?: () => string | undefined;
  region?: () => string | undefined;
  template?: () => string;
  release?: () => string | undefined;
};
