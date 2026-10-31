import { Elysia } from "elysia";

import { runsService, runtimeHub, threadMessages } from "./composition";
import { errorsRouter } from "./errors";
import { artifactsRouter } from "./modules/artifacts/router";
import { authRouter } from "./modules/auth/router";
import { desktopRouter } from "./modules/desktop/router";
import { diffRouter } from "./modules/diff/router";
import { shipRouter } from "./modules/ship/router";
import { createShipService } from "./modules/ship/service";
import { filesRouter } from "./modules/files/router";
import { githubRouter } from "./modules/github/router";
import { platformRouter } from "./modules/platform/router";
import { projectsRouter } from "./modules/projects/router";
import { providersRouter } from "./modules/providers/router";
import { runtimesRouter } from "./modules/runtimes/router";
import { startLocalRunner } from "./modules/runtimes/local";
import { skillsRouter } from "./modules/skills/router";
import { terminalRouter } from "./modules/terminal/router";
import { threadsRouter } from "./modules/threads/router";
import { usersRouter } from "./modules/users/router";
import { projectVariablesRouter } from "./modules/variables/project-router";
import { variablesRouter } from "./modules/variables/router";
import { workloadIdentityRouter } from "./modules/workload-identity/router";

const app = new Elysia()
  .use(errorsRouter)
  .get("/health", () => ({ status: "ok" }))
  .use(artifactsRouter(runtimeHub))
  .use(authRouter)
  .use(desktopRouter(runtimeHub))
  .use(diffRouter(runtimeHub))
  .use(shipRouter(createShipService(runtimeHub, { send: threadMessages.send })))
  .use(filesRouter(runtimeHub))
  .use(githubRouter())
  .use(platformRouter)
  .use(projectsRouter)
  .use(providersRouter)
  .use(runtimesRouter(runtimeHub))
  .use(skillsRouter)
  .use(terminalRouter(runtimeHub))
  .use(threadsRouter(runsService, threadMessages))
  .use(usersRouter)
  .use(variablesRouter)
  .use(projectVariablesRouter)
  .use(workloadIdentityRouter);

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
