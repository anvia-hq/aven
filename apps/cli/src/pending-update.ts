import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { avenHome } from "./home";

type PendingUpdate = { from: string; to: string; binary: string; at: string };

export const pendingUpdateFile = (home = avenHome()) => join(home, "update-pending.json");

export async function writePendingUpdate(
  file: string,
  update: { from: string; to: string; binary: string; at?: string },
) {
  const marker = {
    from: update.from,
    to: update.to,
    binary: update.binary,
    at: update.at ?? new Date().toISOString(),
  };
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(marker, null, 2)}\n`, { mode: 0o600 });
}

export async function readPendingUpdate(file: string): Promise<PendingUpdate | undefined> {
  const text = await readFile(file, "utf8").catch(() => undefined);

  if (text === undefined) return undefined;

  const marker = parsed(text);

  if (typeof marker !== "object" || marker === null) return undefined;

  const fields = marker as Record<string, unknown>;

  if (typeof fields.to !== "string" || fields.to === "") return undefined;

  const word = (key: string) => {
    const value = fields[key];
    return typeof value === "string" ? value : "";
  };
  return { from: word("from"), to: fields.to, binary: word("binary"), at: word("at") };
}

export async function clearPendingUpdate(file: string) {
  await rm(file, { force: true });
}

function parsed(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
