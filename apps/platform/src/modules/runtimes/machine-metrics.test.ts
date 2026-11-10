import { describe, expect, test } from "bun:test";

import {
  busiestMetric,
  isStale,
  machineMetrics,
  meterLevel,
  STATS_STALE_MS,
} from "./machine-metrics";

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

describe("isStale", () => {
  test("is a report older than a minute, since a runner that is up reports every 15 seconds", () => {
    const at = Date.parse(stats.reportedAt);
    expect(isStale(stats, at + 15_000)).toBe(false);
    expect(isStale(stats, at + STATS_STALE_MS)).toBe(false);
    expect(isStale(stats, at + STATS_STALE_MS + 1)).toBe(true);
  });
});

describe("meterLevel", () => {
  test("is low below 60%, busy from 60% and high from 90%", () => {
    expect(meterLevel(0)).toBe("low");
    expect(meterLevel(59)).toBe("low");
    expect(meterLevel(60)).toBe("busy");
    expect(meterLevel(89)).toBe("busy");
    expect(meterLevel(90)).toBe("high");
    expect(meterLevel(100)).toBe("high");
  });

  test("is low for a reading the machine could not give", () => {
    expect(meterLevel(null)).toBe("low");
  });
});

describe("busiestMetric", () => {
  test("is the metric with the highest percent, the first one on a tie", () => {
    expect(busiestMetric(machineMetrics(stats))?.key).toBe("disk");
    expect(busiestMetric(machineMetrics({ ...stats, cpuPercent: 76 }))?.key).toBe("cpu");
  });

  test("skips a figure that is not known, and falls back to the first when none is", () => {
    const unknownCpu = machineMetrics({ ...stats, cpuPercent: null, diskTotalBytes: 0 });
    expect(busiestMetric(unknownCpu)?.key).toBe("memory");
    const none = machineMetrics({
      ...stats,
      cpuPercent: null,
      memoryTotalBytes: 0,
      diskTotalBytes: 0,
    });
    expect(busiestMetric(none)?.key).toBe("cpu");
  });

  test("has nothing to show for no metrics", () => {
    expect(busiestMetric([])).toBeUndefined();
  });
});
