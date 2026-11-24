import type { CloudSandboxProvider, SandboxClock, SandboxRecord, SandboxRunner } from "../types";
import type { SpritesClient } from "./client";

export type SpritesSprite = {
  name: string;
  id: string;
  status: string;
  url: string | null;
};

export type SpritesExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type SpritesProvider<T extends SandboxRunner = SandboxRunner> = CloudSandboxProvider<T> & {
  destroy(name: string): Promise<void>;
};

export type SpritesWake = {
  record: SandboxRecord;
  client: SpritesClient;
  runnerUrl: string;
  release?: string;
  saveSandboxId: (name: string) => Promise<void>;
  connected: () => boolean;
  forget?: () => void;
  clock?: SandboxClock;
  connectTimeoutMs?: number;
  settleMs?: number;
};

export type SpritesProviderDeps<T extends SandboxRunner> = {
  hub: {
    get(runtimeId: string): T | undefined;
    disconnect?(runtimeId: string, reason: string): void;
  };
  record(input: { runtimeId: string; revoked?: boolean }): Promise<SandboxRecord | null>;
  saveSandboxId(runtimeId: string, sandboxId: string): Promise<void>;
  clock?: SandboxClock;
  apiKey?: () => string | null;
  client?: () => SpritesClient;
  runnerUrl?: () => string;
  release?: () => string | undefined;
};
