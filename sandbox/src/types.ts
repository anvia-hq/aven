import type { BoatMachineType, RunnerCallMethod, RuntimeProviderKind } from "@aven/protocol/types";

export type SandboxRecord = {
  runtimeId: string;
  apiKey: string;
  runnerToken: string;
  sandboxId: string | null;
  machineType: BoatMachineType;
  environment?: string | null;
};

export type SavedEnvironment = {
  name: string;
  status: "saving" | "ready" | "failed";
  error: string | null;
};

export type SandboxRunner = {
  call(method: RunnerCallMethod, params: unknown, timeoutMs?: number): Promise<unknown>;
};

export type SandboxHub<T extends SandboxRunner> = {
  get(runtimeId: string): T | undefined;
  disconnect?(runtimeId: string, reason: string): void;
};

export type RunnerPlace = { runtimeId: string; threadId?: string };

export type ThreadPlace = Required<RunnerPlace>;

export type SandboxClock = {
  now(): number;
  sleep(ms: number): Promise<void>;
};

export type SandboxStore = {
  record(input: {
    provider: RuntimeProviderKind;
    runtimeId: string;
    revoked?: boolean;
  }): Promise<SandboxRecord | null>;
  saveSandboxId(runtimeId: string, sandboxId: string): Promise<void>;
  providerOf(runtimeId: string): Promise<RuntimeProviderKind | undefined>;
  isExpiredCloud(runtimeId: string): Promise<boolean>;
  admit?(runtimeId: string): Promise<void>;
};

export type ProviderDeps<T extends SandboxRunner> = {
  hub: SandboxHub<T>;
  record(input: { runtimeId: string; revoked?: boolean }): Promise<SandboxRecord | null>;
  saveSandboxId(runtimeId: string, sandboxId: string): Promise<void>;
  clock?: SandboxClock;
};

export type SandboxProvider<T extends SandboxRunner> = {
  readonly kind: RuntimeProviderKind;
  start(place: RunnerPlace, offline?: string): Promise<T>;
  release(place: ThreadPlace, runner: T | undefined): Promise<void>;
};

export type CloudSandboxProvider<T extends SandboxRunner> = SandboxProvider<T> & {
  stop(runtimeId: string): Promise<void>;
};

export type ProviderFactory = <T extends SandboxRunner>(
  deps: ProviderDeps<T>,
) => CloudSandboxProvider<T>;

export type SandboxLifetime = {
  woke(runtimeId: string, started: boolean, autoStopMs: number, now?: number): void;
  stopped(runtimeId: string, now?: number): void;
  mayHaveStopped(runtimeId: string, now?: number): boolean;
};

export type CloudProviderModule = {
  apiKey(): string | null;
  ready(): boolean;
  create: ProviderFactory;
  stop(record: SandboxRecord): Promise<void>;
  extend(record: SandboxRecord): Promise<void>;
  removeSandbox(sandboxId: string): Promise<boolean>;
  saveEnvironment(sandboxId: string, name: string): Promise<SavedEnvironment>;
  readEnvironment(name: string): Promise<SavedEnvironment | null>;
  removeEnvironment(name: string): Promise<boolean>;
  lifetime: SandboxLifetime;
};

export type IdleCloudSandbox = {
  id: string;
  provider: RuntimeProviderKind;
  sandboxId: string | null;
};

export type SandboxRemover = (sandboxId: string) => Promise<boolean>;

export type CloudExpiryOptions = {
  intervalMs: number;
  afterMs?: number | (() => Promise<number>);
  idle(before: Date): Promise<IdleCloudSandbox[]>;
  expire(runtimeId: string): Promise<void>;
  remove(provider: RuntimeProviderKind, sandboxId: string): Promise<boolean>;
};

export type IdleWindows = {
  agentIdleMs: number;
  userIdleMs: number;
};

export type SandboxIdle = {
  windows: IdleWindows;
  now: number;
  lastAgentAt: number;
  lastUserAt: number;
  agentRunning: boolean;
};

export type CloudSandboxThread = {
  runtimeId: string;
  threadId: string;
  updatedAt: Date;
};

export type CloudSandboxPage = {
  sandboxIds: string[];
  threads: CloudSandboxThread[];
};
