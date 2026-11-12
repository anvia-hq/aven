import { app } from "./app";
import {
  botApiApp,
  botRunner,
  goalDriver,
  runsService,
  scheduler,
  threadWatcher,
} from "./composition";
import { editionInUse } from "./edition/current";
import type { Edition } from "./edition/types";
import type { KnownRoute } from "./modules/bot-api/types";
import { startLocalRunner } from "./modules/runtimes/local";

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

  const shutdown = async () => {
    botRunner.dispose();
    await localRunner?.stop();
    await scheduler.close();
    await goalDriver.close();
    await threadWatcher.close();
    runsService.dispose();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  scheduler.start();
  goalDriver.start();
  threadWatcher.start();

  console.log(`control-plane listening on ${app.server?.url}`);
}
