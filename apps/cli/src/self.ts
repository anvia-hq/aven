import { basename } from "node:path";

export function selfCommand() {
  return basename(process.execPath).startsWith("bun")
    ? [process.execPath, Bun.main]
    : [process.execPath];
}
