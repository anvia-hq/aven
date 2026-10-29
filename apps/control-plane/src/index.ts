import { Elysia } from "elysia";

import { errorsRouter } from "./errors";
import { authRouter } from "./modules/auth/router";
import { platformRouter } from "./modules/platform/router";
import { projectsRouter } from "./modules/projects/router";
import { providersRouter } from "./modules/providers/router";
import { runtimesRouter } from "./modules/runtimes/router";
import { startLocalRunner } from "./modules/runtimes/local";
import { runsService } from "./modules/runs/service";
import { threadsRouter } from "./modules/threads/router";
import { usersRouter } from "./modules/users/router";

const app = new Elysia()
  .use(errorsRouter)
  .get("/health", () => ({ status: "ok" }))
  .use(authRouter)
  .use(platformRouter)
  .use(projectsRouter)
  .use(providersRouter)
  .use(runtimesRouter)
  .use(threadsRouter)
  .use(usersRouter);

const port = Number(process.env.PORT ?? 8000);
if (!Number.isInteger(port) || port <= 0)
  throw new Error(`PORT must be a port number, got "${process.env.PORT}"`);
app.listen(port);

// The control plane hosts sandboxes on its own machine too.
const localRunner = await startLocalRunner(port);

// The built-in runner's sandboxes are containers; stopping it removes them, including on
// `bun --watch` restarts.
const shutdown = async () => {
  await localRunner?.stop();
  runsService.dispose();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`control-plane listening on ${app.server?.url}`);

export type App = typeof app;
