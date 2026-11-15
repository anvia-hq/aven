import { app } from "./app";
import {
  botApiApp,
  botRunner,
  cloudExpiry,
  goalDriver,
  previews,
  runsService,
  scheduler,
  threadRetention,
  threadWatcher,
} from "./composition";
import { editionInUse } from "./edition/current";
import type { Edition } from "./edition/types";
import type { KnownRoute } from "./modules/bot-api/types";
import { startLocalRunner } from "./modules/runtimes/local";
import { runtimesService } from "./modules/runtimes/service";
import { startPreviews } from "./modules/preview/start";

export async function startControlPlane(edition: Edition) {
  editionInUse.current = edition;

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

  app.listen(port);

  const localRunner = await startLocalRunner(port);
  await runtimesService.ensureCloud();
  const previewListener = startPreviews(previews);

  const shutdown = async () => {
    botRunner.dispose();
    previewListener?.stop();
    await localRunner?.stop();
    await scheduler.close();
    await goalDriver.close();
    await threadWatcher.close();
    await threadRetention.close();
    await cloudExpiry.close();
    runsService.dispose();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  scheduler.start();
  goalDriver.start();
  threadWatcher.start();
  threadRetention.start();
  cloudExpiry.start();

  console.log(`control-plane listening on ${app.server?.url}`);
}
