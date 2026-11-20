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

export function runnerHoldsLease(pid: number) {
  const own = statusOf("self");

  if (!own) return true;

  const holder = statusOf(pid);

  return holder !== undefined && holder.processId === pid && holder.name === own.name;
}
