import { startRuntime } from "@aven/runtime-client/runner";
import { Sandboxes, journalPathIn } from "@aven/runtime-client/sandbox";
import { sandboxConfigFromEnv } from "@aven/runtime-client/sandbox-config";

import { describeError } from "../../errors";
import { runtimesService } from "./service";

const MODES = ["on", "off", "host"] as const;
export type LocalRunnerMode = (typeof MODES)[number];

// What `AVEN_LOCAL_RUNNER` says about the control plane's own runner, `on` when unset:
// - `on`: the control plane hosts sandboxes itself, in this process (decision 0010);
// - `off`: it has none, and runners are the ones people attach;
// - `host`: it has one that is a separate process on the same machine (`aven runner`), which
//   connects like any other runner with `AVEN_LOCAL_RUNNER_TOKEN`. This is how a server in a
//   container, with no Docker of its own, still has a runner at once (decision 0073).
export function localRunnerMode(env: string | undefined): LocalRunnerMode {
  const mode = env || "on";
  if (!MODES.includes(mode as LocalRunnerMode))
    throw new Error(`AVEN_LOCAL_RUNNER must be one of ${MODES.join(", ")}, got "${mode}"`);
  return mode as LocalRunnerMode;
}

// The control plane is a runner too: it hosts sandboxes on its own machine, so a project works
// with no runner set up (decision 0010). It connects to itself like any other runner, through the
// WebSocket, with a token that exists only in this process. Like any runner it needs Docker and
// the sandbox image; without them it stays offline and says why.
export async function startLocalRunner(port: number) {
  const mode = localRunnerMode(process.env.AVEN_LOCAL_RUNNER);
  if (mode === "off") return undefined;
  if (mode === "host") {
    // The row has to exist for the runner outside to connect as it. Without a token of its own,
    // nothing could.
    if (!process.env.AVEN_LOCAL_RUNNER_TOKEN)
      throw new Error("AVEN_LOCAL_RUNNER=host needs AVEN_LOCAL_RUNNER_TOKEN");
    await runtimesService.ensureLocal();
    return undefined;
  }
  // Read before anything starts, so a bad value fails loudly instead of reading as "offline".
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
