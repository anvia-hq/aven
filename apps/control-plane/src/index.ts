import { Elysia } from "elysia";

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
  .get("/health", () => ({ status: "ok" }))
  .use(authRouter)
  .use(platformRouter)
  .use(projectsRouter)
  .use(providersRouter)
  .use(runtimesRouter)
  .use(threadsRouter)
  .use(usersRouter);

const port = process.env.PORT ?? 8000;
app.listen(port);

// The control plane hosts sandboxes on its own machine too.
const localRunner = await startLocalRunner(port);

// Agent jobs run as their own process groups, so they must be stopped when the server goes down
// (including `bun --watch` restarts), or dev servers started by an agent would be orphaned.
const shutdown = async () => {
  await localRunner?.stop();
  await runsService.dispose();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", () => runsService.killAllJobsNow());

console.log(`control-plane listening on ${app.server?.url}`);

export type App = typeof app;
