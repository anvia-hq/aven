import { join } from "node:path";

import { CodexThreads } from "./codex-threads";
import { runtimeHome } from "./sandbox";
import type { CodexSupport } from "./types";

export function codexSupportFromEnv(
  env: Record<string, string | undefined> = process.env,
  home?: string,
  which: (command: string) => string | null = Bun.which,
): CodexSupport | undefined {
  const path = env.AVEN_CODEX_PATH || which("codex");
  if (!path) return undefined;
  const base = runtimeHome(home);
  return {
    path,
    threads: new CodexThreads(join(base, "codex-threads.json")),
    env,
    work: join(base, "codex-work"),
  };
}
