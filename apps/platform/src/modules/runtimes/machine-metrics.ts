import { storageUsage } from "@/lib/format";

import type { RuntimeStats } from "./types";

export type MachineMetricKey = "cpu" | "memory" | "disk";

export type MachineMetric = {
  key: MachineMetricKey;
  label: string;
  short: string;
  percent: number | null;
  detail: string;
};

export const STATS_STALE_MS = 60_000;

export const isStale = (stats: RuntimeStats, now = Date.now()) =>
  now - Date.parse(stats.reportedAt) > STATS_STALE_MS;

export const METER_BUSY = 60;

export const METER_HIGH = 90;

export type MeterLevel = "low" | "busy" | "high";

export function meterLevel(percent: number | null): MeterLevel {
  if (percent === null || percent < METER_BUSY) return "low";
  return percent >= METER_HIGH ? "high" : "busy";
}

const share = (used: number, total: number) =>
  total > 0 ? Math.round(Math.min(100, (used / total) * 100)) : null;

export function machineMetrics(stats: RuntimeStats): MachineMetric[] {
  return [
    {
      key: "cpu",
      label: "CPU",
      short: "CPU",
      percent: stats.cpuPercent,
      detail: `${stats.cores} ${stats.cores === 1 ? "core" : "cores"}`,
    },
    {
      key: "memory",
      label: "Memory",
      short: "MEM",
      percent: share(stats.memoryUsedBytes, stats.memoryTotalBytes),
      detail: storageUsage(stats.memoryUsedBytes, stats.memoryTotalBytes),
    },
    {
      key: "disk",
      label: "Disk",
      short: "DSK",
      percent: share(stats.diskUsedBytes, stats.diskTotalBytes),
      detail: storageUsage(stats.diskUsedBytes, stats.diskTotalBytes),
    },
  ];
}
