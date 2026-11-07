import { homedir } from "node:os";
import { join } from "node:path";

export const avenHome = (env: Record<string, string | undefined> = process.env) =>
  env.AVEN_HOME || join(homedir(), ".aven");

export const serverDir = (home = avenHome()) => join(home, "server");

export const runnerEnvFile = (home = avenHome()) => join(home, "runner.env");

export const logsDir = (home = avenHome()) => join(home, "logs");
