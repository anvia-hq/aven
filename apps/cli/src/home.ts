import { homedir } from "node:os";
import { join } from "node:path";

/** Where `aven` keeps what it installs: `AVEN_HOME`, else `~/.aven`. */
export const avenHome = (env: Record<string, string | undefined> = process.env) =>
  env.AVEN_HOME || join(homedir(), ".aven");

/** The server's compose file and `.env`. */
export const serverDir = (home = avenHome()) => join(home, "server");

/** The runner's settings: the control plane's address, its token and the sandbox's limits. */
export const runnerEnvFile = (home = avenHome()) => join(home, "runner.env");

/** What background services write: the runner's output. */
export const logsDir = (home = avenHome()) => join(home, "logs");
