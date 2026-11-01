import { basename } from "node:path";

/** The command that runs this program again: the binary itself, or bun with the script when run from a checkout. */
export function selfCommand() {
  return basename(process.execPath).startsWith("bun")
    ? [process.execPath, Bun.main]
    : [process.execPath];
}
