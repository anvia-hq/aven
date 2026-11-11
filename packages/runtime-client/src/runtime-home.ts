import { homedir } from "node:os";
import { join } from "node:path";

export const runtimeHome = (home?: string) => home ?? join(homedir(), ".aven", "runtime");
export const journalPathIn = (home?: string) => join(runtimeHome(home), "runs.db");
