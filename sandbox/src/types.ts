import type {
  BoatMachineType,
  CloudSandboxState,
  RunDrainReason,
  RunnerCallMethod,
  RuntimeProviderKind,
} from "@aven/protocol/types";

export type ProviderCredentials = {
  base: string;
  apiKey: string;
  runnerUrl: string;
  project?: string;
};

export type ProviderStopMode = "native_resume" | "snapshot_on_stop";

export type ProviderCapabilities = {
  readonly stopMode: ProviderStopMode;
  readonly supportsMaxLifetime: boolean;
  readonly supportsDiskSizeQuery: boolean;
  readonly defaultAutoStopSeconds: number;
};

export type SandboxRecord = {
  runtimeId: string;
  apiKey: string;
  runnerToken: string;
  sandboxId: string | null;
  machineType: BoatMachineType;
  environment?: string | null;
  credentials?: ProviderCredentials;
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
  onStarted?(runtimeId: string): Promise<void>;
  onStopped?(runtimeId: string): Promise<void>;
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

export type ExtendOptions = {
  ttlSeconds?: number;
};

export type CloudProviderModule = {
  readonly capabilities: ProviderCapabilities;
  apiKey(): string | null;
  ready(): boolean;
  create: ProviderFactory;
  stop(record: SandboxRecord, credentials?: ProviderCredentials): Promise<void>;
  extend(
    record: SandboxRecord,
    options?: ExtendOptions,
    credentials?: ProviderCredentials,
  ): Promise<void>;
  removeSandbox(sandboxId: string, credentials?: ProviderCredentials): Promise<boolean>;
  saveEnvironment(
    sandboxId: string,
    name: string,
    credentials?: ProviderCredentials,
  ): Promise<SavedEnvironment>;
  readEnvironment(
    name: string,
    credentials?: ProviderCredentials,
  ): Promise<SavedEnvironment | null>;
  removeEnvironment(name: string, credentials?: ProviderCredentials): Promise<boolean>;
  lifetime: SandboxLifetime;
};

export type IdleCloudSandbox = {
  id: string;
  provider: RuntimeProviderKind;
  sandboxId: string | null;
  credentials?: ProviderCredentials;
};

export type SandboxRemover = (
  sandboxId: string,
  credentials?: ProviderCredentials,
) => Promise<boolean>;

export type CloudExpiryOptions = {
  intervalMs: number;
  afterMs?: number | (() => Promise<number>);
  idle(before: Date): Promise<IdleCloudSandbox[]>;
  expire(runtimeId: string): Promise<void>;
  remove(
    provider: RuntimeProviderKind,
    sandboxId: string,
    credentials?: ProviderCredentials,
  ): Promise<boolean>;
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

export type SpendState = "ok" | "soft_warn" | "hard_stop";

export type SpendVerdict = {
  state: SpendState;
  usedMicros: number;
  budgetMicros: number | null;
  percent: number;
};

export type LifecyclePolicy = {
  agentIdleMs: number;
  userIdleMs: number;
  maxAgeMs: number;
  drainGraceMs: number;
  expireMs: number;
  extendEveryMs: number;
  transitionWatchdogMs: number;
  maxDeleteAttempts: number;
};

export type SandboxSnapshot = {
  runtimeId: string;
  state: CloudSandboxState;
  externalId: string | null;
  runtimeSnapshotName: string | null;
  dirty: boolean;
  runningSince: number | null;
  lastActivityAt: number;
  lastAgentAt: number;
  agentRunning: boolean;
  stoppedAt: number | null;
  drainRequestedAt: number | null;
  lastExtendedAt: number | null;
  expiresAt: number | null;
  deleteAttempts: number;
  nextRetryAt: number | null;
  drainingProvider: boolean;
  budgetExceeded: boolean;
};

export type StopReason = "idle" | "hard_wall" | "drain_timeout" | "budget" | "provider_switch";

export type LifecycleDecision =
  | { action: "noop" }
  | { action: "drain"; reason: RunDrainReason; deadlineAt: number }
  | { action: "force_stop"; reason: StopReason }
  | { action: "extend"; ttlSeconds: number }
  | { action: "delete"; reason: "expired" | "provider_switch" | "retry" }
  | { action: "reconcile_stuck"; state: "starting" | "stopping" | "deleting" };

export type DeleteRetryPlan = {
  giveUp: boolean;
  nextRetryAt: number | null;
};
