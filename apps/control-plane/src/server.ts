import { closeLens } from "@aven/agents/lens";

import { cloudSettingsService } from "./modules/cloud-settings/service";
import { shutdownDrainMs } from "./modules/runs/drain";
import { app } from "./app";
import {
  botApiApp,
  botRunner,
  cloudExpiry,
  cloudIdle,
  environmentExpiry,
  goalDriver,
  previews,
  runsService,
  scheduler,
  threadRetention,
  threadWatcher,
  pullRequestWatch,
} from "./composition";
import { lensEnabled } from "./modules/lens/flag";
import { claudeBackendEnabled, codexBackendEnabled } from "./modules/providers/backends";
import { editionInUse } from "./edition/current";
import type { Edition } from "./edition/types";
import type { KnownRoute } from "./modules/bot-api/types";
import { startLocalRunner } from "./modules/runtimes/local";
import { computerUsageService } from "./modules/runtimes/computer-usage";
import { runtimesService } from "./modules/runtimes/service";
import { startPreviews } from "./modules/preview/start";

export async function startControlPlane(edition: Edition) {
  editionInUse.current = edition;
  claudeBackendEnabled();
  codexBackendEnabled();
  lensEnabled();

  for (const route of edition.routes) app.use(route);

  botApiApp.current = {
    routes: () =>
      app.routes.map((route) => ({
        method: route.method as KnownRoute["method"],
        path: route.path,
        body: route.hooks?.body,
      })),
    handle: (request) => app.handle(request),
  };

  const port = Number(process.env.PORT ?? 8000);

  if (!Number.isInteger(port) || port <= 0)
    throw new Error(`PORT must be a port number, got "${process.env.PORT}"`);

  await computerUsageService.closeAll();
  app.listen(port);

  const localRunner = await startLocalRunner(port);
  await cloudSettingsService.apply();
  await runtimesService.ensureCloud();
  const previewListener = startPreviews(previews);

  const shutdown = async () => {
    const stillRunning = await runsService.drain(
      shutdownDrainMs(process.env.AVEN_SHUTDOWN_DRAIN_SECONDS),
    );

    if (stillRunning > 0) console.warn(`Shutting down with ${stillRunning} run(s) still working`);

    botRunner.dispose();
    previewListener?.stop();
    await localRunner?.stop();
    await scheduler.close();
    await goalDriver.close();
    await threadWatcher.close();
    await pullRequestWatch.close();
    await threadRetention.close();
    await cloudExpiry.close();
    await cloudIdle.close();
    await environmentExpiry.close();
    await closeLens();
    runsService.dispose();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  scheduler.start();
  goalDriver.start();
  threadWatcher.start();
  pullRequestWatch.start();
  threadRetention.start();
  cloudExpiry.start();
  cloudIdle.start();
  environmentExpiry.start();

  console.log(`control-plane listening on ${app.server?.url}`);
}
