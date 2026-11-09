import { driverName, parseDriverPrompt } from "@aven/protocol/drivers";

import type { MessageAuthor, Viewer } from "./types";

export function authorOf(prompt: string, viewer: Viewer): MessageAuthor {
  const { driver, text } = parseDriverPrompt(prompt);
  if (viewer.owned) return { mine: driver === undefined, name: driver ?? viewer.ownerName, text };
  const mine = driver !== undefined && driver === driverName(viewer.name);
  return { mine, name: driver ?? viewer.ownerName, text };
}
