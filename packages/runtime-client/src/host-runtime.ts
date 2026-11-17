import { delimiter } from "node:path";

import { HostSandboxes } from "./host-sandboxes";
import { journalPathIn } from "./runtime-home";
import { startRuntime } from "./runner";
import type { HostRuntimeOptions } from "./types";

export const servedFolders = (value: string | undefined) =>
  (value ?? "").split(delimiter).flatMap((dir) => {
    const trimmed = dir.trim();
    return trimmed ? [trimmed] : [];
  });

export const runtimeConnectUrl = (base: string) =>
  `${base.replace(/^http/, "ws").replace(/\/$/, "")}/runtimes/connect`;

export async function startHostRuntime(options: HostRuntimeOptions) {
  const sandbox = await HostSandboxes.start({
    home: options.home,
    dirs: options.dirs,
    git: options.git,
  });

  return startRuntime({
    url: runtimeConnectUrl(options.base),
    token: options.token,
    build: options.build,
    host: true,
    dirs: sandbox.dirs,
    clone: (repository) => sandbox.cloneRepository(repository),
    update: options.update,
    sandbox,
    journalPath: journalPathIn(options.home),
    onRefused: options.onRefused,
  });
}
