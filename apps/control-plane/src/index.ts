import { Elysia } from "elysia";

import {
  botChats,
  botRunner,
  botRuntimeId,
  runsService,
  runtimeHub,
  goalDriver,
  scheduler,
  threadWatcher,
  actionsService,
  shipService,
  threadMessages,
  putAwayThread,
  threadContinuation,
} from "./composition";
import { errorsRouter } from "./errors";
import { artifactsRouter } from "./modules/artifacts/router";
import { authRouter } from "./modules/auth/router";
import { botComputerRouter } from "./modules/bots/computer-router";
import { botsRouter } from "./modules/bots/router";
import { cockpitRouter } from "./modules/cockpit/router";
import { desktopRouter } from "./modules/desktop/router";
import { diffRouter } from "./modules/diff/router";
import { actionsRouter } from "./modules/actions/router";
import { shipRouter } from "./modules/ship/router";
import { filesRouter } from "./modules/files/router";
import { processesRouter } from "./modules/processes/router";
import { useStoredGithubApp } from "./modules/github/app-store";
import { github } from "./modules/github/client";
import { githubRouter } from "./modules/github/router";
import { platformRouter } from "./modules/platform/router";
import { preferencesRouter } from "./modules/preferences/router";
import { projectsRouter } from "./modules/projects/router";
import { providersRouter } from "./modules/providers/router";
import { runtimesRouter } from "./modules/runtimes/router";
import { startLocalRunner } from "./modules/runtimes/local";
import { schedulesRouter } from "./modules/schedules/router";
import { mcpRouter } from "./modules/mcp/router";
import { memoryRouter } from "./modules/memory/router";
import { skillsRouter } from "./modules/skills/router";
import { terminalRouter } from "./modules/terminal/router";
import { threadsRouter } from "./modules/threads/router";
import { projectVariablesRouter } from "./modules/variables/project-router";
import { variablesRouter } from "./modules/variables/router";
import { workloadIdentityRouter } from "./modules/workload-identity/router";

await useStoredGithubApp(github);

export const app = new Elysia()
  .use(errorsRouter)
  .get("/health", () => ({ status: "ok" }))
  .use(artifactsRouter(runtimeHub))
  .use(authRouter)
  .use(botsRouter(botChats))
  .use(botComputerRouter(runtimeHub, botRuntimeId))
  .use(cockpitRouter)
  .use(desktopRouter(runtimeHub))
  .use(diffRouter(runtimeHub))
  .use(shipRouter(shipService))
  .use(actionsRouter(actionsService))
  .use(filesRouter(runtimeHub))
  .use(processesRouter(runtimeHub))
  .use(githubRouter())
  .use(platformRouter(putAwayThread, runtimeHub))
  .use(preferencesRouter)
  .use(projectsRouter(putAwayThread))
  .use(providersRouter)
  .use(runtimesRouter(runtimeHub))
  .use(schedulesRouter)
  .use(skillsRouter)
  .use(mcpRouter)
  .use(memoryRouter)
  .use(terminalRouter(runtimeHub))
  .use(threadsRouter(runsService, threadMessages, putAwayThread, threadContinuation))
  .use(variablesRouter)
  .use(projectVariablesRouter)
  .use(workloadIdentityRouter);

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
