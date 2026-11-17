import { servedFolders, startHostRuntime } from "./host-runtime";
import type { StartedRuntime } from "./types";

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
  let runtime: StartedRuntime | undefined = undefined;
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

  try {
    runtime = await startHostRuntime({
      base,
      token,
      build,
      update,
      home: process.env.AVEN_RUNTIME_HOME || undefined,
      dirs: servedFolders(process.env.AVEN_DIRS),
      onRefused: (reason) => {
        console.error(`The control plane refused this runtime: ${reason}`);
        void exit(1);
      },
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  await runtime.ready;
  console.log(`runtime connected to ${base}`);
}
