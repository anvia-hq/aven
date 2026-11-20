import type { CloudSandboxState } from "@aven/protocol/types";
import type { SpendState } from "@aven/sandbox/types";

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

export type FailedCloudDelete = {
  runtimeId: string;
  provider: string;
  externalId: string | null;
  deleteAttempts: number;
  lastError: string | null;
  updatedAt: string;
};

export type CloudLifecycleStatus = {
  spend: {
    state: SpendState;
    usedCents: number;
    budgetCents: number | null;
    percent: number;
  };
  drainingProviders: number;
  failedDeletes: FailedCloudDelete[];
};

export type SandboxStateSummary = {
  runtimeId: string;
  state: CloudSandboxState;
  externalId: string | null;
  expiresAt: Date | null;
};
