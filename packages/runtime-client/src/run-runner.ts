import { delimiter } from "node:path";

import { HostSandboxes } from "./host-sandboxes";
import { startRuntime } from "./runner";
import { journalPathIn } from "./runtime-home";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const servedFolders = (value: string | undefined) =>
  (value ?? "").split(delimiter).flatMap((dir) => {
    const trimmed = dir.trim();
    return trimmed ? [trimmed] : [];
  });

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
  let runtime: ReturnType<typeof startRuntime> | undefined = undefined;
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

  let sandbox: HostSandboxes;
  try {
    sandbox = await HostSandboxes.start({
      home: process.env.AVEN_RUNTIME_HOME || undefined,
      dirs: servedFolders(process.env.AVEN_DIRS),
    });
  } catch (error) {
    console.error(errorMessage(error));
    process.exit(1);
  }

  runtime = startRuntime({
    url: runtimeConnectUrl(base),
    token,
    build,
    host: true,
    dirs: sandbox.dirs,
    clone: (repository) => sandbox.cloneRepository(repository),
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
