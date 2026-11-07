import { readFile } from "node:fs/promises";
import { statfs } from "node:fs/promises";
import { cpus, freemem, platform, totalmem } from "node:os";

import type { HostStats } from "@aven/protocol/runtime-wire";

import { runCommand } from "./run-command";

type CpuTimes = { busy: number; total: number };

const cpuTimes = (): CpuTimes => {
  let busy = 0;
  let total = 0;
  for (const { times } of cpus()) {
    const all = times.user + times.nice + times.sys + times.idle + times.irq;
    total += all;
    busy += all - times.idle;
  }
  return { busy, total };
};

export function cpuSampler(read: () => CpuTimes = cpuTimes) {
  let before = read();
  return () => {
    const now = read();
    const total = now.total - before.total;
    const busy = now.busy - before.busy;
    before = now;
    return total > 0 ? Math.round(Math.min(100, Math.max(0, (busy / total) * 100))) : null;
  };
}

export function parseMeminfo(text: string) {
  const kib = (name: string) => {
    const found = text.match(new RegExp(`^${name}:\\s+(\\d+)\\s*kB`, "m"));
    return found ? Number(found[1]) * 1024 : undefined;
  };
  const total = kib("MemTotal");
  const available = kib("MemAvailable");
  if (total === undefined || available === undefined) return undefined;
  return { total, used: Math.max(0, total - available) };
}

export function parseVmStat(text: string, totalBytes: number) {
  const size = Number(text.match(/page size of (\d+) bytes/)?.[1]);
  const pages = (name: string) =>
    Number(text.match(new RegExp(`^Pages ${name}:\\s+(\\d+)`, "m"))?.[1]);
  const free = pages("free") + pages("inactive") + (pages("speculative") || 0);
  if (!Number.isFinite(size) || !Number.isFinite(free)) return undefined;
  return { total: totalBytes, used: Math.max(0, totalBytes - free * size) };
}

async function memory() {
  try {
    if (platform() === "linux") {
      const found = parseMeminfo(await readFile("/proc/meminfo", "utf8"));
      if (found) return found;
    }
    if (platform() === "darwin") {
      const result = await runCommand(["vm_stat"], { timeoutMs: 3_000 });
      const found = result.code === 0 ? parseVmStat(result.stdout, totalmem()) : undefined;
      if (found) return found;
    }
  } catch {}
  return { total: totalmem(), used: totalmem() - freemem() };
}

async function disk(path: string) {
  const fs = await statfs(path);
  const total = fs.blocks * fs.bsize;
  return { total, used: Math.max(0, total - fs.bfree * fs.bsize) };
}

export async function readHostStats({
  home,
  cpu,
  sandboxes,
}: {
  home: string;
  cpu: () => number | null;
  sandboxes: number;
}): Promise<HostStats> {
  const [ram, storage] = await Promise.all([memory(), disk(home)]);
  return {
    cores: Math.max(1, cpus().length),
    cpuPercent: cpu(),
    memoryUsedBytes: Math.round(ram.used),
    memoryTotalBytes: Math.round(ram.total),
    diskUsedBytes: Math.round(storage.used),
    diskTotalBytes: Math.round(storage.total),
    sandboxes,
  };
}
