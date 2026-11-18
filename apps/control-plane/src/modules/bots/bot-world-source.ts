import { cockpitService } from "../cockpit/service";
import { githubService } from "../github/service";
import { preferencesService } from "../preferences/service";
import { projectsService } from "../projects/service";
import type { WorldSource } from "./types";

export const botWorldSource: WorldSource = {
  timezone: (userId) => preferencesService.timezone(userId),
  projects: async (userId) =>
    (await projectsService.listForPerson(userId)).map((project) => ({
      id: project.id,
      repository: project.repoFullName ?? project.directory ?? project.name,
      updatedAt: project.updatedAt,
      github:
        project.githubInstallationId && project.repoFullName && !project.directory
          ? { installationId: project.githubInstallationId, repo: project.repoFullName }
          : undefined,
    })),
  tasks: (userId) => cockpitService.tasks.list(userId),
  inbox: (userId) => cockpitService.inbox.list(userId),
  github: {
    file: (installationId, repo, path, maxChars) =>
      githubService.file(installationId, repo, path, maxChars),
    folder: (installationId, repo, path) => githubService.folder(installationId, repo, path),
    readme: (installationId, repo) => githubService.readme(installationId, repo),
  },
};
