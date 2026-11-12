import { Elysia } from "elysia";

import {
  botChats,
  botRuntimeId,
  runsService,
  runtimeHub,
  actionsService,
  shipService,
  threadMessages,
  followUps,
  putAwayThread,
  threadContinuation,
} from "./composition";
import { errorsRouter } from "./errors";
import { followUpsRouter } from "./modules/follow-ups/router";
import { foreignOrigin } from "./origin-guard";
import { trustedOrigins } from "./modules/auth/service";
import { artifactsRouter } from "./modules/artifacts/router";
import { authRouter } from "./modules/auth/router";
import { botComputerRouter } from "./modules/bots/computer-router";
import { botsRouter } from "./modules/bots/router";
import { claudeSetupRouter } from "./modules/claude-setup/router";
import { cockpitRouter } from "./modules/cockpit/router";
import { computerRouter } from "./modules/computer/router";
import { diffRouter } from "./modules/diff/router";
import { actionsRouter } from "./modules/actions/router";
import { shipRouter } from "./modules/ship/router";
import { filesRouter } from "./modules/files/router";
import { processesRouter } from "./modules/processes/router";
import { useStoredGithubApp } from "./modules/github/app-store";
import { github } from "./modules/github/client";
import { githubRouter } from "./modules/github/router";
import { platformRouter } from "./modules/platform/router";
import { foldersRouter } from "./modules/folders/router";
import { preferencesRouter } from "./modules/preferences/router";
import { avatarsRouter } from "./modules/avatars/router";
import { profileRouter } from "./modules/profile/router";
import { projectsRouter } from "./modules/projects/router";
import { decisionModelRouter } from "./modules/decision-model/router";
import { providersRouter } from "./modules/providers/router";
import { runnerFolders } from "./modules/runtimes/folders";
import { runtimesRouter } from "./modules/runtimes/router";
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
  .onRequest(({ request }) => foreignOrigin(request, trustedOrigins))
  .use(errorsRouter)
  .get("/health", () => ({ status: "ok" }))
  .use(artifactsRouter(runtimeHub))
  .use(authRouter)
  .use(botsRouter(botChats))
  .use(botComputerRouter(runtimeHub, botRuntimeId))
  .use(claudeSetupRouter)
  .use(cockpitRouter)
  .use(computerRouter(runtimeHub))
  .use(diffRouter(runtimeHub))
  .use(shipRouter(shipService))
  .use(actionsRouter(actionsService))
  .use(filesRouter(runtimeHub))
  .use(processesRouter(runtimeHub))
  .use(githubRouter())
  .use(platformRouter(putAwayThread))
  .use(foldersRouter)
  .use(preferencesRouter)
  .use(profileRouter)
  .use(avatarsRouter)
  .use(projectsRouter(putAwayThread, runnerFolders(runtimeHub)))
  .use(providersRouter)
  .use(decisionModelRouter)
  .use(runtimesRouter(runtimeHub))
  .use(schedulesRouter)
  .use(skillsRouter)
  .use(mcpRouter)
  .use(memoryRouter)
  .use(terminalRouter(runtimeHub))
  .use(followUpsRouter(followUps))
  .use(threadsRouter(runsService, threadMessages, putAwayThread, threadContinuation))
  .use(variablesRouter)
  .use(projectVariablesRouter)
  .use(workloadIdentityRouter);
