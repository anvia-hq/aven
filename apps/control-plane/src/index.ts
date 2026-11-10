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
  environmentService,
  browser,
  browserService,
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
import { browserRouter } from "./modules/browser/router";
import { startBrowserProxy } from "./modules/browser/proxy";
import { runnerFor } from "./modules/runtimes/ask-runner";
import { cockpitRouter } from "./modules/cockpit/router";
import { desktopRouter } from "./modules/desktop/router";
import { diffRouter } from "./modules/diff/router";
import { actionsRouter } from "./modules/actions/router";
import { environmentRouter } from "./modules/environment/router";
import { shipRouter } from "./modules/ship/router";
import { filesRouter } from "./modules/files/router";
import { processesRouter } from "./modules/processes/router";
import { useStoredGithubApp } from "./modules/github/app-store";
import { github } from "./modules/github/client";
import { githubRouter } from "./modules/github/router";
import { platformRouter } from "./modules/platform/router";
import { preferencesRouter } from "./modules/preferences/router";
import { avatarsRouter } from "./modules/avatars/router";
import { profileRouter } from "./modules/profile/router";
import { projectsRouter } from "./modules/projects/router";
import { decisionModelRouter } from "./modules/decision-model/router";
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
  .use(browserRouter(browserService))
  .use(cockpitRouter)
  .use(desktopRouter(runtimeHub))
  .use(diffRouter(runtimeHub))
  .use(shipRouter(shipService))
  .use(actionsRouter(actionsService))
  .use(environmentRouter(environmentService))
  .use(filesRouter(runtimeHub))
  .use(processesRouter(runtimeHub))
  .use(githubRouter())
  .use(platformRouter(putAwayThread, runtimeHub))
  .use(preferencesRouter)
  .use(profileRouter)
  .use(avatarsRouter)
  .use(projectsRouter(putAwayThread))
  .use(providersRouter)
  .use(decisionModelRouter)
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

const browserProxy = browser.origin
  ? startBrowserProxy({
      hostname: browser.hostname,
      port: browser.port,
      secret: browser.secret,
      secure: browser.secure,
      open: async (claims, sink) => {
        const connection = await runnerFor(runtimeHub).connection(
          claims.organizationId,
          claims.threadId,
        );
        return connection.openPort(claims.threadId, claims.port, sink);
      },
    })
  : undefined;
if (browserProxy)
  console.log(
    `the Browser is served at ${browser.hostname}:${browserProxy.port} for ${browser.origin}`,
  );

const localRunner = await startLocalRunner(port);

const shutdown = async () => {
  botRunner.dispose();
  browserProxy?.stop();
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
