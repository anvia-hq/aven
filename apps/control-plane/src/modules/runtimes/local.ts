import { startRuntime } from "@aven/runtime-client/runner";
import { Sandboxes, journalPathIn } from "@aven/runtime-client/sandbox";
import { sandboxConfigFromEnv } from "@aven/runtime-client/sandbox-config";

import { describeError } from "../../errors";
import { runtimesService } from "./service";

// The control plane is a runner too: it hosts sandboxes on its own machine, so a project works
// with no runner set up (decision 0010). It connects to itself like any other runner, through the
// WebSocket, with a token that exists only in this process. Like any runner it needs Docker and
// the sandbox image; without them it stays offline and says why. `AVEN_LOCAL_RUNNER=off` turns it
// off.
export async function startLocalRunner(port: number) {
  if (process.env.AVEN_LOCAL_RUNNER === "off") return undefined;
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
