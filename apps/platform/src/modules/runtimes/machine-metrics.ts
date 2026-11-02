import { storageUsage } from "@/lib/format";

import type { RuntimeStats } from "./types";

export type MachineMetricKey = "cpu" | "memory" | "disk";

/** One meter of a machine: its name, how full it is (null when the machine cannot say) and what is behind the number. */
export type MachineMetric = {
  key: MachineMetricKey;
  label: string;
  /** Three letters, for a row with no room for the name. */
  short: string;
  percent: number | null;
  detail: string;
};

/** A meter this full is a warning, drawn in the destructive colour. */
export const METER_HIGH = 90;

const share = (used: number, total: number) =>
  total > 0 ? Math.round(Math.min(100, (used / total) * 100)) : null;

// The three things worth watching on a machine that runs agents, in the order the arrows go.
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
