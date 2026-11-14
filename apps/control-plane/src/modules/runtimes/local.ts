import { startRuntime } from "@aven/runtime-client/runner";
import { delimiter } from "node:path";

import { HostSandboxes } from "@aven/runtime-client/host-sandboxes";
import { journalPathIn } from "@aven/runtime-client/runtime-home";

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
    const sandbox = await HostSandboxes.start({
      home,
      dirs: (process.env.AVEN_DIRS ?? "").split(delimiter).filter(Boolean),
    });
    return startRuntime({
      url: `ws://localhost:${port}/runtimes/connect`,
      token: runtimesService.localToken,
      sandbox,
      host: true,
      dirs: sandbox.dirs,
      journalPath: journalPathIn(home),
    });
  } catch (error) {
    console.warn(`The control plane's own runner is offline: ${describeError(error)}`);
    return undefined;
  }
}
