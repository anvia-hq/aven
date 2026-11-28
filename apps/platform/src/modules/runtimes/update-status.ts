import type { PlatformConfig } from "@aven/protocol/types";

import type { Runtime, ServerUpdate, UpdateSummary } from "./types";

function tooltipFor(server: ServerUpdate | null, runners: Runtime[], updating: boolean) {
  if (updating) return "Updating Aven…";

  if (server?.to) return `Update available · v${server.to}`;

  if (runners.length === 1) {
    const only = runners[0]!;
    return only.updateTo ? `Update available · v${only.updateTo}` : "Update available";
  }

  return `${runners.length} runner updates available`;
}

export function summarizeUpdates({
  config,
  runtimes,
  isUpdating,
}: {
  config: PlatformConfig | null;
  runtimes: Runtime[];
  isUpdating: (runtime: Runtime) => boolean;
}): UpdateSummary | null {
  const controlPlane = runtimes.find((runtime) => runtime.isControlPlane);
  let server: ServerUpdate | null = null;

  if (config?.updateTo) {
    server = {
      from: config.version ?? controlPlane?.build ?? null,
      to: config.updateTo,
      runtime: controlPlane,
    };
  } else if (controlPlane && (controlPlane.updateTo || isUpdating(controlPlane))) {
    server = {
      from: controlPlane.build,
      to: controlPlane.updateTo,
      runtime: controlPlane,
    };
  }

  const runners = runtimes.filter(
    (runtime) => !runtime.isControlPlane && (runtime.updateTo !== null || isUpdating(runtime)),
  );

  if (!server && runners.length === 0) return null;

  const updating =
    Boolean(server?.runtime && isUpdating(server.runtime)) ||
    runners.some((runtime) => isUpdating(runtime));
  const targetVersion = server?.to ?? runners.find((runtime) => runtime.updateTo)?.updateTo ?? null;

  return {
    server,
    runners,
    updating,
    targetVersion,
    tooltip: tooltipFor(server, runners, updating),
  };
}
