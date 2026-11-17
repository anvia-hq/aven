import { servedFolders, startHostRuntime } from "@aven/runtime-client/host-runtime";

import { describeError } from "@aven/server-kit/errors";
import { localRunnerToken, runtimesService } from "./service";
import type { LocalRunnerMode } from "./types";

export const MODES = ["on", "off", "host"] as const;
export function localRunnerMode(env: string | undefined): LocalRunnerMode {
  const mode = env || "on";

  if (!MODES.includes(mode as LocalRunnerMode))
    throw new Error(`AVEN_LOCAL_RUNNER must be one of ${MODES.join(", ")}, got "${mode}"`);

  return mode as LocalRunnerMode;
}

export async function startLocalRunner(port: number) {
  const mode = localRunnerMode(process.env.AVEN_LOCAL_RUNNER);

  if (mode === "off") return undefined;

  localRunnerToken(process.env.AVEN_LOCAL_RUNNER_TOKEN, mode);

  if (mode === "host") {
    await runtimesService.ensureLocal();
    return undefined;
  }

  const home = process.env.AVEN_RUNTIME_HOME || undefined;
  await runtimesService.ensureLocal();

  try {
    return await startHostRuntime({
      base: `http://localhost:${port}`,
      token: runtimesService.localToken,
      home,
      dirs: servedFolders(process.env.AVEN_DIRS),
    });
  } catch (error) {
    console.warn(`The control plane's own runner is offline: ${describeError(error)}`);
    return undefined;
  }
}
