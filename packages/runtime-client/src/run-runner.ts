import { startRuntime } from "./runner";
import { Sandboxes, journalPathIn } from "./sandbox";
import { sandboxConfigFromEnv } from "./sandbox-config";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The WebSocket a runner opens, from the control plane's address (http or https, optionally with a path such as /api). */
export const runtimeConnectUrl = (base: string) =>
  `${base.replace(/^http/, "ws").replace(/\/$/, "")}/runtimes/connect`;

/**
 * A runner process: connects out to a control plane and hosts the sandboxes its threads run in
 * until it is stopped or refused, then exits the process. `apps/runtime` and `aven runner run` both
 * start it. The sandbox settings come from the environment (`sandboxConfigFromEnv`).
 */
export async function runRunner({
  base,
  token,
  build,
  update,
}: {
  base: string;
  token: string;
  /** The release of the `aven` running it, if it is one. */
  build?: string;
  /** Starts the machine's `aven update` outside this process; given by an installed `aven` only. */
  update?: (release: string | undefined) => void;
}) {
  // Stopping works whichever comes first: a signal while still connecting, or a refusal.
  let runtime: ReturnType<typeof startRuntime> | undefined;
  let stopping: Promise<void> | undefined;
  function exit(code: number) {
    stopping ??= (async () => {
      // Background commands the agent started are process groups; stop them with the runtime.
      await runtime?.stop();
      process.exit(code);
    })();
    return stopping;
  }
  process.on("SIGINT", () => void exit(0));
  process.on("SIGTERM", () => void exit(0));

  // Every thread runs in its own container on this machine (decision 0010): Docker and the sandbox
  // image are required, and there is no mode that runs the agent's commands directly on this machine.
  let sandbox: Sandboxes;
  try {
    sandbox = await Sandboxes.start(sandboxConfigFromEnv());
  } catch (error) {
    console.error(errorMessage(error));
    process.exit(1);
  }

  runtime = startRuntime({
    url: runtimeConnectUrl(base),
    token,
    build,
    update,
    sandbox,
    journalPath: journalPathIn(process.env.AVEN_RUNTIME_HOME || undefined),
    onRefused: (reason) => {
      console.error(`The control plane refused this runtime: ${reason}`);
      void exit(1);
    },
  });

  await runtime.ready;
  console.log(`runtime connected to ${base}`);
}
