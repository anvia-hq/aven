import type { RunnerGithub, RuntimeGithubMode } from "@aven/protocol/types";

export type RuntimeStats = {
  cores: number;
  cpuPercent: number | null;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  diskUsedBytes: number;
  diskTotalBytes: number;
  sandboxes: number;
  reportedAt: string;
};

export type Runtime = {
  id: string;
  name: string;
  ownerId: string | null;
  host: boolean;
  shared: boolean;
  githubMode: RuntimeGithubMode;
  github: RunnerGithub | null;
  directories: string[];
  tokenHint: string;
  online: boolean;
  build: string | null;
  outdated: boolean;
  updateTo: string | null;
  isControlPlane: boolean;
  isCloud: boolean;
  parentRuntimeId: string | null;
  canUpdate: boolean;
  stats: RuntimeStats | null;
  lastSeenAt: string | null;
  createdAt: string;
};

export type CreatedRuntime = { runtime: Runtime; token: string };

export type MachineMetricKey = "cpu" | "memory" | "disk";

export type MachineMetric = {
  key: MachineMetricKey;
  label: string;
  short: string;
  percent: number | null;
  detail: string;
};

export type MeterLevel = "low" | "busy" | "high";

export type UpdateAsked = { from: string | null; at: number };

export type RuntimeChoice = {
  runtime: Runtime;
  disabled: boolean;
  note: string | null;
};

export type ServerUpdate = {
  from: string | null;
  to: string | null;
  runtime?: Runtime;
};

export type UpdateSummary = {
  server: ServerUpdate | null;
  runners: Runtime[];
  updating: boolean;
  targetVersion: string | null;
  tooltip: string;
};
