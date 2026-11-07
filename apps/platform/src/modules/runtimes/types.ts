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
  tokenHint: string;
  online: boolean;
  build: string | null;
  outdated: boolean;
  updateTo: string | null;
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
