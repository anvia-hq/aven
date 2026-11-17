import type { CloudSandboxProvider, SandboxClock, SandboxRecord, SandboxRunner } from "../types";
import type { SpacesClient } from "./client";

export type SpacesMachineType = "small" | "default" | "large" | "xlarge";

export type SpacesSettings = {
  base: string;
  apiKey: string;
  runnerUrl: string;
};

export type SpacesSandbox = {
  id: string;
  state: string;
};

export type SpacesSavedSnapshot = {
  name: string;
  status: "saving" | "ready" | "failed";
  error: string | null;
};

export type SpacesProvider<T extends SandboxRunner = SandboxRunner> = CloudSandboxProvider<T> & {
  destroy(sandboxId: string): Promise<void>;
};

export type SpacesWake = {
  record: SandboxRecord;
  client: SpacesClient;
  runnerUrl: string;
  saveSandboxId: (sandboxId: string) => Promise<void>;
  connected: () => boolean;
  forget?: () => void;
  clock?: SandboxClock;
  readyTimeoutMs?: number;
  settleMs?: number;
  connectTimeoutMs?: number;
};
