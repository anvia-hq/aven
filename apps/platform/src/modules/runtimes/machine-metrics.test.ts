import { describe, expect, test } from "bun:test";

import { machineMetrics } from "./machine-metrics";

const stats = {
  cores: 4,
  cpuPercent: 37,
  memoryUsedBytes: 6 * 1024 ** 3,
  memoryTotalBytes: 16 * 1024 ** 3,
  diskUsedBytes: 74 * 1024 ** 3,
  diskTotalBytes: 98 * 1024 ** 3,
  sandboxes: 2,
  reportedAt: "2026-11-02T08:00:00Z",
};

describe("machineMetrics", () => {
  test("are CPU, memory and disk, each with what is behind its number", () => {
    expect(machineMetrics(stats)).toEqual([
      { key: "cpu", label: "CPU", short: "CPU", percent: 37, detail: "4 cores" },
      { key: "memory", label: "Memory", short: "MEM", percent: 38, detail: "6.0 of 16.0 GB" },
      { key: "disk", label: "Disk", short: "DSK", percent: 76, detail: "74.0 of 98.0 GB" },
    ]);
  });

  test("keep a processor figure that is not known as not known, and never go past full", () => {
    const [cpu, memory] = machineMetrics({
      ...stats,
      cpuPercent: null,
      cores: 1,
      memoryUsedBytes: 20 * 1024 ** 3,
    });
    expect(cpu).toMatchObject({ percent: null, detail: "1 core" });
    expect(memory?.percent).toBe(100);
  });

  test("say nothing of a disk with no size", () => {
    expect(machineMetrics({ ...stats, diskTotalBytes: 0 })[2]?.percent).toBeNull();
  });
});
