import { startRuntime } from "@aven/runtime-client/runner";
import { Sandboxes, journalPathIn } from "@aven/runtime-client/sandbox";
import { sandboxConfigFromEnv } from "@aven/runtime-client/sandbox-config";

import { describeError } from "../../errors";
import { runtimesService } from "./service";

const MODES = ["on", "off", "host"] as const;
export type LocalRunnerMode = (typeof MODES)[number];

export function localRunnerMode(env: string | undefined): LocalRunnerMode {
  const mode = env || "on";
  if (!MODES.includes(mode as LocalRunnerMode))
    throw new Error(`AVEN_LOCAL_RUNNER must be one of ${MODES.join(", ")}, got "${mode}"`);
  return mode as LocalRunnerMode;
}

export async function startLocalRunner(port: number) {
  const mode = localRunnerMode(process.env.AVEN_LOCAL_RUNNER);
  if (mode === "off") return undefined;
  if (mode === "host") {
    if (!process.env.AVEN_LOCAL_RUNNER_TOKEN)
      throw new Error("AVEN_LOCAL_RUNNER=host needs AVEN_LOCAL_RUNNER_TOKEN");
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
    });
  } catch (error) {
    console.warn(`The control plane's own runner is offline: ${describeError(error)}`);
    return undefined;
  }
}
