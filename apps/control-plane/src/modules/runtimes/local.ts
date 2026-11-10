import { codexSupportFromEnv } from "@aven/runtime-client/codex-support";
import { startRuntime } from "@aven/runtime-client/runner";
import { Sandboxes, journalPathIn } from "@aven/runtime-client/sandbox";
import { sandboxConfigFromEnv } from "@aven/runtime-client/sandbox-config";

import { describeError } from "../../errors";
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
  const config = sandboxConfigFromEnv();
  await runtimesService.ensureLocal();

  try {
    const sandbox = await Sandboxes.start(config);
    return startRuntime({
      url: `ws://localhost:${port}/runtimes/connect`,
      token: runtimesService.localToken,
      sandbox,
      journalPath: journalPathIn(config.home),
      codex: codexSupportFromEnv(process.env, config.home),
    });
  } catch (error) {
    console.warn(`The control plane's own runner is offline: ${describeError(error)}`);
    return undefined;
  }
}
