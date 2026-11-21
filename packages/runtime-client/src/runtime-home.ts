import { homedir } from "node:os";
import { join } from "node:path";

export const runtimeHome = (home?: string, env: Record<string, string | undefined> = process.env) =>
  home ?? join(env.AVEN_HOME || join(homedir(), ".aven"), "runtime");
export const journalPathIn = (
  home?: string,
  env: Record<string, string | undefined> = process.env,
) => join(runtimeHome(home, env), "runs.db");
