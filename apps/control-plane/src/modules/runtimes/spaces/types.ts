import type { RuntimeProvider } from "../types";
import type { SpacesClient } from "./client";

export type SpacesMachineType = "small" | "default" | "large" | "xlarge";

export type SpacesSandbox = {
  id: string;
  state: string;
};

export type SpacesWakeRecord = {
  runtimeId: string;
  apiKey: string;
  runnerToken: string;
  sandboxId: string | null;
  machineType: SpacesMachineType;
};

export type SpacesClock = {
  now(): number;
  sleep(ms: number): Promise<void>;
};

export type SpacesProvider = RuntimeProvider & {
  stop(runtimeId: string): Promise<void>;
  destroy(sandboxId: string): Promise<void>;
};

export type SpacesWake = {
  record: SpacesWakeRecord;
  client: SpacesClient;
  runnerUrl: string;
  saveSandboxId: (sandboxId: string) => Promise<void>;
  connected: () => boolean;
  forget?: () => void;
  clock?: SpacesClock;
  readyTimeoutMs?: number;
  settleMs?: number;
  connectTimeoutMs?: number;
};
