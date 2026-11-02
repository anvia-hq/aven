import { Elysia } from "elysia";

import {
  botChats,
  botRunner,
  botRuntimeId,
  runsService,
  runtimeHub,
  goalDriver,
  scheduler,
  shipService,
  threadMessages,
} from "./composition";
import { errorsRouter } from "./errors";
import { artifactsRouter } from "./modules/artifacts/router";
import { authRouter } from "./modules/auth/router";
import { botComputerRouter } from "./modules/bots/computer-router";
import { botsRouter } from "./modules/bots/router";
import { desktopRouter } from "./modules/desktop/router";
import { diffRouter } from "./modules/diff/router";
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
import { skillsRouter } from "./modules/skills/router";
import { terminalRouter } from "./modules/terminal/router";
import { threadsRouter } from "./modules/threads/router";
import { projectVariablesRouter } from "./modules/variables/project-router";
import { variablesRouter } from "./modules/variables/router";
import { workloadIdentityRouter } from "./modules/workload-identity/router";

// The GitHub App a platform owner created from the platform, unless the environment names one.
await useStoredGithubApp(github);

const app = new Elysia()
  .use(errorsRouter)
  .get("/health", () => ({ status: "ok" }))
  .use(artifactsRouter(runtimeHub))
  .use(authRouter)
  .use(botsRouter(botChats))
  .use(botComputerRouter(runtimeHub, botRuntimeId))
  .use(desktopRouter(runtimeHub))
  .use(diffRouter(runtimeHub))
  .use(shipRouter(shipService))
  .use(filesRouter(runtimeHub))
  .use(processesRouter(runtimeHub))
  .use(githubRouter())
  .use(platformRouter)
  .use(preferencesRouter)
  .use(projectsRouter)
  .use(providersRouter)
  .use(runtimesRouter(runtimeHub))
  .use(schedulesRouter)
  .use(skillsRouter)
  .use(mcpRouter)
  .use(terminalRouter(runtimeHub))
  .use(threadsRouter(runsService, threadMessages))
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
  // The bots stop first: replies that end because their runner stopped are then a shutdown, which
  // leaves a goal as it is for the next start, and not a failed round that blocks it.
  botRunner.dispose();
  await localRunner?.stop();
  await scheduler.close();
  await goalDriver.close();
  runsService.dispose();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

scheduler.start();
goalDriver.start();

console.log(`control-plane listening on ${app.server?.url}`);

export type App = typeof app;
