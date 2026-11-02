import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";

import { cpuSampler, parseMeminfo, parseVmStat, readHostStats } from "./host-stats";

describe("the processors' load", () => {
  test("is the share of time spent working since it was last asked", () => {
    const readings = [
      { busy: 0, total: 0 },
      { busy: 30, total: 100 },
      { busy: 130, total: 200 },
      { busy: 130, total: 200 },
    ];
    const sample = cpuSampler(() => readings.shift()!);

    expect(sample()).toBe(30);
    expect(sample()).toBe(100);
    // No time has passed: nothing to say.
    expect(sample()).toBeNull();
  });
});

describe("memory, as each system tells it", () => {
  test("Linux: what is not available is in use, the cache counting as available", () => {
    const meminfo = [
      "MemTotal:       16384000 kB",
      "MemFree:          500000 kB",
      "MemAvailable:    8192000 kB",
      "Buffers:          100000 kB",
    ].join("\n");

    expect(parseMeminfo(meminfo)).toEqual({ total: 16384000 * 1024, used: 8192000 * 1024 });
    expect(parseMeminfo("MemTotal: 5 kB")).toBeUndefined();
  });

  test("macOS: free, inactive and speculative pages can be had again", () => {
    const vmStat = [
      "Mach Virtual Memory Statistics: (page size of 16384 bytes)",
      "Pages free:                               1000.",
      "Pages active:                             5000.",
      "Pages inactive:                           3000.",
      "Pages speculative:                        500.",
    ].join("\n");
    const total = 10_000 * 16384;

    expect(parseVmStat(vmStat, total)).toEqual({ total, used: total - 4500 * 16384 });
    expect(parseVmStat("nothing useful", total)).toBeUndefined();
  });
});

describe("reading this machine", () => {
  test("gives numbers a machine can have, and the sandboxes it was told of", async () => {
    const stats = await readHostStats({ home: tmpdir(), cpu: () => 12, sandboxes: 3 });

    expect(stats.cores).toBeGreaterThanOrEqual(1);
    expect(stats.cpuPercent).toBe(12);
    expect(stats.sandboxes).toBe(3);
    expect(stats.memoryTotalBytes).toBeGreaterThan(0);
    expect(stats.memoryUsedBytes).toBeGreaterThan(0);
    expect(stats.memoryUsedBytes).toBeLessThanOrEqual(stats.memoryTotalBytes);
    expect(stats.diskTotalBytes).toBeGreaterThan(0);
    expect(stats.diskUsedBytes).toBeLessThanOrEqual(stats.diskTotalBytes);
  });

  test("fails for a directory that is not there, which the runner skips", async () => {
    await expect(
      readHostStats({ home: "/nonexistent/aven-home", cpu: () => null, sandboxes: 0 }),
    ).rejects.toThrow();
  });
});
