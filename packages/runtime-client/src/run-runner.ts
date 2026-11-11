import { startRuntime } from "./runner";
import { HostSandboxes } from "./host-sandboxes";
import { Sandboxes, journalPathIn } from "./sandbox";
import { sandboxConfigFromEnv } from "./sandbox-config";
import type { ThreadWorkspaces } from "./types";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const runtimeConnectUrl = (base: string) =>
  `${base.replace(/^http/, "ws").replace(/\/$/, "")}/runtimes/connect`;

export async function runRunner({
  base,
  token,
  build,
  update,
}: {
  base: string;
  token: string;
  build?: string;
  update?: (release: string | undefined) => void;
}) {
  let runtime: ReturnType<typeof startRuntime> | undefined;
  let stopping: Promise<void> | undefined;
  function exit(code: number) {
    stopping ??= (async () => {
      await runtime?.stop();
      process.exit(code);
    })();
    return stopping;
  }
  process.on("SIGINT", () => void exit(0));
  process.on("SIGTERM", () => void exit(0));

  let sandbox: ThreadWorkspaces;
  try {
    sandbox =
      process.env.AVEN_SANDBOX === "host"
        ? await HostSandboxes.start({ home: process.env.AVEN_RUNTIME_HOME || undefined })
        : await Sandboxes.start(sandboxConfigFromEnv());
  } catch (error) {
    console.error(errorMessage(error));
    process.exit(1);
  }

  runtime = startRuntime({
    url: runtimeConnectUrl(base),
    token,
    build,
    host: process.env.AVEN_SANDBOX === "host",
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
