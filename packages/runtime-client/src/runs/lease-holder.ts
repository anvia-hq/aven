import { readFileSync } from "node:fs";

function statusOf(who: number | "self") {
  try {
    const text = readFileSync(`/proc/${who}/status`, "utf8");
    const field = (name: string) => new RegExp(`^${name}:\\s*(.+)$`, "m").exec(text)?.[1]?.trim();
    return { name: field("Name"), processId: Number(field("Tgid")) };
  } catch {
    return undefined;
  }
}

function processAlive(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function runnerHoldsLease(pid: number) {
  const own = statusOf("self");

  if (!own) return processAlive(pid);

  const holder = statusOf(pid);

  return holder !== undefined && holder.processId === pid && holder.name === own.name;
}
