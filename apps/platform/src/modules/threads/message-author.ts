import { driverName, parseDriverPrompt } from "@aven/protocol/drivers";

import type { MessageAuthor, Viewer } from "./types";

export function authorOf(prompt: string, viewer: Viewer, senderId?: string): MessageAuthor {
  const { driver, text } = parseDriverPrompt(prompt);
  if (senderId) {
    const mine = senderId === viewer.id;
    const other = senderId === viewer.ownerId ? viewer.ownerName : (driver ?? "Teammate");
    return { mine, name: mine ? viewer.name : other, text };
  }
  if (viewer.owned) return { mine: driver === undefined, name: driver ?? viewer.ownerName, text };
  const mine = driver !== undefined && driver === driverName(viewer.name);
  return { mine, name: driver ?? viewer.ownerName, text };
}
